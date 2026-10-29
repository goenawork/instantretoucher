/* ---------- Wajah & kilau kacamata ---------- */
const OVAL=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
const EYEL=[263,249,390,373,374,380,381,382,362,398,384,385,386,387,388,466],EYER=[33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246];
const BROWL=[276,283,282,295,285,300,293,334,296,336],BROWR=[46,53,52,65,55,70,63,105,66,107];
const LIPO=[61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185],LIPI=[78,95,88,178,87,14,317,402,318,324,308,415,310,311,312,13,82,81,80,191];
let brush=false,stroke=null;
async function getLM(){
  if(lm)return lm;
  msg("Memuat model deteksi wajah (sekali saja)...");
  const B="https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
  let V;try{V=await import(B+"/vision_bundle.mjs");}catch(e){V=await import(B);}
  const fs=await V.FilesetResolver.forVisionTasks(B+"/wasm");
  lm=await V.FaceLandmarker.createFromOptions(fs,{baseOptions:{modelAssetPath:"https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"},runningMode:"IMAGE",numFaces:6});
  return lm;
}
function ensureFaces(p){
  if(p.faces)return Promise.resolve();
  return p._fp||(p._fp=(async()=>{
    try{const L=await getLM();p.faces=L.detect(wc).faceLandmarks||[];}
    catch(e){p.faces=[];msg("Deteksi wajah gagal: "+e.message);}
    if(p.faces.length)buildMask(p);
  })());
}
function buildMask(p){
  const W=Math.min(1024,wc.width),H=Math.max(1,Math.round(W*wc.height/wc.width));
  const mk=(fn,blur)=>{const c=document.createElement("canvas");c.width=W;c.height=H;fn(c.getContext("2d"));
    const d=document.createElement("canvas");d.width=W;d.height=H;const y=d.getContext("2d");y.filter=`blur(${blur}px)`;y.drawImage(c,0,0);return y.getImageData(0,0,W,H).data;};
  const poly=(x,f,ids,grow)=>{x.beginPath();ids.forEach((i,k)=>{const q=f[i];k?x.lineTo(q.x*W,q.y*H):x.moveTo(q.x*W,q.y*H);});x.closePath();x.fill();if(grow){x.lineWidth=grow;x.stroke();}};
  const sk=mk(x=>p.faces.forEach(f=>{x.fillStyle="#fff";poly(x,f,OVAL);x.globalCompositeOperation="destination-out";
    [EYEL,EYER,BROWL,BROWR,LIPO].forEach(r=>poly(x,f,r,W*.012));x.globalCompositeOperation="source-over";}),W*.006);
  const te=mk(x=>{x.fillStyle="#fff";p.faces.forEach(f=>poly(x,f,LIPI));},W*.002);
  const ey=mk(x=>{x.fillStyle="#fff";p.faces.forEach(f=>{poly(x,f,EYEL);poly(x,f,EYER);});},W*.002);
  const md=new ImageData(W,H);
  for(let i=0;i<W*H;i++){md.data[i*4]=sk[i*4+3];md.data[i*4+1]=te[i*4+3];md.data[i*4+2]=ey[i*4+3];md.data[i*4+3]=255;}
  p.fmask=md;
  p.faceW=p.faces.reduce((a,f)=>{let lo=1,hi=0;OVAL.forEach(i=>{lo=Math.min(lo,f[i].x);hi=Math.max(hi,f[i].x);});return a+(hi-lo);},0)/p.faces.length;
}
function eyeBoxes(p){
  const r=[];
  p.faces.forEach(f=>[EYEL,EYER].forEach(ids=>{
    let a=9,b=-9,c=9,d=-9;ids.forEach(i=>{a=Math.min(a,f[i].x);b=Math.max(b,f[i].x);c=Math.min(c,f[i].y);d=Math.max(d,f[i].y);});
    const w=(b-a)*wc.width;r.push({cx:(a+b)/2*wc.width,cy:(c+d)/2*wc.height,rx:w*1.4,ry:w});
  }));
  return r;
}
function dilate(M,w,h,d){
  const T=new Uint8Array(M.length),R=new Uint8Array(M.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(M[y*w+x])for(let k=Math.max(0,x-d);k<=Math.min(w-1,x+d);k++)T[y*w+k]=1;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(T[y*w+x])for(let k=Math.max(0,y-d);k<=Math.min(h-1,y+d);k++)R[k*w+x]=1;
  return R;
}
function pushPull(D,M,w,h){
  const c=new Float32Array(w*h*3),k=new Float32Array(w*h);
  for(let i=0;i<w*h;i++)if(!M[i]){k[i]=1;c[i*3]=D[i*4];c[i*3+1]=D[i*4+1];c[i*3+2]=D[i*4+2];}
  const lv=[{c,k,w,h}];
  while(lv[lv.length-1].w>1||lv[lv.length-1].h>1){
    const a=lv[lv.length-1],w2=Math.ceil(a.w/2),h2=Math.ceil(a.h/2),c2=new Float32Array(w2*h2*3),k2=new Float32Array(w2*h2);
    for(let y=0;y<h2;y++)for(let x=0;x<w2;x++){
      let s=0,r=0,g=0,b=0,n=0;
      for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const xx=x*2+dx,yy=y*2+dy;if(xx<a.w&&yy<a.h){n++;const j=yy*a.w+xx,q=a.k[j];s+=q;r+=a.c[j*3]*q;g+=a.c[j*3+1]*q;b+=a.c[j*3+2]*q;}}
      const o=y*w2+x;if(s>0){c2[o*3]=r/s;c2[o*3+1]=g/s;c2[o*3+2]=b/s;k2[o]=s/n;}
    }
    lv.push({c:c2,k:k2,w:w2,h:h2});
  }
  for(let L=lv.length-2;L>=0;L--){
    const f=lv[L],q=lv[L+1];
    for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
      const o=y*f.w+x,kk=f.k[o];if(kk>=1)continue;
      const fx=Math.min(q.w-1,Math.max(0,(x+.5)/2-.5)),fy=Math.min(q.h-1,Math.max(0,(y+.5)/2-.5));
      const x0=Math.floor(fx),y0=Math.floor(fy),x1=Math.min(q.w-1,x0+1),y1=Math.min(q.h-1,y0+1),tx=fx-x0,ty=fy-y0;
      for(let ch=0;ch<3;ch++){
        const v=(q.c[(y0*q.w+x0)*3+ch]*(1-tx)+q.c[(y0*q.w+x1)*3+ch]*tx)*(1-ty)+(q.c[(y1*q.w+x0)*3+ch]*(1-tx)+q.c[(y1*q.w+x1)*3+ch]*tx)*ty;
        f.c[o*3+ch]=f.c[o*3+ch]*kk+v*(1-kk);
      }
      f.k[o]=1;
    }
  }
  return lv[0].c;
}
function glareKind(r,g,b,thr,satMin=.28){
  const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
  if((.2126*r+.7152*g+.0722*b)/255>thr&&mx-mn<90)return 1;
  if(mx>90&&(mx-mn)/mx>satMin){
    const d=mx-mn;let h=mx===r?((g-b)/d+6)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;
    if(h>70&&h<310)return 2;
  }
  return 0;
}

