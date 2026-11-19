// A reversible, model-specific polish of the immediately preceding library
// delivery. The source Quaternius walk/jog and timings remain the foundation;
// this is NOT an untouched stock animation.
import {Accessor,NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {Euler,Quaternion,Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../..');
const SOURCE_SHA='14fb12a55c690b3919a66c07d3e9715da568fa13bbf7e945538bf0ab4a4b8cd0';
const hash=b=>createHash('sha256').update(b).digest('hex');
if(process.argv.length!==4)throw Error('Usage: node author.mjs previous.glb trial.glb');
const input=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);
if(input===output||(output.startsWith(ROOT+path.sep)&&!output.startsWith(path.join(ROOT,'work/male-gait-polish')+path.sep)))throw Error('Refusing to overwrite unrelated files');
const bytes=fs.readFileSync(input);if(hash(bytes)!==SOURCE_SHA)throw Error('Previous delivery does not match expected hash');
const io=new NodeIO(),doc=await io.readBinary(bytes),root=doc.getRoot(),buffer=root.listBuffers()[0];
const node=name=>{const x=root.listNodes().filter(n=>n.getName()===name);if(x.length!==1)throw Error('Expected one node '+name);return x[0]};
const clip=name=>{const x=root.listAnimations().filter(n=>n.getName()===name);if(x.length!==1)throw Error('Expected one clip '+name);return x[0]};
const channel=(animation,name,target='rotation')=>{const x=animation.listChannels().filter(c=>c.getTargetNode().getName()===name&&c.getTargetPath()===target);if(x.length!==1)throw Error('Missing channel '+animation.getName()+' '+name+' '+target);return x[0]};
const quaternion=(a,i)=>new Quaternion().fromArray(a.getElement(i,[])).normalize();
const writeRotation=(sampler,array,name)=>sampler.setOutput(doc.createAccessor(name,buffer).setType(Accessor.Type.VEC4).setArray(array));
function duplicate(source,name){
 const animation=doc.createAnimation(name);
 for(const c of source.listChannels()){
  const old=c.getSampler(),sampler=doc.createAnimationSampler().setInput(old.getInput()).setOutput(old.getOutput()).setInterpolation(old.getInterpolation());
  animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(c.getTargetNode()).setTargetPath(c.getTargetPath()).setSampler(sampler));
 }
 return animation;
}
// Preserve the prior complete cycles in the GLB for a fair side-by-side viewer.
const walk=duplicate(clip('Library_Walk'),'Polish_Walk'),run=duplicate(clip('Library_Run'),'Polish_Run');
for(const side of ['L','R'])for(const part of ['UpperArm','Forearm','Hand']){
 const name='Rig_'+part+'_'+side,s=channel(walk,name).getSampler(),source=s.getOutput(),N=source.getCount(),values=new Float32Array(N*4);let previous;
 for(let i=0;i<N;i++){
  let q=quaternion(source,i);
  if(part==='UpperArm'){
   // The last 22-degree outward clearance looked aggressive. Restore two
   // degrees while retaining the Quaternius shoulder and upper-arm swing.
   q.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),(side==='L'?-1:1)*2*Math.PI/180));
  }else{
   const e=new Euler().setFromQuaternion(q,'XYZ');
   if(part==='Forearm'){e.y*=.2;e.z*=.2}else{e.x=0;e.y=0;e.z=0}
   q=new Quaternion().setFromEuler(e);
  }
  q.normalize();if(previous&&previous.dot(q)<0)q.set(-q.x,-q.y,-q.z,-q.w);q.toArray(values,i*4);previous=q;
 }
 values.set(values.subarray(0,4),(N-1)*4);writeRotation(s,values,'Polish_Walk_'+name);
}
// Recalculate elbow corrective weights from the adjusted forearm keys. Do not
// affect the thighs, leg thickness, feet, or the old walk morph track.
const wc=channel(walk,'head_2','weights'),ws=wc.getSampler(),weights=Float32Array.from(ws.getOutput().getArray()),frames=ws.getInput().getCount();
const correct=a=>Math.min(1.15,(1-Math.cos(a/2))/(1-Math.cos(100*Math.PI/360)));
for(let i=0;i<frames;i++)for(const [side,column] of [['L',2],['R',3]]){
 const fore=node('Rig_Forearm_'+side),hand=node('Rig_Hand_'+side),rot=quaternion(channel(walk,fore.getName()).getSampler().getOutput(),i);
 const before=new Vector3().fromArray(fore.getTranslation()).normalize(),after=new Vector3().fromArray(hand.getTranslation()).applyQuaternion(rot).normalize();
 weights[i*20+column]=correct(before.angleTo(after));
}
weights.set(weights.subarray(0,20),(frames-1)*20);
ws.setOutput(doc.createAccessor('Polish_Walk_morphs',buffer).setType(Accessor.Type.SCALAR).setArray(weights));

