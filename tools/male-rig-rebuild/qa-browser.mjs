// Offline desktop/mobile-emulated UI, actual downloads, animated cap seams and
// isolated finger-joint influence checks. Not a physical-device or engine test.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),require=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=require('puppeteer-core'),chromium=require('@sparticuz/chromium').default,output=path.resolve(process.argv[2]||path.join(root,'work/male-rig-rebuild'));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bow-rig-download-')),errors=[],hash=x=>createHash('sha256').update(x).digest('hex');
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],protocolTimeout:180000});
async function open(viewport){
 const page=await browser.newPage();await page.setViewport(viewport);page.on('pageerror',e=>errors.push('page: '+e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text())});
 await page.setRequestInterception(true);page.on('request',r=>{if(/^(file|data|blob):/i.test(r.url()))r.continue();else{errors.push('external request: '+r.url());r.abort()}});
 await page.setOfflineMode(true);await page.goto(pathToFileURL(path.join(output,'index.html')).href,{waitUntil:'load',timeout:60000});await page.waitForFunction('window.rigTrial?.state.ready===true',{timeout:60000});return page;
}
async function image(page){await page.evaluate(()=>rigTrial.renderer.render(rigTrial.scene,rigTrial.camera));return hash(await(await page.$('canvas')).screenshot({type:'png'}))}
async function state(page){return page.evaluate(()=>({state:{...rigTrial.state},camera:rigTrial.camera.position.toArray(),target:rigTrial.orbit.target.toArray(),visible:Object.fromEntries(Object.entries(rigTrial.models).map(([k,v])=>[k,v.gltf.scene.visible]))}))}
const close=(a,b,epsilon=1e-8)=>a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<epsilon,`${v} != ${b[i]}`));
try{
 const desktop=await open({width:1280,height:1000,deviceScaleFactor:1});assert.equal(await desktop.$eval('#status',e=>e.dataset.state),'ready');assert.equal(await desktop.evaluate(()=>'EMBEDDED_MODELS'in window),false);
 assert.equal(await desktop.evaluate(()=>Object.values(rigTrial.models).every(m=>{let ok=!m.helper.frustumCulled;m.gltf.scene.traverse(o=>{if(o.isSkinnedMesh&&o.frustumCulled)ok=false});return ok})),true,'animated close-ups must not use stale skinned bounds');
 let initial=await state(desktop),initialImage=await image(desktop);assert.deepEqual(initial.visible,{new:true,previous:false,cuts:false});assert.equal(await desktop.$eval('[data-action="focus-cut"]',e=>e.disabled),true);
 await desktop.click('[data-model="previous"]');let prev=await state(desktop);assert.deepEqual(prev.visible,{new:false,previous:true,cuts:false});close(initial.camera,prev.camera);close(initial.target,prev.target);assert.notEqual(initialImage,await image(desktop));
 await desktop.click('[data-model="new"]');assert.equal(await image(desktop),initialImage);
 for(const mode of ['walk','run']){
  const result=await desktop.evaluate(mode=>{
   const d=rigTrial;d.setMotion(mode);const snapshot=phase=>{
    d.setPhase(phase);d.scene.updateMatrixWorld(true);const data=[],v=d.camera.position.clone();
    for(const model of Object.values(d.models))model.gltf.scene.traverse(o=>{
     if(!o.isMesh||!o.geometry.attributes.position)return;if(o.isSkinnedMesh)o.skeleton.update();
     for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,v).applyMatrix4(o.matrixWorld);data.push(v.x,v.y,v.z)}
    });return data;
   };
   const a=snapshot(0),b=snapshot(1);let max=0;for(let i=0;i<a.length;i+=3)max=Math.max(max,Math.hypot(a[i]-b[i],a[i+1]-b[i+1],a[i+2]-b[i+2]));return {max,vertices:a.length/3};
  },mode);
  assert.ok(result.vertices>40000&&result.max<1e-6,`${mode} loop endpoint ${JSON.stringify(result)}`);
 }
 console.log('PASS: browser-skinned loop endpoints match within 0.001 mm for all three models and both gaits');
 await desktop.click('[data-motion="walk"]');await desktop.waitForFunction('rigTrial.state.phase>0');await desktop.evaluate(()=>rigTrial.setPhase(.317));
 let pose=await state(desktop);assert.equal(pose.state.motion,'walk');assert.equal(pose.state.playing,false);assert.ok(Math.abs(pose.state.phase-.317)<1e-9);
 await desktop.click('[data-model="previous"]');let other=await state(desktop);assert.equal(other.state.phase,pose.state.phase);close(other.camera,pose.camera);close(other.target,pose.target);
 await desktop.click('[data-model="new"]');await desktop.click('[data-motion="run"]');await desktop.evaluate(()=>rigTrial.setPhase(.625));assert.equal((await state(desktop)).state.motion,'run');
 await desktop.click('[data-action="slow"]');assert.equal((await state(desktop)).state.slow,true);
 for(const v of ['front','back','side','rear45']){await desktop.click(`[data-view="${v}"]`);assert.equal((await state(desktop)).state.view,v)}
 for(const f of ['body','head','upper','pelvis','leftHand','rightHand','leftKnee','feet']){await desktop.click(`[data-focus="${f}"]`);assert.equal((await state(desktop)).state.focus,f)}
 await desktop.click('[data-action="reset"]');await desktop.click('[data-action="skeleton"]');assert.equal((await state(desktop)).state.skeleton,true);let withRig=await image(desktop);await desktop.click('[data-action="skeleton"]');assert.notEqual(withRig,await image(desktop));
 await desktop.select('#cut','Elbow_L');let cutState=await state(desktop);assert.deepEqual(cutState.visible,{new:false,previous:false,cuts:true});assert.equal(cutState.state.cut,'Elbow_L');
 assert.deepEqual(await desktop.evaluate(()=>{let s=rigTrial.models.cuts.gltf.scene;return ['Part_Forearm_L','Part_Hand_L','Cap_Elbow_L_Proximal','Cap_Elbow_L_Distal'].map(n=>({visible:s.getObjectByName(n).visible,x:s.getObjectByName(n).position.x}))}),[{visible:true,x:.26},{visible:true,x:.26},{visible:true,x:0},{visible:true,x:.26}]);
 await desktop.click('[data-action="focus-cut"]');let cutFocus=await state(desktop);assert.equal(cutFocus.state.focus,'cut');assert.ok(Math.abs(await desktop.evaluate(()=>rigTrial.camera.position.distanceTo(rigTrial.orbit.target))-1.20)<.01);
 await desktop.evaluate(()=>rigTrial.setPhase(.31));let moved=await state(desktop);assert.ok(Math.hypot(...moved.target.map((v,i)=>v-cutFocus.target[i]))>.01,'cut focus follows animation');
 await desktop.click('#piece');assert.deepEqual(await desktop.evaluate(()=>{let s=rigTrial.models.cuts.gltf.scene;return ['Part_Forearm_L','Part_Hand_L','Cap_Elbow_L_Proximal','Cap_Elbow_L_Distal'].map(n=>s.getObjectByName(n).visible)}),[false,false,true,false]);assert.ok(Math.hypot(...(await state(desktop)).target.map((v,i)=>v-moved.target[i]))>.01,'cut focus follows visible end');
 await desktop.click('#piece');await desktop.click('[data-model="previous"]');let cleared=await state(desktop);assert.equal(cleared.state.cut,'none');assert.equal(cleared.state.focus,'body');assert.equal(await desktop.$eval('[data-action="focus-cut"]',e=>e.disabled),true);await desktop.select('#cut','Knee_R');assert.equal((await state(desktop)).state.model,'new');
 // Compare every duplicated cap rim against its adjacent surface after actual
 // Three.js skinning and after the preview's detached offset, at sampled phases.
 const seam=await desktop.evaluate(()=>{
  const d=rigTrial,s=d.models.cuts.gltf.scene,kinds={Wrist:['Forearm','Hand'],Elbow:['Main','Forearm'],Ankle:['Shin','Foot'],Knee:['Main','Shin']};let maximum=0,n=0;
  const key=(a,i)=>`${a.getX(i)}:${a.getY(i)}:${a.getZ(i)}`,v1=d.camera.position.clone(),v2=d.camera.position.clone();
  for(const mode of ['walk','run']){d.setMotion(mode);for(const joint of Object.keys(kinds))for(const side of ['L','R']){
   d.selectCut(joint+'_'+side);for(let i=0;i<16;i++){
    d.setPhase((i+.29)/16);d.scene.updateMatrixWorld(true);
    for(let k=0;k<2;k++){
     const half=k?'Distal':'Proximal',part=kinds[joint][k],surface=s.getObjectByName('Part_'+part+(part==='Main'?'':'_'+side)),cap=s.getObjectByName(`Cap_${joint}_${side}_${half}`);
     surface.skeleton.update();cap.skeleton.update();const pa=surface.geometry.attributes.position,ca=cap.geometry.attributes.position,map=new Map();for(let j=0;j<pa.count;j++)map.set(key(pa,j),j);
     for(let j=0;j<ca.count;j++){const id=map.get(key(ca,j));if(id===undefined)throw Error('missing cap rim');surface.getVertexPosition(id,v1).applyMatrix4(surface.matrixWorld);cap.getVertexPosition(j,v2).applyMatrix4(cap.matrixWorld);maximum=Math.max(maximum,v1.distanceTo(v2));n++}
    }
   }
  }}return {maximum,n};
 });assert.ok(seam.n>10000);assert.ok(seam.maximum<1e-5,`animated cap seam ${seam.maximum}`);console.log(`PASS: ${seam.n} animated cap-rim comparisons, worst ${(seam.maximum*1000).toFixed(5)} mm (two clips, 16 phases, eight cuts)`);
 // Regression: after a different cut/pose was rendered, a cached animated
 // bounding sphere used to cull the thigh in this close-up of the right ankle.
 await desktop.evaluate(()=>{const d=rigTrial;d.setMotion('walk');d.selectCut('Elbow_L');d.setPhase(.23);d.chooseView('front');d.chooseFocus('cut');d.renderer.render(d.scene,d.camera);d.setMotion('run');d.selectCut('Ankle_R');d.setPhase(.68);d.chooseView('front');d.chooseFocus('cut')});
 const withMain=await image(desktop);await desktop.evaluate(()=>{rigTrial.models.cuts.gltf.scene.getObjectByName('Part_Main').visible=false});assert.notEqual(await image(desktop),withMain,'upper body segment must remain rendered in ankle close-up');await desktop.evaluate(()=>rigTrial.applyCut());
 // Each separately addressable finger joint must actually move nearby hand
 // vertices; do not assert anatomical quality or a production fist.
 const fingers=await desktop.evaluate(()=>{
  const d=rigTrial;d.selectCut('none');d.chooseModel('new');d.setMotion('stand');const m=d.models.new.gltf.scene.getObjectByName('NewBody'),g=m.geometry,p=g.attributes.position,v=d.camera.position.clone(),base=new Float32Array(p.count*3),out=[];
  d.scene.updateMatrixWorld(true);m.skeleton.update();for(let i=0;i<p.count;i++){m.getVertexPosition(i,v);base.set(v.toArray(),3*i)}
  for(const side of ['L','R'])for(let finger=1;finger<=5;finger++)for(let part=1;part<=3;part++){
   const bone=d.models.new.rig.getObjectByName(`Rig_Finger${finger}_${part}_${side}`);bone.rotation.x+=.30;d.scene.updateMatrixWorld(true);m.skeleton.update();let max=0,remote=0,count=0;
   for(let i=0;i<p.count;i++){m.getVertexPosition(i,v);const delta=Math.hypot(v.x-base[3*i],v.y-base[3*i+1],v.z-base[3*i+2]);max=Math.max(max,delta);if(delta>1e-5)count++;if((Math.abs(p.getX(i))<.18||p.getY(i)>1.1)&&delta>remote)remote=delta}
   out.push({side,finger,part,max,remote,count});bone.rotation.x-=.30;
  }return out;
 });for(const f of fingers){assert.ok(f.max>.0004&&f.count>0,JSON.stringify(f));assert.ok(f.remote<1e-5,JSON.stringify(f))}console.log('PASS: all 30 isolated finger joints influence local hand vertices in a small test rotation (not a fist/anatomy certification)');
 // A top-facing floor must not occlude ankle or knee caps from below.
 await desktop.evaluate(()=>{const d=rigTrial;d.selectCut('none');d.setMotion('stand');d.orbit.target.set(0,.12,0);d.camera.position.set(.3,-.4,1);d.camera.lookAt(d.orbit.target);d.orbit.update();const floor=d.scene.children.find(o=>o.geometry?.type==='CircleGeometry');if(!floor||floor.material.side!==0)throw Error('Unexpected floor')});
 const belowWithFloor=await image(desktop);await desktop.evaluate(()=>{rigTrial.scene.children.find(o=>o.geometry?.type==='CircleGeometry').visible=false});assert.equal(await image(desktop),belowWithFloor,'floor must not block the view from below');
 await desktop.evaluate(()=>{rigTrial.scene.children.find(o=>o.geometry?.type==='CircleGeometry').visible=true;rigTrial.chooseFocus('body');rigTrial.chooseView('front')});
 const oldCamera=(await state(desktop)).camera,box=await(await desktop.$('canvas')).boundingBox();await desktop.mouse.move(box.x+box.width*.65,box.y+box.height*.45);await desktop.mouse.down();await desktop.mouse.move(box.x+box.width*.5,box.y+box.height*.42,{steps:8});await desktop.mouse.up();assert.ok(Math.hypot(...(await state(desktop)).camera.map((v,i)=>v-oldCamera[i]))>.1);
 const beforeZoom=await desktop.evaluate(()=>rigTrial.camera.position.distanceTo(rigTrial.orbit.target));await desktop.mouse.wheel({deltaY:-200});await desktop.waitForFunction(d=>Math.abs(rigTrial.camera.position.distanceTo(rigTrial.orbit.target)-d)>.01,{},beforeZoom);
 const client=await desktop.target().createCDPSession();await client.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:temp,eventsEnabled:true});
 async function download(action,name){const done=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('download timeout')),20000);let started;const begin=e=>{started=e};const progress=e=>{if(e.state==='completed'){clearTimeout(timer);client.off('Browser.downloadWillBegin',begin);client.off('Browser.downloadProgress',progress);resolve(started)}else if(e.state==='canceled'){clearTimeout(timer);reject(Error('download canceled'))}};client.on('Browser.downloadWillBegin',begin);client.on('Browser.downloadProgress',progress)});await desktop.click(`[data-action="${action}"]`);const e=await done;assert.equal(e.suggestedFilename,name);assert.deepEqual(fs.readFileSync(path.join(temp,name)),fs.readFileSync(path.join(output,name)))}
 await download('download-rig','male_rig_rebuild.glb');await download('download-cuts','male_cut_placeholders.glb');await desktop.close();console.log('PASS: offline desktop controls, model/phase comparison, skeleton, cut visibility, mouse controls and byte-exact downloads');
 for(const viewport of [{width:320,height:700,deviceScaleFactor:1,isMobile:true,hasTouch:true},{width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true},{width:768,height:1024,deviceScaleFactor:1,isMobile:true,hasTouch:true}]){
  const mobile=await open(viewport);const dim=await mobile.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,stage:document.querySelector('#stage').getBoundingClientRect().toJSON()}));assert.ok(dim.scroll<=dim.client+1,JSON.stringify(dim));assert.ok(dim.stage.width>250&&dim.stage.height>350);
  await mobile.click('[data-motion="run"]');await mobile.evaluate(()=>rigTrial.setPhase(.24));await mobile.click('[data-model="previous"]');assert.equal((await state(mobile)).state.model,'previous');await mobile.select('#cut','Wrist_R');assert.equal((await state(mobile)).state.cut,'Wrist_R');assert.equal((await state(mobile)).state.model,'new');await mobile.click('[data-action="focus-cut"]');assert.equal((await state(mobile)).state.focus,'cut');
  await mobile.click('[data-view="side"]');await mobile.click('[data-focus="head"]');await mobile.$eval('canvas',e=>e.scrollIntoView({block:'center'}));const bounds=await(await mobile.$('canvas')).boundingBox(),before=(await state(mobile)).camera,touch=await mobile.target().createCDPSession(),x=bounds.x+bounds.width*.55,y=bounds.y+bounds.height*.46;
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-60,y:y+15,id:1}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.ok(Math.hypot(...(await state(mobile)).camera.map((v,i)=>v-before[i]))>.01);
  const dist=await mobile.evaluate(()=>rigTrial.camera.position.distanceTo(rigTrial.orbit.target));await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-25,y,id:1},{x:x+25,y,id:2}]});await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-50,y,id:1},{x:x+50,y,id:2}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.ok(Math.abs(await mobile.evaluate(()=>rigTrial.camera.position.distanceTo(rigTrial.orbit.target))-dist)>.01);
  await mobile.close();console.log(`PASS: emulated ${viewport.width}x${viewport.height}, no overflow, controls, touch rotation and pinch`);
 }
 assert.deepEqual(errors,[],errors.join('\n'));console.log('PASS: no external requests or browser errors. Mobile emulation is not a physical Android test.');
}finally{await browser.close();fs.rmSync(temp,{recursive:true,force:true})}