function applyGlare(p){
  p._gcount={w:0,c:0};
  const W=wc.width,H=wc.height,E=p.glare.auto&&p.faces?eyeBoxes(p):[],S=p.glare.strokes;
  let x0=W,y0=H,x1=0,y1=0;const ext=(a,b,c,d)=>{x0=Math.min(x0,a);y0=Math.min(y0,b);x1=Math.max(x1,c);y1=Math.max(y1,d);};
  E.forEach(e=>ext(e.cx-e.rx,e.cy-e.ry,e.cx+e.rx,e.cy+e.ry));
  S.forEach(s=>{const r=s.r*W;s.pts.forEach(q=>ext(q[0]*W-r,q[1]*H-r,q[0]*W+r,q[1]*H+r));});
  if(x1<=x0)return;
  
  const pad=Math.round(W*.02); 
  x0=Math.max(0,Math.floor(x0-pad));y0=Math.max(0,Math.floor(y0-pad));x1=Math.min(W,Math.ceil(x1+pad));y1=Math.min(H,Math.ceil(y1+pad));
  const bw=x1-x0,bh=y1-y0,ctx=wc.getContext("2d"),img=ctx.getImageData(x0,y0,bw,bh),D=img.data,thr=p.glare.thr;
  const M=new Uint8Array(bw*bh),C=new Uint8Array(bw*bh);
  
  const mark=(i,t)=>{
      const r=D[i*4], g=D[i*4+1], b=D[i*4+2];
      const mx=Math.max(r,g,b), mn=Math.min(r,g,b), luma=(.2126*r+.7152*g+.0722*b)/255;
      
      if(luma>t && (mx-mn)<100) { M[i]=1; return; }
      
      if(mx>70 && (mx-mn)/mx>0.08){
        const d=mx-mn;let h=mx===r?((g-b)/d+6)%6:mx===g?(b-r)/d+2:(r-g)/d+4;h*=60;
        if(h>40 && h<330) C[i]=1; 
      }
  };
  
  if(E.length)for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){
    const wx=x0+x,wy=y0+y;
    if(E.some(e=>((wx-e.cx)/e.rx)**2+((wy-e.cy)/e.ry)**2<=1.2)) mark(y*bw+x,thr); 
  }
  
  if(S.length){
    const t=document.createElement("canvas");t.width=bw;t.height=bh;const tc=t.getContext("2d");
    tc.lineCap=tc.lineJoin="round";tc.strokeStyle="#fff";
    S.forEach(s=>{tc.lineWidth=s.r*W*2;tc.beginPath();s.pts.forEach((q,k)=>{const X=q[0]*W-x0,Y=q[1]*H-y0;k?tc.lineTo(X,Y):tc.moveTo(X,Y);});
      if(s.pts.length===1)tc.lineTo(s.pts[0][0]*W-x0+.01,s.pts[0][1]*H-y0);tc.stroke();});
    const a=tc.getImageData(0,0,bw,bh).data;for(let i=0;i<bw*bh;i++)if(a[i*4+3]>60)mark(i,Math.max(.4,thr-.3));
  }

  const CD=dilate(C,bw,bh,Math.max(2,Math.round(W*.0015))); 
  for(let i=0;i<bw*bh;i++)if(CD[i] && !M[i]){
    const r=D[i*4],g=D[i*4+1],b=D[i*4+2];
    const w=C[i]?1:.7, luma = .3*r + .59*g + .11*b;
    D[i*4]=r+(luma-r)*w;D[i*4+1]=g+(luma-g)*w;D[i*4+2]=b+(luma-b)*w;
    if(C[i])p._gcount.c++;
  }

  if(M.some(v=>v)){
    const MD=dilate(M,bw,bh,Math.max(3,Math.round(W*.003)));
    const F=pushPull(D,MD,bw,bh);
    
    for(let i=0;i<bw*bh;i++){
        if(M[i])p._gcount.w++;
        if(MD[i]){
            const ir = F[i*3], ig = F[i*3+1], ib = F[i*3+2];
            const noise = (Math.random()-0.5) * 6; 
            const origR = D[i*4]/255, origG = D[i*4+1]/255, origB = D[i*4+2]/255;
            
            D[i*4]   = Math.max(0, Math.min(255, (origR * ir) + (ir * 0.3) + noise));
            D[i*4+1] = Math.max(0, Math.min(255, (origG * ig) + (ig * 0.3) + noise));
            D[i*4+2] = Math.max(0, Math.min(255, (origB * ib) + (ib * 0.3) + noise));
        }
    }
  }
  if(p._gcount.w||p._gcount.c)ctx.putImageData(img,x0,y0);
}

