// Inspect knee/foot movement during the actual viewer's crouch transitions.
// Sampled joint displacements and selected sole vertices are only proxies.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default,output=path.resolve(process.argv[2]||path.join(root,'work/male-library-motion'));
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
  for(const variant of ['before','after'])for(const mode of ['idle','run'])for(const playing of (mode==='run'?[false,true]:[false]))for(const start of (mode==='run'?[0,.25,.5,.75]:[0]))for(const direction of ['enter','exit']){
   d.reset();d.setVariant(variant);d.state.breathTime=0;d.setMode(mode==='idle'?'control':'run');if(mode==='run'){d.setPhase(start);d.setPlaying(playing)}
   if(direction==='exit'){d.setCrouched(true);for(let i=0;i<20;i++)d.step(.05)}
   d.setCrouched(direction==='enter');let previous=joints(),maxJoint=0,minFoot=Infinity,maxRoot=0,maxIK=0;
   for(let i=0;i<32;i++){
    d.step(.025);const now=joints();for(let j=0;j<names.length;j++)maxJoint=Math.max(maxJoint,now[j].distanceTo(previous[j]));previous=now;
    minFoot=Math.min(minFoot,lowest());maxRoot=Math.max(maxRoot,d.state.floorCorrection||0);maxIK=Math.max(maxIK,d.state.footIK||0);
   }
   cases.push({variant,mode,playing,start,direction,maxJoint,minFoot,maxRoot,maxIK,blend:d.state.crouchBlend});
  }
  // Also exercise real translated movement while Shift and W are held; this
  // controller accelerates rather than directly using the in-place speed.
  const controlCases=[];for(const variant of ['before','after'])for(const direction of ['enter','exit']){
   d.reset();d.setVariant(variant);d.setMode('control');d.setView('inspect');d.setYaw(0);d.player.position.set(5,0,5);d.keys.add('ShiftLeft');d.keys.add('KeyW');
   for(let i=0;i<50;i++)d.step(.025);
   if(direction==='exit'){d.setCrouched(true);for(let i=0;i<60;i++)d.step(.025)}
   d.setCrouched(direction==='enter');let previous=joints(),maxJoint=0,minFoot=Infinity,maxRoot=0,maxIK=0;
   for(let i=0;i<48;i++){
    d.step(.025);const now=joints();for(let j=0;j<names.length;j++)maxJoint=Math.max(maxJoint,now[j].distanceTo(previous[j]));previous=now;
    minFoot=Math.min(minFoot,lowest());maxRoot=Math.max(maxRoot,d.state.floorCorrection||0);maxIK=Math.max(maxIK,d.state.footIK||0);
   }
   controlCases.push({variant,direction,maxJoint,minFoot,maxRoot,maxIK,blend:d.state.crouchBlend});d.keys.clear();
  }
  let reversal=0,repeat=0;for(const variant of ['before','after'])for(const delay of [.05,.15,.25,.35]){
   d.reset();d.setVariant(variant);d.setMode('control');d.setCrouched(true);for(let t=0;t<delay-1e-9;t+=.025)d.step(.025);
   const before=joints();d.setCrouched(false);const after=joints();for(let j=0;j<names.length;j++)reversal=Math.max(reversal,before[j].distanceTo(after[j]));
   if(variant==='after')for(let k=0;k<5;k++){d.setCrouched(false);const next=joints();for(let j=0;j<names.length;j++)repeat=Math.max(repeat,after[j].distanceTo(next[j]))}
  }
  // Sample more finely too: a near-straight knee can flip branches within a
  // single frame even when a coarser 25 ms check looks acceptable.
  const fine=[];for(const mode of ['idle','walk','run'])for(const playing of (mode==='idle'?[false]:[false,true]))for(const start of (mode==='idle'?[0]:[0,.25,.5,.75]))for(const direction of ['enter','exit']){
   d.reset();d.setVariant('after');d.setMode(mode==='idle'?'control':mode);if(mode!=='idle'){d.setPhase(start);d.setPlaying(playing)}
   if(direction==='exit'){d.setCrouched(true);for(let i=0;i<20;i++)d.step(.05)}
   d.setCrouched(direction==='enter');let previous=joints(),maxJoint=0;
   for(let i=0;i<160;i++){d.step(.005);const next=joints();for(let j=0;j<names.length;j++)maxJoint=Math.max(maxJoint,next[j].distanceTo(previous[j]));previous=next}
   fine.push({mode,playing,start,direction,maxJoint});
  }
  return {sole:sole.length,cases,controlCases,reversal,repeat,fine};
 });
 assert.ok(result.sole>2000);assert.deepEqual(errors,[]);
 for(const x of result.cases){assert.ok(x.minFoot>.0008,`${x.variant}/${x.mode}/${x.direction}: sole ${x.minFoot}`);assert.ok(x.maxJoint<(x.mode==='idle'?.055:x.playing?.18:.075),`25ms joint motion ${JSON.stringify(x)}`);assert.ok(x.maxRoot<.065&&x.maxIK<.09,`floor correction ${JSON.stringify(x)}`);assert.ok(Math.abs(x.blend-(x.direction==='enter'?1:0))<1e-6)}
 // World-space movement includes up to 3.5 m/s of player translation as
 // well as leg swing; its limit cannot be the same as an in-place cycle.
 for(const x of result.controlCases){assert.ok(x.minFoot>.0008,`control sole ${JSON.stringify(x)}`);assert.ok(x.maxJoint<.24,`control 25ms joint motion ${JSON.stringify(x)}`);assert.ok(x.maxRoot<.065&&x.maxIK<.09,`control floor correction ${JSON.stringify(x)}`);assert.ok(Math.abs(x.blend-(x.direction==='enter'?1:0))<1e-6)}
 assert.ok(result.reversal<1e-6,'reversing crouch teleports a joint');assert.ok(result.repeat<1e-6,'paused render accumulates IK');
 for(const x of result.fine)assert.ok(x.maxJoint<(x.mode==='run'&&x.playing?.035:.016),`5ms joint motion ${JSON.stringify(x)}`);
 console.log('PASS: sampled crouch transitions in-place/translated, reversal and repeated paused renders; selected soles >= 0.8 mm.');
 console.log(`Max 25ms joint movement in-place ${Math.max(...result.cases.map(x=>x.maxJoint)).toFixed(5)}m; translated ${Math.max(...result.controlCases.map(x=>x.maxJoint)).toFixed(5)}m; max 5ms ${Math.max(...result.fine.map(x=>x.maxJoint)).toFixed(5)}m.`);
 console.log('NOTE: finite samples and vertical guard are not horizontal foot-lock, collision physics or proof of smoothness on all devices.');
}finally{await browser.close()}
