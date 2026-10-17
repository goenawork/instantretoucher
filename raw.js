/* ---------- RAW: ambil JPEG preview terbesar di dalam file ---------- */
function jpegEnd(b,s){
  let p=s+2;const n=b.length;
  while(p+4<n){
    if(b[p]!==0xFF)return -1;
    const m=b[p+1];
    if(m===0xFF){p++;continue;}
    if(m===0xD9)return p+2;
    if(m===0x01||(m>=0xD0&&m<=0xD8)){p+=2;continue;}
    p+=2+((b[p+2]<<8)|b[p+3]);
    if(m===0xDA){
      while(p+1<n){
        if(b[p]===0xFF){const q=b[p+1];if(q===0xD9)return p+2;if(q!==0&&q!==0xFF&&!(q>=0xD0&&q<=0xD7))break;}
        p++;
      }
    }
  }
  return -1;
}
function extractJpeg(b){
  let best=null;
  for(let i=0;i<b.length-3;i++){
    if(b[i]===0xFF&&b[i+1]===0xD8&&b[i+2]===0xFF){
      const e=jpegEnd(b,i);
      if(e>0){if(!best||e-i>best[1]-best[0])best=[i,e];i=e-1;}
    }
  }
  return best&&best[1]-best[0]>20000?new Blob([b.subarray(best[0],best[1])],{type:"image/jpeg"}):null;
}
