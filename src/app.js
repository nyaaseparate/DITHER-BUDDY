/* Dither Buddy app — UI wiring + render pipeline. Classic script, needs window.DitherEngine. */
(function () {
'use strict';
const E = window.DitherEngine;
const $ = (id) => document.getElementById(id);

// ---------------- state ----------------
const state = {
  algo: 'ed-floyd',
  paletteId: 'pico8',
  customColors: ['#000000', '#ff004d', '#ffa300', '#00e436', '#29adff', '#fff1e8'],
  detail: 300,        // grid width for preview
  cell: 3,            // output cell size px
  strength: 1.0,
  serpentine: true,
  glitch: 0.6,
  temporal: true,
  time: 0,
  seed: 7,
  qBright: 0, qContr: 0, qSat: 100,
  preStack: [],
  postStack: [],
  kernelText: '0 0 0\n0 0 7\n3 5 1',
  kernelDiv: 16,
  bayerSize: 8,
  extractCount: 8,
  zoom: 'fit',
  comparing: false,
  exportSize: 'preview',
  srcKind: null, // 'image' | 'video'
  srcW: 0, srcH: 0
};
let uidc = 1;

// ---------------- sources ----------------
const imgEl = new Image();
imgEl.crossOrigin = 'anonymous';
const vidEl = document.createElement('video');
vidEl.muted = true; vidEl.loop = true; vidEl.playsInline = true; vidEl.crossOrigin = 'anonymous';
let sourceReady = false;
let imgURL = null;

function setImageSource(url, w, h) {
  if (imgURL) URL.revokeObjectURL(imgURL);
  imgURL = null;
  state.srcKind = 'image';
  imgEl.onload = () => {
    state.srcW = imgEl.naturalWidth; state.srcH = imgEl.naturalHeight;
    sourceReady = true; onNewSource();
  };
  imgEl.onerror = () => { toast('Could not load that image'); };
  imgEl.src = url;
}
function setVideoSource(url) {
  state.srcKind = 'video';
  vidEl.onloadedmetadata = () => {
    state.srcW = vidEl.videoWidth; state.srcH = vidEl.videoHeight;
    sourceReady = true; onNewSource();
    vidEl.play().catch(() => {});
  };
  vidEl.onerror = () => { toast('Could not load that video'); };
  vidEl.src = url;
}
function onNewSource() {
  $('emptyState').hidden = true;
  $('stageWrap').hidden = false;
  const isV = state.srcKind === 'video';
  $('timelineWrap').hidden = !isV;
  $('vidBadge').hidden = !isV;
  updateFileInfo();
  stopAnimLoop();
  state.time = 0;
  if (isV || state.temporal) startAnimLoop();
  requestRender();
}
function updateFileInfo() {
  const t = state.srcKind === 'video' ? 'video' : 'image';
  $('fileInfo').textContent = t + ' ' + state.srcW + ' x ' + state.srcH + ' px';
}

// procedural samples (always work offline)
function procedural(kind) {
  const c = document.createElement('canvas'); c.width = 640; c.height = 480;
  const x = c.getContext('2d');
  if (kind === 'gradient') {
    const g = x.createLinearGradient(0, 0, 640, 480);
    g.addColorStop(0, '#ff004d'); g.addColorStop(0.5, '#7e2553'); g.addColorStop(1, '#00e436');
    x.fillStyle = g; x.fillRect(0, 0, 640, 480);
    const rg = x.createRadialGradient(320, 240, 20, 320, 240, 300);
    rg.addColorStop(0, 'rgba(255,255,255,0.95)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = rg; x.fillRect(0, 0, 640, 480);
    x.fillStyle = '#111';
    for (let i = 0; i < 5; i++) { x.beginPath(); x.arc(80 + i*120, 380 - (i%2)*120, 34, 0, 7); x.fill(); }
  } else {
    x.fillStyle = '#1d2b53'; x.fillRect(0, 0, 640, 480);
    const cols = ['#ff004d','#ffa300','#ffec27','#00e436','#29adff','#83769c','#ff77a8'];
    for (let i = 0; i < 90; i++) {
      x.fillStyle = cols[i % cols.length];
      const r = 12 + E.hexToRgb('#000000') && ((i * 37) % 42);
      x.beginPath(); x.arc((i*97) % 640, (i*61) % 480, r, 0, 7); x.fill();
    }
    x.fillStyle = '#fff1e8';
    x.font = 'bold 120px monospace'; x.textAlign = 'center';
    x.fillText('Aa!', 320, 260);
  }
  state.srcKind = 'image';
  state.srcW = 640; state.srcH = 480;
  const url = c.toDataURL('image/png');
  imgEl.onload = () => { sourceReady = true; onNewSource(); };
  imgEl.src = url;
}

// ---------------- canvases ----------------
const gridC = document.createElement('canvas');   // working grid (pre+dither input)
const stage = () => $('stageCanvas');
function gridSize() {
  const gw = state.detail;
  const gh = Math.max(1, Math.round(gw * state.srcH / Math.max(1, state.srcW)));
  return [gw, gh];
}

// ---------------- palettes ----------------
function activePalette() {
  if (state.paletteId === 'custom') return { id: 'custom', name: 'Custom', colors: state.customColors.slice() };
  if (state.paletteId === 'extracted') return { id: 'extracted', name: 'Extracted', colors: extractedColors.slice() };
  return E.PALETTES.find(p => p.id === state.paletteId) || E.PALETTES[0];
}
let extractedColors = ['#000000', '#ffffff'];
function renderPaletteGrid() {
  const g = $('paletteGrid'); g.innerHTML = '';
  const mk = (pal) => {
    const b = document.createElement('button');
    b.className = 'pal' + (state.paletteId === pal.id ? ' sel' : '');
    b.title = pal.name + ' (' + pal.colors.length + ')';
    const sw = document.createElement('span'); sw.className = 'swatches';
    pal.colors.slice(0, 12).forEach(c => {
      const s = document.createElement('i'); s.style.background = c; sw.appendChild(s);
    });
    const n = document.createElement('span'); n.className = 'palname'; n.textContent = pal.name;
    b.appendChild(sw); b.appendChild(n);
    b.onclick = () => { state.paletteId = pal.id; renderPaletteGrid(); renderCustomEditor(); requestRender(); };
    return b;
  };
  E.PALETTES.filter(p => p.id !== 'custom').forEach(p => g.appendChild(mk(p)));
  g.appendChild(mk({ id: 'custom', name: 'Custom (' + state.customColors.length + ')', colors: state.customColors }));
  if (extractedColors.length > 2 || state.paletteId === 'extracted')
    g.appendChild(mk({ id: 'extracted', name: 'Extracted (' + extractedColors.length + ')', colors: extractedColors }));
}
function renderCustomEditor() {
  const w = $('customWrap'); w.hidden = state.paletteId !== 'custom';
  const list = $('customList'); list.innerHTML = '';
  state.customColors.forEach((c, i) => {
    const row = document.createElement('div'); row.className = 'crow';
    const inp = document.createElement('input');
    inp.type = 'color'; inp.value = c;
    inp.oninput = () => { state.customColors[i] = inp.value; renderPaletteGrid(); requestRender(); };
    const hex = document.createElement('span'); hex.className = 'chex'; hex.textContent = c;
    inp.onchange = () => { hex.textContent = inp.value; };
    const del = document.createElement('button'); del.className = 'mini danger'; del.textContent = 'x';
    del.onclick = () => { if (state.customColors.length > 2) { state.customColors.splice(i, 1); renderCustomEditor(); renderPaletteGrid(); requestRender(); } };
    row.appendChild(inp); row.appendChild(hex); row.appendChild(del);
    list.appendChild(row);
  });
}

// ---------------- algorithms ----------------
function renderAlgoList(filter) {
  const list = $('algoList'); list.innerHTML = '';
  const f = (filter || '').toLowerCase();
  let lastGroup = null;
  E.ALGORITHMS.forEach(a => {
    if (f && a.name.toLowerCase().indexOf(f) < 0 && a.group.toLowerCase().indexOf(f) < 0 && a.id.indexOf(f) < 0) return;
    if (a.group !== lastGroup) {
      lastGroup = a.group;
      const h = document.createElement('div'); h.className = 'agroup'; h.textContent = a.group;
      list.appendChild(h);
    }
    const b = document.createElement('button');
    b.className = 'algo' + (state.algo === a.id ? ' sel' : '');
    b.textContent = a.name;
    b.onclick = () => { state.algo = a.id; ensureSaneCellForAlgo(); renderAlgoList($('algoSearch').value); updateAlgoPanel(); requestRender(); };
    list.appendChild(b);
  });
}
function ensureSaneCellForAlgo() {
  if (state.algo === 'spc-ascii' && state.cell < 6) {
    state.cell = 8;
    $('cellRange').value = 8; $('cellVal').textContent = '8px';
  }
}
function updateAlgoPanel() {
  const a = E.ALGORITHMS.find(x => x.id === state.algo);
  $('algoName').textContent = a ? a.name : state.algo;
  $('algoCount').textContent = E.ALGORITHMS.length + ' algorithms';
  const isED = state.algo.indexOf('ed-') === 0 || state.algo === 'custom-kernel';
  $('serpRow').style.display = isED ? '' : 'none';
  $('kernelWrap').hidden = state.algo !== 'custom-kernel';
  $('bayerWrap').hidden = state.algo !== 'custom-bayer';
  const isGl = state.algo.indexOf('gli-') === 0;
  $('glitchRow').style.display = isGl ? '' : 'none';
}

// ---------------- effects stacks ----------------
const PRE_DEFS = {
  brightness: { name: 'Brightness', min: -100, max: 100, def: 20 },
  contrast:   { name: 'Contrast', min: -100, max: 100, def: 20 },
  saturate:   { name: 'Saturation', min: 0, max: 200, def: 130 },
  hue:        { name: 'Hue Shift', min: -180, max: 180, def: 40 },
  gamma:      { name: 'Gamma', min: 20, max: 300, def: 140 },
  posterize:  { name: 'Posterize', min: 2, max: 16, def: 5 },
  invert:     { name: 'Invert', min: 0, max: 100, def: 100 },
  solarize:   { name: 'Solarize', min: 0, max: 255, def: 128 },
  blur:       { name: 'Soften', min: 1, max: 3, def: 1 }
};
const POST_DEFS = {
  glow:      { name: 'Epsilon Glow', min: 0, max: 100, def: 60 },
  chromatic: { name: 'Chromatic Aberration', min: 0, max: 12, def: 4 },
  scanlines: { name: 'Scanlines', min: 0, max: 100, def: 45 },
  vignette:  { name: 'Vignette', min: 0, max: 100, def: 55 },
  grain:     { name: 'Film Grain', min: 0, max: 100, def: 30 },
  jpeg:      { name: 'JPEG Glitch', min: 0, max: 100, def: 50 }
};
function addEffect(which, type) {
  const defs = which === 'pre' ? PRE_DEFS : POST_DEFS;
  if (!defs[type]) return;
  state[which + 'Stack'].push({ id: 'fx' + (uidc++), type: type, amount: defs[type].def });
  renderStacks(); requestRender();
}
function renderStacks() {
  [['pre', PRE_DEFS, 'preStackList'], ['post', POST_DEFS, 'postStackList']].forEach(([which, defs, elId]) => {
    const el = $(elId); el.innerHTML = '';
    const st = state[which + 'Stack'];
    if (!st.length) { el.innerHTML = '<div class="stackempty">empty — add one below</div>'; return; }
    st.forEach((fx, i) => {
      const d = defs[fx.type];
      const row = document.createElement('div'); row.className = 'fx';
      const nm = document.createElement('span'); nm.className = 'fxname'; nm.textContent = d.name;
      const sl = document.createElement('input');
      sl.type = 'range'; sl.min = d.min; sl.max = d.max; sl.step = 1; sl.value = fx.amount;
      sl.oninput = () => { fx.amount = +sl.value; val.textContent = sl.value; requestRender(); };
      const val = document.createElement('span'); val.className = 'fxval'; val.textContent = fx.amount;
      const up = document.createElement('button'); up.className = 'mini'; up.textContent = '▲'; up.title = 'move up';
      up.onclick = () => { if (i > 0) { st.splice(i, 1); st.splice(i - 1, 0, fx); renderStacks(); requestRender(); } };
      const dn = document.createElement('button'); dn.className = 'mini'; dn.textContent = '▼'; dn.title = 'move down';
      dn.onclick = () => { if (i < st.length - 1) { st.splice(i, 1); st.splice(i + 1, 0, fx); renderStacks(); requestRender(); } };
      const rm = document.createElement('button'); rm.className = 'mini danger'; rm.textContent = 'x';
      rm.onclick = () => { st.splice(i, 1); renderStacks(); requestRender(); };
      row.appendChild(nm); row.appendChild(sl); row.appendChild(val);
      row.appendChild(up); row.appendChild(dn); row.appendChild(rm);
      el.appendChild(row);
    });
  });
}
function applyPreStack(imgData) {
  const d = imgData.data;
  for (const fx of state.preStack) {
    const a = fx.amount;
    switch (fx.type) {
      case 'brightness': { const o = a * 2.55; for (let i = 0; i < d.length; i += 4) { d[i] += o; d[i+1] += o; d[i+2] += o; } break; }
      case 'contrast': { const f = (259 * (a + 255)) / (255 * (259 - a)); for (let i = 0; i < d.length; i += 4) { d[i] = f*(d[i]-128)+128; d[i+1] = f*(d[i+1]-128)+128; d[i+2] = f*(d[i+2]-128)+128; } break; }
      case 'saturate': { const s = a / 100; for (let i = 0; i < d.length; i += 4) { const l = 0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; d[i] = l+(d[i]-l)*s; d[i+1] = l+(d[i+1]-l)*s; d[i+2] = l+(d[i+2]-l)*s; } break; }
      case 'hue': { const th = a*Math.PI/180, c = Math.cos(th), s = Math.sin(th);
        const m = [[0.213+c*0.787-s*0.213, 0.715-c*0.715-s*0.715, 0.072-c*0.072+s*0.928],[0.213-c*0.213+s*0.143, 0.715+c*0.285+s*0.14, 0.072-c*0.072-s*0.283],[0.213-c*0.213-s*0.787, 0.715-c*0.715+s*0.715, 0.072+c*0.928+s*0.072]];
        for (let i = 0; i < d.length; i += 4) { const r=d[i],g=d[i+1],b=d[i+2]; d[i]=m[0][0]*r+m[0][1]*g+m[0][2]*b; d[i+1]=m[1][0]*r+m[1][1]*g+m[1][2]*b; d[i+2]=m[2][0]*r+m[2][1]*g+m[2][2]*b; } break; }
      case 'gamma': { const g = a/100; const lut = new Uint8Array(256); for (let v = 0; v < 256; v++) lut[v] = Math.pow(v/255, 1/g)*255;
        for (let i = 0; i < d.length; i += 4) { d[i]=lut[d[i]]; d[i+1]=lut[d[i+1]]; d[i+2]=lut[d[i+2]]; } break; }
      case 'posterize': { const lv = Math.max(2, a); for (let i = 0; i < d.length; i += 4) { d[i]=Math.round(d[i]/255*lv)*255/lv; d[i+1]=Math.round(d[i+1]/255*lv)*255/lv; d[i+2]=Math.round(d[i+2]/255*lv)*255/lv; } break; }
      case 'invert': { const k = a/100; for (let i = 0; i < d.length; i += 4) { d[i]=d[i]*(1-k)+(255-d[i])*k; d[i+1]=d[i+1]*(1-k)+(255-d[i+1])*k; d[i+2]=d[i+2]*(1-k)+(255-d[i+2])*k; } break; }
      case 'solarize': { for (let i = 0; i < d.length; i += 4) { if (d[i]>a) d[i]=255-d[i]; if (d[i+1]>a) d[i+1]=255-d[i+1]; if (d[i+2]>a) d[i+2]=255-d[i+2]; } break; }
      case 'blur': { const w = gridC.width, h = gridC.height, r = Math.min(3, a|0);
        const cp = new Uint8ClampedArray(d);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let rs=0,gs=0,bs=0,n=0;
          for (let dy=-r;dy<=r;dy++) for (let dx=-r;dx<=r;dx++) { const xx=x+dx,yy=y+dy; if(xx<0||yy<0||xx>=w||yy>=h) continue; const o=(yy*w+xx)*4; rs+=cp[o];gs+=cp[o+1];bs+=cp[o+2];n++; }
          const o=(y*w+x)*4; d[o]=rs/n; d[o+1]=gs/n; d[o+2]=bs/n;
        } break; }
    }
  }
  // clamp
  for (let i = 0; i < d.length; i += 4) {
    d[i] = d[i] < 0 ? 0 : d[i] > 255 ? 255 : d[i];
    d[i+1] = d[i+1] < 0 ? 0 : d[i+1] > 255 ? 255 : d[i+1];
    d[i+2] = d[i+2] < 0 ? 0 : d[i+2] > 255 ? 255 : d[i+2];
  }
}
function applyPostStack(canvas) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  for (const fx of state.postStack) {
    const a = fx.amount;
    if (fx.type === 'glow' && a > 0) {
      const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
      const t2 = tmp.getContext('2d');
      t2.filter = 'blur(' + Math.max(1, W/160 * a/40) + 'px) brightness(1.4)';
      t2.drawImage(canvas, 0, 0);
      ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = a/130;
      ctx.drawImage(tmp, 0, 0); ctx.restore();
    } else if (fx.type === 'chromatic' && a > 0) {
      const src = ctx.getImageData(0, 0, W, H);
      const out = ctx.createImageData(W, H);
      const s = src.data, o = out.data, sh = Math.round(a);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y*W+x)*4;
        const xl = Math.max(0, x-sh), xr = Math.min(W-1, x+sh);
        o[i] = s[(y*W+xl)*4]; o[i+1] = s[i+1]; o[i+2] = s[(y*W+xr)*4+2]; o[i+3] = 255;
      }
      ctx.putImageData(out, 0, 0);
    } else if (fx.type === 'scanlines' && a > 0) {
      ctx.save(); ctx.globalAlpha = a/100*0.55; ctx.fillStyle = '#000';
      const gap = Math.max(2, Math.round(state.cell * 1.2));
      for (let y = 0; y < H; y += gap) ctx.fillRect(0, y, W, 1);
      ctx.restore();
    } else if (fx.type === 'vignette' && a > 0) {
      const g = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.3, W/2, H/2, Math.max(W,H)*0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + (a/100*0.85) + ')');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else if (fx.type === 'grain' && a > 0) {
      const img = ctx.getImageData(0, 0, W, H); const d = img.data;
      const amp = a/100*46;
      for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random()-0.5)*2*amp;
        d[i]+=n; d[i+1]+=n; d[i+2]+=n;
      }
      ctx.putImageData(img, 0, 0);
    } else if (fx.type === 'jpeg' && a > 0) {
      const bs = 4 + Math.round(a/100*24);
      const tw = Math.max(1, (W/bs)|0), th = Math.max(1, (H/bs)|0);
      const tmp = document.createElement('canvas'); tmp.width = tw; tmp.height = th;
      const t2 = tmp.getContext('2d'); t2.imageSmoothingEnabled = true;
      t2.drawImage(canvas, 0, 0, tw, th);
      ctx.save(); ctx.imageSmoothingEnabled = true; ctx.globalAlpha = 0.85;
      ctx.drawImage(tmp, 0, 0, tw, th, 0, 0, W, H); ctx.restore();
    }
  }
}

