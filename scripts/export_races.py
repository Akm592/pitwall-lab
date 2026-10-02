"""Export observed race data; run with .venv/bin/python scripts/export_races.py."""
import argparse
from datetime import datetime, timezone
import json
import math
import re
import time
import unicodedata
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from pathlib import Path

import fastf1
import pandas as pd
from fastf1.exceptions import DataNotLoadedError, RateLimitExceededError

ROOT = Path(__file__).resolve().parents[1]
CALENDAR = json.loads((ROOT / 'data' / '2024' / 'calendar.json').read_text())
RACES = {race['slug']: race for race in CALENDAR}


class SessionNotReadyError(RuntimeError):
    """The source cannot yet confirm a completed race session."""

COUNTRIES = {'UK':'gb','USA':'us','United States':'us','UAE':'ae','Korea':'kr','South Korea':'kr',
             'South Africa':'za','Argentina':'ar','Portugal':'pt','Germany':'de','France':'fr',
             'India':'in','Turkey':'tr','Malaysia':'my','Netherlands':'nl','Belgium':'be',
             'Italy':'it','Spain':'es','Monaco':'mc','Canada':'ca','Brazil':'br','Mexico':'mx',
             'Australia':'au','Austria':'at','Japan':'jp','China':'cn','Singapore':'sg',
             'Hungary':'hu','Bahrain':'bh','Saudi Arabia':'sa','Qatar':'qa','Russia':'ru',
             'Switzerland':'ch','Sweden':'se','Morocco':'ma'}


def write_json(target, data):
    if target.exists():
        previous = json.loads(target.read_text())
        comparable = lambda value: {key: item for key, item in value.items() if key != 'exportedAt'} if isinstance(value, dict) else value
        if comparable(previous) == comparable(data):
            return False
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(data, allow_nan=False, ensure_ascii=False, separators=(',', ':')) + '\n')
    temporary.replace(target)
    return True


def history_page(season, offset, cache_dir):
    cache = cache_dir / 'history' / f'{season}-{offset}.json'
    if cache.exists():
        return json.loads(cache.read_text())
    url = f'https://api.jolpi.ca/ergast/f1/{season}/results/?limit=100&offset={offset}'
    for attempt in range(5):
        try:
            with urlopen(Request(url, headers={'User-Agent':'PitwallLab/0.1.0'}), timeout=60) as response:
                data = json.load(response)['MRData']
            write_json(cache, data)
            time.sleep(.4)
            return data
        except HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 4:
                raise
            delay = int(error.headers.get('Retry-After', 10 * (attempt + 1)))
            print(f'{season}: provider HTTP {error.code}; retry in {delay}s', flush=True)
            time.sleep(delay)


