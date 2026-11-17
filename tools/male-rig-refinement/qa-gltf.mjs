// Verify the previous approved clips, unchanged base geometry and separate
// trial correction, then run Khronos glTF Validator.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const output=path.resolve(process.argv[2]||path.join(root,'work/male-rig-refinement'));
const require=createRequire(path.join(root,'tools/character-showcase/package.json'));
const validator=require('gltf-validator'),sha=b=>createHash('sha256').update(b).digest('hex');
const source=await fs.readFile(path.join(root,'work/male-rig-trial/male_rig_trial.glb'));
const refined=await fs.readFile(path.join(output,'male_motion_refinement.glb'));
assert.equal(sha(source),'9d9ee4719111f932573f098b97ee7d55c8357db0e730ba4a8883862a10985bea');
const io=new NodeIO(),[a,b]=await Promise.all([io.readBinary(source),io.readBinary(refined)]),old=a.getRoot(),now=b.getRoot();
const node=(r,n)=>{const m=r.listNodes().filter(x=>x.getName()===n);assert.equal(m.length,1,n);return m[0]};
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
const hashAccessor=a=>sha(bytes(a.getArray()));
const material=m=>({name:m.getName(),base:m.getBaseColorFactor(),metal:m.getMetallicFactor(),rough:m.getRoughnessFactor(),
 double:m.getDoubleSided(),alpha:m.getAlphaMode(),cutoff:m.getAlphaCutoff(),emissive:m.getEmissiveFactor(),
 texture:m.getBaseColorTexture()?sha(m.getBaseColorTexture().getImage()):null});
