import { VERT, SIGNAL_FRAG, DISPLAY_FRAG } from './shaders.js';

const clamp = (v,min,max) => Math.max(min,Math.min(max,v));

export class CRTAudio {
  constructor(){ this.ctx=null; this.master=null; this.osc1=null; this.osc2=null; }
  ensure(){
    if(this.ctx){ this.ctx.resume?.(); return; }
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC) return;
    this.ctx=new AC(); this.master=this.ctx.createGain(); this.master.gain.value=0; this.master.connect(this.ctx.destination);
    this.osc1=this.ctx.createOscillator(); this.osc1.type='sine'; this.osc1.frequency.value=60;
    this.osc2=this.ctx.createOscillator(); this.osc2.type='sine'; this.osc2.frequency.value=120;
    const g1=this.ctx.createGain(),g2=this.ctx.createGain(); g1.gain.value=.75; g2.gain.value=.25;
    this.osc1.connect(g1).connect(this.master); this.osc2.connect(g2).connect(this.master);
    this.osc1.start(); this.osc2.start();
  }
  setVolume(v){ this.ensure(); if(!this.master) return; const t=this.ctx.currentTime; this.master.gain.cancelScheduledValues(t); this.master.gain.linearRampToValueAtTime(v,t+.08); }
  chirp(kind='degauss'){
    this.ensure(); if(!this.ctx) return;
    const o=this.ctx.createOscillator(),g=this.ctx.createGain(),t=this.ctx.currentTime;
    o.type=kind==='power'?'triangle':'sine';
    o.frequency.setValueAtTime(kind==='power'?90:95,t); o.frequency.exponentialRampToValueAtTime(kind==='power'?42:28,t+(kind==='power'?.18:.75));
    g.gain.setValueAtTime(.001,t); g.gain.exponentialRampToValueAtTime(.035,t+.015); g.gain.exponentialRampToValueAtTime(.001,t+(kind==='power'?.2:.8));
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t+(kind==='power'?.22:.82));
  }
}