// ---------------- custom kernel parse ----------------
function parseKernel() {
  try {
    const rows = state.kernelText.trim().split('\n').map(r => r.trim().split(/[\s,]+/).map(Number));
    if (!rows.length || rows.some(r => r.some(v => !isFinite(v)))) return null;
    const taps = [];
    const cy = 1; // assume 3 rows, current pixel at row 1 col 1
    rows.forEach((row, ry) => row.forEach((wt, rx) => {
      if (wt === 0) return;
      const dx = rx - 1, dy = ry - cy;
      if (dy < 0 || (dy === 0 && dx <= 0)) return; // only future taps
      taps.push([dx, dy, wt]);
    }));
    const div = state.kernelDiv || 16;
    return { div: div, taps: taps };
  } catch (e) { return null; }
}

// ---------------- render ----------------
let rafId = 0, lastGrid = null;
function requestRender() {
  if (rafId) return;
  rafId = requestAnimationFrame(() => { rafId = 0; render(); });
}
function currentTimeVal() { return state.time; }
function render(targetCanvas, forExport, gridWOverride) {
  if (!sourceReady) return null;
  if (!forExport) $('stageCanvas').hidden = false;
  const t0 = performance.now();
  const pal = activePalette();
  const palRGB = E.paletteRGB(pal);
  let gw = gridWOverride || state.detail;
  let gh = Math.max(1, Math.round(gw * state.srcH / Math.max(1, state.srcW)));
  gridC.width = gw; gridC.height = gh;
  const gx = gridC.getContext('2d');
  gx.imageSmoothingEnabled = true;
  gx.imageSmoothingQuality = 'high';
  // quick adjust via filter
  const qf = 'brightness(' + (100 + state.qBright) + '%) contrast(' + (100 + state.qContr) + '%) saturate(' + state.qSat + '%)';
  gx.filter = qf;
  if (state.comparing && !forExport) {
    // draw original straight to stage for compare
    const st = targetCanvas || stage();
    const cell = state.cell;
    st.width = gw * cell; st.height = gh * cell;
    const sx = st.getContext('2d');
    sx.imageSmoothingEnabled = true;
    sx.filter = qf;
    drawSource(sx, st.width, st.height);
    sx.filter = 'none';
    $('renderMs').textContent = 'original';
    return { canvas: st, grid: null };
  }
  gx.filter = qf;
  drawSource(gx, gw, gh);
  gx.filter = 'none';
  const imgData = gx.getImageData(0, 0, gw, gh);
  applyPreStack(imgData);
  gx.putImageData(imgData, 0, 0);
  const fresh = gx.getImageData(0, 0, gw, gh);
  const kernel = state.algo === 'custom-kernel' ? parseKernel() : null;
  const grid = E.quantize(fresh, gw, gh, state.algo, palRGB, {
    strength: state.strength, serpentine: state.serpentine,
    time: currentTimeVal(), glitch: state.glitch, seed: state.seed,
    kernel: kernel, bayerSize: state.bayerSize
  });
  const st = targetCanvas || stage();
  const cell = forExport ? (forExport.cell || state.cell) : state.cell;
  st.width = gw * cell; st.height = gh * cell;
  const sx = st.getContext('2d');
  sx.imageSmoothingEnabled = false;
  E.paint(sx, grid, gw, gh, cell, state.algo, pal, {});
  if (!forExport) applyPostStack(st); else applyPostStack(st);
  lastGrid = { grid: grid, w: gw, h: gh, cell: cell, pal: pal };
  if (!forExport) {
    $('renderMs').textContent = (performance.now() - t0).toFixed(1) + ' ms';
    $('resLabel').textContent = gw + 'x' + gh + ' cells · ' + st.width + 'x' + st.height + ' px';
    applyZoom();
  }
  return { canvas: st, grid: grid, w: gw, h: gh };
}
function drawSource(ctx, w, h) {
  if (state.srcKind === 'video') {
    try { ctx.drawImage(vidEl, 0, 0, w, h); } catch (e) {}
  } else {
    ctx.drawImage(imgEl, 0, 0, w, h);
  }
}
function applyZoom() {
  const st = stage();
  st.classList.remove('zoom1', 'zoom2');
  if (state.zoom === '1') { st.style.width = st.width + 'px'; }
  else if (state.zoom === '2') { st.style.width = (st.width * 2) + 'px'; }
  else { st.style.width = ''; }
}

