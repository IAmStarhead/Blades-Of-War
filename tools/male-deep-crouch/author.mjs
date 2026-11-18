// A reversible, model-specific crouch/body trial based on the last delivered GLB.
// The original file is never overwritten. This is ordinary linear skinning and
// authored corrective morphs, not an anatomical or physical muscle simulation.
import {Accessor,NodeIO} from '@gltf-transform/core';
import {Bone,Euler,Matrix3,Matrix4,Quaternion,Vector3} from 'three';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../..'),OWN=path.join(ROOT,'work/male-deep-crouch');
const SOURCE_SHA='cfee79f1f8f8d475366384447f1fcf8d3611cafd95e905a11fa44942b1249377';
const sha=b=>createHash('sha256').update(b).digest('hex'),args=process.argv.slice(2);
if(args.length!==2)throw Error('Usage: node author.mjs DELIVERED.glb OUTPUT.glb');
const [input,output]=args.map(p=>path.resolve(p));
if(input===output||(output.startsWith(ROOT+path.sep)&&!output.startsWith(OWN+path.sep)))throw Error('Refusing to overwrite another artifact');
const bytes=fs.readFileSync(input);if(sha(bytes)!==SOURCE_SHA)throw Error('Unexpected delivered model');
const io=new NodeIO(),doc=await io.readBinary(bytes),root=doc.getRoot(),buffer=root.listBuffers()[0];
const unique=name=>{const n=root.listNodes().filter(x=>x.getName()===name);if(n.length!==1)throw Error('Expected one node: '+name);return n[0]};
const clip=name=>{const a=root.listAnimations().filter(x=>x.getName()===name);if(a.length!==1)throw Error('Expected one clip: '+name);return a[0]};
const bodyNode=unique('head_2'),mesh=bodyNode.getMesh(),body=mesh.listPrimitives()[0],skin=root.listSkins()[0];
const pos=body.getAttribute('POSITION'),normal=body.getAttribute('NORMAL'),indices=body.getIndices(),joints=body.getAttribute('JOINTS_0'),weights=body.getAttribute('WEIGHTS_0');
const nodes=skin.listJoints(),names=nodes.map(n=>n.getName()),count=pos.getCount(),OLD=13,NEW=16;
if(nodes.length!==22||body.listTargets().length!==OLD||mesh.getWeights().length!==OLD||root.listAnimations().length!==37)throw Error('Unexpected source structure');
const getPacked=(accessor,width)=>{const out=new Float32Array(count*width);for(let i=0;i<count;i++)out.set(accessor.getElement(i,[]),width*i);return out};
const p0=getPacked(pos,3),n0=getPacked(normal,3),ji=Array.from({length:count},(_,i)=>joints.getElement(i,[])),wt=Array.from({length:count},(_,i)=>weights.getElement(i,[]));
const originalMorphs=body.listTargets().map(t=>{const a=t.getAttribute('POSITION');return a?getPacked(a,3):new Float32Array(count*3)});
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
const rad=x=>x*Math.PI/180,axisX=new Vector3(1,0,0),axisZ=new Vector3(0,0,1);
const qx=x=>new Quaternion().setFromAxisAngle(axisX,rad(x)),qz=x=>new Quaternion().setFromAxisAngle(axisZ,rad(x));
const gaussian=x=>Math.exp(-(x*x));

// Preserve the actual last-delivered rest surface for the viewer's comparison.
// The underlying rig, weights and inverse bind matrices are NOT changed.
body.setAttribute('_REFERENCE_POSITION',doc.createAccessor('Last_Delivery_Position',buffer).setType(Accessor.Type.VEC3).setArray(Float32Array.from(p0)));
body.setAttribute('_REFERENCE_NORMAL',doc.createAccessor('Last_Delivery_Normal',buffer).setType(Accessor.Type.VEC3).setArray(Float32Array.from(n0)));

