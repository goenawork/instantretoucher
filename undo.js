/* InstantManiaRetoucher - Undo / Redo per foto.
   - Ctrl+Z = Undo, Ctrl+Y atau Ctrl+Shift+Z = Redo (sama seperti Photoshop).
   - Satu langkah riwayat = satu "sesi" perubahan (menarik slider sampai berhenti, menggeser titik kurva, Reset, dll).
   - Yang tercatat: semua slider, kurva titik, crop, goresan kuas Latar, dan pengaturan kilau otomatis.
   - Belum tercatat: rotasi, hasil "Pisahkan subjek", dan goresan kuas kilau. */
(function () {
  "use strict";

  const MAX = 100;      // langkah per foto
  const SETTLE = 350;   // ms diam sebelum sebuah perubahan dianggap satu langkah
  let applying = false;

  const snap = p => JSON.stringify({
    s: p.s, pc: p.pc || null, c: p.crop || null, m: p.mst || [],
    g: [!!(p.glare && p.glare.auto), p.glare ? p.glare.thr : 0.88]
  });

  function pushStep(h, sg) {
    h.st.length = h.i + 1; h.st.push(sg);
    if (h.st.length > MAX) h.st.shift();
    h.i = h.st.length - 1; h.last = sg; h.t = 0;
  }
  // Dipanggil modul lain (kuas Latar) agar tiap goresan jadi satu langkah sendiri, secepat apa pun.
  window.irHistoryCommit = () => {
    if (!cur || !cur._h || applying) return;
    const sg = snap(cur);
    if (sg !== cur._h.st[cur._h.i]) pushStep(cur._h, sg);
    cur._h.ml = (cur.mst || []).length;
    buttons();
  };

  function track() {
    if (applying) return;
    const now = Date.now();
    for (const p of photos) {
      const sg = snap(p);
      if (!p._h) { p._h = { st: [sg], i: 0, last: sg, t: 0 }; continue; }
      const h = p._h, ml = (p.mst || []).length;
      if (h.ml === undefined) h.ml = ml;
      if (ml !== h.ml) {                                                   // goresan kuas: tiap goresan = satu langkah sendiri
        h.ml = ml; pushStep(h, sg); buttons(); continue;
      }
      if (sg !== h.last) { h.last = sg; h.t = now; continue; }            // masih berubah
      if (h.t && now - h.t >= SETTLE && sg !== h.st[h.i]) {               // sudah diam: catat satu langkah
        h.st.length = h.i + 1;                                           // buang cabang redo
        h.st.push(sg);
        if (h.st.length > MAX) h.st.shift();
        h.i = h.st.length - 1;
        h.t = 0;
        buttons();
      } else if (h.t && now - h.t >= SETTLE) h.t = 0;
    }
  }

  async function go(dir) {
    if (!cur || busy || !cur._h) return;
    const h = cur._h, ni = h.i + dir;
    if (h.t) { h.t = 0; if (snap(cur) !== h.st[h.i]) { h.st.length = h.i + 1; h.st.push(snap(cur)); h.i = h.st.length - 1; } }   // simpan dulu perubahan yang belum dicatat
    const to = h.i + dir;
    if (to < 0 || to >= h.st.length) { buttons(); return; }
    const d = JSON.parse(h.st[to]);
    applying = true;
    try {
      const cropChanged = JSON.stringify(cur.crop || null) !== JSON.stringify(d.c || null);
      const glareChanged = !!cur.glare.auto !== d.g[0] || cur.glare.thr !== d.g[1];
      cur.s = { ...zero(), ...d.s };
      cur.pc = d.pc ? d.pc.map(a => [a[0], a[1]]) : null;
      cur.glare.auto = d.g[0]; cur.glare.thr = d.g[1];
      const mstChanged = JSON.stringify(cur.mst || []) !== JSON.stringify(d.m || []);
      if (mstChanged) { cur.mst = d.m || []; cur._fk = null; }
      if (cropChanged) {
        cur.crop = d.c || null;
        if (window.irCrop) window.irCrop.invalidate(cur);
      }
      h.i = to; h.last = h.st[to]; h.t = 0; h.ml = (cur.mst || []).length;
      syncUI();
      if (glareChanged || cropChanged) { await show(cur, PREV); if (cropChanged) fitView(); } else draw();
    } finally { applying = false; buttons(); }
  }

  /* ---------- Tombol di header ---------- */
  const ref = $("reset");
  const mk = (txt, title, fn) => {
    const b = document.createElement("button");
    if (ref) b.className = ref.className;
    b.type = "button"; b.textContent = txt; b.title = title; b.disabled = true; b.onclick = fn;
    b.style.minWidth = "34px";
    return b;
  };
  const bu = mk("↶", "Undo (Ctrl+Z)", () => go(-1));
  const br = mk("↷", "Redo (Ctrl+Y)", () => go(1));
  if (ref) ref.before(bu, br); else document.body.append(bu, br);

  function buttons() {
    const h = cur && cur._h;
    bu.disabled = !h || (h.i <= 0 && !(h.t && snap(cur) !== h.st[h.i]));
    br.disabled = !h || h.i >= h.st.length - 1;
  }

  /* ---------- Keyboard ---------- */
  window.addEventListener("keydown", e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const t = e.target, typing = t && (t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && !/^(range|checkbox|color|button)$/.test(t.type)));
    if (typing) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) { e.preventDefault(); go(-1); }
    else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); go(1); }
  });

  setInterval(() => { track(); buttons(); }, 150);
})();
