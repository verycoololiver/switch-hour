/* Pure scheduler shared by the browser and Node's regression tests. */
(function (root) {
  'use strict';
  const STEP = 5 * 60 * 1000;
  function findWindow(data, startAfter, task) {
    const interval = data.stepMs || STEP;
    const slots = task.duration * 3600000 / interval;
    if (!Number.isInteger(slots) || slots < 1) throw new Error('Run time must match the forecast interval.');
    const latestEnd = task.deadlineAt || startAfter + task.deadline * 3600000;
    const values = new Map(data.points);
    let baseline = null;
    let best = null;
    for (const [time] of data.points) {
      if (time < startAfter || time + slots * interval > latestEnd) continue;
      let total = 0;
      let complete = true;
      for (let i = 0; i < slots; i++) {
        const value = values.get(time + i * interval);
        if (!Number.isFinite(value)) { complete = false; break; }
        total += value;
      }
      if (!complete) continue;
      const result = { start: time, end: time + slots * interval, average: total / slots, grams: task.energy * total / slots };
      if (!baseline) baseline = result;
      if (!best || result.grams < best.grams - 0.01) best = result;
    }
    if (!baseline || !best) throw new Error('There are not enough complete forecast intervals before this deadline. Try a shorter run or a later deadline.');
    return { baseline, best, saved: Math.max(0, baseline.grams - best.grams), task };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { findWindow };
  else root.SwitchHourScheduler = { findWindow };
})(typeof window !== 'undefined' ? window : globalThis);
