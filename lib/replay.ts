import type {Race,Driver,Lap,TrackLayout} from './data';
// Replay positions are estimates: each car is placed along the reference-lap outline from its recorded lap and sector times.
export type StatusKind='green'|'yellow'|'sc'|'vsc'|'red';
export type ReplayLap={lap:Lap;t0:number;t1:number;bounds:[number,number]|null};
// marks[c] is when the car crossed timing point c: 3 per lap (two sector boundaries and the line), counted from the start.
export type Timeline={driver:Driver;laps:ReplayLap[];marks:number[]};
export type Standing={timeline:Timeline;mark:number;time:number;running:boolean;gap:number|null;interval:number|null;lapsDown:number};
export type Overtake={t:number;from:number;passer:string;passed:string;lap:number;sector:number;position:number};
export type TelemetryFile={season:number;slug:string;t0:number;step:number;count:number;cars:Record<string,{i:number;speed:number[];throttle:number[];brake:number[];gear:number[];drs:number[]}[]>};
export type Telemetry={t0:number;step:number;count:number;cars:Record<string,{speed:Int16Array;throttle:Uint8Array;brake:Uint8Array;gear:Uint8Array;drs:Uint8Array}>};
export type Replay={start:number;end:number;timelines:Timeline[];status:{t:number;kind:StatusKind}[]};
export type CarState={x:number;y:number;lap:Lap|null;quality:'sectors'|'lap'|'grid'|'missing'|'finished'|'out'};
// Replay data from scripts/export_positions.py: one racing line for the race and, per car, distance travelled along it on a shared clock.
type Packed={x:number[];y:number[]};
export type PositionFile={schemaVersion:number;season:number;slug:string;reference:{driver:string;lap:number};t0:number;step:number;count:number;units:number;metresPerUnit:number;length:number;sectorEnds:number[];line:Packed;cars:Record<string,{i:number;d:number[];off:number[];estimated?:number[]}[]>;surface?:{source:string;name:string;inside:number;left:Packed;right:Packed}};
export type Positions={t0:number;step:number;count:number;metresPerUnit:number;line:[number,number][];sectorEnds:number[];cars:Record<string,{d:Float64Array;off:Uint8Array;estimated:Uint8Array}>;surface:{source:string;name:string;left:[number,number][];right:[number,number][]}|null};
// The reference lap as a measured loop: metres along the lap for each outline point, sector ends and corner zones.
export type Course={points:[number,number][];along:number[];length:number;sectorEnds:number[];corners:{from:number;to:number;right:boolean}[]};
const statuses:Record<string,StatusKind>={AllClear:'green',Yellow:'yellow',SCDeployed:'sc',VSCDeployed:'vsc',VSCEnding:'vsc',Red:'red'};
const classified=/^(Finished|Lapped|\+\d+ Laps?)$/;
export function buildReplay(race:Race):Replay{
 const firstStarts=race.laps.filter(l=>l.number===1&&!l.generated&&l.timeSeconds!=null&&l.sessionTimeSeconds!=null).map(l=>(l.sessionTimeSeconds as number)-(l.timeSeconds as number));
 const lightsOut=firstStarts.length?Math.min(...firstStarts):null;
 const timelines=race.drivers.map(driver=>{
  const rows=race.laps.filter(l=>l.driver===driver.code&&!l.generated&&l.sessionTimeSeconds!=null).sort((a,b)=>a.number-b.number),laps:ReplayLap[]=[];
  rows.forEach((lap,index)=>{
   const t1=lap.sessionTimeSeconds as number,previous=rows[index-1];
   const t0=previous&&previous.number===lap.number-1?previous.sessionTimeSeconds as number:lap.timeSeconds!=null?t1-lap.timeSeconds:lap.number===1?lightsOut:null;
   if(t0==null||t1<=t0)return;
   // One missing sector is the remainder of the lap; observed sectors are scaled to the lap's recorded span.
   const sectors=[lap.sector1,lap.sector2,lap.sector3],missing=sectors.filter(value=>value==null).length;
   const known=sectors.reduce<number>((sum,value)=>sum+(value??0),0),filled=sectors.map(value=>value??(t1-t0-known));
   const total=filled[0]+filled[1]+filled[2],scale=(t1-t0)/total;
   laps.push({lap,t0,t1,bounds:missing>1||filled.some(value=>value<=0)?null:[t0+filled[0]*scale,t0+(filled[0]+filled[1])*scale]});
  });
  const marks:number[]=[];
  laps.forEach(item=>{const base=(item.lap.number-1)*3;
   if(marks[base]==null)marks[base]=item.t0;
   if(item.bounds){marks[base+1]=item.bounds[0];marks[base+2]=item.bounds[1];}
   marks[base+3]=item.t1;});
  return {driver,laps,marks};
 });
 const all=timelines.flatMap(timeline=>timeline.laps);
 const start=lightsOut??(all.length?Math.min(...all.map(l=>l.t0)):0),end=all.length?Math.max(...all.map(l=>l.t1)):0;
 const status=race.events.filter(e=>e.category==='TrackStatus'&&e.timeSeconds!=null&&statuses[e.message]).map(e=>({t:e.timeSeconds as number,kind:statuses[e.message]})).sort((a,b)=>a.t-b.t);
 return {start,end,timelines,status};
}
export function lapAt(timeline:Timeline,t:number):ReplayLap|null{
 let low=0,high=timeline.laps.length-1;
 while(low<=high){const middle=(low+high)>>1,lap=timeline.laps[middle];
  if(t<lap.t0)high=middle-1;else if(t>lap.t1)low=middle+1;else return lap;}
 return null;
}
export function positionAt(timeline:Timeline,track:TrackLayout,t:number):CarState{
 const [x,y]=track.startFinish,laps=timeline.laps;
 if(!laps.length)return {x,y,lap:null,quality:'out'};
 if(t<laps[0].t0)return {x,y,lap:null,quality:laps[0].lap.number===1?'grid':'missing'};
 const last=laps[laps.length-1];
 if(t>last.t1)return {x,y,lap:last.lap,quality:classified.test(timeline.driver.status)?'finished':'out'};
 const current=lapAt(timeline,t);
 if(!current)return {x,y,lap:null,quality:'missing'};
 // Without sector bounds, spread the lap over the reference lap's sector proportions.
 const reference=track.reference.sectorTimesSeconds,span=(current.t1-current.t0)/(reference[0]+reference[1]+reference[2]);
 const [first,second]=current.bounds??[current.t0+reference[0]*span,current.t0+(reference[0]+reference[1])*span];
 const edges=[current.t0,first,second,current.t1],sector=t<first?0:t<second?1:2;
 const points=track.sectors[sector].points,width=edges[sector+1]-edges[sector];
 const along=(width>0?(t-edges[sector])/width:0)*(points.length-1),index=Math.min(points.length-2,Math.floor(along)),part=along-index;
 const a=points[index],b=points[index+1];
 return {x:a[0]+(b[0]-a[0])*part,y:a[1]+(b[1]-a[1])*part,lap:current.lap,quality:current.bounds?'sectors':'lap'};
}
export function statusAt(status:Replay['status'],t:number):StatusKind|null{
 let kind:StatusKind|null=null;
 for(const entry of status){if(entry.t>t)break;kind=entry.kind;}
 return kind;
}
export function leaderLap(timelines:Timeline[],t:number):number|null{
 // A car past its last recorded lap still counts, so the leader's lap holds after the winner finishes.
 const numbers=timelines.map(timeline=>{const last=timeline.laps[timeline.laps.length-1];return last&&t>last.t1?last.lap.number:lapAt(timeline,t)?.lap.number;}).filter((value):value is number=>value!=null);
 return numbers.length?Math.max(...numbers):null;
}
const unpack=(packed:Packed,units:number):[number,number][]=>{let x=0,y=0;return packed.x.map((value,index)=>{x+=value;y+=packed.y[index];return [x/units,y/units];});};
export function decodePositions(file:PositionFile):Positions{
 if(!Number.isFinite(file.t0)||!Number.isFinite(file.step)||file.step<=0||!Number.isInteger(file.count)||file.count<2||file.count>100000
   ||!Number.isFinite(file.units)||file.units<=0||!Number.isFinite(file.metresPerUnit)||file.metresPerUnit<=0
   ||file.line.x.length<3||file.line.x.length!==file.line.y.length||file.sectorEnds.length<2)throw new Error('Invalid replay position data');
 const cars:Positions['cars']={};
 for(const [code,runs] of Object.entries(file.cars)){
  const d=new Float64Array(file.count).fill(NaN),off=new Uint8Array(file.count),estimated=new Uint8Array(file.count);
  for(const run of runs){let total=0,index=run.i;
   if(!Number.isInteger(run.i)||run.i<0||!Array.isArray(run.d)||run.i+run.d.length>file.count||!run.d.every(Number.isFinite))throw new Error('Invalid replay position run');
   run.d.forEach((value,item)=>{total+=value;d[run.i+item]=total/10;});
   for(let pair=0;pair<run.off.length;pair+=2){off.fill(run.off[pair],index,index+run.off[pair+1]);index+=run.off[pair+1];}
   index=run.i;
   for(let pair=0;pair<(run.estimated?.length??0);pair+=2){const values=run.estimated!;estimated.fill(values[pair],index,index+values[pair+1]);index+=values[pair+1];}}
  cars[code]={d,off,estimated};
 }
 return {t0:file.t0,step:file.step,count:file.count,metresPerUnit:file.metresPerUnit,line:unpack(file.line,file.units),sectorEnds:file.sectorEnds,cars,
  surface:file.surface?{source:file.surface.source,name:file.surface.name,left:unpack(file.surface.left,file.units),right:unpack(file.surface.right,file.units)}:null};
}
// Metres travelled along the racing line at a moment. Null where either neighbouring sample is missing: gaps are never bridged.
export function distanceAt(positions:Positions,code:string,t:number):{metres:number;off:boolean;estimated:boolean}|null{
 const car=positions.cars[code],sample=(t-positions.t0)/positions.step;
 const at=Math.abs(sample-Math.round(sample))<1e-8?Math.round(sample):sample,index=Math.floor(at);
 if(!car||!Number.isFinite(at)||index<0||index>=positions.count)return null;
 const part=at-index,now=car.d[index],next=car.d[index+1],off=car.off[part<.5?index:index+1]===1;
 if(!Number.isFinite(now))return null;
 if(part<1e-8)return {metres:now,off:car.off[index]===1,estimated:car.estimated[index]===1};
 if(!Number.isFinite(next))return null;
 const estimated=car.estimated[index]===1||car.estimated[index+1]===1;
 const before=index>0?car.d[index-1]:NaN,after=index+2<positions.count?car.d[index+2]:NaN,delta=next-now;
 // Monotone cubic Hermite: unlike clamped Catmull-Rom, it cannot overshoot, reverse or create an artificial stop.
 const slope=(a:number,b:number)=>a>0&&b>0?2*a*b/(a+b):0;
 const m0=Number.isFinite(before)?slope(now-before,delta):delta,m1=Number.isFinite(after)?slope(delta,after-next):delta;
 const p2=part*part,p3=p2*part;
 const metres=(2*p3-3*p2+1)*now+(p3-2*p2+part)*m0+(-2*p3+3*p2)*next+(p3-p2)*m1;
 return {metres,off,estimated};
}
// Running order from the last timing point each car has crossed; gaps are measured at that point, as a timing screen does.
export function standingsAt(timelines:Timeline[],t:number):Standing[]{
 const rows=timelines.filter(timeline=>timeline.laps.length).map(timeline=>{
  const laps=timeline.laps,last=laps[laps.length-1],current=lapAt(timeline,t);
  let mark=(laps[0].lap.number-1)*3;
  if(current){mark=(current.lap.number-1)*3;for(const next of [mark+1,mark+2])if(timeline.marks[next]!=null&&timeline.marks[next]<=t)mark=next;}
  else for(const lap of laps)if(lap.t1<=t)mark=lap.lap.number*3;
  return {timeline,mark,time:timeline.marks[mark]??t,running:t<=last.t1,gap:null as number|null,interval:null as number|null,lapsDown:0};
 }).sort((a,b)=>b.mark-a.mark||(a.mark===0&&b.mark===0?(a.timeline.driver.grid||99)-(b.timeline.driver.grid||99):a.time-b.time));
 rows.forEach((row,index)=>{
  if(!index||row.mark===0)return;
  const leader=rows[0],ahead=rows[index-1],atLeader=leader.timeline.marks[row.mark],atAhead=ahead.timeline.marks[row.mark];
  row.lapsDown=Math.floor((leader.mark-row.mark)/3);
  row.gap=atLeader!=null?row.time-atLeader:null;
  row.interval=atAhead!=null?row.time-atAhead:null;
 });
 return rows;
}
// A position change between two consecutive timing points with both cars on the same lap count, so lapping does not count.
// Laps with a pit entry or exit are skipped, so places gained through pit stops are left out, as are laps that ran
// under a safety car, virtual safety car or red flag (track status 4-7), when overtaking is not allowed.
export function findOvertakes(timelines:Timeline[]):Overtake[]{
 const found:Overtake[]=[],length=Math.max(0,...timelines.map(timeline=>timeline.marks.length));
 for(let mark=2;mark<length;mark++){
  const lap=Math.ceil(mark/3);
  const cars=timelines.map(timeline=>({timeline,now:timeline.marks[mark],before:timeline.marks[mark-1],lap:timeline.laps.find(item=>item.lap.number===lap)?.lap})).filter(car=>car.now!=null&&car.before!=null&&car.lap&&!car.lap.pitIn&&!car.lap.pitOut&&!/[4-7]/.test(car.lap.trackStatus||''));
  for(const passer of cars)for(const passed of cars)if(passer.before>passed.before&&passer.now<passed.now)
   found.push({t:passer.now,from:passer.before,passer:passer.timeline.driver.code,passed:passed.timeline.driver.code,lap,sector:(mark-1)%3+1,position:timelines.filter(timeline=>timeline.marks[mark]!=null&&timeline.marks[mark]<passer.now).length+1});
 }
 return found.sort((a,b)=>a.from-b.from||a.t-b.t);
}
export function decodeTelemetry(file:TelemetryFile):Telemetry{
 const cars:Telemetry['cars']={};
 for(const [code,runs] of Object.entries(file.cars)){
  const car={speed:new Int16Array(file.count).fill(-1),throttle:new Uint8Array(file.count),brake:new Uint8Array(file.count),gear:new Uint8Array(file.count),drs:new Uint8Array(file.count)};
  for(const run of runs){let speed=0;
   run.speed.forEach((value,index)=>{speed+=value;car.speed[run.i+index]=speed;});
   for(const key of ['throttle','brake','gear','drs'] as const){let index=run.i;const pairs=run[key];
    for(let pair=0;pair<pairs.length;pair+=2){car[key].fill(pairs[pair],index,index+pairs[pair+1]);index+=pairs[pair+1];}}
  }
  cars[code]=car;
 }
 return {t0:file.t0,step:file.step,count:file.count,cars};
}
// Nearest exported sample; null where the car has no recorded telemetry.
export function telemetryAt(telemetry:Telemetry,code:string,t:number){
 const car=telemetry.cars[code],index=Math.round((t-telemetry.t0)/telemetry.step);
 if(!car||index<0||index>=telemetry.count||car.speed[index]<0)return null;
 return {speed:car.speed[index],throttle:car.throttle[index],brake:car.brake[index]===1,gear:car.gear[index],drs:car.drs[index]===1};
}
// Corner zones are stretches where the line turns tighter than a 180 m radius, joined when under 30 m apart.
// Direction is taken over at least 8 m either side, so a finely sampled line gives the same zones as a coarse one.
export function lineCourse(source:[number,number][],metresPerUnit:number,sectorEnds:number[]):Course{
 const points=[...source],first=points[0],last=points[points.length-1];
 if(Math.hypot(first[0]-last[0],first[1]-last[1])>1e-6)points.push(first);
 const along=[0];
 for(let index=1;index<points.length;index++)along.push(along[index-1]+Math.hypot(points[index][0]-points[index-1][0],points[index][1]-points[index-1][1])*metresPerUnit);
 const length=along[along.length-1],corners:Course['corners']=[];
 let open:{from:number;to:number;right:boolean}|null=null,back=0,ahead=0;
 for(let index=1;index<points.length-1;index++){
  while(back<index-1&&along[index]-along[back+1]>=8)back++;
  ahead=Math.max(ahead,index+1);
  while(ahead<points.length-1&&along[ahead]-along[index]<8)ahead++;
  const a=points[back],b=points[index],c=points[ahead];
  let turn=Math.atan2(c[1]-b[1],c[0]-b[0])-Math.atan2(b[1]-a[1],b[0]-a[0]);
  turn=Math.atan2(Math.sin(turn),Math.cos(turn));
  const span=(along[ahead]-along[back])/2,tight=span>0&&Math.abs(turn)/span>1/180,right=turn>0;
  if(tight&&open&&open.right===right&&along[back]-open.to<30)open.to=Math.max(open.to,along[ahead]);
  else if(tight){if(open)corners.push(open);open={from:along[back],to:along[ahead],right};}
 }
 if(open)corners.push(open);
 return {points,along,length,sectorEnds:[...sectorEnds.slice(0,2),length],corners:corners.filter(corner=>corner.to-corner.from>=25)};
}
export function buildCourse(track:TrackLayout,metresPerUnit:number):Course{
 const points:[number,number][]=[],ends:number[]=[];
 track.sectors.forEach((sector,index)=>{sector.points.forEach((point,item)=>{if(index&&!item)return;points.push(point);});ends.push(points.length-1);});
 const course=lineCourse(points,metresPerUnit,[]);
 return {...course,sectorEnds:[course.along[ends[0]],course.along[ends[1]],course.length]};
}
// Point and direction of the line at a distance round the lap.
export function pointAt(course:Course,metres:number):{x:number;y:number;dx:number;dy:number}{
 const at=(metres%course.length+course.length)%course.length;
 let low=1,high=course.points.length-1;
 while(low<high){const middle=(low+high)>>1;if(course.along[middle]<at)low=middle+1;else high=middle;}
 const a=course.points[low-1],b=course.points[low],span=course.along[low]-course.along[low-1],part=span>0?(at-course.along[low-1])/span:0;
 const direction=(from:[number,number],to:[number,number]):[number,number]=>{const x=to[0]-from[0],y=to[1]-from[1],size=Math.hypot(x,y)||1;return [x/size,y/size];};
 const here=direction(a,b),before=direction(course.points[low===1?course.points.length-2:low-2],a),after=direction(b,course.points[low===course.points.length-1?1:low+1]);
 // Interpolate vertex tangents so the car's heading stays continuous as it crosses each line segment.
 const start=direction([0,0],[before[0]+here[0],before[1]+here[1]]),end=direction([0,0],[here[0]+after[0],here[1]+after[1]]);
 const heading=direction([0,0],[start[0]+(end[0]-start[0])*part,start[1]+(end[1]-start[1])*part]);
 return {x:a[0]+(b[0]-a[0])*part,y:a[1]+(b[1]-a[1])*part,dx:heading[0],dy:heading[1]};
}
// Signed shortest way round the lap from b to a, in metres.
export function lapDelta(course:Course,a:number,b:number){return ((a-b)%course.length+course.length*1.5)%course.length-course.length/2;}
// Metres along the lap of the outline point nearest to a position; `near` keeps the answer on the right stretch where the track doubles back.
export function progressOf(course:Course,point:[number,number],near?:number):number{
 let best=Infinity,result=0;
 for(let index=1;index<course.points.length;index++){
  if(near!=null&&Math.abs(lapDelta(course,course.along[index],near))>500)continue;
  const a=course.points[index-1],b=course.points[index],dx=b[0]-a[0],dy=b[1]-a[1],size=dx*dx+dy*dy;
  const part=size?Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/size)):0;
  const distance=Math.hypot(point[0]-a[0]-dx*part,point[1]-a[1]-dy*part);
  if(distance<best){best=distance;result=course.along[index-1]+(course.along[index]-course.along[index-1])*part;}
 }
 return best===Infinity&&near!=null?progressOf(course,point):result;
}
