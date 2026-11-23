// Separate crouch-walk trial: transfer the recorded 3-D thigh/shin directions,
// not their bone-local quaternion components, from a documented 100STYLE
// retarget to this different skeleton. The accepted GLB is never modified.
import {NodeIO} from '@gltf-transform/core';
import {Bone,Matrix4,Quaternion,Vector3} from 'three';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const here=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(here,'../..');
const sources={
 model:['work/male-leg-volume/male_leg_volume_trial.glb','eb569ef2269a8d7e40378590614beebc933edd3bdcd7340f8146494ceb975484'],
 old:['tools/male-game-scene/crouch-clips.json','e7db813e8d875e29fdcfa7711ac5eceb18c23b0d4472b0c7757b653666c12ccd'],
 rig:['tools/male-leg-human-trial/reference/hmc-rig.json','24979f497bc7b75eaea811cd078ddb6d1d054be305fa2c1712a3e14605f60d73'],
 captured:['tools/male-leg-human-trial/reference/crouch-walk-7.json','f44ef97de42d3c2a468d5d8a14156a0ede4deee42550bd9e5a0b70a8a805f184'],
};
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const [name,[p,expected]] of Object.entries(sources))if(hash(path.join(repo,p))!==expected)throw Error(`Unexpected ${name}: ${p}`);
const refRig=JSON.parse(fs.readFileSync(path.join(repo,sources.rig[0]),'utf8'));
const capture=JSON.parse(fs.readFileSync(path.join(repo,sources.captured[0]),'utf8'));
if(capture.dataset!=='100style'||capture.name!=='Crouch walk 7'||capture.bones.join('|')!==refRig.names.join('|'))throw Error('Reference rig and mocap differ');
const previous=JSON.parse(fs.readFileSync(path.join(repo,sources.old[0]),'utf8'));
const dr=(await new NodeIO().read(path.join(repo,sources.model[0]))).getRoot();
const targetNodes=dr.listSkins()[0].listJoints(),names=targetNodes.map(n=>n.getName());
if(names.length!==52)throw Error('Expected the current 52-bone character');
const bones=new Map(targetNodes.map(n=>{const b=new Bone();b.name=n.getName();b.position.fromArray(n.getTranslation());b.quaternion.fromArray(n.getRotation()).normalize();b.scale.fromArray(n.getScale());return [b.name,b]}));
for(const n of targetNodes){const p=n.getParentNode();if(p&&bones.has(p.getName()))bones.get(p.getName()).add(bones.get(n.getName()));}
const top=bones.get('Rig_Root');
function reset(){for(const n of targetNodes){const b=bones.get(n.getName());b.position.fromArray(n.getTranslation());b.quaternion.fromArray(n.getRotation()).normalize();b.scale.fromArray(n.getScale());}top.updateMatrixWorld(true);}
const pos=b=>b.getWorldPosition(new Vector3()),quat=b=>b.getWorldQuaternion(new Quaternion()).normalize();
const id=new Map(refRig.names.map((n,i)=>[n,i])),heads=refRig.heads.map(v=>new Vector3().fromArray(v));
const zAxis=new Vector3(0,0,1),conv=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-Math.PI/2),convInv=conv.clone().invert();
// The reference is already retargeted to HMC's rig and keyed every two frames
// at 30 fps. The interpolation here is SLERP/linear, not HMC's original SQUAD.
function capturedAt(frame){
 const ks=capture.keys;if(frame<ks[0].frame||frame>ks.at(-1).frame)throw Error('Reference frame outside take');
 let n=0;while(n+1<ks.length&&ks[n+1].frame<frame)n++;
 const a=ks[n],b=ks[Math.min(n+1,ks.length-1)],u=a===b?0:(frame-a.frame)/(b.frame-a.frame);
 const rotations=a.rotations.map((q,i)=>new Quaternion().fromArray(q).slerp(new Quaternion().fromArray(b.rotations[i]),u).normalize());
 const heading=new Vector3(1,0,0).applyQuaternion(rotations[0]);
 rotations[0].premultiply(new Quaternion().setFromAxisAngle(zAxis,-Math.atan2(heading.y,heading.x))).normalize();
 return {rotations,rootZ:a.root[2]+u*(b.root[2]-a.root[2])};
}
function sourcePose(phase){
 // The source is a non-looping recording. Frames 42..78 span an approximately
 // repeated cycle; use actual preceding frames 34.8..42 during the final 20%
 // to crossfade into frame 42. Both crossfade derivatives vanish at the seam.
 const a=capturedAt(42+36*phase);let result=a;
 if(phase>.8){const b=capturedAt(42+36*(phase-1)),u=(phase-.8)/.2,w=u*u*(3-2*u);
  result={rootZ:a.rootZ+(b.rootZ-a.rootZ)*w,rotations:a.rotations.map((q,i)=>q.clone().slerp(b.rotations[i],w).normalize())};}
 const R=[],P=[];
 for(let i=0;i<refRig.names.length;i++){
  const p=refRig.parents[i];
  if(p<0){R[i]=result.rotations[i];P[i]=heads[i].clone().add(new Vector3(0,0,result.rootZ*refRig.hip_height));}
  else{R[i]=R[p].clone().multiply(result.rotations[i]);P[i]=heads[i].clone().sub(heads[p]).applyQuaternion(R[p]).add(P[p]);}
 }
 return {R,P};
}
function oldSample(track,phase){
 const p=((phase%1)+1)%1,count=track.times.length-1,x=p*count,i=Math.min(count-1,Math.floor(x)),u=x-i,v=track.values;
 if(track.type==='vector')return new Vector3(...[0,1,2].map(k=>v[i*3+k]+(v[(i+1)*3+k]-v[i*3+k])*u));
 return new Quaternion().fromArray(v,i*4).slerp(new Quaternion().fromArray(v,(i+1)*4),u).normalize();
}
function convertVector(v){return v.clone().applyQuaternion(conv);}
function convertRotation(q){return conv.clone().multiply(q).multiply(convInv).normalize();}
function setWorld(b,q){b.quaternion.copy(quat(b.parent).invert().multiply(q)).normalize();top.updateMatrixWorld(true);}
// Keep rotation about the limb inherited from the pelvis / parent. Change only
// the swing needed to align this bone's child direction to the measured one.
function alignDirection(b,child,desired){
 const current=pos(child).sub(pos(b)).normalize();
 const turn=new Quaternion().setFromUnitVectors(current,desired.clone().normalize());
 setWorld(b,turn.multiply(quat(b)));
}
// As in the earlier trial, lift/lower the actor by the lowest sampled sole
// vertex. This is only floor clearance, not horizontal foot locking or physics.
const body=dr.listNodes().find(n=>n.getName()==='NewBody'),primitive=body?.getMesh()?.listPrimitives()[0],skin=dr.listSkins()[0];
if(!primitive||!body.getSkin())throw Error('Missing body skin');
const p=primitive.getAttribute('POSITION'),j=primitive.getAttribute('JOINTS_0'),w=primitive.getAttribute('WEIGHTS_0');
const inverse=targetNodes.map((_,i)=>new Matrix4().fromArray(skin.getInverseBindMatrices().getElement(i,[]))),matrices=targetNodes.map(()=>new Matrix4()),sole=[];
for(let i=0;i<p.getCount();i++){const a=p.getElement(i,[]);if(a[1]<.16&&Math.abs(a[0])>.035&&Math.abs(a[0])<.25)sole.push({p:a,j:j.getElement(i,[]),w:w.getElement(i,[])});}
if(sole.length<100)throw Error('Missing sole samples');
function floorMin(){top.updateMatrixWorld(true);for(let i=0;i<names.length;i++)matrices[i].multiplyMatrices(bones.get(names[i]).matrixWorld,inverse[i]);let min=Infinity;
 for(const v of sole){let y=0;for(let k=0;k<4;k++)if(v.w[k]){const e=matrices[v.j[k]].elements;y+=v.w[k]*(e[1]*v.p[0]+e[5]*v.p[1]+e[9]*v.p[2]+e[13]);}min=Math.min(min,y);}return min;}
