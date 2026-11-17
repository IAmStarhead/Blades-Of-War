// Separate follow-up to the last published GLB. The rig, bind mesh, materials,
// skin weights and old animation keys remain intact. Three zero-default morphs
// locally stabilize the torso in a new walk; one gently fills the posterior
// upper arms in a new run. All are standard glTF morph/animation channels.
import {Accessor,NodeIO} from '@gltf-transform/core';
import {Bone,Euler,Matrix3,Matrix4,Quaternion,Vector3} from 'three';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'../..');
const OWN=path.join(ROOT,'work/male-belly-triceps');
const SOURCE_SHA='ed3c99b191e4f8f4cfd2f69bea0584b23faa12da9d2e9128f4842d9419328382';
const sha=b=>createHash('sha256').update(b).digest('hex');
const args=process.argv.slice(2);if(args.length!==2)throw new Error('Usage: node revise.mjs PREVIOUS.glb OUTPUT.glb');
const [input,output]=args.map(p=>path.resolve(p));
if(input===output||(output.startsWith(ROOT+path.sep)&&!output.startsWith(OWN+path.sep)))throw new Error('Refusing to overwrite a previous artifact');
const bytes=fs.readFileSync(input);if(sha(bytes)!==SOURCE_SHA)throw new Error('Unexpected source model');
const io=new NodeIO(),doc=await io.readBinary(bytes),root=doc.getRoot(),buffer=root.listBuffers()[0];
const unique=name=>{const a=root.listNodes().filter(n=>n.getName()===name);if(a.length!==1)throw new Error(`Expected one ${name}`);return a[0]};
const sourceClip=name=>{const a=root.listAnimations().filter(x=>x.getName()===name);if(a.length!==1)throw new Error(`Expected ${name}`);return a[0]};
const walk=sourceClip('Corrected_Walk'),run=sourceClip('Corrected_Run');
const bodyNode=unique('head_2'),mesh=bodyNode.getMesh(),body=mesh.listPrimitives()[0];
const position=body.getAttribute('POSITION'),normal=body.getAttribute('NORMAL'),joints=body.getAttribute('JOINTS_0'),weights=body.getAttribute('WEIGHTS_0');
const skin=root.listSkins()[0],skinNodes=skin.listJoints(),skinIndex=new Map(skinNodes.map((n,i)=>[n.getName(),i]));
if(root.listSkins().length!==1||skinNodes.length!==22||body.listTargets().length!==6||mesh.getWeights().length!==6)throw new Error('Unexpected previous rig');
for(const name of ['Adjusted_Walk','Adjusted_Run'])if(root.listAnimations().some(a=>a.getName()===name))throw new Error(`Clip exists: ${name}`);
const identity=new Matrix4().elements;if(bodyNode.getWorldMatrix().some((x,i)=>Math.abs(x-identity[i])>1e-7))throw new Error('Unexpected body transform');
const count=position.getCount(),basePos=new Float64Array(count*3),baseNormal=new Float64Array(count*3),groups=new Map(),groupOf=new Uint32Array(count);
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
const jointSum=(js,ws,names)=>ws.reduce((sum,w,k)=>sum+(names.includes(js[k])?w:0),0);
const hipIndex=skinIndex.get('Rig_Hips'),spineIndex=skinIndex.get('Rig_Spine'),tricepsDelta=new Float32Array(count*3),bellySites=[];
for(let i=0;i<count;i++){
 const p=position.getElement(i,[]),n=normal.getElement(i,[]),js=joints.getElement(i,[]),ws=weights.getElement(i,[]),[x,y,z]=p;
 basePos.set(p,3*i);baseNormal.set(n,3*i);
 const key=p.join(',')+'|'+n.join(',');let group=groups.get(key);if(group===undefined){group=groups.size;groups.set(key,group)}groupOf[i]=group;
 const torso=jointSum(js,ws,[hipIndex,spineIndex]),band=smooth(.87,.97,y)*(1-smooth(1.10,1.22,y));
 if(torso>1e-7&&band>1e-7)bellySites.push({index:i,p:new Vector3().fromArray(p),j:js,w:ws,band});
 // +Z is the front of this model. A modest tapered displacement on the rear
 // of each upper arm is blended out at the elbow, shoulder and torso.
 const side=x>0?'L':'R',upper=jointSum(js,ws,[skinIndex.get('Rig_UpperArm_'+side)]),
       arm=jointSum(js,ws,['Rig_UpperArm_','Rig_Forearm_','Rig_Shoulder_'].map(prefix=>skinIndex.get(prefix+side)));
 const along=smooth(1.14,1.22,y)*(1-smooth(1.28,1.41,y));
 const back=1-smooth(-.055,.015,z),armOnly=smooth(.70,.98,arm),strength=along*back*upper*armOnly;
 const centerX=.224-.30*(y-1.18),outer=smooth(centerX-.030,centerX+.035,Math.abs(x));
 tricepsDelta[3*i]=Math.sign(x)*.003*strength*outer;
 tricepsDelta[3*i+2]=-.008*strength;
}
if(bellySites.length<200)throw new Error('Unexpected abdomen selection');
// The calculation below uses bind positions. Do not silently omit any of the
// old corrective shapes if a future source happens to affect this region.
for(const target of body.listTargets())for(const site of bellySites){
 const p=target.getAttribute('POSITION')?.getElement(site.index,[])||[0,0,0];
 if(Math.hypot(...p)>1e-8)throw new Error('An old morph affects the abdomen fit');
}

