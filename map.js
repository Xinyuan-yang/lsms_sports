// Interactive hiking tracker map.
// Loaded on the switzerland-hiking-tracker page.

const mapContainer = document.querySelector("#hiking-map");
const journeyOrigin = document.querySelector("#journey-origin");
const journeyDestination = document.querySelector("#journey-destination");
const journeyProgress = document.querySelector("#journey-progress");
const journeyPercent = document.querySelector("#journey-percent");
const weeklyProgressBar = document.querySelector("#weekly-progress-bar");
const weeklyProgressTotal = document.querySelector("#weekly-progress-total");

let map = null;
let routeCoordinates = [];
let routeDistances = [];
let totalRouteKm = 0;

let lastGalleryCoord = null;
let lastGalleryFetchTime = 0;
const GALLERY_MIN_MOVE_KM = 5;
const GALLERY_MIN_INTERVAL_MS = 5000;

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
    const weeklyProgress = computeWeeklyProgress(entries, config.startDate);
    renderJourneyCard(totalKm, config);
    renderWeeklyProgressBar(weeklyProgress, totalKm);
    if (map) renderWeeklyProgress(weeklyProgress, config);
    updateLocationGallery(totalKm);
  });
}

function renderJourneyCard(totalKm, config) {
  const percent = totalRouteKm ? Math.min(100, (totalKm / totalRouteKm) * 100).toFixed(1) : 0;

  if (journeyOrigin) journeyOrigin.textContent = config.origin.name || "Start";
  if (journeyDestination) journeyDestination.textContent = config.destination.name || "Destination";
  if (journeyProgress) {
    journeyProgress.textContent = `${formatKm(totalKm)} km / ${formatKm(totalRouteKm)} km`;
  }
  if (journeyPercent) journeyPercent.textContent = `${percent}%`;
  if (weeklyProgressTotal) weeklyProgressTotal.textContent = `${formatKm(totalRouteKm)} km`;
}

