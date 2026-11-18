// Structural regression against the actual last delivered stealth GLB.
// Validation does not substitute for visual or engine-specific review.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.resolve(process.argv[2]||path.join(repo,'work/male-motion-review'));
const validate=createRequire(path.join(repo,'tools/character-showcase/package.json'))('gltf-validator');
const hash=b=>createHash('sha256').update(b).digest('hex');
const source=await fs.readFile(path.join(repo,'work/male-stealth-crouch/male_stealth_crouch.glb'));
const generated=await fs.readFile(path.join(output,'male_motion_review.glb'));
assert.equal(hash(source),'a9b2587d8d5b7977aed04a06540cd1b4882a47a2af4491767a7f5ae34e1828e9');
const io=new NodeIO(),[a,b]=await Promise.all([io.readBinary(source),io.readBinary(generated)]),old=a.getRoot(),now=b.getRoot();
const node=(r,n)=>{const x=r.listNodes().filter(v=>v.getName()===n);assert.equal(x.length,1,n);return x[0]};
const clip=(r,n)=>{const x=r.listAnimations().filter(v=>v.getName()===n);assert.equal(x.length,1,n);return x[0]};
const digest=x=>{const v=x.getArray();return hash(Buffer.from(v.buffer,v.byteOffset,v.byteLength))};
const mat=m=>({name:m.getName(),base:m.getBaseColorFactor(),metal:m.getMetallicFactor(),rough:m.getRoughnessFactor(),double:m.getDoubleSided(),alpha:m.getAlphaMode(),cutoff:m.getAlphaCutoff(),emissive:m.getEmissiveFactor(),texture:m.getBaseColorTexture()?hash(m.getBaseColorTexture().getImage()):null});
assert.deepEqual(old.listMaterials().map(mat),now.listMaterials().map(mat));assert.deepEqual(old.listTextures().map(t=>hash(t.getImage())),now.listTextures().map(t=>hash(t.getImage())));
const an=old.listNodes(),bn=now.listNodes();assert.deepEqual(an.map(n=>n.getName()),bn.map(n=>n.getName()));
for(let i=0;i<an.length;i++){assert.equal(an.indexOf(an[i].getParentNode()),bn.indexOf(bn[i].getParentNode()));for(const get of ['getTranslation','getRotation','getScale'])assert.deepEqual(an[i][get](),bn[i][get](),an[i].getName()+' '+get)}
const [s0,s1]=[old.listSkins()[0],now.listSkins()[0]],jNames=s1.listJoints().map(x=>x.getName());assert.equal(jNames.length,22);assert.deepEqual(s0.listJoints().map(x=>x.getName()),jNames);assert.equal(digest(s0.getInverseBindMatrices()),digest(s1.getInverseBindMatrices()));
for(const name of ['head_1','head_2','ear-makehuman-left','ear-makehuman-right']){
 const x=node(old,name).getMesh(),y=node(now,name).getMesh(),p=x.listPrimitives()[0],q=y.listPrimitives()[0];assert.equal(digest(p.getIndices()),digest(q.getIndices()),name+' indices');
 for(const semantic of p.listSemantics())if(name!=='head_2'||!['JOINTS_0','WEIGHTS_0'].includes(semantic))assert.equal(digest(p.getAttribute(semantic)),digest(q.getAttribute(semantic)),name+'/'+semantic);
 const before=p.listTargets(),after=q.listTargets();assert.equal(before.length,after.length);assert.deepEqual(x.getWeights(),y.getWeights());
 for(let i=0;i<before.length;i++){assert.equal(before[i].getName(),after[i].getName());assert.deepEqual(before[i].listSemantics().sort(),after[i].listSemantics().sort());for(const sem of before[i].listSemantics())assert.equal(digest(before[i].getAttribute(sem)),digest(after[i].getAttribute(sem)),name+' target '+i+'/'+sem)}
}
const po=node(old,'head_2').getMesh().listPrimitives()[0],pn=node(now,'head_2').getMesh().listPrimitives()[0],pos=po.getAttribute('POSITION'),oj=po.getAttribute('JOINTS_0'),ow=po.getAttribute('WEIGHTS_0'),nj=pn.getAttribute('JOINTS_0'),nw=pn.getAttribute('WEIGHTS_0');
assert.equal(digest(oj),digest(pn.getAttribute('_PREVIOUS_JOINTS')));assert.equal(digest(ow),digest(pn.getAttribute('_PREVIOUS_WEIGHTS')));
const influences=(j,w,i)=>{const ids=j.getElement(i,[]),ws=w.getElement(i,[]),out=new Map();for(let k=0;k<4;k++)if(ws[k]>1e-8)out.set(ids[k],(out.get(ids[k])||0)+ws[k]);return out};
let changed=0,maxChange=0,seams=new Map();
for(let i=0;i<pos.getCount();i++){
 const xyz=pos.getElement(i,[]),before=influences(oj,ow,i),after=influences(nj,nw,i),all=new Set([...before.keys(),...after.keys()]);
 let difference=0;for(const id of all){const d=Math.abs((before.get(id)||0)-(after.get(id)||0));difference=Math.max(difference,d);if(!['Rig_Hips','Rig_Thigh_L','Rig_Thigh_R'].includes(jNames[id]))assert.ok(d<2e-6,'non-hip weight changed '+i+' '+jNames[id])}
 const sum=[...after.values()].reduce((a,b)=>a+b,0);assert.ok(Math.abs(sum-1)<2e-6,'weight sum '+i);
 if(difference>1e-6){changed++;maxChange=Math.max(maxChange,difference);assert.ok(xyz[1]>=.56&&xyz[1]<=1.20,'weight changed outside hip zone')}
 const key=xyz.join(','),prior=seams.get(key);if(prior)for(const id of new Set([...prior.keys(),...after.keys()]))assert.ok(Math.abs((prior.get(id)||0)-(after.get(id)||0))<2e-6,'unequal welded weight '+i);else seams.set(key,after);
}
assert.equal(changed,514);assert.ok(maxChange>.4&&maxChange<.6);console.log(`PASS: original rest geometry, 13 morphs, materials and 22-joint rig retained; ${changed} vertices locally reweighted (max ${(100*maxChange).toFixed(1)} percentage points); previous weights copied exactly; welded positions agree`);
const existing=old.listAnimations().map(a=>a.getName());assert.equal(existing.length,29);assert.deepEqual(now.listAnimations().map(a=>a.getName()),[...existing,'Reviewed_Walk','Reviewed_Run','Reviewed_Crouch_Idle','Reviewed_Crouch_Walk']);
for(const previous of old.listAnimations()){
 const next=clip(now,previous.getName()),x=previous.listChannels(),y=next.listChannels();assert.equal(x.length,y.length,previous.getName());
 for(let i=0;i<x.length;i++){const a=x[i],b=y[i],p=a.getSampler(),q=b.getSampler();assert.equal(a.getTargetNode().getName(),b.getTargetNode().getName());assert.equal(a.getTargetPath(),b.getTargetPath());assert.equal(p.getInterpolation(),q.getInterpolation());assert.equal(digest(p.getInput()),digest(q.getInput()));assert.equal(digest(p.getOutput()),digest(q.getOutput()),previous.getName()+' output')}
}
console.log('PASS: all 29 previous animation keys and morph channels are byte-identical; new skin only affects them outside the comparison viewer');
function channel(a,name,target){return a.listChannels().find(c=>c.getTargetNode().getName()===name&&c.getTargetPath()===target)}
for(const [oldName,newName] of [['Revised_Walk','Reviewed_Walk'],['Stealth_Crouch_Idle','Reviewed_Crouch_Idle'],['Stealth_Crouch_Walk','Reviewed_Crouch_Walk']]){
 const x=clip(now,oldName),y=clip(now,newName);assert.equal(x.listChannels().length,y.listChannels().length);
 for(const c of x.listChannels()){
  const n=c.getTargetNode().getName(),target=c.getTargetPath(),o=c.getSampler(),d=channel(y,n,target);assert.ok(d,newName+' missing '+n+'/'+target);const t=d.getSampler();assert.equal(digest(o.getInput()),digest(t.getInput()));
  if(n==='head_2'&&target==='weights'){
   const aa=o.getOutput().getArray(),bb=t.getOutput().getArray();assert.equal(aa.length,bb.length);
   for(let i=0;i<aa.length;i++)if(i%13===11||i%13===12)assert.equal(bb[i],0);else assert.ok(Math.abs(aa[i]-bb[i])<2e-6,`${newName} morph ${i}`);
  }else if(/^(Rig_Shoulder|Rig_UpperArm)_[LR]$/.test(n)&&target==='rotation')assert.notEqual(digest(o.getOutput()),digest(t.getOutput()),newName+' compensated shoulder/arm did not change');
  else assert.equal(digest(o.getOutput()),digest(t.getOutput()),`${newName} unexpectedly changed ${n}/${target}`);
 }
}
for(const [name,duration] of [['Reviewed_Walk',1],['Reviewed_Run',.7],['Reviewed_Crouch_Idle',2.4],['Reviewed_Crouch_Walk',1.6]]){
 const channels=clip(now,name).listChannels();assert.equal(channels.length,23);const keys=new Set();
 for(const c of channels){const target=c.getTargetPath(),key=c.getTargetNode().getName()+'/'+target,s=c.getSampler(),time=s.getInput(),v=s.getOutput().getArray();assert.ok(!keys.has(key));keys.add(key);assert.equal(s.getInterpolation(),'LINEAR');assert.equal(time.getCount(),121);assert.ok(Math.abs(time.getScalar(120)-duration)<1e-6);
  const width=target==='rotation'?4:target==='translation'?3:13;assert.equal(v.length,121*width);for(let k=0;k<width;k++)assert.ok(Math.abs(v[k]-v[120*width+k])<2e-6,key+' loop');
  for(const x of v)assert.ok(Number.isFinite(x));if(target==='rotation')for(let i=0;i<121;i++)assert.ok(Math.abs(Math.hypot(...v.subarray(4*i,4*i+4))-1)<1e-6,key+' quaternion');
 }
}
console.log('PASS: walk/crouch retain legs, torso, forearms and relaxed hands; four new cycles are finite and closed');
for(const [name,data] of [['source',source],['trial',generated]]){const report=await validate.validateBytes(new Uint8Array(data),{uri:name+'.glb'});assert.equal(report.issues.numErrors,0);assert.equal(report.issues.numWarnings,0);assert.equal(report.info.totalTriangleCount,32354);if(name==='trial')assert.equal(report.info.animationCount,33);console.log(`PASS glTF Validator ${name}: ${report.issues.numErrors} errors, ${report.issues.numWarnings} warnings, ${report.issues.numInfos} infos`)}