const old=previous.clips[1],oldTracks=new Map(old.tracks.map(t=>[t.name,t])),animated=names.filter(n=>n!=='Rig_Root'&&!n.startsWith('Rig_Finger'));
if(!oldTracks.has('Rig_Root.position')||animated.some(n=>!oldTracks.has(n+'.quaternion')))throw Error('Earlier crouch incompatible with this rig');
const steps=120,duration=1.6,frames=[];
let maxDirectionError=0,maxFloorAdjustment=0,minBend=Infinity,maxBend=0,maxSwingPitchCorrection=0;
for(let i=0;i<=steps;i++){
 const phase=i/steps,src=sourcePose(phase);reset();
 top.position.copy(oldSample(oldTracks.get('Rig_Root.position'),phase));
 for(const n of animated)bones.get(n).quaternion.copy(oldSample(oldTracks.get(n+'.quaternion'),phase));
 top.updateMatrixWorld(true);
 setWorld(bones.get('Rig_Hips'),convertRotation(src.R[0]));
 for(const side of ['L','R']){
  const [a,b,c]=['upperleg01','lowerleg01','foot'].map(n=>src.P[id.get(n+'.'+side)]);
  const thigh=bones.get('Rig_Thigh_'+side),shin=bones.get('Rig_Shin_'+side),foot=bones.get('Rig_Foot_'+side);
  const thighDirection=convertVector(b.clone().sub(a)).normalize(),shinDirection=convertVector(c.clone().sub(b)).normalize();
  alignDirection(thigh,shin,thighDirection);alignDirection(shin,foot,shinDirection);
  setWorld(foot,convertRotation(src.R[id.get('foot.'+side)]));
  // Smoothly lift the toe during the forward swing to reduce ground scraping.
  // This changes the captured foot orientation; it is an authored correction,
  // not the original recording or a runtime contact detector.
  const swingPhase=(phase-(side==='L'?0:.5)+1)%1;
  const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
  const swing=smooth(swingPhase/.06)*(1-smooth((swingPhase-.18)/.12));
  const toe=pos(bones.get('Rig_Toes_'+side)).sub(pos(foot));
  const pitch=Math.atan2(toe.y,toe.z),lift=Math.max(0,-20*Math.PI/180-pitch)*swing;
  maxSwingPitchCorrection=Math.max(maxSwingPitchCorrection,lift*180/Math.PI);
  if(lift>0)setWorld(foot,new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-lift).multiply(quat(foot)));
  const A=pos(thigh),B=pos(shin),C=pos(foot),error=Math.max(B.clone().sub(A).normalize().angleTo(thighDirection),C.clone().sub(B).normalize().angleTo(shinDirection));
  maxDirectionError=Math.max(maxDirectionError,error*180/Math.PI);const bend=B.clone().sub(A).angleTo(C.clone().sub(B))*180/Math.PI;minBend=Math.min(minBend,bend);maxBend=Math.max(maxBend,bend);
 }
 const correction=.002-floorMin();top.position.y+=correction;top.updateMatrixWorld(true);maxFloorAdjustment=Math.max(maxFloorAdjustment,Math.abs(correction));
 frames.push({root:top.position.toArray(),rotations:new Map(animated.map(n=>[n,bones.get(n).quaternion.clone()]))});
}
// Bake a limited two-bone support-point fit at the nominal straight-line
// speed. These sole vertices are specific to the SHA-pinned model and were
// chosen from low, near-ground regions. This is NOT runtime contact detection
// or dynamic foot locking: turns, transitions and changing speeds may slip.
const footVertex={L:8114,R:4353};
function loadPose(f){
 reset();top.position.fromArray(f.root);for(const n of animated)bones.get(n).quaternion.copy(f.rotations.get(n));top.updateMatrixWorld(true);
}
function skinPoint(index){
 top.updateMatrixWorld(true);for(let k=0;k<names.length;k++)matrices[k].multiplyMatrices(bones.get(names[k]).matrixWorld,inverse[k]);
 const point=new Vector3().fromArray(p.getElement(index,[])),js=j.getElement(index,[]),ws=w.getElement(index,[]),out=new Vector3();
 for(let k=0;k<4;k++)if(ws[k])out.addScaledVector(point.clone().applyMatrix4(matrices[js[k]]),ws[k]);
 return out;
}
function horizontalFit(side,delta){
 const thigh=bones.get('Rig_Thigh_'+side),shin=bones.get('Rig_Shin_'+side),foot=bones.get('Rig_Foot_'+side);
 const hip=pos(thigh);let knee=pos(shin),ankle=pos(foot);const oldFoot=quat(foot);
 const upper=hip.distanceTo(knee),lower=knee.distanceTo(ankle),target=ankle.clone().add(delta);
 let dir=target.clone().sub(hip),dist=dir.length();if(dist<1e-8)return;
 dist=Math.min(upper+lower-.0001,Math.max(Math.abs(upper-lower)+.0001,dist));dir.normalize();target.copy(hip).addScaledVector(dir,dist);
 const along=(upper*upper+dist*dist-lower*lower)/(2*dist),height=Math.sqrt(Math.max(0,upper*upper-along*along));
 const plane=knee.clone().sub(hip);plane.addScaledVector(dir,-plane.dot(dir));if(plane.lengthSq()<1e-8)return;plane.normalize();
 const wantedKnee=hip.clone().addScaledVector(dir,along).addScaledVector(plane,height);
 setWorld(thigh,new Quaternion().setFromUnitVectors(knee.clone().sub(hip).normalize(),wantedKnee.clone().sub(hip).normalize()).multiply(quat(thigh)));
 knee=pos(shin);ankle=pos(foot);
 setWorld(shin,new Quaternion().setFromUnitVectors(ankle.clone().sub(knee).normalize(),target.clone().sub(knee).normalize()).multiply(quat(shin)));
 setWorld(foot,oldFoot);
}
const anchors={};for(const [side,i] of [['L',90],['R',30]]){loadPose(frames[i]);anchors[side]=skinPoint(footVertex[side]);}
let maxSupportFit=0,maxPostFitDirectionError=0,maxSupportFloorAdjustment=0,minPostBend=Infinity,maxPostBend=0;
const smoothSupport=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x)};
for(let i=0;i<=steps;i++){
 const phase=i/steps;loadPose(frames[i]);
 for(const [side,start,center,end] of [['L',.45,.75,1.05],['R',-.05,.25,.55]]){
  const supportPhase=side==='L'&&phase<.05?phase+1:side==='R'&&phase>.95?phase-1:phase;
  const strength=smoothSupport((supportPhase-start)/.08)*smoothSupport((end-supportPhase)/.08);
  if(strength<=0)continue;
  const current=skinPoint(footVertex[side]),wanted=anchors[side].clone();wanted.z-=.38*duration*(supportPhase-center);
  const delta=wanted.sub(current);delta.y=0;delta.multiplyScalar(strength);maxSupportFit=Math.max(maxSupportFit,delta.length());horizontalFit(side,delta);
 }
 const correction=.002-floorMin();top.position.y+=correction;top.updateMatrixWorld(true);
 maxSupportFloorAdjustment=Math.max(maxSupportFloorAdjustment,Math.abs(correction));
 const src=sourcePose(phase);
 for(const side of ['L','R']){
  const [a,b,c]=['upperleg01','lowerleg01','foot'].map(n=>src.P[id.get(n+'.'+side)]);
  const thigh=bones.get('Rig_Thigh_'+side),shin=bones.get('Rig_Shin_'+side),foot=bones.get('Rig_Foot_'+side);
  const A=pos(thigh),B=pos(shin),C=pos(foot),upper=B.clone().sub(A),lower=C.clone().sub(B);
  maxPostFitDirectionError=Math.max(maxPostFitDirectionError,upper.angleTo(convertVector(b.clone().sub(a)))*180/Math.PI,
    lower.angleTo(convertVector(c.clone().sub(b)))*180/Math.PI);
  const bend=upper.angleTo(lower)*180/Math.PI;minPostBend=Math.min(minPostBend,bend);maxPostBend=Math.max(maxPostBend,bend);
 }
 frames[i]={root:top.position.toArray(),rotations:new Map(animated.map(n=>[n,bones.get(n).quaternion.clone()]))};
}
if(!Number.isFinite(maxPostFitDirectionError)||maxPostFitDirectionError>20||maxSupportFit>.13||maxSupportFloorAdjustment>.08)
 throw Error('Support fit exceeded the recorded trial bounds');
