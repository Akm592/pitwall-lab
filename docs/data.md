# Data pipeline and definitions

[Back to README](../README.md)

## Coverage and export

The exporter uses FastF1 3.8.3, `fastf1.get_session(season, round, 'R')` and `session.load(telemetry=False)`. It prepares completed race sessions from supported calendars, without car telemetry, qualifying, practice or sprint data. The same script also imports paginated historical classifications directly from the Jolpica results endpoint, using a custom User-Agent, cached responses, and provider-aware retries.

The shared calendar entries contain `slug`, `label`, `flag`, `round`, `name` and `circuit`. Imported historical and newer calendars also contain `date` and `status` (`completed`, `upcoming`, `unavailable`). Legacy 2024 entries default to completed when a snapshot exists. Flag codes match assets in `public/flags/`.

The original 2024–2026 baseline contained 63 race snapshots: 24 for 2024, 24 for 2025 and 15 for 2026. Those three calendars contained 71 events: 24, 24 and 23 respectively. Eight 2026 entries remain upcoming. Counts can change after refresh.

Export steps:

1. Read the calendar and enable the FastF1 cache.
2. Skip existing snapshots unless `--force` is supplied.
3. Load the session and normalize missing/nonfinite values to JSON null.
4. Preserve lap-quality flags and compute eligibility.
5. Select the official result with Position 1 for winner and observed completed distance.
6. Build classification, contiguous observed stint segments, selected events and weather.
7. Write strict JSON with `allow_nan=False` to `data/<season>/<slug>.json`.

Race failures are collected and reported; a season run exits unsuccessfully if any failed. Successfully exported files remain. Snapshot and historical import writes use temporary files and atomic replacement; calendar synchronization still writes its calendar directly. Refresh before building.

| CLI option | Meaning |
| --- | --- |
| `--season <year>` | Select an imported calendar and snapshot directory; default 2024 |
| `--history --from-year 1950 --to-year 2023` | Import all historical race results in the range |
| `--all-timing --from-year 2018 --to-year 2023` | Enhance existing calendars with available FastF1 race timing |
| `--race all` | Export missing season races; default |
| `--race <slug>` | Export one calendar race |
| `--sync-calendar` | Refresh the provider calendar and derive status from cutoff and genuine snapshots |
| `--as-of <ISO timestamp>` | Reproducible event cutoff; default current UTC |
| `--force` | Regenerate existing JSON using cached source data when available |
| `--cache <directory>` | Override `.fastf1-cache` |
| `--check` | Validate the selected season without upstream session loading |

Cache files are ignored. Processed JSON belongs in the deployment; snapshot updates need a frontend rebuild.

## Snapshot schema

Schema version is **1**. `coverage` is `results` for historical classifications and `timing` for detailed FastF1 sessions; legacy snapshots with laps implicitly have timing coverage. Historical result files deliberately contain empty laps, stints, events and weather arrays. They include `sourceUrl`, per-entry `driverId` and `completedLaps`. No timings are fabricated. Timing fields and sectors use seconds; missing measurements are null. Dates use YYYY-MM-DD and export timestamps use ISO UTC.

### Race metadata

| Fields | Meaning |
| --- | --- |
| `schemaVersion`, `season`, `round`, `slug` | Format and identity |
| `name`, `circuit`, `countryCode`, `date` | Display metadata |
| `totalLaps` | Highest observed non-generated lap number of the official winner |
| `source`, `fastf1Version`, `exportedAt` | Provenance |
| `drivers`, `laps`, `stints`, `events`, `weather` | Collections below |

Completed distance can differ from scheduled distance.

### Drivers

| Fields | Meaning |
| --- | --- |
| `code`, `number`, `name` | Abbreviation, car number string and name |
| `team`, `color` | Team and hex display color |
| `position`, `grid`, `points` | Nullable official finishing position, grid and points |
| `status` | Finished, lapped, DNS, retirement or disqualification status |
| `gap` | Winner duration, time gap, lap deficit or status text |
| `elapsedSeconds` | Winner duration or reconstructed timed-finisher elapsed time; otherwise null |

Lapped-driver gaps show observed lap deficits rather than misleading crossing offsets. If a provider reports Lapped but observed distance equals the winner, preserve Lapped rather than inventing a deficit. Retirements, DNS and disqualifications retain their source status. The UI uses classification order for podium and defaults.

### Laps

