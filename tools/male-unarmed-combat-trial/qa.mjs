// Browser checks for the separate scene. Samples and emulated touch cannot
// establish artistic quality, physical contact, or real-device performance.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const out=path.join(repo,'work/male-unarmed-combat-trial'),htmlPath=path.join(out,'index.html');
const target=process.argv[2]||pathToFileURL(htmlPath).href,isFile=target.startsWith('file:'),origin=isFile?'':new URL(target).origin;
const hash=b=>createHash('sha256').update(b).digest('hex'),html=fs.readFileSync(htmlPath,'utf8'),htmlSha=hash(Buffer.from(html));
assert.equal(hash(fs.readFileSync(path.join(repo,'work/male-stealth-posture-trial/index.html'))),'f0ed071fdf6e466ccaaa0ae6eab4410b11ca4bfd9de4095af9288369734046f8');
assert.equal(hash(fs.readFileSync(path.join(repo,'tools/male-rig-trial/well-source.mjs'))),'62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5');
const match=html.match(/const MODEL_URI='data:model\/gltf-binary;base64,([^']+)'/);assert.ok(match);
assert.equal(hash(Buffer.from(match[1],'base64')),'eb569ef2269a8d7e40378590614beebc933edd3bdcd7340f8146494ceb975484');
if(!isFile){const r=await fetch(target,{cache:'no-store'});assert.equal(r.status,200);assert.equal(hash(Buffer.from(await r.arrayBuffer())),htmlSha,'Server is not the final scene')}
const require=createRequire(import.meta.url),puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium').default;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
 args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:300000});
