// Structural/animation regression against the exact physically reviewed GLB.
// These checks are finite/structural, not an anatomical or collision proof.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.resolve(process.argv[2]||path.join(ROOT,'work/male-body-volume'));
const validate=createRequire(path.join(ROOT,'tools/character-showcase/package.json'))('gltf-validator');
const hash=x=>createHash('sha256').update(x).digest('hex');
const digest=a=>{assert.ok(a);const x=a.getArray();return hash(Buffer.from(x.buffer,x.byteOffset,x.byteLength))};
const oldBytes=await fs.readFile(path.join(ROOT,'work/male-anatomy-followup/male_anatomy_followup.glb'));
assert.equal(hash(oldBytes),'03063b8287ab2d3bba058afd8575e6263e387b2ed2ac0912fd0149ca775041a1');
const newBytes=await fs.readFile(path.join(output,'male_body_volume.glb'));
const io=new NodeIO(),[A,B]=await Promise.all([io.readBinary(oldBytes),io.readBinary(newBytes)]),a=A.getRoot(),b=B.getRoot();
const na=a.listNodes(),nb=b.listNodes();assert.deepEqual(na.map(n=>n.getName()),nb.map(n=>n.getName()));
for(let i=0;i<na.length;i++){
 assert.equal(na.indexOf(na[i].getParentNode()),nb.indexOf(nb[i].getParentNode()),na[i].getName());
 for(const fn of ['getTranslation','getRotation','getScale'])assert.deepEqual(na[i][fn](),nb[i][fn](),`${na[i].getName()} ${fn}`);
}
const sa=a.listSkins(),sb=b.listSkins();assert.equal(sa.length,1);assert.equal(sb.length,1);
assert.deepEqual(sa[0].listJoints().map(x=>x.getName()),sb[0].listJoints().map(x=>x.getName()));assert.equal(digest(sa[0].getInverseBindMatrices()),digest(sb[0].getInverseBindMatrices()));
assert.deepEqual(a.listTextures().map(t=>hash(t.getImage())),b.listTextures().map(t=>hash(t.getImage())));
let moved=0,max=0,seams=0,maxSeam=0;
for(let i=0;i<na.length;i++){
 const old=na[i].getMesh(),fresh=nb[i].getMesh();if(!old){assert.equal(fresh,null);continue}assert.ok(fresh);
 const body=na[i].getName()==='head_2';assert.deepEqual(fresh.getWeights(),[...old.getWeights(),...(body?[0,0]:[])]);
 assert.equal(old.listPrimitives().length,fresh.listPrimitives().length);
 for(let j=0;j<old.listPrimitives().length;j++){
  const x=old.listPrimitives()[j],y=fresh.listPrimitives()[j];assert.equal(digest(x.getIndices()),digest(y.getIndices()),'topology '+na[i].getName());
  for(const sem of x.listSemantics())if(!body||!['POSITION','NORMAL'].includes(sem))assert.equal(digest(x.getAttribute(sem)),digest(y.getAttribute(sem)),`${na[i].getName()} ${sem}`);
  assert.deepEqual(y.listSemantics().slice().sort(),[...x.listSemantics(),...(body?['_VOLUME_LAST_POSITION','_VOLUME_LAST_NORMAL']:[])].sort());
  assert.equal(y.listTargets().length,x.listTargets().length+(body?2:0));
  for(let k=0;k<x.listTargets().length;k++){
   const u=x.listTargets()[k],v=y.listTargets()[k];assert.equal(u.getName(),v.getName());assert.deepEqual(u.listSemantics(),v.listSemantics());
   for(const sem of u.listSemantics())assert.equal(digest(u.getAttribute(sem)),digest(v.getAttribute(sem)),`${na[i].getName()} target ${k} ${sem}`);
  }
  if(body){
   assert.equal(digest(x.getAttribute('POSITION')),digest(y.getAttribute('_VOLUME_LAST_POSITION')));
   assert.equal(digest(x.getAttribute('NORMAL')),digest(y.getAttribute('_VOLUME_LAST_NORMAL')));
   assert.deepEqual(y.listTargets().slice(-2).map(t=>t.getName()),['Crouch_Volume_L','Crouch_Volume_R']);
   const p=x.getAttribute('POSITION'),q=y.getAttribute('POSITION'),norm=y.getAttribute('NORMAL'),W=y.getAttribute('WEIGHTS_0'),J=y.getAttribute('JOINTS_0'),weld=new Map();
   for(let k=0;k<p.getCount();k++){
    const v=p.getElement(k,[]),u=q.getElement(k,[]),n=norm.getElement(k,[]),weights=W.getElement(k,[]),joints=J.getElement(k,[]);
    assert.ok([...v,...u,...n,...weights,...joints].every(Number.isFinite));assert.ok(Math.abs(Math.hypot(...n)-1)<2e-5);assert.ok(Math.abs(weights.reduce((s,z)=>s+z,0)-1)<2e-5);assert.ok(joints.every(j=>j>=0&&j<22));
    const d=Math.hypot(...v.map((z,c)=>z-u[c]));if(d>.001)moved++;max=Math.max(max,d);
    if(v[1]<=1.0||v[1]>=1.36)assert.ok(d<1e-8,`base changed outside waist/abdomen ${k}`);
    for(const [side,t] of y.listTargets().slice(-2).entries()){
     const z=t.getAttribute('POSITION').getElement(k,[]),dn=t.getAttribute('NORMAL').getElement(k,[]);
     assert.ok([...z,...dn].every(Number.isFinite));assert.ok(Math.hypot(...dn)<.6,'unexpected knee normal magnitude');
     if(v[1]<=.22||v[1]>=.72)assert.ok(Math.hypot(...z)<1e-8,'knee correction outside mask');
     if(v[1]<.16||v[1]>.78||(side===0&&v[0]<0)||(side===1&&v[0]>=0))assert.ok(Math.hypot(...dn)<1e-8,'knee normal outside region');
    }
    const key=v.map(z=>Math.round(z*1e6)).join(',');if(weld.has(key)){seams++;const prev=q.getElement(weld.get(key),[]);maxSeam=Math.max(maxSeam,...u.map((z,c)=>Math.abs(z-prev[c])))}else weld.set(key,k);
   }
  }
 }
}
assert.ok(moved>150&&moved<500&&max<.022);assert.ok(seams>900&&maxSeam<2e-5,`seam error ${maxSeam}`);
const aa=a.listAnimations(),ab=b.listAnimations();assert.equal(aa.length,49);assert.equal(ab.length,51);assert.deepEqual(aa.map(x=>x.getName()),ab.slice(0,49).map(x=>x.getName()));
function compareChannels(old,fresh,extra){
 const x=old.listChannels(),y=fresh.listChannels();assert.equal(x.length,y.length,old.getName());
 for(let j=0;j<x.length;j++){
  assert.equal(x[j].getTargetNode().getName(),y[j].getTargetNode().getName());assert.equal(x[j].getTargetPath(),y[j].getTargetPath());
  const u=x[j].getSampler(),v=y[j].getSampler();assert.equal(u.getInterpolation(),v.getInterpolation());assert.equal(digest(u.getInput()),digest(v.getInput()));
  if(x[j].getTargetNode().getName()==='head_2'&&x[j].getTargetPath()==='weights'){
   const src=u.getOutput().getArray(),dst=v.getOutput().getArray(),frames=u.getInput().getCount();assert.equal(src.length,frames*24);assert.equal(dst.length,frames*26);
   for(let f=0;f<frames;f++){for(let k=0;k<24;k++)assert.equal(src[24*f+k],dst[26*f+k],`${old.getName()} frame ${f} morph ${k}`);for(let k=24;k<26;k++)assert.equal(dst[26*f+k],extra)}
  }else assert.equal(digest(u.getOutput()),digest(v.getOutput()),`${old.getName()} ${x[j].getTargetNode().getName()}/${x[j].getTargetPath()}`);
 }
}
for(let i=0;i<aa.length;i++)compareChannels(aa[i],ab[i],0);
for(const [oldName,newName] of [['Deep_Crouch_Walk','Volume_Crouch_Walk'],['Deep_Crouch_Idle','Volume_Crouch_Idle']])compareChannels(aa.find(c=>c.getName()===oldName),ab.find(c=>c.getName()===newName),.75);
const result=await validate.validateBytes(new Uint8Array(newBytes),{uri:'male_body_volume.glb',maxIssues:100});
if(result.issues.numErrors||result.issues.numWarnings)console.log(JSON.stringify(result.issues,null,2));
assert.equal(result.issues.numErrors,0);assert.equal(result.issues.numWarnings,0);
console.log('PASS: glTF Validator 0 errors/0 warnings; rig, topology, skin, textures, existing targets and all 49 original clips preserved (new weights zero)');
console.log('PASS: two duplicate crouch clips retain original bone/morph keys and activate only the new knee targets at 0.75');
console.log(`PASS: exact latest positions/normals embedded; ${moved} waist vertices moved >1 mm, maximum ${(max*1000).toFixed(2)} mm; ${seams} seams, max error ${(maxSeam*1000).toFixed(5)} mm`);
console.log('NOTE: structural and finite region checks do not establish anatomical quality or rule out all intersections.');
