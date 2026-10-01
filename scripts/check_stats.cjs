const assert = require('node:assert/strict');
// Run with: node --experimental-strip-types scripts/check_stats.cjs
const { median, time, summarize } = require('../lib/stats.ts');

assert.equal(median([3, 1, 2]), 2);
assert.equal(median([4, 1, 3, 2]), 2.5);
assert.equal(median([]), null);
assert.equal(time(null), '—');
assert.equal(time(undefined), '—');
assert.equal(time(NaN), '—');
assert.equal(time(119.9996), '2:00.000');

const summary = summarize([
  { number: 1, eligible: false, timeSeconds: 70, sector1: 20, sector2: 20, sector3: 30 },
  { number: 2, eligible: true, timeSeconds: 90, sector1: 30, sector2: 30, sector3: 30 },
  { number: 3, eligible: true, timeSeconds: 94, sector1: 32, sector2: null, sector3: 32 },
  { number: 4, eligible: true, timeSeconds: null, sector1: null, sector2: null, sector3: null },
]);
assert.equal(summary.count, 2);
assert.equal(summary.fastest.number, 2);
assert.equal(summary.median, 92);
assert.equal(summary.deviation, 2);
assert.deepEqual(summary.sectors, [31, 30, 31]);

const empty = summarize([]);
assert.equal(empty.count, 0);
assert.equal(empty.fastest, null);
assert.equal(empty.median, null);
assert.equal(empty.deviation, null);
assert.deepEqual(empty.sectors, [null, null, null]);
console.log('Stats checks passed.');
