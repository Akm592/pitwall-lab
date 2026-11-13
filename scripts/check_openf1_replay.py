"""Offline checks for OpenF1 clocks, session validation and retaining published bundles."""
from copy import deepcopy
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from io import BytesIO, StringIO
from contextlib import redirect_stdout

import export_openf1_replay as replay
import refresh_replays as refresh

snapshot = dict(season=2026, slug='test', round=1, exportedAt='2026-11-01T00:00:00Z', source='OpenF1',
                openf1=dict(sessionKey=123, sessionStart='2026-11-01T00:00:00+00:00'),
                drivers=[dict(code='AAA', number='1')], laps=[
                    dict(driver='AAA', number=1, sessionTimeSeconds=100),
                    dict(driver='AAA', number=2, sessionTimeSeconds=180)])
laps = [dict(driver_number=1, lap_number=1, date_start='2026-11-01T00:00:10+00:00', lap_duration=90,
             duration_sector_1=20, duration_sector_2=30, duration_sector_3=40),
        dict(driver_number=1, lap_number=2, date_start='2026-11-01T00:01:39.8+00:00', lap_duration=80.2,
             duration_sector_1=None, duration_sector_2=30, duration_sector_3=30)]
positions = [dict(driver_number=1, date='2026-11-01T00:00:15+00:00', position=2),
             dict(driver_number=1, date='2026-11-01T00:00:16+00:00', position=2),
             dict(driver_number=1, date='2026-11-01T00:00:17+00:00', position=1)]
payload = replay.timing_payload(snapshot, laps, positions)
assert payload['clockPrecision'] == 'approximate'
assert payload['start'] == 10 and payload['end'] == 180
assert payload['cars']['AAA']['laps'][0]['end'] == payload['cars']['AAA']['laps'][1]['start'] == 99.8
assert payload['cars']['AAA']['laps'][0]['sector1'] == 30
assert payload['cars']['AAA']['laps'][1]['sector1'] is None
assert payload['cars']['AAA']['laps'][1]['sector2'] is None
assert payload['cars']['AAA']['ranks'] == [dict(t=15, position=2), dict(t=17, position=1)]
assert payload['cars']['AAA']['rankSource'] == 'OpenF1 position stream'
assert replay.timing_payload(snapshot, laps, [])['cars']['AAA']['rankSource'] == 'unavailable'
bad = deepcopy(laps)
bad[0]['date_start'] = '2026-11-01T01:00:10+00:00'
try:
    replay.timing_payload(snapshot, bad, positions)
except ValueError:
    pass
else:
    raise AssertionError('Wrong replay clock accepted')

with TemporaryDirectory() as directory:
    root = Path(directory)
    with patch.object(replay, 'ROOT', root):
        for path in replay.replay_paths(snapshot):
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(dict(snapshotExportedAt=snapshot['exportedAt'])))
        assert replay.complete(snapshot)
        assert not replay.complete(dict(snapshot, exportedAt='2026-11-02T00:00:00Z'))
        files = {path: path.read_bytes() for path in replay.replay_paths(snapshot)}
        with patch.object(replay.OpenF1, 'fetch', side_effect=RuntimeError('provider unavailable')):
            try:
                replay.export_openf1(snapshot, root / 'cache', force=True)
            except RuntimeError:
                pass
            else:
                raise AssertionError('Provider failure accepted')
        assert all(path.read_bytes() == data for path, data in files.items())
    api = replay.OpenF1(root / 'cache')
    api.cache.mkdir()
    cached = api.cache / 'laps-session_key=123.json'
    cached.write_text('[{"session_key":999}]')
    try:
        api.fetch('laps', session_key=123)
    except ValueError:
        pass
    else:
        raise AssertionError('Wrong session cache accepted')
    api.not_before = cached.stat().st_mtime + 60
    with patch.object(replay, 'urlopen', side_effect=RuntimeError('stale cache refreshed')) as request:
        try:
            api.fetch('laps', session_key=123)
        except RuntimeError:
            pass
        request.assert_called_once()
    api.not_before = 0
    cached.write_text('[]')
    with patch.object(replay, 'urlopen', side_effect=RuntimeError('fresh fetch attempted')) as request:
        try:
            api.fetch('laps', session_key=123)
        except RuntimeError:
            pass
        request.assert_called_once()
    with patch.object(replay, 'urlopen', return_value=BytesIO(b'[]')):
        assert api.fetch('car_data', session_key=123, driver_number='99', allow_empty=True) == []
        assert not (api.cache / 'car_data-session_key=123&driver_number=99.json').exists()
    with patch.object(refresh, 'ROOT', root):
        calendar = [dict(slug=str(i), round=i) for i in range(1, 6)]
        folder = root / 'data/2026'
        folder.mkdir(parents=True)
        (folder / 'calendar.json').write_text(json.dumps(calendar))
        for i in range(1, 5):
            (folder / f'{i}.json').write_text(json.dumps(dict(snapshot, slug=str(i), round=i, coverage='results' if i == 4 else 'timing')))
        assert [entry['round'] for entry, _ in refresh.recent_races(2026)] == [4, 3, 2]
        with patch.object(refresh, 'recent_races', return_value=[(calendar[3], dict(snapshot, coverage='results'))]), redirect_stdout(StringIO()), patch.dict(os.environ, {'GITHUB_STEP_SUMMARY': ''}):
            assert refresh.refresh(2026, root / 'cache')

print('OpenF1 replay checks passed: approximate/continuous clocks, missing sectors, observed ranks, stale bundles, provider failure retention and recent-race selection.')
