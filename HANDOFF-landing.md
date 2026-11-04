# Handoff: FixNote landing redesign (continue from here)

## Current source — updated 2026-11-04, supersedes the older brief below

- Use **Fixnote (04-11-2026)**, page **Home page**, frame `331:6445`:
  https://www.figma.com/design/EFIJySwZcM85Oi4fk5Y3mD/Fixnote--04-11-2026-?node-id=331-6445
- The user explicitly approved **Geist, the new FAQ, and the new footer**. The previous Inter / old
  footer / no-FAQ decisions below are obsolete. Orange remains `#de632c`.
- Current full bridge data and screenshots: `apps/landing/.figma/current/`. Keep using the local
  bridge, not REST/MCP. The bridge was restarted by the user and reconnected during this chat.
- Added `Faq.astro`, `Closing.astro`, `HomeFooter.astro`, six localized FAQ entries (en/ru/es),
  FAQPage JSON-LD, the actual exported closing photo/glow, keyboard illustration and footer wordmark.
  `Base.astro` has a footer slot: the new footer is on Home; other pages keep the existing footer.
- Geist is installed with Cyrillic support. The dependency lock change is limited to Geist.
- Recall now follows the new order: meaning → languages → keyboard shortcut → text in images.
- User-reviewed intro corrections:
  - Together starts at least 48 design px below the measured hero (ResizeObserver), clearing both
    buttons and chips even on shorter screens / with translated text.
  - No external shadow on the three flying cards. Figma rim: 10px, outer radius 42px, exact
    Figma warm-grey fill at 30%, background blur 34 in Figma / 17px in CSS, no stroke.
    Inner radii: offline/encrypted 32px; together 24px.
  - During the FIRST transition the icon fades out at `--a` 0…0.3. Offline copy then rises at
    `--a` 0.35…1, ending 32px from the top regardless of its translated height. The user explicitly
    wants to keep this movement before the later blur/crossfade into the collage face.
- Checked 1920×1080 geometry and icon sequencing in the browser; mobile ru/es at 375×812 has no
  section overflow or broken loaded images. FAQ opens one answer at a time; pricing stays CSS-only.
- `astro check`: 95 files, no errors/warnings/hints. Biome with formatting disabled: 111 files clean.
  Full Biome still reports pre-existing CRLF formatting noise in untouched files; don't reformat
  the whole folder. Latest build log: `.figma/current/build.log`. Earlier build generated all 156
  pages and OG images, then hit the known Node 24 Windows shutdown assertion documented below.
- Not yet manually emulated: OS reduced-motion preference. Both animated scenes retain their
  existing media-query fallback. Do not claim an exhaustive pixel-perfect / motion audit.
- Branch remains `upd/new-landing`; preserve prior staged deletions. User has now requested commit
  and push of the redesign. No deployment was requested.
- User requested replacing the black placeholder circles with our existing note logo, simplified
  and circular. `home-mark.svg` now reuses favicon paper/fold/lines on a flat `#de632c` circle,
  without gradients or shadows. Both Home header and Home footer already reference this asset.
- Latest review fixes: voice glow now comes directly from current Figma node `331:10603` (2x PNG,
  including opacity/image filters), rendered at 701.54×524, starting 262px above the photo bottom;
  do not apply a second 0.9 CSS opacity. Floating header now has 24px right padding and 24px
  Download→language spacing. Browser measurements confirmed both at 1920×1080.
- Latest full build again generated 156 pages + 156 OG pictures and printed Complete, followed
  by the same Node 24 Windows shutdown assertion. Subsequent glow/header CSS checks pass Biome.
- Further review: logo paper/fold/lines reduced to 82% inside the unchanged circle. Intro first
  transition now takes 0.75 viewport heights (formerly 0.9), so the app arrives sooner.
- Pinned Recall uses a size container on its remaining-height window; card width is capped by
  available height minus room for copy/link and bottom clearance. At 1533×835 the squares are
  about 402px instead of 453px. Pinning now requires 650px height; shorter screens use the normal
  scrollable gallery. CSS and JS media queries match. Root has overflow-x:clip; gallery has
  overscroll-behavior-x:contain. Checked mobile 320/375px without root width overflow.
- FAQ now animates native details in both directions via ::details-content, interpolate-size,
  block-size/opacity/content-visibility transitions (380ms), plus icon rotation; reduced-motion
  disables transitions. Browser confirmed intermediate block size and opacity on closing.
- Hero retains OS-aware download href but uses the Figma caption "Download" rather than changing
  it to "Download for Windows". Hero/closing white buttons have no outline/shadow, as in Figma.
  Header Download height corrected to 56px. Latest changed-file Biome checks pass.
