# Development and maintenance

[Back to README](../README.md)

## Local commands

Work from the project root: snapshot paths depend on process.cwd(). Use npm ci with the lockfile. Python is needed only for exporter work.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Reloading development server |
| `npm run typecheck` | TypeScript validation |
| `npm run build` | Production build and prerendering |
| `npm run start` | Serve an existing production build |
| `node --experimental-strip-types scripts/check_stats.cjs` | Statistics assertions |
| `.venv/bin/python scripts/export_races.py --season 2025 --check` | Snapshot assertions |

There is no configured lint command or browser test suite. Stop dev before building to avoid concurrent writes to .next.

## Configuration and deployment

NEXT_PUBLIC_SITE_URL is the absolute public origin. If absent, lib/site.ts uses VERCEL_PROJECT_PRODUCTION_URL, then localhost. Use an ignored .env.local for local configuration:

```dotenv
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

The app requires no credentials. Do not commit environment secrets.

For Vercel, import the project with the Next.js preset, set NEXT_PUBLIC_SITE_URL to the production HTTPS origin before building, and include calendar, JSON snapshots and public assets. Rebuild after changing data or origin. No Python service runs in production. Deployment has not yet been performed.

## Common changes

### Layout

Use Dashboard.module.css for race views and globals.css for the shared shell/archive. Preserve responsive layout, focus indicators, labels and native keyboard access. Assets live in public; design/reference.png records the selected visual direction.

### Metrics

Trace Dashboard → summarize() before adding calculations. Reuse lib/stats.ts and add a small regression example to scripts/check_stats.cjs. Document the sample definition and missing-data behavior in the UI and [data guide](data.md). Do not silently mix eligible and all-lap samples.

### Data refresh

1. Select --season and export with --force using the README commands.
2. Inspect classification, distance and upstream changes.
3. Run snapshot/statistics assertions, typecheck and build.
4. Inspect the race UI and social image when browser access is available.
5. Deploy changed snapshots with a new frontend build.

Preserve provenance and missing measurements.

### Another season or session type

The app discovers imported years from numeric data directories containing calendar.json. Import a historical range using --history --from-year ... --to-year ..., then enhance seasons from 2018 with --all-timing. Preserve calendar-based slug validation. Neutral flags cover countries without a local flag asset. Upcoming races must remain schedule-only until genuine completed data is exported.

Verify sitemap coverage, unique routes, DNS/DSQ and shortened-race cases for the new season. Qualifying/sprints need session-specific contracts before reusing race assumptions.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Dependency download fails | Check registry/network access; retain lockfile |
| Stats check cannot load TypeScript | Use Node 22.22.2 and the documented stripping flag |
| Race data unavailable | Check allowed slug, valid snapshot JSON and project working directory |
| Existing snapshot retained | Expected default; add --force to regenerate |
| FastF1 export fails | Read race error, check network/cache, retry that slug and rerun season checks |
| Canonical URL uses localhost | Set production origin and rebuild |
| Port 3000 busy | Stop previous server or use `npm run dev -- --port 3001` |
| Chart gaps or empty metrics | Inspect range and missing/generated/eligible fields; can be legitimate |
| No tyre row for a driver | DNS or no observed laps can produce no stints |
| Broken flag | Match calendar flag code to public/flags/code.svg |
| Inconsistent build/dev output | Stop both processes, rebuild, restart one server |

## Verification and browser checklist

Previous 2024 checks passed for data, statistics, TypeScript, production build, race HTTP responses, archive links and sitemap coverage. The original three-season data checks passed; TypeScript and the multi-season production build passed with all 71 race routes. HTTP spot checks passed for all three archives, three completed race pages, an upcoming schedule page and 71 sitemap race URLs; individual HTTP checks did not cover every route. [Design QA](../design-qa.md) records the outstanding browser verification.

When browser access is available, verify desktop/mobile layout, all tabs, season navigation, driver swap, teammate line styles, lap ranges, malformed URLs, shared URL reload, history behavior, keyboard access, eligible-filter semantics and DNS/no-eligible-lap cases. Inspect console errors, social images and production canonicals. Belgium and Brazil are useful classification/distance regression cases.

## Future phases

These are directions, not implemented features:

1. Complete browser QA, accessibility review and deployment.
2. Build reproducible EDA for missingness, pace distributions, tyres and weather.
3. Define prediction targets, time-aware validation and simple baselines; keep training offline and publish evaluated, versioned outputs.
4. Add fan-facing predictions or simulation with uncertainty and provenance after model evaluation supports them.

Introduce backend services or databases when a concrete feature requires them; the completed-race dashboard currently uses snapshots.

## Updating driver photographs

Add a verified, reusable photo to `public/drivers/` and its driver-code entry to `data/driver-photos.json`. Record the file description source page, photographer, original license and license URL; describe any resizing or other edits in `changes`. Keep photo licenses with the project. `/image-credits` and individual profile credits update from the same manifest. Set `objectPosition` if a crop needs different head framing. Review hero and directory sizes at desktop/mobile widths, failed-image fallback and reduced-motion behavior. The manifest is included at build time, so deploy a new build after changes.
