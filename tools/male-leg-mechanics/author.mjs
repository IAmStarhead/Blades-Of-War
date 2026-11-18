// Independent lower-body trial, based on the last delivered review. No
// reference animations are imported. Rest surface geometry and all old keys
// remain intact; the old bind and skin are retained for exact comparison.
import {Accessor,NodeIO} from '@gltf-transform/core';
import {Bone,Quaternion,Vector3} from 'three';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../..'),OWN=path.join(ROOT,'work/male-leg-mechanics');
const SOURCE_SHA='be394a6f1124fbe10e352ab2d3bfa0c0aabddce65c3774c2f4e622e52b037e07';
const sha=b=>createHash('sha256').update(b).digest('hex'),args=process.argv.slice(2);
if(args.length!==2)throw Error('Usage: node author.mjs PREVIOUS.glb OUTPUT.glb');
const [input,output]=args.map(p=>path.resolve(p));
if(input===output||(output.startsWith(ROOT+path.sep)&&!output.startsWith(OWN+path.sep)))throw Error('Refusing to overwrite another artifact');
const bytes=fs.readFileSync(input);if(sha(bytes)!==SOURCE_SHA)throw Error('Unexpected previous model');
const io=new NodeIO(),doc=await io.readBinary(bytes),root=doc.getRoot(),buffer=root.listBuffers()[0];
const unique=n=>{const matches=root.listNodes().filter(x=>x.getName()===n);if(matches.length!==1)throw Error('Expected one '+n);return matches[0]};
const bodyNode=unique('head_2'),body=bodyNode.getMesh().listPrimitives()[0],position=body.getAttribute('POSITION');
const joints=body.getAttribute('JOINTS_0'),weights=body.getAttribute('WEIGHTS_0'),priorJoints=body.getAttribute('_PREVIOUS_JOINTS'),priorWeights=body.getAttribute('_PREVIOUS_WEIGHTS');
const skin=root.listSkins()[0],nodes=skin.listJoints(),names=nodes.map(n=>n.getName()),index=new Map(names.map((n,i)=>[n,i]));
if(nodes.length!==22||body.listTargets().length!==13||!priorJoints||!priorWeights)throw Error('Unexpected input skin');
if(root.listAnimations().length!==33)throw Error('Unexpected input clips');
const delta=.05;
const deliveredJoints=Uint16Array.from(joints.getArray()),deliveredWeights=Float32Array.from(weights.getArray());
body.setAttribute('_DELIVERED_JOINTS',doc.createAccessor('Delivered_Joints',buffer).setType(Accessor.Type.VEC4).setArray(deliveredJoints));
body.setAttribute('_DELIVERED_WEIGHTS',doc.createAccessor('Delivered_Weights',buffer).setType(Accessor.Type.VEC4).setArray(deliveredWeights));
const outputJoints=Uint16Array.from(deliveredJoints),outputWeights=Float32Array.from(deliveredWeights);
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
const influences=(j,w,i)=>{const js=j.getElement(i,[]),ws=w.getElement(i,[]),out=new Map();for(let k=0;k<4;k++)if(ws[k]>1e-8)out.set(js[k],(out.get(js[k])||0)+ws[k]);return out};
let changedSkin=0,maxWeightTransfer=0;
for(let i=0;i<position.getCount();i++){
 const [x,y]=position.getElement(i,[]);if(y<.60||y>1.08)continue;
 const current=influences(joints,weights,i),previous=influences(priorJoints,priorWeights,i),hip=index.get('Rig_Hips'),thigh=index.get('Rig_Thigh_'+(x>=0?'L':'R'));
 // Partially restore proximal thigh response; use a conservative amount,
 // fading it towards the midline. A small, smoothly bounded counterweight
 // there reduces compression when the raised joints bend. Neither edit
 // touches the feet, the upper body, or influences outside pelvis/thigh.
 const outer=Math.min(current.get(hip)||0,Math.max(0,(previous.get(thigh)||0)-(current.get(thigh)||0))*.25*smooth(.035,.085,Math.abs(x)));
 const inner=(current.get(thigh)||0)*.15*(1-smooth(.035,.08,Math.abs(x)))*smooth(.68,.74,y)*(1-smooth(.84,.90,y));
 const amount=outer-inner;
 if(Math.abs(amount)<1e-7)continue;
 current.set(hip,(current.get(hip)||0)-amount);current.set(thigh,(current.get(thigh)||0)+amount);
 const values=[...current].filter(([,w])=>w>1e-8).sort((a,b)=>b[1]-a[1]);if(values.length>4)throw Error('Too many influences at '+i);
 for(let k=0;k<4;k++){outputJoints[4*i+k]=values[k]?.[0]??0;outputWeights[4*i+k]=values[k]?.[1]??0}
 changedSkin++;maxWeightTransfer=Math.max(maxWeightTransfer,Math.abs(amount));
}
body.setAttribute('JOINTS_0',doc.createAccessor('Leg_Trial_Joints',buffer).setType(Accessor.Type.VEC4).setArray(outputJoints));
body.setAttribute('WEIGHTS_0',doc.createAccessor('Leg_Trial_Weights',buffer).setType(Accessor.Type.VEC4).setArray(outputWeights));

