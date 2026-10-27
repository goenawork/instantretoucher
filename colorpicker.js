/* InstantManiaRetoucher - Pemilih warna ala Photoshop.
   Menggantikan kotak warna bawaan browser pada setiap <input type="color"> (mis. warna Latar).
   Ada: kotak Saturation/Brightness, bar Hue, kolom HEX (tempel kode warna), RGB, HSB, pembanding Baru/Saat ini, pipet.
   Perubahan langsung terlihat di foto. Klik di luar atau OK = simpan, Batal atau Esc = kembali ke warna semula. */
(function () {
  "use strict";

  const cl = (v, a, b) => Math.min(b, Math.max(a, v));
  const hex2 = n => Math.round(n).toString(16).padStart(2, "0");
  function hsv2rgb(h, s, v) {
    const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return [f(5) * 255, f(3) * 255, f(1) * 255];
  }
  function rgb2hsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, mx ? d / mx : 0, mx];
  }
  function parseHex(t) {
    t = String(t).trim().replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(t)) t = t.split("").map(c => c + c).join("");
    if (!/^[0-9a-f]{6}$/i.test(t)) return null;
    return [parseInt(t.slice(0, 2), 16), parseInt(t.slice(2, 4), 16), parseInt(t.slice(4, 6), 16)];
  }

  const SW = 220, SH = 180;
  const box = document.createElement("div");
  box.id = "irCP"; box.hidden = true;
  box.style.cssText = "position:fixed;z-index:100;width:372px;box-sizing:border-box;padding:12px;background:#1d1f21;color:#ddd;border:1px solid #4a4d50;border-radius:10px;box-shadow:0 12px 36px rgba(0,0,0,.6);font:12px system-ui,sans-serif";
  const fld = (id, lab, max, unit) => `<label style="display:flex;align-items:center;gap:4px;margin:3px 0"><span style="width:14px;color:#9aa0a6">${lab}</span><input id="${id}" inputmode="numeric" style="width:46px;padding:3px 4px;border-radius:4px;border:1px solid #555;background:#111;color:#eee;font:inherit;text-align:right"><span style="color:#777;width:10px">${unit || ""}</span></label>`;
  box.innerHTML =
    '<div style="display:flex;gap:10px">' +
    `<div style="position:relative"><canvas id="cp_sv" width="${SW}" height="${SH}" style="display:block;border-radius:4px;cursor:crosshair;touch-action:none"></canvas><i id="cp_pt" style="position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px #000;pointer-events:none"></i></div>` +
    `<div style="position:relative"><canvas id="cp_h" width="18" height="${SH}" style="display:block;border-radius:4px;cursor:pointer;touch-action:none"></canvas><i id="cp_hp" style="position:absolute;left:-3px;width:24px;height:4px;margin-top:-2px;border:2px solid #fff;border-radius:2px;box-shadow:0 0 0 1px #000;box-sizing:border-box;pointer-events:none"></i></div>` +
    '<div style="flex:1;min-width:0"><div style="text-align:center;color:#9aa0a6;margin-bottom:2px">Baru</div>' +
    '<div style="height:44px;border-radius:4px;overflow:hidden;border:1px solid #555"><div id="cp_new" style="height:50%"></div><div id="cp_old" style="height:50%"></div></div>' +
    '<div style="text-align:center;color:#9aa0a6;margin-top:2px">Saat ini</div>' +
    '<button id="cp_ok" type="button" style="width:100%;margin-top:8px;padding:6px;border-radius:6px;border:0;background:#ff7a1a;color:#111;font:600 12px system-ui;cursor:pointer">OK</button>' +
    '<button id="cp_no" type="button" style="width:100%;margin-top:6px;padding:6px;border-radius:6px;border:1px solid #555;background:transparent;color:#ddd;font:inherit;cursor:pointer">Batal</button>' +
    '<button id="cp_eye" type="button" title="Ambil warna dari layar" style="width:100%;margin-top:6px;padding:6px;border-radius:6px;border:1px solid #555;background:transparent;color:#ddd;font:inherit;cursor:pointer">Pipet</button></div></div>' +
    '<div style="display:flex;gap:18px;margin-top:10px"><div>' + fld("cp_H", "H", 360, "°") + fld("cp_S", "S", 100, "%") + fld("cp_B", "B", 100, "%") + '</div><div>' +
    fld("cp_R", "R") + fld("cp_G", "G") + fld("cp_Bl", "B") + '</div>' +
    '<div style="flex:1"><label style="display:flex;align-items:center;gap:4px;margin:3px 0"><span style="color:#9aa0a6">#</span><input id="cp_hex" maxlength="7" spellcheck="false" style="width:100%;min-width:0;padding:3px 6px;border-radius:4px;border:1px solid #555;background:#111;color:#eee;font:13px ui-monospace,monospace;text-transform:uppercase"></label>' +
    '<div style="color:#777;font-size:11px;margin-top:6px;line-height:1.3">Tempel kode warna di sini, lalu tekan Enter.</div></div></div>';
  document.body.appendChild(box);
  const $ = id => box.querySelector("#" + id);

  const sv = $("cp_sv"), hb = $("cp_h");
  const st = { h: 0, s: 0, v: 1, el: null, orig: "#ffffff", open: false };

  function drawSV() {
    const g = sv.getContext("2d");
    g.fillStyle = `hsl(${st.h},100%,50%)`; g.fillRect(0, 0, SW, SH);
    let w = g.createLinearGradient(0, 0, SW, 0); w.addColorStop(0, "#fff"); w.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = w; g.fillRect(0, 0, SW, SH);
    let k = g.createLinearGradient(0, 0, 0, SH); k.addColorStop(0, "rgba(0,0,0,0)"); k.addColorStop(1, "#000");
    g.fillStyle = k; g.fillRect(0, 0, SW, SH);
  }
  (function drawHue() {
    const g = hb.getContext("2d"), gr = g.createLinearGradient(0, 0, 0, SH);
    for (let i = 0; i <= 6; i++) gr.addColorStop(i / 6, `hsl(${i * 60},100%,50%)`);
    g.fillStyle = gr; g.fillRect(0, 0, 18, SH);
  })();

  const rgb = () => hsv2rgb(st.h, st.s, st.v).map(Math.round);
  const hexOf = () => "#" + rgb().map(hex2).join("");

  function paint(skip) {
    const [r, g, b] = rgb(), hx = hexOf();
    drawSV();
    $("cp_pt").style.left = (st.s * SW) + "px"; $("cp_pt").style.top = ((1 - st.v) * SH) + "px";
    $("cp_hp").style.top = (st.h / 360 * SH) + "px";
    $("cp_new").style.background = hx; $("cp_old").style.background = st.orig;
    const set = (id, v) => { if (skip !== id && document.activeElement !== $(id)) $(id).value = v; };
    set("cp_H", Math.round(st.h) % 361); set("cp_S", Math.round(st.s * 100)); set("cp_B", Math.round(st.v * 100));
    set("cp_R", r); set("cp_G", g); set("cp_Bl", b); set("cp_hex", hx.slice(1).toUpperCase());
  }
  function push() {   // kirim warna ke input aslinya agar foto langsung berubah
    if (!st.el) return;
    const hx = hexOf();
    if (st.el.value !== hx) { st.el.value = hx; st.el.dispatchEvent(new Event("input", { bubbles: true })); }
  }
  function setRGB(r, g, b, skip) {
    const [h, s, v] = rgb2hsv(r, g, b);
    st.h = s === 0 || v === 0 ? st.h : h; st.s = s; st.v = v;
    paint(skip); push();
  }

  function drag(canvas, fn) {
    const go = e => { const r = canvas.getBoundingClientRect(); fn(cl((e.clientX - r.left) / r.width, 0, 1), cl((e.clientY - r.top) / r.height, 0, 1)); };
    canvas.addEventListener("pointerdown", e => { canvas.setPointerCapture(e.pointerId); go(e); canvas._d = true; e.preventDefault(); });
    canvas.addEventListener("pointermove", e => { if (canvas._d) go(e); });
    ["pointerup", "pointercancel"].forEach(t => canvas.addEventListener(t, () => { canvas._d = false; }));
  }
  drag(sv, (x, y) => { st.s = x; st.v = 1 - y; paint(); push(); });
  drag(hb, (x, y) => { st.h = y * 360; paint(); push(); });

  // kolom angka
  const num = (id, max, apply) => {
    const el = $(id);
    el.addEventListener("input", () => { const v = parseFloat(el.value); if (isNaN(v)) return; apply(cl(v, 0, max)); });
    el.addEventListener("focus", () => el.select());
  };
  num("cp_H", 360, v => { st.h = v; paint("cp_H"); push(); });
  num("cp_S", 100, v => { st.s = v / 100; paint("cp_S"); push(); });
  num("cp_B", 100, v => { st.v = v / 100; paint("cp_B"); push(); });
  const rgbIn = (id, idx) => num(id, 255, v => { const c = rgb(); c[idx] = v; setRGB(c[0], c[1], c[2], id); });
  rgbIn("cp_R", 0); rgbIn("cp_G", 1); rgbIn("cp_Bl", 2);
  $("cp_hex").addEventListener("input", () => { const c = parseHex($("cp_hex").value); if (c) setRGB(c[0], c[1], c[2], "cp_hex"); });
  $("cp_hex").addEventListener("keydown", e => { if (e.key === "Enter") { const c = parseHex($("cp_hex").value); if (c) setRGB(c[0], c[1], c[2]); e.target.blur(); } });
  $("cp_hex").addEventListener("paste", e => {
    const t = (e.clipboardData || window.clipboardData).getData("text"), c = parseHex(t);
    if (c) { e.preventDefault(); setRGB(c[0], c[1], c[2]); }
  });
  // ketikan di sini tidak boleh memicu pintasan lain (panah, [ ], Enter, dll)
  box.addEventListener("keydown", e => { if (e.key === "Escape") close(false); e.stopPropagation(); });

  function place(el) {
    const r = el.getBoundingClientRect(), w = 372, h = box.offsetHeight || 300;
    let x = r.left, y = r.bottom + 8;
    if (x + w > innerWidth - 8) x = innerWidth - w - 8;
    if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - 8);
    box.style.left = Math.max(8, x) + "px"; box.style.top = y + "px";
  }
  function open(el) {
    st.el = el; st.orig = el.value || "#ffffff";
    const c = parseHex(st.orig) || [255, 255, 255];
    const [h, s, v] = rgb2hsv(c[0], c[1], c[2]);
    st.h = h; st.s = s; st.v = v; st.open = true;
    box.hidden = false; paint(); place(el);
  }
  function close(keep) {
    if (!st.open) return;
    if (!keep && st.el) { st.el.value = st.orig; st.el.dispatchEvent(new Event("input", { bubbles: true })); }
    if (keep && st.el) st.el.dispatchEvent(new Event("change", { bubbles: true }));
    st.open = false; box.hidden = true; st.el = null;
  }
  $("cp_ok").onclick = () => close(true);
  $("cp_no").onclick = () => close(false);
  if (window.EyeDropper) {
    $("cp_eye").onclick = async () => {
      try { const r = await new EyeDropper().open(), c = parseHex(r.sRGBHex); if (c) setRGB(c[0], c[1], c[2]); } catch (e) {}
    };
  } else $("cp_eye").style.display = "none";

  // ganti pemilih bawaan browser
  document.addEventListener("click", e => {
    const i = e.target.closest && e.target.closest('input[type="color"]');
    if (i) { e.preventDefault(); if (st.open && st.el === i) close(true); else { if (st.open) close(true); open(i); } return; }
    if (st.open && !box.contains(e.target)) close(true);
  }, true);
  window.addEventListener("resize", () => { if (st.open) place(st.el); });
  window.irColorPicker = { open, close };
})();
