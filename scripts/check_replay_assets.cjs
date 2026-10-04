// Run with: node --experimental-strip-types scripts/check_replay_assets.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildReplay, decodePositions, distanceAt, decodeTelemetry, telemetryAt } = require('../lib/replay.ts');
const root = path.join(__dirname, '..');
let checked = 0;
const unsupported = [];
for (const season of fs.readdirSync(path.join(root, 'public/replay'))) {
  for (const name of fs.readdirSync(path.join(root, 'public/replay', season)).filter(name => name.endsWith('.json') && !name.endsWith('.telemetry.json') && !name.endsWith('.timing.json'))) {
    const asset = path.join(root, 'public/replay', season, name);
    const file = JSON.parse(fs.readFileSync(asset, 'utf8'));
    if (file.schemaVersion !== 2) { unsupported.push(`${season}/${name}`); continue; }
    const race = JSON.parse(fs.readFileSync(path.join(root, 'data', season, name), 'utf8'));
    const track = JSON.parse(fs.readFileSync(path.join(root, 'data/tracks', season, name), 'utf8'));
    assert.equal(file.season, race.season);
    assert.equal(file.slug, race.slug);
    assert.equal(file.reference.driver, track.reference.driver);
    assert.equal(file.reference.lap, track.reference.lap);
    const replay = buildReplay(race), positions = decodePositions(file);
    assert.ok(file.t0 <= replay.start && file.t0 + file.step * (file.count - 1) >= replay.end);
    const telemetryPath = asset.replace('.json', '.telemetry.json');
    const telemetry = fs.existsSync(telemetryPath) ? decodeTelemetry(JSON.parse(fs.readFileSync(telemetryPath, 'utf8'))) : null;
    for (const [code, car] of Object.entries(positions.cars)) {
      for (let index = 1; index < car.d.length; index++) {
        if (Number.isFinite(car.d[index - 1]) && Number.isFinite(car.d[index])) assert.ok(car.d[index] >= car.d[index - 1] - .11, `${asset}: ${code} reverses`);
      }
      let previous = null, frozen = 0;
      for (let seconds = 0; seconds < Math.min(60, replay.end - replay.start); seconds += .5) {
        const t = replay.start + seconds, at = distanceAt(positions, code, t), live = telemetry && telemetryAt(telemetry, code, t);
        frozen = previous && at && live && live.speed > 30 && !at.off && Math.abs(at.metres - previous.metres) < .01 ? frozen + .5 : 0;
        assert.ok(frozen < 2, `${asset}: ${code} frozen while moving at ${seconds}s`);
        previous = at;
      }
    }
    checked++;
  }
}
assert.ok(checked > 0);
console.log(`Validated ${checked} recorded replay assets: alignment, time coverage, monotone distance and launch movement.`);
if (unsupported.length) console.log(`Unsupported recorded formats (UI shows timing estimates): ${unsupported.join(', ')}`);
