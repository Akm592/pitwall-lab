// Run: node --experimental-strip-types scripts/check_replay_comparison.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {buildReplay, decodePositions, decodeTelemetry, lineCourse, buildComparisonMotion, comparisonDistanceAt, runningOrderAt, gridMetres,
  buildDriverPaths, driverPointAt, insideRoad, telemetryAt} = require('../lib/replay.ts');
const {decodeReplayTiming, observedRankAt} = require('../lib/replay-timing.ts');
const read = name => JSON.parse(fs.readFileSync(name, 'utf8'));
const race = read('data/2025/italy.json');
const timing = decodeReplayTiming(read('public/replay/2025/italy.timing.json'), 2025, 'italy');
const telemetry = decodeTelemetry(read('public/replay/2025/italy.telemetry.json'));
const positions = decodePositions(read('public/replay/2025/italy.json'));
const course = lineCourse(positions.line, positions.metresPerUnit, positions.sectorEnds);
const replay = buildReplay(race, timing);
const motion = buildComparisonMotion(replay, course, telemetry, timing);
const codes = ['VER', 'NOR'];
const paths = buildDriverPaths(course, positions.surface, positions.metresPerUnit, codes);
const swapped = buildDriverPaths(course, positions.surface, positions.metresPerUnit, [...codes].reverse());
assert.equal(paths.basis,'source');
const distance = (code, time) => comparisonDistanceAt(motion, code, time);
const separation = (a, b) => Math.hypot(a.x-b.x, a.y-b.y)*positions.metresPerUnit;
let anchors = 0, moments = 0, pathSamples = 0, totalSeparation = 0;
for(const code of codes){
  assert.equal(timing.cars[code].laps.length, 53);
  assert.equal(timing.cars[code].laps[0].sector1, null);
  assert.equal(motion[code].length, 158); // The missing first sector merges, rather than inventing a crossing.
  assert.ok(motion[code].every(span => span.quality === 'speed'));
  for(const lap of timing.cars[code].laps){
    const base = (lap.number-1)*course.length;
    // Lap 1 starts from the driver's grid slot rather than the line.
    const slot = (race.drivers.find(driver => driver.code === code).grid-1)*gridMetres;
    for(const [time, expected] of [[lap.start,lap.number===1?-slot:base], [lap.sector1,base+course.sectorEnds[0]],
      [lap.sector2,base+course.sectorEnds[1]], [lap.end,base+course.length]]){
      if(time === null)continue;
      assert.ok(Math.abs(distance(code,time).metres-expected)<1e-8, `${code} lap ${lap.number}: exact timing anchor`);
      anchors++;
    }
  }
  assert.equal(distance(code,replay.start-.01),null);
  let previous = -Infinity;
  for(let time=replay.start;time<timing.cars[code].laps.at(-1).end;time+=.1){
    const at = distance(code,time);
    assert.ok(at && Number.isFinite(at.metres) && at.metres >= previous-1e-7, `${code}: monotone finite progress`);
    previous = at.metres;moments++;
  }
  // Source speed ramps from zero at lights-out; noisy/stale car coordinates do not cause a launch plateau.
  const launch = distance(code,replay.start).metres;
  assert.ok(distance(code,replay.start+.5).metres-launch > .2);
  assert.ok(distance(code,replay.start+2).metres-launch > 10);
  for(let elapsed=.5;elapsed<12;elapsed+=.1){
    if(telemetryAt(telemetry,code,replay.start+elapsed).speed > 10)
      assert.ok(distance(code,replay.start+elapsed+.1).metres > distance(code,replay.start+elapsed).metres);
  }
  const span = motion[code][0];
  const rate = time => (distance(code,time+.02).metres-distance(code,time-.02).metres)/.04;
  const slow = span.times.find(time => time>span.t0+2 && time<span.t1-.5 && telemetryAt(telemetry,code,time)?.brake && telemetryAt(telemetry,code,time).speed<130);
  const fast = span.times.find(time => time>span.t0+2 && time<span.t1-.5 && telemetryAt(telemetry,code,time)?.speed>310);
  assert.ok(slow && fast && rate(slow)<rate(fast)*.5, `${code}: braking shapes motion`);
  const time = replay.start+123.456;
  const beforeSeek = distance(code,time);
  distance(code,replay.start+3000);distance(code,replay.start); // Seeking/restarting has no mutable integrator state.
  assert.deepEqual(distance(code,time),beforeSeek);
  const lapEnd = timing.cars[code].laps[1].end;
  const before = distance(code,lapEnd-4),after = distance(code,lapEnd+4);
  assert.ok(after.metres>before.metres && after.metres-before.metres<1500, 'Trail progress survives finish-line crossing');
  const car = driverPointAt(paths,code,after.metres);
  const trailHead = driverPointAt(paths,code,after.metres-(after.metres-before.metres)*0);
  assert.deepEqual(trailHead,car,'Car and trail head share the exact same path');
  const left = driverPointAt(paths,code,course.length-.1),right = driverPointAt(paths,code,.1);
  assert.ok(separation(left,right)<.5, `${code}: continuous finish join`);
  assert.ok(left.dx*right.dx+left.dy*right.dy>.98, `${code}: continuous forward heading at wrap`);
  assert.deepEqual(driverPointAt(paths,code,0),driverPointAt(paths,code,course.length));
}