// Transport the original normals by the difference in welded, area-weighted
// face normals. This preserves the source's split smoothing groups and UV seams.
function normalDelta(base,norm,delta){
 const groups=new Map(),id=new Int32Array(count);let next=0;
 for(let i=0;i<count;i++){
  const k=3*i,key=[...Array.from(base.subarray(k,k+3),v=>Math.round(v*1e6)),...Array.from(norm.subarray(k,k+3),v=>Math.round(v*100))].join(',');
  if(!groups.has(key))groups.set(key,next++);id[i]=groups.get(key);
 }
 const a0=new Float64Array(3*next),a1=new Float64Array(3*next);
 for(let i=0;i<indices.getCount();i+=3){
  const ids=[indices.getScalar(i),indices.getScalar(i+1),indices.getScalar(i+2)];
  const at=(j,d)=>new Vector3(base[3*j]+(d?delta[3*j]:0),base[3*j+1]+(d?delta[3*j+1]:0),base[3*j+2]+(d?delta[3*j+2]:0));
  const x=ids.map(j=>at(j,false)),y=ids.map(j=>at(j,true));
  const before=x[1].clone().sub(x[0]).cross(x[2].clone().sub(x[0])),after=y[1].clone().sub(y[0]).cross(y[2].clone().sub(y[0]));
  for(const j of ids){const k=3*id[j];a0[k]+=before.x;a0[k+1]+=before.y;a0[k+2]+=before.z;a1[k]+=after.x;a1[k+1]+=after.y;a1[k+2]+=after.z}
 }
 const out=new Float32Array(count*3);
 for(let i=0;i<count;i++){
  const k=3*id[i],a=new Vector3(a0[k],a0[k+1],a0[k+2]).normalize(),b=new Vector3(a1[k],a1[k+1],a1[k+2]).normalize(),p=3*i;
  if(a.distanceToSquared(b)<1e-24)continue;
  const n=new Vector3(n0[0],n0[1],n0[2]).fromArray(norm,p).add(b.sub(a)).normalize();
  out[p]=n.x-norm[p];out[p+1]=n.y-norm[p+1];out[p+2]=n.z-norm[p+2];
 }
 return out;
}

// A broad, modest rear silhouette and a few millimetres on the upper legs.
// Do not enlarge the upper arms: that candidate worsened armpit intersections.
const baseDelta=new Float32Array(count*3);let bodyChanged=0,bodyMax=0;
for(let i=0;i<count;i++){
 const k=3*i,x=p0[k],y=p0[k+1],z=p0[k+2];if(y<.40||y>1.25)continue;
 let influence=0;for(let j=0;j<4;j++)if(/^Rig_(Hips|Spine|Thigh_)/.test(names[ji[i][j]]))influence+=wt[i][j];
 const bodyMask=smooth(.05,.6,influence),back=smooth(.005,.08,-z),front=smooth(.01,.09,z),ax=Math.abs(x),across=gaussian((ax-.10)/.19);
 const groove=1-.20*gaussian(x/.028)*smooth(.84,.91,y),gl=.065*bodyMask*back*across*gaussian((y-.88)/.13)*groove;
 const ham=.08*.065*bodyMask*back*across*gaussian((y-.65)/.16),quad=.08*.065*bodyMask*front*across*gaussian((y-.65)/.16);
 baseDelta[k]=(x/.2)*.08*gl;baseDelta[k+1]=-.02*gl;baseDelta[k+2]=-gl-ham+quad;
 const d=Math.hypot(baseDelta[k],baseDelta[k+1],baseDelta[k+2]);if(d>1e-7)bodyChanged++;bodyMax=Math.max(bodyMax,d);
}
const p=Float32Array.from(p0,(v,i)=>v+baseDelta[i]),baseNormalShift=normalDelta(p0,n0,baseDelta),n=Float32Array.from(n0,(v,i)=>v+baseNormalShift[i]);
body.setAttribute('POSITION',doc.createAccessor('Deep_Trial_Position',buffer).setType(Accessor.Type.VEC3).setArray(p));
body.setAttribute('NORMAL',doc.createAccessor('Deep_Trial_Normal',buffer).setType(Accessor.Type.VEC3).setArray(n));

