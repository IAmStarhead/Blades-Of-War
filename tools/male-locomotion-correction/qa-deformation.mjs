// Sample actual deformed geometry, not only joint angles or LBS determinants.
// Measurements are local proxies, not guarantees of appearance or foot contact.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default;
const output=path.resolve(process.argv[2]||path.join(root,'work/male-locomotion-correction'));
const errors=[];
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',
 args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage'],defaultViewport:{width:1280,height:900}});
try{
 const page=await browser.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||(m.type()==='warn'&&m.text().startsWith('THREE.')))errors.push(m.text())});
 await page.setRequestInterception(true);page.on('request',r=>{if(/^(file|data|blob):/i.test(r.url()))r.continue();else{errors.push('external '+r.url());r.abort()}});
 await page.setOfflineMode(true);await page.goto(pathToFileURL(path.join(output,'index.html')).href,{waitUntil:'load',timeout:120_000});await page.waitForFunction('window.ready===true',{timeout:120_000});
 const result=await page.evaluate(()=>{
  const d=demo;d.setManual(true);const mesh=d.male.getObjectByName('head_2'),p=mesh.geometry.attributes.position,
   index=mesh.geometry.attributes.skinIndex,weight=mesh.geometry.attributes.skinWeight,bones=mesh.skeleton.bones.map(b=>b.name),v=d.camera.position.clone();
  const definitions=[['elbowL','Rig_UpperArm_L','Rig_Forearm_L','Rig_Hand_L',1.18,2],['elbowR','Rig_UpperArm_R','Rig_Forearm_R','Rig_Hand_R',1.18,3],
   ['kneeL','Rig_Thigh_L','Rig_Shin_L','Rig_Foot_L',.49,4],['kneeR','Rig_Thigh_R','Rig_Shin_R','Rig_Foot_R',.49,5]];
  const groups={};for(const [name,parent,child,,height] of definitions){const a=bones.indexOf(parent),b=bones.indexOf(child),ids=[];
   for(let i=0;i<p.count;i++){let wa=0,wb=0;for(let k=0;k<4;k++){
    const id=index.getComponent(i,k),w=weight.getComponent(i,k);if(id===a)wa+=w;if(id===b)wb+=w;
   }if(wa>.15&&wb>.15&&Math.abs(p.getY(i)-height)<.012)ids.push(i)}groups[name]=ids;
  }
  const point=name=>d.male.getObjectByName(name).getWorldPosition(v).clone();
  function radius(ids,axis){const points=ids.map(i=>mesh.getVertexPosition(i,v).clone().applyMatrix4(mesh.matrixWorld));
   const center=points[0].clone().set(0,0,0);for(const pt of points)center.add(pt);center.divideScalar(points.length);
   return Math.sqrt(points.reduce((sum,pt)=>{pt.sub(center);return sum+pt.lengthSq()-pt.dot(axis)**2},0)/points.length);
  }
  const radii={},knee={},movement={};
  for(const mode of ['walk','run']){
   d.reset();d.setVariant('after');d.setMode(mode);d.setPlaying(false);radii[mode]={};knee[mode]={minForward:Infinity,maxSide:0};
   for(const [name,parent,child,tip,,morph] of definitions){let maxWeight=null,largest=null;
    for(let i=0;i<120;i++){
     d.setPhase(i/120);d.scene.updateMatrixWorld(true);mesh.skeleton.update();
     const w=mesh.morphTargetInfluences[morph],axis=point(child).sub(point(parent)).normalize().add(point(tip).sub(point(child)).normalize()).normalize();
     const on=radius(groups[name],axis);mesh.morphTargetInfluences[morph]=0;const off=radius(groups[name],axis);
     const sample={phase:i/120,weight:w,ratio:on/off,on,off};
     if(!maxWeight||w>maxWeight.weight)maxWeight=sample;if(!largest||sample.ratio>largest.ratio)largest=sample;
    }
    radii[mode][name]={count:groups[name].length,maxWeight,largest};
   }
   let previous=null,maxStep=0;
   for(let i=0;i<=120;i++){
    d.setPhase(i/120);d.scene.updateMatrixWorld(true);mesh.skeleton.update();
    const vertices=[];for(let j=0;j<p.count;j+=5){mesh.getVertexPosition(j,v);v.applyMatrix4(mesh.matrixWorld);vertices.push(v.x,v.y,v.z)}
    if(previous)for(let j=0;j<vertices.length;j+=3)maxStep=Math.max(maxStep,Math.hypot(vertices[j]-previous[j],vertices[j+1]-previous[j+1],vertices[j+2]-previous[j+2]));previous=vertices;
    for(const side of ['L','R']){
     const hip=point('Rig_Thigh_'+side),joint=point('Rig_Shin_'+side),foot=point('Rig_Foot_'+side),dir=foot.clone().sub(hip).normalize();
     const offset=joint.clone().sub(hip).addScaledVector(dir,-joint.clone().sub(hip).dot(dir));
     knee[mode].minForward=Math.min(knee[mode].minForward,offset.z);knee[mode].maxSide=Math.max(knee[mode].maxSide,Math.abs(offset.x));
    }
   }
   movement[mode]={maxStep};
  }
  // Consecutive world-space motion of the same selected low vertices.
  // This includes rolling and skin deformation; it is not a planted-contact speed.
  const feet={L:[],R:[]};for(let i=0;i<p.count;i++)if(p.getY(i)<.075&&Math.abs(p.getX(i))>.03&&Math.abs(p.getX(i))<.22&&i%2===0)feet[p.getX(i)>0?'L':'R'].push(i);
  const lowVertexSpeed={};
  for(const mode of ['walk','run']){
   d.reset();d.setVariant('after');d.player.position.set(6,0,5);d.setView('inspect');d.setYaw(0);d.player.rotation.y=Math.PI;d.keys.add('KeyW');if(mode==='run')d.keys.add('ShiftLeft');
   for(let i=0;i<90;i++)d.step(1/60);const previous={},speeds={L:[],R:[]};
   for(let frame=0;frame<180;frame++){
    d.step(1/60);d.scene.updateMatrixWorld(true);mesh.skeleton.update();
    for(const side of ['L','R']){const frameSpeeds=[];for(const i of feet[side]){
     mesh.getVertexPosition(i,v);v.applyMatrix4(mesh.matrixWorld);const old=previous[i];
     if(old&&v.y<.012&&old[1]<.012)frameSpeeds.push(Math.hypot(v.x-old[0],v.z-old[2])*60);
     previous[i]=[v.x,v.y,v.z];
    }if(frameSpeeds.length){frameSpeeds.sort((a,b)=>a-b);speeds[side].push(frameSpeeds[Math.floor(frameSpeeds.length/2)])}}
   }
   d.keys.clear();lowVertexSpeed[mode]={};for(const side of ['L','R']){const a=speeds[side].sort((x,y)=>x-y);
    lowVertexSpeed[mode][side]={frames:a.length,median:a[Math.floor(a.length*.5)],p90:a[Math.floor(a.length*.9)],max:a.at(-1)};
   }
  }
  return {radii,knee,movement,lowVertexSpeed};
 });
 for(const [mode,groups] of Object.entries(result.radii))for(const [name,g] of Object.entries(groups)){
  assert.ok(g.count>=10,`${name} insufficient samples`);assert.ok(g.maxWeight.ratio>1,`${mode} ${name} does not expand`);
  assert.ok(g.largest.ratio<1.25,`${mode} ${name} suspicious bulge`);
 }
 for(const name of ['elbowL','elbowR','kneeL','kneeR'])assert.ok(result.radii.run[name].maxWeight.ratio>1.05,`${name} run correction too small`);
 for(const [mode,k] of Object.entries(result.knee)){assert.ok(k.minForward>-.005,`${mode} knee flipped backward: ${k.minForward}`);assert.ok(k.maxSide<.08,`${mode} knee flipped sideways: ${k.maxSide}`)}
 for(const [mode,m] of Object.entries(result.movement))assert.ok(m.maxStep<.04,`${mode} unexpectedly large 120-phase vertex step ${m.maxStep}`);
 for(const [mode,sides] of Object.entries(result.lowVertexSpeed))for(const [side,s] of Object.entries(sides)){
  assert.ok(s.frames>20);assert.ok(s.p90<(mode==='walk'?.8:1.5),`${mode}/${side} large low-vertex motion: ${s.p90}`);
 }
 assert.deepEqual(errors,[],errors.join('\n'));
 console.log('PASS: sampled local joint radii with morphs on/off '+JSON.stringify(result.radii));
 console.log('PASS: sampled knee planes and 120-phase body continuity '+JSON.stringify({knee:result.knee,movement:result.movement}));
 console.log('PASS: same low-vertex horizontal speed proxy at 60 Hz (includes roll and deformation, not a contact sensor): '+JSON.stringify(result.lowVertexSpeed));
}catch(error){console.error(error);process.exitCode=1}finally{await browser.close()}
