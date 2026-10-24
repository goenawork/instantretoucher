/* ---------- WebGL ---------- */
const gl=cv.getContext("webgl",{preserveDrawingBuffer:true,premultipliedAlpha:false});
const U={}; let MAXT=4096, ctex=null, ckey="";
if(!gl) msg("Browser tidak mendukung WebGL.");
else{
const sh=(t,s)=>{const o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);if(!gl.getShaderParameter(o,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(o));return o;};
const pr=gl.createProgram(); gl.attachShader(pr,sh(gl.VERTEX_SHADER,VS)); gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,FS));
gl.linkProgram(pr); gl.useProgram(pr);
gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
const loc=gl.getAttribLocation(pr,"p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
IDS.forEach(k=>U[k]=gl.getUniformLocation(pr,k)); MAXT=gl.getParameter(gl.MAX_TEXTURE_SIZE);
["hasMask","asp","faceW","res","cvOn"].forEach(k=>U[k]=gl.getUniformLocation(pr,k));
gl.uniform1i(gl.getUniformLocation(pr,"t"),0); gl.uniform1i(gl.getUniformLocation(pr,"mk"),1); mtex=gl.createTexture();
gl.uniform1i(gl.getUniformLocation(pr,"ct"),2); ctex=gl.createTexture();
gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D,ctex);
[gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER].forEach(f=>gl.texParameteri(gl.TEXTURE_2D,f,gl.LINEAR));
[gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T].forEach(f=>gl.texParameteri(gl.TEXTURE_2D,f,gl.CLAMP_TO_EDGE));
gl.activeTexture(gl.TEXTURE0);
}
/*PC-START*/
/* ---------- Curves ----------
   Tahap 1: kurva parametrik dari slider (Highlights/Lights/Darks/Shadows).
   Tahap 2: kurva titik yang bisa ditarik (p.pc = [[x,y],...], x dan y 0..1), memakai spline monoton.
   Hasil akhir = kurva titik(kurva slider(x)), dibuat jadi tabel 256 nilai untuk GPU. */