// Reconstruct the unchanged delivered bind hierarchy and inverse matrices.
const rig=new Map();
for(const node of nodes){const b=new Bone();b.name=node.getName();b.position.fromArray(node.getTranslation());b.quaternion.fromArray(node.getRotation());b.scale.fromArray(node.getScale());
 if(b.quaternion.angleTo(new Quaternion())>1e-7||b.scale.toArray().some(x=>Math.abs(x-1)>1e-7))throw Error('Unexpected bind orientation '+b.name);rig.set(b.name,b)}
for(const node of nodes){const parent=node.getParentNode()?.getName();if(rig.has(parent))rig.get(parent).add(rig.get(node.getName()))}
const skeleton=rig.get('Rig_Root'),P=b=>b.getWorldPosition(new Vector3()),Q=b=>b.getWorldQuaternion(new Quaternion());
const inverse=nodes.map((_,i)=>new Matrix4().fromArray(skin.getInverseBindMatrices().getElement(i,[])));
function clearPose(){for(const node of nodes){const b=rig.get(node.getName());b.position.fromArray(node.getTranslation());b.quaternion.fromArray(node.getRotation());b.scale.fromArray(node.getScale())}skeleton.updateMatrixWorld(true)}
function sourceFrame(source,i){
 clearPose();let morph=null;
 for(const c of source.listChannels()){
  const sampler=c.getSampler(),target=c.getTargetPath(),name=c.getTargetNode().getName(),out=sampler.getOutput();
  if(sampler.getInterpolation()!=='LINEAR'||sampler.getInput().getCount()!==121)throw Error('Unexpected source timing '+source.getName());
  if(name==='head_2'&&target==='weights'){morph=Array.from(out.getArray().subarray(i*OLD,(i+1)*OLD));continue}
  const b=rig.get(name);if(!b)throw Error('Unexpected channel '+name);
  if(target==='rotation')b.quaternion.fromArray(out.getElement(i,[]));else if(target==='translation')b.position.fromArray(out.getElement(i,[]));else throw Error('Unexpected channel target '+target);
 }
 if(morph?.length!==OLD)throw Error('Missing old morph values');skeleton.updateMatrixWorld(true);return morph;
}
function solve(side,goal,kneeReference,footWorld){
 const thigh=rig.get('Rig_Thigh_'+side),shin=rig.get('Rig_Shin_'+side),foot=rig.get('Rig_Foot_'+side);skeleton.updateMatrixWorld(true);
 const hip=P(thigh);let knee=P(shin),ankle=P(foot);const upper=hip.distanceTo(knee),lower=knee.distanceTo(ankle),direction=goal.clone().sub(hip);let distance=direction.length();
 const high=upper+lower-.0002,low=Math.abs(upper-lower)+.0002,miss=Math.max(0,distance-high,low-distance);if(distance<1e-8)throw Error('Degenerate leg target');
 distance=Math.max(low,Math.min(high,distance));direction.normalize();const target=hip.clone().addScaledVector(direction,distance);
 const along=(upper*upper+distance*distance-lower*lower)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-along*along));
 const ref=kneeReference.clone().sub(hip),plane=ref.clone().addScaledVector(direction,-ref.dot(direction));
 if(plane.lengthSq()<1e-8){plane.set(0,0,1).addScaledVector(direction,-direction.z);if(plane.lengthSq()<1e-8)throw Error('Degenerate knee plane')}
 plane.normalize();const desired=hip.clone().addScaledVector(direction,along).addScaledVector(plane,height);
 let turn=new Quaternion().setFromUnitVectors(knee.clone().sub(hip).normalize(),desired.clone().sub(hip).normalize()),world=turn.multiply(Q(thigh));
 thigh.quaternion.copy(Q(thigh.parent).invert().multiply(world)).normalize();skeleton.updateMatrixWorld(true);
 knee=P(shin);ankle=P(foot);turn.setFromUnitVectors(ankle.clone().sub(knee).normalize(),target.clone().sub(knee).normalize());world=turn.multiply(Q(shin));
 shin.quaternion.copy(Q(shin.parent).invert().multiply(world)).normalize();skeleton.updateMatrixWorld(true);
 foot.quaternion.copy(Q(foot.parent).invert().multiply(footWorld)).normalize();skeleton.updateMatrixWorld(true);
 const finalKnee=P(shin),finalAnkle=P(foot),bend=finalKnee.clone().sub(hip).normalize().angleTo(finalAnkle.clone().sub(finalKnee).normalize())*180/Math.PI;
 return {miss,ankleError:finalAnkle.distanceTo(goal),footAngle:Q(foot).angleTo(footWorld),knee:bend};
}
function deeper(sourceName){
 const source=clip(sourceName),frames=[],stats={reachMiss:0,ankleError:0,footAngle:0,kneeMin:Infinity,kneeMax:0};
 for(let i=0;i<120;i++){
  const morph=sourceFrame(source,i),desired={};
  for(const side of ['L','R'])desired[side]={ankle:P(rig.get('Rig_Foot_'+side)),knee:P(rig.get('Rig_Shin_'+side)),foot:Q(rig.get('Rig_Foot_'+side))};
  // Lower an additional 16 cm and shift slightly back, then retain the
  // delivered ankle targets and foot orientations with two-link IK.
  skeleton.position.y-=.16;skeleton.position.z-=.032;
  rig.get('Rig_Spine').quaternion.multiply(qx(8));rig.get('Rig_Neck').quaternion.multiply(qx(-4));rig.get('Rig_Head').quaternion.multiply(qx(-4));
  for(const [side,sign] of [['L',1],['R',-1]])rig.get('Rig_UpperArm_'+side).quaternion.premultiply(qz(sign*5));
  skeleton.updateMatrixWorld(true);
  for(const side of ['L','R']){const d=desired[side],s=solve(side,d.ankle,d.knee,d.foot);stats.reachMiss=Math.max(stats.reachMiss,s.miss);stats.ankleError=Math.max(stats.ankleError,s.ankleError);stats.footAngle=Math.max(stats.footAngle,s.footAngle);stats.kneeMin=Math.min(stats.kneeMin,s.knee);stats.kneeMax=Math.max(stats.kneeMax,s.knee)}
  frames.push({root:skeleton.position.clone(),rotations:new Map(names.map(name=>[name,rig.get(name).quaternion.clone()])),morph});
 }
 if(stats.reachMiss>.0001||stats.ankleError>.0001||stats.footAngle>1e-5)throw Error('Crouch target cannot be preserved: '+JSON.stringify(stats));
 const f=frames[0];frames.push({root:f.root.clone(),rotations:new Map([...f.rotations].map(([name,q])=>[name,q.clone()])),morph:[...f.morph]});
 return {source,frames,stats};
}
const crouchIdle=deeper('Leg_Refined_Crouch_Idle'),crouchWalk=deeper('Leg_Refined_Crouch_Walk');
function applyFrame(frame){clearPose();skeleton.position.copy(frame.root);for(const [name,q] of frame.rotations)rig.get(name).quaternion.copy(q);skeleton.updateMatrixWorld(true)}
function skinMatrices(){skeleton.updateMatrixWorld(true);return nodes.map((node,i)=>new Matrix4().multiplyMatrices(rig.get(node.getName()).matrixWorld,inverse[i]))}
function weightedMatrix(matrices,i){const out=new Matrix4();out.elements.fill(0);for(let k=0;k<4;k++)if(wt[i][k]>1e-8)for(let a=0;a<16;a++)out.elements[a]+=wt[i][k]*matrices[ji[i][k]].elements[a];return out}
function morphPoint(i,morph){const k=3*i,v=new Vector3(p[k],p[k+1],p[k+2]);for(let t=0;t<OLD;t++)if(morph[t]){v.x+=morph[t]*originalMorphs[t][k];v.y+=morph[t]*originalMorphs[t][k+1];v.z+=morph[t]*originalMorphs[t][k+2]}return v}

