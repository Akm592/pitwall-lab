"""Export replay geometry, approximate checkpoints and measured telemetry for OpenF1 snapshots."""
import argparse
from datetime import datetime, timedelta, timezone
import json
import math
from pathlib import Path
import time
from types import SimpleNamespace
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import urlopen

import numpy as np
import pandas as pd

from export_positions import ROOT, STEP, UNITS, LINE_STEP, clean, deltas, export_car_telemetry, loop_length, resample_loop, track_surface, write_json
from export_replay_timing import rank_changes


def stamp(value):
    result = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if result.tzinfo is None:
        raise ValueError('OpenF1 timestamp must include a timezone')
    return result


def finite(value):
    return isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value)


class OpenF1:
    def __init__(self, cache, not_before=0):
        self.cache = Path(cache)
        self.not_before = not_before

    def fetch(self, endpoint, *, allow_empty=False, **params):
        query = urlencode(params)
        target = self.cache / f'{endpoint}-{query}.json'
        rows = json.loads(target.read_text()) if target.exists() and target.stat().st_mtime >= self.not_before else None
        downloaded = False
        if not rows:
            for attempt in range(3):
                try:
                    with urlopen(f'https://api.openf1.org/v1/{endpoint}?{query}', timeout=90) as response:
                        rows = json.load(response)
                    break
                except HTTPError as error:
                    if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                        raise
                    time.sleep(min(30, int(error.headers.get('Retry-After', 2 ** (attempt + 1)))))
            if not isinstance(rows, list) or not rows and not allow_empty:
                raise ValueError(f'Invalid OpenF1 {endpoint} response')
            downloaded = True
        if not isinstance(rows, list) or any(row.get('session_key') != params['session_key'] for row in rows):
            raise ValueError(f'Wrong OpenF1 session in {endpoint}')
        if 'driver_number' in params and any(str(row.get('driver_number')) != str(params['driver_number']) for row in rows):
            raise ValueError(f'Wrong OpenF1 driver in {endpoint}')
        if downloaded and rows:
            write_json(target, rows)
        return rows


def replay_paths(snapshot):
    base = ROOT / 'public/replay' / str(snapshot['season'])
    slug = snapshot['slug']
    return [ROOT / 'data/tracks' / str(snapshot['season']) / f'{slug}.json',
            base / f'{slug}.json', base / f'{slug}.timing.json', base / f'{slug}.telemetry.json']


def complete(snapshot):
    try:
        return all(json.loads(path.read_text()).get('snapshotExportedAt') == snapshot['exportedAt']
                   for path in replay_paths(snapshot))
    except (OSError, ValueError):
        return False


def timing_payload(snapshot, laps, positions):
    origin = stamp(snapshot['openf1']['sessionStart'])
    cars = {}
    for driver in snapshot['drivers']:
        known = {lap['number']: lap for lap in snapshot['laps'] if lap['driver'] == driver['code']}
        rows = {row['lap_number']: row for row in laps if str(row['driver_number']) == driver['number']}
        checkpoints = []
        for number, row in sorted(rows.items()):
            recorded = known.get(number)
            if not recorded or not row.get('date_start') or not finite(row.get('lap_duration')) or row['lap_duration'] <= 0:
                continue
            start = (stamp(row['date_start']) - origin).total_seconds()
            end = start + row['lap_duration']
            # OpenF1 lap-start timestamps are approximate and may be corrected after snapshot export.
            if recorded['sessionTimeSeconds'] is None or abs(end - recorded['sessionTimeSeconds']) > 2:
                raise ValueError(f'OpenF1 lap clock differs from snapshot: {driver["code"]} lap {number}')
            following = rows.get(number + 1)
            if following and following.get('date_start'):
                next_start = (stamp(following['date_start']) - origin).total_seconds()
                if 0 < next_start - start and abs(next_start - end) <= 2:
                    end = next_start
            sectors = [row.get(f'duration_sector_{index}') for index in (1, 2, 3)]
            checkpoints.append(dict(number=number, start=round(start, 6), end=round(end, 6),
                                    sector1=round(start + sectors[0], 6) if finite(sectors[0]) and 0 < sectors[0] < end - start else None,
                                    sector2=round(start + sum(sectors[:2]), 6) if all(finite(t) and t > 0 for t in sectors[:2]) and sum(sectors[:2]) < end - start else None,
                                    sector3=round(start + sum(sectors), 6) if all(finite(t) and t > 0 for t in sectors) else None,
                                    pitIn=None, pitOut=None))
        observed = sorted((row for row in positions if str(row['driver_number']) == driver['number']), key=lambda row: row['date'])
        ranks = rank_changes(((stamp(row['date']) - origin).total_seconds(), row.get('position')) for row in observed)
        cars[driver['code']] = dict(laps=checkpoints, ranks=ranks,
                                    rankSource='OpenF1 position stream' if ranks else 'unavailable')
    all_laps = [lap for car in cars.values() for lap in car['laps']]
    starts = [lap['start'] for lap in all_laps if lap['number'] == 1]
    if not starts or not all_laps:
        raise ValueError('No observed OpenF1 race interval')
    return dict(schemaVersion=1, season=snapshot['season'], slug=snapshot['slug'],
                source='OpenF1 lap starts and recorded sector durations', clockPrecision='approximate',
                utcOrigin=origin.isoformat(), start=min(starts), end=max(lap['end'] for lap in all_laps), cars=cars)