assert.deepEqual(old.listMaterials().map(material),now.listMaterials().map(material));
assert.deepEqual(old.listTextures().map(t=>sha(t.getImage())),now.listTextures().map(t=>sha(t.getImage())));
const [oldSkin,newSkin]=[old.listSkins()[0],now.listSkins()[0]];
assert.equal(old.listSkins().length,1);assert.equal(now.listSkins().length,1);assert.equal(newSkin.listJoints().length,22);
assert.deepEqual(oldSkin.listJoints().map(j=>j.getName()),newSkin.listJoints().map(j=>j.getName()));
assert.equal(hashAccessor(oldSkin.getInverseBindMatrices()),hashAccessor(newSkin.getInverseBindMatrices()));
for(const name of oldSkin.listJoints().map(j=>j.getName())){
 const x=node(old,name),y=node(now,name);assert.equal(x.getParentNode()?.getName(),y.getParentNode()?.getName(),`${name} parent`);
 assert.deepEqual(x.getTranslation(),y.getTranslation());assert.deepEqual(x.getRotation(),y.getRotation());assert.deepEqual(x.getScale(),y.getScale());
}
for(const name of ['head_1','head_2','ear-makehuman-left','ear-makehuman-right']){
 const x=node(old,name),y=node(now,name),p=x.getMesh().listPrimitives()[0],q=y.getMesh().listPrimitives()[0];
 assert.equal(hashAccessor(p.getIndices()),hashAccessor(q.getIndices()),name+' indices');
 assert.deepEqual(p.listSemantics().sort(),q.listSemantics().sort());
 for(const semantic of p.listSemantics()){
  const s=p.getAttribute(semantic),t=q.getAttribute(semantic);assert.equal(s.getCount(),t.getCount());
  assert.equal(s.getComponentType(),t.getComponentType());assert.equal(s.getNormalized(),t.getNormalized());
  assert.equal(hashAccessor(s),hashAccessor(t),`${name}/${semantic}`);
 }
 x.getWorldMatrix().forEach((v,i)=>assert.ok(Math.abs(v-y.getWorldMatrix()[i])<1e-7,`${name} bind world`));
 assert.equal(p.listTargets().length,0);assert.equal(q.listTargets().length,name==='head_2'?1:0);
}
console.log('PASS: base positions, normals, UVs, indices, weights, bones, bind matrices, materials and textures unchanged');
const body=node(now,'head_2'),primitive=body.getMesh().listPrimitives()[0],target=primitive.listTargets()[0];
assert.deepEqual(body.getMesh().getWeights(),[0]);assert.deepEqual(target.listSemantics().sort(),['NORMAL','POSITION']);
const position=primitive.getAttribute('POSITION'),delta=target.getAttribute('POSITION'),nd=target.getAttribute('NORMAL');
let moved=0,max=0,normals=0,maxNormal=0;const duplicate=new Map();
for(let i=0;i<position.getCount();i++){
 const p=position.getElement(i,[]),d=delta.getElement(i,[]),n=nd.getElement(i,[]),length=Math.hypot(...d);
 if(length>1e-7){moved++;max=Math.max(max,length);assert.ok(p[1]>1.245&&p[1]<1.405&&Math.abs(p[0])>.14,'arm correction outside upper arm')}
 const nlen=Math.hypot(...n);if(nlen>1e-7)normals++;maxNormal=Math.max(maxNormal,2*Math.asin(Math.min(1,nlen/2))*180/Math.PI);
 const key=p.join(',');if(duplicate.has(key))assert.deepEqual(duplicate.get(key),d,'UV-split position morph mismatch');else duplicate.set(key,d);
}
assert.ok(moved>100&&moved<500&&max<.0053&&normals>moved&&maxNormal<10);
console.log(`PASS: only ${moved} upper-arm position deltas, max ${(max*1000).toFixed(3)} mm, default weight zero; ${normals} local normal corrections`);
const findAnim=(r,n)=>{const x=r.listAnimations().filter(a=>a.getName()===n);assert.equal(x.length,1,n);return x[0]};
function describe(a){return a.listChannels().map(c=>{
 const s=c.getSampler();return {node:c.getTargetNode().getName(),path:c.getTargetPath(),interpolation:s.getInterpolation(),
  inType:s.getInput().getType(),outType:s.getOutput().getType(),input:hashAccessor(s.getInput()),output:hashAccessor(s.getOutput())};
})}
for(const [before,after] of [['Idle_Breathing','Previous_Idle'],['Test_Arms','Previous_Arms'],['Test_Knee','Previous_Knee'],['Test_Elbow','Test_Elbow'],['Test_Head','Test_Head']]){
 assert.deepEqual(describe(findAnim(old,before)),describe(findAnim(now,after)),`${before} changed`);
 console.log(`PASS: ${before} → ${after} channels and keyframes are unchanged`);
}
const names=['Idle_Breathing','Test_Arms','Test_Elbow','Test_Knee','Test_Head','Previous_Idle','Previous_Arms','Previous_Knee'];
assert.deepEqual(now.listAnimations().map(a=>a.getName()),names);
for(const anim of now.listAnimations())for(const channel of anim.listChannels()){
 const s=channel.getSampler(),input=s.getInput(),out=s.getOutput(),n=input.getCount();
 assert.ok(n===21||n===41);assert.equal(input.getScalar(0),0);assert.equal(input.getScalar(n-1),4);
 assert.equal(out.getCount(),n);for(let i=1;i<n;i++)assert.ok(input.getScalar(i)>input.getScalar(i-1));
 const first=out.getElement(0,[]),last=out.getElement(n-1,[]);first.forEach((v,i)=>assert.ok(Math.abs(v-last[i])<1e-6,`${anim.getName()} loop seam`));
 if(channel.getTargetPath()==='rotation')for(let i=0;i<n;i++)assert.ok(Math.abs(Math.hypot(...out.getElement(i,[]))-1)<1e-6);
}
assert.ok(findAnim(now,'Test_Arms').listChannels().some(x=>x.getTargetPath()==='weights'&&x.getTargetNode()===body));
for(const [name,data] of [['previous',source],['refined',refined]]){
 const report=await validator.validateBytes(new Uint8Array(data),{uri:`${name}.glb`});
 assert.equal(report.issues.numErrors,0);assert.equal(report.issues.numWarnings,0);assert.equal(report.info.totalTriangleCount,32354);
 if(name==='refined')assert.equal(report.info.animationCount,8);
 console.log(`PASS glTF Validator ${name}: ${report.issues.numErrors} errors, ${report.issues.numWarnings} warnings, ${report.issues.numInfos} infos; ${report.info.totalTriangleCount} triangles`);
}
