// Follow-up to the physically reviewed gait-polish trial. The original GLB is
// never overwritten. All old animation keys and all skin weights are retained.
// The only new cycle lowers the walking upper arms. Four local corrective
// morphs protect the underarms as those arms are brought closer to the body.
import {Accessor,NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {Bone,Matrix3,Matrix4,Quaternion,Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../..'),OWN=path.join(ROOT,'work/male-torso-relaxed');
const SOURCE_SHA='68d015f8e3e603ddfd912a1b0aca68ac8c743724193e51b8ed82b262f28fee37';
const hash=b=>createHash('sha256').update(b).digest('hex');
if(process.argv.length!==4)throw Error('Usage: node author.mjs previous.glb trial.glb');
const input=path.resolve(process.argv[2]),output=path.resolve(process.argv[3]);
if(input===output||(output.startsWith(ROOT+path.sep)&&!output.startsWith(OWN+path.sep)))throw Error('Refusing to overwrite a previous artifact');
const bytes=fs.readFileSync(input);if(hash(bytes)!==SOURCE_SHA)throw Error('Unexpected previous model');
const doc=await new NodeIO().readBinary(bytes),root=doc.getRoot(),buffer=root.listBuffers()[0];
const node=name=>{const xs=root.listNodes().filter(n=>n.getName()===name);if(xs.length!==1)throw Error('Expected one node '+name);return xs[0]};
const clip=name=>{const xs=root.listAnimations().filter(a=>a.getName()===name);if(xs.length!==1)throw Error('Expected one clip '+name);return xs[0]};
const channel=(a,name,kind='rotation')=>{const xs=a.listChannels().filter(c=>c.getTargetNode().getName()===name&&c.getTargetPath()===kind);if(xs.length!==1)throw Error(`Missing channel ${a.getName()} ${name}/${kind}`);return xs[0]};
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)},gauss=x=>Math.exp(-x*x);
const bodyNode=node('head_2'),mesh=bodyNode.getMesh(),body=mesh.listPrimitives()[0],p=body.getAttribute('POSITION'),normal=body.getAttribute('NORMAL'),joints=body.getAttribute('JOINTS_0'),weights=body.getAttribute('WEIGHTS_0'),index=body.getIndices(),count=p.getCount();
const skin=root.listSkins()[0],skinNodes=skin.listJoints(),names=skinNodes.map(n=>n.getName()),previousTargets=body.listTargets(),targetCount=previousTargets.length;
if(root.listSkins().length!==1||names.length!==22||targetCount!==20||mesh.getWeights().length!==20||root.listAnimations().length!==48)throw Error('Unexpected previous rig');
const identity=new Matrix4().elements;if(bodyNode.getWorldMatrix().some((x,i)=>Math.abs(x-identity[i])>1e-7))throw Error('Unexpected body transform');
const packed=(attribute,width)=>{const out=new Float32Array(count*width);for(let i=0;i<count;i++)out.set(attribute.getElement(i,[]),i*width);return out};
const before=packed(p,3),beforeNormal=packed(normal,3),shaped=Float32Array.from(before);
body.setAttribute('_TORSO_OLD_POSITION',doc.createAccessor('Torso_previous_positions',buffer).setType(Accessor.Type.VEC3).setArray(before));
body.setAttribute('_TORSO_OLD_NORMAL',doc.createAccessor('Torso_previous_normals',buffer).setType(Accessor.Type.VEC3).setArray(beforeNormal));
const olderPosition=body.getAttribute('_POLISH_OLD_POSITION');if(!olderPosition||olderPosition.getCount()!==count)throw Error('Missing pre-polish surface');
const surfaceBones=new Set(['Rig_Hips','Rig_Spine','Rig_Chest','Rig_Thigh_L','Rig_Thigh_R'].map(n=>names.indexOf(n)));
let moved=0,maxDistance=0,frontChanged=0,rearChanged=0;
for(let i=0;i<count;i++){
 const k=3*i,x=before[k],y=before[k+1],z=before[k+2],ax=Math.abs(x),js=joints.getElement(i,[]),ws=weights.getElement(i,[]);
 const surfaceWeight=js.reduce((s,j,q)=>s+(surfaceBones.has(j)?ws[q]:0),0);
 // Weight and height gates leave the face, hands and lower legs exactly alone.
 const window=smooth(.70,.76,y)*(1-smooth(1.43,1.50,y))*smooth(.65,.90,surfaceWeight);
 if(window===0)continue;
 const front=smooth(.025,.09,z),side=1-smooth(.15,.205,ax),back=smooth(-.015,.045,-z);
 // Raise the visual chest mass gradually, rather than adding a rounded shelf;
 // blend the lower rib/abdomen in toward it without exaggerated definition.
 const chest=.016*gauss((y-1.345)/.148)*side*front;
 const abdomen=.022*gauss((y-1.195)/.112)*side*front;
 // Broad, paired posterior-pelvis volume, tapered into the upper thigh. Remove
 // the last trial's small central experiment first, only within this mask.
 const old=olderPosition.getElement(i,[]);
 const rump=.060*gauss((ax-.085)/.085)*gauss((y-.880)/.110)*back;
 const lift=.013*gauss((ax-.09)/.09)*gauss((y-.845)/.095)*back;
 const crease=.006*gauss(x/.035)*gauss((y-.93)/.07)*back;
 const dy=window*(old[1]-y+lift),dz=window*(old[2]-z+chest-abdomen-rump+crease);
 shaped[k+1]+=dy;shaped[k+2]+=dz;
 const distance=Math.hypot(dy,dz);if(distance>.001){moved++;if(chest+abdomen>.001)frontChanged++;if(rump>.001)rearChanged++}maxDistance=Math.max(maxDistance,distance);
}
if(moved<400||maxDistance>.055)throw Error(`Unexpected torso selection: ${moved} / ${maxDistance}`);

