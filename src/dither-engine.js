/* Dither Buddy engine — pure JS, no dependencies.
   Exposes window.DitherEngine = { PALETTES, ALGORITHMS, quantize, paint, medianCut, traceSVG }.
   quantize() works on ImageData at grid resolution.
   paint() draws cells to a 2d context (handles blocks, halftone shapes, ascii, etc). */
(function () {
'use strict';

// ---------------- utils ----------------
function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
}
function rgbToHex(r, g, b) {
  r=Math.max(0,Math.min(255,Math.round(r))); g=Math.max(0,Math.min(255,Math.round(g))); b=Math.max(0,Math.min(255,Math.round(b)));
  return '#' + ((1<<24)+(r<<16)+(g<<8)+b).toString(16).slice(1);
}
function lumOf(r, g, b) { return 0.2126*r + 0.7152*g + 0.0722*b; }
// fast deterministic hash noise in [0,1)
function hash2(x, y, s) {
  let h = (x*374761393 + y*668265263 + (s|0)*974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// interleaved gradient noise
function ign(x, y, t) {
  const v = ((x + y * 57 + (t|0) * 131) * 0.06711056) % 1;
  const f = v < 0 ? v + 1 : v;
  return (f * 52.9829189) % 1;
}

// ---------------- palettes ----------------
const PALETTES = [
  { id:'bw', name:'1-Bit B/W', colors:['#000000','#ffffff'] },
  { id:'sepia1', name:'1-Bit Sepia', colors:['#2b1d0e','#f5e6c8'] },
  { id:'gb', name:'Game Boy', colors:['#0f380f','#306230','#8bac0f','#9bbc0f'] },
  { id:'gblight', name:'Game Boy Light', colors:['#081820','#346856','#88c070','#e0f8d0'] },
  { id:'nokia', name:'Nokia 3310', colors:['#24311d','#c7d6a3'] },
  { id:'gray4', name:'Grayscale 4', colors:['#000000','#555555','#aaaaaa','#ffffff'] },
  { id:'gray8', name:'Grayscale 8', colors:['#000000','#242424','#484848','#6d6d6d','#929292','#b6b6b6','#dbdbdb','#ffffff'] },
  { id:'sepia8', name:'Sepia 8', colors:['#1a120b','#3b2a1a','#5d4426','#7d5f36','#9d7c4c','#bfa068','#dcc49a','#f7e8c9'] },
  { id:'pico8', name:'PICO-8', colors:['#000000','#1d2b53','#7e2553','#008751','#ab5236','#5f574f','#c2c3c7','#fff1e8','#ff004d','#ffa300','#ffec27','#00e436','#29adff','#83769c','#ff77a8','#ffccaa'] },
  { id:'sweetie16', name:'Sweetie 16', colors:['#1a1c2c','#5d275d','#b55088','#f4f4f4','#f4a259','#f7e0b3','#e8686b','#a3e635','#3ec1d3','#2d7dd2','#3b1f2b','#7a3b2e','#c9b458','#8a8b6c','#4b4b4b','#262626'] },
  { id:'endesga32', name:'Endesga 32', colors:['#be4a2f','#d77643','#ead4aa','#e4a672','#b86f50','#733e39','#3e2731','#a22633','#e43b44','#f77622','#feae34','#fee761','#63c74d','#3e8948','#265c42','#193c3e','#124e89','#0099db','#2ce8f5','#ffffff','#c0cbdc','#8b9bb4','#5a6988','#3a4466','#262b44','#181425','#ff0044','#ef3e36','#c32454','#7a2552','#5a2652','#3b1f4e'] },
  { id:'cga4', name:'CGA 4', colors:['#000000','#55ffff','#ff55ff','#ffffff'] },
  { id:'cga16', name:'CGA 16', colors:['#000000','#0000aa','#00aa00','#00aaaa','#aa0000','#aa00aa','#aa5500','#aaaaaa','#555555','#5555ff','#55ff55','#55ffff','#ff5555','#ff55ff','#ffff55','#ffffff'] },
  { id:'ega16', name:'EGA Night', colors:['#0b0b2a','#1f3fae','#0f6f4a','#0fa3a3','#a32a2a','#7a2aa3','#8a6d1f','#b8b8b8','#4a4a6a','#4a6aff','#2ae68a','#5ae6e6','#ff5a5a','#c86aff','#ffe45a','#ffffff'] },
  { id:'c64', name:'Commodore 64', colors:['#000000','#ffffff','#883932','#67b6bd','#8b3f96','#55a049','#40318d','#bfce72','#8b5429','#574200','#b8691b','#eeee99','#a3a3a3','#7b7b7b','#4b4b4b','#2b2b2b'] },
  { id:'zx', name:'ZX Spectrum', colors:['#000000','#0000d7','#d70000','#d700d7','#00d700','#00d7d7','#d7d700','#d7d7d7','#000000','#0000ff','#ff0000','#ff00ff','#00ff00','#00ffff','#ffff00','#ffffff'] },
  { id:'nes', name:'NES Warm', colors:['#000000','#fcfcfc','#f8f8f8','#bcbcbc','#7c7c7c','#a4e4fc','#3cbcfc','#0078f8','#0000fc','#b8b8f8','#6888fc','#0058f8','#0000bc','#d8b8f8','#9878f8','#6844fc','#3c00e4','#f8b8f8','#f878f8','#d800cc','#940084','#f8b8d8','#f878b8','#f83888','#f80078','#a80020','#f8d8b8','#f8b878','#f85818','#e45c10','#ac7c00','#503000'] },
  { id:'slso8', name:'SLSO 8', colors:['#0d2b45','#203c56','#544e68','#8d697a','#d08159','#ffaa5e','#ffd4a3','#ffecd6'] },
  { id:'paper', name:'Ink on Paper', colors:['#1a1611','#4a3f30','#8a7a64','#e8dcc3'] },
  { id:'cmyk', name:'CMYK Print', colors:['#000000','#00aeef','#ec008c','#fff200','#ffffff'] },
  { id:'mist', name:'Mist 6', colors:['#2d2a3a','#5a4a5a','#8a6a7a','#c49a8a','#e8c49a','#f8ecd8'] },
  { id:'custom', name:'Custom', colors:['#000000','#ffffff'] }
];

function paletteRGB(pal) { return pal.colors.map(hexToRgb); }

// nearest palette index (weighted RGB)
function nearestIdx(r, g, b, pal) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < pal.length; i++) {
    const c = pal[i];
    const dr = r - c[0], dg = g - c[1], db = b - c[2];
    const d = dr*dr*0.299 + dg*dg*0.587 + db*db*0.114;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// ---------------- bayer / threshold maps ----------------
function makeBayer(size) {
  let m = [[0,2],[3,1]];
  while (m.length < size) {
    const n = m.length, n2 = n*2, out = [];
    for (let y = 0; y < n2; y++) { out.push(new Array(n2)); }
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = m[y][x]*4;
      out[y][x] = v; out[y][x+n] = v+2; out[y+n][x] = v+3; out[y+n][x+n] = v+1;
    }
    m = out;
  }
  const div = size*size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) m[y][x] = (m[y][x]+0.5)/div - 0.5;
  return m;
}
const BAYER = { 2: makeBayer(2), 4: makeBayer(4), 8: makeBayer(8), 16: makeBayer(16) };
const CLUSTER4 = [[-0.47,-0.22,0.03,0.28],[0.16,-0.34,-0.09,0.41],[0.03,0.28,-0.47,-0.22],[-0.09,0.41,0.16,-0.34]];

// ---------------- error-diffusion kernels ----------------
// taps: [dx, dy, weight]; divisor in div
const KERNELS = {
  'ed-floyd':   { div:16, taps:[[1,0,7],[-1,1,3],[0,1,5],[1,1,1]] },
  'ed-false':   { div:8,  taps:[[1,0,3],[0,1,3],[1,1,2]] },
  'ed-atkinson':{ div:8,  taps:[[1,0,1],[2,0,1],[-2,1,1],[-1,1,1],[0,1,1],[1,1,1]] },
  'ed-jjn':     { div:48, taps:[[1,0,7],[2,0,5],[-2,1,3],[-1,1,5],[0,1,7],[1,1,5],[2,1,3],[-2,2,1],[-1,2,3],[0,2,5],[1,2,3],[2,2,1]] },
  'ed-stucki':  { div:42, taps:[[1,0,8],[2,0,4],[-2,1,2],[-1,1,4],[0,1,8],[1,1,4],[2,1,2],[-2,2,1],[-1,2,2],[0,2,4],[1,2,2],[2,2,1]] },
  'ed-burkes':  { div:32, taps:[[1,0,8],[2,0,4],[-2,1,2],[-1,1,4],[0,1,8],[1,1,4],[2,1,2]] },
  'ed-sierra':  { div:32, taps:[[1,0,5],[2,0,3],[-2,1,2],[-1,1,4],[0,1,5],[1,1,4],[2,1,2],[-1,2,2],[0,2,3],[1,2,2]] },
  'ed-sierra2': { div:16, taps:[[1,0,4],[2,0,3],[-2,1,1],[-1,1,2],[0,1,3],[1,1,2],[2,1,1]] },
  'ed-sierralite':{ div:4,taps:[[1,0,2],[-1,1,1],[0,1,1]] },
  'ed-sierrasingle':{ div:8,taps:[[1,0,5],[2,0,3]] },
  'ed-stevenson':{ div:200,taps:[[2,0,32],[-3,1,12],[-1,1,26],[1,1,30],[3,1,16],[-2,2,12],[0,2,26],[2,2,12],[-3,3,5],[3,3,5],[-1,3,5],[1,3,5]] },
  'ed-shiaufan':{ div:16, taps:[[1,0,8],[-1,1,2],[-2,1,1],[0,1,2],[1,1,1]] },
  'ed-shiaufan2':{ div:16,taps:[[1,0,7],[2,0,1],[-2,1,2],[-1,1,4],[0,1,4],[1,1,1]] },
  'ed-fan':     { div:16, taps:[[1,0,7],[-1,1,1],[0,1,3],[1,1,5]] },
  'ed-ostrom':  { div:98, taps:[[1,0,13],[2,0,3],[-2,1,4],[-1,1,9],[0,1,17],[1,1,9],[2,1,4],[-2,2,2],[-1,2,5],[0,2,9],[1,2,5],[2,2,2],[-1,3,2],[0,3,3],[1,3,2]] }
};

// ---------------- algorithm catalogue (63) ----------------
const ALGORITHMS = [
  // 15 error diffusion
  { id:'ed-floyd', group:'Error Diffusion', name:'Floyd–Steinberg' },
  { id:'ed-false', group:'Error Diffusion', name:'False Floyd–Steinberg' },
  { id:'ed-atkinson', group:'Error Diffusion', name:'Atkinson' },
  { id:'ed-jjn', group:'Error Diffusion', name:'Jarvis–Judice–Ninke' },
  { id:'ed-stucki', group:'Error Diffusion', name:'Stucki' },
  { id:'ed-burkes', group:'Error Diffusion', name:'Burkes' },
  { id:'ed-sierra', group:'Error Diffusion', name:'Sierra 3' },
  { id:'ed-sierra2', group:'Error Diffusion', name:'Sierra Two-Row' },
  { id:'ed-sierrasingle', group:'Error Diffusion', name:'Sierra Single-Row' },
  { id:'ed-sierralite', group:'Error Diffusion', name:'Sierra Lite' },
  { id:'ed-stevenson', group:'Error Diffusion', name:'Stevenson–Arce' },
  { id:'ed-shiaufan', group:'Error Diffusion', name:'Shiau–Fan' },
  { id:'ed-shiaufan2', group:'Error Diffusion', name:'Shiau–Fan 2' },
  { id:'ed-fan', group:'Error Diffusion', name:'Fan' },
  { id:'ed-ostrom', group:'Error Diffusion', name:'Ostromoukhov' },
  // 5 ordered
  { id:'ord-bayer2', group:'Ordered', name:'Bayer 2×2' },
  { id:'ord-bayer4', group:'Ordered', name:'Bayer 4×4' },
  { id:'ord-bayer8', group:'Ordered', name:'Bayer 8×8' },
  { id:'ord-bayer16', group:'Ordered', name:'Bayer 16×16' },
  { id:'ord-cluster', group:'Ordered', name:'Clustered Dot' },
  // 8 pattern
  { id:'pat-checker', group:'Pattern', name:'Checkerboard' },
  { id:'pat-hlines', group:'Pattern', name:'Horizontal Lines' },
  { id:'pat-vlines', group:'Pattern', name:'Vertical Lines' },
  { id:'pat-diag', group:'Pattern', name:'Diagonal Weave' },
  { id:'pat-cross', group:'Pattern', name:'Crosshatch' },
  { id:'pat-diamond', group:'Pattern', name:'Diamonds' },
  { id:'pat-dots', group:'Pattern', name:'Dot Grid' },
  { id:'pat-waves', group:'Pattern', name:'Waves' },
  // 17 glitch
  { id:'gli-slice', group:'Glitch', name:'Slice Shift' },
  { id:'gli-blocks', group:'Glitch', name:'Block Swap' },
  { id:'gli-rows', group:'Glitch', name:'Row Drift' },
  { id:'gli-cols', group:'Glitch', name:'Column Drift' },
  { id:'gli-tear', group:'Glitch', name:'Screen Tear' },
  { id:'gli-stutter', group:'Glitch', name:'Frame Stutter' },
  { id:'gli-mirror', group:'Glitch', name:'Mirror Slice' },
  { id:'gli-echo', group:'Glitch', name:'Echo Trail' },
  { id:'gli-bit', group:'Glitch', name:'Bit Crush' },
  { id:'gli-quant', group:'Glitch', name:'Coarse Quant' },
  { id:'gli-hue', group:'Glitch', name:'Hue Slice' },
  { id:'gli-noise', group:'Glitch', name:'Noise Slice' },
  { id:'gli-moshing', group:'Glitch', name:'Data Mosh' },
  { id:'gli-vhs', group:'Glitch', name:'VHS Tracking' },
  { id:'gli-sort', group:'Glitch', name:'Pixel Sort' },
  { id:'gli-rain', group:'Glitch', name:'Signal Rain' },
  { id:'gli-jpeg', group:'Glitch', name:'JPEG Rot' },
  // 16 special
  { id:'spc-halfdot', group:'Special', name:'Halftone Dots' },
  { id:'spc-halflines', group:'Special', name:'Halftone Lines' },
  { id:'spc-halfcross', group:'Special', name:'Halftone Cross' },
  { id:'spc-cmyk', group:'Special', name:'CMYK Halftone' },
  { id:'spc-rosette', group:'Special', name:'Print Rosette' },
  { id:'spc-ascii', group:'Special', name:'ASCII Text' },
  { id:'spc-blocks', group:'Special', name:'Mosaic Blocks' },
  { id:'spc-stitch', group:'Special', name:'Cross-Stitch' },
  { id:'spc-knit', group:'Special', name:'Knit Weave' },
  { id:'spc-edge', group:'Special', name:'Edge Trace' },
  { id:'spc-bluenoise', group:'Special', name:'Blue Noise' },
  { id:'spc-ign', group:'Special', name:'Gradient Noise' },
  { id:'spc-glow', group:'Special', name:'Epsilon Glow' },
  { id:'spc-threshold', group:'Special', name:'Clean Threshold' },
  { id:'spc-tritone', group:'Special', name:'Tri-Tone Map' },
  { id:'spc-poster', group:'Special', name:'Poster + Grain' },
  // 2 custom
  { id:'custom-kernel', group:'Custom', name:'Custom Kernel' },
  { id:'custom-bayer', group:'Custom', name:'Custom Matrix' }
];

function patternThreshold(algo, x, y, t) {
  const ox = (t * 7) | 0, oy = (t * 3) | 0;
  const X = x + ox, Y = y + oy;
  switch (algo) {
    case 'pat-checker': return ((X + Y) & 1) ? 0.25 : -0.25;
    case 'pat-hlines': return (Y % 3 === 0) ? 0.3 : -0.15;
    case 'pat-vlines': return (X % 3 === 0) ? 0.3 : -0.15;
    case 'pat-diag': return (((X + Y) % 4) < 2) ? 0.22 : -0.22;
    case 'pat-cross': return ((((X % 4) < 2) !== ((Y % 4) < 2))) ? 0.24 : -0.24;
    case 'pat-diamond': { const dx = Math.abs((X % 8) - 4), dy = Math.abs((Y % 8) - 4); return (dx + dy < 4) ? 0.25 : -0.25; }
    case 'pat-dots': { const dx = (X % 4) - 1.5, dy = (Y % 4) - 1.5; return (dx*dx + dy*dy < 3.2) ? 0.28 : -0.2; }
    case 'pat-waves': return Math.sin((X * 0.9 + Math.sin(Y * 0.5) * 2)) * 0.3;
    default: return 0;
  }
}

// glitch displacement: returns source coords to sample for pixel (x,y)
function glitchSample(algo, x, y, w, h, amt, t, seed) {
  const a = amt; // 0..1
  switch (algo) {
    case 'gli-slice': { const band = 8 + ((hash2(0, (y / 24)|0, seed) * 40)|0); const yy = ((y / band)|0); const sh = (hash2(yy, 7, seed + (t|0)) - 0.5) * w * 0.35 * a; return [x + sh, y]; }
    case 'gli-blocks': { const bw = 32, bh = 24; const bx = (x/bw)|0, by=(y/bh)|0; if (hash2(bx,by,seed+(t|0)) < 0.18*a+0.02) return [((bx + ((hash2(by,bx,seed)*5)|0)) % Math.max(1,(w/bw)|0))*bw + (x%bw), y]; return [x,y]; }
    case 'gli-rows': return [x + Math.sin(y*0.11 + t*3 + seed) * 14 * a, y];
    case 'gli-cols': return [x, y + Math.sin(x*0.09 - t*2 + seed) * 12 * a];
    case 'gli-tear': { const ty = (h*0.5 + Math.sin(t*1.7+seed)*h*0.3)|0; if (Math.abs(y-ty) < 3+8*a) return [x + (y>ty?1:-1) * w*0.12*a, y]; return [x,y]; }
    case 'gli-stutter': { const f = Math.max(1, (8*(1-a))|0); return [x, ((y/f)|0)*f]; }
    case 'gli-mirror': { const band = 16; const yy=(y/band)|0; if (yy%2===1) return [(yy*band + (band-1-(y%band))), y]; return [x,y]; }
    case 'gli-echo': return [x - 6*a - 4*a*Math.sin(t*4), y];
    case 'gli-vhs': { const n = hash2(0,y,seed+(t|0)); return [x + (n-0.5)*30*a + Math.sin(t*9)*4*a, y + (n>0.985*a? (hash2(1,y,seed)*8-4):0)]; }
    case 'gli-rain': return [x + (hash2(x>>1, y>>2, seed + ((t*30)|0)) - 0.5) * 10 * a, y];
    default: return [x, y];
  }
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// ---------------- main quantize ----------------
// src: ImageData (grid res). opts: { strength 0..1.5, serpentine, time, glitch 0..1, kernel (custom), bayerSize, seed }
function quantize(src, w, h, algo, pal, opts) {
  opts = opts || {};
  const strength = opts.strength == null ? 1 : opts.strength;
  const serp = opts.serpentine !== false;
  const t = opts.time || 0;
  const gAmt = opts.glitch == null ? 0.6 : opts.glitch;
  const seed = opts.seed || 1;
  const d = src.data;
  const idx = new Uint16Array(w*h);
  const cov = new Float32Array(w*h); // coverage 0..1 (darkness) for shape renderers
  const pl = pal;

  // helper: read pixel with glitch displacement
  function readPx(x, y, isGlitch) {
    let sx = x, sy = y;
    if (isGlitch) { const s = glitchSample(algo, x, y, w, h, gAmt, t, seed); sx = s[0]; sy = s[1]; }
    sx = clamp(Math.round(sx), 0, w-1); sy = clamp(Math.round(sy), 0, h-1);
    const o = (sy*w+sx)*4;
    return [d[o], d[o+1], d[o+2]];
  }

  const isED = algo.indexOf('ed-') === 0 || algo === 'custom-kernel';
  const isOrdered = algo.indexOf('ord-') === 0 || algo === 'custom-bayer';
  const isPattern = algo.indexOf('pat-') === 0;
  const isGlitch = algo.indexOf('gli-') === 0;

  if (isED) {
    let kernel = KERNELS[algo];
    if (algo === 'custom-kernel' && opts.kernel) kernel = opts.kernel;
    if (!kernel) kernel = KERNELS['ed-floyd'];
    // float buffers
    const buf = new Float32Array(d); // copy RGBA as floats (alpha ignored in math)
    // bias for temporal shimmer
    const tbias = (t % 1) * 6 - 3;
    for (let y = 0; y < h; y++) {
      const ltr = !(serp && (y & 1));
      for (let xi = 0; xi < w; xi++) {
        const x = ltr ? xi : (w - 1 - xi);
        const o = (y*w+x)*4;
        let r = buf[o], g = buf[o+1], b = buf[o+2];
        if (t !== 0) { const nb = (hash2(x, y, (t*60)|0) - 0.5) * 6 * Math.min(1, Math.abs(tbias)/3 + 0.15); r += nb; g += nb; b += nb; }
        const qi = nearestIdx(r, g, b, pl);
        idx[y*w+x] = qi;
        const q = pl[qi];
        cov[y*w+x] = 1 - (lumOf(r,g,b)/255);
        const er = (r - q[0]) * strength, eg = (g - q[1]) * strength, eb = (b - q[2]) * strength;
        if (er === 0 && eg === 0 && eb === 0) continue;
        for (let k = 0; k < kernel.taps.length; k++) {
          const tp = kernel.taps[k];
          let dx = tp[0]; const dy = tp[1]; const wt = tp[2]/kernel.div;
          if (!ltr) dx = -dx;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const no = (ny*w+nx)*4;
          buf[no] += er*wt; buf[no+1] += eg*wt; buf[no+2] += eb*wt;
        }
      }
    }
    return { idx: idx, cov: cov, w: w, h: h };
  }

  // threshold-based (ordered / pattern / glitch / special-flat)
  let bayer = null, bsize = 4;
  if (algo === 'ord-bayer2') { bayer = BAYER[2]; bsize = 2; }
  else if (algo === 'ord-bayer4') { bayer = BAYER[4]; bsize = 4; }
  else if (algo === 'ord-bayer8') { bayer = BAYER[8]; bsize = 8; }
  else if (algo === 'ord-bayer16') { bayer = BAYER[16]; bsize = 16; }
  else if (algo === 'ord-cluster') { bayer = CLUSTER4; bsize = 4; }
  else if (algo === 'custom-bayer') { const s = opts.bayerSize || 8; bayer = BAYER[s]; bsize = s; }

  const spread = 90 * strength; // threshold spread in 0..255
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = readPx(x, y, isGlitch);
      let r = c[0], g = c[1], b = c[2];
      let th = 0;
      if (bayer) {
        const ox = ((x + ((t*7)|0)) % bsize + bsize) % bsize;
        const oy = ((y + ((t*3)|0)) % bsize + bsize) % bsize;
        th = bayer[oy][ox];
      } else if (isPattern) {
        th = patternThreshold(algo, x, y, t);
      } else if (algo === 'spc-bluenoise') {
        th = hash2(x, y, 77) - 0.5 + (ign(x, y, 0) - 0.5) * 0.4;
      } else if (algo === 'spc-ign') {
        th = ign(x, y, t*2) - 0.5;
      } else if (algo === 'spc-threshold' || algo === 'spc-tritone' || algo === 'spc-poster') {
        th = 0;
      } else if (algo === 'gli-hue') {
        th = Math.sin(x*0.05 + t*2) * 0.3;
        const hsvShift = 40 * gAmt * Math.sin(y*0.07 + t);
        r = clamp(r + hsvShift, 0, 255); b = clamp(b - hsvShift, 0, 255);
      } else if (algo === 'gli-noise') {
        th = (hash2(x, y, seed + ((t*7)|0)) - 0.5) * 1.4;
      } else if (algo === 'gli-rain') {
        th = (hash2(x>>1, (y + ((t*30)|0))>>2, seed) - 0.5) * 1.2;
      } else if (algo === 'gli-bit' || algo === 'gli-quant') {
        const bits = algo === 'gli-bit' ? (8 - Math.round(gAmt*6)) : 3;
        const lv = Math.max(2, bits);
        r = Math.round(r/255*lv)*255/lv; g = Math.round(g/255*lv)*255/lv; b = Math.round(b/255*lv)*255/lv;
        th = (bayer ? 0 : (hash2(x,y,9)-0.5)) * 0.6;
        if (!bayer) { const m2 = BAYER[4]; th = m2[y&3][x&3]*0.8; }
      } else if (algo === 'gli-sort') {
        // horizontal sort-ish: quantize rows by block luminance
        const bx = (x>>3)<<3;
        let acc = 0; const n = Math.min(8, w-bx);
        for (let k = 0; k < n; k++) { const o2 = (y*w+bx+k)*4; acc += lumOf(d[o2],d[o2+1],d[o2+2]); }
        const avg = acc/n;
        const l = lumOf(r,g,b);
        th = ((l > avg ? 1 : -1) * 0.18 * gAmt) + (BAYER[4][y&3][x&3]*0.5);
      } else if (algo === 'gli-echo') {
        const s2 = glitchSample(algo, x, y, w, h, gAmt, t, seed);
        const sx2 = clamp(Math.round(s2[0]),0,w-1), sy2 = clamp(Math.round(s2[1]),0,h-1);
        const o2 = (sy2*w+sx2)*4;
        r = (r + d[o2]*0.6)/1.6; g = (g + d[o2+1]*0.6)/1.6; b = (b + d[o2+2]*0.6)/1.6;
        th = BAYER[4][y&3][x&3]*0.7;
      } else if (algo === 'gli-moshing' || algo === 'gli-jpeg' || algo === 'gli-stutter') {
        th = BAYER[4][y&3][x&3]*0.8;
      } else {
        th = BAYER[4][y&3][x&3]*0.7;
      }
      // special hue slice for gli-hue already handled; jpeg rot adds block posterize
      if (algo === 'gli-jpeg') {
        const q = 24 + (1-gAmt)*40;
        r = Math.round(r/q)*q; g = Math.round(g/q)*q; b = Math.round(b/q)*q;
      }
      const jx = th * spread;
      // edge trace overrides palette mapping
      if (algo === 'spc-edge') {
        const x2 = Math.min(w-1, x+1), y2 = Math.min(h-1, y+1);
        const oA = (y*w+x)*4, oB = (y*w+x2)*4, oC = (y2*w+x)*4;
        const gx = lumOf(d[oB],d[oB+1],d[oB+2]) - lumOf(d[oA],d[oA+1],d[oA+2]);
        const gy = lumOf(d[oC],d[oC+1],d[oC+2]) - lumOf(d[oA],d[oA+1],d[oA+2]);
        const mag = Math.sqrt(gx*gx+gy*gy);
        const on = mag > (60 - strength*45);
        idx[y*w+x] = on ? 0 : (pl.length - 1);
        cov[y*w+x] = on ? 1 : 0;
        continue;
      }
      if (algo === 'spc-tritone' && pl.length >= 3) {
        const l = lumOf(r,g,b)/255 + jx/255;
        idx[y*w+x] = l < 0.33 ? 0 : l < 0.66 ? Math.min(1, pl.length-2) : pl.length-1;
        cov[y*w+x] = 1 - lumOf(r,g,b)/255;
        continue;
      }
      const qi = nearestIdx(r + jx, g + jx, b + jx, pl);
      idx[y*w+x] = qi;
      cov[y*w+x] = 1 - (lumOf(r,g,b)/255);
    }
  }
  return { idx: idx, cov: cov, w: w, h: h };
}

