const test = require('node:test');
const assert = require('node:assert/strict');
const { findWindow } = require('../scheduler.js');
const sample = require('../sample.json');
const step = 300000;
const origin = Date.parse('2026-09-28T06:00:00Z');
const series = (values) => ({ points: values.map((v, i) => [origin + i * step, v]) });
const task = { duration: 1, energy: 2, deadline: 3 };

test('integrates the entire run and finishes exactly at the deadline', () => {
  const data = series([...Array(24).fill(500), ...Array(12).fill(100)]);
  const result = findWindow(data, origin, task);
  assert.equal(result.baseline.grams, 1000);
  assert.equal(result.best.grams, 200);
  assert.equal(result.best.end, origin + 3 * 3600000);
  assert.equal(result.saved, 800);
});

test('does not recommend a low-emission start that would overrun the deadline', () => {
  const data = series([...Array(18).fill(400), ...Array(18).fill(0)]);
  const result = findWindow(data, origin, { ...task, deadline: 2 });
  assert.equal(result.best.start, origin + 3600000);
  assert.equal(result.best.grams, 400);
});

test('a missing interval invalidates any window crossing it', () => {
  const data = series([...Array(12).fill(500), ...Array(12).fill(50), ...Array(12).fill(200)]);
  data.points.splice(18, 1);
  const result = findWindow(data, origin, task);
  assert.ok(result.best.start > origin + 18 * step);
  assert.ok(result.best.end <= origin + 3 * 3600000);
});

test('a flat signal keeps the earliest start and reports zero savings', () => {
  const result = findWindow(series(Array(36).fill(300)), origin, task);
  assert.equal(result.best.start, origin);
  assert.equal(result.saved, 0);
});

test('crossing midnight uses elapsed UTC time without dropping a slot', () => {
  const result = findWindow(series(Array(36).fill(100)), origin, { ...task, duration: 2 });
  assert.equal(result.best.end - result.best.start, 7200000);
  assert.equal(result.best.grams, 200);
});

test('real snapshot stays inside the deadline and provides reproducible demo results', () => {
  const result = findWindow(sample, sample.demoStart, { duration: 3, energy: 21, deadline: 24 });
  assert.ok(result.best.end <= sample.demoStart + 86400000);
  assert.ok(result.saved > 1000 && result.saved < 1100);
  assert.equal(Math.round(result.saved / result.baseline.grams * 100), 16);
});