// Transport the authored smooth normals by the area-weighted change in local
// faces, keeping the same UV splits and deliberate authored normal seams.
function normalGroups(position,normal){const groups=new Map(),ids=new Uint32Array(count);let size=0;for(let i=0;i<count;i++){const k=3*i,key=[...Array.from(position.subarray(k,k+3),v=>Math.round(v*1e6)),...Array.from(normal.subarray(k,k+3),v=>Math.round(v*100))].join(',');if(!groups.has(key))groups.set(key,size++);ids[i]=groups.get(key)}return {ids,size}}
function changedNormals(base,baseNormal,delta,asDelta=false){
 const {ids,size}=normalGroups(base,baseNormal),oldFaces=new Float64Array(size*3),newFaces=new Float64Array(size*3);
 for(let i=0;i<index.getCount();i+=3){
  const tri=[0,1,2].map(j=>index.getScalar(i+j)),v=(j,changed)=>new Vector3(base[3*j]+(changed?delta[3*j]:0),base[3*j+1]+(changed?delta[3*j+1]:0),base[3*j+2]+(changed?delta[3*j+2]:0));
  const a=tri.map(j=>v(j,false)),b=tri.map(j=>v(j,true)),u=a[1].clone().sub(a[0]).cross(a[2].clone().sub(a[0])),w=b[1].clone().sub(b[0]).cross(b[2].clone().sub(b[0]));
  for(const j of tri){const k=3*ids[j];oldFaces[k]+=u.x;oldFaces[k+1]+=u.y;oldFaces[k+2]+=u.z;newFaces[k]+=w.x;newFaces[k+1]+=w.y;newFaces[k+2]+=w.z}
 }
 const out=new Float32Array(count*3);for(let i=0;i<count;i++){
  const k=3*ids[i],a=new Vector3().fromArray(oldFaces,k).normalize(),b=new Vector3().fromArray(newFaces,k).normalize(),n=new Vector3().fromArray(baseNormal,3*i),corrected=n.clone().add(b.sub(a)).normalize();
  if(asDelta)corrected.sub(n);corrected.toArray(out,3*i);
 }return out;
}
const sculptDelta=Float32Array.from(shaped,(v,i)=>v-before[i]),shapedNormal=changedNormals(before,beforeNormal,sculptDelta);
body.setAttribute('POSITION',doc.createAccessor('Torso_positions',buffer).setType(Accessor.Type.VEC3).setArray(shaped));
body.setAttribute('NORMAL',doc.createAccessor('Torso_normals',buffer).setType(Accessor.Type.VEC3).setArray(shapedNormal));

