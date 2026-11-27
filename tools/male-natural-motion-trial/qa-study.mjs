// Offline/same-origin browser test for the optional research page. Does not
// evaluate artistic quality or substitute for testing a physical phone.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';import fs from 'node:fs';import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..'),out=path.join(repo,'work/male-natural-motion-trial');
const target=process.argv[2]||pathToFileURL(path.join(out,'index.html')).href,isFile=target.startsWith('file:'),origin=isFile?'':new URL(target).origin;
const studyUrl=new URL('study.html',target).href,sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const require=createRequire(import.meta.url),puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium').default;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
 args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:300000});
const errors=[],layouts=[];
try{
 for(const [width,height] of [[320,568],[390,844],[1100,750]]){
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.setViewport({width,height,deviceScaleFactor:1,isMobile:width<500,hasTouch:width<500});
  await page.setRequestInterception(true);page.on('request',r=>{const u=r.url(),ok=/^(file|data|blob):/i.test(u)||(!isFile&&new URL(u).origin===origin);
   if(ok)r.continue();else{errors.push('Unexpected external request '+u);r.abort()}});
  if(isFile)await page.setOfflineMode(true);
  await page.goto(studyUrl,{waitUntil:'load',timeout:60000});
  await page.waitForFunction("[...document.images].every(i=>i.complete&&i.naturalWidth>0) && document.querySelector('video').readyState>=1",{timeout:60000});
  const info=await page.evaluate(()=>{const video=document.querySelector('video');return {width:document.documentElement.scrollWidth,images:[...document.images].map(i=>({src:i.getAttribute('src'),width:i.naturalWidth})),duration:video.duration,readyState:video.readyState}});
  assert.ok(info.width<=width+1,`Overflow at ${width}x${height}`);assert.equal(info.images.length,4);assert.ok(info.images.every(i=>i.width>0));assert.ok(Math.abs(info.duration-22.5)<.2);
  await page.evaluate(()=>{document.querySelector('video').currentTime=9});
  await page.waitForFunction("Math.abs(document.querySelector('video').currentTime-9)<.15 && !document.querySelector('video').seeking",{timeout:30000});
  await page.evaluate(async()=>{const video=document.querySelector('video');video.muted=true;await video.play()});
  await page.waitForFunction("document.querySelector('video').currentTime>9.15",{timeout:30000});
  await page.evaluate(()=>document.querySelector('video').pause());
  layouts.push({width,height,images:info.images.length,duration:info.duration,seek:true,play:true});
  if(width===1100){await Promise.all([page.waitForNavigation({waitUntil:'load'}),page.click('header a')]);await page.waitForFunction('window.ready===true',{timeout:60000});
   await Promise.all([page.waitForNavigation({waitUntil:'load'}),page.click('.compare-link')]);assert.equal(page.url(),studyUrl)}
  await page.close();
 }
 let range=null;if(!isFile){
  const response=await fetch(new URL('movement.mp4',target),{headers:{Range:'bytes=0-31'}}),body=await response.arrayBuffer();
  range={status:response.status,contentRange:response.headers.get('content-range'),bytes:body.byteLength};
  assert.equal(range.status,206);assert.equal(range.bytes,32);assert.match(range.contentRange,/^bytes 0-31\/\d+$/);
 }
 assert.deepEqual(errors,[]);
 const report={status:'pass',transport:isFile?'local file with network disabled':'same-origin HTTP',htmlSha256:sha(path.join(out,'index.html')),
  studySha256:sha(path.join(out,'study.html')),videoSha256:sha(path.join(out,'movement.mp4')),layouts,range,
  scope:'Browser emulation and sampled local assets; external reference links not loaded offline.'};
 fs.writeFileSync(path.join(out,isFile?'qa-study-offline.json':'qa-study-http.json'),JSON.stringify(report,null,2)+'\n');
 console.log('PASS: research page, four local images, playable seekable video, navigation and layouts',JSON.stringify({layouts,range}));
}finally{await browser.close()}
