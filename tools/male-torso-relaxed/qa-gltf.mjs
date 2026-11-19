// Regression against the exact, physically reviewed gait-polish GLB. This is a
// structural and numerical check, not proof of anatomy or collision freedom.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {Quaternion,Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.resolve(process.argv[2]||path.join(ROOT,'work/male-torso-relaxed'));
const validator=createRequire(path.join(ROOT,'tools/character-showcase/package.json'))('gltf-validator');
const hash=b=>createHash('sha256').update(b).digest('hex'),digest=a=>{const v=a.getArray();return hash(Buffer.from(v.buffer,v.byteOffset,v.byteLength))};
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b} (tol ${t})`);
const oldBytes=await fs.readFile(path.join(ROOT,'work/male-gait-polish/male_gait_polish.glb'));
assert.equal(hash(oldBytes),'68d015f8e3e603ddfd912a1b0aca68ac8c743724193e51b8ed82b262f28fee37');
const newBytes=await fs.readFile(path.join(output,'male_torso_relaxed.glb'));
const io=new NodeIO(),[oldDoc,newDoc]=await Promise.all([io.readBinary(oldBytes),io.readBinary(newBytes)]),old=oldDoc.getRoot(),fresh=newDoc.getRoot();
const node=(r,n)=>{const xs=r.listNodes().filter(x=>x.getName()===n);assert.equal(xs.length,1);return xs[0]};
const anim=(r,n)=>{const xs=r.listAnimations().filter(x=>x.getName()===n);assert.equal(xs.length,1);return xs[0]};
const A=old.listNodes(),B=fresh.listNodes();assert.deepEqual(A.map(x=>x.getName()),B.map(x=>x.getName()));
for(let i=0;i<A.length;i++){assert.equal(A.indexOf(A[i].getParentNode()),B.indexOf(B[i].getParentNode()));for(const fn of ['getTranslation','getRotation','getScale'])assert.deepEqual(A[i][fn](),B[i][fn](),A[i].getName()+' '+fn)}
const sa=old.listSkins()[0],sb=fresh.listSkins()[0];assert.equal(sb.listJoints().length,22);assert.deepEqual(sa.listJoints().map(x=>x.getName()),sb.listJoints().map(x=>x.getName()));assert.equal(digest(sa.getInverseBindMatrices()),digest(sb.getInverseBindMatrices()));
assert.deepEqual(old.listTextures().map(x=>hash(x.getImage())),fresh.listTextures().map(x=>hash(x.getImage())));
let seams=0,maxSeam=0,moved=0,maxDelta=0,outside=0,handMoved=0;
for(const name of ['head_1','head_2','ear-makehuman-left','ear-makehuman-right']){
 const x=node(old,name).getMesh(),y=node(fresh,name).getMesh(),p=x.listPrimitives()[0],q=y.listPrimitives()[0];assert.equal(digest(p.getIndices()),digest(q.getIndices()),name+' topology');
 assert.deepEqual(x.getWeights(),y.getWeights().slice(0,x.getWeights().length));if(name==='head_2')assert.deepEqual(y.getWeights().slice(20),[0,0,0,0]);
 for(const sem of p.listSemantics())if(name!=='head_2'||!['POSITION','NORMAL'].includes(sem))assert.equal(digest(p.getAttribute(sem)),digest(q.getAttribute(sem)),name+' '+sem);
 if(name==='head_2')for(const [before,after] of [['POSITION','_TORSO_OLD_POSITION'],['NORMAL','_TORSO_OLD_NORMAL']])assert.equal(digest(p.getAttribute(before)),digest(q.getAttribute(after)),before+' exact previous');
 const pt=p.listTargets(),qt=q.listTargets();assert.equal(qt.length,pt.length+(name==='head_2'?4:0));for(let i=0;i<pt.length;i++){assert.equal(pt[i].getName(),qt[i].getName());for(const sem of pt[i].listSemantics())assert.equal(digest(pt[i].getAttribute(sem)),digest(qt[i].getAttribute(sem)),name+' target '+i+'/'+sem)}
 if(name==='head_2'){
  const prior=p.getAttribute('POSITION'),now=q.getAttribute('POSITION'),norm=q.getAttribute('NORMAL'),weights=q.getAttribute('WEIGHTS_0'),joints=q.getAttribute('JOINTS_0'),boneNames=sa.listJoints().map(n=>n.getName()),weld=new Map();
  for(let i=0;i<now.getCount();i++){
   const a=prior.getElement(i,[]),b=now.getElement(i,[]),nn=norm.getElement(i,[]),w=weights.getElement(i,[]),j=joints.getElement(i,[]),d=Math.hypot(...b.map((v,k)=>v-a[k]));
   for(const v of [...a,...b,...nn,...w,...j])assert.ok(Number.isFinite(v));near(Math.hypot(...nn),1,2e-5);near(w.reduce((m,v)=>m+v,0),1,2e-5);for(const id of j)assert.ok(id>=0&&id<22);
   if(d>.001)moved++;if(d>1e-7&&(a[1]<=.70||a[1]>=1.50))outside++;maxDelta=Math.max(maxDelta,d);
   const distal=j.reduce((sum,id,k)=>sum+(/^Rig_(Hand|Forearm)_[LR]$/.test(boneNames[id])?w[k]:0),0);if(distal>.95&&d>1e-7)handMoved++;
   const key=a.map(v=>Math.round(v*1e6)).join(','),last=weld.get(key);if(last!==undefined){seams++;for(let k=0;k<3;k++)maxSeam=Math.max(maxSeam,Math.abs(now.getElement(last,[])[k]-b[k]));for(let t=20;t<24;t++){const attr=qt[t].getAttribute('POSITION');for(let k=0;k<3;k++)maxSeam=Math.max(maxSeam,Math.abs(attr.getElement(last,[])[k]-attr.getElement(i,[])[k]))}}else weld.set(key,i);
  }
  for(let t=20;t<24;t++){
   assert.equal(qt[t].getName(),`Walk_Underarm_${t-19}`);const m=qt[t].getAttribute('POSITION');
   for(let i=0;i<m.getCount();i++){const d=Math.hypot(...m.getElement(i,[])),pos=now.getElement(i,[]);if(d>1e-7)assert.ok(pos[1]>1.23&&pos[1]<1.46&&Math.abs(pos[0])>.09&&Math.abs(pos[0])<.24,'underarm morph outside region')}
  }
 }
}
assert.equal(outside,0);assert.equal(handMoved,0);assert.ok(moved>400&&maxDelta<.055);assert.ok(seams>900&&maxSeam<2e-5);
console.log(`PASS: rig, binds, weights, topology, textures, face/ears and all 20 earlier morphs unchanged; prior surface embedded. ${moved} vertices moved >1mm; max ${(maxDelta*1000).toFixed(2)}mm; ${seams} welded seams`);
assert.equal(old.listAnimations().length,48);assert.deepEqual(fresh.listAnimations().map(x=>x.getName()),[...old.listAnimations().map(x=>x.getName()),'Torso_Walk']);
function compareWeights(a,b,allowNew=false){
 const x=a.getArray(),y=b.getArray();assert.equal(x.length%20,0);assert.equal(y.length/24,x.length/20);
 let extra=0;for(let i=0;i<x.length/20;i++){
  for(let j=0;j<20;j++)assert.equal(x[20*i+j],y[24*i+j]);
  for(let j=20;j<24;j++){assert.ok(Number.isFinite(y[24*i+j]));extra=Math.max(extra,Math.abs(y[24*i+j]));if(!allowNew)assert.equal(y[24*i+j],0)}
 }if(allowNew)assert.ok(extra>.01,'new underarm correction is not animated');
}
function compareClips(a,b,newWalk=false){
 const x=a.listChannels(),y=b.listChannels();assert.equal(x.length,y.length,a.getName());
 for(let i=0;i<x.length;i++){
  const ca=x[i],cb=y[i],s=ca.getSampler(),t=cb.getSampler(),name=ca.getTargetNode().getName(),kind=ca.getTargetPath();
  assert.equal(name,cb.getTargetNode().getName());assert.equal(kind,cb.getTargetPath());assert.equal(s.getInterpolation(),t.getInterpolation());assert.equal(digest(s.getInput()),digest(t.getInput()));
  if(kind==='weights'&&name==='head_2')compareWeights(s.getOutput(),t.getOutput(),newWalk);
  else if(newWalk&&/^Rig_UpperArm_[LR]$/.test(name)){
   const sign=name.endsWith('_L')?-1:1,offset=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),sign*10*Math.PI/180);
   for(let k=0;k<s.getOutput().getCount();k++){
    const expected=new Quaternion().fromArray(s.getOutput().getElement(k,[])).normalize().premultiply(offset).normalize(),actual=new Quaternion().fromArray(t.getOutput().getElement(k,[])).normalize();assert.ok(expected.angleTo(actual)<1e-6,`${name} frame ${k}`);
   }
  }else assert.equal(digest(s.getOutput()),digest(t.getOutput()),a.getName()+' '+name+'/'+kind);
 }
}
for(const a of old.listAnimations())compareClips(a,anim(fresh,a.getName()));
compareClips(anim(old,'Polish_Walk'),anim(fresh,'Torso_Walk'),true);
for(const c of anim(fresh,'Torso_Walk').listChannels()){
 const s=c.getSampler(),N=s.getInput().getCount(),out=s.getOutput().getArray(),width=c.getTargetPath()==='rotation'?4:c.getTargetPath()==='weights'?24:3;assert.equal(out.length,N*width);for(const v of out)assert.ok(Number.isFinite(v));for(let k=0;k<width;k++)near(out[k],out[(N-1)*width+k],2e-6);if(width===4)for(let i=0;i<N;i++)near(Math.hypot(...out.subarray(4*i,4*i+4)),1,2e-6);
}
console.log('PASS: all 48 previous animations preserve every bone key and first 20 morph keys; only new walk upper-arm keys and 4 local corrective weights differ. Liked run is unchanged.');
for(const [name,bytes,expected] of [['old',oldBytes,48],['new',newBytes,49]]){
 const r=await validator.validateBytes(new Uint8Array(bytes),{uri:name+'.glb'});if(r.issues.numErrors||r.issues.numWarnings)console.log(JSON.stringify(r.issues.messages,null,2));assert.equal(r.issues.numErrors,0);assert.equal(r.issues.numWarnings,0);assert.equal(r.info.animationCount,expected);console.log(`PASS glTF Validator ${name}: ${r.issues.numErrors} errors, ${r.issues.numWarnings} warnings, ${r.issues.numInfos} informational`);
}
