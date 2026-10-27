/* InstantManiaRetoucher - Seleksi per-area (Wajah, Kulit, Kulit tubuh, Rambut, Pakaian, Latar).
   Cara kerja:
   - "Deteksi area" memakai model MediaPipe Multi-class selfie segmentation (jalan di browser).
   - Bar "Area aktif" di atas panel: pilih Seluruh foto atau satu area. Semua slider/tool yang sudah ada
     langsung bekerja hanya di area itu (seleksi tetap aktif di menu mana pun) sampai kamu memilih Seluruh foto lagi.
   - Tiap area punya pengaturan sendiri dan tetap tersimpan; hasil akhir = seluruh foto, lalu tiap area ditumpuk di dalam mask-nya.
   - Mask area dirapikan dengan guided filter dan bisa diperbaiki dengan kuas Pulihkan/Hapus ([ dan ] mengatur ukuran). */
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
function irAreasReset(p) {   // dipanggil saat ukuran/arah foto berubah (crop, putar): mask lama tidak berlaku lagi
  p.areas = null; p._ac = null; p.ast = [];
  if (typeof freeAreaTex === "function") freeAreaTex(p);
  if (p === cur && ACT !== "all") { ACT = "all"; syncUI(); draw(); }
}
window.irAreasReset = irAreasReset;

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
    const seg = await loadSeg();
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
    if (typeof freeAreaTex === "function") freeAreaTex(p);
    draw(p);
    return true;
  } catch (e) {
    msg("Gagal mendeteksi area: " + (e && e.message || e) + ". Cek koneksi internet lalu coba lagi.");
    return false;
  }
}

/* ---------- Bar "Area aktif" ---------- */
const st = document.createElement("style");
st.textContent = `#areabar{position:sticky;top:0;z-index:20;padding:8px 6px 10px;margin:0 0 6px;border-bottom:1px solid #333}
#areabar .ttl{font-size:12px;color:#9aa0a6;margin:0 0 6px}
.archips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}
.archips button{padding:5px 9px;font-size:12px}
.archips button.on{border-color:#ff7a1a;color:#fff;background:#2a2d30}
.archips button:disabled{opacity:.4}
#areabar .w{margin-top:6px}
#areabar .note{font-size:11px;line-height:1.35;color:#8a8f94;margin:6px 0 0}
#areabar .now{font-size:12px;margin:2px 0 6px;color:#ddd}`;
document.head.appendChild(st);
const bar = document.createElement("div");
bar.id = "areabar";
const pbg = getComputedStyle(panel).backgroundColor;
bar.style.background = pbg && pbg !== "rgba(0, 0, 0, 0)" ? pbg : "#1b1b1b";
bar.innerHTML = '<div class="ttl">Area aktif: slider di bawah bekerja di area ini</div>' +
  '<div class="archips" id="ar_chips"></div>' +
  '<div id="ar_main"><button id="ar_det" class="w" disabled>Deteksi area (AI)</button><button id="ar_all" class="w" disabled>Deteksi semua yang tercentang</button>' +
  '<div class="note" id="ar_note">Deteksi dulu, lalu pilih Wajah, Kulit, Rambut, atau Pakaian. Paling akurat untuk foto potret.</div></div>' +
  '<div id="ar_edit" style="display:none"><div class="now">Mengedit: <b id="ar_name"></b></div>' +
  '<button id="ar_unsel" class="w">✕ Batalkan seleksi (kembali ke seluruh foto)</button>' +
  '<button id="ar_vis" class="w">Tampilkan seleksi: mati</button>' +
  '<button id="ar_pr" class="w">Kuas pulihkan: mati</button><button id="ar_pe" class="w">Kuas hapus: mati</button>' +
  '<div class="row"><span>Ukuran kuas</span><output id="o_asize">4</output><input id="asize" type="range" min="0.5" max="20" step="0.5" value="4" aria-label="Ukuran kuas area"></div>' +
  '<button id="ar_clr" class="w">Hapus goresan area ini</button>' +
  '<div class="note">Tombol [ mengecilkan dan ] membesarkan kuas. Perbesar foto dengan scroll untuk goresan presisi.</div></div>';
panel.prepend(bar);
paint($("asize"));
const aEl = id => bar.querySelector("#" + id);
const NAMES = { all: "Seluruh foto" }; AREAS.forEach(([k, n]) => { NAMES[k] = n; });
const chips = {};
[["all", "Seluruh foto"], ...AREAS].forEach(([id, name]) => {
  const b = document.createElement("button");
  b.type = "button"; b.textContent = name; b.dataset.id = id;
  b.onclick = () => setAct(id);
  aEl("ar_chips").appendChild(b); chips[id] = b;
});

