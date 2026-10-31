/* InstantManiaRetoucher - Decode RAW asli (LibRaw WebAssembly).
   Sebelumnya file RAW (CR3, CR2, NEF, ARW, DNG, ...) hanya dibaca lewat JPEG preview di dalamnya, yang sudah diproses kamera.
   Dengan modul ini, data sensor RAW didecode sungguhan (demosaic, white balance kamera, highlight blend) lalu dimasukkan ke editor
   dalam resolusi penuh. Kalau decoder belum terpasang atau gagal, otomatis kembali ke cara lama (preview JPEG).
   Tombol "RAW: Full / RAW: Preview" di bar bawah memilih mode. Pasangnya: lihat langkah memasang folder /libraw/ (library libraw-wasm). */
(function () {
  "use strict";

  // Library dipasang di repo sendiri (satu origin). Beberapa lokasi umum dicoba berurutan, jadi struktur folder yang sedikit berbeda tetap terbaca.
  const CANDS = ["libraw/index.js", "libraw/package/index.js", "libraw/dist/index.js", "libraw/index.mjs", "libraw/package/dist/index.js"]
    .map(p => new URL(p, document.baseURI).href);
  const SETTINGS = {
    useCameraWb: true,      // white balance sesuai kamera
    useCameraMatrix: 1,
    outputColor: 1,         // sRGB
    outputBps: 8,
    highlight: 2,           // blend highlight yang terpotong
    userQual: 3,            // AHD: kualitas bagus dan cukup cepat
    userFlip: -1,           // ikuti orientasi kamera, hasil langsung tegak
    noAutoBright: false
  };
  const JPEG_Q = .95;        // 0.95 memakai chroma penuh (4:4:4) dan nyaris tanpa kehilangan

  let mode = "full", LR = null, state = "unknown";   // state: unknown | ready | missing
  try { mode = localStorage.getItem("ir_rawmode") || "full"; } catch (e) {}

  async function getLib() {
    if (LR) return LR;
    let err = null;
    for (const u of CANDS) {
      try {
        const mod = await import(u);
        LR = mod.default || mod.LibRaw;
        if (LR) { state = "ready"; return LR; }
      } catch (e) { err = e; }
    }
    throw err || new Error("LibRaw tidak ditemukan di folder libraw/");
  }

  /* RGB hasil decode -> blob JPEG kualitas tinggi */
  function toBlob(d, meta) {
    const src = d.data;
    let w = d.width || (meta && meta.width), h = d.height || (meta && meta.height);
    if (!w || !h) throw new Error("ukuran hasil decode tidak diketahui");
    let ch = Math.round(src.length / (w * h));
    if (ch !== 3 && ch !== 4) ch = 3;
    const shift = src instanceof Uint16Array || d.bits === 16 ? 8 : 0;
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"), img = g.createImageData(w, h), o = img.data, n = w * h;
    for (let i = 0, j = 0, k = 0; i < n; i++, j += 4, k += ch) {
      o[j] = src[k] >> shift; o[j + 1] = src[k + 1] >> shift; o[j + 2] = src[k + 2] >> shift; o[j + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("gagal membuat JPEG")), "image/jpeg", JPEG_Q));
  }

  async function decode(file) {
    const LibRaw = await getLib();
    const raw = new LibRaw();
    try {
      await raw.open(new Uint8Array(await file.arrayBuffer()), SETTINGS);
      let meta = null; try { meta = await raw.metadata(); } catch (e) {}
      const d = await raw.imageData();
      return await toBlob(d, meta);
    } finally {
      try { if (raw.terminate) raw.terminate(); else if (raw.close) raw.close(); } catch (e) {}
    }
  }

  /* ---------- Sambungkan ke addFiles (photos.js): file RAW didecode dulu, hasilnya diteruskan seperti foto biasa ---------- */
  const origAdd = window.addFiles;
  if (typeof origAdd === "function") {
    window.addFiles = async function (list) {
      const files = [...list], out = [], failed = [];
      const total = files.filter(f => RAW.test(f.name)).length;
      let n = 0, ok = 0;
      for (const f of files) {
        if (mode === "full" && RAW.test(f.name) && state !== "missing") {
          n++;
          try {
            msg(`Decoding RAW ${n}/${total}: ${f.name} (bisa beberapa detik)`);
            await new Promise(r => setTimeout(r, 30));
            const blob = await decode(f);
            out.push(new File([blob], f.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }));
            ok++; continue;
          } catch (e) {
            if (state !== "ready") state = "missing";
            failed.push(f.name + ": " + (e && e.message || e));
          }
        }
        out.push(f);
      }
      await origAdd(out);
      refreshBtn();
      if (!failed.length && mode === "full" && state === "missing" && total > 0)
        msg("Decoder RAW penuh belum terpasang (folder libraw/ tidak ditemukan), jadi file RAW dibaca lewat preview JPEG. Lihat langkah pemasangan.");
      else if (failed.length) msg(state === "missing"
        ? "Decoder RAW penuh belum terpasang (folder libraw/ tidak ditemukan), jadi file RAW dibaca lewat preview JPEG. Lihat langkah pemasangan."
        : `Sebagian RAW gagal didecode dan dibaca lewat preview JPEG: ${failed[0]}`);
      else if (ok) msg(`${ok} file RAW didecode penuh (resolusi asli).`);
    };
  }

  /* ---------- Tombol mode ---------- */
  const ref = $("syncb");
  const btn = document.createElement("button");
  if (ref) btn.className = ref.className;
  btn.type = "button";
  btn.onclick = async () => {
    mode = mode === "full" ? "preview" : "full";
    try { localStorage.setItem("ir_rawmode", mode); } catch (e) {}
    if (mode === "full" && state === "unknown") await probe();
    refreshBtn();
    msg(mode === "full"
      ? (state === "missing" ? "Mode RAW Full dipilih, tapi decoder belum terpasang (folder libraw/)." : "RAW Full: file RAW didecode penuh saat dimasukkan (lebih tajam, lebih lambat).")
      : "RAW Preview: file RAW dibaca lewat JPEG preview di dalamnya (cepat, tapi sudah diproses kamera).");
  };
  if (ref) ref.before(btn); else document.body.append(btn);
  function refreshBtn() {
    btn.textContent = mode === "full" ? (state === "missing" ? "RAW: Full (not installed)" : "RAW: Full") : "RAW: Preview";
    btn.title = "Pilihan cara membaca file RAW saat dimasukkan. Full = decode RAW asli (kualitas terbaik). Preview = JPEG di dalam RAW (cepat).";
  }
  async function probe() { try { await getLib(); } catch (e) { state = "missing"; } refreshBtn(); }
  refreshBtn();
  probe();
  window.irRaw = { decode, probe, get mode() { return mode; }, get state() { return state; } };
})();
