/* InstantManiaRetoucher - pencatat edit untuk melatih AI.
   - Hanya angka yang dikirim (nilai slider + sidik jari foto). Foto TIDAK diunggah.
   - Dicatat saat EXPORT / BATCH EXPORT, lewat window.logEdit(p) yang dipanggil dari export.js.
   - Kalau gagal atau belum login, ekspor tetap jalan; log ditahan di browser lalu dikirim nanti. */
(function () {
  "use strict";

  const SB_URL = "https://ohtrmsvxqxpobqrcuckb.supabase.co";
  const SB_KEY = "sb_publishable_smGnZcynxySp2ph1V2UNyA_-AbYqaYd"; // kunci publik, aman di web
  const APP_VERSION = "engine-2";
  const QKEY = "ir_log_queue";

  let sb = null, user = null, flushing = false, lastErr = "";
  const seen = new Map(); // nama foto -> pengaturan terakhir yang sudah dicatat (hindari dobel)

  /* ---------- Antrean di browser ---------- */
  const getQ = () => { try { return JSON.parse(localStorage.getItem(QKEY) || "[]"); } catch (e) { return []; } };
  const setQ = q => { try { localStorage.setItem(QKEY, JSON.stringify(q.slice(-500))); } catch (e) {} };

  /* ---------- Dialog login ---------- */
  const dlg = document.createElement("dialog");
  dlg.style.cssText = "background:#1a1a1a;color:#eee;border:1px solid #444;border-radius:10px;padding:18px;font:14px system-ui,sans-serif";
  dlg.innerHTML =
    '<form id="irl_f" style="display:grid;gap:10px;min-width:280px">' +
    '<b>Masuk tim InstantMania</b>' +
    '<span style="font-size:12px;color:#aaa">Supaya hasil editmu bisa dipelajari AI. Hanya angka yang dikirim, foto tetap di komputermu.</span>' +
    '<input id="irl_e" type="email" placeholder="Email" autocomplete="username" required style="padding:8px;border-radius:6px;border:1px solid #555;background:#111;color:#eee">' +
    '<input id="irl_p" type="password" placeholder="Password" autocomplete="current-password" required style="padding:8px;border-radius:6px;border:1px solid #555;background:#111;color:#eee">' +
    '<div id="irl_m" style="font-size:12px;min-height:16px;color:#ff9a55"></div>' +
    '<div style="display:flex;gap:8px;justify-content:flex-end">' +
    '<button type="button" id="irl_x" style="padding:7px 12px;border-radius:6px;border:1px solid #555;background:transparent;color:#ddd;cursor:pointer">Tutup</button>' +
    '<button type="submit" style="padding:7px 14px;border-radius:6px;border:0;background:#ff7a1a;color:#111;font-weight:600;cursor:pointer">Masuk</button>' +
    '</div></form>';
  document.body.appendChild(dlg);

  const $$ = id => dlg.querySelector("#" + id);

  /* ---------- Akun di pojok kanan atas (avatar + menu), mirip Evoto ---------- */
  const DEV_KEY = "ir_device_name";
  const deviceName = () => {
    try {
      let n = localStorage.getItem(DEV_KEY);
      if (!n) { n = "PC-" + Math.random().toString(36).slice(2, 6).toUpperCase(); localStorage.setItem(DEV_KEY, n); }
      return n;
    } catch (e) { return "PC"; }
  };
  let libFail = false;

  const holder = document.createElement("div");
  holder.style.cssText = "position:relative;display:inline-flex;align-items:center;margin-left:10px;font:13px system-ui,sans-serif;color:#ddd";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.style.cssText = "display:flex;align-items:center;gap:8px;max-width:210px;padding:3px 12px 3px 3px;background:transparent;color:#ddd;border:1px solid #444;border-radius:999px;cursor:pointer;font:inherit";
  const av = document.createElement("span");
  av.style.cssText = "position:relative;flex:none;width:26px;height:26px;border-radius:50%;background:#555;color:#111;display:grid;place-items:center";
  const initial = document.createElement("b");
  initial.style.cssText = "font-size:13px;line-height:1";
  const dot = document.createElement("i");
  dot.style.cssText = "position:absolute;right:-3px;bottom:-3px;width:10px;height:10px;border-radius:50%;border:2px solid #161616;background:#888";
  av.append(initial, dot);
  const nm = document.createElement("span");
  nm.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
  btn.append(av, nm);
  holder.appendChild(btn);

  const menu = document.createElement("div");
  menu.hidden = true;
  menu.style.cssText = "position:fixed;width:260px;box-sizing:border-box;padding:14px;background:#1a1a1a;color:#ddd;border:1px solid #444;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.5);z-index:60;text-align:left;font:13px system-ui,sans-serif";
  menu.innerHTML =
    '<div style="font-size:11px;color:#8a8f94">Masuk sebagai</div>' +
    '<div id="irm_mail" style="font-weight:600;word-break:break-all;margin:2px 0 10px"></div>' +
    '<div style="font-size:11px;color:#8a8f94">Nama PC ini</div>' +
    '<input id="irm_dev" maxlength="24" style="width:100%;box-sizing:border-box;margin:3px 0 10px;padding:6px 8px;border-radius:6px;border:1px solid #555;background:#111;color:#eee;font:inherit">' +
    '<div id="irm_st" style="font-size:12px;color:#aaa;margin-bottom:12px"></div>' +
    '<button type="button" id="irm_out" style="width:100%;padding:8px;border-radius:8px;border:1px solid #555;background:transparent;color:#ddd;cursor:pointer;font:inherit">Keluar</button>';
  document.body.appendChild(menu);
  const $m = id => menu.querySelector("#" + id);

  // Pasang di kanan tombol BATCH EXPORT; kalau tidak ketemu, pakai pojok kanan atas layar.
  const anchor = document.getElementById("expall");
  if (anchor && anchor.parentNode) anchor.after(holder);
  else { holder.style.cssText += ";position:fixed;right:12px;top:10px;z-index:50"; document.body.appendChild(holder); }

  function openMenu() {
    const r = btn.getBoundingClientRect();
    menu.style.top = (r.bottom + 8) + "px";
    menu.style.right = Math.max(8, window.innerWidth - r.right) + "px";
    menu.hidden = false;
    refresh();
  }
  function closeMenu() { menu.hidden = true; }

  function refresh() {
    const n = getQ().length;
    if (!sb) {
      initial.textContent = "·"; nm.textContent = libFail ? "Tanpa log (offline)" : "Memuat…";
      av.style.background = "#555"; dot.style.background = "#888"; btn.style.borderColor = "#444";
      btn.title = ""; return;
    }
    if (!user) {
      initial.textContent = "?"; nm.textContent = "Belum masuk";
      av.style.background = "#555"; dot.style.background = "#ff7a1a"; btn.style.borderColor = "#ff7a1a";
      btn.title = "Klik untuk masuk"; closeMenu(); return;
    }
    const mail = user.email || "";
    initial.textContent = (mail[0] || "?").toUpperCase();
    nm.textContent = mail.split("@")[0];
    av.style.background = "#ff7a1a"; btn.style.borderColor = "#444";
    dot.style.background = lastErr ? "#d9534f" : n ? "#ff7a1a" : "#3c9a5f";
    btn.title = mail + " · " + deviceName();
    $m("irm_mail").textContent = mail;
    const dv = $m("irm_dev");
    if (document.activeElement !== dv) dv.value = deviceName();
    $m("irm_st").textContent = lastErr ? "Gagal mengirim log: " + lastErr
      : n ? `Log menunggu dikirim: ${n}` : "Log edit terkirim, semua aman.";
  }

  btn.onclick = e => {
    e.stopPropagation();
    if (!sb) return;
    if (!user) { $$("irl_m").textContent = ""; dlg.showModal(); return; }
    menu.hidden ? openMenu() : closeMenu();
  };
  document.addEventListener("click", e => { if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) closeMenu(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeMenu(); });
  window.addEventListener("resize", closeMenu);

  // Ketikan di kolom teks tidak boleh menggeser foto (main.js memakai tombol panah).
  const dev = $m("irm_dev");
  [dev, dlg].forEach(el => el.addEventListener("keydown", e => e.stopPropagation()));
  dev.addEventListener("keydown", e => { if (e.key === "Escape" || e.key === "Enter") { dev.blur(); closeMenu(); } });
  dev.addEventListener("change", () => {
    const v = dev.value.trim().slice(0, 24) || deviceName();
    try { localStorage.setItem(DEV_KEY, v); } catch (e) {}
    dev.value = v; refresh();
  });
  $m("irm_out").onclick = async () => {
    if (!sb) return;
    if (!confirm("Keluar dari akun " + (user && user.email) + "?\nFoto milik akun ini tetap tersimpan di PC ini dan muncul lagi saat kamu masuk.")) return;
    closeMenu();
    await sb.auth.signOut();
  };
  $$("irl_x").onclick = () => dlg.close();
  $$("irl_f").onsubmit = async e => {
    e.preventDefault();
    if (!sb) return;
    $$("irl_m").textContent = "Masuk…";
    const { error } = await sb.auth.signInWithPassword({ email: $$("irl_e").value.trim(), password: $$("irl_p").value });
    if (error) { $$("irl_m").textContent = "Gagal masuk: " + error.message; return; }
    $$("irl_p").value = "";
    dlg.close();
  };

  /* ---------- Supabase ---------- */
  // Memberi tahu modul lain (store.js) siapa yang sedang login.
  function announce() {
    window.irAuth = { ready: true, user: user };
    window.dispatchEvent(new CustomEvent("ir-auth"));
  }

  function init() {
    sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    sb.auth.getSession().then(({ data }) => {
      user = (data.session && data.session.user) || null;
      refresh();
      announce();
      if (user) flush();
      else if (!sessionStorage.getItem("ir_login_asked")) { sessionStorage.setItem("ir_login_asked", "1"); dlg.showModal(); }
    });
    sb.auth.onAuthStateChange((_e, s) => { user = (s && s.user) || null; refresh(); announce(); if (user) flush(); });
  }

  const lib = document.createElement("script");
  lib.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
  lib.onload = init;
  lib.onerror = () => { libFail = true; refresh(); };
  document.head.appendChild(lib);

  async function flush() {
    if (flushing || !sb || !user) return;
    const q = getQ();
    if (!q.length) { refresh(); return; }
    flushing = true;
    try {
      const batch = q.slice(0, 50);
      const { error } = await sb.from("edit_logs").insert(batch);
      if (error) throw error;
      setQ(getQ().slice(batch.length));
      lastErr = "";
      flushing = false;
      refresh();
      if (getQ().length) return flush();
    } catch (e) {
      flushing = false;
      lastErr = (e && e.message) || "tidak diketahui";
      refresh();
    }
  }
  window.addEventListener("online", flush);

  /* ---------- Sidik jari foto (dihitung dari thumbnail 120px, foto ASLI sebelum diedit) ---------- */
  const r4 = x => Math.round(x * 10000) / 10000;

  async function fingerprint(p) {
    const img = new Image();
    img.src = p.thumb;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight, n = w * h;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, w, h).data;

    const L = new Float32Array(n), hist = new Array(16).fill(0);
    let sr = 0, sg = 0, sb2 = 0, sl = 0, sl2 = 0, ss = 0;
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const r = d[i] / 255, gg = d[i + 1] / 255, b = d[i + 2] / 255;
      const l = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
      L[j] = l; sr += r; sg += gg; sb2 += b; sl += l; sl2 += l * l;
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      ss += mx === 0 ? 0 : (mx - mn) / mx;
      hist[Math.min(15, Math.floor(l * 16))]++;
    }
    const sorted = Float32Array.from(L).sort();
    const q = f => sorted[Math.min(n - 1, Math.floor(f * n))];
    const mean = sl / n;
    return {
      lum_mean: r4(mean),
      lum_std: r4(Math.sqrt(Math.max(0, sl2 / n - mean * mean))),
      p01: r4(q(0.01)), p05: r4(q(0.05)), p50: r4(q(0.5)), p95: r4(q(0.95)), p99: r4(q(0.99)),
      r_mean: r4(sr / n), g_mean: r4(sg / n), b_mean: r4(sb2 / n),
      sat_mean: r4(ss / n),
      hist: hist.map(v => r4(v / n)),
      aspect: r4((p.w0 || w) / (p.h0 || h)),
      is_raw: !!p.raw,
      n_faces: Array.isArray(p.faces) ? p.faces.length : null
    };
  }

  /* ---------- Pencatatan ---------- */
  function isEdited(s) {
    const D = (typeof DEF !== "undefined") ? DEF : {};
    return Object.keys(s).some(k => Math.abs((+s[k]) - (+(D[k] || 0))) > 1e-6);
  }

  async function record(p) {
    if (!p || !p.thumb) return;
    const LYR = typeof irLayers === "function" ? irLayers(p) : [{ id: "all", s: p.s, pc: p.pc || null }];
    const G = LYR[0], pcOn = (typeof pcIsId === "function") ? !pcIsId(G.pc) : false;
    const areaLs = LYR.slice(1).filter(l => p.areas && typeof irLayerActive === "function" && irLayerActive(l));
    if (!G.s || (!isEdited(G.s) && !pcOn && !areaLs.length)) return;
    const settings = {};
    Object.keys(G.s).forEach(k => { settings[k] = r4(+G.s[k]); });
    if (pcOn) {
      settings.pc = G.pc.map(a => [r4(a[0]), r4(a[1])]);
      if (typeof pcSample9 === "function") settings.pc9 = pcSample9(G.pc).map(r4);
    }
    if (areaLs.length) {            // pengaturan tiap area (Face, Skin, Hair, ...) dicatat terpisah, hanya nilai yang berubah
      settings.areas = {};
      areaLs.forEach(l => {
        const o = {};
        Object.keys(l.s).forEach(k => { if (Math.abs(+l.s[k] - (DEF[k] || 0)) > 1e-6) o[k] = r4(+l.s[k]); });
        if (typeof pcIsId === "function" && !pcIsId(l.pc)) o.pc = l.pc.map(a => [r4(a[0]), r4(a[1])]);
        settings.areas[l.id] = o;
      });
    }
    const sig = JSON.stringify(settings);
    if (seen.get(p.name) === sig) return;
    seen.set(p.name, sig);
    const features = await fingerprint(p);
    features.device = deviceName();
    const q = getQ();
    q.push({ app_version: APP_VERSION, features, settings });
    setQ(q);
    refresh();
    flush();
  }

  // Dipanggil dari export.js. Tidak boleh pernah mengganggu ekspor.
  window.logEdit = function (p) {
    try { record(p).catch(() => {}); } catch (e) {}
  };

  refresh();
})();