function setAct(id) {
  if (id !== "all" && (!cur || !cur.areas)) { msg("Klik Deteksi area dulu."); return; }
  if (!cur) return;
  if (id === "all") toolOff();
  ACT = id; layerOf(cur, id);
  syncUI(); draw(); refresh();
  msg(id === "all" ? "Seluruh foto dipilih: slider bekerja di seluruh foto."
    : `Area aktif: ${NAMES[id]}. Semua slider hanya bekerja di area ini sampai kamu memilih Seluruh foto.`);
}
function refresh() {
  const has = !!(cur && cur.areas);
  Object.keys(chips).forEach(id => {
    const b = chips[id], on = ACT === id;
    b.classList.toggle("on", on);
    b.disabled = id !== "all" && !has;
    const l = cur && cur.L && cur.L.find(x => x.id === id);
    b.textContent = NAMES[id] + (id !== "all" && l && layerActive(l) ? " •" : "");
  });
  aEl("ar_det").disabled = !cur || busy;
  aEl("ar_all").disabled = busy || !photos.some(p => p.on);
  aEl("ar_main").style.display = ACT === "all" ? "" : "none";
  aEl("ar_edit").style.display = ACT === "all" ? "none" : "";
  aEl("ar_name").textContent = NAMES[ACT] || "";
  aEl("ar_note").textContent = has ? "Area terdeteksi. Pilih Wajah, Kulit, Rambut, atau Pakaian di atas. Tanda • berarti area itu sudah diedit." : "Deteksi dulu, lalu pilih Wajah, Kulit, Rambut, atau Pakaian. Paling akurat untuk foto potret.";
  aEl("ar_det").textContent = has ? "Deteksi ulang area" : "Deteksi area (AI)";
}
aEl("ar_det").onclick = async () => {
  if (!cur || busy) return;
  busy = true; const ok = await detect(cur); busy = false;
  if (ok) msg("Area terdeteksi. Pilih Wajah, Kulit, Rambut, atau Pakaian di bar atas."); refresh();
};
aEl("ar_all").onclick = async () => {
  if (busy) return;
  const keep = idx, L = photos.map((p, i) => i).filter(i => photos[i].on);
  for (let n = 0; n < L.length; n++) {
    await select(L[n]); busy = true; msg(`Mendeteksi area ${n + 1}/${L.length}...`);
    const ok = await detect(photos[L[n]]); busy = false;
    if (!ok) { refresh(); return; }
  }
  await select(keep); msg(`Area terdeteksi di ${L.length} foto.`); refresh();
};
aEl("ar_unsel").onclick = () => setAct("all");
aEl("ar_clr").onclick = () => {
  if (!cur || ACT === "all") return;
  const n = (cur.ast || []).length;
  cur.ast = (cur.ast || []).filter(s => s.a !== ACT);
  if (cur._ac) cur._ac[ACT] = null;
  if (cur.ast.length !== n) { draw(); if (window.irHistoryCommit) window.irHistoryCommit(); msg("Goresan area ini dihapus."); }
};

