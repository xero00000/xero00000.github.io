'use strict';

function setSource(name){$$('.source').forEach(x=>x.hidden=x.id!=='source-'+name);$$('.tab').forEach(x=>x.classList.toggle('active',x.dataset.source===name))}
function bind(){
  $$('.tab').forEach(b=>b.onclick=()=>setSource(b.dataset.source));
  $('#searchBtn').onclick=searchCommons;$('#query').addEventListener('keydown',e=>{if(e.key==='Enter')searchCommons()});
  $('#chooseFolder').onclick=chooseFolder;$('#chooseImages').onclick=()=>$('#multiImageInput').click();
  $('#folderInput').onchange=e=>{const files=[...(e.target.files||[])],entries=files.map(file=>({file,path:file.webkitRelativePath||file.name}));importFileEntries(entries,files[0]?.webkitRelativePath?.split('/')[0]||'Folder dataset',$('#folderAppend').checked);e.target.value=''};
  $('#multiImageInput').onchange=e=>{const files=[...(e.target.files||[])],entries=files.map(file=>({file,path:file.name}));importFileEntries(entries,'Image batch',$('#folderAppend').checked);e.target.value=''};
  $('#videoInput').onchange=e=>prepareVideo(e.target.files?.[0]);$('#extractFrames').onclick=extractVideoFrames;$('#cancelExtract').onclick=()=>{extractionCancelled=true;$('#videoStatus').textContent='Cancelling after current frame…'};
  $('#useUrl').onclick=useDirect;$('#localFile').onchange=e=>{useLocalFile(e.target.files?.[0]);e.target.value=''};
  $('#skip').onclick=nextResult;$('#trainOnly').onclick=()=>trainSelected(false,false);$('#trainNext').onclick=()=>trainSelected(true,false);$('#trainQueue').onclick=()=>{if(!results.length||busy)return;selectResult(0);$('#autoSequence').checked=true;trainSelected(true,true)};$('#clearQueue').onclick=clearQueue;
  $('#stop').onclick=()=>{stopRequested=true;$('#trainState').textContent='stopping…'};
  $('#generate').onclick=generate;$('#randomSeed').onclick=()=>{$('#seed').value=Math.floor(Math.random()*1e9);generate()};
  $('#saveBrowser').onclick=()=>saveBrowser(true);$('#loadBrowser').onclick=loadBrowser;$('#exportModel').onclick=async()=>{try{await model.save('downloads://xero-continual-image-model');saveMeta();log('Export started. Keep the JSON and BIN files together.')}catch(e){log('Export failed: '+e.message)}};$('#modelFiles').onchange=e=>loadModelFiles(e.target.files);
  $('#newModel').onclick=async()=>{if(busy||!confirm('Create a new random model? Your saved browser checkpoint is kept until you save over it.'))return;model?.dispose();model=buildModel();replay=[];trainedCount=0;history=[];losses=[];saveMeta();await clearReplayDB();updateStats();drawLoss();setState('new random model',true);log('Reset working session to a new random model.');await generate()};
  $('#clearHistory').onclick=()=>{history=[];losses=[];saveMeta();updateStats();drawLoss();log('Training history cleared; model weights and replay memory were kept.')};$('#lr').onchange=()=>{if(model)compileModel(model)};
  window.addEventListener('beforeunload',()=>{releaseItems(results);if(currentObjectUrl)URL.revokeObjectURL(currentObjectUrl);if(videoSourceUrl)URL.revokeObjectURL(videoSourceUrl)});
  window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>{if(!e.dataTransfer?.files?.length)return;e.preventDefault();const files=[...e.dataTransfer.files];if(files.length===1&&(files[0].type||'').startsWith('video/')){setSource('video');prepareVideo(files[0]);return}const imgs=files.filter(imageFileOkay);if(imgs.length){setSource('folder');importFileEntries(imgs.map(file=>({file,path:file.name})),'Dropped images',$('#folderAppend').checked)}});
}

bind();updateQueueUI();init();