// ---------------- animation loop (temporal + video) ----------------
let animId = 0, lastTick = 0;
function startAnimLoop() {
  stopAnimLoop();
  lastTick = performance.now();
  const loop = () => {
    animId = requestAnimationFrame(loop);
    const now = performance.now();
    const slowShape = state.algo === 'spc-ascii' || state.algo === 'spc-knit' || state.algo === 'spc-blocks';
    if (now - lastTick < (slowShape ? 400 : 66)) return; // ~15fps shimmer, slower for heavy shape modes
    lastTick = now;
    if (state.srcKind === 'video') {
      if (!vidEl.paused) {
        state.time = vidEl.currentTime;
        syncTimeline();
        requestRenderDirect();
      }
    } else if (state.temporal) {
      state.time += 1/15;
      requestRenderDirect();
    }
  };
  animId = requestAnimationFrame(loop);
}
function stopAnimLoop() { if (animId) cancelAnimationFrame(animId); animId = 0; }
function requestRenderDirect() {
  if (requestRenderDirect.busy) return;
  requestRenderDirect.busy = true;
  try { render(); } finally { requestRenderDirect.busy = false; }
}
function syncTimeline() {
  if (!vidEl.duration) return;
  $('scrubRange').value = (vidEl.currentTime / vidEl.duration * 1000) | 0;
  $('timeLabel').textContent = vidEl.currentTime.toFixed(1) + 's / ' + vidEl.duration.toFixed(1) + 's';
}

