// Capture actual viewer playback at deterministic 30 Hz, including controller
// transitions. Frames are review material, not golden-image assertions.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default;
const argv=process.argv.slice(2),output=path.resolve(argv.find(x=>!x.startsWith('--'))||path.join(root,'work/male-full-body-motion'));
const arg=argv.find(x=>x.startsWith('--frames='));
const dir=arg?path.resolve(arg.slice('--frames='.length)):fs.mkdtempSync(path.join(os.tmpdir(),'bow-playback-review-'));
fs.mkdirSync(dir,{recursive:true});const errors=[];
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
 args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],defaultViewport:{width:1100,height:800}});
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.setRequestInterception(true);page.on('request',r=>{if(/^(file|data|blob):/i.test(r.url()))r.continue();else{errors.push('external '+r.url());r.abort()}});
 await page.setOfflineMode(true);await page.goto(pathToFileURL(path.join(output,'index.html')).href,{waitUntil:'load',timeout:120_000});
 await page.waitForFunction('window.ready===true',{timeout:120_000});await page.evaluate(()=>demo.setManual(true));
 const canvas=await page.$('#view canvas'),metadata={};
 for(const mode of ['walk','run'])for(const facing of ['front','side','back']){
  const name=mode+'-'+facing;metadata[name]=[];
  await page.evaluate(({mode,facing})=>{demo.reset();demo.setVariant('after');demo.setView('inspect');demo.setMode(mode);demo.setFacing(facing);demo.setPhase(0);demo.setPlaying(true)},{mode,facing});
  for(let i=0;i<30;i++){
   metadata[name].push(await page.evaluate(()=>{demo.step(1/30);demo.draw();return {phase:demo.state.phase,frame:demo.renderer.info.render.frame}}));
   await canvas.screenshot({path:path.join(dir,`${name}-${String(i).padStart(2,'0')}.png`)});
  }
 }
 // Real movement from the game-distance camera after acceleration.
 for(const mode of ['walk','run']){
  metadata['game-'+mode]=[];
  await page.evaluate(mode=>{const d=demo;d.reset();d.setVariant('after');d.player.position.set(6,0,5);d.setView('game');d.setYaw(Math.PI/4);d.player.rotation.y=-3*Math.PI/4;d.keys.add('KeyW');if(mode==='run')d.keys.add('ShiftLeft');for(let i=0;i<60;i++)d.step(1/60)},mode);
  for(let i=0;i<30;i++){
   metadata['game-'+mode].push(await page.evaluate(()=>{demo.step(1/30);demo.draw();return {phase:demo.state.phase,speed:demo.state.actualSpeed,runBlend:demo.state.runBlend}}));
   await canvas.screenshot({path:path.join(dir,`game-${mode}-${String(i).padStart(2,'0')}.png`)});
  }
  await page.evaluate(()=>demo.keys.clear());
 }
 // Side-on actual controlled acceleration, walk-to-run and release. Camera
 // follows the actor; keyboard A points along its forward (+Z) at this yaw.
 metadata.transition=[];
 await page.evaluate(()=>{demo.reset();demo.setVariant('after');demo.setView('inspect');demo.setYaw(Math.PI/2);demo.player.rotation.y=0;demo.keys.add('KeyA')});
 for(let i=0;i<90;i++){
  metadata.transition.push(await page.evaluate(i=>{
   if(i===30)demo.keys.add('ShiftLeft');if(i===60)demo.keys.clear();demo.step(1/30);demo.draw();
   return {phase:demo.state.phase,speed:demo.state.actualSpeed,walkRunBlend:demo.state.runBlend,motionBlend:demo.state.motionBlend,position:demo.player.position.toArray()};
  },i));
  await canvas.screenshot({path:path.join(dir,`transition-side-${String(i).padStart(2,'0')}.png`)});
 }
 assert.equal(metadata.transition[0].walkRunBlend,0,'reset retained the previous run blend');
 assert.ok(metadata.transition[29].speed>.85&&metadata.transition[40].speed>1.8);
 assert.ok(metadata.transition[40].walkRunBlend>.9&&metadata.transition.at(-1).motionBlend===0);
 assert.ok(metadata.transition.at(-1).speed===0);
 if(errors.length)throw Error(errors.join('\n'));
 fs.writeFileSync(path.join(dir,'frames.json'),JSON.stringify(metadata,null,2)+'\n');
 console.log(`Captured 30 Hz viewer frames and 3 s of controller transitions in ${dir}`);
}catch(error){console.error(error);process.exitCode=1}finally{await browser.close()}
