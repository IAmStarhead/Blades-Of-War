// Retarget Quaternius Universal Animation Library (2025-06-10 Standard) onto
// the existing 22-bone Blades of War character. Never overwrite the input.
import {Accessor,NodeIO} from '@gltf-transform/core';
import {Bone,Matrix3,Matrix4,Quaternion,Vector3} from 'three';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../..');
const SRC=path.join(HERE,'source','AnimationLibrary_Godot_Standard.gltf');
const SOURCE_SHA='6375e7980e1b7119d9245a9796854dd8d52ae7272ad3f6a0473f59a2f561f0ca';
const sha=b=>createHash('sha256').update(b).digest('hex');
const args=process.argv.slice(2);if(args.length!==2)throw Error('Usage: node author.mjs input.glb output.glb');
const [input,output]=args.map(x=>path.resolve(x));if(input===output||(output.startsWith(ROOT+path.sep)&&!output.startsWith(path.join(ROOT,'work/male-library-motion')+path.sep)))throw Error('Refusing to overwrite unrelated artifact');
const bytes=fs.readFileSync(input);if(sha(bytes)!==SOURCE_SHA)throw Error('Unexpected hero');
const io=new NodeIO(),source=await io.read(SRC),doc=await io.readBinary(bytes),dr=doc.getRoot(),sr=source.getRoot(),buffer=dr.listBuffers()[0];
const one=(r,n)=>{let v=r.listNodes().filter(x=>x.getName()===n);if(v.length!==1)throw Error('Expected one node '+n);return v[0]};
const joints=dr.listSkins()[0].listJoints(),targetNames=joints.map(x=>x.getName()),sourceNames=['Rig','root',...sr.listSkins()[0].listJoints().map(n=>n.getName())];

