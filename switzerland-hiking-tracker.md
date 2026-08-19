---
layout: default
title: Switzerland Hiking Tracker
permalink: /switzerland-hiking-tracker/
---

<p class="calculation-intro"><span id="hiking-status">Loading progress…</span></p>

<p class="calculation-intro"><span id="hiking-countries">—</span></p>

<p class="calculation-intro">
  Current cumulated distance:
  <span id="current-cumulated-distance">—</span> km
</p>

<progress id="map-progress" max="100" value="0">0%</progress>

<figure class="hiking-tracker-map">
  <div id="hiking-map" style="height: 500px; border: 1px solid #d7e3db; border-radius: 8px;"></div>
  <div id="map-legend" class="map-legend"></div>
</figure>

<p><a href="{{ '/' | relative_url }}">Return to the sports tracker</a></p>

<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script src="{{ '/script.js' | relative_url }}?v={{ site.time | date: '%s' }}"></script>
<script>
  window.serviceWorkerUrl = "{{ '/sw.js' | relative_url }}";
  window.routeUrl = "{{ '/assets/data/route.json' | relative_url }}?v={{ site.time | date: '%s' }}";
</script>
<script src="{{ '/map.js' | relative_url }}?v={{ site.time | date: '%s' }}"></script>