// Smooth the arm displacement across connected surface neighbours, including
// coincident UV splits. This avoids a hard edge on the coarse arm topology.
{
 const byPosition=new Map(),refs=[],members=[],adj=[];
 for(let i=0;i<count;i++){const key=position.getElement(i,[]).join(',');let id=byPosition.get(key);
  if(id===undefined){id=byPosition.size;byPosition.set(key,id);members.push([]);adj.push(new Set())}refs[i]=id;members[id].push(i)}
 const indices=body.getIndices().getArray();for(let i=0;i<indices.length;i+=3){const a=refs[indices[i]],b=refs[indices[i+1]],c=refs[indices[i+2]];
  for(const [x,y] of [[a,b],[b,c],[c,a]])if(x!==y){adj[x].add(y);adj[y].add(x)}}
 let values=members.map(ids=>{const sum=[0,0,0];for(const i of ids)for(let k=0;k<3;k++)sum[k]+=tricepsDelta[3*i+k];return sum.map(x=>x/ids.length)});
 for(let step=0;step<8;step++)values=values.map((v,i)=>{if(!adj[i].size)return v;const sum=[0,0,0];
  for(const j of adj[i])for(let k=0;k<3;k++)sum[k]+=values[j][k];return v.map((x,k)=>.55*x+.45*sum[k]/adj[i].size)});
 for(let i=0;i<count;i++)for(let k=0;k<3;k++)tricepsDelta[3*i+k]=values[refs[i]][k];
}