// Add one walk; keep the previous walk and run in place for exact comparison.
const previousWalk=clip('Polish_Walk');clip('Polish_Run');
if(root.listAnimations().some(a=>a.getName()==='Torso_Walk'))throw Error('New walk already exists');
const walk=doc.createAnimation('Torso_Walk');
for(const c of previousWalk.listChannels()){
 const old=c.getSampler(),s=doc.createAnimationSampler().setInput(old.getInput()).setOutput(old.getOutput()).setInterpolation(old.getInterpolation());
 walk.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(c.getTargetNode()).setTargetPath(c.getTargetPath()).setSampler(s));
}
const ARM_DEGREES=10;
for(const side of ['L','R']){
 const name='Rig_UpperArm_'+side,s=channel(walk,name).getSampler(),source=s.getOutput(),N=source.getCount(),out=new Float32Array(4*N);let last;
 for(let i=0;i<N;i++){
  const q=new Quaternion().fromArray(source.getElement(i,[])).normalize(),angle=(side==='L'?-1:1)*ARM_DEGREES*Math.PI/180;
  q.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),angle)).normalize();
  if(last&&last.dot(q)<0)q.set(-q.x,-q.y,-q.z,-q.w);q.toArray(out,4*i);last=q;
 }
 out.set(out.subarray(0,4),4*(N-1));s.setOutput(doc.createAccessor('Torso_Walk_'+name,buffer).setType(Accessor.Type.VEC4).setArray(out));
}

