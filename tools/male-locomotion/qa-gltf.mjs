// Structural regression and cycle checks against the published refinement.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.resolve(process.argv[2]||path.join(root,'work/male-locomotion'));
const validator=createRequire(path.join(root,'tools/character-showcase/package.json'))('gltf-validator');
const sha=b=>createHash('sha256').update(b).digest('hex');
const source=await fs.readFile(path.join(root,'work/male-rig-refinement/male_motion_refinement.glb'));
const generated=await fs.readFile(path.join(output,'male_locomotion.glb'));
assert.equal(sha(source),'a442b85eab3e725bb54f87ce5a3e89da05e7cfefa02cf5cfbb817cf6c67fcc4d');
const io=new NodeIO(),[a,b]=await Promise.all([io.readBinary(source),io.readBinary(generated)]),old=a.getRoot(),now=b.getRoot();
const node=(r,n)=>{const items=r.listNodes().filter(x=>x.getName()===n);assert.equal(items.length,1,n);return items[0]};
const hashAccessor=a=>{const v=a.getArray();return sha(Buffer.from(v.buffer,v.byteOffset,v.byteLength))};
const material=m=>({name:m.getName(),base:m.getBaseColorFactor(),metal:m.getMetallicFactor(),rough:m.getRoughnessFactor(),
 double:m.getDoubleSided(),alpha:m.getAlphaMode(),cutoff:m.getAlphaCutoff(),emissive:m.getEmissiveFactor(),
 texture:m.getBaseColorTexture()?sha(m.getBaseColorTexture().getImage()):null});
assert.deepEqual(old.listMaterials().map(material),now.listMaterials().map(material));
assert.deepEqual(old.listTextures().map(t=>sha(t.getImage())),now.listTextures().map(t=>sha(t.getImage())));
const [s0,s1]=[old.listSkins()[0],now.listSkins()[0]],names=s0.listJoints().map(j=>j.getName());
assert.equal(old.listSkins().length,1);assert.equal(now.listSkins().length,1);assert.equal(names.length,22);
assert.deepEqual(names,s1.listJoints().map(j=>j.getName()));assert.equal(hashAccessor(s0.getInverseBindMatrices()),hashAccessor(s1.getInverseBindMatrices()));
for(const name of names){const x=node(old,name),y=node(now,name);assert.equal(x.getParentNode()?.getName(),y.getParentNode()?.getName(),name);
 assert.deepEqual(x.getTranslation(),y.getTranslation(),name);assert.deepEqual(x.getRotation(),y.getRotation(),name);assert.deepEqual(x.getScale(),y.getScale(),name)}
let changed=0,max=0;const perJoint=(p,i)=>{const j=p.getAttribute('JOINTS_0').getElement(i,[]),w=p.getAttribute('WEIGHTS_0').getElement(i,[]),v=new Float64Array(names.length);
 for(let k=0;k<4;k++)v[j[k]]+=w[k];return v};
