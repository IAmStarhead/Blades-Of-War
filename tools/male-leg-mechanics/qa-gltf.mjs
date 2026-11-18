// Structural and key-data regression against the actual delivered review.
// A valid GLB and numerical checks are not an artistic acceptance test.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.resolve(process.argv[2]||path.join(repo,'work/male-leg-mechanics'));
const validate=createRequire(path.join(repo,'tools/character-showcase/package.json'))('gltf-validator');
const hash=b=>createHash('sha256').update(b).digest('hex');
const source=await fs.readFile(path.join(repo,'work/male-motion-review/male_motion_review.glb'));
const generated=await fs.readFile(path.join(output,'male_leg_mechanics.glb'));
assert.equal(hash(source),'be394a6f1124fbe10e352ab2d3bfa0c0aabddce65c3774c2f4e622e52b037e07');
const io=new NodeIO(),[a,b]=await Promise.all([io.readBinary(source),io.readBinary(generated)]),old=a.getRoot(),now=b.getRoot();
const node=(r,n)=>{const x=r.listNodes().filter(v=>v.getName()===n);assert.equal(x.length,1,n);return x[0]};
const clip=(r,n)=>{const x=r.listAnimations().filter(v=>v.getName()===n);assert.equal(x.length,1,n);return x[0]};
const digest=x=>{const v=x.getArray();return hash(Buffer.from(v.buffer,v.byteOffset,v.byteLength))};
const near=(x,y,t=1e-6)=>assert.ok(Math.abs(x-y)<t,`${x} != ${y}`);
const mat=m=>({name:m.getName(),base:m.getBaseColorFactor(),metal:m.getMetallicFactor(),rough:m.getRoughnessFactor(),double:m.getDoubleSided(),alpha:m.getAlphaMode(),cutoff:m.getAlphaCutoff(),emissive:m.getEmissiveFactor(),texture:m.getBaseColorTexture()?hash(m.getBaseColorTexture().getImage()):null});
assert.deepEqual(old.listMaterials().map(mat),now.listMaterials().map(mat));
assert.deepEqual(old.listTextures().map(t=>hash(t.getImage())),now.listTextures().map(t=>hash(t.getImage())));

const an=old.listNodes(),bn=now.listNodes();assert.deepEqual(an.map(n=>n.getName()),bn.map(n=>n.getName()));
const [s0,s1]=[old.listSkins()[0],now.listSkins()[0]],jNames=s1.listJoints().map(x=>x.getName());
assert.equal(jNames.length,22);assert.deepEqual(s0.listJoints().map(x=>x.getName()),jNames);
const inv0=s0.getInverseBindMatrices().getArray(),inv1=s1.getInverseBindMatrices().getArray();
for(let i=0;i<an.length;i++){
 const a=an[i],b=bn[i],name=a.getName(),thigh=/^Rig_Thigh_[LR]$/.test(name),shin=/^Rig_Shin_[LR]$/.test(name);
 assert.equal(an.indexOf(a.getParentNode()),bn.indexOf(b.getParentNode()),name+' parent');
 assert.deepEqual(a.getRotation(),b.getRotation(),name+' rotation');assert.deepEqual(a.getScale(),b.getScale(),name+' scale');
 const x=a.getTranslation(),y=b.getTranslation();near(x[0],y[0]);near(x[2],y[2]);near(y[1],x[1]+(thigh?.05:shin?-.05:0));
 if(thigh||shin)assert.deepEqual(b.getExtras().deliveredTranslation,x,name+' saved original translation');
 if(thigh){const j=jNames.indexOf(name);assert.deepEqual(b.getExtras().deliveredInverse,Array.from(inv0.subarray(j*16,(j+1)*16)),name+' saved inverse');}
}
for(let i=0;i<jNames.length;i++)for(let k=0;k<16;k++)near(inv1[16*i+k],inv0[16*i+k]-(/^Rig_Thigh_[LR]$/.test(jNames[i])&&k===13?.05:0));

