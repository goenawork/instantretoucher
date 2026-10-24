/* ---------- Shader GLSL (vertex + fragment) ---------- */
const VS=`attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
const FS=`precision highp float;varying vec2 v;uniform sampler2D t;
uniform sampler2D mk;uniform float hasMask,asp,faceW,skin,keep,teeth,eyes;
uniform float exposure,contrast,highlights,shadows,whites,blacks,temp,tint,vibrance,sat;
uniform float fine,clarity,dehaze,vig,vmid,vround,vfeather,vhi,grain,gsize;
uniform vec2 res;
uniform sampler2D ct;uniform float cv_hi,cv_li,cv_da,cv_sh;
uniform float hue_red,hue_orange,hue_yellow,hue_green,hue_aqua,hue_blue,hue_purple,hue_magenta;
uniform float sat_red,sat_orange,sat_yellow,sat_green,sat_aqua,sat_blue,sat_purple,sat_magenta;
uniform float lum_red,lum_orange,lum_yellow,lum_green,lum_aqua,lum_blue,lum_purple,lum_magenta;
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
c=pow(c,vec3(2.2))*pow(2.,exposure); c=pow(clamp(c,0.,8.),vec3(1./2.2));
c.r+=temp*.12; c.b-=temp*.12; c.g-=tint*.08; c.r+=tint*.04; c.b+=tint*.04;
float l=dot(c,LW);
float sh=pow(1.-clamp(l,0.,1.),2.), hi=pow(clamp(l,0.,1.),2.);
c+=shadows*.3*sh*(1.-l*.5); c+=highlights*.3*hi;
c+=whites*.2*smoothstep(.55,1.,l); c+=blacks*.2*(1.-smoothstep(0.,.45,l));
c=(c-.5)*(1.+contrast)+.5;
float lm0=dot(c0,LW);
if(abs(fine)>.003) c+=(lm0-dot(blurAt(.0015),LW))*fine*1.5;
if(abs(clarity)>.003) c+=(lm0-dot(blurAt(.012),LW))*clarity*1.3*clamp(1.-abs(l-.5)*1.6,0.,1.);
if(abs(dehaze)>.003){
vec3 A=vec3(.92);
if(dehaze>0.){float tr=max(1.-.8*dehaze*min(c.r,min(c.g,c.b))/.92,.25);c=(c-A)/tr+A;}
else c=mix(c,A,-dehaze*.35);
}
if(abs(cv_hi)+abs(cv_li)+abs(cv_da)+abs(cv_sh)>.003) c=crv(c);
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
