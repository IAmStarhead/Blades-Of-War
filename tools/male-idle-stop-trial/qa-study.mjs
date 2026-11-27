// Checks the comparison page at local file and/or same-origin HTTP. This is a
// browser/codec and emulated-layout check, not physical-device validation.
// Usage: node qa-study.mjs [http://127.0.0.1:4365/male-idle-stop-trial/study.html]
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';import fs from 'node:fs';import path from 'node:path';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),dir=path.join(repo,'work/male-idle-stop-trial');
const target=process.argv[2]||pathToFileURL(path.join(dir,'study.html')).href,isFile=target.startsWith('file:'),origin=isFile?'':new URL(target).origin;
const require=createRequire(path.join(repo,'tools/character-showcase/package.json')),puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium').default;
const sha=b=>createHash('sha256').update(b).digest('hex'),errors=[],report={};
if(!isFile){const response=await fetch(target,{cache:'no-store'});assert.equal(response.status,200);
 assert.equal(sha(Buffer.from(await response.arrayBuffer())),sha(fs.readFileSync(path.join(dir,'study.html'))),'HTTP is serving another comparison page')}
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
 args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:180000});
try{
 const sizes=[[320,568],[390,844],[768,1024],[1280,800]],layouts=[];
 for(const [width,height] of sizes){
  const p=await browser.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await p.setViewport({width,height,deviceScaleFactor:1,isMobile:width<800,hasTouch:width<800});await p.setRequestInterception(true);
  p.on('request',r=>{const u=r.url(),ok=/^(file|data|blob):/.test(u)||(!isFile&&new URL(u).origin===origin);if(ok)r.continue();else{errors.push('Unexpected request '+u);r.abort()}});
  if(isFile)await p.setOfflineMode(true);await p.goto(target,{waitUntil:'load',timeout:60000});
  const info=await p.evaluate(()=>({docWidth:document.documentElement.scrollWidth,innerWidth,images:[...document.images].map(i=>({src:i.getAttribute('src'),ok:i.complete&&i.naturalWidth>0})),
   videos:[...document.querySelectorAll('video')].map(v=>({src:v.querySelector('source').getAttribute('src'),width:v.getBoundingClientRect().width})),
   header:['.brand strong','.top-link'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,right:r.right,height:r.height}}),
   links:[...document.querySelectorAll('a[href]')].map(a=>a.getAttribute('href'))}));
  assert.ok(info.docWidth<=width+1,`Overflow at ${width}x${height}`);assert.ok(info.images.every(i=>i.ok));assert.equal(info.videos.length,2);
  assert.ok(info.header[0].height<20&&info.header[0].right+3<=info.header[1].left,`Header wraps or overlaps at ${width}x${height}`);
  assert.ok(info.videos.every(v=>v.width>0&&v.width<=width));
  for(const href of info.links){if(href.startsWith('#')){assert.ok(await p.$(href),`Missing anchor ${href}`);continue}
   if(/^[a-z]+:/i.test(href))throw Error(`Unexpected link ${href}`);
   const f=path.resolve(dir,decodeURIComponent(href.split('#')[0]));assert.ok(fs.existsSync(f),`Missing file ${href}`);
  }
  layouts.push({width,height,documentWidth:info.docWidth,images:info.images.length,links:info.links.length});
  if(width===320&&process.env.QA_SCREENSHOT_DIR){await p.screenshot({path:path.join(process.env.QA_SCREENSHOT_DIR,'study-small.png')})}
  if(width===390&&process.env.QA_SCREENSHOT_DIR){await p.screenshot({path:path.join(process.env.QA_SCREENSHOT_DIR,'study-mobile.png'),fullPage:true})}
  if(width===1280&&process.env.QA_SCREENSHOT_DIR){await p.screenshot({path:path.join(process.env.QA_SCREENSHOT_DIR,'study-desktop.png'),fullPage:true})}
  if(width===1280){
   const videos=[];for(const [index,expected] of [[0,14],[1,56]]){
    await p.waitForFunction(i=>{const v=document.querySelectorAll('video')[i];return Number.isFinite(v.duration)&&v.readyState>=1},{timeout:60000},index);
    const result=await p.evaluate(async i=>{
     const v=document.querySelectorAll('video')[i];v.muted=true;await v.play();await new Promise((resolve,reject)=>{
       const end=setTimeout(()=>reject(Error('Playback did not progress')),15000),tick=()=>{if(v.currentTime>.1){clearTimeout(end);resolve()}else requestAnimationFrame(tick)};tick()});
     v.pause();await new Promise((resolve,reject)=>{const end=setTimeout(()=>reject(Error('Seek timed out')),15000);v.addEventListener('seeked',()=>{clearTimeout(end);resolve()},{once:true});v.currentTime=Math.min(v.duration-1,8)});
     return {duration:v.duration,currentTime:v.currentTime,readyState:v.readyState,videoWidth:v.videoWidth,videoHeight:v.videoHeight};
    },index);
    assert.ok(Math.abs(result.duration-expected)<.1&&result.currentTime>6&&result.videoWidth===960&&result.videoHeight===560,JSON.stringify(result));videos.push(result);
   }report.videos=videos;
  }
  await p.close();
 }
 if(!isFile){
  const response=await fetch(new URL('comparison.mp4',target),{headers:{Range:'bytes=100-199'}});
  assert.equal(response.status,206);assert.match(response.headers.get('content-range')||'',/^bytes 100-199\//);assert.equal((await response.arrayBuffer()).byteLength,100);
  report.range=true;
 }
 assert.deepEqual(errors,[]);report.layouts=layouts;
 const qa={status:'pass',transport:isFile?'local file with network disabled':'same-origin HTTP',studySha256:sha(fs.readFileSync(path.join(dir,'study.html'))),
  scope:'Emulated browser, video playback/seek and link checks; not proof of performance on a physical device.',results:report};
 fs.writeFileSync(path.join(dir,isFile?'qa-study-offline.json':'qa-study-http.json'),JSON.stringify(qa,null,2)+'\n');console.log(JSON.stringify(qa,null,2));
}finally{await browser.close()}
