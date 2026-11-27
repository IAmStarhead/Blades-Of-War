// Retarget a small set of pinned HumanMotionCraft animations to the existing
// 52-bone character. This is an authored adaptation, not unchanged motion
// capture: HumanMotionCraft describes the stop clips as Kimodo-generated.
// Neither the input GLB nor any previously delivered scene is modified.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {NodeIO} from '@gltf-transform/core';
import {Bone,Matrix4,Quaternion,Vector3} from 'three';

const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const sources={
  model:['work/male-leg-volume/male_leg_volume_trial.glb','eb569ef2269a8d7e40378590614beebc933edd3bdcd7340f8146494ceb975484'],
  rig:['tools/male-leg-human-trial/reference/hmc-rig.json','24979f497bc7b75eaea811cd078ddb6d1d054be305fa2c1712a3e14605f60d73'],
  idle:['tools/male-idle-stop-trial/reference/idle.json','c72b12a0938a28fc9889f95eed9bf6becb57e58133b56435a847dcce8bdf2445'],
  stopRun:['tools/male-idle-stop-trial/reference/stop-7.json','56b150339dd41fa48569895080653b048ce0baa751480ccfd608bb7ad65845f2'],
  stopWalk:['tools/male-idle-stop-trial/reference/stop-8.json','13a40f6cc4112ee46133f79eba3bba31de26f08575df48b1ad12298f4ef811b0'],
};
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const [name,[file,sha]] of Object.entries(sources))assert.equal(hash(path.join(repo,file)),sha,`Unexpected ${name}: ${file}`);
const rig=JSON.parse(fs.readFileSync(path.join(repo,sources.rig[0])));
const input={};for(const name of ['idle','stopRun','stopWalk']){
  input[name]=JSON.parse(fs.readFileSync(path.join(repo,sources[name][0])));
  assert.equal(input[name].bones.join('|'),rig.names.join('|'),`Different source rig for ${name}`);
}
assert.equal(input.idle.origin,'osb');assert.equal(input.stopRun.dataset,'kimodo');assert.equal(input.stopWalk.dataset,'kimodo');
const gltf=(await new NodeIO().read(path.join(repo,sources.model[0]))).getRoot();
const nodes=gltf.listSkins()[0].listJoints(),names=nodes.map(n=>n.getName());assert.equal(names.length,52);
const bones=new Map(nodes.map(n=>{const b=new Bone();b.name=n.getName();return [b.name,b]}));
for(const n of nodes){const p=n.getParentNode();if(p&&bones.has(p.getName()))bones.get(p.getName()).add(bones.get(n.getName()));}
const root=bones.get('Rig_Root'),bone=n=>{const b=bones.get('Rig_'+n);assert.ok(b,n);return b};
const reset=()=>{for(const n of nodes){const b=bones.get(n.getName());b.position.fromArray(n.getTranslation());b.quaternion.fromArray(n.getRotation()).normalize();b.scale.fromArray(n.getScale());}root.updateMatrixWorld(true)};
const P=b=>b.getWorldPosition(new Vector3()),Q=b=>b.getWorldQuaternion(new Quaternion()).normalize();
function setWorld(b,q){b.quaternion.copy(Q(b.parent).invert().multiply(q)).normalize();root.updateMatrixWorld(true)}
function align(b,child,target){
  const now=P(child).sub(P(b)).normalize(),want=target.clone().normalize();
  setWorld(b,new Quaternion().setFromUnitVectors(now,want).multiply(Q(b)));
}
const index=new Map(rig.names.map((n,i)=>[n,i])),heads=rig.heads.map(x=>new Vector3().fromArray(x));
const conversion=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-Math.PI/2),inverse=conversion.clone().invert();
const vec=v=>v.clone().applyQuaternion(conversion),rot=q=>conversion.clone().multiply(q).multiply(inverse).normalize();
const zAxis=new Vector3(0,0,1),xAxis=new Vector3(1,0,0);
function sourceAt(clip,frame){
  const keys=clip.keys;assert.ok(frame>=keys[0].frame-1e-7&&frame<=keys.at(-1).frame+1e-7);
  let i=0;while(i+1<keys.length&&keys[i+1].frame<frame)i++;
  const a=keys[i],b=keys[Math.min(i+1,keys.length-1)],u=a===b?0:(frame-a.frame)/(b.frame-a.frame);
  const rotations=a.rotations.map((v,j)=>new Quaternion().fromArray(v).slerp(new Quaternion().fromArray(b.rotations[j]),u).normalize());
  // The actor supplies travel/yaw. Remove capture yaw, but retain the lean.
  const heading=new Vector3(1,0,0).applyQuaternion(rotations[0]);
  rotations[0].premultiply(new Quaternion().setFromAxisAngle(zAxis,-Math.atan2(heading.y,heading.x))).normalize();
  const R=[],positions=[];
  for(let j=0;j<rig.names.length;j++){
    const parent=rig.parents[j];
    if(parent<0){R[j]=rotations[j];positions[j]=heads[j].clone()}
    else{R[j]=R[parent].clone().multiply(rotations[j]);positions[j]=heads[j].clone().sub(heads[parent]).applyQuaternion(R[parent]).add(positions[parent])}
  }
  return {R,P:positions,root:a.root.map((x,j)=>x+u*(b.root[j]-x))};
}
const walk=gltf.listAnimations().find(a=>a.getName()==='Walk_Game_Trial');assert.ok(walk);
const fingerTracks=walk.listChannels().filter(c=>c.getTargetNode().getName().startsWith('Rig_Finger')).map(c=>{
  const sampler=c.getSampler();return {name:c.getTargetNode().getName(),time:sampler.getInput().getArray(),values:sampler.getOutput().getArray()};
});assert.equal(fingerTracks.length,30);
function fingerAt(track,p){const time=p*track.time.at(-1);let k=0;while(k+1<track.time.length&&track.time[k+1]<time)k++;
  const j=Math.min(k+1,track.time.length-1),u=k===j?0:(time-track.time[k])/(track.time[j]-track.time[k]);
  return new Quaternion().fromArray(track.values,4*k).slerp(new Quaternion().fromArray(track.values,4*j),u).normalize();}
