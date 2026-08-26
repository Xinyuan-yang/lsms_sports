// Global Firebase compat SDK is loaded via _includes/firebase-config.html.
const db = firebase.firestore();
const auth = firebase.auth();

let globalConfig = null;
let entriesUnsubscribe = null;
let leaderboardView = "week";

const effortMetValues = {
  Running: { easy: 8.3, moderate: 9.8, intense: 11.0 },
  Swimming: { easy: 6.0, moderate: 8.0, intense: 10.0 },
  Bicycling: { easy: 5.8, moderate: 7.5, intense: 10.0 },
};
const effortToPace = { easy: "slow", moderate: "medium", intense: "fast" };

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
const customSportInput = document.querySelector("#custom-sport");
const customMetInput = document.querySelector("#custom-met");
const paceLabel = document.querySelector("#pace-label");
const sportChartCanvas = document.querySelector("#sport-chart");
const sportChartEmpty = document.querySelector("#sport-chart-empty");

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
  const speedKmh = speeds?.[effortToPace[pace] || pace] || speeds?.medium || 0;
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

function getPastSevenDaysEntries(entries) {
  const today = new Date();
  const startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  startDate.setDate(startDate.getDate() - 6);
  const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

  return entries.filter((entry) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date || "")) return false;
    const [year, month, date] = entry.date.split("-").map(Number);
    const entryDate = new Date(year, month - 1, date);
    return entryDate >= startDate && entryDate < endDate;
  });
}

function renderLeaderboard(weeklyLeaderboard, totalLeaderboard) {
  if (!leaderboardSection) return;

  const leaderboard = leaderboardView === "week" ? weeklyLeaderboard : totalLeaderboard;
  const { top3, othersKm, totalKm } = leaderboard;
  const periodLabel = leaderboardView === "week" ? "Past week's leaders" : "All-time leaders";

  let html = `
    <div class="leaderboard-toggle" role="group" aria-label="Leaderboard period">
      <button type="button" class="leaderboard-toggle__button${leaderboardView === "week" ? " is-active" : ""}" data-leaderboard-view="week" aria-pressed="${leaderboardView === "week"}">Past week</button>
      <button type="button" class="leaderboard-toggle__button${leaderboardView === "total" ? " is-active" : ""}" data-leaderboard-view="total" aria-pressed="${leaderboardView === "total"}">All time</button>
    </div>
    <p class="leaderboard-period">${periodLabel}</p>
  `;

  if (!top3.length) {
    const emptyMessage = leaderboardView === "week"
      ? "No activities logged in the past seven days yet."
      : "No activities logged yet.";
    html += `<p class="empty-state leaderboard-empty">${emptyMessage}</p>`;
    leaderboardSection.innerHTML = html;
    bindLeaderboardToggle(weeklyLeaderboard, totalLeaderboard);
    return;
  }

  html += '<div class="podium">';
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
  bindLeaderboardToggle(weeklyLeaderboard, totalLeaderboard);
}

