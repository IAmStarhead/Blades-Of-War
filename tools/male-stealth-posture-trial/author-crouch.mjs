// Build an isolated posture experiment from the already published human-leg
// trial. No source GLB or earlier scene is changed. This is authored posing on
// a recorded gait, not a new mocap recording or a runtime foot-lock system.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {NodeIO} from '@gltf-transform/core';
import {Bone,Quaternion,Vector3} from 'three';

const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const sources={
  model:['work/male-leg-volume/male_leg_volume_trial.glb','eb569ef2269a8d7e40378590614beebc933edd3bdcd7340f8146494ceb975484'],
  original:['tools/male-leg-human-trial/crouch-clips.json','26a6ed0827deeffe41471b564376757eac0253ed9595e104f0b7a57349fb9e08'],
};
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const [key,[file,expected]] of Object.entries(sources))assert.equal(sha(path.join(repo,file)),expected,`Unexpected ${key}: ${file}`);
const original=JSON.parse(fs.readFileSync(path.join(repo,sources.original[0]),'utf8'));
const root=(await new NodeIO().read(path.join(repo,sources.model[0]))).getRoot();
const targetNodes=root.listSkins()[0].listJoints(),names=targetNodes.map(n=>n.getName());
assert.equal(names.length,52);
const bones=new Map(targetNodes.map(n=>{const b=new Bone();b.name=n.getName();return [b.name,b]}));
for(const n of targetNodes){const p=n.getParentNode();if(p&&bones.has(p.getName()))bones.get(p.getName()).add(bones.get(n.getName()));}
const top=bones.get('Rig_Root'), bone=n=>{const b=bones.get('Rig_'+n);assert.ok(b,n);return b;};
function reset(){for(const n of targetNodes){const b=bones.get(n.getName());b.position.fromArray(n.getTranslation());b.quaternion.fromArray(n.getRotation()).normalize();b.scale.fromArray(n.getScale());}top.updateMatrixWorld(true);}
const pos=b=>b.getWorldPosition(new Vector3()), quat=b=>b.getWorldQuaternion(new Quaternion()).normalize();
function setWorld(b,q){b.quaternion.copy(quat(b.parent).invert().multiply(q)).normalize();top.updateMatrixWorld(true);}
function align(b,child,direction){
  const actual=pos(child).sub(pos(b)).normalize();
  setWorld(b,new Quaternion().setFromUnitVectors(actual,direction.clone().normalize()).multiply(quat(b)));
}
function fitLeg(side,goal){
  const thigh=bone('Thigh_'+side),shin=bone('Shin_'+side),foot=bone('Foot_'+side),hip=pos(thigh);
  let knee=pos(shin),ankle=pos(foot);const savedFoot=quat(foot),upper=hip.distanceTo(knee),lower=knee.distanceTo(ankle);
  const direction=goal.clone().sub(hip);let distance=direction.length();assert.ok(distance>1e-8);
  distance=Math.min(upper+lower-.0001,Math.max(Math.abs(upper-lower)+.0001,distance));direction.normalize();
  const along=(upper*upper+distance*distance-lower*lower)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-along*along));
  const plane=knee.clone().sub(hip);plane.addScaledVector(direction,-plane.dot(direction));assert.ok(plane.lengthSq()>1e-8);plane.normalize();
  const targetKnee=hip.clone().addScaledVector(direction,along).addScaledVector(plane,height);
  setWorld(thigh,new Quaternion().setFromUnitVectors(knee.clone().sub(hip).normalize(),targetKnee.sub(hip).normalize()).multiply(quat(thigh)));
  knee=pos(shin);ankle=pos(foot);
  const targetAnkle=hip.clone().addScaledVector(direction,distance);
  setWorld(shin,new Quaternion().setFromUnitVectors(ankle.clone().sub(knee).normalize(),targetAnkle.sub(knee).normalize()).multiply(quat(shin)));
  setWorld(foot,savedFoot);
  return {targetError:pos(foot).distanceTo(goal),bend:pos(shin).sub(hip).angleTo(pos(foot).sub(pos(shin)))*180/Math.PI};
}
const fingerChannels=root.listAnimations().find(a=>a.getName()==='Walk_Game_Trial').listChannels().filter(c=>c.getTargetNode().getName().startsWith('Rig_Finger'));
assert.equal(fingerChannels.length,30);
const fingerData=fingerChannels.map(c=>({name:c.getTargetNode().getName(),times:c.getSampler().getInput().getArray(),values:c.getSampler().getOutput().getArray()}));
function fingerAt(data,phase){
  const {times,values}=data,time=phase*times.at(-1);let i=0;
  while(i+1<times.length&&times[i+1]<time)i++;
  const j=Math.min(i+1,times.length-1),u=i===j?0:(time-times[i])/(times[j]-times[i]);
  return new Quaternion().fromArray(values,4*i).slerp(new Quaternion().fromArray(values,4*j),u).normalize();
}
const axisX=new Vector3(1,0,0),tilt=degrees=>new Quaternion().setFromAxisAngle(axisX,degrees*Math.PI/180);
const round=v=>Math.round(v*1e7)/1e7;
function buildClip(source,mode){
  const sourceMap=new Map(source.tracks.map(t=>[t.name,t])),times=source.tracks[0].times,steps=times.length-1;
  assert.equal(steps,120);assert.ok(sourceMap.has('Rig_Root.position'));
  const rotationNames=source.tracks.filter(t=>t.type==='quaternion').map(t=>t.name.split('.')[0]);
  const animated=[...rotationNames,...fingerData.map(f=>f.name)],poses=[];
  const stats={samples:steps+1,hipLoweringM:mode==='idle'?.06:.11,idleFootOffsetsM:mode==='idle'?{lateral:.04,frontBack:.05}:null,
    minKneeBendDegrees:Infinity,maxKneeBendDegrees:0,maxAnkleTargetErrorM:0};
  for(let i=0;i<=steps;i++){
    const phase=i/steps;reset();
    top.position.fromArray(sourceMap.get('Rig_Root.position').values,3*i);
    for(const n of rotationNames)bones.get(n).quaternion.fromArray(sourceMap.get(n+'.quaternion').values,4*i).normalize();
    top.updateMatrixWorld(true);
    const goals={};for(const [side,sign] of [['L',1],['R',-1]]){
      const goal=pos(bone('Foot_'+side));if(mode==='idle'){goal.x+=sign*.04;goal.z+=sign*.05}goals[side]=goal;
    }
    top.position.y-=stats.hipLoweringM;top.updateMatrixWorld(true);
    for(const side of ['L','R']){
      const result=fitLeg(side,goals[side]);stats.minKneeBendDegrees=Math.min(stats.minKneeBendDegrees,result.bend);
      stats.maxKneeBendDegrees=Math.max(stats.maxKneeBendDegrees,result.bend);stats.maxAnkleTargetErrorM=Math.max(stats.maxAnkleTargetErrorM,result.targetError);
    }
    // Keep the hips' recorded pitch, then straighten the back relative to the
    // pelvis and direct the head forward. Preserve the original shoulder and
    // wrist twist while orienting the upper arms and forearms in actor space.
    const hips=bone('Hips'),spine=bone('Spine'),chest=bone('Chest'),neck=bone('Neck'),head=bone('Head');
    const line=pos(spine).sub(pos(hips)).normalize();
    align(spine,chest,line.clone().applyQuaternion(tilt(7)));
    align(chest,neck,line.clone().applyQuaternion(tilt(10)));
    align(neck,head,new Vector3(0,1,.14));setWorld(head,tilt(4));
    for(const [side,sign] of [['L',1],['R',-1]]){
      const upper=bone('UpperArm_'+side),fore=bone('Forearm_'+side),hand=bone('Hand_'+side);
      const wave=mode==='walk'?Math.cos(phase*Math.PI*2):.8,lead=(1+sign*wave)/2;
      align(upper,fore,new Vector3(sign*.18,-.97,-.10+.34*lead));
      align(fore,hand,new Vector3(sign*.16,-.50+.52*lead,.72+.28*lead));
    }
    for(const f of fingerData)bones.get(f.name).quaternion.copy(fingerAt(f,mode==='idle'?.25:phase));
    top.updateMatrixWorld(true);
    poses.push({root:top.position.toArray(),rotations:new Map(animated.map(n=>[n,bones.get(n).quaternion.clone()]))});
  }
  // Both endpoints must be the same pose so the repeat loop never jumps.
  assert.ok(new Vector3().fromArray(poses[0].root).distanceTo(new Vector3().fromArray(poses.at(-1).root))<1e-6);
  for(const n of animated)assert.ok(poses[0].rotations.get(n).angleTo(poses.at(-1).rotations.get(n))<1e-5,`Loop seam: ${n}`);
  const tracks=[{name:'Rig_Root.position',type:'vector',times,values:poses.flatMap(f=>f.root.map(round))}];
  for(const n of animated){
    const values=[];let previous=null;
    for(const f of poses){const q=f.rotations.get(n).clone();if(previous&&previous.dot(q)<0)q.set(-q.x,-q.y,-q.z,-q.w);values.push(...q.toArray().map(round));previous=q;}
    tracks.push({name:n+'.quaternion',type:'quaternion',times,values});
  }
  return {name:mode==='idle'?'Stealth_Posture_Idle_Trial':'Stealth_Posture_Walk_Trial',duration:source.duration,speed:source.speed,tracks,stats};
}
const clips=original.clips.map((c,i)=>buildClip(c,i===0?'idle':'walk'));
assert.ok(clips.every(c=>c.stats.maxAnkleTargetErrorM<.003),'The ankle target was unreachable in at least one sampled pose');
const data={modelSha256:sources.model[1],baseClipSha256:sources.original[1],
  source:'Posture/arm edits to the previous 100STYLE / HumanMotionCraft-derived crouch trial; finger curls from the model walking clip.',
  notes:'This is an authored experiment, not a new recording. The pelvis is lowered and two-bone IK restores each original ankle position and foot orientation (idle feet also stagger/widen). Torso, head, arms and fingers are reposed. No dynamic foot lock; preserve nominal support fitting only approximately. Source/interpolation and credit details are in the accompanying README.',clips};
const output=process.argv[2]?path.resolve(process.argv[2]):path.join(here,'crouch-clips.json');
if(output===repo||(output.startsWith(repo+path.sep)&&output!==path.join(here,'crouch-clips.json')))throw Error('Refusing to overwrite another repository artifact');
fs.writeFileSync(output,JSON.stringify(data)+'\n');console.log(JSON.stringify(clips.map(c=>({name:c.name,...c.stats})),null,2));
