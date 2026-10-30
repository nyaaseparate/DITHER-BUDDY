# Dither Buddy — Free Retro Dithering Studio

A free in-browser dithering studio: **63 dithering algorithms** (click again to
disable), **Truecolor 24-bit RGB** + retro palettes, **dither layers**,
stackable pre/post effects, video + timeline, PNG / JPG / SVG / WebM export.
100% client-side — no uploads, no backend, no signup. Settings + panel layout
persist in localStorage.

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

- `index.html` — studio UI + CSS. Loads the scripts below as classic scripts.
- `src/dither-engine.js` — pure logic, exposes `window.DitherEngine`:
  `PALETTES` (incl. Truecolor 24-bit), `ALGORITHMS` (63 entries),
  `quantize()`, `paint()`, `medianCut()`, `traceSVG()`.
- `src/app.js` — UI wiring + render pipeline, exposes `window.DitherBuddy`
  (`state`, `render()`, …) for debugging and power users.

## Features

- **Viewfinder**: fixed frame (detail/pixel changes never resize it), Fit /
  1:1 / +/− buttons, scroll-to-zoom pinned at the cursor, drag to pan.
- **Dither layers**: snapshot the current dither + palette as a layer, blend
  with per-layer opacity, reorder, bypass, delete. SVG exports the base only.
- **Effects**: pre-dither and post-dither stacks with strength sliders,
  enable/disable, duplicate, reorder, delete.
- **Presets**: one-click styles, click again to undo (restores your setup).
- **Panels**: every panel drags by its ⠿⠿ grip to any column; the layout is
  remembered, along with all settings.

## Adding things

- **Algorithm**: add `{id, group, name}` to `ALGORITHMS` in the engine, then a
  branch in `quantize()` (threshold / error-diffusion) and, only if it needs
  shapes, a case in `paint()`. Flat dithers need no `paint()` change.
- **Palette**: append to `PALETTES` (`id`, `name`, hex `colors`).
- **Effect**: add a def to `PRE_DEFS` / `POST_DEFS` in `app.js` plus its case in
  `applyPreStack()` / `applyPostStack()`.
- **Preset**: append to `PRESETS` in `app.js`.

## License

MIT — see [LICENSE](LICENSE).
