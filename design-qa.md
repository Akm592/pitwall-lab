# Homepage design QA

final result: passed

Source visual truth: /home/ashish/.codex/generated_images/01a1d08c-0c5f-7a83-b5d8-326b3f795adb/exec-29b38209-ce04-4c74-a763-455d1cc1ae31.png
Implementation: http://localhost:3101/ (optimized Next.js production build).

## Evidence and state

- Approved portrait-free, dark glass homepage. Latest available race: São Paulo 2026. Championship standings through round 20, including sprint points.
- Source: 1003 × 1568 pixels. Same-width implementation: /home/ashish/Documents/projects/.artifacts/pitwall-homepage/pitwall-home-1003.png, 1003 × 1806 pixels, captured at a 1003 × 1024 CSS viewport, deviceScaleFactor 1. Full-page captures have different heights because the implementation uses real content and responsive sizing; neither image was stretched vertically.
- Desktop: /home/ashish/Documents/projects/.artifacts/pitwall-homepage/pitwall-home-1440.png, 1440 CSS pixels wide at density 1.
- Mobile: /home/ashish/Documents/projects/.artifacts/pitwall-homepage/pitwall-home-390.png, 390 × 2861 pixels, 390 × 1024 CSS viewport at density 1. Mobile is an adaptation; no mobile reference was supplied.
- Full-view comparison: /home/ashish/Documents/projects/.artifacts/pitwall-homepage/pitwall-home-production-comparison.png. Both source and production screenshot are placed in the same image at their original 1003-pixel width.
- Focused comparisons: /home/ashish/Documents/projects/.artifacts/pitwall-homepage/pitwall-home-hero-comparison-final.png and /home/ashish/Documents/projects/.artifacts/pitwall-homepage/pitwall-home-standings-comparison-final.png. These preserve the same pixel scale; vertical offsets reflect the actual differences in page rhythm. Header, text, table rows and surface treatments were inspected at readable size.
- Browser interaction results: /home/ashish/Documents/projects/.artifacts/pitwall-homepage/pitwall-home-browser-results.json.

## Findings and comparison history

1. [P1, resolved] Horizontal overflow at 320px. Hidden heading line breaks joined words into one oversized word and expanded the grid. Added whitespace, allowed the intro to shrink, and scaled the small-screen heading. Post-fix browser checks show no horizontal overflow at 320, 360, 390, 540, 640, 768, 900, 1003, 1024 and 1440px.
2. [P2, resolved] Desktop and tablet navigation targets were shorter than the intended touch-friendly navigation. Added 44px minimum height while preserving the existing capsule and glass material. Rechecked every viewport and correct active navigation on home and race pages.
3. [P2, resolved] Initial screenshots had overly small supporting type and too much vertical space inside the chart and standings. Increased desktop type, shortened the chart to 250px, grouped its analysis link into the caption, and tightened table and recent-race spacing. The final combined comparison confirms the hierarchy and page order.
4. [P2, resolved] Glass appeared too subdued against the long homepage's background. Retained the existing blur, saturation, shadow and palette, strengthened local reflective edges, and extended the same red/violet light sources behind the page. The production screenshots retain translucent dark glass panels, the floating capsule header and lime actions.
5. [P2, resolved] Browser console reported a missing favicon. Added the existing brandmark to site icon metadata. Final production browser run has no page or console errors.

## Required fidelity surfaces

- Fonts and typography: existing self-hosted Archivo Variable and Inter retained. Heading hierarchy, intentional lime emphasis, wrapping, body text and tabular numbers checked on desktop and mobile. No driver portraits or avatar substitutes.
- Spacing and layout: approved order preserved: introductory hero/chart, latest podium, championship/season summary, recent races, footer. Wide layout stacks on mobile without clipping; rounded glass surfaces and dividers remain. Actual page height is longer than the static reference, an accepted adaptation for readable real content and explicit data provenance.
- Colors and tokens: existing carbon background, warm white, muted text, lime accent and team colors retained. Actual computed backdrop filter is blur(26px) saturate(1.9) brightness(1.08). Local lighting uses the existing red and violet colors. Focus and reduced-motion rules remain available.
- Image quality/assets: existing brandmark and supplied country flags reused; installed Phosphor arrows used. No new decorative raster assets were required, and no portraits, generated substitutes or fake data imagery were added. The chart is the existing Plotly component with recorded data.
- Copy/content: introductory copy follows the approved design. Race names, podium, points, timing and schedule come from snapshots. Deliberate differences: real lap times replace the illustrative curve, excluded laps leave gaps, standings carry round/source context, progress says races available, and upcoming start time includes UTC. Existing recorded names may be longer than the concept's shortened names.

## Interactions and validation

- Production browser run: all ten widths passed, no page or console errors, no horizontal overflow and no driver image requests on home.
- Chart renders with real eligible laps and working hover values; excluded laps remain gaps. Full analysis links select the displayed driver pair.
- Latest-race action opens the overview, brand returns home, archive remains accessible, driver and constructor links resolve, and upcoming race schedule resolves.
- Data checks cover reverse input ordering, missing latest race, pre-season/empty states, UTC race boundaries, genuine eligible lap values, mismatched championship round, nonfinite points, duplicate identities and retention of previous standings on provider errors.
- Type checks and optimized production build passed (207 generated pages).

