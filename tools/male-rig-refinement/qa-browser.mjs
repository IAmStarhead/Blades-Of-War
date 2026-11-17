// Offline WebGL QA: animation, skin deformation, ear attachment, unchanged
// well, bind-pose render comparison, responsive layouts, and camera controls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default;
const argv=process.argv.slice(2),output=path.resolve(argv.find(x=>!x.startsWith('--'))||path.join(root,'work/male-rig-refinement'));
const shotsArg=argv.find(x=>x.startsWith('--screenshots='));
const shots=shotsArg?path.resolve(shotsArg.slice('--screenshots='.length)):fs.mkdtempSync(path.join(os.tmpdir(),'bow-refine-review-'));
fs.mkdirSync(shots,{recursive:true});
const errors=[];
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),
 headless:'shell',dumpio:true,args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],
 defaultViewport:{width:1280,height:720,deviceScaleFactor:1}});
async function open(file,viewport,reduceMotion=false){
 const page=await browser.newPage();if(viewport)await page.setViewport(viewport);
 if(reduceMotion)await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
 page.on('pageerror',e=>errors.push('page: '+e.message));
 page.on('console',m=>{if(m.type()==='error'||(m.type()==='warn'&&m.text().startsWith('THREE.')))errors.push('console: '+m.text())});
 await page.setRequestInterception(true);page.on('request',r=>{
  if(/^(file|data|blob):/i.test(r.url()))r.continue();else{errors.push('external request: '+r.url());r.abort()}
 });
 await page.setOfflineMode(true);await page.goto(pathToFileURL(file).href,{waitUntil:'load',timeout:120_000});
 await page.waitForFunction('window.ready===true',{timeout:120_000});return page;
}
const frame=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const near=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const nearArray=(a,b,tol=1e-6)=>a.forEach((x,i)=>near(x,b[i],tol));
const pose=page=>page.evaluate(()=>({view:demo.state.view,position:demo.camera.position.toArray(),target:demo.controls.target.toArray(),
 distance:demo.camera.position.distanceTo(demo.controls.target),yaw:demo.currentYaw(),
 elevation:Math.asin((demo.camera.position.y-demo.controls.target.y)/demo.camera.position.distanceTo(demo.controls.target)),well:demo.well.visible}));

