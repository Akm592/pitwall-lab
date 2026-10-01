import type {MetadataRoute} from 'next';
import {getCalendar,seasons} from '@/lib/data';
import {siteUrl} from '@/lib/site';
import {getDriverProfiles} from '@/lib/drivers';

export default function sitemap(): MetadataRoute.Sitemap {
  return ['', '/races', '/about', '/image-credits', '/drivers', ...seasons.map(season=>'/drivers?season='+season), ...seasons.flatMap(season=>getDriverProfiles(season).map(profile=>`/drivers/${profile.driver.code}?season=${season}`)), ...seasons.filter(season=>season!==2026).map(season=>'/races?season='+season), ...seasons.flatMap(season=>getCalendar(season).map(race => '/races/'+season+'/'+race.slug))]
    .map(route => ({url: new URL(route || '/', siteUrl).toString()}));
}
