// Run node --experimental-strip-types scripts/check_replay_timing.cjs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {decodeReplayTiming, observedRankAt} = require('../lib/replay-timing.ts');
const file = JSON.parse(fs.readFileSync('public/replay/2025/italy.timing.json', 'utf8'));
const timing = decodeReplayTiming(file, 2025, 'italy');
assert.equal(observedRankAt(timing, 'VER', 3), null);
assert.equal(observedRankAt(timing, 'VER', 3565.313), 1);
assert.equal(observedRankAt(timing, 'VER', 3565.314), 2);
assert.equal(observedRankAt(timing, 'NOR', 3565.314), 1);
assert.equal(observedRankAt(timing, 'HUL', timing.start), null);
assert.equal(timing.cars.HUL.rankSource, 'unavailable');
assert.equal(observedRankAt(timing, 'VER', Infinity), null);
assert.equal(timing.cars.VER.laps[0].sector1, null);
assert.equal(timing.cars.VER.laps[0].start, 3469.893);
assert.equal(timing.cars.VER.laps[0].end, 3557.271);
// Sector-report timestamps and lap-line timestamps differ slightly; preserve both rather than scaling them.
assert.equal(timing.cars.VER.laps[0].sector3, 3557.39);
assert.throws(() => decodeReplayTiming(file, 2024, 'italy'));
const malformed = structuredClone(file);
malformed.cars.VER.ranks[1].t = malformed.cars.VER.ranks[0].t;
assert.throws(() => decodeReplayTiming(malformed, 2025, 'italy'));
const reversed = structuredClone(file);
reversed.end = reversed.start;
assert.throws(() => decodeReplayTiming(reversed, 2025, 'italy'));
const unordered = structuredClone(file);
unordered.cars.VER.laps[0].sector2 = unordered.cars.VER.laps[0].start - 1;
assert.throws(() => decodeReplayTiming(unordered, 2025, 'italy'));
const inventedRank = structuredClone(file);
inventedRank.cars.HUL.ranks = [{t: timing.start, position: 20}];
assert.throws(() => decodeReplayTiming(inventedRank, 2025, 'italy'));
const telemetry = JSON.parse(fs.readFileSync('public/replay/2025/italy.telemetry.json', 'utf8'));
assert.equal(Object.keys(telemetry.cars).length, 20);
assert.equal(telemetry.step, .5);
assert.ok(telemetry.t0 <= timing.start && telemetry.t0 + (telemetry.count - 1) * telemetry.step >= timing.end);
for(const code of ['VER', 'NOR']){
 assert.equal(timing.cars[code].laps.length, 53);
 assert.equal(timing.cars[code].rankSource, 'FastF1 timing stream');
 assert.ok(telemetry.cars[code].length > 0);
}
console.log('Replay timing checks passed: source timestamps, held observed rank, missing ranks/checkpoints and independent telemetry.');
