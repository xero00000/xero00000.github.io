'use strict';

const HF_API='https://datasets-server.huggingface.co';
const HF_PROGRESS_KEY='xero-image-trainer-hf-progress-v1';
let hfDatasetId='';
let hfSplits=[];
let hfFeatures=[];
let hfTotalRows=0;
let hfLicense='';
let hfCancelled=false;
let hfStreaming=false;
let hfAbortController=null;
let hfResumeState=null;

function normalizeHFDatasetId(value){
  let text=String(value||'').trim();
  if(!text)throw new Error('Enter a Hugging Face dataset ID or URL.');
  if(/^https?:\/\//i.test(text)){
    const url=new URL(text);
    const marker='/datasets/';
    const i=url.pathname.indexOf(marker);
    if(i<0)throw new Error('That URL is not a Hugging Face dataset URL.');
    text=decodeURIComponent(url.pathname.slice(i+marker.length));
    text=text.split('/tree/')[0].split('/blob/')[0].split('/resolve/')[0];
    const parts=text.split('/').filter(Boolean);
    if(parts.length>=2)text=parts.slice(0,2).join('/');
  }
  text=text.replace(/^datasets\//,'').replace(/^\/+|\/+$/g,'').split(/[?#]/)[0];
  if(!text||!text.includes('/'))throw new Error('Use a dataset ID such as owner/dataset.');
  return text;
}
function hfToken(){return String($('#hfToken')?.value||'').trim()}
function hfHeaders(){const token=hfToken();return token?{Authorization:`Bearer ${token}`}:{}}
async function hfJSON(endpoint,params={},signal=null){
  const url=new URL(HF_API+endpoint);for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null&&v!=='')url.searchParams.set(k,String(v));
  let response;
  try{response=await fetch(url,{headers:hfHeaders(),signal})}catch(e){if(e.name==='AbortError')throw e;throw new Error('Could not reach Hugging Face Dataset Viewer: '+e.message)}
  let body=null;try{body=await response.json()}catch{}
  if(!response.ok){const detail=body?.error||body?.message||body?.detail||response.statusText;let hint='';if(response.status===401||response.status===403)hint=' This dataset may be gated/private; enter a read token with access.';if(response.status===404)hint=' Check the dataset ID, config, and split.';throw new Error(`HF ${response.status}: ${detail||'request failed'}.${hint}`)}
  return body||{};
}
function hfStatus(text,tone=''){$('#hfStatus').textContent=text;$('#hfStatus').dataset.tone=tone}
function hfSetProgress(value){$('#hfProgress').style.width=(clamp(Number(value)||0,0,1)*100).toFixed(1)+'%'}
function hfSetBusy(on){
  hfStreaming=on;
  for(const id of ['hfDiscover','hfLoadQueue','hfStreamTrain','hfResume']){const el=$('#'+id);if(el)el.disabled=on}
  $('#hfStop').disabled=!on;
  if(on){for(const id of ['trainOnly','trainNext','trainQueue','clearQueue']){const el=$('#'+id);if(el)el.disabled=true}}
  else if(typeof updateBusyUI==='function'){updateBusyUI();showSelected?.()}
}
function hfFeatureHasImage(type){if(!type||typeof type!=='object')return false;if(type._type==='Image')return true;return Object.values(type).some(v=>Array.isArray(v)?v.some(x=>hfFeatureHasImage(x)):hfFeatureHasImage(v))}
function hfFeatureIsString(type){return type?._type==='Value'&&String(type.dtype||'').toLowerCase()==='string'}
function hfFindImage(value){
  if(!value)return null;
  if(typeof value==='object'&&typeof value.src==='string')return value;
  if(Array.isArray(value)){for(const child of value){const found=hfFindImage(child);if(found)return found}}
  else if(typeof value==='object'){for(const child of Object.values(value)){const found=hfFindImage(child);if(found)return found}}
  return null;
}
function hfCaptionValue(value){
  if(value==null)return'';if(typeof value==='string')return value.trim();if(typeof value==='number'||typeof value==='boolean')return String(value);
  if(Array.isArray(value)){const parts=value.map(hfCaptionValue).filter(Boolean).slice(0,6);return parts.join(', ')}
  return'';
}
function hfPickCaptionColumn(features,rows){
  const strings=features.filter(f=>hfFeatureIsString(f.type)).map(f=>f.name);const priority=['caption','text','prompt','description','title','name','label'];
  for(const wanted of priority){const hit=strings.find(name=>String(name).toLowerCase()===wanted);if(hit)return hit}
  if(strings.length)return strings[0];
  const sample=rows?.[0]?.row||{};return Object.keys(sample).find(key=>typeof sample[key]==='string')||'';
}
function hfPopulateSelect(select,values,selected){select.innerHTML='';for(const value of values){const option=document.createElement('option');option.value=value.value??value;option.textContent=value.label??value;if(String(option.value)===String(selected))option.selected=true;select.appendChild(option)}select.disabled=!values.length}
function hfUpdateSplitOptions(preferred=''){
  const config=$('#hfConfig').value;const splits=[...new Set(hfSplits.filter(x=>x.config===config).map(x=>x.split))];hfPopulateSelect($('#hfSplit'),splits,preferred&&splits.includes(preferred)?preferred:(splits.includes('train')?'train':splits[0]));
}
function hfCurrentSpec(){return{dataset:hfDatasetId||normalizeHFDatasetId($('#hfDataset').value),config:$('#hfConfig').value,split:$('#hfSplit').value,image:$('#hfImageColumn').value,caption:$('#hfCaptionColumn').value}}
async function discoverHF(preferredConfig='',preferredSplit=''){
  if(hfStreaming)return;hfCancelled=false;hfSetProgress(0);hfStatus('Discovering dataset…');$('#hfDiscover').disabled=true;
  try{
    hfDatasetId=normalizeHFDatasetId($('#hfDataset').value);$('#hfDataset').value=hfDatasetId;
    const data=await hfJSON('/splits',{dataset:hfDatasetId});hfSplits=Array.isArray(data.splits)?data.splits:[];
    if(!hfSplits.length){const failure=data.failed?.[0]?.error||data.pending?.length&&'Dataset preparation is still pending.';throw new Error(failure||'Dataset Viewer returned no available splits.')}
    const configs=[...new Set(hfSplits.map(x=>x.config))];const chosen=preferredConfig&&configs.includes(preferredConfig)?preferredConfig:(configs.includes('default')?'default':configs[0]);hfPopulateSelect($('#hfConfig'),configs,chosen);hfUpdateSplitOptions(preferredSplit);
    await inspectHFSplit();
    log(`Hugging Face dataset ready: ${hfDatasetId} · ${$('#hfConfig').value}/${$('#hfSplit').value}.`);
  }catch(e){hfStatus(e.message,'error');log('HF discovery failed: '+e.message);console.error(e)}finally{$('#hfDiscover').disabled=false}
}
async function inspectHFSplit(){
  if(!hfDatasetId)return;const config=$('#hfConfig').value,split=$('#hfSplit').value;if(!config||!split)return;hfStatus('Inspecting columns and row count…');
  try{
    const [rowsData,infoData]=await Promise.all([
      hfJSON('/rows',{dataset:hfDatasetId,config,split,offset:0,length:8}),
      hfJSON('/info',{dataset:hfDatasetId,config}).catch(()=>({}))
    ]);
    hfFeatures=Array.isArray(rowsData.features)?rowsData.features:[];hfTotalRows=Number(rowsData.num_rows_total)||0;hfLicense=String(infoData?.dataset_info?.license||'').trim();
    const sampleRows=rowsData.rows||[],sample=sampleRows[0]?.row||{};
    let imageCols=hfFeatures.filter(f=>hfFeatureHasImage(f.type)).map(f=>f.name);for(const [key,value] of Object.entries(sample))if(hfFindImage(value)&&!imageCols.includes(key))imageCols.push(key);
    if(!imageCols.length)imageCols=Object.keys(sample);
    const captionCols=hfFeatures.filter(f=>hfFeatureIsString(f.type)).map(f=>f.name);for(const [key,value] of Object.entries(sample))if(typeof value==='string'&&!captionCols.includes(key))captionCols.push(key);
    const imageDefault=imageCols.find(x=>/^(image|img|photo|picture|pixel_values)$/i.test(x))||imageCols[0]||'';
    const captionDefault=hfPickCaptionColumn(hfFeatures,sampleRows);
    hfPopulateSelect($('#hfImageColumn'),imageCols.map(x=>{const feature=hfFeatures.find(f=>f.name===x);return{value:x,label:x+(feature&&hfFeatureHasImage(feature.type)?' · Image':'')}}),imageDefault);
    hfPopulateSelect($('#hfCaptionColumn'),[{value:'__auto__',label:'Auto-detect caption'},{value:'__none__',label:'No caption column'},...captionCols.map(x=>({value:x,label:x}))],captionDefault||'__auto__');
    $('#hfStart').max=Math.max(0,hfTotalRows-1);const licenseText=hfLicense?` · license ${hfLicense}`:'';hfStatus(`${hfTotalRows.toLocaleString()} rows · ${imageCols.length} image candidate${imageCols.length===1?'':'s'}${licenseText}`,'good');$('#hfLoadQueue').disabled=!imageCols.length;$('#hfStreamTrain').disabled=!imageCols.length;
  }catch(e){hfFeatures=[];hfTotalRows=0;hfStatus(e.message,'error');$('#hfLoadQueue').disabled=true;$('#hfStreamTrain').disabled=true;throw e}
}
function hfCaptionForRow(row,spec,rowIndex){
  const selected=spec.caption;if(selected==='__none__')return `${spec.dataset} row ${rowIndex}`;
  if(selected&&selected!=='__auto__'){const text=hfCaptionValue(row[selected]);if(text)return text}
  const auto=hfPickCaptionColumn(hfFeatures,[{row}]);if(auto){const text=hfCaptionValue(row[auto]);if(text)return text}
  return `${spec.dataset} row ${rowIndex}`;
}
function hfRowsToItems(data,spec){
  const out=[];for(const record of data.rows||[]){const row=record.row||{},image=hfFindImage(row[spec.image]);if(!image?.src)continue;const rowIndex=Number(record.row_idx);out.push({title:`${spec.dataset} · row ${rowIndex}`,caption:hfCaptionForRow(row,spec,rowIndex),url:image.src,width:image.width,height:image.height,source:`https://huggingface.co/datasets/${spec.dataset}`,license:hfLicense||'check dataset license',kind:'hf',hf:{dataset:spec.dataset,config:spec.config,split:spec.split,rowIndex,image:spec.image,caption:spec.caption}})}return out
}
async function hfFetchRows(offset,length,spec=hfCurrentSpec(),signal=null){return hfJSON('/rows',{dataset:spec.dataset,config:spec.config,split:spec.split,offset,length:Math.min(100,Math.max(1,length))},signal)}
async function refreshHFItem(item){
  if(!item?.hf)return item;const meta=item.hf;const spec={dataset:meta.dataset,config:meta.config,split:meta.split,image:meta.image,caption:meta.caption};
  try{const data=await hfFetchRows(meta.rowIndex,1,spec);const fresh=hfRowsToItems(data,spec)[0];if(fresh){item.url=fresh.url;item.width=fresh.width;item.height=fresh.height;item.caption=fresh.caption;return item}}catch(e){log(`HF row ${meta.rowIndex} refresh warning: ${e.message}`)}return item
}
async function loadHFQueue(){
  if(hfStreaming||!hfDatasetId)return;hfCancelled=false;hfAbortController=new AbortController();hfSetBusy(true);const spec=hfCurrentSpec(),start=clamp(Math.floor(Number($('#hfStart').value)||0),0,Math.max(0,hfTotalRows-1)),rawRequested=Math.floor(Number($('#hfMaxSamples').value)||0),requested=rawRequested>0?rawRequested:(hfTotalRows-start),count=Math.min(2000,requested,hfTotalRows-start),batch=clamp(Math.floor(Number($('#hfBatch').value)||100),1,100),items=[];let visited=0;
  try{hfStatus(`Loading ${count.toLocaleString()} rows into the queue…`);for(let offset=start;offset<start+count&&!hfCancelled;offset+=batch){const len=Math.min(batch,start+count-offset),data=await hfFetchRows(offset,len,spec,hfAbortController.signal),chunk=hfRowsToItems(data,spec);items.push(...chunk);visited+=len;hfSetProgress(visited/count);hfStatus(`Loaded ${visited.toLocaleString()} / ${count.toLocaleString()} rows · ${items.length.toLocaleString()} usable images`);await new Promise(requestAnimationFrame)}if(hfCancelled)return;setQueue(items,`Hugging Face · ${spec.dataset} · ${spec.split}`,$('#hfAppend').checked);hfStatus(`Queue ready: ${items.length.toLocaleString()} images from ${visited.toLocaleString()} rows${requested>2000?' · queue import capped at 2,000; use Stream + train for more':''}.`,'good');setSource('hf')}catch(e){if(e.name!=='AbortError'){hfStatus(e.message,'error');log('HF queue load failed: '+e.message)}}finally{hfAbortController=null;hfSetBusy(false);hfSetProgress(0)}
}
function hfSeededShuffle(array,seed){const rng=mulberry32(seed>>>0);for(let i=array.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[array[i],array[j]]=[array[j],array[i]]}return array}
function saveHFProgress(data){try{localStorage.setItem(HF_PROGRESS_KEY,JSON.stringify({...data,time:Date.now()}))}catch{}}
function loadHFProgress(){try{return JSON.parse(localStorage.getItem(HF_PROGRESS_KEY)||'null')}catch{return null}}
async function resumeHF(){
  const p=loadHFProgress();if(!p?.dataset){hfStatus('No saved Hugging Face stream position on this device.','error');return}
  hfResumeState=p;$('#hfDataset').value=p.dataset;$('#hfStart').value=Number(p.start)||Number(p.nextRow)||0;$('#hfMaxSamples').value=Number.isFinite(Number(p.maxSamples))?Number(p.maxSamples):1000;$('#hfBatch').value=String(p.batch||100);$('#hfShuffle').checked=!!p.shuffle;$('#hfShuffleSeed').value=p.seed??1;
  await discoverHF(p.config,p.split);
  const page=(Number(p.pageCursor)||0)+1;hfStatus(`Resume state restored · page ${page} · ${Number(p.processed||0).toLocaleString()} images already trained.`,'good');
}
function hfResumeMatches(p,spec,start,maxInput,batch,shuffle,seed){return !!p&&p.dataset===spec.dataset&&p.config===spec.config&&p.split===spec.split&&Number(p.start)===start&&Number(p.maxSamples)===maxInput&&Number(p.batch)===batch&&!!p.shuffle===shuffle&&Number(p.seed)===seed}
async function trainHFStream(){
  if(busy||hfStreaming||!model||!hfDatasetId)return;
  const spec=hfCurrentSpec(),start=clamp(Math.floor(Number($('#hfStart').value)||0),0,Math.max(0,hfTotalRows-1)),maxInput=Math.floor(Number($('#hfMaxSamples').value)||0),target=Math.max(0,Math.min(maxInput>0?maxInput:hfTotalRows-start,hfTotalRows-start)),batch=clamp(Math.floor(Number($('#hfBatch').value)||100),1,100),shuffle=$('#hfShuffle').checked,seed=(Number($('#hfShuffleSeed').value)||hash32(`${spec.dataset}/${spec.config}/${spec.split}`))>>>0;
  if(!target){hfStatus('Nothing to train in the selected row range.','error');return}
  hfCancelled=false;stopRequested=false;hfAbortController=new AbortController();hfSetBusy(true);busy=true;$('#stop').disabled=false;$('#trainState').textContent='HF streaming';updateBusyUI();
  const allOffsets=[];for(let offset=start;offset<start+target;offset+=batch)allOffsets.push(offset);if(shuffle)hfSeededShuffle(allOffsets,seed);
  const resume=hfResumeMatches(hfResumeState,spec,start,maxInput,batch,shuffle,seed)?hfResumeState:null;
  let pageCursor=resume?clamp(Math.floor(Number(resume.pageCursor)||0),0,allOffsets.length):0,rowCursor=resume?Math.max(0,Math.floor(Number(resume.rowCursor)||0)):0,processed=resume?Math.max(0,Math.floor(Number(resume.processed)||0)):0,visited=resume?Math.max(0,Math.floor(Number(resume.visited)||0)):0,missing=resume?Math.max(0,Math.floor(Number(resume.missing)||0)):0;
  hfResumeState=null;
  try{
    hfStatus(`${resume?'Resuming':'Streaming'} ${target.toLocaleString()} rows from ${spec.dataset}…`);log(`HF stream training ${resume?'resumed':'started'}: ${spec.dataset} · ${spec.config}/${spec.split} · ${target} rows${shuffle?' · deterministic shuffle':''}.`);
    for(let oi=pageCursor;oi<allOffsets.length;oi++){
      if(stopRequested||hfCancelled)break;const offset=allOffsets[oi],len=Math.min(batch,start+target-offset),data=await hfFetchRows(offset,len,spec,hfAbortController.signal);let items=hfRowsToItems(data,spec);const pageMissing=Math.max(0,(data.rows||[]).length-items.length);if(shuffle)hfSeededShuffle(items,hash32(`${seed}:${offset}`));
      const firstItem=oi===pageCursor?Math.min(rowCursor,items.length):0;
      if(oi!==pageCursor||!resume){visited+=len;missing+=pageMissing}else if(!resume.visited){visited+=len;missing+=pageMissing}
      for(let ii=firstItem;ii<items.length;ii++){
        if(stopRequested||hfCancelled)break;const item=items[ii],ok=await trainOne(item);if(!ok)break;processed++;
        const progressRows=Math.min(target,Math.max(visited,Math.min(target,(oi+1)*batch)));hfSetProgress(progressRows/target);hfStatus(`HF training · ${processed.toLocaleString()} images trained · page ${oi+1}/${allOffsets.length}${missing?` · ${missing} rows without usable image`:''}`);
        saveHFProgress({dataset:spec.dataset,config:spec.config,split:spec.split,start,maxSamples:maxInput,batch,shuffle,seed,pageCursor:oi,rowCursor:ii+1,processed,visited,missing,nextRow:shuffle?start:Math.min(start+target,offset+ii+1)});await tf.nextFrame()
      }
      rowCursor=0;pageCursor=oi+1;
      saveHFProgress({dataset:spec.dataset,config:spec.config,split:spec.split,start,maxSamples:maxInput,batch,shuffle,seed,pageCursor,rowCursor:0,processed,visited,missing,nextRow:shuffle?start:Math.min(start+target,offset+len)});
    }
    if(stopRequested||hfCancelled){hfStatus(`HF stream stopped after ${processed.toLocaleString()} trained images. Use Resume last position to continue.`);log('HF stream stopped; exact page/row resume state saved.')}else{hfStatus(`HF stream complete: ${processed.toLocaleString()} images trained.`,'good');saveHFProgress({dataset:spec.dataset,config:spec.config,split:spec.split,start,maxSamples:maxInput,batch,shuffle,seed,pageCursor:allOffsets.length,rowCursor:0,processed,visited,missing,nextRow:start+target,complete:true});log(`HF stream complete: ${processed} images trained.`)}
  }catch(e){if(e.name!=='AbortError'){hfStatus(e.message,'error');log('HF streaming failed: '+e.message);console.error(e)}}finally{busy=false;hfAbortController=null;hfSetBusy(false);$('#stop').disabled=true;$('#trainState').textContent=stopRequested?'stopped':'idle';$('#progress').style.width='0%';hfSetProgress(0);updateBusyUI();showSelected()}
}
function cancelHF(){hfCancelled=true;if(hfStreaming)stopRequested=true;hfAbortController?.abort();hfStatus('Stopping Hugging Face operation…')}
function bindHF(){
  $('#hfDiscover').onclick=()=>discoverHF();$('#hfConfig').onchange=()=>{hfUpdateSplitOptions();inspectHFSplit().catch(()=>{})};$('#hfSplit').onchange=()=>inspectHFSplit().catch(()=>{});$('#hfLoadQueue').onclick=loadHFQueue;$('#hfStreamTrain').onclick=trainHFStream;$('#hfStop').onclick=cancelHF;$('#hfResume').onclick=resumeHF;$('#hfDataset').addEventListener('keydown',e=>{if(e.key==='Enter')discoverHF()});
}
