import Link from 'next/link';
import {notFound} from 'next/navigation';
import type {CSSProperties} from 'react';
import {seasons} from '@/lib/data';
import {driverSeason,getDriverProfiles} from '@/lib/drivers';
import {time} from '@/lib/stats';
import DriverTrend from '@/components/DriverTrend';
import DriverPhoto from '@/components/DriverPhoto';
import SeasonSelect from '@/components/SeasonSelect';
import {driverPhotos} from '@/lib/driver-photos';
import styles from '../drivers.module.css';

type Props={params:Promise<{code:string}>;searchParams:Promise<{season?:string}>};
export async function generateMetadata({params,searchParams}:Props){
 const {code}=await params,season=driverSeason((await searchParams).season),profile=getDriverProfiles(season).find(p=>p.driver.code===code);
 return {title:profile?`${profile.driver.name} · ${season}`:'Driver unavailable',description:`Recorded race results, podiums and lap pace for ${profile?.driver.name||code} in ${season}.`,alternates:{canonical:`/drivers/${code}?season=${season}`}};
}

export default async function DriverPage({params,searchParams}:Props){
 const {code}=await params,season=driverSeason((await searchParams).season),profile=getDriverProfiles(season).find(p=>p.driver.code===code);
 const available=profile?seasons:seasons.filter(year=>getDriverProfiles(year).some(p=>p.driver.code===code));
 if(!available.length)notFound();
 if(!profile)return <main className={styles.page}><Link className={styles.back} href={`/drivers?season=${season}`}>← All drivers</Link><h1>No {season} race records</h1><p className="muted">This driver has no entries in the imported races for this season.</p><nav className="seasonLinks" aria-label="Available driver seasons">{available.map(year=><Link key={year} href={`/drivers/${code}?season=${year}`}>{year}</Link>)}</nav></main>;
 const {driver,results}=profile;
 const photo=driverPhotos[code];
 return <main className={styles.page} style={{'--team':driver.color} as CSSProperties}>
   <Link className={styles.back} href={`/drivers?season=${season}`}>← All drivers</Link>
   <section className={styles.hero}>
     <div className={styles.identity}><p className="eyebrow">{season} DRIVER FILE / {driver.code}</p><h1>{driver.name}</h1><div className={styles.team}><i aria-hidden="true"/>{driver.team}<span>#{driver.number}</span></div><p className={styles.heroText}>The results. The racecraft. The season so far.</p>
     <SeasonSelect season={season} years={seasons} href={`/drivers/${code}`}/></div>
     <div className={styles.portraitFrame}><DriverPhoto key={photo?.src||code} photo={photo} name={driver.name} code={code} number={driver.number} sizes="(max-width: 640px) 90vw, (max-width: 1000px) 40vw, 450px" priority/><span className={styles.portraitTag}>{driver.code} / #{driver.number}</span></div>
   </section>
   {photo&&<p className={styles.photoCredit}><a href={photo.sourceUrl}>{photo.title}</a> · Photo: {photo.author} · <a href={photo.licenseUrl}>{photo.license}</a>. {photo.changes} Historical photo; uniform may differ from the selected season. <Link href="/image-credits">Image credits ↗</Link></p>}
   <section className={styles.metrics} aria-label="Season race statistics">{[['Race points',profile.points],['Wins',profile.wins],['Podiums',profile.podiums],['Best result',profile.best==null?'—':`P${profile.best}`]].map(([label,value])=><article key={label} className={styles.metric}><span>{label}</span><strong>{value}</strong></article>)}</section>
   <section className={styles.trend}><div className={styles.sectionHeading}><div><p className="eyebrow">THE SEASON, ROUND BY ROUND</p><h2>Race results in motion.</h2></div><span>{results.length} race entries · {results.some(result=>result.hasTiming)?`${profile.eligibleLaps.toLocaleString('en-GB')} eligible laps`:'Classification data only'}</span></div>
     <DriverTrend color={driver.color} season={season} results={results.map(result=>({round:result.round,slug:result.slug,name:result.name,position:/disqualified|did not start|did not qualify|did not prequalify|withdrawn|excluded/i.test(result.driver.status)?null:result.driver.position,status:result.driver.status}))}/>
     <p className={styles.note}>Lower position is better. Disqualified, DNS, DNQ and missing positions leave gaps. Select a point to explore that race.</p>
   </section>
   <section className={styles.raceSection}><div className={styles.sectionHeading}><div><p className="eyebrow">THE RACE LOG</p><h2>Every weekend, a chapter.</h2></div><span>Average result position {profile.average?.toFixed(1)??'—'}</span></div>
     <div className={styles.resultGrid}>{results.map((result,index)=><Link className={styles.resultCard} key={`${result.slug}-${index}`} href={`/races/${season}/${result.slug}?tab=compare&a=${driver.code}`} style={{'--delay':`${Math.min(index,5)*50}ms`} as CSSProperties}>
       <div className={styles.resultTop}><span>ROUND {String(result.round).padStart(2,'0')}</span><strong className={result.driver.position!=null&&result.driver.position<=3?styles.podium:''}>{/disqualified/i.test(result.driver.status)?'DSQ':/did not (pre)?qualify/i.test(result.driver.status)?'DNQ':/excluded/i.test(result.driver.status)?'EXC':/did not start|withdrawn/i.test(result.driver.status)?'DNS':result.driver.position==null?'—':`P${result.driver.position}`}</strong></div>
       <h3>{result.name}</h3><p>{result.date} · {result.driver.status}</p><div className={styles.resultMetrics}><span>Recorded race points <b>{result.driver.points??'—'}</b></span><span>{result.hasTiming?'Median eligible pace':'Data coverage'} <b>{result.hasTiming?time(result.pace.median):'Race classification'}</b></span>{result.hasTiming&&<span>Eligible laps <b>{result.pace.count}</b></span>}</div><span className={styles.resultLink}>Explore session ↗</span>
     </Link>)}</div>
   </section>
   <p className={styles.note}>Based on imported race results only; excludes sprint points and championship counting adjustments. Historical shared drives can produce multiple result entries. This is not official championship standings. Average position excludes DNS, DNQ, withdrawn, excluded and disqualified entries. Team and car number reflect the latest imported appearance. Pace is not adjusted for fuel, traffic or weather. <Link href="/about">About the data ↗</Link></p>
 </main>;
}
