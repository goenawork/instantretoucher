
/* ---------- InstantRetoucher: Background & Subject Matte ----------
   Fitur:
   - Segmentasi AI MODNet
   - Guided filter untuk penyempurnaan tepi
   - Edge refine, shift edge, edge contrast
   - Feather sesuai nilai slider, termasuk 0
   - Background: original, transparent, color, image
   - Restore / erase brush, undo, clear
   - Cache matte untuk mempercepat perubahan background

   Integrasi yang dipertahankan:
   $, photos, wc, cv, out, cur, idx, busy,
   draw(), select(), msg(), paint(), seg, brush, panel terkait.
------------------------------------------------------------------- */

(function () {
  "use strict";

  let bgImg = null;

  const BG = {
    sharp: 0.7,
    shift: -0.1,
    cont: 0.25,
    tool: null,
    cur: null
  };

  const tcv = document.createElement("canvas");

  /* ---------- Guided filter ---------- */

  function boxMean(a, w, h, r, out, tmp) {
    for (let y = 0; y < h; y++) {
      const o = y * w;
      let sum = 0;

      for (let x = 0; x <= r && x < w; x++) {
        sum += a[o + x];
      }

      for (let x = 0; x < w; x++) {
        const lo = Math.max(0, x - r);
        const hi = Math.min(w - 1, x + r);

        tmp[o + x] = sum / (hi - lo + 1);

        if (x + r + 1 < w) sum += a[o + x + r + 1];
        if (x - r >= 0) sum -= a[o + x - r];
      }
    }

    for (let x = 0; x < w; x++) {
      let sum = 0;

      for (let y = 0; y <= r && y < h; y++) {
        sum += tmp[y * w + x];
      }

      for (let y = 0; y < h; y++) {
        const lo = Math.max(0, y - r);
        const hi = Math.min(h - 1, y + r);

        out[y * w + x] = sum / (hi - lo + 1);

        if (y + r + 1 < h) sum += tmp[(y + r + 1) * w + x];
        if (y - r >= 0) sum -= tmp[(y - r) * w + x];
      }
    }
  }

  function guided(I, P, w, h, r, eps) {
    const n = w * h;
    const tmp = new Float32Array(n);
    const meanI = new Float32Array(n);
    const meanP = new Float32Array(n);
    const meanIP = new Float32Array(n);
    const meanII = new Float32Array(n);
    const A = new Float32Array(n);
    const B = new Float32Array(n);

    boxMean(I, w, h, r, meanI, tmp);
    boxMean(P, w, h, r, meanP, tmp);

    for (let i = 0; i < n; i++) {
      A[i] = I[i] * P[i];
      B[i] = I[i] * I[i];
    }

    boxMean(A, w, h, r, meanIP, tmp);
    boxMean(B, w, h, r, meanII, tmp);

    for (let i = 0; i < n; i++) {
      const variance = meanII[i] - meanI[i] * meanI[i];
      const covariance = meanIP[i] - meanI[i] * meanP[i];
      const a = covariance / (variance + eps);

      A[i] = a;
      B[i] = meanP[i] - a * meanI[i];
    }

    boxMean(A, w, h, r, meanIP, tmp);
    boxMean(B, w, h, r, meanII, tmp);

    const result = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      result[i] = Math.max(
        0,
        Math.min(1, meanIP[i] * I[i] + meanII[i])
      );
    }

    return result;
  }

  /* ---------- Cache matte kasar dan matte hasil guided filter ---------- */

  function getRef(p, W, H) {
    const key = W + "x" + H;

    if (p._ref && p._ref.k === key) {
      return p._ref;
    }

    const full = document.createElement("canvas");
    full.width = W;
    full.height = H;

    const fg = full.getContext("2d", { willReadFrequently: true });
    fg.drawImage(p.mask, 0, 0, W, H);

    const fullData = fg.getImageData(0, 0, W, H).data;
    const coarse = new Uint8Array(W * H);

    for (let i = 0; i < W * H; i++) {
      coarse[i] = fullData[i * 4 + 3];
    }

    // Resolusi proses dibatasi untuk mengurangi penggunaan memori.
    const scale = Math.min(1, 2800 / Math.max(W, H));
    const w = Math.max(1, Math.round(W * scale));
    const h = Math.max(1, Math.round(H * scale));
    const n = w * h;

    const sm = document.createElement("canvas");
    sm.width = w;
    sm.height = h;

    const sg = sm.getContext("2d", { willReadFrequently: true });

    // Foto asli sebagai pemandu.
    sg.drawImage(wc, 0, 0, w, h);
    const guideData = sg.getImageData(0, 0, w, h).data;

    // Mask AI sebagai alpha awal.
    sg.clearRect(0, 0, w, h);
    sg.drawImage(p.mask, 0, 0, w, h);
    const maskData = sg.getImageData(0, 0, w, h).data;

    const I = new Float32Array(n);
    const P = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const j = i * 4;

      I[i] = (
        0.2126 * guideData[j] +
        0.7152 * guideData[j + 1] +
        0.0722 * guideData[j + 2]
      ) / 255;

      P[i] = maskData[j + 3] / 255;
    }

    const radius = Math.max(2, Math.round(Math.max(w, h) / 300));
    const refined = guided(I, P, w, h, radius, 4e-4);

    const img = sg.createImageData(w, h);

    for (let i = 0; i < n; i++) {
      img.data[i * 4 + 3] = Math.round(refined[i] * 255);
    }

    sg.putImageData(img, 0, 0);

    // Kembalikan matte ke resolusi kerja.
    fg.clearRect(0, 0, W, H);
    fg.imageSmoothingEnabled = true;
    fg.imageSmoothingQuality = "high";
    fg.drawImage(sm, 0, 0, W, H);

    const refinedData = fg.getImageData(0, 0, W, H).data;
    const ref = new Uint8Array(W * H);

    for (let i = 0; i < W * H; i++) {
      ref[i] = refinedData[i * 4 + 3];
    }

    return (p._ref = { k: key, c: coarse, r: ref });
  }

  /* ---------- Goresan manual ---------- */

  function strokeDraw(g, stroke, W, H) {
    if (!stroke || !stroke.pts || !stroke.pts.length) return;

    g.save();

    // Restore menambah alpha, erase menghapus alpha.
    g.globalCompositeOperation =
      stroke.m === "r" ? "source-over" : "destination-out";

    g.strokeStyle = "#fff";
    g.fillStyle = "#fff";
    g.lineCap = "round";
    g.lineJoin = "round";
    g.lineWidth = Math.max(1, stroke.r * W * 2);

    const first = stroke.pts[0];

    if (stroke.pts.length === 1) {
      g.beginPath();
      g.arc(
        first[0] * W,
        first[1] * H,
        Math.max(0.5, stroke.r * W),
        0,
        Math.PI * 2
      );
      g.fill();
    } else {
      g.beginPath();
      g.moveTo(first[0] * W, first[1] * H);

      for (let i = 1; i < stroke.pts.length; i++) {
        g.lineTo(stroke.pts[i][0] * W, stroke.pts[i][1] * H);
      }

      g.stroke();
    }

    g.restore();
  }

  function aKey(p, W, H) {
    const feather = $("feather").value;
    const strokes = p.mst || [];

    return [
      W,
      H,
      BG.sharp,
      BG.shift,
      BG.cont,
      feather,
      strokes.length,
      strokes.reduce((sum, stroke) => sum + stroke.pts.length, 0)
    ].join("|");
  }

  /* ---------- Membentuk alpha akhir ---------- */

  function alphaCanvas(p, W, H) {
    const key = aKey(p, W, H);

    if (
      p._fa &&
      p._fk === key &&
      p._fa.width === W &&
      p._fa.height === H
    ) {
      return p._fa;
    }

    const R = getRef(p, W, H);
    const n = W * H;

    if (!p._fa) {
      p._fa = document.createElement("canvas");
    }

    const A = p._fa;
    A.width = W;
    A.height = H;

    const g = A.getContext("2d");
    const img = g.createImageData(W, H);
    const D = img.data;

    const sharp = Math.max(0, Math.min(1, BG.sharp));
    const shift = Math.max(-1, Math.min(1, BG.shift));
    const contrast = Math.max(0, Math.min(1, BG.cont));

    // Shift positif mengerosi tepi; shift negatif melebarkan matte.
    const threshold = 0.5 + shift * 0.25;

    // Contrast 0 tetap valid dan tidak menyebabkan pembagian nol.
    const halfWidth = Math.max(0.025, 0.5 * (1 - contrast * 0.9));
    const low = threshold - halfWidth;
    const inv = 1 / (2 * halfWidth);

    for (let i = 0; i < n; i++) {
      const coarse = R.c[i] / 255;
      const refined = R.r[i] / 255;

      let a = coarse * (1 - sharp) + refined * sharp;
      a = (a - low) * inv;
      a = Math.max(0, Math.min(1, a));

      D[i * 4 + 3] = Math.round(a * 255);
    }

    g.putImageData(img, 0, 0);

    // Terapkan seluruh goresan tersimpan.
    (p.mst || []).forEach(stroke => {
      strokeDraw(g, stroke, W, H);
    });

    // Feather 0 berarti tanpa blur tambahan.
    const feather = Math.max(0, Number($("feather").value) || 0);

    if (feather > 0) {
      if (tcv.width !== W) tcv.width = W;
      if (tcv.height !== H) tcv.height = H;

      const tmp = tcv.getContext("2d");
      tmp.clearRect(0, 0, W, H);
      tmp.drawImage(A, 0, 0);

      g.clearRect(0, 0, W, H);
      g.save();
      g.filter = `blur(${feather}px)`;
      g.drawImage(tcv, 0, 0);
      g.restore();
    }

    p._fk = key;
    return A;
  }

  /* ---------- Komposit background ---------- */

  function composite(p) {
    if (!p.mask) {
      out.style.display = "none";
      cv.style.display = "block";
      p._fa = p._fk = p._ref = null;
      p.mst = [];
      return;
    }

    const W = cv.width;
    const H = cv.height;
    const mode = $("bgmode").value;

    if (out.width !== W) out.width = W;
    if (out.height !== H) out.height = H;

    const o = out.getContext("2d");
    o.clearRect(0, 0, W, H);

    out.style.background =
      mode === "transparent"
        ? "repeating-conic-gradient(#2a2a2a 0 25%,#1c1c1c 0 50%) 0 0/20px 20px"
        : "none";

    if (mode === "original") {
      o.drawImage(cv, 0, 0);
    } else {
      if (mode === "color") {
        o.fillStyle = $("bgcolor").value;
        o.fillRect(0, 0, W, H);
      } else if (mode === "image" && bgImg) {
        const scale = Math.max(W / bgImg.width, H / bgImg.height);
        const w = bgImg.width * scale;
        const h = bgImg.height * scale;

        o.drawImage(bgImg, (W - w) / 2, (H - h) / 2, w, h);
      }

      const A = alphaCanvas(p, W, H);

      if (tcv.width !== W) tcv.width = W;
      if (tcv.height !== H) tcv.height = H;

      const c = tcv.getContext("2d");
      c.clearRect(0, 0, W, H);
      c.globalCompositeOperation = "source-over";
      c.drawImage(cv, 0, 0);

      // Gunakan matte sebagai alpha. RGB asli tidak diganti secara
      // membabi buta agar warna kulit, rambut, dan pakaian tetap terjaga.
      c.globalCompositeOperation = "destination-in";
      c.drawImage(A, 0, 0);
      c.globalCompositeOperation = "source-over";

      o.drawImage(tcv, 0, 0);
    }

    cv.style.display = "none";
    out.style.display = "block";

    // Cache foto lain dilepas untuk menghemat memori.
    if (p !== cur) {
      p._fa = p._fk = p._ref = null;
    }
  }

  /* ---------- Panel kontrol background ---------- */

  let pendingDraw = false;

  function sched() {
    if (pendingDraw) return;

    pendingDraw = true;

    requestAnimationFrame(() => {
      pendingDraw = false;
      draw();
    });
  }

  $("bgopts").insertAdjacentHTML("beforeend", `
    <div class="row">
      <span>Edge refine</span>
      <output id="o_bsharp">70</output>
      <input id="bsharp" type="range" min="0" max="1" step="0.01"
        value="0.7" aria-label="Edge refine">
    </div>
    <div class="row">
      <span>Shift edge</span>
      <output id="o_bshift">-10</output>
      <input id="bshift" type="range" min="-1" max="1" step="0.01"
        value="-0.1" aria-label="Shift edge">
    </div>
    <div class="row">
      <span>Edge contrast</span>
      <output id="o_bcont">25</output>
      <input id="bcont" type="range" min="0" max="1" step="0.01"
        value="0.25" aria-label="Edge contrast">
    </div>
    <button id="bpr" class="w">Restore brush: off</button>
    <button id="bpe" class="w">Erase brush: off</button>
    <div class="row">
      <span>Brush size</span>
      <output id="o_bsize">4</output>
      <input id="bsize" type="range" min="0.5" max="20" step="0.5"
        value="4" aria-label="Brush size">
    </div>
    <button id="bundo" class="w">Undo last stroke</button>
    <button id="bclr" class="w">Clear all strokes</button>
    <div style="font-size:11px;line-height:1.35;color:var(--mute);margin:2px 0 8px">
      Restore brings back parts of the subject that were removed.
      Erase removes leftover background. Scroll to zoom for precise strokes.
      Press <b>[</b> to shrink and <b>]</b> to enlarge the brush.
    </div>
  `);

  ["bsharp", "bshift", "bcont"].forEach(id => {
    const el = $(id);
    const key = {
      bsharp: "sharp",
      bshift: "shift",
      bcont: "cont"
    }[id];

    // Nilai internal selalu mengikuti nilai awal slider.
    BG[key] = Number(el.value);

    paint(el);

    el.addEventListener("input", () => {
      BG[key] = Number(el.value);
      $("o_" + id).textContent = Math.round(Number(el.value) * 100);
      paint(el);

      // Parameter matte berubah, jadi cache alpha perlu dibangun ulang.
      if (cur) cur._fk = null;

      sched();
    });

    $("o_" + id).textContent = Math.round(Number(el.value) * 100);
  });

  ["bgmode", "bgcolor", "feather"].forEach(id => {
    $(id).addEventListener("input", () => {
      if (id === "feather") {
        $("o_f").textContent = $("feather").value;
        if (cur) cur._fk = null;
      }
      sched();
    });
  });

  $("bgimg").addEventListener("change", e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const im = new Image();

    im.onload = () => {
      bgImg = im;
      $("bgmode").value = "image";
      draw();
      URL.revokeObjectURL(url);
    };

    im.onerror = () => {
      URL.revokeObjectURL(url);
      msg("Gambar background tidak dapat dibuka.");
    };

    im.src = url;
  });

  $("bsize").addEventListener("input", () => {
    $("o_bsize").textContent = $("bsize").value;
  });

  /* ---------- Segmentasi AI ---------- */

  async function segment(p) {
    try {
      if (!seg) {
        msg("Memuat model AI. Pertama kali membutuhkan unduhan model.");

        const T = await import(
          "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2"
        );

        T.env.allowLocalModels = false;

        seg = {
          T,
          model: await T.AutoModel.from_pretrained(
            "Xenova/modnet",
            { dtype: "fp32" }
          ),
          proc: await T.AutoProcessor.from_pretrained("Xenova/modnet")
        };
      }

      const img = seg.T.RawImage.fromCanvas(wc);
      const { pixel_values } = await seg.proc(img);
      const { output } = await seg.model({ input: pixel_values });

      const m = await seg.T.RawImage
        .fromTensor(output[0].mul(255).to("uint8"))
        .resize(wc.width, wc.height);

      const mc = document.createElement("canvas");
      mc.width = wc.width;
      mc.height = wc.height;

      const ctx = mc.getContext("2d");
      const imageData = ctx.createImageData(mc.width, mc.height);

      for (let i = 0; i < mc.width * mc.height; i++) {
        imageData.data[i * 4 + 3] = m.data[i * m.channels];
      }

      ctx.putImageData(imageData, 0, 0);

      p.mask = mc;
      p.mst = [];
      p._ref = p._fa = p._fk = null;

      $("bgopts").hidden = false;

      draw(p);
      return true;
    } catch (e) {
      msg(
        "Gagal memisahkan subjek: " +
        e.message +
        ". Periksa koneksi internet lalu coba lagi."
      );

      return false;
    }
  }

  $("rmbg").onclick = async () => {
    if (!cur || busy) return;

    busy = true;
    msg("Memisahkan subjek...");

    try {
      if (await segment(cur)) {
        msg(
          "Subjek berhasil dipisahkan. Pilih background, lalu rapikan tepinya."
        );
      }
    } finally {
      busy = false;
    }
  };

  $("rmall").onclick = async () => {
    if (busy) return;

    const keep = idx;
    const list = photos.map((p, i) => i).filter(i => photos[i].on);

    for (let n = 0; n < list.length; n++) {
      await select(list[n]);

      busy = true;
      msg(`Memisahkan subjek ${n + 1}/${list.length}...`);

      let ok = false;

      try {
        ok = await segment(photos[list[n]]);
      } finally {
        busy = false;
      }

      if (!ok) return;
    }

    await select(keep);
    msg(`Subjek berhasil dipisahkan pada ${list.length} foto.`);
  };

  /* ---------- Kuas restore / erase ---------- */

  const bov = document.createElement("canvas");
  bov.id = "bov";

  bov.style.cssText = [
    "position:absolute",
    "display:none",
    "touch-action:none",
    "cursor:none",
    "z-index:4"
  ].join(";");

  $("zw").appendChild(bov);

  function placeBov() {
    const v = out.style.display === "block" ? out : cv;

    if (!v.clientWidth || !v.clientHeight) return;

    Object.assign(bov.style, {
      left: v.offsetLeft + "px",
      top: v.offsetTop + "px",
      width: v.clientWidth + "px",
      height: v.clientHeight + "px"
    });

    if (bov.width !== v.clientWidth) bov.width = v.clientWidth;
    if (bov.height !== v.clientHeight) bov.height = v.clientHeight;
  }

  function ring(e) {
    const c = bov.getContext("2d");
    c.clearRect(0, 0, bov.width, bov.height);

    if (!e || !bov.width || !bov.height) return;

    const rect = bov.getBoundingClientRect();

    if (!rect.width || !rect.height) return;

    const x = (e.clientX - rect.left) / rect.width * bov.width;
    const y = (e.clientY - rect.top) / rect.height * bov.height;
    const radius = Number($("bsize").value) / 200 * bov.width;

    c.beginPath();
    c.arc(x, y, radius, 0, Math.PI * 2);
    c.lineWidth = 1.5;
    c.strokeStyle = BG.tool === "r"
      ? "rgba(60,220,120,.95)"
      : "rgba(255,80,70,.95)";
    c.stroke();

    c.lineWidth = 0.8;
    c.strokeStyle = "rgba(0,0,0,.6)";
    c.stroke();
  }

  function setTool(t) {
    // Klik tombol yang sama mematikan tool.
    BG.tool = BG.tool === t ? null : t;

    // Matikan brush lama atau tool seleksi jika modul tersebut menyediakannya.
    if (BG.tool && typeof brush !== "undefined" && brush) {
      $("gbrush").onclick();
    }

    if (BG.tool && typeof window.irAreaToolOff === "function") {
      window.irAreaToolOff();
    }

    $("bpr").textContent =
      "Restore brush: " + (BG.tool === "r" ? "on" : "off");

    $("bpe").textContent =
      "Erase brush: " + (BG.tool === "e" ? "on" : "off");

    bov.style.display = BG.tool && cur && cur.mask ? "block" : "none";

    if (BG.tool) {
      placeBov();
      ring(null);
    } else {
      BG.cur = null;
      ring(null);
    }
  }

  $("bpr").onclick = () => setTool("r");
  $("bpe").onclick = () => setTool("e");

  const bpt = e => {
    const rect = bov.getBoundingClientRect();

    return [
      (e.clientX - rect.left) / rect.width,
      (e.clientY - rect.top) / rect.height
    ];
  };

  let raf = 0;

  function liveComp() {
    if (raf) return;

    raf = requestAnimationFrame(() => {
      raf = 0;

      if (cur && cur.mask) {
        composite(cur);
      }
    });
  }

  function live(stroke, from) {
    if (!cur || !cur.mask) return;

    const W = cv.width;
    const H = cv.height;
    const A = alphaCanvas(cur, W, H);
    const g = A.getContext("2d");

    strokeDraw(g, {
      m: stroke.m,
      r: stroke.r,
      pts: stroke.pts.slice(Math.max(0, from))
    }, W, H);

    // Cache berisi alpha yang sudah dimutakhirkan secara langsung.
    cur._fk = aKey(cur, W, H);

    liveComp();
  }

  bov.addEventListener("pointerdown", e => {
    if (e.button === 1) return;

    e.stopPropagation();

    if (e.button !== 0 || !BG.tool || !cur || !cur.mask) return;

    e.preventDefault();

    bov.setPointerCapture(e.pointerId);

    BG.cur = {
      m: BG.tool,
      r: Number($("bsize").value) / 200,
      pts: [bpt(e)]
    };

    live(BG.cur, 0);
  });

  let lastE = null;

  bov.addEventListener("pointermove", e => {
    lastE = e;
    ring(e);

    if (!BG.cur) return;

    BG.cur.pts.push(bpt(e));
    live(BG.cur, BG.cur.pts.length - 2);
  });

  bov.addEventListener("dblclick", e => e.stopPropagation());

  bov.addEventListener("pointerleave", () => {
    if (!BG.cur) ring(null);
  });

  function finishStroke() {
    if (!BG.cur || !cur) return;

    const stroke = BG.cur;
    BG.cur = null;

    if (!cur.mst) cur.mst = [];
    cur.mst.push(stroke);

    // Simpan cache hasil goresan supaya tidak perlu membangunnya ulang.
    cur._fk = aKey(cur, cv.width, cv.height);

    if (typeof window.irHistoryCommit === "function") {
      window.irHistoryCommit();
    }

    msg("Goresan ditambahkan. Gunakan Undo untuk membatalkannya.");
  }

  ["pointerup", "pointercancel", "lostpointercapture"].forEach(ev => {
    bov.addEventListener(ev, finishStroke);
  });

  $("bundo").onclick = () => {
    if (!cur || !cur.mst || !cur.mst.length) return;

    cur.mst.pop();
    cur._fk = null;

    draw();

    if (typeof window.irHistoryCommit === "function") {
      window.irHistoryCommit();
    }

    msg("Goresan terakhir dibatalkan.");
  };

  $("bclr").onclick = () => {
    if (!cur || !cur.mst || !cur.mst.length) return;

    cur.mst = [];
    cur._fk = null;

    draw();

    if (typeof window.irHistoryCommit === "function") {
      window.irHistoryCommit();
    }

    msg("Semua goresan dihapus.");
  };

  /* ---------- Shortcut ukuran kuas ---------- */

  function nudgeSize(dir) {
    const el = BG.tool
      ? $("bsize")
      : (typeof brush !== "undefined" && brush ? $("gsize") : null);

    if (!el) return false;

    const v = Number(el.value);
    const step = v < 2 ? 0.5 : v < 10 ? 1 : 2;
    const next = Math.min(
      Number(el.max),
      Math.max(Number(el.min), v + dir * step)
    );

    if (next === v) return true;

    el.value = next;
    el.dispatchEvent(new Event("input", { bubbles: true }));

    if (BG.tool) ring(lastE);

    return true;
  }

  addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const t = e.target;

    if (
      t &&
      (
        t.tagName === "TEXTAREA" ||
        t.tagName === "SELECT" ||
        (
          t.tagName === "INPUT" &&
          !/^(range|checkbox|color|button)$/.test(t.type)
        )
      )
    ) {
      return;
    }

    const dir =
      e.code === "BracketLeft" ? -1 :
      e.code === "BracketRight" ? 1 : 0;

    if (dir && nudgeSize(dir)) {
      e.preventDefault();
    }
  });

  addEventListener("resize", () => {
    if (BG.tool) placeBov();
  });

  /* ---------- Sinkronisasi overlay & pembersihan cache ---------- */

  // Interval ini hanya mengatur overlay dan cache.
  // Jangan memanggil setTool() dari sini karena fungsi itu toggle tool.
  setInterval(() => {
    photos.forEach(p => {
      if (p !== cur && p._fa) {
        p._fa = p._fk = p._ref = null;
      }
    });

    if (BG.tool) {
      bov.style.display = cur && cur.mask ? "block" : "none";

      if (cur && cur.mask && !BG.cur) {
        placeBov();
      }
    } else {
      bov.style.display = "none";
    }
  }, 500);

  /* ---------- API yang digunakan file lain ---------- */

  window.composite = composite;
  window.guided = guided;
  window.strokeDraw = strokeDraw;
  window.BG = BG;

  window.irBgToolOff = () => {
    if (BG.tool) setTool(BG.tool);
  };

})();
