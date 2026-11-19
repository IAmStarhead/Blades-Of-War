// Reversible follow-up to the physically reviewed anatomy trial. The base
// sculpt is restricted to the waist/abdomen. Two ordinary glTF morphs mitigate
// linear-skinning compression near bent knees, only in two duplicate clips.
// This is not muscle simulation or a repair of the posterior pelvis fold.
import {Accessor,NodeIO,VertexLayout} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {Bone,Matrix3,Matrix4,Quaternion,Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fitKneeNormals} from './fit-knee-normals.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const OWN=path.join(ROOT,'work/male-body-volume');
const SOURCE_SHA='03063b8287ab2d3bba058afd8575e6263e387b2ed2ac0912fd0149ca775041a1';
const hash=b=>createHash('sha256').update(b).digest('hex');
if(process.argv.length!==4)throw Error('Usage: node author.mjs previous.glb trial.glb');
const input=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);
if(input===output||(output.startsWith(ROOT+path.sep)&&!output.startsWith(OWN+path.sep)))throw Error('Refusing to overwrite a previous artifact');
const bytes=fs.readFileSync(input);if(hash(bytes)!==SOURCE_SHA)throw Error('Unexpected latest model');
const doc=await new NodeIO().readBinary(bytes),root=doc.getRoot(),buffer=root.listBuffers()[0];
const node=name=>{const a=root.listNodes().filter(n=>n.getName()===name);if(a.length!==1)throw Error('Expected one node '+name);return a[0]};
const clip=name=>{const a=root.listAnimations().filter(c=>c.getName()===name);if(a.length!==1)throw Error('Expected one clip '+name);return a[0]};
const bodyNode=node('head_2'),mesh=bodyNode.getMesh(),body=mesh.listPrimitives()[0],skin=root.listSkins()[0];
const pos=body.getAttribute('POSITION'),normal=body.getAttribute('NORMAL'),indices=body.getIndices(),joints=body.getAttribute('JOINTS_0'),weights=body.getAttribute('WEIGHTS_0');
const nodes=skin.listJoints(),names=nodes.map(n=>n.getName()),count=pos.getCount(),OLD=body.listTargets().length,NEW=OLD+2;
if(nodes.length!==22||OLD!==24||mesh.getWeights().length!==OLD||root.listAnimations().length!==49)throw Error('Unexpected source model structure');
if(body.getAttribute('_VOLUME_LAST_POSITION')||body.getAttribute('_VOLUME_LAST_NORMAL'))throw Error('Comparison attributes already exist');
body.setAttribute('_VOLUME_LAST_POSITION',pos);body.setAttribute('_VOLUME_LAST_NORMAL',normal);
const packed=a=>{const out=new Float32Array(count*3);for(let i=0;i<count;i++)out.set(a.getElement(i,[]),3*i);return out};
const base=packed(pos),baseNormal=packed(normal),J=Array.from({length:count},(_,i)=>joints.getElement(i,[])),W=Array.from({length:count},(_,i)=>weights.getElement(i,[]));
const originalMorph=body.listTargets().map(t=>{const a=t.getAttribute('POSITION');return a?packed(a):new Float32Array(count*3)});
const originalNormalMorph=body.listTargets().map(t=>{const a=t.getAttribute('NORMAL');return a?packed(a):new Float32Array(count*3)});
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)},gauss=x=>Math.exp(-x*x);

// Transport the original authored split normals by the area-weighted face
// normal change; keep distinct UV/hard-normal splits. The inputs are detached
// packed arrays, not writable views of interleaved glTF skin attributes.
function normalDelta(position,norm,delta){
 const groups=new Map(),ids=new Int32Array(count);let size=0;
 for(let i=0;i<count;i++){
  const k=3*i,key=[...Array.from(position.subarray(k,k+3),v=>Math.round(v*1e6)),...Array.from(norm.subarray(k,k+3),v=>Math.round(v*100))].join(',');
  if(!groups.has(key))groups.set(key,size++);ids[i]=groups.get(key);
 }
 const before=new Float64Array(size*3),after=new Float64Array(size*3);
 for(let i=0;i<indices.getCount();i+=3){
  const tri=[0,1,2].map(j=>indices.getScalar(i+j));
  const a=tri.map(j=>new Vector3().fromArray(position,3*j));
  const b=tri.map(j=>new Vector3().fromArray(position,3*j).add(new Vector3().fromArray(delta,3*j)));
  const u=a[1].clone().sub(a[0]).cross(a[2].clone().sub(a[0])),v=b[1].clone().sub(b[0]).cross(b[2].clone().sub(b[0]));
  for(const j of tri){const k=3*ids[j];before[k]+=u.x;before[k+1]+=u.y;before[k+2]+=u.z;after[k]+=v.x;after[k+1]+=v.y;after[k+2]+=v.z}
 }
 const out=new Float32Array(count*3);
 for(let i=0;i<count;i++){
  const k=3*i,a=new Vector3().fromArray(before,3*ids[i]).normalize(),b=new Vector3().fromArray(after,3*ids[i]).normalize();
  if(a.distanceToSquared(b)<1e-24)continue;
  const n=new Vector3().fromArray(norm,k),d=n.clone().add(b.sub(a)).normalize().sub(n);d.toArray(out,k);
 }
 return out;
}

