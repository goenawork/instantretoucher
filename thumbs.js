/* InstantManiaRetoucher - Thumbnail hasil edit di strip foto kecil.
   Foto yang sudah diedit (adjustment, area, crop, rotasi, latar) tampil dengan hasil edit dan titik jingga di pojoknya,
   sedangkan foto yang baru dimasukkan tetap tampil asli tanpa titik. Dirender dengan pipeline yang sama (gl.js: irRenderSmall),
   di latar belakang, satu per satu, tanpa mengganggu foto yang sedang dibuka. Thumbnail asli (p.thumb) tidak diubah. */
(function () {
  "use strict";

  const TW = 192;                 // sisi terpanjang thumbnail hasil edit
  let working = false, IDC = 0;

  const st = document.createElement("style");
  st.textContent = `#strip .th.edited::after{content:"";position:absolute;right:5px;bottom:5px;width:9px;height:9px;border-radius:50%;background:#ff7a1a;box-shadow:0 0 0 2px rgba(0,0,0,.65);pointer-events:none}`;
  document.head.appendChild(st);

  function isEdited(p) {
    const L = irLayers(p);
    if (L.some((l, i) => irLayerActive(l) && (i === 0 || p.areas))) return true;
    return !!(p.crop || p.mask || (p.glare && p.glare.auto) || p.rot);
  }
function sigT(p) {
    const L = irLayers(p);
    if (p.mask && !p.mask._tid) p.mask._tid = ++IDC;
    // PERBAIKAN: Baca bgmode, bgcolor, dan bgimg dari objek foto (p), bukan dari elemen HTML global
    return JSON.stringify([
      L.map(l => [l.id, l.s, l.pc || null]), p.rot, p.crop || null, p.mask ? p.mask._tid : 0,
      (p.mst || []).length, (p.mst || []).reduce((a, s) => a + s.pts.length, 0), p.areas ? (p._av || 1) : 0,
      (p.ast || []).length, p.glare && [p.glare.auto, p.glare.thr], 
      p.bgmode || "original", p.bgcolor || "#ffffff", p.bgimg ? p.bgimg.src : 0
    ]);
  }

  async function make(p) {
    const { c } = await srcOf(p), W = c.width, H = c.height;
    const px = irRenderSmall(p, c, W, H);
    if (!px) return;
    const out = document.createElement("canvas"); out.width = W; out.height = H;
    const og = out.getContext("2d"), id = og.createImageData(W, H), row = W * 4;
    for (let y = 0; y < H; y++) id.data.set(px.subarray((H - 1 - y) * row, (H - y) * row), y * row);
    og.putImageData(id, 0, 0);
    let res = out;
    
    // PERBAIKAN: Ambil mode dan properti latar belakang dari objek foto (p)
    const mode = p.bgmode || "original";
    if (p.mask && mode !== "original") {
      res = document.createElement("canvas"); res.width = W; res.height = H;
      const fg = res.getContext("2d");
      
      if (mode === "color") { 
        fg.fillStyle = p.bgcolor || "#ffffff"; 
        fg.fillRect(0, 0, W, H); 
      }
      else if (mode === "image" && p.bgimg) { 
        const k = Math.max(W / p.bgimg.width, H / p.bgimg.height), w = p.bgimg.width * k, h = p.bgimg.height * k; 
        fg.drawImage(p.bgimg, (W - w) / 2, (H - h) / 2, w, h); 
      }
      else { 
        fg.fillStyle = "#2a2a2a"; fg.fillRect(0, 0, W, H); fg.fillStyle = "#1c1c1c"; 
        for (let y = 0; y < H; y += 8) for (let x = (y / 8 % 2) * 8; x < W; x += 16) fg.fillRect(x, y, 8, 8); 
      }
      const t = document.createElement("canvas"); t.width = W; t.height = H;
      const tg = t.getContext("2d"); tg.drawImage(out, 0, 0); tg.globalCompositeOperation = "destination-in"; tg.drawImage(p.mask, 0, 0, W, H);
      fg.drawImage(t, 0, 0);
    }
    p.thumbE = res.toDataURL("image/jpeg", .78);
  }

  /* Sumber kecil: foto yang sudah diputar dan di-crop, sisi terpanjang TW. Disimpan sampai rotasi/crop berubah. */
  async function srcOf(p) {
    const key = p.rot + "|" + JSON.stringify(p.crop || null);
    if (p._ts && p._ts.k === key) return p._ts;
    const bm = await createImageBitmap(p.blob, { imageOrientation: "from-image" });
    const odd = p.rot % 2, sw = odd ? bm.height : bm.width, sh = odd ? bm.width : bm.height, cr = p.crop;
    const ks = Math.min(1, TW / Math.max(cr ? cr.w * sw : sw, cr ? cr.h * sh : sh));
    const fw = Math.max(1, Math.round(sw * ks)), fh = Math.max(1, Math.round(sh * ks));
    const t = document.createElement("canvas"); t.width = fw; t.height = fh;
    const g = t.getContext("2d"); g.imageSmoothingQuality = "high";
    g.translate(fw / 2, fh / 2); g.rotate(p.rot * Math.PI / 2);
    g.drawImage(bm, -bm.width * ks / 2, -bm.height * ks / 2, bm.width * ks, bm.height * ks); bm.close();
    let c = t;
    if (cr) {
      const cx = Math.round(cr.x * fw), cy = Math.round(cr.y * fh), cw = Math.max(1, Math.min(fw - cx, Math.round(cr.w * fw))), ch = Math.max(1, Math.min(fh - cy, Math.round(cr.h * fh)));
      c = document.createElement("canvas"); c.width = cw; c.height = ch;
      c.getContext("2d").drawImage(t, cx, cy, cw, ch, 0, 0, cw, ch);
    }
    return p._ts = { k: key, c };
  }

  async function make(p) {
    const { c } = await srcOf(p), W = c.width, H = c.height;
    const px = irRenderSmall(p, c, W, H);
    if (!px) return;
    const out = document.createElement("canvas"); out.width = W; out.height = H;
    const og = out.getContext("2d"), id = og.createImageData(W, H), row = W * 4;
    for (let y = 0; y < H; y++) id.data.set(px.subarray((H - 1 - y) * row, (H - y) * row), y * row);   // GL membaca dari bawah ke atas
    og.putImageData(id, 0, 0);
    let res = out;
    const mode = $("bgmode").value;
    if (p.mask && mode !== "original") {       // tampilkan latar yang diganti
      res = document.createElement("canvas"); res.width = W; res.height = H;
      const fg = res.getContext("2d"), bgi = window.irBgImg && window.irBgImg();
      if (mode === "color") { fg.fillStyle = $("bgcolor").value; fg.fillRect(0, 0, W, H); }
      else if (mode === "image" && bgi) { const k = Math.max(W / bgi.width, H / bgi.height), w = bgi.width * k, h = bgi.height * k; fg.drawImage(bgi, (W - w) / 2, (H - h) / 2, w, h); }
      else { fg.fillStyle = "#2a2a2a"; fg.fillRect(0, 0, W, H); fg.fillStyle = "#1c1c1c"; for (let y = 0; y < H; y += 8) for (let x = (y / 8 % 2) * 8; x < W; x += 16) fg.fillRect(x, y, 8, 8); }
      const t = document.createElement("canvas"); t.width = W; t.height = H;
      const tg = t.getContext("2d"); tg.drawImage(out, 0, 0); tg.globalCompositeOperation = "destination-in"; tg.drawImage(p.mask, 0, 0, W, H);
      fg.drawImage(t, 0, 0);
    }
    p.thumbE = res.toDataURL("image/jpeg", .78);
  }

  function apply() {
    const ths = [...document.querySelectorAll("#strip .th")];
    photos.forEach((p, i) => {
      const d = ths[i]; if (!d) return;
      const im = d.querySelector("img"), want = p.thumbE || p.thumb;
      if (im && want && im.src !== want) im.src = want;
      d.classList.toggle("edited", !!p.thumbE);
    });
  }

  async function tick() {
    if (working || busy) { apply(); return; }
    working = true;
    const t0 = performance.now();
    try {
      for (const p of photos) {
        const sg = sigT(p);
        if (p._tsig === sg) continue;
        p._tsig = sg;
        try { if (isEdited(p)) await make(p); else p.thumbE = null; } catch (e) { p.thumbE = null; }
        if (performance.now() - t0 > 90) break;
      }
    } finally { working = false; }
    apply();
  }
  setInterval(tick, 400);
  window.irThumbs = { tick, apply };
})();
