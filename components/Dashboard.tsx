'use client';
import {useEffect, useId, useState} from 'react';
import type {ReactNode} from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ArrowsLeftRight,Trophy} from '@phosphor-icons/react';
import type {Race,Driver,Lap,CalendarRace} from '@/lib/data';
import {time,summarize} from '@/lib/stats';
import styles from './Dashboard.module.css';
import TrackMap from './TrackMap';
import RaceReplay from './RaceReplay';
const Plot=dynamic(()=>import('./Plot'),{ssr:false,loading:()=> <div className={styles.chartLoading}>Loading interactive chart…</div>});
const tabs=['overview','pace','strategy','compare','track','replay'];
const compounds:Record<string,string>={SOFT:'#ff424d',MEDIUM:'#ffcf25',HARD:'#e5e8eb',INTERMEDIATE:'#42c77c',WET:'#4b9cff',UNKNOWN:'#a3adba'};
function Disclosure({title,children}:{title:string;children:ReactNode}){
 const [expanded,setExpanded]=useState(false);
 const panelId=useId();
 return <section className={styles.additional}>
   <button type="button" className={styles.disclosureToggle} aria-expanded={expanded} aria-controls={panelId} onClick={()=>setExpanded(value=>!value)}>{title}</button>
   <div id={panelId} hidden={!expanded}>{children}</div>
 </section>;
}
export default function Dashboard({race,calendar,years,trackDetails}:{race:Race;calendar:CalendarRace[];years:number[];trackDetails:ReactNode}){
 const router=useRouter();
 const [query, setQuery] = useState(() => new URLSearchParams());
 const [stintDetails, setStintDetails] = useState<string | null>(null);
 useEffect(() => {
   const sync = () => setQuery(new URLSearchParams(window.location.search));
   sync();
   setStintDetails(null);
   window.addEventListener('popstate', sync);
   return () => window.removeEventListener('popstate', sync);
 }, [race.season,race.slug]);
 const tab=tabs.includes(query.get('tab')||'')?query.get('tab')!:'compare';
 const first=race.drivers.find(d=>d.code===query.get('a'))||race.drivers[0];
 const second=race.drivers.find(d=>d.code===query.get('b')&&d.code!==first.code)||race.drivers.find(d=>d.code==='SAI'&&d.code!==first.code)||race.drivers.find(d=>d.code!==first.code)!;
 const parseLap = (value: string | null, fallback: number) => {
   if (value === null) return fallback;
   const number = Number(value);
   return Number.isFinite(number) && Number.isInteger(number) && value.trim() !== ''
     ? Math.max(1, Math.min(race.totalLaps, number)) : fallback;
 };
 const parsedStart = parseLap(query.get('start'), 1);
 const parsedEnd = parseLap(query.get('end'), race.totalLaps);
 const validRange = ['start', 'end'].every(key => {
   const raw = query.get(key);
   return raw === null || (raw.trim() !== '' && Number.isFinite(Number(raw)) && Number.isInteger(Number(raw)));
 }) && parsedStart <= parsedEnd;
 const start = validRange ? parsedStart : 1;
 const end = validRange ? parsedEnd : race.totalLaps;
 const lapNumber = Number(query.get('lap'));
 const selectedLap = query.has('lap') && Number.isInteger(lapNumber)
   && lapNumber >= start && lapNumber <= end ? lapNumber : null;
 const [eligibleOnly, setEligibleOnly] = useState(true);
 function update(values: Record<string, string | null>) {
   const params = new URLSearchParams(query.toString());
   Object.entries(values).forEach(([key, value]) => value === null ? params.delete(key) : params.set(key, value));
   const nextStart = parseLap(params.get('start'), 1);
   const nextEnd = parseLap(params.get('end'), race.totalLaps);
   const nextLap = Number(params.get('lap'));
   if (params.has('lap') && (!Number.isInteger(nextLap) || nextLap < nextStart || nextLap > nextEnd)) params.delete('lap');
   const search = params.toString();
   window.history.replaceState(null, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`);
   setQuery(params);
 }
 const selected=[first,second];
 const laps=(driver:Driver)=>race.laps.filter(l=>l.driver===driver.code&&l.number>=start&&l.number<=end);
 const stats=selected.map(d=>summarize(laps(d)));
 const trackView=<TrackMap track={race.track} drivers={selected} laps={race.laps} start={start} end={end} selectedLap={selectedLap} onLapChange={lap=>update({lap:lap==null?null:String(lap)})}/>;
 function driverCard(d:Driver,index:number){return <div className={styles.driverCard} style={{borderLeftColor:d.color}}>
<div>
<label className={styles.srOnly} htmlFor={`driver-${index}`}>Driver {index+1}</label>
<select id={`driver-${index}`} value={d.code} onChange={e=>update({[index===0?'a':'b']:e.target.value,...(e.target.value===(index===0?second:first).code?{[index===0?'b':'a']:d.code}:{})})}>{race.drivers.map(driver=>
<option key={driver.code} value={driver.code}>{driver.name}</option>)}</select>
<p>
<Link href={`/drivers/${d.code}?season=${race.season}`}><b>{d.code} ↗</b></Link>
<span>|</span>{d.team}</p>
</div>
<strong>{d.position == null ? '—' : `P${d.position}`} </strong>
</div>}
 function tyreRows(drivers:Driver[]){return <div className={styles.stints}>{drivers.map(d=>
<div className={styles.stintRow} key={d.code}>
<b style={{borderLeftColor:d.color}}>{d.code}</b>
<div className={styles.stintTrack}>{race.stints.filter(s=>s.driver===d.code).map(s=>
<button type="button" key={`${d.code}:${s.number}:${s.startLap}`} className={styles.stint} style={{left:`${(s.startLap-1)/race.totalLaps*100}%`,width:`${(s.endLap-s.startLap+1)/race.totalLaps*100}%`,background:compounds[s.compound || 'UNKNOWN']||compounds.UNKNOWN}} aria-label={`${d.name}: ${s.compound || 'Unknown compound'}, laps ${s.startLap}–${s.endLap}, ${s.fresh == null ? 'unknown freshness' : s.fresh ? 'fresh' : 'used'} tyre set`} onClick={() => setStintDetails(`${d.name}: ${s.compound || 'Unknown compound'}, laps ${s.startLap}–${s.endLap}, ${s.fresh == null ? 'unknown freshness' : s.fresh ? 'fresh' : 'used'} tyre set`)}>
<b>{s.compound==='INTERMEDIATE'?'I':!s.compound||s.compound==='UNKNOWN'?'?':s.compound[0]}</b>
<span>Laps {s.startLap}–{s.endLap}</span>
</button>)}</div>
</div>)}</div>}
 function pacePlot(position=false){const shown=position?race.drivers:selected;
 const traces=shown.map((d,i)=>({x:race.laps.filter(l=>l.driver===d.code&&l.number>=start&&l.number<=end).map(l=>l.number),y:race.laps.filter(l=>l.driver===d.code&&l.number>=start&&l.number<=end).map(l=>l.generated?null:position?l.position:(!eligibleOnly||l.eligible)?l.timeSeconds:null),name:d.code+' · '+d.name,type:'scatter' as const,mode:position?'lines' as const:'lines+markers' as const,connectgaps:false,line:{color:d.color,width:position?1.7:2.2,dash:shown.slice(0,i).some(previous=>previous.color.toLowerCase()===d.color.toLowerCase())?'dash' as const:'solid' as const},marker:{size:6},hovertemplate:position?'Lap %{x}<br>Position %{y}<extra>%{fullData.name}</extra>':'Lap %{x}<br>%{y:.3f} seconds<extra>%{fullData.name}</extra>'}));
 const values=traces.flatMap(t=>t.y).filter((v):v is number=>v!==null),low=values.length?Math.floor(Math.min(...values)/5)*5:90,high=values.length?Math.ceil(Math.max(...values)/5)*5:100;
 return <div className={styles.chart}>
<Plot data={traces} layout={{autosize:true,height:310,paper_bgcolor:'transparent',plot_bgcolor:'transparent',font:{family:'Inter, sans-serif',color:'#bac5d0',size:12},margin:{l:48,r:8,t:15,b:48},showlegend:position,legend:{orientation:'h',font:{size:10}},hovermode:'x unified',hoverlabel:{bgcolor:'#15213b',font:{color:'#f5f6f7'}},xaxis:{title:{text:'Lap',standoff:14},range:[start-.2,end+.2],gridcolor:'#29354f',zeroline:false,dtick:Math.max(1,Math.ceil((end-start)/15)),linecolor:'#405575'},yaxis:position?{title:{text:'Position'},autorange:'reversed',dtick:2,gridcolor:'#29354f',zeroline:false}:{range:[low-1,high+1],tickvals:Array.from({length:Math.ceil((high-low)/5)+1},(_,i)=>low+i*5),ticktext:Array.from({length:Math.ceil((high-low)/5)+1},(_,i)=>`${Math.floor((low+i*5)/60)}:${String((low+i*5)%60).padStart(2,'0')}`),gridcolor:'#29354f',zeroline:false},shapes:selectedLap?[{type:'line',x0:selectedLap,x1:selectedLap,y0:0,y1:1,yref:'paper',line:{color:'#d4dae0',width:1,dash:'dot'}}]:[]}} config={{responsive:true,displayModeBar:false}} useResizeHandler style={{width:'100%',height:'310px'}} onClick={event=>{const point=event.points[0];if(point&&typeof point.x==='number')update({lap:String(point.x)})}}/>
</div>}
 const classification=<section id="classification" className={styles.classification}>
<h2>Race classification</h2>
<p className="muted">Official finishing result · starting grid, status and points</p>
<div className={styles.tableScroll}>
<table>
<thead>
<tr>
<th>Pos</th>
<th>Driver</th>
<th>Team</th>
<th>Grid</th>
<th>Time / gap</th>
<th>Status</th>
<th>Points</th>
</tr>
</thead>
<tbody>{race.drivers.map(d=>
<tr key={d.code}>
<td>
<b>{d.position ?? '—'}</b>
</td>
<td>
<span className={styles.driverDot} style={{background:d.color}}/><Link href={`/drivers/${d.code}?season=${race.season}`}>{d.name} <small>{d.code} ↗</small></Link>
</td>
<td>{d.team}</td>
<td>{d.grid ?? '—'}</td>
<td>{d.gap||'—'}</td>
<td>{d.status}</td>
<td>{d.points}</td>
</tr>)}</tbody>
</table>
</div>
</section>;
 return <>
<main className={styles.main}>
<section className={styles.heading}>
<div>
<h1>{race.name} {race.season}</h1>
<p>{new Date(race.date+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})}<span>•</span>{race.circuit}<span>•</span>{race.totalLaps} laps<span>•</span>Completed</p>
</div>
<div className={styles.seasonSelector}>
<label className={styles.srOnly} htmlFor="season-select">Select season</label>
<select id="season-select" value={race.season} onChange={e=>router.push(`/races?season=${e.target.value}`)}>{[...years].reverse().map(year=><option key={year} value={year}>{year}</option>)}</select>
<img width="28" height="19" src={`/flags/${calendar.find(r=>r.slug===race.slug)?.flag||'bh'}.svg`} alt=""/>
<label className={styles.srOnly} htmlFor="race-select">Select a Grand Prix</label>
<select id="race-select" value={race.slug} onChange={e=>router.push(`/races/${race.season}/${e.target.value}`)}>
{calendar.map(r=><option key={r.slug} value={r.slug}>Round {r.round} · {r.label} Grand Prix</option>)}
</select>
</div>
</section>
<nav className={styles.tabs} aria-label="Race views">{tabs.map(t=>
<button key={t} aria-current={tab===t?'page':undefined} className={tab===t?styles.active:''} onClick={()=>update({tab:t})}>{t[0].toUpperCase()+t.slice(1)}</button>)}</nav>
 {tab==='track'&&<><section className={styles.driverComparison}>{driverCard(first,0)}<span className={styles.vs}>VS</span>{driverCard(second,1)}</section>{trackView}{trackDetails}</>}
 {tab==='replay'&&<><section className={styles.driverComparison}>{driverCard(first,0)}<span className={styles.vs}>VS</span>{driverCard(second,1)}</section><RaceReplay key={`${race.season}/${race.slug}`} race={race} track={race.track} selected={first.code} rival={second.code} onSelect={code=>update({a:code,...(code===second.code?{b:first.code}:{})})} onPair={(a,b)=>update({a,b})} compounds={compounds}/></>}
 {(tab==='overview'||tab==='strategy')&&trackView}
 {(tab==='compare'||tab==='pace')&&<>
<section className={styles.driverComparison}>{driverCard(first,0)}<span className={styles.vs}>VS</span>{driverCard(second,1)}</section>
{trackView}
<div className={styles.controls}>
<span>Lap range</span>
<div className={styles.rangeChips}>
<button className={start===1&&end===race.totalLaps?styles.selected:''} onClick={()=>update({start:null,end:null,lap:null})}>Full race</button>{Array.from({length:Math.ceil(race.totalLaps/10)},(_,i)=>{const s=i*10+1,e=Math.min((i+1)*10,race.totalLaps);
 return <button key={s} className={start===s&&end===e?styles.selected:''} onClick={()=>update({start:String(s),end:String(e),lap:null})}>{s}–{e}</button>})}</div>
<button className={styles.compareButton} onClick={()=>update({tab:'compare',a:second.code,b:first.code})}>
<ArrowsLeftRight weight="bold" size={19}/>Swap drivers</button>
</div>
<div className={styles.chartHeading}>
<div>
<h2>Lap pace</h2>
<p>Lap time (mm:ss) · lower is faster</p>
</div>
<div className={styles.legend}>{selected.map((d,i)=>
<span key={d.code}>
<i style={{background:d.color}}/>{i===1&&d.color.toLowerCase()===first.color.toLowerCase()?'dashed · ':''}<b>{d.code}</b>{d.name}</span>)}</div>
</div>
<label className={styles.filter}>
<input type="checkbox" checked={eligibleOnly} onChange={e=>setEligibleOnly(e.target.checked)}/>Eligible green-flag laps only <Link href="/about">How laps are filtered ↗</Link>
</label>{pacePlot()}<label className={styles.lapPicker}>Inspect lap <select value={selectedLap ?? ''} onChange={e => update({lap:e.target.value || null})}>
<option value="">Choose a lap</option>{Array.from({length:end-start+1},(_,i)=>
<option key={start+i} value={start+i}>Lap {start+i}</option>)}</select>
</label>{selectedLap&&<div className={styles.lapDetails} role="status">
<b>Lap {selectedLap}</b>{selected.map(d=>{const l=race.laps.find(l=>l.driver===d.code&&l.number===selectedLap);
 return <span key={d.code}>
<b style={{color:d.color}}>{d.code}</b> {time(l?.generated?null:l?.timeSeconds)} · {l?.compound||'No lap data'}{l?.generated?' · generated row: timing and position not observed':''}{l?.tyreLife!=null?` · tyre age ${l.tyreLife} laps`:''}{l&&!l.eligible?' · excluded from eligible pace':''}</span>})}<button aria-label="Clear selected lap" onClick={()=>update({lap:null})}>×</button>
</div>}<h2 className={styles.stintTitle}>Tyre stints</h2>{tyreRows(selected)}<section className={styles.metrics}>
<article>
<h3>Finishing position</h3>
<p>Race result</p>{selected.map(d=>
<div key={d.code}>
<b style={{color:d.color}}>{d.code}</b>
<strong>{d.position == null ? '—' : `P${d.position}`} </strong>
</div>)}</article>
<article>
<h3>Fastest eligible lap</h3>
<p>Within selected lap range</p>
<div className={styles.paired}>{selected.map((d,i)=>
<section key={d.code}>
<b style={{color:d.color}}>{d.code}</b>
<strong>{time(stats[i].fastest?.timeSeconds)}</strong>
<small>{stats[i].fastest?`Lap ${stats[i].fastest?.number}`:'No eligible laps'}</small>
</section>)}</div>
</article>
<article>
<h3>Median eligible pace</h3>
<p>Green-flag laps · excludes pit in / out</p>
<div className={styles.paired}>{selected.map((d,i)=>
<section key={d.code}>
<b style={{color:d.color}}>{d.code}</b>
<strong>{time(stats[i].median)}</strong>
<small>{stats[i].count} eligible laps</small>
</section>)}</div>
</article>
</section>{tab==='compare'&&<Disclosure title="Explore sectors and consistency">
<div className={styles.tableScroll}>
<table>
<thead>
<tr>
<th>Metric</th>{selected.map(d=>
<th key={d.code}>{d.name}</th>)}</tr>
</thead>
<tbody>{[0,1,2].map(s=>
<tr key={s}>
<td>Median sector {s+1}</td>{stats.map((st,i)=>
<td key={i}>{st.sectors[s]?.toFixed(3)||'—'} s</td>)}</tr>)}<tr>
<td>Lap-time standard deviation</td>{stats.map((st,i)=>
<td key={i}>{st.deviation?.toFixed(3)||'—'} s</td>)}</tr>
</tbody>
</table>
</div>
<p className="muted">Observed pace varies with tyre age, traffic and conditions. Sector medians can have different counts when sector data is missing.</p>
</Disclosure>}</>}
 {tab==='overview'&&<>
<div className={styles.podium}>{race.drivers.slice(0,3).map(d=>
<article key={d.code}>
<span>{d.position == null ? '—' : `P${d.position}`} </span>
<h2>{d.name}</h2>
<p>{d.team}</p>
<b>{d.gap}</b>
</article>)}</div>{classification}<h2 className={styles.sectionTitle}>Position changes</h2>
<p className="muted">Recorded running positions across the race · hover to inspect drivers</p>{pacePlot(true)}</>}
 {tab==='strategy'&&<>
<h2 className={styles.sectionTitle}>Every stint. Every driver.</h2>
<p className="muted">Recorded tyre compounds across all {race.totalLaps} laps. Select a stint for tyre-set details.</p>
<div className={styles.compoundLegend}>{Object.entries(compounds).filter(([k])=>k!=='UNKNOWN').map(([name,color])=>
<span key={name}>
<i style={{background:color}}/>{name.toLowerCase()}</span>)}</div>{tyreRows(race.drivers)}</>}
 {(tab==='overview'||tab==='strategy')&&<Disclosure title={`Race control messages (${race.events.length})`}>
<ul className={styles.events}>{race.events.map((e,i)=>
<li key={i}>
<span>{e.lap!=null?`Lap ${e.lap}`:'Session event'} · {e.category}</span>
<p>{e.message}</p>
</li>)}</ul>
</Disclosure>}
 {stintDetails && <div className={styles.lapDetails} role="status">
<span>{stintDetails}</span>
<button aria-label="Clear selected stint" onClick={() => setStintDetails(null)}>×</button>
</div>}
 {tab !== 'overview' && tab !== 'track' && <Disclosure title="Full race classification">{classification}</Disclosure>}
 <p className={styles.dataNote}>Archived session · <a href="https://docs.fastf1.dev/">FastF1 {race.fastf1Version}</a> · Data updated {new Date(race.exportedAt).toISOString().slice(0,19).replace('T',' ')} UTC · Missing measurements are shown as gaps. <Link href="/about">About the data ↗</Link>
</p>
</main>
<footer className={styles.footer}>
<Trophy size={22} weight="fill" color="#ffcc39"/>
<span>{race.season} {race.name} — Podium <small>(official result)</small>
</span>{race.drivers.slice(0,3).map(d=>
<span key={d.code}>{d.position}. {d.name} <small>({d.code})</small> {d.position!=null&&d.position>1&&<small>{d.gap}</small>}</span>)}</footer>
</>;
}
