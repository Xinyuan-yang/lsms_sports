---
layout: default
title: Calculation details
permalink: /calculation-details/
---

<script>
  MathJax = {
    tex: { inlineMath: [['\\(', '\\)']], displayMath: [['\\[', '\\]']] }
  };
</script>
<script async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>

<p class="calculation-intro">MET, or <strong>Metabolic Equivalent of Task</strong>, compares the energy used during an activity with the energy used while resting. It provides a simple, consistent way to compare the intensity of different sports.</p>

## Activity reference values

<p>Use these typical MET values as a reference when estimating the work for an activity. The ranges reflect differences in pace and effort.</p>

<div class="met-table-wrapper">
  <table class="met-table">
    <caption>Typical MET values for common sports</caption>
    <thead>
      <tr><th scope="col">Sport</th><th scope="col">METs</th></tr>
    </thead>
    <tbody>
      <tr><td>Jogging <span>(~7 km/h)</span></td><td>7.5</td></tr>
      <tr><td>Running <span>(~8.5–17 km/h)</span></td><td>8.5–14.8</td></tr>
      <tr><td>Bicycling</td><td>7</td></tr>
      <tr><td>E-biking</td><td>6</td></tr>
      <tr><td>Aerobics</td><td>7.3</td></tr>
      <tr><td>Gym Exercise</td><td>5</td></tr>
      <tr><td>Basketball</td><td>8</td></tr>
      <tr><td>Cricket</td><td>4.8</td></tr>
      <tr><td>Beach Volley</td><td>8</td></tr>
      <tr><td>Football</td><td>7–9.5</td></tr>
      <tr><td>Boxing</td><td>9.3</td></tr>
      <tr><td>Climbing</td><td>8–10.5</td></tr>
      <tr><td>Hiking</td><td>5.5</td></tr>
      <tr><td>Tennis</td><td>6–8</td></tr>
      <tr><td>Table tennis</td><td>4</td></tr>
      <tr><td>Badminton</td><td>8</td></tr>
      <tr><td>Skating</td><td>7</td></tr>
      <tr><td>Skiing</td><td>7</td></tr>
      <tr><td>Karting</td><td>5.6</td></tr>
      <tr><td>Swimming</td><td>5.8–9.8</td></tr>
    </tbody>
  </table>
</div>

<div class="met-table-wrapper">
  <table class="met-table effort-met-table">
    <caption>MET values by effort for Running, Swimming, and Bicycling</caption>
    <thead>
      <tr><th scope="col">Sport</th><th scope="col">Easy</th><th scope="col">Moderate</th><th scope="col">Intense</th></tr>
    </thead>
    <tbody>
      <tr><td>Running</td><td>8.3</td><td>9.8</td><td>11.0</td></tr>
      <tr><td>Swimming</td><td>6.0</td><td>8.0</td><td>10.0</td></tr>
      <tr><td>Bicycling</td><td>5.8</td><td>7.5</td><td>10.0</td></tr>
    </tbody>
  </table>
</div>

<p class="calculation-source">For more detailed information, see <a href="https://pacompendium.com/">The Compendium of Physical Activities</a>.</p>


<p class="calculation-intro">Your accumulated MET-hours are recorded each week and displayed on <a href="/lsms_sports/">the main page</a>. They are then converted into an equivalent hiking distance, based on a hiking intensity of 5.5 METs and a speed of 4 km/h. </p>

<p class="calculation-intro">For example, JF does an hour of tennis. Based on the table, the equivalent hiking distance is:

\[
\frac{7}{5.5} \times 4 = 5.1\text{ km}
\] We will hike across the continents and hopefully, reach New Delhi!</p>


<h2 id="distance-based-activities">Distance-based activities</h2>

<p class="calculation-intro">For sports where distance is easier to measure than time — Bicycling, E-biking, Running, Jogging, and Hiking — you can enter the distance in kilometres instead of minutes. Choose a pace (slow, medium, or fast) and the tracker converts the distance back into an equivalent hiking distance.</p>

<p class="calculation-intro">The conversion first estimates the time the activity took, using the reference speed for the chosen sport and pace, then applies the same MET-based equivalence as above:
\[\text{equivalent walking km} = \text{distance km} \times \frac{\text{sport MET}}{\text{hiking MET}} \times \frac{\text{hiking speed}}{\text{sport speed}}\]</p>

<p class="calculation-intro">For example, cycling 20 km at a medium pace (assumed 20 km/h) with a cycling MET of 7.0 gives:
\[20 \times \frac{7.0}{5.5} \times \frac{4}{20} = 5.1\text{ km}\]</p>

<p class="calculation-intro">If you enter both duration and distance, distance takes precedence. The reference speeds are:</p>

<div class="met-table-wrapper">
  <table class="met-table effort-met-table">
    <caption>Reference speeds by sport and effort</caption>
    <thead>
      <tr><th scope="col">Sport</th><th scope="col">Easy</th><th scope="col">Moderate</th><th scope="col">Intense</th></tr>
    </thead>
    <tbody>
      <tr><td>Bicycling</td><td>15 km/h</td><td>20 km/h</td><td>25 km/h</td></tr>
      <tr><td>E-biking</td><td>18 km/h</td><td>22 km/h</td><td>26 km/h</td></tr>
      <tr><td>Running</td><td>8 km/h</td><td>10 km/h</td><td>12 km/h</td></tr>
      <tr><td>Jogging</td><td>6 km/h</td><td>7 km/h</td><td>8 km/h</td></tr>
      <tr><td>Hiking</td><td>3 km/h</td><td>4 km/h</td><td>5 km/h</td></tr>
    </tbody>
  </table>
</div>

<!-- <p class="calculation-intro">Alongside the collective effort to travel across the world, your cumulative distance is shown as the furthest city you would reach.</p> -->
