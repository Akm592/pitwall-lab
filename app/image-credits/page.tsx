import Link from 'next/link';
import {driverPhotos} from '@/lib/driver-photos';
import styles from '../drivers/drivers.module.css';

export const metadata={title:'Image credits',description:'Sources, photographers and reuse licenses for driver photographs.'};

export default function ImageCredits(){
 return <main className={styles.page}><Link className={styles.back} href="/drivers">← Driver directory</Link><header className={styles.directoryHero}><p className="eyebrow">THE PHOTOGRAPHERS BEHIND THE PORTRAITS</p><h1>Image credits.</h1><p className="muted">Local photographs are reused under the licenses listed below. Historical photos may show a different uniform from the selected season.</p></header><div className={styles.resultGrid}>{Object.entries(driverPhotos).map(([code,photo])=><article className={styles.resultCard} key={code}><h2>{code}</h2><p><a href={photo.sourceUrl}>{photo.title}</a></p><p>Photographer: {photo.author}</p><p><a href={photo.licenseUrl}>{photo.license}</a></p><p>{photo.changes}</p></article>)}</div></main>;
}
