import Link from 'next/link';
import {driverPhotos} from '@/lib/driver-photos';
import {teamLogos} from '@/lib/team-logos';
import styles from '../drivers/drivers.module.css';

export const metadata={title:'Image credits',description:'Sources, photographers and reuse licenses for driver photographs and team logos.'};

export default function ImageCredits(){
 return <main className={styles.page}><Link className={styles.back} href="/drivers">← Driver directory</Link><header className={styles.directoryHero}><p className="eyebrow">THE PHOTOGRAPHERS BEHIND THE PORTRAITS</p><h1>Image credits.</h1><p className="muted">Local photographs are reused under the licenses listed below. Historical photos may show a different uniform from the selected season.</p></header><div className={styles.resultGrid}>{Object.entries(driverPhotos).map(([code,photo])=><article className={styles.resultCard} key={code}><h2>{code}</h2><p><a href={photo.sourceUrl}>{photo.title}</a></p><p>Photographer: {photo.author}</p><p><a href={photo.licenseUrl}>{photo.license}</a></p><p>{photo.changes}</p></article>)}</div>
  <header className={styles.directoryHero}><p className="eyebrow">TEAM LOGOS</p><h2>Logo sources.</h2><p className="muted">Team logos come from Wikimedia Commons, which hosts them as public domain (too simple to be copyrighted) or under the licence shown. They remain trademarks of their teams and appear here only to identify those teams; this site is not affiliated with or endorsed by any of them. Teams with no freely licensed logo show a drawn badge instead.</p></header>
  <div className={styles.resultGrid}>{[...new Map(Object.values(teamLogos).map(logo=>[logo.title,logo])).values()].map(logo=><article className={styles.resultCard} key={logo.title}><p><a href={logo.sourceUrl}>{logo.title}</a></p><p>Source author: {logo.author}</p><p><a href={logo.licenseUrl}>{logo.license}</a>{logo.trademark?' · trademark':''}</p><p>Unmodified SVG, displayed scaled on a light plate.</p></article>)}</div></main>;
}
