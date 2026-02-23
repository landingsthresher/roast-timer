// Roast Timer – dual-output version
// 1) Ideal Plan: use a preferred low-temp (default 240°F) + 60 min @ 180°F; report ideal start time
// 2) Start-Now Plan: solve for a main-phase oven temp that hits the target if you begin right now

document.getElementById("calcBtn").addEventListener("click", () => {
  const weight = parseFloat(document.getElementById("weight").value);
  const state  = document.getElementById("state").value;
  const targetTimeStr = document.getElementById("targetTime").value; // "HH:MM" (local)

  if (!weight || !targetTimeStr) {
    showResult("Please enter weight and target time.");
    return;
  }

  // -------------------- Model parameters (tunable) --------------------
  const REF_TEMP_F = 325;
  const BASELINE_MIN_PER_LB = 70; // baseline at 325°F, thawed
  const ALPHA = 1.3;              // time ∝ (REF/ovenTemp)^ALPHA (captures non-linear slowdowns at low temp)
  const HOLD_TEMP_F = 180;        // end-of-cook gentle hold
  const HOLD_MIN = 60;            // 60-minute hold

  // Your preferred main temp for "Ideal Plan":
  // This mirrors your real-world success at low temp with a finishing hold.
  const IDEAL_MAIN_TEMP_F = 240;

  // Bounds for the "start now" solver
  const MIN_OVEN_F = 200;
  const MAX_OVEN_F = 500;

  // Frozen/partial multipliers (rule-of-thumb for planning; always verify with a thermometer)
  const STATE_MULT = { thawed: 1.00, partial: 1.25, frozen: 1.50 };

  // Collagen/low-temp bonus: add modest time at ≤ 250°F
  const lowTempBonus = (tF) => (tF <= 250 ? 1.15 : 1.0);

  // -------------------- Timing functions --------------------
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

  // Resolve target time: if the chosen time today has already passed, assume *tomorrow* at that time.
  function resolveTargetDate(timeStr) {
    const [hh, mm] = timeStr.split(":").map(Number);
    const now = new Date();
    const t = new Date();
    t.setHours(hh, mm, 0, 0);
    if (t <= now) {
      // assume tomorrow (planning for the next occurrence of that time)
      t.setDate(t.getDate() + 1);
    }
    return t;
  }

  // Binary search for the lowest oven temp that allows total time ≤ available
  function solveOvenTempForWindow(availableMin, wt, st) {
    let lo = MIN_OVEN_F, hi = MAX_OVEN_F, best = null;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const tot = totalMinutesAtTemp(mid, wt, st);
      if (tot <= availableMin) {
        best = mid; // feasible; try to go lower (gentler)
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return best;
  }

  // -------------------- Compute both plans --------------------
  const now = new Date();
  const target = resolveTargetDate(targetTimeStr);

  // --- 1) Ideal Plan (preferred main temp + hold), regardless of "now" ---
  const idealPhase1Min = Math.round(minutesPhase1AtTemp(IDEAL_MAIN_TEMP_F, weight, state));
  const idealTotalMin = idealPhase1Min + HOLD_MIN;
  const idealStart = new Date(target.getTime() - idealTotalMin * 60000);

  // --- 2) Start-Now Plan (solve for oven temp so starting now still meets the target) ---
  const availableMin = Math.max(0, Math.round((target - now) / 60000));
  let startNowHtml = "";

  if (availableMin <= HOLD_MIN + 5) {
    // Not enough time remaining to include the 60-min hold
    startNowHtml += `
      <p><strong>Start‑Now Plan:</strong> Not enough time left to include the 60‑minute hold.</p>
      <p>You need at least <strong>${HOLD_MIN + 5} minutes</strong> from now. Consider a later target time.</p>
    `;
  } else {
    const needPhase1 = availableMin - HOLD_MIN;
    const minTimeAtMax = Math.round(minutesPhase1AtTemp(MAX_OVEN_F, weight, state));

    if (minTimeAtMax > needPhase1) {
      // Impossible even at 500°F — tell user the soonest feasible finish
      const soonestFinishMin = minTimeAtMax + HOLD_MIN;
      const soonestFinish = new Date(now.getTime() + soonestFinishMin * 60000);
      startNowHtml += `
        <p><strong>Start‑Now Plan:</strong> Even at <strong>${MAX_OVEN_F}°F</strong>, the target is not achievable.</p>
        <p>Soonest finish (including ${HOLD_MIN}-min hold): <strong>${format12Hour(soonestFinish)}</strong> (${formatDuration(soonestFinishMin)} from now).</p>
        <p>Options: start earlier, shorten the hold, or pick a later target time.</p>
      `;
    } else {
      // Solve for the gentlest temp that still fits
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

  // -------------------- Build Ideal Plan HTML --------------------
  const idealStatus =
    idealStart < now
      ? ` (this start time is <strong>${formatDelta(now - idealStart)} late</strong> for today)`
      : "";

  const idealHtml = `
    <p><strong>Ideal Plan</strong> (preferred main phase <strong>${IDEAL_MAIN_TEMP_F}°F</strong> + ${HOLD_MIN}‑min hold)</p>
    <ul>
      <li>Ideal start: <strong>${format12Hour(idealStart)}</strong>${idealStatus}</li>
      <li>Main phase: <strong>${formatDuration(idealPhase1Min)}</strong> at <strong>${IDEAL_MAIN_TEMP_F}°F</strong></li>
      <li>Then reduce to <strong>${HOLD_TEMP_F}°F</strong> for <strong>${HOLD_MIN} min</strong></li>
      <li>Ready at <strong>${format12Hour(target)}</strong></li>
    </ul>
  `;

  // -------------------- Safety reminder --------------------
  const safety = `
    <p><em>Reminder:</em> Always verify doneness with a thermometer.
    Whole beef/pork roasts are typically served at ~145°F + short rest; poultry at ~165°F.
    Carryover rise is smaller with gentle roasting, so confirm temps before the hold ends.</p>
  `;

  showResult(idealHtml + startNowHtml + safety);
});

// -------------------- Utilities --------------------
function format12Hour(date) {
  let h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

function formatDuration(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} minutes`;
  if (m === 0) return `${h} hour${h !== 1 ? "s" : ""}`;
  return `${h} hour${h !== 1 ? "s" : ""} ${m} min`;
}

// e.g., "2h 15m" for a positive millisecond difference
function formatDelta(ms) {
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function showResult(html) {
  const result = document.getElementById("result");
  result.innerHTML = html;
  result.style.display = "block";
}
