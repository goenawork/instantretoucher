/* ---------- Background: pisahkan subjek, tepi presisi, kuas pulihkan/hapus ----------
   Alur matte (mask) per foto:
   1. p.mask   = matte kasar dari model AI (MODNet), di ukuran kerja.
   2. Penajam tepi: guided filter memakai foto asli sebagai pemandu, supaya tepi menempel ke garis objek (rambut, bahu).
   3. Geser tepi + Kontras tepi: levels pada matte (mengecilkan atau melebarkan, mempertegas).
   4. p.mst    = goresan kuas manual (Pulihkan / Hapus), disimpan sebagai koordinat 0..1 sehingga tetap tajam di ekspor.
   5. Haluskan tepi (feather) terakhir.
   Hasil akhir dibuat di ukuran tampilan atau ekspor lalu disimpan di p._fa agar menggeser slider warna tetap ringan. */
let bgImg=null;
const BG={sharp:.7,shift:0,cont:.25,tool:null,cur:null};
const tcv=document.createElement("canvas");   // kanvas sementara, dipakai ulang

/* ---------- Guided filter (pemandu abu-abu) ---------- */
function boxMean(a,w,h,r,out,tmp){
for(let y=0;y<h;y++){const o=y*w;let s=0;
for(let x=0;x<=r&&x<w;x++)s+=a[o+x];
for(let x=0;x<w;x++){const lo=x-r,hi=x+r;
tmp[o+x]=s/(Math.min(w-1,hi)-Math.max(0,lo)+1);
if(hi+1<w)s+=a[o+hi+1];if(lo>=0)s-=a[o+lo];}}
for(let x=0;x<w;x++){let s=0;
for(let y=0;y<=r&&y<h;y++)s+=tmp[y*w+x];
for(let y=0;y<h;y++){const lo=y-r,hi=y+r;
out[y*w+x]=s/(Math.min(h-1,hi)-Math.max(0,lo)+1);
if(hi+1<h)s+=tmp[(hi+1)*w+x];if(lo>=0)s-=tmp[lo*w+x];}}
}
function guided(I,P,w,h,r,eps){
const n=w*h,t=new Float32Array(n),mI=new Float32Array(n),mP=new Float32Array(n),A=new Float32Array(n),B=new Float32Array(n);
boxMean(I,w,h,r,mI,t);boxMean(P,w,h,r,mP,t);
for(let i=0;i<n;i++){A[i]=I[i]*P[i];B[i]=I[i]*I[i];}
const mIP=new Float32Array(n),mII=new Float32Array(n);
boxMean(A,w,h,r,mIP,t);boxMean(B,w,h,r,mII,t);
for(let i=0;i<n;i++){const v=mII[i]-mI[i]*mI[i],c=mIP[i]-mI[i]*mP[i],a=c/(v+eps);A[i]=a;B[i]=mP[i]-a*mI[i];}
boxMean(A,w,h,r,mIP,t);boxMean(B,w,h,r,mII,t);
for(let i=0;i<n;i++)P[i]=Math.min(1,Math.max(0,mIP[i]*I[i]+mII[i]));
return P;
}
/* Matte kasar dan versi yang sudah ditajamkan, dalam ukuran W×H (disimpan di cache). */
function getRef(p,W,H){
const k=W+"x"+H;
if(p._ref&&p._ref.k===k)return p._ref;
const full=document.createElement("canvas");full.width=W;full.height=H;
const fg=full.getContext("2d",{willReadFrequently:true});
fg.drawImage(p.mask,0,0,W,H);
const FD=fg.getImageData(0,0,W,H).data,coarse=new Uint8Array(W*H);
for(let i=0;i<W*H;i++)coarse[i]=FD[i*4+3];
const s=Math.min(1,2800/Math.max(W,H)),w=Math.max(1,Math.round(W*s)),h=Math.max(1,Math.round(H*s)),n=w*h;
const sm=document.createElement("canvas");sm.width=w;sm.height=h;
const sg=sm.getContext("2d",{willReadFrequently:true});
sg.drawImage(wc,0,0,w,h);const G=sg.getImageData(0,0,w,h).data;
sg.clearRect(0,0,w,h);sg.drawImage(p.mask,0,0,w,h);const M=sg.getImageData(0,0,w,h).data;
const I=new Float32Array(n),P=new Float32Array(n);
for(let i=0;i<n;i++){I[i]=(.2126*G[i*4]+.7152*G[i*4+1]+.0722*G[i*4+2])/255;P[i]=M[i*4+3]/255;}
const Q=guided(I,P,w,h,Math.max(2,Math.round(Math.max(w,h)/300)),4e-4);
const img=sg.createImageData(w,h);
for(let i=0;i<n;i++)img.data[i*4+3]=Q[i]*255;
sg.putImageData(img,0,0);
fg.clearRect(0,0,W,H);fg.imageSmoothingQuality="high";fg.drawImage(sm,0,0,W,H);
const RD=fg.getImageData(0,0,W,H).data,ref=new Uint8Array(W*H);
for(let i=0;i<W*H;i++)ref[i]=RD[i*4+3];
return p._ref={k,c:coarse,r:ref};
}

