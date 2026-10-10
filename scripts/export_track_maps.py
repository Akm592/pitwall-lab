"""Export compact, season-specific circuit geometry from recorded FastF1 telemetry."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path

import fastf1
import numpy as np
import pandas as pd
from fastf1.exceptions import RateLimitExceededError

ROOT = Path(__file__).resolve().parents[1]


class TrackUnavailableError(ValueError):
    """No usable position trace is available for the recorded reference laps."""


def export_track(season, entry, cache_dir, force=False, discard_new_telemetry=False):
    target = ROOT / 'data/tracks' / str(season) / f"{entry['slug']}.json"
    if target.exists() and not force:
        print(f"{season}/{entry['slug']}: existing track retained", flush=True)
        return
    snapshot_path = ROOT / 'data' / str(season) / f"{entry['slug']}.json"
    if not snapshot_path.exists():
        return
    snapshot = json.loads(snapshot_path.read_text())
    candidates = sorted((lap for lap in snapshot['laps'] if not any(lap[key] for key in ('generated','pitIn','pitOut'))
                         and lap['timeSeconds'] is not None and lap['timeSeconds']>0
                         and all(lap.get(f'sector{i}') is not None for i in (1, 2, 3))),
                        key=lambda lap: (not lap['eligible'],lap['timeSeconds']))
    if not candidates:
        print(f"{season}/{entry['slug']}: no complete observed reference lap; map unavailable", flush=True)
        return
    session = fastf1.get_session(season, entry['round'], 'R')
    # ponytail: cache names match pinned FastF1 3.8.3; review when upgrading FastF1.
    telemetry_files = [cache_dir / session.api_path.removeprefix('/static/') / name
                       for name in ('car_data.ff1pkl','position_data.ff1pkl')]
    existing = {path for path in telemetry_files if path.exists()}
    try:
        session.load(telemetry=True, weather=False, messages=False)
    finally:
        if discard_new_telemetry:
            # Only discard parser copies created by this call. Raw HTTP cache and pre-existing files remain.
            for path in telemetry_files:
                if path not in existing:
                    path.unlink(missing_ok=True)
    geometry = None
    # Fastest laps first, but every lap is a candidate: a feed can be unusable for the whole part of the race the fastest laps fall in.
    for candidate in candidates:
        rows = session.laps[(session.laps.Driver == candidate['driver'])
                            & (session.laps.LapNumber == candidate['number'])]
        if rows.empty:
            continue
        lap = rows.iloc[0]
        pos = lap.get_pos_data(interpolate_edges=True)
        frame = pd.DataFrame({'t':pos.Time.dt.total_seconds(), 'x':pos.X, 'y':pos.Y})
        frame = frame.replace([np.inf, -np.inf], np.nan).dropna().sort_values('t').drop_duplicates('t')
        if len(frame) < 30:
            continue
        # A degraded feed keeps reporting every 0.25 s while holding the car at one of a few fixed points for seconds at a time,
        # so the time-gap test below passes. Require the car to have actually moved between most samples.
        if (np.hypot(frame.x.diff(), frame.y.diff()).iloc[1:] > 0).mean() < .8:
            continue
        times = [candidate[f'sector{i}'] for i in (1, 2, 3)]
        edges = np.cumsum([0, *times])
        if abs(sum(times) - candidate['timeSeconds']) > .02 or frame.t.min() > .05 or frame.t.max() < edges[-1] - .05:
            continue
        x, y = frame.x.to_numpy(dtype=float), -frame.y.to_numpy(dtype=float)
        # Normalize orientation to fit the diagram; coordinates are visualization data, not surveyed geometry.
        if np.ptp(y) > np.ptp(x):
            x, y = y, -x
        width, height = np.ptp(x), np.ptp(y)
        if min(width, height) <= 0:
            continue
        extent = np.hypot(width,height)
        if (frame.t.diff().max() > 3
                or np.hypot(x[0]-x[-1],y[0]-y[-1]) > extent*.08
                or np.max(np.hypot(np.diff(x),np.diff(y))) > extent*.2):
            continue
        scale = min(760 / width, 360 / height)
        x = (x - (x.min() + x.max()) / 2) * scale + 480
        y = (y - (y.min() + y.max()) / 2) * scale + 305
        def point(t):
            return [round(float(np.interp(t, frame.t, x)), 2), round(float(np.interp(t, frame.t, y)), 2)]
        sectors = []
        for index in range(3):
            samples = np.linspace(edges[index], edges[index+1], max(30, int(times[index] * 3)))
            sectors.append(dict(number=index+1, points=[point(t) for t in samples],
                                anchor=point((edges[index]+edges[index+1])/2), end=point(edges[index+1])))
        geometry = dict(schemaVersion=1, season=season, round=entry['round'], slug=entry['slug'],
                        circuit=snapshot['circuit'], source='FastF1 position telemetry',
                        fastf1Version=fastf1.__version__, exportedAt=datetime.now(timezone.utc).isoformat(),
                        reference=dict(driver=candidate['driver'],lap=candidate['number'],session='R',
                                       lapTimeSeconds=candidate['timeSeconds'],sectorTimesSeconds=times),
                        startFinish=sectors[0]['points'][0], sectors=sectors)
        break
    if geometry is None:
        raise TrackUnavailableError('No complete position trace aligned with recorded sector timings')
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(geometry, allow_nan=False, separators=(',', ':')) + '\n')
    temporary.replace(target)
    print(f"{season}/{entry['slug']}: track and three sectors exported", flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--season', type=int)
    parser.add_argument('--race', default='all')
    parser.add_argument('--all-seasons', action='store_true')
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--cache', type=Path, default=ROOT / '.fastf1-cache')
    parser.add_argument('--discard-new-telemetry-cache', action='store_true', help='Discard newly created parser copies; retain raw HTTP cache and existing files')
    args = parser.parse_args()
    if not args.all_seasons and args.season is None:
        parser.error('Select --season or --all-seasons')
    years = sorted((int(path.name) for path in (ROOT/'data').iterdir()
                    if path.name.isdigit() and int(path.name)>=2018),reverse=True) if args.all_seasons else [args.season]
    if any(year < 2018 or not (ROOT/'data'/str(year)/'calendar.json').exists() for year in years):
        parser.error('Track exports require an imported season from 2018 onward')
    args.cache.mkdir(parents=True, exist_ok=True)
    fastf1.Cache.enable_cache(str(args.cache))
    # FastF1's public request wrapper does not set a default network timeout.
    cached_get = fastf1.Cache.requests_get
    def bounded_get(url, **kwargs):
        kwargs.setdefault('timeout', (15, 90))
        return cached_get(url, **kwargs)
    fastf1.Cache.requests_get = bounded_get
    failures = []
    for year in years:
        calendar = json.loads((ROOT/'data'/str(year)/'calendar.json').read_text())
        if args.race != 'all' and not any(entry['slug']==args.race for entry in calendar):
            parser.error(f'Unknown race {args.race} in {year}')
        for entry in calendar:
            if args.race != 'all' and entry['slug'] != args.race:
                continue
            try:
                export_track(year, entry, args.cache, args.force, args.discard_new_telemetry_cache)
            except RateLimitExceededError as error:
                raise SystemExit(f'Download limit reached: {error}. Existing maps retained; resume after reset.')
            except Exception as error:
                failures.append(f"{year}/{entry['slug']}")
                print(f"{year}/{entry['slug']}: MAP FAILED: {error}", flush=True)
    if failures:
        raise SystemExit('Maps unavailable for: ' + ', '.join(failures))