async function refresh(){const my=++tok;try{await show(cur,PREV,my);}catch(e){msg("Gagal memproses: "+e.message);}if(brush){placeOv();drawOv();}}
$("gfix").onclick=async()=>{
  if(!cur||busy)return;cur.glare.auto=true;cur.glare.thr=+$("gthr").value;msg("Mencari dan menghapus kilau...");
  await refresh();
  const g=cur._gcount||{w:0,c:0};
  msg(!(cur.faces&&cur.faces.length)?"Wajah tidak terdeteksi. Pakai Kuas kilau untuk menandai area kilau secara manual.":
    (g.w+g.c)?`Kilau diproses: ${g.c} piksel kilau berwarna, ${g.w} piksel kilau putih. Kalau masih ada sisa, turunkan Ambang kilau atau pakai kuas.`:
    "Tidak ada kilau yang terdeteksi di area mata. Turunkan Ambang kilau atau pakai kuas.");
};
$("gthr").oninput=()=>{$("o_gt").textContent=(+$("gthr").value).toFixed(2);};
$("gthr").onchange=()=>{if(cur&&cur.glare.auto)$("gfix").onclick();else if(cur)cur.glare.thr=+$("gthr").value;};
$("gclear").onclick=async()=>{if(!cur)return;cur.glare={auto:false,thr:.88,strokes:[]};syncUI();await refresh();msg("Perbaikan kilau dibatalkan.");};
const ov=$("ov");
function placeOv(){
  const v=out.style.display==="block"?out:cv;
  Object.assign(ov.style,{left:v.offsetLeft+"px",top:v.offsetTop+"px",width:v.clientWidth+"px",height:v.clientHeight+"px"});
  ov.width=v.clientWidth;ov.height=v.clientHeight;
}
function drawOv(){
  const c=ov.getContext("2d");c.clearRect(0,0,ov.width,ov.height);if(!cur)return;
  c.lineCap=c.lineJoin="round";c.strokeStyle="rgba(255,122,26,.5)";
  [...cur.glare.strokes,...(stroke?[stroke]:[])].forEach(s=>{
    c.lineWidth=s.r*ov.width*2;c.beginPath();
    s.pts.forEach((q,k)=>{const X=q[0]*ov.width,Y=q[1]*ov.height;k?c.lineTo(X,Y):c.moveTo(X,Y);});
    if(s.pts.length===1)c.lineTo(s.pts[0][0]*ov.width+.01,s.pts[0][1]*ov.height);c.stroke();
  });
}
$("gbrush").onclick=()=>{brush=!brush;$("gbrush").textContent="Kuas kilau: "+(brush?"nyala":"mati");ov.style.display=brush?"block":"none";if(brush){placeOv();drawOv();}};
$("gsize").oninput=()=>{$("o_gs").textContent=$("gsize").value;};
const pt=e=>{const r=ov.getBoundingClientRect();return [(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height];};
ov.onpointerdown=e=>{if(e.button!==0)return;ov.setPointerCapture(e.pointerId);stroke={r:$("gsize").value/200,pts:[pt(e)]};drawOv();};
ov.onpointermove=e=>{if(stroke){stroke.pts.push(pt(e));drawOv();}};
ov.onpointerup=async()=>{if(!stroke)return;cur.glare.strokes.push(stroke);stroke=null;await refresh();msg("Area kilau diperbaiki. Tambah goresan lagi kalau masih ada sisa.");};
addEventListener("resize",()=>{if(brush){placeOv();drawOv();}});
