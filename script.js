// Global Firebase compat SDK is loaded via _includes/firebase-config.html.
const db = firebase.firestore();
const auth = firebase.auth();

let globalConfig = null;
let entriesUnsubscribe = null;

// DOM element references
const trackerTable = document.querySelector("#tracker-table");
const leaderboardSection = document.querySelector("#leaderboard-section");
const entryForm = document.querySelector("#entry-form");
const formMessage = document.querySelector("#form-message");
const weeklyMessage = document.querySelector("#weekly-message");
const totalKmDisplay = document.querySelector("#total-km");
const hikingStatus = document.querySelector("#hiking-status");
const hikingCountries = document.querySelector("#hiking-countries");
const currentCumulatedDistance = document.querySelector("#current-cumulated-distance");
const totalDistanceLeader = document.querySelector("#total-distance-leader");
const totalDistanceLeaderDistance = document.querySelector("#total-distance-leader-distance");

function formatKm(value) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function waitForAuth() {
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

async function loadConfig() {
  const snapshot = await db.collection("config").doc("global").get();
  if (!snapshot.exists) {
    throw new Error("Global config not found");
  }
  globalConfig = snapshot.data();
  return globalConfig;
}

function computeWalkingEquivalentKm(durationMinutes, metValue) {
  const hours = durationMinutes / 60;
  const equivalentWalkingHours = (metValue * hours) / globalConfig.hikingMet;
  return equivalentWalkingHours * globalConfig.hikingSpeedKmh;
}

function aggregateByPerson(entries) {
  const totals = {};
  entries.forEach((entry) => {
    const person = entry.person?.trim();
    if (!person) return;
    const km = entry.walkingEquivalentKm || 0;
    totals[person] = (totals[person] || 0) + km;
  });
  return totals;
}

function computeLeaderboard(entries) {
  const totals = aggregateByPerson(entries);
  const ranked = Object.entries(totals)
    .map(([person, km]) => ({ person, km }))
    .sort((a, b) => b.km - a.km);

  const totalKm = ranked.reduce((sum, item) => sum + item.km, 0);
  const top3 = ranked.slice(0, 3);
  const othersKm = ranked.slice(3).reduce((sum, item) => sum + item.km, 0);

  return { top3, othersKm, totalKm, all: ranked };
}

function renderLeaderboard({ top3, othersKm, totalKm }) {
  if (!leaderboardSection) return;

  let html = '<div class="podium">';
  const medals = ["🥇", "🥈", "🥉"];
  top3.forEach((entry, index) => {
    html += `
      <div class="podium-place podium-place--${index + 1}">
        <div class="podium-medal">${medals[index]}</div>
        <div class="podium-person">${escapeHtml(entry.person)}</div>
        <div class="podium-km">${formatKm(entry.km)} km</div>
      </div>
    `;
  });
  html += "</div>";

  if (othersKm > 0) {
    html += `<p class="others-total">Everyone else: <strong>${formatKm(othersKm)} km</strong></p>`;
  }

  html += `<p class="group-total">Group total: <strong>${formatKm(totalKm)} km</strong></p>`;

  leaderboardSection.innerHTML = html;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderMapStatus(totalKm) {
  if (totalKmDisplay) {
    totalKmDisplay.textContent = formatKm(totalKm);
  }
  if (weeklyMessage) {
    if (globalConfig?.totalRouteKm) {
      const percent = Math.min(100, (totalKm / globalConfig.totalRouteKm) * 100).toFixed(1);
      weeklyMessage.textContent = `The lab has covered ${formatKm(totalKm)} km (${percent}%) of the ${formatKm(globalConfig.totalRouteKm)} km journey to ${globalConfig.destination.name}.`;
    } else {
      weeklyMessage.textContent = `The lab has covered ${formatKm(totalKm)} km so far.`;
    }
  }
  if (hikingStatus) {
    hikingStatus.textContent = `Current progress: ${formatKm(totalKm)} km walked.`;
  }
  if (currentCumulatedDistance) {
    currentCumulatedDistance.textContent = formatKm(totalKm);
  }
}

function subscribeToEntries() {
  if (entriesUnsubscribe) {
    entriesUnsubscribe();
  }

  entriesUnsubscribe = db.collection("entries").onSnapshot((snapshot) => {
    const entries = snapshot.docs.map((doc) => doc.data());
    const leaderboard = computeLeaderboard(entries);
    renderLeaderboard(leaderboard);
    renderMapStatus(leaderboard.totalKm);

    // Update hiking tracker page leader values too.
    if (totalDistanceLeader && leaderboard.all.length) {
      totalDistanceLeader.textContent = leaderboard.all[0].person;
      totalDistanceLeaderDistance.textContent = formatKm(leaderboard.all[0].km);
    }
  }, (error) => {
    console.error("Error loading entries:", error);
    if (leaderboardSection) {
      leaderboardSection.innerHTML = "<p class=\"error\">Unable to load leaderboard.</p>";
    }
  });
}

function renderForm() {
  if (!entryForm) return;

  const sportSelect = entryForm.querySelector("#sport");
  if (!sportSelect || !globalConfig?.metValues) return;

  sportSelect.innerHTML = '<option value="" disabled selected>Choose a sport</option>';
  Object.entries(globalConfig.metValues).forEach(([sport, met]) => {
    const option = document.createElement("option");
    option.value = sport;
    option.dataset.met = met;
    option.textContent = `${sport} (${met} METs)`;
    sportSelect.append(option);
  });

  // Default date to today.
  const dateInput = entryForm.querySelector("#date");
  if (dateInput) {
    dateInput.valueAsDate = new Date();
  }

  entryForm.addEventListener("submit", handleFormSubmit);
}

function setFormMessage(message, type = "info") {
  if (!formMessage) return;
  formMessage.textContent = message;
  formMessage.className = `form-message form-message--${type}`;
}

async function handleFormSubmit(event) {
  event.preventDefault();
  if (!globalConfig) {
    setFormMessage("Configuration not loaded yet. Please wait.", "error");
    return;
  }

  const formData = new FormData(entryForm);
  const person = formData.get("person")?.trim();
  const sport = formData.get("sport");
  const duration = parseFloat(formData.get("duration"));
  const date = formData.get("date");
  const pin = formData.get("pin")?.trim();

  if (!person || !sport || !Number.isFinite(duration) || duration <= 0 || !date || !pin) {
    setFormMessage("Please fill in all fields correctly.", "error");
    return;
  }

  const metValue = globalConfig.metValues[sport];
  if (!metValue) {
    setFormMessage("Unknown sport selected.", "error");
    return;
  }

  const walkingKm = computeWalkingEquivalentKm(duration, metValue);

  const submitButton = entryForm.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  setFormMessage("Submitting...", "info");

  try {
    await db.collection("entries").add({
      person,
      sport,
      durationMinutes: duration,
      metValue,
      walkingEquivalentKm: Math.round(walkingKm * 100) / 100,
      date,
      submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
      pin,
    });

    entryForm.reset();
    // Restore default date.
    const dateInput = entryForm.querySelector("#date");
    if (dateInput) dateInput.valueAsDate = new Date();
    setFormMessage(`Added ${formatKm(walkingKm)} km. Great job!`, "success");
  } catch (error) {
    console.error("Submit failed:", error);
    setFormMessage("Failed to submit. Check your PIN and try again.", "error");
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

async function init() {
  try {
    await waitForAuth();
    await loadConfig();
    renderForm();
    subscribeToEntries();
  } catch (error) {
    console.error("Initialization failed:", error);
    if (leaderboardSection) {
      leaderboardSection.innerHTML = "<p class=\"error\">Unable to initialize tracker. Please refresh.</p>";
    }
  }
}

init();
