// Compare the before toggle with the exact last viewer, including transitions,
// and check that the new corrections are local and fade in with the crouch.
// Sampled vertices/phases are not a substitute for artistic or collision QA.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default,output=path.resolve(process.argv[2]||path.join(root,'work/male-body-volume'));
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:180000});
const errors=[];
async function open(file){const p=await browser.newPage();p.on('pageerror',e=>errors.push(e.message));await p.setOfflineMode(true);await p.goto(pathToFileURL(file).href);await p.waitForFunction('window.ready===true',{timeout:120000});await p.evaluate(()=>demo.setManual(true));return p}
try{
 const trial=await open(path.join(output,'index.html')),last=await open(path.join(root,'work/male-anatomy-followup/index.html'));
 const transitionData=old=>{
  const d=demo,m=d.male.getObjectByName('head_2'),v=d.camera.position.clone(),records=[];d.setManual(true);
  for(const mode of ['control','walk','run'])for(const playing of (mode==='control'?[false]:[false,true]))for(const phase of (mode==='control'?[0]:[0,.25,.5,.75]))for(const direction of ['enter','exit']){
   d.reset();d.state.breathTime=0;d.setVariant(old?'after':'before');d.setMode(mode);
   if(mode!=='control'){d.setPhase(phase);d.setPlaying(playing)}
   if(direction==='exit'){d.setCrouched(true);for(let k=0;k<24;k++)d.step(.05)}
   d.setCrouched(direction==='enter');
   for(let k=0;k<16;k++){
    d.step(.05);d.scene.updateMatrixWorld(true);m.skeleton.update();const vertices=[];
    for(let i=0;i<m.geometry.attributes.position.count;i+=47){m.getVertexPosition(i,v);vertices.push(...v.toArray())}
    records.push({id:[mode,playing,phase,direction,k].join('/'),vertices,bones:d.bones.flatMap(b=>[...b.position.toArray(),...b.quaternion.toArray()]),weights:m.morphTargetInfluences.slice(0,24),extra:m.morphTargetInfluences.slice(24),state:[d.state.phase,d.state.crouchBlend,d.state.motionBlend,d.state.runBlend,d.state.floorCorrection||0,d.state.footIK||0]});
   }
  }return records;
 };
 const [fresh,previous]=await Promise.all([trial.evaluate(transitionData,false),last.evaluate(transitionData,true)]);assert.equal(fresh.length,previous.length);let maxPrevious=0;
 for(let i=0;i<fresh.length;i++){
  assert.equal(fresh[i].id,previous[i].id);for(const key of ['vertices','bones','weights','state']){assert.equal(fresh[i][key].length,previous[i][key].length);for(let j=0;j<fresh[i][key].length;j++)maxPrevious=Math.max(maxPrevious,Math.abs(fresh[i][key][j]-previous[i][key][j]))}
  assert.ok(fresh[i].extra.every(v=>Math.abs(v)<1e-7),fresh[i].id);
 }
 assert.ok(maxPrevious<2e-5,`Previous comparison deviated ${maxPrevious}`);
 console.log(`PASS: before toggle matches last viewer in ${fresh.length} sampled idle/walk/run crouch transitions; maximum component difference ${maxPrevious}`);
 const local=await trial.evaluate(()=>{
  const d=demo,m=d.male.getObjectByName('head_2'),g=m.geometry,ref=g.attributes._volume_last_position,v=d.camera.position.clone();
  let result={walk:{maxOutside:0,maxBones:0,maxWeights:0,maxExtra:0},run:{maxOutside:0,maxBones:0,maxWeights:0,maxExtra:0},crouch:{maxOutside:0,maxBones:0,maxWeights:0,minExtra:Infinity,maxExtra:0,nearKneeSum:0,nearKneeCount:0,maxKnee:0}};
  for(const mode of ['walk','run','crouch']){
   d.reset();d.state.breathTime=0;d.setVariant('after');d.setMode(mode==='run'?'run':'walk');if(mode==='crouch'){d.setCrouched(true);for(let i=0;i<24;i++)d.step(.05)}
   const o=result[mode];
   for(let phase=0;phase<32;phase++){
    d.setPhase((phase+.37)/32);d.setVariant('before');d.scene.updateMatrixWorld(true);m.skeleton.update();
    const p=new Float32Array(ref.count*3);for(let i=0;i<ref.count;i++){m.getVertexPosition(i,v);p.set(v.toArray(),3*i)}
    const bones=d.bones.flatMap(b=>[...b.position.toArray(),...b.quaternion.toArray()]),weights=m.morphTargetInfluences.slice(0,24);
    d.setVariant('after');d.scene.updateMatrixWorld(true);m.skeleton.update();
    const newer=d.bones.flatMap(b=>[...b.position.toArray(),...b.quaternion.toArray()]);for(let i=0;i<bones.length;i++)o.maxBones=Math.max(o.maxBones,Math.abs(bones[i]-newer[i]));
    for(let i=0;i<24;i++)o.maxWeights=Math.max(o.maxWeights,Math.abs(weights[i]-m.morphTargetInfluences[i]));
    for(const w of m.morphTargetInfluences.slice(24)){o.maxExtra=Math.max(o.maxExtra,w);if(mode==='crouch')o.minExtra=Math.min(o.minExtra,w)}
    for(let i=0;i<ref.count;i++){
     m.getVertexPosition(i,v);const diff=Math.hypot(v.x-p[3*i],v.y-p[3*i+1],v.z-p[3*i+2]),y=ref.getY(i),outside=mode==='crouch'?(y<=.22||(y>=.72&&y<=1)||y>=1.36):(y<=1||y>=1.36);
     if(outside)o.maxOutside=Math.max(o.maxOutside,diff);
     if(mode==='crouch'&&y>=.42&&y<=.58&&Math.abs(ref.getX(i))>.03&&Math.abs(ref.getX(i))<.24){o.nearKneeSum+=diff;o.nearKneeCount++;o.maxKnee=Math.max(o.maxKnee,diff)}
    }
   }
  }
  let maxWeightError=0,maxWeightStep=0;
  for(const mode of ['control','walk','run'])for(const direction of ['enter','exit']){
   d.reset();d.state.breathTime=0;d.setVariant('after');d.setMode(mode);if(mode!=='control')d.setPhase(.25);
   if(direction==='exit'){d.setCrouched(true);for(let i=0;i<24;i++)d.step(.05)}
   d.setCrouched(direction==='enter');let previous=m.morphTargetInfluences[24];
   for(let i=0;i<160;i++){d.step(.005);for(const w of m.morphTargetInfluences.slice(24))maxWeightError=Math.max(maxWeightError,Math.abs(w-.75*d.state.crouchBlend));const w=m.morphTargetInfluences[24];maxWeightStep=Math.max(maxWeightStep,Math.abs(w-previous));previous=w}
  }
  return {result,maxWeightError,maxWeightStep};
 });
 assert.deepEqual(errors,[]);for(const [mode,o] of Object.entries(local.result)){
  assert.ok(o.maxBones<2e-5&&o.maxWeights<2e-5&&o.maxOutside<2e-5,JSON.stringify([mode,o]));
  if(mode!=='crouch')assert.ok(o.maxExtra<1e-7,JSON.stringify([mode,o]));
 }
 const c=local.result.crouch;assert.ok(Math.abs(c.minExtra-.75)<1e-6&&Math.abs(c.maxExtra-.75)<1e-6);assert.ok(c.nearKneeCount>1000&&c.nearKneeSum/c.nearKneeCount>.005&&c.maxKnee<.06);
 assert.ok(local.maxWeightError<1e-6&&local.maxWeightStep<.02,JSON.stringify(local));
 console.log(`PASS: 32 phases each of walk/run/crouch preserve bones and old weights, and remain unchanged outside the intended regions; knee sample mean ${(1000*c.nearKneeSum/c.nearKneeCount).toFixed(2)} mm, max ${(1000*c.maxKnee).toFixed(2)} mm`);
 console.log(`PASS: knee shapes inactive upright and fade with crouch blend in sampled 5 ms transitions (max weight step ${local.maxWeightStep.toFixed(5)})`);
 console.log('NOTE: sampled displacement is not a volume or anatomy measurement, and does not prove all transitions smooth.');
}finally{await browser.close()}
