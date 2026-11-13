import assert from 'node:assert/strict';
import fs from 'node:fs';
import {seasonOverview, racePreview} from '../lib/home.ts';

const calendar = JSON.parse(fs.readFileSync('data/2026/calendar.json', 'utf8'));
const races = calendar.flatMap(entry => {
  const path = `data/2026/${entry.slug}.json`;
  return fs.existsSync(path) ? [JSON.parse(fs.readFileSync(path, 'utf8'))].filter(race => race.round <= 20) : [];
});
const now = new Date('2026-11-12T12:00:00Z');
const overview = seasonOverview(calendar, [...races].reverse(), now);
assert.equal(overview.latest.slug, 'brazil');
assert.deepEqual(overview.recent.map(race => race.slug), ['brazil', 'mexico', 'united-states']);
assert.equal(overview.completed, 20);
assert.equal(overview.next.slug, 'las-vegas');
assert.equal(seasonOverview(calendar, [], now).latest, null);
assert.equal(seasonOverview(calendar, races, new Date('2026-01-01T00:00:00Z')).completed, 0);
assert.equal(seasonOverview(calendar, races, new Date('2027-01-01T00:00:00Z')).next, undefined);
assert.equal(seasonOverview(calendar, races.filter(race => race.slug !== 'brazil'), now).latest.slug, 'mexico');
assert.equal(seasonOverview(calendar, races, new Date('2026-11-22T03:59:00Z')).next.slug, 'las-vegas');
assert.equal(seasonOverview(calendar, races, new Date('2026-11-22T04:01:00Z')).next.slug, 'qatar');
const series = racePreview(overview.latest);
assert.deepEqual(series.map(driver => driver.code), ['NOR', 'VER']);
for (const driver of series) {
  assert(driver.laps.some(lap => lap.seconds !== null));
  for (const lap of driver.laps) {
    const recorded = overview.latest.laps.find(row => row.driver === driver.code && row.number === lap.number);
    assert.equal(lap.seconds, recorded.eligible ? recorded.timeSeconds : null);
  }
}
console.log('Homepage checks passed: latest/recent ordering, missing races, empty/pre-season states, UTC schedule, real eligible lap preview.');
