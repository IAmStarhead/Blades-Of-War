// Author a separate, experimental unarmed set on the pinned 52-bone model.
// The accepted model and its Walk_Game_Trial / Run_Game_Trial are read only.
// Punches: Quaternius UAL Standard. Kick: UAL kick already retargeted to a
// KinemIQ rig in GKEET; retargeted a second time here. See CREDITS.md.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {NodeIO} from '@gltf-transform/core';
import {Bone,Matrix4,Quaternion,Vector3} from 'three';

const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const inputs={
 model:['work/male-leg-volume/male_leg_volume_trial.glb','eb569ef2269a8d7e40378590614beebc933edd3bdcd7340f8146494ceb975484'],
 library:['tools/male-library-motion/source/AnimationLibrary_Godot_Standard.gltf','0ff075c7ad6855c5c2c37a171592ee8f0d6ab2f58259e2be77a9b63dd8027765'],
 binary:['tools/male-library-motion/source/AnimationLibrary_Godot_Standard.bin','6e65377d81558333c4093dbb144a48fd19019343d82b1a3a7992a98ec0e0543c'],
 kick:['tools/male-unarmed-combat-trial/source/Kick-retargeted-30fps.glb','3939578c4029acbd529fd433689858b542b438d01be8783f30686b01d509c262'],
};
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [key,[p,expected]] of Object.entries(inputs))assert.equal(sha(path.join(repo,p)),expected,'Unexpected source '+key);
const io=new NodeIO(),target=(await io.read(path.join(repo,inputs.model[0]))).getRoot(),
  library=(await io.read(path.join(repo,inputs.library[0]))).getRoot(),kick=(await io.read(path.join(repo,inputs.kick[0]))).getRoot();
