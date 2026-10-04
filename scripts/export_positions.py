"""Export the race replay data: one racing line per race, each car's distance along it, track edges and car telemetry."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path

import fastf1
import numpy as np
import pandas as pd
from fastf1.exceptions import RateLimitExceededError
from scipy.ndimage import gaussian_filter1d, uniform_filter1d
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parents[1]
STEP = .5         # seconds between exported samples
UNITS = 40        # stored integers per track-map unit
MAX_GAP = 2.0     # seconds; wider gaps between recorded samples stay missing
LINE_STEP = 2.0   # metres between points of the exported racing line
OFF_LINE = 7.0    # metres from the racing line beyond which a car counts as off it (pit lane, garage, run-off)
MAX_DISTANCE = 100.0  # farther samples cannot be represented on the racing line (often stale garage coordinates)
MAX_LAUNCH_GAP = 60.0  # at most the opening minute can be reconstructed from continuous recorded speed
SURVEYS = ROOT / 'data/track-surveys'
# Race slug -> survey file. A survey is only used when it fits the recorded line (see track_surface).
SURVEY_NAMES = {
    'abu-dhabi': 'YasMarina', 'australia': 'Melbourne', 'austria': 'Spielberg', 'styria': 'Spielberg', 'styrian': 'Spielberg',
    'bahrain': 'Sakhir', 'barcelona': 'Catalunya', 'spain': 'Catalunya', 'spanish': 'Catalunya', 'belgium': 'Spa', 'belgian': 'Spa',
    'brazil': 'SaoPaulo', 'brazilian': 'SaoPaulo', 'sao-paulo': 'SaoPaulo', 'britain': 'Silverstone', 'british': 'Silverstone',
    '70th-anniversary': 'Silverstone', 'canada': 'Montreal', 'canadian': 'Montreal', 'china': 'Shanghai', 'chinese': 'Shanghai',
    'german': 'Hockenheim', 'germany': 'Hockenheim', 'eifel': 'Nuerburgring', 'hungary': 'Budapest', 'hungarian': 'Budapest',
    'italy': 'Monza', 'italian': 'Monza', 'japan': 'Suzuka', 'japanese': 'Suzuka', 'mexico': 'MexicoCity', 'mexican': 'MexicoCity',
    'mexico-city': 'MexicoCity', 'netherlands': 'Zandvoort', 'dutch': 'Zandvoort', 'russia': 'Sochi', 'russian': 'Sochi',
    'united-states': 'Austin',
}


class PositionsUnavailableError(ValueError):
    """Recorded positions cannot be aligned with the exported track map."""


def clean(seconds, x, y):
    frame = pd.DataFrame({'t': seconds, 'x': x, 'y': y}).replace([np.inf, -np.inf], np.nan).dropna()
    return frame.sort_values('t').drop_duplicates('t')


def rle(values):
    """Run-length pairs: value, count, value, count, ..."""
    values = np.asarray(values)
    starts = np.flatnonzero(np.r_[True, values[1:] != values[:-1]])
    return np.c_[values[starts], np.diff(np.r_[starts, len(values)])].ravel().astype(int).tolist()


def deltas(values):
    """First value absolute, the rest differences from the previous one."""
    values = np.asarray(values, dtype=int)
    return [int(values[0]), *np.diff(values).tolist()]


def valid_runs(valid, minimum=4):
    edges = np.flatnonzero(np.diff(np.r_[False, valid, False].astype(int)))
    return [(int(first), int(last)) for first, last in zip(edges[::2], edges[1::2]) if last - first >= minimum]


def write_json(target, payload):
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(payload, allow_nan=False, separators=(',', ':')) + '\n')
    temporary.replace(target)


def loop_length(points):
    return np.r_[0, np.cumsum(np.hypot(*np.diff(np.vstack([points, points[:1]]), axis=0).T))]


def resample_loop(points, count):
    along = loop_length(points)
    at = np.linspace(0, along[-1], count, endpoint=False)
    closed = np.vstack([points, points[:1]])
    return np.c_[np.interp(at, along, closed[:, 0]), np.interp(at, along, closed[:, 1])]


def map_transform(session, track):
    """Rebuild the track-map normalization from its reference lap and confirm it reproduces the map."""
    reference = track['reference']
    rows = session.laps[(session.laps.Driver == reference['driver']) & (session.laps.LapNumber == reference['lap'])]
    if rows.empty:
        raise PositionsUnavailableError('Track-map reference lap is not in this session')
    pos = rows.iloc[0].get_pos_data(interpolate_edges=True)
    frame = clean(pos.Time.dt.total_seconds(), pos.X, pos.Y)
    # Same orientation and scale as export_track_maps.py; keep the two in step.
    x, y = frame.x.to_numpy(dtype=float), -frame.y.to_numpy(dtype=float)
    swap = np.ptp(y) > np.ptp(x)
    if swap:
        x, y = y, -x
    scale = min(760 / np.ptp(x), 360 / np.ptp(y))
    middle = ((x.min() + x.max()) / 2, (y.min() + y.max()) / 2)

    def transform(raw_x, raw_y):
        tx, ty = np.asarray(raw_x, dtype=float), -np.asarray(raw_y, dtype=float)
        if swap:
            tx, ty = ty, -tx
        return (tx - middle[0]) * scale + 480, (ty - middle[1]) * scale + 305

    mx, my = transform(frame.x, frame.y)
    edges = np.cumsum([0, *reference['sectorTimesSeconds']])
    for sector, start, end in zip(track['sectors'], edges, edges[1:]):
        times = np.linspace(start, end, len(sector['points']))
        expected = np.array(sector['points'])
        error = np.hypot(np.interp(times, frame.t, mx) - expected[:, 0], np.interp(times, frame.t, my) - expected[:, 1])
        if error.max() > .5:
            raise PositionsUnavailableError(f'Reference lap differs from the track map by {error.max():.1f} units')
    return transform, 1 / (scale * 10)  # the feed's X/Y are tenths of a metre


def racing_line(track, samples, metres):
    """One line for the race: the feed places every car on the same path, so the median of all samples along it is that path."""
    coarse = np.array([point for index, sector in enumerate(track['sectors']) for point in sector['points'][bool(index):]])
    if np.hypot(*(coarse[0] - coarse[-1])) < 1e-6:
        coarse = coarse[:-1]
    guide = resample_loop(coarse, int(loop_length(coarse)[-1] * metres))   # about one point per metre
    distance, nearest = cKDTree(guide).query(samples)
    keep = distance * metres < 4
    bins = int(round(len(guide) / LINE_STEP))
    slot = (nearest[keep] * bins // len(guide)).astype(int)
    line = np.full((bins, 2), np.nan)
    for axis in (0, 1):
        totals = pd.Series(samples[keep, axis]).groupby(slot).median()
        line[totals.index.to_numpy(), axis] = totals.to_numpy()
    empty = np.isnan(line[:, 0])
    if empty.mean() > .05:
        raise PositionsUnavailableError(f'Too few on-track samples to build the racing line ({empty.mean():.0%} of it has none; {keep.mean():.0%} of samples are near the reference lap)')
    filled = np.flatnonzero(~empty)
    for axis in (0, 1):
        line[empty, axis] = np.interp(np.flatnonzero(empty), filled, line[filled, axis], period=bins)
        # A light three-point average removes bin-to-bin steps without moving the line.
        line[:, axis] = uniform_filter1d(line[:, axis], 3, mode='wrap')
    return line


def fit_survey(centre, line):
    """Similarity transform (with mirroring if needed) taking survey metres onto the racing line's map coordinates."""
    def solve(source, target, mirror):
        source_mid, target_mid = source.mean(0), target.mean(0)
        a, b = (source - source_mid) * ([1, -1] if mirror else [1, 1]), target - target_mid
        u, values, vt = np.linalg.svd(a.T @ b)
        sign = np.sign(np.linalg.det(u @ vt))
        rotation, scale = u @ np.diag([1, sign]) @ vt, (values * [1, sign]).sum() / (a ** 2).sum()
        return lambda points: ((points - source_mid) * ([1, -1] if mirror else [1, 1])) @ rotation * scale + target_mid

    count, best = 400, None
    target = resample_loop(line, count)
    for reverse in (False, True):
        source = resample_loop(centre[::-1] if reverse else centre, count)
        for mirror in (False, True):
            for shift in range(0, count, 2):
                moved = np.roll(target, shift, axis=0)
                transform = solve(source, moved, mirror)
                error = ((transform(source) - moved) ** 2).sum()
                if best is None or error < best[0]:
                    best = (error, mirror, transform)
    _, mirror, transform = best
    # Refine against nearest points: the two loops are not sampled alike.
    dense = resample_loop(line, 6000)
    tree, source = cKDTree(dense), resample_loop(centre, 1500)
    for _ in range(20):
        transform = solve(source, dense[tree.query(transform(source))[1]], mirror)
    return transform


