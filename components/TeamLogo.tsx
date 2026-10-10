import type {CSSProperties} from 'react';
import type {TeamLogo as Logo} from '@/lib/team-logos';
import styles from './TeamLogo.module.css';

// Up to three initials: "Red Bull Racing" -> RBR, "Aston Martin" -> AM, "Cadillac" -> CAD.
const monogram=(name:string)=>{const words=name.replace(/\b(F1|Team)\b/gi,'').trim().split(/\s+/).filter(Boolean);return (words.length>1?words.map(word=>word[0]).join(''):name.slice(0,3)).slice(0,3).toUpperCase();};

// A team's logo on a light plate (most marks are drawn for a light background), or a monogram badge in the team colour
// where no logo has been imported.
export default function TeamLogo({logo,name,color,size='card'}:{logo?:Logo;name:string;color:string;size?:'card'|'hero'}){
 return logo
  ?<span className={`${styles.plate} ${styles[size]}`} data-background={logo.background}><img src={logo.src} alt={`${name} logo`} loading="lazy" decoding="async"/></span>
  :<span className={`${styles.plate} ${styles.badge} ${styles[size]}`} style={{'--team':color} as CSSProperties} role="img" aria-label={`${name} badge`}><b>{monogram(name)}</b></span>;
}