const errors=[];
async function open(url=target,viewport={width:1100,height:750,deviceScaleFactor:1},offline=isFile){
 const p=await browser.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'||m.text().includes('Multiple instances of Three.js'))errors.push(m.text())});
 await p.setViewport(viewport);await p.setRequestInterception(true);p.on('request',r=>{
  const u=r.url(),allowed=/^(file|data|blob):/i.test(u)||(!offline&&new URL(u).origin===origin);
  if(allowed)r.continue();else{errors.push('Unexpected external request '+u);r.abort()}
 });
 if(offline)await p.setOfflineMode(true);await p.goto(url,{waitUntil:'load',timeout:60000});await p.waitForFunction('window.ready===true',{timeout:60000});return p;
}
const near=(a,b,tol=1e-4)=>assert.ok(Math.abs(a-b)<=tol,`${a} != ${b} (±${tol})`);
const results={};
try{
 const page=await open();await page.evaluate(()=>{demo.setManual(true);demo.reset()});
 const init=await page.evaluate(()=>({clips:demo.gltf.animations.map(x=>x.name),bones:demo.male.getObjectByName('NewBody').skeleton.bones.length,
  well:demo.well.name,status:document.querySelector('#status').textContent,crouch:!!document.querySelector('#crouch'),
  fightClips:Object.keys(demo.motion.clips),vertices:demo.motion.floor.vertices}));
 assert.deepEqual(init.clips,['Walk_Game_Trial','Run_Game_Trial']);assert.equal(init.bones,52);assert.equal(init.well,'BowStoneWellProp');
 assert.equal(init.status,'Стоит');assert.equal(init.crouch,false);assert.ok(init.vertices>1000);
 for(const n of ['guard','combatWalk','jab','cross','kickR','kickL'])assert.ok(init.fightClips.includes(n));
 results.initial=init;console.log('PASS: unchanged embedded model/well, no crouch and expected combat clips.');

 const old=await open(pathToFileURL(path.join(repo,'work/male-stealth-posture-trial/index.html')).href,{width:800,height:600,deviceScaleFactor:1},true);
 await old.evaluate(()=>{demo.setManual(true);demo.reset()});
 const snapshot=()=>{const d=demo,mesh=d.male.getObjectByName('NewBody');d.male.updateMatrixWorld(true);mesh.skeleton.update();
  const v=d.camera.position.clone(),vertices=[];for(let i=0;i<mesh.geometry.attributes.position.count;i+=37){mesh.getVertexPosition(i,v);vertices.push(...v.toArray())}
  return {bones:mesh.skeleton.bones.flatMap(b=>[...b.position.toArray(),...b.quaternion.toArray()]),vertices,morph:mesh.morphTargetInfluences.slice(),floor:d.motion.floor.lift};};
 const parity={cases:0,bone:0,vertex:0,morph:0,floor:0};
 for(const weight of [0,.25,.5,.75,1])for(let i=0;i<16;i++){
  const phase=(i+.37)/16;
  await page.evaluate(({phase,weight})=>{const d=demo;d.player.position.set(0,0,0);d.player.rotation.y=0;d.motion.clock.phase=phase;d.motion.clock.weight=weight;d.motion.move=1;d.motion.combat=0;d.motion.render({inspectTime:null})},{phase,weight});
  await old.evaluate(({phase,weight})=>{const d=demo;d.player.position.set(0,0,0);d.player.rotation.y=0;d.motion.clock.phase=phase;d.motion.clock.weight=weight;d.motion.move=1;d.motion.crouch=0;d.motion.render({inspectTime:null})},{phase,weight});
  const a=await page.evaluate(snapshot),b=await old.evaluate(snapshot);parity.cases++;
  for(const [key,label] of [['bones','bone'],['vertices','vertex'],['morph','morph']]){assert.equal(a[key].length,b[key].length);for(let k=0;k<a[key].length;k++)parity[label]=Math.max(parity[label],Math.abs(a[key][k]-b[key][k]))}
  parity.floor=Math.max(parity.floor,Math.abs(a.floor-b.floor));
 }
 for(const k of ['bone','vertex','morph','floor'])assert.ok(parity[k]<1e-5,`Ordinary gait parity ${k}: ${parity[k]}`);
 // The same ordinary gait must also return after combat and a full kick, not
 // merely match on a freshly loaded page.
 await page.evaluate(()=>{demo.reset();demo.setFighting(true);for(let i=0;i<90;i++)demo.step(1/60);demo.attack('kick');for(let i=0;i<110;i++)demo.step(1/60);demo.setFighting(false);for(let i=0;i<180;i++)demo.step(1/60)});
 let afterCombatMax=0,afterCombatCases=0;
 for(const weight of [0,.25,.5,.75,1])for(let i=0;i<4;i++){
  const phase=(i+.37)/4;
  await page.evaluate(({phase,weight})=>{const d=demo;d.player.position.set(0,0,0);d.player.rotation.y=0;d.motion.clock.phase=phase;d.motion.clock.weight=weight;d.motion.move=1;d.motion.render({inspectTime:null})},{phase,weight});
  await old.evaluate(({phase,weight})=>{const d=demo;d.player.position.set(0,0,0);d.player.rotation.y=0;d.motion.clock.phase=phase;d.motion.clock.weight=weight;d.motion.move=1;d.motion.crouch=0;d.motion.render({inspectTime:null})},{phase,weight});
  const a=await page.evaluate(snapshot),b=await old.evaluate(snapshot);afterCombatCases++;
  // q and -q describe the same orientation. A combat fade may leave a
  // mathematically identical quaternion with the opposite sign.
  for(let k=0;k<a.bones.length;k+=7){
   for(let j=0;j<3;j++)afterCombatMax=Math.max(afterCombatMax,Math.abs(a.bones[k+j]-b.bones[k+j]));
   let same=0,opposite=0;for(let j=3;j<7;j++){same=Math.max(same,Math.abs(a.bones[k+j]-b.bones[k+j]));opposite=Math.max(opposite,Math.abs(a.bones[k+j]+b.bones[k+j]))}
   afterCombatMax=Math.max(afterCombatMax,Math.min(same,opposite));
  }
  for(const key of ['vertices','morph'])for(let k=0;k<a[key].length;k++)afterCombatMax=Math.max(afterCombatMax,Math.abs(a[key][k]-b[key][k]));
  afterCombatMax=Math.max(afterCombatMax,Math.abs(a.floor-b.floor));
 }
 assert.ok(afterCombatMax<1e-5,`Ordinary gait after combat: ${afterCombatMax}`);parity.afterCombatCases=afterCombatCases;parity.afterCombatMax=afterCombatMax;
 results.parity=parity;await old.close();console.log('PASS: 80 ordinary walk/run poses and 20 after combat match the requested earlier trial.');

 const transitions=await page.evaluate(()=>{
  const d=demo,dt=1/60,names=['Rig_Head','Rig_Hand_L','Rig_Hand_R','Rig_Shin_L','Rig_Shin_R','Rig_Foot_L','Rig_Foot_R'],rows=[];
  d.setManual(true);
  for(const mode of ['idle','walk','run'])for(const direction of ['enter','exit','reverse'])for(let seed=0;seed<8;seed++){
   d.reset();d.player.position.set(6,0,8);d.player.rotation.y=Math.PI;d.state.yaw=0;
   if(mode!=='idle')d.keys.add('KeyW');if(mode==='run')d.keys.add('ShiftLeft');if(direction==='exit')d.setFighting(true);
   for(let j=0;j<90;j++)d.step(dt);d.motion.clock.phase=(seed+.37)/8;d.motion.combatPhase=d.motion.clock.phase;d.motion.render({inspectTime:null});d.setFighting(direction!=='exit');
   let last=null,lastDelta=null,maxStep=0,maxSecond=0,minFloor=Infinity,maxLift=0,first=0;
   for(let i=0;i<90;i++){
    if(direction==='reverse'&&i===8)d.setFighting(false);if(direction==='reverse'&&i===17)d.setFighting(true);if(direction==='reverse'&&i===25)d.setFighting(false);
    d.step(dt);if(i===0)first=d.motion.combat;
    d.player.updateMatrixWorld(true);const points=names.map(n=>d.player.worldToLocal(d.male.getObjectByName(n).getWorldPosition(d.camera.position.clone())).toArray());
    if(last){const delta=points.map((p,j)=>p.map((x,k)=>x-last[j][k]));for(let j=0;j<points.length;j++){
      maxStep=Math.max(maxStep,Math.hypot(...delta[j]));if(lastDelta)maxSecond=Math.max(maxSecond,Math.hypot(...delta[j].map((x,k)=>x-lastDelta[j][k])))}lastDelta=delta}
    last=points;const f=d.motion.floor;minFloor=Math.min(minFloor,f.minimumBefore+f.lift);maxLift=Math.max(maxLift,f.lift+f.blendLift);
   }
   rows.push({mode,direction,seed,maxStep,maxSecond,minFloor,maxLift,first,end:d.motion.combat});
  }
  return rows;
 });
 for(const r of transitions){assert.ok(r.maxStep<.14&&r.maxSecond<.12,`Transition jump: ${JSON.stringify(r)}`);
  assert.ok(r.minFloor>=.00085&&r.maxLift<.15,`Transition floor: ${JSON.stringify(r)}`);
  if(r.direction==='enter')assert.ok(r.first>0&&r.end>.99,'No entry response');
  if(r.direction==='exit'||r.direction==='reverse')assert.ok(r.end<.01,'Exit did not complete');}
 results.transitions={cases:transitions.length,maxJointStep:Math.max(...transitions.map(r=>r.maxStep)),maxSecondDifference:Math.max(...transitions.map(r=>r.maxSecond)),
  minSole:Math.min(...transitions.map(r=>r.minFloor)),maxCorrection:Math.max(...transitions.map(r=>r.maxLift))};
 console.log('PASS: 72 sampled enter/exit/reversal transitions from standing, walk and run.');

 const attacks=await page.evaluate(()=>{
  const d=demo,out=[];d.setManual(true);
  for(const name of ['jab','cross','kickR','kickL']){
   d.reset();d.player.position.set(6,0,8);d.player.rotation.y=0;d.setFighting(true);for(let i=0;i<90;i++)d.step(1/60);
   d.male.updateWorldMatrix(true,true);const vec=d.camera.position.clone(),points=['Rig_Hand_L','Rig_Hand_R','Rig_Foot_L','Rig_Foot_R'].map(n=>d.male.getObjectByName(n).getWorldPosition(vec).clone());
   d.motion.attack(name);let maxTravel=[0,0,0,0],minFloor=Infinity,maxStep=0,last=null,peakFoot=0;
   for(let i=0;i<Math.ceil((d.motion.clips[name].duration+.4)*60);i++){
    d.step(1/60);d.male.updateWorldMatrix(true,true);const now=['Rig_Hand_L','Rig_Hand_R','Rig_Foot_L','Rig_Foot_R'].map(n=>d.male.getObjectByName(n).getWorldPosition(vec).clone());
    now.forEach((p,j)=>{maxTravel[j]=Math.max(maxTravel[j],p.distanceTo(points[j]));if(last)maxStep=Math.max(maxStep,p.distanceTo(last[j]))});last=now;
    peakFoot=Math.max(peakFoot,now[name==='kickL'?2:3].y);minFloor=Math.min(minFloor,d.motion.floor.minimumBefore+d.motion.floor.lift);
   }
   out.push({name,maxTravel,peakFoot,maxStep,minFloor,ended:!d.motion.striking,weights:d.motion.slots.reduce((s,x)=>s+x.weight,0)});
  }return out;
 });
 for(const r of attacks){assert.ok(r.ended&&r.weights<.002&&r.minFloor>=.00085&&r.maxStep<.17,`Attack movement: ${JSON.stringify(r)}`);
  if(r.name==='jab')assert.ok(r.maxTravel[0]>.30);if(r.name==='cross')assert.ok(r.maxTravel[1]>.30);
  if(r.name.startsWith('kick'))assert.ok(r.peakFoot>.7&&r.peakFoot<1.4,`Kick height: ${JSON.stringify(r)}`)}
 results.attacks=attacks;console.log('PASS: both punches and mirrored kicks move, return and remain floor-guarded.');

 const interruptions=await page.evaluate(()=>{
  const d=demo,names=['Rig_Head','Rig_Hand_L','Rig_Hand_R','Rig_Foot_L','Rig_Foot_R'],rows=[];
  for(const [first,next] of [['jab','cross'],['cross','jab'],['kickR','kickL'],['kickL','jab']])for(const at of [4,10,20,35]){
   d.reset();d.setFighting(true);for(let j=0;j<70;j++)d.step(1/60);d.motion.attack(first);let last=null,maxStep=0,minFloor=Infinity,started=false;
   for(let i=0;i<150;i++){
    if(i===at){d.motion.attack(next);started=d.motion.activeAttack?.name===next||d.motion.pendingAttack===next}
    d.step(1/60);d.male.updateWorldMatrix(true,true);const v=d.camera.position.clone(),points=names.map(n=>d.male.getObjectByName(n).getWorldPosition(v).clone());
    if(last)for(let j=0;j<points.length;j++)maxStep=Math.max(maxStep,points[j].distanceTo(last[j]));last=points;
    minFloor=Math.min(minFloor,d.motion.floor.minimumBefore+d.motion.floor.lift);
   }rows.push({first,next,at,maxStep,minFloor,started,ended:!d.motion.striking});
  }return rows;
 });
 for(const r of interruptions)assert.ok(r.started&&r.ended&&r.maxStep<.18&&r.minFloor>=.00085,`Strike transition: ${JSON.stringify(r)}`);
 results.interruptions={cases:interruptions.length,maxJointStep:Math.max(...interruptions.map(r=>r.maxStep)),minSole:Math.min(...interruptions.map(r=>r.minFloor))};
 console.log('PASS: 16 strike-to-strike interruptions at different times.');

 // Actual keyboard events, including new direction while a strike is playing.
 await page.evaluate(()=>{demo.reset();demo.player.position.set(6,0,8);demo.player.rotation.y=Math.PI;demo.state.yaw=0;demo.follow()});
 await page.keyboard.down('w');await page.evaluate(()=>{for(let i=0;i<65;i++)demo.step(1/60)});near(await page.evaluate(()=>demo.state.actualSpeed),1.44,.03);
 await page.keyboard.down('Shift');await page.evaluate(()=>{for(let i=0;i<90;i++)demo.step(1/60)});assert.ok(await page.evaluate(()=>demo.state.actualSpeed)>4.1);
 await page.keyboard.press('b');await page.evaluate(()=>{for(let i=0;i<60;i++)demo.step(1/60)});near(await page.evaluate(()=>demo.state.actualSpeed),1.10,.03);
 assert.equal(await page.$eval('#combat',b=>b.getAttribute('aria-pressed')),'true');
 await page.keyboard.press('f');assert.equal(await page.evaluate(()=>demo.motion.activeAttack?.name),'jab');
 await page.evaluate(()=>{for(let i=0;i<10;i++)demo.step(1/60)});await page.keyboard.press('g');assert.equal(await page.evaluate(()=>demo.motion.activeAttack?.name),'kickR');
 await page.evaluate(()=>{for(let i=0;i<8;i++)demo.step(1/60)});await page.keyboard.press('g');assert.equal(await page.evaluate(()=>demo.motion.activeAttack?.name),'kickL');
 await page.keyboard.up('w');await page.keyboard.up('Shift');await page.keyboard.down('s');
 const interrupt=await page.evaluate(()=>{const d=demo,p=d.player.position.clone(),wasStrike=d.motion.striking;for(let i=0;i<30;i++)d.step(1/60);
  return {wasStrike,active:d.motion.striking,distance:d.player.position.distanceTo(p),speed:d.state.actualSpeed,fighting:d.state.fighting}});
 // keydown cancels before the snapshot, and a fresh direction responds even
 // if an old strike is still fading out visually.
 assert.equal(interrupt.wasStrike,false);assert.equal(interrupt.active,false);assert.ok(interrupt.distance>.05&&interrupt.speed>.1);assert.equal(interrupt.fighting,true);
 await page.keyboard.up('s');await page.keyboard.press('b');await page.evaluate(()=>{for(let i=0;i<80;i++)demo.step(1/60)});
 assert.equal(await page.evaluate(()=>demo.state.fighting),false);assert.equal(await page.$eval('#combat',b=>b.getAttribute('aria-pressed')),'false');
 const beforeC=await page.evaluate(()=>({keys:[...demo.keys],fighting:demo.state.fighting}));await page.keyboard.press('c');assert.deepEqual(await page.evaluate(()=>({keys:[...demo.keys],fighting:demo.state.fighting})),beforeC);
 const braking=[];for(const mode of ['walk','run']){
  await page.evaluate(()=>{demo.reset();demo.player.position.set(6,0,8);demo.player.rotation.y=Math.PI;demo.state.yaw=0});
  await page.keyboard.down('w');if(mode==='run')await page.keyboard.down('Shift');await page.evaluate(()=>{for(let i=0;i<90;i++)demo.step(1/60)});
  await page.keyboard.up('w');await page.evaluate(()=>{for(let i=0;i<4;i++)demo.step(1/60)});const slowed=await page.evaluate(()=>demo.state.speed);
  await page.keyboard.down('w');await page.evaluate(()=>demo.step(1/60));const restarted=await page.evaluate(()=>demo.state.speed);
  assert.ok(restarted>slowed,`${mode}: same-direction restart waited for braking`);await page.keyboard.up('w');
  await page.evaluate(()=>{for(let i=0;i<4;i++)demo.step(1/60)});const yawBefore=await page.evaluate(()=>demo.player.rotation.y);
  await page.keyboard.down('s');await page.evaluate(()=>demo.step(1/60));const yawAfter=await page.evaluate(()=>demo.player.rotation.y);
  assert.ok(Math.abs(yawAfter-yawBefore)>.05,`${mode}: opposite-direction turn waited for braking`);
  await page.keyboard.up('s');if(mode==='run')await page.keyboard.up('Shift');braking.push({mode,slowed,restarted,turnDelta:Math.abs(yawAfter-yawBefore)});
 }
 results.keyboard={walk:true,run:true,combatSpeed:1.10,punch:true,kickAlternates:true,interrupt,exit:true,crouchKeyInactive:true,braking};
 console.log('PASS: real keyboard, alternating attacks and immediate response during braking.');

 await page.evaluate(()=>{demo.reset();demo.player.position.set(4,0,4);demo.player.rotation.y=0;demo.follow()});
 const ground=await page.evaluate(()=>{const d=demo,v=d.player.position.clone().set(5,0,3.5).project(d.camera),r=d.renderer.domElement.getBoundingClientRect();return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2}});
 await page.mouse.click(ground.x,ground.y);let click=await page.evaluate(()=>({target:demo.state.target,interaction:demo.state.interaction}));
 assert.ok(click.target&&Math.hypot(click.target.x-5,click.target.z-3.5)<.02);assert.equal(click.interaction,'none');
 await page.evaluate(()=>{demo.attack('kick');for(let i=0;i<12;i++)demo.step(1/60)});assert.equal(await page.evaluate(()=>demo.motion.striking),true);
 await page.mouse.click(ground.x,ground.y);assert.equal(await page.evaluate(()=>demo.motion.striking),false);assert.ok(await page.evaluate(()=>demo.state.target));
 await page.evaluate(()=>demo.stop());const yaw=await page.evaluate(()=>demo.state.yaw);await page.mouse.move(400,350);await page.mouse.down();await page.mouse.move(465,350,{steps:8});await page.mouse.up();
 assert.ok(Math.abs(await page.evaluate(()=>demo.state.yaw)-yaw)>.1);assert.equal(await page.evaluate(()=>demo.state.target),null);
 await page.evaluate(()=>demo.reset());const well=await page.evaluate(()=>{const d=demo,v=d.player.position.clone().set(-.7,2.2,0).project(d.camera),r=d.renderer.domElement.getBoundingClientRect();return{x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2}});
 await page.mouse.click(well.x,well.y);assert.equal(await page.evaluate(()=>demo.state.interaction),'approach');await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>demo.state.interaction),'none');
 results.mouse={ground:true,cancelKick:true,drag:true,well:true};console.log('PASS: real mouse ground, combat interruption, drag and well.');

 const routes=await page.evaluate(()=>{
  const d=demo,results=[];for(const mode of ['walk','run','combat'])for(let k=0;k<8;k++){
   d.reset();if(mode==='run')d.state.pace='run';if(mode==='combat')d.setFighting(true);
   const a=2*Math.PI*k/8,target={x:d.obstacle.x+3*Math.cos(a),z:d.obstacle.z+3*Math.sin(a)};d.moveTo(target.x,target.z);
   let min=Infinity,maxSpeed=0,i=0,detour=d.state.detour;for(;i<1200&&d.state.target;i++){d.step(.025);min=Math.min(min,Math.hypot(d.player.position.x-d.obstacle.x,d.player.position.z-d.obstacle.z));maxSpeed=Math.max(maxSpeed,d.state.actualSpeed)}
   results.push({mode,remaining:!!d.state.target,error:Math.hypot(d.player.position.x-target.x,d.player.position.z-target.z),min,maxSpeed,detour});
  }return results;
 });
 for(const r of routes){assert.ok(!r.remaining&&r.error<.03&&r.min>=1.4-1e-5,`Route: ${JSON.stringify(r)}`);assert.ok(r.maxSpeed<=(r.mode==='run'?4.371:r.mode==='combat'?1.101:1.441))}
 assert.ok(routes.some(r=>r.detour));results.routes={count:routes.length,detours:routes.filter(r=>r.detour).length,minRadius:Math.min(...routes.map(r=>r.min))};
 const inspections=await page.evaluate(()=>{const out=[];for(let k=0;k<8;k++){
  const d=demo;d.reset();const before=d.state.interactionCount,a=2*Math.PI*k/8;d.player.position.set(d.obstacle.x+3*Math.cos(a),0,d.obstacle.z+3*Math.sin(a));d.setFighting(true);d.inspect();
  let states=new Set(),i=0;for(;i<1000&&d.state.interactionCount===before;i++){d.step(.025);states.add(d.state.interaction)}out.push({complete:d.state.interactionCount===before+1,states:[...states],fighting:d.state.fighting});}return out});
 assert.ok(inspections.every(r=>r.complete&&!r.fighting&&r.states.includes('face')&&r.states.includes('inspect')));results.inspections={count:inspections.length};
 console.log('PASS: 24 paths, detours, speed caps and eight well inspections.');

 const layouts=[];for(const [width,height] of [[320,568],[390,844],[768,1024],[844,390]]){
  const p=await open(target,{width,height,deviceScaleFactor:1,isMobile:true,hasTouch:true},isFile);await p.evaluate(()=>{demo.setManual(true);demo.reset()});
  const layout=await p.evaluate(()=>({width:innerWidth,docWidth:document.documentElement.scrollWidth,boxes:[...document.querySelectorAll('.action,.camera-tools button')].map(b=>{
   const r=b.getBoundingClientRect();return {name:b.id||b.dataset.camera,x:r.x,y:r.y,width:r.width,height:r.height}})}));
  assert.ok(layout.docWidth<=width+1);for(const box of layout.boxes)assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+.1&&box.y+box.height<=height+.1&&box.width>=44&&box.height>=44,`${width}x${height} bad button ${JSON.stringify(box)}`);
  const tap=async id=>{const b=layout.boxes.find(x=>x.name===id);assert.ok(b,id);await p.touchscreen.tap(b.x+b.width/2,b.y+b.height/2)};
  await tap('combat');await p.evaluate(()=>{for(let i=0;i<40;i++)demo.step(1/60)});assert.equal(await p.evaluate(()=>demo.state.fighting),true);
  await tap('punch');assert.equal(await p.evaluate(()=>demo.motion.activeAttack?.name),'jab');await p.evaluate(()=>{for(let i=0;i<8;i++)demo.step(1/60)});
  await tap('kick');assert.equal(await p.evaluate(()=>demo.motion.activeAttack?.name),'kickR');assert.equal(await p.evaluate(()=>demo.state.target),null);
  await tap('focus');assert.equal(await p.evaluate(()=>demo.state.focus),true);
  await p.evaluate(()=>{for(let i=0;i<18;i++)demo.step(1/60)});
  const framing=await p.evaluate(()=>{const d=demo,V=d.player.position.constructor;d.male.updateWorldMatrix(true,true);return ['Rig_Head','Rig_Foot_L','Rig_Foot_R'].map(n=>d.male.getObjectByName(n).getWorldPosition(new V()).project(d.camera).toArray())});
  for(const v of framing)assert.ok(Math.abs(v[0])<.99&&Math.abs(v[1])<.99,`Kick joint cropped at ${width}x${height}: ${v}`);
  const sweep=await p.evaluate(()=>{const d=demo,result=[];for(const attack of ['kickR','kickL'])for(const angle of [0,Math.PI/2,Math.PI,-Math.PI/2]){
   d.reset();d.setFocus(true);d.state.yaw=angle;d.setFighting(true);for(let i=0;i<60;i++)d.step(1/60);d.motion.attack(attack);
   let maxX=0,maxY=0;for(let i=0;i<95;i++){d.step(1/60);d.follow();d.male.updateWorldMatrix(true,true);const v=d.player.position.clone();
    for(const n of ['Rig_Head','Rig_Foot_L','Rig_Foot_R','Rig_Hand_L','Rig_Hand_R']){d.male.getObjectByName(n).getWorldPosition(v).project(d.camera);maxX=Math.max(maxX,Math.abs(v.x));maxY=Math.max(maxY,Math.abs(v.y))}}
   result.push({attack,angle,maxX,maxY});}return result});
  for(const s of sweep)assert.ok(s.maxX<.95&&s.maxY<.95,`Close-up crop at ${width}x${height}: ${JSON.stringify(s)}`);
  await tap('reset');assert.equal(await p.evaluate(()=>demo.state.fighting),false);assert.equal(await p.evaluate(()=>demo.motion.striking),false);
  const canvas=await p.evaluate(()=>{const r=demo.renderer.domElement.getBoundingClientRect();return{x:r.right-30,y:r.top+r.height*.6}});
  await p.touchscreen.tap(canvas.x,canvas.y);assert.ok(await p.evaluate(()=>demo.state.target));
  await tap('reset');const before=await p.evaluate(()=>demo.state.yaw),finger=await p.touchscreen.touchStart(canvas.x,canvas.y);
  await finger.move(canvas.x-35,canvas.y);await finger.move(canvas.x-55,canvas.y);await finger.end();
  assert.ok(Math.abs(await p.evaluate(()=>demo.state.yaw)-before)>.1);assert.equal(await p.evaluate(()=>demo.state.target),null);
  layouts.push({width,height,controls:layout.boxes.length,fight:true,punch:true,kick:true,focus:true,ground:true,drag:true,
   framingCases:sweep.length,maxJointX:Math.max(...sweep.map(s=>s.maxX)),maxJointY:Math.max(...sweep.map(s=>s.maxY))});await p.close();
 }
 results.layouts=layouts;console.log('PASS: real emulated taps, strike controls, ground and camera on four layouts.');
 const live=await open(target,{width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true},isFile);
 const box=async id=>live.$eval(id,b=>{const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}});
 let b=await box('#kick');await live.touchscreen.tap(b.x,b.y);await live.waitForFunction('demo.state.fighting && demo.motion.striking && demo.motion.combat > .05',{timeout:20000});
 const liveState=await live.evaluate(()=>({manual:demo.state.manual,attack:demo.motion.activeAttack?.name,combat:demo.motion.combat}));assert.equal(liveState.manual,false);assert.equal(liveState.attack,'kickR');
 await live.close();results.liveTouch=liveState;assert.deepEqual(errors,[]);await page.close();
 const report={status:'pass',transport:isFile?'local file with network disabled':'same-origin HTTP',htmlSha256:htmlSha,
  scope:'Discrete samples and browser-emulated events only; no full collision proof, artistic approval, physical contact simulation or physical-phone test.',results};
 fs.writeFileSync(path.join(out,isFile?'qa-offline.json':'qa-http.json'),JSON.stringify(report,null,2)+'\n');console.log('PASS: live requestAnimationFrame responds to touch and no console/network errors.');console.log(JSON.stringify(results,null,2));
}finally{await browser.close()}
