// Structural and animation regression against the exact previous delivery.
// Geometric sampling/validation is not a substitute for visual approval.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.resolve(process.argv[2]||path.join(root,'work/male-library-motion'));
const validator=createRequire(path.join(root,'tools/character-showcase/package.json'))('gltf-validator');
const hash=b=>createHash('sha256').update(b).digest('hex'),digest=a=>{const v=a.getArray();return hash(Buffer.from(v.buffer,v.byteOffset,v.byteLength))};
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b} (tol ${t})`);
const oldBytes=await fs.readFile(path.join(root,'work/male-deep-crouch/male_deep_crouch.glb'));
assert.equal(hash(oldBytes),'6375e7980e1b7119d9245a9796854dd8d52ae7272ad3f6a0473f59a2f561f0ca');
const newBytes=await fs.readFile(path.join(output,'male_library_motion.glb'));
const io=new NodeIO(),[before,after]=await Promise.all([io.readBinary(oldBytes),io.readBinary(newBytes)]),a=before.getRoot(),b=after.getRoot();
const node=(r,n)=>{const list=r.listNodes().filter(x=>x.getName()===n);assert.equal(list.length,1,n);return list[0]};
const clip=(r,n)=>{const list=r.listAnimations().filter(x=>x.getName()===n);assert.equal(list.length,1,n);return list[0]};
const A=a.listNodes(),B=b.listNodes();assert.deepEqual(A.map(x=>x.getName()),B.map(x=>x.getName()));
for(let i=0;i<A.length;i++){
 const x=A[i],y=B[i];assert.equal(A.indexOf(x.getParentNode()),B.indexOf(y.getParentNode()));
 assert.deepEqual(x.getTranslation(),y.getTranslation(),x.getName()+' bind translation');
 assert.deepEqual(x.getRotation(),y.getRotation(),x.getName()+' bind rotation');
 assert.deepEqual(x.getScale(),y.getScale(),x.getName()+' bind scale');
}
const s=a.listSkins()[0],t=b.listSkins()[0];assert.equal(t.listJoints().length,22);
assert.deepEqual(s.listJoints().map(x=>x.getName()),t.listJoints().map(x=>x.getName()));assert.equal(digest(s.getInverseBindMatrices()),digest(t.getInverseBindMatrices()));
assert.deepEqual(a.listTextures().map(x=>hash(x.getImage())),b.listTextures().map(x=>hash(x.getImage())));
for(const name of ['head_1','head_2','ear-makehuman-left','ear-makehuman-right']){
 const x=node(a,name).getMesh(),y=node(b,name).getMesh(),p=x.listPrimitives()[0],q=y.listPrimitives()[0];
 assert.equal(digest(p.getIndices()),digest(q.getIndices()),name+' topology');
 const changed=['POSITION','NORMAL','JOINTS_0','WEIGHTS_0'];
 for(const semantic of p.listSemantics())if(name!=='head_2'||!changed.includes(semantic))assert.equal(digest(p.getAttribute(semantic)),digest(q.getAttribute(semantic)),name+'/'+semantic);
 if(name==='head_2')for(const [old,now] of [['POSITION','_LIBRARY_OLD_POSITION'],['NORMAL','_LIBRARY_OLD_NORMAL'],['JOINTS_0','_LIBRARY_OLD_JOINTS'],['WEIGHTS_0','_LIBRARY_OLD_WEIGHTS']])assert.equal(digest(p.getAttribute(old)),digest(q.getAttribute(now)),old+' previous comparison');
 const pt=p.listTargets(),qt=q.listTargets();assert.equal(qt.length,pt.length+(name==='head_2'?4:0));
 assert.deepEqual(y.getWeights(),[...x.getWeights(),...(name==='head_2'?[0,0,0,0]:[])]);
 for(let i=0;i<pt.length;i++){assert.equal(pt[i].getName(),qt[i].getName());for(const sem of pt[i].listSemantics())assert.equal(digest(pt[i].getAttribute(sem)),digest(qt[i].getAttribute(sem)),name+' target '+i+'/'+sem)}
}
const q=node(b,'head_2').getMesh().listPrimitives()[0],p=q.getAttribute('POSITION'),n=q.getAttribute('NORMAL'),j=q.getAttribute('JOINTS_0'),w=q.getAttribute('WEIGHTS_0');
assert.deepEqual(q.listTargets().slice(16).map(x=>x.getName()),['Library_Hip_L','Library_Hip_R','Library_Knee_L','Library_Knee_R']);
const oldPosition=node(a,'head_2').getMesh().listPrimitives()[0].getAttribute('POSITION'),welds=new Map();let duplicates=0,maxSeam=0;
for(let i=0;i<p.getCount();i++){
 const v=p.getElement(i,[]),nv=n.getElement(i,[]),weights=w.getElement(i,[]),ids=j.getElement(i,[]);for(const z of [...v,...nv,...weights,...ids])assert.ok(Number.isFinite(z));
 near(Math.hypot(...nv),1,2e-5);near(weights.reduce((x,y)=>x+y,0),1,2e-5);for(const id of ids)assert.ok(id>=0&&id<22);
 const key=oldPosition.getElement(i,[]).map(x=>Math.round(x*1e6)).join(','),values=[...v,...q.listTargets().slice(16).flatMap(x=>x.getAttribute('POSITION').getElement(i,[]))],prior=welds.get(key);
 if(prior){duplicates++;for(let k=0;k<values.length;k++)maxSeam=Math.max(maxSeam,Math.abs(values[k]-prior[k]))}else welds.set(key,values);
}
assert.ok(duplicates>900&&maxSeam<2e-5,`split position/morph seam ${maxSeam}`);
console.log(`PASS: 22-bone bind and inverse binds, topology, textures, all earlier morphs and exact previous surface/weights preserved; ${duplicates} coincident seam pairs`);
assert.equal(a.listAnimations().length,43);assert.deepEqual(b.listAnimations().map(x=>x.getName()),[...a.listAnimations().map(x=>x.getName()),'Library_Idle','Library_Walk','Library_Run']);
let morphKeys=0;
for(const old of a.listAnimations()){
 const next=clip(b,old.getName()),x=old.listChannels(),y=next.listChannels();assert.equal(x.length,y.length,old.getName());
 for(let i=0;i<x.length;i++){
  const ca=x[i],cb=y[i],sa=ca.getSampler(),sb=cb.getSampler(),target=ca.getTargetPath();
  assert.equal(ca.getTargetNode().getName(),cb.getTargetNode().getName());assert.equal(target,cb.getTargetPath());assert.equal(sa.getInterpolation(),sb.getInterpolation());assert.equal(digest(sa.getInput()),digest(sb.getInput()));
  if(target==='weights'&&ca.getTargetNode().getName()==='head_2'){
   const va=sa.getOutput().getArray(),vb=sb.getOutput().getArray(),count=sa.getInput().getCount();assert.equal(va.length,count*16);assert.equal(vb.length,count*20);
   for(let k=0;k<count;k++){for(let h=0;h<16;h++)assert.equal(va[k*16+h],vb[k*20+h]);for(let h=16;h<20;h++)assert.equal(vb[k*20+h],0)}morphKeys+=count;
  }else assert.equal(digest(sa.getOutput()),digest(sb.getOutput()),old.getName()+' '+target+' output');
 }
}
for(const name of ['Library_Idle','Library_Walk','Library_Run']){
 const c=clip(b,name);for(const channel of c.listChannels()){
  const sampler=channel.getSampler(),input=sampler.getInput(),out=sampler.getOutput().getArray(),N=input.getCount(),kind=channel.getTargetPath(),width=kind==='rotation'?4:kind==='weights'?20:3;
  assert.equal(sampler.getInterpolation(),'LINEAR');assert.equal(out.length,N*width);for(const value of out)assert.ok(Number.isFinite(value));
  for(let i=0;i<width;i++)near(out[i],out[(N-1)*width+i],2e-6);
  if(kind==='rotation')for(let i=0;i<N;i++)near(Math.hypot(...out.subarray(i*4,i*4+4)),1,2e-6);
 }
}
console.log(`PASS: all 43 previous clips retained, ${morphKeys} morph keys padded with zeros; 3 finite, closed library cycles`);
const baseNormals=n.getArray(),targets=q.listTargets().map(x=>x.getAttribute('NORMAL').getArray());let minNormal=Infinity,maxNormal=0;
for(const name of ['Library_Walk','Library_Run']){const c=clip(b,name),channel=c.listChannels().find(x=>x.getTargetNode().getName()==='head_2'&&x.getTargetPath()==='weights'),values=channel.getSampler().getOutput().getArray(),frames=channel.getSampler().getInput().getCount();
 for(let f=0;f<frames;f++)for(let i=0;i<baseNormals.length;i+=3){let x=baseNormals[i],y=baseNormals[i+1],z=baseNormals[i+2];for(let k=0;k<20;k++)if(values[f*20+k]){x+=values[f*20+k]*targets[k][i];y+=values[f*20+k]*targets[k][i+1];z+=values[f*20+k]*targets[k][i+2]}const length=Math.hypot(x,y,z);assert.ok(Number.isFinite(length));minNormal=Math.min(minNormal,length);maxNormal=Math.max(maxNormal,length)}
}
assert.ok(minNormal>.7&&maxNormal<1.3,`degenerate combined morph normals ${minNormal}/${maxNormal}`);console.log(`PASS: combined keyframe normals remain finite, length ${minNormal.toFixed(4)}–${maxNormal.toFixed(4)} before shader normalization`);
for(const [name,data,expected] of [['previous',oldBytes,43],['trial',newBytes,46]]){
 const r=await validator.validateBytes(new Uint8Array(data),{uri:name+'.glb'});assert.equal(r.issues.numErrors,0);assert.equal(r.issues.numWarnings,0);assert.equal(r.info.animationCount,expected);
 console.log(`PASS glTF Validator ${name}: ${r.issues.numErrors} errors, ${r.issues.numWarnings} warnings, ${r.issues.numInfos} informational messages`);
}
