// Inspect knee/foot movement during the actual viewer's crouch transitions.
// Sampled joint displacements and selected sole vertices are only proxies.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default,output=path.resolve(process.argv[2]||path.join(root,'work/male-motion-review'));
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto(pathToFileURL(path.join(output,'index.html')).href,{waitUntil:'load'});await page.waitForFunction('window.ready===true',{timeout:120000});
 const result=await page.evaluate(()=>{
  const d=demo;d.setManual(true);const mesh=d.male.getObjectByName('head_2'),p=mesh.geometry.attributes.position,v=d.camera.position.clone(),sole=[];
  for(let i=0;i<p.count;i++)if(p.getY(i)<.12&&Math.abs(p.getX(i))>.03&&Math.abs(p.getX(i))<.22)sole.push(i);
  const names=['Rig_Thigh_L','Rig_Shin_L','Rig_Foot_L','Rig_Thigh_R','Rig_Shin_R','Rig_Foot_R'];
  function joints(){d.scene.updateMatrixWorld(true);return names.map(n=>d.male.getObjectByName(n).getWorldPosition(v).clone())}
  function lowest(){d.scene.updateMatrixWorld(true);mesh.skeleton.update();let min=Infinity;for(const i of sole){mesh.getVertexPosition(i,v);v.applyMatrix4(mesh.matrixWorld);min=Math.min(min,v.y)}return min}
  const cases=[];
  for(const variant of ['before','after'])for(const mode of ['idle','run'])for(const direction of ['enter','exit']){
   d.reset();d.setVariant(variant);d.state.breathTime=0;d.setMode(mode==='idle'?'control':'run');if(mode==='run')d.setPhase(.25);
   if(direction==='exit'){d.setCrouched(true);for(let i=0;i<20;i++)d.step(.05)}
   d.setCrouched(direction==='enter');let previous=joints(),maxJoint=0,minFoot=Infinity,maxRoot=0,maxIK=0;
   for(let i=0;i<20;i++){
    d.step(.025);const now=joints();for(let j=0;j<names.length;j++)maxJoint=Math.max(maxJoint,now[j].distanceTo(previous[j]));previous=now;
    minFoot=Math.min(minFoot,lowest());maxRoot=Math.max(maxRoot,d.state.floorCorrection||0);maxIK=Math.max(maxIK,d.state.footIK||0);
   }
   cases.push({variant,mode,direction,maxJoint,minFoot,maxRoot,maxIK,blend:d.state.crouchBlend});
  }
  let reversal=0;for(const variant of ['before','after'])for(const delay of [.05,.15,.25,.35]){
   d.reset();d.setVariant(variant);d.setMode('control');d.setCrouched(true);for(let t=0;t<delay-1e-9;t+=.025)d.step(.025);
   const before=joints();d.setCrouched(false);const after=joints();for(let j=0;j<names.length;j++)reversal=Math.max(reversal,before[j].distanceTo(after[j]));
  }
  return {sole:sole.length,cases,reversal};
 });
 assert.ok(result.sole>2000);for(const x of result.cases){
  assert.ok(x.minFoot>.0008,`${x.variant}/${x.mode}/${x.direction}: sampled sole penetrates floor ${x.minFoot}`);
  assert.ok(x.maxJoint<(x.mode==='idle'?.05:.07),`${x.variant}/${x.mode}/${x.direction}: jump between 25 ms samples ${x.maxJoint}`);
  assert.ok(x.maxRoot<.03&&x.maxIK<.05,'excessive transition floor correction');
  assert.ok(Math.abs(x.blend-(x.direction==='enter'?1:0))<1e-6);
 }
 assert.ok(result.reversal<1e-6,'toggling midway teleports a joint');assert.deepEqual(errors,[]);
 console.log('PASS: 25 ms enter/exit samples, selected knees/feet, floor guard and mid-transition reversals '+JSON.stringify(result));
 console.log('NOTE: these samples cannot guarantee that the animation looks smooth on every device or remains exactly grounded.');
}finally{await browser.close()}
