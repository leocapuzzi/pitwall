# Handoff: PITWALL — LIGMA Racing Sim-Racing Telemetry & Race-Engineering App

## Overview
PITWALL is a desktop web app for sim racers (iRacing-style) to review their driving: season dashboard, stint breakdown, live-style telemetry analysis, lap analysis, A/B lap comparison, and an AI Race Engineer chat. This package is the **hi-fi prototype** of the full product (6 screens), built in HTML/CSS + React-via-Babel, plus the original low-fi wireframes for reference.

The goal of this handoff is to **rebuild these designs in a real codebase** with real data, real telemetry/analysis models, and real track geometry.

## About the Design Files
The files in this bundle are **design references created in HTML** — interactive prototypes showing intended look, layout, and behavior. **They are not production code to copy directly.** They use React loaded through an in-browser Babel transform and a set of `.jsx` files concatenated via `<script type="text/babel">` tags — fine for a prototype, wrong for production.

Your task: **recreate these designs in the target codebase's environment**, using its established patterns and libraries. If no app exists yet, the recommended stack is **React + TypeScript + Vite**, with a charting approach based on **inline SVG you control** (the prototype hand-builds all charts/maps as SVG — see "Charts & the track map" below; do not reach for a heavy chart lib, the visuals are bespoke).

## Fidelity
**High-fidelity (hifi).** Final colors, typography, spacing, interaction, and motion are all specified and should be reproduced faithfully. Exact tokens are in `pitwall.css` (design system) and `components.css` (component styles), both included. All numeric data shown (lap times, iRating, sectors, deltas, chat answers) is **placeholder/mock** and must be replaced with real data — the *visuals* are final, the *data* is not.

---

## App Shell (persistent chrome — `chrome.jsx`, `main.jsx`, `pitwall.css`)

Fixed full-viewport column, `overflow:hidden` on body; only the center `.stage` scrolls.

1. **Top nav** (`.topnav`, height **62px**): brand lockup (gradient "L" mark 34×34 + "PITWALL / LIGMA RACING" wordmark) on the left; centered main nav (Dashboard · Stint Overview · Telemetry · Lap Analysis · Comparison · AI Engineer); right side has icon buttons (gear, notifications w/ accent badge dot, info) and the user chip (avatar + "L. Capuzzi" / role label "Driver" in accent).
2. **Session tab strip** (`.tabstrip`, height **46px**): shown on every screen **except Dashboard**. Session tabs + "add" button + right-aligned status. Currently static.
3. **Stage** (`.stage`): the scrollable screen area; `.screen` has `padding:24px 26px 30px` and a fade-in animation. Each screen starts with a header (`.scr-head`): `h1` in display font 24px + a muted subtitle.
4. **Status bar** (`.statusbar`, height **42px**): footer with a pulsing "live" indicator.

### Routing / state
- View state is a single string (`dashboard|stint|telemetry|lap|comparison|ai`), persisted to `localStorage['pw_view']`. **For production, move this to the router/URL.**
- Titles/subtitles per view live in `VIEW_TITLES` / `VIEW_SUBTITLES` (`main.jsx`). Note: the **tab label was renamed to "AI Engineer"** though the page H1 still reads "Race Engineer AI" — align these in production (prefer "AI Engineer" / "Race Engineer").
- **Tweaks panel** (theme + accent color switcher) is a prototype-only dev tool — **do not port it** unless you want a user-facing theme switch. It offers 3 themes (Midnight/Carbon/Graphite) and 5 accent colors; if you keep theming, the theme classes are defined in `pitwall.css` (`body.theme-carbon`, `body.theme-graphite`).

---

## Screens / Views