/* ---------- Matte akhir ---------- */
function strokeDraw(g,s,W,H){
g.globalCompositeOperation=s.m==="r"?"source-over":"destination-out";
g.strokeStyle="#fff";g.lineCap=g.lineJoin="round";g.lineWidth=s.r*W*2;
g.beginPath();s.pts.forEach((q,i)=>{const X=q[0]*W,Y=q[1]*H;i?g.lineTo(X,Y):g.moveTo(X,Y);});
if(s.pts.length===1)g.lineTo(s.pts[0][0]*W+.01,s.pts[0][1]*H);
g.stroke();g.globalCompositeOperation="source-over";
}
const aKey=(p,W,H)=>[W,H,BG.sharp,BG.shift,BG.cont,$("feather").value,(p.mst||[]).length,(p.mst||[]).reduce((a,s)=>a+s.pts.length,0)].join();
function alphaCanvas(p,W,H){
const key=aKey(p,W,H);
if(p._fa&&p._fk===key&&p._fa.width===W&&p._fa.height===H)return p._fa;
const R=getRef(p,W,H),n=W*H;
if(!p._fa)p._fa=document.createElement("canvas");
const A=p._fa;A.width=W;A.height=H;
const g=A.getContext("2d"),img=g.createImageData(W,H),D=img.data;
const s=BG.sharp,t=.5-BG.shift*.35,hw=.5-.45*BG.cont,lo=t-hw,inv=1/(2*hw);
for(let i=0;i<n;i++){
let a=(R.c[i]*(1-s)+R.r[i]*s)/255;a=(a-lo)*inv;
D[i*4+3]=a<=0?0:a>=1?255:a*255;
}
g.putImageData(img,0,0);
(p.mst||[]).forEach(st=>strokeDraw(g,st,W,H));
const f=+$("feather").value;
if(f>0){
if(tcv.width!==W)tcv.width=W;if(tcv.height!==H)tcv.height=H;
const c=tcv.getContext("2d");c.globalCompositeOperation="source-over";c.clearRect(0,0,W,H);c.drawImage(A,0,0);
g.clearRect(0,0,W,H);g.filter=`blur(${f}px)`;g.drawImage(tcv,0,0);g.filter="none";
}
p._fk=key;
return A;
}

/* ---------- Komposit ---------- */
function composite(p){
if(!p.mask){out.style.display="none";cv.style.display="block";p._fa=p._fk=p._ref=null;p.mst=[];return;}
const W=cv.width,H=cv.height,mode=$("bgmode").value;
if(out.width!==W)out.width=W;if(out.height!==H)out.height=H;
const o=out.getContext("2d");
o.clearRect(0,0,W,H);
out.style.background=mode==="transparent"?"repeating-conic-gradient(#2a2a2a 0 25%,#1c1c1c 0 50%) 0 0/20px 20px":"none";
if(mode==="original")o.drawImage(cv,0,0);
else{
if(mode==="color"){o.fillStyle=$("bgcolor").value;o.fillRect(0,0,W,H);}
else if(mode==="image"&&bgImg){const k=Math.max(W/bgImg.width,H/bgImg.height),w=bgImg.width*k,h=bgImg.height*k;o.drawImage(bgImg,(W-w)/2,(H-h)/2,w,h);}
const A=alphaCanvas(p,W,H);
if(tcv.width!==W)tcv.width=W;if(tcv.height!==H)tcv.height=H;
const c=tcv.getContext("2d");c.globalCompositeOperation="source-over";c.clearRect(0,0,W,H);c.drawImage(cv,0,0);
c.globalCompositeOperation="destination-in";c.drawImage(A,0,0);c.globalCompositeOperation="source-over";
o.drawImage(tcv,0,0);
}
cv.style.display="none";out.style.display="block";
if(p!==cur){p._fa=p._fk=p._ref=null;}   // hemat memori: cache hanya untuk foto yang sedang dibuka
}

