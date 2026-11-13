import type {MetadataRoute} from 'next';
import {getCalendar,loadRace,seasons} from '@/lib/data';
import {siteUrl} from '@/lib/site';
import {driverSeason} from '@/lib/drivers';
import {teamSlug} from '@/lib/teams';
import {loadStandings} from '@/lib/standings';

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  const add = (pathname: string, lastModified?: Date) => entries.push({url: new URL(pathname, siteUrl).href,
    ...(lastModified ? {lastModified} : {})});
  const dates = (value?: string) => value && Number.isFinite(Date.parse(value)) ? new Date(value) : undefined;
  const latest = (a?: Date, b?: Date) => a && b ? (a > b ? a : b) : a || b;
  const current = driverSeason();
  let homeModified = dates(loadStandings(current)?.exportedAt);
  for (const season of seasons) {
    const drivers = new Map<string, Date | undefined>();
    const teams = new Map<string, Date | undefined>();
    let seasonModified: Date | undefined;
    for (const event of getCalendar(season)) {
      const race = loadRace(season, event.slug);
      if (!race && event.status !== 'upcoming') continue;
      const modified = dates(race?.exportedAt);
      add(`/races/${season}/${event.slug}`, modified);
      if (!race) continue;
      seasonModified = latest(seasonModified, modified);
      for (const driver of race.drivers) {
        drivers.set(driver.code, latest(drivers.get(driver.code), modified));
        if (driver.team) {
          const slug = teamSlug(driver.team);
          teams.set(slug, latest(teams.get(slug), modified));
        }
      }
    }
    add(season === current ? '/races' : `/races?season=${season}`, seasonModified);
    add(`/drivers?season=${season}`, seasonModified);
    add(`/teams?season=${season}`, seasonModified);
    drivers.forEach((modified, code) => add(`/drivers/${code}?season=${season}`, modified));
    teams.forEach((modified, slug) => add(`/teams/${slug}?season=${season}`, modified));
    if (season === current) homeModified = latest(homeModified, seasonModified);
  }
  add('/', homeModified);
  add('/about');
  add('/image-credits');
  return entries;
}