| Fields | Meaning |
| --- | --- |
| `driver`, `number` | Driver code and lap number |
| `timeSeconds`, `sector1`, `sector2`, `sector3` | Nullable timings |
| `position` | Nullable recorded running position |
| `compound`, `tyreLife`, `stint` | Nullable tyre compound, age in laps and source stint number |
| `pitIn`, `pitOut` | Pit-entry/exit indicators |
| `deleted`, `generated`, `accurate` | Source quality indicators |
| `trackStatus` | Source track-status string, potentially missing |
| `eligible` | Pace inclusion decision |
| `sessionTimeSeconds` | Nullable session-relative timestamp |

Generated rows remain in JSON for transparency. They are excluded from summaries and stint construction; generated timing/position is never plotted as observed. The inspector labels generated rows.

### Stints

Segments contain `driver`, nullable source `number` and `compound`, inclusive `startLap`/`endLap` and nullable `fresh`. A new segment begins when stint or compound changes or observed laps stop being contiguous. Generated rows are excluded. A segment is an observed interval, not a reconstructed pit stop or a guaranteed unique tyre set.

### Events and weather

Events contain nullable `lap`/`timeSeconds`, `category` and `message`. All track-status records are retained plus selected race-control messages for DRS, safety cars, flags, penalties and session markers. This is not the complete unfiltered race-control feed.

Track-status times are session-relative. Without telemetry's time origin, absolute race-control timestamps are not aligned; their timeSeconds is null, and supplied lap associations are preserved. The UI calls records without a lap “Session event.”

Weather contains `timeSeconds`, `airTemp`, `trackTemp`, `rainfall`, `humidity` and `windSpeed`. Numeric fields can be null. Weather is exported but not visualized. Missing rainfall is normalized to false by the exporter, so that field alone cannot establish dry conditions.

The frontend Race type covers consumed fields rather than the complete JSON schema; weather and additional provenance still exist in snapshots.

## Eligibility and calculations

Eligible laps have a positive recorded time, are accurate, are neither deleted nor generated, are not pit-in/out laps, and have trackStatus exactly `'1'`. Mixed-status laps are excluded. Green flag does not imply dry conditions or comparable fuel, traffic and tyres.

`lib/stats.ts` uses eligible timed laps in the selected inclusive range:

| Metric | Definition |
| --- | --- |
| Count | Eligible laps with recorded time |
| Fastest eligible lap | Minimum time and its source record |
| Median pace | Median of eligible times |
| Sector medians | Each sector's available values among eligible timed laps; sample counts can differ |
| Consistency | Population standard deviation of lap times, divisor N |

Empty samples return null and display `—`. Time formatting rounds milliseconds before producing m:ss.sss, including minute carry. Fastest eligible lap can differ from official fastest lap. Disabling the chart filter adds observed noneligible laps to the chart; metrics remain eligible-only.

## Checks and interpretation

Driver profiles sum source race points without sprint points and count wins/podiums from valid result positions. Best and average result positions exclude DNS, withdrawn and disqualified entries, but include official result positions for retirements. The chart leaves DNS/disqualification positions blank. Race-entry counts include DNS records; eligible-lap totals use the same exporter eligibility rules as the race dashboard. Team and number come from the driver's latest imported appearance in the selected season. No career biography or official championship rank is inferred from these snapshots.

Exporter assertions validate the selected calendar, entrant counts, unique winner, observed distance, known driver references, eligibility, lapped gaps and contiguous observed stints. Special checks preserve Australia's 19 entrants, Brazil's 69 completed laps and Belgium's Hamilton winner/Russell disqualification.

Statistics assertions cover medians, empty samples, missing formatting, rounding and summaries. Additional recorded full-season review checked finite values, classification order, generated rows, DNS data and stint bounds. These checks cannot prove every upstream measurement is correct.

The app does not adjust pace for fuel, traffic, tyre degradation or weather; reconstruct missing positions; infer causality; or simulate counterfactual strategies. There is no automatic refresh schedule.

## Driver photographs

Photos are separate from race snapshots. `data/driver-photos.json` records `src`, `author`, `title`, `license`, `licenseUrl`, `sourceUrl` and `changes`, with optional `objectPosition` for head-safe framing. The original 28 driver codes in 2024–2026 have verified local photos; additional historical drivers use the existing fallback; manifests include photo dates when provided. Provider preview resizing and CSS fitting are declared in each entry’s `changes`. Local files live in `public/drivers/`. Sources are individually checked Wikimedia Commons files with reuse licenses; public accessibility of a photo alone is not proof of reuse permission. Each photograph retains its stated original license. CSS framing does not change or relicense the underlying photograph.

