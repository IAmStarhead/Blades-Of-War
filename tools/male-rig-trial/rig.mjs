// Experimental, non-destructive skeletal binding for the approved-looking
// static male. Original geometry/materials are retained; only skin attributes,
// a bone hierarchy, and short test animations are added to the copy.
import {Accessor,NodeIO} from '@gltf-transform/core';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const EXPECTED_INPUT='009275f703e22426139908f03c44e52a52cc52f20b9f3d6e12fb39ae1285075e';
const args=process.argv.slice(2);
if(args.length!==2)throw new Error('Usage: node rig.mjs INPUT.glb NEW_RIGGED.glb');
const [input,output]=args.map(p=>path.resolve(p));
if(input===output)throw new Error('Refusing to overwrite source');
const sha=data=>createHash('sha256').update(data).digest('hex');
const bytes=await fs.readFile(input);if(sha(bytes)!==EXPECTED_INPUT)throw new Error('Input is not the confirmed nape-smoothing trial');
const io=new NodeIO(),doc=await io.readBinary(bytes),root=doc.getRoot(),buffer=root.listBuffers()[0];
if(root.listSkins().length||root.listAnimations().length)throw new Error('Expected a static source');
const named=name=>{const nodes=root.listNodes().filter(n=>n.getName()===name);if(nodes.length!==1)throw new Error(`Expected one ${name} node`);return nodes[0]};
const body=named('head_2'),head=named('head_1');
const bodyPrimitive=body.getMesh().listPrimitives()[0],headPrimitive=head.getMesh().listPrimitives()[0];
if(bodyPrimitive.getAttribute('POSITION').getCount()!==10920||headPrimitive.getAttribute('POSITION').getCount()!==4883)
 throw new Error('Unexpected source topology');

// Positions are in model coordinates at the bind pose. No orientation is
// baked into the joints, making the deliberately simple test rig readable.
const definitions=[
 ['Rig_Root',null,[0,0,0]],
 ['Rig_Hips','Rig_Root',[0,.91,-.01]],
 ['Rig_Spine','Rig_Hips',[0,1.10,-.01]],
 ['Rig_Chest','Rig_Spine',[0,1.32,-.015]],
 ['Rig_Neck','Rig_Chest',[0,1.50,-.022]],
 ['Rig_Head','Rig_Neck',[0,1.60,-.025]],
];
for(const [side,sign] of [['L',1],['R',-1]])definitions.push(
 [`Rig_Shoulder_${side}`,'Rig_Chest',[sign*.145,1.43,-.025]],
 [`Rig_UpperArm_${side}`,`Rig_Shoulder_${side}`,[sign*.195,1.39,-.025]],
 [`Rig_Forearm_${side}`,`Rig_UpperArm_${side}`,[sign*.245,1.18,-.035]],
 [`Rig_Hand_${side}`,`Rig_Forearm_${side}`,[sign*.255,.99,.015]],
 [`Rig_Thigh_${side}`,'Rig_Hips',[sign*.10,.87,-.005]],
 [`Rig_Shin_${side}`,`Rig_Thigh_${side}`,[sign*.11,.49,-.065]],
 [`Rig_Foot_${side}`,`Rig_Shin_${side}`,[sign*.125,.12,-.075]],
 [`Rig_Toes_${side}`,`Rig_Foot_${side}`,[sign*.125,.045,.07]],
);
const bones=new Map(),boneInfo=new Map();
for(const [name,parent,world] of definitions){
 const parentWorld=parent?boneInfo.get(parent).world:[0,0,0],local=world.map((v,i)=>v-parentWorld[i]);
 const node=doc.createNode(name).setTranslation(local);bones.set(name,node);boneInfo.set(name,{name,parent,world,local});
 if(parent)bones.get(parent).addChild(node);
}
// The source's long chain of identity grouping nodes is not needed for the
// animated meshes. Put the skin nodes and skeleton at the scene root, as
// glTF requires for predictable skin transforms in different viewers.
const scene=root.listScenes()[0];scene.addChild(bones.get('Rig_Root'));
for(const mesh of [body,head]){
 const world=mesh.getWorldMatrix(),identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
 if(world.some((v,i)=>Math.abs(v-identity[i])>1e-7))throw new Error(`Unexpected mesh transform: ${mesh.getName()}`);
 mesh.getParentNode().removeChild(mesh);scene.addChild(mesh);
}
const skin=doc.createSkin('ExperimentalMaleSkin').setSkeleton(bones.get('Rig_Root'));
for(const [name] of definitions)skin.addJoint(bones.get(name));
const jointIndex=new Map(definitions.map(([name],i)=>[name,i]));
const inverseBinds=new Float32Array(definitions.length*16);
for(let i=0;i<definitions.length;i++){
 const [, , [x,y,z]]=definitions[i],o=16*i;
 inverseBinds.set([1,0,0,0,0,1,0,0,0,0,1,0,-x,-y,-z,1],o);
}
skin.setInverseBindMatrices(doc.createAccessor('Rig_InverseBind',buffer).setType(Accessor.Type.MAT4).setArray(inverseBinds));

