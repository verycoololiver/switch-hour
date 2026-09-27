/* Pure scheduler shared by the browser and Node's regression tests. */
(function (root) {
  'use strict';
  const STEP = 5 * 60 * 1000;
  function findWindow(data, startAfter, task) {
    const slots = Math.round(task.duration * 60 / 5);
    const latestEnd = startAfter + task.deadline * 3600000;
    const values = new Map(data.points);
    let baseline = null;
    let best = null;
    for (const [time] of data.points) {
      if (time < startAfter || time + slots * STEP > latestEnd) continue;
      let total = 0;
      let complete = true;
      for (let i = 0; i < slots; i++) {
        const value = values.get(time + i * STEP);
        if (!Number.isFinite(value)) { complete = false; break; }
        total += value;
      }
      if (!complete) continue;
      const result = { start: time, end: time + slots * STEP, average: total / slots, grams: task.energy * total / slots };
      if (!baseline) baseline = result;
      if (!best || result.grams < best.grams - 0.01) best = result;
    }
    if (!baseline || !best) throw new Error('There are not enough complete forecast intervals before this deadline. Try a shorter run or a later deadline.');
    return { baseline, best, saved: Math.max(0, baseline.grams - best.grams), task };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { findWindow };
  else root.SwitchHourScheduler = { findWindow };
})(typeof window !== 'undefined' ? window : globalThis);
