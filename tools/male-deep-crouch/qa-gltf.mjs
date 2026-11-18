// Structural, old-key and animation regression against the actual last GLB.
// Passing validation or sampled IK checks is not artistic approval.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
import {Bone,Euler,Quaternion,Vector3} from 'three';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.resolve(process.argv[2]||path.join(repo,'work/male-deep-crouch'));
const validate=createRequire(path.join(repo,'tools/character-showcase/package.json'))('gltf-validator');
const hash=b=>createHash('sha256').update(b).digest('hex');
const source=await fs.readFile(path.join(repo,'work/male-leg-mechanics/male_leg_mechanics.glb'));
const generated=await fs.readFile(path.join(output,'male_deep_crouch.glb'));
assert.equal(hash(source),'cfee79f1f8f8d475366384447f1fcf8d3611cafd95e905a11fa44942b1249377');
const io=new NodeIO(),[a,b]=await Promise.all([io.readBinary(source),io.readBinary(generated)]),old=a.getRoot(),now=b.getRoot();
const node=(r,n)=>{const v=r.listNodes().filter(x=>x.getName()===n);assert.equal(v.length,1,n);return v[0]};
const clip=(r,n)=>{const v=r.listAnimations().filter(x=>x.getName()===n);assert.equal(v.length,1,n);return v[0]};
const digest=x=>{const v=x.getArray();return hash(Buffer.from(v.buffer,v.byteOffset,v.byteLength))};
const near=(x,y,t=1e-6)=>assert.ok(Math.abs(x-y)<t,`${x} != ${y} (tolerance ${t})`);
const mat=m=>({name:m.getName(),base:m.getBaseColorFactor(),metal:m.getMetallicFactor(),rough:m.getRoughnessFactor(),double:m.getDoubleSided(),alpha:m.getAlphaMode(),cutoff:m.getAlphaCutoff(),emissive:m.getEmissiveFactor(),texture:m.getBaseColorTexture()?hash(m.getBaseColorTexture().getImage()):null});
assert.deepEqual(old.listMaterials().map(mat),now.listMaterials().map(mat));
assert.deepEqual(old.listTextures().map(t=>hash(t.getImage())),now.listTextures().map(t=>hash(t.getImage())));
const an=old.listNodes(),bn=now.listNodes();assert.deepEqual(an.map(n=>n.getName()),bn.map(n=>n.getName()));
for(let i=0;i<an.length;i++){
 const x=an[i],y=bn[i];assert.equal(an.indexOf(x.getParentNode()),bn.indexOf(y.getParentNode()),x.getName()+' parent');
 assert.deepEqual(x.getTranslation(),y.getTranslation(),x.getName()+' translation');assert.deepEqual(x.getRotation(),y.getRotation(),x.getName()+' rotation');assert.deepEqual(x.getScale(),y.getScale(),x.getName()+' scale');
}
const s0=old.listSkins()[0],s1=now.listSkins()[0];assert.equal(s1.listJoints().length,22);
assert.deepEqual(s0.listJoints().map(n=>n.getName()),s1.listJoints().map(n=>n.getName()));assert.equal(digest(s0.getInverseBindMatrices()),digest(s1.getInverseBindMatrices()));
for(const name of ['head_1','head_2','ear-makehuman-left','ear-makehuman-right']){
 const x=node(old,name).getMesh(),y=node(now,name).getMesh(),p=x.listPrimitives()[0],q=y.listPrimitives()[0];
 assert.equal(digest(p.getIndices()),digest(q.getIndices()),name+' topology');
 for(const semantic of p.listSemantics())if(name!=='head_2'||!['POSITION','NORMAL'].includes(semantic))assert.equal(digest(p.getAttribute(semantic)),digest(q.getAttribute(semantic)),name+'/'+semantic);
 const before=p.listTargets(),after=q.listTargets();assert.equal(after.length,before.length+(name==='head_2'?3:0));
 assert.deepEqual(y.getWeights(),[...x.getWeights(),...(name==='head_2'?[0,0,0]:[])]);
 for(let i=0;i<before.length;i++){
  assert.equal(before[i].getName(),after[i].getName());assert.deepEqual(before[i].listSemantics().sort(),after[i].listSemantics().sort());
  for(const sem of before[i].listSemantics())assert.equal(digest(before[i].getAttribute(sem)),digest(after[i].getAttribute(sem)),name+' target '+i+'/'+sem);
 }
}
const p=node(old,'head_2').getMesh().listPrimitives()[0],q=node(now,'head_2').getMesh().listPrimitives()[0];
assert.equal(digest(p.getAttribute('POSITION')),digest(q.getAttribute('_REFERENCE_POSITION')));
assert.equal(digest(p.getAttribute('NORMAL')),digest(q.getAttribute('_REFERENCE_NORMAL')));
assert.deepEqual(q.listTargets().slice(13).map(t=>t.getName()),['Deep_Hip_L','Deep_Hip_R','Deep_Knee_Fold']);
const pos0=p.getAttribute('POSITION'),normal0=p.getAttribute('NORMAL'),pos=q.getAttribute('POSITION'),normal=q.getAttribute('NORMAL'),shapes=q.listTargets().slice(13),seams=new Map(),normalSeams=new Map();
let changed=0,maxDelta=0,welds=0,maxSeam=0,maxNormalSeam=0;
for(let i=0;i<pos.getCount();i++){
 const original=pos0.getElement(i,[]),xyz=pos.getElement(i,[]),n=normal.getElement(i,[]),delta=Math.hypot(...xyz.map((x,k)=>x-original[k]));
 for(const v of [...original,...xyz,...n])assert.ok(Number.isFinite(v));near(Math.hypot(...n),1,2e-5);
 if(delta>1e-7)changed++;maxDelta=Math.max(maxDelta,delta);
 const vals=xyz.concat(shapes.flatMap(t=>t.getAttribute('POSITION').getElement(i,[]))),key=original.map(x=>Math.round(x*1e6)).join(',');
 const previous=seams.get(key);if(previous){welds++;for(let j=0;j<vals.length;j++)maxSeam=Math.max(maxSeam,Math.abs(vals[j]-previous[j]))}else seams.set(key,vals);
 // Distinct authored smoothing groups are allowed. For duplicates that also
 // share a source normal, base and corrective normals must stay coincident.
 const nk=key+','+normal0.getElement(i,[]).map(x=>Math.round(x*1e6)).join(','),nv=n.concat(shapes.flatMap(t=>t.getAttribute('NORMAL').getElement(i,[]))),prior=normalSeams.get(nk);
 if(prior)for(let j=0;j<nv.length;j++)maxNormalSeam=Math.max(maxNormalSeam,Math.abs(nv[j]-prior[j]));else normalSeams.set(nk,nv);
}
for(const target of shapes){
 assert.deepEqual(target.listSemantics().sort(),['NORMAL','POSITION']);
 for(const sem of target.listSemantics())for(const value of target.getAttribute(sem).getArray())assert.ok(Number.isFinite(value));
}
assert.ok(changed>900&&changed<1000&&maxDelta>.05&&maxDelta<.07,`unexpected sculpt ${changed} ${maxDelta}`);
assert.ok(welds>900&&maxSeam<2e-5&&maxNormalSeam<2e-5,`split seam position/normal difference ${maxSeam}/${maxNormalSeam}; ${welds} coincident vertices`);
console.log(`PASS: delivered topology, 22-bone bind/weights, old morphs/materials and comparison surface preserved; ${changed} sculpted vertices, max ${(1000*maxDelta).toFixed(2)} mm; seam delta ${(1000*maxSeam).toFixed(4)} mm, normal delta ${maxNormalSeam}`);