const round=v=>Math.round(v*1e7)/1e7;
function tracksFor(poses,dur){
 const times=poses.map((_,i)=>round(dur*i/steps));
 const output=[{name:'Rig_Root.position',type:'vector',times,values:poses.flatMap(f=>f.root.map(round))}];
 for(const n of animated){const values=[];let prev=null;for(const f of poses){const q=f.rotations.get(n).clone();if(prev&&prev.dot(q)<0)q.set(-q.x,-q.y,-q.z,-q.w);values.push(...q.toArray().map(round));prev=q;}output.push({name:n+'.quaternion',type:'quaternion',times,values});}
 return output;
}
if(maxDirectionError>1e-5||maxFloorAdjustment>.2)throw Error('Retarget failed direction or floor sanity check');
const walk={name:'Crouch_Mocap_Legs_Trial',duration,speed:.38,tracks:tracksFor(frames,duration),stats:{
 referenceFrames:[42,78],referenceFps:30,crossfadeStart:.8,sourceDurationSeconds:1.2,playbackDurationSeconds:duration,
 rawTransferMaxDirectionErrorDegrees:maxDirectionError,rawTransferMinBendDegrees:minBend,rawTransferMaxBendDegrees:maxBend,
 rawMaxFloorAdjustmentM:maxFloorAdjustment,maxSwingPitchCorrectionDegrees:maxSwingPitchCorrection,
 supportFitMaxOffsetM:maxSupportFit,supportFitMaxDirectionErrorDegrees:maxPostFitDirectionError,
 supportFitAdditionalFloorAdjustmentM:maxSupportFloorAdjustment,finalMinBendDegrees:minPostBend,finalMaxBendDegrees:maxPostBend,
}};
// Construct a stationary, approximately symmetric pose from the two legs of
// captured frame 48; it is NOT a recorded idle. Mirroring/averaging their
// directions makes the thighs and shins alike instead of freezing a stride.
// Match the same pelvis pitch as the walk, so starting to move does not cause
// a dramatic change in crouch depth or body angle. The earlier idle supplies
// only the upper-body motion and the original toe tracks.
const oldIdle=previous.clips[0],idleTracks=new Map(oldIdle.tracks.map(t=>[t.name,t])),reference=sourcePose(6/36);
const sourceDirections={};for(const side of ['L','R']){
 const [a,b,c]=['upperleg01','lowerleg01','foot'].map(n=>reference.P[id.get(n+'.'+side)]);
 sourceDirections[side]=[convertVector(b.clone().sub(a)).normalize(),convertVector(c.clone().sub(b)).normalize()];
}
const mirror=v=>new Vector3(-v.x,v.y,v.z);
const symmetric=sourceDirections.L.map((v,k)=>v.clone().add(mirror(sourceDirections.R[k])).normalize());
const pelvis=convertRotation(reference.R[0]),pitch=2*Math.atan2(pelvis.x,pelvis.w),idlePoses=[];
let maxIdleFloorAdjustment=0,minIdleBend=Infinity,maxIdleBend=0;
for(let i=0;i<=steps;i++){
 const phase=i/steps;reset();top.position.copy(oldSample(idleTracks.get('Rig_Root.position'),phase));
 for(const n of animated)bones.get(n).quaternion.copy(oldSample(idleTracks.get(n+'.quaternion'),phase));
 top.updateMatrixWorld(true);setWorld(bones.get('Rig_Hips'),new Quaternion().setFromAxisAngle(new Vector3(1,0,0),pitch));
 for(const side of ['L','R']){
  const thigh=bones.get('Rig_Thigh_'+side),shin=bones.get('Rig_Shin_'+side),foot=bones.get('Rig_Foot_'+side);
  const dirs=side==='L'?symmetric:symmetric.map(mirror);
  alignDirection(thigh,shin,dirs[0]);alignDirection(shin,foot,dirs[1]);setWorld(foot,new Quaternion());
  const a=pos(thigh),b=pos(shin),c=pos(foot),bend=b.clone().sub(a).angleTo(c.clone().sub(b))*180/Math.PI;
  minIdleBend=Math.min(minIdleBend,bend);maxIdleBend=Math.max(maxIdleBend,bend);
 }
 const correction=.002-floorMin();top.position.y+=correction;top.updateMatrixWorld(true);maxIdleFloorAdjustment=Math.max(maxIdleFloorAdjustment,Math.abs(correction));
 idlePoses.push({root:top.position.toArray(),rotations:new Map(animated.map(n=>[n,bones.get(n).quaternion.clone()]))});
}
const idle={name:'Crouch_Symmetric_Trial',duration:oldIdle.duration,speed:0,tracks:tracksFor(idlePoses,oldIdle.duration),stats:{referenceFrame:48,constructedNotCaptured:true,maxFloorAdjustment:maxIdleFloorAdjustment,minBendDegrees:minIdleBend,maxBendDegrees:maxIdleBend}};
const data={modelSha256:sources.model[1],source:'100STYLE by Ian Mason, Sebastian Starke and Taku Komura, CC BY 4.0; retargeted and cut as HumanMotionCraft Crouch walk 7, then adapted to this character.',
 notes:'Idle is constructed from mirrored directions of captured frame 48, not a recorded idle. Walking pelvis, thighs and shins begin from an adapted 100STYLE cycle; arms use the earlier trial. In-place, yaw removed, cycle crossfaded, floor adjusted and slowed from 1.2 to 1.6 seconds. Feet are raised during swing and the legs receive a baked support-point IK fit at 0.38 m/s; this is not dynamic contact locking.',clips:[idle,walk]};
const output=process.argv[2]?path.resolve(process.argv[2]):path.join(here,'crouch-clips.json');
if(output===path.join(repo,sources.model[0])||(output.startsWith(repo+path.sep)&&output!==path.join(here,'crouch-clips.json')))throw Error('Refusing to overwrite another repository artifact');
fs.writeFileSync(output,JSON.stringify(data)+'\n');console.log(JSON.stringify(walk.stats,null,2));