for(const name of ['head_1','head_2','ear-makehuman-left','ear-makehuman-right']){
 const x=node(old,name).getMesh(),y=node(now,name).getMesh(),p=x.listPrimitives()[0],q=y.listPrimitives()[0];
 assert.equal(digest(p.getIndices()),digest(q.getIndices()),name+' indices');
 for(const semantic of p.listSemantics())if(name!=='head_2'||!['JOINTS_0','WEIGHTS_0'].includes(semantic))assert.equal(digest(p.getAttribute(semantic)),digest(q.getAttribute(semantic)),name+'/'+semantic);
 const before=p.listTargets(),after=q.listTargets();assert.equal(before.length,after.length);assert.deepEqual(x.getWeights(),y.getWeights());
 for(let i=0;i<before.length;i++){assert.equal(before[i].getName(),after[i].getName());assert.deepEqual(before[i].listSemantics().sort(),after[i].listSemantics().sort());for(const sem of before[i].listSemantics())assert.equal(digest(before[i].getAttribute(sem)),digest(after[i].getAttribute(sem)),name+' target '+i+'/'+sem)}
}
const po=node(old,'head_2').getMesh().listPrimitives()[0],pn=node(now,'head_2').getMesh().listPrimitives()[0],pos=po.getAttribute('POSITION'),oj=po.getAttribute('JOINTS_0'),ow=po.getAttribute('WEIGHTS_0'),nj=pn.getAttribute('JOINTS_0'),nw=pn.getAttribute('WEIGHTS_0');
assert.equal(digest(oj),digest(pn.getAttribute('_DELIVERED_JOINTS')));assert.equal(digest(ow),digest(pn.getAttribute('_DELIVERED_WEIGHTS')));
const influences=(j,w,i)=>{const ids=j.getElement(i,[]),ws=w.getElement(i,[]),out=new Map();for(let k=0;k<4;k++)if(ws[k]>1e-8)out.set(ids[k],(out.get(ids[k])||0)+ws[k]);return out};
let changed=0,maxChange=0,seams=new Map();
for(let i=0;i<pos.getCount();i++){
 const xyz=pos.getElement(i,[]),before=influences(oj,ow,i),after=influences(nj,nw,i),all=new Set([...before.keys(),...after.keys()]);
 let difference=0;for(const id of all){const d=Math.abs((before.get(id)||0)-(after.get(id)||0));difference=Math.max(difference,d);if(!['Rig_Hips','Rig_Thigh_L','Rig_Thigh_R'].includes(jNames[id]))assert.ok(d<2e-6,'non-hip weight changed '+i+' '+jNames[id])}
 near([...after.values()].reduce((a,b)=>a+b,0),1,2e-6);
 if(difference>1e-6){changed++;maxChange=Math.max(maxChange,difference);assert.ok(xyz[1]>=.60&&xyz[1]<=1.08,'weight changed outside hip zone')}
 const key=xyz.join(','),prior=seams.get(key);if(prior)for(const id of new Set([...prior.keys(),...after.keys()]))assert.ok(Math.abs((prior.get(id)||0)-(after.get(id)||0))<2e-6,'unequal welded weight '+i);else seams.set(key,after);
}
assert.ok(changed>=350&&changed<=364,`unexpected reweighted vertex count ${changed}`);assert.ok(maxChange>.10&&maxChange<.14);
console.log(`PASS: rest geometry, materials and morphs retained; bind changed only at hips/shins; ${changed} vertices reweighted (max ${(100*maxChange).toFixed(1)} percentage points); delivered rig and weights retained`);

const existing=old.listAnimations().map(a=>a.getName()),newNames=['Leg_Refined_Walk','Leg_Refined_Run','Leg_Refined_Crouch_Idle','Leg_Refined_Crouch_Walk'];
assert.equal(existing.length,33);assert.deepEqual(now.listAnimations().map(a=>a.getName()),[...existing,...newNames]);
for(const previous of old.listAnimations()){
 const next=clip(now,previous.getName()),x=previous.listChannels(),y=next.listChannels();assert.equal(x.length,y.length,previous.getName());
 for(let i=0;i<x.length;i++){const a=x[i],b=y[i],p=a.getSampler(),q=b.getSampler();assert.equal(a.getTargetNode().getName(),b.getTargetNode().getName());assert.equal(a.getTargetPath(),b.getTargetPath());assert.equal(p.getInterpolation(),q.getInterpolation());assert.equal(digest(p.getInput()),digest(q.getInput()));assert.equal(digest(p.getOutput()),digest(q.getOutput()),previous.getName()+' output')}
}
console.log('PASS: all 33 delivered animation keys and morph channels are byte-identical');
const pairs=[['Reviewed_Walk',newNames[0],1],['Reviewed_Run',newNames[1],.7],['Reviewed_Crouch_Idle',newNames[2],2.4],['Reviewed_Crouch_Walk',newNames[3],1.6]];
for(const [oldName,newName,duration] of pairs){
 const previous=clip(now,oldName),current=clip(now,newName);assert.equal(previous.listChannels().length,23);assert.equal(current.listChannels().length,23);
 const keys=new Set();let altered=0;
 for(const a of previous.listChannels()){
  const n=a.getTargetNode().getName(),target=a.getTargetPath(),oldSampler=a.getSampler(),b=current.listChannels().find(x=>x.getTargetNode().getName()===n&&x.getTargetPath()===target);assert.ok(b,newName+' missing '+n+'/'+target);
  const sampler=b.getSampler(),time=sampler.getInput(),v=sampler.getOutput().getArray(),key=n+'/'+target;assert.ok(!keys.has(key));keys.add(key);
  assert.equal(sampler.getInterpolation(),'LINEAR');assert.equal(digest(oldSampler.getInput()),digest(time));assert.equal(time.getCount(),121);near(time.getScalar(120),duration);
  if(target==='rotation'&&/^Rig_(Thigh|Shin|Foot)_[LR]$/.test(n)){assert.notEqual(digest(oldSampler.getOutput()),digest(sampler.getOutput()),newName+' did not retarget '+n);altered++}
  else assert.equal(digest(oldSampler.getOutput()),digest(sampler.getOutput()),newName+' changed upper/root/morph '+key);
  const width=target==='rotation'?4:target==='translation'?3:13;assert.equal(v.length,121*width);for(let k=0;k<width;k++)near(v[k],v[120*width+k],2e-6);
  for(const value of v)assert.ok(Number.isFinite(value));if(target==='rotation')for(let i=0;i<121;i++)near(Math.hypot(...v.subarray(4*i,4*i+4)),1,1e-6);
 }
 assert.equal(altered,6);
}
console.log('PASS: only thigh/shin/foot rotations retargeted in four new closed, finite cycles; torso, arms, hands, root and morph keys preserved');
for(const [name,data] of [['source',source],['trial',generated]]){
 const report=await validate.validateBytes(new Uint8Array(data),{uri:name+'.glb'});assert.equal(report.issues.numErrors,0);assert.equal(report.issues.numWarnings,0);assert.equal(report.info.totalTriangleCount,32354);if(name==='trial')assert.equal(report.info.animationCount,37);
 console.log(`PASS glTF Validator ${name}: ${report.issues.numErrors} errors, ${report.issues.numWarnings} warnings, ${report.issues.numInfos} infos`);
}