// The narrow shoulder pose can make opposite surfaces of the original underarm
// mesh cross. At every walk key compute a reference: retain the former wider
// pose only in a small, smoothly tapered underarm patch, while the arm itself
// follows the lower keys. Convert the posed correction back to bind space.
// Four deterministic PCA targets encode that time-varying patch as standard
// glTF morphs. They are zero in every other animation, including the liked run.
const bones=new Map();for(const n of skinNodes){const b=new Bone();b.name=n.getName();b.position.fromArray(n.getTranslation());b.quaternion.fromArray(n.getRotation());b.scale.fromArray(n.getScale());bones.set(b.name,b)}
for(const n of skinNodes){const parent=n.getParentNode()?.getName();if(bones.has(parent))bones.get(parent).add(bones.get(n.getName()))}
const skeletonRoot=bones.get('Rig_Root'),inverse=skinNodes.map((_,i)=>new Matrix4().fromArray(skin.getInverseBindMatrices().getElement(i,[])));
const walkWeights=channel(walk,'head_2','weights').getSampler(),values=walkWeights.getOutput().getArray(),frames=walkWeights.getInput().getCount();
if(values.length!==frames*targetCount)throw Error('Unexpected walk morph keys');
const sites=[];for(let i=0;i<count;i++){
 const point=Array.from(shaped.subarray(3*i,3*i+3)),ax=Math.abs(point[0]),y=point[1],js=joints.getElement(i,[]),ws=weights.getElement(i,[]);
 const mask=smooth(.10,.14,ax)*(1-smooth(.18,.23,ax))*smooth(1.24,1.30,y)*(1-smooth(1.39,1.45,y));
 const armWeight=js.reduce((sum,j,k)=>sum+(/^Rig_(UpperArm|Forearm|Hand)_[LR]$/.test(names[j])?ws[k]:0),0);
 if(mask>1e-5&&armWeight>1e-6)sites.push({i,point,js,ws,mask});
}
if(sites.length<200||sites.length>700)throw Error('Unexpected underarm selection');
const morphPositions=previousTargets.map(t=>t.getAttribute('POSITION'));
function pose(animation,frame){
 for(const c of animation.listChannels()){
  const b=bones.get(c.getTargetNode().getName()),kind=c.getTargetPath();if(!b)continue;
  const data=c.getSampler().getOutput().getElement(frame,[]);
  if(kind==='rotation')b.quaternion.fromArray(data).normalize();else if(kind==='translation')b.position.fromArray(data);else throw Error('Unexpected bone animation path');
 }
 skeletonRoot.updateMatrixWorld(true);return skinNodes.map((n,i)=>new Matrix4().multiplyMatrices(bones.get(n.getName()).matrixWorld,inverse[i]));
}
const frameDeltas=[];
for(let f=0;f<frames;f++){
 const wide=pose(previousWalk,f),narrow=pose(walk,f),delta=new Float64Array(3*sites.length);
 for(let a=0;a<sites.length;a++){
  const {i,point,js,ws,mask}=sites[a],local=new Vector3().fromArray(point);
  for(let t=0;t<targetCount;t++){const value=values[f*targetCount+t];if(value&&morphPositions[t])local.addScaledVector(new Vector3().fromArray(morphPositions[t].getElement(i,[])),value)}
  const displacement=new Vector3(),blend=new Matrix3(),entries=blend.elements;entries.fill(0);
  for(let k=0;k<4;k++)if(ws[k]){
   displacement.add(local.clone().applyMatrix4(wide[js[k]]).sub(local.clone().applyMatrix4(narrow[js[k]])).multiplyScalar(ws[k]));
   const m=new Matrix3().setFromMatrix4(narrow[js[k]]).elements;for(let j=0;j<9;j++)entries[j]+=ws[k]*m[j];
  }
  if(Math.abs(blend.determinant())<.2)throw Error('Singular skin blend');
  displacement.multiplyScalar(mask).applyMatrix3(blend.invert()).toArray(delta,3*a);
 }
 frameDeltas.push(delta);
}
const dot=(a,b)=>{let sum=0;for(let i=0;i<a.length;i++)sum+=a[i]*b[i];return sum};
const gram=Array.from({length:frames},()=>new Float64Array(frames));for(let i=0;i<frames;i++)for(let j=0;j<=i;j++)gram[i][j]=gram[j][i]=dot(frameDeltas[i],frameDeltas[j]);
const total=gram.reduce((s,row,i)=>s+row[i],0),basis=[];if(total<=0)throw Error('Empty underarm fit');
for(let c=0;c<4;c++){
 let u=Float64Array.from({length:frames},(_,i)=>Math.sin((i+1)*(c+1)*1.789)+.13*Math.cos((i+2)*(c+2)));
 for(let iteration=0;iteration<400;iteration++){
  const v=new Float64Array(frames);for(let i=0;i<frames;i++)for(let j=0;j<frames;j++)v[i]+=gram[i][j]*u[j];
  for(const b of basis){const projection=dot(v,b.u);for(let i=0;i<frames;i++)v[i]-=projection*b.u[i]}
  const length=Math.sqrt(dot(v,v));if(length<1e-16)throw Error('Degenerate underarm fit');for(let i=0;i<frames;i++)v[i]/=length;
  const similarity=Math.abs(dot(v,u)/Math.sqrt(dot(u,u)));u=v;if(1-similarity<1e-13)break;
 }
 let variance=0;for(let i=0;i<frames;i++)for(let j=0;j<frames;j++)variance+=u[i]*gram[i][j]*u[j];
 const scale=Math.max(...u.map(Math.abs)),amount=Array.from(u,x=>x/scale),delta=new Float32Array(count*3);
 for(let i=0;i<sites.length;i++)for(let k=0;k<3;k++){let value=0;for(let f=0;f<frames;f++)value+=u[f]*frameDeltas[f][3*i+k]*scale;delta[3*sites[i].i+k]=value}
 if(Math.abs(amount[0]-amount.at(-1))>1e-4)throw Error('Non-periodic underarm fit');amount[frames-1]=amount[0];basis.push({u,variance,amount,delta});
}
const explained=basis.reduce((s,b)=>s+b.variance,0)/total;let maxResidual=0,rmsSquared=0,maxCorrection=0;
for(let f=0;f<frames;f++)for(let i=0;i<sites.length;i++){
 const approx=[0,1,2].map(k=>basis.reduce((sum,b)=>sum+b.amount[f]*b.delta[3*sites[i].i+k],0));
 const error=Math.hypot(...approx.map((v,k)=>v-frameDeltas[f][3*i+k]));maxResidual=Math.max(maxResidual,error);rmsSquared+=error*error;maxCorrection=Math.max(maxCorrection,Math.hypot(...approx));
}
const rmsResidual=Math.sqrt(rmsSquared/(frames*sites.length));
if(explained<.999||maxResidual>.001||maxCorrection>.055)throw Error('Underarm fit failed quality bounds');
for(const [i,b] of basis.entries()){
 const name='Walk_Underarm_'+(i+1),dn=changedNormals(shaped,shapedNormal,b.delta,true);
 body.addTarget(doc.createPrimitiveTarget().setName(name)
  .setAttribute('POSITION',doc.createAccessor(name+'_position',buffer).setType(Accessor.Type.VEC3).setArray(b.delta))
  .setAttribute('NORMAL',doc.createAccessor(name+'_normal',buffer).setType(Accessor.Type.VEC3).setArray(dn)));
}
mesh.setWeights([...mesh.getWeights(),0,0,0,0]);
// Widen existing tracks, with their first 20 values bit-identical and the four
// added components at zero. Only Torso_Walk receives the corrective weights.
let padded=0;
for(const animation of root.listAnimations())for(const c of animation.listChannels())if(c.getTargetNode()===bodyNode&&c.getTargetPath()==='weights'){
 const s=c.getSampler(),array=s.getOutput().getArray(),N=s.getInput().getCount();if(s.getInterpolation()!=='LINEAR'||array.length!==N*targetCount)throw Error('Unexpected body-weight track');
 const out=new Float32Array(N*(targetCount+4));for(let i=0;i<N;i++){
  out.set(array.subarray(i*targetCount,(i+1)*targetCount),i*(targetCount+4));
  if(animation===walk)basis.forEach((b,j)=>out[i*(targetCount+4)+targetCount+j]=b.amount[i]);
 }
 s.setOutput(doc.createAccessor(animation.getName()+'_BodyWeights24',buffer).setType(Accessor.Type.SCALAR).setArray(out));padded++;
}
// Preserve intentionally blank existing morph-target names through NodeIO.
const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
for(const oldNode of json.nodes.filter(n=>n.mesh!==undefined)){
 const targetNames=json.meshes[oldNode.mesh].extras?.targetNames;if(!targetNames)continue;
 const targets=node(oldNode.name).getMesh().listPrimitives()[0].listTargets();if(targets.length<targetNames.length)throw Error('Missing old target');targetNames.forEach((name,i)=>targets[i].setName(name));
}
for(const array of [shaped,shapedNormal,...basis.map(b=>b.delta)])if(!Array.from(array).every(Number.isFinite))throw Error('Nonfinite geometry');
const result=Buffer.from(await new NodeIO().writeBinary(doc));fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,result);
console.log(JSON.stringify({sourceSha256:SOURCE_SHA,outputSha256:hash(result),bytes:result.length,addedClips:['Torso_Walk'],
 sculpt:{movedOver1mm:moved,maxDisplacementMetres:maxDistance,frontVertices:frontChanged,rearVertices:rearChanged},
 walk:{source:'Polish_Walk (Quaternius Walk_Loop)',upperArmSpreadReductionDegrees:ARM_DEGREES,correctiveTargets:4,underarmSites:sites.length,
  explainedVariance:explained,maxFitResidualMetres:maxResidual,rmsFitResidualMetres:rmsResidual,maxFitCorrectionMetres:maxCorrection},paddedTracks:padded,
 run:{source:'Polish_Run',boneAndPriorMorphKeys:'unchanged'}},null,2));
