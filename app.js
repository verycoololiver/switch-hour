/* Switch Hour — a five-minute-window scheduler for California marginal CO2. */
(() => {
  'use strict';
  const API_URL = '__SWITCH_HOUR_API_URL__';
  const STEP = 5 * 60 * 1000;
  const PACIFIC = 'America/Los_Angeles';
  const PRESETS = {
    dishwasher: { label: 'Dishwasher', duration: 2, energy: 1.5 },
    ev: { label: 'EV charging', duration: 3, energy: 21 },
    laundry: { label: 'Laundry', duration: 2, energy: 2.5 },
  };
  const state = { mode: null, data: null, result: null, baseTime: null, preset: 'ev', request: 0 };
  const $ = (id) => document.getElementById(id);
  const fmt = (time, options) => new Intl.DateTimeFormat('en-US', { timeZone: PACIFIC, ...options }).format(new Date(time));
  const shortTime = (time) => fmt(time, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const chartTime = (time) => fmt(time, { hour: 'numeric', hour12: true });
  const carbon = (grams) => grams < 1000 ? `${Math.round(grams)} g` : `${(grams / 1000).toFixed(2)} kg`;

  function message(text, error = false) {
    $('message').textContent = text;
    $('message').classList.toggle('error', error);
  }

  async function getJSON(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 13000);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`Data request failed (${response.status})`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  function normalize(data) {
    if (!Array.isArray(data.points)) throw new Error('No forecast points');
    const points = data.points
      .filter((row) => Array.isArray(row) && Number.isFinite(row[0]) && Number.isFinite(row[1]) && row[1] >= 0)
      .map((row) => [Number(row[0]), Number(row[1])])
      .sort((a, b) => a[0] - b[0]);
    if (points.length < 100) throw new Error('Forecast is too short');
    return { ...data, points };
  }

  async function loadLive() {
    const request = ++state.request;
    const region = $('region').value;
    state.data = null;
    state.result = null;
    $('answer').hidden = true;
    $('data-status').textContent = 'Loading forecast…';
    $('data-status').classList.remove('sample');
    message('Checking the latest California grid forecast…');
    try {
      if (API_URL.startsWith('__')) throw new Error('Live endpoint has not been deployed');
      const data = normalize(await getJSON(`${API_URL}?region=${encodeURIComponent(region)}`));
      if (request !== state.request) return;
      state.mode = 'live';
      state.data = data;
      state.baseTime = Math.ceil(Date.now() / STEP) * STEP;
      if (data.points[data.points.length - 1][0] < state.baseTime + 6 * 3600000) throw new Error('The forecast has expired');
      $('data-status').textContent = `Live · ${region}`;
      $('data-caption').textContent = `${data.regionName} · updated ${fmt(Date.parse(data.fetchedAt), { hour: 'numeric', minute: '2-digit' })} Pacific`;
      message('Live data from the California Energy Commission. Change the task or deadline to recalculate.');
      calculate();
    } catch (error) {
      if (request !== state.request) return;
      await loadSample('Live data is unavailable right now. Showing a clearly dated sample instead.');
    }
  }

  async function loadSample(notice) {
    const request = ++state.request;
    try {
      let rawData;
      try {
        rawData = await getJSON('./sample.json');
      } catch {
        rawData = await getJSON('/tools/switch-hour/sample.json');
      }
      const data = normalize(rawData);
      if (request !== state.request) return;
      state.mode = 'sample';
      state.data = data;
      state.baseTime = data.demoStart;
      $('data-status').textContent = 'Sample · Sep 27, 2026';
      $('data-status').classList.add('sample');
      $('data-caption').textContent = 'PG&E sample · Sep 27, 2026 · starting at 8:00 AM Pacific';
      $('region').value = 'PGE';
      message(notice || 'Instant demo: this is a dated forecast snapshot for exploring the scheduler, not current advice.');
      calculate();
      if (notice) message(notice, true);
    } catch (error) {
      message('The forecast and sample could not be loaded. Please try again.', true);
      $('answer').hidden = true;
      $('data-status').textContent = 'Data unavailable';
    }
  }

  function readTask() {
    const duration = Number($('duration').value);
    const energy = Number($('energy').value);
    const deadline = Number($('deadline').value);
    if (!Number.isFinite(duration) || duration < 0.5 || duration > 8 || Math.round(duration * 2) !== duration * 2) {
      throw new Error('Run time must be between 0.5 and 8 hours, in half-hour steps.');
    }
    if (!Number.isFinite(energy) || energy < 0.1 || energy > 100) {
      throw new Error('Enter an energy estimate between 0.1 and 100 kWh.');
    }
    if (deadline < duration) throw new Error('The task needs more time than the deadline allows.');
    return { duration, energy, deadline, label: PRESETS[state.preset]?.label || 'Your task' };
  }

  function calculate() {
    if (!state.data) return;
    if (state.mode === 'live') {
      if (Date.now() - Date.parse(state.data.fetchedAt) > 15 * 60 * 1000) { loadLive(); return; }
      state.baseTime = Math.ceil(Date.now() / STEP) * STEP;
    }
    try {
      const task = readTask();
      $('task-summary').textContent = `${task.duration} hr · ${task.energy} kWh`;
      const result = window.SwitchHourScheduler.findWindow(state.data, state.baseTime, task);
      state.result = result;
      renderResult(result);
      renderChart(result);
      $('answer').hidden = false;
      if (state.mode === 'sample') message('Demo forecast from Sep 27, 2026. Choose “Use the current forecast” for a plan you can use today.');
      else message(`Using the live ${state.data.regionName} forecast. This is an estimate, not a measured outcome.`);
    } catch (error) {
      state.result = null;
      $('answer').hidden = true;
      message(error.message || 'Could not calculate a window.', true);
    }
  }

  function renderResult(result) {
    const { baseline, best, saved, task } = result;
    const percent = baseline.grams > 0 ? Math.round(saved / baseline.grams * 100) : 0;
    const same = best.start === baseline.start;
    $('best-headline').textContent = same ? 'as soon as possible.' : `${shortTime(best.start)}.`;
    $('answer-explanation').textContent = same
      ? `No need to wait. Starting soon is already the lowest-emission option before your deadline.`
      : `Your ${task.duration}-hour task still finishes on time. Waiting until this window is forecast to produce less CO₂ than starting soon.`;
    $('saved-number').textContent = carbon(saved) + ' less than starting soon';
    $('saved-percent').textContent = `${percent}%`;
    $('baseline-time').textContent = shortTime(baseline.start);
    $('baseline-range').textContent = `Finish ${shortTime(baseline.end)}`;
    $('baseline-carbon').textContent = carbon(baseline.grams);
    $('best-time').textContent = shortTime(best.start);
    $('best-range').textContent = `Finish ${shortTime(best.end)}`;
    $('best-carbon').textContent = carbon(best.grams);
    $('calendar').textContent = state.mode === 'live' ? 'Add this time to calendar ↗' : 'Plan this with live data ↗';
    $('calendar').title = state.mode === 'live' ? 'Download a calendar event' : 'Calendar events require current live data';
    $('answer-caveat').textContent = state.mode === 'sample'
      ? 'This dated sample demonstrates the calculation only. Do not use these times to schedule a task today. Values are forecast marginal CO₂, not measured emissions.'
      : 'Forecast estimate = total task kWh × average marginal g CO₂/kWh across the run. Actual avoided emissions may differ. Assumes constant power and the same energy use at either time.';
  }

  function renderChart(result) {
    $('chart-description').textContent = 'Lower is better. Each bar shows forecast CO₂ per kWh, averaged over an hour. Tap a bar to see its value.';
    const start = state.baseTime;
    const end = start + result.task.deadline * 3600000;
    const groups = new Map();
    for (const [time, value] of state.data.points) {
      if (time < start || time >= end) continue;
      const hour = Math.floor(time / 3600000) * 3600000;
      const group = groups.get(hour) || { total: 0, count: 0 };
      group.total += value; group.count++;
      groups.set(hour, group);
    }
    const hours = [...groups.entries()].map(([time, group]) => ({ time, value: group.total / group.count }));
    const max = Math.max(100, Math.ceil(Math.max(...hours.map((h) => h.value)) / 100) * 100);
    $('chart-max').textContent = max;
    $('chart-mid').textContent = max / 2;
    const bars = $('chart-bars');
    bars.replaceChildren();
    for (const hour of hours) {
      const bar = document.createElement('button');
      bar.type = 'button';
      bar.className = 'bar';
      if (hour.time < result.baseline.end && hour.time + 3600000 > result.baseline.start) bar.classList.add('baseline');
      if (hour.time < result.best.end && hour.time + 3600000 > result.best.start) bar.classList.add('best');
      bar.style.height = `${Math.max(3, hour.value / max * 100)}%`;
      const detail = `${shortTime(hour.time)}: ${Math.round(hour.value)} g CO₂ per kWh`;
      bar.title = detail;
      bar.setAttribute('aria-label', detail);
      bar.addEventListener('click', () => { $('chart-description').textContent = detail; });
      bars.appendChild(bar);
    }
    $('chart-bars').setAttribute('aria-label', `${hours.length} hourly forecast bars. ${shortTime(result.best.start)} is the suggested start.`);
    const labels = $('chart-labels');
    labels.replaceChildren();
    for (const index of [0, Math.floor((hours.length - 1) / 2), hours.length - 1]) {
      const span = document.createElement('span');
      span.textContent = hours[index] ? chartTime(hours[index].time) : '—';
      labels.appendChild(span);
    }
  }

  function setPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    state.preset = name;
    $('duration').value = preset.duration;
    $('energy').value = preset.energy;
    document.querySelectorAll('[data-preset]').forEach((input) => { input.checked = input.dataset.preset === name; input.parentElement.classList.toggle('active', input.checked); });
    calculate();
  }

  function calendar() {
    if (state.mode !== 'live') { loadLive(); return; }
    if (!state.result) return;
    const { best, task } = state.result;
    const utc = (time) => new Date(time).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const safe = (value) => value.replace(/[\\,;]/g, '\\$&').replace(/\n/g, '\\n');
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Switch Hour//EN', 'BEGIN:VEVENT',
      `UID:switch-hour-${best.start}@obstudio.org`, `DTSTAMP:${utc(Date.now())}`,
      `DTSTART:${utc(best.start)}`, `DTEND:${utc(best.end)}`,
      `SUMMARY:${safe('Switch Hour: ' + task.label)}`,
      `DESCRIPTION:${safe('Suggested using California Energy Commission MIDAS forecast. Estimated difference versus starting soon: ' + carbon(state.result.saved) + ' CO2. Forecast only; actual outcome may differ. https://obstudio.org/tools/switch-hour/')}`,
      'END:VEVENT', 'END:VCALENDAR', ''
    ];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'switch-hour.ics'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyResult() {
    if (!state.result) return;
    const { baseline, best, saved } = state.result;
    const text = `Switch Hour (${state.mode === 'live' ? 'live California forecast' : 'dated sample'}): Start ${shortTime(best.start)} instead of ${shortTime(baseline.start)}. Estimated difference: ${carbon(saved)} CO₂. Forecast only. Source: California Energy Commission MIDAS. https://obstudio.org/tools/switch-hour/`;
    try {
      await navigator.clipboard.writeText(text);
      $('copy').textContent = 'Copied ✓';
      setTimeout(() => { $('copy').textContent = 'Copy result'; }, 2500);
    } catch {
      message('Copying was blocked by your browser. You can still read the result above.', true);
    }
  }

  document.querySelectorAll('[data-preset]').forEach((input) => input.addEventListener('change', () => setPreset(input.dataset.preset)));
  for (const id of ['duration', 'energy']) $(id).addEventListener('input', () => {
    state.preset = null;
    document.querySelectorAll('[data-preset]').forEach((input) => { input.checked = false; input.parentElement.classList.remove('active'); });
    calculate();
  });
  $('deadline').addEventListener('change', calculate);
  $('region').addEventListener('change', loadLive);
  $('calculate').addEventListener('click', () => { calculate(); if (state.result) $('answer').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  $('refresh-live').addEventListener('click', loadLive);
  $('try-demo').addEventListener('click', async () => { await loadSample(); $('planner').scrollIntoView({ behavior: 'smooth' }); });
  document.querySelector('a[href="#planner"].button-ghost').addEventListener('click', loadLive);
  $('calendar').addEventListener('click', calendar);
  $('copy').addEventListener('click', copyResult);
  loadLive();
})();
