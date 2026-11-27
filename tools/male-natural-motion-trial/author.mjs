// Separate experiment. Transfer a small neutral 100STYLE mocap selection to
// the existing character; never overwrite the model or an earlier trial.
// BVH source is Y-up, centimetres, with +Z as its rest-facing direction.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {NodeIO} from '@gltf-transform/core';
import {AnimationMixer,Bone,Euler,Matrix4,Quaternion,Vector3} from 'three';
import {BVHLoader} from 'three/addons/loaders/BVHLoader.js';

const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const sources={
 model:['work/male-leg-volume/male_leg_volume_trial.glb','eb569ef2269a8d7e40378590614beebc933edd3bdcd7340f8146494ceb975484'],
 walk:['tools/male-natural-motion-trial/reference/neutral_fw.bvh','fb0aeb4ab1bb4c56beddd1a8be2f7c08715a30b84b01afa483cd2688d8d7fcc7'],
 run:['tools/male-natural-motion-trial/reference/neutral_fr.bvh','3dd4b51d154407896c12e9f9101316cd36b64c5f7e3712e6e38dc5a9c0e856ac'],
 arrive:['tools/male-natural-motion-trial/reference/neutral_arrive.bvh','5b90fda4aa1d6978b5bcfe30795f2a59855a0ad5c00f6b73f9a8c06316cb66be'],
 idle:['tools/male-natural-motion-trial/reference/neutral_idle.bvh','157d16771f59d05870d16394ef3b786835ec30b33dfc435016d54899fa6d4513'],
 cmu:['tools/male-natural-motion-trial/reference/cmu-104-56.bvh','a6ce9a6c822da5a1a767481718ca3f18e571ca44692d99ed4331b3e31471d848'],
};
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [name,[p,expected]] of Object.entries(sources))assert.equal(sha(path.join(repo,p)),expected,`Unexpected ${name}`);
const input={};for(const key of ['walk','run','arrive','idle','cmu']){
 const {skeleton,clip}=new BVHLoader().parse(fs.readFileSync(path.join(repo,sources[key][0]),'utf8'));
 const root=skeleton.bones[0],mixer=new AnimationMixer(root),action=mixer.clipAction(clip).play();action.paused=true;
 input[key]={skeleton,clip,root,mixer,action};
}
const srcNames=['Hips','Chest2','Chest4','Neck','Head',...['Left','Right'].flatMap(s=>[s+'Hip',s+'Knee',s+'Ankle',s+'Toe',s+'Shoulder',s+'Elbow',s+'Wrist'])];
const up=new Vector3(0,1,0),forward=new Vector3(0,0,1),rad=x=>x*Math.PI/180;
function sourceAt(take,frame){
 const {skeleton,clip,root,mixer,action}=input[take],seconds=frame*(take==='cmu'?0.0083333:0.016667);
 assert.ok(seconds>=0&&seconds<=clip.duration+1e-4,`Frame ${frame} is outside ${take}`);
 action.time=Math.min(seconds,clip.duration-1e-7);mixer.update(0);
 const travel=root.position.clone(),facing=forward.clone().applyQuaternion(root.quaternion),yaw=Math.atan2(facing.x,facing.z);
 // Remove yaw and global translation. The game controls route and facing.
 // Source pitch/roll, limb directions and the changes in height remain.
 root.position.set(0,0,0);root.quaternion.premultiply(new Quaternion().setFromAxisAngle(up,-yaw)).normalize();root.updateMatrixWorld(true);
 const alias={Chest2:'Spine',Chest4:'Spine1',Neck:'Neck1',LeftHip:'LeftUpLeg',RightHip:'RightUpLeg',LeftKnee:'LeftLeg',RightKnee:'RightLeg',
  LeftAnkle:'LeftFoot',RightAnkle:'RightFoot',LeftToe:'LeftToeBase',RightToe:'RightToeBase',LeftShoulder:'LeftArm',RightShoulder:'RightArm',
  LeftElbow:'LeftForeArm',RightElbow:'RightForeArm',LeftWrist:'LeftHand',RightWrist:'RightHand'};
 const P={},Q={};for(const name of srcNames){const b=skeleton.getBoneByName(take==='cmu'?(alias[name]||name):name);assert.ok(b,name);P[name]=b.getWorldPosition(new Vector3());Q[name]=b.getWorldQuaternion(new Quaternion()).normalize()}
 return {travel,yaw,P,Q,take};
}
const gltf=(await new NodeIO().read(path.join(repo,sources.model[0]))).getRoot();
const nodes=gltf.listSkins()[0].listJoints(),names=nodes.map(n=>n.getName());assert.equal(names.length,52);
const bones=new Map(nodes.map(n=>{const b=new Bone();b.name=n.getName();return [b.name,b]}));
for(const n of nodes){const p=n.getParentNode();if(p&&bones.has(p.getName()))bones.get(p.getName()).add(bones.get(n.getName()))}
const root=bones.get('Rig_Root'),bone=n=>{const b=bones.get('Rig_'+n);assert.ok(b,n);return b};
function reset(){for(const n of nodes){const b=bones.get(n.getName());b.position.fromArray(n.getTranslation());b.quaternion.fromArray(n.getRotation()).normalize();b.scale.fromArray(n.getScale())}root.updateMatrixWorld(true)}
const P=b=>b.getWorldPosition(new Vector3()),Q=b=>b.getWorldQuaternion(new Quaternion()).normalize();
function setWorld(b,q){b.quaternion.copy(Q(b.parent).invert().multiply(q)).normalize();root.updateMatrixWorld(true)}
function align(b,child,target){const now=P(child).sub(P(b)).normalize(),want=target.clone().normalize();setWorld(b,new Quaternion().setFromUnitVectors(now,want).multiply(Q(b)))}
// Keep the existing hand/finger pose: the BVH only goes as far as wrists.
const walk=gltf.listAnimations().find(a=>a.getName()==='Walk_Game_Trial');assert.ok(walk);
const fingerTracks=walk.listChannels().filter(c=>c.getTargetNode().getName().startsWith('Rig_Finger')).map(c=>({
 name:c.getTargetNode().getName(),time:c.getSampler().getInput().getArray(),values:c.getSampler().getOutput().getArray()}));