def export_history(season, cache_dir):
    races, offset = {}, 0
    while True:
        page = history_page(season, offset, cache_dir)
        for race in page['RaceTable']['Races']:
            round_ = int(race['round'])
            if round_ not in races:
                races[round_] = dict(race, Results=[])
            races[round_]['Results'].extend(race['Results'])
        offset += int(page['limit'])
        if offset >= int(page['total']):
            break
    if not races:
        raise RuntimeError(f'No historical results returned for {season}')
    known = {race['name']:race for race in json.loads((ROOT / 'data/2024/calendar.json').read_text())}
    calendar, used = [], set()
    for round_, race in sorted(races.items()):
        name = race['raceName']
        label = name.removesuffix(' Grand Prix')
        slug = known[name]['slug'] if name in known else re.sub(r'[^a-z0-9]+','-',unicodedata.normalize('NFKD', label).encode('ascii','ignore').decode().lower()).strip('-')
        if slug in used:
            slug += f'-{round_}'
        used.add(slug)
        flag_ = COUNTRIES.get(race['Circuit']['Location']['country'], 'unknown')
        if not (ROOT / 'public/flags' / f'{flag_}.svg').exists():
            flag_ = 'unknown'
        entry = dict(slug=slug,label=label,flag=flag_,country=race['Circuit']['Location']['country'],round=round_,name=name,
                     circuit=race['Circuit']['circuitName'],date=race['date'],status='completed')
        calendar.append(entry)
        target = ROOT / 'data' / str(season) / f'{slug}.json'
        if target.exists():
            existing = json.loads(target.read_text())
            if existing.get('laps'):
                continue
        drivers = []
        for result in race['Results']:
            driver = result['Driver']
            code = driver.get('code',driver['driverId']) if season >= 2018 else driver['driverId']
            drivers.append(dict(code=code,driverId=driver['driverId'],number=result.get('number','—'),
                name=driver['givenName']+' '+driver['familyName'],team=result['Constructor']['name'],color='#7ad7ef',
                position=int(result['position']),grid=int(result['grid']),points=float(result['points']),
                status=result['status'],gap=result.get('Time',{}).get('time',result['status']),
                elapsedSeconds=None,completedLaps=int(result['laps'])))
        data = dict(schemaVersion=1,season=season,round=round_,slug=slug,name=name,circuit=entry['circuit'],
                    countryCode=flag_,date=race['date'],totalLaps=max(d['completedLaps'] for d in drivers),
                    source='Jolpica',sourceUrl=f'https://api.jolpi.ca/ergast/f1/{season}/{round_}/results/',
                    coverage='results',fastf1Version='',exportedAt=datetime.now(timezone.utc).isoformat(),
                    drivers=drivers,laps=[],stints=[],events=[],weather=[])
        write_json(target, data)
    write_json(ROOT / 'data' / str(season) / 'calendar.json', calendar)
    print(f'{season}: {len(calendar)} historical race results imported', flush=True)


def number(value):
    if value is None or pd.isna(value):
        return None
    result = float(value)
    return result if math.isfinite(result) else None


def seconds(value):
    return None if value is None or pd.isna(value) else number(value.total_seconds())


def integer(value):
    value = number(value)
    return None if value is None else int(value)


def flag(value):
    return False if value is None or pd.isna(value) else bool(value)


def string(value):
    return None if value is None or pd.isna(value) else str(value)


def optional_data(session, name):
    try:
        return getattr(session, name)
    except DataNotLoadedError:
        return pd.DataFrame()


