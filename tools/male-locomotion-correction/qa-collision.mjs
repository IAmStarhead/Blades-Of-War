// Selected deformed-surface intersection and foot-floor sampling. The BVHs
// cover hands/forearms and lower-body triangles, not every anatomical region,
// enclosed volumes, continuous time, or physically simulated self-collision.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default;
const output=path.resolve(process.argv[2]||path.join(root,'work/male-locomotion-correction'));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bow-contact-qa-')),bundle=path.join(temp,'collision.js');
execFileSync(path.join(here,'node_modules/.bin/esbuild'),[path.join(here,'qa-collision-helper.mjs'),'--bundle','--format=iife','--outfile='+bundle],{stdio:'pipe'});
const errors=[];let injectingHelper=false,helperWarnings=0;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
 args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],defaultViewport:{width:1280,height:900}});
try{
 const page=await browser.newPage();
 page.on('pageerror',e=>errors.push('page: '+e.message));page.on('console',m=>{
  // The isolated test helper bundles Three again. Ignore only its expected
  // warning during injection; warnings from the actual viewer still fail QA.
  if(injectingHelper&&m.type()==='warn'&&m.text()==='THREE.WARNING: Multiple instances of Three.js being imported.'){helperWarnings++;return}
  if(m.type()==='error'||(m.type()==='warn'&&m.text().startsWith('THREE.')))errors.push('console: '+m.text());
 });
 await page.setRequestInterception(true);page.on('request',r=>{if(/^(file|data|blob):/i.test(r.url()))r.continue();else{errors.push('external: '+r.url());r.abort()}});
 await page.setOfflineMode(true);await page.goto(pathToFileURL(path.join(output,'index.html')).href,{waitUntil:'load',timeout:120_000});
 await page.waitForFunction('window.ready===true',{timeout:120_000});injectingHelper=true;await page.addScriptTag({path:bundle});injectingHelper=false;
 const values=await page.evaluate(()=>{
  const d=demo;d.setManual(true);d.setVariant('after');d.reset();const stats=initCollision();
  const body=d.male.getObjectByName('head_2'),p=body.geometry.attributes.position,v=d.camera.position.clone(),ids={L:[],R:[]};
  for(let i=0;i<p.count;i++)if(p.getY(i)<.12&&Math.abs(p.getX(i))>.03&&Math.abs(p.getX(i))<.22)ids[p.getX(i)>0?'L':'R'].push(i);
  function feet(){
   d.scene.updateMatrixWorld(true);body.skeleton.update();const result={};
   for(const side of ['L','R']){let minimum=Infinity,z=0;
    for(const i of ids[side]){body.getVertexPosition(i,v);v.applyMatrix4(body.matrixWorld);minimum=Math.min(minimum,v.y);z+=v.z}
    result[side]={minimum,centroidZ:z/ids[side].length};
   }return result;
  }
  function sample(collision=true){
   const correction=d.state.floorCorrection,foot=feet(),col=collision?testCollision():null;
   return {foot,col,correction,phase:d.state.phase,root:d.male.getObjectByName('Rig_Root').position.y,
           motion:d.state.motionBlend,run:d.state.runBlend,speed:d.state.actualSpeed,ik:d.state.footIK||0};
  }
  const cycles={};
  for(const mode of ['walk','run']){
   d.reset();d.setMode(mode);d.setPlaying(false);cycles[mode]=[];
   for(let i=0;i<120;i++){d.setPhase(i/120);cycles[mode].push(sample())}
  }
  const blends={};
  for(const sequence of ['idle-walk','idle-run','walk-run']){
   const [from,to]=sequence.split('-').map(x=>x==='idle'?'soft':x);blends[sequence]=[];d.reset();
   for(let i=0;i<32;i++)for(const w of [.2,.4,.6,.8]){
    for(const a of Object.values(d.actions))a.setEffectiveWeight(0);
    for(const [name,weight] of [[from,1-w],[to,w]]){const action=d.actions[name];action.setEffectiveWeight(weight);action.time=action.getClip().duration*i/32}
    d.mixer.update(0);d.preventFloorPenetration();blends[sequence].push(sample());
   }
  }
  // Real controller, with acceleration, phase advancement, blend weights,
  // release, reverse direction and reset. The path stays away from the well.
  d.reset();d.player.position.set(6,0,5);d.setView('inspect');d.setYaw(0);d.player.rotation.y=Math.PI;
  const transitions={};function stage(name,frames){transitions[name]=[];for(let i=0;i<frames;i++){d.step(1/60);transitions[name].push(sample())}}
  d.keys.add('KeyW');stage('idle→walk',75);
  d.keys.add('ShiftLeft');stage('walk→run',75);
  d.keys.delete('ShiftLeft');stage('run→walk',75);
  d.keys.clear();stage('walk→idle',75);
  d.keys.add('KeyW');d.keys.add('ShiftLeft');stage('idle→run',75);
  d.keys.delete('KeyW');d.keys.add('KeyS');stage('reverse',75);
  d.keys.clear();stage('run→idle',75);
  d.reset();d.state.breathTime=0;d.setVariant('after');const reset1=sample(false);
  for(let i=0;i<360;i++)d.step(1/60);
  d.reset();d.state.breathTime=0;d.setVariant('after');const reset2=sample(false);
  const afterSecondGuard=d.preventFloorPenetration();
  // At actual controller speed, track both feet after acceleration over three
  // seconds. The centroid of the selected foot-region vertices is a proxy:
  // heel/toe roll can move it even when the surface is in contact.
  const locomotion={};
  for(const mode of ['walk','run']){
   d.reset();d.player.position.set(6,0,5);d.setYaw(0);d.player.rotation.y=Math.PI;d.keys.add('KeyW');
   if(mode==='run')d.keys.add('ShiftLeft');
   for(let i=0;i<90;i++)d.step(1/60);
   const arr=[];for(let i=0;i<180;i++){d.step(1/60);arr.push(sample(false))}locomotion[mode]=arr;d.keys.clear();
  }
  return {stats,counts:{L:ids.L.length,R:ids.R.length},cycles,blends,transitions,reset1,reset2,afterSecondGuard,locomotion};
 });
 console.log('Selected regions:',JSON.stringify(values.stats),'foot vertices:',JSON.stringify(values.counts));
 assert.ok(values.counts.L>1000&&values.counts.R>1000);
 let hits=0,minFoot=Infinity,maxCorrection=0,maxIK=0,worstClearance={L:Infinity,R:Infinity};
 function summarize(label,groups){
  for(const [name,arr] of Object.entries(groups)){
   let bad=0,low=Infinity,up=0,ik=0,left=Infinity,right=Infinity;
   for(const s of arr){
    if(s.col.L.hit||s.col.R.hit)bad++;
    for(const side of ['L','R']){low=Math.min(low,s.foot[side].minimum);const dist=s.col[side].dist;if(dist!==null){if(side==='L')left=Math.min(left,dist);else right=Math.min(right,dist)}}
    up=Math.max(up,s.correction||0);ik=Math.max(ik,s.ik||0);
   }
   hits+=bad;minFoot=Math.min(minFoot,low);maxCorrection=Math.max(maxCorrection,up);maxIK=Math.max(maxIK,ik);worstClearance.L=Math.min(worstClearance.L,left);worstClearance.R=Math.min(worstClearance.R,right);
   console.log(`${label} ${name}: ${arr.length} samples, selected intersections ${bad}, min foot ${(low*1000).toFixed(2)} mm, max root lift ${(up*1000).toFixed(2)} mm, max ankle IK request ${(ik*1000).toFixed(2)} mm, selected L/R clearance ${isFinite(left)?(left*1000).toFixed(2):'>50'}/${isFinite(right)?(right*1000).toFixed(2):'>50'} mm`);
  }
 }
 summarize('cycle',values.cycles);summarize('artificial blend',values.blends);summarize('controller',values.transitions);
 assert.equal(hits,0,'selected hand/body surface intersection');
 assert.ok(minFoot>=.00095,`sampled foot penetrated floor: ${minFoot}`);
 assert.ok(maxCorrection<.01,`unexpected vertical root lift: ${maxCorrection}`);
 assert.ok(maxIK<.2,`unexpected vertical ankle adjustment: ${maxIK}`);
 const actual=Object.values(values.transitions).flat();let maxRootStep=0,maxGuardStep=0;
 for(let i=1;i<actual.length;i++){
  maxRootStep=Math.max(maxRootStep,Math.abs(actual[i].root-actual[i-1].root));
  maxGuardStep=Math.max(maxGuardStep,Math.abs(actual[i].correction-actual[i-1].correction));
 }
 console.log(`Actual controller at 60 Hz: largest root vertical step ${(maxRootStep*1000).toFixed(2)} mm; largest guard change ${(maxGuardStep*1000).toFixed(2)} mm`);
 assert.ok(maxRootStep<.025,'large root discontinuity during controller transitions');
 assert.ok(Math.abs(values.reset1.root-values.reset2.root)<1e-6,'root did not return to the same idle pose');
 assert.ok(values.afterSecondGuard.correction<1e-6,'floor guard not idempotent');
 console.log('PASS: root reset and repeated guard application; sampled feet remain above floor');
 for(const [mode,arr] of Object.entries(values.locomotion)){
  const speed=arr.reduce((sum,s)=>sum+s.speed,0)/arr.length;
  const flight=arr.filter(s=>s.foot.L.minimum>.012&&s.foot.R.minimum>.012).length/arr.length;
  const contact={};for(const side of ['L','R']){
   let segments=[],current=[];
   for(const sample of arr){if(sample.foot[side].minimum<.012)current.push(sample.foot[side].centroidZ);else{if(current.length>=4)segments.push(current);current=[]}}
   if(current.length>=4)segments.push(current);
   contact[side]=segments.map(a=>({samples:a.length,centroidRangeMm:(Math.max(...a)-Math.min(...a))*1000}));
  }
  console.log(`Controller ${mode}: mean speed ${speed.toFixed(3)} m/s; both feet >12 mm in ${(100*flight).toFixed(1)}% of samples; low-foot centroid movement by interval (mm, includes roll): ${JSON.stringify(contact)}`);
  assert.ok(Math.abs(speed-(mode==='walk'?.9:2.2))<.05,mode+' speed differs from controller');
  assert.ok(contact.L.length>0&&contact.R.length>0,mode+' missing low-foot sample on a side');
 }
 assert.deepEqual(errors,[],errors.join('\n'));console.log(`PASS: no viewer errors, Three.js warnings or external requests (${helperWarnings} expected isolated helper warning ignored)`);
 console.log('NOTE: selected discrete surface tests are not proof of no self-intersection; the low-foot centroid is not a fixed contact point.');
}catch(error){console.error(error);process.exitCode=1}finally{await browser.close();fs.rmSync(temp,{recursive:true,force:true})}
