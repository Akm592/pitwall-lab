# Homepage design QA

final result: passed

Source visual truth: /home/ashish/.codex/generated_images/01a1d08c-0c5f-7a83-b5d8-326b3f795adb/exec-29b38209-ce04-4c74-a763-455d1cc1ae31.png
Implementation: http://localhost:3101/ (optimized Next.js production build).

## Evidence and state

- Approved portrait-free, dark glass homepage. Latest available race: São Paulo 2026. Championship standings through round 20, including sprint points.
- Source: 1003 × 1568 pixels. Same-width implementation: /tmp/pitwall-home-1003.png, 1003 × 1806 pixels, captured at a 1003 × 1024 CSS viewport, deviceScaleFactor 1. Full-page captures have different heights because the implementation uses real content and responsive sizing; neither image was stretched vertically.
- Desktop: /tmp/pitwall-home-1440.png, 1440 CSS pixels wide at density 1.
- Mobile: /tmp/pitwall-home-390.png, 390 × 2861 pixels, 390 × 1024 CSS viewport at density 1. Mobile is an adaptation; no mobile reference was supplied.
- Full-view comparison: /tmp/pitwall-home-production-comparison.png. Both source and production screenshot are placed in the same image at their original 1003-pixel width.
- Focused comparisons: /tmp/pitwall-home-hero-comparison-final.png and /tmp/pitwall-home-standings-comparison-final.png. These preserve the same pixel scale; vertical offsets reflect the actual differences in page rhythm. Header, text, table rows and surface treatments were inspected at readable size.
- Browser interaction results: /tmp/pitwall-home-browser-results.json.

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
