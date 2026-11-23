// Capture matched idle and walking phases of the published comparison and
// this separate trial. This samples the real rendered skin, not just bones.
// Usage: node capture-poses.mjs NEW_DIRECTORY [trial-index.html]
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(process.argv.length<3||process.argv.length>4)throw Error('Pass a new output directory and optional trial HTML');
const output=path.resolve(process.argv[2]),trial=path.resolve(process.argv[3]||path.join(repo,'work/male-stealth-posture-trial/index.html'));
if(output===repo||output.startsWith(repo+path.sep)||fs.existsSync(output))throw Error('Output must be a new directory outside the repository');
fs.mkdirSync(output,{recursive:true});
const require=createRequire(path.join(repo,'tools/character-showcase/package.json'));
const puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium').default;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
 args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:120000});
try{
 const pages={},errors=[];
 for(const [label,file] of [['previous',path.join(repo,'work/male-leg-human-trial/index.html')],['trial',trial]]){
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.setViewport({width:600,height:600,deviceScaleFactor:1});await page.setOfflineMode(true);
  await page.goto(pathToFileURL(file).href,{waitUntil:'load'});await page.waitForFunction('window.ready===true',{timeout:60000});
  await page.evaluate(()=>{demo.setManual(true);demo.reset();demo.player.position.set(6,0,8);demo.player.rotation.y=0;
   demo.renderer.setSize(600,600,false);demo.camera.aspect=1;demo.camera.fov=30;demo.camera.updateProjectionMatrix();});pages[label]=page;
 }
 const frames=[['idle',0],...Array.from({length:8},(_,i)=>['walk',i/8])],result=[];
 for(const [mode,phase] of frames)for(const [label,page] of Object.entries(pages))for(const angle of ['side','three','front','rear']){
  const data=await page.evaluate(({mode,phase,angle})=>{
   const d=demo,m=d.motion,V=d.camera.position.constructor;m.crouch=1;m.crouchProgress=1;
   m.move=mode==='idle'?0:1;m.idleTime=1;m.crouchPhase=phase;m.render({inspectTime:null});
   d.male.updateWorldMatrix(true,true);const report={};
   for(const name of ['Hips','Neck','Head','Hand_L','Hand_R','Thigh_L','Shin_L','Foot_L','Thigh_R','Shin_R','Foot_R'])
    report[name]=d.player.worldToLocal(d.male.getObjectByName('Rig_'+name).getWorldPosition(new V())).toArray();
   const {x,z}=d.player.position;if(angle==='side')d.camera.position.set(x+3.5,1.03,z);
   else if(angle==='three')d.camera.position.set(x+2.475,1.03,z+2.475);
   else if(angle==='front')d.camera.position.set(x,1.03,z+3.5);else d.camera.position.set(x,1.03,z-3.5);
   d.camera.lookAt(x,.87,z);d.camera.updateMatrixWorld();d.draw();return {image:d.renderer.domElement.toDataURL('image/jpeg',.9),report};
  },{mode,phase,angle});
  fs.writeFileSync(path.join(output,`${label}-${mode}-${phase}-${angle}.jpg`),Buffer.from(data.image.split(',')[1],'base64'));
  if(angle==='side')result.push({mode,phase,label,positions:data.report});
 }
 if(errors.length)throw Error(errors.join('\n'));
 fs.writeFileSync(path.join(output,'poses.json'),JSON.stringify(result,null,2)+'\n');console.log(`Captured ${result.length} matched poses in ${output}`);
}finally{await browser.close()}