function renderWeeklyProgressBar(weeklyProgress, totalKm) {
  if (!weeklyProgressBar) return;

  if (!weeklyProgress.length) {
    const percent = totalRouteKm ? Math.min(100, (totalKm / totalRouteKm) * 100).toFixed(1) : 0;
    weeklyProgressBar.innerHTML = `
      <div class="weekly-progress__segment weekly-progress__segment--empty" style="width: ${percent}%;"></div>
    `;
    return;
  }

  const weekKms = weeklyProgress.map((w) => w.weekKm);
  const minKm = Math.min(...weekKms);
  const maxKm = Math.max(...weekKms);

  weeklyProgressBar.innerHTML = weeklyProgress
    .map((week, index) => {
      const width = totalRouteKm ? (week.weekKm / totalRouteKm) * 100 : 0;
      const color = getColorForWeeklyKm(week.weekKm, minKm, maxKm, null);
      return `
        <div
          class="weekly-progress__segment"
          style="width: ${width}%; background: ${color};"
          title="Week ${week.weekIndex + 1}: ${formatKm(week.weekKm)} km"
        ></div>
      `;
    })
    .join("");
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

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(html) {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

function coordinateDistanceKm(coord1, coord2) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(coord2[0] - coord1[0]);
  const dLon = toRad(coord2[1] - coord1[1]);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(coord1[0])) * Math.cos(toRad(coord2[0])) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function parseAddressName(data) {
  const addr = data.address || {};
  return {
    locality: addr.village || addr.town || addr.city || addr.municipality || addr.hamlet || null,
    county: addr.county || addr.district || addr.region || null,
    state: addr.state || addr.province || null,
    country: addr.country || null,
  };
}

function buildSearchQueries(address) {
  const { locality, county, state, country } = address;
  const queries = [];
  if (locality && country) queries.push(`${locality} ${country}`);
  if (county && country) queries.push(`${county} ${country}`);
  if (state && country) queries.push(`${state} ${country}`);
  if (country) queries.push(`${country} landscape`);
  return queries;
}

async function fetchLocationName(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(
    lng
  )}&format=json&addressdetails=1`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("Location lookup failed");
  const data = await response.json();
  return {
    display: data.display_name || null,
    address: parseAddressName(data),
  };
}

function extractCategories(info) {
  const raw = info?.extmetadata?.Categories?.value || "";
  return raw.split("|").map((c) => c.trim()).filter(Boolean);
}

function normalizeWikimediaImages(data) {
  const pages = data.query?.pages || {};
  return Object.values(pages)
    .map((page) => {
      const info = page.imageinfo?.[0];
      return {
        pageId: page.pageid,
        title: page.title,
        url: info?.url,
        thumbUrl: info?.thumburl,
        description: info?.extmetadata?.ImageDescription?.value || page.title,
        categories: extractCategories(info),
      };
    })
    .filter((img) => img.url);
}

function getLocationTerms(address) {
  const terms = new Set();
  if (!address) return terms;
  [address.locality, address.county, address.state, address.country].forEach((term) => {
    if (term) terms.add(term.toLowerCase());
  });
  return terms;
}

function isGenericCategory(category) {
  const generic = [
    "self-published work",
    "own work",
    "files with coordinates missing",
    "taken with",
    "images from",
    "files from",
    "iss expedition",
    "iss photographs",
    "pd nasa",
    "uploaded via",
    "uploaded with",
    "mediagrant",
    "fotíme česko",
    "photos taken with",
    "all media supported by",
    "cc by",
    "cc-by",
    "cc0",
    "public domain",
    "pd-old",
    "pd-art",
    "license migration",
    "gfdl",
    "creative commons",
    "files by user",
    "with known ids",
    "artworks without wikidata item",
    "artworks with wikidata item",
    "sold at",
    "license",
  ];
  const lower = category.toLowerCase();
  return generic.some((g) => lower.includes(g));
}

function isLocationCategory(category, locationTerms) {
  if (!locationTerms.size) return false;
  const lower = category.toLowerCase();
  for (const term of locationTerms) {
    if (lower === term) return true;
  }
  return false;
}

function getSpecificCategories(image, locationTerms) {
  return image.categories.filter(
    (cat) => !isGenericCategory(cat) && !isLocationCategory(cat, locationTerms)
  );
}

function normalizeTitleKey(title) {
  return title
    .replace(/^File:/, "")
    .replace(/\.[^.]+$/, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .replace(/\s*-\s*\d+\s*$/, "")
    .trim()
    .toLowerCase();
}

function selectDiverseImages(images, maxCount, address) {
  const locationTerms = getLocationTerms(address);
  const selected = [];
  const usedTitleKeys = new Set();
  const usedCategories = new Set();

  for (const img of images) {
    if (selected.length >= maxCount) break;

    const titleKey = normalizeTitleKey(img.title);
    if (usedTitleKeys.has(titleKey)) continue;

    const specificCats = getSpecificCategories(img, locationTerms);
    if (specificCats.some((cat) => usedCategories.has(cat))) continue;

    selected.push(img);
    usedTitleKeys.add(titleKey);
    specificCats.forEach((cat) => usedCategories.add(cat));
  }

  return selected;
}

async function fetchWikimediaGeoImages(lat, lng) {
  const params = new URLSearchParams({
    action: "query",
    generator: "geosearch",
    ggsnamespace: "6",
    ggsradius: "10000",
    ggslimit: "12",
    ggscoord: `${lat}|${lng}`,
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "800",
    format: "json",
    origin: "*",
  });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`);
  if (!response.ok) throw new Error("Image search failed");
  return normalizeWikimediaImages(await response.json());
}

