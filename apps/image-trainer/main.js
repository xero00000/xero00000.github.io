'use strict';

function installHFUI(){
  if(document.querySelector('[data-source="hf"]'))return;
  const commonsTab=document.querySelector('[data-source="commons"]');
  const tab=document.createElement('button');
  tab.className='tab';
  tab.dataset.source='hf';
  tab.textContent='Hugging Face';
  commonsTab?.insertAdjacentElement('afterend',tab);

  const commons=$('#source-commons');
  commons?.insertAdjacentHTML('afterend',`
    <div id="source-hf" class="stack source" hidden>
      <div class="batch-card hf-card">
        <div class="batch-title"><div><strong>Hugging Face dataset</strong><span>Inspect or stream Dataset Viewer rows without downloading the whole dataset.</span></div><button class="primary" id="hfDiscover">Discover</button></div>
        <div class="row"><div class="field grow"><label>Dataset ID or URL</label><input id="hfDataset" type="text" placeholder="owner/dataset or https://huggingface.co/datasets/…"></div><div class="field token-field"><label>HF read token · optional</label><input id="hfToken" type="password" autocomplete="off" placeholder="hf_… for gated/private datasets"></div></div>
        <div class="row four"><div class="field"><label>Config / subset</label><select id="hfConfig" disabled></select></div><div class="field"><label>Split</label><select id="hfSplit" disabled></select></div><div class="field"><label>Image column</label><select id="hfImageColumn" disabled></select></div><div class="field"><label>Caption column</label><select id="hfCaptionColumn" disabled></select></div></div>
        <div class="row four"><div class="field"><label>Start row</label><input id="hfStart" type="number" min="0" step="1" value="0"></div><div class="field"><label>Max samples · 0 = all</label><input id="hfMaxSamples" type="number" min="0" step="1" value="1000"></div><div class="field"><label>Rows per request</label><select id="hfBatch"><option>25</option><option>50</option><option selected>100</option></select></div><div class="field"><label>Shuffle seed</label><input id="hfShuffleSeed" type="number" step="1" value="1"></div></div>
        <div class="row hf-options"><label class="check"><input type="checkbox" id="hfShuffle"> Shuffle streamed pages + rows</label><label class="check"><input type="checkbox" id="hfAppend"> Append loaded rows to queue</label></div>
        <div class="row"><button id="hfLoadQueue" disabled>Load rows to queue</button><button class="secondary" id="hfStreamTrain" disabled>Stream + train</button><button id="hfResume">Resume last position</button><button class="danger" id="hfStop" disabled>Stop HF</button></div>
        <div class="trainline"><i id="hfProgress"></i></div>
        <div class="import-status" id="hfStatus">Enter a public dataset ID, or add a read token for a dataset you can access. Tokens are kept only in page memory.</div>
        <div class="hint">Queue import is capped at 2,000 rows to keep the page responsive. <strong>Stream + train</strong> pages through the dataset in batches of up to 100 and can process much larger splits without materializing them in RAM.</div>
      </div>
    </div>`);

  if(!document.querySelector('style[data-hf-ui]')){
    const style=document.createElement('style');
    style.dataset.hfUi='true';
    style.textContent='.hf-card .token-field{flex:1 1 250px}.hf-card .import-status[data-tone="good"]{color:var(--accent)}.hf-card .import-status[data-tone="error"]{color:var(--danger)}.hf-options{align-items:center}.hf-card strong{color:var(--text)}@media(max-width:650px){.hf-card .row.four{grid-template-columns:1fr 1fr}.hf-card .row>button{flex:1 1 145px}.hf-card .token-field{flex-basis:100%}}@media(max-width:430px){.hf-card .row.four{grid-template-columns:1fr}}';
    document.head.appendChild(style);
  }
  const sup=document.querySelector('.brand h1 sup');if(sup)sup.textContent='3';
}

