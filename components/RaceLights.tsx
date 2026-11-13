import type {CSSProperties} from 'react';
import styles from './RaceLights.module.css';

export default function RaceLights({label = 'Loading race analysis…', page = false}: {label?: string; page?: boolean}) {
  return <div className={`${styles.loader}${page ? ` ${styles.page}` : ''}`} role="status">
    <div className={styles.feedback}>
      <div className={styles.housing} aria-hidden="true">
        {[0, 1, 2, 3, 4].map(step => <span className={styles.pair} key={step} style={{'--step': step} as CSSProperties}>
          <i className={styles.lamp}/><i className={styles.lamp}/>
        </span>)}
      </div>
      <p className={styles.label}>{label}</p>
    </div>
    {page && <div className={styles.preview} aria-hidden="true">
      <span className={styles.headingLine}/><span className={styles.descriptionLine}/>
      <div className={styles.cards}>{[0, 1, 2].map(card => <div className={styles.card} key={card}><span/><span/></div>)}</div>
      <div className={styles.contentPlaceholder}><span/><span/></div>
    </div>}
  </div>;
}