// The screenshot shows a narrow waist against the chest and pelvis. Gently
// broaden it and add at most 8 mm at the abdominal front. Do not modify the
// gluteal base surface: tested changes there did not reliably fix its fold.
const waist=new Float32Array(count*3);let moved=0,waistMax=0;
for(let i=0;i<count;i++){
 const k=3*i,x=base[k],y=base[k+1],z=base[k+2],ax=Math.abs(x);
 const torso=J[i].reduce((sum,j,t)=>sum+(/^Rig_(Hips|Spine|Chest)$/.test(names[j])?W[i][t]:0),0);
 const gate=gauss((y-1.17)/.115)*smooth(1.0,1.06,y)*(1-smooth(1.30,1.36,y))*smooth(.55,.9,torso);
 waist[k]=(x<0?-1:1)*.020*gate*smooth(.07,.13,ax)*(1-smooth(.18,.24,ax));
 waist[k+2]=.008*gate*smooth(.03,.085,z)*(1-smooth(.12,.21,ax));
 const d=Math.hypot(waist[k],waist[k+2]);if(d>.001)moved++;waistMax=Math.max(waistMax,d);
}
if(moved<150||moved>500||waistMax>.022)throw Error(`Unexpected waist sculpt ${moved}/${waistMax}`);
const shaped=Float32Array.from(base,(v,i)=>v+waist[i]),waistNormals=normalDelta(base,baseNormal,waist),shapedNormal=Float32Array.from(baseNormal,(v,i)=>v+waistNormals[i]);
body.setAttribute('POSITION',doc.createAccessor('Volume_waist_position',buffer).setType(Accessor.Type.VEC3).setArray(shaped));
body.setAttribute('NORMAL',doc.createAccessor('Volume_waist_normal',buffer).setType(Accessor.Type.VEC3).setArray(shapedNormal));

