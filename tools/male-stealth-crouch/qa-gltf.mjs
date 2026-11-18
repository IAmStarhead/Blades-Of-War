// Structural regression against the delivered walk/run GLB, plus validation.
// Does not establish artistic quality or guarantee every runtime's support.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.resolve(process.argv[2]||path.join(repo,'work/male-stealth-crouch'));
const validate=createRequire(path.join(repo,'tools/character-showcase/package.json'))('gltf-validator');
const hash=b=>createHash('sha256').update(b).digest('hex');
const source=await fs.readFile(path.join(repo,'work/male-full-body-motion/male_full_body_motion.glb'));
const generated=await fs.readFile(path.join(output,'male_stealth_crouch.glb'));
assert.equal(hash(source),'3fc6aecd2d60b85261f9604b514dc54ea6003329020fedb2adad76a1e0119fa5');
const io=new NodeIO(),[a,b]=await Promise.all([io.readBinary(source),io.readBinary(generated)]),old=a.getRoot(),now=b.getRoot();
const node=(r,n)=>{const x=r.listNodes().filter(v=>v.getName()===n);assert.equal(x.length,1,n);return x[0]};
const clip=(r,n)=>{const x=r.listAnimations().filter(v=>v.getName()===n);assert.equal(x.length,1,n);return x[0]};
const digest=x=>{const v=x.getArray();return hash(Buffer.from(v.buffer,v.byteOffset,v.byteLength))};
const material=m=>({name:m.getName(),base:m.getBaseColorFactor(),metal:m.getMetallicFactor(),rough:m.getRoughnessFactor(),double:m.getDoubleSided(),alpha:m.getAlphaMode(),cutoff:m.getAlphaCutoff(),emissive:m.getEmissiveFactor(),texture:m.getBaseColorTexture()?hash(m.getBaseColorTexture().getImage()):null});
assert.deepEqual(old.listMaterials().map(material),now.listMaterials().map(material));
assert.deepEqual(old.listTextures().map(t=>hash(t.getImage())),now.listTextures().map(t=>hash(t.getImage())));
const an=old.listNodes(),bn=now.listNodes();assert.deepEqual(an.map(n=>n.getName()),bn.map(n=>n.getName()));
for(let i=0;i<an.length;i++){
 assert.equal(an.indexOf(an[i].getParentNode()),bn.indexOf(bn[i].getParentNode()),an[i].getName());
 for(const get of ['getTranslation','getRotation','getScale'])assert.deepEqual(an[i][get](),bn[i][get](),an[i].getName()+' '+get);
}
const [s0,s1]=[old.listSkins()[0],now.listSkins()[0]];assert.equal(s0.listJoints().length,22);
assert.deepEqual(s0.listJoints().map(x=>x.getName()),s1.listJoints().map(x=>x.getName()));assert.equal(digest(s0.getInverseBindMatrices()),digest(s1.getInverseBindMatrices()));
for(const name of ['head_1','head_2','ear-makehuman-left','ear-makehuman-right']){
 const x=node(old,name).getMesh(),y=node(now,name).getMesh(),p=x.listPrimitives()[0],q=y.listPrimitives()[0];
 assert.equal(digest(p.getIndices()),digest(q.getIndices()),name+' indices');assert.deepEqual(p.listSemantics().sort(),q.listSemantics().sort());
 for(const semantic of p.listSemantics())assert.equal(digest(p.getAttribute(semantic)),digest(q.getAttribute(semantic)),`${name}/${semantic}`);
 const before=p.listTargets(),after=q.listTargets();assert.equal(after.length,before.length+(name==='head_2'?3:0));
 for(let i=0;i<before.length;i++){
  assert.deepEqual(before[i].listSemantics().sort(),after[i].listSemantics().sort());
  for(const semantic of before[i].listSemantics())assert.equal(digest(before[i].getAttribute(semantic)),digest(after[i].getAttribute(semantic)),name+' target '+i+'/'+semantic);
 }
 assert.deepEqual(x.getWeights(),y.getWeights().slice(0,x.getWeights().length));
 if(name==='head_2')assert.deepEqual(y.getWeights().slice(10),[0,0,0]);
}
console.log('PASS: source geometry, normals, skin weights, 22-joint hierarchy, transforms, materials and all ten existing body morphs are unchanged');
const existing=old.listAnimations().map(a=>a.getName());assert.equal(existing.length,23);
assert.deepEqual(now.listAnimations().map(a=>a.getName()),[...existing,'Revised_Walk','Revised_Run','Relaxed_Hands_Idle','Relaxed_Hands_Previous_Idle','Stealth_Crouch_Idle','Stealth_Crouch_Walk']);
for(const previous of old.listAnimations()){
 const next=clip(now,previous.getName()),x=previous.listChannels(),y=next.listChannels();assert.equal(x.length,y.length,previous.getName());
 for(let i=0;i<x.length;i++){
  const a=x[i],b=y[i],p=a.getSampler(),q=b.getSampler();
  assert.equal(a.getTargetNode().getName(),b.getTargetNode().getName());assert.equal(a.getTargetPath(),b.getTargetPath());
  assert.equal(p.getInterpolation(),q.getInterpolation());assert.equal(digest(p.getInput()),digest(q.getInput()));
  if(a.getTargetNode().getName()==='head_2'&&a.getTargetPath()==='weights'){
   const one=p.getOutput().getArray(),two=q.getOutput().getArray(),N=p.getInput().getCount();assert.equal(one.length,10*N);assert.equal(two.length,13*N);
   for(let k=0;k<N;k++){assert.deepEqual([...one.subarray(10*k,10*k+10)],[...two.subarray(13*k,13*k+10)]);assert.deepEqual([...two.subarray(13*k+10,13*k+13)],[0,0,0])}
  }else assert.equal(digest(p.getOutput()),digest(q.getOutput()),previous.getName()+' unchanged output');
 }
}
console.log('PASS: 23 previous clips preserved; old weight tracks are padded with three zeros');
for(const [previous,newer,hand] of [['Full_Body_Walk','Revised_Walk',.9],['Full_Body_Run','Revised_Run',1]]){
 const x=clip(now,previous).listChannels(),y=clip(now,newer).listChannels();assert.equal(x.length,y.length);
 for(let i=0;i<x.length;i++){
  const a=x[i],b=y[i],p=a.getSampler(),q=b.getSampler();assert.equal(a.getTargetNode().getName(),b.getTargetNode().getName());assert.equal(a.getTargetPath(),b.getTargetPath());assert.equal(digest(p.getInput()),digest(q.getInput()));
  if(a.getTargetNode().getName()==='head_2'&&a.getTargetPath()==='weights'){
   const old=p.getOutput().getArray(),v=q.getOutput().getArray();
   for(let j=0;j<p.getInput().getCount();j++){
    assert.deepEqual([...old.subarray(j*13,j*13+10)],[...v.subarray(j*13,j*13+10)]);assert.ok(Math.abs(v[j*13+10]-hand)<1e-6);
    for(let k=11;k<=12;k++)assert.ok(v[j*13+k]>=0&&v[j*13+k]<=1);
   }
  }else assert.equal(digest(p.getOutput()),digest(q.getOutput()),newer+' skeletal motion changed');
 }
}
console.log('PASS: revised walk/run keep the previous skeletal motion and add only hand/hip morph weights');
for(const [name,duration] of [['Stealth_Crouch_Idle',2.4],['Stealth_Crouch_Walk',1.6]]){
 const channels=clip(now,name).listChannels();assert.equal(channels.length,23);const paths=new Set();
 for(const c of channels){const name2=c.getTargetNode().getName(),target=c.getTargetPath(),s=c.getSampler(),time=s.getInput(),v=s.getOutput().getArray();
  const key=name2+'/'+target;assert.ok(!paths.has(key));paths.add(key);assert.equal(s.getInterpolation(),'LINEAR');assert.equal(time.getCount(),121);assert.equal(time.getScalar(0),0);assert.ok(Math.abs(time.getScalar(120)-duration)<1e-6);
  const width=target==='rotation'?4:target==='translation'?3:13;assert.equal(v.length,121*width);
  for(let j=0;j<width;j++)assert.ok(Math.abs(v[j]-v[120*width+j])<1e-6,key+' loop seam');
  for(const number of v)assert.ok(Number.isFinite(number));
  if(target==='rotation')for(let j=0;j<121;j++)assert.ok(Math.abs(Math.hypot(...v.subarray(4*j,4*j+4))-1)<1e-6,key+' quaternion');
 }
 for(const n of s1.listJoints().map(x=>x.getName()))assert.ok(paths.has(n+(n==='Rig_Root'?'/translation':'/rotation')));
 assert.ok(paths.has('head_2/weights'));
}
console.log('PASS: crouch idle and crouch walk each have a closed, finite 121-key cycle for all 22 joints');
const prim=node(now,'head_2').getMesh().listPrimitives()[0],pos=prim.getAttribute('POSITION'),j=prim.getAttribute('JOINTS_0'),w=prim.getAttribute('WEIGHTS_0'),jNames=s1.listJoints().map(x=>x.getName());
for(const [index,name] of [[10,'Relaxed_Hands'],[11,'Hip_Flex_L'],[12,'Hip_Flex_R']]){
 const target=prim.listTargets()[index];assert.equal(target.getName(),name);const d=target.getAttribute('POSITION');let changed=0,max=0;const seams=new Map();
 for(let i=0;i<pos.getCount();i++){
  const p=pos.getElement(i,[]),delta=d.getElement(i,[]),length=Math.hypot(...delta);max=Math.max(max,length);if(length>1e-7){changed++;
   if(index===10){assert.ok(p[1]<.87501&&Math.abs(p[0])>.18);let influence=0,ids=j.getElement(i,[]),weights=w.getElement(i,[]);for(let k=0;k<4;k++)if(jNames[ids[k]]==='Rig_Hand_'+(p[0]>0?'L':'R'))influence+=weights[k];assert.ok(influence>0)}
   else assert.ok(p[1]>=.55&&p[1]<=1.09&&((index===11?p[0]:-p[0])>=-.00601));
  }
  const key=p.join(','),prior=seams.get(key);if(prior)for(let k=0;k<3;k++)assert.ok(Math.abs(prior[k]-delta[k])<2e-6,name+' seam');else seams.set(key,delta);
 }
 assert.ok(changed>50&&max<.05,name+' unexpected displacement');console.log(`PASS ${name}: ${changed} selected vertices, max displacement ${(max*1000).toFixed(2)} mm; coincident vertices agree`);
}
for(const [name,data] of [['source',source],['trial',generated]]){
 const report=await validate.validateBytes(new Uint8Array(data),{uri:name+'.glb'});assert.equal(report.issues.numErrors,0);assert.equal(report.issues.numWarnings,0);assert.equal(report.info.totalTriangleCount,32354);
 if(name==='trial')assert.equal(report.info.animationCount,29);console.log(`PASS glTF Validator ${name}: ${report.issues.numErrors} errors, ${report.issues.numWarnings} warnings, ${report.issues.numInfos} infos`);
}
