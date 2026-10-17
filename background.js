/* ---------- Background compositing ---------- */
let bgImg=null;
function composite(p){
  if(!p.mask){out.style.display="none";cv.style.display="block";return;}
  const W=out.width=cv.width,H=out.height=cv.height,o=out.getContext("2d"),mode=$("bgmode").value;
  o.clearRect(0,0,W,H);
  out.style.background=mode==="transparent"?"repeating-conic-gradient(#2a2a2a 0 25%,#1c1c1c 0 50%) 0 0/20px 20px":"none";
  if(mode==="original")o.drawImage(cv,0,0);
  else{
    if(mode==="color"){o.fillStyle=$("bgcolor").value;o.fillRect(0,0,W,H);}
    else if(mode==="image"&&bgImg){const k=Math.max(W/bgImg.width,H/bgImg.height),w=bgImg.width*k,h=bgImg.height*k;o.drawImage(bgImg,(W-w)/2,(H-h)/2,w,h);}
    const t=document.createElement("canvas");t.width=W;t.height=H;
    const c=t.getContext("2d");c.drawImage(cv,0,0);
    c.globalCompositeOperation="destination-in";c.filter=`blur(${$("feather").value}px)`;c.drawImage(p.mask,0,0,W,H);
    o.drawImage(t,0,0);
  }
  cv.style.display="none";out.style.display="block";
}
["bgmode","bgcolor","feather"].forEach(id=>$(id).addEventListener("input",()=>{$("o_f").textContent=$("feather").value;draw();}));
$("bgimg").addEventListener("change",e=>{const f=e.target.files[0];if(!f)return;const im=new Image();im.onload=()=>{bgImg=im;$("bgmode").value="image";draw();};im.src=URL.createObjectURL(f);});

async function segment(p){
  try{
    if(!seg){
      msg("Memuat model AI. Pertama kali butuh unduhan puluhan MB, setelah itu tersimpan di browser.");
      const T=await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2");
      T.env.allowLocalModels=false;
      seg={T,model:await T.AutoModel.from_pretrained("Xenova/modnet",{dtype:"fp32"}),proc:await T.AutoProcessor.from_pretrained("Xenova/modnet")};
    }
    const img=seg.T.RawImage.fromCanvas(wc);
    const {pixel_values}=await seg.proc(img);
    const {output}=await seg.model({input:pixel_values});
    const m=await seg.T.RawImage.fromTensor(output[0].mul(255).to("uint8")).resize(wc.width,wc.height);
    const mc=document.createElement("canvas");mc.width=wc.width;mc.height=wc.height;
    const ctx=mc.getContext("2d"),id=ctx.createImageData(mc.width,mc.height);
    for(let i=0;i<mc.width*mc.height;i++)id.data[i*4+3]=m.data[i*m.channels];
    ctx.putImageData(id,0,0);p.mask=mc;$("bgopts").hidden=false;draw(p);return true;
  }catch(e){msg("Gagal memisahkan subjek: "+e.message+". Cek koneksi internet lalu coba lagi.");return false;}
}
$("rmbg").onclick=async()=>{if(!cur||busy)return;busy=true;msg("Memisahkan subjek...");if(await segment(cur))msg("Subjek terpisah. Pilih jenis latar di panel Background.");busy=false;};
$("rmall").onclick=async()=>{
  if(busy)return;const keep=idx,L=photos.map((p,i)=>i).filter(i=>photos[i].on);
  for(let n=0;n<L.length;n++){await select(L[n]);busy=true;msg(`Memisahkan subjek ${n+1}/${L.length}...`);const ok=await segment(photos[L[n]]);busy=false;if(!ok)return;}
  await select(keep);msg(`Subjek terpisah di ${L.length} foto.`);
};
