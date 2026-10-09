import Link from 'next/link';
import type {CSSProperties} from 'react';
import {seasons} from '@/lib/data';
import SeasonSelect from '@/components/SeasonSelect';
import {driverSeason} from '@/lib/drivers';
import {getTeamProfiles} from '@/lib/teams';
import shared from '../drivers/drivers.module.css';
import styles from './teams.module.css';
import TeamLogo from '@/components/TeamLogo';
import {teamLogos} from '@/lib/team-logos';

type Props={searchParams:Promise<{season?:string}>};
export async function generateMetadata({searchParams}:Props){const season=driverSeason((await searchParams).season);return {title:`${season} teams`,description:`Explore the teams of ${season}: recorded race points, wins, podiums and driver line-ups.`,alternates:{canonical:`/teams?season=${season}`}};}

export default async function Teams({searchParams}:Props){
 const season=driverSeason((await searchParams).season),teams=getTeamProfiles(season),top=teams[0]?.points||0;
 return <main className={shared.page}>
   <header className={shared.directoryHero}><p className="eyebrow">THE GARAGES BEHIND THE GRID</p><h1>Meet the teams.</h1><p className="muted">Every constructor. Two cars, one total. A season told through what both of them scored.</p>
   <SeasonSelect season={season} years={seasons} href="/teams"/>
   <p className={shared.note}>{teams.length} teams in imported {season} race results · Ordered by recorded race points; excludes sprints and championship counting adjustments.</p></header>
   <div className={styles.grid}>{teams.map((team,index)=><Link key={team.slug} href={`/teams/${team.slug}?season=${season}`} className={`${shared.driverCard} ${styles.teamCard}`} style={{'--team':team.color,'--delay':`${Math.min(index,6)*70}ms`} as CSSProperties}>
     <div className={styles.cardTop}><span className={styles.rank} aria-label={`Rank ${index+1}`}>{String(index+1).padStart(2,'0')}</span><TeamLogo logo={teamLogos[team.slug]} name={team.name} color={team.color}/></div>
     <h2>{team.name}</h2>
     <ul className={styles.lineup} aria-label="Drivers">{team.drivers.map(seat=><li key={seat.driver.code}><b>{seat.driver.code}</b>{seat.driver.name}<span>{seat.points} pts</span></li>)}</ul>
     <div className={styles.share} role="img" aria-label={`${top?Math.round(team.points/top*100):0} percent of the leading team's points`}><i style={{width:`${top?team.points/top*100:0}%`}}/></div>
     <div className={shared.cardStats}><span><strong>{team.points}</strong>race points</span><span><strong>{team.wins}</strong>wins</span><span><strong>{team.podiums}</strong>podiums</span></div>
     <div className={shared.cardFooter}>Explore team <span aria-hidden="true">↗</span></div>
   </Link>)}</div>
   <p className={shared.note}>Based on imported race results only; this is not the official constructors' championship. Teams follow the name recorded for each race entry, so a renamed team or a driver who moved mid-season appears under each name. Team logos are trademarks of their teams, shown only to identify them; teams without an imported logo show a badge. <Link href="/image-credits">Logo sources ↗</Link> · <Link href="/about">About the data ↗</Link></p>
 </main>;
}
