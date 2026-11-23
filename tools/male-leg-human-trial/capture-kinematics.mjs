// Sample 96 in-place bone poses from a specified scene for the approximate
// HMC direction comparison. These are *not* foot contacts or a medical test.
// Usage: node capture-kinematics.mjs /tmp/new-samples.json [scene-index.html]
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';import path from 'node:path';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(process.argv.length<3||process.argv.length>4)throw Error('Pass a new output JSON and optional scene HTML');
const output=path.resolve(process.argv[2]),scene=path.resolve(process.argv[3]||path.join(repo,'work/male-stealth-tuning/index.html'));
if(output===repo||output.startsWith(repo+path.sep)||fs.existsSync(output))throw Error('Output must be a new file outside the repository');
const require=createRequire(path.join(repo,'tools/character-showcase/package.json'));
const puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium').default;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
 args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:120000});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.setViewport({width:800,height:800,deviceScaleFactor:1});await page.setOfflineMode(true);
 await page.goto(pathToFileURL(scene).href,{waitUntil:'load'});await page.waitForFunction('window.ready===true',{timeout:60000});
 const samples=await page.evaluate(()=>{
  const d=demo,m=d.motion,V=d.camera.position.constructor;d.setManual(true);d.reset();d.player.position.set(6,0,8);d.player.rotation.y=Math.PI;
  const res={};for(const mode of ['walk','run','crouchWalk','crouchIdle']){
   res[mode]=[];const count=mode==='crouchIdle'?1:96;
   for(let i=0;i<count;i++){
    const phase=i/96;m.crouch=mode.startsWith('crouch')?1:0;m.crouchProgress=m.crouch;m.move=mode==='crouchIdle'?0:1;m.idleTime=1;
    m.crouchPhase=phase;m.clock.reset(mode==='run'?'run':'walk',phase);m.render({inspectTime:null});d.male.updateWorldMatrix(true,true);
    const row={};for(const side of ['L','R']){
     const points=['Thigh','Shin','Foot'].map(n=>d.player.worldToLocal(d.male.getObjectByName('Rig_'+n+'_'+side).getWorldPosition(new V()))),[a,b,c]=points;
     row[side]={bend:b.clone().sub(a).angleTo(c.clone().sub(b))*180/Math.PI,points:points.map(v=>v.toArray())};
    }res[mode].push(row);
   }
  }return res;
 });
 if(errors.length)throw Error(errors.join('\n'));
 const data={htmlSha256:createHash('sha256').update(fs.readFileSync(scene)).digest('hex'),phaseCount:96,samples};
 fs.writeFileSync(output,JSON.stringify(data)+'\n',{flag:'wx'});console.log(`Sampled ${scene}: ${output}`);await page.close();
}finally{await browser.close()}
