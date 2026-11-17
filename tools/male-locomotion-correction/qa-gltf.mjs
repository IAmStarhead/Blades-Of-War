// Structural regression: preserve the previous model and clips, apart from
// padding its one morph-weight track; add two clips and four local correctives.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.resolve(process.argv[2]||path.join(repo,'work/male-locomotion-correction'));
const validator=createRequire(path.join(repo,'tools/character-showcase/package.json'))('gltf-validator');
const hash=b=>createHash('sha256').update(b).digest('hex');
const source=await fs.readFile(path.join(repo,'work/male-reference-locomotion/male_reference_locomotion.glb'));
const generated=await fs.readFile(path.join(output,'male_locomotion_corrected.glb'));
assert.equal(hash(source),'a7a2d08f8c92a11c713cc855a734437a98cd7e3e1e6cf8e19baafe32db572343');
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
for(const name of names){const x=node(old,name),y=node(now,name);assert.equal(x.getParentNode()?.getName(),y.getParentNode()?.getName(),name);
 assert.deepEqual(x.getTranslation(),y.getTranslation(),name);assert.deepEqual(x.getRotation(),y.getRotation(),name);assert.deepEqual(x.getScale(),y.getScale(),name)}
for(const name of ['head_1','head_2','ear-makehuman-left','ear-makehuman-right']){
 const x=node(old,name),y=node(now,name),p=x.getMesh().listPrimitives()[0],q=y.getMesh().listPrimitives()[0];
 assert.equal(digest(p.getIndices()),digest(q.getIndices()),name+' indices');assert.deepEqual(p.listSemantics().sort(),q.listSemantics().sort());
 for(const semantic of p.listSemantics())assert.equal(digest(p.getAttribute(semantic)),digest(q.getAttribute(semantic)),`${name}/${semantic}`);
 x.getWorldMatrix().forEach((v,i)=>assert.ok(Math.abs(v-y.getWorldMatrix()[i])<1e-7));
 const before=p.listTargets(),after=q.listTargets();assert.equal(after.length,before.length+(name==='head_2'?4:0));
 for(let i=0;i<before.length;i++){
  assert.deepEqual(before[i].listSemantics().sort(),after[i].listSemantics().sort());
  for(const semantic of before[i].listSemantics())assert.equal(digest(before[i].getAttribute(semantic)),digest(after[i].getAttribute(semantic)),name+' old morph '+semantic);
 }
 if(name==='head_2'){
  assert.deepEqual(y.getMesh().getWeights(),[...x.getMesh().getWeights(),0,0,0,0]);
  const positions=q.getAttribute('POSITION');
  for(let j=0;j<4;j++){
   const target=after[before.length+j],pos=target.getAttribute('POSITION'),normal=target.getAttribute('NORMAL');let count=0,max=0;
   assert.deepEqual(target.listSemantics().sort(),['NORMAL','POSITION']);
   for(let i=0;i<pos.getCount();i++){
    const d=pos.getElement(i,[]),n=normal.getElement(i,[]),amount=Math.hypot(...d);max=Math.max(max,amount);
    if(amount>1e-7||Math.hypot(...n)>1e-7)assert.ok(positions.getElement(i,[])[1]<1.35,`joint target ${j} touched neck/head`);
    if(amount>1e-7)count++;
   }
   assert.ok(count>20&&max<.04,`unexpected corrective ${j}`);
  }
 }else{assert.deepEqual(x.getMesh().getWeights(),y.getMesh().getWeights());assert.deepEqual(x.getMesh().getExtras(),y.getMesh().getExtras())}
}
// Verify the original morph names in raw glTF JSON, not glTF-Transform's
// substituted numeric names for empty strings.
function glbJSON(bytes){return JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'))}
const j0=glbJSON(source),j1=glbJSON(generated);
const oldBody=j0.meshes[j0.nodes.find(n=>n.name==='head_2').mesh],newBody=j1.meshes[j1.nodes.find(n=>n.name==='head_2').mesh];
assert.deepEqual(newBody.extras.targetNames,[...oldBody.extras.targetNames,'Elbow_L','Elbow_R','Knee_L','Knee_R']);
console.log('PASS: original base geometry, normals, weights, bind skeleton, two original morphs, materials and ears match; four zero-default targets are confined below neck');
const find=(r,n)=>{const list=r.listAnimations().filter(x=>x.getName()===n);assert.equal(list.length,1,n);return list[0]};
const oldNames=old.listAnimations().map(a=>a.getName());assert.equal(oldNames.length,14);
assert.deepEqual(now.listAnimations().map(a=>a.getName()),[...oldNames,'Corrected_Walk','Corrected_Run']);
let padded=0;
for(const previous of old.listAnimations()){
 const name=previous.getName(),next=find(now,name),ac=previous.listChannels(),bc=next.listChannels();assert.equal(ac.length,bc.length,name);
 for(let i=0;i<ac.length;i++){
  const x=ac[i],y=bc[i],p=x.getSampler(),q=y.getSampler();
  assert.equal(x.getTargetNode().getName(),y.getTargetNode().getName(),name);assert.equal(x.getTargetPath(),y.getTargetPath(),name);
  assert.equal(p.getInterpolation(),q.getInterpolation(),name);assert.equal(digest(p.getInput()),digest(q.getInput()),name+' times');
  if(x.getTargetPath()==='weights'&&x.getTargetNode().getName()==='head_2'){
   const before=p.getOutput().getArray(),after=q.getOutput().getArray();assert.equal(after.length,before.length*3);
   for(let k=0;k<before.length/2;k++)assert.deepEqual(Array.from(after.slice(k*6,k*6+6)),[...before.slice(k*2,k*2+2),0,0,0,0]);padded++;
  }else assert.equal(digest(p.getOutput()),digest(q.getOutput()),name+' keys');
 }
}
assert.equal(padded,1);console.log('PASS: all 14 previous animation keys retained, with zero-padding of the one existing morph track');
for(const [name,duration] of [['Corrected_Walk',1],['Corrected_Run',.75]]){
 const animation=find(now,name);assert.equal(animation.listChannels().length,17);
 for(const c of animation.listChannels()){
  const s=c.getSampler(),input=s.getInput(),output=s.getOutput(),count=input.getCount(),values=output.getArray(),width=values.length/count;
  assert.equal(s.getInterpolation(),'LINEAR');assert.equal(input.getScalar(0),0);assert.ok(Math.abs(input.getScalar(count-1)-duration)<1e-6);
  for(let i=1;i<count;i++)assert.ok(input.getScalar(i)>input.getScalar(i-1),name+' time');
  for(let i=0;i<width;i++)assert.ok(Math.abs(values[i]-values[(count-1)*width+i])<1e-6,name+' loop seam');
  if(c.getTargetPath()==='rotation')for(let i=0;i<count;i++)assert.ok(Math.abs(Math.hypot(...output.getElement(i,[]))-1)<1e-6,name+' quaternion');
  if(c.getTargetPath()==='weights'){
   assert.equal(width,6);for(let i=0;i<count;i++){assert.equal(values[i*6],0);assert.equal(values[i*6+1],1);
    for(let j=2;j<6;j++)assert.ok(values[i*6+j]>=0&&values[i*6+j]<=1.500001)}
  }
 }
}
console.log('PASS: corrected cycles loop, times increase, quaternions are unit length, morph weights are bounded');
for(const [name,data] of [['source',source],['corrected',generated]]){
 const report=await validator.validateBytes(new Uint8Array(data),{uri:name+'.glb'});
 assert.equal(report.issues.numErrors,0);assert.equal(report.issues.numWarnings,0);assert.equal(report.info.totalTriangleCount,32354);
 if(name==='corrected')assert.equal(report.info.animationCount,16);
 console.log(`PASS glTF Validator ${name}: ${report.issues.numErrors} errors, ${report.issues.numWarnings} warnings, ${report.issues.numInfos} infos`);
}
