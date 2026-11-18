// Real browser inputs, offline packaging, old-variant comparison and mobile.
// Puppeteer/Chromium are installed in tools/character-showcase as in prior QA.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default;
const argv=process.argv.slice(2),output=path.resolve(argv.find(x=>!x.startsWith('--'))||path.join(root,'work/male-motion-review'));
const arg=argv.find(x=>x.startsWith('--screenshots=')),shots=arg?path.resolve(arg.split('=')[1]):fs.mkdtempSync(path.join(os.tmpdir(),'bow-motion-review-browser-'));fs.mkdirSync(shots,{recursive:true});
const errors=[],browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],defaultViewport:{width:1280,height:800}});
const near=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b} (tol ${tol})`);
const arrayNear=(a,b,tol=1e-5)=>{assert.equal(a.length,b.length);a.forEach((x,i)=>near(x,b[i],tol))};
async function open(file,viewport){
 const page=await browser.newPage();if(viewport)await page.setViewport(viewport);
 page.on('pageerror',e=>errors.push('page: '+e.message));page.on('console',m=>{if(m.type()==='error'||(m.type()==='warn'&&m.text().startsWith('THREE.')))errors.push('console: '+m.text())});
 await page.setRequestInterception(true);page.on('request',r=>{if(/^(file|data|blob):/i.test(r.url()))r.continue();else{errors.push('external request: '+r.url());r.abort()}});await page.setOfflineMode(true);
 await page.goto(pathToFileURL(file).href,{waitUntil:'load',timeout:120000});await page.waitForFunction('window.ready===true',{timeout:120000});return page;
}
const settle=page=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
try{
 const page=await open(path.join(output,'index.html'));await page.evaluate(()=>demo.setManual(true));
 const initial=await page.evaluate(()=>({view:demo.state.view,mode:demo.state.mode,variant:demo.state.variant,crouch:demo.state.crouched,blend:demo.state.crouchBlend,bones:demo.bones.length,clips:demo.clips.size,morph:demo.male.getObjectByName('head_2').morphTargetInfluences.length,button:document.querySelector('[data-crouch]').getAttribute('aria-pressed')}));
 assert.deepEqual(initial,{view:'inspect',mode:'walk',variant:'after',crouch:false,blend:0,bones:22,clips:33,morph:13,button:'false'});
 // A held/repeated key is a toggle only once. It also works in-place while paused.
 await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.down('c');await page.keyboard.down('c');await page.keyboard.up('c');assert.equal(await page.evaluate(()=>demo.state.crouched),true);
 await page.evaluate(()=>{for(let i=0;i<8;i++)demo.step(.05)});let crouch=await page.evaluate(()=>({blend:demo.state.crouchBlend,walk:demo.actions.crouchWalk.getEffectiveWeight(),text:document.querySelector('[data-crouch]').textContent,aria:document.querySelector('[data-crouch]').getAttribute('aria-pressed')}));
 near(crouch.blend,1);near(crouch.walk,1);assert.match(crouch.text,/Встать/);assert.equal(crouch.aria,'true');
 await page.click('[data-crouch]');await page.evaluate(()=>{for(let i=0;i<8;i++)demo.step(.05)});near(await page.evaluate(()=>demo.state.crouchBlend),0);assert.equal(await page.$eval('[data-crouch]',b=>b.getAttribute('aria-pressed')),'false');
 await page.click('[data-play]');await page.$eval('#phase',e=>{e.value='370';e.dispatchEvent(new Event('input',{bubbles:true}))});
 await page.focus('#phase');await page.keyboard.press('c');assert.equal(await page.evaluate(()=>demo.state.crouched),true,'C should work even after scrubbing the phase slider');
 await page.evaluate(()=>{for(let i=0;i<8;i++)demo.step(.05)});near(await page.evaluate(()=>demo.state.phase),.37);near(await page.evaluate(()=>demo.state.crouchBlend),1);near(await page.evaluate(()=>demo.actions.crouchWalk.getEffectiveWeight()),1);
 await page.evaluate(()=>{const input=document.createElement('input');input.id='test-text';document.body.appendChild(input);input.focus()});await page.keyboard.press('c');assert.equal(await page.evaluate(()=>demo.state.crouched),true,'typing in a text field must not toggle crouch');await page.evaluate(()=>document.querySelector('#test-text').remove());
 await page.click('[data-crouch]');await page.evaluate(()=>{for(let i=0;i<8;i++)demo.step(.05)});near(await page.evaluate(()=>demo.state.phase),.37);near(await page.evaluate(()=>demo.state.crouchBlend),0);
 await page.click('[data-mode="control"]');await page.evaluate(()=>{demo.reset();for(let i=0;i<12;i++)demo.step(.05)});const standing=await page.evaluate(()=>demo.male.getObjectByName('Rig_Root').position.y);
 await page.keyboard.press('c');await page.evaluate(()=>{for(let i=0;i<12;i++)demo.step(.05)});const idle=await page.evaluate(()=>({height:demo.male.getObjectByName('Rig_Root').position.y,weight:demo.actions.crouchIdle.getEffectiveWeight(),speed:demo.state.actualSpeed}));
 near(idle.weight,1);near(idle.speed,0);assert.ok(standing-idle.height>.14&&standing-idle.height<.20,'idle crouch is not visibly lower');
 console.log('PASS: C repeat suppression, button/aria, in-place paused phase, crouch idle and both transitions');
 // Real WASD/Shift while the character is moving: shift is ignored during
 // stealth and the prior pace is restored when standing up.
 await page.evaluate(()=>{demo.reset();demo.player.position.set(5,0,5);demo.setView('inspect');demo.setYaw(0);demo.player.rotation.y=Math.PI});
 await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.down('Shift');await page.keyboard.down('w');await page.evaluate(()=>{for(let i=0;i<60;i++)demo.step(.025)});near(await page.evaluate(()=>demo.state.actualSpeed),2.4,2e-4);
 const before=await page.evaluate(()=>demo.player.position.toArray());await page.keyboard.press('c');await page.evaluate(()=>{for(let i=0;i<60;i++)demo.step(.025)});
 let moving=await page.evaluate(()=>({pos:demo.player.position.toArray(),speed:demo.state.actualSpeed,c:demo.state.crouchBlend,walk:demo.actions.crouchWalk.getEffectiveWeight()}));near(moving.speed,.38,2e-4);near(moving.c,1);near(moving.walk,1);assert.ok(Math.hypot(moving.pos[0]-before[0],moving.pos[2]-before[2])>.4);
 await page.keyboard.press('c');await page.evaluate(()=>{for(let i=0;i<60;i++)demo.step(.025)});near(await page.evaluate(()=>demo.state.actualSpeed),2.4,2e-4);near(await page.evaluate(()=>demo.state.crouchBlend),0);
 await page.keyboard.up('w');await page.keyboard.up('Shift');await page.keyboard.press('Escape');near(await page.evaluate(()=>demo.state.speed),0);
 console.log('PASS: real WASD + Shift, crouch speed cap at steady state, movement and restored running');
 // The new trial preserves all four older variants, including the last one
 // the user liked. Compare scene and skin against the actual delivered page.
 const previous=await open(path.join(root,'work/male-stealth-crouch/index.html'));await previous.evaluate(()=>demo.setManual(true));
 const pose=(mode,variant,phase)=>{const d=demo;d.reset();d.setVariant(variant);d.setMode(mode);d.setPhase(phase);d.scene.updateMatrixWorld(true);const mesh=d.male.getObjectByName('head_2');mesh.skeleton.update();const v=d.camera.position.clone(),vertices=[];for(let i=0;i<mesh.geometry.attributes.position.count;i+=193){mesh.getVertexPosition(i,v);vertices.push(v.x,v.y,v.z)}return {bones:d.bones.flatMap(b=>[...b.position.toArray(),...b.quaternion.toArray()]),vertices,morph:mesh.morphTargetInfluences.slice(),phase:d.state.phase}};
 for(const [newVariant,oldVariant] of [['before','after'],['previous','before'],['earlier','previous'],['first','earlier'],['earliest','first']])for(const mode of ['walk','run'])for(const phase of [0,.125,.25,.375,.5,.625,.75,.875]){
  const a=await page.evaluate(pose,mode,newVariant,phase),b=await previous.evaluate(pose,mode,oldVariant,phase);arrayNear(a.bones,b.bones);arrayNear(a.vertices,b.vertices);arrayNear(a.morph,b.morph);near(a.phase,b.phase);
 }
 await previous.close();
 // Crouch is also a real comparison against the exact prior skin and clip.
 // Pausing at an identical phase makes the check independent of rendering rate.
 const crouchPose=(mode,phase)=>{const d=demo;d.reset();d.setVariant(mode==='old'?'after':'before');d.setMode('walk');d.setCrouched(true);for(let i=0;i<12;i++)d.step(.05);d.setPhase(phase);d.scene.updateMatrixWorld(true);const m=d.male.getObjectByName('head_2'),v=d.camera.position.clone();m.skeleton.update();let vertices=[];for(let i=0;i<m.geometry.attributes.position.count;i+=31){m.getVertexPosition(i,v);vertices.push(v.x,v.y,v.z)}return {vertices,bones:d.bones.flatMap(b=>[...b.position.toArray(),...b.quaternion.toArray()]),morph:m.morphTargetInfluences.slice(),phase:d.state.phase}};
 const previousCrouch=await open(path.join(root,'work/male-stealth-crouch/index.html'));await previousCrouch.evaluate(()=>demo.setManual(true));
 for(const phase of [0,.125,.25,.375,.5,.625,.75,.875]){
  const a=await page.evaluate(crouchPose,'new',phase),b=await previousCrouch.evaluate(crouchPose,'old',phase);arrayNear(a.bones,b.bones);arrayNear(a.vertices,b.vertices);arrayNear(a.morph,b.morph);near(a.phase,b.phase);
 }
 await previousCrouch.close();
 const control=await page.evaluate(()=>{const d=demo;d.reset();d.setVariant('after');d.setMode('run');d.setPhase(.25);d.setView('hip');d.setFacing('front');const phase=d.state.phase,yaw=d.currentYaw(),fresh=d.floorGuard;d.setVariant('before');const older=d.floorGuard,skin=d.male.getObjectByName('head_2').geometry.attributes.skinWeight===d.male.getObjectByName('head_2').geometry.attributes._previous_weights;d.setVariant('after');const cached=d.floorGuard===fresh;d.setVariant('previous');return {phase:d.state.phase,yaw:d.currentYaw(),startPhase:phase,startYaw:yaw,view:d.state.view,skin,guardsDistinct:fresh!==older,guardReused:cached&&d.floorGuard===older}});
 near(control.phase,control.startPhase);near(control.yaw,control.startYaw);assert.equal(control.view,'hip');assert.equal(control.skin,true);assert.equal(control.guardsDistinct,true);assert.equal(control.guardReused,true);
 console.log('PASS: 80 standing legacy poses and 8 crouch poses match previous viewer; comparison preserves phase and camera');
 // A representative set of actual click routes, now with crouched movement.
 const routes=await page.evaluate(()=>{let cases=[],worst=Infinity;for(let k=0;k<24;k++){
  demo.reset();demo.setCrouched(true);const a=2*Math.PI*k/24,target={x:demo.obstacle.x+2.7*Math.cos(a),z:demo.obstacle.z+2.7*Math.sin(a)};demo.moveTo(target.x,target.z,k%2===0);let detour=demo.state.detour,maxSpeed=0;
  for(let i=0;i<1200&&demo.state.target;i++){demo.step(.025);maxSpeed=Math.max(maxSpeed,demo.state.actualSpeed);worst=Math.min(worst,Math.hypot(demo.player.position.x-demo.obstacle.x,demo.player.position.z-demo.obstacle.z))}
  cases.push({remaining:!!demo.state.target,error:Math.hypot(demo.player.position.x-target.x,demo.player.position.z-target.z),detour,maxSpeed})}
  return {cases,worst,radius:demo.obstacle.radius}});
 assert.ok(routes.cases.filter(x=>x.detour).length>3);for(const c of routes.cases){assert.ok(!c.remaining&&c.error<.08,'crouch route did not reach target');assert.ok(c.maxSpeed<.381)}assert.ok(routes.worst>=routes.radius-1e-5);
 console.log('PASS: 24 crouched click routes including detours, well collision and Shift-click speed cap');
 // Mobile button is always in the scene, independently of the long settings panel.
 for(const width of [320,375,390,768]){
  const mobile=await open(path.join(output,'index.html'),{width,height:844,isMobile:true,hasTouch:true,deviceScaleFactor:1});await mobile.evaluate(()=>demo.setManual(true));await settle(mobile);
  const box=await (await mobile.$('[data-crouch]')).boundingBox();assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=844,'crouch control not visible');assert.ok(box.width>=44&&box.height>=44);
  const top=await mobile.evaluate(({x,y})=>document.elementFromPoint(x,y)?.matches('[data-crouch]'),{x:box.x+box.width/2,y:box.y+box.height/2});assert.equal(top,true);
  await mobile.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);await mobile.evaluate(()=>{for(let i=0;i<10;i++)demo.step(.05)});assert.equal(await mobile.evaluate(()=>demo.state.crouched),true);near(await mobile.evaluate(()=>demo.state.crouchBlend),1);assert.equal(await mobile.evaluate(()=>demo.state.target),null,'touch on button should not navigate');
  await mobile.screenshot({path:path.join(shots,`mobile-${width}.png`)});await mobile.close();
 }
 console.log('PASS: actual touch control at four mobile widths, visible hit target and no click-through');
 // Reduced motion, desktop layout, download path and resetting crouch.
 await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);await page.reload();await page.waitForFunction('window.ready');await page.evaluate(()=>demo.setManual(true));
 assert.equal(await page.evaluate(()=>demo.state.reducedMotion),true);await page.click('[data-crouch]');await page.evaluate(()=>{for(let i=0;i<8;i++)demo.step(.05)});await page.click('[data-reset-player]');assert.equal(await page.evaluate(()=>demo.state.crouched),false);near(await page.evaluate(()=>demo.state.crouchBlend),0);
 assert.equal(await page.$eval('a.download',a=>a.getAttribute('href')),'male_motion_review.glb');
 await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await settle(page);const sticky=await page.evaluate(()=>{const r=document.querySelector('main').getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:innerHeight}});assert.ok(sticky.top>=0&&sticky.bottom<=sticky.height,'desktop canvas is not sticky');
 assert.deepEqual(errors,[]);await page.close();console.log('PASS: offline, reduced motion, reset, download path and sticky desktop scene');console.log('Screenshots: '+shots);
}finally{await browser.close()}
