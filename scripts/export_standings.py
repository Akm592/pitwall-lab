"""Import championship standings, including sprints, through the latest recorded race."""
import argparse
from datetime import datetime, timezone
import json
import math
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import export_races as races

ROOT = races.ROOT
API = 'https://api.jolpi.ca/ergast/f1/'


def fetch(url):
    for attempt in range(3):
        try:
            with urlopen(Request(url, headers={'User-Agent': 'PitwallLab/0.1.0'}), timeout=30) as response:
                return json.load(response)
        except HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise
            time.sleep(min(60, int(error.headers.get('Retry-After', 5 * (attempt + 1)))))


def build(season, round_, drivers_page, teams_page):
    def table(page):
        tables = page['MRData']['StandingsTable']['StandingsLists']
        if len(tables) != 1 or int(tables[0]['season']) != season or int(tables[0]['round']) != round_:
            raise ValueError('Standings do not match the requested season and round')
        return tables[0]

    drivers = [dict(position=int(row['position']), code=row['Driver']['code'],
                    name=row['Driver']['givenName'] + ' ' + row['Driver']['familyName'],
                    team=row['Constructors'][-1]['name'], points=float(row['points']), wins=int(row['wins']))
               for row in table(drivers_page)['DriverStandings']]
    teams = [dict(position=int(row['position']), id=row['Constructor']['constructorId'],
                  name=row['Constructor']['name'], points=float(row['points']), wins=int(row['wins']))
             for row in table(teams_page)['ConstructorStandings']]
    for rows, key in [(drivers, 'code'), (teams, 'id')]:
        if (not rows or len({row[key] for row in rows}) != len(rows)
                or sorted(row['position'] for row in rows) != list(range(1, len(rows) + 1))
                or any(not row['name'] or not row[key] or not math.isfinite(row['points'])
                       or row['points'] < 0 or row['wins'] < 0 for row in rows)):
            raise ValueError('Invalid or incomplete championship standings')
        rows.sort(key=lambda row: row['position'])
    return dict(schemaVersion=1, season=season, round=round_, source='Jolpica',
                sourceUrl=f'{API}{season}/{round_}/driverstandings/',
                exportedAt=datetime.now(timezone.utc).isoformat(), drivers=drivers, constructors=teams)


def export(season):
    calendar = json.loads((ROOT / 'data' / str(season) / 'calendar.json').read_text())
    rounds = [race['round'] for race in calendar if race.get('status') == 'completed'
              and (ROOT / 'data' / str(season) / (race['slug'] + '.json')).exists()]
    if not rounds:
        print(f'{season}: no completed race to import standings for')
        return
    round_ = max(rounds)
    data = build(season, round_, fetch(f'{API}{season}/{round_}/driverstandings/?limit=100'),
                 fetch(f'{API}{season}/{round_}/constructorstandings/?limit=100'))
    # Write only after both complete tables validate; provider failures retain the previous snapshot.
    changed = races.write_json(ROOT / 'data' / str(season) / 'standings.json', data)
    print(f'{season}: championship standings through round {round_}: {"updated" if changed else "unchanged"}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--season', type=int)
    args = parser.parse_args()
    season = args.season or max(int(path.parent.name) for path in (ROOT / 'data').glob('*/calendar.json')
                               if path.parent.name.isdigit() and int(path.parent.name) <= datetime.now(timezone.utc).year)
    export(season)
