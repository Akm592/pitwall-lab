import type {Metadata} from 'next';
import type {Race} from './data';
import {siteUrl} from './site';

export function pageMetadata(title: string, description: string, canonical: string, index = true): Metadata {
  const url = new URL(canonical, siteUrl).href;
  const image = new URL('/brandmark.png', siteUrl).href;
  return {title, description, alternates: {canonical}, robots: {index, follow: true},
    openGraph: {type: 'website', siteName: 'Pitwall Lab', title: `${title} | Pitwall Lab`, description, url,
      images: [{url: image, width: 1536, height: 1024, alt: 'Pitwall Lab'}]},
    twitter: {card: 'summary_large_image', title: `${title} | Pitwall Lab`, description, images: [image]},
  };
}

export const jsonLd = (data: Record<string, unknown>) => JSON.stringify(data).replace(/</g, '\\u003c');

export function raceSummary(race: Race): string {
  const namesAt = (position: number) => race.drivers.filter(driver => driver.position === position).map(driver => driver.name).join(' and ');
  const winners = race.drivers.filter(driver => driver.position === 1);
  const teams = [...new Set(winners.map(driver => driver.team))].join(' and ');
  const result = winners.length ? `${namesAt(1)} won the ${race.name} ${race.season} for ${teams}.` : `Recorded results for the ${race.name} ${race.season}.`;
  const finish = [2, 3].map(position => namesAt(position) ? ` ${namesAt(position)} finished ${position === 2 ? 'second' : 'third'}.` : '').join('');
  const coverage = race.coverage === 'results' || !race.laps.length
    ? ' Explore the historical classification, starting grid and recorded race points. Detailed lap timing is not available for this dataset.'
    : ' Compare recorded lap times, eligible race pace and tyre stints. Pace is not corrected for fuel, traffic or changing weather.';
  return `${result}${finish} The race covered ${race.totalLaps} laps at ${race.circuit}.${coverage}`;
}