export class CRTGL {
  constructor(canvas,state){
    this.canvas=canvas; this.state=state; this.gl=canvas.getContext('webgl2',{antialias:false,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
    if(!this.gl) throw new Error('WebGL2 is required for CRT Lab.');
    this.start=performance.now(); this.frame=0; this.powerChanged=this.start; this.degaussStarted=-1; this.lastSize=[0,0]; this.sourceRes=[640,480]; this.sourceKind='test';
    this.imageBitmap=null; this.video=null; this.lastVideoTime=-1;
    this.init();
  }
  compile(type,source){
    const gl=this.gl,s=gl.createShader(type); gl.shaderSource(s,source); gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)||'Shader compile failed');
    return s;
  }
  program(fs){
    const gl=this.gl,p=gl.createProgram(); gl.attachShader(p,this.compile(gl.VERTEX_SHADER,VERT)); gl.attachShader(p,this.compile(gl.FRAGMENT_SHADER,fs)); gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)||'Program link failed');
    return p;
  }
  init(){
    const gl=this.gl;
    this.signalProgram=this.program(SIGNAL_FRAG); this.displayProgram=this.program(DISPLAY_FRAG);
    this.vao=gl.createVertexArray(); gl.bindVertexArray(this.vao);
    const buf=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buf); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    for(const p of [this.signalProgram,this.displayProgram]){ gl.useProgram(p); const loc=gl.getAttribLocation(p,'a_position'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0); }
    this.sourceTex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,this.sourceTex); this.texParams(); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,2,2,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255]));
    this.feedback=[this.makeTarget(8,8),this.makeTarget(8,8)]; this.feedbackIndex=0;
    this.clearFeedback();
    gl.bindVertexArray(null);
  }
  texParams(){ const gl=this.gl; gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE); }
  makeTarget(w,h){
    const gl=this.gl,tex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,tex); this.texParams(); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
    const fbo=gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER,fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,tex,0); return {tex,fbo,w,h};
  }
  resizeTarget(t,w,h){ const gl=this.gl; t.w=w;t.h=h;gl.bindTexture(gl.TEXTURE_2D,t.tex);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,w,h,0,gl.RGBA,gl.UNSIGNED_BYTE,null); }
  set1f(p,n,v){ const l=this.gl.getUniformLocation(p,n); if(l!==null)this.gl.uniform1f(l,Number(v)); }
  set1i(p,n,v){ const l=this.gl.getUniformLocation(p,n); if(l!==null)this.gl.uniform1i(l,Number(v)); }
  set2f(p,n,a,b){ const l=this.gl.getUniformLocation(p,n); if(l!==null)this.gl.uniform2f(l,a,b); }
  resize(){
    const rect=this.canvas.getBoundingClientRect(); const dpr=Math.min(devicePixelRatio||1,2); const scale=Number(this.state.performanceScale)||1;
    const w=Math.max(320,Math.round(rect.width*dpr*scale)),h=Math.max(240,Math.round(rect.height*dpr*scale));
    if(w!==this.canvas.width||h!==this.canvas.height){ this.canvas.width=w; this.canvas.height=h; this.feedback.forEach(t=>this.resizeTarget(t,w,h)); this.gl.bindFramebuffer(this.gl.FRAMEBUFFER,null); this.lastSize=[w,h]; return true; }
    return false;
  }
  setImage(bitmap){ this.imageBitmap?.close?.(); this.imageBitmap=bitmap; this.video=null; this.sourceKind='image'; this.sourceRes=[bitmap.width,bitmap.height]; const gl=this.gl; gl.bindTexture(gl.TEXTURE_2D,this.sourceTex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bitmap); }
  setVideo(video){ this.video=video; this.imageBitmap=null; this.sourceKind='video'; this.lastVideoTime=-1; if(video.videoWidth) this.sourceRes=[video.videoWidth,video.videoHeight]; }
  updateSourceTexture(){
    if(!this.video||this.video.readyState<2) return;
    if(this.video.currentTime===this.lastVideoTime && !this.video.srcObject) return;
    const gl=this.gl; this.lastVideoTime=this.video.currentTime; this.sourceRes=[this.video.videoWidth||640,this.video.videoHeight||480]; gl.bindTexture(gl.TEXTURE_2D,this.sourceTex); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
    try{gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,this.video);}catch{}
  }
  clearFeedback(){ const gl=this.gl; for(const t of this.feedback){ gl.bindFramebuffer(gl.FRAMEBUFFER,t.fbo); gl.viewport(0,0,t.w,t.h); gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT); } gl.bindFramebuffer(gl.FRAMEBUFFER,null); }
  setPower(on){ this.state.power=on; this.powerChanged=performance.now(); }
  degauss(){ this.degaussStarted=performance.now(); }
  render(){
    this.resize(); this.updateSourceTexture();
    const gl=this.gl,now=performance.now(),time=(now-this.start)/1000; this.frame++;
    const curr=this.feedback[this.feedbackIndex],prev=this.feedback[1-this.feedbackIndex];
    gl.bindVertexArray(this.vao); gl.disable(gl.BLEND);

    gl.useProgram(this.signalProgram); gl.bindFramebuffer(gl.FRAMEBUFFER,curr.fbo); gl.viewport(0,0,curr.w,curr.h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,this.sourceTex); this.set1i(this.signalProgram,'u_source',0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D,prev.tex); this.set1i(this.signalProgram,'u_previous',1);
    this.set2f(this.signalProgram,'u_resolution',curr.w,curr.h); this.set2f(this.signalProgram,'u_sourceRes',this.sourceRes[0],this.sourceRes[1]);
    this.set1f(this.signalProgram,'u_time',time); this.set1i(this.signalProgram,'u_frame',this.frame);
    for(const key of ['sourceMode','testPattern','signalType','fitMode']) this.set1i(this.signalProgram,`u_${key}`,this.state[key]);
    for(const key of ['signalStrength','noise','chromaBleed','lumaBlur','ghosting','dotCrawl','jitter','tracking','dropout','verticalRoll','persistence']) this.set1f(this.signalProgram,`u_${key}`,this.state[key]);
    this.set1i(this.signalProgram,'u_bypass',this.state.bypass?1:0); gl.drawArrays(gl.TRIANGLES,0,6);

    gl.useProgram(this.displayProgram); gl.bindFramebuffer(gl.FRAMEBUFFER,null); gl.viewport(0,0,this.canvas.width,this.canvas.height);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,curr.tex); this.set1i(this.displayProgram,'u_signal',0); this.set2f(this.displayProgram,'u_resolution',this.canvas.width,this.canvas.height); this.set1f(this.displayProgram,'u_time',time); this.set1i(this.displayProgram,'u_frame',this.frame);
    for(const key of ['maskType','resolutionMode','colorMode']) this.set1i(this.displayProgram,`u_${key}`,this.state[key]);
    for(const key of ['brightness','contrast','saturation','gamma','blackLevel','temperature','sharpness','scanlines','maskStrength','maskScale','bloom','halation','vignette','curvature','overscan','hSize','vSize','hPos','vPos','convergence','rotation','focus']) this.set1f(this.displayProgram,`u_${key}`,this.state[key]);
    this.set1i(this.displayProgram,'u_interlace',this.state.interlace?1:0); this.set1i(this.displayProgram,'u_power',this.state.power?1:0); this.set1f(this.displayProgram,'u_powerElapsed',(now-this.powerChanged)/1000);
    const degaussElapsed=this.degaussStarted<0?99:(now-this.degaussStarted)/1000; this.set1i(this.displayProgram,'u_degauss',degaussElapsed<1.25?1:0); this.set1f(this.displayProgram,'u_degaussElapsed',degaussElapsed);
    const warm=this.state.warmup?clamp((now-this.powerChanged)/12000,0,1):1; this.set1f(this.displayProgram,'u_warmup',this.state.power?warm:0); this.set1i(this.displayProgram,'u_bypass',this.state.bypass?1:0);
    gl.drawArrays(gl.TRIANGLES,0,6); gl.bindVertexArray(null);
    this.feedbackIndex=1-this.feedbackIndex;
  }
}
