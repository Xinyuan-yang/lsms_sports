// Interactive hiking tracker map.
// Loaded on the switzerland-hiking-tracker page.

const mapContainer = document.querySelector("#hiking-map");
const progressBar = document.querySelector("#map-progress");

let map = null;
let routeCoordinates = [];
let routeDistances = [];
let totalRouteKm = 0;

function formatKm(value) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

async function fetchRoute() {
  const routeUrl = window.routeUrl || "assets/data/route.json";
  const response = await fetch(routeUrl);
  if (!response.ok) throw new Error("Route data unavailable");
  return response.json();
}

async function loadConfig() {
  const snapshot = await firebase.firestore().collection("config").doc("global").get();
  if (!snapshot.exists) throw new Error("Config not found");
  return snapshot.data();
}

function subscribeToProgress(config) {
  totalRouteKm = config.totalRouteKm || 0;

  firebase.firestore().collection("entries").onSnapshot((snapshot) => {
    const entries = snapshot.docs.map((doc) => doc.data());
    const totalKm = entries.reduce((sum, entry) => sum + (entry.walkingEquivalentKm || 0), 0);
    renderProgress(totalKm, config);
    if (map) renderWeeklyProgress(entries, config);
  });
}

function renderProgress(totalKm, config) {
  const percent = totalRouteKm ? Math.min(100, (totalKm / totalRouteKm) * 100).toFixed(1) : 0;

  const statusEl = document.querySelector("#hiking-status");
  if (statusEl) {
    statusEl.textContent = `${formatKm(totalKm)} km walked out of ${formatKm(totalRouteKm)} km to ${config.destination.name} (${percent}%).`;
  }

  const countriesEl = document.querySelector("#hiking-countries");
  if (countriesEl) {
    countriesEl.textContent = `Current goal: reach ${config.destination.name}.`;
  }

  const currentDistanceEl = document.querySelector("#current-cumulated-distance");
  if (currentDistanceEl) currentDistanceEl.textContent = formatKm(totalKm);

  if (progressBar) {
    progressBar.value = Math.min(100, percent);
    progressBar.textContent = `${percent}%`;
  }
}

function getCompletedCoordinates(targetKm) {
  const completed = [];
  for (let i = 0; i < routeCoordinates.length; i += 1) {
    completed.push(routeCoordinates[i]);
    if (routeDistances[i] >= targetKm) break;
  }
  return completed;
}

function getCoordinatesBetween(startKm, endKm) {
  const segment = [];
  let started = false;
  for (let i = 0; i < routeCoordinates.length; i += 1) {
    if (routeDistances[i] >= startKm) started = true;
    if (started) {
      segment.push(routeCoordinates[i]);
      if (routeDistances[i] >= endKm) break;
    }
  }
  return segment;
}

function getCoordinateAtKm(targetKm) {
  for (let i = 0; i < routeCoordinates.length; i += 1) {
    if (routeDistances[i] >= targetKm) return routeCoordinates[i];
  }
  return routeCoordinates[routeCoordinates.length - 1];
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

function rgbToHex(r, g, b) {
  return `#${Math.round(r).toString(16).padStart(2, "0")}${Math.round(g).toString(16).padStart(2, "0")}${Math.round(b).toString(16).padStart(2, "0")}`;
}

function interpolateColor(color1, color2, ratio) {
  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);
  return rgbToHex(
    c1.r + (c2.r - c1.r) * ratio,
    c1.g + (c2.g - c1.g) * ratio,
    c1.b + (c2.b - c1.b) * ratio
  );
}

function getColorForWeeklyKm(weekKm, minKm, maxKm, config) {
  const gradient = config.weeklyPaceGradient || { slowColor: "#f44336", fastColor: "#4caf50" };
  if (maxKm <= minKm) return gradient.fastColor;
  const ratio = Math.max(0, Math.min(1, (weekKm - minKm) / (maxKm - minKm)));
  return interpolateColor(gradient.slowColor, gradient.fastColor, ratio);
}

