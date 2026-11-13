const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
// Run the TypeScript helper without adding a test runner or changing app imports.
const source = ts.transpileModule(fs.readFileSync('lib/seo.ts', 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS},
}).outputText;
const loaded = {exports: {}};
new Function('require', 'exports', source)(() => ({siteUrl: new URL('https://pitwall-lab.vercel.app')}), loaded.exports);
const {jsonLd, raceSummary, pageMetadata} = loaded.exports;
const unsafe = {name: '</script><script>alert(1)</script>'};
assert(!jsonLd(unsafe).includes('<'));
assert.deepEqual(JSON.parse(jsonLd(unsafe)), unsafe);
const empty = pageMetadata('Unavailable', 'No records.', '/drivers/HAM?season=1950', false);
assert.equal(empty.robots.index, false);
assert.equal(empty.openGraph.url, 'https://pitwall-lab.vercel.app/drivers/HAM?season=1950');
const race = {name: 'Argentine Grand Prix', season: 1956, circuit: 'Buenos Aires', totalLaps: 98,
  coverage: 'results', laps: [], drivers: [
    {name: 'Juan Fangio', team: 'Ferrari', position: 1},
    {name: 'Luigi Musso', team: 'Ferrari', position: 1},
    {name: 'Jean Behra', team: 'Maserati', position: 2},
  ]};
assert.match(raceSummary(race), /Juan Fangio and Luigi Musso won/);
assert.match(raceSummary(race), /Jean Behra finished second/);
assert.match(raceSummary(race), /Detailed lap timing is not available/);
assert.match(raceSummary({...race, coverage: 'timing', laps: [{}]}), /Pace is not corrected/);
assert(!raceSummary({...race, drivers: []}).includes('won'));
console.log('SEO helper checks passed: safe JSON-LD, noindex, coverage and shared-drive winners.');
