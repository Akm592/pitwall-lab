import Link from 'next/link';
import {notFound} from 'next/navigation';
import type {CSSProperties} from 'react';
import {seasons} from '@/lib/data';
import {driverSeason} from '@/lib/drivers';
import {classifiedPosition,getTeamProfiles} from '@/lib/teams';
import DriverPhoto from '@/components/DriverPhoto';
import SeasonSelect from '@/components/SeasonSelect';
import {driverPhotos} from '@/lib/driver-photos';
import shared from '../../drivers/drivers.module.css';
import styles from '../teams.module.css';
import TeamLogo from '@/components/TeamLogo';
import {teamLogos} from '@/lib/team-logos';

type Props={params:Promise<{team:string}>;searchParams:Promise<{season?:string}>};
export async function generateMetadata({params,searchParams}:Props){
 const {team:slug}=await params,season=driverSeason((await searchParams).season),team=getTeamProfiles(season).find(item=>item.slug===slug);
 return {title:team?`${team.name} · ${season}`:'Team unavailable',description:`Recorded race points, wins, podiums and drivers for ${team?.name||slug} in ${season}.`,alternates:{canonical:`/teams/${slug}?season=${season}`}};
}
const label=(position:number|null,status:string)=>/disqualified/i.test(status)?'DSQ':/did not (pre)?qualify/i.test(status)?'DNQ':/excluded/i.test(status)?'EXC':/did not start|withdrawn/i.test(status)?'DNS':position==null?'—':`P${position}`;

export default async function TeamPage({params,searchParams}:Props){
 const {team:slug}=await params,season=driverSeason((await searchParams).season),teams=getTeamProfiles(season),team=teams.find(item=>item.slug===slug);
 if(!team){
   // Only the modern seasons are searched for other years of this team; scanning every season back to 1950 is not worth a missing page.
   const available=seasons.filter(year=>year>=2018&&getTeamProfiles(year).some(item=>item.slug===slug));
   if(!available.length)notFound();
   return <main className={shared.page}><Link className={shared.back} href={`/teams?season=${season}`}>← All teams</Link><h1>No {season} race records</h1><p className="muted">This team has no entries in the imported races for this season.</p><nav className="seasonLinks" aria-label="Available team seasons">{available.map(year=><Link key={year} href={`/teams/${slug}?season=${year}`}>{year}</Link>)}</nav></main>;
 }
 const rank=teams.indexOf(team)+1;
 return <main className={shared.page} style={{'--team':team.color} as CSSProperties}>
   <Link className={shared.back} href={`/teams?season=${season}`}>← All teams</Link>
   <section className={`${shared.hero} ${styles.hero}`}>
     <div className={shared.identity}><p className="eyebrow">{season} TEAM FILE / P{rank} OF {teams.length}</p><h1>{team.name}</h1><div className={shared.team}><i aria-hidden="true"/>{team.drivers.map(seat=>seat.driver.name).join(' · ')}</div><p className={shared.heroText}>Two cars. One garage. Every point they brought home.</p>
     <SeasonSelect season={season} years={seasons} href={`/teams/${slug}`}/></div>
     <div className={styles.rankPlate}><TeamLogo logo={teamLogos[slug]} name={team.name} color={team.color} size="hero"/><span aria-hidden="true">P{rank}</span><small>by recorded race points</small></div>
   </section>
   <section className={shared.metrics} aria-label="Season team statistics">{[['Race points',team.points],['Wins',team.wins],['Podiums',team.podiums],['Double points finishes',team.doubles]].map(([name,value])=><article key={name} className={shared.metric}><span>{name}</span><strong>{value}</strong></article>)}</section>
   <section className={shared.raceSection}><div className={shared.sectionHeading}><div><p className="eyebrow">THE LINE-UP</p><h2>Who drove the cars.</h2></div><span>{team.drivers.length} {team.drivers.length===1?'driver':'drivers'} · {team.points?'share of the team’s points shown':'no points recorded'}</span></div>
     <div className={styles.drivers}>{team.drivers.map(seat=><Link key={seat.driver.code} href={`/drivers/${seat.driver.code}?season=${season}`} className={`${shared.resultCard} ${styles.seat}`}>
       <div className={styles.seatPhoto}><DriverPhoto key={driverPhotos[seat.driver.code]?.src||seat.driver.code} photo={driverPhotos[seat.driver.code]} name={seat.driver.name} code={seat.driver.code} number={seat.driver.number} sizes="140px"/></div>
       <div className={styles.seatBody}><span>{seat.driver.code} · #{seat.driver.number}</span><h3>{seat.driver.name}</h3>
        <div className={styles.share} role="img" aria-label={`${team.points?Math.round(seat.points/team.points*100):0} percent of the team's points`}><i style={{width:`${team.points?seat.points/team.points*100:0}%`}}/></div>
        <p><b>{seat.points}</b> pts · <b>{seat.races}</b> {seat.races===1?'race':'races'} · best <b>{seat.best==null?'—':`P${seat.best}`}</b></p></div>
     </Link>)}</div>
   </section>
   <section className={shared.raceSection}><div className={shared.sectionHeading}><div><p className="eyebrow">THE RACE LOG</p><h2>Every weekend, both cars.</h2></div><span>{team.results.length} races entered · best result {team.best==null?'—':`P${team.best}`}</span></div>
     <div className={shared.resultGrid}>{team.results.map((result,index)=>{const [first,second]=result.entries;
      return <Link className={shared.resultCard} key={`${result.slug}-${index}`} href={`/races/${season}/${result.slug}?tab=compare&a=${first.code}${second?`&b=${second.code}`:''}`} style={{'--delay':`${Math.min(index,5)*50}ms`} as CSSProperties}>
       <div className={shared.resultTop}><span>ROUND {String(result.round).padStart(2,'0')}</span><strong className={result.best!=null&&result.best<=3?shared.podium:''}>{result.points} <small className={styles.pts}>pts</small></strong></div>
       <h3>{result.name}</h3><p>{result.date}</p>
       <div className={shared.resultMetrics}>{result.entries.map(entry=><span key={entry.code}>{entry.name} <b>{label(classifiedPosition(entry),entry.status)}{entry.points?` · ${entry.points} pts`:''}</b></span>)}</div>
       <span className={shared.resultLink}>Compare the team-mates ↗</span>
      </Link>;})}</div>
   </section>
   <p className={shared.note}>Based on imported race results only; excludes sprint points and championship counting adjustments, so totals can differ from the official constructors' standings. Teams follow the name recorded for each race entry.{teamLogos[slug]&&<> Logo: <a href={teamLogos[slug].sourceUrl}>{teamLogos[slug].title}</a>, {teamLogos[slug].license} via Wikimedia Commons; a trademark of the team, shown only to identify it.</>} <Link href="/image-credits">Image credits ↗</Link> · <Link href="/about">About the data ↗</Link></p>
 </main>;
}
