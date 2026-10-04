"""Run with .venv/bin/python scripts/check_replay_export.py; no downloads needed."""
import numpy as np
from export_positions import car_distance

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

# Mid-race position outages and discontinuous speed cannot be bridged.
keep = (times < 5) | (times > 10)
distance, _, valid, estimated = car_distance(times[keep], times[keep] * 10, np.zeros(keep.sum()), times, times, np.full(20, 36.), 1000.)
assert not valid[5:11].any() and not estimated.any()
speed_keep = (times < 2) | (times > 5)
distance, _, valid, estimated = car_distance(times, along, away, times, times[speed_keep], np.full(speed_keep.sum(), 36.), 1000.)
assert not valid[:7].any() and not estimated.any()
print('Replay export checks passed: stale launch, long gaps, missing speed and mid-race outages.')