function loadClassicScript(src){
  return new Promise((resolve,reject)=>{
    const existing=[...document.scripts].find(s=>s.src&&new URL(s.src,location.href).pathname.endsWith('/'+src));
    if(existing){
      if(typeof bindHF==='function')return resolve();
      existing.addEventListener('load',resolve,{once:true});
      existing.addEventListener('error',()=>reject(new Error(`Failed to load ${src}`)),{once:true});
      return;
    }
    const script=document.createElement('script');
    script.src=src;
    script.onload=resolve;
    script.onerror=()=>reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function setSource(name){$$('.source').forEach(x=>x.hidden=x.id!=='source-'+name);$$('.tab').forEach(x=>x.classList.toggle('active',x.dataset.source===name))}

function bind(){
  $$('.tab').forEach(b=>b.onclick=()=>setSource(b.dataset.source));
  if(typeof bindHF==='function')bindHF();
  $('#searchBtn').onclick=searchCommons;$('#query').addEventListener('keydown',e=>{if(e.key==='Enter')searchCommons()});
  $('#chooseFolder').onclick=chooseFolder;$('#chooseImages').onclick=()=>$('#multiImageInput').click();
  $('#folderInput').onchange=e=>{const files=[...(e.target.files||[])],entries=files.map(file=>({file,path:file.webkitRelativePath||file.name}));importFileEntries(entries,files[0]?.webkitRelativePath?.split('/')[0]||'Folder dataset',$('#folderAppend').checked);e.target.value=''};
  $('#multiImageInput').onchange=e=>{const files=[...(e.target.files||[])],entries=files.map(file=>({file,path:file.name}));importFileEntries(entries,'Image batch',$('#folderAppend').checked);e.target.value=''};
  $('#videoInput').onchange=e=>prepareVideo(e.target.files?.[0]);$('#extractFrames').onclick=extractVideoFrames;$('#cancelExtract').onclick=()=>{extractionCancelled=true;$('#videoStatus').textContent='Cancelling after current frame…'};
  $('#useUrl').onclick=useDirect;$('#localFile').onchange=e=>{useLocalFile(e.target.files?.[0]);e.target.value=''};
  $('#skip').onclick=nextResult;$('#trainOnly').onclick=()=>trainSelected(false,false);$('#trainNext').onclick=()=>trainSelected(true,false);$('#trainQueue').onclick=()=>{if(!results.length||busy)return;selectResult(0);$('#autoSequence').checked=true;trainSelected(true,true)};$('#clearQueue').onclick=clearQueue;
  $('#stop').onclick=()=>{stopRequested=true;if(typeof cancelHF==='function'&&hfStreaming)cancelHF();$('#trainState').textContent='stopping…'};
  $('#generate').onclick=generate;$('#randomSeed').onclick=()=>{$('#seed').value=Math.floor(Math.random()*1e9);generate()};
  $('#saveBrowser').onclick=()=>saveBrowser(true);$('#loadBrowser').onclick=loadBrowser;$('#exportModel').onclick=async()=>{try{await model.save('downloads://xero-continual-image-model');saveMeta();log('Export started. Keep the JSON and BIN files together.')}catch(e){log('Export failed: '+e.message)}};$('#modelFiles').onchange=e=>loadModelFiles(e.target.files);
  $('#newModel').onclick=async()=>{if(busy||!confirm('Create a new random model? Your saved browser checkpoint is kept until you save over it.'))return;model?.dispose();model=buildModel();replay=[];trainedCount=0;history=[];losses=[];saveMeta();await clearReplayDB();updateStats();drawLoss();setState('new random model',true);log('Reset working session to a new random model.');await generate()};
  $('#clearHistory').onclick=()=>{history=[];losses=[];saveMeta();updateStats();drawLoss();log('Training history cleared; model weights and replay memory were kept.')};$('#lr').onchange=()=>{if(model)compileModel(model)};
  window.addEventListener('beforeunload',()=>{if(typeof cancelHF==='function')cancelHF();releaseItems(results);if(currentObjectUrl)URL.revokeObjectURL(currentObjectUrl);if(videoSourceUrl)URL.revokeObjectURL(videoSourceUrl)});
  window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>{if(!e.dataTransfer?.files?.length)return;e.preventDefault();const files=[...e.dataTransfer.files];if(files.length===1&&(files[0].type||'').startsWith('video/')){setSource('video');prepareVideo(files[0]);return}const imgs=files.filter(imageFileOkay);if(imgs.length){setSource('folder');importFileEntries(imgs.map(file=>({file,path:file.name})),'Dropped images',$('#folderAppend').checked)}});
}

async function boot(){
  installHFUI();
  try{
    await loadClassicScript('hf.js');
    if(typeof loadImageTensor==='function'&&!window.__xeroHFImageRefresh){
      const base=loadImageTensor;
      loadImageTensor=async function(item){if(item?.kind==='hf'&&typeof refreshHFItem==='function')await refreshHFItem(item);return base(item)};
      window.__xeroHFImageRefresh=true;
    }
  }catch(e){console.error(e);log('Hugging Face support failed to load: '+e.message)}
  bind();updateQueueUI();init();
}

boot();
