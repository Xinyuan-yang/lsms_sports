---
layout: default
title: Switzerland Hiking Tracker
permalink: /switzerland-hiking-tracker/
---

<p class="calculation-intro"><span id="hiking-status">—</span></p>

<p class="calculation-intro"><span id="hiking-countries">—</span></p>

<!--
  Live values are configured once in script.js. Keep this sheet shared as
  "Anyone with the link can view" and update only its values.
-->
<p class="calculation-intro">
  Current Cumulated distance :
  <span id="current-cumulated-distance">—</span>km
</p>

<p class="calculation-intro">
  Total distance leader :
  <span id="total-distance-leader">—</span>
  with
  <span id="total-distance-leader-distance">—</span> km.
</p>

<figure class="hiking-tracker-map">
  <img src="{{ '/Figures/Trail_LSMS[2].png' | relative_url }}" alt="LSMS Grand Hiking">
</figure>

<p><a href="{{ '/' | relative_url }}">Return to the sports tracker</a></p>

<script src="{{ '/script.js' | relative_url }}?v={{ site.time | date: '%s' }}"></script>
