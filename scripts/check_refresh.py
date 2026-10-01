"""Offline checks: .venv/bin/python scripts/check_refresh.py"""
from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import pandas as pd
import export_races as races
import refresh_data as refresh
import export_track_maps as maps
from fastf1.exceptions import RateLimitExceededError

now = datetime(2026, 10, 1, 18, tzinfo=timezone.utc)
entry = {'date': '2026-10-01', 'raceStartUtc': '2026-10-01T16:00:00Z', 'status': 'completed'}
assert refresh.selected(entry, now, False)  # same-day import
assert not refresh.selected(entry, now - timedelta(hours=1), False)
assert not refresh.selected(entry, now + timedelta(days=1), False)
assert refresh.selected(entry, now + timedelta(days=1), True)
assert not refresh.selected(entry, now + timedelta(days=15), True)
assert refresh.selected(dict(entry, status='unavailable'), now + timedelta(days=15), True)
assert races.race_start(entry) == refresh.start_time(entry)
assert races.race_start({'date': '2026-10-01'}) <= now
assert not races.session_complete(pd.DataFrame({'Status': []}))
assert not races.session_complete(pd.DataFrame({'Status': ['Finished', 'Started']}))
assert races.session_complete(pd.DataFrame({'Status': ['Started', 'Finished', 'Finalised']}))

calendar = json.loads((races.ROOT / 'data/2024/calendar.json').read_text())
race = next(item for item in calendar if item['slug'] == 'bahrain')
data = json.loads((races.ROOT / 'data/2024/bahrain.json').read_text())
races.validate_snapshot(data, 2024, race)
legacy = deepcopy(data)
next(driver for driver in legacy['drivers'] if driver['position'] == 1)['status'] = ''
races.validate_snapshot(legacy, 2024, race)
try:
    races.validate_snapshot(legacy, 2024, race, require_final_result=True)
except ValueError:
    pass
else:
    raise AssertionError('Unconfirmed winner result accepted by automation')
for invalid in [dict(data, season=2025), dict(data, laps=[]), dict(data, totalLaps=1)]:
    try:
        races.validate_snapshot(invalid, 2024, race)
    except ValueError:
        pass
    else:
        raise AssertionError('Invalid snapshot accepted')

with TemporaryDirectory() as directory:
    path = Path(directory) / 'race.json'
    assert races.write_json(path, data)
    original = path.read_bytes()
    copy = deepcopy(data)
    copy['exportedAt'] = now.isoformat()
    assert not races.write_json(path, copy)
    assert path.read_bytes() == original
    copy['drivers'][0]['points'] += 1
    assert races.write_json(path, copy)
    assert json.loads(path.read_text())['drivers'][0]['points'] == copy['drivers'][0]['points']

    original_root = refresh.ROOT
    try:
        refresh.ROOT = Path(directory)
        for year in (2026, 2027):
            target = refresh.ROOT / 'data' / str(year) / 'calendar.json'
            target.parent.mkdir(parents=True)
            target.write_text('[]')
        assert list(refresh.calendars(datetime(2027, 1, 1, tzinfo=timezone.utc))) == [2026, 2027]
        assert list(refresh.calendars(datetime(2027, 1, 15, tzinfo=timezone.utc))) == [2027]
    finally:
        refresh.ROOT = original_root

# A rejected in-progress session must not write or replace race data.
original_get = races.fastf1.get_session
original_races = races.RACES
class InProgress:
    session_status = pd.DataFrame({'Status': ['Started']})
    def load(self, **kwargs):
        pass
try:
    races.RACES = {race['slug']: race}
    races.fastf1.get_session = lambda *args: InProgress()
    try:
        races.export(race['slug'], 2024, require_complete=True)
    except RuntimeError as error:
        assert 'completion' in str(error)
    else:
        raise AssertionError('In-progress race accepted')
finally:
    races.fastf1.get_session = original_get
    races.RACES = original_races

with TemporaryDirectory() as directory, patch.object(refresh, 'ROOT', Path(directory)), patch.object(refresh, 'calendars', return_value={2026: [dict(entry, slug='example', round=1)]}), patch.object(races.fastf1.Cache, 'enable_cache'), patch.object(races.fastf1.Cache, 'requests_get'), patch.object(races, 'snapshot_valid', return_value=True), patch.object(races, 'export', return_value=True) as importer, patch.object(maps, 'export_track', side_effect=RuntimeError('position data missing')) as mapper:
    summary = []
    assert refresh.refresh(now, False, summary)
    assert any('updated' in message for message in summary)
    assert any('map unavailable' in message for message in summary)
    saved = json.loads((Path(directory) / 'data/2026/calendar.json').read_text())
    assert saved[0]['status'] == 'completed'
    importer.assert_called_once_with('example', 2026, require_complete=True)
    mapper.side_effect = RateLimitExceededError('hourly limit')
    try:
        refresh.refresh(now, False, [])
    except RateLimitExceededError:
        pass
    else:
        raise AssertionError('Rate limit did not stop the refresh')

print('Refresh checks passed: windows, completion, validation, corrections, rollover, missing maps and rate limits.')
