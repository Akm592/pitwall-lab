import Link from 'next/link';

export default function SeasonLinks({years, href, label}: {years: readonly number[]; href: string; label: string}) {
  return <details className="seasonArchiveLinks"><summary>Browse all F1 {label} seasons</summary>
    <nav aria-label={`F1 ${label} by season`}><ul>{[...years].reverse().map(year => <li key={year}>
      <Link href={`${href}?season=${year}`}>{year}<span className="seoSrOnly"> F1 {label}</span></Link>
    </li>)}</ul></nav>
  </details>;
}
