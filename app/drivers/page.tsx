import Link from 'next/link';
import type {CSSProperties} from 'react';
import {seasons} from '@/lib/data';
import SeasonSelect from '@/components/SeasonSelect';
import {driverSeason,getDriverProfiles} from '@/lib/drivers';
import styles from './drivers.module.css';
import DriverPhoto from '@/components/DriverPhoto';
import {driverPhotos} from '@/lib/driver-photos';

type Props={searchParams:Promise<{season?:string}>};
export async function generateMetadata({searchParams}:Props){const season=driverSeason((await searchParams).season);return {title:`${season} drivers`,description:`Explore individual driver profiles and recorded race performances from ${season}.`,alternates:{canonical:`/drivers?season=${season}`}};}

export default async function Drivers({searchParams}:Props){
 const season=driverSeason((await searchParams).season),profiles=getDriverProfiles(season);
 return <main className={styles.page}>
   <header className={styles.directoryHero}><p className="eyebrow">THE PEOPLE BEHIND THE PACE</p><h1>Meet the grid.</h1><p className="muted">Every driver. Every recorded race. A season told through their results.</p>
   <SeasonSelect season={season} years={seasons} href="/drivers"/>
   <p className={styles.note}>{profiles.length} drivers in imported {season} race results · Ordered by recorded race points; excludes sprints and championship counting adjustments.</p></header>
   <div className={styles.grid}>{profiles.map((profile,index)=><Link key={profile.driver.code} href={`/drivers/${profile.driver.code}?season=${season}`} className={styles.driverCard} style={{'--team':profile.driver.color,'--delay':`${Math.min(index,6)*70}ms`} as CSSProperties}>
     <div className={styles.cardPhoto}><DriverPhoto key={driverPhotos[profile.driver.code]?.src||profile.driver.code} photo={driverPhotos[profile.driver.code]} name={profile.driver.name} code={profile.driver.code} number={profile.driver.number} sizes="(max-width:640px) 90vw, (max-width:1000px) 45vw, 400px"/></div>
     <div className={styles.cardTop}><span>{profile.driver.code}</span><span className={styles.carNumber} aria-hidden="true">{profile.driver.number}</span></div>
     <h2>{profile.driver.name}</h2><p>{profile.driver.team}</p>
     <div className={styles.cardStats}><span><strong>{profile.points}</strong>race points</span><span><strong>{profile.podiums}</strong>podiums</span></div>
     <div className={styles.cardFooter}>Explore driver <span aria-hidden="true">↗</span></div>
   </Link>)}</div>
   <p className={styles.photoCredit}>Portraits are historical photographs and may show a different team uniform. <Link href="/image-credits">Photographers, sources and image licenses ↗</Link></p>
 </main>;
}
