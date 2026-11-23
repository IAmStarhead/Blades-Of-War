// Check the study page and byte-range video playback against a running preview.
// Start serve.mjs first. Optional argument: the full HTTP(S) URL of study.html.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const target=process.argv[2]||'http://127.0.0.1:4364/male-stealth-posture-trial/study.html',base=new URL(target);
if(!['http:','https:'].includes(base.protocol))throw Error('Pass an HTTP(S) study URL');
const video=new URL('comparison.mp4',base),original=fs.readFileSync(path.join(repo,'work/male-stealth-posture-trial/comparison.mp4'));
for(const [range,start,end] of [['bytes=1000-1999',1000,1999],['bytes=-64',original.length-64,original.length-1]]){
 const response=await fetch(video,{headers:{Range:range}});assert.equal(response.status,206,range);
 assert.equal(response.headers.get('content-range'),`bytes ${start}-${end}/${original.length}`);
 assert.deepEqual(Buffer.from(await response.arrayBuffer()),original.subarray(start,end+1),range);
}
assert.equal((await fetch(video,{headers:{Range:`bytes=${original.length+1}-`}})).status,416);
const require=createRequire(path.join(repo,'tools/character-showcase/package.json'));
const puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium').default;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
 args:[...chromium.args,'--disable-dev-shm-usage'],protocolTimeout:120000});
const errors=[];let checkedLinks=false;
try{
 for(const spec of [{name:'desktop',width:1365,height:900,mobile:false},
                    {name:'mobile portrait',width:390,height:844,mobile:true},
                    {name:'mobile landscape',width:844,height:390,mobile:true}]){
  const page=await browser.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`)});
  page.on('requestfailed',request=>{
   const failure=request.failure()?.errorText||'request failed';
   // Seeking or closing a page may deliberately cancel a pending MP4 range.
   if(!(failure==='net::ERR_ABORTED'&&request.url()===video.href))errors.push(`${failure} ${request.url()}`);
  });
  await page.setViewport({width:spec.width,height:spec.height,deviceScaleFactor:1,isMobile:spec.mobile,hasTouch:spec.mobile});
  const response=await page.goto(target,{waitUntil:'networkidle0',timeout:60000});assert.equal(response.status(),200);
  const data=await page.evaluate(async()=>{
   const images=[...document.querySelectorAll('img')];
   // Register load listeners before changing lazy images to eager. Calling
   // decode() immediately after changing loading can race source selection.
   const loaded=images.map(image=>image.complete&&image.naturalWidth?Promise.resolve():new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error(`Image timeout: ${image.src}`)),15000);
    image.addEventListener('load',()=>{clearTimeout(timer);resolve()},{once:true});
    image.addEventListener('error',()=>{clearTimeout(timer);reject(Error(`Image failed: ${image.src}`))},{once:true});
   }));
   images.forEach(image=>{image.loading='eager'});await Promise.all(loaded);
   return {width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,
    images:images.length,missingAlt:images.filter(x=>!x.getAttribute('alt')).length,
    links:[...new Set([...document.querySelectorAll('a[href],source[src],img[src]')]
      .map(x=>x.getAttribute('href')||x.getAttribute('src')).filter(x=>x&&!x.startsWith('#')))]};
  });
  assert.ok(data.scrollWidth<=data.width,`${spec.name} overflows horizontally`);
  assert.equal(data.images,3);assert.equal(data.missingAlt,0);
  if(!checkedLinks){
   for(const ref of data.links){const url=new URL(ref,base);if(url.origin!==base.origin)continue;
    const r=await fetch(url,{method:'HEAD'});assert.equal(r.status,200,`${ref}: HTTP ${r.status}`);
   }checkedLinks=true;
   const state=await page.evaluate(async()=>{
    const v=document.querySelector('video');
    if(v.readyState<1)await new Promise((resolve,reject)=>{v.addEventListener('loadedmetadata',resolve,{once:true});v.addEventListener('error',reject,{once:true});setTimeout(()=>reject(Error('Metadata timeout')),15000)});
    v.muted=true;await v.play();await new Promise(resolve=>setTimeout(resolve,500));const played=v.currentTime;
    const seeked=new Promise((resolve,reject)=>{v.addEventListener('seeked',resolve,{once:true});v.addEventListener('error',reject,{once:true});setTimeout(()=>reject(Error('Seek timeout')),10000)});
    v.currentTime=10;await seeked;v.pause();return {duration:v.duration,played,position:v.currentTime};
   });
   assert.equal(state.duration,18);assert.ok(state.played>0);assert.ok(Math.abs(state.position-10)<.5);
   console.log(`PASS: ${data.links.length} local resources; video plays and seeks to ${state.position.toFixed(2)} s.`);
  }
  console.log(`PASS: ${spec.name}, ${data.images} images; no horizontal overflow.`);await page.close();
 }
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close()}
