// Regression against the immediately preceding delivery, not proof of anatomy.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {Quaternion} from '../male-library-motion/node_modules/three/build/three.module.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),output=path.resolve(process.argv[2]||path.join(ROOT,'work/male-gait-polish'));
const validator=createRequire(path.join(ROOT,'tools/character-showcase/package.json'))('gltf-validator');
const hash=b=>createHash('sha256').update(b).digest('hex'),digest=a=>{const v=a.getArray();return hash(Buffer.from(v.buffer,v.byteOffset,v.byteLength))};
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b} (tol ${t})`);
const oldBytes=await fs.readFile(path.join(ROOT,'work/male-library-motion/male_library_motion.glb'));
assert.equal(hash(oldBytes),'14fb12a55c690b3919a66c07d3e9715da568fa13bbf7e945538bf0ab4a4b8cd0');
const newBytes=await fs.readFile(path.join(output,'male_gait_polish.glb'));
const io=new NodeIO(),[oldDoc,newDoc]=await Promise.all([io.readBinary(oldBytes),io.readBinary(newBytes)]),old=oldDoc.getRoot(),fresh=newDoc.getRoot();
const node=(r,n)=>{const xs=r.listNodes().filter(x=>x.getName()===n);assert.equal(xs.length,1);return xs[0]};
const animation=(r,n)=>{const xs=r.listAnimations().filter(x=>x.getName()===n);assert.equal(xs.length,1);return xs[0]};
const A=old.listNodes(),B=fresh.listNodes();assert.deepEqual(A.map(x=>x.getName()),B.map(x=>x.getName()));
for(let i=0;i<A.length;i++){assert.equal(A.indexOf(A[i].getParentNode()),B.indexOf(B[i].getParentNode()));for(const fn of ['getTranslation','getRotation','getScale'])assert.deepEqual(A[i][fn](),B[i][fn](),A[i].getName()+' '+fn)}
let skinA=old.listSkins()[0],skinB=fresh.listSkins()[0];assert.equal(skinB.listJoints().length,22);assert.deepEqual(skinA.listJoints().map(x=>x.getName()),skinB.listJoints().map(x=>x.getName()));assert.equal(digest(skinA.getInverseBindMatrices()),digest(skinB.getInverseBindMatrices()));
assert.deepEqual(old.listTextures().map(x=>hash(x.getImage())),fresh.listTextures().map(x=>hash(x.getImage())));
let seamPairs=0,maxSeam=0,changed=0,maxDelta=0,outside=0;
for(const name of ['head_1','head_2','ear-makehuman-left','ear-makehuman-right']){
 const x=node(old,name).getMesh(),y=node(fresh,name).getMesh(),p=x.listPrimitives()[0],q=y.listPrimitives()[0];assert.equal(digest(p.getIndices()),digest(q.getIndices()),name+' topology');assert.deepEqual(x.getWeights(),y.getWeights());
 for(const sem of p.listSemantics())if(name!=='head_2'||!['POSITION','NORMAL'].includes(sem))assert.equal(digest(p.getAttribute(sem)),digest(q.getAttribute(sem)),name+' '+sem);
 if(name==='head_2')for(const [before,after] of [['POSITION','_POLISH_OLD_POSITION'],['NORMAL','_POLISH_OLD_NORMAL']])assert.equal(digest(p.getAttribute(before)),digest(q.getAttribute(after)),before+' exact previous');
 const pt=p.listTargets(),qt=q.listTargets();assert.equal(pt.length,qt.length);for(let i=0;i<pt.length;i++){assert.equal(pt[i].getName(),qt[i].getName());for(const sem of pt[i].listSemantics())assert.equal(digest(pt[i].getAttribute(sem)),digest(qt[i].getAttribute(sem)),name+' target '+i+'/'+sem)}
 if(name==='head_2'){
  const prior=p.getAttribute('POSITION'),now=q.getAttribute('POSITION'),norm=q.getAttribute('NORMAL'),weights=q.getAttribute('WEIGHTS_0'),joints=q.getAttribute('JOINTS_0'),weld=new Map();
  for(let i=0;i<now.getCount();i++){
   const a=prior.getElement(i,[]),b=now.getElement(i,[]),nn=norm.getElement(i,[]),w=weights.getElement(i,[]),j=joints.getElement(i,[]),d=Math.hypot(...b.map((v,k)=>v-a[k]));
   for(const v of [...a,...b,...nn,...w,...j])assert.ok(Number.isFinite(v));near(Math.hypot(...nn),1,2e-5);near(w.reduce((m,v)=>m+v,0),1,2e-5);for(const id of j)assert.ok(id>=0&&id<22);
   if(d>.001)changed++;if(d>1e-6&&(a[1]<.65||a[1]>1.10))outside++;maxDelta=Math.max(maxDelta,d);
   const key=a.map(v=>Math.round(v*1e6)).join(','),last=weld.get(key);if(last){seamPairs++;for(let j=0;j<3;j++)maxSeam=Math.max(maxSeam,Math.abs(last[j]-b[j]))}else weld.set(key,b);
  }
 }
}
assert.equal(outside,0);assert.ok(changed>100&&maxDelta<.03);assert.ok(seamPairs>900&&maxSeam<2e-5);console.log(`PASS: unchanged skeleton, inverse binds, indices, textures, all morphs and skin weights; prior surface preserved. ${changed} >1mm changes, max ${(maxDelta*1000).toFixed(2)} mm, ${seamPairs} coincident seams`);
assert.equal(old.listAnimations().length,46);assert.deepEqual(fresh.listAnimations().map(x=>x.getName()),[...old.listAnimations().map(x=>x.getName()),'Polish_Walk','Polish_Run']);
function checkEquivalent(a,b,skip=()=>false){const x=a.listChannels(),y=b.listChannels();assert.equal(x.length,y.length,a.getName());for(let i=0;i<x.length;i++){let ca=x[i],cb=y[i],sa=ca.getSampler(),sb=cb.getSampler();assert.equal(ca.getTargetNode().getName(),cb.getTargetNode().getName());assert.equal(ca.getTargetPath(),cb.getTargetPath());assert.equal(sa.getInterpolation(),sb.getInterpolation());assert.equal(digest(sa.getInput()),digest(sb.getInput()));if(!skip(ca))assert.equal(digest(sa.getOutput()),digest(sb.getOutput()),a.getName()+' '+ca.getTargetNode().getName()+' '+ca.getTargetPath())}}
for(const a of old.listAnimations())checkEquivalent(a,animation(fresh,a.getName()));
checkEquivalent(animation(old,'Library_Walk'),animation(fresh,'Polish_Walk'),c=>/^Rig_(UpperArm|Forearm|Hand)_[LR]$/.test(c.getTargetNode().getName())||c.getTargetPath()==='weights');
checkEquivalent(animation(old,'Library_Run'),animation(fresh,'Polish_Run'),c=>['Rig_Neck','Rig_Head'].includes(c.getTargetNode().getName()));
const ch=(a,n,t)=>a.listChannels().find(c=>c.getTargetNode().getName()===n&&c.getTargetPath()===t).getSampler();
const w1=ch(animation(old,'Library_Walk'),'head_2','weights').getOutput().getArray(),w2=ch(animation(fresh,'Polish_Walk'),'head_2','weights').getOutput().getArray();assert.equal(w1.length,w2.length);for(let i=0;i<w1.length;i++)if(![2,3].includes(i%20))assert.equal(w1[i],w2[i]);
for(const name of ['Polish_Walk','Polish_Run'])for(const channel of animation(fresh,name).listChannels()){
 const sampler=channel.getSampler(),N=sampler.getInput().getCount(),out=sampler.getOutput().getArray(),width=channel.getTargetPath()==='rotation'?4:channel.getTargetPath()==='weights'?20:3;assert.equal(out.length,N*width);for(const v of out)assert.ok(Number.isFinite(v));for(let k=0;k<width;k++)near(out[k],out[(N-1)*width+k],2e-6);if(width===4)for(let i=0;i<N;i++)near(Math.hypot(...out.subarray(4*i,4*i+4)),1,2e-6);
}
// Product preservation at every keyed run pose; sample interpolation midpoints
// too, because multiplying separately interpolated tracks is not exactly equal.
const oldRun=animation(old,'Library_Run'),newRun=animation(fresh,'Polish_Run'),samplers=[ch(oldRun,'Rig_Neck','rotation'),ch(oldRun,'Rig_Head','rotation'),ch(newRun,'Rig_Neck','rotation'),ch(newRun,'Rig_Head','rotation')],q=(a,i)=>new Quaternion().fromArray(a.getOutput().getElement(i,[])).normalize();let maxKey=0,maxMid=0;
for(let i=0;i<samplers[0].getInput().getCount()-1;i++)for(const [f,type] of [[0,'key'],[.5,'mid']]){let qs=samplers.map(s=>q(s,i).slerp(q(s,i+1),f));let error=qs[0].clone().multiply(qs[1]).angleTo(qs[2].clone().multiply(qs[3]));if(type==='key')maxKey=Math.max(maxKey,error);else maxMid=Math.max(maxMid,error)}assert.ok(maxKey<2e-6&&maxMid<.001);console.log(`PASS: all 46 original clips identical; new cycles closed. Walk legs/body and run except neck/head unchanged; rotation-product error ${(maxKey*180/Math.PI).toFixed(5)}° keys, ${(maxMid*180/Math.PI).toFixed(5)}° midpoints`);
for(const [name,bytes,expected] of [['old',oldBytes,46],['new',newBytes,48]]){const r=await validator.validateBytes(new Uint8Array(bytes),{uri:name+'.glb'});assert.equal(r.issues.numErrors,0);assert.equal(r.issues.numWarnings,0);assert.equal(r.info.animationCount,expected);console.log(`PASS glTF Validator ${name}: ${r.issues.numErrors} errors, ${r.issues.numWarnings} warnings, ${r.issues.numInfos} informational`)}
