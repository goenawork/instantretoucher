/* ---------- Shader GLSL (vertex + fragment) ---------- */
const VS=`attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
const FS=`precision highp float;varying vec2 v;uniform sampler2D t;
uniform sampler2D mk;uniform float hasMask,asp,faceW,skin,keep,teeth,eyes;
uniform float exposure,contrast,highlights,shadows,whites,blacks,temp,tint,vibrance,sat;
uniform float fine,clarity,dehaze,vig,vmid,vround,vfeather,vhi,grain,gsize;
uniform vec2 res;
uniform sampler2D ct;uniform float cvOn;
uniform float hue_red,hue_orange,hue_yellow,hue_green,hue_aqua,hue_blue,hue_purple,hue_magenta;
uniform float sat_red,sat_orange,sat_yellow,sat_green,sat_aqua,sat_blue,sat_purple,sat_magenta;
uniform float lum_red,lum_orange,lum_yellow,lum_green,lum_aqua,lum_blue,lum_purple,lum_magenta;
uniform float sc_red_c,sc_red_m,sc_red_y,sc_red_k;
uniform float sc_yellow_c,sc_yellow_m,sc_yellow_y,sc_yellow_k;
uniform float sc_green_c,sc_green_m,sc_green_y,sc_green_k;
uniform float sc_cyan_c,sc_cyan_m,sc_cyan_y,sc_cyan_k;
uniform float sc_blue_c,sc_blue_m,sc_blue_y,sc_blue_k;
uniform float sc_magenta_c,sc_magenta_m,sc_magenta_y,sc_magenta_k;
uniform float sc_white_c,sc_white_m,sc_white_y,sc_white_k;
uniform float sc_neutral_c,sc_neutral_m,sc_neutral_y,sc_neutral_k;
uniform float sc_black_c,sc_black_m,sc_black_y,sc_black_k;
const vec3 LW=vec3(.2126,.7152,.0722);
vec3 blurAt(float rad){
vec3 s=vec3(0.);
for(int i=0;i<16;i++){float fi=float(i)+.5,a=fi*2.39996,r=sqrt(fi/16.)*rad;
s+=texture2D(t,v+vec2(cos(a),sin(a)*asp)*r).rgb;}
return s/16.;
}
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
vec3 crv(vec3 x){
x=clamp(x,0.,1.);
return vec3(texture2D(ct,vec2(x.r*(255./256.)+.5/256.,.5)).r,
texture2D(ct,vec2(x.g*(255./256.)+.5/256.,.5)).r,
texture2D(ct,vec2(x.b*(255./256.)+.5/256.,.5)).r);
}
vec3 rgb2hsv(vec3 c){
vec4 K=vec4(0.,-1./3.,2./3.,-1.);
vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));
vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));
float d=q.x-min(q.w,q.y);float e=1.0e-10;
return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x);
}
vec3 hsv2rgb(vec3 c){
vec4 K=vec4(1.,2./3.,1./3.,3.);
vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www);
return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y);
}
float bw(float hd,float c,float lo,float hi2){
float d=mod(hd-c+180.,360.)-180.;
float w=d<0.?1.+d/lo:1.-d/hi2;
w=clamp(w,0.,1.);
return w*w*(3.-2.*w);
}
void main(){
vec3 c=texture2D(t,v).rgb, c0=c;
if(hasMask>.5){
vec3 m=texture2D(mk,v).rgb;
float sm=skin*m.r;
if(sm>.003){
float rad=faceW*(.008+.012*skin), sg=.05+.12*skin;
vec3 acc=vec3(0.),pl=vec3(0.);float ws=0.;
for(int i=0;i<24;i++){
float fi=float(i)+.5, a=fi*2.39996, r=sqrt(fi/24.)*rad;
vec3 s=texture2D(t,v+vec2(cos(a),sin(a)*asp)*r).rgb;
float d=distance(s,c), w=exp(-d*d/(2.*sg*sg));
acc+=s*w; ws+=w; pl+=s;
}
vec3 sb=acc/ws, lp=pl/24.;
c=mix(c,clamp(sb+(c-lp)*keep,0.,1.),sm);
}
float l0=dot(c,LW);
float red=c.r-.5*(c.g+c.b);
float tw=teeth*m.g*smoothstep(.25,.45,l0)*(1.-smoothstep(.06,.18,red));
c=mix(c,mix(vec3(l0),c,.5)*(1.+.2*teeth),tw);
c=mix(c,c*1.2+.03,eyes*m.b*smoothstep(.4,.75,l0));
}
vec3 lin=pow(max(c,0.),vec3(2.2))*pow(2.,exposure);
if(exposure>0.){vec3 kn=min(lin,.7)+.3*(1.-exp(-max(lin-.7,0.)/.3));lin=mix(lin,kn,clamp(exposure/2.,0.,1.));}
c=pow(clamp(lin,0.,8.),vec3(1./2.2));
c.r+=temp*.12; c.b-=temp*.12; c.g-=tint*.08; c.r+=tint*.04; c.b+=tint*.04;
float l=dot(c,LW);
if(contrast>0.){vec3 cs=clamp(c,0.,1.);cs=cs*cs*cs*(cs*(cs*6.-15.)+10.);c=mix(c,cs,contrast);}
else c=(c-.5)*(1.+contrast*.6)+.5;
float lj=dot(c,LW);
float hm=smoothstep(.4,1.,lj), sm=smoothstep(.02,.3,lj)*(1.-smoothstep(.3,.8,lj));
if(highlights<0.) c*=1.+highlights*.32*lj*lj; else c=1.-(1.-c)*(1.-highlights*.5*hm);
if(shadows>0.) c=1.-(1.-c)*(1.-shadows*.3*sm); else c*=1.+shadows*.5*sm;
float bpt=-blacks*.12, wpt=1.-whites*.12;
c=(c-bpt)/max(wpt-bpt,.2);
float lm0=dot(c0,LW);
if(abs(fine)>.003) c+=(lm0-dot(blurAt(.0015),LW))*fine*1.5;
if(abs(clarity)>.003) c+=(lm0-dot(blurAt(.012),LW))*clarity*1.3*clamp(1.-abs(l-.5)*1.6,0.,1.);
if(abs(dehaze)>.003){
vec3 A=vec3(.92);
if(dehaze>0.){float tr=max(1.-.8*dehaze*min(c.r,min(c.g,c.b))/.92,.25);c=(c-A)/tr+A;}
else c=mix(c,A,-dehaze*.35);
}
if(cvOn>.5) c=crv(c);
l=dot(c,LW);
float mx=max(c.r,max(c.g,c.b)), mn=min(c.r,min(c.g,c.b));
float skinw=(c.r>c.g&&c.g>c.b)?smoothstep(.15,.35,c.r):0.;
c=mix(vec3(l),c,1.+sat+vibrance*(1.-(mx-mn))*(1.-.5*skinw));
float hslOn=abs(hue_red)+abs(hue_orange)+abs(hue_yellow)+abs(hue_green)+abs(hue_aqua)+abs(hue_blue)+abs(hue_purple)+abs(hue_magenta)
+abs(sat_red)+abs(sat_orange)+abs(sat_yellow)+abs(sat_green)+abs(sat_aqua)+abs(sat_blue)+abs(sat_purple)+abs(sat_magenta)
+abs(lum_red)+abs(lum_orange)+abs(lum_yellow)+abs(lum_green)+abs(lum_aqua)+abs(lum_blue)+abs(lum_purple)+abs(lum_magenta);
if(hslOn>.003){
vec3 cc=clamp(c,0.,1.);
float cwt=smoothstep(.03,.22,max(cc.r,max(cc.g,cc.b))-min(cc.r,min(cc.g,cc.b)));
vec3 hv=rgb2hsv(cc);
float hd=hv.x*360.;
float wR=bw(hd,0.,60.,30.), wO=bw(hd,30.,30.,30.), wY=bw(hd,60.,30.,60.), wG=bw(hd,120.,60.,60.);
float wA=bw(hd,180.,60.,60.), wB=bw(hd,240.,60.,30.), wP=bw(hd,270.,30.,30.), wM=bw(hd,300.,30.,60.);
float dH=wR*hue_red+wO*hue_orange+wY*hue_yellow+wG*hue_green+wA*hue_aqua+wB*hue_blue+wP*hue_purple+wM*hue_magenta;
float dS=wR*sat_red+wO*sat_orange+wY*sat_yellow+wG*sat_green+wA*sat_aqua+wB*sat_blue+wP*sat_purple+wM*sat_magenta;
float dL=wR*lum_red+wO*lum_orange+wY*lum_yellow+wG*lum_green+wA*lum_aqua+wB*lum_blue+wP*lum_purple+wM*lum_magenta;
hv.x=fract(hv.x+dH*cwt*30./360.);
hv.y=clamp(hv.y*(1.+dS*cwt),0.,1.);
c=hsv2rgb(hv);
float dl=dL*cwt;
c=dl>=0.?mix(c,vec3(1.),dl*.5):c*(1.+dl*.7);
}
float scOn=abs(sc_red_c)+abs(sc_red_m)+abs(sc_red_y)+abs(sc_red_k)+abs(sc_yellow_c)+abs(sc_yellow_m)+abs(sc_yellow_y)+abs(sc_yellow_k)+abs(sc_green_c)+abs(sc_green_m)+abs(sc_green_y)+abs(sc_green_k)+abs(sc_cyan_c)+abs(sc_cyan_m)+abs(sc_cyan_y)+abs(sc_cyan_k)+abs(sc_blue_c)+abs(sc_blue_m)+abs(sc_blue_y)+abs(sc_blue_k)+abs(sc_magenta_c)+abs(sc_magenta_m)+abs(sc_magenta_y)+abs(sc_magenta_k)+abs(sc_white_c)+abs(sc_white_m)+abs(sc_white_y)+abs(sc_white_k)+abs(sc_neutral_c)+abs(sc_neutral_m)+abs(sc_neutral_y)+abs(sc_neutral_k)+abs(sc_black_c)+abs(sc_black_m)+abs(sc_black_y)+abs(sc_black_k);
if(scOn>.003){
vec3 q=clamp(c,0.,1.);
float qx=max(q.r,max(q.g,q.b)), qn=min(q.r,min(q.g,q.b)), qc=qx-qn;
float W0=max(q.r-max(q.g,q.b),0.), W1=max(min(q.r,q.g)-q.b,0.), W2=max(q.g-max(q.r,q.b),0.);
float W3=max(min(q.g,q.b)-q.r,0.), W4=max(q.b-max(q.r,q.g),0.), W5=max(min(q.r,q.b)-q.g,0.);
float W6=clamp((qn-.35)/.65,0.,1.), W8=clamp((.65-qx)/.65,0.,1.);
float W7=clamp(1.-abs(qx+qn-1.),0.,1.)*(1.-qc)*(1.-qc)*(1.-qc);
float aC=W0*sc_red_c+W1*sc_yellow_c+W2*sc_green_c+W3*sc_cyan_c+W4*sc_blue_c+W5*sc_magenta_c+W6*sc_white_c+W7*sc_neutral_c+W8*sc_black_c, aM=W0*sc_red_m+W1*sc_yellow_m+W2*sc_green_m+W3*sc_cyan_m+W4*sc_blue_m+W5*sc_magenta_m+W6*sc_white_m+W7*sc_neutral_m+W8*sc_black_m, aY=W0*sc_red_y+W1*sc_yellow_y+W2*sc_green_y+W3*sc_cyan_y+W4*sc_blue_y+W5*sc_magenta_y+W6*sc_white_y+W7*sc_neutral_y+W8*sc_black_y, aK=W0*sc_red_k+W1*sc_yellow_k+W2*sc_green_k+W3*sc_cyan_k+W4*sc_blue_k+W5*sc_magenta_k+W6*sc_white_k+W7*sc_neutral_k+W8*sc_black_k;
vec3 ink=1.-q, ad=vec3(aC,aM,aY);
vec3 pos=max(ad,0.), neg=min(ad,0.);
ink=clamp(ink*(1.+neg)+(1.-ink)*pos*(.25+.75*ink),0.,1.);
q=1.-ink;
float kk=aK*.5;
q*=kk>0.?1.-kk:1./(1.+kk);
c=clamp(q,0.,1.);
}
if(abs(vig)>.003){
vec2 q=(v-.5)*2.; float rd=max(vround,0.);
vec2 qq=vec2(q.x*mix(1.,asp,rd),q.y)/mix(1.,max(asp,1.),rd);
float pw=mix(2.,5.,max(-vround,0.));
float d=pow(pow(abs(qq.x),pw)+pow(abs(qq.y),pw),1./pw);
float s0=mix(.1,1.1,vmid), vm=smoothstep(s0,s0+mix(.05,1.,vfeather),d);
float prot=1.-vhi*smoothstep(.5,1.,dot(c,LW));
if(vig<0.) c*=1.+vig*vm*prot; else c=mix(c,vec3(1.),vig*vm*prot*.8);
}
if(grain>.003){
float cell=max(1.,res.x/2200.*mix(1.,3.5,gsize)); vec2 g=floor(v*res/cell);
float n=hash(g)+hash(g+17.3)-1.; float lg=dot(c,LW);
c+=n*grain*.22*(1.-pow(abs(lg*2.-1.),2.)*.7);
}
gl_FragColor=vec4(clamp(c,0.,1.),1.);
}`;
