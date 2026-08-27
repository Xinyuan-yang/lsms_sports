---
layout: default
title: Switzerland Hiking Tracker
permalink: /switzerland-hiking-tracker/
---

<div class="journey-card">
  <div class="journey-card__route">
    <span class="journey-card__origin" id="journey-origin">—</span>
    <span class="journey-card__arrow" aria-hidden="true">→</span>
    <span class="journey-card__destination" id="journey-destination">—</span>
  </div>
  <div class="journey-card__progress">
    <span id="journey-progress">—</span>
    <span class="journey-card__percent" id="journey-percent">—</span>
  </div>
</div>

<div class="weekly-progress" aria-label="Weekly progress bar">
  <div id="weekly-progress-bar" class="weekly-progress__bar"></div>
  <div class="weekly-progress__labels">
    <span>0 km</span>
    <span id="weekly-progress-total">—</span>
  </div>
</div>

<figure class="hiking-tracker-map">
  <div id="hiking-map" style="height: 500px; border: 1px solid #d7e3db; border-radius: 8px;"></div>
  <div id="map-legend" class="map-legend"></div>
</figure>

<section id="current-location" class="current-location" aria-labelledby="current-location-heading">
  <h2 id="current-location-heading">Where are we currently?</h2>
  <p id="current-location-name" class="current-location__name">Loading location…</p>
  <div id="location-gallery" class="location-gallery">
    <p class="empty-state">Loading landscape photos…</p>
  </div>
</section>

<p><a href="{{ '/' | relative_url }}">Return to the sports tracker</a></p>

<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<link href="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css" rel="stylesheet" />
<script src="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js"></script>
<script src="https://unpkg.com/@maplibre/maplibre-gl-leaflet/leaflet-maplibre-gl.js"></script>
<script src="{{ '/script.js' | relative_url }}?v={{ site.time | date: '%s' }}"></script>
<script>
  window.serviceWorkerUrl = "{{ '/sw.js' | relative_url }}";
  window.routeUrl = "{{ '/assets/data/route.json' | relative_url }}?v={{ site.time | date: '%s' }}";
</script>
<script src="{{ '/map.js' | relative_url }}?v={{ site.time | date: '%s' }}"></script>
