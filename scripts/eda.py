"""Offline EDA: .venv/bin/python scripts/eda.py (or --check for helper checks)."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path

os.environ.setdefault('MPLCONFIGDIR', '/tmp/pitwall-matplotlib')
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
FIELDS = ['timeSeconds', 'sector1', 'sector2', 'sector3', 'position', 'tyreLife', 'sessionTimeSeconds']


def compound(value):
    return None if value is None or str(value).strip().upper() in ('', 'NAN', 'NONE', 'UNKNOWN') else str(value).upper()


def eligible(lap):
    return bool(lap.get('timeSeconds') and lap['timeSeconds'] > 0 and lap.get('accurate')
                and not any(lap.get(key) for key in ('deleted', 'generated', 'pitIn', 'pitOut'))
                and lap.get('trackStatus') == '1')


def load():
    races, laps, results, weather = [], [], [], []
    for directory in sorted((ROOT / 'data').iterdir()):
        if not directory.name.isdigit():
            continue
        for event in json.loads((directory / 'calendar.json').read_text()):
            path = directory / (event['slug'] + '.json')
            meta = dict(season=int(directory.name), slug=event['slug'], circuit=event['circuit'],
                        status=event.get('status'), race=f'{directory.name}/{event["slug"]}')
            if not path.exists():
                races.append(dict(meta, coverage='missing', laps=0, eligible=0, stints=0, events=0))
                continue
            data = json.loads(path.read_text())
            records = data.get('laps', [])
            races.append(dict(meta, coverage='timing' if records else 'results', laps=len(records),
                              eligible=sum(bool(l.get('eligible')) for l in records),
                              stints=len(data.get('stints', [])), events=len(data.get('events', []))))
            results.extend(dict(driver, **meta) for driver in data['drivers'])
            weather.extend(dict(row, **meta) for row in data.get('weather', []))
            for lap in records:
                laps.append(dict(lap, **meta, compoundRaw=lap.get('compound'),
                                 expectedEligible=eligible(lap)))
    return tuple(pd.DataFrame(rows) for rows in (races, laps, results, weather))


def table(frame):
    """Markdown without requiring the optional tabulate dependency."""
    rows = [list(map(str, frame.columns)), ['---'] * len(frame.columns)]
    rows.extend([[str(value) for value in row] for row in frame.itertuples(index=False, name=None)])
    return '\n'.join('| ' + ' | '.join(row) + ' |' for row in rows)


def next_lap_pairs(laps):
    ordered = laps.sort_values(['race', 'driver', 'number']).copy()
    groups = ordered.groupby(['race', 'driver'])
    for field in ['number', 'eligible', 'compound', 'stint', 'timeSeconds']:
        ordered['next_' + field] = groups[field].shift(-1)
    return ordered[(ordered.season >= 2019) & ordered.eligible & ordered.next_eligible.eq(True)
                   & ordered.compound.isin(['SOFT', 'MEDIUM', 'HARD']) & ordered.tyreLife.notna()
                   & ordered.compound.eq(ordered.next_compound) & ordered.stint.eq(ordered.next_stint)
                   & ordered.next_number.eq(ordered.number + 1)].copy()


def analyze(output):
    races, laps, results, weather = load()
    output.mkdir(parents=True, exist_ok=True)
    laps['compound'] = laps.compoundRaw.map(compound)
    clean = laps[laps.eligible].copy()
    coverage = pd.crosstab(races.season, races.coverage).reindex(columns=['timing', 'results', 'missing'], fill_value=0)
    yearly = races.groupby('season')[['laps', 'eligible', 'stints']].sum().join(coverage)
    missing = pd.DataFrame({
        'field': FIELDS + ['compound'],
        'all_missing': [int(laps[f].isna().sum()) for f in FIELDS + ['compound']],
        'eligible_missing': [int(clean[f].isna().sum()) for f in FIELDS + ['compound']],
    })
    missing['all_missing_pct'] = (100 * missing.all_missing / len(laps)).round(2)
    flags = {key: int(laps[key].sum()) for key in ['pitIn', 'pitOut', 'deleted', 'generated', 'accurate']}
    mismatch = int((laps.eligible != laps.expectedEligible).sum())
    duplicates = int(laps.duplicated(['race', 'driver', 'number']).sum())
    invalid_time = int((laps.timeSeconds.notna() & (laps.timeSeconds <= 0)).sum())
    sectors = clean.dropna(subset=['sector1', 'sector2', 'sector3', 'timeSeconds'])
    residual = sectors[['sector1', 'sector2', 'sector3']].sum(axis=1) - sectors.timeSeconds
    dry = clean[clean.compound.isin(['SOFT', 'MEDIUM', 'HARD'])].copy()
    # Descriptive normalization uses the whole observed driver/race. Never use it as a forecast feature.
    dry['paceDelta'] = dry.timeSeconds - dry.groupby(['race', 'driver']).timeSeconds.transform('median')
    wet = int(weather.groupby('race').rainfall.any().sum())
    weather_missing = {f: int(weather[f].isna().sum()) for f in ['timeSeconds', 'airTemp', 'trackTemp', 'humidity', 'windSpeed']}
    model_pool = dry[(dry.season >= 2019) & dry.tyreLife.notna()]
    pairs = next_lap_pairs(laps)
    pairs['lastLapError'] = (pairs.next_timeSeconds - pairs.timeSeconds).abs()
    pair_years = pairs.groupby('season').size().rename('candidate_next_lap_pairs').reset_index()
    baseline = pairs.groupby('season').agg(pairs=('number', 'size'), races=('race', 'nunique'),
                                          last_lap_MAE_seconds=('lastLapError', 'mean')).reset_index()
    baseline['last_lap_MAE_seconds'] = baseline.last_lap_MAE_seconds.round(3)
    summary = dict(generatedAt=datetime.now(timezone.utc).isoformat(), seasons=len(coverage),
                   calendarEntries=len(races), snapshots=int(races.coverage.ne('missing').sum()),
                   timingRaces=int(races.coverage.eq('timing').sum()), laps=len(laps), eligibleLaps=len(clean),
                   driverEntries=len(results), weatherRows=len(weather), racesReportingRain=wet,
                   missing=missing.to_dict('records'), flags=flags, eligibilityMismatches=mismatch,
                   duplicateLapKeys=duplicates, nonpositiveTimes=invalid_time,
                   sectorSumErrorsOver20ms=int(residual.abs().gt(.02).sum()),
                   sectorSumComparedLaps=len(sectors), weatherMissing=weather_missing,
                   modelPoolLaps=len(model_pool), candidateNextLapPairs=len(pairs),
                   descriptiveLastLapBaselineByYear=baseline.to_dict('records'),
                   candidatePairsByYear=pair_years.to_dict('records'),
                   coverageByYear=yearly.reset_index().to_dict('records'))
    (output / 'summary.json').write_text(json.dumps(summary, indent=2, allow_nan=False) + '\n')
    charts(output, coverage, missing, clean, dry, pairs)
    report = f'''# Pitwall Lab — exploratory data analysis

Generated {summary['generatedAt']}. Offline audit of calendar-linked local snapshots. No upstream downloads or source-data changes.

## Dataset inventory

- {len(coverage):,} seasons; {len(races):,} calendar entries; {summary['snapshots']:,} recorded snapshots.
- {summary['timingRaces']:,} timing races; {len(laps):,} laps; {len(clean):,} eligible laps ({100 * len(clean) / len(laps):.1f}%).
- {len(results):,} driver result entries; {int(races.stints.sum()):,} observed tyre segments.
- {len(weather):,} weather observations; {wet} timing races report rainfall at least once. Missing rainfall was exported as false, so this does not establish all other races were dry.

![Data coverage and quality](coverage-quality.png)

## Timing coverage by season

{table(yearly[yearly.index >= 2018].reset_index())}

Earlier seasons have classification-only coverage. Missing timing is not random: 2022–2023 are incomplete and 2018 has a known failed import. Results-only snapshots have intentionally empty timing arrays.

## Data quality

{table(missing)}

- Compound placeholders are normalized only in this analysis: null, `nan`, `None`, `UNKNOWN`, and empty strings become missing. Original snapshots remain unchanged.
- Eligibility mismatches against the exporter's rules: **{mismatch}**. Duplicate race/driver/lap keys: **{duplicates}**. Nonpositive recorded lap times: **{invalid_time}**.
- Among {len(sectors):,} eligible laps with all sectors, **{summary['sectorSumErrorsOver20ms']:,}** have sector sums differing from lap time by more than 20 ms. This threshold is an audit flag, not an automatic deletion rule.
- Quality flags (overlap; do not sum): `{json.dumps(flags)}`.
- Weather missing numeric counts: `{json.dumps(weather_missing)}`. Numeric completeness does not prove sensor accuracy or correct temporal alignment.
- Missing measurements are not zero. Generated laps, pit laps, deleted laps and non-green laps are excluded from pace summaries.

## Pace and tyre observations

![Pace distributions and observed tyre-age profiles](pace-tyres.png)

Lap times depend strongly on circuit, so absolute lap times should not be pooled as if directly comparable. The delta chart subtracts each driver's full-race median using eligible SOFT/MEDIUM/HARD laps. This is descriptive hindsight normalization, not an allowed forecasting input.

The tyre-age plot subtracts each observed driver/race/stint/compound median. It pools 2019 onward, shows ages 1–40 only, and requires at least 100 samples per plotted compound/age. It is not a causal degradation curve: fuel burn, traffic, changing track conditions, stint selection and different circuit mixes remain confounders. SOFT/MEDIUM/HARD are weekend-relative categories; underlying physical compounds are not recorded. Green-flag laps on those compounds can still occur in changing weather.

## ML-ready starting pool

- {len(model_pool):,} eligible laps from 2019 onward with SOFT/MEDIUM/HARD and known tyre age.
- **{len(pairs):,} candidate adjacent next-lap pairs**, with eligible current/next laps, consecutive lap numbers, unchanged compound/stint and known current tyre age. This is a retrospective target cohort, not a promise that future conditions are known at inference time.

{table(baseline)}

The last-lap baseline predicts the next lap using the current lap's recorded time. Its per-season MAE above is exploratory, measured on this retrospectively filtered cohort without any fitted parameters. It is not a trained-model result or a score covering pit stops, flags and all race laps. It establishes the simple predictor a model needs to beat under the same evaluation conditions.

These are correlated observations from a limited number of races. Use chronological whole-race splits, never a random lap split. Missing 2023 timing creates a gap in the proposed training chronology. Report pair coverage separately from prediction error; this cohort excludes interruptions and pit transitions.

## Recommended next experiment

1. Start with a conditional next-lap pace forecast: remaining in the same stint under green conditions.
2. Benchmark last eligible lap and a trailing three-lap median before training a regressor.
3. Build rolling features using only earlier/current laps; align weather backward to the end-of-current-lap prediction cutoff. Full-race medians, final results, future weather and stint end laps must never become inputs.
4. Train on available 2019–2022 timing, validate on 2024, reserve 2025 for testing and use 2026 as a separate forward check. Also report per-race, per-compound and per-circuit errors.
5. Inspect rare circuits, long tyre ages and wet conditions separately. Do not extrapolate a dry pace model into strategy claims without a validated simulator.

## Reproduce

Run `.venv/bin/python scripts/eda.py --check`, then `.venv/bin/python scripts/eda.py`. Outputs are this report, two PNG figures and `summary.json`. pandas and matplotlib are available through the existing FastF1 environment; no new dependency is needed. This is an exploratory audit, not full snapshot schema validation or a trained model.
'''
    (output / 'README.md').write_text(report)
    print(json.dumps({key: summary[key] for key in ['timingRaces', 'laps', 'eligibleLaps', 'eligibilityMismatches', 'duplicateLapKeys', 'candidateNextLapPairs']}, indent=2))
    print(f'Report: {output / "README.md"}')


def charts(output, coverage, missing, clean, dry, pairs):
    plt.rcParams.update({'figure.facecolor': '#f8fafc', 'axes.facecolor': '#f8fafc', 'font.size': 10})
    fig, axes = plt.subplots(2, 2, figsize=(14, 9), layout='constrained')
    coverage.plot.bar(stacked=True, ax=axes[0, 0], color=['#0284c7', '#94a3b8', '#f59e0b'], width=.85)
    axes[0, 0].set(title='Calendar coverage, 1950–2026', ylabel='Races', xlabel='Season')
    axes[0, 0].set_xticks(range(0, len(coverage), 5), coverage.index[::5], rotation=45)
    counts = clean.groupby('season').size()
    axes[0, 1].bar(counts.index.astype(str), counts.values, color='#0284c7')
    axes[0, 1].set(title='Eligible pace laps by season', ylabel='Laps', xlabel='Season')
    axes[1, 0].barh(missing.field, missing.all_missing_pct, color='#f59e0b')
    axes[1, 0].set(title='Missing fields after compound normalization', xlabel='% of all lap records')
    compounds = clean.compound.fillna('Missing').value_counts()
    axes[1, 1].barh(compounds.index, compounds.values, color='#0284c7')
    axes[1, 1].set(title='Eligible laps by compound (all timing seasons)', xlabel='Laps')
    fig.savefig(output / 'coverage-quality.png', dpi=160)
    plt.close(fig)
    fig, axes = plt.subplots(2, 2, figsize=(14, 9), layout='constrained')
    circuit = clean.groupby('circuit').timeSeconds.agg(['median', 'count'])
    circuit = circuit[circuit['count'] >= 500].sort_values('median')
    axes[0, 0].barh(circuit.index, circuit['median'], color='#0284c7')
    axes[0, 0].tick_params(axis='y', labelsize=7)
    axes[0, 0].set(title='Median eligible lap time by named circuit (≥500 laps)', xlabel='Seconds')
    delta = dry.paceDelta
    low, high = delta.quantile([.01, .99])
    axes[0, 1].hist(delta, bins=100, range=(low, high), color='#0284c7')
    axes[0, 1].set(title='Lap pace relative to driver/race median', xlabel='Seconds from median (central 98% shown)', ylabel='Laps')
    profile = dry[(dry.season >= 2019) & dry.tyreLife.between(1, 40)].copy()
    profile['stintDelta'] = profile.timeSeconds - profile.groupby(['race', 'driver', 'stint', 'compound']).timeSeconds.transform('median')
    for name, color in [('SOFT', '#dc2626'), ('MEDIUM', '#ca8a04'), ('HARD', '#64748b')]:
        values = profile[profile.compound.eq(name)].groupby('tyreLife').stintDelta.agg(['median', 'count'])
        values = values[values['count'] >= 100]
        axes[1, 0].plot(values.index, values['median'], label=name, color=color)
    axes[1, 0].legend()
    axes[1, 0].set(title='Observed within-stint pace pattern — NOT causal degradation', xlabel='Reported tyre age (laps)', ylabel='Seconds from observed stint median')
    counts = pairs.groupby('season').size()
    axes[1, 1].bar(counts.index.astype(str), counts.values, color='#0284c7')
    axes[1, 1].set(title='Candidate same-stint next-lap pairs, 2019 onward', xlabel='Season', ylabel='Pairs')
    fig.savefig(output / 'pace-tyres.png', dpi=160)
    plt.close(fig)


def check():
    assert [compound(v) for v in [None, 'nan', 'None', 'UNKNOWN', '', 'soft']] == [None] * 5 + ['SOFT']
    lap = dict(timeSeconds=90, accurate=True, trackStatus='1')
    assert eligible(lap)
    for field in ['pitIn', 'pitOut', 'deleted', 'generated']:
        assert not eligible(dict(lap, **{field: True}))
    assert not eligible(dict(lap, trackStatus='12'))
    assert not eligible(dict(lap, timeSeconds=None))
    assert not eligible(dict(lap, timeSeconds=0))
    rows = [dict(race='A', driver='VER', season=2024, number=n, eligible=True,
                 compound='SOFT', stint=1, tyreLife=n, timeSeconds=90 + n) for n in [1, 2, 4]]
    rows += [dict(rows[0], race='B', number=5), dict(rows[0], driver='SAI', number=6)]
    pairs = next_lap_pairs(pd.DataFrame(rows))
    assert len(pairs) == 1 and pairs.iloc[0]['number'] == 1 and pairs.iloc[0]['next_timeSeconds'] == 92
    for change in [dict(eligible=False), dict(compound='HARD'), dict(stint=2)]:
        altered = [rows[0], dict(rows[1], **change)]
        assert next_lap_pairs(pd.DataFrame(altered)).empty
    print('EDA helper checks passed.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--output', type=Path, default=ROOT / 'analysis' / 'eda')
    args = parser.parse_args()
    if args.check:
        check()
    else:
        analyze(args.output)