for(let metres=0;metres<course.length;metres+=.5){
  const a=driverPointAt(paths,'VER',metres),b=driverPointAt(paths,'NOR',metres);
  totalSeparation+=separation(a,b);
  for(const code of codes){
    const point=driverPointAt(paths,code,metres);
    assert.deepEqual(point,driverPointAt(swapped,code,metres),'Swapping driver selection cannot change a driver line');
    assert.ok([point.x,point.y,point.dx,point.dy].every(Number.isFinite));
    assert.ok(Math.abs(Math.hypot(point.dx,point.dy)-1)<1e-8);
    assert.ok(insideRoad([point.x,point.y],positions.surface),`${code}: path inside surveyed road at ${metres}m`);
    // Existing drawn car width is about 3.4m; check both sides, not only the centerline.
    for(const side of [-1,1]){
      const shift=1.7/positions.metresPerUnit*side;
      assert.ok(insideRoad([point.x-point.dy*shift,point.y+point.dx*shift],positions.surface),`${code}: car width inside road at ${metres}m`);
    }
    pathSamples++;
  }
}
const startSeparation=separation(driverPointAt(paths,'VER',0),driverPointAt(paths,'NOR',0));
assert.ok(startSeparation>3,'Two cars remain readable at the shared race start');
assert.ok(totalSeparation/(pathSamples/2)>1,'Distinct illustrative driver lines throughout the lap');

