/* ---------- Daftar foto ---------- */
async function addFiles(list){
  const files=[...list].filter(f=>f.type.startsWith("image/")||RAW.test(f.name));
  let bad=0,raws=0;
  for(let n=0;n<files.length;n++){
    const f=files[n];msg(`Membaca ${n+1}/${files.length}: ${f.name}`);
    try{
      let blob=f;
      if(RAW.test(f.name)){blob=extractJpeg(new Uint8Array(await f.arrayBuffer()));if(!blob)throw 0;raws++;}
      const bm=await createImageBitmap(blob,{imageOrientation:"from-image"});
      const k=120/Math.max(bm.width,bm.height),c=document.createElement("canvas");
      c.width=Math.max(1,Math.round(bm.width*k));c.height=Math.max(1,Math.round(bm.height*k));
      c.getContext("2d").drawImage(bm,0,0,c.width,c.height);const w0=bm.width,h0=bm.height;bm.close();
      photos.push({name:f.name,blob,thumb:c.toDataURL("image/jpeg",.7),s:zero(),rot:0,mask:null,on:true,w0,h0,raw:RAW.test(f.name),glare:{auto:false,thr:.88,strokes:[]}});
    }catch(e){bad++;}
  }
  strip();if(photos.length&&!cur)await select(0);
  msg(`${files.length-bad} foto dimuat.`+(raws?" File RAW dibaca lewat preview JPEG di dalamnya.":"")+(bad?` ${bad} file gagal dibaca (format tidak didukung atau tidak ada preview JPEG).`:""));
}
function strip(){
  const s=$("strip");s.innerHTML="";$("cnt").textContent=photos.length+" foto";
  photos.forEach((p,i)=>{
    const d=document.createElement("div");d.className="th"+(i===idx?" sel":"");d.title=p.name;d.tabIndex=0;
    const im=document.createElement("img");im.src=p.thumb;im.alt=p.name;
    const cb=document.createElement("input");cb.type="checkbox";cb.checked=p.on;cb.title="Ikut batch dan ekspor";
    cb.onclick=e=>e.stopPropagation();cb.onchange=()=>p.on=cb.checked;
    d.append(im,cb);d.onclick=()=>select(i);d.onkeydown=e=>{if(e.key==="Enter")select(i);};
    s.appendChild(d);
  });
}
function syncUI(){IDS.forEach(k=>{$("s_"+k).value=cur.s[k];$("o_"+k).textContent=disp(k,cur.s[k]);});$("gthr").value=cur.glare.thr;$("o_gt").textContent=cur.glare.thr.toFixed(2);document.querySelectorAll(".row input[type=range]").forEach(paint);}
async function select(i){
  if(!photos[i]||busy)return;
  cur=photos[i];idx=i;const my=++tok;syncUI();
  [...$("strip").children].forEach((e,j)=>e.classList.toggle("sel",j===i));
  $("strip").children[i].scrollIntoView({inline:"nearest",block:"nearest"});
  $("bgopts").hidden=!cur.mask;$("empty").style.display="none";
  ["rot","cmp","reset","save","expall","syncb","chk","rmbg","rmall","gfix","gbrush","gclear"].forEach(id=>$(id).disabled=false);
  fitView();
  try{await show(cur,PREV,my);if(brush){placeOv();drawOv();}applyZoom();msg(`${cur.name} · ${cur.rot%2?cur.h0:cur.w0}×${cur.rot%2?cur.w0:cur.h0}px${cur.raw?" (preview JPEG di dalam RAW)":""} · ${i+1}/${photos.length}`);}catch(e){msg("Foto ini tidak bisa ditampilkan.");}
}
