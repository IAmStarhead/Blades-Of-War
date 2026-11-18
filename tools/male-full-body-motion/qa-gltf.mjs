// Structural regression against the last published trial, plus glTF validation.
// This checks data preservation; it cannot establish artistic motion quality.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.resolve(process.argv[2]||path.join(repo,'work/male-full-body-motion'));
const validator=createRequire(path.join(repo,'tools/character-showcase/package.json'))('gltf-validator');
const hash=b=>createHash('sha256').update(b).digest('hex');
const source=await fs.readFile(path.join(repo,'work/male-natural-walk/male_natural_walk.glb'));
const generated=await fs.readFile(path.join(output,'male_full_body_motion.glb'));
assert.equal(hash(source),'0785de99520946cfa9eaf207813f256bd4e944f670f24972150a9d2181c8cdcf');
const io=new NodeIO(),[a,b]=await Promise.all([io.readBinary(source),io.readBinary(generated)]),old=a.getRoot(),now=b.getRoot();
const node=(r,n)=>{const list=r.listNodes().filter(x=>x.getName()===n);assert.equal(list.length,1,n);return list[0]};
const digest=a=>{const v=a.getArray();return hash(Buffer.from(v.buffer,v.byteOffset,v.byteLength))};
const material=m=>({name:m.getName(),base:m.getBaseColorFactor(),metal:m.getMetallicFactor(),rough:m.getRoughnessFactor(),
 double:m.getDoubleSided(),alpha:m.getAlphaMode(),cutoff:m.getAlphaCutoff(),emissive:m.getEmissiveFactor(),
 texture:m.getBaseColorTexture()?hash(m.getBaseColorTexture().getImage()):null});
