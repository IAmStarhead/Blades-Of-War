// Capture the same model and camera in both separate scenes. For walking/running
// the trial is unchanged. Mocap phase matches are approximate; see README.
// Usage: node capture-poses.mjs NEW_DIRECTORY [trial-index.html]
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';import path from 'node:path';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
if(process.argv.length<3||process.argv.length>4)throw Error('Pass a new output directory and optional trial HTML');
const output=path.resolve(process.argv[2]),trial=path.resolve(process.argv[3]||path.join(repo,'work/male-leg-human-trial/index.html'));
if(output===repo||output.startsWith(repo+path.sep)||fs.existsSync(output))throw Error('Output must be a new directory outside the repository');
fs.mkdirSync(output,{recursive:true});
const require=createRequire(path.join(repo,'tools/character-showcase/package.json'));
const puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium').default;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
 args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:120000});
try{
 const pages={};const errors=[];
 for(const [label,file] of [['old',path.join(repo,'work/male-stealth-tuning/index.html')],['trial',trial]]){
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.setViewport({width:800,height:800,deviceScaleFactor:1});await page.setOfflineMode(true);
  await page.goto(pathToFileURL(file).href,{waitUntil:'load'});await page.waitForFunction('window.ready===true',{timeout:60000});
  await page.evaluate(()=>{demo.setManual(true);demo.reset();demo.player.position.set(6,0,8);demo.player.rotation.y=Math.PI;
   demo.renderer.setSize(520,520,false);demo.camera.aspect=1;demo.camera.fov=34;demo.camera.updateProjectionMatrix();});pages[label]=page;
 }
 const frames=[
  ...[[28,91],[38,19],[48,43],[58,67]].map(([frame,i])=>({kind:'walk',frame,old:i/96})),
  ...[[30,88],[36,16],[42,40],[48,64]].map(([frame,i])=>({kind:'run',frame,old:i/96})),
  ...[42,50,60,68].map(frame=>({kind:'crouch',frame,old:((frame-42)/36+60/96)%1,trial:(frame-42)/36})),
  {kind:'idle',frame:0,old:0,trial:0},
 ];
 const result=[];
 for(const item of frames)for(const label of (['crouch','idle'].includes(item.kind)?['old','trial']:['old']))for(const angle of ['side','three','front','rear']){
  const phase=item[label],page=pages[label];
  const data=await page.evaluate(({kind,phase,angle})=>{
   const d=demo,m=d.motion,V=d.camera.position.constructor;m.crouch=(kind==='crouch'||kind==='idle')?1:0;m.crouchProgress=m.crouch;
   m.move=kind==='idle'?0:1;m.idleTime=1;m.crouchPhase=phase;m.clock.reset(kind==='run'?'run':'walk',phase);m.render({inspectTime:null});
   d.male.updateWorldMatrix(true,true);const report={};for(const s of ['L','R']){
    const ps=['Thigh','Shin','Foot'].map(n=>d.player.worldToLocal(d.male.getObjectByName('Rig_'+n+'_'+s).getWorldPosition(new V()))),[a,b,c]=ps;
    report[s]={bend:b.clone().sub(a).angleTo(c.clone().sub(b))*180/Math.PI,points:ps.map(v=>v.toArray())};
   }
   const {x,z}=d.player.position;if(angle==='side')d.camera.position.set(x+3.5,1.25,z);else if(angle==='front')d.camera.position.set(x,1.25,z-3.5);
   else if(angle==='rear')d.camera.position.set(x,1.25,z+3.5);else d.camera.position.set(x+2.48,1.25,z-2.48);
   d.camera.lookAt(x,.77,z);d.camera.updateMatrixWorld();d.draw();return {image:d.renderer.domElement.toDataURL('image/png'),report};
  },{kind:item.kind,phase,angle});
  const name=`${item.kind}-${item.frame}-${label}-${angle}.png`;fs.writeFileSync(path.join(output,name),Buffer.from(data.image.split(',')[1],'base64'));
  if(angle==='side')result.push({kind:item.kind,referenceFrame:item.frame,label,phase,report:data.report});
 }
 if(errors.length)throw Error(errors.join('\n'));fs.writeFileSync(path.join(output,'poses.json'),JSON.stringify(result,null,2)+'\n');console.log(`Captured ${result.length} poses from both scenes`);
}finally{await browser.close()}
