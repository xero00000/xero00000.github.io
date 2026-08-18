export const VERT = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main(){
  v_uv = a_position * .5 + .5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

export const SIGNAL_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_source;
uniform sampler2D u_previous;
uniform vec2 u_resolution;
uniform vec2 u_sourceRes;
uniform float u_time;
uniform int u_frame;
uniform int u_sourceMode;
uniform int u_testPattern;
uniform int u_signalType;
uniform int u_fitMode;
uniform float u_signalStrength;
uniform float u_noise;
uniform float u_chromaBleed;
uniform float u_lumaBlur;
uniform float u_ghosting;
uniform float u_dotCrawl;
uniform float u_jitter;
uniform float u_tracking;
uniform float u_dropout;
uniform float u_verticalRoll;
uniform float u_persistence;
uniform bool u_bypass;

const float PI = 3.141592653589793;

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float lineNoise(float y, float salt){
  return hash12(vec2(floor(y * u_resolution.y), floor(u_time * 59.94) + salt));
}
float luma(vec3 c){ return dot(c, vec3(.299,.587,.114)); }
vec3 rgb2yiq(vec3 c){
  return vec3(dot(c,vec3(.299,.587,.114)), dot(c,vec3(.596,-.274,-.322)), dot(c,vec3(.211,-.523,.312)));
}
vec3 yiq2rgb(vec3 c){
  return vec3(c.x+.956*c.y+.621*c.z, c.x-.272*c.y-.647*c.z, c.x-1.106*c.y+1.703*c.z);
}

vec3 bars(vec2 uv){
  vec3 top[7];
  top[0]=vec3(.75); top[1]=vec3(.75,.75,0.0); top[2]=vec3(0.0,.75,.75); top[3]=vec3(0.0,.75,0.0);
  top[4]=vec3(.75,0.0,.75); top[5]=vec3(.75,0.0,0.0); top[6]=vec3(0.0,0.0,.75);
  if(uv.y>.34) return top[int(clamp(floor(uv.x*7.0),0.0,6.0))];
  if(uv.y>.25){
    if(uv.x<1.0/7.0) return vec3(0.0,0.0,.75);
    if(uv.x<2.0/7.0) return vec3(.075);
    if(uv.x<3.0/7.0) return vec3(.75,0.0,.75);
    if(uv.x<4.0/7.0) return vec3(.075);
    if(uv.x<5.0/7.0) return vec3(0.0,.75,.75);
    return vec3(.075);
  }
  if(uv.x<.2) return vec3(.02);
  if(uv.x<.4) return vec3(.08);
  if(uv.x<.6) return vec3(.18);
  if(uv.x<.8) return vec3(.04);
  return vec3(.0);
}
vec3 crosshatch(vec2 uv){
  float gx = 1.0-smoothstep(.018,.045,abs(fract(uv.x*12.0)-.5));
  float gy = 1.0-smoothstep(.018,.045,abs(fract(uv.y*9.0)-.5));
  float c = max(gx,gy);
  vec2 p=(uv-.5)*2.0;
  float ring = 1.0-smoothstep(.01,.025,abs(length(p)-.78));
  return vec3(max(c*.8,ring));
}
vec3 grayscale(vec2 uv){
  float ramp = uv.x;
  float steps = floor(uv.x*16.0)/15.0;
  return vec3(uv.y>.5 ? ramp : steps);
}
vec3 multiburst(vec2 uv){
  float band=floor(uv.y*6.0);
  float f=pow(1.6,band+1.0)*8.0;
  float wave=.5+.5*sin(uv.x*f*PI*2.0);
  return vec3(wave);
}
vec3 checker(vec2 uv){
  vec3 cols[6];
  cols[0]=vec3(.72,.48,.36); cols[1]=vec3(.19,.31,.47); cols[2]=vec3(.37,.56,.28);
  cols[3]=vec3(.71,.24,.27); cols[4]=vec3(.12,.56,.58); cols[5]=vec3(.86,.75,.22);
  ivec2 cell=ivec2(clamp(floor(uv*vec2(6.0,4.0)),vec2(0.0),vec2(5.0,3.0)));
  float shade=.45+.14*float(cell.y);
  return mix(vec3(shade),cols[cell.x],.78);
}
vec3 testPattern(vec2 uv){
  if(u_testPattern==1) return crosshatch(uv);
  if(u_testPattern==2) return grayscale(uv);
  if(u_testPattern==3) return multiburst(uv);
  if(u_testPattern==4) return checker(uv);
  return bars(uv);
}

vec2 mediaUV(vec2 uv, out float valid){
  valid=1.0;
  if(u_sourceRes.x<2.0||u_sourceRes.y<2.0) return uv;
  float sa=u_sourceRes.x/u_sourceRes.y;
  float da=u_resolution.x/u_resolution.y;
  vec2 p=uv;
  if(u_fitMode==0){
    if(sa>da){ float h=da/sa; p.y=(uv.y-(1.0-h)*.5)/h; }
    else { float w=sa/da; p.x=(uv.x-(1.0-w)*.5)/w; }
    if(any(lessThan(p,vec2(0.0)))||any(greaterThan(p,vec2(1.0)))) valid=0.0;
  } else if(u_fitMode==1){
    if(sa>da){ float w=da/sa; p.x=uv.x*w+(1.0-w)*.5; }
    else { float h=sa/da; p.y=uv.y*h+(1.0-h)*.5; }
  }
  p.y=1.0-p.y;
  return p;
}
vec3 sourceAt(vec2 uv){
  if(u_sourceMode==1){ float n=hash12(uv*u_resolution+u_time*71.0); return vec3(n); }
  if(u_sourceMode==2) return testPattern(uv);
  float valid;
  vec2 p=mediaUV(uv,valid);
  return texture(u_source,p).rgb*valid;
}

void main(){
  vec2 uv=v_uv;
  if(abs(u_verticalRoll)>.0001) uv.y=fract(uv.y+u_time*u_verticalRoll*.075);

  float severity=float(max(u_signalType-1,0))/4.0;
  float lineJ=(lineNoise(uv.y,1.0)*2.0-1.0)*u_jitter*(1.0+severity*.7);
  uv.x+=lineJ;

  if(u_signalType==5 && u_tracking>0.0){
    float head=smoothstep(.16,.0,uv.y)*u_tracking;
    uv.x+=(lineNoise(uv.y,3.0)*2.0-1.0)*head*.12;
  }

  vec3 base=sourceAt(uv);
  if(u_bypass){ outColor=vec4(base,1.0); return; }

  vec2 px=1.0/max(u_resolution,vec2(1.0));
  float blurPx=1.0+u_lumaBlur*8.0*(1.0+severity);
  vec3 left=sourceAt(uv-vec2(px.x*blurPx,0.0));
  vec3 right=sourceAt(uv+vec2(px.x*blurPx,0.0));
  vec3 filtered=mix(base,(left+base*2.0+right)*.25,clamp(u_lumaBlur*2.0,0.0,1.0));

  if(u_signalType>=2){
    vec3 y0=rgb2yiq(filtered);
    float spread=(1.0+u_chromaBleed*14.0+severity*3.0)*px.x;
    vec3 ya=rgb2yiq(sourceAt(uv-vec2(spread,0.0)));
    vec3 yb=rgb2yiq(sourceAt(uv+vec2(spread,0.0)));
    y0.y=mix(y0.y,(ya.y+yb.y)*.5,clamp(u_chromaBleed*1.45,0.0,1.0));
    y0.z=mix(y0.z,(ya.z+yb.z)*.5,clamp(u_chromaBleed*1.45,0.0,1.0));
    filtered=yiq2rgb(y0);
  }

  if(u_signalType>=3){
    float phase=(uv.x*u_resolution.x*.5+floor(uv.y*u_resolution.y)+u_time*7.159)*PI;
    float crawl=sin(phase)*u_dotCrawl*(.25+.75*severity);
    vec3 yiq=rgb2yiq(filtered);
    yiq.x+=crawl*(abs(yiq.y)+abs(yiq.z))*.22;
    yiq.y+=crawl*.07;
    filtered=yiq2rgb(yiq);
  }

  if(u_ghosting>0.0){
    vec3 ghost=sourceAt(uv-vec2(.012+u_ghosting*.18,0.0));
    filtered+=ghost*u_ghosting*.48;
  }

  float n=hash12(gl_FragCoord.xy+vec2(float(u_frame)*17.0,u_time*13.0))-.5;
  float weak=(1.0-u_signalStrength);
  filtered+=n*(u_noise+weak*.32)*(1.0+severity*.45);

  if(u_signalType==4){
    float bandY=fract(uv.y*3.0-u_time*.14);
    float band=exp(-pow((bandY-.5)*7.0,2.0));
    filtered+=vec3(n*.35+.08,n*.25,n*.45)*band*(weak+.14);
    uv.x+=sin(uv.y*60.0+u_time*3.0)*weak*.002;
  }

  if(u_signalType==5){
    float trackY=fract(uv.y-u_time*.09);
    float trackBand=exp(-pow((trackY-.12)*18.0,2.0))*u_tracking;
    filtered=mix(filtered,vec3(luma(filtered)+n*.4),trackBand*.72);
    filtered+=n*trackBand*.5;
    float head=smoothstep(.032,0.0,uv.y);
    filtered=mix(filtered,vec3(n+.45),head*u_tracking*.65);
  }

  if(u_dropout>0.0){
    float gate=step(1.0-u_dropout*.12,lineNoise(uv.y,9.0));
    float streak=gate*step(.28,hash12(vec2(floor(uv.x*32.0),floor(uv.y*u_resolution.y))));
    filtered=mix(filtered,vec3(.82+n*.1),streak*u_dropout*.8);
  }

  filtered=clamp(filtered,vec3(-.25),vec3(1.5));
  vec3 prev=texture(u_previous,v_uv).rgb;
  float decay=mix(.45,.985,u_persistence);
  vec3 persisted=max(filtered,prev*decay);
  vec3 result=mix(filtered,persisted,u_persistence);
  outColor=vec4(result,1.0);
}`;

export const DISPLAY_FRAG = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 outColor;

uniform sampler2D u_signal;
uniform vec2 u_resolution;
uniform float u_time;
uniform int u_frame;
uniform float u_brightness;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_gamma;
uniform float u_blackLevel;
uniform float u_temperature;
uniform float u_sharpness;
uniform float u_scanlines;
uniform int u_maskType;
uniform float u_maskStrength;
uniform float u_maskScale;
uniform int u_resolutionMode;
uniform float u_bloom;
uniform float u_halation;
uniform float u_vignette;
uniform float u_curvature;
uniform float u_overscan;
uniform float u_hSize;
uniform float u_vSize;
uniform float u_hPos;
uniform float u_vPos;
uniform float u_convergence;
uniform float u_rotation;
uniform int u_colorMode;
uniform float u_focus;
uniform bool u_interlace;
uniform bool u_power;
uniform float u_powerElapsed;
uniform bool u_degauss;
uniform float u_degaussElapsed;
uniform float u_warmup;
uniform bool u_bypass;

const float PI=3.141592653589793;
float lum(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}

vec2 rotateUV(vec2 uv,float degrees){
  float a=radians(degrees); float s=sin(a),c=cos(a); vec2 p=uv-.5;
  return vec2(c*p.x-s*p.y,s*p.x+c*p.y)+.5;
}
vec2 curve(vec2 uv){
  vec2 p=uv*2.0-1.0;
  float r2=dot(p,p);
  p*=1.0+u_curvature*r2*.42;
  return p*.5+.5;
}
vec3 sampleFocused(vec2 uv){
  vec2 t=1.0/max(u_resolution,vec2(1.0));
  vec2 cv=vec2(u_convergence*(1.0+abs(uv.y-.5)*2.0),u_convergence*.35);
  vec3 c;
  c.r=texture(u_signal,uv+cv).r;
  c.g=texture(u_signal,uv).g;
  c.b=texture(u_signal,uv-cv).b;
  if(u_focus>.001){
    vec2 d=t*(1.0+u_focus*5.0);
    vec3 b=texture(u_signal,uv+vec2(d.x,0)).rgb+texture(u_signal,uv-vec2(d.x,0)).rgb+
           texture(u_signal,uv+vec2(0,d.y)).rgb+texture(u_signal,uv-vec2(0,d.y)).rgb;
    c=mix(c,b*.25,u_focus*.78);
  }
  if(u_sharpness>.001){
    vec2 d=t*1.3;
    vec3 b=(texture(u_signal,uv+vec2(d.x,0)).rgb+texture(u_signal,uv-vec2(d.x,0)).rgb+
            texture(u_signal,uv+vec2(0,d.y)).rgb+texture(u_signal,uv-vec2(0,d.y)).rgb)*.25;
    c+= (c-b)*u_sharpness*1.25;
  }
  return c;
}
vec3 bloomSample(vec2 uv){
  vec2 t=1.0/max(u_resolution,vec2(1.0));
  vec3 b=vec3(0.0);
  b+=texture(u_signal,uv+vec2(t.x*3.0,0)).rgb;
  b+=texture(u_signal,uv-vec2(t.x*3.0,0)).rgb;
  b+=texture(u_signal,uv+vec2(0,t.y*3.0)).rgb;
  b+=texture(u_signal,uv-vec2(0,t.y*3.0)).rgb;
  b+=texture(u_signal,uv+vec2(t.x*6.0,t.y*2.0)).rgb;
  b+=texture(u_signal,uv-vec2(t.x*6.0,t.y*2.0)).rgb;
  return b/6.0;
}
vec3 mask(vec3 c,vec2 uv){
  if(u_maskType==0||u_maskStrength<=.001)return c;
  vec2 p=uv*u_resolution*u_maskScale;
  vec3 m=vec3(1.0);
  if(u_maskType==1){
    float tri=mod(floor(p.x),3.0);
    m=tri<1.0?vec3(1.0,.58,.58):(tri<2.0?vec3(.58,1.0,.58):vec3(.58,.58,1.0));
  } else if(u_maskType==2){
    vec2 q=floor(p); float odd=mod(q.y,2.0); float tri=mod(q.x+odd,3.0);
    m=tri<1.0?vec3(1.0,.60,.58):(tri<2.0?vec3(.58,1.0,.60):vec3(.60,.58,1.0));
    m*=.78+.22*step(.22,fract(p.y));
  } else {
    float tri=mod(floor(p.x),3.0);
    m=tri<1.0?vec3(1.0,.62,.58):(tri<2.0?vec3(.58,1.0,.62):vec3(.62,.58,1.0));
    m*=.68+.32*step(.34,fract(p.y*.5));
  }
  return c*mix(vec3(1.0),m,u_maskStrength);
}

void main(){
  vec2 uv=v_uv;

  if(u_degauss && u_degaussElapsed<1.25){
    float t=clamp(u_degaussElapsed/1.25,0.0,1.0);
    float amp=sin(t*PI*12.0)*pow(1.0-t,2.4)*.045;
    uv+=vec2(sin(uv.y*17.0+u_time*8.0),cos(uv.x*15.0-u_time*7.0))*amp;
  }

  uv=rotateUV(uv,u_rotation);
  uv=(uv-.5)/vec2(u_hSize,u_vSize)+.5-vec2(u_hPos,u_vPos);
  float over=1.0+u_overscan;
  uv=(uv-.5)/over+.5;
  uv=curve(uv);

  if(any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0)))){
    outColor=vec4(0.0,0.0,0.0,1.0);return;
  }

  if(u_resolutionMode==1) uv.y=(floor(uv.y*240.0)+.5)/240.0;
  else if(u_resolutionMode==2) uv.y=(floor(uv.y*480.0)+.5)/480.0;

  vec3 c=sampleFocused(uv);
  if(u_bypass){outColor=vec4(c,1.0);return;}

  vec3 b=bloomSample(uv);
  float bl=max(lum(b)-.34,0.0);
  c+=b*bl*u_bloom*.82;
  c+=vec3(1.0,.24,.12)*bl*u_halation*.16;

  float rasterLines=u_resolutionMode==1?240.0:(u_resolutionMode==2?480.0:max(360.0,u_resolution.y*.72));
  float scan=.5+.5*cos(uv.y*rasterLines*PI*2.0);
  c*=1.0-scan*u_scanlines*.62;

  bool doInterlace=u_interlace||u_resolutionMode==2;
  if(doInterlace){
    float line=mod(floor(v_uv.y*u_resolution.y),2.0);
    float field=mod(float(u_frame),2.0);
    if(abs(line-field)>.5)c*=.70;
  }

  c=mask(c,uv);
  c+=u_blackLevel;
  c=(c-.5)*u_contrast+.5;
  float y=lum(c);
  c=mix(vec3(y),c,u_saturation);
  c*=u_brightness;
  c.r*=1.0+max(u_temperature,0.0)*.16;
  c.b*=1.0+max(-u_temperature,0.0)*.18;
  c.r*=1.0-max(-u_temperature,0.0)*.07;
  c.b*=1.0-max(u_temperature,0.0)*.10;
  c=max(c,vec3(0.0));
  c=pow(c,vec3(1.0/max(u_gamma,.01)));

  if(u_colorMode==1){float m=lum(c);c=vec3(.10,1.0,.28)*m*1.18;}
  else if(u_colorMode==2){float m=lum(c);c=vec3(1.0,.50,.08)*m*1.16;}
  else if(u_colorMode==3){float m=lum(c);c=vec3(m*.92,m*.97,m);}

  float edge=16.0*uv.x*uv.y*(1.0-uv.x)*(1.0-uv.y);
  float vig=pow(clamp(edge,0.0,1.0),.12+u_vignette*.55);
  c*=mix(1.0,vig,u_vignette);
  c*=mix(.42,1.0,u_warmup);

  if(!u_power){
    float t=u_powerElapsed;
    if(t<.20){
      float h=mix(.52,.004,smoothstep(0.0,.20,t));
      float keep=1.0-smoothstep(h,h+.012,abs(v_uv.y-.5));
      c*=keep*(1.0-smoothstep(.05,.22,t));
      c+=vec3(exp(-abs(v_uv.y-.5)*380.0))*smoothstep(.08,.17,t)*1.4;
    } else {
      c=vec3(0.0);
      float dot=(1.0-smoothstep(.0,.022,length(v_uv-.5)))*(1.0-smoothstep(.25,.72,t));
      c+=vec3(dot*1.6);
    }
  } else if(u_powerElapsed<.58){
    float t=smoothstep(0.0,.58,u_powerElapsed);
    float h=mix(.01,.55,t);
    float aperture=1.0-smoothstep(h,h+.06,abs(v_uv.y-.5));
    c*=aperture*t;
    float flash=(1.0-smoothstep(0.0,.25,u_powerElapsed))*(1.0-smoothstep(.0,.045,length(v_uv-.5)));
    c+=vec3(flash*1.25);
  }

  outColor=vec4(clamp(c,0.0,1.4),1.0);
}`;
