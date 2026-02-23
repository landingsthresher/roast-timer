document.getElementById("calcBtn").addEventListener("click", () => {
    const weight = parseFloat(document.getElementById("weight").value);
    const state = document.getElementById("state").value;
    const ovenTemp = parseFloat(document.getElementById("ovenTemp").value);
    const targetTime = document.getElementById("targetTime").value;

    if (!weight || !ovenTemp || !targetTime) {
        showResult("Please fill out all fields.");
        return;
    }

    // --- Base model ---
    let minutes = weight * 70; // thawed baseline at 325°F

    // Oven temperature adjustment
    minutes *= 325 / ovenTemp;

    // Frozen multipliers
    if (state === "partial") minutes *= 1.15;
    if (state === "frozen") minutes *= 1.35;

    const totalMinutes = Math.round(minutes);

    // --- Compute required start time ---
    const [targetHour, targetMin] = targetTime.split(":").map(Number);
    const targetDate = new Date();
    targetDate.setHours(targetHour, targetMin, 0, 0);

    const startDate = new Date(targetDate.getTime() - totalMinutes * 60000);

    const startTimeStr = format12Hour(startDate);

    // --- Check if you're already late ---
    const now = new Date();
    let status = "";

    if (startDate < now) {
        const diffMin = Math.round((now - startDate) / 60000);

        // Suggest oven temp increase (simple linear catch-up model)
        const catchUpTemp = Math.min(
            Math.round((325 * totalMinutes) / (totalMinutes - diffMin)),
            500
        );

        status = `
            <p><strong>You are behind schedule by ${diffMin} minutes.</strong></p>
            <p>Suggested oven temperature to catch up: <strong>${catchUpTemp}°F</strong></p>
        `;
    } else {
        status = `<p>You are on schedule.</p>`;
    }

    showResult(`
        <p>Total cooking time: <strong>${formatDuration(totalMinutes)}</strong></p>
        <p>Required start time: <strong>${startTimeStr}</strong></p>
        ${status}
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
    return `${h} hour${h !== 1 ? "s" : ""} ${m} min`;
}

function showResult(html) {
    const result = document.getElementById("result");
    result.innerHTML = html;
    result.style.display = "block";
}
