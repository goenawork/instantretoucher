/* ---------- Export: ukuran asli, nama file, format, kualitas 1-10, perkiraan ukuran ----------
   Tombol EXPORT dan BATCH EXPORT membuka dialog:
   - File name: boleh pakai token {name} (nama asli), {n} (nomor urut), {date}, {w}, {h}.
   - Format: JPG atau PNG (lossless). Latar transparan otomatis disimpan sebagai PNG.
   - Quality 1-10 (JPG): 1 = file kecil, 10 = kualitas tertinggi.
   - Estimated size: perkiraan KB/MB langsung berubah saat kualitas digeser; "Calculate exact size" menghitung ukuran sebenarnya.
   Pengaturan terakhir diingat di browser. */
const base=n=>n.replace(/\.[^.]+$/,"");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function download(b,name){const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);}

(function(){
const QMAP=[.30,.42,.54,.64,.72,.80,.86,.91,.95,1];            // skala 1-10 -> kualitas JPEG
const EXPD={tpl:"{name}-edit",fmt:"jpg",q:8};
let EXP={...EXPD};try{EXP={...EXPD,...JSON.parse(localStorage.getItem("ir_exp")||"{}")};}catch(e){}
const saveExp=()=>{try{localStorage.setItem("ir_exp",JSON.stringify(EXP));}catch(e){}};
const isPng=p=>EXP.fmt==="png"||!!(p&&p.mask&&$("bgmode").value==="transparent");
const fmtSize=b=>b<1048576?Math.max(1,Math.round(b/1024))+" KB":(b/1048576).toFixed(2)+" MB";
const effPx=p=>p.sw&&p.sh?p.sw*p.sh:(p.rot%2?p.h0*p.w0:p.w0*p.h0)*(p.crop?p.crop.w*p.crop.h:1);
const effWH=p=>p.sw&&p.sh?[p.sw,p.sh]:(p.rot%2?[p.h0,p.w0]:[p.w0,p.h0]);

function clean(s){return s.replace(/[\\/:*?"<>|\u0000-\u001f]/g,"_").replace(/\s+/g," ").replace(/^[\s.]+|[\s.]+$/g,"")||"photo";}
function nameFor(p,n,N,w,h){
const d=new Date(),z=(x,l)=>String(x).padStart(l,"0");
const date=d.getFullYear()+z(d.getMonth()+1,2)+z(d.getDate(),2);
return clean((EXP.tpl||"{name}-edit").replace(/\{name\}/gi,base(p.name)).replace(/\{n\}/gi,z(n,Math.max(3,String(N).length))).replace(/\{date\}/gi,date).replace(/\{w\}/gi,w).replace(/\{h\}/gi,h));
}

async function render(p,opt={}){
bypass=false;await show(p,1e5);
const png=isPng(p),type=png?"image/png":"image/jpeg";
const blob=await new Promise(r=>(p.mask?out:cv).toBlob(r,type,png?undefined:QMAP[EXP.q-1]));
if(opt.log!==false){try{window.logEdit&&window.logEdit(p);}catch(e){}}
return {blob,ext:png?"png":"jpg",w:cv.width,h:cv.height,small:cv.width<p.sw};
}

/* ---------- Dialog ---------- */
const exSt=document.createElement("style");
exSt.textContent=`#exdlg{position:fixed;inset:0;z-index:120;background:rgba(0,0,0,.55);display:none;place-items:center}
#exdlg.on{display:grid}
#exdlg .card{width:430px;max-width:94vw;box-sizing:border-box;padding:18px;background:#1d1f21;color:#ddd;border:1px solid #4a4d50;border-radius:12px;box-shadow:0 14px 40px rgba(0,0,0,.6);font:13px system-ui,sans-serif}
#exdlg h3{margin:0 0 12px;font-size:15px;color:#fff}
#exdlg label.f{display:block;margin:10px 0 4px;font-size:12px;color:#9aa0a6}
#exdlg input[type=text],#exdlg select{width:100%;box-sizing:border-box;padding:7px 9px;border-radius:6px;border:1px solid #555;background:#111;color:#eee;font:inherit}
#exdlg .hint{font-size:11px;line-height:1.4;color:#8a8f94;margin-top:4px}
#exdlg .hint b{color:#ff9a55;font-weight:600}
#exdlg .size{margin:12px 0 8px;padding:10px 12px;border-radius:8px;background:#141516;border:1px solid #333}
#exdlg .size .big{font-size:18px;font-weight:700;color:#ff7a1a}
#exdlg .btns{display:flex;gap:8px;margin-top:14px}
#exdlg .btns button,#exdlg #ex_calc{padding:9px;border-radius:8px;border:1px solid #555;background:transparent;color:#ddd;font:inherit;cursor:pointer}
#exdlg .btns button{flex:1}
#exdlg #ex_calc{width:100%;padding:7px}
#exdlg .btns button.go{border:0;background:#ff7a1a;color:#111;font-weight:700}
#exdlg .ends{display:flex;justify-content:space-between;font-size:11px;color:#777;margin-top:-2px}`;
document.head.appendChild(exSt);
const exd=document.createElement("div");
exd.id="exdlg";
exd.innerHTML=`<div class="card" role="dialog" aria-modal="true"><h3 id="ex_title">Export</h3>
<label class="f" for="ex_tpl">File name</label>
<input id="ex_tpl" type="text" spellcheck="false" autocomplete="off">
<div class="hint">Tokens: <b>{name}</b> original name, <b>{n}</b> number, <b>{date}</b>, <b>{w}</b>, <b>{h}</b>. Example: <b id="ex_ex"></b></div>
<label class="f" for="ex_fmt">Format</label>
<select id="ex_fmt"><option value="jpg">JPG</option><option value="png">PNG (lossless)</option></select>
<div class="hint" id="ex_png" style="display:none">Photos with a transparent background are saved as PNG automatically.</div>
<div class="row" id="ex_qrow" style="margin-top:12px"><span>Quality</span><output id="o_exq">8</output><input id="ex_q" type="range" min="1" max="10" step="1" value="8" aria-label="Export quality"></div>
<div class="ends" id="ex_ends"><span>Small file</span><span>High quality</span></div>
<div class="size"><div style="font-size:11px;color:#9aa0a6" id="ex_sl">Estimated size</div><div class="big" id="ex_sz">...</div><div class="hint" id="ex_dim"></div></div>
<button type="button" id="ex_calc">Calculate exact size</button>
<div class="btns"><button type="button" id="ex_no">Cancel</button><button type="button" class="go" id="ex_go">Export</button></div></div>`;
document.body.appendChild(exd);
const ex=id=>exd.querySelector("#"+id);
paint(ex("ex_q"));
let exBatch=false,exTok=0,exTimer=0;

function exList(){return exBatch?photos.filter(p=>p.on):[cur];}
function exUpdateName(){
const L=exList(),p=L[0];if(!p)return;
const [w,h]=effWH(p);
ex("ex_ex").textContent=nameFor(p,1,L.length,w,h)+"."+(isPng(p)?"png":"jpg");
ex("ex_png").style.display=EXP.fmt!=="png"&&photos.some(q=>q.mask)&&$("bgmode").value==="transparent"?"":"none";
const png=isPng(p);
ex("ex_qrow").style.opacity=png?".4":"";ex("ex_q").disabled=png;ex("ex_ends").style.opacity=png?".4":"";
}
const encode=(c,type,q)=>new Promise(r=>c.toBlob(r,type,q));
/* Perkiraan ukuran: encode tampilan saat ini dan versi setengah ukuran, lalu perkirakan pertumbuhan ke ukuran ekspor. */
async function estimate(p){
const src=p.mask?out:cv;
if(!src||!src.width)return null;
const png=isPng(p),type=png?"image/png":"image/jpeg",q=png?undefined:QMAP[EXP.q-1];
const b1=await encode(src,type,q),N1=src.width*src.height;
const h=document.createElement("canvas");h.width=Math.max(1,src.width>>1);h.height=Math.max(1,src.height>>1);
h.getContext("2d").drawImage(src,0,0,h.width,h.height);
const b2=await encode(h,type,q),N2=h.width*h.height;
let a=Math.log(b1.size/b2.size)/Math.log(N1/N2);a=isFinite(a)?Math.min(1,Math.max(.55,a)):.85;
return Math.round(b1.size*Math.pow(effPx(p)/N1,a));
}
function exEstimate(){
clearTimeout(exTimer);
const my=++exTok;
ex("ex_sz").textContent="...";
exTimer=setTimeout(async()=>{
const L=exList();if(!cur||!L.length)return;
try{
const e=await estimate(cur);
if(my!==exTok||e==null)return;
const [w,h]=effWH(cur);
if(exBatch){
const tot=L.reduce((a,p)=>a+e*effPx(p)/effPx(cur),0);
ex("ex_sz").textContent="≈ "+fmtSize(tot);
ex("ex_dim").textContent=`${L.length} photos, about ${fmtSize(e)} each (rough guess from the current photo).`;
}else{
ex("ex_sz").textContent="≈ "+fmtSize(e);
ex("ex_dim").textContent=`${w} × ${h} px, ${isPng(cur)?"PNG":"JPG quality "+EXP.q}.`;
}
ex("ex_sl").textContent="Estimated size";
}catch(err){ex("ex_sz").textContent="-";}
},280);
}
function exOpen(batch){
if(!cur||busy)return;
const L=batch?photos.filter(p=>p.on):[cur];
if(!L.length){msg("Centang minimal satu foto untuk diekspor.");return;}
exBatch=batch;
ex("ex_title").textContent=batch?`Batch Export (${L.length} photos)`:"Export";
ex("ex_tpl").value=EXP.tpl;ex("ex_fmt").value=EXP.fmt;ex("ex_q").value=EXP.q;ex("o_exq").textContent=EXP.q;paint(ex("ex_q"));
ex("ex_go").textContent=batch?`Export ${L.length} photos`:"Export";
ex("ex_sl").textContent="Estimated size";
exd.classList.add("on");exUpdateName();exEstimate();
setTimeout(()=>{ex("ex_tpl").focus();ex("ex_tpl").select();},30);
}
function exClose(){exd.classList.remove("on");}
ex("ex_tpl").addEventListener("input",()=>{EXP.tpl=ex("ex_tpl").value;saveExp();exUpdateName();});
ex("ex_fmt").addEventListener("change",()=>{EXP.fmt=ex("ex_fmt").value;saveExp();exUpdateName();exEstimate();});
ex("ex_q").addEventListener("input",()=>{EXP.q=+ex("ex_q").value;ex("o_exq").textContent=EXP.q;paint(ex("ex_q"));saveExp();exEstimate();});
ex("ex_no").onclick=exClose;
exd.addEventListener("pointerdown",e=>{if(e.target===exd)exClose();});
exd.addEventListener("keydown",e=>{e.stopPropagation();if(e.key==="Escape")exClose();else if(e.key==="Enter"&&e.target.tagName!=="BUTTON"){e.preventDefault();ex("ex_go").click();}});
ex("ex_calc").onclick=async()=>{
if(busy||!cur)return;
busy=true;ex("ex_sl").textContent="Calculating exact size";ex("ex_sz").textContent="...";
let t="-",d="";
try{
const r=await render(cur,{log:false});
t=fmtSize(r.blob.size);d=`${r.w} × ${r.h} px, ${r.ext.toUpperCase()}${r.ext==="jpg"?" quality "+EXP.q:""}. This is the real size of the current photo.`;
}catch(e){d="Failed: "+e.message;}
busy=false;await select(idx);
ex("ex_sl").textContent="Exact size (current photo)";ex("ex_sz").textContent=t;ex("ex_dim").textContent=d;
};

/* ---------- Proses ekspor ---------- */
async function doSave(){
if(!cur||busy)return;busy=true;let last="";
try{
msg("Menyiapkan file ukuran asli...");
const r=await render(cur),fn=nameFor(cur,1,1,r.w,r.h)+"."+r.ext;
download(r.blob,fn);
last=`Tersimpan: ${fn} · ${r.w}×${r.h}px, ${fmtSize(r.blob.size)}.`+(r.small?" Hasil diperkecil karena batas ukuran GPU perangkat ini.":"");
}catch(e){last="Gagal mengekspor: "+e.message;}
busy=false;await select(idx);msg(last);
}
async function doBatch(){
const L=photos.filter(p=>p.on);
if(busy||!L.length){msg("Centang minimal satu foto untuk diekspor.");return;}
let dir=null;
if(L.length>1&&window.showDirectoryPicker){
try{dir=await showDirectoryPicker({mode:"readwrite"});}catch(e){if(e.name==="AbortError")return;}
}
busy=true;const used=new Set();let done=0,small=0,bytes=0,last="";
try{
for(let n=0;n<L.length;n++){
msg(`Mengekspor ${n+1}/${L.length}: ${L[n].name}`);
const r=await render(L[n]);
let nm=nameFor(L[n],n+1,L.length,r.w,r.h);if(used.has(nm.toLowerCase()+"."+r.ext))nm+="-"+(n+1);
const fn=nm+"."+r.ext;used.add(fn.toLowerCase());
if(dir){const w=await (await dir.getFileHandle(fn,{create:true})).createWritable();await w.write(r.blob);await w.close();}
else{download(r.blob,fn);await sleep(500);}
done++;bytes+=r.blob.size;if(r.small)small++;
}
last=`${done} foto diekspor ${dir?"ke folder yang kamu pilih":"ke folder Download (kalau browser bertanya, izinkan unduhan beberapa file)"}, total ${fmtSize(bytes)}.`+(small?` ${small} foto diperkecil karena batas GPU.`:"");
}catch(e){last="Ekspor berhenti: "+e.message;}
busy=false;await select(idx);msg(last);
}
ex("ex_go").onclick=()=>{exClose();(exBatch?doBatch:doSave)();};
$("save").onclick=()=>exOpen(false);
$("expall").onclick=()=>exOpen(true);
{const f=$("fmt");if(f)f.style.display="none";}   // format kini dipilih di dialog Export
window.render=render;
})();