assert.equal(fingerTracks.length,30);
function fingerAt(t){const time=.25*t.time.at(-1);let i=0;while(i+1<t.time.length&&t.time[i+1]<time)i++;
 const j=Math.min(i+1,t.time.length-1),u=i===j?0:(time-t.time[i])/(t.time[j]-t.time[i]);return new Quaternion().fromArray(t.values,4*i).slerp(new Quaternion().fromArray(t.values,4*j),u).normalize()}
const body=gltf.listNodes().find(n=>n.getName()==='NewBody'),primitive=body?.getMesh()?.listPrimitives()[0],skin=gltf.listSkins()[0];assert.ok(primitive&&body.getSkin());
const pos=primitive.getAttribute('POSITION'),joints=primitive.getAttribute('JOINTS_0'),weights=primitive.getAttribute('WEIGHTS_0');
const inv=nodes.map((_,i)=>new Matrix4().fromArray(skin.getInverseBindMatrices().getElement(i,[]))),matrices=nodes.map(()=>new Matrix4()),sole=[];
for(let i=0;i<pos.getCount();i++){const p=pos.getElement(i,[]);if(p[1]<.16&&Math.abs(p[0])>.035&&Math.abs(p[0])<.25)sole.push({p,j:joints.getElement(i,[]),w:weights.getElement(i,[])})}
assert.ok(sole.length>100);
function floorMin(){root.updateMatrixWorld(true);for(let i=0;i<nodes.length;i++)matrices[i].multiplyMatrices(bones.get(names[i]).matrixWorld,inv[i]);let min=Infinity;
 for(const v of sole){let y=0;for(let k=0;k<4;k++)if(v.w[k]){const e=matrices[v.j[k]].elements;y+=v.w[k]*(e[1]*v.p[0]+e[5]*v.p[1]+e[9]*v.p[2]+e[13])}min=Math.min(min,y)}return min}
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)},round=x=>Math.round(x*1e7)/1e7;
const reference=sourceAt('idle',140),idleHeight=reference.travel.y;
function upperRotation(q,part,cmu=false){
 // The 100STYLE arrival includes a pronounced look down and sideways slump.
 // Transfer motion but rein it in for a neutral game stance. The CMU source
 // has a different skeleton and does not need the same neck/head offset.
 const e=new Euler().setFromQuaternion(q,'YXZ'),limit=(x,degrees)=>Math.max(-rad(degrees),Math.min(rad(degrees),x));
 if(part==='Spine')e.z=limit(e.z,5);
 if(part==='Chest')e.z=limit(e.z,5);
 if(part==='Neck'){e.x=Math.max(-rad(5),Math.min(rad(15),e.x-rad(cmu?0:10)));e.y=limit(e.y,15);e.z=limit(e.z,5)}
 if(part==='Head'){e.x=Math.max(-rad(8),Math.min(rad(10),e.x-rad(cmu?4:18)));e.y=limit(e.y,12);e.z=limit(e.z,5)}
 return new Quaternion().setFromEuler(e).normalize();
}
function apply(source){
 reset();
 setWorld(bone('Hips'),source.Q.Hips);
 for(const [target,src] of [['Spine','Chest2'],['Chest','Chest4'],['Neck','Neck'],['Head','Head']])setWorld(bone(target),upperRotation(source.Q[src],target,source.take==='cmu'));
 for(const [side,src] of [['L','Left'],['R','Right']]){
  const thigh=bone('Thigh_'+side),shin=bone('Shin_'+side),foot=bone('Foot_'+side);
  align(thigh,shin,source.P[src+'Knee'].clone().sub(source.P[src+'Hip']));
  align(shin,foot,source.P[src+'Ankle'].clone().sub(source.P[src+'Knee']));
  // The CMU subject's BVH foot basis has a large constant roll in a level
  // stance. Correct that basis before assigning it to the target's flat feet.
  // Preserve 100STYLE's own foot orientation (not its different toe offset).
  let footQ=source.Q[src+'Ankle'];
  if(source.take==='cmu'){
   const e=new Euler().setFromQuaternion(footQ,'YXZ');e.z+=rad(side==='L'?18:-18);
   e.z=Math.max(-rad(8),Math.min(rad(8),e.z));footQ=new Quaternion().setFromEuler(e);
  }
  setWorld(foot,footQ);
  const upper=bone('UpperArm_'+side),fore=bone('Forearm_'+side),hand=bone('Hand_'+side);
  // The target body is wider than the mocap performer. Bias the arm slightly
  // outwards to reduce fingers intersecting the hip after retargeting. The
  // source still drives the swing; this is an explicit artistic edit.
  const upperDir=source.P[src+'Elbow'].clone().sub(source.P[src+'Shoulder']).normalize();
  const foreDir=source.P[src+'Wrist'].clone().sub(source.P[src+'Elbow']).normalize();
  upperDir.x+=(side==='L'?1:-1)*.12;foreDir.x+=(side==='L'?1:-1)*.17;
  align(upper,fore,upperDir);
  align(fore,hand,foreDir);
 }
 for(const t of fingerTracks)bones.get(t.name).quaternion.copy(fingerAt(t));root.updateMatrixWorld(true);
}
apply(reference);const idleBase=.002-floorMin();
const cmuReference=sourceAt('cmu',260),cmuIdleHeight=cmuReference.travel.y;
apply(cmuReference);const cmuBase=.002-floorMin();
let maxLift=0,maxDrop=0;
function retarget(source,lateral=0,runPhase=null){
 apply(source);
 if(runPhase!==null){
  // This take's forward swing brings the toe very close to the floor while
  // moving quickly. Add a modest dorsiflexion only through the swing; the
  // knee directions are untouched. Fade it before the next landing.
  const wrap=x=>((x%1)+1)%1;
  for(const side of ['L','R']){
   const p=wrap(runPhase+(side==='R'?.5:0));
   const strength=smooth((p-.48)/.09)*(1-smooth((p-.70)/.09));
   const foot=bone('Foot_'+side),turn=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-rad(12)*strength);
   setWorld(foot,turn.multiply(Q(foot)));
  }
 }
 const cmu=source.take==='cmu',scale=cmu?.056444:.01;
 root.position.set(lateral,(cmu?cmuBase:idleBase)+(source.travel.y-(cmu?cmuIdleHeight:idleHeight))*scale,0);root.updateMatrixWorld(true);
 // Gently fit the support to a flat floor. Do not pull a running flight
 // phase down: this is a height guard, not a contact/physics simulation.
 const before=floorMin(),toeY=Math.min(source.travel.y+source.P.LeftToe.y,source.travel.y+source.P.RightToe.y)*scale;
 const onGround=toeY<(cmu?.075:.032);let correction=Math.max(0,.002-before);
 if(onGround&&before>.006)correction=Math.max(-.025,.002-before);
 root.position.y+=correction;root.updateMatrixWorld(true);maxLift=Math.max(maxLift,correction);maxDrop=Math.min(maxDrop,correction);
 return {root:root.position.toArray(),rotations:new Map(names.filter(n=>n!=='Rig_Root').map(n=>[n,bones.get(n).quaternion.clone()]))};
}
function blend(a,b,u){return {root:a.root.map((x,j)=>x+(b.root[j]-x)*u),rotations:new Map([...a.rotations].map(([n,q])=>[n,q.clone().slerp(b.rotations.get(n),u).normalize()]))}}
function mirrored(p){const swap=n=>n.endsWith('_L')?n.slice(0,-2)+'_R':n.endsWith('_R')?n.slice(0,-2)+'_L':n;
 const rotations=new Map();for(const n of names.filter(n=>n!=='Rig_Root')){const q=p.rotations.get(swap(n));rotations.set(n,new Quaternion(q.x,-q.y,-q.z,q.w).normalize())}
 return {root:[-p.root[0],p.root[1],p.root[2]],rotations}}
