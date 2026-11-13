import type {CalendarRace, Race} from './data';

export function seasonOverview(calendar: CalendarRace[], races: Race[], now = new Date()) {
  const completed = races.filter(race => race.date <= now.toISOString().slice(0, 10)
    && race.drivers.some(driver => driver.position === 1))
    .sort((a, b) => b.date.localeCompare(a.date) || b.round - a.round);
  const next = calendar.filter(race => new Date(race.raceStartUtc || `${race.date}T00:00:00Z`) > now)
    .sort((a, b) => (a.raceStartUtc || a.date || '').localeCompare(b.raceStartUtc || b.date || ''))[0];
  return {latest: completed[0] ?? null, recent: completed.slice(0, 3), completed: completed.length, next};
}

export function racePreview(race: Race) {
  return [...race.drivers].filter(driver => driver.position != null && driver.position > 0)
    .sort((a, b) => a.position! - b.position!).slice(0, 2).map(driver => ({
      code: driver.code, name: driver.name, color: driver.color,
      laps: race.laps.filter(lap => lap.driver === driver.code).sort((a, b) => a.number - b.number)
        .map(lap => ({number: lap.number, seconds: lap.eligible && lap.timeSeconds != null
          && Number.isFinite(lap.timeSeconds) && lap.timeSeconds > 0 ? lap.timeSeconds : null})),
    }));
}
