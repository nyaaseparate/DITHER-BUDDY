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
  thresh: 0,
  duoOn: false, duoDark: '#000000', duoLight: '#ffffff',
  split: false, splitPos: 0.5,
  preStack: [],
  postStack: [],
  kernelText: '0 0 0\n0 0 7\n3 5 1',
  kernelDiv: 16,
  bayerSize: 8,
  extractCount: 8,
  zoomMode: 'fit', // 'fit' | 'manual'
  zoomScale: 1,    // css px per image px in manual mode
  comparing: false,
  exportSize: 'preview',
  srcKind: null, // 'image' | 'video'
  srcW: 0, srcH: 0
};
let uidc = 1;

// Factory defaults — Reset restores exactly this (except the loaded image stays).
function factoryState() {
  return {
    algo: 'ed-floyd',
    paletteId: 'pico8',
    customColors: ['#000000', '#ff004d', '#ffa300', '#00e436', '#29adff', '#fff1e8'],
    detail: 300,
    cell: 3,
    strength: 1.0,
    serpentine: true,
    glitch: 0.6,
    temporal: true,
    time: 0,
    seed: 7,
    qBright: 0, qContr: 0, qSat: 100,
    thresh: 0,
    duoOn: false, duoDark: '#000000', duoLight: '#ffffff',
    split: false, splitPos: 0.5,
    preStack: [],
    postStack: [],
    kernelText: '0 0 0\n0 0 7\n3 5 1',
    kernelDiv: 16,
    bayerSize: 8,
    extractCount: 8,
    zoomMode: 'fit',
    zoomScale: 1,
    comparing: false,
    exportSize: 'preview'
  };
}
function setVal(id, v) { const el = $(id); if (el) el.value = v; }
function clampNum(v, lo, hi) {
  v = +v;
  if (!isFinite(v)) return null;
  return Math.min(hi, Math.max(lo, v));
}
// Keep a slider + its numeric box in sync (both directions), clamping + rounding.
function bindPair(rangeId, numId, lo, hi, onSlider) {
  const r = $(rangeId), n = $(numId);
  if (r) r.addEventListener('input', () => {
    const v = clampNum(r.value, lo, hi);
    if (v == null) return;
    onSlider(v);
    if (n) n.value = v;
  });
  if (n) n.addEventListener('change', () => {
    let v = clampNum(n.value, lo, hi);
    if (v == null) { syncAllControls(); return; }
    // respect integer steps
    const step = parseFloat(n.getAttribute('step') || r.getAttribute('step') || '1');
    if (step >= 1) v = Math.round(v);
    onSlider(v);
    if (r) r.value = v;
    n.value = v;
  });
}
function syncAllControls() {
  setVal('detailRange', state.detail); setVal('detailVal', state.detail);
  setVal('cellRange', state.cell); setVal('cellVal', state.cell);
  setVal('strengthRange', Math.round(state.strength * 100)); setVal('strengthVal', Math.round(state.strength * 100));
  setVal('glitchRange', Math.round(state.glitch * 100)); setVal('glitchVal', Math.round(state.glitch * 100));
  setVal('brightRange', state.qBright); setVal('brightVal', state.qBright);
  setVal('contrRange', state.qContr); setVal('contrVal', state.qContr);
  setVal('satRange', state.qSat); setVal('satVal', state.qSat);
  setVal('threshRange', state.thresh); setVal('threshVal', state.thresh);
  setVal('seedRange', state.seed); setVal('seedVal', state.seed);
  setVal('extractCount', state.extractCount); setVal('extractCountVal', state.extractCount);
  setVal('kernelDiv', state.kernelDiv); setVal('kernelDivVal', state.kernelDiv);
  const ks = $('kernelText'); if (ks && ks.value !== state.kernelText) ks.value = state.kernelText;
  const bs = $('bayerSel'); if (bs) bs.value = String(state.bayerSize);
  const sq = $('serpChk'); if (sq) sq.checked = state.serpentine;
  const tq = $('temporalChk'); if (tq) tq.checked = state.temporal;
  const es = $('exportSizeSel'); if (es) es.value = state.exportSize;
  const mb = $('motionBtn'); if (mb) mb.textContent = state.temporal ? 'Motion: on' : 'Motion: off';
  const dq = $('duoChk'); if (dq) dq.checked = state.duoOn;
  const dd = $('duoDark'); if (dd) dd.value = state.duoDark;
  const dl = $('duoLight'); if (dl) dl.value = state.duoLight;
  const dn = $('duoNote'); if (dn) dn.hidden = !state.duoOn;
  const sb = $('splitBtn'); if (sb) sb.classList.toggle('active', !!state.split);
}
function disableDither(reason) {
  if (!state.algo) { if (reason !== 'silent') toast('Already showing the original'); return; }
  state.algo = null;
  activePreset = null;
  renderAlgoList($('algoSearch') ? $('algoSearch').value : '');
  updateAlgoPanel(); requestRender();
  if (reason !== 'silent') toast('Dithering off · original');
}
function resetToDefaults() {
  const f = factoryState();
  // keep the loaded image/video geometry, drop everything else
  const keepKind = state.srcKind, keepW = state.srcW, keepH = state.srcH;
  Object.keys(f).forEach(k => { state[k] = f[k]; });
  state.srcKind = keepKind; state.srcW = keepW; state.srcH = keepH;
  activePreset = null; presetBackup = null;
  renderAlgoList(''); const s = $('algoSearch'); if (s) s.value = '';
  updateAlgoPanel(); renderStacks(); renderPaletteGrid(); renderCustomEditor();
  syncAllControls();
  if (sourceReady) { autoDetail(); syncAllControls(); }
  try { localStorage.removeItem(MEM_KEY); } catch (e) {}
  saveNow();
  requestRender();
  toast('Defaults restored · Floyd + PICO-8');
}

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
  autoDetail();
  stopAnimLoop();
  state.time = 0;
  if (isV || state.temporal) startAnimLoop();
  requestRender();
}
function updateFileInfo() {
  const t = state.srcKind === 'video' ? 'video' : 'image';
  $('fileInfo').textContent = t + ' ' + state.srcW + ' x ' + state.srcH + ' px';
}
// Match the working grid to the loaded image so quality isn't lost on load:
// backing store (detail x pixel size) ~= source resolution, capped for safety.
function autoDetail() {
  if (!state.srcW) return;
  const backingCap = 4096;
  const gw = Math.max(80, Math.min(2000, Math.round(Math.min(state.srcW, backingCap) / Math.max(1, state.cell) / 10) * 10));
  state.detail = gw;
  setVal('detailRange', gw); setVal('detailVal', gw);
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
      const r = 12 + ((i * 37) % 42);
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
function paletteById(id) {
  if (state.duoOn) return { id: 'duotone', name: 'Duotone', colors: [state.duoDark, state.duoLight] };
  if (id === 'custom') return { id: 'custom', name: 'Custom', colors: state.customColors.slice() };
  if (id === 'extracted') return { id: 'extracted', name: 'Extracted', colors: extractedColors.slice() };
  return E.PALETTES.find(p => p.id === id) || E.PALETTES[0];
}
function activePalette() { return paletteById(state.paletteId); }
// RGB array for quantize; truecolor depth travels via opts.levels
function quantizeOpts(algo, extra) {
  return Object.assign({
    strength: state.strength, serpentine: state.serpentine,
    time: currentTimeVal(), glitch: state.glitch, seed: state.seed,
    kernel: algo === 'custom-kernel' ? parseKernel() : null, bayerSize: state.bayerSize
  }, extra);
}
let extractedColors = ['#000000', '#ffffff'];
function renderPaletteGrid() {
  const g = $('paletteGrid'); g.innerHTML = '';
  const mk = (pal) => {
    const b = document.createElement('button');
    b.className = 'pal' + (state.paletteId === pal.id ? ' sel' : '');
    b.title = pal.name + (pal.levels ? ' (24-bit, 16.7M colors)' : ' (' + pal.colors.length + ')');
    const sw = document.createElement('span'); sw.className = 'swatches' + (pal.levels ? ' spectrum' : '');
    if (pal.levels) { sw.title = 'full RGB — no palette restriction'; }
    else pal.colors.slice(0, 12).forEach(c => {
      const s = document.createElement('i'); s.style.background = c; sw.appendChild(s);
    });
    const n = document.createElement('span'); n.className = 'palname'; n.textContent = pal.name;
    b.appendChild(sw); b.appendChild(n);
    b.onclick = () => { state.paletteId = pal.id; activePreset = null; presetBackup = null; renderPaletteGrid(); renderCustomEditor(); syncPresetHighlight(); requestRender(); };
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
    b.onclick = () => {
      // click the selected algorithm again to turn dithering off (original)
      state.algo = (state.algo === a.id) ? null : a.id;
      activePreset = null; presetBackup = null;
      ensureSaneCellForAlgo(); renderAlgoList($('algoSearch').value); updateAlgoPanel(); syncPresetHighlight(); requestRender();
    };
    list.appendChild(b);
  });
}
function ensureSaneCellForAlgo() {
  if (state.algo === 'spc-ascii' && state.cell < 6) {
    state.cell = 8;
    setVal('cellRange', 8); setVal('cellVal', 8);
  }
}
function updateAlgoPanel() {
  const a = E.ALGORITHMS.find(x => x.id === state.algo);
  $('algoName').textContent = a ? a.name : 'Original · no dither';
  $('algoCount').textContent = E.ALGORITHMS.length + ' algorithms';
  const id = state.algo || '';
  const isED = id.indexOf('ed-') === 0 || id === 'custom-kernel';
  $('serpRow').style.display = isED ? '' : 'none';
  $('kernelWrap').hidden = id !== 'custom-kernel';
  $('bayerWrap').hidden = id !== 'custom-bayer';
  const isGl = id.indexOf('gli-') === 0;
  $('glitchRow').style.display = isGl ? '' : 'none';
  const ki = $('kernelInfo');
  if (ki) {
    const K = E.KERNELS && E.KERNELS[id];
    if (K) {
      ki.textContent = 'Error kernel ÷' + K.div + ': ' + K.taps.map(t => t[2] + '@(' + t[0] + ',' + t[1] + ')').join(' ');
    } else if (id === 'custom-kernel') {
      ki.textContent = 'Custom kernel: edit the weights above; divisor below.';
    } else if (id.indexOf('ord-') === 0 || id === 'custom-bayer') {
      ki.textContent = 'Ordered: fixed threshold matrix, stable frame to frame — best for animation.';
    } else if (!id) {
      ki.textContent = '';
    } else {
      ki.textContent = 'Threshold pattern at ' + Math.round(state.strength * 100) + '% strength' + (state.thresh ? ', bias ' + (state.thresh > 0 ? '+' : '') + state.thresh : '') + '.';
    }
  }
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
  state[which + 'Stack'].push({ id: 'fx' + (uidc++), type: type, amount: defs[type].def, on: true });
  renderStacks(); requestRender();
}
function renderStacks() {
  [['pre', PRE_DEFS, 'preStackList'], ['post', POST_DEFS, 'postStackList']].forEach(([which, defs, elId]) => {
    const el = $(elId); el.innerHTML = '';
    const st = state[which + 'Stack'];
    if (!st.length) { el.innerHTML = '<div class="stackempty">empty — add one below</div>'; return; }
    st.forEach((fx, i) => {
      const d = defs[fx.type];
      if (!d) return;
      const row = document.createElement('div'); row.className = 'fx' + (fx.on === false ? ' off' : '');
      const eye = document.createElement('button'); eye.className = 'mini'; eye.title = 'enable/disable layer';
      eye.textContent = fx.on === false ? '○' : '●';
      eye.onclick = () => { fx.on = (fx.on === false); renderStacks(); requestRender(); };
      const nm = document.createElement('span'); nm.className = 'fxname'; nm.textContent = d.name;
      const sl = document.createElement('input');
      sl.type = 'range'; sl.min = d.min; sl.max = d.max; sl.step = 1; sl.value = fx.amount;
      const val = document.createElement('input');
      val.type = 'number'; val.className = 'fxval'; val.min = d.min; val.max = d.max; val.step = 1; val.value = fx.amount;
      val.title = d.name + ' amount — type a number';
      sl.oninput = () => { fx.amount = +sl.value; val.value = sl.value; requestRender(); };
      val.onchange = () => {
        let v = clampNum(val.value, d.min, d.max);
        if (v == null) { val.value = fx.amount; return; }
        v = Math.round(v);
        fx.amount = v; sl.value = v; val.value = v; requestRender();
      };
      const up = document.createElement('button'); up.className = 'mini'; up.textContent = '▲'; up.title = 'move up';
      up.onclick = () => { if (i > 0) { st.splice(i, 1); st.splice(i - 1, 0, fx); renderStacks(); requestRender(); } };
      const dn = document.createElement('button'); dn.className = 'mini'; dn.textContent = '▼'; dn.title = 'move down';
      dn.onclick = () => { if (i < st.length - 1) { st.splice(i, 1); st.splice(i + 1, 0, fx); renderStacks(); requestRender(); } };
      const cp = document.createElement('button'); cp.className = 'mini'; cp.textContent = '+'; cp.title = 'duplicate layer';
      cp.onclick = () => { st.splice(i + 1, 0, { id: 'fx' + (uidc++), type: fx.type, amount: fx.amount, on: fx.on !== false }); renderStacks(); requestRender(); };
      const rm = document.createElement('button'); rm.className = 'mini danger'; rm.textContent = 'x'; rm.title = 'delete layer';
      rm.onclick = () => { st.splice(i, 1); renderStacks(); requestRender(); };
      row.appendChild(eye); row.appendChild(nm); row.appendChild(sl); row.appendChild(val);
      row.appendChild(up); row.appendChild(dn); row.appendChild(cp); row.appendChild(rm);
      el.appendChild(row);
    });
  });
}
function applyPreStack(imgData) {
  const d = imgData.data;
  for (const fx of state.preStack) {
    if (fx.on === false) continue;
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
    if (fx.on === false) continue;
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
  scheduleSave();
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
    lastCost = 5;
    return { canvas: st, grid: null };
  }
  gx.filter = qf;
  drawSource(gx, gw, gh);
  gx.filter = 'none';
  const imgData = gx.getImageData(0, 0, gw, gh);
  applyPreStack(imgData);
  if (state.thresh) {
    const o = Math.round(state.thresh * 1.28);
    const dd = imgData.data;
    for (let i = 0; i < dd.length; i += 4) { dd[i] += o; dd[i+1] += o; dd[i+2] += o; }
  }
  gx.putImageData(imgData, 0, 0);
  if (!state.algo) {
    // dithering disabled: adjusted original, pre + post fx still apply
    const st0 = targetCanvas || stage();
    const cell0 = forExport ? (forExport.cell || state.cell) : state.cell;
    st0.width = gw * cell0; st0.height = gh * cell0;
    const sx0 = st0.getContext('2d');
    sx0.imageSmoothingEnabled = true;
    sx0.drawImage(gridC, 0, 0, st0.width, st0.height);
    applyPostStack(st0);
    lastGrid = null;
    if (!forExport) {
      $('renderMs').textContent = (performance.now() - t0).toFixed(1) + ' ms';
      lastCost = performance.now() - t0;
      $('resLabel').textContent = 'original · ' + st0.width + 'x' + st0.height + ' px';
      applyZoom();
      syncPresetHighlight();
    }
    return { canvas: st0, grid: null, w: gw, h: gh };
  }
  const fresh = gx.getImageData(0, 0, gw, gh);
  const grid = E.quantize(fresh, gw, gh, state.algo, palRGB, quantizeOpts(state.algo, { levels: pal.levels || 0 }));
  const st = targetCanvas || stage();
  const cell = forExport ? (forExport.cell || state.cell) : state.cell;
  st.width = gw * cell; st.height = gh * cell;
  const sx = st.getContext('2d');
  sx.imageSmoothingEnabled = false;
  E.paint(sx, grid, gw, gh, cell, state.algo, pal, { time: currentTimeVal() });
  applyPostStack(st);
  lastGrid = { grid: grid, w: gw, h: gh, cell: cell, pal: pal, truecolor: grid.truecolor };
  if (!forExport) {
    $('renderMs').textContent = (performance.now() - t0).toFixed(1) + ' ms';
    lastCost = performance.now() - t0;
    $('resLabel').textContent = gw + 'x' + gh + ' cells · ' + st.width + 'x' + st.height + ' px';
    applyZoom();
    syncPresetHighlight();
    updateSplit();
  }
  return { canvas: st, grid: grid, w: gw, h: gh };
}
function updateSplit() {
  const div = $('splitDiv'), st = stage(), wrap = $('stageWrap');
  if (!div || !st.width) return;
  if (!state.split || state.comparing || !sourceReady) { div.hidden = true; return; }
  // repaint dithered base (paint already ran), then cover left side with the adjusted original
  const pos = Math.min(0.98, Math.max(0.02, state.splitPos));
  const sx = st.getContext('2d');
  const splitPx = Math.round(st.width * pos);
  const gw = gridC.width, gh = gridC.height;
  if (gw && gh && splitPx > 0) {
    sx.save();
    sx.imageSmoothingEnabled = true;
    sx.beginPath(); sx.rect(0, 0, splitPx, st.height); sx.clip();
    sx.drawImage(gridC, 0, 0, gw, gh, 0, 0, st.width, st.height);
    sx.restore();
    applyPostStackSplit(sx, splitPx);
  }
  div.hidden = false;
  div.style.left = (st.offsetLeft + splitPx * (st.offsetWidth / Math.max(1, st.width))) + 'px';
  div.style.top = st.offsetTop + 'px';
  div.style.height = st.offsetHeight + 'px';
}
// re-apply lightweight post fx over the original side so the split compares final-vs-final
function applyPostStackSplit(sx, splitPx) {
  // keep it cheap: only scanlines/vignette/grain would matter; skip heavy glow/chromatic here
  for (const fx of state.postStack) {
    if (fx.on === false || fx.amount <= 0) continue;
    if (fx.type === 'scanlines') {
      sx.save(); sx.beginPath(); sx.rect(0, 0, splitPx, sx.canvas.height); sx.clip();
      sx.globalAlpha = fx.amount/100*0.55; sx.fillStyle = '#000';
      const gap = Math.max(2, Math.round(state.cell * 1.2));
      for (let y = 0; y < sx.canvas.height; y += gap) sx.fillRect(0, y, splitPx, 1);
      sx.restore();
    } else if (fx.type === 'vignette') {
      sx.save(); sx.beginPath(); sx.rect(0, 0, splitPx, sx.canvas.height); sx.clip();
      const W = sx.canvas.width, H = sx.canvas.height;
      const g = sx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.3, W/2, H/2, Math.max(W,H)*0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + (fx.amount/100*0.85) + ')');
      sx.fillStyle = g; sx.fillRect(0, 0, splitPx, H);
      sx.restore();
    }
  }
}
function enableSplitDrag() {
  const wrap = $('stageWrap'), div = $('splitDiv');
  if (!wrap || !div || div.dataset.bound) return;
  div.dataset.bound = '1';
  let dragging = false;
  const posFromEvent = (e) => {
    const st = stage();
    const r = st.getBoundingClientRect();
    return Math.min(0.98, Math.max(0.02, (e.clientX - r.left) / Math.max(1, r.width)));
  };
  div.addEventListener('pointerdown', (e) => { dragging = true; div.setPointerCapture(e.pointerId); e.preventDefault(); });
  div.addEventListener('pointermove', (e) => { if (!dragging) return; state.splitPos = posFromEvent(e); updateSplit(); });
  div.addEventListener('pointerup', () => { dragging = false; scheduleSave(); });
  wrap.addEventListener('pointerdown', (e) => {
    if (!state.split || e.target !== stage()) return;
    state.splitPos = posFromEvent(e);
    updateSplit();
  });
}
function drawSource(ctx, w, h) {
  if (state.srcKind === 'video') {
    try { ctx.drawImage(vidEl, 0, 0, w, h); } catch (e) {}
  } else {
    ctx.drawImage(imgEl, 0, 0, w, h);
  }
}
// Fixed-size viewfinder: the wrap keeps its height and the canvas is scaled
// with explicit CSS px, so detail grid / pixel size never change the frame.
function fitScale() {
  const st = stage();
  const wrap = $('stageWrap');
  if (!st.width || !wrap.clientWidth) return 1;
  const pad = 24;
  const availW = Math.max(50, wrap.clientWidth - pad);
  const availH = Math.max(50, wrap.clientHeight - pad);
  return Math.min(availW / st.width, availH / st.height);
}
function applyZoom(keepCenter) {
  const st = stage();
  if (!st.width) return;
  const wrap = $('stageWrap');
  let s = state.zoomMode === 'fit' ? fitScale() : state.zoomScale;
  if (!isFinite(s) || s <= 0) s = 1;
  let fx = 0.5, fy = 0.5;
  if (keepCenter) {
    fx = (wrap.scrollLeft + wrap.clientWidth / 2) / Math.max(1, wrap.scrollWidth);
    fy = (wrap.scrollTop + wrap.clientHeight / 2) / Math.max(1, wrap.scrollHeight);
  }
  st.style.width = Math.max(1, Math.round(st.width * s)) + 'px';
  st.style.height = Math.max(1, Math.round(st.height * s)) + 'px';
  // fixed frame: when the canvas overflows, pin it top-left so every edge stays reachable by scroll
  wrap.classList.toggle('zoomed', st.offsetWidth > wrap.clientWidth || st.offsetHeight > wrap.clientHeight);
  if (keepCenter) {
    wrap.scrollLeft = fx * wrap.scrollWidth - wrap.clientWidth / 2;
    wrap.scrollTop = fy * wrap.scrollHeight - wrap.clientHeight / 2;
  }
  const lbl = $('zoomLabel');
  if (lbl) lbl.textContent = (state.zoomMode === 'fit' ? 'fit · ' : '') + Math.round(s * 100) + '%';
  const fitB = $('zoomFitBtn'), oneB = $('zoom100Btn');
  if (fitB) fitB.classList.toggle('active', state.zoomMode === 'fit');
  if (oneB) oneB.classList.toggle('active', state.zoomMode === 'manual' && Math.abs(state.zoomScale - 1) < 0.01);
}
// zoom keeping the image point under the cursor pinned (not the viewport center)
function zoomAt(mx, my, factor) {
  if (!sourceReady) return;
  const wrap = $('stageWrap'), st = stage();
  const wr = wrap.getBoundingClientRect();
  const cur = state.zoomMode === 'fit' ? fitScale() : state.zoomScale;
  const px = wrap.scrollLeft + (mx - wr.left) - st.offsetLeft;
  const py = wrap.scrollTop + (my - wr.top) - st.offsetTop;
  const next = Math.min(20, Math.max(0.05, cur * factor));
  state.zoomMode = 'manual'; state.zoomScale = next;
  applyZoom(false);
  const k = next / cur;
  wrap.scrollLeft = px * k - (mx - wr.left) + st.offsetLeft;
  wrap.scrollTop = py * k - (my - wr.top) + st.offsetTop;
  scheduleSave();
}

