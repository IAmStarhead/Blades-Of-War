// Sample selected foot vertices and joint motion in the actual offline viewer.
// Mechanical proxies do not prove anatomy, no sliding or visual naturalness.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default,output=path.resolve(process.argv[2]||path.join(root,'work/male-deep-crouch'));
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.setRequestInterception(true);page.on('request',r=>{if(/^(file|data|blob):/i.test(r.url()))r.continue();else{errors.push('external request: '+r.url());r.abort()}});await page.setOfflineMode(true);
 await page.goto(pathToFileURL(path.join(output,'index.html')).href,{waitUntil:'load'});await page.waitForFunction('window.ready===true',{timeout:120000});
 const result=await page.evaluate(()=>{
  const d=demo;d.setManual(true);const mesh=d.male.getObjectByName('head_2'),p=mesh.geometry.attributes.position,v=d.camera.position.clone(),groups={L:[],R:[]};
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i);if(y<.12&&Math.abs(x)>.03&&Math.abs(x)<.22)groups[x>0?'L':'R'].push(i)}
  const get=n=>d.male.getObjectByName(n).getWorldPosition(v).clone(),all={};
  for(const mode of ['walk','run','crouchwalk']){
   d.reset();d.setVariant('after');d.setMode(mode==='run'?'run':'walk');if(mode==='crouchwalk'){d.setCrouched(true);for(let i=0;i<20;i++)d.step(.05)}
   let low=Infinity,flight=0,guard=0,ik=0,kneeMin=Infinity,kneeMax=-Infinity,width=0;
   for(let i=0;i<480;i++){
    d.setPhase((i+.37)/480);d.scene.updateMatrixWorld(true);mesh.skeleton.update();const minima=[];
    for(const side of ['L','R']){
     let minimum=Infinity;for(const id of groups[side]){mesh.getVertexPosition(id,v);v.applyMatrix4(mesh.matrixWorld);minimum=Math.min(minimum,v.y)}minima.push(minimum);low=Math.min(low,minimum);
     const a=get('Rig_Thigh_'+side),b=get('Rig_Shin_'+side),c=get('Rig_Foot_'+side),angle=b.clone().sub(a).normalize().angleTo(c.clone().sub(b).normalize())*180/Math.PI;kneeMin=Math.min(kneeMin,angle);kneeMax=Math.max(kneeMax,angle);
    }
    width+=Math.abs(get('Rig_Foot_L').x-get('Rig_Foot_R').x);if(minima.every(y=>y>.012))flight++;
    guard=Math.max(guard,d.state.floorCorrection||0);ik=Math.max(ik,d.state.footIK||0);
   }
   d.setPhase(0);d.scene.updateMatrixWorld(true);mesh.skeleton.update();const before=[];for(let i=0;i<p.count;i+=7){mesh.getVertexPosition(i,v);before.push(v.x,v.y,v.z)}
   d.setPhase(1);d.scene.updateMatrixWorld(true);mesh.skeleton.update();let seam=0;for(let i=0,j=0;i<p.count;i+=7,j+=3){mesh.getVertexPosition(i,v);seam=Math.max(seam,Math.hypot(v.x-before[j],v.y-before[j+1],v.z-before[j+2]))}
   all[mode]={low,flightFraction:flight/480,guard,ik,kneeMin,kneeMax,ankleWidth:width/480,seam};
  }
  const lengths={};d.reset();for(const side of ['L','R']){const a=get('Rig_Thigh_'+side),b=get('Rig_Shin_'+side),c=get('Rig_Foot_'+side);lengths[side]={thigh:a.distanceTo(b),shin:b.distanceTo(c)}}
  return {groups:{L:groups.L.length,R:groups.R.length},all,lengths};
 });
 for(const side of ['L','R']){assert.ok(result.groups[side]>1000);assert.ok(Math.abs(result.lengths[side].thigh-.43428)<.001);assert.ok(Math.abs(result.lengths[side].shin-.37044)<.001)}
 for(const [name,x] of Object.entries(result.all)){assert.ok(x.low>.0008,name+' sole below floor');assert.ok(x.seam<2e-6,name+' loop seam');assert.ok(x.guard<.01&&x.ik<.01,name+' unexpected guard in standalone cycle')}
 assert.ok(result.all.walk.flightFraction<.01);assert.ok(result.all.run.flightFraction>.14&&result.all.run.flightFraction<.35);assert.ok(result.all.crouchwalk.flightFraction<.01);
 assert.ok(result.all.crouchwalk.kneeMin>95&&result.all.crouchwalk.kneeMax<123,'crouch knee bend outside trial range');
 console.log('PASS: 480 off-key phases per cycle, selected soles, loop closure and expected retargeted leg segment lengths '+JSON.stringify(result));
 const timing=await page.evaluate(()=>{const d=demo;d.reset();d.setVariant('after');d.setMode('run');d.setPhase(0);d.setPlaying(true);d.state.motionBlend=1;d.state.runBlend=1;for(let i=0;i<10;i++)d.advanceElapsed(.1);const normal=d.state.phase;d.setPhase(0);d.setPlaying(true);d.advanceElapsed(2);return {normal,capped:d.state.phase}});
 assert.ok(Math.abs(timing.normal-(1/.7)%1)<1e-5);assert.ok(Math.abs(timing.capped-.25/.7)<1e-5);console.log('PASS: elapsed-time substeps and 250 ms stall cap '+JSON.stringify(timing));
 const playback=await page.evaluate(()=>new Promise(resolve=>{const d=demo;d.reset();d.setMode('walk');d.setManual(false);const start=performance.now();let last=d.state.phase,wrap=0,frames=0;function go(now){let p=d.state.phase;if(p+.5<last)wrap++;last=p;frames++;if(wrap>=1||now-start>12000)resolve({wrap,frames});else requestAnimationFrame(go)}requestAnimationFrame(go)}));
 assert.ok(playback.wrap>=1&&playback.frames>=15);assert.deepEqual(errors,[]);console.log('PASS: browser requestAnimationFrame playback '+JSON.stringify(playback));
 console.log('NOTE: selected sole vertices, discrete samples and bone pivots are not clinical measurements or proof of perfect floor contact.');
}finally{await browser.close()}
