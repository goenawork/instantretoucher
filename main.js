/* ---------- Tombol & input ---------- */
$("file").addEventListener("change",e=>{addFiles(e.target.files);e.target.value="";});
const stage=$("stage");
stage.addEventListener("dragover",e=>{e.preventDefault();stage.classList.add("drag");});
stage.addEventListener("dragleave",()=>stage.classList.remove("drag"));
stage.addEventListener("drop",e=>{e.preventDefault();stage.classList.remove("drag");addFiles(e.dataTransfer.files);});
const hold=v=>()=>{bypass=v;draw();};
$("cmp").addEventListener("pointerdown",hold(true));
["pointerup","pointerleave","pointercancel"].forEach(ev=>$("cmp").addEventListener(ev,hold(false)));
$("reset").onclick=()=>{cur.s=zero();syncUI();draw();};
$("rot").onclick=()=>{cur.rot=(cur.rot+1)%4;cur.mask=null;cur.faces=null;cur.fmask=null;cur._fp=null;cur.glare.strokes=[];select(idx);};
$("syncb").onclick=()=>{let n=0;photos.forEach(p=>{if(p.on&&p!==cur){p.s={...cur.s};p.glare.auto=cur.glare.auto;p.glare.thr=cur.glare.thr;n++;}});msg(`Pengaturan foto ini diterapkan ke ${n} foto lain.`);};
$("chk").onclick=()=>{const all=photos.every(p=>p.on);photos.forEach(p=>p.on=!all);strip();};
addEventListener("keydown",e=>{
  if(e.target.matches("input[type=range],select"))return;
  if(e.key==="ArrowRight")select(idx+1);else if(e.key==="ArrowLeft")select(idx-1);
});
