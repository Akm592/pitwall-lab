# Pitwall Lab

A Next.js fan dashboard for exploring the Formula 1 seasons from 1950 onward: real results, pace, tyre stints and driver comparisons.

## Run the dashboard

```sh
npm install
npm run dev
```

Open http://localhost:3000. Race snapshots are included; Python is only needed to refresh them.

## Refresh race data

```sh
uv venv --python python3.12 .venv
uv --cache-dir /tmp/pitwall-uv-cache pip install --python .venv/bin/python -r pyproject.toml
.venv/bin/python scripts/export_races.py --season 2025 --sync-calendar --race all --force
.venv/bin/python scripts/export_races.py --season 2025 --check
```

Completed race snapshots are included for supported seasons; upcoming entries contain schedule metadata only. The exporter skips existing snapshots by default; use `--force` to refresh them. FastF1 downloads are cached in `.fastf1-cache`. Include processed JSON snapshots in the next deployment and rebuild; visitors never download sessions from upstream APIs. `--force` regenerates JSON using the cache when available; it does not clear the cache.

## Historical archive

```sh
# Import recorded classifications, including the entire 2000–2009 decade.
.venv/bin/python scripts/export_races.py --history --from-year 1950 --to-year 2023
# Enhance the modern archive with available race timing.
.venv/bin/python scripts/export_races.py --all-timing --from-year 2018 --to-year 2023
```

Season choices are discovered from imported calendars. Historical pages show finishing positions, grid, teams, status and awarded race points. Detailed pace, sector and tyre dashboards require FastF1 timing, available from 2018 onward. Failed timing imports retain the historical classification. Historical shared drives can create multiple entries; championship points counting rules are not inferred. Race sessions remain the current scope.

## Validation and deployment

```sh
node --experimental-strip-types scripts/check_stats.cjs
npm run typecheck
npm run build
```

Deploy the project root on Vercel using the Next.js preset. Set `NEXT_PUBLIC_SITE_URL` to the public HTTPS origin before building so canonical links, sitemap and robots use the deployed domain. No runtime Python service is required.

The default comparison uses eligible accurate, green-flag laps, excluding pit in/out, deleted and generated laps. Missing timings remain null. Pace is descriptive and does not isolate traffic, fuel or driver skill; read `/about` for details. Predictions and simulation are later phases.

## Documentation

Individual driver profiles are available at `/drivers` and `/drivers/<CODE>?season=<YEAR>`. They include animated team-colored glass panels, race-only points/wins/podiums, a finishing-position chart and a race log. Directory and profile seasons cover the imported historical and modern results; drivers without records in a chosen season can switch to an available year. These totals exclude sprint results and are not official championship standings.

- [Architecture and code map](docs/architecture.md)
- [Data pipeline, schema and metric definitions](docs/data.md)
- [Development, deployment and troubleshooting](docs/development.md)
- [Design and verification status](design-qa.md)

## Project scope

Pitwall Lab is an independent fan project. Its first phase makes completed races understandable through an interactive dashboard; EDA, prediction models and strategy simulation are future phases.

| View | Available features |
| --- | --- |
| Archive | Historical and modern calendars with a year selector, recorded datasets and upcoming races |
| Overview | Podium, classification, recorded position changes and race-control messages |
| Pace | Two-driver lap chart, ranges and individual lap inspection |
| Strategy | Observed tyre segments for all drivers and tyre-set details |
| Compare | Finishing positions, fastest eligible lap, median pace, sector medians and consistency |

The archive includes **race sessions only**. Practice, qualifying, sprints, live timing, season standings, accounts and predictions are not implemented. Header links lead to the race archive and data guide.

## Technology and prerequisites

| Area | Implementation |
| --- | --- |
| Web app | Next.js 15 App Router, React 19, TypeScript |
| Styling | Global CSS and CSS Modules |
| Charts | Plotly basic bundle through react-plotly.js |
| Fonts and icons | Bundled Inter fonts and Phosphor icons |
| Data preparation | Python 3.12, FastF1 3.8.3 and pandas |
| Storage | Included JSON snapshots; no database |