def track_surface(slug, line, metres):
    """Surveyed track edges in map coordinates, or None when there is no survey or it does not fit this layout."""
    name = SURVEY_NAMES.get(slug)
    path = SURVEYS / f'{name}.csv' if name else None
    if not path or not path.exists():
        return None, 'no survey for this circuit'
    survey = np.loadtxt(path, delimiter=',', comments='#')
    centre, right_width, left_width = survey[:, :2], survey[:, 2], survey[:, 3]
    transform = fit_survey(centre, line)
    direction = np.roll(centre, -1, 0) - np.roll(centre, 1, 0)
    direction /= np.hypot(*direction.T)[:, None]
    left_normal = np.c_[-direction[:, 1], direction[:, 0]]
    middle, left, right = transform(centre), transform(centre + left_normal * left_width[:, None]), transform(centre - left_normal * right_width[:, None])
    # The racing line must lie between the edges: measure its offset from the fitted centre line against the widths.
    nearest = cKDTree(middle).query(line)[1]
    across = (left - middle)[nearest]
    half = np.hypot(*across.T)
    offset = ((line - middle[nearest]) * across).sum(1) / half
    limit = np.where(offset > 0, half, np.hypot(*(right - middle)[nearest].T))
    inside = float((np.abs(offset) <= limit + 1 / metres).mean())
    length_ratio = loop_length(middle)[-1] / loop_length(line)[-1]
    # Racing lines run over kerbs, so a few per cent outside the surveyed edges is expected; a changed layout fits far worse.
    if inside < .95 or abs(length_ratio - 1) > .03:
        return None, f'{name} survey rejected: {inside:.1%} of the line inside its edges, length ratio {length_ratio:.3f}'
    return dict(source='TUMFTM racetrack-database', name=name, inside=round(inside, 4),
                left=np.rint(left * UNITS).astype(int), right=np.rint(right * UNITS).astype(int)), f'{name} survey, {inside:.1%} inside'