for(const name of ['head_1','head_2','ear-makehuman-left','ear-makehuman-right']){
 const x=node(old,name),y=node(now,name),p=x.getMesh().listPrimitives()[0],q=y.getMesh().listPrimitives()[0];
 assert.equal(hashAccessor(p.getIndices()),hashAccessor(q.getIndices()),name+' indices');assert.deepEqual(p.listSemantics().sort(),q.listSemantics().sort());
 for(const semantic of p.listSemantics()){
  const u=p.getAttribute(semantic),v=q.getAttribute(semantic);assert.equal(u.getCount(),v.getCount());assert.equal(u.getComponentType(),v.getComponentType());
  if(name!=='head_2'||!['JOINTS_0','WEIGHTS_0'].includes(semantic))assert.equal(hashAccessor(u),hashAccessor(v),`${name}/${semantic}`);
 }
 x.getWorldMatrix().forEach((v,i)=>assert.ok(Math.abs(v-y.getWorldMatrix()[i])<1e-7));
 assert.equal(p.listTargets().length,q.listTargets().length);assert.deepEqual(x.getMesh().getWeights(),y.getMesh().getWeights());
 for(let t=0;t<p.listTargets().length;t++)for(const sem of p.listTargets()[t].listSemantics())
  assert.equal(hashAccessor(p.listTargets()[t].getAttribute(sem)),hashAccessor(q.listTargets()[t].getAttribute(sem)),name+' morph '+sem);
 if(name==='head_2'){
  const position=p.getAttribute('POSITION'),joint={hips:names.indexOf('Rig_Hips'),left:names.indexOf('Rig_Thigh_L'),right:names.indexOf('Rig_Thigh_R')},dups=new Map();
  for(let i=0;i<position.getCount();i++){
   const [x,y,z]=position.getElement(i,[]),before=perJoint(p,i),after=perJoint(q,i),diff=after.map((v,k)=>v-before[k]),size=Math.max(...diff.map(Math.abs));
   assert.ok(Math.abs(after.reduce((a,b)=>a+b,0)-1)<2e-5,'weight normalization');
   if(size>1e-6){changed++;max=Math.max(max,size);assert.ok(y>.75&&y<.98&&Math.abs(x)>.015,'unexpected hip weight');
    const side=x>0?joint.left:joint.right;assert.ok(diff[side]>0&&diff[joint.hips]<0);assert.ok(Math.abs(diff[side]+diff[joint.hips])<2e-6);
    for(let k=0;k<names.length;k++)if(k!==side&&k!==joint.hips)assert.ok(Math.abs(diff[k])<2e-6,names[k]);
   }
   const key=[x,y,z].join(',');if(dups.has(key))for(let k=0;k<names.length;k++)assert.ok(Math.abs(after[k]-dups.get(key)[k])<2e-6,'UV seam weights');else dups.set(key,after);
  }
 }
}
assert.equal(changed,284);assert.ok(max<.5);console.log(`PASS: positions, topology, normals, UVs, materials, morphs, skin and 22 bind bones unchanged; ${changed} hip weights redistributed (max ${max.toFixed(4)})`);
const find=(r,n)=>{const a=r.listAnimations().filter(x=>x.getName()===n);assert.equal(a.length,1,n);return a[0]};
const describe=a=>a.listChannels().map(c=>{const s=c.getSampler();return {node:c.getTargetNode().getName(),path:c.getTargetPath(),interpolation:s.getInterpolation(),input:hashAccessor(s.getInput()),output:hashAccessor(s.getOutput())}});
for(const [before,after] of [['Idle_Breathing','Previous_Refined_Idle'],['Test_Arms','Test_Arms'],['Test_Elbow','Test_Elbow'],['Test_Knee','Test_Knee'],['Test_Head','Test_Head'],['Previous_Idle','Previous_Idle'],['Previous_Arms','Previous_Arms'],['Previous_Knee','Previous_Knee']])
 assert.deepEqual(describe(find(old,before)),describe(find(now,after)),`${before} keys changed`);
console.log('PASS: head, elbow, knee, arm and both previous idle clips retain all original animation channels and keys');
const order=['Idle_Breathing','Walk_Loop','Run_Loop','Test_Arms','Test_Elbow','Test_Knee','Test_Head','Previous_Refined_Idle','Previous_Idle','Previous_Arms','Previous_Knee'];
assert.deepEqual(now.listAnimations().map(a=>a.getName()),order);
for(const name of order){const anim=find(now,name);for(const c of anim.listChannels()){
 const s=c.getSampler(),input=s.getInput(),output=s.getOutput(),count=input.getCount();assert.equal(input.getScalar(0),0);
 for(let i=1;i<count;i++)assert.ok(input.getScalar(i)>input.getScalar(i-1),name+' time');
 const first=output.getElement(0,[]),last=output.getElement(count-1,[]);first.forEach((v,i)=>assert.ok(Math.abs(v-last[i])<1e-6,name+' seam'));
 if(c.getTargetPath()==='rotation')for(let i=0;i<count;i++)assert.ok(Math.abs(Math.hypot(...output.getElement(i,[]))-1)<1e-6,name+' rotation');
 }}
const idle=find(now,'Idle_Breathing');assert.ok(idle.listChannels().every(c=>c.getTargetPath()!=='scale'));
for(const name of ['Walk_Loop','Run_Loop']){const anim=find(now,name);assert.equal(anim.listChannels().length,17);for(const side of ['L','R'])for(const part of ['Thigh','Shin','Foot','Shoulder','UpperArm','Forearm','Hand'])
 assert.ok(anim.listChannels().some(c=>c.getTargetNode().getName()===`Rig_${part}_${side}`));}
console.log('PASS: 11 closed cycles, unit quaternion keys, complete gait tracks; new breathing has no scale channel');
for(const [name,data] of [['source',source],['locomotion',generated]]){const report=await validator.validateBytes(new Uint8Array(data),{uri:name+'.glb'});
 assert.equal(report.issues.numErrors,0);assert.equal(report.issues.numWarnings,0);assert.equal(report.info.totalTriangleCount,32354);
 if(name==='locomotion')assert.equal(report.info.animationCount,11);
 console.log(`PASS glTF Validator ${name}: ${report.issues.numErrors} errors, ${report.issues.numWarnings} warnings, ${report.issues.numInfos} infos`)}
