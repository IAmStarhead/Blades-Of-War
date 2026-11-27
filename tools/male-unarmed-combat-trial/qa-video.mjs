// Verify the optional three-view video is the file linked by this scene,
// plays/seeks offline and over HTTP. Emulation is not a physical-phone test.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';import fs from 'node:fs';import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..'),out=path.join(repo,'work/male-unarmed-combat-trial');
const scene=process.argv[2]||pathToFileURL(path.join(out,'index.html')).href,isFile=scene.startsWith('file:'),video=path.join(out,'combat-preview.mp4');
const hash=b=>createHash('sha256').update(b).digest('hex'),htmlHash=hash(fs.readFileSync(path.join(out,'index.html'))),videoHash=hash(fs.readFileSync(video));
let resolvedScene=scene;
if(!isFile){const pageResponse=await fetch(scene);assert.equal(pageResponse.status,200);resolvedScene=pageResponse.url;assert.equal(hash(Buffer.from(await pageResponse.arrayBuffer())),htmlHash);
 const response=await fetch(new URL('combat-preview.mp4',resolvedScene),{headers:{Range:'bytes=0-63'}});assert.equal(response.status,206);assert.match(response.headers.get('content-range'),/^bytes 0-63\//);assert.equal((await response.arrayBuffer()).byteLength,64)}
const require=createRequire(import.meta.url),puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium').default;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
 args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:300000});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>m.type()==='error'&&errors.push(m.text()));
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});if(isFile)await page.setOfflineMode(true);
 await page.goto(scene,{waitUntil:'load',timeout:60000});await page.waitForFunction('window.ready===true');
 const href=await page.$eval('a.compare-link',a=>a.href);assert.equal(href,new URL('combat-preview.mp4',resolvedScene).href);
 const result=await page.evaluate(async href=>{
  const video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';video.src=href;document.body.appendChild(video);
  const wait=(event)=>new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Timeout: '+event)),15000);
    video.addEventListener(event,()=>{clearTimeout(timeout);resolve()},{once:true});video.addEventListener('error',()=>{clearTimeout(timeout);reject(Error('Video error '+video.error?.code))},{once:true})});
  if(video.readyState<1)await wait('loadedmetadata');const duration=video.duration;
  video.currentTime=duration*.52;await wait('seeked');const seeked=video.currentTime;await video.play();
  await new Promise(resolve=>setTimeout(resolve,300));const after=video.currentTime;video.pause();return {duration,seeked,after,width:video.videoWidth,height:video.videoHeight};
 },href);
 assert.ok(result.duration>32.9&&result.duration<33.1,JSON.stringify(result));assert.ok(Math.abs(result.seeked-result.duration*.52)<.12);
 assert.ok(result.after>result.seeked+.08,'Video did not advance');assert.equal(result.width,540);assert.equal(result.height,594);assert.deepEqual(errors,[]);
 const report={status:'pass',transport:isFile?'local file with network disabled':'same-origin HTTP',htmlSha256:htmlHash,videoSha256:videoHash,range:!isFile,
  result,scope:'Browser playback/seek and HTTP Range checks; not a physical-phone test.'};
 fs.writeFileSync(path.join(out,isFile?'qa-video-offline.json':'qa-video-http.json'),JSON.stringify(report,null,2)+'\n');
 console.log('PASS: video link, metadata, seek and playback'+(isFile?' offline.':' over HTTP with Range 206.'));
}finally{await browser.close()}