def export(slug, season, require_complete=False):
    race = RACES[slug]
    round_, name, circuit, country = race['round'], race['name'], race['circuit'], race['flag']
    session = fastf1.get_session(season, round_, 'R')
    session.load(telemetry=False)
    if require_complete:
        statuses = optional_data(session, 'session_status')
        if not session_complete(statuses):
            raise SessionNotReadyError('Session completion not confirmed; retry later')
    laps = []
    for _, row in session.laps.iterrows():
        lap = dict(driver=string(row.Driver), number=integer(row.LapNumber),
                   timeSeconds=seconds(row.LapTime), sector1=seconds(row.Sector1Time),
                   sector2=seconds(row.Sector2Time), sector3=seconds(row.Sector3Time),
                   position=integer(row.Position), compound=string(row.Compound),
                   tyreLife=number(row.TyreLife), stint=integer(row.Stint),
                   pitIn=not pd.isna(row.PitInTime), pitOut=not pd.isna(row.PitOutTime),
                   deleted=flag(row.get('Deleted')), generated=flag(row.get('FastF1Generated')),
                   accurate=flag(row.IsAccurate), trackStatus=string(row.TrackStatus),
                   sessionTimeSeconds=seconds(row.Time))
        lap['eligible'] = bool(lap['timeSeconds'] and lap['timeSeconds'] > 0 and lap['accurate']
                               and not any(lap[key] for key in ('deleted', 'generated', 'pitIn', 'pitOut'))
                               and lap['trackStatus'] == '1')
        laps.append(lap)
    winner = session.results.loc[session.results.Position == 1].iloc[0]
    winner_time = seconds(winner.Time)
    winner_laps = max(x['number'] for x in laps if x['driver'] == winner.Abbreviation and not x['generated'])
    drivers = []
    for _, row in session.results.iterrows():
        position = integer(row.Position)
        elapsed = seconds(row.Time)
        completed = max((x['number'] for x in laps if x['driver'] == row.Abbreviation and not x['generated']), default=0)
        if position == 1 and elapsed is not None:
            gap = f'{int(elapsed // 3600)}:{int(elapsed % 3600 // 60):02d}:{elapsed % 60:06.3f}'
        elif completed < winner_laps and row.Status in ('Finished', 'Lapped', f'+{winner_laps-completed} Lap', f'+{winner_laps-completed} Laps'):
            gap = f'+{winner_laps-completed} lap' + ('s' if winner_laps-completed != 1 else '')
        elif elapsed is not None and row.Status == 'Finished':
            gap = f'+{elapsed:.3f}s'
        else:
            gap = str(row.Status)
        drivers.append(dict(code=str(row.Abbreviation), number=str(row.DriverNumber), name=str(row.FullName),
                            team=str(row.TeamName), color='#' + (string(row.TeamColor) or '888888').lstrip('#'),
                            position=position, grid=integer(row.GridPosition), points=number(row.Points),
                            status=str(row.Status), gap=gap,
                            elapsedSeconds=elapsed if position == 1 else (winner_time + elapsed if winner_time is not None and elapsed is not None and row.Status == 'Finished' else None)))
    stints = []
    for driver in drivers:
        previous = None
        for lap in sorted((x for x in laps if x['driver'] == driver['code'] and not x['generated']), key=lambda x: x['number']):
            key = (lap['stint'], lap['compound'])
            if previous is None or key != previous[0] or lap['number'] != stints[-1]['endLap'] + 1:
                original = session.laps[(session.laps.Driver == driver['code']) & (session.laps.LapNumber == lap['number'])].iloc[0]
                fresh = original.get('FreshTyre')
                stints.append(dict(driver=driver['code'], number=lap['stint'], compound=lap['compound'],
                                   startLap=lap['number'], endLap=lap['number'],
                                   fresh=None if pd.isna(fresh) else bool(fresh)))
            else:
                stints[-1]['endLap'] = lap['number']
            previous = (key, lap['number'])
    events = []
    for _, row in optional_data(session, 'track_status').iterrows():
        events.append(dict(lap=None, timeSeconds=seconds(row.Time), category='TrackStatus', message=str(row.Message)))
    for _, row in optional_data(session, 'race_control_messages').iterrows():
        category = string(row.get('Category')) or 'Other'
        message = string(row.get('Message')) or ''
        if category in ('SafetyCar', 'Drs') or any(word in message for word in ('RED FLAG', 'CHEQUERED', 'PENALTY', 'SAFETY CAR', 'SESSION')):
            # Absolute race-control timestamps cannot be aligned without telemetry's t0_date.
            events.append(dict(lap=integer(row.get('Lap')), timeSeconds=None, category=category, message=message))
    weather = [dict(timeSeconds=seconds(row.Time), airTemp=number(row.AirTemp), trackTemp=number(row.TrackTemp),
                    rainfall=flag(row.Rainfall), humidity=number(row.Humidity), windSpeed=number(row.WindSpeed))
               for _, row in optional_data(session, 'weather_data').iterrows()]
    result = dict(schemaVersion=1, season=season, round=round_, slug=slug, name=name, circuit=circuit,
                  countryCode=country, date=str(session.event.EventDate.date()), totalLaps=winner_laps,
                  source='FastF1', coverage='timing', fastf1Version=fastf1.__version__, exportedAt=datetime.now(timezone.utc).isoformat(),
                  drivers=drivers, laps=laps, stints=stints, events=events, weather=weather)
    target = ROOT / 'data' / str(season) / f'{slug}.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    if not laps or not drivers:
        raise SessionNotReadyError('No timing data returned; retain historical results if available')
    validate_snapshot(result, season, race, require_final_result=require_complete)
    changed = write_json(target, result)
    print(f'{slug}: {len(drivers)} drivers, {len(laps)} laps, {len(stints)} stints, {len(events)} events -> {target}', flush=True)
    return changed