// No jaw joint exists. In the prior jog the chin/neck weights straddle a
// strongly twisting head. Transfer the head's local Y twist to the neck,
// preserving neck * head at every authored key so the head's overall rotation
// remains nearly identical between them as well. This is limited to the jog.
const ns=channel(run,'Rig_Neck').getSampler(),hs=channel(run,'Rig_Head').getSampler(),na=ns.getOutput(),ha=hs.getOutput(),N=ha.getCount();
if(na.getCount()!==N||ns.getInput().getCount()!==hs.getInput().getCount())throw Error('Head and neck timings differ');
const nv=new Float32Array(N*4),hv=new Float32Array(N*4);let previousNeck,previousHead,maxKeyError=0,maxTransfer=0;
for(let i=0;i<N;i++){
 const neck=quaternion(na,i),head=quaternion(ha,i),twist=new Quaternion(0,head.y,0,head.w).normalize();if(twist.w<0)twist.set(-twist.x,-twist.y,-twist.z,-twist.w);
 const n=neck.clone().multiply(twist).normalize(),h=twist.clone().invert().multiply(head).normalize();
 maxKeyError=Math.max(maxKeyError,neck.clone().multiply(head).angleTo(n.clone().multiply(h)));
 maxTransfer=Math.max(maxTransfer,2*Math.acos(Math.min(1,Math.abs(twist.w)))*180/Math.PI);
 if(previousNeck&&previousNeck.dot(n)<0)n.set(-n.x,-n.y,-n.z,-n.w);if(previousHead&&previousHead.dot(h)<0)h.set(-h.x,-h.y,-h.z,-h.w);
 n.toArray(nv,4*i);h.toArray(hv,4*i);previousNeck=n;previousHead=h;
}
nv.set(nv.subarray(0,4),4*(N-1));hv.set(hv.subarray(0,4),4*(N-1));writeRotation(ns,nv,'Polish_Run_neck');writeRotation(hs,hv,'Polish_Run_head');

