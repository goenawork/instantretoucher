/* ---------- Zoom & geser ---------- */
const zw=$("zw"),view=$("view");
let Z=1,TX=0,TY=0,pan=null;
function applyZoom(){
  zw.style.transform=`translate(${TX}px,${TY}px) scale(${Z})`;
  const v=out.style.display==="block"?out:cv;
  $("zl").textContent=cv.width&&v.clientWidth?Math.round(Z*v.clientWidth/cv.width*100)+"%":"";
  view.style.cursor=Z>1&&!brush?"grab":"";
}
function fitView(){Z=1;TX=0;TY=0;applyZoom();}
function zoomAt(f,mx,my){
  const nz=Math.min(24,Math.max(1,Z*f));f=nz/Z;
  if(nz===1){TX=0;TY=0;}else{TX=mx-(mx-TX)*f;TY=my-(my-TY)*f;}
  Z=nz;applyZoom();
}
view.addEventListener("wheel",e=>{
  e.preventDefault();const r=view.getBoundingClientRect();
  zoomAt(Math.exp(-e.deltaY*(e.ctrlKey?.01:.002)),e.clientX-r.left,e.clientY-r.top);
},{passive:false});
view.addEventListener("pointerdown",e=>{
  if(Z<=1||(brush&&e.button!==1))return;
  pan={x:e.clientX,y:e.clientY,tx:TX,ty:TY};view.setPointerCapture(e.pointerId);view.style.cursor="grabbing";
});
view.addEventListener("pointermove",e=>{if(pan){TX=pan.tx+e.clientX-pan.x;TY=pan.ty+e.clientY-pan.y;applyZoom();}});
["pointerup","pointercancel"].forEach(ev=>view.addEventListener(ev,()=>{pan=null;applyZoom();}));
view.addEventListener("dblclick",()=>{if(!brush)fitView();});
$("zfit").onclick=fitView;
$("z100").onclick=()=>{const v=out.style.display==="block"?out:cv;if(v.clientWidth)zoomAt(cv.width/v.clientWidth/Z,view.clientWidth/2,view.clientHeight/2);};
addEventListener("resize",applyZoom);
