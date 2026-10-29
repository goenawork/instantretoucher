/* InstantManiaRetoucher - Copy / Paste settings.
   "Copy settings" menyalin semua pengaturan foto yang sedang dibuka: seluruh adjustment, adjustment tiap area,
   pengaturan kilau kacamata, crop, dan penanda latar yang diganti. "Paste settings" menempelkannya ke foto ini
   atau ke semua foto bercentang, dengan pilihan apa saja yang ditempel.
   Pintasan: Ctrl+Shift+C = copy, Ctrl+Shift+V = paste.
   Catatan: area (Face, Skin, ...) dan subjek latar berbeda di tiap foto, jadi pada foto tujuan keduanya dideteksi
   otomatis dulu (butuh internet), baru pengaturannya ditempel. Jenis latar, warna, dan gambar memang berlaku global. */
(function () {
  "use strict";

  const clonePc = pc => pc ? pc.map(a => [a[0], a[1]]) : null;
  let CLIP = null;
  try { CLIP = JSON.parse(localStorage.getItem("ir_clip") || "null"); } catch (e) {}
  const saveClip = () => { try { localStorage.setItem("ir_clip", JSON.stringify(CLIP)); } catch (e) {} };

  /* ---------- Tombol di bar bawah ---------- */
  const ref = $("syncb");
  const mk = (txt, title, fn) => {
    const b = document.createElement("button");
    if (ref) b.className = ref.className;
    b.type = "button"; b.textContent = txt; b.title = title; b.onclick = fn;
    return b;
  };
  const bc = mk("Copy settings", "Copy all settings of this photo (Ctrl+Shift+C)", () => copy());
  const bp = mk("Paste settings…", "Paste copied settings to this or the checked photos (Ctrl+Shift+V)", () => openDlg());
  if (ref) ref.after(bc, bp); else document.body.append(bc, bp);

  function copy() {
    if (!cur) return;
    const L = irLayers(cur);
    CLIP = {
      name: cur.name,
      g: { s: { ...L[0].s }, pc: clonePc(L[0].pc) },
      areas: L.slice(1).filter(l => cur.areas && irLayerActive(l)).map(l => ({ id: l.id, s: { ...l.s }, pc: clonePc(l.pc) })),
      glare: { auto: !!cur.glare.auto, thr: cur.glare.thr },
      crop: cur.crop ? { ...cur.crop } : null,
      hasMask: !!cur.mask
    };
    saveClip();
    const parts = ["adjustments"];
    if (CLIP.areas.length) parts.push(CLIP.areas.length + " area layer" + (CLIP.areas.length > 1 ? "s" : ""));
    if (CLIP.hasMask) parts.push("background");
    if (CLIP.crop) parts.push("crop");
    msg(`Settings copied from ${cur.name}: ${parts.join(", ")}.`);
    refreshBtns();
  }

  /* ---------- Dialog Paste ---------- */
  const st = document.createElement("style");
  st.textContent = `#pasdlg{position:fixed;inset:0;z-index:120;background:rgba(0,0,0,.55);display:none;place-items:center}
#pasdlg.on{display:grid}
#pasdlg .card{width:420px;max-width:94vw;box-sizing:border-box;padding:18px;background:#1d1f21;color:#ddd;border:1px solid #4a4d50;border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,.6);font:13px system-ui,sans-serif}
#pasdlg h3{margin:0 0 4px;font-size:15px;color:#fff}
#pasdlg .src{font-size:12px;color:#9aa0a6;margin-bottom:10px}
#pasdlg label.o{display:flex;gap:8px;align-items:flex-start;margin:8px 0;cursor:pointer}
#pasdlg label.o small{display:block;color:#8a8f94;font-size:11px;line-height:1.35;margin-top:2px}
#pasdlg label.o.off{opacity:.4;cursor:default}
#pasdlg .sep{height:1px;background:#333;margin:10px 0}
#pasdlg .btns{display:flex;gap:8px;margin-top:14px}
#pasdlg .btns button{flex:1;padding:9px;border-radius:8px;border:1px solid #555;background:transparent;color:#ddd;font:inherit;cursor:pointer}
#pasdlg .btns button.go{border:0;background:#ff7a1a;color:#111;font-weight:700}`;
  document.head.appendChild(st);
  const dlg = document.createElement("div");
  dlg.id = "pasdlg";
  dlg.innerHTML = `<div class="card" role="dialog" aria-modal="true"><h3>Paste settings</h3><div class="src" id="pa_src"></div>
<label class="o"><input type="checkbox" id="pa_adj" checked><span>Adjustments<small>Light, Color, HSL, Selective Color, Curves, Effects, Retouch, Blemish Removal, Glasses Glare</small></span></label>
<label class="o" id="pa_arl"><input type="checkbox" id="pa_are" checked><span>Area adjustments<small id="pa_ars">Face, Skin, Hair, ... Areas are detected automatically on each photo first.</small></span></label>
<label class="o" id="pa_bgl"><input type="checkbox" id="pa_bg" checked><span>Background<small>Select Subject runs automatically on each photo. Background type, color, and image are already shared.</small></span></label>
<label class="o" id="pa_crl"><input type="checkbox" id="pa_cr"><span>Crop<small>Same crop box position, relative to each photo.</small></span></label>
<div class="sep"></div>
<label class="o"><input type="radio" name="pa_to" value="cur" checked><span>Current photo</span></label>
<label class="o"><input type="radio" name="pa_to" value="chk"><span id="pa_chk">Checked photos</span></label>
<div class="btns"><button type="button" id="pa_no">Cancel</button><button type="button" class="go" id="pa_go">Paste</button></div></div>`;
  document.body.appendChild(dlg);
  const $d = id => dlg.querySelector("#" + id);

  function openDlg() {
    if (!CLIP) { msg("Belum ada yang disalin. Klik Copy settings dulu."); return; }
    if (!cur || busy) return;
    const n = photos.filter(p => p.on).length;
    $d("pa_src").textContent = "Copied from " + CLIP.name;
    $d("pa_adj").checked = true; $d("pa_are").checked = CLIP.areas.length > 0; $d("pa_bg").checked = !!CLIP.hasMask; $d("pa_cr").checked = false;
    const set = (id, lab, ok, note) => { $d(id).disabled = !ok; if (!ok) $d(id).checked = false; $d(lab).classList.toggle("off", !ok); if (note) $d(note[0]).textContent = note[1]; };
    set("pa_are", "pa_arl", CLIP.areas.length > 0);
    set("pa_bg", "pa_bgl", CLIP.hasMask);
    set("pa_cr", "pa_crl", !!CLIP.crop);
    if (CLIP.areas.length) $d("pa_ars").textContent = CLIP.areas.map(a => a.id).join(", ") + ". Areas are detected automatically on each photo first.";
    $d("pa_chk").textContent = `Checked photos (${n})`;
    dlg.querySelector('input[value="chk"]').disabled = n === 0;
    dlg.classList.add("on");
  }
  const close = () => dlg.classList.remove("on");
  $d("pa_no").onclick = close;
  dlg.addEventListener("pointerdown", e => { if (e.target === dlg) close(); });
  dlg.addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Escape") close(); else if (e.key === "Enter") { e.preventDefault(); $d("pa_go").click(); } });

  /* ---------- Menempel ---------- */
  async function pasteTo(p, i, o) {
    const same = p === cur;
    // 1) crop lebih dulu, karena mengubah ukuran foto (mask dan area lama tidak berlaku)
    if (o.cr && CLIP.crop) {
      const before = JSON.stringify(p.crop || null);
      p.crop = { ...CLIP.crop };
      if (before !== JSON.stringify(p.crop) && window.irCrop) window.irCrop.invalidate(p);
    }
    // 2) adjustments seluruh foto
    const L = irLayers(p);
    if (o.adj) {
      L[0].s = { ...zero(), ...CLIP.g.s }; L[0].pc = clonePc(CLIP.g.pc);
      p.glare.auto = CLIP.glare.auto; p.glare.thr = CLIP.glare.thr;
    }
    const needShow = (o.cr && CLIP.crop) || o.adj;
    await select(i);                                   // tampilkan foto ini (dibutuhkan untuk deteksi)
    if (needShow) await show(p, PREV);
    // 3) latar: pisahkan subjek otomatis kalau belum ada
    if (o.bg && !p.mask && window.irSegment) { busy = true; const ok = await window.irSegment(p); busy = false; if (!ok) return "subject"; }
    // 4) area: deteksi otomatis kalau belum ada, lalu tempel pengaturannya
    if (o.are && CLIP.areas.length) {
      if (!p.areas && window.irDetectAreas) { busy = true; const ok = await window.irDetectAreas(p); busy = false; if (!ok) return "areas"; }
      if (p.areas) CLIP.areas.forEach(a => { const l = irLayerOf(p, a.id); l.s = { ...zero(), ...a.s }; l.pc = clonePc(a.pc); });
    }
    syncUI(); draw(p);
    return null;
  }
  async function doPaste() {
    const o = { adj: $d("pa_adj").checked, are: $d("pa_are").checked, bg: $d("pa_bg").checked, cr: $d("pa_cr").checked };
    if (!o.adj && !o.are && !o.bg && !o.cr) { msg("Pilih minimal satu hal untuk ditempel."); return; }
    const to = dlg.querySelector('input[name="pa_to"]:checked').value;
    const idxs = to === "cur" ? [idx] : photos.map((p, i) => i).filter(i => photos[i].on);
    if (!idxs.length || busy) return;
    close();
    const keep = idx; let fail = null, done = 0;
    for (let n = 0; n < idxs.length; n++) {
      msg(`Pasting settings ${n + 1}/${idxs.length}...`);
      const r = await pasteTo(photos[idxs[n]], idxs[n], o);
      if (r) { fail = r; break; }
      done++;
    }
    if (idxs.length > 1 || idxs[0] !== keep) await select(keep);
    refreshBtns();
    msg(fail ? `Pasted to ${done} photo(s), then stopped: ${fail === "subject" ? "Select Subject" : "Detect Areas"} failed (check internet).`
      : `Settings pasted to ${done} photo${done > 1 ? "s" : ""}.`);
  }
  $d("pa_go").onclick = doPaste;

  addEventListener("keydown", e => {
    if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && !/^(range|checkbox|radio|color|button)$/.test(t.type)))) return;
    const k = e.key.toLowerCase();
    if (k === "c") { e.preventDefault(); copy(); }
    else if (k === "v") { e.preventDefault(); openDlg(); }
  });

  function refreshBtns() { bc.disabled = !cur; bp.disabled = !CLIP || !cur; }
  setInterval(refreshBtns, 400); refreshBtns();
  window.irClip = { copy, openDlg, get: () => CLIP };
})();
