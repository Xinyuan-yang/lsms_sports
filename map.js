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
  const response = await fetch("{{ '/assets/data/route.json' | relative_url }}?v={{ site.time | date: '%s' }}");
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
    if (map) renderCompletedPath(totalKm);
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

function renderCompletedPath(totalKm) {
  if (!map || !routeCoordinates.length) return;

  const completedCoords = getCompletedCoordinates(totalKm);
  const completedLayer = window.completedRouteLayer;
  if (completedLayer) {
    map.removeLayer(completedLayer);
  }

  if (completedCoords.length >= 2) {
    window.completedRouteLayer = L.polyline(completedCoords, {
      color: "#2e7d32",
      weight: 5,
      opacity: 0.9,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(map);
  }
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
    mapContainer.innerHTML = "<p class=\"error\">Unable to load the interactive map. Please refresh.</p>";
  }
}

// Wait for Firebase auth (loaded via script.js include) before reading Firestore.
firebase.auth().onAuthStateChanged((user) => {
  if (user) {
    initMap();
  }
});