async function fetchWikimediaSearchImages(query) {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrnamespace: "6",
    gsrlimit: "12",
    gsrsearch: query,
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "800",
    format: "json",
    origin: "*",
  });
  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`);
  if (!response.ok) throw new Error("Image search failed");
  return normalizeWikimediaImages(await response.json());
}

function renderLocationGallery(images, locationName) {
  const nameEl = document.querySelector("#current-location-name");
  const galleryEl = document.querySelector("#location-gallery");

  if (nameEl) {
    nameEl.textContent = locationName ? `Currently near: ${stripHtml(locationName)}` : "Current location";
  }

  if (!galleryEl) return;

  if (!images.length) {
    galleryEl.innerHTML = '<p class="empty-state">No landscape photos found for this area.</p>';
    return;
  }

  galleryEl.innerHTML = images
    .slice(0, 3)
    .map((img) => {
      const alt = stripHtml(img.description || img.title);
      const caption = stripHtml(img.description || "");
      return `
        <figure class="location-gallery__item">
          <a href="${img.url}" target="_blank" rel="noopener">
            <img src="${img.thumbUrl || img.url}" alt="${escapeHtml(alt)}" loading="lazy">
          </a>
          ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}
        </figure>
      `;
    })
    .join("");
}

async function updateLocationGallery(totalKm) {
  const coord = getCoordinateAtKm(totalKm);
  if (!coord) return;

  const now = Date.now();
  const moved =
    !lastGalleryCoord || coordinateDistanceKm(lastGalleryCoord, coord) >= GALLERY_MIN_MOVE_KM;
  const enoughTime = now - lastGalleryFetchTime >= GALLERY_MIN_INTERVAL_MS;

  if (!moved && !enoughTime) return;

  lastGalleryCoord = coord;
  lastGalleryFetchTime = now;

  let locationData = null;
  try {
    locationData = await fetchLocationName(coord[0], coord[1]);
  } catch (error) {
    console.warn("Location name lookup failed:", error);
  }

  let images = [];
  try {
    images = await fetchWikimediaGeoImages(coord[0], coord[1]);
  } catch (error) {
    console.warn("Geosearch image fetch failed:", error);
  }

  if (locationData?.address && images.length < 3) {
    const queries = buildSearchQueries(locationData.address);
    for (const query of queries) {
      if (images.length >= 3) break;
      try {
        const searchImages = await fetchWikimediaSearchImages(query);
        for (const img of searchImages) {
          if (!images.some((existing) => existing.pageId === img.pageId || existing.title === img.title)) {
            images.push(img);
          }
        }
      } catch (error) {
        console.warn(`Text image search failed for "${query}":`, error);
      }
    }
  }

  const diverseImages = selectDiverseImages(images, 3, locationData?.address);
  renderLocationGallery(diverseImages, locationData?.display || null);
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

function defaultPaceGradient() {
  return {
    slowColor: "#f44336",
    midColor: "#ffeb3b",
    fastColor: "#4caf50",
  };
}

function getColorForWeeklyKm(weekKm, minKm, maxKm, config) {
  const gradient = config?.weeklyPaceGradient || defaultPaceGradient();
  if (maxKm <= minKm) return gradient.fastColor;
  const ratio = Math.max(0, Math.min(1, (weekKm - minKm) / (maxKm - minKm)));

  if (ratio < 0.5) {
    return interpolateColor(gradient.slowColor, gradient.midColor, ratio * 2);
  }
  return interpolateColor(gradient.midColor, gradient.fastColor, (ratio - 0.5) * 2);
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
  if (!sortedWeeks.length) return [];

  // Normalize so the first week containing data is labelled "Week 1".
  const firstWeekIndex = sortedWeeks[0];
  let cumulative = 0;
  return sortedWeeks.map((weekIndex) => {
    cumulative += weekMap[weekIndex];
    return {
      weekIndex: weekIndex - firstWeekIndex,
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

  const gradient = config.weeklyPaceGradient || {
    slowColor: "#f44336",
    midColor: "#ffeb3b",
    fastColor: "#4caf50",
  };
  container.innerHTML = `
    <div class="map-legend__label">Weekly km</div>
    <div class="map-legend__bar" style="background: linear-gradient(to right, ${gradient.slowColor}, ${gradient.midColor}, ${gradient.fastColor});"></div>
    <div class="map-legend__scale">
      <span>${formatKm(minKm)} km</span>
      <span>${formatKm(maxKm)} km</span>
    </div>
  `;
}

function renderWeeklyProgress(weeklyProgress, config) {
  if (!map || !routeCoordinates.length) return;

  clearWeeklyLayers();

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
