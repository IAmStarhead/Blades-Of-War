// Structural regression: the last model and all its clips are preserved;
// only four zero-default local targets and two new comparison clips are added.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.resolve(process.argv[2]||path.join(repo,'work/male-belly-triceps'));
const validator=createRequire(path.join(repo,'tools/character-showcase/package.json'))('gltf-validator');
const hash=b=>createHash('sha256').update(b).digest('hex');
const source=await fs.readFile(path.join(repo,'work/male-locomotion-correction/male_locomotion_corrected.glb'));
const generated=await fs.readFile(path.join(output,'male_belly_triceps.glb'));
assert.equal(hash(source),'ed3c99b191e4f8f4cfd2f69bea0584b23faa12da9d2e9128f4842d9419328382');
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
  for(const semantic of before[i].listSemantics())assert.equal(digest(before[i].getAttribute(semantic)),digest(after[i].getAttribute(semantic)),name+' previous morph '+semantic);
 }
 if(name==='head_2'){
  assert.deepEqual(y.getMesh().getWeights(),[...x.getMesh().getWeights(),0,0,0,0]);const positions=q.getAttribute('POSITION');
  for(let j=0;j<4;j++){
   const target=after[before.length+j],pos=target.getAttribute('POSITION'),norm=target.getAttribute('NORMAL');let count=0,max=0;
   assert.deepEqual(target.listSemantics().sort(),['NORMAL','POSITION']);
   for(let i=0;i<pos.getCount();i++){
    const d=pos.getElement(i,[]),n=norm.getElement(i,[]),amount=Math.hypot(...d),p=positions.getElement(i,[]);max=Math.max(max,amount);
    if(amount>1e-7){count++;if(j<3)assert.ok(p[1]>.87&&p[1]<1.22,`belly target outside band: ${p}`);
     else assert.ok(p[1]>1.02&&p[1]<1.49&&Math.abs(p[0])>.13,`arm target outside band: ${p}`)}
    if(Math.hypot(...n)>1e-7)assert.ok(p[1]<1.52,`target normal touches neck/head: ${p}`);
   }
   assert.ok(count>100&&max<(j<3?.035:.008),`unexpected new corrective ${j}: ${count}/${max}`);
  }
 }else{assert.deepEqual(x.getMesh().getWeights(),y.getMesh().getWeights());assert.deepEqual(x.getMesh().getExtras(),y.getMesh().getExtras())}
}
function glbJSON(bytes){return JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'))}
const j0=glbJSON(source),j1=glbJSON(generated),oldBody=j0.meshes[j0.nodes.find(n=>n.name==='head_2').mesh],newBody=j1.meshes[j1.nodes.find(n=>n.name==='head_2').mesh];
assert.deepEqual(newBody.extras.targetNames,[...oldBody.extras.targetNames,'Belly_Stabilizer_1','Belly_Stabilizer_2','Belly_Stabilizer_3','Run_Posterior_UpperArms']);
console.log('PASS: prior base geometry, normals, skin, bind skeleton, materials, ears and six existing morphs match; four new zero-default targets are localized');
const find=(r,n)=>{const list=r.listAnimations().filter(x=>x.getName()===n);assert.equal(list.length,1,n);return list[0]};
const oldNames=old.listAnimations().map(a=>a.getName());assert.equal(oldNames.length,16);
assert.deepEqual(now.listAnimations().map(a=>a.getName()),[...oldNames,'Adjusted_Walk','Adjusted_Run']);
let padded=0;
for(const previous of old.listAnimations()){
 const name=previous.getName(),next=find(now,name),ac=previous.listChannels(),bc=next.listChannels();assert.equal(ac.length,bc.length,name);
 for(let i=0;i<ac.length;i++){
  const x=ac[i],y=bc[i],p=x.getSampler(),q=y.getSampler();
  assert.equal(x.getTargetNode().getName(),y.getTargetNode().getName(),name);assert.equal(x.getTargetPath(),y.getTargetPath(),name);
  assert.equal(p.getInterpolation(),q.getInterpolation(),name);assert.equal(digest(p.getInput()),digest(q.getInput()),name+' times');
  if(x.getTargetPath()==='weights'&&x.getTargetNode().getName()==='head_2'){
   const before=p.getOutput().getArray(),after=q.getOutput().getArray();assert.equal(after.length,before.length/6*10);
   for(let k=0;k<before.length/6;k++)assert.deepEqual(Array.from(after.slice(k*10,k*10+10)),[...before.slice(k*6,k*6+6),0,0,0,0]);padded++;
  }else assert.equal(digest(p.getOutput()),digest(q.getOutput()),name+' keys');
 }
}
assert.equal(padded,3);console.log('PASS: all 16 previous animation channels retained, with four zeroes padded to three old body-weight tracks');
for(const [original,changed,duration] of [['Corrected_Walk','Adjusted_Walk',1],['Corrected_Run','Adjusted_Run',.75]]){
 const sourceClip=find(now,original),newClip=find(now,changed),aa=sourceClip.listChannels(),bb=newClip.listChannels();assert.equal(aa.length,17);assert.equal(bb.length,aa.length);
 let weightChecked=false;
 for(let i=0;i<aa.length;i++){
  const x=aa[i],y=bb[i],p=x.getSampler(),q=y.getSampler(),n=q.getInput().getCount();
  assert.equal(x.getTargetNode().getName(),y.getTargetNode().getName(),changed);assert.equal(x.getTargetPath(),y.getTargetPath(),changed);
  assert.equal(p.getInterpolation(),q.getInterpolation());assert.equal(digest(p.getInput()),digest(q.getInput()));
  assert.equal(q.getInput().getScalar(0),0);assert.ok(Math.abs(q.getInput().getScalar(n-1)-duration)<1e-6);
  for(let k=1;k<n;k++)assert.ok(q.getInput().getScalar(k)>q.getInput().getScalar(k-1));
  if(y.getTargetPath()==='weights'){
   const old=p.getOutput().getArray(),values=q.getOutput().getArray();assert.equal(values.length,n*10);let active=0;
   for(let k=0;k<n;k++){
    assert.deepEqual(Array.from(values.slice(k*10,k*10+6)),Array.from(old.slice(k*10,k*10+6)));
    for(let t=0;t<10;t++)assert.ok(Number.isFinite(values[k*10+t]));
    if(changed==='Adjusted_Walk'){
     assert.equal(values[k*10+9],0);for(let t=6;t<9;t++){assert.ok(Math.abs(values[k*10+t])<=1.000001);active+=Math.abs(values[k*10+t])}
    }else assert.deepEqual(Array.from(values.slice(k*10+6,k*10+10)),[0,0,0,1]);
   }
   if(changed==='Adjusted_Walk')assert.ok(active>10,'abdomen weights did not activate');
   for(let t=0;t<10;t++)assert.ok(Math.abs(values[t]-values[(n-1)*10+t])<1e-6,changed+' morph loop seam');
   weightChecked=true;
  }else assert.equal(digest(p.getOutput()),digest(q.getOutput()),changed+' changed skeletal motion');
 }
 assert.ok(weightChecked,changed+' weight track missing');
}
console.log('PASS: new cycles preserve every original bone key and the first six morph channels; new morphs activate only in their intended cycle');
for(const [name,data] of [['source',source],['trial',generated]]){
 const report=await validator.validateBytes(new Uint8Array(data),{uri:name+'.glb'});
 assert.equal(report.issues.numErrors,0);assert.equal(report.issues.numWarnings,0);assert.equal(report.info.totalTriangleCount,32354);
 if(name==='trial')assert.equal(report.info.animationCount,18);
 console.log(`PASS glTF Validator ${name}: ${report.issues.numErrors} errors, ${report.issues.numWarnings} warnings, ${report.issues.numInfos} infos`);
}
