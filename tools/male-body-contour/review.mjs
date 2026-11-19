// Visual QA from the actual self-contained viewer, including approximate
// screenshot-matched poses and sampled movement. Scratch output is not in ZIP.
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default,input=path.resolve(process.argv[2]||path.join(root,'work/male-body-contour'));
const output=path.resolve(process.argv[3]||fs.mkdtempSync(path.join(os.tmpdir(),'bow-contour-review-')));fs.mkdirSync(output,{recursive:true});
const errors=[],browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],defaultViewport:{width:720,height:720}});
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.setOfflineMode(true);await page.goto(pathToFileURL(path.join(input,'index.html')).href);await page.waitForFunction('window.ready===true',{timeout:120000});
 await page.evaluate(()=>{const style=document.createElement('style');style.textContent='header,aside,footer,.view-badge,.variant-badge,.crouch-control,.view-help{display:none!important}.app,.layout{display:block!important;padding:0!important}main{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-height:none!important;border:0!important;border-radius:0!important}';document.head.appendChild(style);demo.setManual(true);window.dispatchEvent(new Event('resize'))});
 const capture=async (label,mode,phase,view,yaw,variant)=>{
  await page.evaluate(({mode,phase,view,yaw,variant})=>{const d=demo;d.reset();d.state.breathTime=0;d.setVariant(variant);d.setMode(mode==='idle'?'control':mode==='run'?'run':'walk');if(mode==='crouch'){d.setCrouched(true);for(let i=0;i<24;i++)d.step(.05)}d.setView(view);d.setYaw(yaw);if(mode!=='idle')d.setPhase(phase);d.draw()},{mode,phase,view,yaw,variant});
  await page.screenshot({path:path.join(output,`${label}-${variant}.jpg`),type:'jpeg',quality:92});
 };
 for(const [label,mode,phase,yaw] of [['user-walk-rear','walk',.65,Math.PI],['user-walk-side','walk',.94,1.5*Math.PI],['user-run-side','run',.51,1.5*Math.PI]])for(const view of ['inspect','upper','hip'])for(const variant of ['before','after'])await capture(`${label}-${view}`,mode,phase,view,yaw,variant);
 for(const [mode,view,angle,yaw] of [['walk','upper','front45',Math.PI/4],['walk','upper','side',1.5*Math.PI],['walk','hip','back',Math.PI],['walk','hip','rear45',.75*Math.PI],['run','upper','front45',Math.PI/4],['run','upper','side',1.5*Math.PI],['run','hip','back',Math.PI],['run','hip','rear45',.75*Math.PI],['crouch','hip','back',Math.PI],['crouch','hip','rear45',.75*Math.PI],['crouch','upper','side',1.5*Math.PI]])for(const phase of [0,.25,.5,.75])for(const variant of ['before','after'])await capture(`${mode}-${view}-${angle}-${phase}`,mode,phase,view,yaw,variant);
 for(const [view,angle,yaw] of [['upper','side',1.5*Math.PI],['upper','front',0],['hip','back',Math.PI]])for(const variant of ['before','after'])await capture(`idle-${view}-${angle}`,'idle',0,view,yaw,variant);
 for(const mode of ['walk','run'])for(const direction of ['enter','exit'])for(const [view,angle,yaw] of [['upper','side',1.5*Math.PI],['hip','back',Math.PI]])for(const variant of ['before','after']){
  await page.evaluate(({mode,direction,view,yaw,variant})=>{const d=demo;d.reset();d.state.breathTime=0;d.setVariant(variant);d.setMode(mode);d.setPhase(.25);d.setPlaying(false);d.setView(view);d.setYaw(yaw);if(direction==='exit'){d.setCrouched(true);for(let i=0;i<24;i++)d.step(.05)}d.setCrouched(direction==='enter')},{mode,direction,view,yaw,variant});
  for(let i=1;i<=14;i++){await page.evaluate(()=>{demo.step(.05);demo.draw()});if([3,7,11].includes(i))await page.screenshot({path:path.join(output,`transition-${mode}-${direction}-${angle}-${i}-${variant}.jpg`),type:'jpeg',quality:92})}
 }
 if(errors.length)throw Error(errors.join('; '));console.log('Captured matched actual-viewer stills in '+output+' (visual QA only; match to user screenshots is approximate).');
}finally{await browser.close()}