const nodes=target.listSkins()[0].listJoints(),names=nodes.map(n=>n.getName()),animated=names.filter(n=>n!=='Rig_Root');
assert.equal(names.length,52,'Expected the accepted 52-bone skeleton');
function rig(root,sourceNodes,rootName){
  const list=[...new Set(sourceNodes)].map(n=>{const node=root.listNodes().find(x=>x.getName()===n);assert.ok(node,'Missing '+n);return node});
  const bones=new Map(list.map(n=>{const b=new Bone();b.name=n.getName();return [b.name,b]}));
  for(const n of list){const parent=n.getParentNode();if(parent&&bones.has(parent.getName()))bones.get(parent.getName()).add(bones.get(n.getName()))}
  const top=bones.get(rootName);assert.ok(top,'Missing rig root '+rootName);
  const result={list,bones,top};reset(result);return result;
}
function reset(r){for(const n of r.list){const b=r.bones.get(n.getName());b.position.fromArray(n.getTranslation());b.quaternion.fromArray(n.getRotation()).normalize();b.scale.fromArray(n.getScale())}r.top.updateMatrixWorld(true)}
const T=rig(target,names,'Rig_Root');
const L=rig(library,['Rig',...library.listSkins()[0].listJoints().map(n=>n.getName())],'Rig');
const K=rig(kick,kick.listNodes().map(n=>n.getName()),'Armature');
const P=b=>b.getWorldPosition(new Vector3()),Q=b=>b.getWorldQuaternion(new Quaternion()).normalize();
function prepare(a,r){
 assert.ok(a,'Missing animation');return a.listChannels().map(c=>{const s=c.getSampler();return {name:c.getTargetNode().getName(),path:c.getTargetPath(),input:s.getInput(),output:s.getOutput(),method:s.getInterpolation()}})
 .filter(c=>r.bones.has(c.name)&&['rotation','translation','scale'].includes(c.path)).map(c=>{assert.ok(['LINEAR','STEP'].includes(c.method));return c});
}
function sample(c,t){
 const n=c.input.getCount();if(n===1)return c.output.getElement(0,[]);
 let lo=0,hi=n-1;while(hi-lo>1){const m=(lo+hi)>>1;if(c.input.getScalar(m)<=t)lo=m;else hi=m}
 const a=c.input.getScalar(lo),b=c.input.getScalar(hi);if(t<=a)return c.output.getElement(lo,[]);if(t>=b)return c.output.getElement(hi,[]);if(c.method==='STEP')return c.output.getElement(lo,[]);
 const f=(t-a)/(b-a),v=c.output.getElement(lo,[]),w=c.output.getElement(hi,[]);
 return c.path==='rotation'?new Quaternion().fromArray(v).slerp(new Quaternion().fromArray(w),f).normalize().toArray():v.map((x,i)=>x+(w[i]-x)*f);
}
function animate(r,channels,time){reset(r);for(const c of channels){const b=r.bones.get(c.name),v=sample(c,time);if(c.path==='rotation')b.quaternion.fromArray(v).normalize();else if(c.path==='translation')b.position.fromArray(v);else b.scale.fromArray(v)}r.top.updateMatrixWorld(true)}
function duration(ch){return Math.max(...ch.map(c=>c.input.getScalar(c.input.getCount()-1)))}
const mappings={
 library:{hips:'DEF-hips',spine:'DEF-spine.002',chest:'DEF-spine.003',neck:'DEF-neck',head:'DEF-head',root:'Rig',side:(part,s)=>({Shoulder:'DEF-shoulder.',UpperArm:'DEF-upper_arm.',Forearm:'DEF-forearm.',Hand:'DEF-hand.',Thigh:'DEF-thigh.',Shin:'DEF-shin.',Foot:'DEF-foot.',Toes:'DEF-toe.'}[part]+s),
  finger:(digit,part,s)=>'DEF-'+({1:'thumb',2:'f_index',3:'f_middle',4:'f_ring',5:'f_pinky'}[digit])+'.0'+part+'.'+s},
 kick:{hips:'pelvis',spine:'spine_02',chest:'spine_03',neck:'neck_01',head:'Head',root:'Armature',side:(part,s)=>({Shoulder:'clavicle',UpperArm:'upperarm',Forearm:'lowerarm',Hand:'hand',Thigh:'thigh',Shin:'calf',Foot:'foot',Toes:'ball'}[part]+'_'+s.toLowerCase()),
  finger:(digit,part,s)=>({1:'thumb',2:'index',3:'middle',4:'ring',5:'pinky'}[digit])+'_0'+part+'_'+s.toLowerCase()},
};
function makeRetarget(r,map){
 reset(r);reset(T);const bindQ=new Map([...r.bones].map(([k,b])=>[k,Q(b)])),bindP=new Map([...r.bones].map(([k,b])=>[k,P(b)]));
 const pairs=[['Rig_Hips',map.hips],['Rig_Spine',map.spine],['Rig_Chest',map.chest],['Rig_Neck',map.neck],['Rig_Head',map.head]],align=new Map();
 for(const side of ['L','R']){
  for(const part of ['Shoulder','UpperArm','Forearm','Hand','Thigh','Shin','Foot','Toes'])pairs.push([`Rig_${part}_${side}`,map.side(part,side)]);
  for(const [part,child] of [['UpperArm','Forearm'],['Forearm','Hand'],['Thigh','Shin'],['Shin','Foot'],['Foot','Toes']]){
   const a=P(T.bones.get(`Rig_${child}_${side}`)).sub(P(T.bones.get(`Rig_${part}_${side}`))).normalize();
   const b=P(r.bones.get(map.side(child,side))).sub(P(r.bones.get(map.side(part,side)))).normalize();
   align.set(`Rig_${part}_${side}`,new Quaternion().setFromUnitVectors(a,b));
  }
  align.set('Rig_Hand_'+side,align.get('Rig_Forearm_'+side).clone());align.set('Rig_Toes_'+side,align.get('Rig_Foot_'+side).clone());
  for(let digit=1;digit<=5;digit++)for(let part=1;part<=3;part++){
   const name=`Rig_Finger${digit}_${part}_${side}`,src=map.finger(digit,part,side);pairs.push([name,src]);
   if(part<3){const a=P(T.bones.get(`Rig_Finger${digit}_${part+1}_${side}`)).sub(P(T.bones.get(name))).normalize();
    const b=P(r.bones.get(map.finger(digit,part+1,side))).sub(P(r.bones.get(src))).normalize();
    align.set(name,new Quaternion().setFromUnitVectors(a,b));
   }else align.set(name,align.get(`Rig_Finger${digit}_2_${side}`).clone());
  }
 }
 function length(r,a,b,c){return P(r.bones.get(a)).distanceTo(P(r.bones.get(b)))+P(r.bones.get(b)).distanceTo(P(r.bones.get(c)))}
 const scale=length(T,'Rig_Thigh_L','Rig_Shin_L','Rig_Foot_L')/length(r,map.side('Thigh','L'),map.side('Shin','L'),map.side('Foot','L'));
 return function retarget(channels,time){
  animate(r,channels,time);reset(T);const displacement=P(r.bones.get(map.hips)).sub(bindP.get(map.hips)).multiplyScalar(scale);
  T.top.position.set(Math.max(-.18,Math.min(.18,displacement.x)),displacement.y,Math.max(-.18,Math.min(.18,displacement.z)));T.top.updateMatrixWorld(true);
  for(const [tn,sn] of pairs){const b=T.bones.get(tn),src=r.bones.get(sn);assert.ok(src,sn);
   const world=Q(src).multiply(bindQ.get(sn).clone().invert()).multiply(align.get(tn)||new Quaternion()).normalize();
   b.quaternion.copy(Q(b.parent).invert().multiply(world)).normalize();T.top.updateMatrixWorld(true);
  }
  return capture();
 };
}
function capture(){return {root:T.top.position.toArray(),rotations:new Map(animated.map(n=>[n,T.bones.get(n).quaternion.clone()]))}}
function apply(p){reset(T);T.top.position.fromArray(p.root);for(const [n,q] of p.rotations)T.bones.get(n).quaternion.copy(q);T.top.updateMatrixWorld(true)}
const retargetLibrary=makeRetarget(L,mappings.library),retargetKick=makeRetarget(K,mappings.kick);
const animation=(root,name,rig)=>{const clip=root.listAnimations().find(a=>a.getName()===name);return prepare(clip,rig)};
const jab=animation(library,'Punch_Jab',L),cross=animation(library,'Punch_Cross',L);
const kickChannels=prepare(kick.listAnimations()[0],K),walk=animation(target,'Walk_Game_Trial',T);
const body=target.listNodes().find(n=>n.getName()==='NewBody'),primitive=body?.getMesh()?.listPrimitives()[0],skin=target.listSkins()[0];assert.ok(primitive&&body.getSkin());
const pos=primitive.getAttribute('POSITION'),joints=primitive.getAttribute('JOINTS_0'),weights=primitive.getAttribute('WEIGHTS_0');
const inverse=nodes.map((_,i)=>new Matrix4().fromArray(skin.getInverseBindMatrices().getElement(i,[]))),matrices=nodes.map(()=>new Matrix4()),sole={L:[],R:[]};
for(let i=0;i<pos.getCount();i++){const p=pos.getElement(i,[]);if(p[1]>=.16||Math.abs(p[0])<=.035||Math.abs(p[0])>=.25)continue;sole[p[0]>0?'L':'R'].push({p,j:joints.getElement(i,[]),w:weights.getElement(i,[])})}
assert.ok(sole.L.length>100&&sole.R.length>100);
function minima(){T.top.updateMatrixWorld(true);for(let i=0;i<nodes.length;i++)matrices[i].multiplyMatrices(T.bones.get(names[i]).matrixWorld,inverse[i]);
 const out={L:Infinity,R:Infinity};for(const side of ['L','R'])for(const v of sole[side]){let y=0;for(let k=0;k<4;k++)if(v.w[k]){const e=matrices[v.j[k]].elements;y+=v.w[k]*(e[1]*v.p[0]+e[5]*v.p[1]+e[9]*v.p[2]+e[13])}out[side]=Math.min(out[side],y)}return out}