function spec(name,poses,duration){const times=poses.map((_,i)=>round(duration*i/(poses.length-1))),tracks=[{name:'Rig_Root.position',type:'vector',times,values:poses.flatMap(p=>p.root.map(round))}];
 for(const n of names.filter(n=>n!=='Rig_Root')){let previous=null;const values=[];for(const p of poses){const q=p.rotations.get(n).clone();if(previous&&previous.dot(q)<0)q.set(-q.x,-q.y,-q.z,-q.w);values.push(...q.toArray().map(round));previous=q}tracks.push({name:n+'.quaternion',type:'quaternion',times,values})}
 return {name,duration:round(duration),tracks}}
function cycle(name,take,from,to,duration){
 const steps=Math.round(duration*60),out=[];
 for(let i=0;i<=steps;i++){
  const p=i/steps,frame=from+(to-from)*p;let pose=retarget(sourceAt(take,frame),0,take==='run'?p:null);
  // Crossfade the final 12% to the *preceding* source frames. Matching the
  // derivative at the loop seam is preferable to freezing the first frame.
  if(p>.88){const earlier=from+(frame-to);pose=blend(pose,retarget(sourceAt(take,earlier),0,take==='run'?(earlier-from)/(to-from):null),smooth((p-.88)/.12))}
  out.push(pose);
 }
 out[steps]=out[0];return spec(name,out,duration);
}
// Walk and jog are real, separate Neutral captures. We retain original timing
// here; runtime scales phase from actual controller speed.
const walkClip=cycle('Neutral_Walk', 'walk',28,112,84/60);
// The local run excerpt starts at original frame 480: frames 21..69 = 501..549.
const runClip=cycle('Neutral_Run','run',21,69,48/60);
// A calmer, upright portion of Neutral_ID (original frames 800..1000), rather
// than the arrival's heavily tilted end. Crossfade to the preceding source.
const idle=cycle('Neutral_Idle','idle',40,240,200/60);
const stopFrames=[];for(let f=138;f<=240;f++)stopFrames.push(retarget(sourceAt('arrive',f)));
const stop=spec('Neutral_Stop',stopFrames,102/60),stopMirror=spec('Neutral_Stop_Mirror',stopFrames.map(mirrored),102/60);
// A separate straight run-to-stop from CMU subject 104, trial 56 (120 Hz).
// The two skeletons and two recording systems are different; this is a
// direction-based retarget, then downsampled to 60 Hz and optionally mirrored.
const runStopFrames=[];for(let f=100;f<=270;f+=2)runStopFrames.push(retarget(sourceAt('cmu',f)));
const runStop=spec('CMU_Run_Stop',runStopFrames,170/120),runStopMirror=spec('CMU_Run_Stop_Mirror',runStopFrames.map(mirrored),170/120);
// Smooth each take's root travel to a nonincreasing speed profile. The
// controller owns position; the two curves are only guides for deceleration.
function speedAt(take,frame){const cmu=take==='cmu',limit=cmu?368:357,fps=cmu?120:60,scale=cmu?.056444:.01;
 const a=sourceAt(take,Math.max(0,frame-5)).travel,b=sourceAt(take,Math.min(limit,frame+5)).travel;
 return Math.hypot(b.x-a.x,b.z-a.z)*scale*fps/10}