// Fit a modestly weighted DQ-vs-linear correction from representative deep
// crouch poses. The final asset is normal linear skinning plus morphs; no DQ
// shader or runtime dependency is required. The mask covers the knee region,
// falls off smoothly by the lower thigh, and leaves the posterior pelvis alone.
const bones=new Map(nodes.map(n=>{const b=new Bone();b.name=n.getName();b.position.fromArray(n.getTranslation());b.quaternion.fromArray(n.getRotation());b.scale.fromArray(n.getScale());return [b.name,b]}));
for(const n of nodes){const parent=n.getParentNode()?.getName();if(bones.has(parent))bones.get(parent).add(bones.get(n.getName()))}
const rig=bones.get('Rig_Root'),inverse=nodes.map((_,i)=>new Matrix4().fromArray(skin.getInverseBindMatrices().getElement(i,[])));
function pose(animation,frame){
 for(const n of nodes){const b=bones.get(n.getName());b.position.fromArray(n.getTranslation());b.quaternion.fromArray(n.getRotation());b.scale.fromArray(n.getScale())}
 let morph=null;
 for(const c of animation.listChannels()){
  const n=c.getTargetNode().getName(),target=c.getTargetPath(),sampler=c.getSampler(),out=sampler.getOutput();
  if(sampler.getInterpolation()!=='LINEAR'||sampler.getInput().getCount()!==121)throw Error('Unexpected crouch sampling '+animation.getName());
  if(n==='head_2'&&target==='weights'){morph=Array.from(out.getArray().subarray(frame*OLD,(frame+1)*OLD));continue}
  const b=bones.get(n);if(!b)continue;
  if(target==='rotation')b.quaternion.fromArray(out.getElement(frame,[])).normalize();
  else if(target==='translation')b.position.fromArray(out.getElement(frame,[]));
  else throw Error('Unexpected pose channel '+n+'/'+target);
 }
 if(morph?.length!==OLD)throw Error('Missing crouch morph weights');
 rig.updateMatrixWorld(true);return {morph,mats:nodes.map((n,i)=>new Matrix4().multiplyMatrices(bones.get(n.getName()).matrixWorld,inverse[i]))};
}
function sampled(side,animation,frame){
 const {morph,mats}=pose(animation,frame),rotations=mats.map(m=>new Quaternion().setFromRotationMatrix(m).normalize());
 const duals=mats.map((m,i)=>{const t=new Vector3().setFromMatrixPosition(m),q=new Quaternion(t.x,t.y,t.z,0).multiply(rotations[i]);return [q.x*.5,q.y*.5,q.z*.5,q.w*.5]});
 const sign=side==='L'?1:-1,delta=new Float32Array(count*3);let max=0,minDet=1;
 for(let i=0;i<count;i++){
  const k=3*i,x=base[k],y=base[k+1],z=base[k+2];let influence=0;
  for(let j=0;j<4;j++)if(['Rig_Thigh_'+side,'Rig_Shin_'+side].includes(names[J[i][j]]))influence+=W[i][j];
  const mask=smooth(.22,.35,y)*(1-smooth(.63,.72,y))*smooth(.04,.4,influence)*smooth(.005,.04,sign*x);if(mask<1e-6)continue;
  const linear=new Matrix4();linear.elements.fill(0);let real=[0,0,0,0],dual=[0,0,0,0],first=null;
  for(let j=0;j<4;j++){
   const n=J[i][j],weight=W[i][j];if(!weight)continue;
   const q=rotations[n];if(!first)first=q;const f=first.dot(q)<0?-weight:weight,qa=q.toArray();
   for(let t=0;t<4;t++){real[t]+=f*qa[t];dual[t]+=f*duals[n][t]}
   for(let t=0;t<16;t++)linear.elements[t]+=weight*mats[n].elements[t];
  }
  const length=Math.hypot(...real);if(length<1e-8)throw Error('Degenerate quaternion blend');
  real=real.map(v=>v/length);dual=dual.map(v=>v/length);const dot=real.reduce((s,v,j)=>s+v*dual[j],0);dual=dual.map((v,j)=>v-dot*real[j]);
  const qr=new Quaternion(...real),tr=new Quaternion(...dual).multiply(qr.clone().conjugate()),point=new Vector3(x,y,z);
  for(let j=0;j<OLD;j++)if(morph[j])point.addScaledVector(new Vector3().fromArray(originalMorph[j],k),morph[j]);
  const desired=point.clone().applyQuaternion(qr).add(new Vector3(tr.x*2,tr.y*2,tr.z*2)),current=point.clone().applyMatrix4(linear),mat=new Matrix3().setFromMatrix4(linear),det=mat.determinant();
  minDet=Math.min(minDet,det);if(det<.06)throw Error('Degenerate skin blend '+det);
  const change=desired.sub(current).applyMatrix3(mat.invert()).multiplyScalar(mask);max=Math.max(max,change.length());
  if(change.length()>.14)throw Error('Unexpectedly large fitted correction');change.toArray(delta,k);
 }
 return {delta,max,minDet};
}
const shapes=[],fit=[];
for(const side of ['L','R']){
 const sum=new Float64Array(count*3);let total=0,maxSample=0,minDet=1;
 for(const [animation,frames] of [['Deep_Crouch_Walk',Array.from({length:16},(_,i)=>i*7)],['Deep_Crouch_Idle',[0,30,60,90]]])for(const frame of frames){
  const result=sampled(side,clip(animation),frame);for(let k=0;k<sum.length;k++)sum[k]+=result.delta[k];total++;maxSample=Math.max(maxSample,result.max);minDet=Math.min(minDet,result.minDet);
 }
 const delta=Float32Array.from(sum,v=>v/total);let maxAverage=0,changed=0;
 for(let i=0;i<count;i++){const size=Math.hypot(...delta.subarray(3*i,3*i+3));maxAverage=Math.max(maxAverage,size);if(size>.001)changed++}
 if(total!==20||maxAverage>.09||changed<40)throw Error('Unexpected fitted knee '+side);
 shapes.push(delta);fit.push({side,samples:total,verticesOver1mm:changed,maxSampleMetres:maxSample,maxAverageRestMetres:maxAverage,minSkinDeterminant:minDet});
}
// The bind-pose normal difference exaggerated a dark patch on the knees when
// bent. Fit the normals to the posed surface change instead, without changing
// the position morphs. Like the position fit, this is only an approximation.
const strength=.75;
const normalFit=fitKneeNormals({base,baseNormal,shaped,shapedNormal,oldPositionMorph:originalMorph,oldNormalMorph:originalNormalMorph,
 indices,J,W,shapes,pose,strength,samples:[
  [clip('Deep_Crouch_Walk'),Array.from({length:16},(_,i)=>Math.round(i*120/16))],
  [clip('Deep_Crouch_Idle'),[0,30,60,90]],
 ]});
