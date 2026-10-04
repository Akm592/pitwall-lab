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

const { buildReplay, positionAt, statusAt, leaderLap } = require('../lib/replay.ts');
const track = {
  startFinish: [0, 0],
  reference: { sectorTimesSeconds: [10, 10, 10] },
  sectors: [
    { points: [[0, 0], [50, 0], [100, 0]] },
    { points: [[100, 0], [100, 100]] },
    { points: [[100, 100], [0, 0]] },
  ],
};
const replayLap = (driver, number, timeSeconds, sectors, sessionTimeSeconds, generated = false) => ({
  pitIn: false, pitOut: false, trackStatus: '1', driver, number, timeSeconds, sector1: sectors[0], sector2: sectors[1], sector3: sectors[2], sessionTimeSeconds, generated,
});
const replay = buildReplay({
  drivers: [{ code: 'AAA', status: 'Finished' }, { code: 'BBB', status: 'Engine' }],
  laps: [
    replayLap('AAA', 1, 40, [null, 10, 10], 140),
    replayLap('AAA', 2, 30, [10, 10, 10], 170),
    replayLap('AAA', 3, null, [null, null, null], 230),
    replayLap('BBB', 1, 40, [20, 10, 10], 140),
    replayLap('BBB', 2, 30, [10, 10, 10], 170, true),
    replayLap('BBB', 3, 30, [10, 10, 10], 200),
  ],
  events: [
    { category: 'TrackStatus', message: 'AllClear', timeSeconds: 0 },
    { category: 'TrackStatus', message: 'SCDeployed', timeSeconds: 150 },
    { category: 'Other', message: 'Red', timeSeconds: 160 },
  ],
});
const [aaa, bbb] = replay.timelines;
assert.equal(replay.start, 100);
assert.equal(replay.end, 230);
// Lap 1 has no first sector: it is the remainder of the lap, so the boundary falls at 120.
assert.deepEqual(aaa.laps[0].bounds, [120, 130]);
assert.deepEqual(positionAt(aaa, track, 120), { x: 100, y: 0, lap: aaa.laps[0].lap, quality: 'sectors' });
assert.deepEqual([positionAt(aaa, track, 110).x, positionAt(aaa, track, 110).y], [50, 0]);
assert.deepEqual([positionAt(aaa, track, 170).x, positionAt(aaa, track, 170).y], [0, 0]);
// No lap or sector times: the lap spans the previous lap's end to its own end, using reference proportions.
assert.equal(aaa.laps[2].bounds, null);
assert.equal(positionAt(aaa, track, 200).quality, 'lap');
assert.deepEqual([positionAt(aaa, track, 200).x, positionAt(aaa, track, 200).y], [100, 50]);
assert.equal(positionAt(aaa, track, 231).quality, 'finished');
// Generated rows are never replayed as observed timing.
assert.equal(bbb.laps.length, 2);
assert.equal(positionAt(bbb, track, 150).quality, 'missing');
assert.equal(positionAt(bbb, track, 185).quality, 'sectors');
assert.equal(positionAt(bbb, track, 201).quality, 'out');
// A driver with no recorded laps is out, not a timing gap.
assert.equal(positionAt({ driver: { status: 'Did not start' }, laps: [] }, track, 150).quality, 'out');
assert.equal(statusAt(replay.status, 120), 'green');
assert.equal(statusAt(replay.status, 165), 'sc');
assert.equal(statusAt(replay.status, -1), null);
assert.equal(leaderLap(replay.timelines, 150), 2);
const { decodePositions, distanceAt } = require('../lib/replay.ts');
const positions = decodePositions({ t0: 100, step: 0.5, count: 8, units: 10, metresPerUnit: 2, sectorEnds: [5, 9], line: { x: [0, 100, 0], y: [0, 0, 50] },
  cars: { AAA: [{ i: 1, d: [1000, 300, 300, 300], off: [0, 3, 1, 1] }, { i: 6, d: [5000, 100], off: [0, 2] }] } });