// Identify arm and torso regions topologically, rather than by nearest bone
// in space. Hanging hands sit close to thighs and must not inherit leg bones.
// Coincident UV-split vertices share a graph vertex and therefore weights.
const pos=bodyPrimitive.getAttribute('POSITION'),idx=bodyPrimitive.getIndices().getArray();
const unique=[],byPosition=new Map(),vertexToUnique=new Uint32Array(pos.getCount());
for(let i=0;i<pos.getCount();i++){
 const p=pos.getElement(i,[]),key=p.join(',');let id=byPosition.get(key);
 if(id===undefined){id=unique.length;byPosition.set(key,id);unique.push({p,adj:new Set()})}vertexToUnique[i]=id;
}
for(let i=0;i<idx.length;i+=3){
 const a=vertexToUnique[idx[i]],b=vertexToUnique[idx[i+1]],c=vertexToUnique[idx[i+2]];
 for(const [u,v] of [[a,b],[b,c],[c,a]])if(u!==v){unique[u].adj.add(v);unique[v].adj.add(u)}
}
const cutoff=1.30,component=new Int32Array(unique.length).fill(-1),components=[];
for(let i=0;i<unique.length;i++){
 if(unique[i].p[1]>cutoff||component[i]>=0)continue;
 const label=components.length,queue=[i];component[i]=label;let sx=0;
 for(let k=0;k<queue.length;k++){const u=queue[k];sx+=unique[u].p[0];for(const v of unique[u].adj){
  if(unique[v].p[1]<=cutoff&&component[v]<0){component[v]=label;queue.push(v)}
 }}
 components.push({label,count:queue.length,meanX:sx/queue.length});
}
const major=components.filter(x=>x.count>500);
if(major.length!==3)throw new Error(`Unexpected connectivity below shoulders: ${JSON.stringify(major)}`);
const positiveArm=major.find(x=>x.meanX>.2),negativeArm=major.find(x=>x.meanX<-.2);
if(!positiveArm||!negativeArm)throw new Error('Could not isolate both arms');
let left=new Float64Array(unique.length),right=new Float64Array(unique.length);const unknown=[];
for(let i=0;i<unique.length;i++){
 if(component[i]===positiveArm.label)left[i]=1;
 else if(component[i]===negativeArm.label)right[i]=1;
 else if(unique[i].p[1]>cutoff&&unique[i].p[1]<1.51)unknown.push(i);
}
// Harmonic falloff across the connected shoulder region.
let converged=false,iterations=0,lastChange=0;
for(;iterations<4000;iterations++){
 lastChange=0;
 for(const i of unknown){let a=0,b=0;for(const j of unique[i].adj){a+=left[j];b+=right[j]}
  const degree=unique[i].adj.size;if(!degree)throw new Error('Disconnected vertex in shoulder');a/=degree;b/=degree;
  lastChange=Math.max(lastChange,Math.abs(a-left[i]),Math.abs(b-right[i]));left[i]=a;right[i]=b;
 }
 if(lastChange<1e-8){converged=true;break}
}
if(!converged)throw new Error(`Shoulder weighting did not converge: ${lastChange}`);
const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t)};
function mixRange(y,segments){
 // segments = [{below,above,low,high}, ...] in ascending height.
 for(const {below,above,low,high} of segments){
  if(y<below)return [[low,1]];
  if(y<=above){const t=smooth(below,above,y);return [[low,1-t],[high,t]]}
 }
 return [[segments.at(-1).high,1]];
}
const torso=y=>mixRange(y,[
 {below:.94,above:1.08,low:'Rig_Hips',high:'Rig_Spine'},
 {below:1.16,above:1.30,low:'Rig_Spine',high:'Rig_Chest'},
 {below:1.43,above:1.55,low:'Rig_Chest',high:'Rig_Neck'},
 {below:1.55,above:1.63,low:'Rig_Neck',high:'Rig_Head'},
]);
const arm=(y,s)=>mixRange(y,[
 {below:.94,above:1.02,low:`Rig_Hand_${s}`,high:`Rig_Forearm_${s}`},
 {below:1.08,above:1.27,low:`Rig_Forearm_${s}`,high:`Rig_UpperArm_${s}`},
 {below:1.35,above:1.45,low:`Rig_UpperArm_${s}`,high:`Rig_Shoulder_${s}`},
]);
function leg(y,z,s){
 const arr=mixRange(y,[
  {below:.075,above:.235,low:`Rig_Foot_${s}`,high:`Rig_Shin_${s}`},
  {below:.40,above:.60,low:`Rig_Shin_${s}`,high:`Rig_Thigh_${s}`},
 ]);
 const toe=smooth(.055,.115,z)*(1-smooth(.08,.13,y)),result=[];
 for(const [name,w] of arr){if(name===`Rig_Foot_${s}`){result.push([name,w*(1-toe)],[`Rig_Toes_${s}`,w*toe])}else result.push([name,w])}
 return result;
}
function combine(groups){
 const m=new Map();for(const [weight,arr] of groups)for(const [name,v] of arr){const n=weight*v;if(n>1e-9)m.set(name,(m.get(name)||0)+n)}
 const sorted=[...m].sort((a,b)=>b[1]-a[1]);const dropped=sorted.slice(4).reduce((s,x)=>s+x[1],0);
 if(dropped>.001)throw new Error(`Too many material weights: ${dropped}`);
 const top=sorted.slice(0,4),sum=top.reduce((s,x)=>s+x[1],0);if(sum<=0)throw new Error('Unweighted vertex');
 return top.map(([name,v])=>[jointIndex.get(name),v/sum]);
}
function assign(primitive,fn,label){
 const positions=primitive.getAttribute('POSITION'),joints=new Uint16Array(positions.getCount()*4),weights=new Float32Array(positions.getCount()*4);
 for(let i=0;i<positions.getCount();i++){
  const w=fn(positions.getElement(i,[]),i);
  for(let j=0;j<w.length;j++){joints[4*i+j]=w[j][0];weights[4*i+j]=w[j][1]}
 }
 primitive.setAttribute('JOINTS_0',doc.createAccessor(`${label}_Joints`,buffer).setType(Accessor.Type.VEC4).setArray(joints));
 primitive.setAttribute('WEIGHTS_0',doc.createAccessor(`${label}_Weights`,buffer).setType(Accessor.Type.VEC4).setArray(weights));
}
assign(bodyPrimitive,([x,y,z],i)=>{
 const u=vertexToUnique[i],aL=x>0?left[u]:0,aR=x<0?right[u]:0,bodyWeight=Math.max(0,1-aL-aR);
 const legStrength=y<.75?1:(1-smooth(.76,.94,y))*smooth(.015,.07,Math.abs(x));
 const side=x>=0?'L':'R';
 return combine([[aL,arm(y,'L')],[aR,arm(y,'R')],[bodyWeight*(1-legStrength),torso(y)],[bodyWeight*legStrength,leg(y,z,side)]]);
},'Body');
assign(headPrimitive,([,y])=>combine([[1,torso(y)]]),'Head');
body.setSkin(skin);head.setSkin(skin);