/* ---------- Panel Latar: kontrol tambahan ---------- */
let pend=false;
const sched=()=>{if(pend)return;pend=true;requestAnimationFrame(()=>{pend=false;draw();});};
$("bgopts").insertAdjacentHTML("beforeend",`
<div class="row"><span>Pertajam tepi (ikuti garis objek)</span><output id="o_bsharp">70</output><input id="bsharp" type="range" min="0" max="1" step="0.01" value="0.7" aria-label="Pertajam tepi"></div>
<div class="row"><span>Geser tepi (kecil &larr; &rarr; lebar)</span><output id="o_bshift">0</output><input id="bshift" type="range" min="-1" max="1" step="0.01" value="0" aria-label="Geser tepi"></div>
<div class="row"><span>Kontras tepi</span><output id="o_bcont">25</output><input id="bcont" type="range" min="0" max="1" step="0.01" value="0.25" aria-label="Kontras tepi"></div>
<button id="bpr" class="w">Kuas pulihkan: mati</button>
<button id="bpe" class="w">Kuas hapus: mati</button>
<div class="row"><span>Ukuran kuas</span><output id="o_bsize">4</output><input id="bsize" type="range" min="0.5" max="20" step="0.5" value="4" aria-label="Ukuran kuas"></div>
<button id="bundo" class="w">Batalkan goresan terakhir</button>
<button id="bclr" class="w">Hapus semua goresan</button>
<div style="font-size:11px;line-height:1.35;color:var(--mute);margin:2px 0 8px">Pulihkan = kembalikan bagian subjek yang ikut terhapus. Hapus = buang sisa latar. Perbesar foto dengan scroll untuk goresan yang presisi. Tombol <b>[</b> mengecilkan kuas, <b>]</b> membesarkan.</div>`);
["bsharp","bshift","bcont"].forEach(id=>{
const el=$(id),key={bsharp:"sharp",bshift:"shift",bcont:"cont"}[id];paint(el);
el.addEventListener("input",()=>{BG[key]=+el.value;$("o_"+id).textContent=Math.round(+el.value*100);paint(el);sched();});
});
["bgmode","bgcolor","feather"].forEach(id=>$(id).addEventListener("input",()=>{$("o_f").textContent=$("feather").value;sched();}));
$("bgimg").addEventListener("change",e=>{const f=e.target.files[0];if(!f)return;const im=new Image();im.onload=()=>{bgImg=im;$("bgmode").value="image";draw();};im.src=URL.createObjectURL(f);});
$("bsize").addEventListener("input",()=>{$("o_bsize").textContent=$("bsize").value;});

/* ---------- Segmentasi AI ---------- */
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
ctx.putImageData(id,0,0);p.mask=mc;p.mst=[];p._ref=p._fa=p._fk=null;$("bgopts").hidden=false;draw(p);return true;
}catch(e){msg("Gagal memisahkan subjek: "+e.message+". Cek koneksi internet lalu coba lagi.");return false;}
}
$("rmbg").onclick=async()=>{if(!cur||busy)return;busy=true;msg("Memisahkan subjek...");if(await segment(cur))msg("Subjek terpisah. Pilih jenis latar di panel Latar, lalu rapikan tepi atau pakai kuas.");busy=false;};
$("rmall").onclick=async()=>{
if(busy)return;const keep=idx,L=photos.map((p,i)=>i).filter(i=>photos[i].on);
for(let n=0;n<L.length;n++){await select(L[n]);busy=true;msg(`Memisahkan subjek ${n+1}/${L.length}...`);const ok=await segment(photos[L[n]]);busy=false;if(!ok)return;}
await select(keep);msg(`Subjek terpisah di ${L.length} foto.`);
};