function bindLeaderboardToggle(weeklyLeaderboard, totalLeaderboard) {
  leaderboardSection.querySelectorAll("[data-leaderboard-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextView = button.dataset.leaderboardView;
      if (nextView === leaderboardView) return;
      leaderboardView = nextView;
      renderLeaderboard(weeklyLeaderboard, totalLeaderboard);
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function aggregateBySport(entries) {
  const totals = {};
  entries.forEach((entry) => {
    const sport = entry.sport?.trim();
    if (!sport) return;
    totals[sport] = (totals[sport] || 0) + (entry.walkingEquivalentKm || 0);
  });
  return Object.entries(totals)
    .map(([sport, km]) => ({ sport, km }))
    .sort((a, b) => b.km - a.km);
}

const SPORT_CHART_MIN_PERCENT = 3;

const SPORT_CHART_COLORS = [
  "#1F5C4A", // forest green
  "#287C78", // deep teal
  "#B7604E", // muted terracotta
  "#C18C3E", // antique gold
  "#76506F", // dusty plum
  "#6F8A64", // sage
  "#3E6977", // slate teal
  "#A66F3D", // burnished ochre
];
const SPORT_CHART_OTHER_COLOR = "#8A8178"; // warm stone

function renderSportChart(entries) {
  if (!sportChartCanvas) return;

  const data = aggregateBySport(entries);
  if (!data.length) {
    if (sportChartEmpty) sportChartEmpty.style.display = "block";
    sportChartCanvas.style.display = "none";
    return;
  }

  if (sportChartEmpty) sportChartEmpty.style.display = "none";
  sportChartCanvas.style.display = "block";

  const total = data.reduce((sum, d) => sum + d.km, 0) || 1;
  const withPercent = data.map((d) => ({ ...d, percent: (d.km / total) * 100 }));

  const main = withPercent.filter((d) => d.percent >= SPORT_CHART_MIN_PERCENT);
  const otherKm = withPercent
    .filter((d) => d.percent < SPORT_CHART_MIN_PERCENT)
    .reduce((sum, d) => sum + d.km, 0);

  const chartData = main.map((d) => ({ label: d.sport, value: d.km, percent: d.percent }));
  if (otherKm > 0) {
    chartData.push({ label: "Other", value: otherKm, percent: (otherKm / total) * 100 });
  }

  const labels = chartData.map((d) => d.label);
  const values = chartData.map((d) => d.value);
  let colorIndex = 0;
  const colors = chartData.map((d) => {
    if (d.label === "Other") return SPORT_CHART_OTHER_COLOR;
    const color = SPORT_CHART_COLORS[colorIndex % SPORT_CHART_COLORS.length];
    colorIndex += 1;
    return color;
  });

  if (window.sportChartInstance) {
    window.sportChartInstance.data.labels = labels;
    window.sportChartInstance.data.datasets[0].data = values;
    window.sportChartInstance.data.datasets[0].backgroundColor = colors;
    window.sportChartInstance.update();
    return;
  }

  window.sportChartInstance = new Chart(sportChartCanvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: "#fbfaf7",
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "right",
          labels: {
            color: "#17212b",
            font: { size: 12 },
          },
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = context.raw;
              const datasetTotal = context.dataset.data.reduce((a, b) => a + b, 0);
              const percent = datasetTotal ? ((value / datasetTotal) * 100).toFixed(1) : 0;
              return `${context.label}: ${formatKm(value)} km (${percent}%)`;
            },
          },
        },
      },
    },
  });
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
    const weeklyLeaderboard = computeLeaderboard(getPastSevenDaysEntries(entries));
    renderLeaderboard(weeklyLeaderboard, leaderboard);
    renderSportChart(entries);
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
  const supportsDistance = sport && sport !== "__custom__" && sportSupportsDistance(sport);
  const usesEffort = ["Running", "Swimming", "Bicycling"].includes(sport);
  const paceSelect = entryForm?.querySelector("#pace");
  distanceRow.style.display = supportsDistance ? "block" : "none";
  paceRow.style.display = (supportsDistance || usesEffort) ? "block" : "none";

  if (paceLabel) paceLabel.textContent = usesEffort ? "Effort" : "Pace";
  if (paceSelect) {
    paceSelect.options[0].value = usesEffort ? "easy" : "slow";
    paceSelect.options[1].value = usesEffort ? "moderate" : "medium";
    paceSelect.options[2].value = usesEffort ? "intense" : "fast";
    paceSelect.options[0].textContent = usesEffort ? "Easy" : "Slow";
    paceSelect.options[1].textContent = usesEffort ? "Moderate" : "Medium";
    paceSelect.options[2].textContent = usesEffort ? "Intense" : "Fast";
  }
}

function updateCustomSportFields() {
  if (!customSportInput || !customMetInput) return;
  const sportSelect = entryForm?.querySelector("#sport");
  const isCustom = sportSelect?.value === "__custom__";
  customSportInput.style.display = isCustom ? "block" : "none";
  customSportInput.required = isCustom;
  customMetInput.style.display = isCustom ? "block" : "none";
  customMetInput.required = isCustom;
  if (!isCustom) {
    customSportInput.value = "";
    customMetInput.value = "";
  }
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
    option.textContent = sport;
    sportSelect.append(option);
  });

  const customOption = document.createElement("option");
  customOption.value = "__custom__";
  customOption.textContent = "+ Custom sport";
  sportSelect.append(customOption);

  // Show/hide distance, pace, and custom sport fields based on the selection.
  sportSelect.addEventListener("change", () => {
    updateDistanceFields(sportSelect.value);
    updateCustomSportFields();
  });
  updateDistanceFields(sportSelect.value);
  updateCustomSportFields();

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
  let sport = formData.get("sport");
  const duration = parseFloat(formData.get("duration"));
  const distance = parseFloat(formData.get("distance"));
  const pace = formData.get("pace") || "medium";
  const date = formData.get("date");
  const pin = formData.get("pin")?.trim();

  if (!rawPerson || !sport || !date || !pin) {
    setFormMessage("Please fill in all fields correctly.", "error");
    return;
  }

  let metValue;
  if (sport === "__custom__") {
    sport = formData.get("customSport")?.trim();
    metValue = parseFloat(formData.get("customMet"));
    if (!sport || !Number.isFinite(metValue) || metValue <= 0) {
      setFormMessage("Please provide a custom sport name and a positive MET value.", "error");
      return;
    }
  } else {
    metValue = globalConfig.effortMetValues?.[sport]?.[pace] || effortMetValues[sport]?.[pace] || globalConfig.metValues[sport];
    if (!metValue) {
      setFormMessage("Unknown sport selected.", "error");
      return;
    }
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
      entryData.pace = effortToPace[paceValue] || paceValue;
    }
    if (effortMetValues[sport]) {
      entryData.effort = pace;
    }

    await db.collection("entries").add(entryData);

    entryForm.reset();
    // Restore default date and hide conditional fields until selections are made.
    const dateInput = entryForm.querySelector("#date");
    if (dateInput) dateInput.valueAsDate = new Date();
    const sportSelect = entryForm.querySelector("#sport");
    if (sportSelect) updateDistanceFields(sportSelect.value);
    updateCustomSportFields();
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

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    const swUrl = window.serviceWorkerUrl || "sw.js";
    navigator.serviceWorker
      .register(swUrl)
      .then((registration) => console.log("[PWA] Service worker registered:", registration.scope))
      .catch((error) => console.error("[PWA] Service worker registration failed:", error));
  }
}

init();
registerServiceWorker();