// The ears are rigid children of the head joint, with their bind-world
// transforms preserved. They move with the head and are not misweighted.
for(const name of ['ear-makehuman-right','ear-makehuman-left']){
 const ear=named(name),world=ear.getWorldMatrix(),headWorld=boneInfo.get('Rig_Head').world;
 ear.getParentNode().removeChild(ear);bones.get('Rig_Head').addChild(ear);
 ear.setTranslation([world[12]-headWorld[0],world[13]-headWorld[1],world[14]-headWorld[2]]);
}

// Animations are genuine glTF channels, not viewer-only scripted movement.
const duration=4,steps=20,times=Float32Array.from({length:steps+1},(_,i)=>duration*i/steps);
const amount=t=>(1-Math.cos(2*Math.PI*t/duration))/2;
const quat=(axis,angle)=>{const s=Math.sin(angle/2);return [axis[0]*s,axis[1]*s,axis[2]*s,Math.cos(angle/2)]};
function makeAnimation(name,tracks){
 const animation=doc.createAnimation(name),input=doc.createAccessor(`${name}_Time`,buffer).setType(Accessor.Type.SCALAR).setArray(times);
 for(const [bone,pathName,fn] of tracks){
  const width=pathName==='rotation'?4:3,values=new Float32Array(times.length*width);
  for(let i=0;i<times.length;i++)values.set(fn(amount(times[i]),times[i]),i*width);
  const output=doc.createAccessor(`${name}_${bone}_${pathName}`,buffer).setType(width===4?Accessor.Type.VEC4:Accessor.Type.VEC3).setArray(values);
  // glTF animation samplers/channels do not have a name property.
  const sampler=doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
  animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(bones.get(bone)).setTargetPath(pathName).setSampler(sampler));
 }
}
const chestLocal=boneInfo.get('Rig_Chest').local;
makeAnimation('Idle_Breathing',[
 ['Rig_Spine','rotation',a=>quat([1,0,0],a*.35*Math.PI/180)],
 ['Rig_Chest','rotation',a=>quat([1,0,0],-a*.35*Math.PI/180)],
 ['Rig_Chest','translation',a=>[chestLocal[0],chestLocal[1]+a*.0025,chestLocal[2]]],
 ['Rig_Chest','scale',a=>[1+a*.008,1+a*.002,1+a*.010]],
 ...['Rig_Neck','Rig_Shoulder_L','Rig_Shoulder_R'].map(b=>[b,'scale',a=>[1/(1+a*.008),1/(1+a*.002),1/(1+a*.010)]]),
]);
makeAnimation('Test_Arms',[
 ['Rig_Shoulder_L','rotation',a=>quat([0,0,1],a*5*Math.PI/180)],
 ['Rig_Shoulder_R','rotation',a=>quat([0,0,1],-a*5*Math.PI/180)],
 ['Rig_UpperArm_L','rotation',a=>quat([0,0,1],a*35*Math.PI/180)],
 ['Rig_UpperArm_R','rotation',a=>quat([0,0,1],-a*35*Math.PI/180)],
]);
makeAnimation('Test_Elbow',[
 ['Rig_Forearm_L','rotation',a=>quat([1,0,0],-a*55*Math.PI/180)],
]);
makeAnimation('Test_Knee',[
 // A moderate ankle counter-rotation limits the foot pitching through the
 // display floor. This is still only a local joint test, not ground-contact IK.
 ['Rig_Shin_L','rotation',a=>quat([1,0,0],a*45*Math.PI/180)],
 ['Rig_Foot_L','rotation',a=>quat([1,0,0],-a*35*Math.PI/180)],
]);
makeAnimation('Test_Head',[
 ['Rig_Neck','rotation',a=>quat([0,1,0],a*8*Math.PI/180)],
 ['Rig_Head','rotation',a=>quat([0,1,0],a*12*Math.PI/180)],
]);

await fs.mkdir(path.dirname(output),{recursive:true});await io.write(output,doc);
const out=await fs.readFile(output);
console.log(JSON.stringify({sourceSha256:EXPECTED_INPUT,outputSha256:sha(out),bytes:out.length,triangles:32354,
 bones:definitions.length,skinMeshes:['head_1','head_2'],rigidEars:2,shoulderGraph:{uniqueVertices:unique.length,unknownVertices:unknown.length,iterations:iterations+1,lastChange,components:major},
 clips:root.listAnimations().map(a=>a.getName()),durationSeconds:duration},null,2));
