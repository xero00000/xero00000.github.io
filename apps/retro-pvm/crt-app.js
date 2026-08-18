import { CRTAudio, CRTGL } from './renderer.js';
import { DEFAULT_STATE, PRESETS, CONTROL_GROUPS } from './presets.js';

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const STORAGE_KEY = 'xero-crt-lab-v2';

function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
function formatTime(sec){
  if(!Number.isFinite(sec)) return '00:00';
  const s=Math.max(0,Math.floor(sec));
  return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}
function downloadBlob(blob,name){
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1500);
}
function loadStoredState(){
  try{
    const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');
    if(raw && typeof raw==='object') return {...DEFAULT_STATE,...raw,power:true,bypass:false};
  }catch{}
  return {...DEFAULT_STATE};
}

class App {
  constructor(){
    this.state=loadStoredState(); this.audio=new CRTAudio(); this.video=$('#sourceVideo'); this.stream=null; this.objectURL=null; this.sourceType='test'; this.activePreset='pvm-rgb'; this.osdTimer=null; this.fpsFrames=0; this.fpsLast=performance.now(); this.lastFPS=60; this.suppressHotkeys=false;
    try{ this.renderer=new CRTGL($('#glcanvas'),this.state); }catch(err){ alert(err.message); throw err; }
    this.renderer.setVideo(this.video); this.bind(); this.buildControls(); this.buildPresets(); this.syncAllControls(); this.updateVisualState(); this.selectTest(0,false); this.loop();
  }
  bind(){
    $('#loadMediaBtn').addEventListener('click',()=>{this.audio.ensure();$('#mediaInput').click();});
    $('#mediaInput').addEventListener('change',e=>this.loadFile(e.target.files?.[0]));
    $('#cameraBtn').addEventListener('click',()=>this.useCamera());
    $('#testBtn').addEventListener('click',()=>this.selectTest(this.state.testPattern));
    $('#snowBtn').addEventListener('click',()=>this.selectSnow());
    $('#playBtn').addEventListener('click',()=>this.togglePlayback());
    $('#timeline').addEventListener('input',e=>{ if(this.video.duration) this.video.currentTime=(Number(e.target.value)/100)*this.video.duration; });
    $('#volume').addEventListener('input',e=>{this.video.volume=Number(e.target.value);});
    $('#powerBtn').addEventListener('click',()=>this.togglePower());
    $('#degaussBtn').addEventListener('click',()=>this.degauss());
    $('#bypassBtn').addEventListener('pointerdown',()=>this.setBypass(true));
    $('#bypassBtn').addEventListener('pointerup',()=>this.setBypass(false));
    $('#bypassBtn').addEventListener('pointerleave',()=>this.setBypass(false));
    $('#screenshotBtn').addEventListener('click',()=>this.screenshot());
    $('#fullscreenBtn').addEventListener('click',()=>this.toggleFullscreen());
    $('#resetBtn').addEventListener('click',()=>this.reset());
    $('#exportBtn').addEventListener('click',()=>this.exportSettings());
    $('#importBtn').addEventListener('click',()=>$('#settingsInput').click());
    $('#settingsInput').addEventListener('change',e=>this.importSettings(e.target.files?.[0]));
    $$('.tab').forEach(b=>b.addEventListener('click',()=>this.activateTab(b.dataset.tab)));
    document.addEventListener('keydown',e=>this.hotkey(e,true)); document.addEventListener('keyup',e=>this.hotkey(e,false));
    const stage=$('#screenStage');
    ['dragenter','dragover'].forEach(type=>stage.addEventListener(type,e=>{e.preventDefault();$('#dropHint').classList.add('show');}));
    ['dragleave','drop'].forEach(type=>stage.addEventListener(type,e=>{e.preventDefault();$('#dropHint').classList.remove('show');}));
    stage.addEventListener('drop',e=>this.loadFile(e.dataTransfer.files?.[0]));
    window.addEventListener('beforeunload',()=>this.stopStream());
    document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)document.body.classList.remove('crt-fullscreen');});
  }
  buildControls(){
    for(const [page,defs] of Object.entries(CONTROL_GROUPS)){
      const root=$(`#${page}Controls`);
      for(const def of defs){
        const row=document.createElement('div'); row.className='control-row'; row.dataset.key=def.key;
        if(def.type==='toggle'){
          row.innerHTML=`<div class="toggle"><span class="control-label">${def.label}</span><label class="toggle-switch"><input type="checkbox" data-control="${def.key}"><span class="toggle-track"></span></label></div>`;
        } else if(def.type==='select'){
          row.innerHTML=`<div class="control-row-head"><span class="control-label">${def.label}</span></div><select data-control="${def.key}">${def.options.map(([n,v])=>`<option value="${v}">${n}</option>`).join('')}</select>`;
        } else {
          row.innerHTML=`<div class="control-row-head"><span class="control-label">${def.label}</span><output class="control-value" data-value="${def.key}"></output></div><input type="range" min="${def.min}" max="${def.max}" step="${def.step}" data-control="${def.key}">`;
        }
        root.appendChild(row); const input=$(`[data-control="${def.key}"]`,row);
        input.addEventListener('input',()=>{
          const val=def.type==='toggle'?input.checked:Number(input.value); this.setState(def.key,val,def,false);
          if(def.key==='testPattern' && this.state.sourceMode===2) this.updateSourceMeta();
        });
        input.addEventListener('change',()=>this.saveState());
      }
    }
  }
  buildPresets(){
    const strip=$('#presetStrip');
    for(const p of PRESETS){
      const b=document.createElement('button'); b.className='preset-btn'; b.dataset.preset=p.id; b.innerHTML=`<strong>${p.name}</strong><span>${p.subtitle}</span>`;
      b.addEventListener('click',()=>this.applyPreset(p)); strip.appendChild(b);
    }
  }
  activateTab(name){ $$('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===name)); $$('.control-page').forEach(x=>x.classList.toggle('active',x.dataset.page===name)); }
  setState(key,val,def=null,show=true){
    this.state[key]=val; this.activePreset=null; this.updateControl(key,def); this.updateVisualState();
    if(show){ const label=def?.label||key; const formatted=def?.format?def.format(val):String(val); this.showOSD('ADJUST',label.toUpperCase(),formatted); }
    this.saveStateDebounced();
  }
  updateControl(key,def=null){
    const input=$(`[data-control="${key}"]`); if(input){ if(input.type==='checkbox') input.checked=!!this.state[key]; else input.value=this.state[key]; }
    const out=$(`[data-value="${key}"]`); if(out){ def ||= Object.values(CONTROL_GROUPS).flat().find(d=>d.key===key); out.value=def?.format?def.format(this.state[key]):String(this.state[key]); out.textContent=out.value; }
  }
  syncAllControls(){ for(const def of Object.values(CONTROL_GROUPS).flat()) this.updateControl(def.key,def); this.updatePresetButtons(); }
  updateVisualState(){
    document.documentElement.style.setProperty('--glare',this.state.glare); document.documentElement.style.setProperty('--room-glow',this.state.roomGlow);
    $('#powerDot').classList.toggle('off',!this.state.power); $('#signalLed').classList.toggle('off',!this.state.power); $('#bypassBtn').classList.toggle('active',this.state.bypass);
    this.audio.setVolume(this.state.power?this.state.humVolume:0);
    const names=['RGB','COMP','S-VIDEO','COMPOSITE','RF','VHS']; $('#signalLabel').textContent=names[this.state.signalType]||'RGB';
  }
  updatePresetButtons(){ $$('.preset-btn').forEach(b=>b.classList.toggle('active',b.dataset.preset===this.activePreset)); }
  applyPreset(p){ Object.assign(this.state,p.patch); this.activePreset=p.id; this.syncAllControls(); this.renderer.clearFeedback(); this.updateVisualState(); this.saveState(); this.showOSD('PRESET',p.name.toUpperCase(),p.subtitle.toUpperCase()); }
  reset(){ Object.assign(this.state,DEFAULT_STATE,{sourceMode:this.state.sourceMode,testPattern:this.state.testPattern}); this.activePreset=null; this.syncAllControls(); this.renderer.clearFeedback(); this.saveState(); this.showOSD('SYSTEM','FACTORY RESET','DEFAULT CRT CALIBRATION'); }
  saveStateDebounced(){ clearTimeout(this.saveTimer); this.saveTimer=setTimeout(()=>this.saveState(),180); }
  saveState(){ const clean={...this.state,power:true,bypass:false}; localStorage.setItem(STORAGE_KEY,JSON.stringify(clean)); }
  showOSD(kicker,main,sub=''){
    $('#osdKicker').textContent=kicker; $('#osdMain').textContent=main; $('#osdSub').textContent=sub; $('#osd').classList.add('show'); clearTimeout(this.osdTimer); this.osdTimer=setTimeout(()=>$('#osd').classList.remove('show'),1500);
  }
  stopStream(){ if(this.stream){this.stream.getTracks().forEach(t=>t.stop());this.stream=null;} }
  clearObjectURL(){ if(this.objectURL){URL.revokeObjectURL(this.objectURL);this.objectURL=null;} }
  async loadFile(file){
    if(!file)return; this.audio.ensure(); this.stopStream(); this.clearObjectURL();
    if(file.type.startsWith('image/')){
      this.video.pause();
      try{ const bmp=await createImageBitmap(file); this.renderer.setImage(bmp); this.sourceType='image'; this.state.sourceMode=0; $('#sourceName').textContent=file.name; $('#sourceResolution').textContent=`${bmp.width} × ${bmp.height}`; this.showOSD('INPUT','IMAGE',file.name.toUpperCase()); }
      catch{ this.showOSD('ERROR','IMAGE FAILED','UNSUPPORTED FORMAT'); return; }
    } else if(file.type.startsWith('video/')){
      this.objectURL=URL.createObjectURL(file); this.video.srcObject=null; this.video.src=this.objectURL; this.video.muted=false; this.video.volume=Number($('#volume').value); await this.video.play().catch(()=>{}); await new Promise(r=>{if(this.video.readyState>=1)r();else this.video.onloadedmetadata=()=>r();}); this.renderer.setVideo(this.video); this.sourceType='video'; this.state.sourceMode=0; $('#sourceName').textContent=file.name; $('#sourceResolution').textContent=`${this.video.videoWidth} × ${this.video.videoHeight}`; this.showOSD('INPUT','VIDEO',file.name.toUpperCase());
    } else { this.showOSD('ERROR','UNSUPPORTED MEDIA',file.type||'UNKNOWN'); return; }
    this.updateTransport(); this.saveState(); this.updateSourceStatus();
  }
  async useCamera(){
    this.audio.ensure(); if(!navigator.mediaDevices?.getUserMedia){this.showOSD('ERROR','CAMERA UNAVAILABLE','BROWSER DOES NOT EXPOSE GETUSERMEDIA');return;}
    try{
      this.stopStream();this.clearObjectURL();this.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});
      this.video.src=''; this.video.srcObject=this.stream; this.video.muted=true; await this.video.play(); this.renderer.setVideo(this.video); this.sourceType='camera';this.state.sourceMode=0; $('#sourceName').textContent='Live camera'; $('#sourceResolution').textContent=`${this.video.videoWidth||'—'} × ${this.video.videoHeight||'—'}`; this.showOSD('INPUT','LIVE CAMERA','REAL-TIME CRT PROCESSING');this.updateSourceStatus();
    }catch(err){this.showOSD('ERROR','CAMERA DENIED',err.name||'PERMISSION ERROR');}
  }
  selectTest(pattern=0,notify=true){ this.stopStream(); this.video.pause(); this.state.sourceMode=2; this.sourceType='test'; this.state.testPattern=Number(pattern); this.updateControl('testPattern',CONTROL_GROUPS.signal.find(d=>d.key==='testPattern')); this.updateSourceMeta(); this.updateSourceStatus(); if(notify)this.showOSD('INPUT','TEST PATTERN',this.testPatternName().toUpperCase()); }
  selectSnow(){ this.stopStream(); this.video.pause(); this.state.sourceMode=1; this.sourceType='snow'; $('#sourceName').textContent='RF snow generator'; $('#sourceResolution').textContent='procedural'; this.updateSourceStatus(); this.showOSD('INPUT','NO SIGNAL','RF NOISE'); }
  testPatternName(){ return ['SMPTE bars','Crosshatch','Grayscale','Multiburst','Color checker'][this.state.testPattern]||'SMPTE bars'; }
  updateSourceMeta(){ if(this.state.sourceMode===2){$('#sourceName').textContent=`Built-in ${this.testPatternName()}`;$('#sourceResolution').textContent='640 × 480';} }
  updateSourceStatus(){ const map={test:'TEST PATTERN',snow:'NO SIGNAL',image:'IMAGE',video:'VIDEO',camera:'CAMERA'}; $('#sourceStatus').textContent=map[this.sourceType]||'SOURCE'; }
  togglePlayback(){ if(this.sourceType!=='video')return; if(this.video.paused)this.video.play().catch(()=>{});else this.video.pause(); this.updateTransport(); }
  updateTransport(){
    const isVid=this.sourceType==='video',dur=isVid?this.video.duration:0,cur=isVid?this.video.currentTime:0; $('#currentTime').textContent=formatTime(cur);$('#durationTime').textContent=formatTime(dur);$('#timeline').value=dur?(cur/dur)*100:0;$('#timeline').disabled=!isVid;$('#playBtn').textContent=isVid&&!this.video.paused?'❚❚':'▶';$('#playBtn').disabled=!isVid;
  }
  togglePower(){ this.audio.ensure(); const on=!this.state.power; this.renderer.setPower(on); this.audio.chirp('power'); this.updateVisualState(); this.showOSD('POWER',on?'ON':'STANDBY',on?'CRT HEATER START':'RASTER COLLAPSE'); }
  degauss(){ if(!this.state.power)return;this.audio.chirp('degauss');this.renderer.degauss();this.showOSD('SERVICE','DEGAUSS','DEMAGNETIZING SHADOW MASK'); }
  setBypass(on){ this.state.bypass=on; this.updateVisualState(); }
  screenshot(){ this.renderer.render(); $('#glcanvas').toBlob(blob=>{if(blob)downloadBlob(blob,`crt-lab-${new Date().toISOString().replace(/[:.]/g,'-')}.png`);},'image/png'); this.showOSD('CAPTURE','FRAME SAVED','RENDERED CRT OUTPUT'); }
  toggleFullscreen(){
    const body=document.body;
    if(body.classList.contains('crt-fullscreen')){body.classList.remove('crt-fullscreen'); if(document.fullscreenElement)document.exitFullscreen?.();return;}
    body.classList.add('crt-fullscreen'); document.documentElement.requestFullscreen?.().catch(()=>{}); this.showOSD('VIEW','CRT FULLSCREEN','ESC TO EXIT');
  }
  exportSettings(){ const payload={format:'xero-crt-lab',version:2,created:new Date().toISOString(),state:{...this.state,power:true,bypass:false}}; downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),'crt-lab-settings.json'); this.showOSD('SETTINGS','EXPORTED','JSON PRESET FILE'); }
  async importSettings(file){
    if(!file)return; try{const data=JSON.parse(await file.text());const incoming=data.state||data;if(!incoming||typeof incoming!=='object')throw new Error();Object.assign(this.state,DEFAULT_STATE,incoming,{power:true,bypass:false});this.syncAllControls();this.renderer.clearFeedback();this.saveState();this.showOSD('SETTINGS','IMPORTED','CALIBRATION LOADED');}catch{this.showOSD('ERROR','IMPORT FAILED','INVALID CRT LAB JSON');}
  }
  hotkey(e,down){
    if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
    if(e.code==='KeyB'){this.setBypass(down);e.preventDefault();return;} if(!down||e.repeat)return;
    if(e.code==='Space'){this.togglePlayback();e.preventDefault();} else if(e.code==='KeyP')this.togglePower(); else if(e.code==='KeyD')this.degauss(); else if(e.code==='KeyS'){this.screenshot();e.preventDefault();}
  }
  loop(){
    this.renderer.render(); this.updateTransport(); this.fpsFrames++; const now=performance.now();
    if(now-this.fpsLast>=750){this.lastFPS=Math.round(this.fpsFrames*1000/(now-this.fpsLast));this.fpsFrames=0;this.fpsLast=now;$('#fpsLabel').textContent=`${this.lastFPS} FPS`;$('#renderLabel').textContent=`${this.renderer.canvas.width} × ${this.renderer.canvas.height}`;}
    requestAnimationFrame(()=>this.loop());
  }
}

window.addEventListener('DOMContentLoaded',()=>new App());