Historical photographs are not season-specific headshots and may show earlier team uniforms. Profile credits make that distinction explicit. Keep attribution when reusing the photos, and follow the linked license terms for any redistributed image adaptations. Do not replace verified photos with provider headshot URLs unless their reuse rights are confirmed.

## Circuit geometry and displayed sectors

`scripts/export_track_maps.py` loads recorded race position telemetry offline and exports `data/tracks/<season>/<slug>.json`. Geometry is normalized to a 960 × 620 diagram, preserving shape and aspect ratio. Reference laps prefer eligible laps, require complete observed sector timing, exclude generated/pit laps, and must align with the position trace. The exporter rejects incomplete traces, large coordinate jumps and poor loop closure. Sector boundaries are interpolated at cumulative reference sector times; their geographic locations are approximate. No equal-third splits or geometry substitutions from other seasons are used.

`lib/data.ts` attaches a map only when season, round and slug match the race. `components/TrackMap.tsx` renders native SVG and comparison cards. Median mode reuses eligible sector calculations within the selected range; its sector medians are independent measurements and cannot be interpreted as one lap. Lap mode shows the same recorded lap number for both drivers, leaves generated/missing sectors blank and labels noneligible laps. Card selection highlights the corresponding segment; native controls retain keyboard access.

The importer skips existing maps, stops at FastF1 rate limits and bounds network requests with connection/read timeouts. `--discard-new-telemetry-cache` removes only new parser copies from that call; raw HTTP responses and pre-existing files remain. Rebuild after imports. Missing historical position/timing data is explicitly unavailable.

## Replay positions

The Replay tab has two sources and names the one in use in its heading.

### Recorded racing line and distance

`scripts/export_positions.py` writes `public/replay/<season>/<slug>.json` (schema 2) and `<slug>.telemetry.json` from FastF1 position and car telemetry.

- **One racing line per race.** The feed places every car on the same path: six drivers' median lines at Monza and Budapest agreed within 5–7 cm. The exporter therefore builds a single line as the median of all cars' samples every 2 m round the lap. Individual drivers' lines do not exist in this data and are not shown.
- **Distance along the line.** Each car's samples are projected onto that line and turned into distance travelled. The feed's timing is uneven and sometimes steps backwards, so the distance is rebuilt from the car's recorded speed, with the recorded positions correcting slow drift (a two-second Gaussian on the difference), and is never allowed to decrease. It is stored every 0.5 s in tenths of a metre. On three races checked, the speed this produces on screen is within about 3 km/h of the recorded speed at the median and 15 km/h at the 95th percentile.
- **Off the line.** A sample more than 7 m from the line (pit lane, garage, run-off) is flagged; the car is drawn faded at the nearest point of the line. Coordinates more than 100 m from the line are rejected rather than projected onto an unrelated stretch. Gaps of more than two seconds between samples and the feed's 0,0 placeholder stay missing. A short opening gap of up to 60 s may be reconstructed by integrating continuous recorded speed backwards from the first reliable on-track position; these samples carry an `estimated` run-length flag and are labeled in the replay. Mid-race gaps, longer launch gaps and gaps without continuous speed stay absent.
- **Track edges.** Where `data/track-surveys/` has the circuit, its centre line and widths are fitted to the racing line (rotation, scale and mirroring) and used as the track surface only if at least 95% of the line lies within the edges plus 1 m and the lap lengths agree within 3%. Racing lines run over kerbs, so a few per cent outside is expected; layouts that have changed since the survey fit far worse and are rejected (Melbourne and Catalunya today). Without a survey the road is a nominal 13 m wide along the racing line and is not the real edge.
- **Alignment check.** The exporter rebuilds the track-map transform from the map's reference lap and refuses to export if it does not reproduce the map; the app ignores a file whose reference lap differs from the current map. A race whose track map has a gap in it cannot be exported (2026 Hungary today).

Position files are about 0.7–1 MB each and telemetry files about 0.9–1.6 MB, loaded only when the Replay tab opens. `--cached-only` exports only races whose telemetry is already cached and makes no requests. The refresh workflow does not run this exporter.

The surveys are the TUMFTM racetrack-database, copied unchanged under LGPL-3.0; see `data/track-surveys/README.md`.

### Timing-based estimate

Without a position file, `lib/replay.ts` places each car along the season's reference-lap outline from its recorded timing, at an unknown scale:

- A lap spans the previous lap's recorded end (`sessionTimeSeconds`) to its own. A driver's first lap starts at its end minus its lap time.
- Recorded sector times set when the car crosses each sector boundary. One missing sector is taken as the remainder of the lap. With two or more missing, the lap is spread over the reference lap's sector proportions.
- Inside a sector the car follows the reference lap's progress, because the layout points are evenly spaced in reference-lap time.
- Generated rows are not replayed. A moment with no observed lap is reported as missing and the car is not drawn.

