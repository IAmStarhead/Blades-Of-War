// Reproducible discrete browser regression tests for the separate trial.
// They do not certify artistic quality, physical contact or a real phone.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const output=path.join(repo,'work/male-idle-stop-trial'),htmlFile=path.join(output,'index.html');
const target=process.argv[2]||pathToFileURL(htmlFile).href,isFile=target.startsWith('file:');
const origin=isFile?'':new URL(target).origin,sha=b=>createHash('sha256').update(b).digest('hex');
const html=fs.readFileSync(htmlFile,'utf8'),embedded=html.match(/const MODEL_URI='data:model\/gltf-binary;base64,([^']+)'/);
assert.ok(embedded,'Missing embedded model');
assert.equal(sha(Buffer.from(embedded[1],'base64')),'eb569ef2269a8d7e40378590614beebc933edd3bdcd7340f8146494ceb975484');
assert.equal(sha(fs.readFileSync(path.join(repo,'work/male-stealth-posture-trial/index.html'))),'f0ed071fdf6e466ccaaa0ae6eab4410b11ca4bfd9de4095af9288369734046f8','Previous scene changed');
assert.equal(sha(fs.readFileSync(path.join(repo,'tools/male-rig-trial/well-source.mjs'))),'62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5');
if(!isFile){const response=await fetch(target,{cache:'no-store'});assert.equal(response.status,200);assert.equal(sha(Buffer.from(await response.arrayBuffer())),sha(html),'HTTP is serving another build')}
const data=JSON.parse(fs.readFileSync(path.join(here,'clips.json'))),idle=data.clips.find(c=>c.name==='Living_Idle_Trial');
assert.ok(idle&&idle.tracks.length===52);assert.ok(idle.duration>5.9&&idle.duration<6.0);
for(const t of idle.tracks){const width=t.type==='vector'?3:4,a=t.values.slice(0,width),z=t.values.slice(-width);
  if(width===3)assert.ok(Math.hypot(...a.map((x,i)=>x-z[i]))<1e-6,`idle seam ${t.name}`);
  else assert.ok(Math.abs(a.reduce((s,x,i)=>s+x*z[i],0))>.999999,`idle seam ${t.name}`);
}
for(const kind of ['walk','run'])for(const [start,c] of Object.entries(data.curves[kind].variants)){
  assert.equal(c.velocity[0],1);assert.equal(c.velocity.at(-1),0);assert.ok(c.area>0&&c.nominalDuration>0);
  for(let i=1;i<c.velocity.length;i++)assert.ok(c.velocity[i]<=c.velocity[i-1]+1e-8&&c.integral[i]>=c.integral[i-1],`${kind}/${start} is not a deceleration`);
}
const require=createRequire(path.join(repo,'tools/character-showcase/package.json'));
const puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium').default;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
 args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:300000});
