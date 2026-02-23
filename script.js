// script.js
document.getElementById("calcBtn").addEventListener("click", () => {
  const weight = parseFloat(document.getElementById("weight").value);
  const state  = document.getElementById("state").value;
  const targetTime = document.getElementById("targetTime").value; // "HH:MM" (local)

  if (!weight || !targetTime) {
    showResult("Please fill out weight and target time.");
    return;
  }

  // --- Model parameters (tunable) ---
  const REF_TEMP_F = 325;
  const BASELINE_MIN_PER_LB = 70;   // baseline @ 325°F, thawed
  const ALPHA = 1.3;                // super-linear time growth as oven temp drops
  const HOLD_TEMP_F = 180;          // end-of-cook gentle hold
  const HOLD_MIN = 60;              // 60-minute hold
  const LO_TEMP_BOUND = 200;        // search lower bound
  const HI_TEMP_BOUND = 500;        // search upper bound

  const STATE_MULT = { thawed: 1.00, partial: 1.25, frozen: 1.50 };

  // Collagen/low-temp time bonus at ≤ 250°F
  const lowTempBonus = (tF) => (tF <= 250 ? 1.15 : 1.0);

  function minutesPhase1AtTemp(tF, wt, st) {
    const stateMult = STATE_MULT[st] ?? 1.0;
    // phase-1 (main cook) only
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

  // Parse target into today's date at given time
  const now = new Date();
  const [tH, tM] = targetTime.split(":").map(Number);
  const target = new Date();
  target.setHours(tH, tM, 0, 0);

  if (target <= now) {
    showResult("Target time must be in the future.");
    return;
  }

  const availableMin = Math.round((target - now) / 60000);
  if (availableMin <= HOLD_MIN + 5) {
    showResult(
      `Not enough time: you need at least ${HOLD_MIN + 5} minutes from now to include the 60‑minute hold.`
    );
    return;
  }

  // Find the lowest oven temp (200..500°F) that fits available time
  const needPhase1 = availableMin - HOLD_MIN;

  // If even at 500°F it's still too long, tell the user
  const minTimeAtMaxHeat = minutesPhase1AtTemp(HI_TEMP_BOUND, weight, state);
  if (minTimeAtMaxHeat > needPhase1) {
    const soonestFinishMin = Math.round(minTimeAtMaxHeat + HOLD_MIN);
    const soonestDate = new Date(now.getTime() + soonestFinishMin * 60000);
    showResult(`
      <p><strong>Even at 500°F you won't make the target.</strong></p>
      <p>Soonest finish (with 60‑min hold): <strong>${format12Hour(soonestDate)}</strong> (${formatDuration(soonestFinishMin)} from now).</p>
      <p>Options: start earlier, shorten the hold, or choose a later target time.</p>
    `);
    return;
  }

  // Binary search for temp where total time <= availableMin
  let lo = LO_TEMP_BOUND, hi = HI_TEMP_BOUND, best = HI_TEMP_BOUND;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const tot = totalMinutesAtTemp(mid, weight, state);
    if (tot <= availableMin) {
      best = mid;      // mid works; try lower temp (gentler cook)
      hi = mid;
    } else {
      lo = mid;
    }
  }

  const recTemp = Math.round(best);
  const totalMin = Math.round(totalMinutesAtTemp(recTemp, weight, state));
  const phase1Min = totalMin - HOLD_MIN;

  const dropToHoldAt = new Date(target.getTime() - HOLD_MIN * 60000);

  // Friendly plan
  let plan = `<p><strong>Recommended oven temperature:</strong> <span style="font-size:1.1em">${recTemp}°F</span></p>`;
  plan += `<p><strong>Total time:</strong> ${formatDuration(totalMin)} (main phase ${formatDuration(phase1Min)} + ${HOLD_MIN}‑min hold)</p>`;
  plan += `<p><strong>Schedule:</strong></p><ul>`;
  plan += `<li>Start <strong>now</strong> at <strong>${recTemp}°F</strong>.</li>`;
  plan += `<li>Cook for <strong>${formatDuration(phase1Min)}</strong>.</li>`;
  plan += `<li>At <strong>${format12Hour(dropToHoldAt)}</strong>, reduce to <strong>${HOLD_TEMP_F}°F</strong> and hold for <strong>${HOLD_MIN} min</strong>.</li>`;
  plan += `<li>Ready at <strong>${format12Hour(target)}</strong>.</li>`;
  plan += `</ul>`;

  // Safety + probe reminder (carryover is smaller with low-temp)
  const safety = `
    <p><em>Tip:</em> Use a thermometer to confirm safe/internal doneness
    (e.g., whole beef/pork roasts <strong>145°F + 3‑min rest</strong>; poultry <strong>165°F</strong>).
    Carryover rise is smaller with gentle roasting, so verify temps before the hold ends.</p>
  `;

  showResult(plan + safety);
});

// ---- Utilities ----
function format12Hour(date) {
  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}
function formatDuration(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} minutes`;
  if (m === 0) return `${h} hour${h !== 1 ? "s" : ""}`;
  return `${h} hour${h !== 1 ? "s" : ""} ${m} min`;
}
function showResult(html) {
  const result = document.getElementById("result");
  result.innerHTML = html;
  result.style.display = "block";
}
``