// ---------------- paint ----------------
const ASCII_RAMP = ' .:-=+*#%@';
function paint(ctx, grid, w, h, cell, algo, pal, opts) {
  opts = opts || {};
  const W = w*cell, H = h*cell;
  const palCss = pal.colors;
  const plen = palCss.length;
  const ink = palCss[0], paper = palCss[palCss.length-1];
  ctx.clearRect(0, 0, W, H);

  function blockFill() {
    // fast path: write grid-res pixels via LUT, then upscale in one drawImage
    let off = paint._off;
    if (!off) { off = document.createElement('canvas'); paint._off = off; }
    if (off.width !== w || off.height !== h) { off.width = w; off.height = h; }
    const octx = off.getContext('2d');
    const img = octx.createImageData(w, h);
    const px = img.data;
    const lut = new Uint8Array(plen * 3);
    for (let i = 0; i < plen; i++) {
      const c = hexToRgb(palCss[i % palCss.length]);
      lut[i*3] = c[0]; lut[i*3+1] = c[1]; lut[i*3+2] = c[2];
    }
    for (let i = 0, n = w*h; i < n; i++) {
      const v = grid.idx[i] % plen, o = i*4;
      px[o] = lut[v*3]; px[o+1] = lut[v*3+1]; px[o+2] = lut[v*3+2]; px[o+3] = 255;
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, w, h, 0, 0, W, H);
  }

  switch (algo) {
    case 'spc-halfdot':
    case 'spc-cmyk':
    case 'spc-rosette': {
      ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H);
      const lum = grid.cov;
      const paths = new Map();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = lum[y*w+x];
        if (c <= 0.02) continue;
        const i = grid.idx[y*w+x] % plen;
        let p = paths.get(i);
        if (!p) { p = new Path2D(); paths.set(i, p); }
        p.moveTo(x*cell + cell/2 + Math.sqrt(c)*cell*0.72, y*cell + cell/2);
        p.arc(x*cell + cell/2, y*cell + cell/2, Math.max(0.3, Math.sqrt(c)*cell*0.72), 0, 6.2832);
      }
      paths.forEach((p, i) => { ctx.fillStyle = palCss[i]; ctx.fill(p); });
      return;
    }
    case 'spc-halflines': {
      ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H);
      const paths = new Map();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = grid.cov[y*w+x];
        if (c <= 0.03) continue;
        const i = grid.idx[y*w+x] % plen;
        let p = paths.get(i);
        if (!p) { p = new Path2D(); paths.set(i, p); }
        const th2 = c * cell;
        p.rect(x*cell, y*cell + (cell-th2)/2, cell, th2);
      }
      paths.forEach((p, i) => { ctx.fillStyle = palCss[i]; ctx.fill(p); });
      return;
    }
    case 'spc-halfcross': {
      ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H);
      const paths = new Map();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = grid.cov[y*w+x];
        if (c <= 0.05) continue;
        const i = grid.idx[y*w+x] % plen;
        let p = paths.get(i);
        if (!p) { p = new Path2D(); paths.set(i, p); }
        const t2 = Math.max(0.6, c*cell*0.5);
        p.rect(x*cell, y*cell+cell/2-t2/2, cell, t2);
        p.rect(x*cell+cell/2-t2/2, y*cell, t2, cell);
      }
      paths.forEach((p, i) => { ctx.fillStyle = palCss[i]; ctx.fill(p); });
      return;
    }
    case 'spc-ascii': {
      ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H);
      // sprite cache: prerender each (glyph x color) once, then stamp with drawImage
      const palSig = palCss.join(',');
      let cache = paint._ascii;
      if (!cache || cache.cell !== cell || cache.sig !== palSig) {
        cache = { cell: cell, sig: palSig, sprites: new Map() };
        paint._ascii = cache;
      }
      const getSprite = (ch, ci) => {
        const key = ch + '|' + ci;
        let s = cache.sprites.get(key);
        if (!s) {
          s = document.createElement('canvas'); s.width = s.height = Math.max(1, cell);
          const g = s.getContext('2d');
          g.font = cell + 'px ui-monospace, Menlo, Consolas, monospace';
          g.textBaseline = 'top';
          g.fillStyle = palCss[ci];
          g.fillText(ch, 0, 0);
          cache.sprites.set(key, s);
        }
        return s;
      };
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = grid.cov[y*w+x];
        if (c <= 0.02) continue;
        const ch = ASCII_RAMP[Math.min(ASCII_RAMP.length-1, (c*ASCII_RAMP.length)|0)];
        ctx.drawImage(getSprite(ch, grid.idx[y*w+x] % plen), x*cell, y*cell);
      }
      return;
    }
    case 'spc-blocks': {
      for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
        // average the 2x2
        let r=0,g=0,b=0,n=0;
        for (let dy=0;dy<2;dy++) for (let dx=0;dx<2;dx++) {
          const xx=x+dx, yy=y+dy; if (xx>=w||yy>=h) continue;
          const cc = hexToRgb(palCss[grid.idx[yy*w+xx] % palCss.length]); r+=cc[0];g+=cc[1];b+=cc[2];n++;
        }
        ctx.fillStyle = rgbToHex(r/n,g/n,b/n);
        ctx.fillRect(x*cell, y*cell, cell*2, cell*2);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
        ctx.strokeRect(x*cell+0.5, y*cell+0.5, cell*2-1, cell*2-1);
      }
      return;
    }
    case 'spc-stitch': {
      ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H);
      const paths = new Map();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = grid.idx[y*w+x] % plen;
        let p = paths.get(i);
        if (!p) { p = new Path2D(); paths.set(i, p); }
        p.moveTo(x*cell+1, y*cell+1); p.lineTo((x+1)*cell-1, (y+1)*cell-1);
        p.moveTo((x+1)*cell-1, y*cell+1); p.lineTo(x*cell+1, (y+1)*cell-1);
      }
      ctx.lineWidth = Math.max(1, cell*0.22);
      paths.forEach((p, i) => { ctx.strokeStyle = palCss[i]; ctx.stroke(p); });
      return;
    }
    case 'spc-knit': {
      ctx.fillStyle = paper; ctx.fillRect(0, 0, W, H);
      const paths = new Map();
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = grid.cov[y*w+x];
        const i = grid.idx[y*w+x] % plen;
        let p = paths.get(i);
        if (!p) { p = new Path2D(); paths.set(i, p); }
        // axis-aligned only (rotated ellipses hit a very slow path in canvas);
        // alternate radii to suggest a knit weave
        const flip = ((x + y) & 1) === 0;
        const rx = (flip ? cell * (0.4 + 0.6*c) : cell * 0.64) / 2;
        const ry = (flip ? cell * 0.64 : cell * (0.4 + 0.6*c)) / 2;
        p.moveTo(x*cell+cell/2 + rx, y*cell+cell/2);
        p.ellipse(x*cell+cell/2, y*cell+cell/2, Math.max(0.4, rx), Math.max(0.4, ry), 0, 0, 6.2832);
      }
      paths.forEach((p, i) => { ctx.fillStyle = palCss[i]; ctx.fill(p); });
      return;
    }
    case 'spc-glow': {
      blockFill();
      // single blurred screen-blend pass — the "epsilon glow"
      const src = ctx.canvas;
      const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
      tmp.getContext('2d').drawImage(src, 0, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.65;
      try { ctx.filter = 'blur(' + Math.max(2, Math.round(cell*1.6)) + 'px) brightness(1.25)'; } catch (e) {}
      ctx.drawImage(tmp, 0, 0);
      ctx.restore();
      return;
    }
    case 'spc-poster': {
      blockFill();
      // grain
      const n = (w*h/40)|0;
      ctx.fillStyle = ink;
      for (let i = 0; i < n; i++) {
        const x = (hash2(i, 3, 5)*W)|0, y = (hash2(i, 9, 11)*H)|0;
        ctx.globalAlpha = 0.12;
        ctx.fillRect(x, y, Math.max(1,cell>>2), Math.max(1,cell>>2));
      }
      ctx.globalAlpha = 1;
      return;
    }
    default:
      blockFill();
  }
}