const errors=[],report={};
async function open(url=target,viewport={width:1100,height:750,deviceScaleFactor:1},offline=isFile){
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'||m.text().includes('Multiple instances of Three.js'))errors.push(m.text())});
  await page.setViewport(viewport);await page.setRequestInterception(true);
  page.on('request',r=>{const u=r.url(),allowed=/^(file|data|blob):/i.test(u)||(!offline&&new URL(u).origin===origin);
    if(allowed)r.continue();else{errors.push('Unexpected external request '+u);r.abort()}});
  if(offline)await page.setOfflineMode(true);await page.goto(url,{waitUntil:'load',timeout:60000});
  await page.waitForFunction(url.includes('male-leg-volume')?'window.uphillDemo?.state.ready===true':'window.ready===true',{timeout:60000});return page;
}
const near=(a,b,epsilon=1e-5)=>assert.ok(Math.abs(a-b)<=epsilon,`${a} vs ${b}`);
try{
  const page=await open();await page.evaluate(()=>{demo.setManual(true);demo.reset()});
  const initial=await page.evaluate(()=>({clips:demo.gltf.animations.map(x=>x.name),rig:demo.male.getObjectByName('NewBody').skeleton.bones.length,
    floorVertices:demo.motion.floor.vertices,status:document.querySelector('#status').textContent,focus:demo.state.focus,
    crouchButton:!!document.querySelector('#crouch'),crouchAPI:typeof demo.setCrouched,well:demo.well.name}));
  assert.deepEqual(initial.clips,['Walk_Game_Trial','Run_Game_Trial']);assert.equal(initial.rig,52);assert.ok(initial.floorVertices>1000);
  assert.equal(initial.well,'BowStoneWellProp');assert.equal(initial.status,'Стоит');assert.equal(initial.focus,true);
  assert.equal(initial.crouchButton,false);assert.equal(initial.crouchAPI,'undefined');
  await page.keyboard.press('c');assert.equal(await page.evaluate(()=>demo.state.crouched),undefined,'C must not activate crouch');
  report.initial=initial;console.log('PASS: unchanged embedded model, previous scene and well; crouch is disabled.');

  const idleMotion=await page.evaluate(()=>{
    const d=demo;d.reset();const duration=d.motion.clips.idle.duration,spine=d.male.getObjectByName('Rig_Chest'),hips=d.male.getObjectByName('Rig_Hips');
    const qs=[],roots=[];for(let i=0;i<=24;i++){d.motion.idleTime=duration*i/24;d.motion.render({inspectTime:null});qs.push(spine.quaternion.toArray());roots.push(d.motion.raw.root.toArray())}
    const Q=spine.quaternion.constructor,q=new Q().fromArray(qs[0]);return {duration,maxChestDegrees:Math.max(...qs.map(x=>q.angleTo(new Q().fromArray(x))))*180/Math.PI,
      lateralRange:Math.max(...roots.map(x=>x[0]))-Math.min(...roots.map(x=>x[0])),seamAngle:q.angleTo(new Q().fromArray(qs.at(-1))),hipsPresent:!!hips};
  });
  assert.ok(idleMotion.maxChestDegrees>.25&&idleMotion.lateralRange>.005,'Idle must visibly animate more than a static pose');
  assert.ok(idleMotion.seamAngle<1e-5);report.idle=idleMotion;console.log('PASS: looping idle contains measured chest motion and weight shift.');

  // Compare the actual fully weighted gait to the earlier flat-ground viewer.
  const old=await open(pathToFileURL(path.join(repo,'work/male-leg-volume/index.html')).href,{width:800,height:600,deviceScaleFactor:1},true);
  await old.evaluate(()=>{uphillDemo.setManual(true);uphillDemo.setAngle(0);uphillDemo.setPlaying(false)});
  const snapshot=()=>{const d=window.demo||window.uphillDemo,m=d.male||d.model,mesh=m.getObjectByName('NewBody');
    m.updateMatrixWorld(true);mesh.skeleton.update();const v=d.camera.position.clone(),vertices=[];
    for(let i=0;i<mesh.geometry.attributes.position.count;i+=37){mesh.getVertexPosition(i,v);vertices.push(...v.toArray())}
    return {bones:mesh.skeleton.bones.flatMap(b=>[...b.position.toArray(),...b.quaternion.toArray()]),vertices,
      morph:mesh.morphTargetInfluences.slice(),floor:d.motion?d.motion.floor.lift:d.controller.stats.lift};};
  const parity={bone:0,vertex:0,morph:0,floor:0,cases:0};
  for(const weight of [0,.25,.5,.75,1])for(let i=0;i<16;i++){
    const phase=(i+.37)/16;
    await page.evaluate(({phase,weight})=>{const d=demo;d.player.position.set(0,0,0);d.player.rotation.y=0;d.motion.plant.reset();
      d.motion.brake=null;d.motion.dropSnapshot();d.motion.clock.phase=phase;d.motion.clock.weight=weight;d.motion.move=1;d.motion.render({inspectTime:null})},{phase,weight});
    await old.evaluate(({phase,weight})=>{const d=uphillDemo;d.controller.reset('walk',phase,0);d.clock.weight=weight;d.controller.mixed.apply();d.controller.captureRaw();d.controller.adapt()},{phase,weight});
    const a=await page.evaluate(snapshot),b=await old.evaluate(snapshot);parity.cases++;
    for(const [key,label] of [['bones','bone'],['vertices','vertex'],['morph','morph']]){assert.equal(a[key].length,b[key].length);for(let k=0;k<a[key].length;k++)parity[label]=Math.max(parity[label],Math.abs(a[key][k]-b[key][k]))}
    parity.floor=Math.max(parity.floor,Math.abs(a.floor-b.floor));
  }
  for(const k of ['bone','vertex','morph','floor'])assert.ok(parity[k]<1e-5,`Gait parity ${k} ${parity[k]}`);await old.close();
  report.gaitParity=parity;console.log(`PASS: ${parity.cases} fully weighted walk/run poses match the earlier flat gait.`);

  const transitions=await page.evaluate(()=>{
    const d=demo,dt=1/60,names=['Rig_Hips','Rig_Head','Rig_Shin_L','Rig_Shin_R','Rig_Foot_L','Rig_Foot_R','Rig_Hand_L','Rig_Hand_R'],out=[];
    for(const mode of ['walk','run'])for(let seed=0;seed<24;seed++){
      d.reset();d.player.position.set(6,0,8);d.player.rotation.y=Math.PI;d.state.yaw=0;d.keys.add('KeyW');if(mode==='run')d.keys.add('ShiftLeft');
      for(let i=0;i<90;i++)d.step(dt);d.motion.clock.phase=(seed+.37)/24;d.motion.render({inspectTime:null});d.keys.clear();
      let last=null,lastDelta=null,maxStep=0,maxSecond=0,min=Infinity,maxLift=0,up=0,previous=d.state.speed,seen=false,selection=null;
      for(let i=0;i<150;i++){
        d.step(dt);seen||=!!d.state.brake;if(d.motion.brake&&!selection)selection={name:d.motion.brake.choice,start:d.motion.brake.start};
        d.player.updateMatrixWorld(true);const points=names.map(n=>d.player.worldToLocal(d.male.getObjectByName(n).getWorldPosition(d.camera.position.clone())).toArray());
        if(last){const delta=points.map((p,j)=>p.map((x,k)=>x-last[j][k]));for(let j=0;j<points.length;j++){
          maxStep=Math.max(maxStep,Math.hypot(...delta[j]));if(lastDelta)maxSecond=Math.max(maxSecond,Math.hypot(...delta[j].map((x,k)=>x-lastDelta[j][k])));
        }lastDelta=delta}last=points;
        min=Math.min(min,d.motion.floor.minimumBefore+d.motion.floor.lift);maxLift=Math.max(maxLift,d.motion.floor.lift+d.motion.floor.blendLift+d.motion.floor.locomotionLift);
        if(d.state.speed>previous+1e-5)up++;previous=d.state.speed;
      }
      out.push({mode,seed,seen,selection,maxStep,maxSecond,min,maxLift,up,finalSpeed:d.state.speed,finalIdle:d.motion.weights.idle});
    }return out;
  });
  for(const r of transitions){assert.ok(r.seen&&r.selection&&r.up===0&&r.finalSpeed===0&&r.finalIdle>.999,`Stop did not settle: ${JSON.stringify(r)}`);
    assert.ok(r.min>=.0008&&r.maxLift<.06,`Floor guard: ${JSON.stringify(r)}`);
    assert.ok(r.maxStep<.19&&r.maxSecond<.10,`Extreme discrete joint change: ${JSON.stringify(r)}`)}
  const choices=[...new Set(transitions.map(r=>r.selection.name))],starts=[...new Set(transitions.map(r=>r.selection.start))].sort((a,b)=>a-b);
  assert.equal(choices.length,4,'Both mirrored stop clips must be chosen across phases');assert.ok(starts.length>=3,'Phase-aware entry was not exercised');
  report.transitions={cases:transitions.length,maxJointStepM:Math.max(...transitions.map(r=>r.maxStep)),maxSecondDifferenceM:Math.max(...transitions.map(r=>r.maxSecond)),
    minSampledFootY:Math.min(...transitions.map(r=>r.min)),maxVerticalLiftM:Math.max(...transitions.map(r=>r.maxLift)),choices,starts};
  console.log(`PASS: ${transitions.length} walk/run stopping phases, deceleration, idle blend and sampled floor clearance.`);

  const responsive=await page.evaluate(()=>{
    const d=demo,dt=1/60,out=[];
    for(const mode of ['walk','run'])for(const restart of [3,8,15,30,45]){
      d.reset();d.player.position.set(6,0,8);d.player.rotation.y=Math.PI;d.state.yaw=0;d.keys.add('KeyW');if(mode==='run')d.keys.add('ShiftLeft');
      for(let i=0;i<100;i++)d.step(dt);d.keys.clear();let snapshot=false,maxStep=0,prev=null;
      for(let i=0;i<160;i++){if(i===restart){d.keys.add('KeyW');if(mode==='run')d.keys.add('ShiftLeft')}d.step(dt);snapshot||=!!d.motion.snapshot;
        d.player.updateMatrixWorld(true);const points=['Rig_Foot_L','Rig_Foot_R','Rig_Hand_L','Rig_Hand_R','Rig_Head'].map(n=>d.player.worldToLocal(d.male.getObjectByName(n).getWorldPosition(d.camera.position.clone())).toArray());
        if(prev)for(let j=0;j<points.length;j++)maxStep=Math.max(maxStep,Math.hypot(...points[j].map((x,k)=>x-prev[j][k])));prev=points;
      }out.push({mode,restart,snapshot,maxStep,speed:d.state.speed,brake:!!d.state.brake});
    }return out;
  });
  for(const r of responsive){assert.ok(r.snapshot&&!r.brake&&r.maxStep<.19,`Bad interruption ${JSON.stringify(r)}`);near(r.speed,r.mode==='run'?4.37:1.44,.02)}
  report.interruptions={cases:responsive.length,maxJointStepM:Math.max(...responsive.map(r=>r.maxStep))};
  const reversals=await page.evaluate(()=>{const d=demo,out=[];for(const mode of ['walk','run']){
    d.reset();d.player.position.set(6,0,8);d.player.rotation.y=Math.PI;d.state.yaw=0;d.keys.add('KeyW');if(mode==='run')d.keys.add('ShiftLeft');
    for(let i=0;i<90;i++)d.step(1/60);d.keys.delete('KeyW');d.keys.add('KeyS');let brake=false;
    for(let i=0;i<200;i++){d.step(1/60);brake||=d.state.brake?.reason==='turn'}out.push({mode,brake,speed:d.state.speed,yaw:d.player.rotation.y});}return out;});
  for(const r of reversals){assert.ok(r.brake);near(r.speed,r.mode==='run'?4.37:1.44,.02)}
  report.reversals=reversals;console.log('PASS: mid-stop restarts and 180-degree direction changes.');

  const routes=await page.evaluate(()=>{
    const d=demo,out=[];for(const pace of ['walk','run'])for(let k=0;k<16;k++){
      d.reset();d.state.pace=pace;const a=2*Math.PI*k/16,requested={x:d.obstacle.x+3*Math.cos(a),z:d.obstacle.z+3*Math.sin(a)};
      d.moveTo(requested.x,requested.z);const target={...d.state.target},detour=d.state.detour;let min=Infinity,i=0,sawBrake=false;
      for(;i<1600&&(d.state.target||d.state.brake);i++){d.step(1/60);sawBrake||=!!d.state.brake;min=Math.min(min,Math.hypot(d.player.position.x-d.obstacle.x,d.player.position.z-d.obstacle.z))}
      out.push({pace,k,detour,sawBrake,remaining:!!d.state.target,error:Math.hypot(d.player.position.x-target.x,d.player.position.z-target.z),min,steps:i});
    }return out;
  });
  for(const r of routes)assert.ok(!r.remaining&&r.sawBrake&&r.error<.03&&r.min>=1.4-1e-5,`Route ${JSON.stringify(r)}`);
  assert.ok(routes.some(r=>r.detour));report.routes={count:routes.length,detours:routes.filter(r=>r.detour).length,maxError:Math.max(...routes.map(r=>r.error))};
  const shortRoutes=await page.evaluate(()=>{const d=demo,out=[];for(const pace of ['walk','run'])for(const dist of [.013,.02,.05,.1,.2,.4,.8,1.5,3]){
    d.reset();d.state.pace=pace;d.player.position.set(6,0,0);d.player.rotation.y=0;d.moveTo(6,dist);const target={...d.state.target};let i=0;
    for(;i<1600&&(d.state.target||d.state.brake);i++)d.step(1/60);out.push({pace,dist,remaining:!!d.state.target,error:Math.hypot(d.player.position.x-target.x,d.player.position.z-target.z)});
  }return out;});
  for(const r of shortRoutes)assert.ok(!r.remaining&&r.error<.03,`Short route ${JSON.stringify(r)}`);
  const changing=await page.evaluate(()=>{const d=demo,out=[];for(const mode of ['walk','run']){
    d.reset();d.player.position.set(6,0,6);d.player.rotation.y=Math.PI;d.state.yaw=0;d.keys.add('KeyW');if(mode==='run')d.keys.add('ShiftLeft');
    for(let i=0;i<90;i++)d.step(1/60);const target={x:d.player.position.x,z:d.player.position.z};d.moveTo(target.x,target.z);let i=0,seen=false;
    for(;i<1800&&(d.state.target||d.state.brake);i++){d.step(1/60);seen||=!!d.state.brake}
    out.push({mode,seen,remaining:!!d.state.target,error:Math.hypot(d.player.position.x-target.x,d.player.position.z-target.z),steps:i});}return out;});
  for(const r of changing)assert.ok(r.seen&&!r.remaining&&r.error<.03,`Close retarget ${JSON.stringify(r)}`);
  report.shortRoutes={count:shortRoutes.length,maxError:Math.max(...shortRoutes.map(r=>r.error)),closeRetarget:changing};
  console.log('PASS: routes, short clicks and a target moved under a moving character.');

  const interactions=await page.evaluate(()=>{const d=demo,out=[];for(let k=0;k<12;k++){
    d.reset();const previous=d.state.interactionCount,a=2*Math.PI*k/12;d.player.position.set(d.obstacle.x+3*Math.cos(a),0,d.obstacle.z+3*Math.sin(a));d.inspect();
    let i=0,min=Infinity,seen=false,states=new Set();for(;i<1600&&d.state.interactionCount===previous;i++){
      d.step(1/60);seen||=!!d.state.brake;states.add(d.state.interaction);min=Math.min(min,Math.hypot(d.player.position.x-d.obstacle.x,d.player.position.z-d.obstacle.z));}
    out.push({complete:d.state.interactionCount===previous+1,seen,states:[...states],min,steps:i});}return out;});
  for(const r of interactions)assert.ok(r.complete&&r.seen&&r.states.includes('face')&&r.states.includes('inspect')&&r.min>=1.4-1e-5,`Well ${JSON.stringify(r)}`);
  report.interactions={count:interactions.length,maxSteps:Math.max(...interactions.map(r=>r.steps))};console.log('PASS: braking on approach, facing and inspecting the well.');

  await page.evaluate(()=>{demo.reset();demo.player.position.set(6,0,8);demo.player.rotation.y=Math.PI;demo.state.yaw=0;demo.follow()});
  await page.keyboard.down('w');await page.evaluate(()=>{for(let i=0;i<60;i++)demo.step(1/60)});near(await page.evaluate(()=>demo.state.speed),1.44,.02);
  await page.keyboard.down('Shift');await page.evaluate(()=>{for(let i=0;i<90;i++)demo.step(1/60)});assert.ok(await page.evaluate(()=>demo.state.speed)>4.1);
  await page.keyboard.up('w');await page.keyboard.up('Shift');await page.evaluate(()=>demo.step(1/60));
  const firstBrake=await page.evaluate(()=>({speed:demo.state.speed,kind:demo.state.brake?.kind,status:document.querySelector('#status').textContent}));
  assert.ok(firstBrake.speed>3.5);assert.equal(firstBrake.kind,'run');assert.match(firstBrake.status,/Тормозит/);
  await page.evaluate(()=>{for(let i=0;i<120;i++)demo.step(1/60)});near(await page.evaluate(()=>demo.state.speed),0,.001);
  await page.keyboard.down('w');await page.evaluate(()=>{for(let i=0;i<60;i++)demo.step(1/60)});await page.click('#stop');
  await page.evaluate(()=>demo.step(1/60));assert.equal(await page.evaluate(()=>demo.state.brake?.kind),'walk');
  assert.ok(await page.evaluate(()=>demo.state.speed)>.8,'Stop button abruptly zeroed speed');
  await page.keyboard.press('Escape');await page.evaluate(()=>{for(let i=0;i<130;i++)demo.step(1/60)});near(await page.evaluate(()=>demo.state.speed),0,.001);
  report.realKeyboardAndStop={firstBrake,button:true,escape:true};console.log('PASS: real keyboard, Shift, release, stop button and Esc.');

  // Actual pointer hit testing in the wide view; dragging cannot issue a move.
  await page.evaluate(()=>{demo.reset();demo.setFocus(false);demo.player.position.set(4,0,4);demo.follow()});
  const click=await page.evaluate(()=>{const d=demo,v=d.player.position.clone().set(5,0,3.5).project(d.camera),r=d.renderer.domElement.getBoundingClientRect();return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2}});
  await page.mouse.click(click.x,click.y);assert.ok(await page.evaluate(()=>demo.state.target));await page.evaluate(()=>demo.reset());
  const yaw=await page.evaluate(()=>demo.state.yaw);await page.mouse.move(500,350);await page.mouse.down();await page.mouse.move(570,350,{steps:8});await page.mouse.up();
  assert.ok(Math.abs(await page.evaluate(()=>demo.state.yaw)-yaw)>.1);assert.equal(await page.evaluate(()=>demo.state.target),null);
  report.mouse={ground:true,drag:true};console.log('PASS: real mouse ground click and camera drag.');

  const layouts=[];
  for(const [width,height] of [[320,568],[390,844],[768,1024],[844,390]]){
    const p=await open(target,{width,height,deviceScaleFactor:1,isMobile:true,hasTouch:true},isFile);await p.evaluate(()=>{demo.setManual(true);demo.reset()});
    const layout=await p.evaluate(()=>({docWidth:document.documentElement.scrollWidth,boxes:[...document.querySelectorAll('.action,.camera-tools button')].map(b=>{
      const r=b.getBoundingClientRect();return {name:b.id||b.dataset.camera,x:r.x,y:r.y,width:r.width,height:r.height}}),
      header:['.brand strong','.compare-link','summary'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {left:r.left,right:r.right}})}));
    assert.ok(layout.docWidth<=width+1,'Horizontal overflow');for(const box of layout.boxes)assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+.1&&box.y+box.height<=height+.1&&box.width>=44&&box.height>=44,`${width}x${height}: ${JSON.stringify(box)}`);
    assert.ok(layout.header[0].right+3<=layout.header[1].left&&layout.header[1].right+3<=layout.header[2].left,`Header overlap at ${width}x${height}: ${JSON.stringify(layout.header)}`);
    const tap=async name=>{const b=layout.boxes.find(x=>x.name===name);await p.touchscreen.tap(b.x+b.width/2,b.y+b.height/2)};
    await tap('pace');assert.equal(await p.evaluate(()=>demo.state.pace),'run');await tap('focus');assert.equal(await p.evaluate(()=>demo.state.focus),false);
    const canvas=await p.evaluate(()=>{const r=demo.renderer.domElement.getBoundingClientRect();return {x:r.right-30,y:r.top+r.height*.60}});
    await p.touchscreen.tap(canvas.x,canvas.y);assert.ok(await p.evaluate(()=>demo.state.target),'Touch ground did not create a route');
    await p.evaluate(()=>{for(let i=0;i<80;i++)demo.step(1/60)});await tap('stop');assert.equal(await p.evaluate(()=>demo.state.target),null);
    await tap('reset');assert.equal(await p.evaluate(()=>demo.state.focus),true);
    const framing=await p.evaluate(()=>{const d=demo,V=d.player.position.constructor;d.male.updateWorldMatrix(true,true);return ['Rig_Head','Rig_Foot_L','Rig_Foot_R'].map(n=>d.male.getObjectByName(n).getWorldPosition(new V()).project(d.camera).toArray())});
    for(const point of framing)assert.ok(Math.abs(point[0])<.98&&Math.abs(point[1])<.98,`Close-up cropped: ${width}x${height} ${point}`);
    await tap('focus');await tap('reset');await tap('focus');const before=await p.evaluate(()=>demo.state.yaw),finger=await p.touchscreen.touchStart(canvas.x,canvas.y);
    await finger.move(canvas.x-35,canvas.y);await finger.move(canvas.x-55,canvas.y);await finger.end();assert.ok(Math.abs(await p.evaluate(()=>demo.state.yaw)-before)>.1);
    assert.equal(await p.evaluate(()=>demo.state.target),null,'Touch drag became a click');
    layouts.push({width,height,controls:layout.boxes.length,groundTap:true,stopTap:true,cameraDrag:true,focusFramed:true});await p.close();
  }
  report.layouts=layouts;console.log('PASS: four emulated phone/tablet layouts, touch controls and framing.');
  // The cases above use deterministic manual stepping. Exercise the real
  // requestAnimationFrame loop with an emulated touch separately.
  const live=await open(target,{width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true},isFile);
  const focus=await live.$eval('#focus',b=>{const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}});
  await live.touchscreen.tap(focus.x,focus.y);
  const before=await live.evaluate(()=>{const r=demo.renderer.domElement.getBoundingClientRect();return {x:demo.player.position.x,z:demo.player.position.z,
    manual:demo.state.manual,tap:{x:r.right-30,y:r.top+r.height*.6}}});
  await live.touchscreen.tap(before.tap.x,before.tap.y);
  await live.waitForFunction(({x,z})=>Math.hypot(demo.player.position.x-x,demo.player.position.z-z)>.08,{timeout:30000},before);
  const stopBox=await live.$eval('#stop',b=>{const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}});
  await live.touchscreen.tap(stopBox.x,stopBox.y);await live.waitForFunction('!!demo.state.brake',{timeout:15000});
  await live.waitForFunction('!demo.state.brake && demo.state.speed < .01',{timeout:30000});
  report.liveTouch={manual:before.manual,moved:true,stopped:true};assert.equal(before.manual,false);await live.close();
  console.log('PASS: real animation loop moves and brakes after emulated touch.');
  const reduced=await browser.newPage();await reduced.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await reduced.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);if(isFile)await reduced.setOfflineMode(true);
  await reduced.goto(target,{waitUntil:'load'});await reduced.waitForFunction('window.ready===true');
  const reducedResult=await reduced.evaluate(()=>{demo.setManual(true);for(let i=0;i<40;i++)demo.step(.025);return {enabled:demo.state.reducedMotion,idleTime:demo.motion.idleTime}});
  assert.deepEqual(reducedResult,{enabled:true,idleTime:0});await reduced.close();report.reducedMotion=reducedResult;
  assert.deepEqual(errors,[]);await page.close();
  const qa={status:'pass',transport:isFile?'local file with network disabled':'same-origin HTTP',htmlSha256:sha(html),
    scope:'Discrete automated samples and emulated touch; not proof of naturalness, whole-body collision-free motion, zero sliding or physical-phone performance.',results:report};
  fs.writeFileSync(path.join(output,isFile?'qa-offline.json':'qa-http.json'),JSON.stringify(qa,null,2)+'\n');
  console.log('PASS: reduced-motion preference and no console or external-network errors.');console.log(JSON.stringify(report,null,2));
}finally{await browser.close()}
