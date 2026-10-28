/* InstantManiaRetoucher - Panel berkategori.
   Lima kategori dengan ikon di atas panel kanan. Ikon aktif berwarna jingga, yang lain abu-abu, dan hanya fitur
   dari kategori aktif yang tampil. Fitur baru cukup didaftarkan ke salah satu kategori di bawah (CATS)
   atau lewat window.irPanel.add(elemen, "idKategori"). Dimuat paling akhir, setelah semua modul panel. */
(function () {
  "use strict";

  /* ---------- Daftar kategori (urutan = urutan di layar) ---------- */
  const ico = p => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const CATS = [
    { id: "color", name: "Color Adjustment", subs: ["Light", "Color", "HSL", "Selective Color", "Curves"],
      icon: ico('<circle cx="12" cy="12" r="4.2"/><path d="M12 7.8a4.2 4.2 0 0 0 0 8.4z" fill="currentColor"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7L7 17M17 7l1.7-1.7"/>') },
    { id: "crop", name: "Cropping", subs: ["Crop"],
      icon: ico('<path d="M6.5 2.5v13a2 2 0 0 0 2 2h13M2.5 6.5h13a2 2 0 0 1 2 2v13"/>') },
    { id: "presence", name: "Presence", subs: ["Effects", "Retouch"],
      icon: ico('<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="10.2" r="2.9"/><path d="M6.8 17.4a5.2 4.2 0 0 1 10.4 0"/>') },
    { id: "mask", name: "Masking", subs: ["Selection"],
      icon: ico('<circle cx="10" cy="10" r="6.2" stroke-dasharray="2.6 2.6"/><path d="M13.2 13.2l7.6 2.9-3.4 1.4-1.4 3.4z" fill="currentColor"/>') },
    { id: "bg", name: "Background", subs: ["Background"],
      icon: ico('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 10.5L10.5 3M3 17.5L17.5 3M6.5 21L21 6.5M13.5 21L21 13.5"/>') }
  ];

  /* ---------- Gaya ---------- */
  const st = document.createElement("style");
  st.textContent = `#panelhead{position:sticky;top:0;z-index:30}
#cattabs{display:flex;gap:2px;padding:0}
#cattabs button{flex:1;display:grid;place-items:center;height:48px;padding:0;border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;color:#7d8388;cursor:pointer}
#cattabs button:hover{color:#b9bec3}
#cattabs button.on{color:#ff7a1a;border-bottom-color:#ff7a1a}
#cattabs button:focus-visible{outline:2px solid #ff7a1a;outline-offset:-3px}
#cathead{padding:10px 12px 6px;font-size:13px;font-weight:700;letter-spacing:.2px;color:#ff7a1a}
.cat{display:none}
.cat.on{display:block}`;
  document.head.appendChild(st);

  /* ---------- Bangun struktur ---------- */
  const bg = getComputedStyle(panel).backgroundColor;
  const head = document.createElement("div");
  head.id = "panelhead";
  head.style.background = bg && bg !== "rgba(0, 0, 0, 0)" ? bg : "#1b1b1b";
  const tabs = document.createElement("div");
  tabs.id = "cattabs"; tabs.setAttribute("role", "tablist");
  const title = document.createElement("div");
  title.id = "cathead";
  head.append(tabs);
  if (window.irBannerEl) head.append(window.irBannerEl);
  head.append(title);

  const conts = {}, btns = {};
  CATS.forEach(c => {
    const b = document.createElement("button");
    b.type = "button"; b.innerHTML = c.icon; b.title = c.name; b.setAttribute("aria-label", c.name); b.setAttribute("role", "tab");
    b.onclick = () => setCat(c.id);
    tabs.appendChild(b); btns[c.id] = b;
    const d = document.createElement("div");
    d.className = "cat"; d.dataset.cat = c.id;
    conts[c.id] = d;
  });

  const titleOf = d => { const s = d.querySelector(":scope > summary > span"); return s ? s.textContent.trim() : ""; };
  const secs = () => [...panel.querySelectorAll(":scope > details.sec")];
  const take = name => secs().find(d => titleOf(d) === name);

  // "Selection" memakai isi dari areas.js
  if (window.irSelectionEl) {
    const d = document.createElement("details");
    d.className = "sec"; d.open = true;
    d.innerHTML = '<summary><span>Selection</span></summary><div class="body"></div>';
    d.querySelector(".body").appendChild(window.irSelectionEl);
    panel.appendChild(d);
  }

  CATS.forEach(c => c.subs.forEach(n => { const d = take(n); if (d) conts[c.id].appendChild(d); }));
  // bagian lain yang belum terdaftar: taruh di kategori pertama supaya tidak hilang
  secs().forEach(d => { conts[CATS[0].id].appendChild(d); console.warn("Bagian panel belum terdaftar di kategori:", titleOf(d)); });

  panel.prepend(head);
  CATS.forEach(c => panel.appendChild(conts[c.id]));

  function setCat(id) {
    if (!conts[id]) id = CATS[0].id;
    CATS.forEach(c => {
      const on = c.id === id;
      conts[c.id].classList.toggle("on", on);
      btns[c.id].classList.toggle("on", on);
      btns[c.id].setAttribute("aria-selected", on ? "true" : "false");
      if (on) title.textContent = c.name;
    });
    panel.scrollTop = 0;
    try { localStorage.setItem("ir_cat", id); } catch (e) {}
  }
  let first = CATS[0].id;
  try { first = localStorage.getItem("ir_cat") || first; } catch (e) {}
  setCat(first);

  // Modul baru: window.irPanel.add(elemenDetails, "color" | "crop" | "presence" | "mask" | "bg")
  window.irPanel = { cats: CATS.map(c => c.id), setCat, add(el, id) { (conts[id] || conts[CATS[0].id]).appendChild(el); } };

  /* ---------- Nama fitur berbahasa Inggris untuk tombol di luar panel ---------- */
  const EN = {
    "Buka foto": "Open photo", "Putar": "Rotate", "Tahan untuk lihat asli": "Hold to compare",
    "Terapkan ke foto tercentang": "Apply to checked", "Centang semua / kosongkan": "Check all / none",
    "Hapus foto ini": "Delete photo", "Hapus yang tercentang": "Delete checked"
  };
  const tr = () => {
    document.querySelectorAll("button, label").forEach(el => {
      if (el.children.length && !(el.tagName === "LABEL")) return;
      const node = [...el.childNodes].find(n => n.nodeType === 3 && EN[n.nodeValue.trim()]);
      if (node) node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), EN[node.nodeValue.trim()]);
    });
  };
  tr(); setInterval(tr, 1000);

  // Tombol kuas kilau: teksnya diatur face.js dalam bahasa Indonesia, jadikan Inggris.
  const gb = document.getElementById("gbrush");
  if (gb && gb.onclick) {
    const o = gb.onclick;
    gb.onclick = function () {
      const r = o.apply(this, arguments);
      gb.textContent = gb.textContent.replace("Kuas kilau: nyala", "Glare brush: on").replace("Kuas kilau: mati", "Glare brush: off");
      return r;
    };
  }
})();
