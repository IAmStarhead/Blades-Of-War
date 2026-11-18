// Independent hip-weight and locomotion review for this specific male rig.
// No reference model, photograph, video or animation data is copied here.
// The last delivered trial is the checked source, not an output to overwrite.
// Rest geometry, rig, morphs and old animation keys remain intact. Only the
// copied model's proximal hip weights change; original weights are retained
// as custom glTF attributes so the viewer can compare the actual prior trial.
import {Accessor,NodeIO} from '@gltf-transform/core';
import {Bone,Matrix4,Quaternion,Vector3} from 'three';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../..');
const OWN=path.join(ROOT,'work/male-motion-review');
const SOURCE_SHA='a9b2587d8d5b7977aed04a06540cd1b4882a47a2af4491767a7f5ae34e1828e9';
const sha=b=>createHash('sha256').update(b).digest('hex');
const args=process.argv.slice(2);if(args.length!==2)throw new Error('Usage: node author.mjs PREVIOUS.glb OUTPUT.glb');
const [input,output]=args.map(p=>path.resolve(p));
if(input===output||(output.startsWith(ROOT+path.sep)&&!output.startsWith(OWN+path.sep)))throw new Error('Refusing to overwrite another artifact');
const bytes=fs.readFileSync(input);if(sha(bytes)!==SOURCE_SHA)throw new Error('Unexpected previous model');
const io=new NodeIO(),doc=await io.readBinary(bytes),root=doc.getRoot(),buffer=root.listBuffers()[0];
const unique=name=>{const a=root.listNodes().filter(n=>n.getName()===name);if(a.length!==1)throw new Error(`Expected one ${name}`);return a[0]};
const bodyNode=unique('head_2'),body=bodyNode.getMesh().listPrimitives()[0],skin=root.listSkins()[0];
const position=body.getAttribute('POSITION'),joints=body.getAttribute('JOINTS_0'),weights=body.getAttribute('WEIGHTS_0');
const nodes=skin.listJoints(),names=new Map(nodes.map(n=>[n.getName(),n]));
if(nodes.length!==22||body.listTargets().length!==13||bodyNode.getMesh().getWeights().length!==13)throw new Error('Unexpected rig or morph targets');
for(const n of ['Reviewed_Walk','Reviewed_Run'])if(root.listAnimations().some(a=>a.getName()===n))throw new Error('Clip exists: '+n);

// Preserve the previous skin attributes for exact viewer comparison, while
// using a broader transition between pelvis and upper thigh in the new GLB.
// The baseline mesh and topology stay intact. Other anatomical regions and
// non hip/thigh influences are untouched; weights still sum to one.
const originalJoints=Uint16Array.from(joints.getArray()),originalWeights=Float32Array.from(weights.getArray());
body.setAttribute('_PREVIOUS_JOINTS',doc.createAccessor('Previous_Hip_Joints',buffer).setType(Accessor.Type.VEC4).setArray(originalJoints));
body.setAttribute('_PREVIOUS_WEIGHTS',doc.createAccessor('Previous_Hip_Weights',buffer).setType(Accessor.Type.VEC4).setArray(originalWeights));
const newJoints=Uint16Array.from(originalJoints),newWeights=Float32Array.from(originalWeights),skinNames=nodes.map(n=>n.getName()),hipIndex=skinNames.indexOf('Rig_Hips');
const skinSmooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
let changedSkin=0,maxWeightChange=0;
for(let i=0;i<position.getCount();i++){
 const [x,y,z]=position.getElement(i,[]);if(y<.56||y>1.20)continue;
 const thigh=skinNames.indexOf('Rig_Thigh_'+(x>=0?'L':'R')),j=Array.from(originalJoints.subarray(4*i,4*i+4)),w=Array.from(originalWeights.subarray(4*i,4*i+4));
 const iw=j.indexOf(thigh),ih=j.indexOf(hipIndex),sum=(iw>=0?w[iw]:0)+(ih>=0?w[ih]:0);if(sum<.001)continue;
 const old=iw>=0?w[iw]:0,fac=(1-skinSmooth(.62,1.05,y))*(1-skinSmooth(.70,.78,y)*(1-skinSmooth(.015,.07,Math.abs(x)))),neu=sum*fac;
 if(Math.abs(neu-old)<1e-6)continue;
 const others=[];for(let k=0;k<4;k++)if(j[k]!==hipIndex&&j[k]!==thigh&&w[k]>1e-7)others.push([j[k],w[k]]);
 const vals=[...others,[thigh,neu],[hipIndex,sum-neu]].filter(x=>x[1]>1e-8).sort((a,b)=>b[1]-a[1]);if(vals.length>4)throw Error('Too many hip influences');
 for(let k=0;k<4;k++){newJoints[4*i+k]=vals[k]?.[0]??0;newWeights[4*i+k]=vals[k]?.[1]??0}
 changedSkin++;maxWeightChange=Math.max(maxWeightChange,Math.abs(neu-old));
}
body.setAttribute('JOINTS_0',doc.createAccessor('Reviewed_Hip_Joints',buffer).setType(Accessor.Type.VEC4).setArray(newJoints));
body.setAttribute('WEIGHTS_0',doc.createAccessor('Reviewed_Hip_Weights',buffer).setType(Accessor.Type.VEC4).setArray(newWeights));