const ease=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
const blend=(a,b,u)=>({root:a.root.map((v,i)=>v+(b.root[i]-v)*u),rotations:new Map(animated.map(n=>[n,a.rotations.get(n).clone().slerp(b.rotations.get(n),u).normalize()]))});
function ground(p,adjustDown=false){apply(p);const f=minima(),m=Math.min(f.L,f.R);let d=Math.max(0,.002-m);if(adjustDown&&m>.002)d=Math.max(-.035,.002-m);p.root[1]+=d;return {minimum:m,correction:d,feet:f}}
function mirrored(p){const swap=n=>n.endsWith('_L')?n.slice(0,-2)+'_R':n.endsWith('_R')?n.slice(0,-2)+'_L':n;
 return {root:[-p.root[0],p.root[1],p.root[2]],rotations:new Map(animated.map(n=>{const q=p.rotations.get(swap(n));return [n,new Quaternion(q.x,-q.y,-q.z,q.w).normalize()]}))}}
const round=x=>Math.round(x*1e7)/1e7;
function clip(name,poses,seconds){const times=poses.map((_,i)=>round(seconds*i/(poses.length-1))),tracks=[{name:'Rig_Root.position',type:'vector',times,values:poses.flatMap(p=>p.root.map(round))}];
 for(const n of animated){let previous=null,values=[];for(const p of poses){const q=p.rotations.get(n).clone();if(previous&&previous.dot(q)<0)q.set(-q.x,-q.y,-q.z,-q.w);values.push(...q.toArray().map(round));previous=q}tracks.push({name:n+'.quaternion',type:'quaternion',times,values})}
 return {name,duration:round(seconds),tracks};
}
// Use the initial pose of the library jab as a shared guard for every action
// so rapid blending does not snap the body.
const guard=retargetLibrary(jab,0);const guardGround=ground(guard,true);apply(guard);
const guardWorldSpine=Q(T.bones.get('Rig_Spine')).clone();
const guardJoints=Object.fromEntries(['Rig_Head','Rig_Hand_L','Rig_Hand_R','Rig_Foot_L','Rig_Foot_R'].map(n=>[n,P(T.bones.get(n)).toArray().map(round)]));
const stand=[];for(let i=0;i<=120;i++){
 // A very small breathing motion, not a second gait or a dramatic bob.
 const p=blend(guard,guard,0),wave=Math.sin(i/120*Math.PI*2);
 const chest=p.rotations.get('Rig_Chest');chest.multiply(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),wave*.008)).normalize();
 stand.push(p);
}stand[120]=stand[0];
const clips=[clip('Combat_Guard',stand,2.6)];
// Combat movement is a distinct experiment: preserve the accepted walking
// legs, hips and root timing, but hold the upper body in guard. Shortening
// the leg motion by interpolating it toward guard caused severe foot sliding;
// keep the full stride and adapt the playback rate to actual travel instead.
// Ordinary walking itself is never rewritten.
const walkDuration=duration(walk),walkFrames=[];let moveMaxGround=0;
for(let i=0;i<=120;i++){
 const t=walkDuration*i/120;animate(T,walk,t);const source=capture();let p=blend(guard,guard,0);
 for(const n of animated)if(/^Rig_(Hips|Thigh|Shin|Foot|Toes)(_|$)/.test(n))p.rotations.set(n,source.rotations.get(n).clone());
 p.root=source.root.slice();apply(p);
 // The gait's pelvis pitch otherwise makes this separate guard slump down.
 // Keep most of the guard's world-space torso orientation, retaining a little
 // pelvis sway; this does not alter either leg or the original walk clip.
 const spine=T.bones.get('Rig_Spine'),upper=Q(spine).slerp(guardWorldSpine,.82).normalize();
 spine.quaternion.copy(Q(spine.parent).invert().multiply(upper)).normalize();T.top.updateMatrixWorld(true);p=capture();
 const g=ground(p,false);moveMaxGround=Math.max(moveMaxGround,Math.abs(g.correction));walkFrames.push(p);
}
walkFrames[120]=walkFrames[0];clips.push(clip('Combat_Walk',walkFrames,walkDuration));
function attack(name,source,sourceChannels,kind){
 const d=duration(sourceChannels),steps=Math.ceil(d*60),poses=[];let maxLift=0,minBefore=Infinity,maxBefore=-Infinity;
 for(let i=0;i<=steps;i++){
  const t=d*i/steps,raw=source(sourceChannels,t);
  // Blend from and back to the same guard instead of abruptly replacing a
  // mismatched skeleton/stance. Source timing remains otherwise intact.
  const fade=ease(t/(kind==='kick'?.16:.12))*ease((d-t)/(kind==='kick'?.22:.14));
  let p=blend(guard,raw,fade);
  if(kind==='kick'){
   // The source is a very high, head-height kick. On this human mesh it
   // produces severe hip pinching. Gradually bring its raised leg down toward
   // mid-body height while retaining the source's timing and follow-through.
   apply(p);const thigh=T.bones.get('Rig_Thigh_R'),foot=T.bones.get('Rig_Foot_R');
   const at=P(foot),hip=P(thigh),amount=ease((at.y-.35)/.70)*ease((at.z-hip.z-.05)/.25);
   const turn=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),.70*amount);
   thigh.quaternion.copy(Q(thigh.parent).invert().multiply(turn.multiply(Q(thigh)))).normalize();T.top.updateMatrixWorld(true);p=capture();
  }
  const g=ground(p,true);maxLift=Math.max(maxLift,Math.abs(g.correction));
  minBefore=Math.min(minBefore,g.minimum);maxBefore=Math.max(maxBefore,g.minimum);poses.push(p);
 }
 poses[0]=guard;poses[steps]=guard;
 let finalPoses=poses,finalDuration=d,peakSourceStep=0;
 if(kind==='kick'){
  // The supplied 30 Hz kick moves its foot over a metre in two source
  // frames. Retiming the fast portion avoids a two-frame teleport on this
  // character. Use the actual retargeted joint displacements, spread each
  // slowdown to neighbouring frames and resample; no pose is copied into the
  // ordinary gait. This is an explicit timing edit, not raw mocap.
  const joints=['Rig_Foot_L','Rig_Foot_R','Rig_Shin_L','Rig_Shin_R','Rig_Hand_L','Rig_Hand_R','Rig_Head'];
  const positions=poses.map(p=>{apply(p);return joints.map(n=>P(T.bones.get(n)))}),dt=d/steps,ratios=[];
  for(let i=0;i<steps;i++){
   const distance=Math.max(...joints.map((_,j)=>positions[i+1][j].distanceTo(positions[i][j])));
   peakSourceStep=Math.max(peakSourceStep,distance);ratios.push(Math.max(1,distance/(dt*6.5)));
  }
  const clock=[0];for(let i=0;i<steps;i++){
   let factor=1;for(let j=Math.max(0,i-2);j<=Math.min(steps-1,i+2);j++){
    const f=.5*(1+Math.cos(Math.PI*Math.abs(j-i)/3));factor=Math.max(factor,1+(ratios[j]-1)*f);
   }
   clock.push(clock.at(-1)+dt*factor);
  }
  finalDuration=clock.at(-1);const n=Math.ceil(finalDuration*60);finalPoses=[];let j=0;
  for(let i=0;i<=n;i++){
   const t=finalDuration*i/n;while(j<steps-1&&clock[j+1]<t)j++;
   const u=Math.max(0,Math.min(1,(t-clock[j])/(clock[j+1]-clock[j])));finalPoses.push(blend(poses[j],poses[j+1],u));
  }
  finalPoses[0]=guard;finalPoses[n]=guard;
 }
 const output=clip(name,finalPoses,finalDuration);return {clip:output,poses:finalPoses,stats:{sourceDuration:d,finalDuration,peakSourceStep,maxGroundCorrection:maxLift,rawMinimum:[minBefore,maxBefore]}};
}
const j=attack('Combat_Jab',retargetLibrary,jab,'punch'),c=attack('Combat_Cross',retargetLibrary,cross,'punch'),k=attack('Combat_Kick_R',retargetKick,kickChannels,'kick');
clips.push(j.clip,c.clip,k.clip,clip('Combat_Kick_L',k.poses.map(mirrored),k.clip.duration));
const data={modelSha256:inputs.model[1],sources:Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,{path:v[0],sha256:v[1]}])),
 notes:'Separate unarmed trial: UAL jab/cross and a kick already retargeted to KinemIQ are re-targeted to this body. Actions blend into a common guard; the mirrored kick is lowered and retimed; soles are vertically adjusted. Combat walking holds the guard while retaining the accepted walking legs, hips and timing; its upper torso is stabilized. These are edits, not unchanged source clips; ordinary walk/run remain unchanged. No contact physics.',
 stats:{guardGround,guardJoints,walkDuration,moveMaxGround,jab:j.stats,cross:c.stats,kick:k.stats},clips};
const output=process.argv[2]?path.resolve(process.argv[2]):path.join(here,'combat-clips.json');
if(output===repo||(output.startsWith(repo+path.sep)&&output!==path.join(here,'combat-clips.json')))throw Error('Refusing to overwrite another artifact');
fs.writeFileSync(output,JSON.stringify(data)+'\n');console.log(JSON.stringify(data.stats,null,2));
