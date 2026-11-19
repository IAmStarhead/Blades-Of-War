// Structural regression versus the actual last-delivered torso GLB.
// Includes all 49 clips, not just the two shown in the page.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.resolve(process.argv[2]||path.join(ROOT,'work/male-anatomy-followup'));
const validate=createRequire(path.join(ROOT,'tools/character-showcase/package.json'))('gltf-validator');
const hash=x=>createHash('sha256').update(x).digest('hex');
const digest=a=>{assert.ok(a);const x=a.getArray();return hash(Buffer.from(x.buffer,x.byteOffset,x.byteLength))};
const oldBytes=await fs.readFile(path.join(ROOT,'work/male-torso-relaxed/male_torso_relaxed.glb'));
assert.equal(hash(oldBytes),'79feb676a09aa801a557ee4a63b3887b7e627b79db3f899535e7fe864b09d81f');
const newBytes=await fs.readFile(path.join(output,'male_anatomy_followup.glb'));
const io=new NodeIO(),[A,B]=await Promise.all([io.readBinary(oldBytes),io.readBinary(newBytes)]),a=A.getRoot(),b=B.getRoot();
const na=a.listNodes(),nb=b.listNodes();assert.deepEqual(na.map(n=>n.getName()),nb.map(n=>n.getName()));
for(let i=0;i<na.length;i++){
 assert.equal(na.indexOf(na[i].getParentNode()),nb.indexOf(nb[i].getParentNode()),na[i].getName());
 for(const fn of ['getTranslation','getRotation','getScale'])assert.deepEqual(na[i][fn](),nb[i][fn](),`${na[i].getName()} ${fn}`);
}
const sa=a.listSkins(),sb=b.listSkins();assert.equal(sa.length,1);assert.equal(sb.length,1);
assert.deepEqual(sa[0].listJoints().map(x=>x.getName()),sb[0].listJoints().map(x=>x.getName()));assert.equal(digest(sa[0].getInverseBindMatrices()),digest(sb[0].getInverseBindMatrices()));
assert.deepEqual(a.listTextures().map(t=>hash(t.getImage())),b.listTextures().map(t=>hash(t.getImage())));
let moved=0,max=0,seams=0,maxSeam=0;const perVertex=[];
for(let i=0;i<na.length;i++){
 const old=na[i].getMesh(),fresh=nb[i].getMesh();if(!old){assert.equal(fresh,null);continue}assert.ok(fresh);assert.deepEqual(old.getWeights(),fresh.getWeights());
 assert.equal(old.listPrimitives().length,fresh.listPrimitives().length);
 for(let j=0;j<old.listPrimitives().length;j++){
  const x=old.listPrimitives()[j],y=fresh.listPrimitives()[j],body=na[i].getName()==='head_2';
  assert.equal(digest(x.getIndices()),digest(y.getIndices()),'topology '+na[i].getName());
  for(const sem of x.listSemantics())if(!body||!['POSITION','NORMAL'].includes(sem))assert.equal(digest(x.getAttribute(sem)),digest(y.getAttribute(sem)),`${na[i].getName()} ${sem}`);
  const expected=[...x.listSemantics(),...(body?['_LAST_TORSO_POSITION','_LAST_TORSO_NORMAL']:[])].sort();assert.deepEqual(y.listSemantics().slice().sort(),expected);
  assert.equal(x.listTargets().length,y.listTargets().length);
  for(let k=0;k<x.listTargets().length;k++){
   const ox=x.listTargets()[k],ny=y.listTargets()[k];assert.equal(ox.getName(),ny.getName());assert.deepEqual(ox.listSemantics(),ny.listSemantics());
   for(const sem of ox.listSemantics())assert.equal(digest(ox.getAttribute(sem)),digest(ny.getAttribute(sem)),`${na[i].getName()} morph ${k} ${sem}`);
  }
  if(body){
   assert.equal(digest(x.getAttribute('POSITION')),digest(y.getAttribute('_LAST_TORSO_POSITION')));
   assert.equal(digest(x.getAttribute('NORMAL')),digest(y.getAttribute('_LAST_TORSO_NORMAL')));
   const p=x.getAttribute('POSITION'),q=y.getAttribute('POSITION'),norm=y.getAttribute('NORMAL'),W=y.getAttribute('WEIGHTS_0'),J=y.getAttribute('JOINTS_0'),weld=new Map();
   for(let k=0;k<p.getCount();k++){
    const v=p.getElement(k,[]),u=q.getElement(k,[]),n=norm.getElement(k,[]),weights=W.getElement(k,[]),joints=J.getElement(k,[]);
    assert.ok([...v,...u,...n,...weights,...joints].every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...n)-1)<2e-5);assert.ok(Math.abs(weights.reduce((s,x)=>s+x,0)-1)<2e-5);assert.ok(joints.every(j=>j>=0&&j<22));
    const d=Math.hypot(...v.map((z,c)=>z-u[c]));if(d>.001)moved++;max=Math.max(max,d);
    if(v[1]<=.70||v[1]>=1.50)assert.ok(d<1e-8,`changed outside torso/pelvis ${k}`);
    perVertex.push(d);const key=v.map(z=>Math.round(z*1e6)).join(',');if(weld.has(key)){seams++;const prev=q.getElement(weld.get(key),[]);maxSeam=Math.max(maxSeam,...u.map((z,c)=>Math.abs(z-prev[c])))}else weld.set(key,k);
   }
  }
 }
}
assert.ok(moved>400&&max<.075);assert.ok(seams>900&&maxSeam<2e-5,`seam error ${maxSeam}`);
const aa=a.listAnimations(),ab=b.listAnimations();assert.equal(aa.length,49);assert.deepEqual(aa.map(x=>x.getName()),ab.map(x=>x.getName()));
for(let i=0;i<aa.length;i++){
 const x=aa[i].listChannels(),y=ab[i].listChannels();assert.equal(x.length,y.length,aa[i].getName());
 for(let j=0;j<x.length;j++){
  assert.equal(x[j].getTargetNode().getName(),y[j].getTargetNode().getName());assert.equal(x[j].getTargetPath(),y[j].getTargetPath());
  const u=x[j].getSampler(),v=y[j].getSampler();assert.equal(u.getInterpolation(),v.getInterpolation());assert.equal(digest(u.getInput()),digest(v.getInput()));assert.equal(digest(u.getOutput()),digest(v.getOutput()),`${aa[i].getName()} ${x[j].getTargetNode().getName()} ${x[j].getTargetPath()}`);
 }
}
const result=await validate.validateBytes(new Uint8Array(newBytes),{uri:'male_anatomy_followup.glb',maxIssues:100});
if(result.issues.numErrors||result.issues.numWarnings)console.log(JSON.stringify(result.issues,null,2));
assert.equal(result.issues.numErrors,0);assert.equal(result.issues.numWarnings,0);
console.log(`PASS: glTF validator 0 errors/0 warnings; all 49 clips, 24 morphs, rig, skin, topology, textures, face and ears unchanged`);
console.log(`PASS: actual latest position/normal arrays embedded; ${moved} positions moved >1 mm, max ${(max*1000).toFixed(2)} mm, ${seams} welded seams, max seam ${(maxSeam*1000).toFixed(5)} mm`);
console.log('NOTE: finite structure checks do not prove anatomical quality or freedom from all mesh intersections.');
