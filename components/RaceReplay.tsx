'use client';
import {useEffect,useId,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {CSSProperties} from 'react';
import {ArrowCounterClockwise,CaretLeft,CaretRight,Pause,Play} from '@phosphor-icons/react';
import type {Race,TrackLayout} from '@/lib/data';
import {buildReplay,positionAt,statusAt,leaderLap,decodePositions,standingsAt,decodeTelemetry,telemetryAt,buildCourse,lineCourse,progressOf,pointAt,buildComparisonMotion,comparisonDistanceAt,buildDriverPaths,driverPointAt,runningOrderAt,lapDelta} from '@/lib/replay';
import type {CarState,StatusKind,Timeline,Positions,PositionFile,Telemetry,TelemetryFile} from '@/lib/replay';
import {decodeReplayTiming} from '@/lib/replay-timing';
import type {ReplayTiming} from '@/lib/replay-timing';
import {colors} from './TrackMap';
import styles from './RaceReplay.module.css';

type Point=[number,number];
type RankObservation={t:number;code:string;from:number;position:number};
// Cars are drawn half as long again as a real one (5.6 m) so they read at this zoom; the road is 13 m wide where no survey exists.
const speeds=[1,2,5,10,30,60,120],aspect=620/960,fightSeconds=1,traceSeconds=15,topSpeed=360,floorSpeed=50,carMetres=8.4,roadMetres=13,trailSeconds=8,trailChunks=10,uiMilliseconds=125;
const badges:Record<StatusKind,{label:string;color:string}>={green:{label:'Green flag',color:'#42c77c'},yellow:{label:'Yellow flag',color:'#ffcf25'},sc:{label:'Safety car',color:'#ffb14a'},vsc:{label:'Virtual safety car',color:'#ffb14a'},red:{label:'Red flag',color:'#ff424d'}};
const clock=(value:number)=>{const s=Math.floor(value);return `${Math.floor(s/3600)}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;};
const gone=(state:CarState)=>state.quality==='out'||state.quality==='finished';
const path=(points:Point[])=>points.map(point=>`${point[0].toFixed(2)},${point[1].toFixed(2)}`).join(' ');
const describe=(observation:RankObservation)=>`${observation.code}: P${observation.from} → P${observation.position} · recorded update`;
const nearest=(points:Point[],target:Point)=>points.reduce((best,point)=>Math.hypot(point[0]-target[0],point[1]-target[1])<Math.hypot(best[0]-target[0],best[1]-target[1])?point:best,points[0]);
const show=(element:Element,visible:boolean)=>{(element as SVGElement).style.display=visible?'':'none';};

export default function RaceReplay({race,track,selected,rival,onSelect,onPair,compounds}:{race:Race;track?:TrackLayout|null;selected:string;rival:string;onSelect:(code:string)=>void;onPair:(first:string,second:string)=>void;compounds:Record<string,string>}){
 const titleId=useId();
 const [timing,setTiming]=useState<ReplayTiming|null>(null);
 const replay=useMemo(()=>buildReplay(race,timing),[race,timing]);
 const observations=useMemo(()=>timing?Object.entries(timing.cars).filter(([code])=>code===selected||code===rival).flatMap(([code,car])=>car.ranks.slice(1).map((rank,index)=>({...rank,code,from:car.ranks[index].position}))).filter(rank=>rank.t>=replay.start&&rank.t<=replay.end).sort((a,b)=>a.t-b.t):[],[timing,selected,rival,replay.start,replay.end]);
 const duration=replay.end-replay.start;
 // `elapsed` drives the panel (tower, telemetry, clock) a few times a second; `precise` is the exact replay time, advanced every
 // animation frame and drawn straight onto the map by `paint`, so playback does not re-render the panel on every frame.
 const [elapsed,setElapsed]=useState(0),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1),[view,setView]=useState('track');
 const [positions,setPositions]=useState<Positions|null>(null),[telemetry,setTelemetry]=useState<Telemetry|null>(null),[loading,setLoading]=useState(Boolean(race.positions||race.telemetry||race.replayTiming)),[watched,setWatched]=useState<RankObservation|null>(null);
 const [loadError,setLoadError]=useState('');
 const precise=useRef(0),lastFrame=useRef(0),paint=useRef<(seconds:number)=>void>(()=>{}),ranks=useRef(new Map<string,{rank:number;until:number}>());
 const svgRef=useRef<SVGSVGElement>(null),carRefs=useRef<(SVGGElement|null)[]>([]),labelRefs=useRef<(SVGTextElement|null)[]>([]),trailRefs=useRef<(SVGGElement|null)[]>([]),miniRefs=useRef<(SVGCircleElement|null)[]>([]),dotRefs=useRef(new Map<string,SVGCircleElement|null>());
 const battleRefs=useRef<(SVGCircleElement|null)[]>([]);
 // Position assets supply course and road geometry; movement comes independently from timing and speed.
 const course=useMemo(()=>!track?null:positions?lineCourse(positions.line,positions.metresPerUnit,positions.sectorEnds):buildCourse(track,4),[track,positions]);
 const metresPerUnit=positions?.metresPerUnit??4,close=view==='track';
 const motion=useMemo(()=>course?buildComparisonMotion(replay,course,telemetry,timing):{},[replay,course,telemetry,timing]);
 const paths=useMemo(()=>{
  if(!course)return {value:null,error:''};
  try{return {value:buildDriverPaths(course,positions?.surface??null,metresPerUnit,race.drivers.map(driver=>driver.code)),error:''};}
  catch{return {value:null,error:'This survey cannot support a safe illustrative path. Track details remain visible; cars are unavailable.'};}
 },[course,positions,metresPerUnit,race.drivers]);
 // Everything about the track that does not change from frame to frame.
 const scene=useMemo(()=>{
  if(!course)return null;
  const unit=(metres:number)=>metres/metresPerUnit,points=course.points as Point[],surface=positions?.surface??null;
  const xs=points.map(point=>point[0]),ys=points.map(point=>point[1]);
  const fit={x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2,w:Math.max(Math.max(...xs)-Math.min(...xs)+110,(Math.max(...ys)-Math.min(...ys)+110)/aspect)};
  const across=(metres:number,side:number,width:number):Point=>{const at=pointAt(course,metres);return [at.x-at.dy*width*side,at.y+at.dx*width*side];};
  // Edge points get a distance round the lap so kerbs and timing lines can be cut from the surveyed edges.
  const edges=surface?{left:surface.left.map(point=>({point,at:progressOf(course,point)})),right:surface.right.map(point=>({point,at:progressOf(course,point)}))}:null;
  const kerbs=course.corners.map(corner=>edges
   ?(corner.right?edges.right:edges.left).filter(item=>item.at>=corner.from-4&&item.at<=corner.to+4).map(item=>item.point)
   :points.flatMap((_,index)=>course.along[index]>=corner.from&&course.along[index]<=corner.to?[across(course.along[index],corner.right?1:-1,unit(roadMetres/2))]:[])).filter(run=>run.length>1).map(path);
  const crossing=(metres:number):[Point,Point]=>{const at=pointAt(course,metres),here:Point=[at.x,at.y];
   return surface?[nearest(surface.left,here),nearest(surface.right,here)]:[across(metres,-1,unit(roadMetres/2)),across(metres,1,unit(roadMetres/2))];};
  return {fit,line:path(points),surface:surface&&`M${path(surface.left).replaceAll(' ',' L')}Z M${path(surface.right).replaceAll(' ',' L')}Z`,
   left:surface&&path([...surface.left,surface.left[0]]),right:surface&&path([...surface.right,surface.right[0]]),kerbs,start:crossing(0),sectors:[crossing(course.sectorEnds[0]),crossing(course.sectorEnds[1])]};
 },[course,positions,metresPerUnit]);
 // The track itself, built once per race and view: surveyed edges where a survey fits this layout, otherwise a road of nominal
 // width along the reference line; kerbs; sector and start/finish lines.
 const backdrop=useMemo(()=>{
  if(!scene)return null;
  const unit=(metres:number)=>metres/metresPerUnit,k=scene.fit.w/960;
  return <>
   {scene.surface
    ?<><path d={scene.surface} fill="#2f333d" fillRule="evenodd" stroke="#1d3329" strokeWidth={close?unit(5):3*k} strokeLinejoin="round"/><path d={scene.surface} fill="#2f333d" fillRule="evenodd"/>
      {close&&<><polyline points={scene.left!} fill="none" stroke="#edf3ff" strokeWidth={unit(.35)} opacity=".85"/><polyline points={scene.right!} fill="none" stroke="#edf3ff" strokeWidth={unit(.35)} opacity=".85"/></>}</>
    :<><polyline points={scene.line} fill="none" stroke={close?'#edf3ff':'#5d7399'} strokeWidth={close?unit(roadMetres+.7):15*k} strokeLinejoin="round" opacity={close?.85:.6}/><polyline points={scene.line} fill="none" stroke="#2f333d" strokeWidth={close?unit(roadMetres):12*k} strokeLinejoin="round"/></>}
   {close&&scene.kerbs.map((points,index)=><g key={index}><polyline points={points} fill="none" stroke="#edf3ff" strokeWidth={unit(1.5)}/><polyline points={points} fill="none" stroke="#e23b45" strokeWidth={unit(1.5)} strokeDasharray={`${unit(2.5)} ${unit(2.5)}`}/></g>)}
   <polyline points={scene.line} fill="none" stroke={close?'#b9d5ff':'#7f95bd'} strokeWidth={close?unit(.22):scene.surface?3.5*k:0} strokeDasharray={close?`${unit(3)} ${unit(3)}`:undefined} opacity={close?.38:.85}/>
   {close&&scene.sectors.map((line,index)=><line key={index} x1={line[0][0]} y1={line[0][1]} x2={line[1][0]} y2={line[1][1]} stroke={colors[index+1]} strokeWidth={unit(.6)} opacity=".8"/>)}
   <line x1={scene.start[0][0]} y1={scene.start[0][1]} x2={scene.start[1][0]} y2={scene.start[1][1]} stroke="#edf3ff" strokeWidth={close?unit(1.6):4*k} strokeDasharray={close?`${unit(1.6)} ${unit(1.6)}`:undefined}/>
  </>;
 },[scene,close,metresPerUnit]);
 const hasDrs=useMemo(()=>telemetry!=null&&Object.values(telemetry.cars).some(car=>car.drs.includes(1)),[telemetry]);
 useEffect(()=>{
  let active=true;const controller=new AbortController();
  const timeout=window.setTimeout(()=>controller.abort(),20000);
  setLoading(true);setPlaying(false);setElapsed(0);precise.current=0;lastFrame.current=0;ranks.current.clear();setWatched(null);
  setPositions(null);setTelemetry(null);setTiming(null);setLoadError('');
  const load=(name:string)=>fetch(`/replay/${race.season}/${name}`,{signal:controller.signal}).then(response=>response.ok?response.json():Promise.reject(response.status));
  const failed=(message:string)=>{if(active)setLoadError(value=>value?`${value} ${message}`:message);};
  const requests:Promise<unknown>[]=[];
  // Position assets supply track geometry only; stale coordinates never drive illustrative movement.
  if(race.positions&&track)requests.push(load(`${race.slug}.json`).then((file:PositionFile)=>{
   if(file.schemaVersion!==2||file.season!==race.season||file.slug!==race.slug||file.reference?.driver!==track.reference.driver||file.reference?.lap!==track.reference.lap)throw new Error('Replay does not match this circuit');
   const decoded=decodePositions(file);
   if(decoded.line.some(point=>point.some(value=>!Number.isFinite(value)))
    ||decoded.surface&&[decoded.surface.left,decoded.surface.right].some(edge=>edge.length<3||edge.some(point=>point.some(value=>!Number.isFinite(value)))))throw new Error('Invalid track geometry');
   if(active)setPositions(decoded);
  }).catch(()=>failed('Detailed replay geometry unavailable; using the season track outline.')));
  if(race.telemetry)requests.push(load(`${race.slug}.telemetry.json`).then((file:TelemetryFile)=>{
   if(file.season!==race.season||file.slug!==race.slug)throw new Error('Telemetry session mismatch');
   const decoded=decodeTelemetry(file);if(active)setTelemetry(decoded);
  }).catch(()=>failed('Car telemetry unavailable; movement uses timing and speed readouts stay blank.')));
  if(race.replayTiming)requests.push(load(`${race.slug}.timing.json`).then(file=>{
   const decoded=decodeReplayTiming(file,race.season,race.slug);if(active)setTiming(decoded);
  }).catch(()=>failed('Observed checkpoints unavailable; using lap-timing estimates. Recorded ranks are unavailable.')));
  Promise.allSettled(requests).then(()=>{window.clearTimeout(timeout);if(active)setLoading(false);});
  return ()=>{active=false;window.clearTimeout(timeout);controller.abort();};
 },[race.season,race.slug,race.positions,race.telemetry,race.replayTiming,track?.reference.driver,track?.reference.lap]);
 useEffect(()=>{setWatched(null);},[selected,rival]);
 useEffect(()=>{
  if(!playing||loading)return;
  let frame=0,published=performance.now();lastFrame.current=published;
  const visibility=()=>{if(document.hidden)setPlaying(false);};
  document.addEventListener('visibilitychange',visibility);
  const tick=(now:number)=>{
   // Discard suspended-tab and long-task time, rather than teleporting cars after a delayed frame.
   const next=Math.min(duration,precise.current+Math.max(0,Math.min(100,now-lastFrame.current))/1000*speed);
   lastFrame.current=now;precise.current=next;paint.current(next);
   if(now-published>=uiMilliseconds||next>=duration){published=now;setElapsed(next);}
   if(next<duration)frame=requestAnimationFrame(tick);else setPlaying(false);
  };
  frame=requestAnimationFrame(tick);
  return ()=>{cancelAnimationFrame(frame);document.removeEventListener('visibilitychange',visibility);setElapsed(precise.current);};
 },[playing,speed,duration,loading]);
 useEffect(()=>{if(elapsed>=duration)setPlaying(false);},[elapsed,duration]);
 // React leaves the moving parts of the map to `paint`; redraw them after every render so the two never disagree.
 useLayoutEffect(()=>{paint.current(precise.current);});
 if(!track||!course||!scene||duration<=0)return <section className={styles.panel} aria-labelledby={titleId}><p className="eyebrow">RACE REPLAY</p><h2 id={titleId}>Replay unavailable for this session.</h2><p className={styles.note}>The replay needs this season's circuit layout and recorded lap timing. A layout from another season is not substituted.</p></section>;
 const seek=(seconds:number)=>{const next=Math.max(0,Math.min(duration,seconds));ranks.current.clear();precise.current=next;lastFrame.current=performance.now();setElapsed(next);paint.current(next);};
 const t=replay.start+elapsed,unit=(metres:number)=>metres/metresPerUnit,{fit}=scene;
 // Unwrapped timing-anchored progress retains trails across lap boundaries.
 const spot=(timeline:Timeline,time:number):{at:number;off:boolean;estimated:boolean}|null=>{
  const state=positionAt(timeline,track,time);
  if(gone(state)||!paths.value)return null;
  const distance=comparisonDistanceAt(motion,timeline.driver.code,time);
  return distance?{at:distance.metres,off:Boolean(state.lap?.pitIn||state.lap?.pitOut),estimated:distance.quality==='timing'}:null;
 };
 const point=(code:string,at:number)=>driverPointAt(paths.value!,code,at);
 const cars=replay.timelines.map(timeline=>{const state=positionAt(timeline,track,t),where=spot(timeline,t);return {driver:timeline.driver,timeline,state,where,place:where&&point(timeline.driver.code,where.at)};});
 const byCode=new Map(cars.map(car=>[car.driver.code,car]));
 const focus=byCode.get(selected)||cars[0];
 const other=cars.find(car=>car.driver.code===rival&&car!==focus);
 const pair=[focus,other].filter((car):car is typeof focus=>car!=null);
 const kind=statusAt(replay.status,t),leader=leaderLap(replay.timelines,t);
 // The tower and every position label use the live running order, which comes from the same progress that draws the cars.
 // Timing-point standings still feed fights and the compared pair's gap.
 const standings=standingsAt(replay.timelines,t).map(row=>({...row,car:byCode.get(row.timeline.driver.code)!}));
 const tower=runningOrderAt(replay,motion,course,t).map(row=>({...row,car:byCode.get(row.timeline.driver.code)!}));
 const placed=new Map(tower.map(row=>[row.car.driver.code,row.position]));
 const absent=cars.filter(car=>!placed.has(car.driver.code));
 // Fights: consecutive cars within a second at their last timing point, under green or yellow, away from pit laps.
 const pitting=(car:typeof cars[number])=>Boolean(car.state.lap?.pitIn||car.state.lap?.pitOut);
 const fights=kind==='sc'||kind==='vsc'||kind==='red'?[]:standings.flatMap((row,index)=>{const ahead=standings[index-1];
  return ahead&&row.mark>0&&row.interval!=null&&row.interval<fightSeconds&&row.lapsDown===ahead.lapsDown&&!gone(row.car.state)&&!gone(ahead.car.state)&&!pitting(row.car)&&!pitting(ahead.car)?[{ahead:ahead.car,behind:row.car,seconds:row.interval}]:[];});
 const isPair=(first:string,second:string)=>other!=null&&((first===focus.driver.code&&second===other.driver.code)||(first===other.driver.code&&second===focus.driver.code));
 const duel=fights.some(fight=>isPair(fight.ahead.driver.code,fight.behind.driver.code));
 // Gap between the compared drivers at the last timing point both have crossed.
 const mine=standings.find(row=>row.car===focus),theirs=standings.find(row=>row.car===other);
 const common=mine&&theirs?Math.min(mine.mark,theirs.mark):0,mineAt=mine?.timeline.marks[common],theirsAt=theirs?.timeline.marks[common];
 const between=!mine||!theirs||!other||common===0||mineAt==null||theirsAt==null?null:`At the last timing point: ${mineAt<theirsAt?focus.driver.code:other.driver.code} ahead by ${Math.abs(mineAt-theirsAt).toFixed(1)} s`;
 // Flash a tower row when a car gains a place while playing.
 const now=typeof performance==='undefined'?0:performance.now();
 tower.forEach(row=>{const code=row.timeline.driver.code,before=ranks.current.get(code);
  ranks.current.set(code,{rank:row.position,until:playing&&before&&row.position<before.rank?now+1500:before?.until??0});});
 // Telemetry for the compared pair, and its speed trace over the last few seconds.
 const duelists=pair.map(car=>{
  const samples=telemetry?Array.from({length:traceSeconds*2+1},(_,index)=>telemetryAt(telemetry,car.driver.code,t-traceSeconds+index*.5)):[];
  return {car,now:telemetry?telemetryAt(telemetry,car.driver.code,t):null,samples,compound:car.state.lap?.compound&&car.state.lap.compound!=='nan'?car.state.lap.compound:null};
 });
 const gapChip=between;
 const k=fit.w/960,carLength=unit(carMetres);
 const rings=close?[]:fights.filter(fight=>fight.ahead.place&&fight.behind.place).map(fight=>({fight,x:(fight.ahead.place!.x+fight.behind.place!.x)/2,y:(fight.ahead.place!.y+fight.behind.place!.y)/2}));
 // Draw one moment straight onto the map. Runs every animation frame while playing and after every render.
 paint.current=(seconds:number)=>{
  const svg=svgRef.current;
  if(!svg)return;
  const time=replay.start+seconds;
  // The body points along the chord between its nose and tail, so short kinks in the line do not twitch the car.
  const locate=(car:typeof focus|undefined)=>{const where=car&&spot(car.timeline,time);
   if(!where||!car)return null;
   const nose=point(car.driver.code,where.at+carMetres/2),tail=point(car.driver.code,where.at-carMetres/2),size=Math.hypot(nose.x-tail.x,nose.y-tail.y)||1;
   return {...point(car.driver.code,where.at),dx:(nose.x-tail.x)/size,dy:(nose.y-tail.y)/size,at:where.at,off:where.off,estimated:where.estimated};};
  const spots=[locate(focus),locate(other)],[first,second]=spots;
  const order=new Map(runningOrderAt(replay,motion,course,time).map(row=>[row.timeline.driver.code,row.position]));
  // The camera is a pure function of where the compared cars are: it frames both while they are close on the map and blends
  // into following the selected car as they separate, so it can never drift against the cars. Its width follows the gap along
  // the track, which changes only as fast as the cars close on each other, so the zoom does not pump as the pair turns.
  let camera=fit;
  if(close&&first){
   camera={x:first.x,y:first.y,w:unit(150)};
   if(second){
    const reach=unit(Math.max(110,Math.abs(lapDelta(course,first.at,second.at))*2.4));
    const share=Math.max(0,Math.min(1,(reach-unit(260))/unit(110))),alone=share*share*(3-2*share);
    camera={x:(first.x+second.x)/2*(1-alone)+first.x*alone,y:(first.y+second.y)/2*(1-alone)+first.y*alone,w:reach*(1-alone)+unit(150)*alone};
   }
  }
  svg.setAttribute('viewBox',`${camera.x-camera.w/2} ${camera.y-camera.w*aspect/2} ${camera.w} ${camera.w*aspect}`);
  const zoom=camera.w/960;
  if(close){
   spots.forEach((at,slot)=>{
    const car=slot?other:focus,group=carRefs.current[slot],label=labelRefs.current[slot],trail=trailRefs.current[slot];
    if(!car||!group||!label||!trail)return;
    show(group,at!=null);show(label,at!=null);
    if(!at){show(trail,false);return;}
    const {x,y}=at,live=telemetry?telemetryAt(telemetry,car.driver.code,time):null;
    group.setAttribute('transform',`translate(${x},${y}) rotate(${Math.atan2(at.dy,at.dx)*180/Math.PI}) scale(${carLength/66})`);
    group.setAttribute('opacity',at.off?'.5':'1');
    show(group.lastElementChild!,Boolean(live?.brake));
    const size=Math.max(unit(3.4),15*zoom),below=slot===1&&first!=null&&Math.hypot(first.x-at.x,first.y-at.y)<unit(40);
    label.style.setProperty('--label',`${size}px`);
    label.setAttribute('x',String(x));label.setAttribute('y',String(y+(below?1:-1)*unit(6.5)+(below?size*.7:0)));label.setAttribute('stroke-width',String(size*.28));
    const words=`P${order.get(car.driver.code)??'—'} · ${car.driver.code}${live?` · ${live.speed} km/h`:' · speed —'}${at.estimated?' · timing motion':''}${at.off?' · pit lap':''}`;
    if(label.textContent!==words)label.textContent=words;
    // Light trail: the stretch of racing line the car has covered in the last few seconds, fading towards its tail.
    const history=Math.max(replay.start,car.timeline.laps[0]?.t0??time,time-trailSeconds);
    const before=spot(car.timeline,history),span=before?at.at-before.at:0,drawn=span>.01&&span<=1500;
    show(trail,drawn);
    if(!drawn)return;
    const count=Math.max(trailChunks,Math.ceil(span/4)),points:string[]=[];
    for(let index=0;index<=count;index++){const here=point(car.driver.code,at.at-span*index/count);points.push(`${here.x.toFixed(2)},${here.y.toFixed(2)}`);}
    for(let chunk=0;chunk<trailChunks;chunk++){
     const piece=points.slice(Math.floor(chunk*count/trailChunks),Math.floor((chunk+1)*count/trailChunks)+1).join(' ');
     for(const line of trail.children[chunk].children)line.setAttribute('points',piece);
    }
   });
   miniRefs.current.forEach((dot,slot)=>{const at=spots[slot];if(!dot)return;show(dot,at!=null);if(at){dot.setAttribute('cx',String(at.x));dot.setAttribute('cy',String(at.y));}});
  }else{
   cars.forEach(car=>{const dot=dotRefs.current.get(car.driver.code),at=car===focus?first:car===other?second:locate(car);
    if(!dot)return;show(dot,at!=null);if(at){dot.setAttribute('cx',String(at.x));dot.setAttribute('cy',String(at.y));dot.setAttribute('fill-opacity',at.off?'.4':at.estimated?'.7':'1');}});
   spots.forEach((at,slot)=>{const label=labelRefs.current[slot];if(!label)return;show(label,at!=null);
    if(at){const below=slot===1&&first!=null&&Math.hypot(first.x-at.x,first.y-at.y)<70*zoom;label.setAttribute('x',String(at.x+14*zoom));label.setAttribute('y',String(at.y+(below?26:-12)*zoom));}});
   rings.forEach((ring,index)=>{const element=battleRefs.current[index],ahead=locate(ring.fight.ahead),behind=locate(ring.fight.behind);
    if(!element)return;show(element,Boolean(ahead&&behind));if(ahead&&behind){element.setAttribute('cx',String((ahead.x+behind.x)/2));element.setAttribute('cy',String((ahead.y+behind.y)/2));}});
  }
 };
 const periods=replay.status.map((entry,index)=>({kind:entry.kind,from:Math.max(entry.t,replay.start),to:Math.min(replay.status[index+1]?.t??replay.end,replay.end)})).filter(period=>period.kind!=='green'&&period.kind!=='yellow'&&period.to>period.from);
 const unseen=cars.filter(car=>!car.place&&!gone(car.state)).length;
 // Observed rank updates are classification events, not the exact physical passing instant.
 const cue=(observation:RankObservation)=>Math.max(0,observation.t-3-replay.start);
 const during=(observation:RankObservation)=>cue(observation)<=elapsed+.2&&t<=observation.t+4;
 const current=watched&&during(watched)?watched:[...observations].reverse().find(during);
 const nextPass=observations.find(observation=>cue(observation)>elapsed+.5),previousPass=[...observations].reverse().find(observation=>cue(observation)<elapsed-4);
 const follow=()=>{setView('track');setSpeed(value=>Math.min(value,5));};
 const watch=(observation:RankObservation)=>{setWatched(observation);follow();seek(cue(observation));setPlaying(true);};
 const source=loading?'Loading replay data…':'Illustrative racing lines';
 const timingMotion=pair.filter(car=>car.where?.estimated).length;
 const pairName=`${focus.driver.code}${other?` and ${other.driver.code}`:''}`;
 const views=[['track',`Track · ${pairName}`],['full','Full circuit']];
 return <section className={styles.panel} aria-labelledby={titleId}>
  <div className={styles.header}>
   <div><p className="eyebrow">RACE REPLAY · {source.toUpperCase()}</p><h2 id={titleId}>{race.name} {race.season}</h2></div>
   <div className={styles.readout}>
    <span><small>Replay time</small><b>{clock(elapsed)}</b></span>
    <span><small>Leader</small><b>{leader==null?'—':`Lap ${leader} / ${race.totalLaps}`}</b></span>
    {kind&&<span className={styles.badge} style={{'--status':badges[kind].color} as CSSProperties}><i/>{badges[kind].label}</span>}
   </div>
  </div>
  {loadError&&<p className={styles.gap} role="status">{loadError}</p>}
  {!loading&&<p className={styles.note}>Positions and tower gaps: live running order on track. Fights and the compared pair's gap: timing points.</p>}
  {paths.error&&<p className={styles.gap} role="status">{paths.error}</p>}
  {!loading&&timingMotion>0&&<p className={styles.gap} role="status">Missing continuous speed: {timingMotion} compared {timingMotion===1?'car uses':'cars use'} timing-based movement. Available speed readouts remain recorded.</p>}
  <div className={styles.content}>
   <div className={styles.stage} aria-busy={loading}>
    <div className={styles.lanes}>
     {/* viewBox, cars, labels and trails are positioned by `paint`, not by React. */}
     <svg ref={svgRef} viewBox={`${fit.x-fit.w/2} ${fit.y-fit.w*aspect/2} ${fit.w} ${fit.w*aspect}`} role="img" aria-label={`Illustrative driver racing lines on the ${track.season} ${track.circuit} layout${close?`, following ${pairName}`:''}. Live running positions are shown beside the compared drivers.`}>
      {backdrop}
      {rings.map((ring,index)=><circle key={`${ring.fight.ahead.driver.code}-${ring.fight.behind.driver.code}`} ref={element=>{battleRefs.current[index]=element;}} className={styles.battle} cx={ring.x} cy={ring.y} r={17*k} fill="none" stroke="#ffe27a" strokeWidth={2.5*k} opacity=".8"/>)}
      {close&&pair.map((car,slot)=><g key={car.driver.code} ref={element=>{trailRefs.current[slot]=element;}} fill="none" strokeLinecap="round" strokeLinejoin="round">{Array.from({length:trailChunks},(_,chunk)=>{const fade=1-chunk/trailChunks;return <g key={chunk}>
       <polyline stroke={car.driver.color} strokeWidth={unit(2.6)} opacity={.2*fade}/>
       <polyline stroke={car.driver.color} strokeWidth={unit(1)} opacity={.9*fade}/>
       <polyline stroke="#ffffff" strokeWidth={unit(.25)} opacity={.9*fade}/>
      </g>;})}</g>)}
      {/* The track view draws only the compared pair; the full circuit keeps the field as quiet markers. */}
      {close
       ?[...pair].reverse().map(car=>{const slot=car===focus?0:1,color=car.driver.color;return <g key={car.driver.code} ref={element=>{carRefs.current[slot]=element;}}>
         <rect x="-33" y="-12" width="5" height="24" rx="1.5" fill={color}/>
         {[-14,8].map(wheel=><rect key={`rear${wheel}`} x="-26" y={wheel} width="13" height="6" rx="2.5" fill="#05080f"/>)}
         {[-13,8].map(wheel=><rect key={`front${wheel}`} x="11" y={wheel} width="11" height="5" rx="2.5" fill="#05080f"/>)}
         <path d="M-28,-5 L-8,-8 L8,-4.5 L27,-2.2 L33,0 L27,2.2 L8,4.5 L-8,8 L-28,5 Z" fill={color} stroke="#0b1529" strokeWidth="1"/>
         <rect x="26" y="-13" width="4.5" height="26" rx="1.5" fill={color}/>
         <ellipse cx="-3" cy="0" rx="6" ry="2.8" fill="#0b1529"/>
         <rect x="-37" y="-5" width="4" height="10" rx="1" fill="#ff2b2b"/>
        </g>;})
       :[...cars].sort((a,b)=>Number(a===focus)*2+Number(a===other)-Number(b===focus)*2-Number(b===other)).map(car=>{const key=car===focus||car===other;return <circle key={car.driver.code} ref={element=>{dotRefs.current.set(car.driver.code,element);}} r={(car===focus?10:key?9:5)*k} fill={car.driver.color} stroke={key?'#edf3ff':'#0b1529'} strokeWidth={(key?3:1.5)*k} opacity={key?1:.55}/>;})}
      {pair.map((car,slot)=><text key={car.driver.code} ref={element=>{labelRefs.current[slot]=element;}} className={styles.label} style={close?undefined:{'--label':`${19*k}px`} as CSSProperties} textAnchor={close?'middle':'start'} fill="#edf3ff" fontWeight="700" paintOrder="stroke" stroke="#0b1529" strokeWidth={19*k*.28}>{close?'':`P${placed.get(car.driver.code)??'—'} ${car.driver.code}`}</text>)}
     </svg>
     {close&&<>
      {gapChip&&<p className={styles.gapChip} data-fight={duel||undefined}>{duel?'Fight · ':''}{gapChip}</p>}
      <svg className={styles.mini} viewBox={`${fit.x-fit.w/2} ${fit.y-fit.w*aspect/2} ${fit.w} ${fit.w*aspect}`} role="img" aria-label="Where the compared drivers are on the circuit">
       <polyline points={scene.line} fill="none" stroke="#7f95bd" strokeWidth={fit.w/110} strokeLinejoin="round"/>
       {[...pair].reverse().map(car=><circle key={car.driver.code} ref={element=>{miniRefs.current[car===focus?0:1]=element;}} r={fit.w/38} fill={car.driver.color} stroke="#edf3ff" strokeWidth={fit.w/220}/>)}
      </svg>
     </>}
    </div>
    <div className={styles.duel}>
     {duelists.map(({car,now:live,compound})=><div key={car.driver.code} className={styles.duelist} style={{'--car':car.driver.color} as CSSProperties}>
      <div className={styles.who}>
       <b>{car.driver.code}</b><small className={styles.place} title="Live running position">P{placed.get(car.driver.code)??'—'}</small>
       {hasDrs&&<span className={styles.drs} data-on={live?.drs||undefined}>DRS</span>}
       <small className={styles.tyre}>{gone(car.state)?(car.state.quality==='finished'?'Finished':`Out${car.driver.status?` · ${car.driver.status}`:''}`):<>{compound&&<i style={{background:compounds[compound]||compounds.UNKNOWN}}/>}{compound?compound[0]+compound.slice(1).toLowerCase():'Tyre not recorded'}{car.state.lap?.tyreLife!=null&&` · ${car.state.lap.tyreLife} ${car.state.lap.tyreLife===1?'lap':'laps'}`}{car.state.lap&&` · lap ${car.state.lap.number}`}{pitting(car)&&' · pit lap'}</>}</small>
      </div>
      <span className={styles.speedNow}><strong>{live?live.speed:'—'}</strong><small>km/h</small></span>
      <span className={styles.gear}><small>Gear</small><b>{live?live.gear||'N':'—'}</b></span>
      <div className={styles.inputs}>
       <span className={styles.input}><small>Throttle</small><span className={styles.meter} role="img" aria-label={live?`Throttle ${live.throttle} percent`:'Throttle not recorded'}><i style={{width:`${live?.throttle??0}%`}}/></span><b>{live?`${live.throttle}%`:'—'}</b></span>
       <span className={styles.input} data-brake data-on={live?.brake||undefined}><small>Brake</small><span className={styles.meter} role="img" aria-label={!live?'Brake not recorded':live.brake?'Braking':'Brake off'}><i style={{width:live?.brake?'100%':'0%'}}/></span><b>{!live?'—':live.brake?'On':'Off'}</b></span>
      </div>
     </div>)}
     <div className={styles.trace}>
      <p>{between??'Gap appears once both drivers have crossed a timing point.'}</p>
      {telemetry?<svg viewBox={`0 0 ${traceSeconds*2} 40`} preserveAspectRatio="none" role="img" aria-label={`Speed over the last ${traceSeconds} seconds for ${duelists.map(item=>item.car.driver.code).join(' and ')}. Bars under the lines mark braking.`}>
       {duelists.map(({car,samples},row)=><g key={car.driver.code}>
        <path d={samples.map((sample,index)=>sample?`${index&&samples[index-1]?'L':'M'}${index},${32-Math.max(0,Math.min(1,(sample.speed-floorSpeed)/(topSpeed-floorSpeed)))*30}`:'').join(' ')} fill="none" stroke={car.driver.color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeDasharray={row===1&&car.driver.color.toLowerCase()===focus.driver.color.toLowerCase()?'4 3':undefined}/>
        {samples.map((sample,index)=>sample?.brake?<rect key={index} x={index-.5} y={34+row*3} width="1" height="2" fill={car.driver.color}/>:null)}
       </g>)}
      </svg>:<p className={styles.quiet}>{loading?'Loading car telemetry…':'Speed, throttle, brake and gear unavailable for this session.'}</p>}
      {telemetry&&<small>Speed, last {traceSeconds} s ({floorSpeed}–{topSpeed} km/h) · bars underneath mark braking</small>}
     </div>
    </div>
    <div className={styles.battles}>
     <span>{fights.length?'Timing-point proximity':`No timing-point gaps under ${fightSeconds} s right now.`}</span>
     {fights.slice(0,7).map(fight=><button type="button" key={`${fight.ahead.driver.code}-${fight.behind.driver.code}`} aria-pressed={isPair(fight.ahead.driver.code,fight.behind.driver.code)} onClick={()=>{onPair(fight.behind.driver.code,fight.ahead.driver.code);follow();}}><i style={{background:fight.behind.driver.color}}/>{fight.behind.driver.code}<i style={{background:fight.ahead.driver.color}}/>{fight.ahead.driver.code}<small>{fight.seconds.toFixed(1)} s</small></button>)}
    </div>
    {unseen>0&&<p className={styles.gap} role="status">{unseen} {unseen===1?'car has':'cars have'} no usable timing interval at this moment and {unseen===1?'is':'are'} not drawn.</p>}
   </div>
   <ol className={styles.tower} aria-label="Live running order with gaps to the leader">
    {tower.map(row=>{const car=row.car,state=car.state,out=state.quality==='out',compound=state.lap?.compound&&state.lap.compound!=='nan'?state.lap.compound:null;
     const value=out?'OUT':state.quality==='finished'?'FIN':row.position===1?'Leader':row.lapsDown>0?`+${row.lapsDown} lap${row.lapsDown===1?'':'s'}`:row.gap!=null?`+${row.gap.toFixed(1)} s`:'—';
     return <li key={car.driver.code}><button type="button" className={`${car===other?styles.rival:''} ${(ranks.current.get(car.driver.code)?.until??0)>now?styles.gained:''}`} aria-pressed={car===focus} onClick={()=>onSelect(car.driver.code)} style={{borderLeftColor:car.driver.color}}>
      <span>{row.position}</span><b>{car.driver.code}</b>{compound&&!out&&<i title={compound} style={{background:compounds[compound]||compounds.UNKNOWN}}/>}<small title="How long ago the leader passed the point this car has reached">{pitting(car)&&!gone(state)?'PIT · ':''}{value}</small>
     </button></li>;})}
    {absent.map(car=><li key={car.driver.code}><button type="button" aria-pressed={car===focus} onClick={()=>onSelect(car.driver.code)} style={{borderLeftColor:car.driver.color}}><span>–</span><b>{car.driver.code}</b><small>NO LAPS</small></button></li>)}
   </ol>
  </div>
  <div className={styles.passes}>
   <button type="button" disabled={loading||!previousPass} aria-label="Watch the previous recorded position update for the compared pair" onClick={()=>previousPass&&watch(previousPass)}><CaretLeft weight="bold" size={15}/>Previous</button>
   <p role="status">{!observations.length?(timing?'No recorded position changes for this pair.':'Recorded position updates unavailable.'):current?<><b>{t<current.t?'Upcoming recorded update':'Position update'}</b> {describe(current)}</>:nextPass?<><b>Next update</b> {describe(nextPass)} · in {clock(nextPass.t-t)}</>:'No more recorded updates for this pair.'}</p>
   <button type="button" disabled={loading||!nextPass} aria-label="Watch the next recorded position update for the compared pair" onClick={()=>nextPass&&watch(nextPass)}>Next<CaretRight weight="bold" size={15}/></button>
  </div>
  <div className={styles.bar}>
   <button type="button" className={styles.play} disabled={loading} aria-label={loading?'Loading replay':playing?'Pause replay':'Play replay'} onClick={()=>{if(!playing&&precise.current>=duration)seek(0);setPlaying(!playing);}}>{playing?<Pause weight="fill" size={18}/>:<Play weight="fill" size={18}/>}</button>
   <span className={styles.elapsed}>{clock(elapsed)} <small>/ {clock(duration)}</small></span>
   <div className={styles.timeline}>
    <div className={styles.periods} aria-hidden="true">{periods.map((period,index)=><span key={index} title={badges[period.kind].label} style={{left:`${(period.from-replay.start)/duration*100}%`,width:`${(period.to-period.from)/duration*100}%`,background:badges[period.kind].color}}/>)}</div>
    <input type="range" aria-label="Replay position" disabled={loading} min={0} max={duration} step="any" value={elapsed} aria-valuetext={`${clock(elapsed)}${leader==null?'':`, leader on lap ${leader}`}${kind?`, ${badges[kind].label}`:''}`} onChange={event=>seek(Number(event.target.value))}/>
    <div className={styles.ticks} aria-hidden="true">{observations.map((observation,index)=><span key={index} style={{left:`${(observation.t-replay.start)/duration*100}%`}}/>)}</div>
   </div>
   <label className={styles.speed}>View <select value={view} onChange={event=>{setView(event.target.value);if(event.target.value==='track')setSpeed(value=>Math.min(value,5));}}>{views.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <label className={styles.speed}>Speed <select value={speed} onChange={event=>setSpeed(Number(event.target.value))}>{speeds.map(value=><option key={value} value={value}>{value}×</option>)}</select></label>
   <button type="button" className={styles.restart} aria-label="Restart replay" onClick={()=>{seek(0);setPlaying(false);}}><ArrowCounterClockwise weight="bold" size={17}/></button>
  </div>
  <p className={styles.legend}>Timeline marks: {[...new Set(periods.map(period=>period.kind))].map(value=><span key={value}><i style={{background:badges[value].color}}/>{badges[value].label}</span>)}{observations.length>0&&<span><i className={styles.tickKey}/>{observations.length} recorded position updates</span>}</p>
  <details className={styles.accuracy}><summary>Replay data and accuracy</summary>
   <p className={styles.note}>Driver paths, road placement and pit geometry are illustrative. Movement follows recorded speed normalized to meet {timing?'available source checkpoints':'estimated lap and sector checkpoints'}; intervals with missing speed use timing-based movement. Speed readouts come from exported telemetry and stay unavailable where missing. Positions and tower gaps are the live running order, taken from the same progress that draws each car: it is exact at every timing checkpoint and follows recorded speed between them, so a place changes when the car is drawn passing. Lap 1 starts from grid slots. {timing?'Recorded position updates on the timeline are timing-stream classification events and can trail the pass by a few seconds. ':''}Fights and the compared pair's gap use timing points. {positions?.surface?`Track edges use the ${positions.surface.name} survey from ${positions.surface.source} (LGPL-3.0).`:'Road width and reference-outline scale are illustrative.'}</p>
  </details>
 </section>;
}