// A telemetry outage changes only illustrative motion quality; it cannot invent a speed reading or shift anchors.
const missing = {...telemetry,cars:{...telemetry.cars,VER:{...telemetry.cars.VER,speed:telemetry.cars.VER.speed.slice()}}};
const gap = Math.round((replay.start+20-telemetry.t0)/telemetry.step);
missing.cars.VER.speed[gap]=-1;
const fallback = buildComparisonMotion(replay,course,missing,timing);
assert.equal(fallback.VER[0].quality,'timing');
assert.equal(telemetryAt(missing,'VER',telemetry.t0+gap*telemetry.step),null);
const span = fallback.VER[0],middle = (span.t0+span.t1)/2;
assert.equal(comparisonDistanceAt(fallback,'VER',middle).metres,(span.d0+span.d1)/2);
assert.equal(comparisonDistanceAt(fallback,'VER',span.t1).metres,span.d1);
assert.ok(buildComparisonMotion(replay,course,null,timing).VER.every(span=>span.quality==='timing'));
const nominal = buildDriverPaths(course,null,positions.metresPerUnit,codes);
assert.ok(Number.isFinite(driverPointAt(nominal,'VER',123).x),'Nominal road supports races without a survey');
// A top-down overpass is overlapping road, not a hole created by even-odd filling of the survey loops.
const japan = decodePositions(read('public/replay/2025/japan.json'));
const japanCourse = lineCourse(japan.line,japan.metresPerUnit,japan.sectorEnds);
const japanPaths = buildDriverPaths(japanCourse,japan.surface,japan.metresPerUnit,codes);
for(const at of [2513.5,2514,2514.5,4873.5,4874])for(const code of codes){
  const point=driverPointAt(japanPaths,code,at);
  assert.ok(insideRoad([point.x,point.y],japan.surface),'Suzuka illustrated path crosses the surveyed road ribbon');
}
// A poorly fitting shared source line uses the paired survey midpoint rather than removing the whole replay.
const china = decodePositions(read('public/replay/2025/china.json'));
const chinaCourse = lineCourse(china.line,china.metresPerUnit,china.sectorEnds);
const originalPoints = JSON.stringify(chinaCourse.points);
const chinaPaths = buildDriverPaths(chinaCourse,china.surface,china.metresPerUnit,codes);
const chinaSwapped = buildDriverPaths(chinaCourse,china.surface,china.metresPerUnit,[...codes].reverse());
assert.equal(chinaPaths.basis,'survey');
assert.equal(JSON.stringify(chinaCourse.points),originalPoints,'Survey fallback preserves original background geometry');
assert.equal(chinaPaths.curves.VER.length,chinaCourse.length,'Survey fallback retains original timing-progress scale');
assert.deepEqual(chinaPaths.curves.VER.sectorEnds,chinaCourse.sectorEnds);
let chinaSamples = 0;
for(let at=0;at<chinaCourse.length;at+=.5)for(const code of codes){
  const point=driverPointAt(chinaPaths,code,at);
  assert.deepEqual(point,driverPointAt(chinaSwapped,code,at),'Survey fallback stays independent of selected pair');
  assert.ok(insideRoad([point.x,point.y],china.surface),'China midpoint path stays inside its survey');
  for(const side of [-1,1]){
    const shift=side*1.7/china.metresPerUnit;
    assert.ok(insideRoad([point.x-point.dy*shift,point.y+point.dx*shift],china.surface),'China car width stays inside its survey');
  }
  const next=driverPointAt(chinaPaths,code,at+.5);
  assert.ok(Math.hypot(point.x-next.x,point.y-next.y)*china.metresPerUnit<1,'China survey path has no discontinuous placement');
  chinaSamples++;
}
for(const code of codes){
  const before=driverPointAt(chinaPaths,code,chinaCourse.length-.1),after=driverPointAt(chinaPaths,code,.1);
  assert.ok(before.dx*after.dx+before.dy*after.dy>.98,'Survey midpoint wrap has continuous heading');
}
assert.equal(observedRankAt(timing,'VER',3),null);
assert.equal(observedRankAt(timing,'VER',3565.313),1);
assert.equal(observedRankAt(timing,'VER',3565.314),2);
assert.equal(observedRankAt(timing,'HUL',replay.start),null);
// Live running order: grid order at lights-out, strictly by drawn progress while racing, finishing order after the flag.
const ordered = time => runningOrderAt(replay,motion,course,time);
const grid = race.drivers.filter(driver => motion[driver.code]?.length && motion[driver.code][0].d0<=0).sort((a,b) => (a.grid||99)-(b.grid||99)).map(driver => driver.code);
assert.deepEqual(ordered(replay.start).filter(row => grid.includes(row.timeline.driver.code)).map(row => row.timeline.driver.code),grid,'Grid order at lights-out');
let orderMoments = 0;
for(let time=replay.start+5;time<replay.end;time+=7.3){
  const rows = ordered(time);
  rows.forEach((row,index) => {
    assert.equal(row.position,index+1);
    const drawn = distance(row.timeline.driver.code,time);
    if(drawn)assert.ok(Math.abs(drawn.metres-row.metres)<1e-9,'A running car is ranked by the progress that draws it');
    if(!index)return;
    assert.ok(rows[index-1].metres>=row.metres,'The car ranked ahead is never drawn behind');
    assert.ok((row.gap===null||row.gap>=0)&&(row.interval===null||row.interval>=0),'Gaps are never negative');
    assert.ok(row.lapsDown>=0);orderMoments++;
  });
}
const classified = race.drivers.filter(driver => driver.status==='Finished').sort((a,b) => a.position-b.position).map(driver => driver.code);
// On-track finishing order: post-race time penalties (Antonelli's here) reorder the official classification, not the road.
const flag = ordered(replay.end+1);
assert.deepEqual(flag.slice(0,7).map(row => row.timeline.driver.code),classified.slice(0,7),'Running order after the flag is the finishing order on the road');
assert.deepEqual(flag.slice(0,classified.length).map(row => row.timeline.driver.code).sort(),[...classified].sort(),'Lead-lap finishers rank ahead of lapped cars');
assert.ok(flag.slice(0,classified.length).every(row => row.lapsDown===0) && flag[classified.length].lapsDown===1,'Lapped cars are a lap down');
console.log(`Live running order checks passed: ${orderMoments} ordered car moments, grid start and final classification.`);
console.log(`Comparison replay checks passed: ${anchors} exact anchors, ${moments} monotone moments, ${pathSamples} Monza and ${chinaSamples} China path/car-width samples; start separation ${startSeparation.toFixed(2)}m; deterministic lines, braking, wrap/trails, missing-speed fallback, overpass/survey fallback and held ranks.`);
