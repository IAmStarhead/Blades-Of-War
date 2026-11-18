// An independent correction and crouch trial, authored for the existing rig.
// No reference model, photograph or animation data is copied into this file.
import {Accessor,NodeIO} from '@gltf-transform/core';
import {Bone,Matrix3,Matrix4,Quaternion,Vector3,Euler} from 'three';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../..');
const OWN=path.join(ROOT,'work/male-stealth-crouch');
const SOURCE_SHA='3fc6aecd2d60b85261f9604b514dc54ea6003329020fedb2adad76a1e0119fa5';
const hash=b=>createHash('sha256').update(b).digest('hex');
const args=process.argv.slice(2);if(args.length!==2)throw Error('Usage: node author.mjs SOURCE.glb OUTPUT.glb');
const [input,output]=args.map(p=>path.resolve(p));
if(input===output||(output.startsWith(ROOT+path.sep)&&!output.startsWith(OWN+path.sep)))throw Error('Refusing to overwrite another artifact');
const source=fs.readFileSync(input);if(hash(source)!==SOURCE_SHA)throw Error('Unexpected source GLB');
const io=new NodeIO(),doc=await io.readBinary(source),root=doc.getRoot(),buffer=root.listBuffers()[0];
const unique=name=>{const a=root.listNodes().filter(n=>n.getName()===name);if(a.length!==1)throw Error('Expected one '+name);return a[0]};
const animation=name=>{const a=root.listAnimations().filter(n=>n.getName()===name);if(a.length!==1)throw Error('Expected one animation '+name);return a[0]};
const bodyNode=unique('head_2'),mesh=bodyNode.getMesh(),body=mesh.listPrimitives()[0],skin=root.listSkins()[0];
const position=body.getAttribute('POSITION'),normal=body.getAttribute('NORMAL'),joints=body.getAttribute('JOINTS_0'),weights=body.getAttribute('WEIGHTS_0'),indices=body.getIndices();
const nodes=skin.listJoints(),count=position.getCount(),OLD=10,NEW=13;
if(nodes.length!==22||body.listTargets().length!==OLD||mesh.getWeights().length!==OLD)throw Error('Unexpected source skeleton or morphs');
const names=nodes.map(n=>n.getName()),rig=new Map();
for(const n of nodes){let b=new Bone();b.name=n.getName();b.position.fromArray(n.getTranslation());b.quaternion.fromArray(n.getRotation());
 if(b.quaternion.angleTo(new Quaternion())>1e-7||n.getScale().some(x=>Math.abs(x-1)>1e-7))throw Error('Unexpected bind orientation: '+b.name);rig.set(b.name,b)}
