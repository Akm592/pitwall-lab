import Link from 'next/link';
import type {CSSProperties} from 'react';
import {ArrowRight} from '@phosphor-icons/react/dist/ssr';
import {getCalendar, loadRace, seasons} from '@/lib/data';
import type {Race} from '@/lib/data';
import {seasonOverview, racePreview} from '@/lib/home';
import {loadStandings} from '@/lib/standings';
import {teamSlug} from '@/lib/teams';
import HomeRaceChart from '@/components/HomeRaceChart';
import styles from '@/app/home.module.css';
import {pageMetadata} from '@/lib/seo';
import {siteUrl} from '@/lib/site';
import StructuredData from '@/components/StructuredData';

export const revalidate = 3600;
export const metadata = pageMetadata('F1 Race Pace & Lap Time Analysis',
  'Compare F1 lap times, explore race results and analyse tyre strategy. Browse historical Formula 1 results and recorded race pace with Pitwall Lab.', '/');
const date = (value: string) => new Date(value.slice(0, 10) + 'T12:00:00Z').toLocaleDateString('en-GB',
  {day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'});
const raceUrl = (race: Race) => `/races/${race.season}/${race.slug}`;
const raceName = (name: string) => name.replace(/ Grand Prix$/, '');
const arrow = <ArrowRight size={20} aria-hidden="true" />;

export default function Home() {
  const now = new Date();
  const season = seasons.filter(year => year <= now.getUTCFullYear()).at(-1) ?? seasons[seasons.length - 1];
  const calendar = getCalendar(season);
  const races = calendar.map(entry => loadRace(season, entry.slug)).filter((race): race is Race => race !== null);
  const {latest, recent, completed, next} = seasonOverview(calendar, races, now);
  const podium = latest ? [...latest.drivers].filter(driver => driver.position && driver.position <= 3)
    .sort((a, b) => a.position! - b.position!) : [];
  const preview = latest ? racePreview(latest) : [];
  const imported = loadStandings(season);
  const standings = imported && calendar.some(entry => entry.round === imported.round) ? imported : null;
  const standingsRace = calendar.find(entry => entry.round === standings?.round);
  const drivers = new Map(races.flatMap(race => race.drivers).map(driver => [driver.code, driver]));
  const leadingTeam = standings?.constructors.find(team => team.position === 1);
  const teamColor = races.flatMap(race => race.drivers).find(driver => teamSlug(driver.team) === teamSlug(leadingTeam?.name || ''))?.color;

  return <main className={styles.page}>
    <StructuredData data={{'@context': 'https://schema.org', '@type': 'WebSite',
      '@id': new URL('/#website', siteUrl).href, name: 'Pitwall Lab', alternateName: 'Pitwall Lab F1',
      url: new URL('/', siteUrl).href, inLanguage: 'en',
      description: 'Independent Formula 1 race analysis, lap time comparisons, tyre strategy and historical results.',
    }} />
    <section className={styles.hero} aria-labelledby="home-title">
      <div className={styles.intro}>
        <p className="eyebrow">F1 race pace &amp; tyre strategy</p>
        <h1 id="home-title">Understand{' '}<br />the race.{' '}<br /><span>Beyond the result.</span></h1>
        <p className={styles.description}>Explore Formula 1 results, compare lap pace, and see how tyre strategies shaped the race.</p>
        <div className={styles.actions}>
          <Link className={styles.primary} href={latest ? `${raceUrl(latest)}?tab=overview` : `/races?season=${season}`}>
            {latest ? 'Explore the latest race' : 'Explore the race archive'}{arrow}
          </Link>
          <Link className={styles.secondary} href="/races">Browse all races{arrow}</Link>
        </div>
        <p className={styles.updated}>Recorded data{latest ? ` · Latest available: ${raceName(latest.name)}` : ' · Explore the archive'}</p>
      </div>
      <section className={`${styles.glass} ${styles.preview}`} aria-labelledby="preview-title">
        <p className={styles.eyebrow}>{latest ? `Latest available race · ${date(latest.date)}` : `${season} season`}</p>
        <h2 id="preview-title">{latest ? raceName(latest.name) : 'Your next race story'}{latest && <span> / {season}</span>}</h2>
        {latest ? <>
          <ul className={styles.legend} aria-label="Compared drivers">{preview.map(driver => <li key={driver.code}>
            <i style={{background: driver.color}} aria-hidden="true" /><b>{driver.code}</b><span>· {driver.name}</span>
          </li>)}</ul>
          <HomeRaceChart series={preview} />
          <p className={styles.chartNote}>Recorded green-flag laps · <Link href={`${raceUrl(latest)}?tab=compare&a=${preview[0]?.code || ''}&b=${preview[1]?.code || ''}`}>Explore lap pace</Link>.
            <span className={styles.srOnly}> Pit and inaccurate laps excluded. Tyre and weather conditions vary.</span></p>
        </> : <div className={styles.empty}><p>Race analysis will appear here once a completed race is imported.</p>
          <Link className={styles.textLink} href="/races">Explore previous seasons{arrow}</Link></div>}
      </section>
    </section>
    {latest && podium[0] && <section className={`${styles.glass} ${styles.result}`} aria-label="Latest race result">
      <div className={styles.resultRace}><Link href={`${raceUrl(latest)}?tab=overview`}>{latest.name}</Link><time dateTime={latest.date}>{date(latest.date)}</time></div>
      <div className={styles.winner} style={{'--team': podium[0].color} as CSSProperties}>
        <p className={styles.eyebrow}>Race winner</p><Link href={`/drivers/${podium[0].code}?season=${season}`}>{podium[0].name}</Link><span>{podium[0].team}</span>
      </div>
      <ol className={styles.podium}>{podium.map(driver => <li key={driver.code}>
        <b>{driver.position}</b><i style={{background: driver.color}} aria-hidden="true" />
        <span>{driver.name.split(' ').at(-1)}</span><small>{driver.position === 1 ? 'Winner' : driver.gap}</small>
      </li>)}</ol>
    </section>}
    <section className={styles.section} aria-labelledby="season-title">
      <h2 id="season-title">The season, at a glance.</h2>
      <div className={styles.seasonGrid}>
        <section className={`${styles.glass} ${styles.standings}`} aria-labelledby="standings-title">
          <h3 id="standings-title">Drivers’ championship</h3>
          {standings ? <>
            <table className={styles.standingsTable}>
              <caption className={styles.srOnly}>{season} championship standings through round {standings.round}, including sprint points</caption>
              <thead><tr><th scope="col">Pos</th><th scope="col">Driver</th><th scope="col" className={styles.teamColumn}>Team</th><th scope="col">Pts</th></tr></thead>
              <tbody>{standings.drivers.slice(0, 5).map(standing => {
                const driver = drivers.get(standing.code);
                return <tr key={standing.code} className={standing.position === 1 ? styles.leader : undefined}>
                  <td>{standing.position}</td><th scope="row"><Link href={`/drivers/${standing.code}?season=${season}`}>
                    <i style={{background: driver?.color || '#a8a49c'}} aria-hidden="true" />{driver?.name || standing.name}
                  </Link></th><td className={styles.teamColumn}>{driver?.team || standing.team}</td><td>{standing.points}</td>
                </tr>;
              })}</tbody>
            </table>
            <p className={styles.note}>Standings through {standingsRace && raceName(standingsRace.name)} · Sprint points included. <a href={standings.sourceUrl}>Source: Jolpica</a></p>
          </> : <p className={styles.empty}>Championship standings are not available yet. Recorded race results are available in the archive.</p>}
          <Link className={styles.textLink} href={`/drivers?season=${season}`}>Explore drivers{arrow}</Link>
        </section>
        <aside className={`${styles.glass} ${styles.summary}`} aria-label={`${season} season summary`}>
          <div><h3>Leading constructor</h3>{leadingTeam
            ? <Link className={styles.teamLead} href={`/teams/${teamSlug(leadingTeam.name)}?season=${season}`} style={{'--team': teamColor || '#27f4d2'} as CSSProperties}>{leadingTeam.name}</Link>
            : <p className={styles.summarySmall}>Standings pending</p>}</div>
          <div><h3>Season progress</h3><p className={styles.summaryValue}>{completed}<span> of </span>{calendar.length}<span> races available</span></p></div>
          <div><h3>Up next</h3>{next ? <>
            <Link className={styles.summaryValue} href={`/races/${season}/${next.slug}`}>{next.label}</Link>
            <p className={styles.summarySmall}>{next.raceStartUtc
              ? `${new Date(next.raceStartUtc).toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC'})} · ${new Date(next.raceStartUtc).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit', timeZone: 'UTC'})} UTC`
              : next.date ? date(next.date) : 'Date to be confirmed'}</p>
          </> : <p className={styles.summarySmall}>{completed === calendar.length && calendar.length > 0 ? 'Season complete' : 'No upcoming race scheduled'}</p>}</div>
        </aside>
      </div>
    </section>
    <section className={styles.section} aria-labelledby="recent-title">
      <h2 id="recent-title">Choose a race. Find its story.</h2>
      <div className={`${styles.glass} ${styles.recent}`}>
        {recent.length ? <ul>{recent.map(race => {
          const entry = calendar.find(item => item.slug === race.slug);
          const winner = race.drivers.find(driver => driver.position === 1);
          return <li key={race.slug}><Link className={styles.recentRace} href={`${raceUrl(race)}?tab=overview`}>
            <img src={`/flags/${entry?.flag || 'unknown'}.svg`} width="48" height="32" alt="" />
            <span className={styles.recentName}><strong>{raceName(race.name)}</strong><time dateTime={race.date}>{date(race.date)}</time></span>
            <span className={styles.recentWinner}><small>Winner</small><strong>{winner?.name.split(' ').at(-1)}</strong></span>
            <span className={styles.explore}>Explore{arrow}<span className={styles.srOnly}> {race.name} {season}</span></span>
          </Link></li>;
        })}</ul> : <p className={styles.empty}>Completed races will appear here when their recorded results are available.</p>}
        <Link className={styles.textLink} href="/races">Browse the full archive{arrow}</Link>
      </div>
    </section>
    <footer className={styles.footer}><p>Independent F1 analysis · Recorded data, clear limits.</p><Link href="/about">About the data{arrow}</Link></footer>
  </main>;
}