// Weld only for surface-neighbour calculations; the exported topology stays intact.
const welded=new Map(),verts=[],vertexToWeld=new Int32Array(count);
for(let i=0;i<count;i++){
 const k=3*i,key=[p0[k],p0[k+1],p0[k+2]].map(x=>Math.round(x*1e6)).join(',');
 if(!welded.has(key)){welded.set(key,verts.length);verts.push({representative:i,edges:new Set()})}vertexToWeld[i]=welded.get(key);
}
for(let i=0;i<indices.getCount();i+=3){
 const ids=[0,1,2].map(k=>vertexToWeld[indices.getScalar(i+k)]);
 for(const [a,b] of [[0,1],[1,2],[2,0]])if(ids[a]!==ids[b]){verts[ids[a]].edges.add(ids[b]);verts[ids[b]].edges.add(ids[a])}
}
function correctiveHip(side,frame){
 applyFrame(frame);const matrices=skinMatrices(),rotations=matrices.map(m=>new Quaternion().setFromRotationMatrix(m));
 const duals=matrices.map((m,i)=>{const t=new Vector3().setFromMatrixPosition(m),q=new Quaternion(t.x,t.y,t.z,0).multiply(rotations[i]);return [q.x*.5,q.y*.5,q.z*.5,q.w*.5]});
 const sign=side==='L'?1:-1,thigh=names.indexOf('Rig_Thigh_'+side),dq=new Float32Array(count*3),blendCache=new Map();
 for(let i=0;i<count;i++){
  const k=3*i,x=p[k],y=p[k+1],z=p[k+2];let influence=0;for(let j=0;j<4;j++)if(ji[i][j]===thigh)influence+=wt[i][j];
  const mask=smooth(-.006,.025,sign*x)*smooth(.58,.70,y)*(1-smooth(.99,1.09,y))*smooth(.01,.16,influence);if(mask<1e-8)continue;
  let base=null,r=[0,0,0,0],d=[0,0,0,0];const blend=weightedMatrix(matrices,i);
  for(let j=0;j<4;j++)if(wt[i][j]>1e-8){const id=ji[i][j],weight=wt[i][j],q=rotations[id];if(!base)base=q;const f=base.dot(q)<0?-weight:weight,values=[q.x,q.y,q.z,q.w];for(let z=0;z<4;z++){r[z]+=f*values[z];d[z]+=f*duals[id][z]}}
  const len=Math.hypot(...r);if(len<1e-8)throw Error('Degenerate dual quaternion');r=r.map(x=>x/len);d=d.map(x=>x/len);
  const dot=r.reduce((a,x,j)=>a+x*d[j],0);d=d.map((x,j)=>x-dot*r[j]);
  const qr=new Quaternion(...r),translation=new Quaternion(...d).multiply(qr.clone().conjugate()),point=new Vector3(x,y,z);
  const desired=point.clone().applyQuaternion(qr).add(new Vector3(2*translation.x,2*translation.y,2*translation.z)),linear=point.clone().applyMatrix4(blend);
  const diff=desired.sub(linear).applyMatrix3(new Matrix3().setFromMatrix4(blend).invert()).multiplyScalar(mask*.75*smooth(.73,.84,y)*smooth(-.01,.085,z));
  dq.set(diff.toArray(),k);
 }
 // Mild local smoothing of the inner-thigh transition in a bent reference pose.
 // The contribution is deliberately partial; a full correction visibly pinches.
 const original=verts.map(u=>morphPoint(u.representative,frame.morph).applyMatrix4(weightedMatrix(matrices,u.representative))),masks=[];
 for(const u of verts){const i=u.representative,k=3*i,x=p0[k],y=p0[k+1];let inf=0;for(let j=0;j<4;j++)if(ji[i][j]===thigh)inf+=wt[i][j];
  masks.push(smooth(.004,.035,sign*x)*(1-smooth(.075,.13,Math.abs(x)))*smooth(.63,.72,y)*(1-smooth(.88,.98,y))*smooth(.02,.15,inf));
 }
 let current=original.map(v=>v.clone());
 for(let pass=0;pass<3;pass++)current=current.map((point,i)=>{
  if(masks[i]<1e-8||!verts[i].edges.size)return point.clone();const average=new Vector3();for(const j of verts[i].edges)average.add(current[j]);average.multiplyScalar(1/verts[i].edges.size);return point.clone().lerp(average,.45*masks[i]);
 });
 const out=new Float32Array(count*3);let max=0,changed=0;
 for(let i=0;i<count;i++){
  const k=3*i,u=vertexToWeld[i],diff=current[u].clone().sub(original[u]);
  if(diff.lengthSq()>1e-22)diff.applyMatrix3(new Matrix3().setFromMatrix4(weightedMatrix(matrices,i)).invert()).multiplyScalar(.4);
  // Keep more of the corrective at the front hip fold and ease it away
  // toward the upper pelvis. A broad, smooth falloff reduces the worst local
  // triangle compression without introducing a hard mask boundary.
  const y=p0[k+1],ax=Math.abs(p0[k]);
  const factor=1+.4*gaussian((y-.90)/.06)*smooth(.025,.09,ax)-.4*gaussian((y-.96)/.045);
  out[k]=(dq[k]+diff.x)*factor;out[k+1]=(dq[k+1]+diff.y)*factor;out[k+2]=(dq[k+2]+diff.z)*factor;
  const size=Math.hypot(out[k],out[k+1],out[k+2]);if(size>1e-7)changed++;max=Math.max(max,size);
 }
 return {delta:out,changed,max};
}
const hipL=correctiveHip('L',crouchWalk.frames[115]),hipR=correctiveHip('R',crouchWalk.frames[55]);
// A broad, smoothly fading compression at the back of the knee for the
// deeper squat. This replaces the visible self-intersections seen in the first
// prototype; it is not active in the upright walk/run cycles.
const knee=new Float32Array(count*3);let kneeMax=0,kneeChanged=0;
for(let i=0;i<count;i++){
 const k=3*i,y=p[k+1],z=p[k+2];let inf=0;for(let j=0;j<4;j++)if(/^Rig_(Thigh|Shin)_/.test(names[ji[i][j]]))inf+=wt[i][j];
 const mask=smooth(.3,.8,inf)*smooth(.01,.10,-z)*gaussian((y-.49)/.16)*smooth(.22,.30,y)*(1-smooth(.72,.80,y));
 knee[k+2]=.045*mask;if(knee[k+2]>1e-7)kneeChanged++;kneeMax=Math.max(kneeMax,knee[k+2]);
}
const shapes=[hipL,hipR,{delta:knee,changed:kneeChanged,max:kneeMax}],shapeNames=['Deep_Hip_L','Deep_Hip_R','Deep_Knee_Fold'];
for(let i=0;i<shapes.length;i++){
 const target=doc.createPrimitiveTarget(shapeNames[i]),delta=shapes[i].delta;
 if(!Array.from(delta).every(Number.isFinite))throw Error('Nonfinite corrective '+shapeNames[i]);
 target.setAttribute('POSITION',doc.createAccessor(shapeNames[i]+'_POSITION',buffer).setType(Accessor.Type.VEC3).setArray(delta));
 target.setAttribute('NORMAL',doc.createAccessor(shapeNames[i]+'_NORMAL',buffer).setType(Accessor.Type.VEC3).setArray(normalDelta(p,n,delta)));body.addTarget(target);
}
mesh.setWeights([...mesh.getWeights(),0,0,0]);
// Keep the first 13 values of every existing morph track exactly; glTF requires
// a value for each appended target, so old tracks receive three trailing zeros.
for(const a of root.listAnimations())for(const c of a.listChannels())if(c.getTargetNode()===bodyNode&&c.getTargetPath()==='weights'){
 const sampler=c.getSampler(),original=sampler.getOutput().getArray(),N=sampler.getInput().getCount();if(original.length!==N*OLD||sampler.getInterpolation()!=='LINEAR')throw Error('Unexpected old morph track '+a.getName());
 const expanded=new Float32Array(N*NEW);for(let i=0;i<N;i++)expanded.set(original.subarray(i*OLD,(i+1)*OLD),i*NEW);
 sampler.setOutput(doc.createAccessor(a.getName()+'_Preserved_Morphs',buffer).setType(Accessor.Type.SCALAR).setArray(expanded));
}
function addChannel(a,node,target,type,times,values){
 const input=doc.createAccessor(a.getName()+'_'+node+'_'+target+'_Time',buffer).setType(Accessor.Type.SCALAR).setArray(times);
 const out=doc.createAccessor(a.getName()+'_'+node+'_'+target,buffer).setType(type).setArray(values);
 const sampler=doc.createAnimationSampler().setInput(input).setOutput(out).setInterpolation('LINEAR');
 a.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(unique(node)).setTargetPath(target).setSampler(sampler));
}
function addCopiedChannel(a,c,values){
 const old=c.getSampler(),sampler=doc.createAnimationSampler().setInput(old.getInput()).setOutput(values||old.getOutput()).setInterpolation(old.getInterpolation());
 a.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(c.getTargetNode()).setTargetPath(c.getTargetPath()).setSampler(sampler));
}
function qArray(frames,name){const out=new Float32Array(frames.length*4);let previous=null;for(let i=0;i<frames.length;i++){const q=frames[i].rotations.get(name).clone();if(previous&&previous.dot(q)<0)q.set(-q.x,-q.y,-q.z,-q.w);q.toArray(out,4*i);previous=q}out.set(out.subarray(0,4),out.length-4);return out}
function createDeepClip(data,name){
 const a=doc.createAnimation(name),modified=new Set(['Rig_Spine','Rig_Neck','Rig_Head','Rig_UpperArm_L','Rig_UpperArm_R','Rig_Thigh_L','Rig_Thigh_R','Rig_Shin_L','Rig_Shin_R','Rig_Foot_L','Rig_Foot_R']);
 for(const c of data.source.listChannels()){
  const target=c.getTargetPath(),node=c.getTargetNode().getName();let out=null;
  if(node==='Rig_Root'&&target==='translation')out=doc.createAccessor(name+'_Root',buffer).setType(Accessor.Type.VEC3).setArray(Float32Array.from(data.frames.flatMap(f=>f.root.toArray())));
  else if(target==='rotation'&&modified.has(node))out=doc.createAccessor(name+'_'+node,buffer).setType(Accessor.Type.VEC4).setArray(qArray(data.frames,node));
  else if(node==='head_2'&&target==='weights'){
   const values=new Float32Array(data.frames.length*NEW);
   for(let i=0;i<data.frames.length;i++){
    values.set(data.frames[i].morph,i*NEW);
    // Drive each hip separately from its own flexion, not a constant shape
    // on both legs throughout the squat walk. The knee-fold corrective is
    // needed for both bent legs across the full deep cycle.
    for(const [side,col] of [['L',13],['R',14]]){
     const q=data.frames[i].rotations.get('Rig_Thigh_'+side),angle=-new Euler().setFromQuaternion(q,'XYZ').x*180/Math.PI;
     values[i*NEW+col]=smooth(35,75,angle);
    }
    values[i*NEW+15]=1;
   }
   out=doc.createAccessor(name+'_Morphs',buffer).setType(Accessor.Type.SCALAR).setArray(values);
  }
  addCopiedChannel(a,c,out);
 }
 return name;
}
function createUprightClip(sourceName,name){
 const source=clip(sourceName),a=doc.createAnimation(name),channels=source.listChannels(),thighs={};
 for(const side of ['L','R'])thighs[side]=channels.find(c=>c.getTargetNode().getName()==='Rig_Thigh_'+side&&c.getTargetPath()==='rotation');
 for(const c of channels){
  const target=c.getTargetPath(),node=c.getTargetNode().getName(),sampler=c.getSampler(),N=sampler.getInput().getCount();let out=null;
  if(/^Rig_UpperArm_[LR]$/.test(node)&&target==='rotation'){
   const sign=node.endsWith('_L')?1:-1,values=new Float32Array(N*4);let previous=null;
   for(let i=0;i<N;i++){const q=new Quaternion().fromArray(sampler.getOutput().getElement(i,[])).premultiply(qz(sign*5));if(previous&&previous.dot(q)<0)q.set(-q.x,-q.y,-q.z,-q.w);q.toArray(values,4*i);previous=q}values.set(values.subarray(0,4),values.length-4);
   out=doc.createAccessor(name+'_'+node,buffer).setType(Accessor.Type.VEC4).setArray(values);
  }else if(node==='head_2'&&target==='weights'){
   const values=Float32Array.from(sampler.getOutput().getArray());
   for(let i=0;i<N;i++)for(const [side,col] of [['L',13],['R',14]]){
    const q=new Quaternion().fromArray(thighs[side].getSampler().getOutput().getElement(i,[])),angle=-new Euler().setFromQuaternion(q,'XYZ').x*180/Math.PI;
    values[NEW*i+col]=.5*smooth(18,58,angle);
   }
   for(let k=0;k<NEW;k++)values[NEW*(N-1)+k]=values[k];
   out=doc.createAccessor(name+'_Morphs',buffer).setType(Accessor.Type.SCALAR).setArray(values);
  }
  addCopiedChannel(a,c,out);
 }
 return name;
}
function createIdleClip(sourceName,name){
 const source=clip(sourceName),a=doc.createAnimation(name);let duration=0;
 for(const c of source.listChannels()){if(/^Rig_UpperArm_[LR]$/.test(c.getTargetNode().getName())&&c.getTargetPath()==='rotation')throw Error('Idle already animates arms');const t=c.getSampler().getInput();duration=Math.max(duration,t.getScalar(t.getCount()-1));addCopiedChannel(a,c)}
 for(const [side,sign] of [['L',1],['R',-1]]){const q=qz(sign*10).toArray();addChannel(a,'Rig_UpperArm_'+side,'rotation',Accessor.Type.VEC4,Float32Array.from([0,duration]),Float32Array.from([...q,...q]))}
 return name;
}
const newClips=[createIdleClip('Relaxed_Hands_Idle','Trial_Idle_Soft'),createIdleClip('Relaxed_Hands_Previous_Idle','Trial_Idle_Old'),
 createUprightClip('Leg_Refined_Walk','Trial_Walk'),createUprightClip('Leg_Refined_Run','Trial_Run'),
 createDeepClip(crouchIdle,'Deep_Crouch_Idle'),createDeepClip(crouchWalk,'Deep_Crouch_Walk')];