const names=['Trial_Idle_Soft','Trial_Idle_Old','Trial_Walk','Trial_Run','Deep_Crouch_Idle','Deep_Crouch_Walk'];
assert.equal(old.listAnimations().length,37);assert.deepEqual(now.listAnimations().map(x=>x.getName()),[...old.listAnimations().map(x=>x.getName()),...names]);
let morphKeys=0;
for(const previous of old.listAnimations()){
 const next=clip(now,previous.getName()),x=previous.listChannels(),y=next.listChannels();assert.equal(x.length,y.length,previous.getName());
 for(let i=0;i<x.length;i++){
  const ca=x[i],cb=y[i],sa=ca.getSampler(),sb=cb.getSampler(),target=ca.getTargetPath();
  assert.equal(ca.getTargetNode().getName(),cb.getTargetNode().getName());assert.equal(target,cb.getTargetPath());assert.equal(sa.getInterpolation(),sb.getInterpolation());assert.equal(digest(sa.getInput()),digest(sb.getInput()));
  if(target==='weights'&&ca.getTargetNode().getName()==='head_2'){
   const before=sa.getOutput().getArray(),after=sb.getOutput().getArray(),n=sa.getInput().getCount();assert.equal(before.length,n*13);assert.equal(after.length,n*16);
   for(let k=0;k<n;k++){for(let j=0;j<13;j++)assert.equal(before[k*13+j],after[k*16+j]);for(let j=13;j<16;j++)assert.equal(after[k*16+j],0)}morphKeys+=n;
  }else assert.equal(digest(sa.getOutput()),digest(sb.getOutput()),previous.getName()+' '+target+' output');
 }
}
console.log(`PASS: all 37 original animations retained; ${morphKeys} old morph keys keep their 13 values plus three zero weights`);