def car_distance(times, along, away, grid, speed_times, speed, length):
    """Distance travelled along the racing line on the shared clock, smoothed with the car's own speed."""
    usable = away <= MAX_DISTANCE
    if speed_times is not None and len(speed_times) > 1:
        # Some sessions repeat a plausible grid coordinate after the car has accelerated. Those timestamps are
        # present but their coordinates are stale: treating them as observed motion cancels the speed integral.
        movement = np.abs((np.diff(along) + length / 2) % length - length / 2)
        velocity = np.interp(times[:-1], speed_times, speed)
        for first, last in valid_runs(movement < .75, minimum=2):
            moving_seconds = np.diff(times)[first:last][velocity[first:last] > 30].sum()
            if moving_seconds >= 2:
                usable[first:last + 1] = False
        # Repeated coordinates can jitter by a metre or two. Compare displacement over two seconds with
        # the speed integral instead of accepting each small jitter as real progress.
        index = pd.to_timedelta(times[:-1], unit='s')
        observed = pd.Series(movement, index=index).rolling('2s', min_periods=3).sum().to_numpy()
        expected = pd.Series(np.maximum(0, velocity) / 3.6 * np.diff(times), index=index).rolling('2s', min_periods=3).sum().to_numpy()
        for first, last in valid_runs((expected > 15) & (observed < expected * .2), minimum=2):
            usable[np.searchsorted(times, times[first] - 2):last + 1] = False
    times, along, away = times[usable], along[usable], away[usable]
    estimated = np.zeros(len(grid), dtype=int)
    if len(times) < 2:
        return np.full(len(grid), np.nan), estimated.copy(), estimated.astype(bool), estimated
    step = np.diff(along)
    step = (step + length / 2) % length - length / 2          # shortest way round the lap between samples
    travelled = along[0] + np.r_[0, np.cumsum(step)]
    after = np.clip(np.searchsorted(times, grid), 1, len(times) - 1)
    valid = (grid >= times[0]) & (grid <= times[-1]) & (times[after] - times[after - 1] <= MAX_GAP)
    raw = np.interp(grid, times, travelled)
    nearest = np.where(grid - times[after - 1] <= times[after] - grid, after - 1, after)
    off = (away[nearest] > OFF_LINE).astype(int)
    out = np.full(len(grid), np.nan)
    for first, last in valid_runs(valid):
        piece = raw[first:last]
        if (speed_times is not None and len(speed_times) > 1
                and speed_times[0] <= grid[first] and speed_times[-1] >= grid[last - 1]
                and not np.any(np.diff(speed_times)[(speed_times[:-1] >= grid[first] - MAX_GAP)
                                                   & (speed_times[:-1] <= grid[last - 1])] > MAX_GAP)):
            # Recorded speed gives the shape of the motion; recorded positions correct its slow drift.
            metres_per_second = np.interp(grid[first:last], speed_times, speed) / 3.6
            integral = np.r_[0, np.cumsum((metres_per_second[1:] + metres_per_second[:-1]) / 2 * np.diff(grid[first:last]))]
            piece = integral + gaussian_filter1d(piece - integral, 2 / (grid[1] - grid[0]), mode='nearest')
        else:
            piece = gaussian_filter1d(piece, 2, mode='nearest')
        out[first:last] = np.maximum.accumulate(piece)       # cars are not shown rolling backwards
    if speed_times is not None and len(speed_times) > 1:
        velocity = np.interp(grid[:-1], speed_times, speed)
        # An inconsistent projected trace can still make the monotonic clamp hold a moving car in place.
        # That is unavailable position data, not a real stop. Leave it empty instead of manufacturing a freeze.
        stalled = (np.abs(np.diff(out)) < .05) & (velocity > 30)
        for first, last in valid_runs(stalled, minimum=2):
            if grid[last] - grid[first] >= 2:
                out[first:last + 1] = np.nan
    valid = np.isfinite(out)
    anchors = np.flatnonzero(valid & (off == 0))
    if anchors.size and speed_times is not None and len(speed_times) > 1:
        anchor = int(anchors[0])
        # Reconstruct only an opening gap, never a mid-race outage or an entire lap. Anchor to the first usable
        # position and integrate speed backwards. These samples are explicitly marked as estimates in the UI.
        if (anchor > 0 and not valid[:anchor].any() and grid[anchor] - grid[0] <= MAX_LAUNCH_GAP
                and speed_times[0] <= grid[0] and speed_times[-1] >= grid[anchor]):
            after = np.clip(np.searchsorted(speed_times, grid[:anchor + 1]), 1, len(speed_times) - 1)
            if np.all(speed_times[after] - speed_times[after - 1] <= MAX_GAP):
                velocity = np.maximum(0, np.interp(grid[:anchor + 1], speed_times, speed)) / 3.6
                integral = np.r_[0, np.cumsum((velocity[1:] + velocity[:-1]) / 2 * np.diff(grid[:anchor + 1]))]
                out[:anchor] = out[anchor] - integral[-1] + integral[:-1]
                valid[:anchor], off[:anchor], estimated[:anchor] = True, 0, 1
    return out, off, valid, estimated