// Reconstruct the old walk's skeleton at its original keyframes. Construct a
// *reference only*: remove pelvis yaw/roll and retain 15% of spine yaw/roll,
// preserving pitch. The actual skeleton and all limb tracks are NOT changed.
// For each torso vertex, calculate the difference between its original LBS
// pose and the reference hips/spine contributions, fade it toward the edges,
// then map it back through the original blended skin matrix into bind space.
const bones=new Map();for(const node of skinNodes){
 const b=new Bone();b.name=node.getName();b.position.fromArray(node.getTranslation());b.quaternion.fromArray(node.getRotation());
 if(node.getScale().some(x=>Math.abs(x-1)>1e-8))throw new Error('Unexpected bone scale');bones.set(b.name,b);
}
for(const node of skinNodes){const p=node.getParentNode()?.getName();if(bones.has(p))bones.get(p).add(bones.get(node.getName()))}
const skeletonRoot=bones.get('Rig_Root'),hip=bones.get('Rig_Hips'),spine=bones.get('Rig_Spine');
const inverse=skinNodes.map((_,i)=>new Matrix4().fromArray(skin.getInverseBindMatrices().getElement(i,[])));
const channels=walk.listChannels(),weightChannel=channels.find(c=>c.getTargetNode()===bodyNode&&c.getTargetPath()==='weights');
if(!weightChannel)throw new Error('Missing walk morph track');
const frameCount=weightChannel.getSampler().getInput().getCount(),frameDeltas=[];
for(const c of channels)if(c.getSampler().getInput().getCount()!==frameCount)throw new Error('Walk channels are not sampled on the same keys');
for(let frame=0;frame<frameCount;frame++){
 for(const node of skinNodes){const b=bones.get(node.getName());b.position.fromArray(node.getTranslation());b.quaternion.fromArray(node.getRotation())}
 for(const c of channels){const b=bones.get(c.getTargetNode().getName()),p=c.getTargetPath();if(!b||!['rotation','translation'].includes(p))continue;
  (p==='rotation'?b.quaternion:b.position).fromArray(c.getSampler().getOutput().getElement(frame,[]));}
 if(skeletonRoot.quaternion.angleTo(new Quaternion())>1e-7)throw new Error('Unexpected walk root rotation');
 skeletonRoot.updateMatrixWorld(true);
 const old=skinNodes.map((node,i)=>new Matrix4().multiplyMatrices(bones.get(node.getName()).matrixWorld,inverse[i]));
 const hipOriginal=hip.quaternion.clone(),spineWorldOriginal=hipOriginal.clone().multiply(spine.quaternion),e=new Euler().setFromQuaternion(hipOriginal,'YXZ');
 e.y=0;e.z=0;const hipReference=new Quaternion().setFromEuler(e);
 e.setFromQuaternion(spineWorldOriginal,'YXZ');e.y*=.15;e.z*=.15;const spineReference=new Quaternion().setFromEuler(e);
 hip.quaternion.copy(hipReference);spine.quaternion.copy(hipReference.clone().invert().multiply(spineReference));skeletonRoot.updateMatrixWorld(true);
 const hipMatrix=new Matrix4().multiplyMatrices(hip.matrixWorld,inverse[hipIndex]),spineMatrix=new Matrix4().multiplyMatrices(spine.matrixWorld,inverse[spineIndex]);
 const delta=new Float64Array(bellySites.length*3);
 for(let i=0;i<bellySites.length;i++){
  const {p,j,w,band}=bellySites[i],blended=new Matrix4(),be=blended.elements;be.fill(0);
  for(let k=0;k<4;k++)if(w[k])for(let n=0;n<16;n++)be[n]+=w[k]*old[j[k]].elements[n];
  const displacement=new Vector3();for(let k=0;k<4;k++)if(w[k]&&(j[k]===hipIndex||j[k]===spineIndex)){
   const target=j[k]===hipIndex?hipMatrix:spineMatrix;
   displacement.add(p.clone().applyMatrix4(target).sub(p.clone().applyMatrix4(old[j[k]])).multiplyScalar(w[k]*band));
  }
  const transform=new Matrix3().setFromMatrix4(blended);if(Math.abs(transform.determinant())<.2)throw new Error('Singular torso skin blend');
  displacement.applyMatrix3(transform.invert()).toArray(delta,3*i);
 }
 frameDeltas.push(delta);
}

