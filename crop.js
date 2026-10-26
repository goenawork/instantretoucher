/* InstantManiaRetoucher - Crop.
   - Menu "Crop" di panel kanan: Mulai crop, pilih rasio (Bebas, Asli, 1:1, 2:3, 4:5, 5:7, 9:16), Balik orientasi.
   - Tarik sudut untuk mengubah ukuran, tarik isi kotak untuk menggeser. Enter = selesai, Esc = batal.
   - Hasil crop dipakai di tampilan dan di EXPORT / BATCH EXPORT (ukuran asli, tanpa mengecilkan).
   - p.crop = {x,y,w,h}, nilai 0..1 terhadap foto penuh yang sudah diputar. null = tanpa crop.
   - Crop mengubah ukuran foto, jadi hasil "Pisahkan subjek" dan goresan kilau pada foto itu direset. */
(function () {
  "use strict";

  const RAT = [
    { id: "free", label: "Bebas" }, { id: "orig", label: "Asli" },
    { id: "1:1", a: 1, b: 1, label: "1:1" }, { id: "2:3", a: 2, b: 3, label: "2:3" },
    { id: "4:5", a: 4, b: 5, label: "4:5" }, { id: "5:7", a: 5, b: 7, label: "5:7" },
    { id: "9:16", a: 9, b: 16, label: "9:16" }
  ];
  const MINPX = 24;
  let ratio = "free", flip = false, ed = null;
  const cl = (v, a, b) => Math.min(b, Math.max(a, v));
  const full = p => ({ w: p.rot % 2 ? p.h0 : p.w0, h: p.rot % 2 ? p.w0 : p.h0 });

  /* Rasio sasaran (lebar/tinggi) untuk sebuah foto. Orientasi mengikuti foto, "Balik" membaliknya. */
  function arOf(p) {
    if (ratio === "free") return null;
    const f = full(p), land = f.w >= f.h;
    let ar;
    if (ratio === "orig") ar = f.w / f.h;
    else { const r = RAT.find(x => x.id === ratio), base = r.a / r.b; ar = land ? 1 / base : base; }
    if (flip && Math.abs(ar - 1) > 1e-6) ar = 1 / ar;
    return ar;
  }
  function fitMax(f, ar, cx, cy) {
    let w = f.w, h = w / ar;
    if (h > f.h) { h = f.h; w = h * ar; }
    return { x: cl(cx - w / 2, 0, f.w - w), y: cl(cy - h / 2, 0, f.h - h), w, h };
  }
  const norm = (r, f) => {
    const c = { x: r.x / f.w, y: r.y / f.h, w: r.w / f.w, h: r.h / f.h };
    if (c.w > .999 && c.h > .999) return null;
    const q = v => Math.round(v * 1e5) / 1e5;
    return { x: q(c.x), y: q(c.y), w: q(c.w), h: q(c.h) };
  };
  function invalidate(p) {
    const had = !!p.mask;
    p.mask = null; p.mst = []; p._fa = p._fk = p._ref = null; p.faces = null; p.fmask = null; p._fp = null; p.glare.strokes = [];
    if (p === cur) $("bgopts").hidden = true;
    return had;
  }

  /* ---------- Panel ---------- */
  const st = document.createElement("style");
  st.textContent = `.cropg{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 8px}
.cropg button{padding:5px 9px;font-size:12px}
.cropg button.on{border-color:var(--accent);color:#fff;background:#2a2d30}
#cropinfo{font-size:12px;color:var(--mute);margin:6px 0 2px;min-height:16px}
#cropov .hd{position:absolute;width:14px;height:14px;background:#fff;border:2px solid var(--accent);box-sizing:border-box;border-radius:3px}`;
  document.head.appendChild(st);

  const sec = document.createElement("details");
  sec.className = "sec";
  sec.innerHTML = '<summary><span>Crop</span></summary><div class="body">' +
    '<button id="cr_go" class="w" disabled>Mulai crop</button>' +
    '<div class="cropg" id="cr_rat"></div>' +
    '<button id="cr_flip" class="w" disabled>⇄ Balik orientasi</button>' +
    '<div style="display:flex;gap:6px;margin-top:6px"><button id="cr_ok" class="w" disabled>Selesai (Enter)</button><button id="cr_no" class="w" disabled>Batal (Esc)</button></div>' +
    '<button id="cr_all" class="w" disabled>Terapkan rasio ke foto tercentang</button>' +
    '<button id="cr_del" class="w" disabled>Hapus crop foto ini</button>' +
    '<div id="cropinfo"></div></div>';
  panel.prepend(sec);
  const $c = id => sec.querySelector("#" + id);
  RAT.forEach(r => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = r.label; b.dataset.r = r.id;
    if (r.id === ratio) b.classList.add("on");
    b.onclick = () => { ratio = r.id; if (ed) applyRatio(true); ui(); };
    $c("cr_rat").appendChild(b);
  });

  /* ---------- Overlay di atas foto ---------- */
  const ov = document.createElement("div");
  ov.id = "cropov"; ov.hidden = true;
  ov.style.cssText = "position:absolute;touch-action:none;z-index:5";
  const box = document.createElement("div");
  box.style.cssText = "position:absolute;box-shadow:0 0 0 9999px rgba(0,0,0,.58);outline:1.5px solid #fff;cursor:move";
  [33.33, 66.66].forEach(p => {
    const v = document.createElement("div"), h = document.createElement("div");
    v.style.cssText = `position:absolute;top:0;bottom:0;left:${p}%;width:1px;background:rgba(255,255,255,.35);pointer-events:none`;
    h.style.cssText = `position:absolute;left:0;right:0;top:${p}%;height:1px;background:rgba(255,255,255,.35);pointer-events:none`;
    box.append(v, h);
  });
  const lab = document.createElement("div");
  lab.style.cssText = "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);padding:2px 8px;border-radius:10px;background:rgba(0,0,0,.6);color:#fff;font-size:12px;pointer-events:none;white-space:nowrap";
  box.appendChild(lab);
  const HS = { nw: [0, 0, "nwse-resize"], n: [50, 0, "ns-resize"], ne: [100, 0, "nesw-resize"], e: [100, 50, "ew-resize"],
    se: [100, 100, "nwse-resize"], s: [50, 100, "ns-resize"], sw: [0, 100, "nesw-resize"], w: [0, 50, "ew-resize"] };
  const hds = {};
  Object.keys(HS).forEach(k => {
    const h = document.createElement("div");
    h.className = "hd"; h.dataset.h = k;
    h.style.cssText = `left:${HS[k][0]}%;top:${HS[k][1]}%;cursor:${HS[k][2]}`;
    box.appendChild(h); hds[k] = h;
  });
  ov.appendChild(box);
  $("zw").appendChild(ov);

  function place() {   // samakan posisi overlay dengan kanvas foto yang tampil
    const v = out.style.display === "block" ? out : cv;
    ov.style.left = v.offsetLeft + "px"; ov.style.top = v.offsetTop + "px";
    ov.style.width = v.offsetWidth + "px"; ov.style.height = v.offsetHeight + "px";
    const sc = 1 / (typeof Z === "number" && Z > 0 ? Z : 1);
    Object.values(hds).forEach(h => { h.style.transform = `translate(-50%,-50%) scale(${sc})`; });
  }
  function paintBox() {
    if (!ed) return;
    const f = full(ed.p), r = ed.r;
    box.style.left = (r.x / f.w * 100) + "%"; box.style.top = (r.y / f.h * 100) + "%";
    box.style.width = (r.w / f.w * 100) + "%"; box.style.height = (r.h / f.h * 100) + "%";
    lab.textContent = `${Math.round(r.w)} × ${Math.round(r.h)}`;
    const locked = ratio !== "free";
    ["n", "e", "s", "w"].forEach(k => { hds[k].style.display = locked ? "none" : ""; });
    $c("cropinfo").textContent = `Kotak crop: ${Math.round(r.w)} × ${Math.round(r.h)} px`;
  }

  /* ---------- Interaksi ---------- */
  let drag = null;
  const toPx = e => {
    const rc = ov.getBoundingClientRect(), f = full(ed.p);
    return { x: (e.clientX - rc.left) / rc.width * f.w, y: (e.clientY - rc.top) / rc.height * f.h };
  };
  ov.addEventListener("pointerdown", e => {
    if (!ed) return;
    e.stopPropagation(); e.preventDefault();
    const h = e.target.dataset && e.target.dataset.h;
    if (!h && !box.contains(e.target)) return;
    drag = { h: h || "move", s: toPx(e), r0: { ...ed.r } };
    ov.setPointerCapture(e.pointerId);
  });
  ov.addEventListener("pointermove", e => {
    if (!ed || !drag) return;
    const f = full(ed.p), p = toPx(e), r0 = drag.r0, ar = arOf(ed.p);
    let r = { ...ed.r };
    if (drag.h === "move") {
      r.x = cl(r0.x + p.x - drag.s.x, 0, f.w - r0.w); r.y = cl(r0.y + p.y - drag.s.y, 0, f.h - r0.h);
    } else if (ar && drag.h.length === 2) {
      // sudut dengan rasio terkunci: sudut seberangnya jadi jangkar
      const ax = drag.h.includes("w") ? r0.x + r0.w : r0.x, ay = drag.h.includes("n") ? r0.y + r0.h : r0.y;
      const sx = p.x < ax ? -1 : 1, sy = p.y < ay ? -1 : 1;
      let w = Math.abs(p.x - ax), h = Math.abs(p.y - ay);
      if (w / ar > h) h = w / ar; else w = h * ar;
      const maxW = sx > 0 ? f.w - ax : ax, maxH = sy > 0 ? f.h - ay : ay;
      if (w > maxW) { w = maxW; h = w / ar; }
      if (h > maxH) { h = maxH; w = h * ar; }
      if (w < MINPX) { w = MINPX; h = w / ar; }
      r = { x: sx > 0 ? ax : ax - w, y: sy > 0 ? ay : ay - h, w, h };
    } else {
      // bebas: tiap sisi digeser sendiri-sendiri
      let L = r0.x, T = r0.y, R = r0.x + r0.w, B = r0.y + r0.h;
      if (drag.h.includes("w")) L = cl(p.x, 0, R - MINPX);
      if (drag.h.includes("e")) R = cl(p.x, L + MINPX, f.w);
      if (drag.h.includes("n")) T = cl(p.y, 0, B - MINPX);
      if (drag.h.includes("s")) B = cl(p.y, T + MINPX, f.h);
      r = { x: L, y: T, w: R - L, h: B - T };
    }
    ed.r = r; paintBox();
  });
  ["pointerup", "pointercancel"].forEach(ev => ov.addEventListener(ev, () => { drag = null; }));

  function applyRatio(keepCenter) {
    if (!ed) return;
    const f = full(ed.p), ar = arOf(ed.p), r = ed.r;
    if (ar) ed.r = fitMax(f, ar, r.x + r.w / 2, r.y + r.h / 2);
    paintBox();
  }

  /* ---------- Alur: mulai, selesai, batal, hapus ---------- */
  function ui() {
    $c("cr_rat").querySelectorAll("button").forEach(b => b.classList.toggle("on", b.dataset.r === ratio));
    const has = !!cur;
    $c("cr_go").disabled = !has || !!ed || busy;
    $c("cr_flip").disabled = !ed;
    $c("cr_ok").disabled = !ed;
    $c("cr_no").disabled = !ed;
    $c("cr_all").disabled = !has || ratio === "free" || busy;
    $c("cr_del").disabled = !has || !cur.crop || !!ed;
    $c("cr_go").textContent = cur && cur.crop ? "Ubah crop" : "Mulai crop";
    if (!ed) {
      if (cur && cur.crop) { const f = full(cur); $c("cropinfo").textContent = `Hasil crop: ${Math.round(cur.crop.w * f.w)} × ${Math.round(cur.crop.h * f.h)} px`; }
      else $c("cropinfo").textContent = "";
    }
  }
  async function reshow(p) { await show(p, PREV); fitView(); ui(); }

  async function enter() {
    if (!cur || busy || ed) return;
    if (typeof brush !== "undefined" && brush) { msg("Matikan kuas kilau dulu sebelum crop."); return; }
    const p = cur, f = full(p);
    p._cropEdit = true;
    ed = { p, r: p.crop ? { x: p.crop.x * f.w, y: p.crop.y * f.h, w: p.crop.w * f.w, h: p.crop.h * f.h } : { x: 0, y: 0, w: f.w, h: f.h } };
    sec.open = true;
    await reshow(p);
    ov.hidden = false; place(); if (ratio !== "free") applyRatio(); else paintBox();
    ui();
    msg("Mode crop: tarik sudut untuk mengubah ukuran, tarik isi kotak untuk menggeser. Enter = selesai, Esc = batal.");
  }
  async function leave(commit) {
    if (!ed) return;
    const p = ed.p, f = full(p), nc = commit ? norm(ed.r, f) : p.crop;
    const changed = JSON.stringify(nc || null) !== JSON.stringify(p.crop || null);
    let had = false;
    if (commit && changed) { p.crop = nc; had = invalidate(p); }
    p._cropEdit = false; ed = null; drag = null; ov.hidden = true;
    if (p === cur) await reshow(p); else ui();
    if (commit) msg(changed ? "Crop diterapkan." + (had ? " Hasil Pisahkan subjek direset karena ukuran foto berubah, ulangi setelah crop." : "") : "Crop tidak berubah.");
    else msg("Crop dibatalkan.");
  }
  async function del() {
    if (!cur || !cur.crop || ed) return;
    const had = (cur.crop = null, invalidate(cur));
    await reshow(cur);
    msg("Crop dihapus." + (had ? " Hasil Pisahkan subjek direset." : ""));
  }
  async function applyAll() {
    if (ratio === "free") { msg("Pilih rasio dulu (bukan Bebas)."); return; }
    const L = photos.filter(p => p.on);
    if (!L.length) { msg("Centang minimal satu foto."); return; }
    if (ed) await leave(false);
    L.forEach(p => { const f = full(p), ar = arOf(p); p.crop = norm(fitMax(f, ar, f.w / 2, f.h / 2), f); invalidate(p); });
    msg(`Rasio ${RAT.find(r => r.id === ratio).label}${flip ? " (dibalik)" : ""} diterapkan ke ${L.length} foto (crop di tengah). Pakai "Ubah crop" untuk menggeser per foto.`);
    if (cur && L.includes(cur)) await reshow(cur); else ui();
  }

  $c("cr_go").onclick = enter;
  $c("cr_ok").onclick = () => leave(true);
  $c("cr_no").onclick = () => leave(false);
  $c("cr_del").onclick = del;
  $c("cr_all").onclick = applyAll;
  $c("cr_flip").onclick = () => {
    if (!ed) return;
    flip = !flip;
    if (ratio === "free") {   // bebas: tukar lebar dan tinggi kotak
      const f = full(ed.p), r = ed.r, w = Math.min(r.h, f.w), h = Math.min(r.w, f.h);
      ed.r = { x: cl(r.x + r.w / 2 - w / 2, 0, f.w - w), y: cl(r.y + r.h / 2 - h / 2, 0, f.h - h), w, h };
      paintBox();
    } else applyRatio();
  };

  addEventListener("keydown", e => {
    if (!ed) return;
    const t = e.target;
    if (t && (t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && !/^(range|checkbox|color|button)$/.test(t.type)))) return;
    if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); leave(true); }
    else if (e.key === "Escape") { e.preventDefault(); leave(false); }
  }, true);

  /* Putar foto: kotak crop ikut diputar 90° searah jarum jam (dijalankan sebelum handler tombol Putar). */
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest("#rot");
    if (!b || b.disabled || !cur) return;
    if (ed) { cur._cropEdit = false; ed = null; drag = null; ov.hidden = true; }
    if (cur.crop) { const c = cur.crop; cur.crop = { x: Math.round((1 - c.y - c.h) * 1e5) / 1e5, y: c.x, w: c.h, h: c.w }; }
  }, true);

  /* Pindah foto saat mode crop: tutup mode crop foto sebelumnya. Selain itu jaga posisi overlay dan tombol. */
  setInterval(() => {
    if (ed && ed.p !== cur) { ed.p._cropEdit = false; ed = null; drag = null; ov.hidden = true; }
    if (ed) place();
    ui();
  }, 200);
  addEventListener("resize", () => { if (ed) place(); });

  // Dipakai modul lain (Undo) agar hasil yang bergantung ukuran foto ikut direset.
  window.irCrop = { invalidate };
  ui();
})();
