/* InstantManiaRetoucher - pencatat edit untuk melatih AI.
   - Hanya angka yang dikirim (nilai slider + sidik jari foto). Foto TIDAK diunggah.
   - Dicatat saat EXPORT / BATCH EXPORT, lewat window.logEdit(p) yang dipanggil dari export.js.
   - Kalau gagal atau belum login, ekspor tetap jalan; log ditahan di browser lalu dikirim nanti. */
(function () {
  "use strict";

  const SB_URL = "https://ohtrmsvxqxpobqrcuckb.supabase.co";
  const SB_KEY = "sb_publishable_smGnZcynxySp2ph1V2UNyA_-AbYqaYd"; // kunci publik, aman di web
  const APP_VERSION = "log-1";
  const QKEY = "ir_log_queue";

  let sb = null, user = null, flushing = false, lastErr = "";
  const seen = new Map(); // nama foto -> pengaturan terakhir yang sudah dicatat (hindari dobel)

  /* ---------- Antrean di browser ---------- */
  const getQ = () => { try { return JSON.parse(localStorage.getItem(QKEY) || "[]"); } catch (e) { return []; } };
  const setQ = q => { try { localStorage.setItem(QKEY, JSON.stringify(q.slice(-500))); } catch (e) {} };

  /* ---------- Tampilan kecil: lencana status + dialog login ---------- */
  const badge = document.createElement("button");
  badge.type = "button";
  badge.style.cssText = "position:fixed;right:12px;bottom:6px;z-index:50;padding:3px 10px;font:12px system-ui,sans-serif;" +
    "background:#1b1b1b;color:#ddd;border:1px solid #444;border-radius:6px;cursor:pointer";
  document.body.appendChild(badge);

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

  function refresh() {
    const n = getQ().length;
    const pend = n ? ` · antre ${n}` : "";
    if (!sb) { badge.textContent = "Log: memuat…" + pend; badge.style.borderColor = "#444"; return; }
    if (user) {
      badge.textContent = `Log aktif: ${(user.email || "").split("@")[0]}${pend}`;
      badge.style.borderColor = lastErr ? "#c0563a" : "#3c9a5f";
      badge.title = lastErr ? "Gagal mengirim: " + lastErr : "Klik untuk keluar";
    } else {
      badge.textContent = "Log: belum masuk (klik)" + pend;
      badge.style.borderColor = "#ff7a1a";
      badge.title = "Klik untuk masuk";
    }
  }

  badge.onclick = async () => {
    if (!sb) return;
    if (user) {
      if (confirm("Keluar dari akun " + user.email + "?")) await sb.auth.signOut();
    } else {
      $$("irl_m").textContent = "";
      dlg.showModal();
    }
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
  function init() {
    sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
    sb.auth.getSession().then(({ data }) => {
      user = (data.session && data.session.user) || null;
      refresh();
      if (user) flush();
      else if (!sessionStorage.getItem("ir_login_asked")) { sessionStorage.setItem("ir_login_asked", "1"); dlg.showModal(); }
    });
    sb.auth.onAuthStateChange((_e, s) => { user = (s && s.user) || null; refresh(); if (user) flush(); });
  }

  const lib = document.createElement("script");
  lib.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
  lib.onload = init;
  lib.onerror = () => { badge.textContent = "Log: gagal memuat library"; };
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
    if (!p || !p.s || !p.thumb || !isEdited(p.s)) return;
    const settings = {};
    Object.keys(p.s).forEach(k => { settings[k] = r4(+p.s[k]); });
    const sig = JSON.stringify(settings);
    if (seen.get(p.name) === sig) return;
    seen.set(p.name, sig);
    const features = await fingerprint(p);
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
