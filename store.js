/* InstantManiaRetoucher - penyimpanan foto di browser (IndexedDB).
   - Foto + nilai slider + rotasi + status centang tetap ada setelah refresh.
   - Terpisah per akun yang login (lewat logger.js), jadi tiap editor hanya melihat fotonya sendiri.
   - Foto hanya hilang kalau kamu menekan tombol Hapus (atau membersihkan data browser).
   - Foto TIDAK diunggah ke mana pun; semuanya tersimpan di komputer ini.
   Belum tersimpan: hasil "Pisahkan subjek" dan kuas kilau kacamata (harus diulang setelah refresh). */
(function () {
  "use strict";

  const SEQ0 = Date.now();
  let seqN = 0, db = null, dbUid = null, started = false, lock = false, warned = false;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---------- IndexedDB ---------- */
  function open(uid) {
    return new Promise((res, rej) => {
      const r = indexedDB.open("ir_photos_" + uid, 1);
      r.onupgradeneeded = () => {
        r.result.createObjectStore("meta", { keyPath: "id" }); // data kecil: nama, slider, thumbnail
        r.result.createObjectStore("blobs");                   // file foto (besar)
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }

  function tx(stores, mode, fn) {
    return new Promise((res, rej) => {
      const t = db.transaction(stores, mode);
      let req;
      try { req = fn(t); } catch (e) { rej(e); return; }
      t.oncomplete = () => res(req && "result" in req ? req.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  }

  const getAll = name => tx([name], "readonly", t => t.objectStore(name).getAll());
  const getOne = (name, key) => tx([name], "readonly", t => t.objectStore(name).get(key));

  const metaOf = p => ({
    id: p._id, seq: p._seq, name: p.name, thumb: p.thumb, s: p.s, rot: p.rot, on: p.on,
    w0: p.w0, h0: p.h0, raw: p.raw, glare: { auto: p.glare.auto, thr: p.glare.thr }, pc: p.pc || null
  });
  // Penanda perubahan: kalau berubah, data foto disimpan ulang.
  const sigOf = p => JSON.stringify([p.s, p.rot, p.on, p.glare && p.glare.auto, p.glare && p.glare.thr, p.pc || null]);

  function savePhoto(p, withBlob) {
    return tx(["meta", "blobs"], "readwrite", t => {
      t.objectStore("meta").put(metaOf(p));
      if (withBlob) t.objectStore("blobs").put(p.blob, p._id);
    });
  }

  function removeIds(ids) {
    return tx(["meta", "blobs"], "readwrite", t => {
      ids.forEach(id => { t.objectStore("meta").delete(id); t.objectStore("blobs").delete(id); });
    });
  }

  /* ---------- Pulihkan saat halaman dibuka ---------- */
  async function restore() {
    const metas = (await getAll("meta")).sort((a, b) => a.seq - b.seq);
    let n = 0;
    for (const m of metas) {
      const blob = await getOne("blobs", m.id);
      if (!blob) continue;
      const p = {
        name: m.name, blob, thumb: m.thumb,
        s: { ...zero(), ...(m.s || {}) },
        rot: m.rot || 0, pc: Array.isArray(m.pc) ? m.pc : null, mask: null, on: m.on !== false, w0: m.w0, h0: m.h0, raw: !!m.raw,
        glare: { auto: !!(m.glare && m.glare.auto), thr: (m.glare && m.glare.thr) || 0.88, strokes: [] },
        _id: m.id, _seq: m.seq
      };
      p._sig = sigOf(p);
      photos.push(p);
      n++;
    }
    if (!n) return;
    strip();
    if (!cur) await select(0);
    let used = "";
    try {
      const e = await navigator.storage.estimate();
      used = ` · ${(e.usage / 1048576).toFixed(0)} MB terpakai di browser`;
    } catch (e) {}
    msg(`${n} foto dipulihkan dari penyimpanan browser${used}.`);
  }

  /* ---------- Simpan otomatis (cek tiap 1 detik) ---------- */
  async function autosave() {
    if (!db || lock) return;
    lock = true;
    try {
      for (const p of [...photos]) {
        if (p._nosave) continue;
        if (!p._id) {
          // foto baru: simpan file + data
          p._id = crypto.randomUUID();
          p._seq = SEQ0 + (++seqN);
          try { await savePhoto(p, true); p._sig = sigOf(p); }
          catch (e) {
            p._id = null; p._nosave = true;
            if (!warned) {
              warned = true;
              msg("Foto belum bisa disimpan di browser (penyimpanan penuh atau diblokir). Edit tetap jalan, tapi foto akan hilang saat refresh.");
            }
          }
        } else {
          // foto lama: simpan ulang hanya kalau slider/rotasi/centang berubah
          const sg = sigOf(p);
          if (sg !== p._sig) { try { await savePhoto(p, false); p._sig = sg; } catch (e) {} }
        }
      }
    } finally { lock = false; }
  }

  /* ---------- Hapus ---------- */
  async function removePhotos(list) {
    if (busy) { msg("Tunggu proses ekspor atau pemisahan selesai dulu."); return; }
    list = list.filter(Boolean);
    if (!list.length) { msg("Tidak ada foto yang dipilih."); return; }
    if (!confirm(`Hapus ${list.length} foto dari penyimpanan? Foto aslimu di komputer tidak ikut terhapus.`)) return;
    while (lock) await sleep(30);
    lock = true;
    try {
      const oldIdx = idx, wasCur = list.includes(cur);
      if (db) {
        const ids = list.map(p => p._id).filter(Boolean);
        if (ids.length) await removeIds(ids);
      }
      list.forEach(p => { const i = photos.indexOf(p); if (i >= 0) photos.splice(i, 1); });
      if (!photos.length) { location.reload(); return; }
      if (wasCur) { cur = null; idx = -1; strip(); await select(Math.min(oldIdx, photos.length - 1)); }
      else { idx = photos.indexOf(cur); strip(); }
      msg(`${list.length} foto dihapus. Sisa ${photos.length} foto.`);
    } catch (e) {
      msg("Gagal menghapus: " + ((e && e.message) || e));
    } finally { lock = false; }
  }

  function addButtons() {
    const anchor = $("chk");
    if (!anchor) return;
    const mk = (txt, title, fn) => {
      const b = document.createElement("button");
      b.className = anchor.className;
      b.textContent = txt; b.title = title; b.onclick = fn;
      return b;
    };
    anchor.after(
      mk("Hapus foto ini", "Hapus foto yang sedang dibuka dari penyimpanan", () => removePhotos(cur ? [cur] : [])),
      mk("Hapus yang tercentang", "Hapus semua foto bercentang dari penyimpanan", () => removePhotos(photos.filter(p => p.on)))
    );
  }

  /* ---------- Mulai ---------- */
  async function begin(uid) {
    if (started) return;
    started = true; dbUid = uid;
    try { db = await open(uid); }
    catch (e) { msg("Penyimpanan browser tidak tersedia, foto tidak akan bertahan setelah refresh."); return; }
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    try { await restore(); } catch (e) { msg("Sebagian foto tersimpan gagal dipulihkan."); }
    setInterval(autosave, 1000);
  }

  // Akun yang login diketahui lewat logger.js. Kalau berbeda dari yang dipakai saat ini, muat ulang.
  function onAuth() {
    const a = window.irAuth;
    if (!a || !a.ready) return;
    const uid = a.user ? a.user.id : "guest";
    try { localStorage.setItem("ir_last_uid", a.user ? a.user.id : ""); } catch (e) {}
    if (!started) begin(uid);
    else if (uid !== dbUid) location.reload();
  }

  window.addEventListener("ir-auth", onAuth);
  let first = "guest";
  try { first = localStorage.getItem("ir_last_uid") || "guest"; } catch (e) {}
  begin(first);   // langsung pakai akun terakhir supaya foto cepat muncul
  onAuth();       // lalu koreksi kalau ternyata akunnya berbeda
  addButtons();
})();