const pcClamp=v=>Math.min(1,Math.max(0,v));
function pcIsId(pc){return !pc||(pc.length===2&&Math.abs(pc[0][1])<1e-4&&Math.abs(pc[1][1]-1)<1e-4);}
function pcFn(pts){
const n=pts.length,X=pts.map(a=>a[0]),Y=pts.map(a=>a[1]),d=[],m=new Array(n);
for(let i=0;i<n-1;i++)d[i]=(Y[i+1]-Y[i])/(X[i+1]-X[i]);
m[0]=d[0];m[n-1]=d[n-2];
for(let i=1;i<n-1;i++)m[i]=d[i-1]*d[i]>0?(d[i-1]+d[i])/2:0;
for(let i=0;i<n-1;i++){
if(d[i]===0){m[i]=0;m[i+1]=0;continue;}
const a=m[i]/d[i],b=m[i+1]/d[i],s=a*a+b*b;
if(s>9){const t=3/Math.sqrt(s);m[i]=t*a*d[i];m[i+1]=t*b*d[i];}
}
return x=>{
if(x<=X[0])return Y[0];
if(x>=X[n-1])return Y[n-1];
let k=0;while(k<n-2&&x>X[k+1])k++;
const h=X[k+1]-X[k],t=(x-X[k])/h,t2=t*t,t3=t2*t;
return pcClamp((2*t3-3*t2+1)*Y[k]+(t3-2*t2+t)*h*m[k]+(-2*t3+3*t2)*Y[k+1]+(t3-t2)*h*m[k+1]);
};
}
function pcSample9(pc){const f=pcFn(pc&&pc.length>=2?pc:[[0,0],[1,1]]);return Array.from({length:9},(_,i)=>pcClamp(f(i/8)));}
function curveLUT(s,pc){
const N=256,out=new Uint8Array(N),k=[+s.cv_sh||0,+s.cv_da||0,+s.cv_li||0,+s.cv_hi||0],cen=[.125,.375,.625,.875],A=.4;
const f=pcIsId(pc)?null:pcFn(pc);
let prev=0;
for(let i=0;i<N;i++){
const x=i/(N-1);let d=0;
for(let j=0;j<4;j++){const t=Math.max(0,1-Math.abs(x-cen[j])/.25);d+=k[j]*t*t*(3-2*t);}
let y=x+A*Math.sin(Math.PI*x)*d;
y=pcClamp(y);if(y<prev)y=prev;prev=y;
out[i]=Math.round(pcClamp(f?f(y):y)*255);
}
return out;
}
/*PC-END*/
function setCurve(s,pc){
if(!gl||!ctex)return;
const key=[s.cv_hi,s.cv_li,s.cv_da,s.cv_sh].map(v=>+v||0).join(",")+"|"+(pcIsId(pc)?"":pc.map(a=>a[0]+":"+a[1]).join(";"));
if(key===ckey)return;ckey=key;
gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,ctex);
gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,256,1,0,gl.LUMINANCE,gl.UNSIGNED_BYTE,curveLUT(s,pc));
gl.activeTexture(gl.TEXTURE0);
}
/* ---------- Grafik kurva interaktif di panel Curves ---------- */
const cvPrev=(()=>{
const d=[...document.querySelectorAll("#panel details.sec")].find(e=>{const t=e.querySelector("summary span");return t&&t.textContent==="Curves";});
if(!d)return null;
const c=document.createElement("canvas");c.width=256;c.height=256;
c.style.cssText="width:100%;aspect-ratio:1/1;height:auto;display:block;margin:6px 0 4px;border-radius:6px;background:#15181a;cursor:crosshair;touch-action:none";
const h=document.createElement("div");
h.textContent="Klik grafik untuk menambah titik, tarik untuk mengubah, klik dua kali pada titik untuk menghapus. Garis putih tipis = hasil slider.";
h.style.cssText="font-size:11px;line-height:1.35;color:#8a8f94;margin:0 0 10px";
const b=d.querySelector(".body");b.prepend(h);b.prepend(c);return c;
})();
function drawCurve(p){
if(!cvPrev)return;
const g=cvPrev.getContext("2d"),W=cvPrev.width,H=cvPrev.height;
g.clearRect(0,0,W,H);
g.strokeStyle="rgba(255,255,255,.12)";g.lineWidth=1;g.beginPath();
for(let i=1;i<4;i++){g.moveTo(W*i/4,0);g.lineTo(W*i/4,H);g.moveTo(0,H*i/4);g.lineTo(W,H*i/4);}
g.stroke();
g.strokeStyle="rgba(255,255,255,.22)";g.beginPath();g.moveTo(0,H);g.lineTo(W,0);g.stroke();
const sl=curveLUT(p.s,null);
if(sl.some((v,i)=>v!==i)){
g.strokeStyle="rgba(255,255,255,.55)";g.lineWidth=1.2;g.beginPath();
for(let i=0;i<256;i++){const x=i/255*W,y=H-sl[i]/255*H;if(i)g.lineTo(x,y);else g.moveTo(x,y);}
g.stroke();
}
const pts=p.pc&&p.pc.length>=2?p.pc:[[0,0],[1,1]],f=pcFn(pts);
g.strokeStyle="#ff7a1a";g.lineWidth=2;g.beginPath();
for(let i=0;i<256;i++){const x=i/255*W,y=H-f(i/255)*H;if(i)g.lineTo(x,y);else g.moveTo(x,y);}
g.stroke();
pts.forEach(q=>{g.beginPath();g.arc(q[0]*W,H-q[1]*H,5,0,7);g.fillStyle="#ff7a1a";g.fill();g.strokeStyle="#111";g.lineWidth=1.5;g.stroke();});
}
drawCurve({s:zero(),pc:null});
if(cvPrev){
let drag=-1;
const pts=()=>cur?(cur.pc||(cur.pc=[[0,0],[1,1]])):null;
const at=e=>{const r=cvPrev.getBoundingClientRect();return [(e.clientX-r.left)/r.width,1-(e.clientY-r.top)/r.height,r.width];};
const near=(P,x,y,w)=>{let k=-1,best=1e9;P.forEach((q,i)=>{const dd=Math.hypot(q[0]-x,q[1]-y);if(dd<11/w&&dd<best){best=dd;k=i;}});return k;};
cvPrev.addEventListener("pointerdown",e=>{
const P=pts();if(!P)return;
const [x,y,w]=at(e);let k=near(P,x,y,w);
if(k<0){
if(x<.02||x>.98||P.some(q=>Math.abs(q[0]-x)<.03))return;
P.push([Math.round(x*10000)/10000,Math.round(pcFn(P)(x)*10000)/10000]);
P.sort((a,b)=>a[0]-b[0]);k=P.findIndex(q=>q[0]===Math.round(x*10000)/10000);
}
drag=k;cvPrev.setPointerCapture(e.pointerId);e.preventDefault();draw();
});
cvPrev.addEventListener("pointermove",e=>{
if(drag<0||!cur||!cur.pc)return;
const P=cur.pc,[x,y]=at(e),q=P[drag];
q[1]=Math.round(pcClamp(y)*10000)/10000;
if(drag>0&&drag<P.length-1)q[0]=Math.round(Math.min(P[drag+1][0]-.02,Math.max(P[drag-1][0]+.02,x))*10000)/10000;
draw();
});
["pointerup","pointercancel"].forEach(ev=>cvPrev.addEventListener(ev,()=>{drag=-1;}));
cvPrev.addEventListener("dblclick",e=>{
if(!cur||!cur.pc)return;
const [x,y,w]=at(e),k=near(cur.pc,x,y,w);
if(k>0&&k<cur.pc.length-1){cur.pc.splice(k,1);drag=-1;draw();}
});
/* Reset foto ini, reset bagian Curves, dan "Terapkan ke foto tercentang" ikut mengurus kurva titik */
const rb=$("reset");if(rb)rb.addEventListener("click",()=>{if(cur){cur.pc=null;draw();}});
const sb=$("syncb");if(sb)sb.addEventListener("click",()=>{if(!cur)return;photos.forEach(p=>{if(p.on&&p!==cur)p.pc=cur.pc?cur.pc.map(a=>[a[0],a[1]]):null;});});
const cd=cvPrev.closest("details"),cr=cd&&cd.querySelector(".rs");
if(cr)cr.addEventListener("click",()=>{if(cur){cur.pc=null;draw();}});
}
function draw(p=cur){
if(!p||!tex)return;
gl.viewport(0,0,cv.width,cv.height);
const off=bypass&&p===cur;
if(mown!==p.fmask){
mown=p.fmask;gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,mtex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
if(p.fmask)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,p.fmask);
else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
[gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER].forEach(f=>gl.texParameteri(gl.TEXTURE_2D,f,gl.LINEAR));
[gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T].forEach(f=>gl.texParameteri(gl.TEXTURE_2D,f,gl.CLAMP_TO_EDGE));
gl.activeTexture(gl.TEXTURE0);
}
const sp=off?{}:p.s,pc=off?null:p.pc;
const cOn=(Math.abs(sp.cv_hi||0)+Math.abs(sp.cv_li||0)+Math.abs(sp.cv_da||0)+Math.abs(sp.cv_sh||0))>.003||!pcIsId(pc);
setCurve(sp,pc);
gl.uniform1f(U.cvOn,cOn?1:0);
gl.uniform1f(U.hasMask,p.fmask?1:0);gl.uniform1f(U.asp,cv.width/cv.height);gl.uniform1f(U.faceW,p.faceW||.3);gl.uniform2f(U.res,cv.width,cv.height);
IDS.forEach(k=>gl.uniform1f(U[k],off?0:p.s[k]));
gl.drawArrays(gl.TRIANGLE_STRIP,0,4); composite(p);
if(p===cur)drawCurve(p);
}
async function show(p,cap,tk){
const bm=await createImageBitmap(p.blob,{imageOrientation:"from-image"});
if(tk!==undefined&&tk!==tok){bm.close();return;}
const odd=p.rot%2, sw=odd?bm.height:bm.width, sh=odd?bm.width:bm.height; p.sw=sw; p.sh=sh;
const k=Math.min(1,Math.min(cap,MAXT)/Math.max(sw,sh));
wc.width=Math.round(sw*k); wc.height=Math.round(sh*k);
const c=wc.getContext("2d"); c.translate(wc.width/2,wc.height/2); c.rotate(p.rot*Math.PI/2);
c.drawImage(bm,-bm.width*k/2,-bm.height*k/2,bm.width*k,bm.height*k); bm.close();
const G=p.glare.auto||p.glare.strokes.length;
if(G||p.s.skin>0||p.s.teeth>0||p.s.eyes>0){await ensureFaces(p);if(tk!==undefined&&tk!==tok)return;}
if(G)applyGlare(p);
cv.width=wc.width; cv.height=wc.height;
if(tex)gl.deleteTexture(tex); tex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,tex);
gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,wc);
[gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER].forEach(f=>gl.texParameteri(gl.TEXTURE_2D,f,gl.LINEAR));
[gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T].forEach(f=>gl.texParameteri(gl.TEXTURE_2D,f,gl.CLAMP_TO_EDGE));
draw(p);
}