// ---------------- animation loop (temporal + video) ----------------
let animId = 0, lastTick = 0, lastCost = 66;
function startAnimLoop() {
  stopAnimLoop();
  lastTick = performance.now();
  const loop = () => {
    animId = requestAnimationFrame(loop);
    const now = performance.now();
    const slowShape = state.algo === 'spc-ascii' || state.algo === 'spc-knit' || state.algo === 'spc-blocks';
    // adaptive: never re-render faster than ~2x the last frame cost (big grids = slower shimmer, no pile-up)
    const base = slowShape ? 400 : 66;
    if (now - lastTick < Math.min(1500, Math.max(base, lastCost * 2))) return;
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
  { name: 'Spirit', algo: 'spc-spirit', pal: 'ghost', cell: 4, fx: [['post','glow',70]] },
  { name: 'Pixel Pop', algo: 'ord-bayer8', pal: 'pico8', cell: 4, fx: [['pre','saturate',150]] }
];
let activePreset = null, presetBackup = null;
function presetPartsMatch(p) {
  if (state.algo !== p.algo || state.paletteId !== p.pal || state.cell !== (p.cell || 3)) return false;
  if (p.glitch != null && Math.abs(state.glitch - p.glitch) > 1e-9) return false;
  const pre = state.preStack.map(e => [e.type, e.amount, e.on !== false]);
  const post = state.postStack.map(e => [e.type, e.amount, e.on !== false]);
  const epre = (p.fx || []).filter(f => f[0] === 'pre').map(f => [f[1], f[2], true]);
  const epost = (p.fx || []).filter(f => f[0] === 'post').map(f => [f[1], f[2], true]);
  return JSON.stringify(pre) === JSON.stringify(epre) && JSON.stringify(post) === JSON.stringify(epost);
}
function syncPresetHighlight() {
  PRESETS.forEach(p => { if (p._btn) p._btn.classList.toggle('active', activePreset === p.name && presetPartsMatch(p)); });
}
function togglePreset(p) {
  // Clicking the active preset again always turns it off and restores
  // whatever was set before it — even if sliders were tweaked afterwards.
  // This is what makes Spirit (and every preset) reliably disableable.
  if (activePreset === p.name && presetBackup) {
    state.algo = presetBackup.algo; state.paletteId = presetBackup.paletteId;
    state.cell = presetBackup.cell; state.glitch = presetBackup.glitch;
    state.preStack = presetBackup.preStack; state.postStack = presetBackup.postStack;
    syncAllControls();
    activePreset = null; presetBackup = null;
    renderAlgoList($('algoSearch').value); updateAlgoPanel(); renderStacks(); renderPaletteGrid(); renderCustomEditor();
    syncPresetHighlight(); requestRender();
    toast('Preset off · previous settings restored');
    return;
  }
  presetBackup = {
    algo: state.algo, paletteId: state.paletteId, cell: state.cell, glitch: state.glitch,
    preStack: JSON.parse(JSON.stringify(state.preStack)),
    postStack: JSON.parse(JSON.stringify(state.postStack))
  };
  activePreset = p.name;
  applyPreset(p);
  syncPresetHighlight();
}
function applyPreset(p) {
  state.algo = p.algo; state.paletteId = p.pal; state.cell = p.cell || 3;
  ensureSaneCellForAlgo();
  state.preStack = []; state.postStack = [];
  (p.fx || []).forEach(([w2, t2, a2]) => state[w2 + 'Stack'].push({ id: 'fx' + (uidc++), type: t2, amount: a2, on: true }));
  if (p.glitch != null) { state.glitch = p.glitch; }
  syncAllControls();
  renderAlgoList($('algoSearch').value); updateAlgoPanel(); renderStacks(); renderPaletteGrid(); renderCustomEditor();
  requestRender();
  toast('Preset: ' + p.name + ' · click again to turn off');
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
      if (!lastGrid || !state.algo) { toast('Pick a dither algorithm first for SVG'); return; }
      if (lastGrid.truecolor) { toast('Truecolor has too many colors for SVG — pick a limited palette'); return; }
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
    } else if (kind === 'txt') {
      if (!lastGrid || state.algo !== 'spc-ascii') { toast('TXT export needs the ASCII Text algorithm'); return; }
      const ramp = ' .:-=+*#%@';
      const g = lastGrid.grid, w = lastGrid.w, h = lastGrid.h;
      let out = '';
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const c = g.cov[y*w+x];
          out += ramp[Math.min(ramp.length-1, (c*ramp.length)|0)];
        }
        out += '\n';
      }
      const blob = new Blob([out], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      download(url, 'dither-buddy.txt');
      setTimeout(() => URL.revokeObjectURL(url), 8000);
      toast('ASCII TXT exported (' + w + 'x' + h + ' chars)');
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

// ---------------- memory: remember settings + panel layout ----------------
const MEM_KEY = 'dither-buddy-v2';
let saveT = 0;
function scheduleSave() { clearTimeout(saveT); saveT = setTimeout(saveNow, 400); }
function saveNow() {
  try {
    const s = state;
    localStorage.setItem(MEM_KEY, JSON.stringify({ v: 1,
      algo: s.algo, paletteId: s.paletteId, customColors: s.customColors,
      detail: s.detail, cell: s.cell, strength: s.strength, serpentine: s.serpentine,
      glitch: s.glitch, temporal: s.temporal, seed: s.seed,
      qBright: s.qBright, qContr: s.qContr, qSat: s.qSat, thresh: s.thresh,
      duoOn: s.duoOn, duoDark: s.duoDark, duoLight: s.duoLight,
      split: s.split, splitPos: s.splitPos,
      preStack: s.preStack, postStack: s.postStack,
      kernelText: s.kernelText, kernelDiv: s.kernelDiv, bayerSize: s.bayerSize,
      extractCount: s.extractCount, zoomMode: s.zoomMode, zoomScale: s.zoomScale,
      exportSize: s.exportSize }));
  } catch (e) {}
}
function loadSaved() {
  try { const m = JSON.parse(localStorage.getItem(MEM_KEY)); return (m && m.v === 1) ? m : null; }
  catch (e) { return null; }
}
function cleanFx(e) {
  if (!e || typeof e.type !== 'string' || !isFinite(+e.amount)) return null;
  return { id: String(e.id || ('fx' + (uidc++))), type: e.type, amount: +e.amount, on: e.on !== false };
}
function applySaved(m) {
  ['algo','paletteId','detail','cell','strength','serpentine','glitch','temporal','seed',
   'qBright','qContr','qSat','thresh','duoOn','duoDark','duoLight','split','splitPos',
   'kernelText','kernelDiv','bayerSize','extractCount',
   'zoomMode','zoomScale','exportSize'].forEach(k => { if (m[k] !== undefined) state[k] = m[k]; });
  if (state.paletteId === 'extracted') state.paletteId = 'pico8'; // source image is gone after reload
  if (Array.isArray(m.customColors) && m.customColors.length)
    state.customColors = m.customColors.filter(c => typeof c === 'string').slice(0, 32);
  if (Array.isArray(m.preStack)) state.preStack = m.preStack.map(cleanFx).filter(Boolean);
  if (Array.isArray(m.postStack)) state.postStack = m.postStack.map(cleanFx).filter(Boolean);
  // legacy saves may contain ditherLayers — intentionally ignored (feature removed)
  let mx = 0;
  [...state.preStack, ...state.postStack].forEach(e => {
    const g = /^[a-z]+(\d+)$/.exec(e.id || '');
    if (g) mx = Math.max(mx, +g[1]);
  });
  uidc = Math.max(uidc, mx + 1);
}

// ---------------- wire up ----------------
function init() {
  const saved = loadSaved();
  activePreset = null; presetBackup = null; // fresh page = no undo history
  if (saved) applySaved(saved);
  renderAlgoList(''); updateAlgoPanel(); renderStacks(); renderPaletteGrid(); renderCustomEditor();

  // presets
  PRESETS.forEach(p => {
    const b = document.createElement('button');
    b.className = 'preset'; b.textContent = p.name;
    b.onclick = () => togglePreset(p);
    p._btn = b;
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

  // sliders + editable numbers (every numeric setting has a slider and a typeable box)
  bindPair('detailRange', 'detailVal', 80, 2000, (v) => { state.detail = v; requestRender(); });
  bindPair('cellRange', 'cellVal', 1, 12, (v) => { state.cell = v; requestRender(); });
  bindPair('strengthRange', 'strengthVal', 0, 150, (v) => { state.strength = v / 100; requestRender(); });
  bindPair('glitchRange', 'glitchVal', 0, 100, (v) => { state.glitch = v / 100; requestRender(); });
  bindPair('brightRange', 'brightVal', -100, 100, (v) => { state.qBright = v; requestRender(); });
  bindPair('contrRange', 'contrVal', -100, 100, (v) => { state.qContr = v; requestRender(); });
  bindPair('satRange', 'satVal', 0, 200, (v) => { state.qSat = v; requestRender(); });
  bindPair('threshRange', 'threshVal', -100, 100, (v) => { state.thresh = v; updateAlgoPanel(); requestRender(); });
  bindPair('seedRange', 'seedVal', 0, 99, (v) => { state.seed = v; requestRender(); });
  bindPair('extractCount', 'extractCountVal', 2, 16, (v) => { state.extractCount = v; });
  bindPair('kernelDiv', 'kernelDivVal', 1, 128, (v) => { state.kernelDiv = v || 16; requestRender(); });
  $('serpChk').onchange = (e) => { state.serpentine = e.target.checked; requestRender(); };
  $('temporalChk').onchange = (e) => {
    setTemporal(e.target.checked);
  };
  $('temporalChk').checked = state.temporal;
  const syncMotionBtn = () => {
    const b = $('motionBtn');
    if (b) b.textContent = state.temporal ? 'Motion: on' : 'Motion: off';
  };
  $('motionBtn').onclick = () => setTemporal(!state.temporal);
  function setTemporal(v) {
    state.temporal = v;
    $('temporalChk').checked = v;
    syncMotionBtn();
    stopAnimLoop();
    if (state.srcKind === 'video' || state.temporal) startAnimLoop();
    requestRender();
  }
  syncMotionBtn();
  const zoomCenter = (f) => {
    const wr = $('stageWrap').getBoundingClientRect();
    zoomAt(wr.left + wr.width / 2, wr.top + wr.height / 2, f);
  };
  $('zoomInBtn').onclick = () => zoomCenter(1.25);
  $('zoomOutBtn').onclick = () => zoomCenter(1 / 1.25);
  $('zoomFitBtn').onclick = () => { state.zoomMode = 'fit'; applyZoom(false); scheduleSave(); };
  $('zoom100Btn').onclick = () => { state.zoomMode = 'manual'; state.zoomScale = 1; applyZoom(false); scheduleSave(); };
  window.addEventListener('resize', () => { if (sourceReady && state.zoomMode === 'fit') applyZoom(false); });
  // scroll to zoom (keeps viewport center), drag to pan
  $('stageWrap').addEventListener('wheel', (e) => {
    if (!sourceReady) return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    zoomAt(e.clientX, e.clientY, Math.pow(1.0015, -dy));
  }, { passive: false });
  (() => {
    const wrap = $('stageWrap');
    let dragging = false, sx = 0, sy = 0, sl = 0, sTop = 0;
    wrap.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = true; sx = e.clientX; sy = e.clientY; sl = wrap.scrollLeft; sTop = wrap.scrollTop;
      wrap.classList.add('panning');
    });
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      wrap.scrollLeft = sl - (e.clientX - sx);
      wrap.scrollTop = sTop - (e.clientY - sy);
    });
    window.addEventListener('pointerup', () => { dragging = false; wrap.classList.remove('panning'); });
  })();
  $('exportSizeSel').onchange = (e) => { state.exportSize = e.target.value; scheduleSave(); };

  $('algoSearch').addEventListener('input', (e) => renderAlgoList(e.target.value));
  $('noDitherBtn').onclick = () => disableDither();
  $('resetBtn').onclick = () => resetToDefaults();
  $('kernelText').addEventListener('input', (e) => { state.kernelText = e.target.value; requestRender(); });
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
  $('copyPalBtn').onclick = () => {
    const pal = activePalette();
    if (pal.levels) { toast('Truecolor has no fixed list to copy'); return; }
    const txt = pal.colors.join('\n');
    navigator.clipboard.writeText(txt).then(() => toast('Palette copied'), () => toast('Copy blocked'));
  };
  $('dlPalBtn').onclick = () => {
    const pal = activePalette();
    if (pal.levels) { toast('Truecolor has no fixed list to save'); return; }
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

  // duotone (two-color mode)
  $('duoChk').onchange = (e) => { state.duoOn = e.target.checked; $('duoNote').hidden = !state.duoOn; renderPaletteGrid(); requestRender(); };
  $('duoDark').oninput = (e) => { state.duoDark = e.target.value; if (state.duoOn) requestRender(); };
  $('duoLight').oninput = (e) => { state.duoLight = e.target.value; if (state.duoOn) requestRender(); };
  $('duoDark').onchange = () => { renderPaletteGrid(); requestRender(); };
  $('duoLight').onchange = () => { renderPaletteGrid(); requestRender(); };

  // export
  $('exportPngBtn').onclick = () => doExport('png');
  $('exportJpgBtn').onclick = () => doExport('jpg');
  $('exportSvgBtn').onclick = () => doExport('svg');
  $('exportTxtBtn').onclick = () => doExport('txt');
  $('copyBtn').onclick = copyToClipboard;
  $('recordBtn').onclick = toggleRecord;

  // compare (hold)
  const cmp = $('compareBtn');
  const on = (e) => { e.preventDefault(); if (!sourceReady) return; state.comparing = true; render(); };
  const off = () => { if (!state.comparing) return; state.comparing = false; requestRender(); };
  cmp.addEventListener('pointerdown', on);
  window.addEventListener('pointerup', off);
  $('splitBtn').onclick = () => {
    state.split = !state.split;
    $('splitBtn').classList.toggle('active', state.split);
    if (state.split) toast('Split view: drag the divider');
    enableSplitDrag(); requestRender();
  };
  enableSplitDrag();

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

  // defaults (restored memory or factory state) — one sync point for sliders + typeable numbers
  syncAllControls();
  const sel = document.querySelector('.pal.sel');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

document.addEventListener('DOMContentLoaded', init);
window.addEventListener('beforeunload', saveNow);

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