assert.deepEqual(positions.line, [[0, 0], [10, 0], [10, 5]]);
assert.deepEqual(Array.from(positions.cars.AAA.d.slice(1, 5)), [100, 130, 160, 190]);
// Evenly spaced samples interpolate to the same straight progress; the pit flag comes from the nearer sample.
const near = at => at && { metres: Math.round(at.metres * 1000) / 1000, off: at.off };
assert.deepEqual(near(distanceAt(positions, 'AAA', 101.25)), { metres: 145, off: false });
assert.deepEqual(near(distanceAt(positions, 'AAA', 101.9)), { metres: 184, off: true });
// Samples outside a run stay missing, and a gap between runs is not bridged.
assert.equal(distanceAt(positions, 'AAA', 100.2), null);
assert.equal(distanceAt(positions, 'AAA', 102.2), null);
assert.equal(distanceAt(positions, 'BBB', 101), null);
assert.deepEqual(near(distanceAt(positions, 'AAA', 103.25)), { metres: 505, off: false });
// A car that stops and restarts never moves backwards inside a step.
const stop = decodePositions({ t0: 0, step: 1, count: 5, units: 1, metresPerUnit: 1, sectorEnds: [1, 2], line: { x: [0, 1, -1], y: [0, 0, 1] }, cars: { AAA: [{ i: 0, d: [0, 400, 0, 0, 400], off: [0, 5] }] } });
assert.equal(distanceAt(stop, 'AAA', 1.5).metres, 40);
assert.equal(distanceAt(stop, 'AAA', 2.2).metres, 40);
// An exact recorded endpoint remains available even if the next sample is absent; no extrapolation across that gap.
assert.deepEqual(near(distanceAt(positions, 'AAA', 102)), { metres: 190, off: true });
assert.deepEqual(near(distanceAt(positions, 'AAA', 103.5)), { metres: 510, off: false });
assert.equal(distanceAt(positions, 'AAA', 103.51), null);
assert.equal(distanceAt(positions, 'AAA', NaN), null);
const changing = decodePositions({ t0: 0, step: 1, count: 5, units: 1, metresPerUnit: 1, sectorEnds: [1, 2], line: { x: [0, 1, -1], y: [0, 0, 1] },
  cars: { AAA: [{ i: 0, d: [0, 10000, 100, 100, 10000], off: [0, 5], estimated: [1, 2, 0, 3] }] } });
let previous = -Infinity;
for (let t = 0; t < 4; t += .01) {
  const at = distanceAt(changing, 'AAA', t);
  assert.ok(at.metres >= previous - 1e-8, 'Interpolation must never reverse or overshoot on changes in speed');
  previous = at.metres;
}
assert.equal(distanceAt(changing, 'AAA', 1.5).estimated, true);
assert.equal(distanceAt(changing, 'AAA', 2).estimated, false);
assert.throws(() => decodePositions({ ...changing, step: 0 }), /Invalid replay/);

