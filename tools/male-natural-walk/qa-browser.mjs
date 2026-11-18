// Browser regression: offline, real inputs, controller, comparisons and layouts.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default;
const argv=process.argv.slice(2),output=path.resolve(argv.find(x=>!x.startsWith('--'))||path.join(root,'work/male-natural-walk'));
const arg=argv.find(x=>x.startsWith('--screenshots=')),shots=arg?path.resolve(arg.slice('--screenshots='.length)):fs.mkdtempSync(path.join(os.tmpdir(),'bow-reference-locomotion-review-'));
fs.mkdirSync(shots,{recursive:true});const errors=[];
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',dumpio:true,
 args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],defaultViewport:{width:1280,height:720,deviceScaleFactor:1}});
async function open(file,viewport,reduce=false){const page=await browser.newPage();if(viewport)await page.setViewport(viewport);
 if(reduce)await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
 page.on('pageerror',e=>errors.push('page: '+e.message));
 page.on('console',m=>{if(m.type()==='error'||(m.type()==='warn'&&m.text().startsWith('THREE.')))errors.push('console: '+m.text())});
 await page.setRequestInterception(true);page.on('request',r=>{if(/^(file|data|blob):/i.test(r.url()))r.continue();else{errors.push('external request: '+r.url());r.abort()}});
 await page.setOfflineMode(true);await page.goto(pathToFileURL(file).href,{waitUntil:'load',timeout:120_000});await page.waitForFunction('window.ready===true',{timeout:120_000});return page}
