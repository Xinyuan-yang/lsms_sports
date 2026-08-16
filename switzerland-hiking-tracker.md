---
layout: default
title: Switzerland Hiking Tracker
permalink: /switzerland-hiking-tracker/
---

<p class="calculation-intro">We have conquered Switzerland and are now passing Italy!</p>

<!--
  Set data-source to this worksheet's published CSV URL and data-block to the
  cell containing the distance (for example, F12). The sheet must be published
  to the web as CSV: File > Share > Publish to web.
-->
<p class="calculation-intro">
  Current Cumulated distance :
  <span
    id="current-cumulated-distance"
    data-source="https://docs.google.com/spreadsheets/d/1oo1NREvOex3cz_04_L91GINDHQdEXRCJliZZv0GR9rQ/edit?gid=0#gid=0"
    data-block="Total!C7"></span>km
</p>

<figure class="hiking-tracker-map">
  <img src="{{ '/Figures/Trail_LSMS[1].png' | relative_url }}" alt="LSMS Grand Hiking">
</figure>

<p><a href="{{ '/' | relative_url }}">Return to the sports tracker</a></p>

<script src="{{ '/script.js' | relative_url }}"></script>