/* ---------- Tampilkan seleksi (lapisan merah transparan) ---------- */
const sov = document.createElement("canvas");
sov.style.cssText = "position:absolute;display:none;pointer-events:none;z-index:3";
$("zw").appendChild(sov);
const tmpS = mkCv(1, 1);
function placeOv(o) {
  const v = out.style.display === "block" ? out : cv;
  if (!v.clientWidth) return false;
  Object.assign(o.style, { left: v.offsetLeft + "px", top: v.offsetTop + "px", width: v.clientWidth + "px", height: v.clientHeight + "px" });
  if (o.width !== v.clientWidth) o.width = v.clientWidth;
  if (o.height !== v.clientHeight) o.height = v.clientHeight;
  return true;
}
function paintSel() {
  const on = AR.show && ACT !== "all" && cur && cur.areas;
  sov.style.display = on ? "block" : "none";
  if (!on || !placeOv(sov)) return;
  const A = areaCanvas(cur, ACT, cv.width, cv.height);
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
aEl("ar_vis").onclick = () => { AR.show = !AR.show; sov._k = null; aEl("ar_vis").textContent = "Tampilkan seleksi: " + (AR.show ? "nyala" : "mati"); paintSel(); };

/* ---------- Kuas area ---------- */
const aov = document.createElement("canvas");
aov.style.cssText = "position:absolute;display:none;touch-action:none;cursor:none;z-index:4";
$("zw").appendChild(aov);
function ring(e) {
  const c = aov.getContext("2d"); c.clearRect(0, 0, aov.width, aov.height);
  if (!e) return;
  const r = aov.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * aov.width, y = (e.clientY - r.top) / r.height * aov.height;
  c.beginPath(); c.arc(x, y, +$("asize").value / 200 * aov.width, 0, 7);
  c.lineWidth = 1.5; c.strokeStyle = AR.tool === "r" ? "rgba(60,220,120,.95)" : "rgba(255,80,70,.95)"; c.stroke();
  c.lineWidth = .8; c.strokeStyle = "rgba(0,0,0,.6)"; c.stroke();
}
function toolOff() { if (AR.tool) setTool(AR.tool); }
window.irAreaToolOff = toolOff;
function setTool(t) {
  AR.tool = AR.tool === t ? null : t;
  if (AR.tool) {
    if (typeof BG !== "undefined" && BG.tool) setTool_bg();
    if (typeof brush !== "undefined" && brush) $("gbrush").onclick();
  }
  aEl("ar_pr").textContent = "Kuas pulihkan: " + (AR.tool === "r" ? "nyala" : "mati");
  aEl("ar_pe").textContent = "Kuas hapus: " + (AR.tool === "e" ? "nyala" : "mati");
  aov.style.display = AR.tool && ACT !== "all" ? "block" : "none";
  if (AR.tool) { placeOv(aov); ring(null); }
}
function setTool_bg() { if (typeof setTool === "function" && typeof BG !== "undefined") { /* tombol Latar punya fungsi setTool sendiri */ } }
aEl("ar_pr").onclick = () => { if (ACT !== "all") setTool("r"); };
aEl("ar_pe").onclick = () => { if (ACT !== "all") setTool("e"); };
const apt = e => { const r = aov.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
let rafA = 0; const rafDraw = () => { if (rafA) return; rafA = requestAnimationFrame(() => { rafA = 0; if (cur) draw(cur); }); };
function liveArea(s, from) {
  const W = cv.width, H = cv.height, A = areaCanvas(cur, ACT, W, H);
  if (!A) return;
  strokeDraw(A.getContext("2d"), { m: s.m, r: s.r, pts: s.pts.slice(Math.max(0, from)) }, W, H);
  A._v = ++VC; rafDraw();
}
let lastE = null;
aov.addEventListener("pointerdown", e => {
  if (e.button === 1) return;
  e.stopPropagation();
  if (e.button !== 0 || !AR.tool || !cur || !cur.areas || ACT === "all") return;
  e.preventDefault(); aov.setPointerCapture(e.pointerId);
  AR.cur = { a: ACT, m: AR.tool, r: +$("asize").value / 200, pts: [apt(e)] }; liveArea(AR.cur, 0);
});
aov.addEventListener("pointermove", e => {
  lastE = e; ring(e);
  if (!AR.cur) return;
  AR.cur.pts.push(apt(e)); liveArea(AR.cur, AR.cur.pts.length - 2);
});
aov.addEventListener("dblclick", e => e.stopPropagation());
aov.addEventListener("pointerleave", () => { if (!AR.cur) ring(null); });
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
  if (nv !== v) { el.value = nv; el.dispatchEvent(new Event("input", { bubbles: true })); ring(lastE); }
});

/* Putar foto: mask area tidak berlaku lagi (dijalankan sebelum handler tombol Putar). */
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("#rot");
  if (b && !b.disabled && cur && cur.areas) irAreasReset(cur);
}, true);

/* ---------- Pemeliharaan berkala ---------- */
setInterval(() => {
  photos.forEach(p => { if (p !== cur && p._ac) { p._ac = null; if (typeof freeAreaTex === "function") freeAreaTex(p); } });
  if (cur) ensureLayers(cur);
  if (ACT !== "all" && (!cur || !cur.areas)) { ACT = "all"; toolOff(); if (cur) { syncUI(); draw(); } msg("Foto ini belum dideteksi areanya, kembali ke seluruh foto."); }
  if (AR.tool && (ACT === "all" || (typeof brush !== "undefined" && brush))) toolOff();
  if (AR.tool) { aov.style.display = cur && cur.areas && ACT !== "all" ? "block" : "none"; if (!AR.cur) placeOv(aov); }
  paintSel(); refresh();
}, 250);
refresh();
