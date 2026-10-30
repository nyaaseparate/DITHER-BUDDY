# Dither Buddy — Free Retro Dithering Studio

A free in-browser dithering studio: **63 dithering algorithms**, retro palettes,
stackable pre/post effects, video + timeline, PNG / JPG / SVG / WebM export.
100% client-side — no uploads, no backend, no signup.

Live demo: enable **GitHub Pages** (Settings → Pages → Deploy from branch) and
open `https://<your-username>.github.io/<repo-name>/`.

## Run locally

Just open `index.html` in a browser, or serve the folder:

```bash
npx serve .
# or
python3 -m http.server 8000
```

## Files

- `index.html` — studio UI + CSS, loads the scripts below as classic scripts.
- `src/dither-engine.js` — pure logic, exposes `window.DitherEngine`:
  `PALETTES`, `ALGORITHMS` (63 entries), `quantize()`, `paint()`,
  `medianCut()`, `traceSVG()`.
- `src/app.js` — UI wiring + render pipeline, exposes `window.DitherBuddy`
  (`state`, `render()`, `sample()`, …) for debugging and power users.

## How it works

Source (image / video / webcam / procedural) → grid canvas at detail width →
pre-fx stack (pixel ops, in order) → `quantize()` (error diffusion with
serpentine + palette LUT, or threshold maps) → `paint()` (blocks via grid-res
ImageData + upscale; halftones/stitch/knit via batched Path2D per color; ASCII
via glyph-sprite stamping) → post-fx stack (glow, chromatic, scanlines,
vignette, grain, jpeg).

## Adding things

- **Algorithm:** add `{id, group, name}` to `ALGORITHMS` in the engine, then a
  branch in `quantize()` (threshold / error-diffusion) and, only if it needs
  shapes, a case in `paint()`. Flat dithers need no `paint()` change.
- **Palette:** append to `PALETTES` (`id`, `name`, hex `colors`).
- **Effect:** add a def to `PRE_DEFS` / `POST_DEFS` in `app.js` plus its case in
  `applyPreStack()` / `applyPostStack()`.
- **Preset:** append to `PRESETS` in `app.js`.

## License

MIT — see [LICENSE](LICENSE).
