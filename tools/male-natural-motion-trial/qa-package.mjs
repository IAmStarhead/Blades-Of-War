// Smoke-test the actual unpacked ZIP offline using real browser events.
// Requires unzip, sha256sum and Chromium. This emulates, not tests, a phone.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const zip=path.resolve(process.argv[2]||path.join(repo,'work/male-natural-motion-trial/BladesOfWar_Estestvennoe_Dvizhenie.zip'));
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'bow-natural-zip-'));
const require=createRequire(import.meta.url),puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium').default;
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');let browser;
try{
 const extracted=spawnSync('unzip',['-q',zip,'-d',scratch],{encoding:'utf8'});assert.equal(extracted.status,0,extracted.stderr);
 const checked=spawnSync('sha256sum',['-c','SHA256SUMS.txt'],{cwd:scratch,encoding:'utf8'});assert.equal(checked.status,0,checked.stderr||checked.stdout);
 assert.equal(digest(path.join(scratch,'index.html')),digest(path.join(repo,'work/male-natural-motion-trial/index.html')),'ZIP scene is not the tested page');
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
  args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:180000});
 const errors=[],results=[];
 for(const [width,height,mobile] of [[1280,800,false],[320,568,true],[390,844,true]]){
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.setViewport({width,height,deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});await page.setRequestInterception(true);
  page.on('request',r=>{if(/^(file|data|blob):/i.test(r.url()))r.continue();else{errors.push('Unexpected network request: '+r.url());r.abort()}});
  await page.setOfflineMode(true);await page.goto(pathToFileURL(path.join(scratch,'index.html')).href,{waitUntil:'load'});
  await page.waitForFunction('window.ready===true',{timeout:60000});
  assert.equal(await page.$('#crouch'),null);assert.equal(await page.evaluate(()=>document.querySelector('#status').textContent),'Стоит');
  await page.evaluate(()=>{demo.setManual(true);demo.reset();demo.player.position.set(6,0,8);demo.player.rotation.y=Math.PI;demo.state.yaw=0;demo.follow()});
  if(!mobile){
   await page.keyboard.down('w');await page.evaluate(()=>{for(let i=0;i<60;i++)demo.step(1/60)});
   assert.ok(await page.evaluate(()=>demo.state.speed)>.9);await page.keyboard.up('w');
   await page.evaluate(()=>{for(let i=0;i<6;i++)demo.step(1/60)});assert.ok(await page.evaluate(()=>!!demo.state.brake));
   await page.keyboard.down('s');await page.evaluate(()=>demo.step(1/60));assert.equal(await page.evaluate(()=>!!demo.state.brake),false);
   await page.keyboard.up('s');
  }else{
   const tap=async selector=>{const b=await page.$eval(selector,e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}});await page.touchscreen.tap(b.x,b.y)};
   await tap('#pace');assert.equal(await page.evaluate(()=>demo.state.pace),'run');await tap('#focus');
   const ground=await page.evaluate(()=>{const r=demo.renderer.domElement.getBoundingClientRect();return {x:r.right-30,y:r.top+r.height*.6}});
   await page.touchscreen.tap(ground.x,ground.y);assert.ok(await page.evaluate(()=>demo.state.target));
   await page.evaluate(()=>{for(let i=0;i<45;i++)demo.step(1/60)});await tap('#stop');await page.evaluate(()=>demo.step(1/60));
   assert.ok(await page.evaluate(()=>!!demo.state.brake));await page.touchscreen.tap(ground.x,ground.y);
   assert.ok(await page.evaluate(()=>!!demo.state.target));await page.evaluate(()=>demo.step(1/60));assert.equal(await page.evaluate(()=>!!demo.state.brake),false);
  }
  await Promise.all([page.waitForNavigation({waitUntil:'load'}),page.click('.compare-link')]);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.waitForFunction("[...document.images].every(i=>i.complete&&i.naturalWidth>0) && document.querySelector('video').readyState>=1",{timeout:60000});
  const links=await page.evaluate(()=>[...document.querySelectorAll('a[href],img[src],video[src]')].flatMap(e=>['href','src','poster'].filter(a=>e.hasAttribute(a)).map(a=>e.getAttribute(a))));
  for(const link of links){if(!link||link.startsWith('#')||/^[a-z]+:/i.test(link))continue;
   const resolved=fileURLToPath(new URL(link,page.url()));assert.ok(resolved.startsWith(scratch+path.sep)&&fs.existsSync(resolved),`Broken ZIP link ${link}`)}
  const metadata=await page.evaluate(async()=>{const v=document.querySelector('video');v.muted=true;await v.play();
   await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Video seek timed out')),15000);v.addEventListener('seeked',()=>{clearTimeout(timer);resolve()},{once:true});v.currentTime=9});
   return {duration:v.duration,width:v.videoWidth,height:v.videoHeight,time:v.currentTime}});
  assert.ok(Math.abs(metadata.duration-22.5)<.1&&metadata.time>8.9&&metadata.width===540&&metadata.height===594);
  results.push({width,height,mobile,images:4,videoDuration:metadata.duration,links:links.length,restartDuringBrake:true});await page.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS unpacked ZIP: checksums, exact scene, offline restart controls, links and video playback/seek.');console.log(JSON.stringify(results,null,2));
}finally{if(browser)await browser.close();fs.rmSync(scratch,{recursive:true,force:true})}