// ---------------- presets ----------------
const PRESETS = [
  { name: 'Game Boy', algo: 'ord-bayer4', pal: 'gb', cell: 3, fx: [] },
  { name: 'Newspaper', algo: 'spc-halfdot', pal: 'bw', cell: 4, fx: [] },
  { name: 'CRT Dreams', algo: 'ed-floyd', pal: 'pico8', cell: 3, fx: [['post','scanlines',45],['post','chromatic',4],['post','vignette',55]] },
  { name: 'CMYK Print', algo: 'spc-cmyk', pal: 'cmyk', cell: 5, fx: [] },
  { name: 'ASCII Art', algo: 'spc-ascii', pal: 'gray8', cell: 8, fx: [] },
  { name: 'VHS Glitch', algo: 'gli-vhs', pal: 'sweetie16', cell: 3, glitch: 0.85, fx: [['post','grain',35],['post','chromatic',6]] },
  { name: 'Epsilon Glow', algo: 'spc-glow', pal: 'slso8', cell: 4, fx: [['post','glow',70],['post','vignette',40]] },
  { name: 'Pixel Pop', algo: 'ord-bayer8', pal: 'pico8', cell: 4, fx: [['pre','saturate',150]] }
];
function applyPreset(p) {
  state.algo = p.algo; state.paletteId = p.pal; state.cell = p.cell || 3;
  ensureSaneCellForAlgo();
  state.preStack = []; state.postStack = [];
  (p.fx || []).forEach(([w2, t2, a2]) => state[w2 + 'Stack'].push({ id: 'fx' + (uidc++), type: t2, amount: a2 }));
  if (p.glitch != null) { state.glitch = p.glitch; $('glitchRange').value = p.glitch * 100; $('glitchVal').textContent = Math.round(p.glitch*100) + '%'; }
  $('cellRange').value = state.cell; $('cellVal').textContent = state.cell + 'px';
  renderAlgoList($('algoSearch').value); updateAlgoPanel(); renderStacks(); renderPaletteGrid(); renderCustomEditor();
  requestRender();
  toast('Preset: ' + p.name);
}

