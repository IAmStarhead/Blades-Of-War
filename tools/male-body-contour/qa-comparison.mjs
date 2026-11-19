// Compare the embedded before toggle against the actual last viewer, and
// verify that the two surfaces share motion and differ only in a bounded area.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default,output=path.resolve(process.argv[2]||path.join(root,'work/male-body-contour'));
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:180000});
const errors=[];
async function open(file){const p=await browser.newPage();p.on('pageerror',e=>errors.push(e.message));await p.setOfflineMode(true);await p.goto(pathToFileURL(file).href);await p.waitForFunction('window.ready===true',{timeout:120000});await p.evaluate(()=>demo.setManual(true));return p}
try{
 const trial=await open(path.join(output,'index.html')),last=await open(path.join(root,'work/male-body-volume/index.html'));
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
    records.push({id:[mode,playing,phase,direction,k].join('/'),vertices,bones:d.bones.flatMap(b=>[...b.position.toArray(),...b.quaternion.toArray()]),weights:m.morphTargetInfluences.slice(),state:[d.state.phase,d.state.crouchBlend,d.state.motionBlend,d.state.runBlend,d.state.floorCorrection||0,d.state.footIK||0]});
   }
  }return records;
 };
 const [fresh,previous]=await Promise.all([trial.evaluate(transitionData,false),last.evaluate(transitionData,true)]);assert.equal(fresh.length,previous.length);let maxPrevious=0;
 for(let i=0;i<fresh.length;i++){
  assert.equal(fresh[i].id,previous[i].id);for(const key of ['vertices','bones','weights','state']){
   assert.equal(fresh[i][key].length,previous[i][key].length);for(let j=0;j<fresh[i][key].length;j++)maxPrevious=Math.max(maxPrevious,Math.abs(fresh[i][key][j]-previous[i][key][j]));
  }
 }
 assert.ok(maxPrevious<2e-5,`Previous comparison deviated ${maxPrevious}`);
 console.log(`PASS: before toggle matches last viewer in ${fresh.length} sampled idle/walk/run crouch transitions; maximum component difference ${maxPrevious}`);
 const local=await trial.evaluate(()=>{
  const d=demo,m=d.male.getObjectByName('head_2'),g=m.geometry,ref=g.attributes._contour_last_position,v=d.camera.position.clone();
  let result={};
  for(const mode of ['walk','run','crouch']){
   const o=result[mode]={maxOutside:0,maxBones:0,maxWeights:0,frontSum:0,frontCount:0,rearSum:0,rearCount:0,max:0};
   d.reset();d.state.breathTime=0;d.setVariant('after');d.setMode(mode==='run'?'run':'walk');if(mode==='crouch'){d.setCrouched(true);for(let i=0;i<24;i++)d.step(.05)}
   for(let phase=0;phase<32;phase++){
    d.setPhase((phase+.37)/32);d.setVariant('before');d.scene.updateMatrixWorld(true);m.skeleton.update();
    const p=new Float32Array(ref.count*3);for(let i=0;i<ref.count;i++){m.getVertexPosition(i,v);p.set(v.toArray(),3*i)}
    const bones=d.bones.flatMap(b=>[...b.position.toArray(),...b.quaternion.toArray()]),weights=m.morphTargetInfluences.slice();
    d.setVariant('after');d.scene.updateMatrixWorld(true);m.skeleton.update();
    const newer=d.bones.flatMap(b=>[...b.position.toArray(),...b.quaternion.toArray()]);for(let i=0;i<bones.length;i++)o.maxBones=Math.max(o.maxBones,Math.abs(bones[i]-newer[i]));
    for(let i=0;i<weights.length;i++)o.maxWeights=Math.max(o.maxWeights,Math.abs(weights[i]-m.morphTargetInfluences[i]));
    for(let i=0;i<ref.count;i++){
     m.getVertexPosition(i,v);const diff=Math.hypot(v.x-p[3*i],v.y-p[3*i+1],v.z-p[3*i+2]),x=ref.getX(i),y=ref.getY(i),z=ref.getZ(i);
     if(y<=.84||y>=1.43)o.maxOutside=Math.max(o.maxOutside,diff);
     if(y>1.08&&y<1.3&&z>.085&&Math.abs(x)<.1){o.frontSum+=diff;o.frontCount++}
     if(y>.86&&y<1.02&&z<-.025&&Math.abs(x)<.1){o.rearSum+=diff;o.rearCount++}
     o.max=Math.max(o.max,diff);
    }
   }
  }return result;
 });
 assert.deepEqual(errors,[]);for(const [mode,o] of Object.entries(local)){
  assert.ok(o.maxBones<2e-5&&o.maxWeights<2e-5&&o.maxOutside<2e-5,JSON.stringify([mode,o]));
  assert.ok(o.frontCount>100&&o.frontSum/o.frontCount>.005&&o.rearCount>100&&o.rearSum/o.rearCount>.001&&o.max<.05,JSON.stringify([mode,o]));
  console.log(`PASS: ${mode}, 32 sampled phases: bones and all morph weights unchanged; outside region max ${(o.maxOutside*1000).toFixed(4)} mm; front mean ${(o.frontSum/o.frontCount*1000).toFixed(2)} mm, rear mean ${(o.rearSum/o.rearCount*1000).toFixed(2)} mm`);
 }
 console.log('NOTE: sampled displacements do not prove visual quality or absence of clipping.');
}finally{await browser.close()}
