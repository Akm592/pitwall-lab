import type {ReactNode} from 'react';
import {notFound} from 'next/navigation';
import {getCalendar} from '@/lib/data';

export default async function RaceLayout({params, children}: {params: Promise<{season: string; slug: string}>; children: ReactNode}) {
  const {season, slug} = await params;
  // Validate before the inner loading boundary can stream an HTTP 200 response.
  if (String(Number(season)) !== season || !getCalendar(Number(season)).some(race => race.slug === slug)) notFound();
  return children;
}