// ---------------- export ----------------
function download(url, name) {
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}
function exportTargetWidth() {
  if (state.exportSize === 'preview') return null;
  if (state.exportSize === '1k') return 1024;
  if (state.exportSize === '2k') return 2048;
  return Math.min(4000, state.srcW || 2048); // full
}
function doExport(kind) {
  if (!sourceReady) { toast('Load an image first'); return; }
  toast('Rendering export…');
  setTimeout(() => {
    const tw = exportTargetWidth();
    let gw = state.detail, cell = state.cell;
    if (tw) {
      // keep cell, grow grid to hit target width
      gw = Math.max(32, Math.min(1600, Math.round(tw / cell)));
    }
    const off = document.createElement('canvas');
    render(off, { cell: cell }, gw);
    if (kind === 'png' || kind === 'jpg') {
      off.toBlob(b => {
        const url = URL.createObjectURL(b);
        download(url, 'dither-buddy.' + (kind === 'png' ? 'png' : 'jpg'));
        setTimeout(() => URL.revokeObjectURL(url), 8000);
        toast('Exported ' + off.width + 'x' + off.height);
      }, kind === 'png' ? 'image/png' : 'image/jpeg', 0.92);
    } else if (kind === 'svg') {
      if (!lastGrid) { toast('Render first'); return; }
      const shape = (state.algo === 'spc-halfdot' || state.algo === 'spc-cmyk' || state.algo === 'spc-rosette') ? 'circle' : 'rect';
      let svg;
      if (lastGrid.w * lastGrid.h > 260000) {
        toast('Too many cells for SVG — lower Detail or raise Pixel size');
        return;
      }
      svg = E.traceSVG(lastGrid.grid, lastGrid.w, lastGrid.h, lastGrid.cell, lastGrid.pal, shape);
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      download(url, 'dither-buddy.svg');
      setTimeout(() => URL.revokeObjectURL(url), 8000);
      toast('Vector SVG exported — print + embroidery ready');
    }
  }, 30);
}
function copyToClipboard() {
  if (!sourceReady) return;
  stage().toBlob(b => {
    const item = new ClipboardItem({ 'image/png': b });
    navigator.clipboard.write([item]).then(() => toast('Copied to clipboard'), () => toast('Copy blocked by browser'));
  });
}
// record webm
let recorder = null, recChunks = [];
function toggleRecord() {
  if (recorder) {
    recorder.stop();
    return;
  }
  if (!sourceReady) { toast('Load an image first'); return; }
  const stream = stage().captureStream(30);
  try {
    recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  } catch (e) {
    try { recorder = new MediaRecorder(stream); }
    catch (e2) { toast('Recording not supported here'); return; }
  }
  recChunks = [];
  recorder.ondataavailable = (e) => { if (e.data.size) recChunks.push(e.data); };
  recorder.onstop = () => {
    const blob = new Blob(recChunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    download(url, 'dither-buddy.webm');
    setTimeout(() => URL.revokeObjectURL(url), 8000);
    recorder = null;
    $('recordBtn').textContent = 'Record WebM';
    $('recordBtn').classList.remove('rec');
    toast('Clip saved');
  };
  recorder.start();
  $('recordBtn').textContent = 'Stop + Save';
  $('recordBtn').classList.add('rec');
  toast('Recording… play video or enable Temporal for motion');
}

// ---------------- toast ----------------
let toastT = 0;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, 2600);
}