// Foot-region vertices for a conservative vertical safety correction. This is
// not horizontal foot locking or a ground contact solver.
const body=gltf.listNodes().find(n=>n.getName()==='NewBody'),primitive=body?.getMesh()?.listPrimitives()[0],skin=gltf.listSkins()[0];assert.ok(primitive&&body.getSkin());
const pos=primitive.getAttribute('POSITION'),joints=primitive.getAttribute('JOINTS_0'),weights=primitive.getAttribute('WEIGHTS_0');
const invBind=nodes.map((_,i)=>new Matrix4().fromArray(skin.getInverseBindMatrices().getElement(i,[]))),matrices=nodes.map(()=>new Matrix4()),sole=[];
for(let i=0;i<pos.getCount();i++){const p=pos.getElement(i,[]);if(p[1]<.16&&Math.abs(p[0])>.035&&Math.abs(p[0])<.25)sole.push({p,j:joints.getElement(i,[]),w:weights.getElement(i,[])});}
assert.ok(sole.length>100);
function floorMin(){root.updateMatrixWorld(true);for(let i=0;i<nodes.length;i++)matrices[i].multiplyMatrices(bones.get(names[i]).matrixWorld,invBind[i]);let min=Infinity;
  for(const v of sole){let y=0;for(let k=0;k<4;k++)if(v.w[k]){const e=matrices[v.j[k]].elements;y+=v.w[k]*(e[1]*v.p[0]+e[5]*v.p[1]+e[9]*v.p[2]+e[13])}min=Math.min(min,y)}return min;}
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
const rad=x=>x*Math.PI/180,round=x=>Math.round(x*1e7)/1e7;
function retarget(src,kind,progress,initial){
  reset();
  // Original X/Y travel is removed, except for a very small lateral body sway.
  const side=kind==='idle'?(src.root[0]-initial[0])*.8:0;
  // The generated stops' source toes sit about 2 cm above their ground in
  // their final stance. Correct that source offset before retargeting, while
  // leaving real airborne phases and the CC0 idle's grounded feet alone.
  root.position.set(side,-.009+(src.root[2]-.9213568297194298)*rig.hip_height+(kind==='idle'?0:-.022),0);
  root.updateMatrixWorld(true);
  const source=n=>index.get(n),sp=n=>src.P[source(n)];
  setWorld(bone('Hips'),rot(src.R[source('root')]));
  for(const [target,s] of [['Spine','spine03'],['Chest','spine01'],['Neck','neck01'],['Head','head']])setWorld(bone(target),rot(src.R[source(s)]));
  // Gentle breathing is authored on top of the source's slow weight shift.
  // Two breaths per six-second loop and counter-motion of neck/shoulders are
  // deliberately small; the arms and head do not simply bob in unison.
  if(kind==='idle'){
    const breathing=Math.sin(progress*4*Math.PI);
    bone('Spine').quaternion.multiply(new Quaternion().setFromAxisAngle(xAxis,rad(.30*breathing)));
    bone('Chest').quaternion.multiply(new Quaternion().setFromAxisAngle(xAxis,rad(1.05*breathing)));
    bone('Neck').quaternion.multiply(new Quaternion().setFromAxisAngle(xAxis,rad(-.42*breathing)));
    root.updateMatrixWorld(true);
  }
  for(const sideName of ['L','R']){
    const thigh=bone('Thigh_'+sideName),shin=bone('Shin_'+sideName),foot=bone('Foot_'+sideName);
    const [hip,knee,ankle]=['upperleg01','lowerleg01','foot'].map(n=>sp(n+'.'+sideName));
    align(thigh,shin,vec(knee.clone().sub(hip)));align(shin,foot,vec(ankle.clone().sub(knee)));
    setWorld(foot,rot(src.R[source('foot.'+sideName)]));
    const upper=bone('UpperArm_'+sideName),fore=bone('Forearm_'+sideName),hand=bone('Hand_'+sideName);
    const [shoulder,elbow,wrist]=['upperarm01','lowerarm01','wrist'].map(n=>sp(n+'.'+sideName));
    align(upper,fore,vec(elbow.clone().sub(shoulder)));align(fore,hand,vec(wrist.clone().sub(elbow)));
    // The generated running stop brings the wrist through this model's wider
    // hip as the arm drops. Gently widen the upper arm during that portion;
    // fade the adjustment in/out so it does not reset the source arm swing.
    if(kind==='run'){
      const spread=7*smooth((progress-.20)/.13)*smooth((.72-progress)/.16),sign=sideName==='L'?1:-1;
      upper.quaternion.premultiply(new Quaternion().setFromAxisAngle(zAxis,rad(sign*spread))).normalize();root.updateMatrixWorld(true);
    }
    // Keep the target's own wrist axes; the incoming source has a different
    // hand rig. Finger curls are sampled from the unchanged target walk.
  }
  for(const track of fingerTracks)bones.get(track.name).quaternion.copy(fingerAt(track,.25));
  root.updateMatrixWorld(true);
  const before=floorMin(),lift=Math.max(0,.002-before);root.position.y+=lift;root.updateMatrixWorld(true);
  return {root:root.position.toArray(),rotations:new Map(names.filter(n=>n!=='Rig_Root').map(n=>[n,bones.get(n).quaternion.clone()])),before,lift};
}
function mirrored(pose){
 const swap=n=>n.endsWith('_L')?n.slice(0,-2)+'_R':n.endsWith('_R')?n.slice(0,-2)+'_L':n;
 const result=new Map();for(const n of names.filter(n=>n!=='Rig_Root')){
  const q=pose.rotations.get(swap(n));assert.ok(q,swap(n));result.set(n,new Quaternion(q.x,-q.y,-q.z,q.w).normalize());
 }
 return {...pose,root:[-pose.root[0],pose.root[1],pose.root[2]],rotations:result};
}
function blendPose(a,b,u){return {root:a.root.map((x,j)=>x+(b.root[j]-x)*u),rotations:new Map([...a.rotations].map(([n,q])=>[n,q.clone().slerp(b.rotations.get(n),u).normalize()])),before:a.before,lift:a.lift};}
function makeClip({name,clip,from,to,kind,duration}){
 const steps=Math.round(duration*60),frames=[],minBefore={value:Infinity},maxLift={value:0},initial=sourceAt(clip,from).root;
 for(let i=0;i<=steps;i++){
  const p=i/steps,frame=from+(to-from)*p,src=sourceAt(clip,frame);let pose=retarget(src,kind,p,initial);
  // The source loop is nearly closed. Blend its last half second to the first
  // sample with a zero-slope ease, instead of jumping when it wraps.
  if(kind==='idle'&&p>.9){const first=retarget(sourceAt(clip,from),kind,0,initial);pose=blendPose(pose,first,smooth((p-.9)/.1));}
  minBefore.value=Math.min(minBefore.value,pose.before);maxLift.value=Math.max(maxLift.value,pose.lift);frames.push(pose);
 }
 if(kind==='idle')frames[steps]=frames[0];
 function spec(poses,clipName){const times=poses.map((_,i)=>round(duration*i/steps)),tracks=[{name:'Rig_Root.position',type:'vector',times,values:poses.flatMap(f=>f.root.map(round))}];
  for(const n of names.filter(n=>n!=='Rig_Root')){let previous=null;const values=[];for(const f of poses){const q=f.rotations.get(n).clone();if(previous&&previous.dot(q)<0)q.set(-q.x,-q.y,-q.z,-q.w);values.push(...q.toArray().map(round));previous=q;}tracks.push({name:n+'.quaternion',type:'quaternion',times,values});}
  return {name:clipName,duration:round(duration),tracks};}
 const result=[spec(frames,name)];if(kind!=='idle')result.push(spec(frames.map(mirrored),name+'_Mirror'));
 const first=sourceAt(clip,from),last=sourceAt(clip,to),durationSource=(to-from)/clip.fps;
 const distance=-(last.root[1]-first.root[1]);
 return {clips:result,stats:{name,source:clip.name,dataset:clip.dataset||clip.origin,frames:[from,to],sourceSeconds:durationSource,playbackSeconds:duration,
    sourceForwardDistance:distance,samples:steps+1,minimumBeforeLift:minBefore.value,maxBakedLift:maxLift.value}};
}
const all=[
 makeClip({name:'Living_Idle_Trial',clip:input.idle,from:0,to:178,kind:'idle',duration:178/30}),
 makeClip({name:'Walk_Brake_Trial',clip:input.stopWalk,from:40,to:89,kind:'walk',duration:49/30}),
 makeClip({name:'Run_Brake_Trial',clip:input.stopRun,from:40,to:89,kind:'run',duration:49/30}),
];
// Extract a forward-speed profile from the same stop takes as their poses.
// Smooth and clamp to a nonincreasing curve (the generated source sometimes
// speeds up briefly), normalize the first speed to 1, and integrate it. The
// controller scales it to its actual starting speed and duration. This keeps
// travel broadly related to the steps without pretending to lock the feet.
function speedCurve(clip,from,to,nominalSpeed,maxDuration){
  const count=96,disp=[];for(let i=0;i<=count;i++)disp.push(-sourceAt(clip,from+(to-from)*i/count).root[1]);
  const derivative=disp.map((_,i)=>{const a=Math.max(0,i-2),b=Math.min(count,i+2);return Math.max(0,(disp[b]-disp[a])/(b-a)*count)});
  const filtered=derivative.map((_,i)=>{let sum=0,n=0;for(let j=Math.max(0,i-3);j<=Math.min(count,i+3);j++){sum+=derivative[j];n++}return sum/n});
  const first=filtered[0],velocity=[];assert.ok(first>0);
  for(let i=0;i<=count;i++)velocity.push(Math.min(i?velocity[i-1]:1,Math.max(0,filtered[i]/first)));
  velocity[count]=0;
  const integral=[0];for(let i=1;i<=count;i++)integral.push(integral[i-1]+(velocity[i-1]+velocity[i])/(2*count));
  const duration=Math.max(.55,Math.min(maxDuration,first/nominalSpeed));
  return {velocity:velocity.map(round),integral:integral.map(round),area:round(integral[count]),nominalDuration:round(duration)};
}
const starts=[40,42,44,46,48,50];
const curves=Object.fromEntries([['walk',input.stopWalk,1.44,1.70],['run',input.stopRun,4.37,1.15]].map(([kind,clip,speed,max])=>
  [kind,{from:40,to:89,variants:Object.fromEntries(starts.map(start=>[start,speedCurve(clip,start,89,speed,max)]))}]));
const data={modelSha256:sources.model[1],rigSha256:sources.rig[1],sources:Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,{path:v[0],sha256:v[1]}])),
 notes:'Standing is based on the CC0 OSB idle with additional authored breathing; braking is retargeted and mirrored from HumanMotionCraft Kimodo-generated stops, not mocap. In-place, yaw removed, floor-corrected, finger poses taken from the target walk. The baked clips have no horizontal foot lock; runtime blends, retimes and applies limited near-floor IK late in stops and in idle.',clips:all.flatMap(x=>x.clips),curves,stats:all.map(x=>x.stats)};
const output=process.argv[2]?path.resolve(process.argv[2]):path.join(here,'clips.json');
if(output===repo||(output.startsWith(repo+path.sep)&&output!==path.join(here,'clips.json')))throw Error('Refusing to overwrite another repository artifact');
fs.writeFileSync(output,JSON.stringify(data)+'\n');console.log(JSON.stringify(data.stats,null,2));
