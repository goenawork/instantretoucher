const TR={temp:"linear-gradient(90deg,#3d6fd6,#8d8a86 50%,#ffb02e)",tint:"linear-gradient(90deg,#38a869,#8d8a86 50%,#c744b8)",
 vibrance:"linear-gradient(90deg,#77726c,#a8825a 50%,#ff7a1a)",sat:"linear-gradient(90deg,#77726c,#a8825a 50%,#ff7a1a)"};
const SECS=[
 ["Cahaya",1,[["exposure","Exposure",-3,3],["contrast","Contrast",-1,1],["highlights","Highlights",-1,1],["shadows","Shadows",-1,1],["whites","Whites",-1,1],["blacks","Blacks",-1,1]]],
 ["Warna",1,[["temp","Temperature",-1,1],["tint","Tint",-1,1],["vibrance","Vibrance",-1,1],["sat","Saturation",-1,1]]],
 ["Efek",0,[["fine","Texture",-1,1],["clarity","Clarity",-1,1],["dehaze","Dehaze",-1,1],["vig","Vignette",-1,1],
   ["vmid","Midpoint",0,1,.5,1],["vround","Roundness",-1,1,0,1],["vfeather","Feather",0,1,.5,1],["vhi","Highlights",0,1,0,1],["grain","Grain",0,1],["gsize","Ukuran grain",0,1,.25,1]]],
 ["Kulit",0,[["skin","Haluskan kulit",0,1],["keep","Pertahankan tekstur",0,1,.6]]],
 ["Mata & mulut",0,[["eyes","Cerahkan mata",0,1],["teeth","Putihkan gigi",0,1]]]
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
SECS.forEach(([title,open,items])=>{
  const d=document.createElement("details");d.className="sec";d.open=!!open;
  d.innerHTML=`<summary><span>${title}</span><button class="rs" title="Reset bagian ini" aria-label="Reset ${title}">&#10226;</button></summary><div class="body"></div>`;
  const body=d.querySelector(".body");
  items.forEach(([id,label,min,max,def=0,sub])=>{
    body.insertAdjacentHTML("beforeend",`<div class="row${sub?" sub":""}"><span>${label}</span><output id="o_${id}">${disp(id,def)}</output><input id="s_${id}" type="range" min="${min}" max="${max}" step="0.01" value="${def}" ${TR[id]?`class="grad" style="--tr:${TR[id]}"`:""} aria-label="${label}"></div>`);
    const sl=body.querySelector("#s_"+id);
    sl.addEventListener("input",()=>{if(!cur)return;cur.s[id]=+sl.value;$("o_"+id).textContent=disp(id,+sl.value);
      if(["skin","teeth","eyes"].includes(id)&&+sl.value>0&&!cur.faces&&!busy)ensureFaces(cur).then(()=>draw());draw();});
    sl.addEventListener("dblclick",()=>{sl.value=def;sl.dispatchEvent(new Event("input"));});
  });
  d.querySelector(".rs").onclick=e=>{e.preventDefault();e.stopPropagation();if(!cur)return;items.forEach(r=>{cur.s[r[0]]=r[4]||0;});syncUI();draw();};
  panel.appendChild(d);
});
panel.insertAdjacentHTML("beforeend",`
  <details class="sec"><summary><span>Kilau kacamata</span></summary><div class="body">
    <button id="gfix" class="w" disabled>Hapus kilau otomatis</button>
    <div class="row"><span>Ambang kilau (turunkan = lebih banyak)</span><output id="o_gt">0.88</output><input id="gthr" type="range" min="0.6" max="0.99" step="0.01" value="0.88" aria-label="Ambang kilau"></div>
    <button id="gbrush" class="w" disabled>Kuas kilau: mati</button>
    <div class="row"><span>Ukuran kuas</span><output id="o_gs">3</output><input id="gsize" type="range" min="0.5" max="10" step="0.5" value="3" aria-label="Ukuran kuas"></div>
    <button id="gclear" class="w" disabled>Batalkan perbaikan kilau</button>
  </div></details>
  <details class="sec"><summary><span>Latar</span></summary><div class="body">
    <button id="rmbg" class="w" disabled>Pisahkan subjek (AI)</button>
    <button id="rmall" class="w" disabled>Pisahkan semua yang tercentang</button>
    <div id="bgopts" hidden>
      <div class="field"><select id="bgmode" aria-label="Jenis latar">
        <option value="transparent">Transparan</option><option value="color">Warna</option>
        <option value="image">Gambar</option><option value="original">Latar asli</option></select>
        <input id="bgcolor" type="color" value="#ffffff" aria-label="Warna latar">
        <label class="btn">Gambar<input id="bgimg" type="file" accept="image/*" hidden></label></div>
      <div class="row"><span>Haluskan tepi</span><output id="o_f">1</output>
        <input id="feather" type="range" min="0" max="8" step="0.5" value="1" aria-label="Haluskan tepi"></div>
    </div>
  </div></details>`);
document.querySelectorAll(".row input[type=range]").forEach(paint);
document.addEventListener("input",e=>{if(e.target.matches(".row input[type=range]"))paint(e.target);});
