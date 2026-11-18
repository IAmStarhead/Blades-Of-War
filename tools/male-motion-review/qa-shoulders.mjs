// Sample the *skin* and shoulder sockets relative to the chest, in addition
// to joint keys. These measurements are proxies, not an artistic acceptance.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const puppeteer=req('puppeteer-core'),chromium=req('@sparticuz/chromium').default;
const output=path.resolve(process.argv[2]||path.join(root,'work/male-motion-review'));
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||await chromium.executablePath(),headless:'shell',args:[...chromium.args,'--allow-file-access-from-files','--disable-dev-shm-usage']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto(pathToFileURL(path.join(output,'index.html')).href,{waitUntil:'load'});await page.waitForFunction('window.ready===true',{timeout:120000});
 const result=await page.evaluate(()=>{
  const d=demo;d.setManual(true);const mesh=d.male.getObjectByName('head_2'),g=mesh.geometry,p=g.attributes.position,j=g.attributes.skinIndex,w=g.attributes.skinWeight;
  const names=mesh.skeleton.bones.map(b=>b.name),v=d.camera.position.clone(),chest=d.male.getObjectByName('Rig_Chest'),groups={belly:[],capL:[],capR:[],elbowL:[],elbowR:[]};
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i);if(y>.94&&y<1.10&&Math.abs(x)<.11&&z>.03)groups.belly.push(i);
   for(const side of ['L','R']){
    let shoulder=0,upper=0,fore=0;for(let k=0;k<4;k++){const n=names[j.getComponent(i,k)],weight=w.getComponent(i,k);if(n==='Rig_Shoulder_'+side)shoulder+=weight;if(n==='Rig_UpperArm_'+side)upper+=weight;if(n==='Rig_Forearm_'+side)fore+=weight}
    const sign=side==='L'?1:-1;if(sign*x>.14&&y>1.35&&y<1.50&&shoulder>.1)groups['cap'+side].push(i);
    if(upper>.15&&fore>.15&&Math.abs(y-1.18)<.012)groups['elbow'+side].push(i);
   }
  }
  const stats=a=>({min:Math.min(...a),max:Math.max(...a),range:Math.max(...a)-Math.min(...a),mean:a.reduce((x,y)=>x+y,0)/a.length});
  const getBone=n=>d.male.getObjectByName(n).getWorldPosition(v).clone();
  function radius(side){
   const A=getBone('Rig_UpperArm_'+side),B=getBone('Rig_Forearm_'+side),C=getBone('Rig_Hand_'+side),axis=B.clone().sub(A).normalize().add(C.clone().sub(B).normalize()).normalize();
   const pts=groups['elbow'+side].map(i=>mesh.getVertexPosition(i,v).clone().applyMatrix4(mesh.matrixWorld)),center=pts[0].clone().set(0,0,0);pts.forEach(x=>center.add(x));center.divideScalar(pts.length);
   return Math.sqrt(pts.reduce((s,pt)=>{pt.sub(center);return s+pt.lengthSq()-pt.dot(axis)**2},0)/pts.length);
  }
  function twist(side){const fore=d.male.getObjectByName('Rig_Forearm_'+side),q=fore.quaternion,axis=d.male.getObjectByName('Rig_Hand_'+side).position.clone().normalize();return Math.abs(2*Math.atan2(q.x*axis.x+q.y*axis.y+q.z*axis.z,q.w)*180/Math.PI)}
  // At off-key phases, ensure the parent movement does not add unexpected
  // arm swing: walk adds exactly five degrees out, crouch keeps its direction.
  const compensation={};for(const mode of ['walk','crouch']){
   let min=Infinity,max=0;for(let t=0;t<240;t++){
    const poses=[];for(const variant of ['before','after']){
     d.reset();d.setVariant(variant);d.setMode('walk');if(mode==='crouch'){d.setCrouched(true);for(let i=0;i<12;i++)d.step(.05)}d.setPhase((t+.37)/240);d.scene.updateMatrixWorld(true);
     poses.push(['L','R'].map(side=>{const q=d.camera.quaternion.clone(),arm=d.male.getObjectByName('Rig_UpperArm_'+side).getWorldQuaternion(q.clone()),torso=chest.getWorldQuaternion(q.clone());return torso.invert().multiply(arm)}));
    }
    for(let side=0;side<2;side++){const angle=poses[0][side].angleTo(poses[1][side])*180/Math.PI;max=Math.max(max,angle);min=Math.min(min,angle)}
   }compensation[mode]={min,max};
  }
  const all={};
  for(const mode of ['walk','run','crouch'])for(const variant of ['before','after']){
   d.reset();d.setVariant(variant);d.setMode(mode==='run'?'run':'walk');if(mode==='crouch'){d.setCrouched(true);for(let i=0;i<12;i++)d.step(.05)}
   let belly=[],socketL=[],socketR=[],capL=[],capR=[],rimL=[],rimR=[],elbowL=[],elbowR=[],twistL=[],twistR=[],localL=[],localR=[];
   for(let t=0;t<120;t++){
    d.setPhase(t/120);d.scene.updateMatrixWorld(true);mesh.skeleton.update();let bx=0;for(const i of groups.belly){mesh.getVertexPosition(i,v);v.applyMatrix4(mesh.matrixWorld);bx+=v.x-d.player.position.x}belly.push(bx/groups.belly.length);
    for(const side of ['L','R']){
     const shoulder=d.male.getObjectByName('Rig_Shoulder_'+side),socket=chest.worldToLocal(getBone('Rig_UpperArm_'+side));(side==='L'?socketL:socketR).push(socket.z);
     (side==='L'?localL:localR).push(2*Math.acos(Math.min(1,Math.abs(shoulder.quaternion.w)))*180/Math.PI);
     let values=groups['cap'+side].map(i=>{mesh.getVertexPosition(i,v);v.applyMatrix4(mesh.matrixWorld);return chest.worldToLocal(v).z});values.sort((a,b)=>a-b);
     (side==='L'?capL:capR).push(values.reduce((a,b)=>a+b,0)/values.length);(side==='L'?rimL:rimR).push(values[Math.floor(values.length*.9)]);
     (side==='L'?elbowL:elbowR).push(radius(side));(side==='L'?twistL:twistR).push(twist(side));
    }
   }
   all[mode+'/'+variant]=Object.fromEntries(Object.entries({belly,socketL,socketR,capL,capR,rimL,rimR,elbowL,elbowR,twistL,twistR,localL,localR}).map(([k,a])=>[k,stats(a)]));
  }
  return {groups:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,v.length])),compensation,all};
 });
 for(const [k,n] of Object.entries(result.groups))assert.ok(n>=10,'Too few '+k+' points: '+n);
 for(const [mode,angles] of Object.entries(result.compensation)){const expected=mode==='walk'?5:0;assert.ok(Math.abs(angles.min-expected)<.01&&Math.abs(angles.max-expected)<.01,mode+' arm orientation compensation drifted: '+JSON.stringify(angles))}
 for(const mode of ['walk','run','crouch'])for(const side of ['L','R']){
  const before=result.all[mode+'/before'],after=result.all[mode+'/after'];
  assert.ok(before['local'+side].max<.001,mode+' old clavicle did not stay at bind');
  assert.ok(after['local'+side].max>(mode==='crouch'?3:6),mode+' new clavicle not animated');
  assert.ok(after['socket'+side].range>(mode==='crouch'?.004:.008),mode+' shoulder socket did not move relative to chest');
  assert.ok(after['cap'+side].range>before['cap'+side].range+.0003,mode+' sampled skin cap did not gain movement');
  assert.ok(after['elbow'+side].min>before['elbow'+side].min-.001,mode+' selected elbow radius regressed');
  assert.ok(after['twist'+side].max<5,mode+' unexpected forearm axial twist');
 }
 for(const mode of ['walk','run'])assert.ok(result.all[mode+'/after'].belly.range<.012,mode+' sampled abdomen centre moved excessively');
 assert.deepEqual(errors,[]);console.log('PASS: sampled shoulder joints, chest-relative sockets and skin caps; elbow radius and twist proxies; abdomen centroid '+JSON.stringify(result));
 console.log('NOTE: samples do not establish anatomical realism, whole-arm volume or artistic quality.');
}finally{await browser.close()}