### 1. Dashboard (`screens-dashboard.jsx`)
**Purpose:** season-at-a-glance + driver/car identity.
**Layout:** two-column `row.resp` (left `flex:1.05`, right `flex:1.15`), then a full-width "Licenses & Ratings" band below.
- **Left column:** a **hero carousel** (`.hero.welcome`, min-height 260px) + a "Weekly activity" bar card beneath it.
  - Hero shows "Welcome back / L. Capuzzi", a large hero image (driver photo or a car), and a footer row with car number badge "64", title/subtitle, and **carousel nav** (prev/next arrows + 3 dots).
  - **3 panels:** Driver (all-cars stats) · Porsche 911 GT3 · Mazda MX5 Cup. Switching the panel **changes every card in the right column** (the stat values, latest-session card, and the donut all read from the active panel's data object in the `PANELS` array).
  - **Behavior:** auto-advances every **5000ms**; **pauses on mouse-enter** of the left column; supports **swipe** (pointer drag >40px) which also pauses autoplay. Hero image swap has a `heroSwap` fade (0.42s).
  - Hero images are `object-fit:contain`, vertically centered, with top padding (~44px) reserved for the "welcome" text and bottom padding (~54px) for the footer so the subject never collides with chrome. All three source images share the same aspect ratio (1672×715) — **keep this constraint** when supplying real images, or the panels will shift.
- **Right column:** a `grid3` of 3 stat tiles (e.g. Season laps / Time driven / iRating), a row with "Latest session" (mini track map + best lap + leaderboard pos) and a **donut card**, then a "Weekly activity"… (note: weekly activity moved to the LEFT column in the final layout).
- **Donut card:** uses a **donut chart, size 162px**. For the Driver panel it's a **multi-segment donut** (`SegDonut`) — one colored slice per car (Mazda = accent green, Porsche = cyan, Other = ink-3), summing to 100%, with "248 / LAPS" in the center. For car panels it's a single-value ring (`Donut`) (e.g. "34% / PODIUM"). **Every panel's donut card has the same structure: donut + a 3-row legend/stat list below**, so the card height and donut position are identical across panels (this was a deliberate fix — preserve it).
- **Licenses & Ratings band:** 4 cards (Sports Car / Formula Car / Oval / Dirt Road), each with the iRacing license-class badge in class color (A=`#3E83F0`, B=`#39C76B`, C=`#F4CE47`, D=`#F6871F`, R=`#FF5656`), iRating + week delta, a trend sparkline, and a Safety Rating bar with its own week delta. Deltas are color-coded green up / red down.

### 2. Stint Overview (`stint-pro.jsx`)
**Purpose:** lap-by-lap breakdown of one stint.
**Layout (fills viewport without scroll on a normal laptop ≈ 700px+):** header row (car + fuel chip + Laptime/Sectors segmented control) → 4 KPI cards (`grid4`: Fastest / Optimal / Average + σ / Consistency) → a middle row **fixed at height 210px** (interactive laptime chart `flex:1.5` + selectable lap list `flex:1`) → a full-width "Sector breakdown" band.
- **Laptime evolution chart:** SVG draws only the **area + line** (`vector-effect:non-scaling-stroke` for crisp strokes under non-uniform scaling). **Points, vertical guide, the value tooltip pill, and x-axis lap numbers are HTML overlays** (not SVG text) so they never distort — important pattern, replicate it. Hover a point or a list row → both highlight; the tooltip and the sector band update. Best lap point is accent green; a dashed purple line marks the optimal lap.
- **Lap list (`.sp-list`):** scrolls internally; each row is a button (lap # · time · delta-to-best · star on best). Selecting drives the sector band.
- **Sector breakdown band:** an `L#` badge + lap time, then 4 sectors each with time, a divergent bar, and "best"/"+delta" (session-best sectors in green).

### 3. Telemetry (`telemetry-pro.jsx`) — the centerpiece
**Purpose:** scrub through a lap and compare your trace vs a reference, channel by channel, with a synced car on the track map.
**Core model:** a single shared cursor `t` (0..1 along the lap) driven by **(a)** play/pause (rAF loop, lap plays over ~16s), **(b)** dragging the bottom scrubber, **(c)** hover-scrub over any channel plot. `t` updates *in sync*: every channel's cursor+dot, the live numeric values (yours colored + reference greyed), the two driver pods at top, the scrubber clock/delta, and the car on the map.
**Layout:** header (session card + 2 driver pods) → main row (left rail + track column `flex:1.02` + channel stack `flex:0.98`) → bottom scrubber.
- **Track map** (shared `InteractiveTrack`, see below): big map with the **Porsche pictogram as the car marker** (white fill, colored glow that flips green↔red on throttle/brake), rotated to the racing-line tangent and moving with `t`. Zoom (wheel + buttons), pan (drag), reset.
- **Channel stack:** 7 channels (Delta, Speed, Throttle, Brake, RPM, Gear, Steering), each with **fixed standard colors** — Delta=purple `#9D7BFF`, Speed=cyan `#34C8D8`, Throttle=accent green, Brake=red `#FF5C4D`, RPM=amber `#E6A94A`, Gear=ink, Steering=ink-2. Each row: grip handle, name, reference value, live value, hide (×) button, and an SVG plot with `non-scaling-stroke` (crisp), a dashed-white ghost (reference) line, gradient area fill, plus a cursor line + dot.
  - **Per-channel interactions:** **hide** a channel (× → it moves to a restore-chip row), **drag-reorder** via the grip handle, and **synced zoom** — scrolling the wheel over the stack zooms ALL channels to the same time window (adjusts each SVG viewBox x/width together); a "Reset zoom" chip appears when zoomed.
- **Segmented controls** use the sliding-pill `SlideSeg` (Segments/Sectors, Time/Distance) with equal-width buttons.

### 4. Lap Analysis (`lap-pro.jsx`)
**Purpose:** where you gain/lose time, corner by corner.
**Layout:** header (Segments/Sectors + lap-vs-reference summary) → main row (track map `flex:1.45` + right column with "Time per corner" bars and a corner-detail card) → bottom scrubber.
- **Track map:** same `InteractiveTrack` with Porsche marker + 6 numbered corner dots. Loads **unzoomed** (full lap), T3 pre-highlighted in the bars.
- **Corner bars (`.lp-bar`, clickable):** one divergent bar per corner (T1–T6); clicking a bar **selects it, focuses/zooms the map on that corner, moves the car there**, and updates the detail card (delta, min speed, sector, diagnostic text). Clicking the map's reset returns to full lap.
- **Scrubbing** snaps the active corner to the nearest one.

### 5. Comparison (`screens-comparison.jsx`)
**Purpose:** two laps side by side (your best vs a reference/pro ghost).
**Layout:** top row of 3 cards (Lap A / Total Δ pill / Lap B) → main row (track map `flex:1.55` + right column: cumulative-delta chart + clickable sector breakdown) → channel overlay (Speed/Throttle/Brake A-vs-B) → bottom scrubber.
- **Track map:** same `InteractiveTrack`, Porsche marker driven by the scrubber, plus a red sector-3 overlay path and a callout. A "Biggest gain" inset sits top-left (kept clear of the top-right zoom buttons).
- **Sector breakdown rows (`.cmp-srowbtn`, clickable):** S1–S4; clicking one **highlights it and focuses/zooms the map** on the mapped corner (S1→T2, S2→T3, S3→T5, S4→T6); clicking again toggles off.
- **Cumulative delta chart** + the 3 **channel overlays** all have cursors that **follow the scrubber `t`**. Channel colors match Telemetry (Speed cyan, Throttle green, Brake red), reference trace dashed purple, crisp `non-scaling-stroke`.

### 6. AI Engineer / Race Engineer (`ai-pro.jsx`)
**Purpose:** post-session analysis as a chat with an AI race engineer (the team mascot).
**Layout:** a **hero banner** at top (mascot avatar 88px with accent ring/glow, "Your AI Race Engineer · LIVE", big name, an in-character quote, and Session/Potential stats + Re-analyze) → main row (left `flex:1.6`: summary card + 4 skill-grade cards + "Biggest time gains" list + skill-trend chart; right `flex:1`: the chat + a pinned-insight card).
- **Chat is live (prototype logic):** suggestion chips and the text input post a user message; after a ~700ms typing indicator the engineer replies. **Replies are keyword-matched canned answers** (`apReply()`), some with an inline SVG trace chart. The mascot is the avatar on the header and every engineer message. **In production, replace `apReply` with a real model/back-end call** (stream tokens into the same bubble; keep the typing indicator as the loading state).
- **Opportunity rows (`.ap-opp`, clickable):** clicking one highlights it, updates the **pinned-insight** card, and **posts a question to the chat**.
- The chat header was deliberately de-duplicated — only the hero banner carries the "Re-analyze" action and full identity.

---

## Shared building blocks (`re-shared.jsx`)
Port these as real reusable components:
- **`InteractiveTrack`** — the SVG track map. Props: `t` (car position 0..1, or null to hide car), `braking`, `focusCorner` (animates zoom to a corner), `corners`/`activeCorner`/`onPickCorner` (numbered dots), `redPath` (overlay), `children` (overlays like callouts/insets). Handles wheel-zoom (non-passive listener, zoom-to-pointer), drag-pan (clamped to bounds), button zoom, animated focus transitions (0.55s ease). The car is the Porsche pictogram (`window.PORSCHE_MARK`, an inline SVG path set in `porsche-mark.js`), tangent-rotated along the path via `getPointAtLength`.
- **`SlideSeg`** — sliding-pill segmented control; **buttons are equal-width** (CSS grid `1fr` columns) so the pill aligns under any label.
- **`REScrubber`** — play/pause button, mono clock, draggable track bar with corner ticks + knob, live Δ + secondary readout, optional Time/Distance `SlideSeg`.
- **`reSeries(kind, seed, n)`** — deterministic mock series generator (speed/throttle/brake/etc.). **Replace entirely with real telemetry samples.**

## Charts & the track map
All charts are **hand-built inline SVG** (no chart library). Two patterns to keep:
1. **`vector-effect:non-scaling-stroke` + `shape-rendering:geometricPrecision`** on any stroked path inside an SVG drawn with `preserveAspectRatio="none"` (channels stretch horizontally; this keeps strokes a uniform pixel width instead of distorting).
2. **Render data points, tooltips, axis labels, and cursors as HTML overlays** positioned in %, not as SVG `<text>`/`<circle>`, so they stay crisp and undistorted when the plot box is stretched.
The **track path is a single generic "Winton-style" SVG path** (`RE_TRACK` in `re-shared.jsx`, also `TP_TRACK` in telemetry-pro). **Production needs real per-circuit geometry** (and the racing line as a measured path so `getPointAtLength` places the car correctly).

---

## Interactions & Behavior (summary)
- **Shared-cursor scrubbing** (Telemetry/Lap/Comparison): play (rAF, ~14–16s/lap), drag scrubber, hover-scrub; everything reads one `t`.
- **Map:** wheel-zoom to pointer, drag-pan (clamped), zoom buttons, reset; click corner/sector → animated focus.
- **Dashboard carousel:** 5s autoplay, pause-on-hover, swipe.
- **Telemetry channels:** hide/restore, drag-reorder, synced wheel-zoom.
- **AI chat:** post → 700ms typing → reply (replace with real streaming); clickable opportunities repin insight + ask.
- **Motion:** screen fade-in 0.3s; hero swap 0.42s; map focus 0.55s; standard ease `cubic-bezier(.3,.7,.4,1)`. Honor `prefers-reduced-motion` in production (the prototype does not).
- **Persistence:** current view + some cursor positions in `localStorage` — migrate to router/state.

## State Management (what to model for real)
- `view` (route), `t` (lap cursor per analysis screen), `playing`, channel `order`/`hidden`/`zoom` window, selected lap (Stint), selected corner (Lap), selected sector (Comparison), active hero panel (Dashboard), chat message thread + typing + pinned insight (AI), `mode` (Time/Distance).
- **Data fetching:** sessions, laps, per-channel telemetry samples, sector splits, licenses/iRating/SR, opportunities/analysis, and the AI engineer responses are all currently mock — wire each to the real telemetry/analysis pipeline.

## Missing states to add (not in prototype)
Loading, empty ("no session / waiting for live session" — the footer hints at live data), and error states for every data-backed surface; form validation isn't applicable yet. Keyboard navigation + visible focus rings + ARIA labels on the scrubbers, segmented controls, map, and icon buttons are **not** implemented and should be added.

## Scope note
**Desktop-first.** The prototype targets wide viewports; below ~820px the dense screens (Telemetry grid, Comparison) are not yet designed. **Mobile/tablet is in scope but only after desktop is solidified** — do not block on it.

---

## Design Tokens (from `pitwall.css` — source of truth)

### Color
| Token | Value | Use |
|---|---|---|
| `--accent` | `#1FDE7E` | primary green (you / positive / brand) |
| `--accent-ink` | `#03140b` | text on accent |
| `--purple` | `#9D7BFF` | reference lap / delta channel / "optimal" |
| `--red` | `#FF5C4D` | loss / braking / negative |
| `--cyan` | `#34C8D8` | speed channel / Porsche slice |
| `--amber` | `#E6A94A` | RPM channel |
| `--blue` | `#5B8DEF` | misc |
| `--bg` / `--bg-2` | `#090A0C` / `#0C0E11` | app background (Midnight theme) |
| `--surface` / `-2` / `-3` | `#131619` / `#181C21` / `#20252C` | cards / raised / inputs |
| `--hair` / `--hair-2` | `rgba(255,255,255,.065)` / `.11` | hairline borders |
| `--ink` / `-2` / `-3` | `#F1F4F3` / `#9AA1AB` / `#5C636E` | text / muted / dim |

`--accent-soft/-line/-glow` and `--red-soft`/`--purple-soft` are `color-mix` derivations of the base hues. License-class colors (Dashboard band): A `#3E83F0`, B `#39C76B`, C `#F4CE47`, D `#F6871F`, R `#FF5656`.

> ⚠️ A `<button>` does not inherit page text color — several prototype bugs were dark button text on dark bg. In production, set a base text color on interactive elements globally.

### Typography
- **UI:** `Archivo` (400–900). **Display:** `Archivo Expanded` (600–900) for headings/big numbers. **Mono:** `JetBrains Mono` (400–700) for all numerics (`.num`, `font-variant-numeric:tabular-nums`).
- Scale: H1 24px/800 display · h2 19px/700 · h3 15px/700 · body 14px · stat value 30px display (`.sm` 23px) · label `.lbl` 10.5px/700 uppercase letter-spacing .13em · `.muted`=ink-2, `.dim`=ink-3.

### Radius / shadow / motion
- Radii: `--r-xs 7` · `--r-sm 10` · `--r 14` · `--r-lg 18` · `--r-xl 24` · `--r-pill 999`.
- `--shadow` (card) and `--shadow-pop` (popovers) defined in `pitwall.css`.
- Easing `--ease: cubic-bezier(.3,.7,.4,1)`.
- Spacing: card padding 16×18; screen padding 24×26×30; common gaps 6/8/10/12/14px; grids `grid3`/`grid4` 12px gap.

### Primitives (in `pitwall.css`)
`.card(.pad/.soft)`, `.row/.col` flex helpers + `.grid2/3/4`, `.chip(.solid/.on)`, `.btn(.primary)`, `.seg`/`.utabs`, `.stat` tile, `.dot/.cbadge`, `table.tbl`, `.barline/.bars`, `.rank`. Component-specific styles (carousel, donut, telemetry channels, scrubber, maps, AI chat, etc.) are in `components.css`, keyed by the prefixes `wel-`/`hero`, `lic`/`SegDonut`, `tp-` (telemetry), `sp-` (stint), `lp-` (lap), `cmp-` (comparison), `ap-` (AI), `sseg` (slide segmented).

## Assets (in `assets/`)
- `ligma-logo.png`, `ligma-wordmark.png` — brand marks.
- `ligma-driver-face.png` — top-nav user avatar.
- `engineer-mascot.png` — AI engineer mascot (chat avatars + AI hero banner). A fun team in-joke; keep it central on the AI screen.
- `hero-driver.png`, `hero-porsche.png`, `hero-mazda.png` — Dashboard hero carousel (all 1672×715 source ratio; the Mazda was luminance-keyed off a black background — supply transparent PNGs in production).
- `porsche-mark.js` — inline SVG of the Porsche pictogram used as the moving car marker on every track map (`window.PORSCHE_MARK`).
All are placeholders; replace with the team's real brand/photo assets and a per-driver/per-car pipeline.

## Files in this bundle
**Entry:** `PITWALL Hi-Fi.html` (loads React 18.3.1 + Babel, then the styles and scripts below).
**Styles:** `pitwall.css` (design system / tokens / primitives), `components.css` (all component styles).
**Shared JS:** `chrome.jsx` (top nav, session strip, status bar, icon set), `main.jsx` (app shell + routing + tweaks), `charts.jsx` (SVG chart generators: Donut, SegDonut, channelSVG, mini track map, sparkline, etc.), `re-shared.jsx` (`InteractiveTrack`, `SlideSeg`, `REScrubber`, `reSeries`), `porsche-mark.js`.
**Screens:** `screens-dashboard.jsx`, `stint-pro.jsx`, `telemetry-pro.jsx`, `lap-pro.jsx`, `screens-comparison.jsx`, `ai-pro.jsx`.
> Note: `screens-stint.jsx`, `screens-telemetry.jsx`, `screens-lap.jsx`, `screens-ai.jsx` are earlier/base versions still loaded by the HTML; the **`*-pro.jsx` files are the current/authoritative implementations** and override them at runtime. Build from the `-pro` files.
**Reference:** `PITWALL Wireframes.html` + `wire.css` — original low-fi wireframes (structure/flow intent).
`tweaks-panel.jsx` — prototype dev tool (theme/accent); not for production.

## How to run the prototype
Open `PITWALL Hi-Fi.html` in a browser (it fetches React/Babel from unpkg). Use the top nav to switch screens. The Tweaks toolbar (theme/accent) is a dev affordance.