try{
 const page=await open(path.join(output,'index.html'));await frame(page);
 const status=await page.evaluate(()=>({view:demo.state.view,motion:demo.state.motion,version:demo.state.version,playing:demo.state.playing,bones:demo.bones.length,
  clips:[...demo.clips.keys()],well:demo.well.visible,skeleton:demo.skeleton.visible,zoom:demo.controls.enableZoom,pan:demo.controls.enablePan,
  two:demo.controls.touches.TWO,skinned:['head_1','head_2'].map(n=>demo.male.getObjectByName(n).isSkinnedMesh)}));
 assert.deepEqual(status,{view:'inspect',motion:'idle',version:'after',playing:true,bones:22,
  clips:['Idle_Breathing','Test_Arms','Test_Elbow','Test_Knee','Test_Head','Previous_Idle','Previous_Arms','Previous_Knee'],well:false,skeleton:false,zoom:false,pan:false,two:null,skinned:[true,true]});
 await page.waitForFunction('demo.action && demo.action.time > .2',{timeout:30_000});
 await page.click('[data-play]');const stopped=await page.evaluate(()=>demo.action.time);await frame(page);
 near(await page.evaluate(()=>demo.action.time),stopped);assert.equal(await page.$eval('[data-play]',b=>b.textContent),'Пуск');
 await page.$eval('#phase',n=>{n.value='500';n.dispatchEvent(new Event('input',{bubbles:true}))});
 near(await page.evaluate(()=>demo.action.time),2);assert.equal(await page.evaluate(()=>demo.state.playing),false);
 await page.click('[data-play]');await page.waitForFunction('demo.action.time > 2.1',{timeout:30_000});
 await page.click('[data-skeleton]');assert.equal(await page.evaluate(()=>demo.skeleton.visible),true);assert.equal(await page.$eval('[data-skeleton]',b=>b.getAttribute('aria-pressed')),'true');
 await page.click('[data-skeleton]');assert.equal(await page.evaluate(()=>demo.skeleton.visible),false);
 for(const name of ['arms','elbow','knee','head','rest','idle']){
  await page.click(`[data-motion="${name}"]`);assert.equal(await page.evaluate(()=>demo.state.motion),name);
  assert.equal(await page.$eval(`[data-motion="${name}"]`,b=>b.getAttribute('aria-pressed')),'true');
  assert.equal(await page.$eval('#phase',x=>x.disabled),name==='rest');
 }
 console.log('PASS: real glTF clips autoplay, pause, scrub, resume, switch, reset and show/hide skeleton');

 await page.evaluate(()=>{demo.setMotion('arms',false);demo.setPhase(.5);demo.setView('inspect')});
 const fixedCamera=await pose(page);
 near(await page.evaluate(()=>demo.male.getObjectByName('head_2').morphTargetInfluences[0]),1);
 await page.click('[data-version="before"]');
 assert.equal(await page.evaluate(()=>demo.action.getClip().name),'Previous_Arms');
 near(await page.evaluate(()=>demo.action.time),2);near(await page.evaluate(()=>demo.male.getObjectByName('head_2').morphTargetInfluences[0]),0);
 assert.equal(await page.evaluate(()=>demo.state.playing),false);nearArray((await pose(page)).position,fixedCamera.position);
 assert.equal(await page.$eval('[data-version="before"]',x=>x.getAttribute('aria-pressed')),'true');
 await page.click('[data-version="after"]');
 assert.equal(await page.evaluate(()=>demo.action.getClip().name),'Test_Arms');
 near(await page.evaluate(()=>demo.action.time),2);near(await page.evaluate(()=>demo.male.getObjectByName('head_2').morphTargetInfluences[0]),1);
 nearArray((await pose(page)).position,fixedCamera.position);
 const continuity=await page.evaluate(()=>{demo.setMotion('idle',true);demo.setPhase(.4);demo.setPlaying(true);const t=demo.action.time;demo.setVersion('before');return {old:t,new:demo.action.time,playing:demo.state.playing,clip:demo.action.getClip().name}});
 near(continuity.old,continuity.new);assert.equal(continuity.playing,true);assert.equal(continuity.clip,'Previous_Idle');
 await page.evaluate(()=>{demo.setVersion('after');demo.setMotion('elbow',false);demo.setPhase(.5)});
 near(await page.evaluate(()=>demo.male.getObjectByName('head_2').morphTargetInfluences[0]),0);
 console.log('PASS: before/after switches preserve phase, camera and pause state; arm correction resets outside the new arm clip');

 await page.click('[data-view="detail"]');
 assert.equal(await page.evaluate(()=>demo.state.view),'detail');assert.equal(await page.$eval('[data-view="detail"]',b=>b.getAttribute('aria-pressed')),'true');
 // The active button remains readable while the mouse is hovering over it.
 assert.equal(await page.$eval('[data-view="detail"]',b=>getComputedStyle(b).backgroundColor),'rgb(226, 205, 164)');
 await page.evaluate(()=>{demo.setMotion('knee',false);demo.setPhase(.5);demo.setYaw(Math.PI/2)});
 const detailKnee=await pose(page);nearArray(detailKnee.target,[1.1,.5,.1]);near(detailKnee.yaw,Math.PI/2);assert.equal(detailKnee.well,false);
 await page.click('[data-version="before"]');near(await page.evaluate(()=>demo.action.time),2);nearArray((await pose(page)).position,detailKnee.position);
 await page.click('[data-version="after"]');near(await page.evaluate(()=>demo.action.time),2);nearArray((await pose(page)).position,detailKnee.position);
 await page.click('[data-motion="arms"]');const detailArms=await pose(page);nearArray(detailArms.target,[1,1.28,.15]);near(detailArms.yaw,Math.PI/2);
 await page.click('[data-motion="head"]');nearArray((await pose(page)).target,[1.004,1.67,.15]);
 await page.click('[data-view="inspect"]');assert.equal(await page.evaluate(()=>demo.state.view),'inspect');
 console.log('PASS: detail view follows the selected joint, retains angle and compares the same paused pose');

 // Deformed positions use the same morph and skinning matrices as the renderer.
 const deformation=await page.evaluate(()=>{
  const d=window.demo,q=d.camera.position.clone(),names=['head_2','head_1','ear-makehuman-left','ear-makehuman-right'];
  function snapshot(mode,phase){
   d.setMotion(mode,false);if(mode!=='rest')d.setPhase(phase);d.scene.updateMatrixWorld(true);const meshes={};
   for(const name of names){const o=d.male.getObjectByName(name),p=o.geometry.attributes.position,coords=new Float64Array(p.count*3);
    if(o.skeleton)o.skeleton.update();for(let i=0;i<p.count;i++){o.getVertexPosition(i,q);q.applyMatrix4(o.matrixWorld);coords.set(q.toArray(),3*i)}meshes[name]=coords;
   }
   const bones={};for(const name of ['Rig_Head','Rig_Hand_L','Rig_Hand_R','Rig_Foot_L','Rig_Foot_R'])bones[name]=d.male.getObjectByName(name).getWorldPosition(q).toArray();
   return {meshes,bones};
  }
  function diff(a,b){let max=0;for(let i=0;i<a.length;i+=3)max=Math.max(max,Math.hypot(a[i]-b[i],a[i+1]-b[i+1],a[i+2]-b[i+2]));return max}
  const base=snapshot('rest',0),result={bindDrift:{},maximum:{},boneMovement:{},closing:{},earAttachment:{},footMinimum:Infinity};
  for(const name of ['head_2','head_1']){
   const o=d.male.getObjectByName(name),p=o.geometry.attributes.position,a=base.meshes[name];let max=0;
   for(let i=0;i<p.count;i++)max=Math.max(max,Math.hypot(a[3*i]-(p.getX(i)+1),a[3*i+1]-p.getY(i),a[3*i+2]-(p.getZ(i)+.15)));
   result.bindDrift[name]=max;
  }
  const peaks={};for(const mode of ['idle','arms','elbow','knee','head']){
   const peak=peaks[mode]=snapshot(mode,.5),start=snapshot(mode,0),end=snapshot(mode,.999999);
   result.maximum[mode]=Object.fromEntries(names.map(n=>[n,diff(base.meshes[n],peak.meshes[n])]));
   result.closing[mode]=Math.max(...names.map(n=>diff(start.meshes[n],end.meshes[n])));
   result.boneMovement[mode]=Object.fromEntries(Object.keys(base.bones).map(n=>[n,Math.hypot(...base.bones[n].map((v,i)=>v-peak.bones[n][i]))]));
  }
  // Each ear is a rigid child, but the lower head vertices have blended neck
  // weights. Track the nearest head vertex for each ear vertex at rest.
  for(const ear of names.slice(2)){
   const e=base.meshes[ear],h=base.meshes.head_1,pairs=[];
   for(let i=0;i<e.length;i+=3){let best=Infinity,jbest=0;for(let j=0;j<h.length;j+=3){const z=(e[i]-h[j])**2+(e[i+1]-h[j+1])**2+(e[i+2]-h[j+2])**2;if(z<best){best=z;jbest=j}}pairs.push([i,jbest,Math.sqrt(best)])}
   for(const mode of ['idle','head']){const s=peaks[mode].meshes;let max=0;
    for(const [i,j,dist] of pairs){const after=Math.hypot(s[ear][i]-s.head_1[j],s[ear][i+1]-s.head_1[j+1],s[ear][i+2]-s.head_1[j+2]);max=Math.max(max,Math.abs(after-dist))}
    result.earAttachment[`${mode}/${ear}`]=max;
   }
  }
  // The model's head and neck are separate meshes. Measure how their nearby
  // surface samples separate while turning the head, not just the ear bones.
  {
   const h=base.meshes.head_1,body=base.meshes.head_2,turned=peaks.head.meshes;let count=0,max=0;
   for(let i=0;i<h.length;i+=3){if(h[i+1]>1.601)continue;let best=Infinity,jbest=0;
    for(let j=0;j<body.length;j+=3){if(body[j+1]<1.54)continue;const dist=(h[i]-body[j])**2+(h[i+1]-body[j+1])**2+(h[i+2]-body[j+2])**2;if(dist<best){best=dist;jbest=j}}
    if(best<.003**2){count++;const after=Math.hypot(turned.head_1[i]-turned.head_2[jbest],turned.head_1[i+1]-turned.head_2[jbest+1],turned.head_1[i+2]-turned.head_2[jbest+2]);max=Math.max(max,Math.abs(after-Math.sqrt(best)))}
   }
   result.neckAttachment={count,max};
  }
  // Check the moving leg at 81 phases against the neutral display floor.
  const body=d.male.getObjectByName('head_2'),p=body.geometry.attributes.position;d.setMotion('knee',false);
  for(let s=0;s<=80;s++){
   d.setPhase(s/80);d.scene.updateMatrixWorld(true);body.skeleton.update();
   for(let i=0;i<p.count;i++)if(p.getX(i)>.03&&p.getX(i)<.19&&p.getY(i)<.2){body.getVertexPosition(i,q);q.applyMatrix4(body.matrixWorld);result.footMinimum=Math.min(result.footMinimum,q.y)}
  }
  return result;
 });
 for(const x of Object.values(deformation.bindDrift))assert.ok(x<2e-6,'bind pose drift');
 for(const x of Object.values(deformation.closing))assert.ok(x<2e-5,'animation loop discontinuity');
 assert.ok(deformation.maximum.idle.head_2>.006&&deformation.maximum.idle.head_2<.035,'idle amplitude');
 assert.ok(deformation.maximum.idle.head_1>.006&&deformation.maximum.idle.head_1<.02,'idle head amplitude');
 assert.ok(deformation.boneMovement.idle.Rig_Foot_L<1e-6&&deformation.boneMovement.idle.Rig_Foot_R<1e-6,'idle moves feet');
 assert.ok(deformation.boneMovement.arms.Rig_Hand_L>.15&&deformation.boneMovement.arms.Rig_Hand_R>.15,'arms');
 assert.ok(deformation.boneMovement.elbow.Rig_Hand_L>.1&&deformation.boneMovement.elbow.Rig_Hand_R<1e-6,'elbow isolation');
 assert.ok(deformation.boneMovement.knee.Rig_Foot_L>.09&&deformation.boneMovement.knee.Rig_Foot_R<1e-6,'knee isolation');
 assert.ok(deformation.maximum.head.head_1>.015,'head does not turn');
 for(const x of Object.values(deformation.earAttachment))assert.ok(x<.0003,'ear/head attachment changed too much');
 assert.ok(deformation.neckAttachment.count>1000&&deformation.neckAttachment.max<.0003,'head/neck surface samples separated');
 assert.ok(deformation.footMinimum>-.002,'moving foot penetrates the display floor');
 console.log('PASS: bind pose, five closed cycles, visible joint tests and subtle breathing');
 console.log(`PASS: ear/head nearest-pair distance changes <= ${(Math.max(...Object.values(deformation.earAttachment))*1000).toFixed(3)} mm; head/neck <= ${(deformation.neckAttachment.max*1000).toFixed(3)} mm; foot stays above floor at sampled phases`);

 const comparison=await page.evaluate(()=>{
  const d=demo,v=d.camera.position.clone(),q=d.camera.quaternion.clone();
  function sample(version,motion,phase){
   d.setVersion(version);d.setMotion(motion,false);if(motion!=='rest')d.setPhase(phase);d.scene.updateMatrixWorld(true);
   const body=d.male.getObjectByName('head_2'),p=body.geometry.attributes.position,points=new Float64Array(p.count*3);body.skeleton.update();
   for(let i=0;i<p.count;i++){body.getVertexPosition(i,v);v.applyMatrix4(body.matrixWorld);points.set(v.toArray(),i*3)}
   const head=d.male.getObjectByName('Rig_Head').getWorldPosition(v).toArray();
   const knee=d.male.getObjectByName('Rig_Shin_L').getWorldPosition(v).toArray();
   const foot=d.male.getObjectByName('Rig_Foot_L'),footRotation=foot.getWorldQuaternion(q).toArray();
   return {points,head,knee,footRotation,morph:body.morphTargetInfluences[0]};
  }
  function distance(a,b){return Math.hypot(...a.map((x,i)=>x-b[i]))}
  function maxDiff(a,b){let max=0;for(let i=0;i<a.length;i+=3)max=Math.max(max,Math.hypot(a[i]-b[i],a[i+1]-b[i+1],a[i+2]-b[i+2]));return max}
  const rest=sample('after','rest',0),oldIdle=sample('before','idle',.5),newIdle=sample('after','idle',.5);
  const oldKnee=sample('before','knee',.5),newKnee=sample('after','knee',.5),oldArms=sample('before','arms',.5),newArms=sample('after','arms',.5);
  const oldElbow=sample('before','elbow',.5),newElbow=sample('after','elbow',.5),oldHead=sample('before','head',.5),newHead=sample('after','head',.5);
  const quat=(a,b)=>{const dot=Math.min(1,Math.abs(a.reduce((s,x,i)=>s+x*b[i],0)));return 2*Math.acos(dot)*180/Math.PI};
  return {oldBreath:distance(rest.head,oldIdle.head),newBreath:distance(rest.head,newIdle.head),
   kneeDifference:distance(oldKnee.knee,newKnee.knee),footAngleDifference:quat(oldKnee.footRotation,newKnee.footRotation),
   armDifference:maxDiff(oldArms.points,newArms.points),oldMorph:oldArms.morph,newMorph:newArms.morph,
   elbowDifference:maxDiff(oldElbow.points,newElbow.points),headDifference:maxDiff(oldHead.points,newHead.points)};
 });
 assert.ok(comparison.newBreath>comparison.oldBreath*2&&comparison.newBreath<.02,'breathing not visibly increased or too large');
 assert.ok(comparison.kneeDifference>.15&&comparison.footAngleDifference>10,'knee and ankle were not revised');
 assert.ok(comparison.armDifference>.01&&comparison.oldMorph===0&&Math.abs(comparison.newMorph-1)<1e-6,'shoulder comparison or correction');
 assert.ok(comparison.elbowDifference<1e-6&&comparison.headDifference<1e-6,'approved elbow or head pose changed');
 console.log(`PASS: breathing head motion ${(comparison.oldBreath*1000).toFixed(2)}→${(comparison.newBreath*1000).toFixed(2)} mm; foot world angle changes ${comparison.footAngleDifference.toFixed(1)}°; accepted head/elbow poses unchanged`);

 // Compare actual canvas pixels between inhale/exhale in the first and new
 // cycles, including the distant tactical view. This verifies that the change
 // is renderable, without promising visibility on every display or to everyone.
 const breathPixels=await page.evaluate(async()=>{
  const d=demo,load=url=>new Promise((resolve,reject)=>{const im=new Image;im.onload=()=>resolve(im);im.onerror=reject;im.src=url});
  const out={};for(const view of ['game','inspect'])for(const version of ['before','after']){
   const pictures=[];for(const phase of [0,.5]){d.setView(view);d.setYaw(d.views[view].startYaw);d.setVersion(version);d.setMotion('idle',false);d.setPhase(phase);d.draw();pictures.push(await load(d.renderer.domElement.toDataURL()))}
   const c=document.createElement('canvas');c.width=pictures[0].width;c.height=pictures[0].height;const ctx=c.getContext('2d',{willReadFrequently:true});
   ctx.drawImage(pictures[0],0,0);const a=ctx.getImageData(0,0,c.width,c.height).data;ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(pictures[1],0,0);const b=ctx.getImageData(0,0,c.width,c.height).data;
   let overFive=0;for(let i=0;i<a.length;i+=4){const diff=Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]));if(diff>5)overFive++}
   out[`${view}-${version}`]=overFive;
  }return out;
 });
 assert.ok(breathPixels['game-after']>breathPixels['game-before']*1.4&&breathPixels['inspect-after']>breathPixels['inspect-before']*1.4,'breathing pixel change did not increase');
 console.log(`PASS: inhale/exhale pixel changes increased at game distance (${breathPixels['game-before']}→${breathPixels['game-after']}) and in full-body view (${breathPixels['inspect-before']}→${breathPixels['inspect-after']})`);

 // Fingerprint all geometry, transforms, materials and the generated texture
 // of the prop in the old and new viewers, rather than relying on appearance.
 const previous=await open(path.join(root,'work/male-nape-seam/index.html'));
 const fingerprint=()=>{
  function hash(arr){let h=2166136261;const u=new Uint8Array(arr.buffer,arr.byteOffset,arr.byteLength);for(const b of u)h=Math.imul(h^b,16777619);return h>>>0}
  const rows=[];let texture='';demo.well.traverse(o=>{if(!o.isMesh)return;const m=o.material,g=o.geometry,a={};
   for(const k of Object.keys(g.attributes).sort())a[k]=[g.attributes[k].count,g.attributes[k].itemSize,hash(g.attributes[k].array)];
   const map=m.map;if(map&&!texture)texture=map.image.toDataURL();
   rows.push({position:o.position.toArray(),quaternion:o.quaternion.toArray(),scale:o.scale.toArray(),attributes:a,
    index:g.index&&[g.index.count,hash(g.index.array)],material:[m.type,m.color?.getHex(),m.side,m.flatShading,map?.wrapS,map?.wrapT,map?.minFilter,map?.magFilter],cast:o.castShadow,receive:o.receiveShadow});
  });return JSON.stringify({rows,texture});
 };
 assert.equal(await page.evaluate(fingerprint),await previous.evaluate(fingerprint),'well differs from previous viewer');
 console.log('PASS: detailed well geometry, materials, transforms and generated texture match the previous viewer');

 async function renderRest(pg,old){return pg.evaluate(old=>{
  if(old)demo.choose('after');else demo.setMotion('rest');demo.setView('inspect');demo.setYaw(0);
  demo.renderer.setPixelRatio(1);demo.renderer.setSize(640,640);demo.camera.aspect=1;demo.camera.updateProjectionMatrix();demo.draw();
  return demo.renderer.domElement.toDataURL();
 },old)}
 const before=await renderRest(previous,true),after=await renderRest(page,false);
 const imageDiff=await page.evaluate(async({before,after})=>{
  const images=await Promise.all([before,after].map(url=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=url})));
  const c=document.createElement('canvas');c.width=640;c.height=640;const ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(images[0],0,0);const a=ctx.getImageData(0,0,640,640).data;ctx.clearRect(0,0,640,640);ctx.drawImage(images[1],0,0);const b=ctx.getImageData(0,0,640,640).data;
  let sum=0,changed=0;for(let i=0;i<a.length;i+=4){let m=0;for(let j=0;j<3;j++){const v=Math.abs(a[i+j]-b[i+j]);sum+=v;m=Math.max(m,v)}if(m)changed++}
  return {mean:sum/(640*640*3),changed};
 },{before,after});
 assert.ok(imageDiff.mean<.01&&imageDiff.changed<500,`bind-pose render differs: ${JSON.stringify(imageDiff)}`);
 console.log(`PASS: bind-pose render vs previous trial, mean RGB delta ${imageDiff.mean.toFixed(6)}/255 (${imageDiff.changed} changed pixels of 409600)`);
 await previous.close();

 // Several aspect ratios, each at 4 camera presets, 8 yaw angles and 5
 // animation poses. Bounds are measured from skinned vertices, not rest boxes.
 const viewports=[['desktop',1280,720],['phone',390,844],['small phone',320,568],['minimum phone',290,568],['tall phone',360,896],
  ['landscape',568,320],['short phone',390,400],['large desktop',1920,1080]];
 for(const [label,width,height] of viewports){
  await page.setViewport({width,height,deviceScaleFactor:1});await frame(page);
  await page.click('[data-version="before"]');assert.equal(await page.$eval('[data-version="before"]',x=>x.getAttribute('aria-pressed')),'true');
  await page.click('[data-version="after"]');assert.equal(await page.$eval('[data-version="after"]',x=>x.getAttribute('aria-pressed')),'true');
  for(const motion of ['idle','arms','elbow','knee','head','rest']){
   await page.click(`[data-motion="${motion}"]`);
   const clipped=await page.evaluate(()=>[...document.querySelectorAll('button')].filter(b=>getComputedStyle(b).display!=='none'&&(b.scrollWidth>b.clientWidth+1||b.scrollHeight>b.clientHeight+1)).map(b=>b.textContent));
   assert.deepEqual(clipped,[],`${label}/${motion}: button text overflows`);
  }
  const result=await page.evaluate(()=>{
   const d=demo,v=d.camera.position.clone(),meshes=['head_2','head_1','ear-makehuman-left','ear-makehuman-right'];
   function coords(root){const out=[];root.traverse(o=>{if(!o.isMesh||!o.geometry?.attributes?.position)return;const p=o.geometry.attributes.position;if(o.skeleton)o.skeleton.update();
    for(let i=0;i<p.count;i++){o.getVertexPosition(i,v);v.applyMatrix4(o.matrixWorld);out.push(v.x,v.y,v.z)}
   });return out}
   const samples={};for(const motion of ['rest','arms','elbow','knee','head']){
    d.setMotion(motion,false);if(motion!=='rest')d.setPhase(.5);d.scene.updateMatrixWorld(true);
    const all=[],head=[];for(const name of meshes){const a=coords(d.male.getObjectByName(name));all.push(...a);if(name!=='head_2')head.push(...a)}
    samples[motion]={all,head};
   }
   d.scene.updateMatrixWorld(true);const well=[];d.well.traverse(o=>{if(!o.isMesh)return;const g=o.geometry;if(!g.boundingBox)g.computeBoundingBox();const b=g.boundingBox;
    for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){v.set(x,y,z).applyMatrix4(o.matrixWorld);well.push(v.x,v.y,v.z)}
   });
   function bounds(arr){const box=[Infinity,-Infinity,Infinity,-Infinity];for(let i=0;i<arr.length;i+=3){v.set(arr[i],arr[i+1],arr[i+2]).project(d.camera);box[0]=Math.min(box[0],v.x);box[1]=Math.max(box[1],v.x);box[2]=Math.min(box[2],v.y);box[3]=Math.max(box[3],v.y)}return box}
   const cases=[];for(const view of ['game','normal','inspect','head']){d.setView(view);
    for(let angle=0;angle<360;angle+=45){d.setYaw(angle*Math.PI/180);d.camera.updateMatrixWorld(true);
     const w=view==='game'||view==='normal'?bounds(well):null;
     for(const [motion,s] of Object.entries(samples))cases.push({view,angle,motion,male:bounds(view==='head'?s.head:s.all),well:w});
    }
   }
   d.setView('inspect');d.setYaw(0);d.setMotion('arms',false);d.setPhase(.5);d.draw();
   return {cases,page:[document.documentElement.clientWidth,document.documentElement.clientHeight,document.documentElement.scrollWidth,document.documentElement.scrollHeight],
    canvas:[d.renderer.domElement.clientWidth,d.renderer.domElement.clientHeight],aspect:d.camera.aspect,
    buttons:[...document.querySelectorAll('button')].filter(b=>getComputedStyle(b).display!=='none').map(b=>{const r=b.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom]})};
  });
  assert.equal(result.page[0],result.page[2],label+' horizontal overflow');assert.equal(result.page[1],result.page[3],label+' vertical overflow');
  near(result.aspect,result.canvas[0]/result.canvas[1],.003);
  for(const [left,top,right,bottom] of result.buttons)assert.ok(left>=0&&top>=0&&right<=width&&bottom<=height,label+' control outside viewport');
  for(const item of result.cases)for(const [name,box] of [['male',item.male],['well',item.well]])if(box){
   assert.ok(box[0]>=-1&&box[1]<=1&&box[2]>=-1&&box[3]<=1,`${label}/${item.view}/${item.angle}/${item.motion}/${name} cropped: ${box}`);
  }
  await page.click('[data-view="detail"]');
  const focused=await page.evaluate(()=>{
   const d=demo,v=d.camera.position.clone(),cases=[];
   for(const motion of ['knee','arms','idle','head']){
    d.setMotion(motion,false);d.setPhase(.5);d.scene.updateMatrixWorld(true);
    const list=motion==='knee'?['head_2']:motion==='head'?['head_1','ear-makehuman-left','ear-makehuman-right']:['head_2','head_1','ear-makehuman-left','ear-makehuman-right'];
    const points=[];for(const name of list){const o=d.male.getObjectByName(name),p=o.geometry.attributes.position;if(o.skeleton)o.skeleton.update();
     for(let i=0;i<p.count;i++){
      if(name==='head_2'&&(motion==='knee'?!(p.getX(i)>.03&&p.getX(i)<.19&&p.getY(i)<.75):p.getY(i)<1.15))continue;
      o.getVertexPosition(i,v);v.applyMatrix4(o.matrixWorld);points.push(v.x,v.y,v.z);
     }
    }
    for(let angle=0;angle<360;angle+=45){d.setYaw(angle*Math.PI/180);d.camera.updateMatrixWorld(true);const b=[Infinity,-Infinity,Infinity,-Infinity];
     for(let i=0;i<points.length;i+=3){v.set(points[i],points[i+1],points[i+2]).project(d.camera);b[0]=Math.min(b[0],v.x);b[1]=Math.max(b[1],v.x);b[2]=Math.min(b[2],v.y);b[3]=Math.max(b[3],v.y)}
     cases.push({motion,angle,box:b});
    }
   }
   return {cases,hint:getComputedStyle(document.querySelector('.scene-hint')).display};
  });
  for(const item of focused.cases){const b=item.box;
   assert.ok(b[0]>=-1&&b[1]<=1&&b[2]>=-1&&b[3]<=1,`${label}/detail/${item.angle}/${item.motion} focus cropped: ${b}`);
  }
  if(width<=600)assert.equal(focused.hint,'none',`${label} hint obscures close-up`);
  await page.click('[data-view="inspect"]');
  console.log(`PASS ${label}: controls, five poses, four full views and four detail focuses at eight camera rotations`);
 }

 await page.setViewport({width:1280,height:720,deviceScaleFactor:1});await frame(page);
 await page.click('[data-view="normal"]');await page.click('[data-reset]');const normal=await pose(page);assert.equal(normal.well,true);near(normal.yaw,0);
 await page.setViewport({width:390,height:844,deviceScaleFactor:1});await frame(page);const narrow=await pose(page);assert.ok(narrow.distance>normal.distance);nearArray(narrow.target,normal.target);
 await page.setViewport({width:1280,height:720,deviceScaleFactor:1});await frame(page);nearArray((await pose(page)).position,normal.position);
 await page.click('[data-rotate="1"]');await page.click('[data-rotate="1"]');const side=await pose(page);near(side.yaw,Math.PI/2);
 await page.click('[data-view="inspect"]');const inspected=await pose(page);near(inspected.yaw,side.yaw);assert.equal(inspected.well,false);
 await page.click('[data-view="game"]');await page.click('[data-reset]');const game=await pose(page);near(game.distance,10.6);near(game.elevation,52*Math.PI/180);near(game.yaw,25*Math.PI/180);assert.equal(game.well,true);
 await page.click('[data-view="head"]');await page.click('[data-reset]');const front=await pose(page);near(front.yaw,0);near(front.distance,.95);assert.equal(front.well,false);
 const canvas=await (await page.$('canvas')).boundingBox(),x=canvas.x+canvas.width/2,y=canvas.y+canvas.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+100,y+60,{steps:5});await page.mouse.up();const turned=await pose(page);
 assert.ok(Math.abs(turned.yaw-front.yaw)>.05,'drag did not rotate');near(turned.distance,.95);near(turned.elevation,0);nearArray(turned.target,front.target);
 await page.mouse.wheel({deltaY:-600});await frame(page);nearArray((await pose(page)).position,turned.position);
 console.log('PASS: fixed tactical distance, ordinary and close views, rotation, reset, resize and disabled wheel zoom');

 // Save representative frames for a human review, including the requested game distance.
 for(const [file,view,motion,phase,yaw] of [
  ['01-rest.png','inspect','rest',0,0],['02-shoulders.png','inspect','arms',.5,0],
  ['03-elbow-side.png','inspect','elbow',.5,Math.PI/2],['04-knee-side.png','inspect','knee',.5,Math.PI/2],
  ['05-head-back.png','head','head',.5,Math.PI],['06-together.png','normal','idle',.5,0],
  ['07-tactical.png','game','idle',.5,25*Math.PI/180],['08-skeleton.png','inspect','arms',.5,0],
 ]){
  await page.evaluate(({view,motion,phase,yaw,file})=>{demo.setView(view);demo.setYaw(yaw);demo.setMotion(motion,false);if(motion!=='rest')demo.setPhase(phase);demo.setSkeleton(file==='08-skeleton.png');demo.draw()},{view,motion,phase,yaw,file});
  await page.screenshot({path:path.join(shots,file)});
 }
 await page.setViewport({width:320,height:568,deviceScaleFactor:1});await frame(page);await page.evaluate(()=>{demo.setView('inspect');demo.setYaw(0);demo.setMotion('arms',false);demo.setPhase(.5);demo.setSkeleton(false);demo.draw()});
 await page.screenshot({path:path.join(shots,'09-small-phone.png')});
 await page.setViewport({width:568,height:320,deviceScaleFactor:1});await frame(page);await page.screenshot({path:path.join(shots,'10-landscape-phone.png')});
 await page.setViewport({width:1280,height:720,deviceScaleFactor:1});await frame(page);
 await page.evaluate(()=>{demo.setMotion('knee',false);demo.setView('detail');demo.setYaw(Math.PI/2);demo.setPhase(.5);demo.draw()});await page.screenshot({path:path.join(shots,'11-detail-knee.png')});
 await page.evaluate(()=>{demo.setMotion('arms',false);demo.setYaw(0);demo.setPhase(.5);demo.draw()});await page.screenshot({path:path.join(shots,'12-detail-shoulders.png')});
 await page.setViewport({width:320,height:568,deviceScaleFactor:1});await frame(page);
 await page.evaluate(()=>{demo.setMotion('knee',false);demo.setYaw(Math.PI/2);demo.setPhase(.5);demo.draw()});await page.screenshot({path:path.join(shots,'13-detail-small-phone.png')});
 await page.close();

 const mobile=await open(path.join(output,'index.html'),{width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true});await frame(mobile);
 const box=await (await mobile.$('canvas')).boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2,client=await mobile.createCDPSession(),beforeTouch=await pose(mobile);
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-22,y:cy,id:1},{x:cx+22,y:cy,id:2}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-75,y:cy,id:1},{x:cx+75,y:cy,id:2}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await frame(mobile);const pinch=await pose(mobile);nearArray(beforeTouch.position,pinch.position);nearArray(beforeTouch.target,pinch.target);
 await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx,y:cy,id:1}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx+75,y:cy+65,id:1}]});
 await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await frame(mobile);const swipe=await pose(mobile);
 assert.ok(Math.abs(swipe.yaw-pinch.yaw)>.05,'touch did not rotate');near(swipe.distance,beforeTouch.distance);nearArray(swipe.target,pinch.target);
 console.log('PASS: mobile two-finger zoom disabled and one-finger rotation works');await mobile.close();
 const reduced=await open(path.join(output,'index.html'),undefined,true);
 assert.equal(await reduced.evaluate(()=>demo.state.motion),'idle');assert.equal(await reduced.evaluate(()=>demo.state.playing),false);
 assert.equal(await reduced.$eval('[data-play]',x=>x.textContent),'Пуск');await reduced.click('[data-play]');assert.equal(await reduced.evaluate(()=>demo.state.playing),true);
 console.log('PASS: reduced-motion preference starts paused, with manual playback available');await reduced.close();
 assert.deepEqual(errors,[]);console.log(`PASS: no external network requests, browser errors, or Three.js warnings. Review frames: ${shots}`);
} finally {await browser.close()}