- FAQ animation was revised again after user review: the ::details-content / auto-size CSS version
  above is superseded. `Faq.astro` now wraps each answer and uses a small inline Web Animations
  controller: 260ms measured-height expansion, then a 170ms delayed opacity/6px lift/2px unblur;
  closing hides text for 120ms and collapses with an 80ms lead. Rapid clicks reverse from current
  geometry, and switching questions animates the old answer closed instead of native name-group
  snapping. Native details remain the no-JS fallback, keyboard activation works through summary,
  and reduced motion settles instantly. Closed details must start at height 0 explicitly because
  native content-visibility can return cached descendant rects. Overflow anchoring is disabled on
  the answer list to avoid scroll jumps. Biome and Astro check pass (95 files, zero diagnostics).
- FAQ outer background fixed: Home's main now uses bg-canvas, showing the white rounded FAQ panel
  against grey, rather than blending into the old white main background.
- Latest FAQ polish: measure natural and interrupted heights with getComputedStyle(panel).height,
  NOT scrollHeight (integer rounding caused a ~1px final hand-over shift). Plus/minus no longer
  rotates: its vertical 2×16px stroke scales Y 1→0 and fades over 180/140ms.
- Together card rechecked against fresh Figma exports `331:6559` (hero) and `331:6548` (collage).
  Important: the arcs use PROGRESSIVE blur. Figma SVG export silently converts it to uniform
  Gaussian blur, causing the mismatch. IntroCard now uses direct 3x PNG exports of `331:6561…6563`
  at their exact render bounds; avatars refreshed from `331:6565…6567`. Hero copy line height is
  21px, transitioning to the collage's 19px. Do not switch these arcs back to SVG.
- App entrance advanced again: its initial top is max(92vh, measured hero bottom + 64 design px)
  instead of a fixed 1002 design px, avoiding a long invisible approach on short screens. The app
  now uses its own cubic-out `--ap` while flying cards retain `--a` easing. Verified at 1533×835:
  app top 768px initially, 642px after just 62px scroll. Existing final app position is unchanged.
- Removed idle scroll after the app settles: live intro height is now 255vh instead of 290vh
  (100vh stage + 75vh first transition + 80vh Experience overlap). The next entrance now begins
  at the same scroll position where the first transition finishes; browser check at 1533×835
  confirmed a difference of only 0.3px from viewport rounding, instead of 35vh of dead scroll.
