// Author independent, in-place game locomotion for this specific rig.
// No Project Zomboid mesh, animation, capture data or source file is used.
// The last delivered model, all previous clips, topology and skinning remain.
import {Accessor,NodeIO} from '@gltf-transform/core';
import {Bone,Euler,Matrix4,Quaternion,Vector3} from 'three';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../..');
const OWN=path.join(ROOT,'work/male-zomboid-style');
const SOURCE_SHA='0525f293409ad40e5146f461964d89d23e863ac57f57b12a51ea453f87867554';
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
if(nodes.length!==22||body.listTargets().length!==10||bodyNode.getMesh().getWeights().length!==10)throw new Error('Unexpected rig or morph targets');
for(const n of ['Game_Style_Walk','Game_Style_Jog'])if(root.listAnimations().some(a=>a.getName()===n))throw new Error('Clip exists: '+n);

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
const rad=x=>x*Math.PI/180,axisX=new Vector3(1,0,0),axisZ=new Vector3(0,0,1),ident=new Quaternion();
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
const lerp=(a,b,t)=>a+(b-a)*t;
const qx=x=>new Quaternion().setFromAxisAngle(axisX,rad(x));
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

// The planted segment moves backwards at speed*duration in model space;
// a cubic Hermite swing matches its velocity at both boundaries. Vertical
// lift is smooth and independent. This is a hand-authored approximation,
// not a measured or extracted animation from Project Zomboid.
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
 // The jog has a short but visible airborne interval. A C1 lift curve
 // leaves and meets the floor with zero vertical velocity; walking keeps its
 // gentler, more nearly flat-footed swing.
 const height=c.lift*Math.sin(Math.PI*s)**c.liftExponent;
 const pitch=lerp(c.toe,-c.heel,smooth(s));
 return {z,height,pitch,contact:false};
}
const configs=[
 {name:'Game_Style_Walk',duration:1.0,speed:.9,stance:.62,lift:.065,liftExponent:2,heel:5,toe:7,rootY:-.054,bob:.008,legReserve:.015,
  hipPitch:.7,spinePitch:1.0,armOut:3,armSwing:17,bend:14,bendVariation:4},
 {name:'Game_Style_Jog',duration:.72,speed:1.9,stance:.40,lift:.12,liftExponent:1.3,heel:3,toe:6,rootY:-.059,bob:.009,legReserve:.003,
  hipPitch:2.0,spinePitch:3.0,armOut:4,armSwing:28,bend:58,bendVariation:5},
];
const targetNames=nodes.map(n=>n.getName()).filter(n=>n!=='Rig_Root');
function correctiveWeight(angle){const r=rad(100);return Math.min(1.15,(1-Math.cos(angle/2))/(1-Math.cos(r/2)))}
function build(c){
 const steps=120,frames=[],stats={soleResidual:0,rootClamps:0,rootY:[Infinity,-Infinity],
  kneeForward:Infinity,armRotationDegrees:[Infinity,-Infinity],elbowBendDegrees:[Infinity,-Infinity],flights:0};
 for(let i=0;i<steps;i++){
  const phase=i/steps;clearPose();
  // Keep pelvis yaw, roll and lateral translation at zero. The previous
  // rejected trial only changed belly vertices, not these actual bones.
  skeleton.position.y=c.rootY-c.bob*Math.cos(4*Math.PI*phase);
  hip.quaternion.copy(qx(c.hipPitch));spine.quaternion.copy(qx(c.spinePitch));chest.quaternion.identity();
  rig.get('Rig_Neck').quaternion.copy(qx(-.45*(c.hipPitch+c.spinePitch)));
  rig.get('Rig_Head').quaternion.copy(qx(-.55*(c.hipPitch+c.spinePitch)));
  const paths={};
  for(const [side,sign,offset] of [['L',1,0],['R',-1,.5]]){
   const t=(phase+offset)%1,armSwing=c.armSwing*Math.cos(2*Math.PI*t),elbow=c.bend+c.bendVariation*Math.sin(2*Math.PI*t);
   // A single controlled shoulder swing and a single elbow hinge. No
   // forearm twist or independently rotating wrist is introduced.
   rig.get('Rig_UpperArm_'+side).quaternion.copy(qz(sign*c.armOut).multiply(qx(armSwing)));
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
   foot.quaternion.copy(Q(shin).invert().multiply(qx(paths[side].pitch)));skeleton.updateMatrixWorld(true);
   // The bind foot is slightly behind the hip. Add the authored stride to it.
   const ankle=P(foot),minimum=minimumFoot(side),targetY=.002+paths[side].height;
   goals[side]={x:sign*.125,z:-.075+paths[side].z,y:ankle.y+targetY-minimum,targetY};
  }
  // Shorten no limb: if a ground target would be unreachable, lower the root
  // just enough. Both constraints are considered before the legs are solved.
  let rootY=skeleton.position.y;
  for(const side of ['L','R']){
   const a=P(rig.get('Rig_Thigh_'+side)),b=P(rig.get('Rig_Shin_'+side)),d=P(rig.get('Rig_Foot_'+side)),g=goals[side];
   // Keep a little bend in the walking knee: near full extension a tiny
   // target change produces a disproportionately fast knee rotation.
   const length=a.distanceTo(b)+b.distanceTo(d)-c.legReserve,dx=g.x-a.x,dz=g.z-a.z,remaining=length*length-dx*dx-dz*dz;
   if(remaining<=0)throw new Error(c.name+': horizontal target unreachable');
   const limit=g.y+Math.sqrt(remaining)-(a.y-skeleton.position.y);
   if(rootY>limit){rootY=limit;stats.rootClamps++}
  }
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
  }
  stats.rootY[0]=Math.min(stats.rootY[0],rootY);stats.rootY[1]=Math.max(stats.rootY[1],rootY);
  const rotations=new Map(targetNames.map(n=>[n,rig.get(n).quaternion.clone()]));
  const morph=[0,1,correctiveWeight(rad(paths.L.elbow)),correctiveWeight(rad(paths.R.elbow)),
   correctiveWeight(2*Math.acos(Math.min(1,Math.abs(rig.get('Rig_Shin_L').quaternion.w)))),
   correctiveWeight(2*Math.acos(Math.min(1,Math.abs(rig.get('Rig_Shin_R').quaternion.w)))),0,0,0,0];
  frames.push({rootY,rotations,morph});
 }
 if(stats.soleResidual>.005)throw new Error(`${c.name}: excessive sole fitting error ${stats.soleResidual}`);
 if(stats.kneeForward<-.001)throw new Error(`${c.name}: backwards knee ${stats.kneeForward}`);
 // Explicit, exact looping endpoint avoids numerical disagreement at 0/1.
 frames.push({rootY:frames[0].rootY,rotations:new Map([...frames[0].rotations].map(([n,q])=>[n,q.clone()])),morph:[...frames[0].morph]});
 const animation=doc.createAnimation(c.name),times=Float32Array.from(frames.map((_,i)=>c.duration*i/steps));
 const time=doc.createAccessor(c.name+'_Time',buffer).setType(Accessor.Type.SCALAR).setArray(times);
 function channel(node,p,type,array){
  const out=doc.createAccessor(c.name+'_'+node+'_'+p,buffer).setType(type).setArray(array);
  const sampler=doc.createAnimationSampler().setInput(time).setOutput(out).setInterpolation('LINEAR');
  animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(unique(node)).setTargetPath(p).setSampler(sampler));
 }
 channel('Rig_Root','translation',Accessor.Type.VEC3,Float32Array.from(frames.flatMap(f=>[0,f.rootY,0])));
 for(const name of targetNames){
  let prev=null;const data=new Float32Array(frames.length*4);
  frames.forEach((f,i)=>{const q=f.rotations.get(name);if(prev&&prev.dot(q)<0)q.set(-q.x,-q.y,-q.z,-q.w);q.toArray(data,4*i);prev=q});
  channel(name,'rotation',Accessor.Type.VEC4,data);
 }
 channel('head_2','weights',Accessor.Type.SCALAR,Float32Array.from(frames.flatMap(f=>f.morph)));
 return {name:c.name,duration:c.duration,speed:c.speed,stance:c.stance,footLift:c.lift,liftExponent:c.liftExponent,legReserve:c.legReserve,heelDegrees:c.heel,toeDegrees:c.toe,
  sampleCount:steps,stats};
}
const clips=configs.map(build);
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
console.log(JSON.stringify({sourceSha256:SOURCE_SHA,outputSha256:sha(result),bytes:result.length,bones:nodes.length,soleVertices:{L:sole.L.length,R:sole.R.length},clips,allAnimations:root.listAnimations().map(a=>a.getName())},null,2));