// ---------------- extract palette ----------------
function extractPalette() {
  if (!sourceReady) { toast('Load an image first'); return; }
  const [gw, gh] = gridSize();
  const c = document.createElement('canvas'); c.width = gw; c.height = gh;
  const x = c.getContext('2d');
  drawSource(x, gw, gh);
  const id = x.getImageData(0, 0, gw, gh);
  extractedColors = E.medianCut(id.data, gw, gh, state.extractCount);
  state.paletteId = 'extracted';
  renderPaletteGrid(); requestRender();
  toast('Extracted ' + extractedColors.length + ' colors');
}

// ---------------- wire up ----------------
function bindRange(id, fn) {
  const el = $(id);
  el.addEventListener('input', () => fn(+el.value));
}
function init() {
  renderAlgoList(''); updateAlgoPanel(); renderStacks(); renderPaletteGrid(); renderCustomEditor();

  // presets
  PRESETS.forEach(p => {
    const b = document.createElement('button');
    b.className = 'preset'; b.textContent = p.name;
    b.onclick = () => applyPreset(p);
    $('presetRow').appendChild(b);
  });

  // source buttons
  $('loadBtn').onclick = () => $('loadInput').click();
  $('loadInput').addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    const url = URL.createObjectURL(f);
    if (f.type.indexOf('video') === 0 || /\.(mp4|webm|mov|m4v)$/i.test(f.name)) setVideoSource(url);
    else setImageSource(url);
    e.target.value = '';
  });
  document.querySelectorAll('[data-sample]').forEach(b => {
    b.onclick = () => {
      const kind = b.getAttribute('data-sample');
      if (kind === 'gradient' || kind === 'shapes') { procedural(kind); return; }
      const url = 'https://picsum.photos/seed/' + kind + '/900/700';
      state.srcKind = 'image';
      imgEl.onload = () => { state.srcW = imgEl.naturalWidth; state.srcH = imgEl.naturalHeight; sourceReady = true; onNewSource(); };
      imgEl.onerror = () => { procedural('gradient'); toast('Offline sample used'); };
      imgEl.src = url;
    };
  });
  $('webcamBtn').onclick = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { width: 960 } });
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.srcObject = s;
      await v.play();
      // snapshot loop: treat live stream as video source
      vidEl.srcObject = s;
      state.srcKind = 'video';
      vidEl.onloadedmetadata = () => {
        state.srcW = vidEl.videoWidth || 640; state.srcH = vidEl.videoHeight || 480;
        sourceReady = true; onNewSource();
        vidEl.play().catch(() => {});
      };
    } catch (e) { toast('Webcam blocked or unavailable'); }
  };
  $('urlBtn').onclick = () => {
    const u = prompt('Paste an image URL:');
    if (u) setImageSource(u);
  };

  // drag + drop + paste anywhere
  window.addEventListener('dragover', (e) => { e.preventDefault(); });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) {
      const url = URL.createObjectURL(f);
      if (f.type.indexOf('video') === 0) setVideoSource(url); else setImageSource(url);
    }
  });
  window.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const it of items) {
      if (it.type.indexOf('image') === 0) {
        const f = it.getAsFile();
        setImageSource(URL.createObjectURL(f));
        break;
      }
    }
  });

  // sliders
  bindRange('detailRange', (v) => { state.detail = v; $('detailVal').textContent = v + 'px'; requestRender(); });
  bindRange('cellRange', (v) => { state.cell = v; $('cellVal').textContent = v + 'px'; requestRender(); });
  bindRange('strengthRange', (v) => { state.strength = v / 100; $('strengthVal').textContent = v + '%'; requestRender(); });
  bindRange('glitchRange', (v) => { state.glitch = v / 100; $('glitchVal').textContent = v + '%'; requestRender(); });
  bindRange('brightRange', (v) => { state.qBright = v; $('brightVal').textContent = v; requestRender(); });
  bindRange('contrRange', (v) => { state.qContr = v; $('contrVal').textContent = v; requestRender(); });
  bindRange('satRange', (v) => { state.qSat = v; $('satVal').textContent = v + '%'; requestRender(); });
  $('serpChk').onchange = (e) => { state.serpentine = e.target.checked; requestRender(); };
  $('temporalChk').onchange = (e) => {
    state.temporal = e.target.checked;
    stopAnimLoop();
    if (state.srcKind === 'video' || state.temporal) startAnimLoop();
    requestRender();
  };
  $('seedRange').addEventListener('input', (e) => { state.seed = +e.target.value; $('seedVal').textContent = e.target.value; requestRender(); });
  $('zoomSel').onchange = (e) => { state.zoom = e.target.value; applyZoom(); };
  $('exportSizeSel').onchange = (e) => { state.exportSize = e.target.value; };

  $('algoSearch').addEventListener('input', (e) => renderAlgoList(e.target.value));
  $('kernelText').addEventListener('input', (e) => { state.kernelText = e.target.value; requestRender(); });
  $('kernelDiv').addEventListener('input', (e) => { state.kernelDiv = +e.target.value || 16; $('kernelDivVal').textContent = state.kernelDiv; requestRender(); });
  $('bayerSel').onchange = (e) => { state.bayerSize = +e.target.value; requestRender(); };

  // effect add buttons
  const preSel = $('preAddSel'), postSel = $('postAddSel');
  Object.keys(PRE_DEFS).forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = PRE_DEFS[k].name; preSel.appendChild(o); });
  Object.keys(POST_DEFS).forEach(k => { const o = document.createElement('option'); o.value = k; o.textContent = POST_DEFS[k].name; postSel.appendChild(o); });
  $('preAddBtn').onclick = () => addEffect('pre', preSel.value);
  $('postAddBtn').onclick = () => addEffect('post', postSel.value);

  // custom palette
  $('addColorBtn').onclick = () => { state.customColors.push('#888888'); renderCustomEditor(); renderPaletteGrid(); requestRender(); };
  $('extractBtn').onclick = extractPalette;
  $('extractCount').addEventListener('input', (e) => { state.extractCount = +e.target.value; $('extractCountVal').textContent = e.target.value; });
  $('copyPalBtn').onclick = () => {
    const pal = activePalette();
    const txt = pal.colors.join('\n');
    navigator.clipboard.writeText(txt).then(() => toast('Palette copied'), () => toast('Copy blocked'));
  };
  $('dlPalBtn').onclick = () => {
    const pal = activePalette();
    let out = 'GIMP Palette\nName: ' + pal.name + '\n';
    pal.colors.forEach(c => { const rgb = E.hexToRgb(c); out += rgb[0] + ' ' + rgb[1] + ' ' + rgb[2] + ' ' + c + '\n'; });
    const blob = new Blob([out], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    download(url, 'palette.gpl');
    setTimeout(() => URL.revokeObjectURL(url), 8000);
  };
  $('importPalBtn').onclick = () => {
    const txt = prompt('Paste hex colors, one per line or comma separated:');
    if (!txt) return;
    const cols = txt.match(/#?[0-9a-fA-F]{6}\b|#?[0-9a-fA-F]{3}\b/g) || [];
    if (!cols.length) { toast('No colors found'); return; }
    state.customColors = cols.map(c => c[0] === '#' ? c : '#' + c).slice(0, 32);
    state.paletteId = 'custom';
    renderCustomEditor(); renderPaletteGrid(); requestRender();
    toast('Imported ' + state.customColors.length + ' colors');
  };

  // export
  $('exportPngBtn').onclick = () => doExport('png');
  $('exportJpgBtn').onclick = () => doExport('jpg');
  $('exportSvgBtn').onclick = () => doExport('svg');
  $('copyBtn').onclick = copyToClipboard;
  $('recordBtn').onclick = toggleRecord;

  // compare (hold)
  const cmp = $('compareBtn');
  const on = (e) => { e.preventDefault(); if (!sourceReady) return; state.comparing = true; render(); };
  const off = () => { if (!state.comparing) return; state.comparing = false; requestRender(); };
  cmp.addEventListener('pointerdown', on);
  window.addEventListener('pointerup', off);

  // video timeline
  $('playBtn').onclick = () => {
    if (state.srcKind !== 'video') return;
    if (vidEl.paused) { vidEl.play().catch(() => {}); $('playBtn').textContent = 'Pause'; }
    else { vidEl.pause(); $('playBtn').textContent = 'Play'; requestRender(); }
  };
  $('scrubRange').addEventListener('input', (e) => {
    if (state.srcKind !== 'video' || !vidEl.duration) return;
    vidEl.currentTime = (+e.target.value / 1000) * vidEl.duration;
    state.time = vidEl.currentTime;
    requestRender();
  });
  vidEl.addEventListener('seeked', () => { if (vidEl.paused) requestRender(); });

  // defaults
  $('detailRange').value = state.detail; $('cellRange').value = state.cell;
  $('strengthRange').value = 100; $('glitchRange').value = 60;
  $('extractCount').value = state.extractCount;
  const sel = document.querySelector('.pal.sel');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

document.addEventListener('DOMContentLoaded', init);

// debug / test handle + power-user API
window.DitherBuddy = {
  state: state,
  render: render,
  requestRender: requestRender,
  sample: procedural,
  exportPng: () => doExport('png'),
  engine: function () { return window.DitherEngine; }
};
})();
