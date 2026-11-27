// Unpack the actual final ZIP and exercise its offline scene and video with
// emulated touch. This is not a physical Android/content:// test.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const archive=path.resolve(process.argv[2]||path.join(repo,'work/male-unarmed-combat-trial/BladesOfWar_Bez_Oruzhia.zip'));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bow-unarmed-package-')),hash=b=>createHash('sha256').update(b).digest('hex');
let browser;
try{
 execFileSync('unzip',['-q',archive,'-d',dir]);const sums=fs.readFileSync(path.join(dir,'SHA256SUMS.txt'),'utf8').trim().split('\n');
 for(const line of sums){const m=/^([a-f0-9]{64})  (.+)$/.exec(line);assert.ok(m);const file=path.resolve(dir,m[2]);assert.ok(file.startsWith(dir+path.sep));assert.equal(hash(fs.readFileSync(file)),m[1],m[2])}
 const expected=hash(fs.readFileSync(path.join(repo,'work/male-unarmed-combat-trial/index.html')));assert.equal(hash(fs.readFileSync(path.join(dir,'index.html'))),expected);
 const require=createRequire(import.meta.url),puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium').default;
 browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
  args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:300000});
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>m.type()==='error'&&errors.push(m.text()));
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});await page.setOfflineMode(true);
 await page.setRequestInterception(true);page.on('request',r=>{if(/^(file|data|blob):/i.test(r.url()))r.continue();else{errors.push('External request '+r.url());r.abort()}});
 await page.goto(pathToFileURL(path.join(dir,'index.html')).href,{waitUntil:'load',timeout:60000});await page.waitForFunction('window.ready===true',{timeout:60000});
 const tap=async id=>{const b=await page.$eval(id,x=>{const r=x.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}});await page.touchscreen.tap(b.x,b.y)};
 await tap('#kick');await page.waitForFunction('demo.state.fighting && demo.motion.activeAttack?.name === "kickR" && demo.motion.combat > .05',{timeout:20000});
 await tap('#punch');assert.equal(await page.evaluate(()=>demo.motion.activeAttack?.name),'jab');await tap('#focus');assert.equal(await page.evaluate(()=>demo.state.focus),true);
 await tap('#reset');assert.equal(await page.evaluate(()=>demo.state.fighting),false);
 const start=await page.evaluate(()=>{const r=demo.renderer.domElement.getBoundingClientRect();return {x:demo.player.position.x,z:demo.player.position.z,tap:{x:r.right-30,y:r.top+r.height*.6}}});
 await page.touchscreen.tap(start.tap.x,start.tap.y);await page.waitForFunction(({x,z})=>Math.hypot(demo.player.position.x-x,demo.player.position.z-z)>.06,{timeout:20000},start);
 const media=await page.evaluate(async()=>{const v=document.createElement('video');v.muted=true;v.playsInline=true;v.src=document.querySelector('a.compare-link').href;document.body.appendChild(v);
  await new Promise((resolve,reject)=>{v.addEventListener('loadedmetadata',resolve,{once:true});v.addEventListener('error',()=>reject(Error('Offline video error')),{once:true});setTimeout(()=>reject(Error('Video timeout')),15000)});
  const duration=v.duration;v.currentTime=duration*.5;await new Promise((resolve,reject)=>{v.addEventListener('seeked',resolve,{once:true});setTimeout(()=>reject(Error('Seek timeout')),15000)});return {duration,time:v.currentTime}});
 assert.ok(media.duration>32.9&&media.duration<33.1&&Math.abs(media.time-media.duration*.5)<.12);assert.deepEqual(errors,[]);
 console.log(`PASS: unpacked ${sums.length} checksummed files; offline live scene, touch, movement and video seek.`);
 console.log(`ZIP ${fs.statSync(archive).size} bytes; SHA-256 ${hash(fs.readFileSync(archive))}`);
}finally{if(browser)await browser.close();fs.rmSync(dir,{recursive:true,force:true})}