function computeWeeklyProgress(entries, startDateStr) {
  const start = new Date(startDateStr);
  const weekMap = {};

  entries.forEach((entry) => {
    if (!entry.date) return;
    const entryDate = new Date(entry.date);
    if (Number.isNaN(entryDate.getTime())) return;
    const daysDiff = Math.floor((entryDate - start) / (1000 * 60 * 60 * 24));
    const weekIndex = Math.floor(daysDiff / 7);
    if (weekIndex < 0) return;
    weekMap[weekIndex] = (weekMap[weekIndex] || 0) + (entry.walkingEquivalentKm || 0);
  });

  const sortedWeeks = Object.keys(weekMap).map(Number).sort((a, b) => a - b);
  let cumulative = 0;
  return sortedWeeks.map((weekIndex) => {
    cumulative += weekMap[weekIndex];
    return {
      weekIndex,
      weekKm: weekMap[weekIndex],
      cumulativeKm: cumulative,
    };
  });
}

function clearWeeklyLayers() {
  if (window.weeklyLayers) {
    window.weeklyLayers.forEach((layer) => {
      if (layer) map.removeLayer(layer);
    });
  }
  window.weeklyLayers = [];
}

function renderLegend(minKm, maxKm, config) {
  const container = document.querySelector("#map-legend");
  if (!container) return;

  const gradient = config.weeklyPaceGradient || { slowColor: "#f44336", fastColor: "#4caf50" };
  container.innerHTML = `
    <div class="map-legend__label">Weekly km</div>
    <div class="map-legend__bar" style="background: linear-gradient(to right, ${gradient.slowColor}, ${gradient.fastColor});"></div>
    <div class="map-legend__scale">
      <span>${formatKm(minKm)} km</span>
      <span>${formatKm(maxKm)} km</span>
    </div>
  `;
}

function renderWeeklyProgress(entries, config) {
  if (!map || !routeCoordinates.length) return;

  clearWeeklyLayers();

  const weeklyProgress = computeWeeklyProgress(entries, config.startDate);
  if (!weeklyProgress.length) return;

  const weekKms = weeklyProgress.map((w) => w.weekKm);
  const minKm = Math.min(...weekKms);
  const maxKm = Math.max(...weekKms);

  renderLegend(minKm, maxKm, config);

  weeklyProgress.forEach((week, index) => {
    const startKm = index === 0 ? 0 : weeklyProgress[index - 1].cumulativeKm;
    const endKm = week.cumulativeKm;
    const segmentCoords = getCoordinatesBetween(startKm, endKm);
    const color = getColorForWeeklyKm(week.weekKm, minKm, maxKm, config);

    if (segmentCoords.length >= 2) {
      const lineLayer = L.polyline(segmentCoords, {
        color,
        weight: 5,
        opacity: 0.9,
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);
      window.weeklyLayers.push(lineLayer);
    }

    const markerCoord = getCoordinateAtKm(endKm);
    const marker = L.marker(markerCoord, {
      icon: L.divIcon({
        className: "week-marker",
        html: `<span style="background:${color}">${week.weekIndex + 1}</span>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      }),
    }).addTo(map);
    marker.bindPopup(`Week ${week.weekIndex + 1}: ${formatKm(week.weekKm)} km`);
    window.weeklyLayers.push(marker);
  });
}

async function initMap() {
  if (!mapContainer) return;

  try {
    const [config, routeFeature] = await Promise.all([loadConfig(), fetchRoute()]);
    const geometry = routeFeature.geometry;
    routeCoordinates = geometry.coordinates.map(([lng, lat]) => [lat, lng]);
    routeDistances = routeFeature.properties.coordinateDistancesKm || [];
    totalRouteKm = config.totalRouteKm || routeFeature.properties.totalDistanceKm || 0;

    map = L.map(mapContainer).fitBounds(routeCoordinates, { padding: [40, 40] });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }).addTo(map);

    // Full planned route in grey.
    L.polyline(routeCoordinates, {
      color: "#9e9e9e",
      weight: 4,
      opacity: 0.7,
      dashArray: "6, 8",
    }).addTo(map);

    // Start and destination markers.
    const origin = routeCoordinates[0];
    const destination = routeCoordinates[routeCoordinates.length - 1];
    L.marker(origin).addTo(map).bindPopup(config.origin.name || "Start");
    L.marker(destination).addTo(map).bindPopup(config.destination.name || "Destination");

    renderProgress(0, config);
    subscribeToProgress(config);
  } catch (error) {
    console.error("Map initialization failed:", error);
    const details = error?.message ? `: ${error.message}` : "";
    mapContainer.innerHTML = `<p class="error">Unable to load the interactive map. Please refresh.${details}</p>`;
  }
}

// Wait for Firebase auth (loaded via script.js include) before reading Firestore.
firebase.auth().onAuthStateChanged((user) => {
  if (user) {
    initMap();
  }
});
