# Design QA

## Circuit panel and subtle glow — 2026-10-01

The final refinement build also passed after the on-map time typography change. The single development server was restarted on port 3000. The Bahrain response returned HTTP 200 and includes the new track halo layer and sector labels. Background map imports remain separate from browser UI verification.

Added native SVG circuit geometry, S1/S2/S3 labels and on-map times, synchronized lap selection, sector comparison cards, sample counts and deltas. Geometry matches season/round and retains reference-lap provenance; historical/missing position data has an explicit fallback. The Bahrain geometry was inspected as a standalone plot and its local page returned HTTP 200 with the SVG section. This does not verify the website layout in a browser.

Visual refinement adds low-opacity sector halos, faint boundary glow, quieter glass reflections, selected-sector card glow and a one-pixel hover lift. Keyboard focus remains visible, disabled cards have no hover action and reduced-motion preferences disable transitions/lift. TypeScript and a production build passed, generating 206 static pages. Browser visual/interaction QA remains pending. Track imports continue separately with network timeouts.

## Historical archive update — 2026-10-01

Imported 77 season calendars (1950–2026), 1,172 entries and 1,164 recorded race datasets, including all 174 races across 2000–2009. Year controls use a native selector. Historical classifications and driver profiles render genuine results without fabricated timing. Additional historical drivers use initials when no licensed portrait is available. Timing coverage currently includes 146 snapshots; remaining 2022–2023 timing downloads reached FastF1's hourly cap, and Italy 2018 hits its tyre processing error. Classification data remains available for all these races.

TypeScript validation and production build passed, generating 206 static pages. Historical race pages before 2018 render on demand. Local HTTP responses returned 200 for the 2000 archive, 2000 Australian race and Michael Schumacher's 2000 profile; their content included the expected names. Browser visual and interaction checks remain pending. No new automated test suite was added.

Final result: **blocked**.

## Selected reference

The user selected option 3 for the Pitwall Lab fan dashboard. The selected visual reference is `design/reference.png` (1487 × 1058). The implementation uses its dark motorsport dashboard direction, driver comparison, lap pace chart, tyre stint timelines, and summary metrics. Actual FastF1 race measurements determine the displayed values.

## Verification status

- Data validation passed for the all 24 exported 2024 race snapshots.
- Statistics checks passed, including eligible-lap summaries and time rounding across minute boundaries.
- Dependency installation completed. `npm run typecheck` and `npm run build` passed; all 32 pages were prerendered, including all 24 race routes.
- Statistics checks and all 24 exported snapshot checks were rerun and passed.
- The Bahrain page HTML was fetched from the local preview and checked for the race heading, median pace, classification, and canonical content.
- The full-season calendar and all required flag SVGs were validated; the full-season typecheck and production build passed.
- HTTP verification passed for all 24 race routes: each returned 200 with the race name and median pace content, without an unavailable-data message. The archive and sitemap include all 24 race routes.
- The local preview is running at `http://localhost:3000`.
- Browser rendering and visual comparison have **not been performed**. CUA has no available browser, and user permission for the Playwright fallback remains pending.
- Responsive layout, keyboard interactions, chart behavior, and visual fidelity are therefore not verified in a browser.

## Visual refresh

The UI now uses warm graphite surfaces, champagne and lime accents, a larger archive heading, round-number cards and subtle entrance/hover transitions. Driver and tyre colors retain their data meaning. Motion is disabled for reduced-motion preferences. This refresh modifies the selected option 3 direction; the original image is historical context rather than an exact current target. Previous verification results above refer to the earlier implementation. Browser review of the refreshed UI is still pending because CUA exposes no browser.

The refreshed implementation passed `npm run build`, including TypeScript validation and all 32 generated pages.

## Remaining checks

### Individual driver pages

Added a season-aware driver directory and individual profiles with team-colored liquid-glass panels, animated typography, staggered cards and a finishing-position chart. Statistics derive from imported race snapshots and explicitly exclude sprint/official championship totals. Reduced-motion styles disable ambient movement and entrance transitions. TypeScript validation passed; browser rendering, chart interaction, narrow-width layouts and animation review are still pending.

The driver-page production build also passed. Driver routes render dynamically for season queries; the existing 71 calendar race pages still prerender successfully.

### Disclosure hydration fix

A user screenshot showed an unexpected native `details` open attribute during hydration. The three dashboard disclosures now use React-controlled buttons and hidden panels with aria-expanded/aria-controls. This removes native open-state restoration from the hydration path. TypeScript validation passed; reproducing the reported refresh/navigation sequence in a browser remains pending.

### Liquid glass update

The latest styling replaces graphite/lime with midnight blue, cyan and violet. Archive cards, driver cards, metrics, podium panels and selectors use translucent highlights, backdrop blur and inset reflections. Opaque fallback surfaces support browsers without backdrop-filter. Existing reduced-motion rules remain. This latest update has not been visually verified in a browser; the preceding build result applies to the previous refresh.

Once browser access is available, render the refreshed archive and race dashboard at desktop and mobile widths. Check the new palette, card hierarchy, entrance/hover transitions and reduced-motion behavior, then exercise race, driver, lap and stint controls. Inspect social previews and initial HTML across the season race routes.

## Multi-season update — 2026-10-01

- Data checks passed for 2024 (24 snapshots), 2025 (24) and 2026 (15 completed, 8 upcoming).
- TypeScript and production build passed; 71 calendar race routes prerendered.
- HTTP spot checks passed for all three archives, 2024 Bahrain, 2025 Abu Dhabi, 2026 Madrid, upcoming 2026 Bahrain and sitemap coverage of 71 race URLs. The upcoming schedule showed Sepang without fabricated pace/results.
- HTTP checks did not exercise every route or browser interactions. Visual and interaction QA remains pending browser authorization/access.

## Local driver photography

Final photography checks (2026-10-01): production build passed after the Hamilton provenance replacement, generating 81 static pages. A single development server was restarted on port 3000. HTTP 200 responses confirmed the 2026 Verstappen profile, 2025 Hamilton profile, 2025 directory, image credits and Next.js optimized Verstappen image. Response content includes both portrait sources, Hamilton attribution, the directory credits link and source/license links for all 28 portraits. The optimized image successfully decodes. Browser layout and interaction verification remains pending.

Driver profile heroes and directory cards now use responsive local photographs with individual source, author and license attribution, a full `/image-credits` page, historical-uniform notices and driver-code fallback for missing/failed images. Team-colored frames and subtle movement reuse CSS with reduced-motion overrides. Browser verification of photo framing, mobile sizing, loading, fallback and motion remains pending. The completed manifest covers all 28 imported driver codes. `npm run typecheck` and `npm run build` passed, including all 81 static pages and `/image-credits`. Browser verification remains pending.

## Track tab

Added URL-backed Track view to detailed and historical race pages, with the existing sector map, server-rendered circuit statistics and linked archive history. TypeScript and production build passed (206 generated pages). Browser interaction and visual review remain pending. Circuit-name matching is conservative; renamed venues can be omitted and historical configurations are not treated as equivalent lap records.