const frame=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const near=(a,b,tol=1e-6)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b} (${tol})`);
const nearArray=(a,b,tol=1e-6)=>a.forEach((x,i)=>near(x,b[i],tol));
try{
 const page=await open(path.join(output,'index.html'));await frame(page);
 const initial=await page.evaluate(()=>({view:demo.state.view,mode:demo.state.mode,pace:demo.state.pace,breath:demo.state.breath,variant:demo.state.variant,neck:demo.state.neck,bones:demo.bones.length,
  clips:[...demo.clips.keys()],well:demo.well.visible,skeleton:demo.skeleton.visible,zoom:demo.controls.enableZoom,pan:demo.controls.enablePan,two:demo.controls.touches.TWO,
  skinned:['head_1','head_2'].map(n=>demo.male.getObjectByName(n).isSkinnedMesh),morph:[demo.male.getObjectByName('head_1').morphTargetInfluences.slice(),demo.male.getObjectByName('head_2').morphTargetInfluences.slice(0,2)],position:demo.player.position.toArray()}));
 assert.deepEqual(initial,{view:'inspect',mode:'walk',pace:'walk',breath:'soft',variant:'after',neck:'refined',bones:22,clips:['Idle_Breathing','Walk_Loop','Run_Loop','Test_Arms','Test_Elbow','Test_Knee','Test_Head','Previous_Walk','Previous_Refined_Idle','Previous_Idle','Previous_Arms','Previous_Knee','Reference_Walk','Reference_Run','Corrected_Walk','Corrected_Run','Adjusted_Walk','Adjusted_Run','Game_Style_Walk','Game_Style_Jog','Relaxed_Walk'],
  well:false,skeleton:false,zoom:false,pan:false,two:null,skinned:[true,true],morph:[[1],[0,1]],position:[1,0,.15]});
 const initialFacing=await page.evaluate(()=>demo.currentYaw()-demo.player.rotation.y);
 near(Math.atan2(Math.sin(initialFacing-Math.PI/2),Math.cos(initialFacing-Math.PI/2)),0,1e-5);
 // Long desktop controls should not scroll the model out of view.
 await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await frame(page);
 const sticky=await page.evaluate(()=>{const r=document.querySelector('main').getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight}});
 assert.ok(sticky.top>=0&&sticky.bottom<=sticky.height,'desktop scene is not visible while scrolling controls');
 await page.evaluate(()=>window.scrollTo(0,0));await frame(page);
 await page.waitForFunction('demo.state.phase > .05');
 // Check that the default loop advances on requestAnimationFrame and then
 // moves the player all the way to a mouse-set goal without test-only steps.
 await page.evaluate(()=>demo.moveTo(2.7,.15));
 await page.waitForFunction('demo.player.position.x > 1.3',{timeout:30_000});
 await page.waitForFunction('demo.state.target === null',{timeout:30_000});
 let auto=await page.evaluate(()=>({position:demo.player.position.toArray(),speed:demo.state.speed}));
 assert.ok(Math.hypot(auto.position[0]-2.7,auto.position[2]-.15)<.08);assert.equal(auto.speed,0);
 await page.evaluate(()=>{demo.setManual(true);demo.reset()});
 const focus=await page.evaluate(()=>{
  demo.setMode('run');window.dispatchEvent(new Event('blur'));const preview=demo.state.mode;
  demo.setMode('control');demo.moveTo(3,2);demo.keys.add('ShiftLeft');window.dispatchEvent(new Event('blur'));
  return {preview,target:demo.state.target,keys:demo.keys.size};
 });
 assert.equal(focus.preview,'run');assert.ok(focus.target);assert.equal(focus.keys,0);await page.evaluate(()=>demo.reset());
 await page.click('[data-skeleton]');assert.equal(await page.evaluate(()=>demo.skeleton.visible),true);await page.click('[data-skeleton]');assert.equal(await page.evaluate(()=>demo.skeleton.visible),false);
 await page.click('[data-breath="old"]');assert.equal(await page.$eval('[data-breath="old"]',b=>b.getAttribute('aria-pressed')),'true');assert.equal(await page.$eval('[data-breath="old"]',b=>getComputedStyle(b).backgroundColor),'rgb(239, 215, 166)');
 await page.click('[data-breath="soft"]');assert.equal(await page.evaluate(()=>demo.state.breath),'soft');
 await page.click('[data-mode="walk"]');let phase=await page.evaluate(()=>demo.state.phase);await page.evaluate(()=>demo.step(.05));assert.ok((await page.evaluate(()=>demo.state.phase))>phase);
 await page.click('[data-mode="run"]');assert.equal(await page.evaluate(()=>demo.state.mode),'run');
 await page.evaluate(()=>{for(let i=0;i<12;i++)demo.step(.05)});await page.click('[data-reset-player]');
 assert.deepEqual(await page.evaluate(()=>({mode:demo.state.mode,motion:demo.state.motionBlend,run:demo.state.runBlend})),{mode:'control',motion:0,run:0});
 await page.click('[data-mode="run"]');await page.click('[data-stop]');assert.equal(await page.evaluate(()=>demo.state.mode),'control');assert.equal(await page.evaluate(()=>demo.state.speed),0);
 await page.click('[data-pace="run"]');assert.equal(await page.evaluate(()=>demo.state.pace),'run');await page.click('[data-pace="walk"]');
 const speeds=await page.evaluate(()=>{
  const result={};for(const variant of ['earlier','before','after']){
   demo.reset();demo.setVariant(variant);demo.player.position.set(6,0,5);demo.setView('inspect');demo.setYaw(0);demo.player.rotation.y=Math.PI;
   demo.keys.add('KeyW');demo.keys.add('ShiftLeft');for(let i=0;i<120;i++)demo.step(.016);result[variant]=demo.state.actualSpeed;demo.keys.clear();
  }demo.reset();demo.setVariant('after');return result;
 });
 near(speeds.earlier,2.2,1e-5);near(speeds.before,1.9,1e-5);near(speeds.after,1.9,1e-5);
 console.log('PASS: offline page, all 21 clips, initial playback, reset, buttons and original/new controller speeds '+JSON.stringify(speeds));

 // Three-way comparison changes walk; earlier run differs, but before/after run is identical; neck is independent. Preserve the
 // camera and normalized phase. Exercise the real buttons and range input.
 assert.equal(await page.$eval('#phase-tools',e=>e.hidden),true);
 await page.click('[data-mode="walk"]');await page.click('[data-view="neck"]');
 assert.equal(await page.$eval('#phase-tools',e=>e.hidden),false);
 await page.click('[data-play]');assert.equal(await page.evaluate(()=>demo.state.playing),false);
 await page.focus('#phase');await page.keyboard.press('End');near(await page.evaluate(()=>demo.state.phase),1);
 await page.$eval('#phase',e=>{e.value='370';e.dispatchEvent(new Event('input',{bubbles:true}))});
 const comparison=()=>({phase:demo.state.phase,playing:demo.state.playing,view:demo.state.view,yaw:demo.currentYaw(),camera:demo.camera.position.toArray(),player:demo.player.position.toArray(),
  morph:['head_1','head_2'].map(n=>demo.male.getObjectByName(n).morphTargetInfluences.slice()),weights:Object.fromEntries(Object.entries(demo.actions).map(([n,a])=>[n,a.getEffectiveWeight()]))});
 const profile=morph=>[morph[0],morph[1].slice(0,2)];
 const newer=await page.evaluate(comparison);near(newer.phase,.37);assert.equal(newer.playing,false);assert.equal(newer.view,'neck');
 assert.deepEqual(profile(newer.morph),[[1],[0,1]]);near(newer.weights.walk,1);near(newer.weights.previousWalk,0);
 await page.evaluate(()=>{for(let i=0;i<20;i++)demo.step(.05)});near(await page.evaluate(()=>demo.state.phase),.37);
 await page.click('[data-variant="before"]');const older=await page.evaluate(comparison);
 near(older.phase,newer.phase);near(older.yaw,newer.yaw);nearArray(older.camera,newer.camera);nearArray(older.player,newer.player);
 assert.deepEqual(profile(older.morph),[[1],[0,1]]);assert.deepEqual(older.morph[1].slice(6),[0,0,0,0]);assert.deepEqual(newer.morph[1].slice(6),[0,0,0,0]);near(older.weights.walk,0);near(older.weights.previousWalk,1);
 await page.click('[data-variant="earlier"]');const earliest=await page.evaluate(comparison);
 near(earliest.phase,newer.phase);near(earliest.yaw,newer.yaw);nearArray(earliest.camera,newer.camera);nearArray(earliest.player,newer.player);
 assert.ok(earliest.morph[1].slice(6,9).some(n=>Math.abs(n)>.01));near(earliest.weights.earlierWalk,1);near(earliest.weights.previousWalk,0);
 await page.click('[data-variant="before"]');
 await page.click('[data-neck="original"]');assert.deepEqual(profile((await page.evaluate(comparison)).morph),[[0],[0,0]]);
 assert.equal(await page.$eval('[data-neck="original"]',b=>b.getAttribute('aria-pressed')),'true');
 assert.equal(await page.$eval('[data-variant="before"]',b=>b.getAttribute('aria-pressed')),'true');
 await page.click('[data-variant="after"]');assert.deepEqual(profile((await page.evaluate(comparison)).morph),[[0],[0,0]]);
 await page.click('[data-neck="refined"]');assert.deepEqual(profile((await page.evaluate(comparison)).morph),[[1],[0,1]]);
 await page.click('[data-play]');await page.evaluate(()=>demo.step(.05));assert.ok(await page.evaluate(()=>demo.state.phase)>.37);
 await page.click('[data-mode="run"]');await page.click('[data-play]');
 await page.$eval('#phase',e=>{e.value='410';e.dispatchEvent(new Event('input',{bubbles:true}))});
 await page.click('[data-variant="before"]');const runBefore=await page.evaluate(comparison);
 await page.click('[data-variant="after"]');const runAfter=await page.evaluate(comparison);
 near(runBefore.phase,.41);near(runAfter.phase,.41);near(runBefore.weights.run,0);near(runBefore.weights.previousRun,1);near(runAfter.weights.run,1);near(runAfter.weights.previousRun,0);
 nearArray(runBefore.camera,runAfter.camera);assert.deepEqual(profile(runBefore.morph),[[1],[0,1]]);assert.deepEqual(runBefore.morph[1].slice(6),[0,0,0,0]);assert.deepEqual(profile(runAfter.morph),[[1],[0,1]]);assert.deepEqual(runAfter.morph[1].slice(6),[0,0,0,0]);
 await page.click('[data-variant="earlier"]');const runEarlier=await page.evaluate(comparison);
 near(runEarlier.phase,.41);near(runEarlier.weights.earlierRun,1);near(runEarlier.weights.run,0);near(runEarlier.weights.previousRun,0);
 assert.deepEqual(runEarlier.morph[1].slice(6),[0,0,0,1]);await page.click('[data-variant="after"]');
 await page.click('[data-rate="0.5"]');assert.equal(await page.evaluate(()=>demo.state.rate),.5);
 await page.click('[data-rate="1"]');assert.equal(await page.evaluate(()=>demo.state.rate),1);
 for(const [facing,expected] of [['front',0],['side',Math.PI/2],['back',Math.PI]]){
  await page.click(`[data-facing="${facing}"]`);
  const delta=await page.evaluate(()=>demo.currentYaw()-demo.player.rotation.y);
  near(Math.atan2(Math.sin(delta-expected),Math.cos(delta-expected)),0,1e-5);
 }
 await page.click('[data-stop]');assert.equal(await page.$eval('#phase-tools',e=>e.hidden),true);
 console.log('PASS: comparison, independent neck, pause/scrub/resume, explicit walk/run clip mapping preserve camera and normalized phase');

 // Real mouse, Shift+mouse, keyboard, drag, wheel and Escape, not direct API calls.
 await page.click('[data-view="game"]');await page.evaluate(()=>{demo.reset();demo.setYaw(25*Math.PI/180)});let box=await (await page.$('#view canvas')).boundingBox(),x=box.x+box.width*.67,y=box.y+box.height*.67;
 await page.mouse.click(x,y);assert.ok(await page.evaluate(()=>!!demo.state.target));assert.equal(await page.evaluate(()=>demo.state.shiftTarget),false);
 await page.keyboard.down('Shift');await page.mouse.click(x+22,y+12);await page.keyboard.up('Shift');assert.equal(await page.evaluate(()=>demo.state.shiftTarget),true);
 const dragBefore=await page.evaluate(()=>({yaw:demo.currentYaw(),target:{...demo.state.target},distance:demo.camera.position.distanceTo(demo.controls.target)}));
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+110,y,{steps:10});await page.mouse.up();
 const dragAfter=await page.evaluate(()=>({yaw:demo.currentYaw(),target:demo.state.target,distance:demo.camera.position.distanceTo(demo.controls.target)}));
 assert.ok(Math.abs(dragAfter.yaw-dragBefore.yaw)>.1);assert.deepEqual(dragAfter.target,dragBefore.target);near(dragAfter.distance,dragBefore.distance);
 await page.mouse.wheel({deltaY:-600});await frame(page);near(await page.evaluate(()=>demo.camera.position.distanceTo(demo.controls.target)),dragBefore.distance);
 await page.evaluate(()=>demo.reset());const start=await page.evaluate(()=>demo.player.position.toArray());await page.keyboard.down('w');await page.evaluate(()=>{for(let i=0;i<100;i++)demo.step(.016)});await page.keyboard.up('w');
 let moved=await page.evaluate(()=>demo.player.position.toArray());assert.ok(Math.hypot(moved[0]-start[0],moved[2]-start[2])>.5);assert.equal(await page.evaluate(()=>demo.state.target),null);
 await page.keyboard.down('Shift');await page.keyboard.down('d');await page.evaluate(()=>{for(let i=0;i<120;i++)demo.step(.016)});assert.ok(await page.evaluate(()=>demo.state.actualSpeed)>1.8);await page.keyboard.up('d');await page.keyboard.up('Shift');
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>demo.state.speed),0);assert.equal(await page.evaluate(()=>demo.keys.size),0);
 await page.click('[data-reset-player]');nearArray(await page.evaluate(()=>demo.player.position.toArray()),[1,0,.15]);
 const cameraBefore=await page.evaluate(()=>({cam:demo.camera.position.toArray(),target:demo.controls.target.toArray(),player:demo.player.position.toArray()}));
 await page.keyboard.down('d');await page.evaluate(()=>{for(let i=0;i<80;i++)demo.step(.016)});await page.keyboard.up('d');const cameraAfter=await page.evaluate(()=>({cam:demo.camera.position.toArray(),target:demo.controls.target.toArray(),player:demo.player.position.toArray()}));
 nearArray(cameraAfter.cam.map((v,i)=>v-cameraBefore.cam[i]),cameraAfter.player.map((v,i)=>v-cameraBefore.player[i]),1e-5);
 nearArray(cameraAfter.target.map((v,i)=>v-cameraBefore.target[i]),cameraAfter.player.map((v,i)=>v-cameraBefore.player[i]),1e-5);
 console.log('PASS: mouse click/Shift-click, camera drag, disabled zoom, WASD/Shift/Escape and camera follow');

 // Circular routing and continuous player collision, including into the well.
 const navigation=await page.evaluate(()=>{
  const d=demo;let cases=[],worst=Infinity;
  for(let k=0;k<180;k++){
   d.reset();const a=2*Math.PI*k/180,target={x:d.obstacle.x+3*Math.cos(a),z:d.obstacle.z+3*Math.sin(a)};d.moveTo(target.x,target.z,k%2===0);let detour=d.state.detour;
   for(let i=0;i<1200&&d.state.target;i++){d.step(.016);worst=Math.min(worst,Math.hypot(d.player.position.x-d.obstacle.x,d.player.position.z-d.obstacle.z))}
   cases.push({detour,remaining:!!d.state.target,error:Math.hypot(d.player.position.x-target.x,d.player.position.z-target.z)});
  }
  d.reset();d.moveTo(d.obstacle.x,d.obstacle.z);for(let i=0;i<1000&&d.state.target;i++)d.step(.016);const inside=Math.hypot(d.player.position.x-d.obstacle.x,d.player.position.z-d.obstacle.z);
  d.reset();d.setView('game');d.setYaw(Math.PI/2);d.keys.add('KeyW');for(let i=0;i<500;i++){d.step(.016);worst=Math.min(worst,Math.hypot(d.player.position.x-d.obstacle.x,d.player.position.z-d.obstacle.z))}d.keys.clear();
  return {cases,worst,inside,radius:d.obstacle.radius};
 });
 assert.ok(navigation.cases.filter(x=>x.detour).length>30);for(const c of navigation.cases)assert.ok(!c.remaining&&c.error<.08,'path did not reach goal');
 assert.ok(navigation.worst>=navigation.radius-1e-5&&navigation.inside>=navigation.radius);console.log(`PASS: 180 click routes (including around well), click inside well and keyboard collision; min centre clearance ${navigation.worst.toFixed(3)} m`);
 const turning=await page.evaluate(()=>{
  const d=demo;d.reset();d.setYaw(0);d.keys.add('KeyW');for(let i=0;i<120;i++)d.step(.016);d.keys.delete('KeyW');d.keys.add('KeyS');
  let min=1;for(let i=0;i<35;i++){const prev=d.player.position.clone();d.step(.016);const delta=d.player.position.clone().sub(prev);if(delta.length()>1e-7){delta.normalize();min=Math.min(min,Math.sin(d.player.rotation.y)*delta.x+Math.cos(d.player.rotation.y)*delta.z)}}d.keys.clear();return min;
 });
 assert.ok(turning>.7,'player translated sideways during a 180-degree reversal');
 console.log(`PASS: player turns before moving in a new direction (sampled minimum forward alignment ${turning.toFixed(3)})`);

 // Match the untouched, generated well at mesh/material/texture level.
 const previous=await open(path.join(root,'work/male-zomboid-style/index.html'));
 const earlierPage=await open(path.join(root,'work/male-belly-triceps/index.html'));
 const fingerprint=()=>{function hash(arr){let h=2166136261;const u=new Uint8Array(arr.buffer,arr.byteOffset,arr.byteLength);for(const b of u)h=Math.imul(h^b,16777619);return h>>>0}
  const rows=[];let texture='';demo.well.traverse(o=>{if(!o.isMesh)return;const m=o.material,g=o.geometry,a={};for(const k of Object.keys(g.attributes).sort())a[k]=[g.attributes[k].count,g.attributes[k].itemSize,hash(g.attributes[k].array)];
   const map=m.map;if(map&&!texture)texture=map.image.toDataURL();rows.push({position:o.position.toArray(),quaternion:o.quaternion.toArray(),scale:o.scale.toArray(),attributes:a,index:g.index&&[g.index.count,hash(g.index.array)],material:[m.type,m.color?.getHex(),m.side,m.flatShading,map?.wrapS,map?.wrapT,map?.minFilter,map?.magFilter],cast:o.castShadow,receive:o.receiveShadow})});return JSON.stringify({rows,texture})};
 assert.equal(await page.evaluate(fingerprint),await previous.evaluate(fingerprint),'well differs from previous trial');
 console.log('PASS: detailed well mesh, transforms, materials and generated texture match the previous viewer');
 // Compare rendered, skinned positions in the actual old viewer against the
 // new viewer with the same reversible profile, at identical cycle phases.
 const samplePose=({variant,mode,phase})=>{
  const d=demo;d.reset();d.setManual(true);d.setVariant(variant);d.setMode(mode);d.setPhase(phase);
  d.scene.updateMatrixWorld(true);const v=d.camera.position.clone(),out=[];
  for(const name of ['head_1','head_2','ear-makehuman-left','ear-makehuman-right']){const mesh=d.male.getObjectByName(name),p=mesh.geometry.attributes.position;if(mesh.skeleton)mesh.skeleton.update();
   for(let i=0;i<p.count;i+=9){mesh.getVertexPosition(i,v);v.applyMatrix4(mesh.matrixWorld);out.push(v.x,v.y,v.z)}}return out;
 };
 let previousMatch=0;
 for(const mode of ['walk','run'])for(const phase of [0,.125,.25,.5,.75,.9]){
  const a=await previous.evaluate(samplePose,{variant:'after',mode,phase}),b=await page.evaluate(samplePose,{variant:'before',mode,phase});assert.equal(a.length,b.length);
  for(let i=0;i<a.length;i++)previousMatch=Math.max(previousMatch,Math.abs(a[i]-b[i]));
 }
 assert.ok(previousMatch<2e-6,`old viewer pose mismatch: ${previousMatch}`);
 console.log(`PASS: before comparison matches actual last published walk and run mesh samples, with the same neck profile (max component difference ${previousMatch})`);
 let unchangedRun=0;
 for(const phase of [0,.125,.25,.5,.75,.9]){
  const a=await page.evaluate(samplePose,{variant:'before',mode:'run',phase}),b=await page.evaluate(samplePose,{variant:'after',mode:'run',phase});
  for(let i=0;i<a.length;i++)unchangedRun=Math.max(unchangedRun,Math.abs(a[i]-b[i]));
 }
 assert.ok(unchangedRun<2e-6,`new and previous jog differ: ${unchangedRun}`);
 console.log(`PASS: new and previous jog use the same sampled mesh poses (max component difference ${unchangedRun})`);
 let earlierMatch=0;
 for(const mode of ['walk','run'])for(const phase of [0,.125,.25,.5,.75,.9]){
  const a=await earlierPage.evaluate(samplePose,{variant:'after',mode,phase}),b=await page.evaluate(samplePose,{variant:'earlier',mode,phase});assert.equal(a.length,b.length);
  for(let i=0;i<a.length;i++)earlierMatch=Math.max(earlierMatch,Math.abs(a[i]-b[i]));
 }
 assert.ok(earlierMatch<2e-6,`earlier viewer pose mismatch: ${earlierMatch}`);
 console.log(`PASS: earlier comparison matches belly/triceps viewer at sampled phases (max component difference ${earlierMatch})`);
 await previous.close();await earlierPage.close();await page.evaluate(()=>{demo.reset();demo.setVariant('after')});

 // Transition continuity at 60 Hz after aligning the character with movement.
 const transitions=await page.evaluate(()=>{
  const d=demo;d.reset();d.setManual(true);d.setView('inspect');d.setYaw(0);d.player.rotation.y=Math.PI;d.step(.05);
  const body=d.male.getObjectByName('head_2'),p=body.geometry.attributes.position,v=d.camera.position.clone();
  const sample=()=>{d.scene.updateMatrixWorld(true);body.skeleton.update();const a=[];for(let i=0;i<p.count;i+=5){body.getVertexPosition(i,v);v.applyMatrix4(body.matrixWorld);a.push(v.x-d.player.position.x,v.y-d.player.position.y,v.z-d.player.position.z)}return a};
  let prev=sample(),res={start:0,change:0,stop:0},group='start';
  function tick(){d.step(1/60);let next=sample(),max=0;for(let i=0;i<next.length;i+=3)max=Math.max(max,Math.hypot(next[i]-prev[i],next[i+1]-prev[i+1],next[i+2]-prev[i+2]));res[group]=Math.max(res[group],max);prev=next}
  d.keys.add('KeyW');for(let i=0;i<120;i++)tick();group='change';d.keys.add('ShiftLeft');for(let i=0;i<120;i++)tick();group='stop';d.keys.clear();for(let i=0;i<90;i++)tick();return res;
 });
 for(const [name,n] of Object.entries(transitions))assert.ok(n<.12,`${name} discontinuity ${n}`);console.log('PASS: sampled 60 Hz start, walk→run and stop transitions, maximum relative vertex movement '+JSON.stringify(transitions));

 // Layout checks allow vertical scrolling for the controls; no horizontal
 // overflow. All controls remain reachable and leg detail is framed at 8 yaws.
 const viewports=[['desktop',1280,720],['phone',390,844],['small phone',320,568],['minimum phone',290,568],['tall phone',360,896],['landscape',568,320],['short phone',390,400],['large desktop',1920,1080]];
 for(const [label,width,height] of viewports){
  await page.setViewport({width,height,deviceScaleFactor:1});await frame(page);
  const result=await page.evaluate(()=>{
   const d=demo;d.reset();d.setManual(true);const v=d.camera.position.clone(),o=d.male.getObjectByName('head_2'),p=o.geometry.attributes.position;
   const cases=[];for(const view of ['game','normal','inspect','upper','legs','neck'])for(let a=0;a<360;a+=45){d.setView(view);d.setYaw(a*Math.PI/180);
    for(const mode of ['control','walk','run']){d.setMode(mode);for(let f=0;f<8;f++){d.step(.05);d.scene.updateMatrixWorld(true);d.camera.updateMatrixWorld(true);o.skeleton.update();const bounds=[Infinity,-Infinity,Infinity,-Infinity];
     // Detail views intentionally crop the torso: test legs or neck/head only.
     for(const name of (view==='legs'||view==='upper')?['head_2']:['head_2','head_1','ear-makehuman-left','ear-makehuman-right']){const mesh=d.male.getObjectByName(name),p=mesh.geometry.attributes.position;if(mesh.skeleton)mesh.skeleton.update();for(let i=0;i<p.count;i+=2){if(view==='legs'&&p.getY(i)>.94)continue;if(view==='upper'&&(p.getY(i)<.90||p.getY(i)>1.50))continue;if(view==='neck'&&name==='head_2'&&(p.getY(i)<1.38||Math.abs(p.getX(i))>.21))continue;mesh.getVertexPosition(i,v);v.applyMatrix4(mesh.matrixWorld).project(d.camera);bounds[0]=Math.min(bounds[0],v.x);bounds[1]=Math.max(bounds[1],v.x);bounds[2]=Math.min(bounds[2],v.y);bounds[3]=Math.max(bounds[3],v.y)}}
     if(bounds.some(n=>Math.abs(n)>1))cases.push({view,a,mode,f,bounds});
    }}
   }
   d.reset();d.setView('game');d.setYaw(d.views.game.startYaw);d.draw();
   return {cases,page:[document.documentElement.clientWidth,document.documentElement.scrollWidth],canvas:[d.renderer.domElement.clientWidth,d.renderer.domElement.clientHeight],aspect:d.camera.aspect,
    clipped:[...document.querySelectorAll('button')].filter(b=>b.scrollWidth>b.clientWidth+1||b.scrollHeight>b.clientHeight+1).map(b=>b.textContent),
    outside:[...document.querySelectorAll('button')].filter(b=>{let r=b.getBoundingClientRect();return r.left<0||r.right>innerWidth}).map(b=>b.textContent)};
  });
  assert.equal(result.page[0],result.page[1],`${label} horizontal overflow`);near(result.aspect,result.canvas[0]/result.canvas[1],.003);
  assert.deepEqual(result.clipped,[],`${label} clipped controls`);assert.deepEqual(result.outside,[],`${label} controls outside horizontal viewport`);
  assert.deepEqual(result.cases,[],`${label} model cropped in views`);console.log(`PASS ${label}: controls and 6 views × 8 angles × 3 modes × 8 sampled poses`);
  if(['desktop','small phone'].includes(label)){await page.screenshot({path:path.join(shots,label+'.png'),fullPage:true})}
 }
 // Real touch tap/drag after viewport change: drag must not replace target.
 await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:1});await frame(page);
 await page.evaluate(()=>{window.scrollTo(0,0);demo.setManual(true);demo.setView('game');demo.reset()});await frame(page);
 box=await (await page.$('#view canvas')).boundingBox();x=box.x+box.width*.7;y=box.y+box.height*.6;
 await page.touchscreen.tap(x,y);const touch=await page.evaluate(()=>({target:demo.state.target,yaw:demo.currentYaw()}));assert.ok(touch.target);
 const client=await page.target().createCDPSession();await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 for(let i=1;i<=8;i++)await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+i*10,y}]});await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const touchAfter=await page.evaluate(()=>({target:demo.state.target,yaw:demo.currentYaw()}));assert.deepEqual(touchAfter.target,touch.target);assert.ok(Math.abs(touchAfter.yaw-touch.yaw)>.1);
 await page.click('[data-pace="run"]');await page.evaluate(()=>window.scrollTo(0,0));await frame(page);
 box=await (await page.$('#view canvas')).boundingBox();x=box.x+box.width*.7;y=box.y+box.height*.6;
 await page.touchscreen.tap(x,y);assert.equal(await page.evaluate(()=>demo.state.pace),'run');assert.ok(await page.evaluate(()=>!!demo.state.target));
 console.log('PASS: real touch tap, one-finger rotation without replacing target, and run selection');

 // Screenshots are for human inspection, not golden image assertions.
 await page.setViewport({width:1280,height:900,deviceScaleFactor:1});await page.evaluate(()=>window.scrollTo(0,0));await frame(page);
 for(const [name,mode,view,yaw] of [['run-front','run','inspect',0],['run-side','run','inspect',Math.PI/2],['walk-side','walk','inspect',Math.PI/2],['run-legs','run','legs',0]]){
  await page.evaluate(({mode,view,yaw})=>{demo.reset();demo.setMode(mode);demo.setView(view);demo.setYaw(yaw);for(let i=0;i<20;i++)demo.step(.016);demo.draw()},{mode,view,yaw});
  await page.screenshot({path:path.join(shots,name+'.png')});
 }
 // Mobile close-up must keep the leg focus out of badge/help overlays.
 await page.setViewport({width:320,height:568,deviceScaleFactor:1});await frame(page);
 await page.evaluate(()=>{window.scrollTo(0,0);demo.reset();demo.setMode('run');demo.setView('legs');demo.setYaw(0);for(let i=0;i<20;i++)demo.step(.016);demo.draw()});
 await page.screenshot({path:path.join(shots,'phone-leg-detail.png')});
 await page.close();
 const reduced=await open(path.join(output,'index.html'),undefined,true);await reduced.evaluate(()=>demo.setManual(true));
 const reducedResult=await reduced.evaluate(()=>{demo.reset();demo.player.position.set(6,0,5);demo.setYaw(0);const start=demo.player.position.toArray();const a=demo.state.breathTime;for(let i=0;i<120;i++)demo.step(.016);const b=demo.state.breathTime;demo.keys.add('KeyW');for(let i=0;i<120;i++)demo.step(.016);return {reduce:demo.state.reducedMotion,a,b,phase:demo.state.phase,start,pos:demo.player.position.toArray()}});
 assert.equal(reducedResult.reduce,true);near(reducedResult.a,reducedResult.b);assert.ok(reducedResult.phase>0&&Math.hypot(reducedResult.pos[0]-reducedResult.start[0],reducedResult.pos[2]-reducedResult.start[2])>.5);
 console.log('PASS: prefers-reduced-motion freezes idle but does not prevent player control');await reduced.close();
 assert.deepEqual(errors,[],errors.join('\n'));console.log(`PASS: no page errors, Three.js warnings or external requests; screenshots: ${shots}`);
}catch(error){console.error(error);process.exitCode=1}finally{await browser.close()}
