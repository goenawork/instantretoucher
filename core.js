const TR={temp:"linear-gradient(90deg,#3d6fd6,#8d8a86 50%,#ffb02e)",tint:"linear-gradient(90deg,#38a869,#8d8a86 50%,#c744b8)",
vibrance:"linear-gradient(90deg,#77726c,#a8825a 50%,#ff7a1a)",sat:"linear-gradient(90deg,#77726c,#a8825a 50%,#ff7a1a)"};
/* 8 warna HSL: [kunci, label, warna track] */
const HSLC=[["red","Red","#ff3b30"],["orange","Orange","#ff9f0a"],["yellow","Yellow","#ffd60a"],["green","Green","#30d158"],["aqua","Aqua","#2fd5c8"],["blue","Blue","#0a84ff"],["purple","Purple","#9b5de5"],["magenta","Magenta","#e0399e"]];
HSLC.forEach(([k,,c],i)=>{const a=HSLC[(i+7)%8][2],b=HSLC[(i+1)%8][2];
TR["hue_"+k]=`linear-gradient(90deg,${a},${c} 50%,${b})`;
TR["sat_"+k]=`linear-gradient(90deg,#77726c,${c})`;
TR["lum_"+k]=`linear-gradient(90deg,#1a1a1a,${c} 50%,#f2f2f2)`;});
const SECS=[
["Light",1,[["exposure","Exposure",-3,3],["contrast","Contrast",-1,1],["highlights","Highlights",-1,1],["shadows","Shadows",-1,1],["whites","Whites",-1,1],["blacks","Blacks",-1,1]]],
["Color",1,[["temp","Temperature",-1,1],["tint","Tint",-1,1],["vibrance","Vibrance",-1,1],["sat","Saturation",-1,1]]],
["Hue",0,HSLC.map(([k,n])=>["hue_"+k,n,-1,1]),"HSL"],
["Saturation",0,HSLC.map(([k,n])=>["sat_"+k,n,-1,1]),"HSL"],
["Luminance",0,HSLC.map(([k,n])=>["lum_"+k,n,-1,1]),"HSL"],
["Curves",0,[["cv_hi","Highlights",-1,1],["cv_li","Lights",-1,1],["cv_da","Darks",-1,1],["cv_sh","Shadows",-1,1]]],
["Effect",0,[["fine","Texture",-1,1],["clarity","Clarity",-1,1],["dehaze","Dehaze",-1,1],["vig","Vignette",-1,1],
["vmid","Midpoint",0,1,.5,1],["vround","Roundness",-1,1,0,1],["vfeather","Feather",0,1,.5,1],["vhi","Highlights",0,1,0,1],["grain","Grain",0,1],["gsize","Grain size",0,1,.25,1]]],
["Skin",0,[["skin","Soft Skin",0,1],["keep","Keep Texture",0,1,.6]],"Retouch"],
["Eye & Mouth",0,[["eyes","Brighten eyes",0,1],["teeth","Whiten teeth",0,1]],"Retouch"]
];
const IDS=SECS.flatMap(g=>g[2].map(r=>r[0]));
const DEF={};SECS.forEach(g=>g[2].forEach(r=>DEF[r[0]]=r[4]||0));const zero=()=>({...DEF});
const PREV=3840;
function paint(el){el.style.setProperty("--p",((+el.value-el.min)/(el.max-el.min)*100)+"%");}
const disp=(id,v)=>id==="exposure"?(+v).toFixed(2):Math.round(v*100);
const $=id=>document.getElementById(id), msg=t=>$("msg").textContent=t;
const RAW=/\.(cr2|cr3|crw|raf|nef|nrw|arw|srf|sr2|dng|orf|rw2|pef|srw|3fr|erf|mrw|kdc|dcr|raw)$/i;
const photos=[], wc=document.createElement("canvas"), cv=$("cv"), out=$("out"), panel=$("panel");
let cur=null, idx=-1, bypass=false, busy=false, tex=null, seg=null, tok=0, mtex=null, mown=null, lm=null;
/* ---------- Panel ---------- */
const st=document.createElement("style");
st.textContent=`.tabs{display:flex;gap:6px;margin:2px 0 10px}
.tabs .tb{flex:1;padding:6px 4px;border-radius:6px;border:1px solid #3a3d40;background:transparent;color:#bbb;cursor:pointer;font:inherit;font-size:12px}
.tabs .tb.on{background:#2a2d30;color:#fff;border-color:#ff7a1a}
.sec.in{margin:6px 0 0}
.row.hasSub>span:first-child{cursor:pointer}
.row.hasSub>span:first-child::after{content:" \\25B8";opacity:.55;font-size:11px}
.row.hasSub.open>span:first-child::after{content:" \\25BE"}`;
document.head.appendChild(st);
const resetItems=items=>{if(!cur)return;items.forEach(r=>{cur.s[r[0]]=r[4]||0;});syncUI();draw();};
const mkSec=(title,open,cls)=>{
const d=document.createElement("details");d.className="sec"+(cls?" "+cls:"");d.open=!!open;
d.innerHTML=`<summary><span>${title}</span><button class="rs" title="Reset this section" aria-label="Reset ${title}">&#10226;</button></summary><div class="body"></div>`;
return d;};
/* Baris slider. Baris "sub" disembunyikan sampai slider induknya diklik (berlaku untuk semua yang punya sub-menu). */
function addRows(body,items){
let parent=null;
items.forEach(([id,label,min,max,def=0,sub])=>{
body.insertAdjacentHTML("beforeend",`<div class="row${sub?" sub":""}"><span>${label}</span><output id="o_${id}">${disp(id,def)}</output><input id="s_${id}" type="range" min="${min}" max="${max}" step="0.01" value="${def}" ${TR[id]?`class="grad" style="--tr:${TR[id]}"`:""} aria-label="${label}"></div>`);
const row=body.lastElementChild,sl=row.querySelector("input");
if(sub){row.style.display="none";if(parent){parent.classList.add("hasSub");parent._subs.push(row);}}
else{parent=row;row._subs=[];
const show=on=>{row.classList.toggle("open",on);row._subs.forEach(r=>{r.style.display=on?"":"none";});};
row.querySelector("span").addEventListener("click",()=>{if(row._subs.length)show(!row.classList.contains("open"));});
sl.addEventListener("pointerdown",()=>{if(row._subs.length)show(true);});}
sl.addEventListener("input",()=>{if(!cur)return;cur.s[id]=+sl.value;$("o_"+id).textContent=disp(id,+sl.value);
if(["skin","teeth","eyes"].includes(id)&&+sl.value>0&&!cur.faces&&!busy)ensureFaces(cur).then(()=>draw());draw();});
sl.addEventListener("dblclick",()=>{sl.value=def;sl.dispatchEvent(new Event("input"));});
});}
const MENUS={HSL:{tabs:true},Retouch:{}},menuEls={};
SECS.forEach(([title,open,items,menu])=>{
if(!menu){
const d=mkSec(title,open);addRows(d.querySelector(".body"),items);
d.querySelector(".rs").onclick=e=>{e.preventDefault();e.stopPropagation();resetItems(items);};
panel.appendChild(d);return;}
let m=menuEls[menu];
if(!m){
const d=mkSec(menu,0);m=menuEls[menu]={d,body:d.querySelector(".body"),items:[],panes:[],btns:[]};
if(MENUS[menu].tabs){m.tabs=document.createElement("div");m.tabs.className="tabs";m.body.appendChild(m.tabs);}
d.querySelector(".rs").onclick=e=>{e.preventDefault();e.stopPropagation();resetItems(m.items);};
panel.appendChild(d);}
m.items.push(...items);
if(m.tabs){
const pane=document.createElement("div"),btn=document.createElement("button"),first=!m.panes.length;
btn.type="button";btn.className="tb"+(first?" on":"");btn.textContent=title;pane.style.display=first?"":"none";
btn.onclick=()=>{m.btns.forEach(b=>b.classList.remove("on"));btn.classList.add("on");m.panes.forEach(x=>{x.style.display="none";});pane.style.display="";};
m.tabs.appendChild(btn);m.btns.push(btn);m.panes.push(pane);m.body.appendChild(pane);addRows(pane,items);
}else{
const sd=mkSec(title,0,"in");addRows(sd.querySelector(".body"),items);
sd.querySelector(".rs").onclick=e=>{e.preventDefault();e.stopPropagation();resetItems(items);};
m.body.appendChild(sd);}
});
menuEls.Retouch.body.insertAdjacentHTML("beforeend",`
<details class="sec in"><summary><span>Glint of glasses</span></summary><div class="body">
<button id="gfix" class="w" disabled>Automatic glare removal</button>
<div class="row"><span>Luminance threshold (lower = more)</span><output id="o_gt">0.88</output><input id="gthr" type="range" min="0.6" max="0.99" step="0.01" value="0.88" aria-label="Ambang kilau"></div>
<button id="gbrush" class="w" disabled>Gloss brush: off</button>
<div class="row"><span>Brush size</span><output id="o_gs">3</output><input id="gsize" type="range" min="0.5" max="10" step="0.5" value="3" aria-label="Brush size"></div>
<button id="gclear" class="w" disabled>Cancel gloss correction</button>
</div></details>`);
panel.insertAdjacentHTML("beforeend",`
<details class="sec"><summary><span>Background</span></summary><div class="body">
<button id="rmbg" class="w" disabled>Remove Background (AI)</button>
<button id="rmall" class="w" disabled>Removeall checked</button>
<div id="bgopts" hidden>
<div class="field"><select id="bgmode" aria-label="Background Type">
<option value="transparent">Transparant</option><option value="color">Color</option>
<option value="image">Gambar</option><option value="original">Original Background</option></select>
<input id="bgcolor" type="color" value="#ffffff" aria-label="Color Background">
<label class="btn">Images<input id="bgimg" type="file" accept="image/*" hidden></label></div>
<div class="row"><span>Smooth the edges</span><output id="o_f">1</output>
<input id="feather" type="range" min="0" max="8" step="0.5" value="1" aria-label="Smooth the edges"></div>
</div>
</div></details>`);
document.querySelectorAll(".row input[type=range]").forEach(paint);
document.addEventListener("input",e=>{if(e.target.matches(".row input[type=range]"))paint(e.target);});
