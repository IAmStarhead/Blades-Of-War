// Browser QA: offline build, parity with the previously delivered flat gait,
// actual keyboard/pointer/touch input, pathing, sampled poses and interactions.
// Touch here is emulated; it does not replace a physical-device test.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const output=path.join(repo,'work/male-stealth-posture-trial'),target=process.argv[2]||pathToFileURL(path.join(output,'index.html')).href;
const isFile=target.startsWith('file:'),origin=isFile?'':new URL(target).origin;
const sha=b=>createHash('sha256').update(b).digest('hex');
const html=fs.readFileSync(path.join(output,'index.html'),'utf8');
if(!isFile){
  const response=await fetch(target,{cache:'no-store'});assert.equal(response.status,200,'HTTP scene is not reachable');
  assert.equal(sha(Buffer.from(await response.arrayBuffer())),sha(Buffer.from(html)),'HTTP server serves a different build');
}
const embedded=html.match(/const MODEL_URI='data:model\/gltf-binary;base64,([^']+)'/);
assert.ok(embedded,'Missing embedded model');
assert.equal(sha(Buffer.from(embedded[1],'base64')),'eb569ef2269a8d7e40378590614beebc933edd3bdcd7340f8146494ceb975484');
assert.equal(sha(fs.readFileSync(path.join(repo,'tools/male-rig-trial/well-source.mjs'))),'62ef93410bca00fe6b2bc7e2232138edf1077178cb704d59c2aecd9ddf0ce7b5');
const require=createRequire(path.join(repo,'tools/character-showcase/package.json'));
const puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium').default;
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
  args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:300000});