for(const n of nodes){const parent=n.getParentNode()?.getName();if(rig.has(parent))rig.get(parent).add(rig.get(n.getName()))}
const skeleton=rig.get('Rig_Root'),hip=rig.get('Rig_Hips'),spine=rig.get('Rig_Spine'),chest=rig.get('Rig_Chest');
const inverse=nodes.map((_,i)=>new Matrix4().fromArray(skin.getInverseBindMatrices().getElement(i,[])));
const P=b=>b.getWorldPosition(new Vector3()),Q=b=>b.getWorldQuaternion(new Quaternion());
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)},rad=x=>x*Math.PI/180;
const axisX=new Vector3(1,0,0),axisY=new Vector3(0,1,0),axisZ=new Vector3(0,0,1);
const qx=x=>new Quaternion().setFromAxisAngle(axisX,rad(x)),qy=x=>new Quaternion().setFromAxisAngle(axisY,rad(x)),qz=x=>new Quaternion().setFromAxisAngle(axisZ,rad(x));
const p=Array.from({length:count},(_,i)=>position.getElement(i,[])),n=Array.from({length:count},(_,i)=>normal.getElement(i,[]));
const ji=Array.from({length:count},(_,i)=>joints.getElement(i,[])),wt=Array.from({length:count},(_,i)=>weights.getElement(i,[]));
function clearPose(){for(const node of nodes){const b=rig.get(node.getName());b.position.fromArray(node.getTranslation());b.quaternion.fromArray(node.getRotation());b.scale.set(1,1,1)}skeleton.updateMatrixWorld(true)}
function runFrame(index){
 clearPose();const a=animation('Full_Body_Run');
 for(const c of a.listChannels()){
  const b=rig.get(c.getTargetNode().getName()),out=c.getSampler().getOutput();if(!b)continue;
  if(c.getTargetPath()==='rotation')b.quaternion.fromArray(out.getElement(index,[]));
  else if(c.getTargetPath()==='translation')b.position.fromArray(out.getElement(index,[]));
 }
 skeleton.updateMatrixWorld(true);
 return nodes.map((node,i)=>new Matrix4().multiplyMatrices(rig.get(node.getName()).matrixWorld,inverse[i]));
}
function handShape(){
 // Smooth centreline bend in the palm direction, with slightly increasing
 // curvature from the index finger to the little finger. The thumb and palm,
 // wrist and arm are unchanged; there is no added twist or new finger rig.
 const out=new Float32Array(count*3);let changed=0,max=0;
 for(let i=0;i<count;i++){
  const [x,y,z]=p[i],side=x>0?'L':'R';if(y>=.875||Math.abs(x)<.18)continue;
  let influence=0;for(let k=0;k<4;k++)if(names[ji[i][k]]==='Rig_Hand_'+side)influence+=wt[i][k];if(influence<1e-7)continue;
  const cascade=Math.max(0,Math.min(1,(.07-z)/.10)),k=rad(38+14*cascade)/.08,s=.875-y,centre=.278-.38*s,rx=Math.abs(x)-centre;
  const dx=-.38*(Math.sin(k*s)/k-s)-(1-Math.cos(k*s))/k+(Math.cos(k*s)-1)*rx;
  const dy=-.38*(-(1-Math.cos(k*s))/k)-Math.sin(k*s)/k+s-Math.sin(k*s)*rx;
  out[3*i]=Math.sign(x)*dx*influence;out[3*i+1]=dy*influence;changed++;max=Math.max(max,Math.hypot(out[3*i],out[3*i+1]));
 }
 return {delta:out,changed,max};
}
function hipShape(side,index){
 // Pose-space corrective: at the run's deepest hip bend, compare linear skin
 // blending with dual-quaternion blending, then transform the difference back
 // into bind space. Restrict it to the local thigh/hip transition with smooth
 // masks. It does not replace the rig's weights or affect earlier clips.
 const matrices=runFrame(index),rotations=matrices.map(m=>new Quaternion().setFromRotationMatrix(m)),duals=matrices.map((m,i)=>{
  const t=new Vector3().setFromMatrixPosition(m),q=new Quaternion(t.x,t.y,t.z,0).multiply(rotations[i]);return [q.x*.5,q.y*.5,q.z*.5,q.w*.5];
 });
 const out=new Float32Array(count*3),sign=side==='L'?1:-1,first=names.indexOf('Rig_Thigh_'+side);let changed=0,max=0;
 for(let i=0;i<count;i++){
  const [x,y]=p[i];let influence=0;for(let j=0;j<4;j++)if(ji[i][j]===first)influence+=wt[i][j];
  const mask=smooth((sign*x+.006)/.025)*smooth((y-.55)/.10)*(1-smooth((y-.99)/.10))*smooth(influence/.15);if(mask<1e-8)continue;
  let base=null,r=[0,0,0,0],d=[0,0,0,0];const blend=new Matrix4();blend.elements.fill(0);
  for(let j=0;j<4;j++)if(wt[i][j]>1e-8){
   const joint=ji[i][j],w=wt[i][j],q=rotations[joint];if(!base)base=q;
   const f=base.dot(q)<0?-w:w,values=[q.x,q.y,q.z,q.w];for(let k=0;k<4;k++){r[k]+=f*values[k];d[k]+=f*duals[joint][k]}
   for(let k=0;k<16;k++)blend.elements[k]+=w*matrices[joint].elements[k];
  }
  const size=Math.hypot(...r);if(size<1e-8)throw Error('Degenerate dual quaternion');r=r.map(v=>v/size);d=d.map(v=>v/size);
  const dot=r.reduce((a,v,k)=>a+v*d[k],0);d=d.map((v,k)=>v-dot*r[k]);
  const qr=new Quaternion(...r),qd=new Quaternion(...d),t=qd.multiply(qr.clone().conjugate()),point=new Vector3(...p[i]);
  const desired=point.clone().applyQuaternion(qr).add(new Vector3(2*t.x,2*t.y,2*t.z));
  const linear=point.clone().applyMatrix4(blend),diff=desired.sub(linear).applyMatrix3(new Matrix3().setFromMatrix4(blend).invert()).multiplyScalar(mask);
  out.set(diff.toArray(),3*i);const len=diff.length();if(len>1e-7)changed++;max=Math.max(max,len);
 }
 return {delta:out,changed,max};
}
function normalDelta(delta){
 // Preserve the original smooth/hard edges: compare area-weighted, welded
 // face normals before and after the correction, then transport the source
 // normal by that difference. Coincident vertices with matching normal groups
 // get equal treatment, including UV seams.
 const groups=new Map(),groupId=new Int32Array(count);let next=0;
 for(let i=0;i<count;i++){
  const key=[...p[i].map(x=>Math.round(x*1e6)),...n[i].map(x=>Math.round(x*100))].join(',');
  if(!groups.has(key))groups.set(key,next++);groupId[i]=groups.get(key);
 }
 const acc0=new Float64Array(3*next),acc1=new Float64Array(3*next);
 for(let q=0;q<indices.getCount();q+=3){
  const ids=[indices.getScalar(q),indices.getScalar(q+1),indices.getScalar(q+2)],v=ids.map(i=>new Vector3(...p[i])),u=ids.map(i=>new Vector3(p[i][0]+delta[3*i],p[i][1]+delta[3*i+1],p[i][2]+delta[3*i+2]));
  const a=v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])),b=u[1].clone().sub(u[0]).cross(u[2].clone().sub(u[0]));
  for(const i of ids){const k=3*groupId[i];acc0[k]+=a.x;acc0[k+1]+=a.y;acc0[k+2]+=a.z;acc1[k]+=b.x;acc1[k+1]+=b.y;acc1[k+2]+=b.z}
 }
 const result=new Float32Array(count*3);
 for(let i=0;i<count;i++){
  const k=3*groupId[i],a=new Vector3(acc0[k],acc0[k+1],acc0[k+2]).normalize(),b=new Vector3(acc1[k],acc1[k+1],acc1[k+2]).normalize();
  if(a.distanceToSquared(b)<1e-24)continue;const v=new Vector3(...n[i]).add(b.sub(a)).normalize();
  result[3*i]=v.x-n[i][0];result[3*i+1]=v.y-n[i][1];result[3*i+2]=v.z-n[i][2];
 }
 return result;
}
const shapes=[handShape(),hipShape('L',90),hipShape('R',30)];
const targetNames=['Relaxed_Hands','Hip_Flex_L','Hip_Flex_R'];
for(let k=0;k<shapes.length;k++){
 const target=doc.createPrimitiveTarget(targetNames[k]);
 target.setAttribute('POSITION',doc.createAccessor(targetNames[k]+'_POSITION',buffer).setType(Accessor.Type.VEC3).setArray(shapes[k].delta));
 target.setAttribute('NORMAL',doc.createAccessor(targetNames[k]+'_NORMAL',buffer).setType(Accessor.Type.VEC3).setArray(normalDelta(shapes[k].delta)));body.addTarget(target);
}
mesh.setWeights([...mesh.getWeights(),0,0,0]);
// Preserve the old ten animation values exactly. glTF weight tracks must have
// one value per target, even when the three new shapes are zero in old clips.
for(const a of root.listAnimations())for(const c of a.listChannels())if(c.getTargetNode()===bodyNode&&c.getTargetPath()==='weights'){
 const s=c.getSampler(),old=s.getOutput().getArray(),N=s.getInput().getCount();
 if(s.getInterpolation()!=='LINEAR'||old.length!==N*OLD)throw Error('Unexpected weight track in '+a.getName());
 const expanded=new Float32Array(N*NEW);for(let i=0;i<N;i++)expanded.set(old.subarray(i*OLD,(i+1)*OLD),i*NEW);
 s.setOutput(doc.createAccessor(a.getName()+'_PreservedWeights',buffer).setType(Accessor.Type.SCALAR).setArray(expanded));
}
function addChannel(a,node,path,type,times,values){
 const input=doc.createAccessor(a.getName()+'_Time_'+node+'_'+path,buffer).setType(Accessor.Type.SCALAR).setArray(times);
 const out=doc.createAccessor(a.getName()+'_'+node+'_'+path,buffer).setType(type).setArray(values);
 const s=doc.createAnimationSampler().setInput(input).setOutput(out).setInterpolation('LINEAR');
 a.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(unique(node)).setTargetPath(path).setSampler(s));
}
const hipWeight=angle=>smooth((-angle*180/Math.PI-30)/40);
function cloneClip(oldName,newName,hand){
 const src=animation(oldName),a=doc.createAnimation(newName);let hadWeights=false;
 const thighChannels=Object.fromEntries(src.listChannels().filter(c=>c.getTargetPath()==='rotation'&&['Rig_Thigh_L','Rig_Thigh_R'].includes(c.getTargetNode().getName())).map(c=>[c.getTargetNode().getName(),c]));
 for(const c of src.listChannels()){
  const old=c.getSampler();let output=old.getOutput();
  if(c.getTargetNode()===bodyNode&&c.getTargetPath()==='weights'){
   const array=Float32Array.from(output.getArray()),N=old.getInput().getCount();hadWeights=true;
   for(let i=0;i<N;i++){
    array[i*NEW+10]=hand;
    for(const [side,j] of [['L',11],['R',12]]){
     const tq=new Quaternion().fromArray(thighChannels['Rig_Thigh_'+side].getSampler().getOutput().getElement(i,[])),e=new Euler().setFromQuaternion(tq,'XYZ');array[i*NEW+j]=hipWeight(e.x);
    }
   }
   output=doc.createAccessor(newName+'_Weights',buffer).setType(Accessor.Type.SCALAR).setArray(array);
  }
  const s=doc.createAnimationSampler().setInput(old.getInput()).setOutput(output).setInterpolation(old.getInterpolation());
  a.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(c.getTargetNode()).setTargetPath(c.getTargetPath()).setSampler(s));
 }
 if(!hadWeights){
  // Idle has no body morph track; add one so exported idle also relaxes hands.
  let duration=0;for(const c of src.listChannels()){const t=c.getSampler().getInput();duration=Math.max(duration,t.getScalar(t.getCount()-1))}
  if(duration<=0)throw Error('Idle has no duration');const row=Float32Array.from([0,1,0,0,0,0,0,0,0,0,hand,0,0]);
  addChannel(a,'head_2','weights',Accessor.Type.SCALAR,Float32Array.from([0,duration]),Float32Array.from([...row,...row]));
 }
 return a;
}
cloneClip('Full_Body_Walk','Revised_Walk',.90);cloneClip('Full_Body_Run','Revised_Run',1);
cloneClip('Idle_Breathing','Relaxed_Hands_Idle',.72);cloneClip('Previous_Refined_Idle','Relaxed_Hands_Previous_Idle',.72);