// Restore deliberately blank target names from the delivered GLB.
const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
for(const node of json.nodes.filter(n=>n.mesh!==undefined)){
 const targetNames=json.meshes[node.mesh].extras?.targetNames;if(!targetNames)continue;const targets=unique(node.name).getMesh().listPrimitives()[0].listTargets();
 if(targets.length!==targetNames.length+(node.name==='head_2'?3:0))throw Error('Unexpected target names on '+node.name);
 targetNames.forEach((value,i)=>targets[i].setName(value));
}
for(const arr of [p,n,...shapes.map(s=>s.delta)])if(!Array.from(arr).every(Number.isFinite))throw Error('Nonfinite geometry');
const result=Buffer.from(await io.writeBinary(doc));fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,result);
console.log(JSON.stringify({sourceSha256:SOURCE_SHA,outputSha256:sha(result),bytes:result.length,bones:nodes.length,body:{changedVertices:bodyChanged,maxDisplacement:bodyMax},shapes:Object.fromEntries(shapes.map((s,i)=>[shapeNames[i],{changedVertices:s.changed,maxDisplacement:s.max}])),depthAdditional:.16,armClearanceDegrees:{idle:10,motion:5},crouch:{idle:crouchIdle.stats,walk:crouchWalk.stats},newClips,allAnimations:root.listAnimations().map(a=>a.getName())},null,2));