// Small continuous rest-mesh correction at the front/rear perineal transition
// and rear contours. Retain the prior indices, rig, weights and leg volume.
// Both original positions and normals are retained for the old comparison.
const mesh=node('head_2').getMesh(),body=mesh.listPrimitives()[0],p=body.getAttribute('POSITION'),n=body.getAttribute('NORMAL'),index=body.getIndices(),count=p.getCount();
const packed=(a,w)=>{const array=new Float32Array(count*w);for(let i=0;i<count;i++)array.set(a.getElement(i,[]),i*w);return array};
const oldPosition=packed(p,3),oldNormal=packed(n,3),shaped=Float32Array.from(oldPosition);
body.setAttribute('_POLISH_OLD_POSITION',doc.createAccessor('Polish_previous_positions',buffer).setType(Accessor.Type.VEC3).setArray(oldPosition));
body.setAttribute('_POLISH_OLD_NORMAL',doc.createAccessor('Polish_previous_normals',buffer).setType(Accessor.Type.VEC3).setArray(oldNormal));
const sm=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)},gauss=x=>Math.exp(-x*x);let changed=0,maxDelta=0;
for(let i=0;i<count;i++){
 const k=3*i,x=oldPosition[k],y=oldPosition[k+1],z=oldPosition[k+2],rear=sm(-.015,.025,-z),front=sm(.02,.055,z);
 const center=gauss(x/.06)*gauss((y-.905)/.055),lobes=gauss((Math.abs(x)-.085)/.075)*gauss((y-.87)/.10),f=gauss(x/.065)*gauss((y-.882)/.045);
 const window=sm(.65,.72,y)*(1-sm(1.02,1.10,y));
 const dy=window*(-.012*center*rear-.002*f*front),dz=window*(-.023*center*rear-.008*lobes*rear+.004*f*front);shaped[k+1]+=dy;shaped[k+2]+=dz;
 const distance=Math.hypot(dy,dz);if(distance>.001)changed++;maxDelta=Math.max(maxDelta,distance);
}
// Transport smooth normals by the area-weighted change of adjacent faces,
// preserving split UV/normal seams exactly as in the previous authoring pass.
const groups=new Map(),ids=new Int32Array(count);let groupCount=0;
for(let i=0;i<count;i++){let k=3*i,key=[...Array.from(oldPosition.subarray(k,k+3),v=>Math.round(v*1e6)),...Array.from(oldNormal.subarray(k,k+3),v=>Math.round(v*100))].join(',');if(!groups.has(key))groups.set(key,groupCount++);ids[i]=groups.get(key)}
const beforeFaces=new Float64Array(groupCount*3),afterFaces=new Float64Array(groupCount*3);
for(let i=0;i<index.getCount();i+=3){
 const face=[0,1,2].map(j=>index.getScalar(i+j)),v=(a,j)=>new Vector3().fromArray(a,3*j),before=face.map(j=>v(oldPosition,j)),after=face.map(j=>v(shaped,j));
 const a=before[1].clone().sub(before[0]).cross(before[2].clone().sub(before[0])),b=after[1].clone().sub(after[0]).cross(after[2].clone().sub(after[0]));
 for(const j of face){let k=ids[j]*3;beforeFaces[k]+=a.x;beforeFaces[k+1]+=a.y;beforeFaces[k+2]+=a.z;afterFaces[k]+=b.x;afterFaces[k+1]+=b.y;afterFaces[k+2]+=b.z}
}
const normals=Float32Array.from(oldNormal);
for(let i=0;i<count;i++){const k=3*ids[i],a=new Vector3().fromArray(beforeFaces,k).normalize(),b=new Vector3().fromArray(afterFaces,k).normalize();new Vector3().fromArray(oldNormal,3*i).add(b.sub(a)).normalize().toArray(normals,3*i)}
body.setAttribute('POSITION',doc.createAccessor('Polish_positions',buffer).setType(Accessor.Type.VEC3).setArray(shaped));
body.setAttribute('NORMAL',doc.createAccessor('Polish_normals',buffer).setType(Accessor.Type.VEC3).setArray(normals));
// Restore intentionally blank existing target names after glTF-Transform.
const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
for(const x of json.nodes.filter(n=>n.mesh!==undefined)){
 const names=json.meshes[x.mesh].extras?.targetNames;if(!names)continue;const targets=node(x.name).getMesh().listPrimitives()[0].listTargets();if(names.length!==targets.length)throw Error('Unexpected target count');names.forEach((name,i)=>targets[i].setName(name));
}
for(const array of [shaped,normals,weights,nv,hv])if(!Array.from(array).every(Number.isFinite))throw Error('Nonfinite geometry or animation');
const result=Buffer.from(await io.writeBinary(doc));fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,result);
console.log(JSON.stringify({sourceSha256:SOURCE_SHA,outputSha256:hash(result),bytes:result.length,sculpt:{changedOver1mm:changed,maxDisplacement:maxDelta},walk:{source:'Library_Walk (Quaternius Walk_Loop)',upperArmSpreadReductionDegrees:2,forearmYZScale:.2,handRest:true},run:{source:'Library_Run (Quaternius Jog_Fwd_Loop)',maxHeadTwistTransferDegrees:maxTransfer,maxRotationProductErrorRadians:maxKeyError},addedClips:['Polish_Walk','Polish_Run']},null,2));
