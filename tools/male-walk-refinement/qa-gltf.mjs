// Structural regression: only an additive profile morph and a new walk are allowed.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.resolve(process.argv[2]||path.join(root,'work/male-walk-refinement'));
const validator=createRequire(path.join(root,'tools/character-showcase/package.json'))('gltf-validator');
const sha=b=>createHash('sha256').update(b).digest('hex');
const source=await fs.readFile(path.join(root,'work/male-locomotion/male_locomotion.glb'));
const generated=await fs.readFile(path.join(output,'male_walk_refinement.glb'));
assert.equal(sha(source),'bf967a9abea76c35ecbbeebde644a34a2b45984ab13526d9047680e6487d6200');
const io=new NodeIO(),[a,b]=await Promise.all([io.readBinary(source),io.readBinary(generated)]),old=a.getRoot(),now=b.getRoot();
const node=(r,n)=>{const items=r.listNodes().filter(x=>x.getName()===n);assert.equal(items.length,1,n);return items[0]};
const hashAccessor=a=>{const v=a.getArray();return sha(Buffer.from(v.buffer,v.byteOffset,v.byteLength))};
const material=m=>({name:m.getName(),base:m.getBaseColorFactor(),metal:m.getMetallicFactor(),rough:m.getRoughnessFactor(),
 double:m.getDoubleSided(),alpha:m.getAlphaMode(),cutoff:m.getAlphaCutoff(),emissive:m.getEmissiveFactor(),
 texture:m.getBaseColorTexture()?sha(m.getBaseColorTexture().getImage()):null});
assert.deepEqual(old.listMaterials().map(material),now.listMaterials().map(material));
assert.deepEqual(old.listTextures().map(t=>sha(t.getImage())),now.listTextures().map(t=>sha(t.getImage())));
assert.deepEqual(old.listNodes().map(n=>n.getName()),now.listNodes().map(n=>n.getName()));
const [s0,s1]=[old.listSkins()[0],now.listSkins()[0]],names=s0.listJoints().map(j=>j.getName());
assert.equal(old.listSkins().length,1);assert.equal(now.listSkins().length,1);assert.equal(names.length,22);
assert.deepEqual(names,s1.listJoints().map(j=>j.getName()));assert.equal(hashAccessor(s0.getInverseBindMatrices()),hashAccessor(s1.getInverseBindMatrices()));
for(const name of names){const x=node(old,name),y=node(now,name);assert.equal(x.getParentNode()?.getName(),y.getParentNode()?.getName(),name);
 assert.deepEqual(x.getTranslation(),y.getTranslation(),name);assert.deepEqual(x.getRotation(),y.getRotation(),name);assert.deepEqual(x.getScale(),y.getScale(),name)}
