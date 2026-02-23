document.getElementById("calcBtn").addEventListener("click", () => {
    const weight = parseFloat(document.getElementById("weight").value); // in lb
    const state = document.getElementById("state").value;               // "thawed" | "partial" | "frozen"
    const ovenTemp = parseFloat(document.getElementById("ovenTemp").value); // main phase temp (°F)
    const targetTime = document.getElementById("targetTime").value;     // "HH:MM" 24-hour or 12-hour? (assumes "HH:MM" local)

    if (!weight || !ovenTemp || !targetTime) {
        showResult("Please fill out all fields.");
        return;
    }

    // ---------- Tunable model parameters ----------
    const REF_TEMP_F = 325;
    const BASELINE_MIN_PER_LB = 70; // your original baseline @ 325°F, thawed
    const ALPHA = 1.3;              // temp–time exponent (low-temp takes disproportionately longer)

    // Two-stage plan mirroring your success:
    const HOLD_TEMP_F = 180;
    const HOLD_MIN = 60;            // 1 hour end-of-cook gentle hold

    // State multipliers (per USDA/extension guidance: frozen ≈ +50%, partial ≈ +20–25%)
    // (Used as a starting point for timing; always verify with a thermometer.)
    const STATE_MULT = {
        thawed: 1.0,
        partial: 1.25,
        frozen: 1.50
    };

    // Collagen/low-temp bonus: add time if cooking ≤ 250°F
    const lowTempBonus = ovenTemp <= 250 ? 1.15 : 1.0;

    // --- Phase 1 time (main cook at ovenTemp) ---
    // time_per_lb_325 = 70 min/lb (baseline)
    // temp adjustment: (REF/ovenTemp)^ALPHA (super-linear as oven drops)
    // add low-temp collagen factor and frozen/partial multiplier
    const stateMult = STATE_MULT[state] ?? 1.0;
    const minutesPhase1 =
        weight *
        BASELINE_MIN_PER_LB *
        Math.pow(REF_TEMP_F / ovenTemp, ALPHA) *
        lowTempBonus *
        stateMult;

    // --- Total time adds the 180°F hold (1 hour) ---
    const totalMinutes = Math.round(minutesPhase1 + HOLD_MIN);

    // --- Compute required start time ---
    const [targetHour, targetMin] = targetTime.split(":").map(Number);
    const targetDate = new Date();
    targetDate.setHours(targetHour, targetMin, 0, 0);

    const startDate = new Date(targetDate.getTime() - totalMinutes * 60000);
    const startTimeStr = format12Hour(startDate);

    // --- Lateness / catch-up suggestion (solve under power-law model) ---
    const now = new Date();
    let status = "";
    let scheduleHtml = "";

    // Human-friendly breakdown
    scheduleHtml += `<p><strong>Plan:</strong></p>`;
    scheduleHtml += `<ul>`;
    scheduleHtml += `<li>Heat oven to <strong>${Math.round(ovenTemp)}°F</strong> and start main cook at <strong>${format12Hour(startDate)}</strong>.</li>`;
    scheduleHtml += `<li>About <strong>${formatDuration(Math.round(minutesPhase1))}</strong> at ${Math.round(ovenTemp)}°F, then reduce to <strong>${HOLD_TEMP_F}°F</strong> for the final <strong>${HOLD_MIN} min</strong>.</li>`;
    scheduleHtml += `<li>Aim to verify internal temp with a probe 30–60 min before the 180°F drop; adjust if needed.</li>`;
    scheduleHtml += `</ul>`;

    if (startDate < now) {
        const diffMin = Math.round((now - startDate) / 60000);

        // Only “speed up” the Phase 1 block; HOLD_MIN stays constant.
        const phase1Now = Math.max(10, Math.round(minutesPhase1)); // guard
        const desiredPhase1 = Math.max(phase1Now - diffMin, 10);

        // From: minutes ∝ (REF/Temp)^ALPHA
        // desiredPhase1/phase1Now = (ovenTemp / Tcatch)^ALPHA  =>  Tcatch = ovenTemp * (phase1Now/desiredPhase1)^(1/ALPHA)
        const tempRatio = Math.pow(phase1Now / desiredPhase1, 1 / ALPHA);
        let catchUpTemp = Math.round(ovenTemp * tempRatio);

        // practical bounds
        catchUpTemp = Math.max(Math.min(catchUpTemp, 500), Math.max(ovenTemp, 200));

        status = `
            <p><strong>You are behind by ${diffMin} minutes.</strong></p>
            <p>Suggested oven temperature (for the main phase) to catch up: <strong>${catchUpTemp}°F</strong>, then reduce to ${HOLD_TEMP_F}°F for the last ${HOLD_MIN} min.</p>
        `;
    } else {
        status = `<p>You are on schedule.</p>`;
    }

    // Safety reminder (informational)
    const safety = `
        <p style="margin-top:0.6rem">
        <em>Reminder:</em> Use a thermometer and finish at safe internal temps (e.g., whole beef/pork roasts 145°F + 3‑min rest; poultry 165°F). Carryover rise is smaller with low‑temp roasting, so don't rely on a big jump during the hold. 
        </p>
    `;

    showResult(`
        <p>Total cooking time: <strong>${formatDuration(totalMinutes)}</strong></p>
        <p>Required start time: <strong>${startTimeStr}</strong></p>
        ${scheduleHtml}
        ${status}
        ${safety}
    `);
});

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