// A rank-three deterministic PCA reproduces the sampled correction compactly
// as three ordinary glTF morph targets and signed keyframe weights. This keeps
// all bones and all non-torso vertices exactly on the original motion. The
// fitted reference and the tapered area are approximations, not a rigid torso.
const dot=(a,b)=>{let sum=0;for(let i=0;i<a.length;i++)sum+=a[i]*b[i];return sum};
const gram=Array.from({length:frameCount},()=>new Float64Array(frameCount));
for(let i=0;i<frameCount;i++)for(let j=0;j<=i;j++)gram[i][j]=gram[j][i]=dot(frameDeltas[i],frameDeltas[j]);
const totalVariance=gram.reduce((sum,row,i)=>sum+row[i],0),basis=[];if(totalVariance<=0)throw new Error('Empty abdomen correction');
for(let component=0;component<3;component++){
 let u=Float64Array.from({length:frameCount},(_,i)=>Math.sin((i+1)*(component+1)*1.789)+.13*Math.cos((i+2)*(component+2)));
 for(let iteration=0;iteration<700;iteration++){
  const v=new Float64Array(frameCount);for(let i=0;i<frameCount;i++)for(let j=0;j<frameCount;j++)v[i]+=gram[i][j]*u[j];
  for(const b of basis){const projection=dot(v,b.u);for(let i=0;i<frameCount;i++)v[i]-=projection*b.u[i]}
  const length=Math.sqrt(dot(v,v));if(length<1e-16)throw new Error('Degenerate abdomen basis');
  for(let i=0;i<frameCount;i++)v[i]/=length;
  const similarity=Math.abs(dot(v,u)/Math.sqrt(dot(u,u)));u=v;if(1-similarity<1e-14)break;
 }
 let variance=0;for(let i=0;i<frameCount;i++)for(let j=0;j<frameCount;j++)variance+=u[i]*gram[i][j]*u[j];
 const scale=Math.max(...u.map(Math.abs)),amount=Array.from(u,x=>x/scale),delta=new Float32Array(count*3);
 if(Math.abs(amount[0]-amount.at(-1))>1e-5)throw new Error('Abdomen reference is not periodic');amount[frameCount-1]=amount[0];
 for(let i=0;i<bellySites.length;i++)for(let k=0;k<3;k++){
  let value=0;for(let f=0;f<frameCount;f++)value+=u[f]*frameDeltas[f][3*i+k]*scale;
  delta[3*bellySites[i].index+k]=value;
 }
 basis.push({u,variance,amount,delta});
}
const explained=basis.reduce((sum,b)=>sum+b.variance,0)/totalVariance;
if(explained<.99)throw new Error(`Abdomen approximation is insufficient: ${explained}`);
let residualSquared=0,maxResidual=0,maxCombined=0;
for(let f=0;f<frameCount;f++)for(let i=0;i<bellySites.length;i++){
 const index=bellySites[i].index,approx=[0,1,2].map(k=>basis.reduce((s,b)=>s+b.amount[f]*b.delta[3*index+k],0));
 const error=Math.hypot(...approx.map((x,k)=>x-frameDeltas[f][3*i+k]));residualSquared+=error*error;maxResidual=Math.max(maxResidual,error);maxCombined=Math.max(maxCombined,Math.hypot(...approx));
}
const rmsResidual=Math.sqrt(residualSquared/(frameCount*bellySites.length));
if(maxCombined>.055||maxResidual>.008)throw new Error(`Unexpected abdomen fit ${maxCombined}/${maxResidual}`);

// Adjust the authored normals by the change in local face normals, preserving
// coincident UV splits with equal original normals and all base normals.
function correctedNormals(delta){
 const before=new Float64Array(groups.size*3),after=new Float64Array(groups.size*3),indices=body.getIndices().getArray();
 function face(a,b,c,withDelta){
  const p=i=>new Vector3(basePos[3*i]+(withDelta?delta[3*i]:0),basePos[3*i+1]+(withDelta?delta[3*i+1]:0),basePos[3*i+2]+(withDelta?delta[3*i+2]:0));
  const A=p(a);return p(b).sub(A).cross(p(c).sub(A));
 }
 for(let i=0;i<indices.length;i+=3){const tri=[indices[i],indices[i+1],indices[i+2]],a=face(...tri,false),b=face(...tri,true);
  for(const j of tri){const k=3*groupOf[j];before[k]+=a.x;before[k+1]+=a.y;before[k+2]+=a.z;after[k]+=b.x;after[k+1]+=b.y;after[k+2]+=b.z}}
 const out=new Float32Array(count*3);let changed=0,maxAngle=0;
 for(let i=0;i<count;i++){
  const k=3*i,g=3*groupOf[i],a=new Vector3().fromArray(before,g),b=new Vector3().fromArray(after,g);
  if(a.distanceToSquared(b)<1e-24||a.lengthSq()<1e-24||b.lengthSq()<1e-24)continue;
  const n=new Vector3().fromArray(baseNormal,k),dn=n.clone().add(b.normalize()).sub(a.normalize()).normalize().sub(n);
  dn.toArray(out,k);if(dn.lengthSq()>1e-14)changed++;maxAngle=Math.max(maxAngle,2*Math.asin(Math.min(1,dn.length()/2))*180/Math.PI);
 }
 return {out,changed,maxAngle};
}
function addTarget(name,delta){
 const n=correctedNormals(delta);let max=0,moved=0;
 for(let i=0;i<delta.length;i+=3){const v=Math.hypot(delta[i],delta[i+1],delta[i+2]);max=Math.max(max,v);if(v>1e-7)moved++}
 if(moved<100||max>.035||n.maxAngle>35)throw new Error(`Unexpected ${name} shape: ${moved}/${max}/${n.maxAngle}`);
 body.addTarget(doc.createPrimitiveTarget().setName(name)
  .setAttribute('POSITION',doc.createAccessor(name+'_POSITION',buffer).setType(Accessor.Type.VEC3).setArray(delta))
  .setAttribute('NORMAL',doc.createAccessor(name+'_NORMAL',buffer).setType(Accessor.Type.VEC3).setArray(n.out)));
 return {name,movedVertices:moved,maxDeltaMetres:max,normalVertices:n.changed,maxNormalAngleDegrees:n.maxAngle};
}
const newTargets=[...basis.map((b,i)=>addTarget('Belly_Stabilizer_'+(i+1),b.delta)),addTarget('Run_Posterior_UpperArms',tricepsDelta)];
mesh.setWeights([...mesh.getWeights(),0,0,0,0]);
// Pad three old body-weight tracks without changing any of their six values.
let paddedTracks=0;
for(const animation of root.listAnimations())for(const channel of animation.listChannels()){
 if(channel.getTargetNode()!==bodyNode||channel.getTargetPath()!=='weights')continue;
 const sampler=channel.getSampler(),input=sampler.getInput(),a=sampler.getOutput().getArray();
 if(sampler.getInterpolation()!=='LINEAR'||a.length!==input.getCount()*6)throw new Error('Unexpected prior body weights');
 const out=new Float32Array(input.getCount()*10);for(let k=0;k<input.getCount();k++)out.set(a.subarray(k*6,k*6+6),k*10);
 sampler.setOutput(doc.createAccessor(animation.getName()+'_BodyWeightsPadded10',buffer).setType(Accessor.Type.SCALAR).setArray(out));paddedTracks++;
}
if(paddedTracks!==3)throw new Error(`Expected three prior body tracks, got ${paddedTracks}`);

