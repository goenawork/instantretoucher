/* ---------- Ekspor: ukuran asli, tanpa ZIP ---------- */
const base=n=>n.replace(/\.[^.]+$/,"");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function download(b,name){const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);}
async function render(p){
  bypass=false;await show(p,1e5);
  const png=p.mask&&$("bgmode").value==="transparent";
  const f=png||$("fmt").value==="png"?["image/png","png"]:["image/jpeg","jpg"];
  const blob=await new Promise(r=>(p.mask?out:cv).toBlob(r,f[0],1));
  return {blob,ext:f[1],w:cv.width,h:cv.height,small:cv.width<p.sw};
}
$("save").onclick=async()=>{
  if(!cur||busy)return;busy=true;let last="";
  try{
    msg("Menyiapkan file ukuran asli...");
    const r=await render(cur);download(r.blob,base(cur.name)+"-edit."+r.ext);
    last=`Tersimpan: ${r.w}×${r.h}px, ${(r.blob.size/1048576).toFixed(1)} MB.`+(r.small?" Hasil diperkecil karena batas ukuran GPU perangkat ini.":"");
  }catch(e){last="Gagal mengekspor: "+e.message;}
  busy=false;await select(idx);msg(last);
};
$("expall").onclick=async()=>{
  const L=photos.filter(p=>p.on);
  if(busy||!L.length){msg("Centang minimal satu foto untuk diekspor.");return;}
  let dir=null;
  if(L.length>1&&window.showDirectoryPicker){
    try{dir=await showDirectoryPicker({mode:"readwrite"});}catch(e){if(e.name==="AbortError")return;}
  }
  busy=true;const used=new Set();let done=0,small=0,last="";
  try{
    for(let n=0;n<L.length;n++){
      msg(`Mengekspor ${n+1}/${L.length}: ${L[n].name}`);
      const r=await render(L[n]);
      let nm=base(L[n].name)+"-edit";if(used.has(nm+"."+r.ext))nm+="-"+(n+1);
      const fn=nm+"."+r.ext;used.add(fn);
      if(dir){const w=await (await dir.getFileHandle(fn,{create:true})).createWritable();await w.write(r.blob);await w.close();}
      else{download(r.blob,fn);await sleep(500);}
      done++;if(r.small)small++;
    }
    last=`${done} foto diekspor ${dir?"ke folder yang kamu pilih":"ke folder Download (kalau browser bertanya, izinkan unduhan beberapa file)"}, ukuran asli, tanpa ZIP.`+(small?` ${small} foto diperkecil karena batas GPU.`:"");
  }catch(e){last="Ekspor berhenti: "+e.message;}
  busy=false;await select(idx);msg(last);
};
