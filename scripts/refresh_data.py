"""Scheduled race refresh. --plan is offline and needs only Python's standard library."""
import argparse
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def start_time(race):
    value = race.get('raceStartUtc') or race['date'] + 'T00:00:00+00:00'
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


def selected(race, now, daily):
    age = now - start_time(race)
    return (timedelta(minutes=90) <= age <= timedelta(hours=24)
            or daily and age >= timedelta(minutes=90)
            and (age <= timedelta(days=14) or race.get('status') != 'completed'))


def calendars(now):
    years = [now.year]
    if now.month == 1 and now.day <= 14:
        years.insert(0, now.year - 1)
    result = {}
    for year in years:
        path = ROOT / 'data' / str(year) / 'calendar.json'
        result[year] = json.loads(path.read_text()) if path.exists() else []
    return result


def refresh(now, daily, summary):
    import export_races as races
    from export_track_maps import export_track
    import fastf1
    from fastf1.exceptions import RateLimitExceededError

    cache = ROOT / '.fastf1-auto-cache'
    cache.mkdir(exist_ok=True)
    # Separate from the manual archive cache: renewing this cache must not clear it.
    fastf1.Cache.enable_cache(str(cache), force_renew=True)
    cached_get = fastf1.Cache.requests_get
    def bounded_get(url, **kwargs):
        kwargs.setdefault('timeout', (15, 90))
        return cached_get(url, **kwargs)
    fastf1.Cache.requests_get = bounded_get
    failures = []
    for year, calendar in calendars(now).items():
        if daily:
            try:
                calendar = races.sync_calendar(year, now)
            except RateLimitExceededError:
                raise
            except Exception as error:
                failures.append(str(year) + ': schedule unavailable: ' + str(error))
                continue
        races.CALENDAR = calendar
        races.RACES = {race['slug']: race for race in calendar}
        for race in calendar:
            elapsed = now - start_time(race) >= timedelta(minutes=90)
            needs_import = selected(race, now, daily) or daily and elapsed and not races.snapshot_valid(year, race)
            needs_map = daily and elapsed and races.snapshot_valid(year, race) and not (ROOT / 'data/tracks' / str(year) / (race['slug'] + '.json')).exists()
            if not needs_import and not needs_map:
                continue
            label = str(year) + '/' + race['slug']
            changed = False
            try:
                if needs_import:
                    changed = races.export(race['slug'], year, require_complete=True)
                race['status'] = 'completed'
                summary.append(label + (': updated' if changed else ': unchanged'))
                races.write_json(ROOT / 'data' / str(year) / 'calendar.json', calendar)
            except RateLimitExceededError:
                raise
            except Exception as error:
                failures.append(label + ': import unavailable: ' + str(error))
                continue
            # Map failures never discard an otherwise valid race update.
            try:
                export_track(year, race, cache, force=changed, discard_new_telemetry=True)
            except RateLimitExceededError:
                raise
            except Exception as error:
                failures.append(label + ': map unavailable: ' + str(error))
        races.write_json(ROOT / 'data' / str(year) / 'calendar.json', calendar)
    summary.extend(failures)
    return bool(failures)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan', action='store_true')
    parser.add_argument('--daily', action='store_true')
    parser.add_argument('--now', type=lambda value: datetime.fromisoformat(value.replace('Z', '+00:00')))
    args = parser.parse_args()
    now = args.now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        parser.error('--now must include a UTC offset')
    now = now.astimezone(timezone.utc)
    due = args.daily or any(selected(race, now, False) for calendar in calendars(now).values() for race in calendar)
    if args.plan:
        print(json.dumps({'due': due, 'daily': args.daily}))
        if os.environ.get('GITHUB_OUTPUT'):
            with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
                output.write('due=' + str(due).lower() + '\n')
        return
    summary = ['## FastF1 data refresh', 'Checked at ' + now.isoformat()]
    failed = False
    try:
        if due:
            failed = refresh(now, args.daily, summary)
        else:
            summary.append('No race is in the refresh window.')
    except Exception as error:
        summary.append('Refresh stopped; existing snapshots retained: ' + str(error))
        failed = True
    finally:
        report = '\n\n'.join(summary) + '\n'
        print(report)
        if os.environ.get('GITHUB_STEP_SUMMARY'):
            with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as output:
                output.write(report)
    if failed:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
