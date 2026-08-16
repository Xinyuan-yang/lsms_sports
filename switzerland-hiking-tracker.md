---
layout: default
title: Switzerland Hiking Tracker
permalink: /switzerland-hiking-tracker/
---

<p class="calculation-intro">We have travelled through Switzerland, Italy, Austria and now passing Slovenia!</p>

<!--
  Set data-source to the normal Google Sheets share URL and data-block to the
  distance cell (for example, Sheet1!F12 or F12). The sheet must be shared as
  "Anyone with the link can view" or published to the web.
-->
<p class="calculation-intro">
  Current Cumulated distance :
  <span
    id="current-cumulated-distance"
    data-source="https://docs.google.com/spreadsheets/d/1EN0UQ7RKJAaQbCwJ9omOJpl8YslGg1RwAGddY0xTjh0/edit?usp=sharing"
    data-block="Total!B5">—</span>km
</p>

<figure class="hiking-tracker-map">
  <img src="{{ '/Figures/Trail_LSMS[2].png' | relative_url }}" alt="LSMS Grand Hiking">
</figure>

<p><a href="{{ '/' | relative_url }}">Return to the sports tracker</a></p>

<script src="{{ '/script.js' | relative_url }}"></script>
