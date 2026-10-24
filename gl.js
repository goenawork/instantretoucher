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
["hasMask","asp","faceW","res"].forEach(k=>U[k]=gl.getUniformLocation(pr,k));
gl.uniform1i(gl.getUniformLocation(pr,"t"),0); gl.uniform1i(gl.getUniformLocation(pr,"mk"),1); mtex=gl.createTexture();
gl.uniform1i(gl.getUniformLocation(pr,"ct"),2); ctex=gl.createTexture();
gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D,ctex);
[gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER].forEach(f=>gl.texParameteri(gl.TEXTURE_2D,f,gl.LINEAR));
[gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T].forEach(f=>gl.texParameteri(gl.TEXTURE_2D,f,gl.CLAMP_TO_EDGE));
gl.activeTexture(gl.TEXTURE0);
}
/* ---------- Curves: kurva parametrik (Highlights/Lights/Darks/Shadows) -> tabel 256 nilai ---------- */
function curveLUT(s){
const N=256,out=new Uint8Array(N),k=[+s.cv_sh||0,+s.cv_da||0,+s.cv_li||0,+s.cv_hi||0],cen=[.125,.375,.625,.875],A=.4;
let prev=0;
for(let i=0;i<N;i++){
const x=i/(N-1);let d=0;
for(let j=0;j<4;j++){const t=Math.max(0,1-Math.abs(x-cen[j])/.25);d+=k[j]*t*t*(3-2*t);}
let y=x+A*Math.sin(Math.PI*x)*d;
y=Math.min(1,Math.max(0,y));if(y<prev)y=prev;prev=y;
out[i]=Math.round(y*255);
}
return out;
}
function setCurve(s){
if(!gl||!ctex)return;
const key=[s.cv_hi,s.cv_li,s.cv_da,s.cv_sh].map(v=>+v||0).join(",");
if(key===ckey)return;ckey=key;
gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,ctex);
gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,256,1,0,gl.LUMINANCE,gl.UNSIGNED_BYTE,curveLUT(s));
gl.activeTexture(gl.TEXTURE0);
}
/* Pratinjau grafik kurva di panel Curves */
const cvPrev=(()=>{
const d=[...document.querySelectorAll("#panel details.sec")].find(e=>{const t=e.querySelector("summary span");return t&&t.textContent==="Curves";});
if(!d)return null;
const c=document.createElement("canvas");c.width=240;c.height=150;
c.style.cssText="width:100%;height:auto;display:block;margin:6px 0 10px;border-radius:6px;background:#15181a";
d.querySelector(".body").prepend(c);return c;
})();
function drawCurve(s){
if(!cvPrev)return;
const g=cvPrev.getContext("2d"),W=cvPrev.width,H=cvPrev.height;
g.clearRect(0,0,W,H);
g.strokeStyle="rgba(255,255,255,.12)";g.lineWidth=1;g.beginPath();
for(let i=1;i<4;i++){g.moveTo(W*i/4,0);g.lineTo(W*i/4,H);g.moveTo(0,H*i/4);g.lineTo(W,H*i/4);}
g.stroke();
g.strokeStyle="rgba(255,255,255,.25)";g.beginPath();g.moveTo(0,H);g.lineTo(W,0);g.stroke();
const lut=curveLUT(s);
g.strokeStyle="#ff7a1a";g.lineWidth=2;g.beginPath();
for(let i=0;i<256;i++){const x=i/255*W,y=H-lut[i]/255*H;if(i)g.lineTo(x,y);else g.moveTo(x,y);}
g.stroke();
}
drawCurve(zero());
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
setCurve(off?{}:p.s);
gl.uniform1f(U.hasMask,p.fmask?1:0);gl.uniform1f(U.asp,cv.width/cv.height);gl.uniform1f(U.faceW,p.faceW||.3);gl.uniform2f(U.res,cv.width,cv.height);
IDS.forEach(k=>gl.uniform1f(U[k],off?0:p.s[k]));
gl.drawArrays(gl.TRIANGLE_STRIP,0,4); composite(p);
if(p===cur)drawCurve(p.s);
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
