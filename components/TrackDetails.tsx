import Link from 'next/link';
import {getCalendar,loadRace,seasons,type Race} from '@/lib/data';
import {summarize,time} from '@/lib/stats';
import styles from './Dashboard.module.css';

export default function TrackDetails({race}:{race:Race}){
 const normalize=(name:string)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 // Match the venue rather than the GP name, which can move between circuits.
 const history=seasons.flatMap(year=>getCalendar(year).filter(entry=>normalize(entry.circuit)===normalize(race.circuit)).flatMap(entry=>{
  const session=loadRace(year,entry.slug);
  return session?[{year,round:session.round,slug:entry.slug,name:session.name,date:session.date,laps:session.totalLaps,winners:session.drivers.filter(driver=>driver.position===1)}]:[];
 })).sort((a,b)=>b.year-a.year||b.round-a.round);
 const fastest=summarize(race.laps).fastest;
 const driver=race.drivers.find(driver=>driver.code===fastest?.driver);
 const poleWins=history.filter(entry=>entry.winners.some(winner=>winner.grid===1)).length;
 const knownGrid=history.filter(entry=>entry.winners.some(winner=>winner.grid!=null&&winner.grid>0)).length;
 return <div className={styles.trackDetails}>
  <section className={styles.trackIntro}><p className="eyebrow">CIRCUIT DOSSIER</p><h2>{race.circuit}</h2><p className="muted">The venue, its race history, and the numbers behind this session.</p></section>
  <section className={styles.trackStats} aria-label="Circuit statistics">
   <article><span>Archived races</span><strong>{history.length}</strong><small>{history.length?history[history.length-1].year+'–'+history[0].year:'No matching archive'}</small></article>
   <article><span>This race</span><strong>{race.totalLaps} <small>laps</small></strong><small>Recorded race length · {race.season}</small></article>
   <article><span>Wins from pole</span><strong>{knownGrid?Math.round(poleWins/knownGrid*100)+'%':'—'}</strong><small>{poleWins} of {knownGrid} races with known winner grid</small></article>
   <article><span>Fastest eligible session lap</span><strong>{time(fastest?.timeSeconds)}</strong><small>{fastest?(driver?.name||fastest.driver)+' · lap '+fastest.number:'Lap timing unavailable'}</small></article>
  </section>
  <section className={styles.trackIntro}><h3>Layout & timing coverage</h3><p className="muted">{race.track?'This '+race.season+' layout uses an observed FastF1 race position trace: '+race.track.reference.driver+', lap '+race.track.reference.lap+'. Sector boundaries are approximate.':'No complete position trace is available for this session.'} Fastest eligible lap refers to this session’s imported, filtered race laps; it is not an official circuit lap record.</p></section>
  <section className={styles.classification}><p className="eyebrow">THROUGH THE YEARS</p><h2>Race history at this circuit</h2><p className="muted">Imported completed races at the same named venue, across different Grand Prix names. Circuit configurations and race lengths may have changed.</p><div className={styles.tableScroll}><table><thead><tr><th>Season</th><th>Race</th><th>Date</th><th>Winner</th><th>Winning team</th><th>Winner grid</th><th>Laps</th></tr></thead><tbody>{history.map(entry=><tr key={entry.year+'-'+entry.slug}><td>{entry.year}</td><td><Link href={'/races/'+entry.year+'/'+entry.slug}>{entry.name} ↗</Link></td><td>{entry.date}</td><td>{entry.winners.map(winner=>winner.name).join(' / ')||'—'}</td><td>{[...new Set(entry.winners.map(winner=>winner.team))].join(' / ')||'—'}</td><td>{entry.winners.map(winner=>winner.grid!=null&&winner.grid>0?'P'+winner.grid:'—').join(' / ')||'—'}</td><td>{entry.laps}</td></tr>)}</tbody></table></div></section>
  <p className={styles.dataNote}>History matches circuit names in the local archive, ignoring accents and punctuation. Renamed venues can be omitted. Statistics describe imported races. Official circuit length, corner count and lap records are not inferred from the diagram.</p>
 </div>;
}