- Final user changes before commit: hide the header logo completely (retain an empty centre slot
  so the navigation doesn't shift); keep the footer logo. Remove the floating header's 1px outline,
  retaining its blur and soft shadow. Full workspace typecheck (10 tasks), tests (7 tasks), web
  build and lint rules pass. Full pnpm check stops on pre-existing formatting/CRLF diagnostics in
  untouched files; all 42 changed source/config/vector files were checked/formatted separately.
- Additional final requests: Home appears before Features. Language menus close on outside click
  and Escape (verified in browser), and opening one closes the other. Public site languages are
  now EN/ES only: no /ru/ routes or Russian hreflang/menu entries. Russian source dictionaries and
  app language support remain intact. Retired /ru/ URLs redirect to English, with explicit blog
  mappings by translationKey. Final build generated 104 pages + 104 OG images and Complete,
  then reproduced the known Windows Node shutdown assertion. All 104 built HTML pages were
  checked for missing Russian routes/links/alternates; final Astro check is clean. Full workspace
  tests/types, web build and cargo clippy all completed successfully before this last site-only
  language change. Commit/push authorization includes these final requests.

You are continuing work on the FixNote landing page redesign in this repo (branch `upd/new-landing`,
nothing committed yet). Read `CLAUDE.md` first (conventions; the landing section is at the end) and
keep to it. Reply to the user in Russian.

## Goal

The home page (`apps/landing`, Astro, static) must match the Figma page **Frame 18** 1:1 down to
the footer (the footer stays the old one):
https://www.figma.com/design/t7mP7Z9ft7SEdDSxES0YYy/Fixnote--Copy-?node-id=279-51
The hero's starting state is a separate frame: node `282:446`.
Decisions the user made: Inter font everywhere (not SF Pro); orange is exactly `#de632c` (buttons,
eyebrows, links); Russian app screenshots are fine on every language for now; no FAQ section on the
home page; the old footer stays.

## Reading Figma: the local Figma Bridge (no MCP, no REST)

The Figma MCP and REST API are rate-limited on the user's free Starter plan and blocked. Use
`tools/figma-bridge` (a Figma plugin + local bridge, no limits, see its README):

- The user runs `pnpm figma serve --out apps/landing/.figma` and the plugin
  "Figma Bridge (local)" in Figma desktop. Check with `node tools/figma-bridge/bridge.mjs status`;
  if the plugin is not connected, ask the user to open it.
- Commands (ids like `279:51`, or a Figma link; `--out apps/landing/.figma/<dir>`):
  `tree <id> --depth N`, `nodes <id>` (full JSON: fills, effects, text runs with font/size/line
  height/letter spacing, auto layout, `absoluteBoundingBox` and `absoluteRenderBounds`),
  `render <id> --scale 2 | --format svg`, `originals <id>` (photos as uploaded), `find <text>`.
- `apps/landing/.figma/full/279-51-frame-18.json` already holds the whole Frame 18 (13 MB) and
  `279-51-frame-18@1x.png` its render. Positions in it are absolute; subtract Frame 18's box.
- Trust `absoluteRenderBounds` for vectors/blurred layers; place SVG exports by render bounds.

## How the page is built

- `src/views/Home.astro`: Intro → Tidy → Integrations → Recall → Privacy → Voice → Plans.
- `src/views/home/Intro.astro` + `IntroCard.astro` + `src/styles/intro.css`: header-hero-app-
  Experience as one scroll scene (sticky stage, a tiny inline script sets `--a --h --f --b --gy`;
  three cards fly from the hero into the Experience collage). Live only at ≥1280×600 without reduced
  motion; otherwise a static layout.
- `Tidy.astro`, `Integrations.astro`, `Recall.astro` (pinned horizontal row, inline script sets
  `--p`/`--travel`, live at ≥735×500), `Privacy.astro`, `Voice.astro`, `Plans.astro` +
  `src/styles/home.css`. Shared: `src/components/ArrowLink.astro`, `GlassCard.astro`.
- Header: `src/components/Header.astro` (flat at the top, floating pill after scroll via an
  IntersectionObserver) + header styles in `src/styles/global.css`; `LangMenu` has a `large` globe.
- All sizes are design px × `--u` (`clamp(0.8px, min(100vw/1640, 100vh/960), 1px)`), so at a
  1920×1080 viewport `--u = 1` and the page is 1:1 with Figma — verify there.
- Copy: `src/i18n/{ru,en,es}.ts` (`intro`, `landing.*`); ru is the reference shape. Line breaks
  that the design has are `\n` in the strings + `white-space: pre-line`.
- Assets: `src/assets/landing/` (cropped/baked from Figma: glows are pre-blurred PNGs, arcs are SVG
  exports, avatars are 3× renders).

## Already verified 1:1 at 1920×1080 (via bridge data)

Voice, Pricing, Integrations, Privacy (positions, arcs, switch), Recall spacing, section gaps
(Experience→Tidy 152, Tidy→Integrations 756, Integrations→Recall 200, Recall→Privacy 204,
Privacy→Voice 1352, Voice→Pricing 2035), header (logo top 56, Download 57, globe 72 / 24 px).

## What is left

1. (Done at handoff: lint was clean and the last build passed, 156 pages.)
2. Finish the Frame 18 pass for the parts built from the earlier MCP data and not yet re-checked
   with the bridge: Experience heading `279:83` and cards `279:92 279:96 279:125 279:138 279:157`,
   Tidy `279:101`, hero `282:446` (separate frame) incl. the floating cards `279:145 279:151
   279:168`. Compare each with the DOM at 1920×1080 (`getBoundingClientRect`, computed styles).
3. "Edit together" card: arcs and avatars were just replaced by Figma exports
   (`together-arc-*.svg`, `avatar*.png` 3×) — confirm visually in the collage and in the flying
   copy in the hero.
4. Text widths differ slightly from Figma because Inter is wider than SF Pro (user's choice); where
   a line wraps differently, use the design's `\n` + `pre-line`/`nowrap` rather than resizing.
5. Header "FAQ" link points to `/#faq`, which no longer exists — ask the user: drop the link or make
   a FAQ page (that would also restore the FAQPage schema).
6. Not yet checked live: animation smoothness (the preview pane was hidden), reduced-motion mode,
   phones after the latest changes.
7. Optional cleanup: unused i18n keys of the removed sections (`features`, `reasons`, `tools`,
   `blogTeaser`, `pricing`, `steps`, parts of `hero`, `tiles`).
8. Commit only when the user asks (branch first if on main; end messages with the attribution the
   user's environment requires).

## Checks before saying done

`pnpm exec biome check apps/landing/src tools` (format errors in files you did not touch are CRLF
noise; don't reformat unrelated files), `pnpm --filter @fixnote/landing build`.

## Gotchas already hit

- Inserting `\n` into TS strings with sed/heredocs wrote real newlines and broke the build: edit
  with an exact-string editor or a Python script that writes the two characters `\` `n`.
- Biome `format --write` on a folder rewrites line endings of untouched files; revert those.
- Bash heredocs with quotes sometimes fail in this shell; put scripts in files.
- A stuck `position: sticky` box's `offsetTop` reports its stuck position — use the section's
  padding instead (see `Recall.astro`).
- Node 24 on Windows can crash at exit after `fetch` (`UV_HANDLE_CLOSING`): don't call
  `process.exit()` in scripts; `astro build` may print this after "Complete!" — the build is fine.
- If the user's `astro dev` starts returning `MissingSharp` for images, it needs a restart.
- Figma "Layer blur r" ≈ CSS `blur(r/2)`; bake big blurs into images instead of runtime filters.