const errors=[];
async function open(url=target,viewport={width:1100,height:750,deviceScaleFactor:1},offline=isFile){
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());if(m.text().includes('Multiple instances of Three.js'))errors.push(m.text())});
  await page.setViewport(viewport);await page.setRequestInterception(true);
  page.on('request',r=>{
    const u=r.url(),allowed=/^(file|data|blob):/i.test(u)||(!offline&&new URL(u).origin===origin);
    if(allowed)r.continue();else{errors.push('Unexpected external request '+u);r.abort()}
  });
  if(offline)await page.setOfflineMode(true);
  await page.goto(url,{waitUntil:'load',timeout:60000});
  await page.waitForFunction(url.includes('male-leg-volume')?'window.uphillDemo?.state.ready===true':'window.ready===true',{timeout:60000});
  return page;
}
const near=(a,b,tolerance=1e-5)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} vs ${b} (tolerance ${tolerance})`);
const report={};
try{
  const page=await open();await page.evaluate(()=>{demo.setManual(true);demo.reset()});
  const initial=await page.evaluate(()=>({clips:demo.gltf.animations.map(c=>c.name),bones:demo.male.getObjectByName('NewBody').skeleton.bones.length,
    status:document.querySelector('#status').textContent,well:demo.well.name,vertexCount:demo.motion.floor.vertices}));
  assert.deepEqual(initial.clips,['Walk_Game_Trial','Run_Game_Trial']);assert.equal(initial.bones,52);
  assert.equal(initial.well,'BowStoneWellProp');assert.ok(initial.vertexCount>1000);assert.equal(initial.status,'Стоит');report.initial=initial;
  console.log(`PASS: unchanged embedded model, unchanged well source, ${isFile?'offline file':'HTTP'} startup and expected rig.`);

  // Compare actual bone rotations, sampled deformed vertices and volume morphs
  // against the previous viewer, with the same 0° terrain, phase and weights.
  const old=await open(pathToFileURL(path.join(repo,'work/male-leg-volume/index.html')).href,
    {width:800,height:600,deviceScaleFactor:1},true);
  await old.evaluate(()=>{uphillDemo.setManual(true);uphillDemo.setAngle(0);uphillDemo.setPlaying(false)});
  const snapshot=()=>{
    const d=window.demo||window.uphillDemo,model=d.male||d.model,mesh=model.getObjectByName('NewBody');
    model.updateMatrixWorld(true);mesh.skeleton.update();const v=d.camera.position.clone(),vertices=[];
    for(let i=0;i<mesh.geometry.attributes.position.count;i+=37){mesh.getVertexPosition(i,v);vertices.push(...v.toArray())}
    return {bones:mesh.skeleton.bones.flatMap(b=>[...b.position.toArray(),...b.quaternion.toArray()]),vertices,
      morph:mesh.morphTargetInfluences.slice(),floor:d.motion?d.motion.floor.lift:d.controller.stats.lift};
  };
  const parity={bone:0,vertex:0,morph:0,floor:0,cases:0};
  for(const weight of [0,.25,.5,.75,1])for(let i=0;i<16;i++){
    const phase=(i+.37)/16;
    await page.evaluate(({phase,weight})=>{const d=demo;d.player.position.set(0,0,0);d.player.rotation.y=0;
      d.motion.clock.phase=phase;d.motion.clock.weight=weight;d.motion.move=1;d.motion.crouch=0;d.motion.render({inspectTime:null})},{phase,weight});
    await old.evaluate(({phase,weight})=>{const d=uphillDemo;d.controller.reset('walk',phase,0);d.clock.weight=weight;
      d.controller.mixed.apply();d.controller.captureRaw();d.controller.adapt()},{phase,weight});
    const a=await page.evaluate(snapshot),b=await old.evaluate(snapshot);parity.cases++;
    for(const [key,label] of [['bones','bone'],['vertices','vertex'],['morph','morph']]){
      assert.equal(a[key].length,b[key].length);for(let k=0;k<a[key].length;k++)parity[label]=Math.max(parity[label],Math.abs(a[key][k]-b[key][k]));
    }
    parity.floor=Math.max(parity.floor,Math.abs(a.floor-b.floor));
  }
  for(const k of ['bone','vertex','morph','floor'])assert.ok(parity[k]<1e-5,`Gait parity: ${k} ${parity[k]}`);
  report.parity=parity;await old.close();console.log(`PASS: ${parity.cases} flat walk/run/transition poses match the previous viewer.`);

  // Routes are actual per-frame movement, including detours, four speeds and
  // both stealth settings; bounds concern the circular obstacle approximation.
  const routes=await page.evaluate(()=>{
    const results=[];
    for(const crouch of [false,true])for(const running of [false,true])for(let k=0;k<12;k++){
      demo.reset();demo.setCrouched(crouch);demo.state.pace=running?'run':'walk';
      const a=2*Math.PI*k/12,target={x:demo.obstacle.x+3*Math.cos(a),z:demo.obstacle.z+3*Math.sin(a)};
      demo.moveTo(target.x,target.z);const detour=demo.state.detour;let min=Infinity,maxSpeed=0,i=0;
      for(;i<1000&&demo.state.target;i++){demo.step(.025);min=Math.min(min,Math.hypot(demo.player.position.x-demo.obstacle.x,demo.player.position.z-demo.obstacle.z));maxSpeed=Math.max(maxSpeed,demo.state.actualSpeed)}
      results.push({crouch,running,detour,remaining:!!demo.state.target,error:Math.hypot(demo.player.position.x-target.x,demo.player.position.z-target.z),min,maxSpeed,steps:i});
    }return results;
  });
  assert.ok(routes.some(r=>r.detour));
  for(const r of routes){assert.ok(!r.remaining&&r.error<.03,'Click route did not complete');assert.ok(r.min>=1.4-1e-5,'Hit well obstacle');
    assert.ok(r.maxSpeed<=(r.crouch?.381:r.running?4.371:1.441),'Unexpected route speed')}
  report.routes={count:routes.length,detours:routes.filter(r=>r.detour).length,maxError:Math.max(...routes.map(r=>r.error)),minRadius:Math.min(...routes.map(r=>r.min))};
  console.log(`PASS: ${routes.length} walking/running/crouched routes, collision circle and speed cap.`);

  const inspections=await page.evaluate(()=>{
    const result=[];
    for(let k=0;k<12;k++){
      demo.reset();const previous=demo.state.interactionCount,a=2*Math.PI*k/12;
      demo.player.position.set(demo.obstacle.x+3*Math.cos(a),0,demo.obstacle.z+3*Math.sin(a));demo.inspect();
      let i=0,min=Infinity,states=new Set();for(;i<1000&&demo.state.interactionCount===previous;i++){
        demo.step(.025);states.add(demo.state.interaction);min=Math.min(min,Math.hypot(demo.player.position.x-demo.obstacle.x,demo.player.position.z-demo.obstacle.z));
      }
      result.push({complete:demo.state.interactionCount===previous+1,states:[...states],min,steps:i});
    }return result;
  });
  for(const r of inspections){assert.ok(r.complete&&r.states.includes('face')&&r.states.includes('inspect'));assert.ok(r.min>=1.4-1e-5)}
  report.interactions={count:inspections.length,maxSteps:Math.max(...inspections.map(x=>x.steps))};
  console.log('PASS: 12 approaches, turning toward the well and complete inspection.');

  // Exercise successive crouch/stand reversals while moving, and sample the
  // exact sole guard and eight joints at 60 Hz. This cannot prove naturalness.
  const motion=await page.evaluate(()=>{
    const d=demo,names=['Rig_Head','Rig_Hips','Rig_Shin_L','Rig_Shin_R','Rig_Foot_L','Rig_Foot_R','Rig_Hand_L','Rig_Hand_R'];
    const points=()=>{d.male.updateWorldMatrix(true,true);return names.map(n=>d.male.getObjectByName(n).getWorldPosition(d.camera.position.clone()).toArray())};
    let results=[];
    for(const scenario of ['walk-crouch','run-crouch','crouch-walk','reverse']){
      d.reset();d.player.position.set(6,0,8);d.player.rotation.y=Math.PI;d.state.yaw=0;d.keys.add('KeyW');
      if(scenario==='run-crouch'||scenario==='reverse')d.keys.add('ShiftLeft');
      if(scenario==='crouch-walk')d.setCrouched(true);
      for(let i=0;i<60;i++)d.step(1/60);
      d.setCrouched(scenario!=='crouch-walk');let last=points(),maxJoint=0,minClear=Infinity,maxLift=0;
      for(let i=0;i<90;i++){
        if(scenario==='reverse'&&i===12)d.setCrouched(false);
        d.step(1/60);const now=points();for(let j=0;j<now.length;j++)maxJoint=Math.max(maxJoint,Math.hypot(...now[j].map((x,k)=>x-last[j][k])));
        last=now;minClear=Math.min(minClear,d.motion.floor.minimumBefore+d.motion.floor.lift);maxLift=Math.max(maxLift,d.motion.floor.lift+d.motion.floor.blendLift);
      }
      results.push({scenario,maxJoint,minClear,maxLift,crouch:d.motion.crouch});
    }return results;
  });
  for(const r of motion){assert.ok(r.maxJoint<.18,`${r.scenario}: discontinuity > 18 cm / frame`);assert.ok(r.minClear>=.0009-1e-5,`${r.scenario}: sampled sole below floor`)}
  report.transitions=motion;console.log('PASS: sampled 60 Hz crouch transitions, reversals and sole clearance.');

  // Cover different gait phases, not just a single moment of entering crouch.
  // Position differences are relative to the moving actor, not world travel.
  const sweep=await page.evaluate(()=>{
    const d=demo,names=['Rig_Shin_L','Rig_Shin_R','Rig_Foot_L','Rig_Foot_R','Rig_Hand_L','Rig_Hand_R'],out=[];
    for(const mode of ['walk','run'])for(const direction of ['enter','exit'])for(let seed=0;seed<16;seed++){
      d.reset();d.player.position.set(6,0,8);d.player.rotation.y=Math.PI;d.state.yaw=0;d.keys.add('KeyW');
      if(mode==='run')d.keys.add('ShiftLeft');for(let i=0;i<70;i++)d.step(1/60);
      d.motion.clock.phase=(seed+.23)/16;d.motion.render({inspectTime:null});
      if(direction==='exit'){d.setCrouched(true);for(let i=0;i<70;i++)d.step(1/60)}d.setCrouched(direction==='enter');
      let previous=null,previousDelta=null,maxStep=0,maxSecond=0,maxLift=0,min=Infinity;
      for(let i=0;i<75;i++){
        d.step(1/60);d.player.updateMatrixWorld(true);
        const points=names.map(n=>d.player.worldToLocal(d.male.getObjectByName(n).getWorldPosition(d.camera.position.clone())).toArray());
        if(previous){
          const delta=points.map((p,j)=>p.map((x,k)=>x-previous[j][k]));
          for(let j=0;j<points.length;j++){maxStep=Math.max(maxStep,Math.hypot(...delta[j]));
            if(previousDelta)maxSecond=Math.max(maxSecond,Math.hypot(...delta[j].map((x,k)=>x-previousDelta[j][k])))}
          previousDelta=delta;
        }
        previous=points;maxLift=Math.max(maxLift,d.motion.floor.lift+d.motion.floor.blendLift);
        min=Math.min(min,d.motion.floor.minimumBefore+d.motion.floor.lift);
      }
      out.push({mode,direction,seed,maxStep,maxSecond,maxLift,min});
    }return out;
  });
  for(const r of sweep){assert.ok(r.maxStep<.13&&r.maxSecond<.12,`Extreme sampled joint motion: ${JSON.stringify(r)}`);
    assert.ok(r.maxLift<.05&&r.min>=.0009-1e-5,`Sampled floor correction: ${JSON.stringify(r)}`)}
  report.phaseSweep={cases:sweep.length,maxJointStep:Math.max(...sweep.map(r=>r.maxStep)),maxSecondDifference:Math.max(...sweep.map(r=>r.maxSecond)),
    maxLift:Math.max(...sweep.map(r=>r.maxLift))};
  console.log(`PASS: ${sweep.length} additional crouch transition phase samples.`);

  // Regression for this change: the stand/idle contribution must not return
  // during walk↔run at walking speed or faster. Also verify immediate,
  // interruptible crouch from each starting state and the sprint brake ramp.
  // These are 60 Hz discrete checks, not guarantees for every possible pose.
  const responsive=await page.evaluate(()=>{
    const d=demo,dt=1/60,out={gaits:[],entries:[],reversals:[]};
    for(const scenario of ['walk-run','run-walk','reversal'])for(let seed=0;seed<24;seed++){
      d.reset();d.player.position.set(6,0,8);d.player.rotation.y=Math.PI;d.state.yaw=0;d.keys.add('KeyW');
      if(scenario==='run-walk')d.keys.add('ShiftLeft');for(let i=0;i<70;i++)d.step(dt);
      d.motion.clock.phase=(seed+.37)/24;d.motion.render({inspectTime:null});
      if(scenario==='run-walk')d.keys.delete('ShiftLeft');else d.keys.add('ShiftLeft');
      let minMove=1,maxWeightStep=0,previous=d.motion.clock.weight,min=Infinity,maxLift=0;
      for(let i=0;i<90;i++){
        if(scenario==='reversal'&&i===20)d.keys.delete('ShiftLeft');if(scenario==='reversal'&&i===42)d.keys.add('ShiftLeft');
        d.step(dt);minMove=Math.min(minMove,d.motion.move);maxWeightStep=Math.max(maxWeightStep,Math.abs(d.motion.clock.weight-previous));previous=d.motion.clock.weight;
        min=Math.min(min,d.motion.floor.minimumBefore+d.motion.floor.lift);maxLift=Math.max(maxLift,d.motion.floor.lift+d.motion.floor.blendLift);
      }
      out.gaits.push({scenario,seed,minMove,maxWeightStep,min,maxLift});
    }
    for(const mode of ['idle','walk','run'])for(let seed=0;seed<16;seed++){
      d.reset();d.player.position.set(6,0,8);d.player.rotation.y=Math.PI;d.state.yaw=0;
      if(mode!=='idle')d.keys.add('KeyW');if(mode==='run')d.keys.add('ShiftLeft');for(let i=0;i<70;i++)d.step(dt);
      d.motion.clock.phase=(seed+.37)/16;d.motion.render({inspectTime:null});d.setCrouched(true);
      let times={},speedAt90=null,first=null,maxDelta=0,previous=d.motion.crouch,min=Infinity,maxLift=0;
      for(let i=0;i<70;i++){
        d.step(dt);const c=d.motion.crouch;if(i===0)first=c;
        for(const threshold of [.1,.5,.9,.98])if(c>=threshold&&times[threshold]===undefined){times[threshold]=(i+1)*dt;if(threshold===.9)speedAt90=d.state.actualSpeed}
        maxDelta=Math.max(maxDelta,Math.abs(c-previous));previous=c;
        min=Math.min(min,d.motion.floor.minimumBefore+d.motion.floor.lift);maxLift=Math.max(maxLift,d.motion.floor.lift+d.motion.floor.blendLift);
      }
      out.entries.push({mode,seed,times,speedAt90,first,maxDelta,min,maxLift});
    }
    for(const mode of ['idle','walk','run'])for(const sequence of [[3,7,11],[8,13,22],[15,25,36]]){
      d.reset();d.player.position.set(6,0,8);d.player.rotation.y=Math.PI;d.state.yaw=0;
      if(mode!=='idle')d.keys.add('KeyW');if(mode==='run')d.keys.add('ShiftLeft');for(let i=0;i<70;i++)d.step(dt);
      d.setCrouched(true);let maxDelta=0,previous=d.motion.crouch,min=Infinity,maxLift=0;
      for(let i=0;i<130;i++){
        if(sequence.includes(i))d.setCrouched(!d.state.crouched);
        d.step(dt);maxDelta=Math.max(maxDelta,Math.abs(d.motion.crouch-previous));previous=d.motion.crouch;
        min=Math.min(min,d.motion.floor.minimumBefore+d.motion.floor.lift);maxLift=Math.max(maxLift,d.motion.floor.lift+d.motion.floor.blendLift);
      }
      out.reversals.push({mode,sequence,maxDelta,min,maxLift,final:d.motion.crouch,target:d.state.crouched?1:0});
    }
    return out;
  });
  for(const r of responsive.gaits){assert.ok(r.minMove>.999,`Unexpected idle contribution: ${JSON.stringify(r)}`);
    assert.ok(r.maxWeightStep<.08&&r.min>=.00089&&r.maxLift<.05,`Gait blend discontinuity or floor: ${JSON.stringify(r)}`)}
  for(const r of responsive.entries){assert.ok(r.first>0&&r.times['0.1']<=.051&&r.times['0.9']<=.28,`Delayed crouch: ${JSON.stringify(r)}`);
    assert.ok(r.speedAt90<=.401&&r.maxDelta<.11&&r.min>=.00089&&r.maxLift<.05,`Crouch speed or floor: ${JSON.stringify(r)}`)}
  for(const r of responsive.reversals)assert.ok(Math.abs(r.final-r.target)<.001&&r.maxDelta<.11&&r.min>=.00089&&r.maxLift<.05,`Crouch reversal: ${JSON.stringify(r)}`);
  report.responsiveness={gaitCases:responsive.gaits.length,crouchEntries:responsive.entries.length,reversals:responsive.reversals.length,
    minGaitMove:Math.min(...responsive.gaits.map(r=>r.minMove)),maxBlendStep:Math.max(...responsive.gaits.map(r=>r.maxWeightStep)),
    crouchTiming:responsive.entries[0].times,maxSpeedAt90:Math.max(...responsive.entries.map(r=>r.speedAt90)),
    maxCrouchStep:Math.max(...responsive.entries.map(r=>r.maxDelta),...responsive.reversals.map(r=>r.maxDelta)),
    maxLift:Math.max(...responsive.gaits.map(r=>r.maxLift),...responsive.entries.map(r=>r.maxLift),...responsive.reversals.map(r=>r.maxLift))};
  console.log('PASS: gait acceleration/reversals and responsive, interruptible crouch from idle, walk and run.');

  // Real keyboard events: camera-relative movement, shift-run, crouch speed
  // cap, restoring the run mode, and deceleration after releasing keys.
  await page.evaluate(()=>{demo.reset();demo.player.position.set(6,0,8);demo.player.rotation.y=Math.PI;demo.state.yaw=0;demo.follow()});
  await page.keyboard.down('w');await page.evaluate(()=>{for(let i=0;i<60;i++)demo.step(1/60)});
  near(await page.evaluate(()=>demo.state.actualSpeed),1.44,.02);
  await page.keyboard.down('Shift');await page.evaluate(()=>{for(let i=0;i<90;i++)demo.step(1/60)});
  assert.ok(await page.evaluate(()=>demo.state.actualSpeed)>4.1,'Shift did not run');
  await page.keyboard.press('c');await page.evaluate(()=>{for(let i=0;i<90;i++)demo.step(1/60)});
  near(await page.evaluate(()=>demo.state.actualSpeed),.38,.02);assert.equal(await page.$eval('#crouch',b=>b.getAttribute('aria-pressed')),'true');
  await page.keyboard.press('c');await page.evaluate(()=>{for(let i=0;i<90;i++)demo.step(1/60)});
  assert.ok(await page.evaluate(()=>demo.state.actualSpeed)>4.1,'Run was not restored after standing');
  await page.keyboard.up('w');await page.keyboard.up('Shift');await page.evaluate(()=>{for(let i=0;i<90;i++)demo.step(1/60)});
  near(await page.evaluate(()=>demo.state.actualSpeed),0,.001);await page.keyboard.press('Escape');
  console.log('PASS: actual WASD, Shift, C, restored run and release-to-stop.');

  // Click on floor using a projected world point, and drag without issuing a
  // move. Clicking the well itself must enqueue the interaction instead.
  await page.evaluate(()=>{demo.reset();demo.player.position.set(4,0,4);demo.player.rotation.y=0;demo.follow()});
  const click=await page.evaluate(()=>{const d=demo,v=d.player.position.clone().set(5,0,3.5).project(d.camera),r=d.renderer.domElement.getBoundingClientRect();
    return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2}});
  await page.mouse.click(click.x,click.y);let clickState=await page.evaluate(()=>({target:demo.state.target,interaction:demo.state.interaction}));
  assert.ok(clickState.target&&Math.hypot(clickState.target.x-5,clickState.target.z-3.5)<.02);assert.equal(clickState.interaction,'none');
  await page.evaluate(()=>demo.stop());const beforeYaw=await page.evaluate(()=>demo.state.yaw);
  await page.mouse.move(400,350);await page.mouse.down();await page.mouse.move(465,350,{steps:8});await page.mouse.up();
  assert.ok(Math.abs(await page.evaluate(()=>demo.state.yaw)-beforeYaw)>.1);assert.equal(await page.evaluate(()=>demo.state.target),null);
  await page.evaluate(()=>demo.reset());
  const wellClick=await page.evaluate(()=>{const d=demo,v=d.player.position.clone().set(-.7,2.2,0).project(d.camera),r=d.renderer.domElement.getBoundingClientRect();return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2}});
  await page.mouse.click(wellClick.x,wellClick.y);assert.equal(await page.evaluate(()=>demo.state.interaction),'approach');
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>demo.state.interaction),'none');
  console.log('PASS: real mouse click on ground and well, camera drag and cancel.');

  // The separate trial has an optional close-up: verify actual button and key
  // events, camera distance, and that the button never issues a floor command.
  await page.evaluate(()=>demo.reset());
  const farDistance=await page.evaluate(()=>demo.camera.position.distanceTo(demo.player.position));
  await page.click('#focus');assert.equal(await page.$eval('#focus',b=>b.getAttribute('aria-pressed')),'true');
  const nearDistance=await page.evaluate(()=>demo.camera.position.distanceTo(demo.player.position));
  assert.ok(nearDistance<farDistance*.6,'Close-up did not move camera closer');
  assert.equal(await page.evaluate(()=>demo.state.target),null,'Focus button leaked to canvas');
  await page.keyboard.press('v');assert.equal(await page.$eval('#focus',b=>b.getAttribute('aria-pressed')),'false');
  report.focus={button:true,keyboard:true,farDistance,nearDistance};
  console.log('PASS: close-up toggles with the real button and keyboard.');

  // Emulated touch and visible hit targets on narrow/portrait and landscape.
  const layouts=[];
  for(const [width,height] of [[320,568],[390,844],[768,1024],[844,390]]){
    const p=await open(target,{width,height,deviceScaleFactor:1,isMobile:true,hasTouch:true},isFile);
    await p.evaluate(()=>{demo.setManual(true);demo.reset()});
    const layout=await p.evaluate(()=>({width:innerWidth,docWidth:document.documentElement.scrollWidth,height:innerHeight,
      boxes:[...document.querySelectorAll('.action,.camera-tools button')].map(b=>{const r=b.getBoundingClientRect();return {name:b.id||b.dataset.camera,x:r.x,y:r.y,width:r.width,height:r.height}})}));
    assert.ok(layout.docWidth<=width+1,'Horizontal overflow');
    for(const box of layout.boxes)assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+.1&&box.y+box.height<=height+.1&&box.width>=44&&box.height>=44,`Bad control ${width}: ${JSON.stringify(box)}`);
    const crouch=layout.boxes.find(b=>b.name==='crouch');await p.touchscreen.tap(crouch.x+crouch.width/2,crouch.y+crouch.height/2);
    await p.evaluate(()=>{for(let i=0;i<35;i++)demo.step(.025)});assert.equal(await p.evaluate(()=>demo.state.crouched),true);
    assert.equal(await p.evaluate(()=>demo.state.target),null,'Button tap leaked to canvas');near(await p.evaluate(()=>demo.motion.crouch),1,.001);
    const pace=layout.boxes.find(b=>b.name==='pace');await p.touchscreen.tap(pace.x+pace.width/2,pace.y+pace.height/2);
    assert.equal(await p.evaluate(()=>demo.state.pace),'run');
    const rotate=layout.boxes.find(b=>b.name==='1');const yaw=await p.evaluate(()=>demo.state.yaw);
    await p.touchscreen.tap(rotate.x+rotate.width/2,rotate.y+rotate.height/2);assert.ok(await p.evaluate(()=>demo.state.yaw)>yaw+.4);
    const focus=layout.boxes.find(b=>b.name==='focus');await p.touchscreen.tap(focus.x+focus.width/2,focus.y+focus.height/2);
    assert.equal(await p.evaluate(()=>demo.state.focus),true);assert.equal(await p.evaluate(()=>demo.state.target),null,'Focus tap leaked to canvas');
    const framing=await p.evaluate(()=>{const d=demo,V=d.player.position.constructor;d.male.updateWorldMatrix(true,true);
      return ['Rig_Head','Rig_Foot_L','Rig_Foot_R'].map(n=>d.male.getObjectByName(n).getWorldPosition(new V()).project(d.camera).toArray())});
    for(const point of framing)assert.ok(Math.abs(point[0])<.98&&Math.abs(point[1])<.98,`Close-up cropped a joint at ${width}x${height}: ${point}`);
    const reset=layout.boxes.find(b=>b.name==='reset');await p.touchscreen.tap(reset.x+reset.width/2,reset.y+reset.height/2);
    assert.equal(await p.evaluate(()=>demo.state.crouched),false);assert.equal(await p.evaluate(()=>demo.state.pace),'walk');
    assert.equal(await p.evaluate(()=>demo.state.focus),false,'Reset did not restore the wide view');
    // Tapping the scene and dragging the camera are essential on a phone, not
    // just tapping HTML buttons. These remain browser-emulated touch events.
    const canvas=await p.evaluate(()=>{const r=demo.renderer.domElement.getBoundingClientRect();
      return {x:r.right-30,y:r.top+r.height*.60}});
    await p.touchscreen.tap(canvas.x,canvas.y);
    assert.ok(await p.evaluate(()=>demo.state.target),'Touch ground did not create a route');
    assert.equal(await p.evaluate(()=>demo.state.interaction),'none');
    await p.touchscreen.tap(reset.x+reset.width/2,reset.y+reset.height/2);
    const well=await p.evaluate(()=>{const d=demo,v=d.player.position.clone().set(-.7,2.2,0).project(d.camera),r=d.renderer.domElement.getBoundingClientRect();
      return {x:r.left+(v.x+1)*r.width/2,y:r.top+(1-v.y)*r.height/2}});
    await p.touchscreen.tap(well.x,well.y);assert.equal(await p.evaluate(()=>demo.state.interaction),'approach','Touch well did not start interaction');
    await p.touchscreen.tap(reset.x+reset.width/2,reset.y+reset.height/2);
    const beforeDrag=await p.evaluate(()=>demo.state.yaw),finger=await p.touchscreen.touchStart(canvas.x,canvas.y);
    await finger.move(canvas.x-35,canvas.y);await finger.move(canvas.x-55,canvas.y);await finger.end();
    assert.ok(Math.abs(await p.evaluate(()=>demo.state.yaw)-beforeDrag)>.1,'Touch drag did not rotate camera');
    assert.equal(await p.evaluate(()=>demo.state.target),null,'Touch drag became a click');
    layouts.push({width,height,controls:layout.boxes.length,groundTap:true,wellTap:true,cameraDrag:true,focusFramed:true});await p.close();
  }
  report.layouts=layouts;console.log('PASS: emulated taps on controls, ground and well, plus camera drag at four screen sizes.');
  // The main tests use deterministic manual steps. Separately exercise the
  // real requestAnimationFrame loop after an emulated touch, without stepping.
  const live=await open(target,{width:390,height:844,deviceScaleFactor:1,isMobile:true,hasTouch:true},isFile);
  const before=await live.evaluate(()=>{const r=demo.renderer.domElement.getBoundingClientRect();return {x:demo.player.position.x,z:demo.player.position.z,
    manual:demo.state.manual,tap:{x:r.right-30,y:r.top+r.height*.6}}});
  await live.touchscreen.tap(before.tap.x,before.tap.y);
  await live.waitForFunction(({x,z})=>Math.hypot(demo.player.position.x-x,demo.player.position.z-z)>.08,{timeout:20000},before);
  const crouchBox=await live.$eval('#crouch',b=>{const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}});
  await live.touchscreen.tap(crouchBox.x,crouchBox.y);
  await live.waitForFunction('demo.state.crouched && demo.motion.crouch > .1',{timeout:20000});
  const after=await live.evaluate(()=>({x:demo.player.position.x,z:demo.player.position.z,manual:demo.state.manual,crouched:demo.state.crouched,crouch:demo.motion.crouch}));
  assert.equal(before.manual,false);assert.equal(after.manual,false);assert.equal(after.crouched,true);
  report.liveTouch={moved:Math.hypot(after.x-before.x,after.z-before.z)>.08,crouchResponded:after.crouch>.1,manual:false};
  await live.close();console.log('PASS: live animation loop responds to emulated touch and crouch.');
  const reduced=await browser.newPage();await reduced.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
  await reduced.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  if(isFile)await reduced.setOfflineMode(true);await reduced.goto(target,{waitUntil:'load'});await reduced.waitForFunction('window.ready===true');
  const reducedResult=await reduced.evaluate(()=>{demo.setManual(true);for(let i=0;i<40;i++)demo.step(.025);return {enabled:demo.state.reducedMotion,idleTime:demo.motion.idleTime}});
  assert.deepEqual(reducedResult,{enabled:true,idleTime:0});await reduced.close();
  report.reducedMotion=reducedResult;assert.deepEqual(errors,[]);await page.close();
  const qa={status:'pass',transport:isFile?'local file with network disabled':'same-origin HTTP',htmlSha256:sha(Buffer.from(html)),
    scope:'Discrete automated samples and emulated touch; not proof of naturalness, collision-free motion or performance on a physical phone.',results:report};
  fs.writeFileSync(path.join(output,isFile?'qa-offline.json':'qa-http.json'),JSON.stringify(qa,null,2)+'\n');
  console.log('PASS: reduced-motion setting and no console/network errors.');
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close()}
