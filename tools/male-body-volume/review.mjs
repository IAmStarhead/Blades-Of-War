// Capture matched views from the actual offline trial, not the sketch renderer.
// Optional output directory is for visual QA only and is not part of the ZIP.
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default,input=path.resolve(process.argv[2]||path.join(root,'work/male-body-volume'));
const output=path.resolve(process.argv[3]||fs.mkdtempSync(path.join(os.tmpdir(),'bow-volume-review-')));fs.mkdirSync(output,{recursive:true});
const errors=[],browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],defaultViewport:{width:720,height:720}});
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.setOfflineMode(true);await page.goto(pathToFileURL(path.join(input,'index.html')).href);await page.waitForFunction('window.ready===true',{timeout:120000});
 await page.evaluate(()=>{const style=document.createElement('style');style.textContent='header,aside,footer,.view-badge,.crouch-control,.view-help{display:none!important}.app,.layout{display:block!important;padding:0!important}main{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-height:none!important;border:0!important;border-radius:0!important}';document.head.appendChild(style);demo.setManual(true);window.dispatchEvent(new Event('resize'))});
 for(const [mode,view,angle,yaw] of [['walk','upper','front45',Math.PI/4],['walk','upper','side',Math.PI/2],['run','upper','front45',Math.PI/4],['run','upper','side',Math.PI/2],['run','hip','rear45',Math.PI*.75],['run','hip','back',Math.PI],['crouch','inspect','side',Math.PI/2],['crouch','inspect','front',0],['crouch','hip','back',Math.PI],['crouch','legs','side',Math.PI/2],['crouch','legs','front',0]])for(const phase of [0,.25,.5,.75])for(const variant of ['before','after']){
  await page.evaluate(({mode,view,yaw,phase,variant})=>{const d=demo;d.reset();d.state.breathTime=0;d.setVariant(variant);d.setMode(mode==='run'?'run':'walk');if(mode==='crouch'){d.setCrouched(true);for(let i=0;i<24;i++)d.step(.05)}d.setView(view);d.setYaw(yaw);d.setPhase(phase);d.draw()},{mode,view,yaw,phase,variant});
  await page.screenshot({path:path.join(output,`${mode}-${view}-${angle}-${phase}-${variant}.jpg`),type:'jpeg',quality:90});
 }
 for(const t of [0,.6,1.2,1.8])for(const facing of ['front','back'])for(const variant of ['before','after']){
  await page.evaluate(({t,facing,variant})=>{const d=demo;d.reset();d.state.breathTime=0;d.setVariant(variant);d.setMode('control');d.setCrouched(true);for(let i=0;i<24;i++)d.step(.05);d.state.breathTime=t;d.step(.001);d.setView('legs');d.setFacing(facing);d.draw()},{t,facing,variant});
  await page.screenshot({path:path.join(output,`crouch-idle-${facing}-${t}-${variant}.jpg`),type:'jpeg',quality:90});
 }
 for(const mode of ['control','walk','run'])for(const direction of ['enter','exit'])for(const facing of ['front','side'])for(const variant of ['before','after']){
  await page.evaluate(({mode,direction,facing,variant})=>{const d=demo;d.reset();d.state.breathTime=0;d.setVariant(variant);d.setMode(mode);if(mode!=='control'){d.setPhase(.25);d.setPlaying(false)}d.setView('legs');d.setFacing(facing);if(direction==='exit'){d.setCrouched(true);for(let i=0;i<24;i++)d.step(.05)}d.setCrouched(direction==='enter')},{mode,direction,facing,variant});
  for(let i=1;i<=14;i++){await page.evaluate(()=>{demo.step(.05);demo.draw()});if([2,5,8,11,14].includes(i))await page.screenshot({path:path.join(output,`transition-${mode}-${direction}-${facing}-${i}-${variant}.jpg`),type:'jpeg',quality:90})}
 }
 if(errors.length)throw Error(errors.join('; '));console.log('Captured matched actual-viewer stills in '+output+' (visual QA only).');
}finally{await browser.close()}
