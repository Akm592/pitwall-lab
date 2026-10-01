'use client';
import {useId,useState} from 'react';
import type {CSSProperties} from 'react';
import type {Driver,Lap,TrackLayout} from '@/lib/data';
import {summarize} from '@/lib/stats';
import styles from './TrackMap.module.css';

const colors=['#79e5f5','#b7a8ff','#ffb58f'];
const keys=['sector1','sector2','sector3'] as const;
const seconds=(value:number|null|undefined)=>value==null?'—':`${value.toFixed(3)}s`;

export default function TrackMap({track,drivers,laps,start,end,selectedLap,onLapChange}:{track?:TrackLayout|null;drivers:Driver[];laps:Lap[];start:number;end:number;selectedLap:number|null;onLapChange?:(lap:number|null)=>void}){
 const titleId=useId(),[active,setActive]=useState<number|null>(null);
 const times=drivers.map(driver=>{
  const sample=laps.filter(lap=>lap.driver===driver.code&&lap.number>=start&&lap.number<=end);
  const row=selectedLap==null?null:sample.find(lap=>lap.number===selectedLap);
  const values=selectedLap==null?summarize(sample).sectors:keys.map(key=>row&&!row.generated?row[key]:null);
  const counts=keys.map(key=>sample.filter(lap=>lap.eligible&&lap.timeSeconds!=null&&lap[key]!=null).length);
  return {driver,values,counts,row};
 });
 const hasTiming=laps.length>0;
 const mode=selectedLap==null?`Eligible sector medians · laps ${start}–${end}`:`Recorded sectors · lap ${selectedLap}`;
 if(!hasTiming&&!track)return <section className={styles.panel} aria-labelledby={titleId}><p className="eyebrow">CIRCUIT AND SECTORS</p><h2 id={titleId}>Layout and sector data unavailable.</h2><p className={styles.note}>This archived dataset contains race classification only. A layout from another season is not substituted, and sector measurements are not estimated.</p></section>;
 return <section className={styles.panel} aria-labelledby={titleId}>
  <div className={styles.header}><div><p className="eyebrow">THE CIRCUIT, SECTOR BY SECTOR</p><h2 id={titleId}>Where the time is made.</h2><p>{hasTiming?mode:'Circuit layout and sector timing'}</p></div>
   {hasTiming&&onLapChange&&<label className={styles.lapPicker}>Sector view <select value={selectedLap??''} onChange={event=>onLapChange(event.target.value?Number(event.target.value):null)}><option value="">Sector medians</option>{Array.from({length:end-start+1},(_,index)=><option key={start+index} value={start+index}>Lap {start+index}</option>)}</select></label>}
  </div>
  <div className={styles.content}>
   <div className={styles.diagram}>
    {track?<svg viewBox="0 0 960 620" role="img" aria-label={`${track.season} ${track.circuit} layout. Sector 1 cyan, sector 2 violet, sector 3 coral. Sector times are also listed in the comparison cards.`}>
     {track.sectors.map((sector,index)=>{const x=index===0?20:720,y=index===2?508:24;return <line key={sector.number} x1={sector.anchor[0]} y1={sector.anchor[1]} x2={x+110} y2={index===2?y:y+94} stroke={colors[index]} strokeWidth="2" strokeDasharray="5 8" opacity=".3"/>})}
     {track.sectors.map(sector=><polyline key={`base-${sector.number}`} points={sector.points.map(point=>point.join(',')).join(' ')} fill="none" stroke="#060c1b" strokeWidth="19" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/>)}
     {track.sectors.map((sector,index)=><g key={sector.number} opacity={active==null||active===sector.number?1:.25} className={styles.sector} style={{'--sector-color':colors[index]} as CSSProperties}><title>{`Sector ${sector.number}: ${times.map(item=>`${item.driver.code} ${seconds(item.values[index])}`).join(', ')}`}</title><polyline className={styles.trackHalo} points={sector.points.map(point=>point.join(',')).join(' ')} fill="none" stroke={colors[index]} strokeWidth={active===sector.number?22:17} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/><polyline className={styles.trackLine} points={sector.points.map(point=>point.join(',')).join(' ')} fill="none" stroke={colors[index]} strokeWidth={active===sector.number?10:7} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"/><circle className={styles.boundary} cx={sector.end[0]} cy={sector.end[1]} r="7" fill="#101a30" stroke={colors[index]} strokeWidth="3"/></g>)}
     <g transform={`translate(${track.startFinish[0]},${track.startFinish[1]})`}><circle r="9" fill="#edf3ff" stroke="#0b1529" strokeWidth="4"/><text x={track.startFinish[0]>720?-15:15} textAnchor={track.startFinish[0]>720?'end':'start'} y="-16" fill="#edf3ff" fontSize="20" fontWeight="700" paintOrder="stroke" stroke="#0b1529" strokeWidth="6">START / FINISH</text></g>
     {[1,2,3].map((sector,index)=>{const x=index===0?20:720,y=index===2?508:24;return <g key={sector} transform={`translate(${x},${y})`}><rect width="220" height="94" rx="14" fill="#111d35" stroke={colors[index]} strokeOpacity=".45"/><text x="15" y="26" fill={colors[index]} fontSize="20" fontWeight="700">SECTOR {sector}</text>{times.slice(0,2).map((item,row)=><text className={styles.calloutTime} key={item.driver.code} x="15" y={53+row*28} fill="#edf3ff">{item.driver.code} {seconds(item.values[index])}</text>)}</g>})}
    </svg>:<div className={styles.unavailable}><span aria-hidden="true">S1 / S2 / S3</span><h3>Layout unavailable for this session.</h3><p>Season-specific position telemetry has not been imported. {hasTiming?'Recorded sector comparisons remain available below.':'This historical dataset includes race classification only.'}</p></div>}
    {track&&<p className={styles.caption}>{track.season} race layout · <a href="https://docs.fastf1.dev/">FastF1 position telemetry</a> · reference {track.reference.driver}, lap {track.reference.lap}. Sector boundaries are aligned to recorded times using interpolated position samples; locations are approximate.</p>}
   </div>
   <div className={styles.cards}>
    {[1,2,3].map((sector,index)=>{
     const first=times[0]?.values[index],second=times[1]?.values[index];
     const difference=first!=null&&second!=null?second-first:null;
     return <button type="button" key={sector} className={styles.card} disabled={!track} aria-pressed={track?active===sector:undefined} onClick={()=>setActive(active===sector?null:sector)} style={{'--sector-color':colors[index],borderColor:active===sector?colors[index]:undefined} as CSSProperties}>
      <span className={styles.cardHeading}><i style={{background:colors[index]}}/>SECTOR {sector}<span>{!track?'No layout':active===sector?'Highlighted':'Highlight ↗'}</span></span>
      {times.map(item=><span className={styles.driverRow} key={item.driver.code}><span><i style={{background:item.driver.color}}/>{item.driver.code}</span><strong>{seconds(item.values[index])}</strong><small>{selectedLap==null?`${item.counts[index]} eligible samples`:item.row?.generated?'No observed timing':!item.row?'No lap record':item.row.eligible?'Eligible lap':'Excluded from eligible pace'}</small></span>)}
      <span className={styles.delta}>{difference==null?'Comparison unavailable':Math.abs(difference)<.0005?'Equal sector time':`${difference>0?times[0].driver.code:times[1].driver.code} ${Math.abs(difference).toFixed(3)}s quicker`}</span>
     </button>;
    })}
   </div>
  </div>
  <p className={styles.note}>{!hasTiming?'Sector measurements are not included in this historical dataset.':selectedLap==null?'Sector medians use available measurements from eligible laps in the selected range; sample counts can differ. They do not add up to a single recorded lap. Different traffic, tyres and conditions can affect sector comparisons.':'Both drivers show the same lap number. Generated rows and missing measurements show a dash. Noneligible recorded laps are labeled. Different traffic, tyres and conditions can affect sector comparisons.'}</p>
 </section>;
}
