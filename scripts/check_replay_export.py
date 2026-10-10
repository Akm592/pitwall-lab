"""Run with .venv/bin/python scripts/check_replay_export.py; no downloads needed."""
import numpy as np
from export_positions import car_distance
from export_replay_timing import rank_changes, seconds, timing_payload
from export_positions import export_car_telemetry
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import json
import pandas as pd
from unittest.mock import patch

# Stale garage coordinates used to project ahead of the first reliable position, then freeze the launch.
times = np.arange(20, dtype=float)
along = times * 10
along[:7] = 600
away = np.zeros(20)
away[:7] = 500
distance, off, valid, estimated = car_distance(times, along, away, times, times, np.full(20, 36.), 1000.)
assert valid.all()
assert np.allclose(distance, times * 10)
assert estimated[:7].all() and not estimated[7:].any()
assert not off.any()

# A repeated on-track coordinate is equally stale when the car's speed says it is moving.
stale = times * 10
stale[:7] = 0
distance, _, valid, estimated = car_distance(times, stale, np.zeros(20), times, times, np.full(20, 36.), 1000.)
assert valid.all() and estimated[:7].all()
assert np.allclose(distance, times * 10)
# Real stationary cars must remain stationary.
distance, _, valid, estimated = car_distance(times, np.zeros(20), np.zeros(20), times, times, np.zeros(20), 1000.)
assert valid.all() and not estimated.any() and not distance.any()
# Long opening gaps and missing speed must stay absent, not be invented.
long_times = np.arange(80, dtype=float)
long_away = np.zeros(80)
long_away[:70] = 500
distance, _, valid, estimated = car_distance(long_times, long_times * 10, long_away, long_times, long_times, np.full(80, 36.), 1000.)
assert not valid[:70].any() and not estimated.any()
away[:7], away[7:] = 500, 0
distance, _, valid, estimated = car_distance(times, along, away, times, None, None, 1000.)
assert not valid[:7].any() and not estimated.any()

# Missing checkpoints stay null; recorded rank changes keep their actual timestamps.
assert seconds(pd.NaT) is None
assert seconds(pd.Timedelta(seconds=12.345)) == 12.345
assert rank_changes([(None, 1), (1., np.nan), (2., 2), (3., 2), (4.25, 1)]) == [
    {'t': 2., 'position': 2}, {'t': 4.25, 'position': 1}]
# Lap.Position is a derived completion-time estimate and must not replace missing observed classification.
lap = dict(Driver='AAA', FastF1Generated=False, LapNumber=1, Position=1,
           LapStartTime=pd.Timedelta('1s'), Sector1SessionTime=pd.NaT, Sector2SessionTime=pd.Timedelta('3s'),
           Sector3SessionTime=pd.Timedelta('5.1s'), Time=pd.Timedelta('5s'), PitInTime=pd.NaT, PitOutTime=pd.NaT)
with patch('export_replay_timing._api.timing_data', return_value=(None, pd.DataFrame(columns=['Driver', 'Time', 'Position']))):
    payload = timing_payload(SimpleNamespace(laps=pd.DataFrame([lap]), api_path='', t0_date=None),
                             {'season': 2025, 'slug': 'test', 'drivers': [{'number': '1', 'code': 'AAA'}]})
    assert payload['cars']['AAA']['ranks'] == []
    assert payload['cars']['AAA']['rankSource'] == 'unavailable'

# A driver with no position geometry still exports independently measured speed.
car = pd.DataFrame({'SessionTime': pd.to_timedelta([0, .5, 1, 1.5], unit='s'), 'Speed': [0, 20, 40, 60],
                    'Throttle': [0, 100, 100, 100], 'Brake': [False] * 4, 'nGear': [1] * 4, 'DRS': [0] * 4})
with TemporaryDirectory() as folder:
    target = Path(folder) / 'telemetry.json'
    export_car_telemetry(SimpleNamespace(car_data={'1': car}, pos_data={}), [{'number': '1', 'code': 'AAA'}],
                         np.array([0, .5, 1, 1.5]), {'t0': 0, 'step': .5, 'count': 4}, target)
    assert json.loads(target.read_text())['cars']['AAA'][0]['speed'] == [0, 20, 20, 20]

# Mid-race position outages and discontinuous speed cannot be bridged.
keep = (times < 5) | (times > 10)
distance, _, valid, estimated = car_distance(times[keep], times[keep] * 10, np.zeros(keep.sum()), times, times, np.full(20, 36.), 1000.)
assert not valid[5:11].any() and not estimated.any()
speed_keep = (times < 2) | (times > 5)
distance, _, valid, estimated = car_distance(times, along, away, times, times[speed_keep], np.full(speed_keep.sum(), 36.), 1000.)
assert not valid[:7].any() and not estimated.any()
print('Replay export checks passed: stale launch, long gaps, missing speed, mid-race outages, observed ranks and geometry-independent telemetry.')