assert.deepEqual(old.listMaterials().map(material),now.listMaterials().map(material));
assert.deepEqual(old.listTextures().map(t=>hash(t.getImage())),now.listTextures().map(t=>hash(t.getImage())));
assert.deepEqual(old.listNodes().map(n=>n.getName()),now.listNodes().map(n=>n.getName()));
assert.equal(old.listSkins().length,1);assert.equal(now.listSkins().length,1);
const [s0,s1]=[old.listSkins()[0],now.listSkins()[0]],names=s0.listJoints().map(j=>j.getName());
assert.equal(names.length,22);assert.deepEqual(names,s1.listJoints().map(j=>j.getName()));
assert.equal(digest(s0.getInverseBindMatrices()),digest(s1.getInverseBindMatrices()));
const oldNodes=old.listNodes(),newNodes=now.listNodes();
for(let i=0;i<oldNodes.length;i++){
 const previous=oldNodes[i],next=newNodes[i],name=previous.getName();
 assert.equal(oldNodes.indexOf(previous.getParentNode()),newNodes.indexOf(next.getParentNode()),name+' parent');
 assert.deepEqual(previous.getTranslation(),next.getTranslation(),name+' translation');
 assert.deepEqual(previous.getRotation(),next.getRotation(),name+' rotation');
 assert.deepEqual(previous.getScale(),next.getScale(),name+' scale');
}
for(const name of ['head_1','head_2','ear-makehuman-left','ear-makehuman-right']){
 const x=node(old,name),y=node(now,name),p=x.getMesh().listPrimitives()[0],q=y.getMesh().listPrimitives()[0];
 assert.equal(digest(p.getIndices()),digest(q.getIndices()),name+' indices');assert.deepEqual(p.listSemantics().sort(),q.listSemantics().sort());
 for(const semantic of p.listSemantics())assert.equal(digest(p.getAttribute(semantic)),digest(q.getAttribute(semantic)),`${name}/${semantic}`);
 assert.deepEqual(x.getMesh().getWeights(),y.getMesh().getWeights());assert.deepEqual(x.getMesh().getExtras(),y.getMesh().getExtras());
 const before=p.listTargets(),after=q.listTargets();assert.equal(after.length,before.length);
 for(let i=0;i<before.length;i++){
  assert.deepEqual(before[i].listSemantics().sort(),after[i].listSemantics().sort());
  for(const semantic of before[i].listSemantics())assert.equal(digest(before[i].getAttribute(semantic)),digest(after[i].getAttribute(semantic)),name+' morph '+i+'/'+semantic);
 }
}
console.log('PASS: all node transforms, 22-joint hierarchy and inverse binds, geometry, skin weights, normals, materials, ears and all existing morphs match');
const find=(r,n)=>{const list=r.listAnimations().filter(x=>x.getName()===n);assert.equal(list.length,1,n);return list[0]};
const oldNames=old.listAnimations().map(a=>a.getName());assert.equal(oldNames.length,21);
assert.deepEqual(now.listAnimations().map(a=>a.getName()),[...oldNames,'Full_Body_Walk','Full_Body_Run']);
for(const previous of old.listAnimations()){
 const name=previous.getName(),next=find(now,name),ac=previous.listChannels(),bc=next.listChannels();assert.equal(ac.length,bc.length,name);
 for(let i=0;i<ac.length;i++){
  const x=ac[i],y=bc[i],p=x.getSampler(),q=y.getSampler();
  assert.equal(x.getTargetNode().getName(),y.getTargetNode().getName(),name);assert.equal(x.getTargetPath(),y.getTargetPath(),name);
  assert.equal(p.getInterpolation(),q.getInterpolation(),name);assert.equal(digest(p.getInput()),digest(q.getInput()),name+' times');
  assert.equal(digest(p.getOutput()),digest(q.getOutput()),name+' keys');
 }
}
console.log('PASS: all 21 previous animation channels, time keys and output values are unchanged');
for(const [name,duration] of [['Full_Body_Walk',1],['Full_Body_Run',.7]]){
 const clip=find(now,name),channels=clip.listChannels();assert.equal(channels.length,23);
 const paths=new Set();let morph=false,active=0;
 for(const channel of channels){
  const nodeName=channel.getTargetNode().getName(),target=channel.getTargetPath(),sampler=channel.getSampler(),input=sampler.getInput(),values=sampler.getOutput().getArray();
  const key=nodeName+'/'+target;assert.ok(!paths.has(key),name+' duplicate channel '+key);paths.add(key);
  assert.equal(sampler.getInterpolation(),'LINEAR');assert.equal(input.getCount(),121);
  assert.equal(input.getScalar(0),0);assert.ok(Math.abs(input.getScalar(120)-duration)<1e-6);
  for(let i=1;i<121;i++)assert.ok(input.getScalar(i)>input.getScalar(i-1));
  for(const x of values)assert.ok(Number.isFinite(x),name+' non-finite value');
  const width=target==='rotation'?4:target==='translation'?3:10;
  assert.equal(values.length,121*width,key);
  for(let k=0;k<width;k++)assert.ok(Math.abs(values[k]-values[120*width+k])<1e-6,name+' loop seam '+key);
  for(let i=0;i<121;i++){
   const row=values.slice(i*width,(i+1)*width);
   if(target==='rotation'){
    assert.ok(Math.abs(Math.hypot(...row)-1)<1e-6,key+' quaternion');
    if(['Rig_Forearm_L','Rig_Forearm_R'].includes(nodeName)){
     assert.ok(Math.abs(row[1])<1e-7&&Math.abs(row[2])<1e-7,key+' unexpected non-hinge rotation');
    }
    if(['Rig_Hips','Rig_Spine','Rig_Chest'].includes(nodeName))assert.ok(Math.abs(row[1])<.1&&Math.abs(row[2])<.1,key+' excessive torso yaw/roll');
    if(['Rig_Hand_L','Rig_Hand_R'].includes(nodeName))assert.deepEqual([...row],[0,0,0,1],key+' wrist rotation');
   }else if(target==='translation')assert.ok(Math.abs(row[0])<=.012&&row[2]===0,key+' unexpected root translation');
   else{
    assert.equal(key,'head_2/weights');assert.equal(row[0],0);assert.equal(row[1],1);
    for(let j=2;j<6;j++){assert.ok(row[j]>=0&&row[j]<=1.15001);active+=row[j]}
    assert.deepEqual([...row.slice(6)],[0,0,0,0]);morph=true;
   }
  }
 }
 assert.ok(morph&&active>1,name+' joint correctives inactive');
 for(const n of names)assert.ok(paths.has(n+(n==='Rig_Root'?'/translation':'/rotation')),name+' missing '+n);
}
console.log('PASS: two new 121-key loops close; root shift and torso rotations stay bounded, forearms use hinge axes, wrists and old local morphs are inactive; corrective weights remain');
for(const [name,data] of [['source',source],['trial',generated]]){
 const report=await validator.validateBytes(new Uint8Array(data),{uri:name+'.glb'});
 assert.equal(report.issues.numErrors,0);assert.equal(report.issues.numWarnings,0);assert.equal(report.info.totalTriangleCount,32354);
 if(name==='trial')assert.equal(report.info.animationCount,23);
 console.log(`PASS glTF Validator ${name}: ${report.issues.numErrors} errors, ${report.issues.numWarnings} warnings, ${report.issues.numInfos} infos`);
}
