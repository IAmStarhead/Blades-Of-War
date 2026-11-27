// Smoke-test the actual unpacked ZIP offline, with real browser events and
// playback/seek of both videos. Requires `unzip`, `sha256sum` and Chromium.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const zip=path.resolve(process.argv[2]||path.join(repo,'work/male-idle-stop-trial/BladesOfWar_Ozhidanie_i_Ostanovka.zip'));
const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'bow-idle-stop-zip-'));
const require=createRequire(path.join(repo,'tools/character-showcase/package.json')),puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium').default;
const digest=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');let browser;
try{
  const extracted=spawnSync('unzip',['-q',zip,'-d',scratch],{encoding:'utf8'});assert.equal(extracted.status,0,extracted.stderr);
  const checked=spawnSync('sha256sum',['-c','SHA256SUMS.txt'],{cwd:scratch,encoding:'utf8'});assert.equal(checked.status,0,checked.stderr||checked.stdout);
  assert.equal(digest(path.join(scratch,'index.html')),digest(path.join(repo,'work/male-idle-stop-trial/index.html')),'Packaged scene is not the tested page');
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
    await page.evaluate(()=>{demo.setManual(true);demo.reset()});
    if(!mobile){
      await page.keyboard.down('w');await page.evaluate(()=>{for(let i=0;i<60;i++)demo.step(1/60)});
      assert.ok(await page.evaluate(()=>demo.state.speed)>1.3);await page.keyboard.up('w');await page.evaluate(()=>demo.step(1/60));
      assert.ok(await page.evaluate(()=>!!demo.state.brake));await page.evaluate(()=>{for(let i=0;i<130;i++)demo.step(1/60)});
      assert.ok(await page.evaluate(()=>demo.state.speed)<.01);
    }else{
      const tap=async selector=>{const b=await page.$eval(selector,e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}});await page.touchscreen.tap(b.x,b.y)};
      await tap('#pace');assert.equal(await page.evaluate(()=>demo.state.pace),'run');await tap('#focus');
      const ground=await page.evaluate(()=>{const r=demo.renderer.domElement.getBoundingClientRect();return {x:r.right-30,y:r.top+r.height*.6}});
      await page.touchscreen.tap(ground.x,ground.y);assert.ok(await page.evaluate(()=>demo.state.target));
      await page.evaluate(()=>{for(let i=0;i<60;i++)demo.step(1/60)});await tap('#stop');assert.equal(await page.evaluate(()=>demo.state.target),null);
    }
    await Promise.all([page.waitForNavigation({waitUntil:'load'}),page.click('.compare-link')]);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert.match(await page.$eval('.note',x=>x.textContent),/не входит в этот архив/);
    const links=await page.evaluate(()=>[...document.querySelectorAll('a[href],img[src],video[poster],source[src]')].flatMap(e=>['href','src','poster'].filter(a=>e.hasAttribute(a)).map(a=>e.getAttribute(a))));
    for(const link of links){if(!link||link.startsWith('#')||/^[a-z]+:/i.test(link))continue;
      const resolved=fileURLToPath(new URL(link,page.url()));assert.ok(resolved.startsWith(scratch+path.sep)&&fs.existsSync(resolved),`Broken ZIP link ${link}`)}
    const videos=[];
    for(const [i,expected] of [[0,14],[1,56]]){
      await page.waitForFunction(index=>{const v=document.querySelectorAll('video')[index];return v.readyState>=1&&Number.isFinite(v.duration)},{timeout:60000},i);
      const metadata=await page.evaluate(async index=>{const v=document.querySelectorAll('video')[index];v.muted=true;await v.play();v.pause();
        await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Video seek timed out')),15000);v.addEventListener('seeked',()=>{clearTimeout(timer);resolve()},{once:true});v.currentTime=8});
        return {duration:v.duration,width:v.videoWidth,height:v.videoHeight,time:v.currentTime}},i);
      assert.ok(Math.abs(metadata.duration-expected)<.1&&metadata.time>7&&metadata.width===960&&metadata.height===560);videos.push(metadata.duration);
    }
    results.push({width,height,mobile,videos,links:links.length});await page.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS unpacked ZIP: checksums, exact scene, offline controls, links and video playback/seek.');console.log(JSON.stringify(results,null,2));
}finally{if(browser)await browser.close();fs.rmSync(scratch,{recursive:true,force:true})}