These are estimates. Gaps inside a sector, the pit lane and grid slots are not shown, and metre readings are omitted because there is no scale.

### Running order, fights and overtakes

These come from lap and sector timing, so they work for every timing race, with or without recorded positions.

- **Timing points.** Each car has three per lap: the two sector boundaries and the finish line. The running order is the order in which cars reached their latest timing point, and a gap is the difference between two cars' times at the same point. Order and gaps therefore update three times a lap. Before the first timing point the order is the starting grid. The order is as run on track; post-race penalties are not applied.
- **Fights.** Consecutive cars within one second at their last timing point, on the same lap count, under green or yellow, with neither on a pit-in or pit-out lap.
- **Overtakes.** A change of order between two consecutive timing points, with both cars at the same timing point of the same lap, so lapping is not counted. A lap is skipped for a car if it has a pit entry or exit, or ran under a safety car, virtual safety car or red flag. This can include a car that slowed with a problem or went off, and it misses a pass that was reversed before the next timing point. Counts range from 3 to 142 per race in the current archive.

### Track view

The default view follows the two compared drivers (`a` and `b`) round the circuit: it frames both while they are within about 330 m on the map and otherwise stays with the first. Only that pair is drawn; the timing tower carries everyone else.

- Cars sit on the racing line, facing along it, and are drawn half as long again as life size.
- When the two overlap along the lap they must have been alongside, so they are eased apart sideways. Which side each was on is not recorded; the first driver is drawn on the right of the direction of travel.
- The glowing trail is the stretch of racing line each car covered in the last eight seconds.
- Kerbs mark the inside of stretches where the line turns tighter than a 180 m radius; these are derived from its shape and are not official corner numbers. Lap lengths measured along the line are within about 2% of published lengths for the circuits checked.
- A chip shows who is ahead along the lap, by how many metres, and an approximate time from the following car's speed. It can differ briefly from the timing-point gap, which only updates three times a lap.

### Other views and car telemetry

The straight-lane view unrolls the lap into a strip with one lane per compared driver, distance boards, sector lines and corner kerbs; lanes are not positions across the track. The full-circuit view shows the whole field as markers, with rings on current fights.

`<slug>.telemetry.json` holds each car's speed (km/h), throttle (rounded to 5%), brake (on/off), gear and DRS (open or not) on the same half-second clock, taken from the nearest recorded car sample; speed is interpolated. Gaps of more than two seconds stay missing. The DRS indicator appears only for races where it was ever open.

### Both sources

After a driver's last recorded lap the car is removed and listed as finished or out, from the classification status; a car that never completed a lap is not drawn. The status badge and timeline marks come from recorded track-status messages (green, yellow, safety car, virtual safety car, red flag); the leader's lap is the highest lap number any car has reached.

## Historical identity and coverage

All seasons back to 1950 can be imported, including 2000–2009. Pre-2018 driver routes use the provider driver ID rather than an abbreviation, avoiding collisions between different people with the same initials. Modern timing seasons use FastF1-compatible driver abbreviations. These are season records, not a unified career database. Shared drives retain all provider entries. Neutral race flag artwork is used when no local national flag asset exists.

Official provider coverage: [FastF1 availability](https://github.com/theOehrly/Fast-F1/blob/main/docs/data_reference/index.rst), [Jolpica results and pagination](https://github.com/jolpica/jolpica-f1/blob/main/docs/endpoints/results.md), [rate limits](https://github.com/jolpica/jolpica-f1/blob/main/docs/rate_limits.md). Timing begins in 2018; calendar/results extend to 1950.

## Imported archive status — 2026-10-01

77 calendars cover 1950–2026 with 1,172 entries. There are 1,164 race snapshots: 146 with detailed timing and 1,018 with classification only. Eight 2026 rounds remain upcoming. The full 2000–2009 decade includes 174 races. All historical classifications are already imported; a timing limit does not remove their results.

Timing coverage: 2018 20/21, 2019 21/21, 2020 17/17, 2021 22/22, 2022 3/22, 2023 0/22; existing 2024–2026 timing remains intact. Italy 2018 fails in FastF1’s tyre processing (`IndexError` in `__fix_tyre_info`) even after a cached retry. Remaining 2022–2023 timing downloads reached the library’s hourly cap. Resume the timing importer after the limit resets; do not disable the limit or clear successful caches. The importer now stops on a rate-limit exception instead of repeatedly attempting subsequent races.