// Reconstruct the bind skeleton. In this rig the bind orientations are
// identity, so the authored hinge axes are explicitly known and repeatable.
const rig=new Map();
for(const node of nodes){
 const b=new Bone();b.name=node.getName();b.position.fromArray(node.getTranslation());b.quaternion.fromArray(node.getRotation());
 if(b.quaternion.angleTo(new Quaternion())>1e-7||node.getScale().some(x=>Math.abs(x-1)>1e-7))throw new Error('Unexpected bind orientation: '+b.name);
 rig.set(b.name,b);
}
for(const node of nodes){const p=node.getParentNode()?.getName();if(rig.has(p))rig.get(p).add(rig.get(node.getName()))}
const skeleton=rig.get('Rig_Root'),hip=rig.get('Rig_Hips'),spine=rig.get('Rig_Spine'),chest=rig.get('Rig_Chest');
const inverse=nodes.map((_,i)=>new Matrix4().fromArray(skin.getInverseBindMatrices().getElement(i,[])));
const matrices=nodes.map(()=>new Matrix4()),sole={L:[],R:[]};
for(let i=0;i<position.getCount();i++){
 const p=position.getElement(i,[]);if(p[1]>=.12||Math.abs(p[0])<=.03||Math.abs(p[0])>=.22)continue;
 // Existing corrective shapes must not be silently omitted at the feet.
 for(const target of body.listTargets()){
  const d=target.getAttribute('POSITION')?.getElement(i,[])||[0,0,0];if(Math.hypot(...d)>1e-8)throw new Error('A morph moves the selected sole');
 }
 sole[p[0]>0?'L':'R'].push({p:new Vector3().fromArray(p),j:joints.getElement(i,[]),w:weights.getElement(i,[])});
}
if(sole.L.length<20||sole.R.length<20)throw new Error('Missing sole vertices');
const P=b=>b.getWorldPosition(new Vector3()),Q=b=>b.getWorldQuaternion(new Quaternion());
function minimumFoot(side){
 skeleton.updateMatrixWorld(true);
 for(let i=0;i<nodes.length;i++)matrices[i].multiplyMatrices(rig.get(nodes[i].getName()).matrixWorld,inverse[i]);
 let minimum=Infinity;
 for(const v of sole[side]){
  let y=0;for(let k=0;k<4;k++)if(v.w[k]){const e=matrices[v.j[k]].elements,p=v.p;y+=v.w[k]*(e[1]*p.x+e[5]*p.y+e[9]*p.z+e[13])}
  minimum=Math.min(minimum,y);
 }
 return minimum;
}
const rad=x=>x*Math.PI/180,axisX=new Vector3(1,0,0),axisY=new Vector3(0,1,0),axisZ=new Vector3(0,0,1),ident=new Quaternion();
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
const lerp=(a,b,t)=>a+(b-a)*t;
const qx=x=>new Quaternion().setFromAxisAngle(axisX,rad(x));
const qy=x=>new Quaternion().setFromAxisAngle(axisY,rad(x));
const qz=x=>new Quaternion().setFromAxisAngle(axisZ,rad(x));
function clearPose(){
 for(const node of nodes){const b=rig.get(node.getName());b.position.fromArray(node.getTranslation());b.quaternion.fromArray(node.getRotation());b.scale.set(1,1,1)}
 skeleton.updateMatrixWorld(true);
}
// Two-link IK with a forward-facing knee plane. It works in this model's bind
// coordinates and preserves the independently controlled foot orientation.
function solveLeg(side,goal){
 const thigh=rig.get('Rig_Thigh_'+side),shin=rig.get('Rig_Shin_'+side),foot=rig.get('Rig_Foot_'+side);
 skeleton.updateMatrixWorld(true);
 const a=P(thigh);let b=P(shin),c=P(foot);const footWorld=Q(foot),l1=a.distanceTo(b),l2=b.distanceTo(c);
 const direction=goal.clone().sub(a);let distance=direction.length();
 const hi=l1+l2-.0002,lo=Math.abs(l1-l2)+.0002;
 if(distance<1e-8)throw new Error('Degenerate foot target');
 distance=Math.max(lo,Math.min(hi,distance));direction.setLength(distance);const target=a.clone().add(direction);direction.normalize();
 const along=(l1*l1+distance*distance-l2*l2)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along));
 const forward=new Vector3(0,0,1).addScaledVector(direction,-direction.z);
 if(forward.lengthSq()<1e-10)throw new Error('Degenerate knee plane');forward.normalize();
 const desiredKnee=a.clone().addScaledVector(direction,along).addScaledVector(forward,height);
 let turn=new Quaternion().setFromUnitVectors(b.clone().sub(a).normalize(),desiredKnee.clone().sub(a).normalize());
 thigh.quaternion.copy(Q(thigh.parent).invert().multiply(turn.multiply(Q(thigh)))).normalize();skeleton.updateMatrixWorld(true);
 b=P(shin);c=P(foot);turn.setFromUnitVectors(c.clone().sub(b).normalize(),target.clone().sub(b).normalize());
 shin.quaternion.copy(Q(shin.parent).invert().multiply(turn.multiply(Q(shin)))).normalize();skeleton.updateMatrixWorld(true);
 foot.quaternion.copy(Q(foot.parent).invert().multiply(footWorld)).normalize();skeleton.updateMatrixWorld(true);
}