def car_telemetry(frame, grid):
    """Speed, throttle, brake, gear and DRS on the shared clock; throttle is rounded to 5 %."""
    times = frame.t.to_numpy(dtype=float)
    after = np.clip(np.searchsorted(times, grid), 1, len(times) - 1)
    valid = (grid >= times[0]) & (grid <= times[-1]) & (times[after] - times[after - 1] <= MAX_GAP)
    nearest = np.where(grid - times[after - 1] <= times[after] - grid, after - 1, after)
    speed = np.rint(np.interp(grid, times, frame.speed.to_numpy(dtype=float))).astype(int)
    throttle = (np.rint(np.clip(frame.throttle.to_numpy(dtype=float), 0, 100) / 5) * 5).astype(int)[nearest]
    brake = (frame.brake.to_numpy(dtype=float) > 0).astype(int)[nearest]
    gear = frame.gear.to_numpy(dtype=int)[nearest]
    # FastF1 documents DRS values 10, 12 and 14 as open.
    drs = (frame.drs.to_numpy(dtype=int) >= 10).astype(int)[nearest]
    return [dict(i=first, speed=deltas(speed[first:last]), throttle=rle(throttle[first:last]), brake=rle(brake[first:last]),
                 gear=rle(gear[first:last]), drs=rle(drs[first:last])) for first, last in valid_runs(valid)]


