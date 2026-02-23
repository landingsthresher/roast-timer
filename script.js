// Roast Timer — Dual Output (Ideal Plan + Start-Now Plan)
// - Mentions the time to reduce to 180°F only within the "hold" bullet.
// - Defaults Starting State to Frozen on load.
// - Handles day boundaries and "too early to start now" gating.
// NOTE: No standalone or all-caps "DROP" text anywhere.

document.addEventListener("DOMContentLoaded", () => {
  const stateEl = document.getElementById("state");
  if (stateEl) stateEl.value = "frozen"; // default to Frozen
});

document.getElementById("calcBtn").addEventListener("click", () => {
  const weight = parseFloat(document.getElementById("weight").value);
  const stateInput = (document.getElementById("state").value || "frozen").toLowerCase();
  const targetTimeStr = document.getElementById("targetTime").value; // "HH:MM" from <input type="time">

  if (!weight || !targetTimeStr) {
    showResult("Please enter weight and target time.");
    return;
  }

  // -------------------- Model parameters (tunable) --------------------
  const REF_TEMP_F = 325;
  const BASELINE_MIN_PER_LB = 70; // baseline @325°F, thawed
  const ALPHA = 1.3;              // non-linear slowdown at low temps
  const HOLD_TEMP_F = 180;        // finishing/serving hold
  const HOLD_MIN = 60;            // 60-minute hold

  // Ideal Plan main temp (your proven low & slow)
  const IDEAL_MAIN_TEMP_F = 240;

  // Bounds for solver (Start-Now)
  const MIN_OVEN_F = 200; // slowest allowed
  const MAX_OVEN_F = 500; // fastest allowed

  // "Too-early" buffer: if target is later than the slowest cook by ≥ this, skip Start-Now
  const TOO_EARLY_BUFFER_MIN = 30;

  // State multipliers (planning heuristics; verify with a thermometer)
  const STATE_MULT = { thawed: 1.00, partial: 1.25, frozen: 1.50 };

  // Collagen/low-temp time bonus at ≤ 250°F
  const lowTempBonus = (tF) => (tF <= 250 ? 1.15 : 1.0);

  // -------------------- Timing helpers --------------------
  function minutesPhase1AtTemp(tF, wt, st) {
    const stateMult = STATE_MULT[st] ?? 1.0;
    return (
      wt *
      BASELINE_MIN_PER_LB *
      Math.pow(REF_TEMP_F / tF, ALPHA) *
      lowTempBonus(tF) *
      stateMult
    );
  }
  function totalMinutesAtTemp(tF, wt, st) {
    return minutesPhase1AtTemp(tF, wt, st) + HOLD_MIN;
  }

  // Next occurrence of HH:MM (today if still ahead; otherwise tomorrow)
  function nextOccurrenceOf(timeStr) {
    const [hh, mm] = timeStr.split(":").map(Number);
    const now = new Date();
    const t = new Date(now);
    t.setHours(hh, mm, 0, 0);
    if (t <= now) t.setDate(t.getDate() + 1);
    return t;
  }

  // Binary search for the lowest oven temp that completes within the available window
  function solveOvenTempForWindow(availableMin, wt, st) {
    let lo = MIN_OVEN_F, hi = MAX_OVEN_F, best = null;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const tot = totalMinutesAtTemp(mid, wt, st);
      if (tot <= availableMin) {
        best = mid; // feasible; try gentler (lower) temp
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return best;
  }

  // -------------------- Date/time formatting --------------------
  const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
  }
  function dateLabel(date) {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (sameDay(date, now)) return "Today";
    if (sameDay(date, tomorrow)) return "Tomorrow";
    return `${WEEKDAYS[date.getDay()]} ${date.getMonth()+1}/${date.getDate()}`;
  }
  function formatTime12h(date) {
    let h = date.getHours();
    const m = date.getMinutes().toString().padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return `${h}:${m} ${ampm}`;
  }
  function formatDT(date) {
    return `${dateLabel(date)} ${formatTime12h(date)}`;
  }
  function formatDuration(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return `${m} minutes`;
    if (m === 0) return `${h} hour${h !== 1 ? "s" : ""}`;
    return `${h} hour${h !== 1 ? "s" : ""} ${m} min`;
  }
  function formatDelta(ms) {
    const mins = Math.round(ms / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h && m) return `${h}h ${m}m`;
    if (h) return `${h}h`;
    return `${m}m`;
  }

  // -------------------- Compute both plans --------------------
  const now = new Date();
  const target = nextOccurrenceOf(targetTimeStr);
  const availableMin = Math.max(0, Math.round((target - now) / 60000));

  const state = stateInput; // already defaulted to 'frozen' if empty

  // --- Ideal Plan (fixed temp + hold) ---
  const idealPhase1Min = Math.round(minutesPhase1AtTemp(IDEAL_MAIN_TEMP_F, weight, state));
  const idealTotalMin = idealPhase1Min + HOLD_MIN;
  const idealStart = new Date(target.getTime() - idealTotalMin * 60000);
  const idealDropAt = new Date(target.getTime() - HOLD_MIN * 60000); // time you reduce to 180°F
  const idealLateNote = idealStart < now
    ? ` (this start time is <strong>${formatDelta(now - idealStart)}</strong> late for today)`
    : "";

  const idealHtml = `
    <p><strong>Ideal Plan</strong> (main phase <strong>${IDEAL_MAIN_TEMP_F}°F</strong> + ${HOLD_MIN}‑min hold)</p>
    <ul>
      <li>Ideal start: <strong>${formatDT(idealStart)}</strong>${idealLateNote}</li>
      <li>Main phase: <strong>${formatDuration(idealPhase1Min)}</strong> at <strong>${IDEAL_MAIN_TEMP_F}°F</strong></li>
      <li>Then reduce to <strong>${HOLD_TEMP_F}°F</strong> at <strong>${formatDT(idealDropAt)}</strong> and hold for <strong>${HOLD_MIN} min</strong></li>
      <li>Ready at <strong>${formatDT(target)}</strong></li>
    </ul>
  `;

  // --- Start-Now gating ---
  const slowestTotalMin = Math.round(totalMinutesAtTemp(MIN_OVEN_F, weight, state)); // at 200°F
  const fastestTotalMin = Math.round(totalMinutesAtTemp(MAX_OVEN_F, weight, state)); // at 500°F

  let startNowHtml = "";

  if (availableMin < fastestTotalMin) {
    // Not enough time, even at 500°F
    const soonestFinish = new Date(now.getTime() + fastestTotalMin * 60000);
    const dropAtSoonest = new Date(soonestFinish.getTime() - HOLD_MIN * 60000);
    startNowHtml = `
      <p><strong>Start‑Now Plan:</strong> Not achievable by your target, even at <strong>${MAX_OVEN_F}°F</strong>.</p>
      <ul>
        <li>Then reduce to <strong>${HOLD_TEMP_F}°F</strong> at <strong>${formatDT(dropAtSoonest)}</strong> and hold for <strong>${HOLD_MIN} min</strong></li>
        <li>Soonest ready (incl. ${HOLD_MIN}-min hold): <strong>${formatDT(soonestFinish)}</strong> (${formatDuration(fastestTotalMin)} from now)</li>
      </ul>
      <p>Options: start earlier, shorten the hold, or choose a later target time.</p>
    `;
  } else if (availableMin > slowestTotalMin + TOO_EARLY_BUFFER_MIN) {
    // Too far away — don't suggest a start-now cook; just point to the Ideal Plan.
    startNowHtml = `
      <p><strong>Start‑Now Plan:</strong> It’s too early to start. Please follow the <strong>Ideal Plan</strong> (start at <strong>${formatDT(idealStart)}</strong>).</p>
    `;
  } else {
    // Start-now makes sense: solve for temp in [200..500] that meets the window
    const bestTemp = Math.round(solveOvenTempForWindow(availableMin, weight, state));
    const totalMin = Math.round(totalMinutesAtTemp(bestTemp, weight, state));
    const phase1Min = totalMin - HOLD_MIN;
    const dropAt = new Date(target.getTime() - HOLD_MIN * 60000);

    startNowHtml = `
      <p><strong>Start‑Now Plan</strong> (begin immediately)</p>
      <ul>
        <li>Main oven temp: <strong>${bestTemp}°F</strong></li>
        <li>Main phase: <strong>${formatDuration(phase1Min)}</strong> (from now)</li>
        <li>Then reduce to <strong>${HOLD_TEMP_F}°F</strong> at <strong>${formatDT(dropAt)}</strong> and hold for <strong>${HOLD_MIN} min</strong></li>
        <li>Ready at <strong>${formatDT(target)}</strong></li>
      </ul>
    `;
  }

  const safety = `
    <p><em>Reminder:</em> Verify doneness with a thermometer.
    Whole beef/pork roasts: ~145°F + brief rest; poultry: ~165°F.
    Carryover is smaller with gentle roasting.</p>
  `;

  showResult(idealHtml + startNowHtml + safety);
});

// -------------------- DOM helper --------------------
function showResult(html) {
  const result = document.getElementById("result");
  result.innerHTML = html;
  result.style.display = "block";
}