## Follow-up polish and limits

- [P3] Existing header proportions and some type weights intentionally follow the current website rather than every generated pixel. Further optical tuning can follow user review.
- Chromium desktop emulation was used. Physical phones, Safari, Firefox, screen-reader operation and a formal accessibility conformance audit were not tested.
- Standings refresh is wired into the scheduled workflow. Live CI and production deployment are not exercised until this branch is published.

## Implementation checklist

- [x] Approved portrait-free layout implemented with existing glass theme.
- [x] Real race and championship data, provenance, and missing-data fallbacks.
- [x] Existing navigation and archive connected to the new home route.
- [x] Responsive checks, primary interactions and console checks passed.
- [x] Source/render combined comparisons and post-fix evidence reviewed.
- [x] Production build and data checks passed.
- [ ] Publish after user review.

## Racing-light loading — 2026-11-13

- Five paired red lights in the existing dark glass material; columns illuminate once at 180ms intervals and hold until real loading completes. No minimum wait, repeated flashing, extra animation package or first-visit splash.
- Production build passed. Browser checks passed for homepage, race and driver chart fallbacks, page navigation, reduced motion, successful replay loading, failed asset requests and the existing 20-second replay timeout. Header navigation remains accessible and keyboard focus stays on the initiating link while loading.
- Chromium screenshots at 320, 390 and 1440px were reviewed. The light sequence was checked at 0, 300, 600 and 950ms (0, 2, 6 and 10 lamps illuminated). Reduced-motion lamps remain static. Ready charts replace their loaders immediately; no runtime errors were reported.
- A root loading boundary caused streamed HTTP 200 responses for invalid race URLs. Restricted the directory loaders to `(overview)` and validated race parameters before the race-specific boundary. The SEO checks now cover invalid races, seasons, year formats, driver/team codes and unknown paths, alongside metadata, structured data and 5,655 unique sitemap URLs.
- Browser assertions: `/home/ashish/Documents/projects/.artifacts/pitwall-loading/check-loading.cjs`. Run from this worktree against a production server on port 3103; it uses the separate temporary Playwright install at `/tmp/pitwall-browser` and Chromium at `/home/ashish/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome`.
- Screenshots: `/home/ashish/Documents/projects/.artifacts/pitwall-loading/page-navigation-loading.png`, `320-homepage-loading.png`, `1440-homepage-loading.png`, `replay-loading.png` and `reduced-motion.png` in the same directory.
- Physical devices, other browser engines and screen-reader operation have not been tested. Fast or cached loads may complete before any lamps appear.

### Loading polish

- Replaced the floating page-loader presentation with a compact status row and decorative content placeholders. The shared glass shell and usable navigation remain visible. Chart/replay loaders use the smaller signal without page placeholders.
- Recessed individual light housings, a subtle LED texture and softer glow replace the larger rounded lamps. The signal waits 220ms before appearing; no content waits for this animation. After the sequential illumination, a low-amplitude 2.4-second opacity cycle indicates ongoing activity without restarting a countdown.
- Production build and SEO checks passed again. Chromium assertions verify suppressed initial display, 0/2/6/10 illuminated lamps, quiet long-wait activity, one status message, immediate ready-content replacement, static reduced motion, page layouts at 320/390/1440px, retained keyboard focus, and replay success/failure/timeout handling. No runtime errors were observed.
- Fresh before captures: `/home/ashish/Documents/projects/.artifacts/pitwall-loading/polish-before/`. Reviewed after captures and rerunnable assertions: `/home/ashish/Documents/projects/.artifacts/pitwall-loading/polish-after/`, including `page-navigation-loading-390.png`, `page-navigation-loading-1440.png`, `1440-_-lights.png`, `320-homepage-loading.png`, `replay-loading.png` and `check-loading.cjs`.

## Latest replay recovery — 2026-11-13

- Restored 2026 São Paulo, Mexico City and United States reference geometry, timing and telemetry using public OpenF1 historical data. All bundles contain measured telemetry for 22 drivers. Fitted survey coverage: São Paulo 99.1%, Mexico City 96.8%, Austin 99.5%.
- Offline checks validate matching sessions/snapshots/reference laps, 5,736/5,395/4,642 timing anchors respectively, finite monotone progress and usable driver paths. Exporter checks cover missing sectors, approximate clocks, overlapping lap boundaries, held observed ranks, stale/empty caches and retention of published files on provider failure. Existing FastF1 replay/refresh checks pass.
- Local production build and SEO/404 checks passed. Chromium at 1440px and 390px verified all three replay requests return 200 for each race, maps and recorded speeds render, play/pause/seek/restart work, no horizontal overflow/runtime errors, and stale telemetry is rejected with blank unavailable readouts and a usable timing fallback.
- Browser assertions and captures: `/home/ashish/Documents/projects/.artifacts/pitwall-replay-refresh/check-replays.cjs`, with `<race>-1440.png` and `<race>-390.png` in the same directory.
- OpenF1 lap starts and derived sector anchors are approximate; this is disclosed in the replay. Driver paths remain illustrative. Physical devices, other browser engines and future upstream availability have not been verified.
