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
const distanceRow = document.querySelector("#distance-row");
const paceRow = document.querySelector("#pace-row");
const personSelect = document.querySelector("#person-select");
const personNewInput = document.querySelector("#person-new");
const personHiddenInput = document.querySelector("#person");

function formatKm(value) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function waitForAuth(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        resolved = true;
        unsubscribe();
        clearTimeout(timer);
        console.log("[Tracker] Auth ready");
        resolve(user);
      }
    });

    const timer = setTimeout(() => {
      if (!resolved) {
        unsubscribe();
        reject(new Error("Firebase anonymous auth timed out"));
      }
    }, timeoutMs);
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

function sportSupportsDistance(sport) {
  return globalConfig?.sportPaces ? Object.prototype.hasOwnProperty.call(globalConfig.sportPaces, sport) : false;
}

function computeDurationFromDistance(distanceKm, sport, pace) {
  const speeds = globalConfig.sportPaces[sport];
  const speedKmh = speeds?.[pace] || speeds?.medium || 0;
  if (!speedKmh) return 0;
  return (distanceKm / speedKmh) * 60;
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
    updatePeopleSelect(entries);

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

function updateDistanceFields(sport) {
  if (!distanceRow || !paceRow) return;
  const supportsDistance = sportSupportsDistance(sport);
  distanceRow.style.display = supportsDistance ? "block" : "none";
  paceRow.style.display = supportsDistance ? "block" : "none";
}

function updatePeopleSelect(entries) {
  if (!personSelect) return;

  const names = [...new Set(entries.map((entry) => entry.person?.trim()).filter(Boolean))].sort();
  const previousValue = personSelect.value;

  personSelect.innerHTML = '<option value="" disabled selected>Choose your name</option>';
  names.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    personSelect.append(option);
  });

  const newOption = document.createElement("option");
  newOption.value = "__new__";
  newOption.textContent = "+ Add new person";
  personSelect.append(newOption);

  if (previousValue && (names.includes(previousValue) || previousValue === "__new__")) {
    personSelect.value = previousValue;
  }

  // Keep the hidden input in sync if an existing name is selected.
  if (personHiddenInput && personSelect.value !== "__new__") {
    personHiddenInput.value = personSelect.value;
  }
}

function updatePersonInputVisibility() {
  if (!personSelect || !personNewInput || !personHiddenInput) return;
  const isNew = personSelect.value === "__new__";
  personNewInput.style.display = isNew ? "block" : "none";
  personNewInput.required = isNew;
  if (!isNew) {
    personNewInput.value = "";
    personHiddenInput.value = personSelect.value;
  } else {
    personHiddenInput.value = personNewInput.value.trim();
  }
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

  // Show/hide distance and pace fields based on the selected sport.
  sportSelect.addEventListener("change", () => updateDistanceFields(sportSelect.value));
  updateDistanceFields(sportSelect.value);

  // Show/hide the new-person text input based on the name selection.
  if (personSelect) {
    personSelect.addEventListener("change", updatePersonInputVisibility);
    updatePersonInputVisibility();
  }

  if (personNewInput) {
    personNewInput.addEventListener("input", () => {
      if (personHiddenInput && personSelect.value === "__new__") {
        personHiddenInput.value = personNewInput.value.trim();
      }
    });
  }

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
  const rawPerson = formData.get("person")?.trim();
  const sport = formData.get("sport");
  const duration = parseFloat(formData.get("duration"));
  const distance = parseFloat(formData.get("distance"));
  const pace = formData.get("pace") || "medium";
  const date = formData.get("date");
  const pin = formData.get("pin")?.trim();

  if (!rawPerson || !sport || !date || !pin) {
    setFormMessage("Please fill in all fields correctly.", "error");
    return;
  }

  const metValue = globalConfig.metValues[sport];
  if (!metValue) {
    setFormMessage("Unknown sport selected.", "error");
    return;
  }

  const supportsDistance = sportSupportsDistance(sport);
  const hasDuration = Number.isFinite(duration) && duration > 0;
  const hasDistance = supportsDistance && Number.isFinite(distance) && distance > 0;

  if (!hasDuration && !hasDistance) {
    setFormMessage("Please enter either a duration or a distance.", "error");
    return;
  }

  let durationMinutes;
  let distanceKm = null;
  let paceValue = null;
  let walkingKm;

  if (hasDistance) {
    distanceKm = Math.round(distance * 100) / 100;
    paceValue = pace;
    durationMinutes = Math.round(computeDurationFromDistance(distance, sport, pace) * 100) / 100;
    walkingKm = computeWalkingEquivalentKm(durationMinutes, metValue);
  } else {
    durationMinutes = duration;
    walkingKm = computeWalkingEquivalentKm(duration, metValue);
  }

  const submitButton = entryForm.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  setFormMessage("Submitting...", "info");

  try {
    const entryData = {
      person: rawPerson,
      sport,
      durationMinutes,
      metValue,
      walkingEquivalentKm: Math.round(walkingKm * 100) / 100,
      date,
      submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
      pin,
    };

    if (distanceKm !== null) {
      entryData.distanceKm = distanceKm;
      entryData.pace = paceValue;
    }

    await db.collection("entries").add(entryData);

    entryForm.reset();
    // Restore default date and hide conditional fields until selections are made.
    const dateInput = entryForm.querySelector("#date");
    if (dateInput) dateInput.valueAsDate = new Date();
    const sportSelect = entryForm.querySelector("#sport");
    if (sportSelect) updateDistanceFields(sportSelect.value);
    updatePersonInputVisibility();
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
    console.log("[Tracker] Loading config...");
    await loadConfig();
    console.log("[Tracker] Config loaded");
    renderForm();
    console.log("[Tracker] Subscribing to entries...");
    subscribeToEntries();
    console.log("[Tracker] Ready");
  } catch (error) {
    console.error("[Tracker] Initialization failed:", error);
    if (leaderboardSection) {
      leaderboardSection.innerHTML = `<p class="error">Unable to initialize tracker: ${escapeHtml(error.message || "unknown error")}. Please refresh.</p>`;
    }
    if (formMessage) {
      setFormMessage("Tracker failed to load. Please refresh.", "error");
    }
  }
}

init();