def check(season):
    assert number(float('nan')) is None and seconds(pd.NaT) is None
    assert len(RACES) == len(CALENDAR) and len({race['round'] for race in CALENDAR}) == len(CALENDAR)
    if season == 2024:
        assert len(RACES) == 24
    for slug in RACES:
        if RACES[slug].get('status') in ('upcoming', 'unavailable'):
            print(f'{slug}: {RACES[slug]["status"]}, no results claimed')
            continue
        data = json.loads((ROOT / 'data' / str(season) / f'{slug}.json').read_text())
        codes = {driver['code'] for driver in data['drivers']}
        if data.get('coverage') == 'results':
            assert data['season'] == season and data['round'] == RACES[slug]['round']
            assert data['drivers'] and not any(data[key] for key in ('laps','stints','events'))
            assert data['source'] == 'Jolpica' and data['sourceUrl'].startswith('https://api.jolpi.ca/')
            print(f'{slug}: historical classification retained; no detailed timing claimed')
            continue
        assert 1 <= len(codes) <= 24 and data['totalLaps'] > 0
        assert data['season'] == season and data['round'] == RACES[slug]['round'] and data['slug'] == slug
        winner = [driver for driver in data['drivers'] if driver['position'] == 1]
        assert len(winner) == 1 and winner[0]['status'] == 'Finished'
        assert data['totalLaps'] == max(lap['number'] for lap in data['laps']
                                       if lap['driver'] == winner[0]['code'] and not lap['generated'])
        if season == 2024 and slug == 'australia':
            assert len(codes) == 19
        elif season == 2024 and slug == 'brazil':
            assert data['totalLaps'] == 69
        elif season == 2024 and slug == 'belgium':
            assert winner[0]['code'] == 'HAM'
            assert next(driver for driver in data['drivers'] if driver['code'] == 'RUS')['status'] == 'Disqualified'
        assert all(lap['driver'] in codes and lap['number'] > 0 for lap in data['laps'])
        assert all(not any(lap[k] for k in ('pitIn', 'pitOut', 'deleted', 'generated')) and lap['trackStatus'] == '1'
                   and lap['accurate'] and lap['timeSeconds'] > 0 for lap in data['laps'] if lap['eligible'])
        for driver in data['drivers']:
            if driver['status'] == 'Lapped':
                observed = max((lap['number'] for lap in data['laps']
                                if lap['driver'] == driver['code'] and not lap['generated']), default=0)
                deficit = data['totalLaps'] - observed
                expected = f'+{deficit} lap' + ('s' if deficit != 1 else '') if deficit > 0 else 'Lapped'
                assert driver['gap'] == expected and driver['elapsedSeconds'] is None
        for stint in data['stints']:
            covered = [lap for lap in data['laps'] if lap['driver'] == stint['driver']
                       and stint['startLap'] <= lap['number'] <= stint['endLap']]
            assert [lap['number'] for lap in sorted(covered, key=lambda lap: lap['number'])] == list(range(stint['startLap'], stint['endLap'] + 1))
            assert all(not lap['generated'] and lap['stint'] == stint['number']
                       and lap['compound'] == stint['compound'] for lap in covered)
        json.dumps(data, allow_nan=False)
        print(f'{slug}: snapshot checks passed')


def session_complete(statuses):
    return not statuses.empty and statuses.iloc[-1]['Status'] in ('Finished', 'Finalised')