for(const name of names){
 const c=clip(now,name);
 for(const channel of c.listChannels()){
  const sampler=channel.getSampler(),input=sampler.getInput(),values=sampler.getOutput().getArray(),N=input.getCount(),target=channel.getTargetPath(),width=target==='rotation'?4:target==='weights'?16:3;
  assert.equal(sampler.getInterpolation(),'LINEAR');assert.equal(values.length,N*width);for(const value of values)assert.ok(Number.isFinite(value));
  for(let i=0;i<width;i++)near(values[i],values[(N-1)*width+i],2e-6);
  if(target==='rotation')for(let i=0;i<N;i++)near(Math.hypot(...values.subarray(i*4,i*4+4)),1,2e-6);
  if(target==='weights'&&name.startsWith('Deep_'))for(let i=0;i<N;i++){
   for(const [side,j] of [['L',13],['R',14]]){
    const rotation=c.listChannels().find(ch=>ch.getTargetNode().getName()==='Rig_Thigh_'+side&&ch.getTargetPath()==='rotation').getSampler().getOutput().getElement(i,[]);
    const angle=-new Euler().setFromQuaternion(new Quaternion().fromArray(rotation),'XYZ').x*180/Math.PI,x=Math.max(0,Math.min(1,(angle-35)/40));
    near(values[i*16+j],x*x*(3-2*x),2e-6);
   }
   near(values[i*16+15],1);
  }
  if(target==='weights'&&['Trial_Walk','Trial_Run'].includes(name))for(let i=0;i<N;i++){
   assert.ok(values[i*16+13]>=0&&values[i*16+13]<=.500001&&values[i*16+14]>=0&&values[i*16+14]<=.500001);near(values[i*16+15],0);
  }
 }
}
// Normals are normalized by the shader after morphing. Check that the authored
// combinations remain finite and non-degenerate before that normalization.
const baseNormals=normal.getArray(),normalTargets=q.listTargets().map(t=>t.getAttribute('NORMAL').getArray());let minNormal=Infinity,maxNormal=0;
for(const name of ['Trial_Walk','Trial_Run','Deep_Crouch_Idle','Deep_Crouch_Walk']){
 const c=clip(now,name),track=c.listChannels().find(c=>c.getTargetNode().getName()==='head_2'&&c.getTargetPath()==='weights'),w=track.getSampler().getOutput().getArray(),N=track.getSampler().getInput().getCount();
 for(let k=0;k<N;k++)for(let i=0;i<baseNormals.length;i+=3){
  let x=baseNormals[i],y=baseNormals[i+1],z=baseNormals[i+2];for(let j=0;j<16;j++)if(w[k*16+j]){x+=w[k*16+j]*normalTargets[j][i];y+=w[k*16+j]*normalTargets[j][i+1];z+=w[k*16+j]*normalTargets[j][i+2]}
  const length=Math.hypot(x,y,z);assert.ok(Number.isFinite(length));minNormal=Math.min(minNormal,length);maxNormal=Math.max(maxNormal,length);
 }
}
assert.ok(minNormal>.8&&maxNormal<1.2,`degenerate combined morph normal ${minNormal}/${maxNormal}`);
console.log(`PASS: combined morph normals at authored motion keys stay finite and non-degenerate (${minNormal.toFixed(4)}–${maxNormal.toFixed(4)} before normalization)`);
// Reconstruct the unmodified skeleton and independently evaluate all key poses.
const rig=new Map();for(const n of s1.listJoints()){const bone=new Bone();bone.name=n.getName();bone.position.fromArray(n.getTranslation());bone.quaternion.fromArray(n.getRotation());bone.scale.fromArray(n.getScale());rig.set(bone.name,bone)}
for(const n of s1.listJoints()){const parent=n.getParentNode()?.getName();if(rig.has(parent))rig.get(parent).add(rig.get(n.getName()))}
const root=rig.get('Rig_Root');function pose(c,i){
 for(const n of s1.listJoints()){const bone=rig.get(n.getName());bone.position.fromArray(n.getTranslation());bone.quaternion.fromArray(n.getRotation());bone.scale.fromArray(n.getScale())}
 for(const channel of c.listChannels()){
  const n=channel.getTargetNode().getName(),bone=rig.get(n),target=channel.getTargetPath();if(!bone)continue;
  const value=channel.getSampler().getOutput().getElement(i,[]);if(target==='translation')bone.position.fromArray(value);if(target==='rotation')bone.quaternion.fromArray(value);if(target==='scale')bone.scale.fromArray(value);
 }
 root.updateMatrixWorld(true);return {root:root.position.clone(),feet:['L','R'].map(s=>{const foot=rig.get('Rig_Foot_'+s);return {p:foot.getWorldPosition(new Vector3()),q:foot.getWorldQuaternion(new Quaternion())}})};
}
let maxAnkle=0,maxAngle=0;
for(const [reference,deep] of [['Leg_Refined_Crouch_Idle','Deep_Crouch_Idle'],['Leg_Refined_Crouch_Walk','Deep_Crouch_Walk']]){
 const first=clip(now,reference),second=clip(now,deep);
 for(let i=0;i<121;i++){
  const x=pose(first,i),y=pose(second,i);near(y.root.y,x.root.y-.16);near(y.root.z,x.root.z-.032);
  for(let k=0;k<2;k++){maxAnkle=Math.max(maxAnkle,x.feet[k].p.distanceTo(y.feet[k].p));maxAngle=Math.max(maxAngle,x.feet[k].q.angleTo(y.feet[k].q))}
 }
}
assert.ok(maxAnkle<1e-5&&maxAngle<.001,`authored ankle/foot target mismatch ${maxAnkle}/${maxAngle}`);
console.log(`PASS: six finite closed trial clips; 242 deep-crouch keys preserve ankle targets within ${(1000*maxAnkle).toFixed(5)} mm and foot orientation within ${(maxAngle*180/Math.PI).toFixed(5)}°`);
for(const [name,data] of [['source',source],['trial',generated]]){
 const report=await validate.validateBytes(new Uint8Array(data),{uri:name+'.glb'});assert.equal(report.issues.numErrors,0);assert.equal(report.issues.numWarnings,0);assert.equal(report.info.totalTriangleCount,32354);
 assert.equal(report.info.animationCount,name==='source'?37:43);
 console.log(`PASS glTF Validator ${name}: ${report.issues.numErrors} errors, ${report.issues.numWarnings} warnings, ${report.issues.numInfos} informational messages`);
}
