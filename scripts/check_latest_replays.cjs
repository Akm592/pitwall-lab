// Run node --experimental-strip-types scripts/check_latest_replays.cjs [season] [--allow-missing].
const assert=require('node:assert/strict'),fs=require('node:fs');
const {decodePositions,decodeTelemetry,buildReplay,lineCourse,buildComparisonMotion,comparisonDistanceAt,buildDriverPaths,driverPointAt}=require('../lib/replay.ts');
const {decodeReplayTiming,observedRankAt}=require('../lib/replay-timing.ts');
const available=fs.readdirSync('data').filter(name=>/^\d{4}$/.test(name)&&Number(name)<=new Date().getUTCFullYear())
 .map(Number).sort((a,b)=>b-a).find(year=>JSON.parse(fs.readFileSync('data/'+year+'/calendar.json','utf8')).some(r=>fs.existsSync('data/'+year+'/'+r.slug+'.json')));
const season=Number(process.argv.slice(2).find(arg=>/^\d{4}$/.test(arg))||available);
const calendar=JSON.parse(fs.readFileSync('data/'+season+'/calendar.json','utf8'));
const recent=calendar.filter(r=>fs.existsSync('data/'+season+'/'+r.slug+'.json')).sort((a,b)=>b.round-a.round).slice(0,3);
assert(recent.length>0,'No imported races to check');
for(const entry of recent){
 const race=JSON.parse(fs.readFileSync('data/'+season+'/'+entry.slug+'.json','utf8'));
 const assetPaths=['data/tracks/'+season+'/'+entry.slug+'.json',...['.json','.timing.json','.telemetry.json'].map(ext=>'public/replay/'+season+'/'+entry.slug+ext)];
 if(!assetPaths.every(path=>fs.existsSync(path))){
  if(process.argv.includes('--allow-missing')){console.log('::warning::'+season+'/'+entry.slug+': replay incomplete; recorded race results remain publishable.');continue;}
  assert.fail('Missing latest-race replay assets: '+entry.slug);
 }
 const track=JSON.parse(fs.readFileSync('data/tracks/'+season+'/'+entry.slug+'.json','utf8'));
 const base='public/replay/'+season+'/'+entry.slug;
 const positionFile=JSON.parse(fs.readFileSync(base+'.json','utf8'));
 const timingFile=JSON.parse(fs.readFileSync(base+'.timing.json','utf8'));
 const telemetryFile=JSON.parse(fs.readFileSync(base+'.telemetry.json','utf8'));
 if(race.source==='OpenF1')assert.equal(timingFile.clockPrecision,'approximate');
 if(process.argv.includes('--allow-missing')&&[track,positionFile,timingFile,telemetryFile].some(file=>file.snapshotExportedAt&&file.snapshotExportedAt!==race.exportedAt)){
  console.log('::warning::'+season+'/'+entry.slug+': stale replay bundle retained; UI rejects mismatched replay data.');continue;
 }
 for(const file of [track,positionFile,timingFile,telemetryFile]){
  assert.equal(file.season,season);assert.equal(file.slug,race.slug);
  if(race.source==='OpenF1'){
   assert.equal(file.snapshotExportedAt,race.exportedAt,'Stale replay bundle');
   assert.equal(file.sourceSessionKey,race.openf1.sessionKey);
   assert(file.source.includes('OpenF1'),'Incorrect provenance');
  }
 }
 assert.equal(track.round,race.round);
 const ref=race.laps.find(l=>l.driver===track.reference.driver&&l.number===track.reference.lap&&!l.generated);
 assert(ref,'Reference lap missing');
 track.reference.sectorTimesSeconds.forEach((time,index)=>assert(Math.abs(time-ref['sector'+(index+1)])<.02));
 assert.equal(positionFile.reference.driver,track.reference.driver);assert.equal(positionFile.reference.lap,track.reference.lap);
 const positions=decodePositions(positionFile),timing=decodeReplayTiming(timingFile,season,race.slug),telemetry=decodeTelemetry(telemetryFile);
 assert(Object.values(telemetry.cars).some(car=>car.speed.some(speed=>speed>=0)));
 const replay=buildReplay(race,timing),course=lineCourse(positions.line,positions.metresPerUnit,positions.sectorEnds);
 const paths=buildDriverPaths(course,positions.surface,positions.metresPerUnit,race.drivers.map(d=>d.code));
 const motion=buildComparisonMotion(replay,course,telemetry,timing);
 assert(replay.end>replay.start&&course.length>1500&&course.length<10000);
 let anchors=0;
 for(const timeline of replay.timelines){
  if(!timeline.laps.length)continue;
  assert(telemetry.cars[timeline.driver.code],'Missing measured telemetry for active driver');
  assert(telemetry.cars[timeline.driver.code].speed.some(speed=>speed>=0),'No measured speed samples');
  const recorded=timing.cars[timeline.driver.code];
  assert(recorded.laps.length>=race.laps.filter(l=>l.driver===timeline.driver.code&&l.timeSeconds!=null).length*.95,'Incomplete lap coverage');
  let previous=-Infinity;
  for(let t=replay.start;t<=replay.end;t+=2){
   const distance=comparisonDistanceAt(motion,timeline.driver.code,t);
   if(!distance)continue;
   assert(Number.isFinite(distance.metres)&&distance.metres>=previous-1e-6,'Non-monotone motion');
   previous=distance.metres;
   const point=driverPointAt(paths,timeline.driver.code,distance.metres);
   assert(Number.isFinite(point.x)&&Number.isFinite(point.y),'Invalid rendered driver path');
  }
  for(const lap of recorded.laps){
   for(const time of [lap.start,lap.sector1,lap.sector2,lap.end]){
    if(time==null)continue;
    const distance=comparisonDistanceAt(motion,timeline.driver.code,time);
    assert(distance&&Number.isFinite(distance.metres),'Missing timing anchor');anchors++;
   }
  }
  if(recorded.ranks.length){assert.equal(observedRankAt(timing,timeline.driver.code,recorded.ranks[0].t-.001),null);}
 }
 console.log(season+'/'+race.slug+': replay bundle valid; '+Object.keys(telemetry.cars).length+' telemetry drivers; '+anchors+' timing anchors; finite monotone motion and usable paths.');
}