// ---------------- median-cut palette extraction ----------------
function medianCut(data, w, h, n) {
  const px = [];
  const step = Math.max(1, ((w*h/4000)|0));
  for (let i = 0; i < w*h; i += step) {
    const o = i*4;
    px.push([data[o], data[o+1], data[o+2]]);
  }
  let boxes = [px];
  while (boxes.length < n) {
    let bi = -1, best = -1;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.length < 2) continue;
      let r0=255,r1=0,g0=255,g1=0,b0=255,b1=0;
      for (const p of b) { if(p[0]<r0)r0=p[0]; if(p[0]>r1)r1=p[0]; if(p[1]<g0)g0=p[1]; if(p[1]>g1)g1=p[1]; if(p[2]<b0)b0=p[2]; if(p[2]>b1)b1=p[2]; }
      const rg = Math.max(r1-r0, g1-g0, b1-b0);
      if (rg > best) { best = rg; bi = i; }
    }
    if (bi < 0) break;
    const box = boxes[bi];
    let r0=255,r1=0,g0=255,g1=0,b0=255,b1=0;
    for (const p of box) { if(p[0]<r0)r0=p[0]; if(p[0]>r1)r1=p[0]; if(p[1]<g0)g0=p[1]; if(p[1]>g1)g1=p[1]; if(p[2]<b0)b0=p[2]; if(p[2]>b1)b1=p[2]; }
    const ch = (r1-r0 >= g1-g0 && r1-r0 >= b1-b0) ? 0 : (g1-g0 >= b1-b0 ? 1 : 2);
    box.sort((a,b2)=>a[ch]-b2[ch]);
    const mid = box.length>>1;
    boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes.map(b => {
    if (!b.length) return '#000000';
    let r=0,g=0,bl=0;
    for (const p of b) { r+=p[0]; g+=p[1]; bl+=p[2]; }
    return rgbToHex(r/b.length, g/b.length, bl/b.length);
  });
}

