"""Maintain replay bundles for the three latest imported races of a season."""
import argparse
from datetime import datetime, timezone
import json
import os

from export_positions import ROOT, export_positions
from export_track_maps import export_track
from export_replay_timing import export_timing
from export_openf1_replay import complete, export_openf1, replay_paths


def recent_races(season):
    calendar = json.loads((ROOT / 'data' / str(season) / 'calendar.json').read_text())
    snapshots = []
    for entry in sorted(calendar, key=lambda row: row['round'], reverse=True):
        path = ROOT / 'data' / str(season) / f'{entry["slug"]}.json'
        if not path.exists():
            continue
        snapshot = json.loads(path.read_text())
        snapshots.append((entry, snapshot))
        if len(snapshots) == 3:
            break
    return snapshots


def refresh(season, cache):
    import fastf1
    cache.mkdir(parents=True, exist_ok=True)
    messages = ['## Latest race replay coverage']
    failed = False
    for entry, snapshot in recent_races(season):
        label = f'{season}/{entry["slug"]}'
        try:
            if snapshot.get('coverage') == 'results' or not snapshot.get('laps'):
                raise ValueError('Detailed race timing is unavailable')
            if snapshot.get('source') == 'OpenF1':
                export_openf1(snapshot, cache / 'openf1')
                if not complete(snapshot):
                    raise ValueError('Replay bundle does not match the current snapshot')
            elif not complete(snapshot):
                fastf1.Cache.enable_cache(str(cache))
                export_track(season, entry, cache, force=True)
                export_positions(season, entry, cache, force=True)
                export_timing(season, entry['slug'], cache, offline=False)
                if not all(path.exists() for path in replay_paths(snapshot)):
                    raise ValueError('Circuit geometry or replay assets remain unavailable')
            messages.append(f'{label}: replay ready')
        except Exception as error:
            failed = True
            message = f'{label}: replay unavailable: {error}'
            messages.append(message)
            print('::warning::' + message.replace('%', '%25').replace('\n', '%0A'), flush=True)
    report = '\n\n'.join(messages) + '\n'
    print(report, flush=True)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a') as output:
            output.write(report)
    return failed


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--season', type=int)
    args = parser.parse_args()
    years = sorted((int(path.name) for path in (ROOT / 'data').iterdir()
                    if path.name.isdigit() and int(path.name) <= datetime.now(timezone.utc).year), reverse=True)
    season = args.season or next(year for year in years if recent_races(year))
    raise SystemExit(int(refresh(season, ROOT / '.fastf1-auto-cache')))