// Reconstruct the old bind hierarchy. Raising the thigh joint without
// changing shin bind-world position extends this rig's hip-to-knee segment;
// it does NOT alter the mesh, height, knee bind position, or foot bind.
const oldRest=new Map(),rig=new Map();
for(const node of nodes){
 const name=node.getName(),b=new Bone();b.name=name;b.position.fromArray(node.getTranslation());b.quaternion.fromArray(node.getRotation());b.scale.fromArray(node.getScale());
 if(b.quaternion.angleTo(new Quaternion())>1e-7||b.scale.toArray().some(x=>Math.abs(x-1)>1e-7))throw Error('Unexpected bind orientation '+name);
 oldRest.set(name,{position:b.position.clone(),quaternion:b.quaternion.clone(),scale:b.scale.clone()});rig.set(name,b);
}
for(const node of nodes){const parent=node.getParentNode()?.getName();if(rig.has(parent))rig.get(parent).add(rig.get(node.getName()))}
const skeleton=rig.get('Rig_Root'),P=b=>b.getWorldPosition(new Vector3()),Q=b=>b.getWorldQuaternion(new Quaternion());
function resetOld(){for(const [name,b] of rig){const t=oldRest.get(name);b.position.copy(t.position);b.quaternion.copy(t.quaternion);b.scale.copy(t.scale)}skeleton.updateMatrixWorld(true)}
function newBind(){for(const side of ['L','R']){rig.get('Rig_Thigh_'+side).position.y=oldRest.get('Rig_Thigh_'+side).position.y+delta;rig.get('Rig_Shin_'+side).position.y=oldRest.get('Rig_Shin_'+side).position.y-delta}skeleton.updateMatrixWorld(true)}
function solve(side,goal,kneeReference,footWorld){
 const thigh=rig.get('Rig_Thigh_'+side),shin=rig.get('Rig_Shin_'+side),foot=rig.get('Rig_Foot_'+side);skeleton.updateMatrixWorld(true);
 const hip=P(thigh);let knee=P(shin),ankle=P(foot);const l1=hip.distanceTo(knee),l2=knee.distanceTo(ankle),direction=goal.clone().sub(hip);let distance=direction.length();
 const high=l1+l2-.0002,low=Math.abs(l1-l2)+.0002,miss=Math.max(0,distance-high,low-distance);if(distance<1e-8)throw Error('Degenerate leg target');
 distance=Math.max(low,Math.min(high,distance));direction.normalize();const target=hip.clone().addScaledVector(direction,distance);
 const along=(l1*l1+distance*distance-l2*l2)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along));
 const leg=kneeReference.clone().sub(hip);let plane=leg.clone().addScaledVector(direction,-leg.dot(direction));
 if(plane.lengthSq()<1e-8){plane.set(0,0,1).addScaledVector(direction,-direction.z);if(plane.lengthSq()<1e-8)throw Error('Degenerate knee plane')}
 plane.normalize();const desired=hip.clone().addScaledVector(direction,along).addScaledVector(plane,height);
 let turn=new Quaternion().setFromUnitVectors(knee.clone().sub(hip).normalize(),desired.clone().sub(hip).normalize()),world=turn.multiply(Q(thigh));
 thigh.quaternion.copy(Q(thigh.parent).invert().multiply(world)).normalize();skeleton.updateMatrixWorld(true);
 knee=P(shin);ankle=P(foot);turn.setFromUnitVectors(ankle.clone().sub(knee).normalize(),target.clone().sub(knee).normalize());world=turn.multiply(Q(shin));
 shin.quaternion.copy(Q(shin.parent).invert().multiply(world)).normalize();skeleton.updateMatrixWorld(true);
 foot.quaternion.copy(Q(foot.parent).invert().multiply(footWorld)).normalize();skeleton.updateMatrixWorld(true);
 return {miss,ankleError:P(foot).distanceTo(goal),kneeShift:P(shin).distanceTo(kneeReference),footAngle:Q(foot).angleTo(footWorld),upperLength:l1,lowerLength:l2};
}
const specs=[['Reviewed_Walk','Leg_Refined_Walk'],['Reviewed_Run','Leg_Refined_Run'],['Reviewed_Crouch_Idle','Leg_Refined_Crouch_Idle'],['Reviewed_Crouch_Walk','Leg_Refined_Crouch_Walk']];
function retarget(sourceName,newName){
 const old=root.listAnimations().find(a=>a.getName()===sourceName);if(!old)throw Error('Missing '+sourceName);
 const channels=old.listChannels(),first=channels[0].getSampler().getInput(),count=first.getCount();if(count!==121)throw Error('Unexpected key count');
 const special=new Set(['Rig_Thigh_L','Rig_Shin_L','Rig_Foot_L','Rig_Thigh_R','Rig_Shin_R','Rig_Foot_R']);
 const output=Object.fromEntries([...special].map(name=>[name,new Float32Array(count*4)])),previous={};
 const stats={ankleError:0,kneeShift:0,footAngle:0,reachMiss:0,thighLength:0,shinLength:0};
 for(let frame=0;frame<count-1;frame++){
  resetOld();
  for(const channel of channels){const n=channel.getTargetNode().getName(),target=channel.getTargetPath(),sampler=channel.getSampler(),t=sampler.getInput();
   if(sampler.getInterpolation()!=='LINEAR'||t.getCount()!==count||Math.abs(t.getScalar(frame)-first.getScalar(frame))>1e-7)throw Error('Unexpected key timing in '+sourceName);
   if(!rig.has(n))continue;const values=sampler.getOutput().getArray(),bone=rig.get(n);
   if(target==='rotation')bone.quaternion.fromArray(values,frame*4);else if(target==='translation')bone.position.fromArray(values,frame*3);else throw Error('Unexpected bone track '+n+'/'+target);
  }
  skeleton.updateMatrixWorld(true);const desired={};for(const side of ['L','R'])desired[side]={ankle:P(rig.get('Rig_Foot_'+side)),knee:P(rig.get('Rig_Shin_'+side)),foot:Q(rig.get('Rig_Foot_'+side))};
  newBind();for(const side of ['L','R']){
   const d=desired[side],r=solve(side,d.ankle,d.knee,d.foot);stats.ankleError=Math.max(stats.ankleError,r.ankleError);stats.kneeShift=Math.max(stats.kneeShift,r.kneeShift);stats.footAngle=Math.max(stats.footAngle,r.footAngle);stats.reachMiss=Math.max(stats.reachMiss,r.miss);stats.thighLength=r.upperLength;stats.shinLength=r.lowerLength;
  }
  for(const name of special){const q=rig.get(name).quaternion.clone();if(previous[name]&&previous[name].dot(q)<0)q.set(-q.x,-q.y,-q.z,-q.w);q.toArray(output[name],4*frame);previous[name]=q}
 }
 for(const name of special)output[name].set(output[name].subarray(0,4),4*(count-1));
 if(stats.ankleError>.001||stats.reachMiss>.001||stats.footAngle>1e-5)throw Error(`Foot target not preserved in ${newName}: ${JSON.stringify(stats)}`);
 const animation=doc.createAnimation(newName);
 for(const channel of channels){const sampler=channel.getSampler(),name=channel.getTargetNode().getName(),target=channel.getTargetPath();let values=sampler.getOutput();
  if(target==='rotation'&&special.has(name))values=doc.createAccessor(newName+'_'+name+'_Rotation',buffer).setType(Accessor.Type.VEC4).setArray(output[name]);
  const next=doc.createAnimationSampler().setInput(sampler.getInput()).setOutput(values).setInterpolation(sampler.getInterpolation());
  animation.addSampler(next).addChannel(doc.createAnimationChannel().setTargetNode(channel.getTargetNode()).setTargetPath(target).setSampler(next));
 }
 return {source:sourceName,name:newName,duration:first.getScalar(count-1),frames:count,stats};
}
const clips=specs.map(([a,b])=>retarget(a,b));
// Update the GLB bind pose and matching inverse matrices for the two thigh
// joints. The knee/ankle bind-world locations are held fixed by changing each
// shin local offset in the opposite direction. Old bind values are in extras.
const inverse=skin.getInverseBindMatrices(),inverseArray=Float32Array.from(inverse.getArray());
for(const side of ['L','R']){
 const tn=unique('Rig_Thigh_'+side),sn=unique('Rig_Shin_'+side),t=tn.getTranslation(),s=sn.getTranslation(),i=index.get(tn.getName());
 tn.setExtras({...tn.getExtras(),deliveredTranslation:t,deliveredInverse:Array.from(inverseArray.subarray(16*i,16*i+16))});
 sn.setExtras({...sn.getExtras(),deliveredTranslation:s});tn.setTranslation([t[0],t[1]+delta,t[2]]);sn.setTranslation([s[0],s[1]-delta,s[2]]);inverseArray[16*i+13]-=delta;
}
skin.setInverseBindMatrices(doc.createAccessor('Leg_Trial_Inverse_Bind',buffer).setType(Accessor.Type.MAT4).setArray(inverseArray));
// Preserve blank morph target names as written in the delivered GLB.
const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
for(const node of json.nodes.filter(n=>n.mesh!==undefined)){
 const targetNames=json.meshes[node.mesh].extras?.targetNames;if(!targetNames)continue;
 const targets=unique(node.name).getMesh().listPrimitives()[0].listTargets();if(targets.length!==targetNames.length)throw Error('Unexpected morph count');
 targetNames.forEach((name,i)=>targets[i].setName(name));
}
const result=Buffer.from(await io.writeBinary(doc));fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,result);
console.log(JSON.stringify({sourceSha256:SOURCE_SHA,outputSha256:sha(result),bytes:result.length,bones:nodes.length,hipPivotLift:delta,skin:{changedSkin,maxWeightTransfer},clips,allAnimations:root.listAnimations().map(a=>a.getName())},null,2));