// ---------------- SVG trace (run-length rects) ----------------
function traceSVG(grid, w, h, cell, pal, shape) {
  shape = shape || 'rect';
  const cols = pal.colors;
  const key = (v) => v;
  let s = '';
  if (shape === 'circle') {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = grid.cov[y*w+x];
      if (c <= 0.03) continue;
      const rr = (Math.sqrt(c)*cell*0.72).toFixed(2);
      s += '<circle cx="' + (x*cell+cell/2).toFixed(1) + '" cy="' + (y*cell+cell/2).toFixed(1) + '" r="' + rr + '" fill="' + cols[grid.idx[y*w+x]%cols.length] + '"/>';
    }
  } else {
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        const v = grid.idx[y*w+x];
        let x2 = x+1;
        while (x2 < w && grid.idx[y*w+x2] === v) x2++;
        s += '<rect x="' + (x*cell) + '" y="' + (y*cell) + '" width="' + ((x2-x)*cell) + '" height="' + cell + '" fill="' + cols[v%cols.length] + '"/>';
        x = x2;
      }
    }
  }
  const W = w*cell, H = h*cell;
  const bg = (shape === 'circle') ? '<rect width="' + W + '" height="' + H + '" fill="' + cols[cols.length-1] + '"/>' : '';
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' + bg + s + '</svg>';
}

window.DitherEngine = {
  PALETTES: PALETTES,
  ALGORITHMS: ALGORITHMS,
  KERNELS: KERNELS,
  BAYER: BAYER,
  hexToRgb: hexToRgb,
  rgbToHex: rgbToHex,
  paletteRGB: paletteRGB,
  quantize: quantize,
  paint: paint,
  medianCut: medianCut,
  traceSVG: traceSVG
};
})();