The implementation environment uses Node **22.22.2** and npm. The statistics check needs Node's TypeScript stripping support. Python and `uv` are optional unless refreshing/checking snapshots. `package-lock.json` records installed JavaScript versions; FastF1 is pinned in `pyproject.toml`.

Use `npm ci` for a reproducible install from the included lockfile. For a local production preview, run `npm run build`, then `npm run start`. Stop the development server before building so both processes do not write to `.next` simultaneously.

The archive defaults to 2026. Use its year selector to explore earlier seasons, including every year of the 2000s. Upcoming races show schedule details rather than results. Session coverage remains race-only.

## Current archive coverage — 2026-10-01

- **77 seasons (1950–2026)** and **1,172 calendar entries**.
- **1,164 recorded race datasets**, plus eight upcoming 2026 entries.
- **2000–2009: all ten seasons, 174 Grands Prix** with classifications and driver season profiles.
- **146 detailed timing snapshots**: 2018 (20/21), 2019 (21/21), 2020 (17/17), 2021 (22/22), 2022 (3/22), 2023 (0/22), 2024 (24/24), 2025 (24/24), 2026 (15 completed races).

All remaining races retain genuine recorded classifications. The 2018 Italian timing import hits a FastF1 3.8.3 tyre processing error. Remaining 2022–2023 timing downloads hit FastF1’s hourly API cap; resume after the window resets with `.venv/bin/python scripts/export_races.py --all-timing --from-year 2022 --to-year 2023`. Existing successful snapshots are skipped automatically. Restart/rebuild after importing additional data.

## Earlier verification (2024–2026 baseline)

The archive includes 63 recorded race datasets: 24 for 2024, 24 for 2025 and 15 for 2026. The 2026 calendar contains 23 events, with 8 upcoming as of 2026-10-01. All three season data checks passed; TypeScript and the multi-season production build passed, prerendering all 71 calendar race routes. HTTP spot checks passed for all three archives, 2024 Bahrain, 2025 Abu Dhabi, 2026 Madrid, an upcoming 2026 Bahrain schedule page, and the sitemap containing 71 race URLs. Every individual route was not HTTP-tested. Browser visual and interaction QA is pending; these checks are not a comprehensive automated test suite.

## Circuit layouts and sectors

Race dashboards include a season-specific telemetry layout with colored S1/S2/S3 segments, start/finish, sector comparisons and a lap selector synchronized with the existing lap inspector. Select a sector card to highlight its track segment. Default times are sector medians for the selected eligible lap range; selecting a lap shows its recorded sector measurements. Missing/generated measurements stay blank.

Track and card glows are subtle, with keyboard focus and reduced-motion support. Historical classifications without position/sector data show an availability notice rather than a different season's layout.

```sh
.venv/bin/python scripts/export_track_maps.py --all-seasons --discard-new-telemetry-cache
```

The importer stores compact geometry in `data/tracks/<season>/<slug>.json`. Network reads have timeouts; existing maps are skipped. The optional cache flag discards only parser copies created by that call, retaining raw HTTP responses and pre-existing caches. Sector locations are approximate interpolations aligned to a recorded reference lap. Rebuild after additional maps are imported.

## Driver photographs

The 28 drivers originally imported for 2024–2026 have local, freely licensed historical photographs; additional historical drivers use the code/number fallback in their heroes and directory cards. Each profile links its photographer, source and license; `/image-credits` lists the full attribution. Uniforms may differ from the selected season. Missing or failed photos display the driver code and car number. See [photo provenance](docs/data.md#driver-photographs).

## Upstream projects

[FastF1](https://github.com/theOehrly/Fast-F1), [FastF1 documentation](https://docs.fastf1.dev/) and [Jolpica F1](https://github.com/jolpica/jolpica-f1). The exporter uses FastF1 for detailed timing and the Jolpica API for paginated historical race classifications. Responses are cached and throttled requests are retried. Check upstream data and asset terms before redistribution. No project license file is currently included.