def validate_snapshot(data, season, race, require_final_result=False):
    if (data['season'] != season or data['round'] != race['round']
            or data['slug'] != race['slug'] or data['totalLaps'] <= 0):
        raise ValueError('Invalid race identity or distance')
    codes = {driver['code'] for driver in data['drivers']}
    winners = [driver for driver in data['drivers'] if driver['position'] == 1]
    if (not data['laps'] or not codes or len(codes) != len(data['drivers'])
            or len(winners) != 1 or winners[0]['status'] not in ('Finished', '')
            or require_final_result and winners[0]['status'] != 'Finished'):
        raise ValueError('Incomplete race classification or timing')
    if any(lap['driver'] not in codes or lap['number'] <= 0 for lap in data['laps']):
        raise ValueError('Invalid driver or lap identity')
    if any(lap[key] is not None and (not math.isfinite(lap[key]) or lap[key] <= 0)
           for lap in data['laps'] for key in ('timeSeconds', 'sector1', 'sector2', 'sector3')):
        raise ValueError('Invalid lap or sector timing')
    observed = [lap['number'] for lap in data['laps'] if lap['driver'] == winners[0]['code'] and not lap['generated']]
    if not observed or max(observed) != data['totalLaps']:
        raise ValueError('Winner distance does not match observed laps')
    json.dumps(data, allow_nan=False)


def snapshot_valid(season, race):
    target = ROOT / 'data' / str(season) / f"{race['slug']}.json"
    try:
        data = json.loads(target.read_text())
        validate_snapshot(data, season, race)
        return True
    except (OSError, ValueError, KeyError, TypeError):
        return False


def race_start(race):
    value = race.get('raceStartUtc')
    return datetime.fromisoformat(value.replace('Z', '+00:00')) if value else datetime.fromisoformat(race['date']).replace(tzinfo=timezone.utc)


