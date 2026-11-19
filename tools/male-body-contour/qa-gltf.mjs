// Structural regression against the last delivered GLB; not an artistic test.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.resolve(process.argv[2]||path.join(ROOT,'work/male-body-contour'));
const validate=createRequire(path.join(ROOT,'tools/character-showcase/package.json'))('gltf-validator');
const hash=x=>createHash('sha256').update(x).digest('hex');
const digest=a=>{assert.ok(a);const x=a.getArray();return hash(Buffer.from(x.buffer,x.byteOffset,x.byteLength))};
const oldBytes=await fs.readFile(path.join(ROOT,'work/male-body-volume/male_body_volume.glb'));
assert.equal(hash(oldBytes),'1c94cb1c5fbecc5a1aa4f00683c90bb34ce2eb502ef504781d6faa00fd95c8c3');
const newBytes=await fs.readFile(path.join(output,'male_body_contour.glb'));
const io=new NodeIO(),[A,B]=await Promise.all([io.readBinary(oldBytes),io.readBinary(newBytes)]),a=A.getRoot(),b=B.getRoot();
const na=a.listNodes(),nb=b.listNodes();assert.deepEqual(na.map(n=>n.getName()),nb.map(n=>n.getName()));
for(let i=0;i<na.length;i++){
 assert.equal(na.indexOf(na[i].getParentNode()),nb.indexOf(nb[i].getParentNode()),na[i].getName());
 for(const fn of ['getTranslation','getRotation','getScale'])assert.deepEqual(na[i][fn](),nb[i][fn](),`${na[i].getName()} ${fn}`);
}
const sa=a.listSkins(),sb=b.listSkins();assert.equal(sa.length,1);assert.equal(sb.length,1);
assert.deepEqual(sa[0].listJoints().map(x=>x.getName()),sb[0].listJoints().map(x=>x.getName()));assert.equal(digest(sa[0].getInverseBindMatrices()),digest(sb[0].getInverseBindMatrices()));
assert.deepEqual(a.listTextures().map(t=>hash(t.getImage())),b.listTextures().map(t=>hash(t.getImage())));
let moved=0,max=0,seams=0,maxSeam=0,triangles=0,minAreaRatio=Infinity,flips=0;
for(let i=0;i<na.length;i++){
 const old=na[i].getMesh(),fresh=nb[i].getMesh();if(!old){assert.equal(fresh,null);continue}assert.ok(fresh);
 const isBody=na[i].getName()==='head_2';assert.deepEqual(fresh.getWeights(),old.getWeights());assert.equal(old.listPrimitives().length,fresh.listPrimitives().length);
 for(let j=0;j<old.listPrimitives().length;j++){
  const x=old.listPrimitives()[j],y=fresh.listPrimitives()[j];assert.equal(digest(x.getIndices()),digest(y.getIndices()),'topology '+na[i].getName());
  for(const sem of x.listSemantics())if(!isBody||!['POSITION','NORMAL'].includes(sem))assert.equal(digest(x.getAttribute(sem)),digest(y.getAttribute(sem)),`${na[i].getName()} ${sem}`);
  assert.deepEqual(y.listSemantics().slice().sort(),[...x.listSemantics(),...(isBody?['_CONTOUR_LAST_POSITION','_CONTOUR_LAST_NORMAL']:[])].sort());
  assert.equal(y.listTargets().length,x.listTargets().length);
  for(let k=0;k<x.listTargets().length;k++){
   const u=x.listTargets()[k],v=y.listTargets()[k];assert.equal(u.getName(),v.getName());assert.deepEqual(u.listSemantics(),v.listSemantics());
   for(const sem of u.listSemantics())assert.equal(digest(u.getAttribute(sem)),digest(v.getAttribute(sem)),`${na[i].getName()} target ${k} ${sem}`);
  }
  if(!isBody)continue;
  assert.equal(digest(x.getAttribute('POSITION')),digest(y.getAttribute('_CONTOUR_LAST_POSITION')));
  assert.equal(digest(x.getAttribute('NORMAL')),digest(y.getAttribute('_CONTOUR_LAST_NORMAL')));
  const p=x.getAttribute('POSITION'),q=y.getAttribute('POSITION'),norm=y.getAttribute('NORMAL'),W=y.getAttribute('WEIGHTS_0'),J=y.getAttribute('JOINTS_0'),weld=new Map(),I=x.getIndices();
  for(let k=0;k<p.getCount();k++){
   const v=p.getElement(k,[]),u=q.getElement(k,[]),n=norm.getElement(k,[]),weights=W.getElement(k,[]),joints=J.getElement(k,[]);
   assert.ok([...v,...u,...n,...weights,...joints].every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...n)-1)<2e-5);
   assert.ok(Math.abs(weights.reduce((s,z)=>s+z,0)-1)<2e-5);assert.ok(joints.every(z=>z>=0&&z<22));
   const d=Math.hypot(...v.map((z,c)=>z-u[c]));if(d>.001)moved++;max=Math.max(max,d);
   if(v[1]<=.84||v[1]>=1.43)assert.ok(d<1e-8,`base position changed outside intended region ${k}`);
   if(v[1]>1.08&&v[1]<1.30&&v[2]>.085&&Math.abs(v[0])<.10)assert.ok(u[2]<=v[2]+1e-7,`front went forward ${k}`);
   const key=v.map(z=>Math.round(z*1e6)).join(',');if(weld.has(key)){seams++;const prev=q.getElement(weld.get(key),[]);maxSeam=Math.max(maxSeam,...u.map((z,c)=>Math.abs(z-prev[c])))}else weld.set(key,k);
  }
  for(let k=0;k<I.getCount();k+=3){
   const ids=[0,1,2].map(j=>I.getScalar(k+j)),first=ids.map(i=>new Vector3().fromArray(p.getElement(i,[]))),second=ids.map(i=>new Vector3().fromArray(q.getElement(i,[])));
   const u=first[1].clone().sub(first[0]).cross(first[2].clone().sub(first[0])),v=second[1].clone().sub(second[0]).cross(second[2].clone().sub(second[0]));
   if(u.lengthSq()<1e-16)continue;const changed=ids.some(i=>p.getElement(i,[]).some((z,j)=>Math.abs(z-q.getElement(i,[])[j])>1e-8));if(!changed)continue;
   triangles++;minAreaRatio=Math.min(minAreaRatio,v.length()/u.length());if(u.dot(v)<=0)flips++;
  }
 }
}
assert.equal(moved,493);assert.ok(max<.035);assert.ok(seams>900&&maxSeam<2e-5,`seam error ${maxSeam}`);
assert.equal(flips,0,`changed bind-pose triangle normal reversed: ${flips}`);assert.ok(minAreaRatio>.15,`bind area ratio ${minAreaRatio}`);
const aa=a.listAnimations(),ab=b.listAnimations();assert.equal(aa.length,51);assert.equal(ab.length,51);assert.deepEqual(aa.map(x=>x.getName()),ab.map(x=>x.getName()));
for(let i=0;i<aa.length;i++){
 const u=aa[i].listChannels(),v=ab[i].listChannels();assert.equal(u.length,v.length,aa[i].getName());
 for(let j=0;j<u.length;j++){
  assert.equal(u[j].getTargetNode().getName(),v[j].getTargetNode().getName());assert.equal(u[j].getTargetPath(),v[j].getTargetPath());
  const s=u[j].getSampler(),t=v[j].getSampler();assert.equal(s.getInterpolation(),t.getInterpolation());assert.equal(digest(s.getInput()),digest(t.getInput()));assert.equal(digest(s.getOutput()),digest(t.getOutput()),`${aa[i].getName()} ${u[j].getTargetNode().getName()}/${u[j].getTargetPath()}`);
 }
}
const result=await validate.validateBytes(new Uint8Array(newBytes),{uri:'male_body_contour.glb',maxIssues:100});
if(result.issues.numErrors||result.issues.numWarnings)console.log(JSON.stringify(result.issues,null,2));
assert.equal(result.issues.numErrors,0);assert.equal(result.issues.numWarnings,0);
console.log('PASS: glTF Validator 0 errors/0 warnings; all 51 clips, 26 body morphs, rig, skin, indices and texture bytes preserved');
console.log(`PASS: exact last surface embedded; ${moved} vertices moved >1 mm, max ${(max*1000).toFixed(2)} mm; ${seams} seams, max error ${(maxSeam*1000).toFixed(5)} mm`);
console.log(`PASS: ${triangles} changed bind-pose triangles, no normal reversals, minimum area ratio ${minAreaRatio.toFixed(4)}`);
console.log('NOTE: structural and bind-pose checks do not prove anatomical quality or absence of deformation artifacts.');