def geometry(snapshot, laps, api):
    drivers = {driver['code']: driver['number'] for driver in snapshot['drivers']}
    raw = {(str(row['driver_number']), row['lap_number']): row for row in laps}
    candidates = sorted((lap for lap in snapshot['laps'] if lap['eligible'] and not lap['generated']
                         and all(finite(lap.get(f'sector{i}')) for i in (1, 2, 3))), key=lambda lap: lap['timeSeconds'])
    # shortcut: bound location downloads to 20 candidate laps; expand if usable traces exist only later.
    for lap in candidates[:20]:
        row = raw.get((drivers[lap['driver']], lap['number']))
        if not row or not row.get('date_start') or abs(sum(lap[f'sector{i}'] for i in (1, 2, 3)) - lap['timeSeconds']) > .02:
            continue
        start = stamp(row['date_start'])
        rows = api.fetch('location', session_key=snapshot['openf1']['sessionKey'], driver_number=drivers[lap['driver']],
                         **{'date>': (start - timedelta(seconds=1)).isoformat(),
                            'date<': (start + timedelta(seconds=lap['timeSeconds'] + 1)).isoformat()})
        frame = clean([(stamp(r['date']) - start).total_seconds() for r in rows],
                      [r.get('x') for r in rows], [r.get('y') for r in rows])
        frame = frame[(frame.x != 0) | (frame.y != 0)]
        if len(frame) < 30 or frame.t.min() > 0 or frame.t.max() < lap['timeSeconds'] or frame.t.diff().max() > 2:
            continue
        if (np.hypot(frame.x.diff(), frame.y.diff()).iloc[1:] > 0).mean() < .8:
            continue
        x, y = frame.x.to_numpy(), -frame.y.to_numpy()
        if np.ptp(y) > np.ptp(x):
            x, y = y, -x
        if min(np.ptp(x), np.ptp(y)) <= 0:
            continue
        extent = np.hypot(np.ptp(x), np.ptp(y))
        edges = np.cumsum([0, *[lap[f'sector{i}'] for i in (1, 2, 3)]])
        at = lambda t: np.array([np.interp(t, frame.t, x), np.interp(t, frame.t, y)])
        if np.linalg.norm(at(0) - at(edges[-1])) > extent * .08 or np.hypot(np.diff(x), np.diff(y)).max() > extent * .2:
            continue
        scale = min(760 / np.ptp(x), 360 / np.ptp(y))
        x = (x - (x.min() + x.max()) / 2) * scale + 480
        y = (y - (y.min() + y.max()) / 2) * scale + 305
        point = lambda t: [round(float(np.interp(t, frame.t, x)), 2), round(float(np.interp(t, frame.t, y)), 2)]
        sectors = [dict(number=index + 1,
                        points=[point(t) for t in np.linspace(a, b, max(30, int((b - a) * 3)))],
                        anchor=point((a + b) / 2), end=point(b)) for index, (a, b) in enumerate(zip(edges, edges[1:]))]
        track = dict(schemaVersion=1, season=snapshot['season'], round=snapshot['round'], slug=snapshot['slug'],
                     circuit=snapshot['circuit'], source='OpenF1 reference-lap location (approximate)', fastf1Version='',
                     reference=dict(driver=lap['driver'], lap=lap['number'], session='R', lapTimeSeconds=lap['timeSeconds'],
                                    sectorTimesSeconds=[lap[f'sector{i}'] for i in (1, 2, 3)]),
                     startFinish=point(0), sectors=sectors)
        measured = np.array([p for index, sector in enumerate(sectors) for p in sector['points'][bool(index):]])
        metres = 1 / (scale * 10)
        length = loop_length(measured)[-1] * metres
        if not 1500 < length < 10000:
            continue
        line = resample_loop(measured, max(100, int(length / LINE_STEP)))
        return track, line, metres
    raise ValueError('No complete OpenF1 reference trace aligned with this snapshot')


