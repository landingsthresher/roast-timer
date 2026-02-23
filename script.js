// Roast Timer – dual-output with day-aware times
// 1) Ideal Plan: preferred low-temp (default 240°F) + 60 min @ 180°F; ideal start time
// 2) Start-Now Plan: solve for oven temp to meet target if beginning immediately

document.getElementById("calcBtn").addEventListener("click", () => {
  const weight = parseFloat(document.getElementById("weight").value);
  const state  = document.getElementById("state").value;
  const targetTimeStr = document.getElementById("targetTime").value; // "HH:MM"

  if (!weight || !targetTimeStr) {
    showResult("Please enter weight and target time.");
    return;
  }

  // -------------------- Model parameters --------------------
  const REF_TEMP_F = 325;
  const BASELINE_MIN_PER_LB = 70; // baseline at 325°F, thawed
  const ALPHA = 1.3;              // non-linear slowdown at low temp
  const HOLD_TEMP_F = 180;        // end-of-cook gentle hold
  const HOLD_MIN = 60;            // 60-minute hold

  const IDEAL_MAIN_TEMP_F = 240;  // preferred low-and-slow temp for Ideal Plan
  const MIN_OVEN_F = 200;
  const MAX_OVEN_F = 500;

  const STATE_MULT = { thawed: 1.00, partial: 1.25, frozen: 1.50 };
  const lowTempBonus = (tF) => (tF <= 250 ? 1.15 : 1.0);

  // -------------------- Helpers --------------------
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

  // Return a Date for the *next occurrence* of HH:MM (today if in the future; otherwise tomorrow)
  function nextOccurrenceOf(timeStr) {
    const [hh, mm] = timeStr.split(":").map(Number);
    const now = new Date();
    const t = new Date(now);
    t.setHours(hh, mm, 0, 0);
    if (t <= now) t.setDate(t.getDate() + 1);
    return t;
  }

  // Find lowest oven temp (200..500°F) that completes within availableMin
  function solveOvenTempForWindow(availableMin, wt, st) {
    let lo = MIN_OVEN_F, hi = MAX_OVEN_F, best = null;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const tot = totalMinutesAtTemp(mid, wt, st);
      if (tot <= availableMin) {
        best = mid;  // feasible; try lower temp (more gentle)
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return best;
  }

  // ----- Date-aware formatting -----
  const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
  }
  function labelFor(date) {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);

    if (sameDay(date, now)) return "";              // today: no label
    if (sameDay(date, tomorrow)) return "Tomorrow"; // tomorrow label
    return WEEKDAYS[date.getDay()];                 // weekday label
  }
  function format12Hour(date, includeDay = true) {
    let h = date.getHours();
    const m = date.getMinutes().toString().padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    const dayLbl = includeDay ? labelFor(date) : "";
    return dayLbl ? `${dayLbl} ${h}:${m} ${ampm}` : `${h}:${m} ${ampm}`;
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

  // 1) IDEAL PLAN (fixed temp + hold; find ideal start)
  const idealPhase1Min = Math.round(minutesPhase1AtTemp(IDEAL_MAIN_TEMP_F, weight, state));
  const idealTotalMin = idealPhase1Min + HOLD_MIN;
  const idealStart = new Date(target.getTime() - idealTotalMin * 60000);

  const idealStatus =
    idealStart < now
      ? ` (this start time is <strong>${formatDelta(now - idealStart)}</strong> late for today)`
      : "";

  const idealHtml = `
    <p><strong>Ideal Plan</strong> (main phase <strong>${IDEAL_MAIN_TEMP_F}°F</strong> + ${HOLD_MIN}‑min hold)</p>
    <ul>
      <li>Ideal start: <strong>${format12Hour(idealStart)}</strong>${idealStatus}</li>
      <li>Main phase: <strong>${formatDuration(idealPhase1Min)}</strong> at <strong>${IDEAL_MAIN_TEMP_F}°F</strong></li>
      <li>Then reduce to <strong>${HOLD_TEMP_F}°F</strong> for <strong>${HOLD_MIN} min</strong></li>
      <li>Ready at <strong>${format12Hour(target)}</strong></li>
    </ul>
  `;

  // 2) START-NOW PLAN (solve for temp given the time window from now)
  const availableMin = Math.max(0, Math.round((target - now) / 60000));
  let startNowHtml = "";

  if (availableMin <= HOLD_MIN + 5) {
    startNowHtml += `
      <p><strong>Start‑Now Plan:</strong> Not enough time left to include the 60‑minute hold.</p>
      <p>You need at least <strong>${HOLD_MIN + 5} minutes</strong> from now. Consider a later target time.</p>
    `;
  } else {
    const needPhase1 = availableMin - HOLD_MIN;
    const minTimeAtMax = Math.round(minutesPhase1AtTemp(MAX_OVEN_F, weight, state));

    if (minTimeAtMax > needPhase1) {
      const soonestFinishMin = minTimeAtMax + HOLD_MIN;
      const soonestFinish = new Date(now.getTime() + soonestFinishMin * 60000);
      const dropAtSoonest = new Date(soonestFinish.getTime() - HOLD_MIN * 60000);

      startNowHtml += `
        <p><strong>Start‑Now Plan:</strong> Even at <strong>${MAX_OVEN_F}°F</strong>, the target is not achievable.</p>
        <ul>
          <li>Soonest drop to <strong>${HOLD_TEMP_F}°F</strong>: <strong>${format12Hour(dropAtSoonest)}</strong></li>
          <li>Soonest ready (incl. ${HOLD_MIN}‑min hold): <strong>${format12Hour(soonestFinish)}</strong> (${formatDuration(soonestFinishMin)} from now)</li>
        </ul>
        <p>Options: start earlier, shorten the hold, or choose a later target time.</p>
      `;
    } else {
      const bestTemp = Math.round(solveOvenTempForWindow(availableMin, weight, state));
      const startNowTotalMin = Math.round(totalMinutesAtTemp(bestTemp, weight, state));
      const startNowPhase1Min = startNowTotalMin - HOLD_MIN;
      const dropToHoldAt = new Date(target.getTime() - HOLD_MIN * 60000);

      startNowHtml += `
        <p><strong>Start‑Now Plan</strong> (begin immediately)</p>
        <ul>
          <li>Main oven temp: <strong>${bestTemp}°F</strong></li>
          <li>Main phase: <strong>${formatDuration(startNowPhase1Min)}</strong> (from now)</li>
          <li>At <strong>${format12Hour(dropToHoldAt)}</strong>, reduce to <strong>${HOLD_TEMP_F}°F</strong> for <strong>${HOLD_MIN} min</strong></li>
          <li>Ready at <strong>${format12Hour(target)}</strong></li>
        </ul>
      `;
    }
  }

  const safety = `
    <p><em>Reminder:</em> Verify doneness with a thermometer.
    Whole beef/pork roasts: ~145°F + brief rest; poultry: ~165°F.
    Carryover is smaller with gentle roasting.</p>
  `;

  showResult(idealHtml + startNowHtml + safety);
});

// -------------------- DOM helpers --------------------
function showResult(html) {
  const result = document.getElementById("result");
  result.innerHTML = html;
  result.style.display = "block";
}
