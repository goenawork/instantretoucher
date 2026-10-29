/* InstantManiaRetoucher - Selection (seleksi per-area): Face, Skin, Body Skin, Hair, Clothes, Background.
   Cara kerja:
   - "Detect Areas" memakai model MediaPipe Multi-class selfie segmentation (jalan di browser).
   - Di panel Selection pilih Entire Photo atau satu area. Semua slider/tool yang sudah ada langsung bekerja
     hanya di area itu, di menu kategori mana pun, sampai kamu memilih Entire Photo lagi (deselect).
   - Tiap area punya pengaturan sendiri dan tetap tersimpan. Hasil akhir = seluruh foto, lalu tiap area ditumpuk di dalam mask-nya.
   - Mask area dirapikan dengan guided filter dan bisa diperbaiki dengan kuas Restore/Erase ([ dan ] mengatur ukuran). */
(function () {
  "use strict";

  const AR = { seg: null, tool: null, show: false, cur: null };
  let VC = 0;                                   // nomor versi kanvas mask (agar GPU tahu kapan perlu unggah ulang)
  const MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite";
  const CLASSES = ["bg", "hair", "body", "face", "clothes", "other"];   // urutan kelas model
  const mkCv = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };

  /* ---------- Mask area ---------- */
  function rawFor(p, id) {
    const C = p.areas.c;
    if (id === "skin") { const a = C.face, b = C.body, o = new Uint8Array(a.length); for (let i = 0; i < o.length; i++) o[i] = a[i] > b[i] ? a[i] : b[i]; return o; }
    return C[id];
  }
  function areaKey(p, id, W, H) {
    const sk = (p.ast || []).filter(s => s.a === id);
    return [W, H, sk.length, sk.reduce((a, s) => a + s.pts.length, 0), p._av || 0].join();
  }
  /* Kanvas alfa (W×H) untuk satu area: matte kasar -> ditajamkan dengan foto asli -> goresan kuas. Disimpan di cache. */
  function areaCanvas(p, id, W, H) {
    if (!p.areas || !p.areas.c) return null;
    const A = p._ac || (p._ac = {}), key = areaKey(p, id, W, H);
    let e = A[id];
    if (e && e.k === key && e.c.width === W && e.c.height === H) return e.c;
    const { w, h } = p.areas, raw = rawFor(p, id);
    if (!raw) return null;
    const small = mkCv(w, h), sg = small.getContext("2d"), simg = sg.createImageData(w, h);
    for (let i = 0; i < w * h; i++) simg.data[i * 4 + 3] = raw[i];
    sg.putImageData(simg, 0, 0);
    const s = Math.min(1, 1600 / Math.max(W, H)), w2 = Math.max(1, Math.round(W * s)), h2 = Math.max(1, Math.round(H * s)), n = w2 * h2;
    const t = mkCv(w2, h2), tg = t.getContext("2d", { willReadFrequently: true });
    tg.imageSmoothingQuality = "high"; tg.drawImage(small, 0, 0, w2, h2);
    const M = tg.getImageData(0, 0, w2, h2).data;
    tg.clearRect(0, 0, w2, h2); tg.drawImage(wc, 0, 0, w2, h2);
    const G = tg.getImageData(0, 0, w2, h2).data, I = new Float32Array(n), P = new Float32Array(n);
    for (let i = 0; i < n; i++) { I[i] = (.2126 * G[i * 4] + .7152 * G[i * 4 + 1] + .0722 * G[i * 4 + 2]) / 255; P[i] = M[i * 4 + 3] / 255; }
    const P0 = Float32Array.from(P), Q = guided(I, P, w2, h2, Math.max(2, Math.round(Math.max(w2, h2) / 250)), 3e-4);
    const oi = tg.createImageData(w2, h2);
    for (let i = 0; i < n; i++) oi.data[i * 4 + 3] = (P0[i] * .35 + Q[i] * .65) * 255;
    tg.putImageData(oi, 0, 0);
    const c = e && e.c.width === W && e.c.height === H ? e.c : mkCv(W, H), cg = c.getContext("2d");
    cg.globalCompositeOperation = "source-over"; cg.clearRect(0, 0, W, H);
    cg.imageSmoothingQuality = "high"; cg.drawImage(t, 0, 0, W, H);
    (p.ast || []).filter(st => st.a === id).forEach(st => strokeDraw(cg, st, W, H));
    c._v = ++VC; A[id] = { k: key, c };
    return c;
  }
  window.irAreaCanvas = areaCanvas;
  function areasReset(p) {   // dipanggil saat ukuran/arah foto berubah (crop, putar): mask lama tidak berlaku lagi
    p.areas = null; p._ac = null; p.ast = [];
    irFreeAreaTex(p);
    if (p === cur && irACT !== "all") { irACT = "all"; syncUI(); draw(); }
  }
  window.irAreasReset = areasReset;

  /* ---------- Deteksi (MediaPipe) ---------- */
  async function loadSeg() {
    if (AR.seg) return AR.seg;
    msg("Memuat model AI area. Pertama kali butuh unduhan, setelah itu lebih cepat.");
    let mod = null, ver = null, err = null;
    for (const v of ["0.10.21", "0.10.22", "0.10.18", "latest"]) {
      try { mod = await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${v}/vision_bundle.mjs`); ver = v; break; } catch (e) { err = e; }
    }
    if (!mod) throw err || new Error("library tidak bisa dimuat");
    const fs = await mod.FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${ver}/wasm`);
    const make = d => mod.ImageSegmenter.createFromOptions(fs, {
      baseOptions: { modelAssetPath: MODEL, delegate: d }, runningMode: "IMAGE", outputCategoryMask: false, outputConfidenceMasks: true
    });
    try { AR.seg = await make("GPU"); } catch (e) { AR.seg = await make("CPU"); }
    return AR.seg;
  }
  async function detect(p) {
    try {
      const seg = AR.fake || await loadSeg();
      msg("Mendeteksi area...");
      await new Promise(r => setTimeout(r, 30));
      const k = Math.min(1, 640 / Math.max(wc.width, wc.height)), sc = mkCv(Math.max(1, Math.round(wc.width * k)), Math.max(1, Math.round(wc.height * k)));
      sc.getContext("2d").drawImage(wc, 0, 0, sc.width, sc.height);
      let res = null; const ret = seg.segment(sc, r => { res = r; }); res = res || ret;
      const ms = res.confidenceMasks;
      if (!ms || ms.length < 6) throw new Error("model tidak mengembalikan 6 kelas");
      const w = ms[0].width, h = ms[0].height, C = {};
      ms.forEach((m, i) => {
        const f = m.getAsFloat32Array(), u = new Uint8Array(f.length);
        for (let j = 0; j < f.length; j++) { const v = Math.round(f[j] * 255); u[j] = v < 0 ? 0 : v > 255 ? 255 : v; }
        C[CLASSES[i]] = u;
      });
      ms.forEach(m => { if (m.close) m.close(); }); if (res.close) res.close();
      p.areas = { w, h, c: C }; p._ac = null; p.ast = p.ast || []; p._av = (p._av || 0) + 1;
      irFreeAreaTex(p);
      draw(p);
      return true;
    } catch (e) {
      msg("Gagal mendeteksi area: " + (e && e.message || e) + ". Cek koneksi internet lalu coba lagi.");
      return false;
    }
  }
  window.irAreaTest = { setSeg(s) { AR.fake = s; }, detect };
  window.irDetectAreas = detect;
  window.irAreaThumb = function (p, id, W, H) {   // mask area kasar berukuran kecil, khusus thumbnail
    if (!p.areas || !p.areas.c) return null;
    const raw = rawFor(p, id); if (!raw) return null;
    const { w, h } = p.areas, s = mkCv(w, h), g = s.getContext("2d"), im = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++) im.data[i * 4 + 3] = raw[i];
    g.putImageData(im, 0, 0);
    const c = mkCv(W, H), cg = c.getContext("2d"); cg.imageSmoothingQuality = "high"; cg.drawImage(s, 0, 0, W, H);
    (p.ast || []).filter(st => st.a === id).forEach(st => strokeDraw(cg, st, W, H));
    return c;
  };   // dipakai untuk pengujian

  /* ---------- Panel Selection ---------- */
  const st = document.createElement("style");
  st.textContent = `#areabar .ttl{font-size:12px;color:#9aa0a6;margin:0 0 6px}
.archips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}
.archips button{padding:5px 9px;font-size:12px}
.archips button.on{border-color:#ff7a1a;color:#fff;background:#2a2d30}
.archips button:disabled{opacity:.4}
#areabar .w{margin-top:6px}
#areabar .note{font-size:11px;line-height:1.35;color:#8a8f94;margin:6px 0 0}
#areabar .now{font-size:12px;margin:2px 0 6px;color:#ddd}
#arbanner{display:none;align-items:center;gap:8px;padding:6px 10px;margin:0 0 6px;border-radius:8px;background:#2b1d12;border:1px solid #ff7a1a;font-size:12px;color:#ffd9bd}
#arbanner b{color:#fff}
#arbanner button{margin-left:auto;padding:3px 8px;font-size:11px}`;
  document.head.appendChild(st);

  const bar = document.createElement("div");
  bar.id = "areabar";
  bar.innerHTML = '<div class="ttl">Active area: every slider in the other tabs works only inside the selected area</div>' +
    '<div class="archips" id="ar_chips"></div>' +
    '<div id="ar_main"><button id="ar_det" class="w" disabled>Detect Areas (AI)</button><button id="ar_all" class="w" disabled>Detect All Checked</button>' +
    '<div class="note" id="ar_note"></div></div>' +
    '<div id="ar_edit" style="display:none"><div class="now">Editing: <b id="ar_name"></b></div>' +
    '<button id="ar_unsel" class="w">✕ Deselect (back to entire photo)</button>' +
    '<button id="ar_vis" class="w">Show selection: off</button>' +
    '<button id="ar_pr" class="w">Restore brush: off</button><button id="ar_pe" class="w">Erase brush: off</button>' +
    '<div class="row"><span>Brush size</span><output id="o_asize">4</output><input id="asize" type="range" min="0.5" max="20" step="0.5" value="4" aria-label="Area brush size"></div>' +
    '<button id="ar_clr" class="w">Clear strokes for this area</button>' +
    '<div class="note">Press [ to shrink and ] to enlarge the brush. Scroll to zoom for precise strokes.</div></div>';
  const banner = document.createElement("div");
  banner.id = "arbanner";
  banner.innerHTML = '<span>Editing area: <b id="arb_name"></b></span><button type="button" id="arb_x">✕ Deselect</button>';
  window.irSelectionEl = bar; window.irBannerEl = banner;
  panel.prepend(bar); panel.prepend(banner);   // tabs.js memindahkan keduanya ke tempat yang benar
  paint($("asize"));
  const aEl = id => bar.querySelector("#" + id);
  const NAMES = { all: "Entire Photo" }; irAREAS.forEach(([k, n]) => { NAMES[k] = n; });
  const chips = {};
  [["all", "Entire Photo"], ...irAREAS].forEach(([id, name]) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = name; b.dataset.id = id;
    b.onclick = () => setAct(id);
    aEl("ar_chips").appendChild(b); chips[id] = b;
  });

  function setAct(id) {
    if (id !== "all" && (!cur || !cur.areas)) { msg("Klik Detect Areas dulu."); return; }
    if (!cur) return;
    if (id === "all") toolOff();
    irACT = id; irLayerOf(cur, id);
    syncUI(); draw(); uiSync();
    msg(id === "all" ? "Entire Photo dipilih: slider bekerja di seluruh foto."
      : `Area aktif: ${NAMES[id]}. Semua slider hanya bekerja di area ini sampai kamu memilih Entire Photo.`);
  }
  window.irSetAct = setAct;
  function uiSync() {
    const has = !!(cur && cur.areas);
    Object.keys(chips).forEach(id => {
      const b = chips[id], on = irACT === id;
      b.classList.toggle("on", on);
      b.disabled = id !== "all" && !has;
      const l = cur && cur.L && cur.L.find(x => x.id === id);
      b.textContent = NAMES[id] + (id !== "all" && l && irLayerActive(l) ? " •" : "");
    });
    aEl("ar_det").disabled = !cur || busy;
    aEl("ar_all").disabled = busy || !photos.some(p => p.on);
    aEl("ar_main").style.display = irACT === "all" ? "" : "none";
    aEl("ar_edit").style.display = irACT === "all" ? "none" : "";
    aEl("ar_name").textContent = NAMES[irACT] || "";
    aEl("ar_note").textContent = has ? "Areas detected. Pick Face, Skin, Hair, or Clothes above. A • means that area already has edits." : "Detect first, then pick Face, Skin, Hair, or Clothes. Most accurate on portraits.";
    aEl("ar_det").textContent = has ? "Re-detect Areas" : "Detect Areas (AI)";
    banner.style.display = irACT === "all" ? "none" : "flex";
    banner.querySelector("#arb_name").textContent = NAMES[irACT] || "";
  }
  banner.querySelector("#arb_x").onclick = () => setAct("all");
  aEl("ar_det").onclick = async () => {
    if (!cur || busy) return;
    busy = true; const ok = await detect(cur); busy = false;
    if (ok) msg("Area terdeteksi. Pilih Face, Skin, Hair, atau Clothes di panel Selection."); uiSync();
  };
  aEl("ar_all").onclick = async () => {
    if (busy) return;
    const keep = idx, L = photos.map((p, i) => i).filter(i => photos[i].on);
    for (let n = 0; n < L.length; n++) {
      await select(L[n]); busy = true; msg(`Mendeteksi area ${n + 1}/${L.length}...`);
      const ok = await detect(photos[L[n]]); busy = false;
      if (!ok) { uiSync(); return; }
    }
    await select(keep); msg(`Area terdeteksi di ${L.length} foto.`); uiSync();
  };
  aEl("ar_unsel").onclick = () => setAct("all");
  aEl("ar_clr").onclick = () => {
    if (!cur || irACT === "all") return;
    const n = (cur.ast || []).length;
    cur.ast = (cur.ast || []).filter(s => s.a !== irACT);
    if (cur._ac) cur._ac[irACT] = null;
    if (cur.ast.length !== n) { draw(); if (window.irHistoryCommit) window.irHistoryCommit(); msg("Goresan area ini dihapus."); }
  };

  /* ---------- Show selection (lapisan merah transparan) ---------- */
  const sov = document.createElement("canvas");
  sov.style.cssText = "position:absolute;display:none;pointer-events:none;z-index:3";
  $("zw").appendChild(sov);
  const tmpS = mkCv(1, 1);
  function placeA(o) {
    const v = out.style.display === "block" ? out : cv;
    if (!v.clientWidth) return false;
    Object.assign(o.style, { left: v.offsetLeft + "px", top: v.offsetTop + "px", width: v.clientWidth + "px", height: v.clientHeight + "px" });
    if (o.width !== v.clientWidth) o.width = v.clientWidth;
    if (o.height !== v.clientHeight) o.height = v.clientHeight;
    return true;
  }
  function paintSel() {
    const on = AR.show && irACT !== "all" && cur && cur.areas;
    sov.style.display = on ? "block" : "none";
    if (!on || !placeA(sov)) return;
    const A = areaCanvas(cur, irACT, cv.width, cv.height);
    if (!A) return;
    const key = A._v + ":" + sov.width + "x" + sov.height;
    if (sov._k === key) return;
    sov._k = key;
    if (tmpS.width !== sov.width) tmpS.width = sov.width; if (tmpS.height !== sov.height) tmpS.height = sov.height;
    const t = tmpS.getContext("2d");
    t.globalCompositeOperation = "source-over"; t.clearRect(0, 0, tmpS.width, tmpS.height);
    t.fillStyle = "rgba(255,50,60,.55)"; t.fillRect(0, 0, tmpS.width, tmpS.height);
    t.globalCompositeOperation = "destination-in"; t.drawImage(A, 0, 0, tmpS.width, tmpS.height);
    const g = sov.getContext("2d"); g.clearRect(0, 0, sov.width, sov.height); g.drawImage(tmpS, 0, 0);
  }
  aEl("ar_vis").onclick = () => { AR.show = !AR.show; sov._k = null; aEl("ar_vis").textContent = "Show selection: " + (AR.show ? "on" : "off"); paintSel(); };

  /* ---------- Kuas area ---------- */
  const aov = document.createElement("canvas");
  aov.style.cssText = "position:absolute;display:none;touch-action:none;cursor:none;z-index:4";
  $("zw").appendChild(aov);
  function ringA(e) {
    const c = aov.getContext("2d"); c.clearRect(0, 0, aov.width, aov.height);
    if (!e) return;
    const r = aov.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * aov.width, y = (e.clientY - r.top) / r.height * aov.height;
    c.beginPath(); c.arc(x, y, +$("asize").value / 200 * aov.width, 0, 7);
    c.lineWidth = 1.5; c.strokeStyle = AR.tool === "r" ? "rgba(60,220,120,.95)" : "rgba(255,80,70,.95)"; c.stroke();
    c.lineWidth = .8; c.strokeStyle = "rgba(0,0,0,.6)"; c.stroke();
  }
  function toolOff() { if (AR.tool) setToolA(AR.tool); }
  window.irAreaToolOff = toolOff;
  function setToolA(t) {
    AR.tool = AR.tool === t ? null : t;
    if (AR.tool) {
      if (window.irBgToolOff) window.irBgToolOff();
      if (typeof brush !== "undefined" && brush) $("gbrush").onclick();
    }
    aEl("ar_pr").textContent = "Restore brush: " + (AR.tool === "r" ? "on" : "off");
    aEl("ar_pe").textContent = "Erase brush: " + (AR.tool === "e" ? "on" : "off");
    aov.style.display = AR.tool && irACT !== "all" ? "block" : "none";
    if (AR.tool) { placeA(aov); ringA(null); }
  }
  aEl("ar_pr").onclick = () => { if (irACT !== "all") setToolA("r"); };
  aEl("ar_pe").onclick = () => { if (irACT !== "all") setToolA("e"); };
  const apt = e => { const r = aov.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  let rafA = 0; const rafDraw = () => { if (rafA) return; rafA = requestAnimationFrame(() => { rafA = 0; if (cur) draw(cur); }); };
  function liveArea(s, from) {
    const W = cv.width, H = cv.height, A = areaCanvas(cur, irACT, W, H);
    if (!A) return;
    strokeDraw(A.getContext("2d"), { m: s.m, r: s.r, pts: s.pts.slice(Math.max(0, from)) }, W, H);
    A._v = ++VC; rafDraw();
  }
  let lastE = null;
  aov.addEventListener("pointerdown", e => {
    if (e.button === 1) return;
    e.stopPropagation();
    if (e.button !== 0 || !AR.tool || !cur || !cur.areas || irACT === "all") return;
    e.preventDefault(); aov.setPointerCapture(e.pointerId);
    AR.cur = { a: irACT, m: AR.tool, r: +$("asize").value / 200, pts: [apt(e)] }; liveArea(AR.cur, 0);
  });
  aov.addEventListener("pointermove", e => {
    lastE = e; ringA(e);
    if (!AR.cur) return;
    AR.cur.pts.push(apt(e)); liveArea(AR.cur, AR.cur.pts.length - 2);
  });
  aov.addEventListener("dblclick", e => e.stopPropagation());
  aov.addEventListener("pointerleave", () => { if (!AR.cur) ringA(null); });
  ["pointerup", "pointercancel"].forEach(ev => aov.addEventListener(ev, () => {
    if (!AR.cur || !cur) return;
    (cur.ast || (cur.ast = [])).push(AR.cur);
    const a = AR.cur.a; AR.cur = null;
    if (cur._ac && cur._ac[a]) cur._ac[a].k = areaKey(cur, a, cv.width, cv.height);
    if (window.irHistoryCommit) window.irHistoryCommit();
    msg("Goresan ditambahkan. Ctrl+Z untuk membatalkan.");
  }));
  $("asize").addEventListener("input", () => { $("o_asize").textContent = $("asize").value; });
  addEventListener("keydown", e => {
    if (!AR.tool || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === "TEXTAREA" || t.tagName === "SELECT" || (t.tagName === "INPUT" && !/^(range|checkbox|color|button)$/.test(t.type)))) return;
    const dir = e.code === "BracketLeft" ? -1 : e.code === "BracketRight" ? 1 : 0;
    if (!dir) return;
    const el = $("asize"), v = +el.value, stp = v < 2 ? .5 : v < 10 ? 1 : 2, nv = Math.min(+el.max, Math.max(+el.min, v + dir * stp));
    e.preventDefault();
    if (nv !== v) { el.value = nv; el.dispatchEvent(new Event("input", { bubbles: true })); ringA(lastE); }
  });

  /* Putar foto: mask area tidak berlaku lagi (dijalankan sebelum handler tombol Putar). */
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("#rot");
    if (b && !b.disabled && cur && cur.areas) areasReset(cur);
  }, true);

  /* ---------- Pemeliharaan berkala ---------- */
  setInterval(() => {
    photos.forEach(p => { if (p !== cur && p._ac) { p._ac = null; irFreeAreaTex(p); } });
    photos.forEach(p => irEnsureLayers(p));   // semua foto memakai sistem lapisan, supaya "Apply to checked" konsisten
    if (irACT !== "all" && (!cur || !cur.areas)) { irACT = "all"; toolOff(); if (cur) { syncUI(); draw(); } msg("Foto ini belum dideteksi areanya, kembali ke Entire Photo."); }
    if (AR.tool && (irACT === "all" || (typeof brush !== "undefined" && brush))) toolOff();
    if (AR.tool) { aov.style.display = cur && cur.areas && irACT !== "all" ? "block" : "none"; if (!AR.cur) placeA(aov); }
    paintSel(); uiSync();
  }, 250);
  uiSync();
})();
