# Fixnote logo

Two shapes, one motion. The mark (`fn`) writes itself; its tail goes back into the `f` and the
word (`fixnote`) is written; and back. Nothing is redrawn or morphed: each stroke of the pen is a
mask that opens the ink under it, so the logo on screen is always the designer's exact shape.

```bash
pnpm logo    # shapes + strokes → packages/ui (Logo), logo-motion.html, icon SVGs; checks them
pnpm icons   # pnpm logo, then every PNG/ICO/ICNS: desktop, Microsoft Store, web, site, menu bar
```

| File | What it is |
| --- | --- |
| `fixnote-mark.svg`, `fixnote-wordmark.svg` | The designer's shapes. The only source of form. |
| `strokes.json` | The pen's way through the ink: centre lines, widths, what a stroke must not open. |
| `build.mjs` | The generator and the check. |
| `motion.template.html` → `logo-motion.html` | The motion on one page: buttons, speed, dark theme (`brand` in `.claude/launch.json`). |
| `icon-bleed.svg` | The icon without corners (maskable, apple-touch). Generated. |
| `packages/ui/src/logo/logo.css` | Timing and easing. Written by hand; shared by the app, the page above, later the site. |
| `packages/ui/src/logo/data.gen.ts` | Generated. Never edit. |

## Taking a new logo from the designer

1. Export the two SVGs over `fixnote-mark.svg` and `fixnote-wordmark.svg` and run `pnpm logo`.
   If it prints `0 px differ` twice, that is all: run `pnpm icons` and look at `logo-motion.html`.
2. If it fails, the shapes moved further than the strokes reach: fix `strokes.json` (below).

What the files must keep, or the build refuses them:

- `viewBox` from `0 0`; paths with absolute `M L H V C Z` only (flatten in Figma, no transforms).
- **Holes are cut, not painted** in the background colour (the drop of the mark, `o`, `e`).
- Mark: one path (outline + the drop, `fill-rule="evenodd"`).
- Word: three paths in this order: `f`, the dot of `i`, the rest (`ixnote` is one piece, with the
  holes of the loop, `o` and `e`, `fill-rule="evenodd"`).
- **The word's `f` is the mark's `f`**: the same outline at `scale` (strokes.json; 1 since the
  2026-11 monoline logo, Figma 2031:2120–2124), at the left edge. Two differences, each with its
  own stroke: the mark's stem goes below the word's baseline (`mk-d`, the descender, which goes up
  as the word is written), and the word closes its bar with a round end where the mark's bar goes
  on into the loop (`w-fb`, shown only with the word). So the lockup is as tall as the mark
  (`height` in data.gen.ts) and the `f` does not move between the two. If they differ elsewhere,
  the check fails. A new `f` is drawn in the mark first and copied into the word.

## strokes.json

`scale`: the mark is shown at `scale` inside the word's box (same height as the word).

A stroke is a centre line (`d`) drawn with `width`, used as a mask over one `shape`
(`f`, `mark` in the mark's coordinates; `xnot`, `e` in the word's). Rules that keep it clean:

- **Width**: wider than the ink by a third or so, so small edits of the shape need no change. It may
  spill over empty paper, never over ink that is drawn later.
- **Crossings**: a wide mask would open a square of the line it crosses. So the stroke drawn first
  gets `block`: black polygons over the other line's ink on both sides of the crossing, from notch
  to notch of the outline and well past the mask's reach. The stroke drawn second needs none.
- **One line in several pieces** (`chain`): a line that crosses itself, or changes shape, is cut
  into pieces that each mask their own copy of the shape. Pieces of a chain share one length, so
  they move as one stroke with one easing. A piece starts where the last ended; `lead` is a short
  run-in over the piece before it (no hairline at the joint, and it fills the joint); `at` sets the
  start by hand (the tail starts inside the bar of the `f`).
- Start and end a little outside the ink: caps are flat.
- Ids are what `logo.css` animates: `mk-f` (hook and stem), `mk-d` (the descender), `t0` (bar of
  the f), `ta`/`tb` (tail: loop, then `n`), `w-fb` (the word's round end of the bar), `w-i`/`w-n`/
  `w-o` (one line: i, the rising stroke of x, the loop and n, the ring of o), `w-x` (the falling
  stroke of x), `w-t1`/`w-t2` (o into the bar of t, then its stem into e), `w-e1`/`w-e2` (bar and
  ring of e). Ids starting with `w-` are hidden while the mark shows. A new id needs its rule there.

The check renders every stroke fully drawn and compares it with the designer's shapes; a gap or a
different `f` is an error with the number of pixels. It does not see the motion: after changing
strokes, step through `logo-motion.html` at 0.5× and look at each crossing.

## Using it

- App and anything React: `<Logo variant="mark" | "word" intro height />` from `@fixnote/ui`.
  Colour is `currentColor`. Changing `variant` plays the unfold or fold.
- CSS only (the site): the same markup with `data-phase` (`none`, `draw`, `mark`, `expand`,
  `collapse`, `word`) and `logo.css`. `--fx-k` stretches time, `--fx-shift` centres the mark in the
  word's box.
- Video: `logo-motion.html`, or freeze any frame with `document.getAnimations()` and export.
- The icon is the mark in white on a flat orange tile, laid out as in Figma «Lockup — Icon»; its
  drawing is in `build.mjs` (`icon`). The same step writes the home page footer's icon
  (`apps/landing/src/assets/landing/home-mark.svg`; the large faint word there is drawn by hand)
  and the favicon (`favicon: true`, the mark two thirds of the tile so it reads at 16 px);
  `pnpm icons` makes `favicon.ico` (16, 32, 48) for the site and the web app.
- Blog covers and site Open Graph pictures take the word from `fixnote-wordmark.svg` too
  (`tools/figma-bridge/fixnote/blog-covers.mjs`, `apps/landing/og.mjs`).