function speedCurve(start,kind){const n=96,from=start,to=kind==='run'?270:240,take=kind==='run'?'cmu':'arrive',raw=[];
 for(let i=0;i<=n;i++)raw.push(speedAt(take,from+(to-from)*i/n));
 const first=Math.max(raw[0],.3),velocity=[];for(let i=0;i<=n;i++)velocity.push(Math.min(i?velocity[i-1]:1,Math.max(0,raw[i]/first)));
 velocity[n]=0;const integral=[0];for(let i=1;i<=n;i++)integral.push(integral[i-1]+(velocity[i-1]+velocity[i])/(2*n));
 const recorded=(to-from)/(kind==='run'?120:60),nominalDuration=kind==='run'?recorded*.98:Math.min(1.12,recorded*.72);
 return {velocity:velocity.map(round),integral:integral.map(round),area:round(integral[n]),nominalDuration:round(nominalDuration)};
}
const walks=[138,142,146,150,154,158,162],runs=[100,110,120,130];
const curves={walk:{from:138,to:240,variants:Object.fromEntries(walks.map(s=>[s,speedCurve(s,'walk')]))},
 run:{from:100,to:270,variants:Object.fromEntries(runs.map(s=>[s,speedCurve(s,'run')]))}};
const data={modelSha256:sources.model[1],sources:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,{path:v[0],sha256:v[1]}])),
 notes:'100STYLE Neutral (Xsens, 60 Hz) for idle, gait and walk stop; CMU 104_56 (120 Hz) for run stop. Both retargeted to a different skeleton, yaw and travel removed; cycles cut/crossfaded, head tilt limited, arms widened to fit this body, feet and height adapted, run toe pitch raised by up to 12 degrees in swing; CMU foot roll calibrated. Stops are retimed and mirrored. Runtime blends and vertically guards the result; it is not physical contact.',
 stats:{idleBase,cmuBase,maximumBakedLift:maxLift,maximumBakedDrop:maxDrop},clips:[idle,walkClip,runClip,stop,stopMirror,runStop,runStopMirror],curves};
const out=process.argv[2]?path.resolve(process.argv[2]):path.join(here,'clips.json');
if(out===repo||(out.startsWith(repo+path.sep)&&out!==path.join(here,'clips.json')))throw Error('Refusing to overwrite another repository artifact');
fs.writeFileSync(out,JSON.stringify(data)+'\n');console.log(JSON.stringify(data.stats,null,2));