def export_openf1(snapshot, cache, force=False):
    if not force and complete(snapshot):
        print(f'{snapshot["season"]}/{snapshot["slug"]}: replay assets current', flush=True)
        return
    api = OpenF1(cache, not_before=stamp(snapshot['exportedAt']).timestamp())
    key = snapshot['openf1']['sessionKey']
    sessions = api.fetch('sessions', session_key=key)
    origin = stamp(snapshot['openf1']['sessionStart'])
    if len(sessions) != 1 or sessions[0]['year'] != snapshot['season'] or sessions[0]['session_type'] != 'Race' or stamp(sessions[0]['date_start']) != origin:
        raise ValueError('OpenF1 session does not match race snapshot')
    laps = api.fetch('laps', session_key=key)
    timing = timing_payload(snapshot, laps, api.fetch('position', session_key=key))
    track, line, metres = geometry(snapshot, laps, api)
    t0 = float(np.floor(timing['start']))
    grid = t0 + STEP * np.arange(int(np.ceil((timing['end'] - t0) / STEP)) + 1)
    common = dict(season=snapshot['season'], slug=snapshot['slug'], round=snapshot['round'],
                  exportedAt=datetime.now(timezone.utc).isoformat(), snapshotExportedAt=snapshot['exportedAt'],
                  sourceSessionKey=key, sourceUrl=f'https://api.openf1.org/v1/sessions?session_key={key}', fastf1Version='')
    frames = {}
    for driver in snapshot['drivers']:
        rows = api.fetch('car_data', session_key=key, driver_number=driver['number'],
                         allow_empty=not timing['cars'][driver['code']]['laps'])
        frame = pd.DataFrame(rows, columns=['date', 'speed', 'throttle', 'brake', 'n_gear', 'drs'])
        if frame.empty:
            if timing['cars'][driver['code']]['laps']:
                raise ValueError(f'No OpenF1 telemetry for {driver["code"]}; existing bundle retained')
            continue
        frame['SessionTime'] = pd.to_datetime(frame.pop('date'), format='ISO8601', utc=True) - origin
        frame = frame.rename(columns=dict(speed='Speed', throttle='Throttle', brake='Brake', n_gear='nGear', drs='DRS'))
        frame = frame.replace([np.inf, -np.inf], np.nan).dropna(subset=['Speed', 'Throttle', 'Brake', 'nGear'])
        if len(frame) < 2:
            raise ValueError(f'No usable OpenF1 telemetry for {driver["code"]}')
        frames[driver['number']] = frame
        print(f'{snapshot["slug"]}: telemetry {driver["code"]}: {len(frame)} samples', flush=True)
    # The existing codec has no unknown DRS value; hide the channel if the source leaves gaps.
    drs_available = all(frame.DRS.notna().all() for frame in frames.values())
    for frame in frames.values():
        frame['DRS'] = frame.DRS if drs_available else 0
    shared = dict(common, t0=t0, step=STEP, count=len(grid), source='OpenF1 car telemetry', unavailableChannels=[] if drs_available else ['drs'])
    # Build the entire bundle before replacing any published file.
    from tempfile import TemporaryDirectory
    with TemporaryDirectory() as folder:
        telemetry_path = Path(folder) / 'telemetry.json'
        export_car_telemetry(SimpleNamespace(car_data=frames), snapshot['drivers'], grid, shared, telemetry_path)
        telemetry = dict(json.loads(telemetry_path.read_text()), source='OpenF1 car telemetry')
    if not {code for code, car in timing['cars'].items() if car['laps']} <= set(telemetry['cars']):
        raise ValueError('Incomplete OpenF1 telemetry bundle')
    surface, note = track_surface(snapshot['slug'], line, metres)
    from scipy.spatial import cKDTree
    along = loop_length(line)[:-1] * metres
    tree = cKDTree(line)
    packed = np.rint(line * UNITS).astype(int)
    positions = dict(common, schemaVersion=2, source='OpenF1 reference-lap geometry; illustrative driver paths',
                     reference=dict(driver=track['reference']['driver'], lap=track['reference']['lap']),
                     t0=t0, step=STEP, count=len(grid), units=UNITS, metresPerUnit=round(metres, 6),
                     length=round(float(loop_length(line)[-1] * metres), 1),
                     sectorEnds=[round(float(along[tree.query(sector['end'])[1]]), 3) for sector in track['sectors'][:2]],
                     line=dict(x=deltas(packed[:, 0]), y=deltas(packed[:, 1])), cars={})
    if surface:
        positions['surface'] = dict(source=surface['source'], name=surface['name'], inside=surface['inside'],
                                    left=dict(x=deltas(surface['left'][:, 0]), y=deltas(surface['left'][:, 1])),
                                    right=dict(x=deltas(surface['right'][:, 0]), y=deltas(surface['right'][:, 1])))
    for target, payload in zip(replay_paths(snapshot), [dict(track, **common), positions, dict(timing, **common), dict(telemetry, schemaVersion=1)]):
        write_json(target, payload)
    print(f'{snapshot["season"]}/{snapshot["slug"]}: replay exported, {len(frames)} cars, {note}', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--season', type=int, required=True)
    parser.add_argument('--race', required=True)
    parser.add_argument('--cache', type=Path, default=ROOT / '.fastf1-auto-cache/openf1')
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    calendar = json.loads((ROOT / 'data' / str(args.season) / 'calendar.json').read_text())
    if not any(entry['slug'] == args.race for entry in calendar):
        parser.error('Unknown race in the selected season')
    snapshot = json.loads((ROOT / 'data' / str(args.season) / f'{args.race}.json').read_text())
    export_openf1(snapshot, args.cache, args.force)
