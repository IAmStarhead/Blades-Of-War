// Record actual requestAnimationFrame playback, rather than manually posing
// frames. The WebM is temporary review evidence, not an automatic artistic
// acceptance or a benchmark of a particular physical phone.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default;
const input=path.resolve(process.argv[2]||path.join(root,'work/male-deep-crouch'));
const output=path.resolve(process.argv[3]||path.join(os.tmpdir(),'bow-deep-crouch-playback.webm'));
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],defaultViewport:{width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:1}});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.setRequestInterception(true);page.on('request',r=>{if(/^(file|data|blob):/i.test(r.url()))r.continue();else{errors.push('external request: '+r.url());r.abort()}});await page.setOfflineMode(true);
 await page.goto(pathToFileURL(path.join(input,'index.html')).href,{waitUntil:'load'});await page.waitForFunction('window.ready===true',{timeout:120000});
 await page.evaluate(()=>{demo.reset();demo.setVariant('after');demo.setView('inspect');demo.setFacing('side');demo.setMode('run');demo.setManual(false)});
 // Let the run blend settle before recording, without forcing phase steps.
 await page.waitForFunction('demo.state.motionBlend>.99',{timeout:120000});
 const report=await page.evaluate(async()=>{
  const d=demo,canvas=document.querySelector('canvas');if(!canvas.captureStream||!window.MediaRecorder)throw Error('Canvas video recording is not available in this browser');
  const stream=canvas.captureStream(30),mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp8')?'video/webm;codecs=vp8':'video/webm';
  const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:2800000}),parts=[];recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data)};
  const start=performance.now(),renderStart=d.renderer.info.render.frame,events=[];let last=d.state.phase,runWrap=0,crouchWrap=0,frames=0,stage='run';
  // A low software-rendered frame rate may cross the seam from a phase below
  // .5, so detect any backwards phase change rather than assuming tiny steps.
  const sample=now=>{const elapsed=now-start,phase=d.state.phase;if(phase+1e-5<last){if(stage==='run')runWrap++;if(stage==='crouch'&&d.state.crouchBlend>.99)crouchWrap++}last=phase;frames++;if(elapsed<9400)requestAnimationFrame(sample)};
  recorder.start();requestAnimationFrame(sample);
  await new Promise(resolve=>setTimeout(resolve,3200));events.push({event:'crouch',time:performance.now()-start,phase:d.state.phase});stage='crouch';d.setCrouched(true);
  await new Promise(resolve=>setTimeout(resolve,4000));events.push({event:'stand',time:performance.now()-start,phase:d.state.phase});stage='exit';d.setCrouched(false);
  await new Promise(resolve=>setTimeout(resolve,2200));recorder.stop();await new Promise(resolve=>recorder.addEventListener('stop',resolve,{once:true}));stream.getTracks().forEach(t=>t.stop());
  const blob=new Blob(parts,{type:mime}),base64=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob)});
  return {base64,mime,events,frames,runWrap,crouchWrap,renders:d.renderer.info.render.frame-renderStart,duration:performance.now()-start};
 });
 const summary={...report};delete summary.base64;
 assert.ok(report.runWrap>=1&&report.crouchWrap>=1,'Cycles did not advance or loop: '+JSON.stringify(summary));assert.ok(report.frames>=20&&report.renders>=20,'Insufficient actual animation/render frames: '+JSON.stringify(summary));assert.deepEqual(errors,[]);
 fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,Buffer.from(report.base64,'base64'));
 console.log('PASS: automatic run → crouch → run playback, recorded at phone viewport: '+JSON.stringify(summary));
 console.log('Video for visual review: '+output+'; software-rendered frame rate is not a physical-phone benchmark.');
}finally{await browser.close()}