def export_positions(season, entry, cache_dir, force=False, cached_only=False):
    slug = entry['slug']
    target = ROOT / 'public/replay' / str(season) / f'{slug}.json'
    telemetry_target = target.with_name(f'{slug}.telemetry.json')
    snapshot_path = ROOT / 'data' / str(season) / f'{slug}.json'
    track_path = ROOT / 'data/tracks' / str(season) / f'{slug}.json'
    if target.exists() and telemetry_target.exists() and not force:
        print(f'{season}/{slug}: existing replay data retained', flush=True)
        return
    if not snapshot_path.exists() or not track_path.exists():
        return
    snapshot, track = json.loads(snapshot_path.read_text()), json.loads(track_path.read_text())
    laps = [lap for lap in snapshot['laps'] if not lap['generated'] and lap['sessionTimeSeconds'] is not None]
    if not laps:
        return
    session = fastf1.get_session(season, entry['round'], 'R')
    # ponytail: cache name matches pinned FastF1 3.8.3; review when upgrading FastF1.
    if cached_only and not (cache_dir / session.api_path.removeprefix('/static/') / 'position_data.ff1pkl').exists():
        print(f'{season}/{slug}: position telemetry not cached; skipped', flush=True)
        return
    session.load(telemetry=True, weather=False, messages=False)
    transform, metres = map_transform(session, track)
    first_starts = [lap['sessionTimeSeconds'] - lap['timeSeconds'] for lap in laps
                    if lap['number'] == 1 and lap['timeSeconds'] is not None]
    start = min(first_starts) if first_starts else min((lap['sessionTimeSeconds'] - lap['timeSeconds']
                  for lap in laps if lap['timeSeconds'] is not None), default=min(lap['sessionTimeSeconds'] for lap in laps))
    t0, end = float(np.floor(start)), max(lap['sessionTimeSeconds'] for lap in laps)
    grid = t0 + STEP * np.arange(int(np.ceil((end - t0) / STEP)) + 1)
    fine = t0 + STEP / 2 * np.arange(2 * len(grid) - 1)      # smoothing runs at twice the exported rate
    recorded = {}
    for driver in snapshot['drivers']:
        pos = session.pos_data.get(driver['number'])
        if pos is None or pos.empty:
            continue
        # The feed reports exactly 0,0 when a car has no position.
        frame = clean(pos.SessionTime.dt.total_seconds(), pos.X, pos.Y)
        frame = frame[(frame.x != 0) | (frame.y != 0)]
        if len(frame) >= 2:
            recorded[driver['code']] = (frame.t.to_numpy(dtype=float), np.c_[transform(frame.x, frame.y)], driver['number'])
    if not recorded:
        raise PositionsUnavailableError('No recorded position samples')
    in_race = [points[(times >= t0) & (times <= end)] for times, points, _ in recorded.values()]
    line = racing_line(track, np.vstack(in_race), metres)
    dense = resample_loop(line, len(line) * 4)
    dense_along = loop_length(dense)[:-1] * metres
    length, tree = float(loop_length(line)[-1] * metres), cKDTree(dense)
    cars, telemetry = {}, {}
    for code, (times, points, number) in recorded.items():
        away, nearest = tree.query(points)
        car = session.car_data.get(number)
        speeds = None
        if car is not None and not car.empty:
            speeds = pd.DataFrame({'t': car.SessionTime.dt.total_seconds(), 'speed': car.Speed, 'throttle': car.Throttle,
                                   'brake': car.Brake.astype(float), 'gear': car.nGear, 'drs': car.DRS})
            speeds = speeds.replace([np.inf, -np.inf], np.nan).dropna().sort_values('t').drop_duplicates('t')
            if len(speeds) < 2:
                speeds = None
        travelled, off, valid, estimated = car_distance(times, dense_along[nearest], away * metres, fine, None if speeds is None else speeds.t.to_numpy(dtype=float),
                                             None if speeds is None else speeds.speed.to_numpy(dtype=float), length)
        travelled, off, valid, estimated = travelled[::2], off[::2], valid[::2], estimated[::2]
        runs = [dict(i=first, d=deltas(np.rint(travelled[first:last] * 10)), off=rle(off[first:last]), estimated=rle(estimated[first:last]))
                for first, last in valid_runs(valid & ~np.isnan(travelled))]
        if runs:
            cars[code] = runs
        if speeds is not None:
            runs = car_telemetry(speeds, grid)
            if runs:
                telemetry[code] = runs
    if not cars:
        raise PositionsUnavailableError('No recorded position samples in the race window')
    surface, note = track_surface(slug, line, metres)
    sector_ends = [float(dense_along[tree.query(np.array(sector['end']))[1]]) for sector in track['sectors'][:2]]
    shared = dict(season=season, round=entry['round'], slug=slug, fastf1Version=fastf1.__version__,
                  exportedAt=datetime.now(timezone.utc).isoformat(), t0=t0, step=STEP, count=len(grid))
    stored = np.rint(line * UNITS).astype(int)
    payload = dict(shared, schemaVersion=2, source='FastF1 position telemetry',
                   reference=dict(driver=track['reference']['driver'], lap=track['reference']['lap']),
                   units=UNITS, metresPerUnit=round(metres, 4), length=round(length, 1), sectorEnds=[round(value, 1) for value in sector_ends],
                   line=dict(x=deltas(stored[:, 0]), y=deltas(stored[:, 1])), cars=cars)
    if surface:
        payload['surface'] = dict(source=surface['source'], name=surface['name'], inside=surface['inside'],
                                  left=dict(x=deltas(surface['left'][:, 0]), y=deltas(surface['left'][:, 1])),
                                  right=dict(x=deltas(surface['right'][:, 0]), y=deltas(surface['right'][:, 1])))
    write_json(target, payload)
    if telemetry:
        write_json(telemetry_target, dict(shared, schemaVersion=1, source='FastF1 car telemetry', cars=telemetry))
    print(f'{season}/{slug}: {len(cars)} cars, lap {length:.0f} m, {note}, positions {target.stat().st_size / 1e6:.2f} MB'
          + (f', telemetry {telemetry_target.stat().st_size / 1e6:.2f} MB' if telemetry else ', no car telemetry'), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--season', type=int)
    parser.add_argument('--race', default='all')
    parser.add_argument('--all-seasons', action='store_true')
    parser.add_argument('--force', action='store_true')
    parser.add_argument('--cached-only', action='store_true', help='Use only position telemetry already in the cache; no downloads')
    parser.add_argument('--cache', type=Path, default=ROOT / '.fastf1-cache')
    args = parser.parse_args()
    if not args.all_seasons and args.season is None:
        parser.error('Select --season or --all-seasons')
    years = sorted((int(path.name) for path in (ROOT / 'data/tracks').iterdir() if path.name.isdigit()),
                   reverse=True) if args.all_seasons else [args.season]
    args.cache.mkdir(parents=True, exist_ok=True)
    fastf1.Cache.enable_cache(str(args.cache))
    if args.cached_only:
        fastf1.Cache.offline_mode(True)
    # FastF1's public request wrapper does not set a default network timeout.
    cached_get = fastf1.Cache.requests_get
    def bounded_get(url, **kwargs):
        kwargs.setdefault('timeout', (15, 90))
        return cached_get(url, **kwargs)
    fastf1.Cache.requests_get = bounded_get
    failures = []
    for year in years:
        calendar_path = ROOT / 'data' / str(year) / 'calendar.json'
        if not calendar_path.exists():
            parser.error(f'Season {year} is not imported')
        calendar = json.loads(calendar_path.read_text())
        if args.race != 'all' and not any(entry['slug'] == args.race for entry in calendar):
            parser.error(f'Unknown race {args.race} in {year}')
        for entry in calendar:
            if args.race != 'all' and entry['slug'] != args.race:
                continue
            try:
                export_positions(year, entry, args.cache, args.force, args.cached_only)
            except RateLimitExceededError as error:
                raise SystemExit(f'Download limit reached: {error}. Existing files retained; resume after reset.')
            except Exception as error:
                failures.append(f"{year}/{entry['slug']}")
                print(f"{year}/{entry['slug']}: REPLAY EXPORT FAILED: {error}", flush=True)
    if failures:
        raise SystemExit('Replay data unavailable for: ' + ', '.join(failures))