const profileStats={};
for(const name of ['head_1','head_2','ear-makehuman-left','ear-makehuman-right']){
 const x=node(old,name),y=node(now,name),p=x.getMesh().listPrimitives()[0],q=y.getMesh().listPrimitives()[0];
 assert.equal(hashAccessor(p.getIndices()),hashAccessor(q.getIndices()),name+' indices');
 assert.deepEqual(p.listSemantics().sort(),q.listSemantics().sort());
 for(const semantic of p.listSemantics()){
  const u=p.getAttribute(semantic),v=q.getAttribute(semantic);assert.equal(u.getCount(),v.getCount());assert.equal(u.getComponentType(),v.getComponentType());
  assert.equal(hashAccessor(u),hashAccessor(v),`${name}/${semantic}`);
 }
 x.getWorldMatrix().forEach((v,i)=>assert.ok(Math.abs(v-y.getWorldMatrix()[i])<1e-7));
 const before=p.listTargets(),after=q.listTargets(),profile=name==='head_1'||name==='head_2';
 assert.equal(after.length,before.length+(profile?1:0));
 for(let t=0;t<before.length;t++)for(const sem of before[t].listSemantics())
  assert.equal(hashAccessor(before[t].getAttribute(sem)),hashAccessor(after[t].getAttribute(sem)),name+' original morph '+sem);
 if(!profile){assert.deepEqual(x.getMesh().getWeights(),y.getMesh().getWeights());continue}
 assert.deepEqual(y.getMesh().getWeights(),name==='head_1'?[1]:[0,1]);
 const target=after.at(-1),pos=p.getAttribute('POSITION'),normal=p.getAttribute('NORMAL'),dp=target.getAttribute('POSITION'),dn=target.getAttribute('NORMAL');
 assert.deepEqual(target.listSemantics().sort(),['NORMAL','POSITION']);assert.equal(dp.getCount(),pos.getCount());assert.equal(dn.getCount(),pos.getCount());
 let count=0,max=0,maxNormal=0;const duplicate=new Map();for(let i=0;i<pos.getCount();i++){
  const v=pos.getElement(i,[]),n=normal.getElement(i,[]),d=dp.getElement(i,[]),nd=dn.getElement(i,[]),len=Math.hypot(...d),nlen=Math.hypot(...nd);
  assert.ok(d.every(Number.isFinite)&&nd.every(Number.isFinite));assert.ok(d[0]===0&&d[1]===0&&d[2]>=0);
  if(len>1e-7){count++;assert.ok(v[1]>1.3&&v[1]<1.625&&v[2]<.01&&Math.abs(v[0])<.21,'profile escapes neck envelope')}
  assert.ok(Math.abs(Math.hypot(...n.map((x,k)=>x+nd[k]))-1)<1e-5,'non-unit morphed normal');
  max=Math.max(max,len);maxNormal=Math.max(maxNormal,2*Math.asin(Math.min(1,nlen/2))*180/Math.PI);
  const key=v.join(',');if(duplicate.has(key))assert.deepEqual(d,duplicate.get(key),'UV seam delta');else duplicate.set(key,d);
 }
 assert.ok(count>0&&max<.0101&&maxNormal<7);profileStats[name]={count,max,maxNormal};
}
console.log('PASS: all original positions, normals, UVs, indices, skin weights, morphs, materials, ears and 22 bind bones unchanged');
console.log('PASS: bounded reversible neck morph; smoothed normals and matching deltas at duplicate vertices '+JSON.stringify(profileStats));
const find=(r,n)=>{const a=r.listAnimations().filter(x=>x.getName()===n);assert.equal(a.length,1,n);return a[0]};
const order=['Idle_Breathing','Walk_Loop','Run_Loop','Test_Arms','Test_Elbow','Test_Knee','Test_Head','Previous_Walk','Previous_Refined_Idle','Previous_Idle','Previous_Arms','Previous_Knee'];
assert.deepEqual(now.listAnimations().map(a=>a.getName()),order);
for(const oldClip of old.listAnimations()){
 const name=oldClip.getName(),next=find(now,name==='Walk_Loop'?'Previous_Walk':name),ac=oldClip.listChannels(),bc=next.listChannels();assert.equal(ac.length,bc.length,name);
 for(let i=0;i<ac.length;i++){
  const x=ac[i],y=bc[i],p=x.getSampler(),q=y.getSampler();
  assert.equal(x.getTargetNode().getName(),y.getTargetNode().getName(),name);assert.equal(x.getTargetPath(),y.getTargetPath(),name);
  assert.equal(p.getInterpolation(),q.getInterpolation(),name);assert.equal(hashAccessor(p.getInput()),hashAccessor(q.getInput()),name+' times');
  if(x.getTargetPath()==='weights'){
   assert.equal(name,'Test_Arms');const v=p.getOutput().getArray(),w=q.getOutput().getArray();assert.equal(w.length,v.length*2);
   for(let k=0;k<v.length;k++){assert.equal(w[2*k],v[k]);assert.equal(w[2*k+1],1)}
  }else assert.equal(hashAccessor(p.getOutput()),hashAccessor(q.getOutput()),name+' keys');
 }
}
console.log('PASS: all previous animation keys preserved, including the exact run and previous walk; arm morph values retained with a new constant profile weight');
for(const name of order){const anim=find(now,name);for(const c of anim.listChannels()){
 const s=c.getSampler(),input=s.getInput(),out=s.getOutput(),count=input.getCount(),values=out.getArray(),width=values.length/count;
 assert.equal(s.getInterpolation(),'LINEAR');assert.ok(Number.isInteger(width));assert.equal(input.getScalar(0),0);
 for(let i=1;i<count;i++)assert.ok(input.getScalar(i)>input.getScalar(i-1),name+' time');
 for(let i=0;i<width;i++)assert.ok(Math.abs(values[i]-values[(count-1)*width+i])<1e-6,name+' loop seam');
 if(c.getTargetPath()==='rotation')for(let i=0;i<count;i++)assert.ok(Math.abs(Math.hypot(...out.getElement(i,[]))-1)<1e-6,name+' rotation');
}}
const walk=find(now,'Walk_Loop');assert.equal(walk.listChannels().length,18);
for(const side of ['L','R'])for(const part of ['Thigh','Shin','Foot','Shoulder','UpperArm','Forearm','Hand'])
 assert.ok(walk.listChannels().some(c=>c.getTargetNode().getName()===`Rig_${part}_${side}`));
const info=JSON.parse(await fs.readFile(path.join(output,'build-info.json'),'utf8'));
assert.equal(info.worstStanceReach,0);assert.ok(info.worstSwingReach<.004);assert.equal(info.walk.duration,.9);
console.log('PASS: 12 closed cycles, unit quaternion keys, complete new walk, and reachable sampled stance targets');
for(const [name,data] of [['source',source],['refinement',generated]]){
 const report=await validator.validateBytes(new Uint8Array(data),{uri:name+'.glb'});
 assert.equal(report.issues.numErrors,0);assert.equal(report.issues.numWarnings,0);assert.equal(report.info.totalTriangleCount,32354);
 if(name==='refinement')assert.equal(report.info.animationCount,12);
 console.log(`PASS glTF Validator ${name}: ${report.issues.numErrors} errors, ${report.issues.numWarnings} warnings, ${report.issues.numInfos} infos`);
}