/* ---------- Kuas pulihkan / hapus ---------- */
const bov=document.createElement("canvas");
bov.id="bov";bov.style.cssText="position:absolute;display:none;touch-action:none;cursor:none;z-index:4";
$("zw").appendChild(bov);
function placeBov(){
const v=out.style.display==="block"?out:cv;
if(!v.clientWidth)return;
Object.assign(bov.style,{left:v.offsetLeft+"px",top:v.offsetTop+"px",width:v.clientWidth+"px",height:v.clientHeight+"px"});
if(bov.width!==v.clientWidth)bov.width=v.clientWidth;if(bov.height!==v.clientHeight)bov.height=v.clientHeight;
}
function ring(e){
const c=bov.getContext("2d");c.clearRect(0,0,bov.width,bov.height);
if(!e)return;
const r=bov.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*bov.width,y=(e.clientY-r.top)/r.height*bov.height;
c.beginPath();c.arc(x,y,+$("bsize").value/200*bov.width,0,7);
c.lineWidth=1.5;c.strokeStyle=BG.tool==="r"?"rgba(60,220,120,.95)":"rgba(255,80,70,.95)";c.stroke();
c.lineWidth=.8;c.strokeStyle="rgba(0,0,0,.6)";c.stroke();
}
function setTool(t){
BG.tool=BG.tool===t?null:t;
if(BG.tool&&typeof brush!=="undefined"&&brush)$("gbrush").onclick();
$("bpr").textContent="Kuas pulihkan: "+(BG.tool==="r"?"nyala":"mati");
$("bpe").textContent="Kuas hapus: "+(BG.tool==="e"?"nyala":"mati");
bov.style.display=BG.tool&&cur&&cur.mask?"block":"none";
if(BG.tool){placeBov();ring(null);}
}
$("bpr").onclick=()=>setTool("r");
$("bpe").onclick=()=>setTool("e");
const bpt=e=>{const r=bov.getBoundingClientRect();return [(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height];};
let raf=0;const liveComp=()=>{if(raf)return;raf=requestAnimationFrame(()=>{raf=0;if(cur&&cur.mask)composite(cur);});};
function live(st,from){
const W=cv.width,H=cv.height,A=alphaCanvas(cur,W,H),g=A.getContext("2d"),f=+$("feather").value;
if(f>0)g.filter=`blur(${Math.min(f,2)}px)`;
strokeDraw(g,{m:st.m,r:st.r,pts:st.pts.slice(Math.max(0,from))},W,H);
g.filter="none";liveComp();
}
bov.addEventListener("pointerdown",e=>{
if(e.button===1)return;
e.stopPropagation();
if(e.button!==0||!BG.tool||!cur||!cur.mask)return;
e.preventDefault();bov.setPointerCapture(e.pointerId);
BG.cur={m:BG.tool,r:+$("bsize").value/200,pts:[bpt(e)]};live(BG.cur,0);
});
let lastE=null;
bov.addEventListener("pointermove",e=>{
lastE=e;ring(e);
if(!BG.cur)return;
BG.cur.pts.push(bpt(e));live(BG.cur,BG.cur.pts.length-2);
});
bov.addEventListener("dblclick",e=>e.stopPropagation());
bov.addEventListener("pointerleave",()=>{if(!BG.cur)ring(null);});
["pointerup","pointercancel"].forEach(ev=>bov.addEventListener(ev,()=>{
if(!BG.cur||!cur)return;
(cur.mst||(cur.mst=[])).push(BG.cur);BG.cur=null;
cur._fk=aKey(cur,cv.width,cv.height);   // goresan sudah tergambar langsung, tidak perlu bangun ulang
if(window.irHistoryCommit)window.irHistoryCommit();
msg("Goresan ditambahkan. Ctrl+Z untuk membatalkan.");
}));
$("bundo").onclick=()=>{if(cur&&cur.mst&&cur.mst.length){cur.mst.pop();cur._fk=null;draw();if(window.irHistoryCommit)window.irHistoryCommit();msg("Goresan terakhir dibatalkan.");}};
$("bclr").onclick=()=>{if(cur&&cur.mst&&cur.mst.length){cur.mst=[];cur._fk=null;draw();if(window.irHistoryCommit)window.irHistoryCommit();msg("Semua goresan dihapus.");}};
/* Tombol [ mengecilkan dan ] membesarkan kuas, seperti di Photoshop. */
function nudgeSize(dir){
const el=BG.tool?$("bsize"):(typeof brush!=="undefined"&&brush?$("gsize"):null);
if(!el)return false;
const v=+el.value,st=v<2?.5:v<10?1:2,nv=Math.min(+el.max,Math.max(+el.min,v+dir*st));
if(nv===v)return true;
el.value=nv;el.dispatchEvent(new Event("input",{bubbles:true}));
if(BG.tool)ring(lastE);
return true;
}
addEventListener("keydown",e=>{
if(e.ctrlKey||e.metaKey||e.altKey)return;
const t=e.target;
if(t&&(t.tagName==="TEXTAREA"||t.tagName==="SELECT"||(t.tagName==="INPUT"&&!/^(range|checkbox|color|button)$/.test(t.type))))return;
const dir=e.code==="BracketLeft"?-1:e.code==="BracketRight"?1:0;
if(dir&&nudgeSize(dir))e.preventDefault();
});
addEventListener("resize",()=>{if(BG.tool)placeBov();});
setInterval(()=>{
photos.forEach(p=>{if(p!==cur&&p._fa){p._fa=p._fk=p._ref=null;}});
if(BG.tool){
if(typeof brush!=="undefined"&&brush){setTool(BG.tool);}
bov.style.display=cur&&cur.mask?"block":"none";
if(cur&&cur.mask&&!BG.cur)placeBov();
}
},250);