// The sole sampling and two-link IK are the same model-specific method as in
// the previous walk/run authoring, but the new crouch has its own pose/stride.
const sole={L:[],R:[]},matrices=nodes.map(()=>new Matrix4());
for(let i=0;i<count;i++)if(p[i][1]<.12&&Math.abs(p[i][0])>.03&&Math.abs(p[i][0])<.22)sole[p[i][0]>0?'L':'R'].push({p:new Vector3(...p[i]),j:ji[i],w:wt[i]});
function minimumFoot(side){
 skeleton.updateMatrixWorld(true);for(let i=0;i<nodes.length;i++)matrices[i].multiplyMatrices(rig.get(names[i]).matrixWorld,inverse[i]);let min=Infinity;
 for(const v of sole[side]){let y=0;for(let k=0;k<4;k++)if(v.w[k]){const e=matrices[v.j[k]].elements;y+=v.w[k]*(e[1]*v.p.x+e[5]*v.p.y+e[9]*v.p.z+e[13])}min=Math.min(min,y)}return min;
}
function solveLeg(side,goal){
 const thigh=rig.get('Rig_Thigh_'+side),shin=rig.get('Rig_Shin_'+side),foot=rig.get('Rig_Foot_'+side);skeleton.updateMatrixWorld(true);
 const a=P(thigh);let b=P(shin),c=P(foot);const footWorld=Q(foot),l1=a.distanceTo(b),l2=b.distanceTo(c),direction=goal.clone().sub(a);let distance=direction.length();
 if(distance<1e-8)throw Error('Degenerate foot target');distance=Math.max(Math.abs(l1-l2)+.0002,Math.min(l1+l2-.0002,distance));direction.setLength(distance);const target=a.clone().add(direction);direction.normalize();
 const along=(l1*l1+distance*distance-l2*l2)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along));
 const forward=new Vector3(0,0,1).addScaledVector(direction,-direction.z);if(forward.lengthSq()<1e-10)throw Error('Degenerate knee plane');forward.normalize();
 const desired=a.clone().addScaledVector(direction,along).addScaledVector(forward,height);
 let turn=new Quaternion().setFromUnitVectors(b.clone().sub(a).normalize(),desired.clone().sub(a).normalize());
 thigh.quaternion.copy(Q(thigh.parent).invert().multiply(turn.multiply(Q(thigh)))).normalize();skeleton.updateMatrixWorld(true);
 b=P(shin);c=P(foot);turn.setFromUnitVectors(c.clone().sub(b).normalize(),target.clone().sub(b).normalize());
 shin.quaternion.copy(Q(shin.parent).invert().multiply(turn.multiply(Q(shin)))).normalize();skeleton.updateMatrixWorld(true);
 foot.quaternion.copy(Q(foot.parent).invert().multiply(footWorld)).normalize();skeleton.updateMatrixWorld(true);
}
function footRoll(pitch){const p=rad(pitch),z=pitch<0?-.036:.205,y=-.105;return z-(z*Math.cos(p)+y*Math.sin(p))}
function crouchPath(t,c){
 t=((t%1)+1)%1;const A=c.speed*c.duration*c.stance/2;
 if(t<c.stance){const s=t/c.stance;return {z:A*(1-2*s),height:0,pitch:-5*(1-smooth(s/.2))+13*smooth((s-.77)/.23),contact:true}}
 const s=(t-c.stance)/(1-c.stance),m=-2*A*(1-c.stance)/c.stance;
 return {z:(2*s*s*s-3*s*s+1)*(-A)+(s*s*s-2*s*s+s)*m+(-2*s*s*s+3*s*s)*A+(s*s*s-s*s)*m,
  height:.055*Math.sin(Math.PI*Math.pow(s,.85))**2,pitch:13+(-5-13)*smooth(s),contact:false};
}
function corrective(angle){const r=rad(100);return Math.min(1.15,(1-Math.cos(angle/2))/(1-Math.cos(r/2)))}
function crouchClip(kind){
 const c={duration:kind==='walk'?1.6:2.4,speed:.38,stance:.68},steps=120,frames=[],stats={soleResidual:0,rootY:[Infinity,-Infinity],kneeDegrees:[Infinity,-Infinity],hipDegrees:[Infinity,-Infinity],flights:0};
 for(let i=0;i<steps;i++){
  const phase=i/steps,wave=Math.cos(2*Math.PI*phase),shift=Math.sin(2*Math.PI*phase),breath=Math.sin(2*Math.PI*phase),walking=kind==='walk';clearPose();
  const rootX=walking?.004*shift:0,rootY=-.162+(walking?.004*Math.cos(4*Math.PI*phase):.002*breath);
  skeleton.position.set(rootX,rootY,0);
  hip.quaternion.copy(qy(walking?-2*wave:0).multiply(qz(walking?1.0*shift:0)).multiply(qx(6+(walking?.3*shift:0))));
  spine.quaternion.copy(qy(walking?3*wave:0).multiply(qz(walking?-.7*shift:0)).multiply(qx(17+(walking?.4*shift:.6*breath))));
  chest.quaternion.copy(qy(walking?1*wave:0).multiply(qx(2+(walking?0:.4*breath))));
  rig.get('Rig_Neck').quaternion.copy(qx(-12));rig.get('Rig_Head').quaternion.copy(qx(-11));
  const paths={};
  for(const [side,sign,offset] of [['L',1,0],['R',-1,.5]]){
   const t=(phase+offset)%1,arm=walking?10*Math.cos(2*Math.PI*t):0,elbow=52+(walking?3*Math.sin(2*Math.PI*(t+.05)):1.5*breath);
   rig.get('Rig_UpperArm_'+side).quaternion.copy(qz(sign*8).multiply(qx(-13+arm)));
   rig.get('Rig_Forearm_'+side).quaternion.copy(qx(-elbow));
   paths[side]=walking?crouchPath(t,c):{z:sign*.025,height:0,pitch:0,contact:true};paths[side].elbow=elbow;
  }
  if(!paths.L.contact&&!paths.R.contact)stats.flights++;skeleton.updateMatrixWorld(true);
  const goals={};
  for(const [side,sign] of [['L',1],['R',-1]]){
   const foot=rig.get('Rig_Foot_'+side),shin=rig.get('Rig_Shin_'+side),path=paths[side];
   foot.quaternion.copy(Q(shin).invert().multiply(qy(sign*4).multiply(qx(path.pitch))));skeleton.updateMatrixWorld(true);
   const ankle=P(foot),targetY=.002+path.height;
   goals[side]={x:sign*.118,z:-.055+path.z+footRoll(path.pitch),targetY,y:ankle.y+targetY-minimumFoot(side)};
  }
  for(let iteration=0;iteration<6;iteration++)for(const side of ['L','R']){
   const g=goals[side],ankle=P(rig.get('Rig_Foot_'+side));solveLeg(side,new Vector3(g.x,ankle.y+g.targetY-minimumFoot(side),g.z));
  }
  let hips=[];
  for(const side of ['L','R']){
   const residual=Math.abs(minimumFoot(side)-goals[side].targetY);stats.soleResidual=Math.max(stats.soleResidual,residual);
   const a=P(rig.get('Rig_Thigh_'+side)),b=P(rig.get('Rig_Shin_'+side)),d=P(rig.get('Rig_Foot_'+side)),bend=b.clone().sub(a).normalize().angleTo(d.clone().sub(b).normalize())*180/Math.PI;
   const h=-new Euler().setFromQuaternion(rig.get('Rig_Thigh_'+side).quaternion,'XYZ').x*180/Math.PI;hips.push(h);stats.kneeDegrees[0]=Math.min(stats.kneeDegrees[0],bend);stats.kneeDegrees[1]=Math.max(stats.kneeDegrees[1],bend);stats.hipDegrees[0]=Math.min(stats.hipDegrees[0],h);stats.hipDegrees[1]=Math.max(stats.hipDegrees[1],h);
  }
  stats.rootY[0]=Math.min(stats.rootY[0],rootY);stats.rootY[1]=Math.max(stats.rootY[1],rootY);
  const morph=[0,1,corrective(rad(paths.L.elbow)),corrective(rad(paths.R.elbow)),
   corrective(2*Math.acos(Math.min(1,Math.abs(rig.get('Rig_Shin_L').quaternion.w)))),corrective(2*Math.acos(Math.min(1,Math.abs(rig.get('Rig_Shin_R').quaternion.w)))),0,0,0,0,.9,
   smooth((hips[0]-30)/40),smooth((hips[1]-30)/40)];
  frames.push({rootX,rootY,rotations:new Map(names.filter(x=>x!=='Rig_Root').map(x=>[x,rig.get(x).quaternion.clone()])),morph});
 }
 if(stats.soleResidual>.005||stats.flights)throw Error('Crouch foot fitting error: '+JSON.stringify(stats));
 frames.push({rootX:frames[0].rootX,rootY:frames[0].rootY,rotations:new Map([...frames[0].rotations].map(([n,q])=>[n,q.clone()])),morph:[...frames[0].morph]});
 const name=kind==='walk'?'Stealth_Crouch_Walk':'Stealth_Crouch_Idle',a=doc.createAnimation(name),times=Float32Array.from(frames.map((_,i)=>c.duration*i/steps));
 addChannel(a,'Rig_Root','translation',Accessor.Type.VEC3,times,Float32Array.from(frames.flatMap(f=>[f.rootX,f.rootY,0])));
 for(const node of names.filter(x=>x!=='Rig_Root')){
  let previous=null;const arr=new Float32Array(frames.length*4);frames.forEach((f,i)=>{let q=f.rotations.get(node);if(previous&&previous.dot(q)<0)q.set(-q.x,-q.y,-q.z,-q.w);q.toArray(arr,4*i);previous=q});
  addChannel(a,node,'rotation',Accessor.Type.VEC4,times,arr);
 }
 addChannel(a,'head_2','weights',Accessor.Type.SCALAR,times,Float32Array.from(frames.flatMap(f=>f.morph)));
 return {name,duration:c.duration,speed:kind==='walk'?c.speed:0,stance:kind==='walk'?c.stance:1,stats};
}
const crouch=[crouchClip('idle'),crouchClip('walk')];
// glTF-Transform substitutes numeric names for deliberately blank target names.
const sourceJSON=JSON.parse(source.subarray(20,20+source.readUInt32LE(12)).toString('utf8'));
for(const node of sourceJSON.nodes.filter(n=>n.mesh!==undefined)){
 const original=sourceJSON.meshes[node.mesh].extras?.targetNames;if(!original)continue;
 const targets=unique(node.name).getMesh().listPrimitives()[0].listTargets();
 if(targets.length!==original.length+(node.name==='head_2'?3:0))throw Error('Unexpected targets on '+node.name);
 original.forEach((v,i)=>targets[i].setName(v));
}
const result=Buffer.from(await io.writeBinary(doc));fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,result);
console.log(JSON.stringify({sourceSha256:SOURCE_SHA,outputSha256:hash(result),bytes:result.length,bones:nodes.length,shapes:Object.fromEntries(shapes.map((s,i)=>[targetNames[i],{changed:s.changed,maxDisplacement:s.max}])),crouch,allAnimations:root.listAnimations().map(a=>a.getName())},null,2));
