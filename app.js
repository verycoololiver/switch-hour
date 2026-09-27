/* Switch Hour — a forecast-based scheduler for flexible electricity use. */
(() => {
  'use strict';
  const API_URL = 'https://7azirbqnebwpbfdxgoc7eenwmy0yarji.lambda-url.us-east-1.on.aws/';
  const STEP = 5 * 60 * 1000;
  const REGIONS = {
    PGE: { zone: 'America/Los_Angeles', clock: 'California local time (Pacific)', step: STEP },
    SCE: { zone: 'America/Los_Angeles', clock: 'California local time (Pacific)', step: STEP },
    SDGE: { zone: 'America/Los_Angeles', clock: 'California local time (Pacific)', step: STEP },
    SMUD: { zone: 'America/Los_Angeles', clock: 'California local time (Pacific)', step: STEP },
    GB: { zone: 'Europe/London', clock: 'London local time', step: 1800000, name: 'Great Britain' },
    LONDON: { zone: 'Europe/London', clock: 'London local time', step: 1800000, name: 'London' },
  };
  const currentRegion = () => REGIONS[document.getElementById('region').value];
  const nextStart = () => Math.ceil(Date.now() / currentRegion().step) * currentRegion().step;
  const PRESETS = {
    dishwasher: { label: 'Dishwasher', duration: 2, energy: 1.5 },
    ev: { label: 'EV charging', duration: 3, energy: 21 },
    laundry: { label: 'Laundry', duration: 2, energy: 2.5 },
    washer: { label: 'Washing machine', duration: 1, energy: 0.5 },
    dryer: { label: 'Clothes dryer', duration: 1, energy: 3 },
    ebike: { label: 'E-bike charging', duration: 3, energy: 0.5 },
    pool: { label: 'Pool pump', duration: 4, energy: 4 },
    custom: { label: 'Custom task', duration: 1, energy: 1 },
  };
  const state = { mode: null, data: null, result: null, baseTime: null, preset: 'ev', request: 0, loading: false, loadedAt: 0, planStart: Date.now() };
  const $ = (id) => document.getElementById(id);
  const fmt = (time, options) => new Intl.DateTimeFormat(currentRegion().step === STEP ? 'en-US' : 'en-GB', { timeZone: currentRegion().zone, hour12: true, ...options }).format(new Date(time));
  const shortTime = (time) => fmt(time, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const chartTime = (time) => fmt(time, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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
    if (points.length < 12) throw new Error('Forecast is too short');
    return { ...data, points };
  }

  function clearPlan() {
    state.result = null;
    $('answer').hidden = true;
    $('chart-bars').replaceChildren();
    $('chart-bars').setAttribute('aria-label', 'Grid emissions chart');
    $('chart-labels').replaceChildren();
    $('chart-max').textContent = '—';
    $('chart-mid').textContent = '—';
  }

  async function loadLive() {
    const request = ++state.request;
    const region = $('region').value;
    state.loading = true;
    state.loadedAt = Date.now();
    state.data = null;
    clearPlan();
    $('data-status').textContent = 'Connecting…';
    $('data-caption').textContent = 'Fetching the current forecast for your region.';
    document.querySelector('.control-foot').textContent = currentRegion().clock + '. Deadline counts from when you opened this plan; forecasts refresh automatically.';
    message('Checking the latest grid forecast…');
    try {
      let payload;
      if (region === 'GB' || region === 'LONDON') {
        const from = new Date().toISOString().slice(0,16) + 'Z';
        const url = region === 'GB'
          ? 'https://api.carbonintensity.org.uk/intensity/' + from + '/fw48h'
          : 'https://api.carbonintensity.org.uk/regional/intensity/' + from + '/fw48h/regionid/13';
        const response = await getJSON(url);
        const rows = region === 'GB' ? response.data : response.data?.data;
        if (!Array.isArray(rows)) throw new Error('Missing forecast');
        payload = { region, regionName: currentRegion().name, fetchedAt: new Date().toISOString(), stepMs: 1800000,
          source: 'NESO Carbon Intensity API', average: true,
          points: rows.filter(row => Number.isFinite(row.intensity?.forecast) && Date.parse(row.to)-Date.parse(row.from) === 1800000)
            .map(row => [Date.parse(row.from), row.intensity.forecast]) };
      } else {
        payload = await getJSON(API_URL + '?region=' + encodeURIComponent(region));
      }
      const data = normalize(payload);
      if (request !== state.request) return;
      const fetchedAt = Date.parse(data.fetchedAt);
      if (!Number.isFinite(fetchedAt) || Date.now() - fetchedAt > 15 * 60000 || data.region !== region) throw new Error('Forecast is out of date');
      state.baseTime = nextStart();
      if (data.points.at(-1)[0] < state.baseTime + 6 * 3600000) throw new Error('Forecast expired');
      state.mode = 'live';
      state.data = data;
      state.loadedAt = Date.now();
      state.loading = false;
      $('data-status').textContent = 'Current forecast · ' + data.regionName;
      calculate();
    } catch (error) {
      if (request !== state.request) return;
      state.data = null;
      state.loading = false;
      clearPlan();
      $('data-status').textContent = 'Forecast unavailable';
      $('data-caption').textContent = 'We could not get a current forecast for this region.';
      $('chart-description').textContent = 'A current forecast is needed to recommend a start time.';
      message('The forecast could not be loaded. Try Refresh forecast or another region. We’ll retry automatically.', true);
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
    if (!state.data) return false;
    if (state.mode === 'live') {
      if (Date.now() - Date.parse(state.data.fetchedAt) > 15 * 60 * 1000) { loadLive(); return false; }
      state.baseTime = nextStart();
    }
    try {
      const task = { ...readTask(), deadlineAt: state.planStart + Number($('deadline').value) * 3600000 };
      $('task-summary').textContent = `${task.duration} hr · ${task.energy} kWh`;
      const result = window.SwitchHourScheduler.findWindow(state.data, state.baseTime, task);
      state.result = result;
      renderResult(result);
      renderChart(result);
      $('answer').hidden = false;
      $('data-caption').textContent = state.data.regionName + ' · checked ' + shortTime(Date.parse(state.data.fetchedAt)) + ' · refreshes every 5 min';
      message('Planning from ' + shortTime(state.baseTime) + '. ' + currentRegion().clock + '; only upcoming intervals are shown.');
      return true;
    } catch (error) {
      clearPlan();
      message(error.message || 'Could not calculate a window.', true);
      return false;
    }
  }

  function renderResult(result) {
    const { baseline, best, saved, task } = result;
    const percent = baseline.grams > 0 ? Math.round(saved / baseline.grams * 100) : 0;
    const same = best.start === baseline.start;
    document.querySelector('.answer-grid').classList.toggle('same', same);
    document.querySelector('.saving').hidden = same;
    $('best-headline').textContent = `${shortTime(best.start)}.`;
    $('answer-explanation').textContent = same
      ? `The first available start is already the lowest-emission option before your deadline. You can begin then.`
      : `Your ${task.duration}-hour task still finishes on time. Waiting until this window is forecast to produce less CO₂ than starting soon.`;
    document.querySelector('.saving small').textContent = state.data.average ? 'LOWER ESTIMATED TASK EMISSIONS' : 'ESTIMATED CO₂ REDUCTION';
    $('saved-number').textContent = carbon(saved) + ' less than starting soon';
    $('saved-percent').textContent = `${percent}%`;
    $('baseline-time').textContent = shortTime(baseline.start);
    $('baseline-range').textContent = `Finish ${shortTime(baseline.end)}`;
    $('baseline-carbon').textContent = carbon(baseline.grams);
    $('best-time').textContent = shortTime(best.start);
    $('best-range').textContent = `Finish ${shortTime(best.end)}`;
    $('best-carbon').textContent = carbon(best.grams);
    $('calendar').textContent = 'Add to calendar';
    $('answer-caveat').textContent = state.data.average
      ? 'Uses the NESO average grid intensity forecast at 30-minute resolution. This estimates emissions associated with the task, not the marginal emissions avoided by shifting it. Assumes even power use.'
      : 'Estimate: task kWh × average forecast marginal CO₂/kWh over the run. Assumes even power use. Actual emissions may differ. Check that the timing suits your appliance and routine.';
  }

  function renderChart(result) {
    $('chart-description').textContent = 'Lower is better. Each bar shows forecast CO₂ per kWh, averaged over an hour. Tap a bar to see its value.';
    const start = state.baseTime;
    const end = result.task.deadlineAt;
    const groups = new Map();
    for (const [time, value] of state.data.points) {
      if (time < start || time >= end) continue;
      const hour = start + Math.floor((time - start) / 3600000) * 3600000;
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
      if (hour.time < result.best.end && hour.time + 3600000 > result.best.start) bar.classList.add('best');
      bar.style.height = `${Math.max(3, hour.value / max * 100)}%`;
      const recommended = hour.time < result.best.end && hour.time + 3600000 > result.best.start;
      const detail = `${shortTime(hour.time)}: ${Math.round(hour.value)} g CO₂ per kWh${recommended ? ' · overlaps recommended run' : ''}`;
      bar.dataset.start = hour.time;
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
    $('more-activities').value = ['washer','dryer','ebike','pool','custom'].includes(name) ? name : '';
    if (name === 'custom') document.querySelector('.task-details').open = true;
    $('duration').value = preset.duration;
    $('energy').value = preset.energy;
    document.querySelectorAll('[data-preset]').forEach((input) => { input.checked = input.dataset.preset === name; input.parentElement.classList.toggle('active', input.checked); });
    calculate();
  }

  function calendar() {
    if (!calculate() || !state.result) return;
    const { best, task } = state.result;
    const utc = (time) => new Date(time).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const safe = (value) => value.replace(/[\\,;]/g, '\\$&').replace(/\n/g, '\\n');
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Switch Hour//EN', 'BEGIN:VEVENT',
      `UID:switch-hour-${best.start}@obstudio.org`, `DTSTAMP:${utc(Date.now())}`,
      `DTSTART:${utc(best.start)}`, `DTEND:${utc(best.end)}`,
      `SUMMARY:${safe('Switch Hour: ' + task.label)}`,
      `DESCRIPTION:${safe('Suggested using ' + state.data.source + '. Estimated difference versus starting soon: ' + carbon(state.result.saved) + ' CO2. Forecast only; actual outcome may differ. https://obstudio.org/tools/switch-hour/')}`,
      'END:VEVENT', 'END:VCALENDAR', ''
    ];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'switch-hour.ics'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function copyResult() {
    if (!calculate() || !state.result) return;
    const { baseline, best, saved } = state.result;
    const text = `Switch Hour (current ${state.data.regionName} forecast): Start ${shortTime(best.start)} instead of ${shortTime(baseline.start)}. Estimated difference: ${carbon(saved)} CO₂. Forecast only. Source: ${state.data.source}. https://obstudio.org/tools/switch-hour/`;
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
    state.preset = 'custom';
    $('more-activities').value = 'custom';
    document.querySelectorAll('[data-preset]').forEach((input) => { input.checked = false; input.parentElement.classList.remove('active'); });
    calculate();
  });
  $('deadline').addEventListener('change', () => { state.planStart = Date.now(); calculate(); });
  $('region').addEventListener('change', loadLive);
  $('calculate').addEventListener('click', () => { calculate(); if (state.result) $('answer').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  $('refresh-live').addEventListener('click', loadLive);
  $('more-activities').addEventListener('change', () => setPreset($('more-activities').value));
  $('calendar').addEventListener('click', calendar);
  $('copy').addEventListener('click', copyResult);
  function tick() {
    if (document.hidden || state.loading) return;
    if (Date.now() - state.loadedAt >= 5 * 60000) { loadLive(); return; }
    if (nextStart() !== state.baseTime) calculate();
  }
  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('focus', tick);
  loadLive();
})();
