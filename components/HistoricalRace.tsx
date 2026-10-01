import type {ReactNode} from 'react';
import HistoricalRaceViews from './HistoricalRaceViews';
import Link from 'next/link';
import type {Race} from '@/lib/data';
import SeasonSelect from './SeasonSelect';
import TrackMap from './TrackMap';
import styles from './Dashboard.module.css';

export default function HistoricalRace({race,years,trackDetails}:{race:Race;years:number[];trackDetails:ReactNode}){
 return <main className={styles.main}>
  <Link href={`/races?season=${race.season}`}>← {race.season} race archive</Link>
  <section className={styles.heading}><div><p className="eyebrow">ROUND {race.round} · HISTORICAL RESULTS</p><h1>{race.name} {race.season}</h1><p>{race.date} · {race.circuit} · {race.totalLaps} laps</p></div><SeasonSelect season={race.season} years={years} href="/races"/></section>
  <HistoricalRaceViews track={<><TrackMap track={race.track} drivers={race.drivers.slice(0,2)} laps={[]} start={1} end={race.totalLaps} selectedLap={null}/>{trackDetails}</>} overview={<>
  <p className="muted">Recorded race classification. Lap pace, sectors, tyre stints and race-control timing are not included in this dataset.</p>
  <TrackMap track={race.track} drivers={race.drivers.filter((driver,index,all)=>all.findIndex(item=>item.code===driver.code)===index).slice(0,2)} laps={[]} start={1} end={race.totalLaps} selectedLap={null}/>
  <div className={styles.podium}>{race.drivers.filter(driver=>driver.position!=null&&driver.position<=3).map((driver,index)=><article key={index}><span>P{driver.position}</span><h2>{driver.name}</h2><p>{driver.team}</p><b>{driver.gap}</b></article>)}</div>
  <section className={styles.classification}><h2>Race classification</h2><div className={styles.tableScroll}><table><thead><tr><th>Pos</th><th>Driver</th><th>Team</th><th>Grid</th><th>Time / gap</th><th>Status</th><th>Race points</th></tr></thead><tbody>{race.drivers.map((driver,index)=><tr key={index}><td>{driver.position??'—'}</td><td><Link href={`/drivers/${driver.code}?season=${race.season}`}>{driver.name}</Link></td><td>{driver.team}</td><td>{driver.grid??'—'}</td><td>{driver.gap||'—'}</td><td>{driver.status}</td><td>{driver.points??'—'}</td></tr>)}</tbody></table></div></section>
  </>}/>
  <p className={styles.dataNote}>Source: <a href={race.sourceUrl||'https://api.jolpi.ca/ergast/f1/'}>Jolpica race results</a>. Historical shared drives may create multiple entries for a driver. Points are recorded race awards; championship counting rules can differ. <Link href="/about">About the data ↗</Link></p>
 </main>;
}