def sync_calendar(season, as_of):
    schedule = fastf1.get_event_schedule(season, include_testing=False)
    if schedule.empty:
        raise RuntimeError(f'No provider calendar available for {season}')
    known = {race['name']: race for race in json.loads((ROOT / 'data/2024/calendar.json').read_text())}
    previous = ROOT / 'data' / str(season) / 'calendar.json'
    if previous.exists():
        known.update({race['name']:race for race in json.loads(previous.read_text())})
    calendar = []
    for _, event in schedule.iterrows():
        if int(event.RoundNumber) == 0:
            continue
        name = str(event.EventName)
        if name in known and not (season == 2026 and 'Madrid' in str(event.Location)):
            race = dict(known[name])
        elif 'Barcelona' in str(event.Location):
            race = dict(known['Spanish Grand Prix'], slug='barcelona', label='Barcelona', name=name)
        elif 'Madrid' in str(event.Location):
            race = dict(slug='madrid', label='Madrid', flag='es', name=name, circuit='Madring')
        else:
            raise ValueError(f'Unmapped event: {name}, {event.Location}, {event.Country}')
        if season == 2026 and str(event.Location) == 'Kuala Lumpur':
            race['circuit'] = 'Sepang International Circuit'
            race['flag'] = 'my'
        race.update(round=int(event.RoundNumber), name=name, date=str(event.EventDate.date()))
        start = event.get('Session5DateUtc')
        if pd.notna(start):
            race['raceStartUtc'] = pd.Timestamp(start).tz_localize('UTC').isoformat() if pd.Timestamp(start).tzinfo is None else pd.Timestamp(start).tz_convert('UTC').isoformat()
        race['status'] = ('completed' if snapshot_valid(season, race) else
                          'upcoming' if race_start(race) > as_of else 'unavailable')
        calendar.append(race)
    target = ROOT / 'data' / str(season) / 'calendar.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    write_json(target, calendar)
    print(f'{season}: provider calendar synced ({len(calendar)} races)', flush=True)
    return calendar


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--season', type=int, choices=range(1950, datetime.now(timezone.utc).year + 1), default=2024)
    parser.add_argument('--history', action='store_true', help='Import historical race classifications from Jolpica')
    parser.add_argument('--all-timing', action='store_true', help='Enhance imported seasons with FastF1 race timing, starting in 2018')
    parser.add_argument('--from-year', type=int, default=1950)
    parser.add_argument('--to-year', type=int, default=2023)
    parser.add_argument('--race', default='all')
    parser.add_argument('--cache', type=Path, default=ROOT / '.fastf1-cache')
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--sync-calendar', action='store_true')
    parser.add_argument('--as-of', type=lambda value: datetime.fromisoformat(value.replace('Z', '+00:00')),
                        default=datetime.now(timezone.utc), help='ISO timestamp cutoff for completed events')
    parser.add_argument('--force', action='store_true', help='Re-export existing snapshots')
    parser.add_argument('--fresh', action='store_true', help='Renew upstream and parsed caches (use a dedicated cache directory)')
    parser.add_argument('--require-complete', action='store_true', help='Require an observed finished/finalised session before export')
    parser.add_argument('--verbose', action='store_true', help='Show FastF1 debug details for failed source loading')
    args = parser.parse_args()
    if args.verbose:
        fastf1.set_log_level('DEBUG')
    if args.history:
        if not 1950 <= args.from_year <= args.to_year < datetime.now(timezone.utc).year:
            parser.error('Historical range must be between 1950 and the previous year; use --season for current calendars')
        for year in range(args.from_year, args.to_year + 1):
            export_history(year, args.cache)
        raise SystemExit(0)
    args.cache.mkdir(parents=True, exist_ok=True)
    fastf1.Cache.enable_cache(str(args.cache), force_renew=args.fresh)
    cached_get = fastf1.Cache.requests_get
    def bounded_get(url, **kwargs):
        kwargs.setdefault('timeout', (15, 90))
        return cached_get(url, **kwargs)
    fastf1.Cache.requests_get = bounded_get
    selected = range(max(2018,args.from_year),args.to_year + 1) if args.all_timing else [args.season]
    if args.all_timing and not 2018 <= max(2018,args.from_year) <= args.to_year <= datetime.now(timezone.utc).year:
        parser.error('Detailed timing range must be between 2018 and the current year')
    all_failures = []
    for season in selected:
        path = ROOT / 'data' / str(season) / 'calendar.json'
        CALENDAR = sync_calendar(season, args.as_of) if args.sync_calendar else json.loads(path.read_text())
        RACES = {race['slug']: race for race in CALENDAR}
        if args.check:
            check(season)
        else:
            if args.race != 'all' and args.race not in RACES:
                parser.error(f'Unknown race {args.race}; choose from {", ".join(RACES)}')
            failures = []
            for slug in RACES if args.race == 'all' else [args.race]:
                race = RACES[slug]
                if race.get('date') and race_start(race) > args.as_of:
                    print(f'{slug}: future race, skipped', flush=True)
                    continue
                if not args.force and snapshot_valid(season, race):
                    print(f'{slug}: existing snapshot retained', flush=True)
                    continue
                try:
                    export(slug, season, require_complete=args.require_complete)
                    if args.sync_calendar:
                        race['status'] = 'completed' if snapshot_valid(season, race) else 'unavailable'
                        write_json(path, CALENDAR)
                except RateLimitExceededError as error:
                    raise SystemExit(f'Download limit reached: {error}. Existing results are retained; rerun after the hourly window resets.')
                except Exception as error:
                    failures.append(slug)
                    print(f'{slug}: EXPORT FAILED: {error}', flush=True)
            if args.sync_calendar:
                for race in CALENDAR:
                    race['status'] = ('completed' if snapshot_valid(season, race) else
                                      'upcoming' if race_start(race) > args.as_of else 'unavailable')
                write_json(path, CALENDAR)
            all_failures.extend(f'{season}/{slug}' for slug in failures)
    if all_failures:
        raise SystemExit('Detailed timing unavailable for: ' + ', '.join(all_failures))
