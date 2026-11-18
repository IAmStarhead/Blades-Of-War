// Capture successive actual-viewer poses at a phone-sized viewport for human
// inspection. The PNGs are temporary QA evidence, not automatic acceptance.
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const pp=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default;
const input=path.resolve(process.argv[2]||path.join(root,'work/male-deep-crouch'));
const output=path.resolve(process.argv[3]||fs.mkdtempSync(path.join(os.tmpdir(),'bow-review-visual-')));fs.mkdirSync(output,{recursive:true});
const browser=await pp.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],defaultViewport:{width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:1}});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto(pathToFileURL(path.join(input,'index.html')).href,{waitUntil:'load'});await page.waitForFunction('window.ready===true',{timeout:120000});await page.evaluate(()=>demo.setManual(true));
 const canvas=await page.$('#view canvas');let count=0;
 for(const [area,modes,angles,N] of [
  ['inspect',['walk','run','crouch'],['front','side','back'],6],
  ['hip',['walk','run','crouch'],['front','side','back'],6],
  ['legs',['walk','run','crouch'],['front','side','back'],6],
  ['upper',['run','walk'],['front','side','back'],6],
 ])for(const mode of modes)for(const angle of angles)for(const variant of ['before','after'])for(let i=0;i<N;i++){
  await page.evaluate(({area,mode,angle,variant,i,N})=>{
   const d=demo;d.reset();d.setVariant(variant);d.setMode(mode==='run'?'run':'walk');
   if(mode==='crouch'){d.setCrouched(true);for(let j=0;j<20;j++)d.step(.05)}
   d.setPhase(i/N);d.setView(area);d.setFacing(angle);d.draw();
  },{area,mode,angle,variant,i,N});
  await canvas.screenshot({path:path.join(output,`${area}-${mode}-${angle}-${variant}-${String(i).padStart(2,'0')}.png`)});count++;
 }
 await page.evaluate(()=>{demo.reset();demo.setVariant('after');demo.setMode('run');demo.setPhase(.25);demo.setView('hip');demo.setFacing('front');demo.draw()});
 await page.screenshot({path:path.join(output,'phone-interface.png')});
 if(errors.length)throw Error(errors.join('\n'));console.log(`Captured ${count} successive phone-sized canvas poses plus the interface to ${output}`);
}finally{await browser.close()}
