# Dither Buddy — free in-browser dithering studio

A free equivalent of the paid "Dither Boy" app: 64 dithering algorithms,
retro palettes, duotone mode, split-view compare, threshold bias, stackable
pre/post effects, video + timeline, PNG/JPG/SVG/TXT/WebM export.
100% client-side, no uploads, no backend.

## What the top 10 taught us (copied best ideas)

Visited: DitheringStudio, Dither it!, TurboDither, Scanly, Dither Garden,
STUDIO·ITY, InstantGradient, DitherEffect, Throwie, PixelTools
(`scratch/research/summary.txt`).

- Split compare slider (TurboDither): `Split` button + draggable divider —
  original left, dithered right, post-fx matched on both sides.
- Threshold bias slider (STUDIO·ITY / InstantGradient bias): -100…100,
  shifts every decision boundary lighter/darker.
- Duotone mode (Dither Garden tritones / InstantGradient duotone):
  shadow + highlight pickers, dithers between exactly those two.
- ASCII TXT export (Dither Garden): one click saves the character grid.
- Kernel readout (Scanly's exact numbers): every error-diffusion algorithm
  prints its divisor + taps; ordered notes its frame-stable matrix.
- 3-step empty state (PixelTools): load → pick → export.
- Kept ours: typed numbers, presets with undo, kernel/matrix editors,
  extract/import palettes, Hold-original, zoom/pan, timeline, WebM.

## Files

- `index.html` — studio UI + CSS. Loads the two scripts below as classic scripts.
  NOTE: visible text nodes must avoid `[ ... ]` and `{a|b}` — the Perchance
  engine evaluates those as template syntax. Keep copy bracket-free.
- `src/dither-engine.js` — pure logic, exposes `window.DitherEngine`:
  `PALETTES`, `ALGORITHMS` (63 entries), `quantize()`, `paint()`,
  `medianCut()`, `traceSVG()`. No DOM except canvas contexts passed into `paint()`.
- `src/app.js` — UI wiring + render pipeline, exposes `window.DitherBuddy`
  (`state`, `render()`, `sample()`, …) for debugging and power users.
- `main.pjs` — only `$meta` (title/description/tags).

## Render pipeline

Source (image / video / webcam / procedural) → grid canvas at `detail` width
(quick-adjust via `ctx.filter`) → pre-fx stack (pixel ops, in order) →
`quantize()` (error diffusion with serpentine + palette LUT, or threshold maps) →
`paint()` (blocks via grid-res ImageData + upscale; halftones/stitch/knit via
batched Path2D per color; ASCII via glyph-sprite stamping) → post-fx stack
(glow, chromatic, scanlines, vignette, grain, jpeg).

Temporal motion: `state.time` advances at ~15fps for stills (slower for heavy
shape modes) and tracks `video.currentTime` for video; threshold origins and
error-diffusion noise depend on it, so animations shimmer.

## Controls

- Every numeric setting has a slider plus a typeable number box. Both stay in
  sync and clamp to the same min/max. Effect-stack amounts are typeable too.
- Single dither pipeline: one algorithm, one palette, pre-fx then dither
  then post-fx. There is no stacked second dither — that system was removed
  because re-quantizing every frame was slow and confusing.
- Dithering off: click the selected algorithm again, or the `Original · no
  dither` button. Presets toggle off the same way — clicking the active
  preset again restores whatever was set before it.
- `Reset` in the top bar restores factory defaults: Floyd–Steinberg, PICO-8,
  empty fx stacks, default sliders, kernel, matrix and zoom. The
  loaded image stays loaded. It also clears remembered settings so a reload
  stays on defaults instead of re-applying e.g. Spirit.

## Adding things

- Algorithm: add `{id, group, name}` to `ALGORITHMS` in the engine, then a
  branch in `quantize()` (threshold/error-diffusion) and, only if it needs
  shapes, a case in `paint()`. Flat dithers need no `paint()` change.
- Palette: append to `PALETTES` (`id`, `name`, hex `colors`).
- Effect: add a def to `PRE_DEFS`/`POST_DEFS` in `app.js` plus its case in
  `applyPreStack()`/`applyPostStack()`.
- Preset: append to `PRESETS` in `app.js`.

## Perf notes

- `blockFill` is ImageData + one `drawImage` upscale (fast). Shape modes batch
  one Path2D fill/stroke per palette color. Never set per-cell `shadowBlur`
  (it caused a 14s frame once). Rotated `ellipse()` in Path2D is pathologically
  slow in Chrome — keep ellipses axis-aligned.
- The anim loop has a busy-guard (`requestRenderDirect.busy`) so slow frames
  can't pile up.

## Tested

64/64 algorithms render without errors; contact-sheet screenshots reviewed
(`scratch/shots/`); synthetic-WebM video load/play/scrub/record verified;
PNG/SVG export toasts verified; desktop 1600px (3-column) and narrow
(single-column) layouts screenshotted.
