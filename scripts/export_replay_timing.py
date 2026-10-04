"""Export replay checkpoints, observed rank changes and car telemetry from cached FastF1 data."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path

import fastf1
from fastf1 import _api
import numpy as np
import pandas as pd

from export_positions import ROOT, STEP, export_car_telemetry, write_json


def seconds(value):
    return None if pd.isna(value) else round(value.total_seconds(), 6)


def rank_changes(rows):
    """Keep the first observed rank and timestamped changes, never backfill unknown ranks."""
    result = []
    for time, position in rows:
        if time is None or pd.isna(position) or not float(position).is_integer() or not 1 <= position <= 99:
            continue
        item = dict(t=time, position=int(position))
        if result and result[-1]['t'] == time:
            result[-1] = item
        elif not result or result[-1]['position'] != position:
            result.append(item)
    return result


def timing_payload(session, snapshot):
    # ponytail: pinned FastF1 3.8.3 private adapter; review _api.py timing_data's documented stream columns on upgrades.
    _, stream = _api.timing_data(session.api_path)
    cars = {}
    for driver in snapshot['drivers']:
        rows = session.laps[(session.laps.Driver == driver['code']) & ~session.laps.FastF1Generated.fillna(False)].sort_values('LapNumber')
        laps = [dict(number=int(row.LapNumber), start=seconds(row.LapStartTime),
                     sector1=seconds(row.Sector1SessionTime), sector2=seconds(row.Sector2SessionTime),
                     sector3=seconds(row.Sector3SessionTime), end=seconds(row.Time),
                     pitIn=seconds(row.PitInTime), pitOut=seconds(row.PitOutTime)) for _, row in rows.iterrows()]
        observed = stream[stream.Driver == driver['number']].sort_values('Time')
        ranks = rank_changes((seconds(row.Time), row.Position) for _, row in observed.iterrows())
        # FastF1 core.py derives Lap.Position by sorting lap completion times; it is not an observed classification.
        source = 'FastF1 timing stream' if ranks else 'unavailable'
        cars[driver['code']] = dict(laps=laps, ranks=ranks, rankSource=source)
    starts = [lap['start'] for car in cars.values() for lap in car['laps'] if lap['number'] == 1 and lap['start'] is not None]
    ends = [lap['end'] for car in cars.values() for lap in car['laps'] if lap['end'] is not None]
    origin = session.t0_date
    if origin is not None:
        origin = origin.tz_localize('UTC') if origin.tzinfo is None else origin.tz_convert('UTC')
    return dict(schemaVersion=1, season=snapshot['season'], slug=snapshot['slug'], source='FastF1 cached timing',
                fastf1Version=fastf1.__version__, exportedAt=datetime.now(timezone.utc).isoformat(),
                utcOrigin=None if origin is None else origin.isoformat(),
                start=min(starts) if starts else None, end=max(ends) if ends else None, cars=cars)


def export_timing(season, slug, cache):
    snapshot = json.loads((ROOT / 'data' / str(season) / f'{slug}.json').read_text())
    fastf1.Cache.enable_cache(str(cache))
    fastf1.Cache.offline_mode(True)
    session = fastf1.get_session(season, snapshot['round'], 'R')
    session.load(telemetry=True, weather=False, messages=False)
    payload = timing_payload(session, snapshot)
    if payload['start'] is None or payload['end'] is None:
        raise ValueError('No cached observed race interval')
    target = ROOT / 'public/replay' / str(season) / f'{slug}.timing.json'
    write_json(target, payload)
    t0 = float(np.floor(payload['start']))
    grid = t0 + STEP * np.arange(int(np.ceil((payload['end'] - t0) / STEP)) + 1)
    shared = dict(season=season, round=snapshot['round'], slug=slug, fastf1Version=fastf1.__version__,
                  exportedAt=payload['exportedAt'], t0=t0, step=STEP, count=len(grid))
    export_car_telemetry(session, snapshot['drivers'], grid, shared, target.with_name(f'{slug}.telemetry.json'))
    print(f'{season}/{slug}: {len(payload["cars"])} drivers, {sum(len(car["laps"]) for car in payload["cars"].values())} observed laps, '
          f'{sum(len(car["ranks"]) for car in payload["cars"].values())} rank observations/changes; cached only')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--season', type=int, required=True)
    parser.add_argument('--race', required=True)
    parser.add_argument('--cache', type=Path, default=ROOT / '.fastf1-cache')
    args = parser.parse_args()
    export_timing(args.season, args.race, args.cache)