// Approximate pivot compensation for heel and forefoot roll, based on this
// rig's bind foot: local offsets from the ankle, in metres. This reduces
// horizontal movement of the selected low heel/toe regions on level ground;
// it is not runtime foot locking or a guarantee under blended poses.
function footRollCompensation(pitch){
 const p=rad(pitch),z=pitch<0?-.036:.205,y=-.105;
 return z-(z*Math.cos(p)+y*Math.sin(p));
}
// The ankle moves backwards during stance at the controller's forward speed;
// a cubic Hermite swing matches that velocity at both boundaries. This is a
// hand-authored approximation, not motion extracted from any game.
function footPath(t,c){
 t=((t%1)+1)%1;const A=c.speed*c.duration*c.stance/2;
 if(t<c.stance){
  const s=t/c.stance;
  const heel=-c.heel*(1-smooth(s/.18));
  const toe=c.toe*smooth((s-.78)/.22);
  return {z:A*(1-2*s),height:0,pitch:heel+toe,contact:true};
 }
 const s=(t-c.stance)/(1-c.stance),m=-2*A*(1-c.stance)/c.stance;
 const h00=2*s*s*s-3*s*s+1,h10=s*s*s-2*s*s+s,h01=-2*s*s*s+3*s*s,h11=s*s*s-s*s;
 const z=h00*(-A)+h10*m+h01*A+h11*m;
 // Lift slightly earlier than the middle of swing, then settle smoothly.
 // Both endpoints have zero vertical velocity (the curve is C1).
 const height=c.lift*Math.sin(Math.PI*Math.pow(s,c.swingTimePower))**c.liftExponent;
 const pitch=lerp(c.toe,-c.heel,smooth(s));
 return {z,height,pitch,contact:false,swing:s};
}
const configs=[
 // The width is the ankle centreline, not a change to the mesh. The
 // pelvis shifts towards the planted leg, and the chest counter-rotates
 // rather than exactly cancelling all of the visible movement.
 {name:'Reviewed_Walk',kind:'walk',duration:1,speed:.9,stance:.58,lift:.085,liftExponent:2,swingTimePower:.80,
  heel:9,toe:24,centerZ:-.055,swingMinKnee:11,footX:.102,toeOut:2.5,weightShift:.006,
  hipPitch:1.2,spinePitch:1.9,chestPitch:.2,hipYaw:3.0,chestYaw:3.2,hipRoll:1.8,chestRoll:1.0,
  armOut:3,armSwing:22,bend:20,bendVariation:4},
 // This is a separate run, not a speeded-up walking loop. It has shorter
 // support, a visible flight, a longer stride and a modest forward lean.
 {name:'Reviewed_Run',kind:'run',duration:.70,speed:2.4,stance:.36,lift:.15,liftExponent:1.35,swingTimePower:.82,
  heel:7,toe:26,centerZ:-.055,swingMinKnee:12,footX:.100,toeOut:2.0,weightShift:.008,
  hipPitch:3.0,spinePitch:5.0,chestPitch:.8,hipYaw:3.0,chestYaw:4.0,hipRoll:2.0,chestRoll:1.5,
  armOut:4.5,armSwing:34,bend:62,bendVariation:5},
];
const targetNames=nodes.map(n=>n.getName()).filter(n=>n!=='Rig_Root');
function correctiveWeight(angle){const r=rad(100);return Math.min(1.15,(1-Math.cos(angle/2))/(1-Math.cos(r/2)))}
function build(c){
 const steps=120,frames=[],stats={soleResidual:0,swingReachLimitFrames:0,rootY:[Infinity,-Infinity],
  kneeForward:Infinity,kneeBendDegrees:[Infinity,-Infinity],armRotationDegrees:[Infinity,-Infinity],elbowBendDegrees:[Infinity,-Infinity],flights:0};
 for(let i=0;i<steps;i++){
  const phase=i/steps;clearPose();
  // A weight transfer to the planted side plus coordinated, *visible*
  // opposing rotation of hips and shoulders. Do not twist the spine just
  // to cancel every movement at the skin: that produced the rigid mannequin.
  const wave=Math.cos(2*Math.PI*phase),shift=Math.sin(2*Math.PI*(phase+(c.kind==='run'?.07:0))),
        bounce=Math.sin(4*Math.PI*phase),rootX=c.weightShift*shift;
  skeleton.position.set(rootX,0,0);
  hip.quaternion.copy(qy(-c.hipYaw*wave).multiply(qz(c.hipRoll*shift)).multiply(qx(c.hipPitch+.45*bounce)));
  spine.quaternion.copy(qy((c.hipYaw+c.chestYaw)*.65*wave).multiply(qz(-(c.hipRoll+c.chestRoll)*.65*shift)).multiply(qx(c.spinePitch+.35*bounce)));
  chest.quaternion.copy(qy((c.hipYaw+c.chestYaw)*.35*wave).multiply(qz(-(c.hipRoll+c.chestRoll)*.35*shift)).multiply(qx(c.chestPitch)));
  const pitch=c.hipPitch+c.spinePitch+c.chestPitch+.8*bounce;
  rig.get('Rig_Neck').quaternion.copy(qy(-.35*c.chestYaw*wave).multiply(qz(.35*c.chestRoll*shift)).multiply(qx(-.45*pitch)));
  rig.get('Rig_Head').quaternion.copy(qy(-.65*c.chestYaw*wave).multiply(qz(.65*c.chestRoll*shift)).multiply(qx(-.55*pitch)));
  const paths={};
  // Animate the clavicle/shoulder girdle with the arm, rather than leaving
  // the local shoulder joints at bind pose. Spine/hip sway is not amplified.
  const shoulderPitch=9,shoulderYaw=9,shoulderRoll=1.1;
  for(const [side,sign] of [['L',1],['R',-1]]){
   const amount=c.kind==='walk'?.55:1;
   rig.get('Rig_Shoulder_'+side).quaternion.copy(qy(amount*shoulderYaw*wave).multiply(qz(amount*shoulderRoll*wave)).multiply(qx(sign*amount*shoulderPitch*wave)));
  }
  for(const [side,sign,offset] of [['L',1,0],['R',-1,.5]]){
   const t=(phase+offset)%1,
    armSwing=c.armSwing*(Math.cos(2*Math.PI*t)+.10*Math.sin(4*Math.PI*t)),
    elbow=c.bend+c.bendVariation*Math.sin(2*Math.PI*(t+.06));
   // A single controlled shoulder swing and a single elbow hinge. No
   // forearm twist or independently rotating wrist is introduced.
   // Move the clavicle/socket without adding its rotation on top of the
   // accepted swing. Five degrees of additional outward clearance reduces
   // the existing overlap of the inner arm and torso in sampled poses; it
   // does not make that region collision-free or change forearm twist.
   const arm=qz(sign*(c.armOut+5)).multiply(qx(armSwing));
   rig.get('Rig_UpperArm_'+side).quaternion.copy(rig.get('Rig_Shoulder_'+side).quaternion.clone().invert().multiply(arm));
   const elbowAxis=new Vector3(-1,0,0);
   rig.get('Rig_Forearm_'+side).quaternion.setFromAxisAngle(elbowAxis,rad(elbow));
   paths[side]=footPath(t,c);paths[side].elbow=elbow;
   stats.armRotationDegrees[0]=Math.min(stats.armRotationDegrees[0],armSwing);stats.armRotationDegrees[1]=Math.max(stats.armRotationDegrees[1],armSwing);
   stats.elbowBendDegrees[0]=Math.min(stats.elbowBendDegrees[0],elbow);stats.elbowBendDegrees[1]=Math.max(stats.elbowBendDegrees[1],elbow);
  }
  if(!paths.L.contact&&!paths.R.contact)stats.flights++;
  skeleton.updateMatrixWorld(true);
  const goals={};
  for(const [side,sign] of [['L',1],['R',-1]]){
   const foot=rig.get('Rig_Foot_'+side),shin=rig.get('Rig_Shin_'+side);
   foot.quaternion.copy(Q(shin).invert().multiply(qy(sign*c.toeOut).multiply(qx(paths[side].pitch))));skeleton.updateMatrixWorld(true);
   // The bind foot is slightly behind the hip. Add the authored stride to it.
   const ankle=P(foot),minimum=minimumFoot(side),targetY=.002+paths[side].height;
   goals[side]={x:sign*(c.footX-(paths[side].contact?0:.004*Math.sin(Math.PI*paths[side].swing))),z:c.centerZ+paths[side].z+footRollCompensation(paths[side].pitch),y:ankle.y+targetY-minimum,targetY};
  }
  // Shape the support knee explicitly rather than clamping most of stance
  // to the same bend. This drives the vertical pelvis from the planted leg.
  // Key bends: heel strike, load, mid stance, push-off (degrees).
  const kneePoints=c.kind==='walk'?[[0,12],[.10,17],[.28,11],[.45,16],[.58,28]]:[[0,23],[.08,32],[.18,34],[.28,25],[.36,18]];
  function knee(t){
   t=((t%1)+1)%1;
   for(let i=0;i<kneePoints.length-1;i++){
    const [a,va]=kneePoints[i],[b,vb]=kneePoints[i+1];
    if(t<=b)return lerp(va,vb,smooth((t-a)/(b-a)));
   }
   return 12;
  }
  function smin(a,b,k){
   const h=Math.max(k-Math.abs(a-b),0)/k;return Math.min(a,b)-h*h*k*.25;
  }
  const limits=[];
  for(const [side,offset] of [['L',0],['R',.5]]){
   const a=P(rig.get('Rig_Thigh_'+side)),b=P(rig.get('Rig_Shin_'+side)),d=P(rig.get('Rig_Foot_'+side)),g=goals[side];
   const t=(phase+offset)%1;
   // The extension limit must meet the contact bend continuously. An
   // abrupt 12° -> 23° change here produced a visible snap at landing.
   const landingBend=c.kind==='run'?23:12;
   const angle=t<c.stance?knee(t):lerp(c.swingMinKnee,landingBend,smooth((t-.82)/.18));
   const l1=a.distanceTo(b),l2=b.distanceTo(d),reach=Math.sqrt(l1*l1+l2*l2+2*l1*l2*Math.cos(rad(angle)));
   const dx=g.x-a.x,dz=g.z-a.z,remaining=reach*reach-dx*dx-dz*dz;
   if(remaining<=0)throw new Error(c.name+': horizontal target unreachable');
   const limit=g.y+Math.sqrt(remaining)-(a.y-skeleton.position.y);
   limits.push({side,limit,contact:t<c.stance});
  }
  // Both feet can limit pelvis height during double support. A small smooth
  // minimum avoids a sharp switch while never exceeding either reach bound.
  if(!limits.reduce((a,b)=>a.limit<b.limit?a:b).contact)stats.swingReachLimitFrames++;
  const reachY=smin(limits[0].limit,limits[1].limit,.004);
  // During flight, a separate smooth rise/fall keeps the torso from
  // hanging at the ankle reach limit. The reach bound still prevents
  // impossible targets at takeoff and landing.
  const rootY=c.kind==='run'?smin(reachY,-.040-.012*Math.cos(4*Math.PI*(phase-.18)),.003):reachY;
  skeleton.position.y=rootY;skeleton.updateMatrixWorld(true);
  for(let iteration=0;iteration<5;iteration++)for(const side of ['L','R']){
   const foot=rig.get('Rig_Foot_'+side),g=goals[side],ankle=P(foot);
   const target=new Vector3(g.x,ankle.y+(g.targetY-minimumFoot(side)),g.z);solveLeg(side,target);
  }
  for(const side of ['L','R']){
   const residual=Math.abs(minimumFoot(side)-goals[side].targetY);stats.soleResidual=Math.max(stats.soleResidual,residual);
   const a=P(rig.get('Rig_Thigh_'+side)),b=P(rig.get('Rig_Shin_'+side)),d=P(rig.get('Rig_Foot_'+side));
   const direction=d.clone().sub(a).normalize(),offset=b.clone().sub(a).addScaledVector(direction,-b.clone().sub(a).dot(direction));
   stats.kneeForward=Math.min(stats.kneeForward,offset.z);
   const bend=b.clone().sub(a).normalize().angleTo(d.clone().sub(b).normalize())*180/Math.PI;
   stats.kneeBendDegrees[0]=Math.min(stats.kneeBendDegrees[0],bend);stats.kneeBendDegrees[1]=Math.max(stats.kneeBendDegrees[1],bend);
  }
  stats.rootY[0]=Math.min(stats.rootY[0],rootY);stats.rootY[1]=Math.max(stats.rootY[1],rootY);
  const rotations=new Map(targetNames.map(n=>[n,rig.get(n).quaternion.clone()]));
  // The new run bends the elbows a little more than the last jog. Use a
  // conservative 25% stronger existing local elbow corrective in this clip;
  // it does not change the rest mesh or prove a constant anatomical volume.
  const elbowCorrective=c.kind==='run'?1.25:1;
  const morph=[0,1,elbowCorrective*correctiveWeight(rad(paths.L.elbow)),elbowCorrective*correctiveWeight(rad(paths.R.elbow)),
   correctiveWeight(2*Math.acos(Math.min(1,Math.abs(rig.get('Rig_Shin_L').quaternion.w)))),
   correctiveWeight(2*Math.acos(Math.min(1,Math.abs(rig.get('Rig_Shin_R').quaternion.w)))),0,0,0,0,c.kind==='run'?1:.90,0,0];
  frames.push({rootX,rootY,rotations,morph});
 }
 if(stats.soleResidual>.005)throw new Error(`${c.name}: excessive sole fitting error ${stats.soleResidual}`);
 if(stats.kneeForward<-.001)throw new Error(`${c.name}: backwards knee ${stats.kneeForward}`);
 // Explicit, exact looping endpoint avoids numerical disagreement at 0/1.
 frames.push({rootX:frames[0].rootX,rootY:frames[0].rootY,rotations:new Map([...frames[0].rotations].map(([n,q])=>[n,q.clone()])),morph:[...frames[0].morph]});
 const animation=doc.createAnimation(c.name),times=Float32Array.from(frames.map((_,i)=>c.duration*i/steps));
 const time=doc.createAccessor(c.name+'_Time',buffer).setType(Accessor.Type.SCALAR).setArray(times);
 function channel(node,p,type,array){
  const out=doc.createAccessor(c.name+'_'+node+'_'+p,buffer).setType(type).setArray(array);
  const sampler=doc.createAnimationSampler().setInput(time).setOutput(out).setInterpolation('LINEAR');
  animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(unique(node)).setTargetPath(p).setSampler(sampler));
 }
 channel('Rig_Root','translation',Accessor.Type.VEC3,Float32Array.from(frames.flatMap(f=>[f.rootX,f.rootY,0])));
 for(const name of targetNames){
  let prev=null;const data=new Float32Array(frames.length*4);
  frames.forEach((f,i)=>{const q=f.rotations.get(name);if(prev&&prev.dot(q)<0)q.set(-q.x,-q.y,-q.z,-q.w);q.toArray(data,4*i);prev=q});
  channel(name,'rotation',Accessor.Type.VEC4,data);
 }
 channel('head_2','weights',Accessor.Type.SCALAR,Float32Array.from(frames.flatMap(f=>f.morph)));
 return {name:c.name,duration:c.duration,speed:c.speed,stance:c.stance,footLift:c.lift,swingTimePower:c.swingTimePower,swingMinKneeDegrees:c.swingMinKnee,heelDegrees:c.heel,toeDegrees:c.toe,
  ankleCentreX:c.footX,weightShift:c.weightShift,hipYawDegrees:c.hipYaw,chestYawDegrees:c.chestYaw,sampleCount:steps,stats};
}
const clips=configs.map(build);
function cloneCrouch(srcName,name){
 const src=root.listAnimations().find(a=>a.getName()===srcName);if(!src)throw Error('Missing crouch clip');const anim=doc.createAnimation(name);
 for(const c of src.listChannels()){
  const old=c.getSampler();let out=old.getOutput();
  if(c.getTargetNode()===bodyNode&&c.getTargetPath()==='weights'){
   const values=Float32Array.from(out.getArray()),N=old.getInput().getCount();if(values.length!==13*N)throw Error('Unexpected crouch morphs');
   // The old pose-space shapes were fitted to the old skin weights. Do not
   // combine them with the new weight painting.
   for(let i=0;i<N;i++){values[13*i+11]=0;values[13*i+12]=0}
   out=doc.createAccessor(name+'_Weights',buffer).setType(Accessor.Type.SCALAR).setArray(values);
  }
  const nodeName=c.getTargetNode().getName();
  if(c.getTargetPath()==='rotation'&&/^(Rig_Shoulder|Rig_UpperArm)_[LR]$/.test(nodeName)){
   // The shoulder moves gently in stealth. Counter-rotate the upper-arm
   // child to preserve the accepted arm direction rather than adding two
   // swings together; other crouch keys stay exactly as delivered.
   const count=old.getInput().getCount(),values=new Float32Array(count*4),left=nodeName.endsWith('_L')?1:-1,walking=srcName.endsWith('_Walk');
   const isShoulder=nodeName.startsWith('Rig_Shoulder_');let previous=null;
   for(let i=0;i<count;i++){
    const phase=i/(count-1),wave=Math.cos(2*Math.PI*phase),breath=Math.sin(2*Math.PI*phase);
    const shoulder=walking?qy(3*wave).multiply(qz(.5*wave)).multiply(qx(left*3.5*wave)):qz(left*.35*breath).multiply(qx(left*.5*breath));
    const original=new Quaternion().fromArray(old.getOutput().getElement(i,[]));
    const q=isShoulder?shoulder:shoulder.invert().multiply(original);
    if(previous&&previous.dot(q)<0)q.set(-q.x,-q.y,-q.z,-q.w);q.toArray(values,4*i);previous=q;
   }
   // Float32 endpoints must be literally identical for a seamless loop.
   values.set(values.subarray(0,4),4*(count-1));
   out=doc.createAccessor(name+'_'+nodeName+'_Rotation',buffer).setType(Accessor.Type.VEC4).setArray(values);
  }
  const sampler=doc.createAnimationSampler().setInput(old.getInput()).setOutput(out).setInterpolation(old.getInterpolation());
  anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(c.getTargetNode()).setTargetPath(c.getTargetPath()).setSampler(sampler));
 }
}
cloneCrouch('Stealth_Crouch_Idle','Reviewed_Crouch_Idle');cloneCrouch('Stealth_Crouch_Walk','Reviewed_Crouch_Walk');

// Restore the existing morph names, including deliberately blank names, which
// glTF-Transform otherwise substitutes with numeric strings on read.
const sourceJSON=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
for(const node of sourceJSON.nodes.filter(n=>n.mesh!==undefined)){
 const targetNames=sourceJSON.meshes[node.mesh].extras?.targetNames;if(!targetNames)continue;
 const targets=unique(node.name).getMesh().listPrimitives()[0].listTargets();
 if(targets.length!==targetNames.length)throw new Error('Unexpected targets on '+node.name);
 targetNames.forEach((n,i)=>targets[i].setName(n));
}
const result=Buffer.from(await io.writeBinary(doc));fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,result);
console.log(JSON.stringify({sourceSha256:SOURCE_SHA,outputSha256:sha(result),bytes:result.length,bones:nodes.length,skin:{changedSkin,maxWeightChange},soleVertices:{L:sole.L.length,R:sole.R.length},clips,allAnimations:root.listAnimations().map(a=>a.getName())},null,2));
