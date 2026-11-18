// Browser-side regression for all legacy clips and the overlapping neck/ear seams.
// The seam numbers are relative sampled distances, not proof of a watertight mesh.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default;
const argv=process.argv.slice(2),output=path.resolve(argv.find(x=>!x.startsWith('--'))||path.join(root,'work/male-zomboid-style'));
const arg=argv.find(x=>x.startsWith('--screenshots=')),shots=arg?path.resolve(arg.slice('--screenshots='.length)):fs.mkdtempSync(path.join(os.tmpdir(),'bow-neck-review-'));
fs.mkdirSync(shots,{recursive:true});const errors=[];
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',dumpio:true,
 args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],defaultViewport:{width:1280,height:900,deviceScaleFactor:1}});
async function open(file){const page=await browser.newPage();
 page.on('pageerror',e=>errors.push('page: '+e.message));page.on('console',m=>{if(m.type()==='error'||(m.type()==='warn'&&m.text().startsWith('THREE.')))errors.push('console: '+m.text())});
 await page.setRequestInterception(true);page.on('request',r=>{if(/^(file|data|blob):/i.test(r.url()))r.continue();else{errors.push('external: '+r.url());r.abort()}});
 await page.setOfflineMode(true);await page.goto(pathToFileURL(file).href,{waitUntil:'load',timeout:120_000});await page.waitForFunction('window.ready===true',{timeout:120_000});
 await page.evaluate(()=>demo.setManual(true));return page;
}
try{
 const [previous,page]=await Promise.all([open(path.join(root,'work/male-belly-triceps/index.html')),open(path.join(output,'index.html'))]);
 const sample=({name,phase,current})=>{
  const d=demo;d.mixer.stopAllAction();const clip=d.clips.get(name),a=d.mixer.clipAction(clip);
  a.reset().setEffectiveWeight(1).play();a.paused=true;a.time=phase*clip.duration;d.mixer.update(0);
  const head=d.male.getObjectByName('head_1'),body=d.male.getObjectByName('head_2'),arm=body.morphTargetInfluences[0],profile=body.morphTargetInfluences[1];
  head.morphTargetInfluences[0]=0;body.morphTargetInfluences[1]=0;
  d.scene.updateMatrixWorld(true);const v=d.camera.position.clone(),out=[];
  for(const n of ['head_1','head_2','ear-makehuman-left','ear-makehuman-right']){const mesh=d.male.getObjectByName(n),p=mesh.geometry.attributes.position;if(mesh.skeleton)mesh.skeleton.update();
   for(let i=0;i<p.count;i+=9){mesh.getVertexPosition(i,v);v.applyMatrix4(mesh.matrixWorld);out.push(v.x,v.y,v.z)}}
  return {out,arm,profile};
 };
 const names=['Idle_Breathing','Walk_Loop','Run_Loop','Test_Arms','Test_Elbow','Test_Knee','Test_Head','Previous_Walk','Previous_Refined_Idle','Previous_Idle','Previous_Arms','Previous_Knee','Reference_Walk','Reference_Run','Corrected_Walk','Corrected_Run','Adjusted_Walk','Adjusted_Run'];
 let worst=0,armWeight=0;
 for(const name of names)for(const phase of [0,.17,.5,.83]){
  const a=await previous.evaluate(sample,{name,phase,current:false}),b=await page.evaluate(sample,{name,phase,current:true});assert.equal(a.out.length,b.out.length);
  for(let i=0;i<a.out.length;i++)worst=Math.max(worst,Math.abs(a.out[i]-b.out[i]));
  armWeight=Math.max(armWeight,Math.abs(a.arm-b.arm));
  if(name==='Test_Arms')assert.equal(b.profile,1,'arm clip must retain the default neck morph');
 }
 assert.ok(worst<2e-6,`previous clip deformations differ by ${worst}`);assert.ok(armWeight<1e-6,`arm corrective weight differs by ${armWeight}`);
 console.log(`PASS: all 18 previous clips at four phases match the previous viewer with the profile off (max component delta ${worst}); arm correction and profile weight retained`);
 await previous.close();

 const seam=await page.evaluate(()=>{
  const d=demo,v=d.camera.position.clone(),names=['head_1','head_2','ear-makehuman-left','ear-makehuman-right'];
  function snap(clip,phase,weight){
   d.mixer.stopAllAction();if(clip!=='rest'){const c=d.clips.get(clip),a=d.mixer.clipAction(c);a.reset().setEffectiveWeight(1).play();a.paused=true;a.time=c.duration*phase;d.mixer.update(0)}
   d.male.getObjectByName('head_1').morphTargetInfluences[0]=weight;d.male.getObjectByName('head_2').morphTargetInfluences[1]=weight;
   d.scene.updateMatrixWorld(true);const result={};for(const n of names){const o=d.male.getObjectByName(n),p=o.geometry.attributes.position,a=new Float64Array(p.count*3);if(o.skeleton)o.skeleton.update();
    for(let i=0;i<p.count;i++){o.getVertexPosition(i,v);v.applyMatrix4(o.matrixWorld);a.set(v.toArray(),3*i)}result[n]=a}return result;
  }
  function pairs(a,b,filter){const list=[];for(let i=0;i<a.length;i+=3){if(!filter(a,i))continue;let best=Infinity,bj=0;for(let j=0;j<b.length;j+=3){const x=(a[i]-b[j])**2+(a[i+1]-b[j+1])**2+(a[i+2]-b[j+2])**2;if(x<best){best=x;bj=j}}if(best<.003**2)list.push([i,bj])}return list}
  function dist(a,b,i,j){return Math.hypot(a[i]-b[j],a[i+1]-b[j+1],a[i+2]-b[j+2])}
  function change(pairs,a,b,c,e){let max=0;for(const [i,j] of pairs)max=Math.max(max,Math.abs(dist(a,b,i,j)-dist(c,e,i,j)));return max}
  const base=snap('rest',0,0),head=base.head_1,body=base.head_2,bodySel=[];for(let j=0;j<body.length;j+=3)if(body[j+1]>1.54&&body[j+1]<1.62)bodySel.push(j);
  const neck=[];for(let i=0;i<head.length;i+=3)if(head[i+1]>1.55&&head[i+1]<1.61){let best=Infinity,bj=0;for(const j of bodySel){const x=(head[i]-body[j])**2+(head[i+1]-body[j+1])**2+(head[i+2]-body[j+2])**2;if(x<best){best=x;bj=j}}if(best<.003**2)neck.push([i,bj])}
  const ears=Object.fromEntries(names.slice(2).map(n=>[n,pairs(base[n],head,()=>true)])),poses={};
  const checks=[['rest',0],['Test_Head',.125],['Test_Head',.25],['Test_Head',.5],['Test_Head',.75],['Test_Arms',.5],['Idle_Breathing',.25],
   ...[0,.125,.25,.375,.5,.625,.75,.875].map(p=>['Adjusted_Walk',p]),
   ...[0,.125,.25,.375,.5,.625,.75,.875].map(p=>['Adjusted_Run',p]),
   ...[0,.125,.25,.375,.5,.625,.75,.875].map(p=>['Game_Style_Walk',p]),
   ...[0,.125,.25,.375,.5,.625,.75,.875].map(p=>['Game_Style_Jog',p]),['Run_Loop',.25],['Run_Loop',.5],['Run_Loop',.75]];
  for(const [clip,phase] of checks){const a=snap(clip,phase,0),b=snap(clip,phase,1),ear={};for(const n of names.slice(2))ear[n]=change(ears[n],a[n],a.head_1,b[n],b.head_1);
   poses[clip+':'+phase]={neck:change(neck,a.head_1,a.head_2,b.head_1,b.head_2),ear}}
  return {neckPairs:neck.length,earPairs:Object.fromEntries(Object.entries(ears).map(([k,v])=>[k,v.length])),poses};
 });
 assert.ok(seam.neckPairs>1000);for(const n of Object.values(seam.earPairs))assert.ok(n>50);
 let neckMax=0,earMax=0;for(const s of Object.values(seam.poses)){neckMax=Math.max(neckMax,s.neck);earMax=Math.max(earMax,...Object.values(s.ear))}
 assert.ok(neckMax<.0002,`neck overlap change ${neckMax}`);assert.ok(earMax<.00001,`ear/head attachment change ${earMax}`);
 console.log(`PASS: ${seam.neckPairs} nearby neck/head and ${JSON.stringify(seam.earPairs)} ear/head vertex pairs sampled across turn, arms, breathing, walking and running; max distance change ${(neckMax*1000).toFixed(3)} mm and ${(earMax*1000).toFixed(5)} mm (not a watertightness test)`);

 // Sample pitch, yaw and roll of the head and the pelvis/spine relationship.
 // These bounds catch this trial's former offsets, not a definition of natural gait.
 const posture=await page.evaluate(()=>{
  const d=demo,q=d.camera.quaternion.clone(),e=d.camera.rotation.clone(),result={};
  d.mixer.stopAllAction();for(const a of Object.values(d.actions)){a.reset().play();a.paused=true}
  function angles(name){d.male.getObjectByName(name).getWorldQuaternion(q);e.setFromQuaternion(q,'YXZ');return [e.x,e.y,e.z].map(v=>v*180/Math.PI)}
  function stats(v){return [Math.min(...v),Math.max(...v),v.reduce((a,b)=>a+b,0)/v.length]}
  for(const variant of ['before','after'])for(const mode of ['walk','run']){
   d.reset();d.setVariant(variant);d.setMode(mode);d.setPlaying(false);const head=[[],[],[]],curvature=[];
   for(let i=0;i<120;i++){
    d.setPhase(i/120);d.scene.updateMatrixWorld(true);const h=angles('Rig_Head'),hips=angles('Rig_Hips'),spine=angles('Rig_Spine');
    for(let k=0;k<3;k++)head[k].push(h[k]);curvature.push(Math.abs(spine[0]-hips[0]));
   }
   result[variant+'/'+mode]={pitch:stats(head[0]),yaw:stats(head[1]),roll:stats(head[2]),spineHipsPitchDifference:stats(curvature)};
  }return result;
 });
 for(const mode of ['walk','run']){
  const p=posture['after/'+mode];for(const axis of ['pitch','yaw','roll'])assert.ok(p[axis][0]>-8&&p[axis][1]<8,`${mode} head ${axis}: ${p[axis]}`);
  assert.ok(Math.abs(p.yaw[2])<2&&Math.abs(p.roll[2])<2,mode+' one-sided head bias');
 }
 console.log('PASS: sampled head angles and torso posture at 120 phases: '+JSON.stringify(posture));

 // Screenshots are for human review under the actual viewer lighting.
 for(const [name,clip,phase,yaw,weight] of [['rest-side-before','rest',0,Math.PI/2,0],['rest-side-after','rest',0,Math.PI/2,1],
  ['turn-back-before','Test_Head',.5,Math.PI,0],['turn-back-after','Test_Head',.5,Math.PI,1],['turn-side-after','Test_Head',.5,Math.PI/2,1]]){
  await page.evaluate(({clip,phase,yaw,weight})=>{const d=demo;d.mixer.stopAllAction();if(clip!=='rest'){const c=d.clips.get(clip),a=d.mixer.clipAction(c);a.reset().setEffectiveWeight(1).play();a.paused=true;a.time=c.duration*phase;d.mixer.update(0)}
   d.male.getObjectByName('head_1').morphTargetInfluences[0]=weight;d.male.getObjectByName('head_2').morphTargetInfluences[1]=weight;d.setView('neck');d.setYaw(yaw);d.draw()},{clip,phase,yaw,weight});
  await (await page.$('#view canvas')).screenshot({path:path.join(shots,name+'.png')});
 }
 await page.close();assert.deepEqual(errors,[],errors.join('\n'));console.log(`PASS: no browser errors, Three.js warnings or external requests; screenshots: ${shots}`);
}catch(error){console.error(error);process.exitCode=1}finally{await browser.close()}