const { standingsAt, findOvertakes, decodeTelemetry, telemetryAt } = require('../lib/replay.ts');
const duel = buildReplay({
  drivers: [{ code: 'AAA', status: 'Finished', grid: 2 }, { code: 'BBB', status: 'Finished', grid: 1 }, { code: 'CCC', status: 'Finished', grid: 3 }],
  laps: [
    replayLap('AAA', 1, 31, [11, 10, 10], 131), replayLap('AAA', 2, 29, [10, 9, 10], 160), replayLap('AAA', 3, 30, [10, 10, 10], 190),
    replayLap('BBB', 1, 30, [10, 10, 10], 130), replayLap('BBB', 2, 32, [10, 12, 10], 162), replayLap('BBB', 3, 30, [10, 10, 10], 192),
    replayLap('CCC', 1, 45, [15, 15, 15], 145), { ...replayLap('CCC', 2, 30, [10, 10, 10], 175), pitIn: true }, replayLap('CCC', 3, 45, [15, 15, 15], 220),
  ],
  events: [],
});
// At the start the order is the grid; afterwards it follows the last timing point crossed.
assert.deepEqual(standingsAt(duel.timelines, 100).map(row => row.timeline.driver.code), ['BBB', 'AAA', 'CCC']);
const early = standingsAt(duel.timelines, 135);
assert.deepEqual(early.map(row => row.timeline.driver.code), ['BBB', 'AAA', 'CCC']);
assert.equal(early[1].interval, 1);
assert.equal(early[2].mark, 2);
const late = standingsAt(duel.timelines, 165);
assert.deepEqual(late.map(row => [row.timeline.driver.code, row.gap]), [['AAA', null], ['BBB', 2], ['CCC', 15]]);
// AAA passes BBB in sector 2 of lap 2; CCC's pit lap never produces an overtake.
assert.deepEqual(findOvertakes(duel.timelines), [{ t: 150, from: 141, passer: 'AAA', passed: 'BBB', lap: 2, sector: 2, position: 1 }]);
// The same pass on a lap that ran under a safety car is not counted.
duel.timelines.forEach(timeline => { timeline.laps[1].lap.trackStatus = '14'; });
assert.deepEqual(findOvertakes(duel.timelines), []);
const telemetry = decodeTelemetry({ t0: 100, step: 0.5, count: 6, cars: { AAA: [{ i: 1, speed: [200, 10, -30], throttle: [100, 2, 0, 1], brake: [0, 2, 1, 1], gear: [7, 3], drs: [1, 1, 0, 2] }] } });
assert.deepEqual(telemetryAt(telemetry, 'AAA', 101.1), { speed: 210, throttle: 100, brake: false, gear: 7, drs: false });
assert.deepEqual(telemetryAt(telemetry, 'AAA', 101.5), { speed: 180, throttle: 0, brake: true, gear: 7, drs: false });
assert.equal(telemetryAt(telemetry, 'AAA', 100), null);
assert.equal(telemetryAt(telemetry, 'BBB', 101), null);
const { buildCourse, progressOf, lapDelta } = require('../lib/replay.ts');
// A 400 x 200 m rectangle driven clockwise on screen: four right-hand corners.
const side = (from, to, steps) => Array.from({ length: steps + 1 }, (_, index) => [from[0] + (to[0] - from[0]) * index / steps, from[1] + (to[1] - from[1]) * index / steps]);
const course = buildCourse({ sectors: [{ points: side([0, 0], [400, 0], 8) }, { points: [...side([400, 0], [400, 200], 4), ...side([400, 200], [0, 200], 8).slice(1)] }, { points: side([0, 200], [0, 0], 4) }] }, 1);
assert.equal(course.length, 1200);
assert.deepEqual(course.sectorEnds, [400, 1000, 1200]);
assert.equal(course.corners.length, 3);
assert.ok(course.corners.every(corner => corner.right));
assert.equal(progressOf(course, [100, 3]), 100);
assert.equal(progressOf(course, [397, 150]), 550);
assert.equal(lapDelta(course, 50, 1150), 100);
assert.equal(lapDelta(course, 1150, 50), -100);
// Two stretches are equally near this point; the hint picks the one being driven.
const long = { ...course, along: course.along.map(value => value * 3), length: 3600 };
assert.equal(progressOf(long, [100, 100], 2700), 2700);
assert.equal(progressOf(long, [100, 100], 300), 300);
const { pointAt, lineCourse } = require('../lib/replay.ts');
assert.deepEqual(pointAt(course, 100), { x: 100, y: 0, dx: 1, dy: 0 });
assert.deepEqual(pointAt(course, 500), { x: 400, y: 100, dx: 0, dy: 1 });
assert.deepEqual(pointAt(course, 1300), { x: 100, y: 0, dx: 1, dy: 0 });
assert.deepEqual(pointAt(course, -100), { x: 0, y: 100, dx: 0, dy: -1 });
const entering = pointAt(course, 399.999), leaving = pointAt(course, 400.001);
assert.ok(Math.hypot(entering.dx - leaving.dx, entering.dy - leaving.dy) < .001, 'Heading must not snap at segment boundaries');
// The same rectangle sampled every 2 m and left open gives the same lap and corner count.
const fine = lineCourse([...side([0, 0], [400, 0], 200), ...side([400, 0], [400, 200], 100).slice(1), ...side([400, 200], [0, 200], 200).slice(1), ...side([0, 200], [0, 0], 100).slice(1, -1)], 1, [400, 1000]);
assert.equal(Math.round(fine.length), 1200);
assert.deepEqual(fine.sectorEnds.map(Math.round), [400, 1000, 1200]);
assert.equal(fine.corners.length, 3);
console.log('Stats and replay checks passed.');
