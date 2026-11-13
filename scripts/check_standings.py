"""Offline checks for championship imports and preservation on invalid responses."""
from copy import deepcopy
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import export_standings as standings

driver = {'position': '1', 'points': '390', 'wins': '9',
          'Driver': {'code': 'ANT', 'givenName': 'Kimi', 'familyName': 'Antonelli'},
          'Constructors': [{'name': 'Mercedes'}]}
team = {'position': '1', 'points': '652', 'wins': '12',
        'Constructor': {'constructorId': 'mercedes', 'name': 'Mercedes'}}


def page(key, rows, round_='20'):
    return {'MRData': {'StandingsTable': {'StandingsLists': [dict(season='2026', round=round_, **{key: rows})]}}}


drivers = page('DriverStandings', [driver])
teams = page('ConstructorStandings', [team])
data = standings.build(2026, 20, drivers, teams)
assert data['drivers'][0]['points'] == 390 and data['constructors'][0]['points'] == 652
invalid = deepcopy(drivers)
invalid['MRData']['StandingsTable']['StandingsLists'][0]['DriverStandings'][0]['points'] = 'NaN'
for response in [invalid, page('DriverStandings', []), page('DriverStandings', [driver], '19'),
                 page('DriverStandings', [driver, driver])]:
    try:
        standings.build(2026, 20, response, teams)
    except ValueError:
        pass
    else:
        raise AssertionError('Invalid standings accepted')

with TemporaryDirectory() as directory, patch.object(standings, 'ROOT', Path(directory)):
    root = Path(directory) / 'data/2026'
    root.mkdir(parents=True)
    (root / 'calendar.json').write_text(json.dumps([{'slug': 'brazil', 'round': 20, 'status': 'completed'}]))
    (root / 'brazil.json').write_text('{}')
    saved = root / 'standings.json'
    saved.write_text(json.dumps(data))
    original = saved.read_bytes()
    with patch.object(standings, 'fetch', side_effect=[drivers, page('ConstructorStandings', [], '19')]):
        try:
            standings.export(2026)
        except ValueError:
            pass
        else:
            raise AssertionError('Mismatched provider response accepted')
    assert saved.read_bytes() == original

print('Standings checks passed: round identity, complete tables, duplicate rows, finite points, previous snapshot retained.')