// Keep the last delivered surface and weights embedded for a real comparison.
// Start from the preceding, less exaggerated base for the rear contour, then
// broaden the thigh/calf around the original leg centreline with a smooth fade.
const bodyNode=one(dr,'head_2'),mesh=bodyNode.getMesh(),body=mesh.listPrimitives()[0];
const pos=body.getAttribute('POSITION'),nor=body.getAttribute('NORMAL'),ref=body.getAttribute('_REFERENCE_POSITION'),refNor=body.getAttribute('_REFERENCE_NORMAL'),ja=body.getAttribute('JOINTS_0'),wa=body.getAttribute('WEIGHTS_0'),tri=body.getIndices(),count=pos.getCount();
const packed=(a,w,Type=Float32Array)=>{const out=new Type(count*w);for(let i=0;i<count;i++)out.set(a.getElement(i,[]),w*i);return out};
const delivered=packed(pos,3),deliveredNormals=packed(nor,3),reference=packed(ref,3),referenceNormals=packed(refNor,3),skinIndex=packed(ja,4,Uint16Array),skinWeight=packed(wa,4);
body.setAttribute('_LIBRARY_OLD_POSITION',doc.createAccessor('Previous_delivery_positions',buffer).setType(Accessor.Type.VEC3).setArray(delivered));
body.setAttribute('_LIBRARY_OLD_NORMAL',doc.createAccessor('Previous_delivery_normals',buffer).setType(Accessor.Type.VEC3).setArray(deliveredNormals));
body.setAttribute('_LIBRARY_OLD_JOINTS',doc.createAccessor('Previous_delivery_joints',buffer).setType(Accessor.Type.VEC4).setArray(Uint16Array.from(skinIndex)));
body.setAttribute('_LIBRARY_OLD_WEIGHTS',doc.createAccessor('Previous_delivery_weights',buffer).setType(Accessor.Type.VEC4).setArray(Float32Array.from(skinWeight)));
const sm=(a,b,x)=>{let t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
const thickness=Number(process.env.BOW_LEG_THICKNESS??.25),posteriorWeight=Number(process.env.BOW_POSTERIOR_TRANSFER??.45),keepRump=Number(process.env.BOW_RUMP_RETAIN??.3);
const shaped=Float32Array.from(reference,(v,i)=>v+(delivered[i]-v)*keepRump),hipIndex=targetNames.indexOf('Rig_Hips');let changed=0,maxDelta=0,weightChanged=0;
for(let i=0;i<count;i++){
 const k=i*3,x=shaped[k],y=shaped[k+1],z=shaped[k+2],side=x>=0?'L':'R';let limb=0,thighSlot=-1,hipSlot=-1,free=-1;
 for(let j=0;j<4;j++){const name=targetNames[skinIndex[4*i+j]],w=skinWeight[4*i+j];if(/^Rig_(Thigh|Shin)_/.test(name))limb+=w;if(name==='Rig_Thigh_'+side)thighSlot=j;if(name==='Rig_Hips')hipSlot=j;if(w===0&&free<0)free=j}
 const leg=sm(.10,.55,limb),rise=sm(.13,.23,y),fall=1-sm(.80,.95,y),amount=thickness*leg*rise*fall;
 if(amount>1e-8){const t=sm(.15,.92,y),cx=.125+(.10-.125)*t,cz=-.075+(-.005+.075)*t,sideGate=sm(.014,.052,Math.abs(x));shaped[k]+=amount*(x-Math.sign(x)*cx)*sideGate;shaped[k+2]+=amount*(z-cz)}
 if(thighSlot>=0&&skinWeight[4*i+thighSlot]>0){const mask=sm(.015,.08,-z)*sm(.735,.87,y)*(1-sm(.96,1.04,y))*sm(.015,.06,Math.abs(x));
  if(posteriorWeight>=0){const shift=skinWeight[4*i+thighSlot]*posteriorWeight*mask;if(shift>1e-8){if(hipSlot<0){if(free<0)throw Error('No slot for pelvis weight');hipSlot=free;skinIndex[4*i+hipSlot]=hipIndex}skinWeight[4*i+thighSlot]-=shift;skinWeight[4*i+hipSlot]+=shift;weightChanged++}}
  else if(hipSlot>=0){const shift=skinWeight[4*i+hipSlot]*(-posteriorWeight)*mask;if(shift>1e-8){skinWeight[4*i+hipSlot]-=shift;skinWeight[4*i+thighSlot]+=shift;weightChanged++}}
 }
 const d=Math.hypot(shaped[k]-delivered[k],shaped[k+1]-delivered[k+1],shaped[k+2]-delivered[k+2]);if(d>1e-7)changed++;maxDelta=Math.max(maxDelta,d);
}
// Transport the existing smooth normals using welded, area-weighted face-normal
// differences; UV seams remain split but coincident positions stay coincident.
function normalDelta(base,norm,now){const groups=new Map(),id=new Int32Array(count);let n=0;for(let i=0;i<count;i++){let k=3*i,key=[...Array.from(base.subarray(k,k+3),v=>Math.round(v*1e6)),...Array.from(norm.subarray(k,k+3),v=>Math.round(v*100))].join(',');if(!groups.has(key))groups.set(key,n++);id[i]=groups.get(key)}const a=new Float64Array(n*3),b=new Float64Array(n*3);for(let i=0;i<tri.getCount();i+=3){const ids=[0,1,2].map(j=>tri.getScalar(i+j)),v=(p,j)=>new Vector3().fromArray(p,j*3),x=ids.map(j=>v(base,j)),y=ids.map(j=>v(now,j)),old=x[1].clone().sub(x[0]).cross(x[2].clone().sub(x[0])),next=y[1].clone().sub(y[0]).cross(y[2].clone().sub(y[0]));for(const j of ids){let k=3*id[j];a[k]+=old.x;a[k+1]+=old.y;a[k+2]+=old.z;b[k]+=next.x;b[k+1]+=next.y;b[k+2]+=next.z}}const out=new Float32Array(count*3);for(let i=0;i<count;i++){let k=3*id[i],s=3*i,u=new Vector3().fromArray(a,k).normalize(),v=new Vector3().fromArray(b,k).normalize(),normal=new Vector3().fromArray(norm,s).add(v.sub(u)).normalize();normal.toArray(out,s)}return out}
body.setAttribute('POSITION',doc.createAccessor('Library_trial_positions',buffer).setType(Accessor.Type.VEC3).setArray(shaped));
const shapedNormals=normalDelta(reference,referenceNormals,shaped);
body.setAttribute('NORMAL',doc.createAccessor('Library_trial_normals',buffer).setType(Accessor.Type.VEC3).setArray(shapedNormals));
body.setAttribute('JOINTS_0',doc.createAccessor('Library_trial_joints',buffer).setType(Accessor.Type.VEC4).setArray(skinIndex));
body.setAttribute('WEIGHTS_0',doc.createAccessor('Library_trial_weights',buffer).setType(Accessor.Type.VEC4).setArray(skinWeight));
function createRig(r,names){const ns=[...new Set(names)].map(n=>one(r,n)),bones=new Map();for(const n of ns){const b=new Bone();b.name=n.getName();b.position.fromArray(n.getTranslation());b.quaternion.fromArray(n.getRotation()).normalize();b.scale.fromArray(n.getScale());bones.set(b.name,b)}for(const n of ns){const p=n.getParentNode();if(p&&bones.has(p.getName()))bones.get(p.getName()).add(bones.get(n.getName()))}const root=bones.get(r===sr?'Rig':'Rig_Root');root.updateMatrixWorld(true);return {bones,root,ns}}
const S=createRig(sr,sourceNames),T=createRig(dr,targetNames),P=b=>b.getWorldPosition(new Vector3()),Q=b=>b.getWorldQuaternion(new Quaternion()).normalize();
const bindQ=new Map([...S.bones].map(([k,v])=>[k,Q(v)])),bindP=new Map([...S.bones].map(([k,v])=>[k,P(v)]));
const map=[['Rig_Hips','DEF-hips'],['Rig_Spine','DEF-spine.002'],['Rig_Chest','DEF-spine.003'],['Rig_Neck','DEF-neck'],['Rig_Head','DEF-head']];
const align=new Map();
for(const [side,suffix] of [['L','L'],['R','R']]){
 map.push(['Rig_Shoulder_'+side,'DEF-shoulder.'+suffix],['Rig_UpperArm_'+side,'DEF-upper_arm.'+suffix],['Rig_Forearm_'+side,'DEF-forearm.'+suffix],['Rig_Hand_'+side,'DEF-hand.'+suffix],['Rig_Thigh_'+side,'DEF-thigh.'+suffix],['Rig_Shin_'+side,'DEF-shin.'+suffix],['Rig_Foot_'+side,'DEF-foot.'+suffix],['Rig_Toes_'+side,'DEF-toe.'+suffix]);
 for(const [t,s,tc,sc] of [['UpperArm','upper_arm','Forearm','forearm'],['Forearm','forearm','Hand','hand'],['Thigh','thigh','Shin','shin'],['Shin','shin','Foot','foot'],['Foot','foot','Toes','toe']]){
   const target='Rig_'+t+'_'+side,src='DEF-'+s+'.'+suffix,targetChild='Rig_'+tc+'_'+side,srcChild='DEF-'+sc+'.'+suffix;
   const ta=P(T.bones.get(targetChild)).sub(P(T.bones.get(target))).normalize(),sa=P(S.bones.get(srcChild)).sub(P(S.bones.get(src))).normalize();
   align.set(target,new Quaternion().setFromUnitVectors(ta,sa));
 }
 align.set('Rig_Hand_'+side,align.get('Rig_Forearm_'+side).clone());align.set('Rig_Toes_'+side,align.get('Rig_Foot_'+side).clone());
}
function reset(r){for(const n of r.ns){const b=r.bones.get(n.getName());b.position.fromArray(n.getTranslation());b.quaternion.fromArray(n.getRotation()).normalize();b.scale.fromArray(n.getScale())}r.root.updateMatrixWorld(true)}
function prepare(a){return a.listChannels().map(c=>{const s=c.getSampler();return {name:c.getTargetNode().getName(),path:c.getTargetPath(),input:s.getInput(),output:s.getOutput(),method:s.getInterpolation()}}).filter(c=>S.bones.has(c.name))}
function sample(c,t){const N=c.input.getCount();if(N===1)return c.output.getElement(0,[]);let lo=0,hi=N-1;while(hi-lo>1){const m=(lo+hi)>>1;if(c.input.getScalar(m)<=t)lo=m;else hi=m}const t0=c.input.getScalar(lo),t1=c.input.getScalar(hi);if(t<=t0||c.method==='STEP')return c.output.getElement(lo,[]);if(t>=t1)return c.output.getElement(hi,[]);const f=(t-t0)/(t1-t0),a=c.output.getElement(lo,[]),b=c.output.getElement(hi,[]);if(c.path==='rotation')return new Quaternion().fromArray(a).slerp(new Quaternion().fromArray(b),f).normalize().toArray();return a.map((x,i)=>x+(b[i]-x)*f)}
function pose(channels,t){reset(S);for(const c of channels){const b=S.bones.get(c.name),v=sample(c,t);if(c.path==='translation')b.position.fromArray(v);else if(c.path==='rotation')b.quaternion.fromArray(v).normalize();else if(c.path==='scale')b.scale.fromArray(v)}S.root.updateMatrixWorld(true);reset(T);
 const delta=P(S.bones.get('DEF-hips')).sub(bindP.get('DEF-hips')).multiplyScalar(.99);T.root.position.copy(delta);T.root.updateMatrixWorld(true);
 for(const [tn,sn] of map){const b=T.bones.get(tn),bSrc=S.bones.get(sn),global=Q(bSrc).multiply(bindQ.get(sn).clone().invert()).multiply(align.get(tn)||new Quaternion()).normalize(),parent=Q(b.parent);b.quaternion.copy(parent.invert().multiply(global)).normalize();T.root.updateMatrixWorld(true)}
}
function addChannel(a,node,target,type,times,values){let input=doc.createAccessor(a.getName()+'_'+node+'_'+target+'_Time',buffer).setType(Accessor.Type.SCALAR).setArray(times),out=doc.createAccessor(a.getName()+'_'+node+'_'+target,buffer).setType(type).setArray(values),s=doc.createAnimationSampler().setInput(input).setOutput(out).setInterpolation('LINEAR');a.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(one(dr,node)).setTargetPath(target).setSampler(s))}
const specs=[['Idle_Loop','Library_Idle'],['Walk_Loop','Library_Walk'],['Jog_Fwd_Loop','Library_Run']];
const smooth=sm,rad=x=>x*Math.PI/180;
function bend(a,b,c){const p=P(T.bones.get(a)),q=P(T.bones.get(b)),r=P(T.bones.get(c));return q.clone().sub(p).normalize().angleTo(r.sub(q).normalize())}
function flex(side){const h=T.bones.get('Rig_Hips'),thigh=T.bones.get('Rig_Thigh_'+side),shin=T.bones.get('Rig_Shin_'+side),v=P(shin).sub(P(thigh)).normalize().applyQuaternion(Q(h).invert());return Math.atan2(v.z,-v.y)*180/Math.PI}
const correction=a=>Math.min(1.15,(1-Math.cos(a/2))/(1-Math.cos(rad(100)/2)));

