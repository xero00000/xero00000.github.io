'use strict';

const W=64,H=64,PROMPT=64,LATENT=32,INPUT=PROMPT+LATENT;
const MODEL_KEY='xero-continual-image-v2';
const LEGACY_MODEL_KEY='xero-continual-image-v1';
const META_KEY='xero-continual-image-meta-v2';
const LEGACY_META_KEY='xero-continual-image-meta-v1';
const REPLAY_DB='xero-continual-image-replay-v2';
const REPLAY_STORE='samples';
const REPLAY_MAX=16;

let model=null;
let results=[];
let selectedIndex=-1;
let selected=null;
let queueLabel='Training queue';
let replay=[];
let trainedCount=0;
let history=[];
let losses=[];
let stopRequested=false;
let busy=false;
let extractionCancelled=false;
let currentObjectUrl=null;
let videoSourceUrl=null;
let selectedVideoFile=null;

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const logEl=$('#log');

function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function log(msg){const t=new Date().toLocaleTimeString();logEl.textContent+=`\n[${t}] ${msg}`;logEl.scrollTop=logEl.scrollHeight}
function setState(text,good=false){$('#modelState').textContent='Model: '+text;$('#modelState').classList.toggle('good',good)}
function escapeHtml(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function cleanTitle(t){return String(t||'').replace(/^File:/,'').replace(/_/g,' ')}
function stripExt(name){return String(name||'').replace(/\.[^.]+$/,'')}
function naturalText(text){return cleanTitle(stripExt(text)).replace(/[\\/]+/g,' ').replace(/[-.]+/g,' ').replace(/\s+/g,' ').trim()}
function formatClock(sec){sec=Math.max(0,Number(sec)||0);const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=Math.floor(sec%60),ms=Math.floor((sec-Math.floor(sec))*1000);return h?`${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`:`${m}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`}
function hash32(str){let h=2166136261>>>0;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
function promptVector(text){const v=new Float32Array(PROMPT);const words=(String(text).toLowerCase().match(/[a-z0-9]+/g)||['']);for(const word of words){const h=hash32(word),idx=h%PROMPT,sign=(h&256)?1:-1;v[idx]+=sign;for(let i=0;i<word.length-1;i++){const bh=hash32(word.slice(i,i+2)+'#');v[bh%PROMPT]+=(bh&64?0.22:-0.22)}}const norm=Math.sqrt(v.reduce((s,x)=>s+x*x,0))||1;for(let i=0;i<v.length;i++)v[i]/=norm;return v}
function inputVector(prompt,seed=Math.random()*0xffffffff){const out=new Float32Array(INPUT);out.set(promptVector(prompt));const rng=typeof seed==='function'?seed:mulberry32((Number(seed)||hash32(String(seed)))>>>0);for(let i=0;i<LATENT;i++)out[PROMPT+i]=rng()*2-1;return out}

function buildModel(){const m=tf.sequential();m.add(tf.layers.dense({inputShape:[INPUT],units:8*8*64,activation:'relu',kernelInitializer:'glorotUniform'}));m.add(tf.layers.reshape({targetShape:[8,8,64]}));m.add(tf.layers.conv2dTranspose({filters:64,kernelSize:4,strides:2,padding:'same',activation:'relu'}));m.add(tf.layers.conv2dTranspose({filters:32,kernelSize:4,strides:2,padding:'same',activation:'relu'}));m.add(tf.layers.conv2dTranspose({filters:16,kernelSize:4,strides:2,padding:'same',activation:'relu'}));m.add(tf.layers.conv2d({filters:3,kernelSize:3,padding:'same',activation:'sigmoid'}));compileModel(m);return m}
function compileModel(m){const lr=clamp(Number($('#lr')?.value)||.001,.00001,.05);m.compile({optimizer:tf.train.adam(lr),loss:'meanSquaredError'})}

function openReplayDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(REPLAY_DB,1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(REPLAY_STORE))db.createObjectStore(REPLAY_STORE,{keyPath:'id'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function saveReplayDB(){try{const db=await openReplayDB();await new Promise((resolve,reject)=>{const tx=db.transaction(REPLAY_STORE,'readwrite'),store=tx.objectStore(REPLAY_STORE);store.clear();replay.forEach((entry,id)=>store.put({id,prompt:entry.prompt,pixels:entry.pixels}));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}catch(e){log('Replay save warning: '+e.message)}}
async function loadReplayDB(){try{const db=await openReplayDB();const rows=await new Promise((resolve,reject)=>{const tx=db.transaction(REPLAY_STORE,'readonly'),req=tx.objectStore(REPLAY_STORE).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error)});db.close();replay=rows.sort((a,b)=>a.id-b.id).slice(-REPLAY_MAX).map(row=>({prompt:String(row.prompt||''),pixels:row.pixels instanceof Float32Array?row.pixels:new Float32Array(row.pixels)}));updateStats()}catch(e){log('Replay load warning: '+e.message)}}
async function clearReplayDB(){try{const db=await openReplayDB();await new Promise((resolve,reject)=>{const tx=db.transaction(REPLAY_STORE,'readwrite');tx.objectStore(REPLAY_STORE).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}catch{}}

function saveMeta(){localStorage.setItem(META_KEY,JSON.stringify({trainedCount,history,losses}))}
function restoreMeta(){let m={};try{m=JSON.parse(localStorage.getItem(META_KEY)||localStorage.getItem(LEGACY_META_KEY)||'{}')}catch{}trainedCount=Number(m.trainedCount)||0;history=Array.isArray(m.history)?m.history:[];losses=Array.isArray(m.losses)?m.losses:[];updateStats();drawLoss()}

async function init(){try{
  if(navigator.gpu&&tf.findBackend('webgpu')){try{await tf.setBackend('webgpu');await tf.ready()}catch(e){log('WebGPU unavailable, falling back: '+e.message)}}
  if(tf.getBackend()!=='webgpu'){await tf.setBackend('webgl');await tf.ready()}
  $('#backend').textContent='Backend: '+tf.getBackend().toUpperCase();
  const known=await tf.io.listModels();
  const v2='indexeddb://'+MODEL_KEY,v1='indexeddb://'+LEGACY_MODEL_KEY;
  if(known[v2]){model=await tf.loadLayersModel(v2);compileModel(model);restoreMeta();await loadReplayDB();setState('browser checkpoint restored',true);log('Restored the v2 browser checkpoint and replay memory.');}
  else if(known[v1]){model=await tf.loadLayersModel(v1);compileModel(model);restoreMeta();setState('legacy checkpoint loaded',true);log('Loaded the previous browser checkpoint. Save once to migrate it to v2.');}
  else{model=buildModel();trainedCount=0;history=[];losses=[];replay=[];updateStats();drawLoss();setState('new random model',true);log('Ready. New compact generator created.');}
  tickMemory();await generate();
}catch(e){setState('error');log('Initialization failed: '+e.message);console.error(e)}}
function tickMemory(){try{$('#memory').textContent='Tensors: '+tf.memory().numTensors}catch{}setTimeout(tickMemory,1500)}