for(let i=0;i<shapes.length;i++){
 const name='Crouch_Volume_'+(i?'R':'L'),delta=shapes[i],dn=normalFit.normals[i];
 body.addTarget(doc.createPrimitiveTarget(name)
  .setAttribute('POSITION',doc.createAccessor(name+'_position',buffer).setType(Accessor.Type.VEC3).setArray(delta))
  .setAttribute('NORMAL',doc.createAccessor(name+'_normal',buffer).setType(Accessor.Type.VEC3).setArray(dn)));
}
mesh.setWeights([...mesh.getWeights(),0,0]);
// Every original track retains its exact first 24 weights and receives zeros
// for the new shapes. Existing original clips, including deep crouch, remain.
let padded=0;
for(const a of root.listAnimations())for(const c of a.listChannels())if(c.getTargetNode()===bodyNode&&c.getTargetPath()==='weights'){
 const sam=c.getSampler(),data=sam.getOutput().getArray(),frames=sam.getInput().getCount();
 if(data.length!==frames*OLD||sam.getInterpolation()!=='LINEAR')throw Error('Unexpected existing morph track '+a.getName());
 const out=new Float32Array(frames*NEW);for(let f=0;f<frames;f++)out.set(data.subarray(f*OLD,(f+1)*OLD),f*NEW);
 sam.setOutput(doc.createAccessor(a.getName()+'_Weights26',buffer).setType(Accessor.Type.SCALAR).setArray(out));padded++;
}
const added=[];
for(const [oldName,newName] of [['Deep_Crouch_Walk','Volume_Crouch_Walk'],['Deep_Crouch_Idle','Volume_Crouch_Idle']]){
 if(root.listAnimations().some(a=>a.getName()===newName))throw Error('Duplicate trial animation');
 const source=clip(oldName),a=doc.createAnimation(newName);let tracks=0;
 for(const c of source.listChannels()){
  const old=c.getSampler();let out=old.getOutput();
  if(c.getTargetNode()===bodyNode&&c.getTargetPath()==='weights'){
   const values=Float32Array.from(out.getArray()),frames=old.getInput().getCount();
   for(let f=0;f<frames;f++){values[f*NEW+OLD]=strength;values[f*NEW+OLD+1]=strength}
   out=doc.createAccessor(newName+'_weights',buffer).setType(Accessor.Type.SCALAR).setArray(values);tracks++;
  }
  const sam=doc.createAnimationSampler().setInput(old.getInput()).setOutput(out).setInterpolation(old.getInterpolation());
  a.addSampler(sam).addChannel(doc.createAnimationChannel().setTargetNode(c.getTargetNode()).setTargetPath(c.getTargetPath()).setSampler(sam));
 }
 if(tracks!==1)throw Error('Expected one crouch body-weight track');added.push(newName);
}
// Preserve deliberately blank inherited target names through NodeIO.
const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
for(const n of json.nodes.filter(n=>n.mesh!==undefined)){
 const oldNames=json.meshes[n.mesh].extras?.targetNames;if(!oldNames)continue;
 const targets=node(n.name).getMesh().listPrimitives()[0].listTargets();if(targets.length!==oldNames.length+(n.name==='head_2'?2:0))throw Error('Morph target mismatch');
 oldNames.forEach((name,i)=>targets[i].setName(name));
}
for(const a of [shaped,shapedNormal,...shapes])if(!Array.from(a).every(Number.isFinite))throw Error('Nonfinite output geometry');
// Many inherited comparison attributes would exceed glTF's maximum stride if
// interleaved, so use separate buffer views (as in the immediately prior trial).
const result=Buffer.from(await new NodeIO().setVertexLayout(VertexLayout.SEPARATE).writeBinary(doc));
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,result);
console.log(JSON.stringify({sourceSha256:SOURCE_SHA,outputSha256:hash(result),bytes:result.length,
 waist:{movedOver1mm:moved,maxDisplacementMetres:waistMax,sideAmplitudeMetres:.020,frontAmplitudeMetres:.008},
 knee:{strength,fit,normalFit:normalFit.info,source:'20 representative walk/idle samples per side',preservedFoldMorph:'Deep_Knee_Fold'},
 animations:{originalCount:49,newClips:added,paddedMorphTracks:padded,originalBoneKeys:'unchanged'},
 comparison:'exact latest base positions and normals embedded; original clips and skin retained',posterior:'unchanged; fold unresolved'},null,2));