// Corrective shapes are still standard glTF morph targets. The source's jog
// flexes the thigh much further than our previous walk. Sample its maximum
// bend once per side and approximate part of volume-preserving dual-quaternion
// skinning there; blend this rest-space correction by the actual hip angle.
// This is not a runtime DQ skinning extension. Separate knee targets reuse the
// previous trial's back-of-knee fold so only the bent side receives it.
const OLD=16,NEW=20,skin=dr.listSkins()[0],inverse=joints.map((_,i)=>new Matrix4().fromArray(skin.getInverseBindMatrices().getElement(i,[])));
if(body.listTargets().length!==OLD||mesh.getWeights().length!==OLD)throw Error('Unexpected morph structure');
function addShape(name,delta){const moved=Float32Array.from(shaped,(v,i)=>v+delta[i]),nn=normalDelta(shaped,shapedNormals,moved),normal=Float32Array.from(nn,(v,i)=>v-shapedNormals[i]),target=doc.createPrimitiveTarget(name);target.setAttribute('POSITION',doc.createAccessor(name+'_POSITION',buffer).setType(Accessor.Type.VEC3).setArray(delta));target.setAttribute('NORMAL',doc.createAccessor(name+'_NORMAL',buffer).setType(Accessor.Type.VEC3).setArray(normal));body.addTarget(target)}
function dqShape(side){
 const anim=sr.listAnimations().find(a=>a.getName()==='Jog_Fwd_Loop'),ch=prepare(anim),duration=Math.max(...ch.map(c=>c.input.getScalar(c.input.getCount()-1)));let best={angle:-Infinity,time:0};
 for(let i=0;i<96;i++){const time=duration*i/96;pose(ch,time);let a=flex(side);if(a>best.angle)best={angle:a,time}}
 pose(ch,best.time);T.root.updateMatrixWorld(true);const matrices=joints.map((n,i)=>new Matrix4().multiplyMatrices(T.bones.get(n.getName()).matrixWorld,inverse[i])),qs=matrices.map(m=>new Quaternion().setFromRotationMatrix(m).normalize()),ds=matrices.map((m,i)=>{const p=new Vector3().setFromMatrixPosition(m),q=new Quaternion(p.x,p.y,p.z,0).multiply(qs[i]);return [q.x*.5,q.y*.5,q.z*.5,q.w*.5]}),target=new Float32Array(count*3);let max=0,used=0;
 for(let i=0;i<count;i++){
  const k=3*i,x=shaped[k],y=shaped[k+1],z=shaped[k+2],sgn=side==='L'?1:-1;let influence=0;
  for(let j=0;j<4;j++)if(targetNames[skinIndex[4*i+j]]==='Rig_Thigh_'+side)influence+=skinWeight[4*i+j];
  const mask=smooth(.60,.73,y)*(1-smooth(.98,1.05,y))*smooth(.04,.4,influence)*smooth(-.006,.025,sgn*x);if(mask<1e-6)continue;
  let r=[0,0,0,0],d=[0,0,0,0],first=null,linear=new Matrix4();linear.elements.fill(0);
  for(let j=0;j<4;j++){const id=skinIndex[4*i+j],w=skinWeight[4*i+j];if(!w)continue;const q=qs[id];if(!first)first=q;const sign=first.dot(q)<0?-w:w,qv=q.toArray();for(let k=0;k<4;k++){r[k]+=sign*qv[k];d[k]+=sign*ds[id][k]}for(let k=0;k<16;k++)linear.elements[k]+=w*matrices[id].elements[k]}
  const len=Math.hypot(...r);if(len<1e-8)continue;r=r.map(v=>v/len);d=d.map(v=>v/len);const dot=r.reduce((sum,v,k)=>sum+v*d[k],0);d=d.map((v,k)=>v-dot*r[k]);const qr=new Quaternion(...r),tr=new Quaternion(...d).multiply(qr.clone().conjugate()),p=new Vector3(x,y,z),current=p.clone().applyMatrix4(linear),desired=p.clone().applyQuaternion(qr).add(new Vector3(2*tr.x,2*tr.y,2*tr.z)),m=new Matrix3().setFromMatrix4(linear);
  if(Math.abs(m.determinant())<.12)continue;const shift=desired.sub(current).applyMatrix3(m.invert()).multiplyScalar(mask*.65);if(shift.length()>.0585)shift.setLength(.0585);shift.toArray(target,k);if(shift.lengthSq()>1e-14)used++;max=Math.max(max,shift.length());
 }
 addShape('Library_Hip_'+side,target);return {...best,vertices:used,maxDisplacement:max};
}
const hipShape={L:dqShape('L'),R:dqShape('R')},oldKnee=body.listTargets()[15].getAttribute('POSITION');
for(const [side,sign] of [['L',1],['R',-1]]){const delta=new Float32Array(count*3);for(let i=0;i<count;i++){const k=3*i,f=smooth(-.005,.02,sign*shaped[k]),v=oldKnee.getElement(i,[]);for(let j=0;j<3;j++)delta[k+j]=v[j]*f*1.35}addShape('Library_Knee_'+side,delta)}
mesh.setWeights([...mesh.getWeights(),0,0,0,0]);
for(const animation of dr.listAnimations())for(const channel of animation.listChannels())if(channel.getTargetNode()===bodyNode&&channel.getTargetPath()==='weights'){
 const sampler=channel.getSampler(),old=sampler.getOutput(),frames=sampler.getInput().getCount();if(old.getCount()!==frames*OLD||sampler.getInterpolation()!=='LINEAR')throw Error('Unexpected previous morph channel '+animation.getName());const values=new Float32Array(frames*NEW);for(let i=0;i<frames;i++)for(let j=0;j<OLD;j++)values[i*NEW+j]=old.getScalar(i*OLD+j);sampler.setOutput(doc.createAccessor(animation.getName()+'_preserved_weights',buffer).setType(Accessor.Type.SCALAR).setArray(values));
}
// Vertices on the soles are unaffected by any morph. This lets us bake a
// small vertical root correction into each clip itself instead of relying on
// a special viewer; no horizontal foot locking or collision physics is implied.
const sole=[];for(let i=0;i<count;i++){const k=3*i,x=shaped[k],y=shaped[k+1];if(y>=.12||Math.abs(x)<=.03||Math.abs(x)>=.22)continue;for(const target of body.listTargets()){const v=target.getAttribute('POSITION')?.getElement(i,[])||[0,0,0];if(Math.hypot(...v)>1e-8)throw Error('Unexpected sole morph')};sole.push(i)}
if(sole.length<40)throw Error('Missing sole vertices');
function minSole(){T.root.updateMatrixWorld(true);const matrices=joints.map((node,i)=>new Matrix4().multiplyMatrices(T.bones.get(node.getName()).matrixWorld,inverse[i]));let min=Infinity;for(const i of sole){const k=i*3,x=shaped[k],y=shaped[k+1],z=shaped[k+2];let height=0;for(let j=0;j<4;j++){const w=skinWeight[i*4+j];if(!w)continue;const e=matrices[skinIndex[i*4+j]].elements;height+=w*(e[1]*x+e[5]*y+e[9]*z+e[13])}min=Math.min(min,height)}return min}
const results=[];
for(const [sourceName,name] of specs){
 const clip=sr.listAnimations().find(a=>a.getName()===sourceName);if(!clip)throw Error('Missing '+sourceName);const ch=prepare(clip),duration=Math.max(...ch.map(c=>c.input.getScalar(c.input.getCount()-1))),frames=Math.round(duration*96),times=Float32Array.from({length:frames+1},(_,i)=>i/frames*duration),rotations=new Map(targetNames.filter(x=>x!=='Rig_Root').map(x=>[x,new Float32Array((frames+1)*4)])),rootValues=new Float32Array((frames+1)*3),weights=new Float32Array((frames+1)*NEW),prev=new Map();let minFoot=Infinity,maxFoot=-Infinity;
 for(let i=0;i<=frames;i++){
  pose(ch,times[i]);
  // The stock mannequin's jog has a very long airborne stride. Its extreme
  // hip flex visibly pinches this particular continuous human mesh. Reduce
  // only the thigh swing, retaining the source timing, arms, torso and knees.
  // This is an authored retarget adjustment, not the untouched stock clip.
  if(sourceName==='Jog_Fwd_Loop'){for(const side of ['L','R'])T.bones.get('Rig_Thigh_'+side).quaternion.slerp(new Quaternion(),.35)}
  // Unlike the source mannequin, this character has a continuous armpit.
  // Keep the upper arms clear of it while retaining the library's swing.
  const armSpread=sourceName==='Walk_Loop'?22:sourceName==='Jog_Fwd_Loop'?6:16;
  for(const [side,sign] of [['L',1],['R',-1]])T.bones.get('Rig_UpperArm_'+side).quaternion.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),sign*rad(armSpread))).normalize();
  T.root.updateMatrixWorld(true);T.root.position.toArray(rootValues,i*3);
  for(const [tn,arr] of rotations){let q=T.bones.get(tn).quaternion.clone(),last=prev.get(tn);if(last&&last.dot(q)<0)q.set(-q.x,-q.y,-q.z,-q.w);q.toArray(arr,i*4);prev.set(tn,q)}
  const m=new Float32Array(NEW);m[1]=1;m[10]=.9;
  for(const [side,col] of [['L',0],['R',1]]){const elbow=bend('Rig_UpperArm_'+side,'Rig_Forearm_'+side,'Rig_Hand_'+side),knee=bend('Rig_Thigh_'+side,'Rig_Shin_'+side,'Rig_Foot_'+side);m[2+col]=correction(elbow);m[4+col]=correction(knee);m[16+col]=smooth(22,hipShape[side].angle,flex(side));m[18+col]=smooth(70,105,knee*180/Math.PI)}weights.set(m,i*NEW);
  for(const side of ['L','R']){const h=P(T.bones.get('Rig_Foot_'+side)).y;minFoot=Math.min(minFoot,h);maxFoot=Math.max(maxFoot,h)}
 }
 // The 2025 Jog source has a small endpoint mismatch. Blend the last 100 ms
 // toward the first pose rather than inserting a visible discontinuity at loop.
 // This only modifies the seam; the library remains the motion source.
 const seam=Math.min(.10,duration*.15);for(let i=0;i<=frames;i++){const f=smooth(duration-seam,duration,times[i]);if(!f)continue;for(let j=0;j<3;j++)rootValues[i*3+j]+=(rootValues[j]-rootValues[i*3+j])*f;for(let j=0;j<NEW;j++)weights[i*NEW+j]+=(weights[j]-weights[i*NEW+j])*f;for(const arr of rotations.values()){const start=new Quaternion().fromArray(arr,0),q=new Quaternion().fromArray(arr,i*4).slerp(start,f).normalize();q.toArray(arr,i*4)}}
 // Restore the first frame at the end exactly, then compute required clearance.
 for(let j=0;j<3;j++)rootValues[frames*3+j]=rootValues[j];for(let j=0;j<NEW;j++)weights[frames*NEW+j]=weights[j];for(const arr of rotations.values())for(let j=0;j<4;j++)arr[frames*4+j]=arr[j];
 const need=new Float32Array(frames);let rawMin=Infinity;
 for(let i=0;i<frames;i++){reset(T);T.root.position.fromArray(rootValues,i*3);for(const [tn,arr] of rotations)T.bones.get(tn).quaternion.fromArray(arr,i*4).normalize();T.root.updateMatrixWorld(true);const low=minSole();rawMin=Math.min(rawMin,low);need[i]=Math.max(0,.004-low)}
 // A cosine envelope spreads each lift into neighbouring frames, and wraps at
 // the loop seam. Every key gets at least its own required lift.
 const envelope=sourceName==='Jog_Fwd_Loop'?.06:.13;
 let maxRaise=0;for(let i=0;i<frames;i++){let lift=0;for(let j=0;j<frames;j++){const span=Math.min(Math.abs(times[i]-times[j]),duration-Math.abs(times[i]-times[j]));if(span<envelope)lift=Math.max(lift,need[j]*.5*(1+Math.cos(Math.PI*span/envelope)))}rootValues[i*3+1]+=lift;maxRaise=Math.max(maxRaise,lift)}rootValues[frames*3+1]=rootValues[1];
 const a=doc.createAnimation(name);addChannel(a,'Rig_Root','translation',Accessor.Type.VEC3,times,rootValues);for(const [tn,v] of rotations)addChannel(a,tn,'rotation',Accessor.Type.VEC4,times,v);addChannel(a,'head_2','weights',Accessor.Type.SCALAR,times,weights);results.push({source:sourceName,name,duration,frames:frames+1,minAnkleY:minFoot,maxAnkleY:maxFoot,rawMinSole:rawMin,maxRootLift:maxRaise,rootLiftEnvelope:envelope,thighSwingScale:sourceName==='Jog_Fwd_Loop'?.65:1,armSpreadDegrees:sourceName==='Walk_Loop'?22:sourceName==='Jog_Fwd_Loop'?6:16});
}
const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));for(const node of json.nodes.filter(n=>n.mesh!==undefined)){let names=json.meshes[node.mesh].extras?.targetNames;if(names){const targets=one(dr,node.name).getMesh().listPrimitives()[0].listTargets();if(names.length+(node.name==='head_2'?4:0)!==targets.length)throw Error('morph target mismatch');names.forEach((v,i)=>targets[i].setName(v))}}
const result=Buffer.from(await io.writeBinary(doc));fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,result);console.log(JSON.stringify({sourceSha256:SOURCE_SHA,outputSha256:sha(result),bytes:result.length,sculpt:{thickness,posteriorWeight,keepRump,changed,maxDelta,weightChanged},hipShape,clips:results},null,2));