// Clone the old cycles using the same bone/time accessors and first six morph
// weights. Only the new, zero-default shape weights differ between the clips.
function addAdjusted(source,name,weightFn){
 const animation=doc.createAnimation(name);for(const channel of source.listChannels()){
  const s=channel.getSampler();let out=s.getOutput();
  if(channel.getTargetNode()===bodyNode&&channel.getTargetPath()==='weights'){
   const old=out.getArray(),values=new Float32Array(old.length);values.set(old);
   for(let i=0;i<s.getInput().getCount();i++){const w=weightFn(i);for(let k=0;k<4;k++)values[i*10+6+k]=w[k]}
   out=doc.createAccessor(name+'_BodyWeights',buffer).setType(Accessor.Type.SCALAR).setArray(values);
  }
  const next=doc.createAnimationSampler().setInput(s.getInput()).setOutput(out).setInterpolation(s.getInterpolation());
  animation.addSampler(next).addChannel(doc.createAnimationChannel().setTargetNode(channel.getTargetNode()).setTargetPath(channel.getTargetPath()).setSampler(next));
 }
}
addAdjusted(walk,'Adjusted_Walk',i=>[...basis.map(b=>b.amount[i]),0]);
addAdjusted(run,'Adjusted_Run',()=>[0,0,0,1]);

// glTF-Transform substitutes numeric names for empty names. Restore the exact
// previous metadata before writing and append names of the four new targets.
const sourceJSON=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
for(const sourceNode of sourceJSON.nodes.filter(n=>n.mesh!==undefined)){
 const names=sourceJSON.meshes[sourceNode.mesh].extras?.targetNames;if(!names)continue;
 const node=unique(sourceNode.name);for(const primitive of node.getMesh().listPrimitives()){
  const targets=primitive.listTargets();if(targets.length<names.length)throw new Error('Missing prior target');names.forEach((name,index)=>targets[index].setName(name));
 }
}
const result=Buffer.from(await io.writeBinary(doc));fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,result);
console.log(JSON.stringify({sourceSha256:SOURCE_SHA,outputSha256:sha(result),bytes:result.length,bones:skinNodes.length,newTargets,paddedTracks,
 belly:{selectedVertices:bellySites.length,sampledKeys:frameCount,explainedVariance:explained,bindSpaceRmsResidualMetres:rmsResidual,
        bindSpaceMaxResidualMetres:maxResidual,maxCombinedBindDeltaMetres:maxCombined,spineYawRollFactor:.15},
 clips:['Adjusted_Walk','Adjusted_Run'],allAnimations:root.listAnimations().map(a=>a.getName())},null,2));
