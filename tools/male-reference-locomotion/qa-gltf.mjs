// Structural regression: only two additional animation clips are allowed.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.resolve(process.argv[2]||path.join(repo,'work/male-reference-locomotion'));
const validator=createRequire(path.join(repo,'tools/character-showcase/package.json'))('gltf-validator');
const hash=b=>createHash('sha256').update(b).digest('hex');
const source=await fs.readFile(path.join(repo,'work/male-walk-refinement/male_walk_refinement.glb'));
const generated=await fs.readFile(path.join(output,'male_reference_locomotion.glb'));
assert.equal(hash(source),'e32fca3f789abbb0eebcf17f21cba5d2a981155de50e155982bbcb0281574d6c');
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
 assert.equal(digest(p.getIndices()),digest(q.getIndices()),name+' indices');
 assert.deepEqual(p.listSemantics().sort(),q.listSemantics().sort());
 for(const semantic of p.listSemantics()){
  const u=p.getAttribute(semantic),v=q.getAttribute(semantic);assert.equal(u.getCount(),v.getCount());assert.equal(u.getComponentType(),v.getComponentType());
  assert.equal(digest(u),digest(v),`${name}/${semantic}`);
 }
 x.getWorldMatrix().forEach((v,i)=>assert.ok(Math.abs(v-y.getWorldMatrix()[i])<1e-7));
 const before=p.listTargets(),after=q.listTargets();assert.equal(after.length,before.length);
 for(let i=0;i<before.length;i++){
  assert.deepEqual(before[i].listSemantics().sort(),after[i].listSemantics().sort());
  for(const semantic of before[i].listSemantics())assert.equal(digest(before[i].getAttribute(semantic)),digest(after[i].getAttribute(semantic)),name+' morph '+semantic);
 }
 assert.deepEqual(x.getMesh().getWeights(),y.getMesh().getWeights());
 assert.deepEqual(x.getMesh().getExtras(),y.getMesh().getExtras());
}
console.log('PASS: mesh, indices, normals, morphs, skin, bind skeleton, materials and ears match the previous model');
const find=(r,n)=>{const list=r.listAnimations().filter(x=>x.getName()===n);assert.equal(list.length,1,n);return list[0]};
const oldNames=old.listAnimations().map(a=>a.getName());assert.equal(oldNames.length,12);
assert.deepEqual(now.listAnimations().map(a=>a.getName()),[...oldNames,'Reference_Walk','Reference_Run']);
for(const previous of old.listAnimations()){
 const name=previous.getName(),next=find(now,name),ac=previous.listChannels(),bc=next.listChannels();assert.equal(ac.length,bc.length,name);
 for(let i=0;i<ac.length;i++){
  const x=ac[i],y=bc[i],p=x.getSampler(),q=y.getSampler();
  assert.equal(x.getTargetNode().getName(),y.getTargetNode().getName(),name);assert.equal(x.getTargetPath(),y.getTargetPath(),name);
  assert.equal(p.getInterpolation(),q.getInterpolation(),name);assert.equal(digest(p.getInput()),digest(q.getInput()),name+' times');
  assert.equal(digest(p.getOutput()),digest(q.getOutput()),name+' keys');
 }
}
console.log('PASS: all 12 previous animations and their exact keys are preserved');
for(const [name,duration] of [['Reference_Walk',1],['Reference_Run',.75]]){
 const animation=find(now,name);assert.equal(animation.listChannels().length,16);
 for(const c of animation.listChannels()){
  const s=c.getSampler(),input=s.getInput(),output=s.getOutput(),count=input.getCount(),values=output.getArray(),width=values.length/count;
  assert.equal(s.getInterpolation(),'LINEAR');assert.equal(input.getScalar(0),0);assert.ok(Math.abs(input.getScalar(count-1)-duration)<1e-6);
  for(let i=1;i<count;i++)assert.ok(input.getScalar(i)>input.getScalar(i-1),name+' time');
  for(let i=0;i<width;i++)assert.ok(Math.abs(values[i]-values[(count-1)*width+i])<1e-6,name+' loop seam');
  if(c.getTargetPath()==='rotation')for(let i=0;i<count;i++)assert.ok(Math.abs(Math.hypot(...output.getElement(i,[]))-1)<1e-6,name+' quaternion');
 }
}
console.log('PASS: two closed reference-based cycles, increasing times and unit quaternion keys');
for(const [name,data] of [['source',source],['reference',generated]]){
 const report=await validator.validateBytes(new Uint8Array(data),{uri:name+'.glb'});
 assert.equal(report.issues.numErrors,0);assert.equal(report.issues.numWarnings,0);assert.equal(report.info.totalTriangleCount,32354);
 if(name==='reference')assert.equal(report.info.animationCount,14);
 console.log(`PASS glTF Validator ${name}: ${report.issues.numErrors} errors, ${report.issues.numWarnings} warnings, ${report.issues.numInfos} infos`);
}
