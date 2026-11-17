// Validate the trial and prove that only local head normals changed.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const result=path.resolve(process.argv[2]||path.join(root,'work/male-nape-seam'));
const req=createRequire(path.join(root,'tools/character-showcase/package.json'));
const validator=req('gltf-validator');
const digest=data=>createHash('sha256').update(data).digest('hex');
const before=execFileSync('unzip',['-p',path.join(root,'work/male-camera-dual-view/BladesOfWar_Dva_Rakursa.zip'),'male_13_november_optimized.glb'],{maxBuffer:20_000_000});
const after=await fs.readFile(path.join(result,'male_nape_smoothed_trial.glb'));
assert.equal(digest(before),'ee4fee7388eaf3e77ba01061e11d9a569e6e8684ce349ab86981a9408b33b5c3');
assert.equal(digest(after),'009275f703e22426139908f03c44e52a52cc52f20b9f3d6e12fb39ae1285075e');
const io=new NodeIO(),[oldDoc,newDoc]=await Promise.all([io.readBinary(before),io.readBinary(after)]);
const oldRoot=oldDoc.getRoot(),newRoot=newDoc.getRoot();
for(const [name,r] of [['before',oldRoot],['after',newRoot]]){
 assert.equal(r.listSkins().length,0,`${name} skin`);assert.equal(r.listAnimations().length,0,`${name} animation`);
}
const oldNodes=oldRoot.listNodes(),newNodes=newRoot.listNodes();assert.equal(oldNodes.length,newNodes.length);
for(let i=0;i<oldNodes.length;i++){
 const a=oldNodes[i],b=newNodes[i];assert.equal(a.getName(),b.getName());
 assert.deepEqual(a.getWorldMatrix(),b.getWorldMatrix(),a.getName()+' world matrix');
 assert.deepEqual(a.listChildren().map(x=>oldNodes.indexOf(x)),b.listChildren().map(x=>newNodes.indexOf(x)),a.getName()+' hierarchy');
 assert.deepEqual(a.getExtras(),b.getExtras(),a.getName()+' extras');
}
function material(m){
 const info=m.getBaseColorTextureInfo();
 return {name:m.getName(),base:m.getBaseColorFactor(),metal:m.getMetallicFactor(),rough:m.getRoughnessFactor(),
  double:m.getDoubleSided(),alpha:m.getAlphaMode(),cutoff:m.getAlphaCutoff(),emissive:m.getEmissiveFactor(),
  texture:m.getBaseColorTexture()?digest(m.getBaseColorTexture().getImage()):null,
  textureInfo:info?[info.getTexCoord(),info.getMinFilter(),info.getMagFilter(),info.getWrapS(),info.getWrapT()]:null};
}
assert.deepEqual(oldRoot.listMaterials().map(material),newRoot.listMaterials().map(material),'materials');
assert.deepEqual(oldRoot.listTextures().map(t=>digest(t.getImage())),newRoot.listTextures().map(t=>digest(t.getImage())),'textures');
const prim=(doc,name)=>{const nodes=doc.getRoot().listNodes().filter(n=>n.getName()===name&&n.getMesh());assert.equal(nodes.length,1);const p=nodes[0].getMesh().listPrimitives();assert.equal(p.length,1);return p[0]};
const bytes=arr=>Buffer.from(arr.buffer,arr.byteOffset,arr.byteLength);
for(const name of ['head_1','head_2','ear-makehuman-left','ear-makehuman-right']){
 const a=prim(oldDoc,name),b=prim(newDoc,name);
 assert.equal(digest(bytes(a.getIndices().getArray())),digest(bytes(b.getIndices().getArray())),`${name} triangles`);
 assert.deepEqual(a.listSemantics().sort(),b.listSemantics().sort(),`${name} attributes`);
 for(const semantic of a.listSemantics()){
  const x=a.getAttribute(semantic),y=b.getAttribute(semantic);
  assert.equal(x.getComponentType(),y.getComponentType(),`${name}/${semantic} type`);
  assert.equal(x.getNormalized(),y.getNormalized(),`${name}/${semantic} normalization`);
  assert.equal(x.getCount(),y.getCount(),`${name}/${semantic} count`);
  if(name==='head_1'&&semantic==='NORMAL')continue;
  assert.equal(digest(bytes(x.getArray())),digest(bytes(y.getArray())),`${name}/${semantic} data`);
 }
 console.log(`PASS: ${name} indices and ${name==='head_1'?'all non-normal':'all'} attributes are unchanged`);
}
const a=prim(oldDoc,'head_1'),b=prim(newDoc,'head_1');
const pos=a.getAttribute('POSITION'),oldNormal=a.getAttribute('NORMAL'),newNormal=b.getAttribute('NORMAL');
let changed=0,significant=0,maxAngle=0;const duplicateNormals=new Map();
for(let i=0;i<pos.getCount();i++){
 const p=pos.getElement(i,[]),old=oldNormal.getElement(i,[]),n=newNormal.getElement(i,[]);
 const norm=Math.hypot(...n);assert.ok(Number.isFinite(norm)&&Math.abs(norm-1)<2e-5,`bad normal ${i}`);
 const key=p.join(','),nkey=n.join(',');if(duplicateNormals.has(key))assert.equal(duplicateNormals.get(key),nkey,`seam normals diverged ${i}`);else duplicateNormals.set(key,nkey);
 if(old.some((v,j)=>v!==n[j])){
  changed++;
  assert.ok(Math.abs(p[0]-0.0042)<0.025&&p[1]>1.605&&p[2]<-0.045&&old[2]<-0.15,`normal changed outside nape at ${i}`);
  const olen=Math.hypot(...old),dot=n.reduce((s,v,j)=>s+v*old[j]/(olen*norm),0);
  const angle=Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI;
  if(angle>0.01)significant++;maxAngle=Math.max(maxAngle,angle);
 }
}
assert.ok(changed>300&&changed<=437,`unexpected changed count ${changed}`);assert.ok(maxAngle<6,`maximum normal correction ${maxAngle}`);
console.log(`PASS: ${changed} local normal values changed (${significant} by > 0.01°); maximum ${maxAngle.toFixed(3)}°; duplicate seam normals match`);
for(const [name,data] of [['before',before],['after',after]]){
 const report=await validator.validateBytes(new Uint8Array(data),{uri:`${name}.glb`});
 console.log(`glTF Validator ${name}: ${report.issues.numErrors} errors, ${report.issues.numWarnings} warnings, ${report.issues.numInfos} infos; ${report.info.totalTriangleCount} triangles`);
 assert.equal(report.issues.numErrors,0);assert.equal(report.issues.numWarnings,0);assert.equal(report.info.totalTriangleCount,32354);
}
