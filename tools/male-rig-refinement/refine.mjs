// Separate, non-destructive follow-up to the first rig. Previous head/elbow
// clips, geometry, skin weights and the three comparison clips are preserved.
import {Accessor,NodeIO} from '@gltf-transform/core';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const EXPECTED='9d9ee4719111f932573f098b97ee7d55c8357db0e730ba4a8883862a10985bea';
const args=process.argv.slice(2);if(args.length!==2)throw new Error('Usage: node refine.mjs FIRST_RIG.glb NEW_COPY.glb');
const [input,output]=args.map(p=>path.resolve(p));if(input===output)throw new Error('Refusing to overwrite input');
const sha=b=>createHash('sha256').update(b).digest('hex'),bytes=await fs.readFile(input);
if(sha(bytes)!==EXPECTED)throw new Error('Input is not the verified first rig');
const io=new NodeIO(),doc=await io.readBinary(bytes),root=doc.getRoot(),buffer=root.listBuffers()[0];
if(root.listSkins().length!==1||root.listSkins()[0].listJoints().length!==22)throw new Error('Unexpected first rig');
const byName=name=>{const r=root.listNodes().filter(n=>n.getName()===name);if(r.length!==1)throw new Error(`Expected one ${name}`);return r[0]};
for(const [name,previous] of [['Idle_Breathing','Previous_Idle'],['Test_Arms','Previous_Arms'],['Test_Knee','Previous_Knee']]){
 const r=root.listAnimations().filter(a=>a.getName()===name);if(r.length!==1)throw new Error(`Expected clip ${name}`);r[0].setName(previous);
}
const body=byName('head_2'),mesh=body.getMesh(),primitive=mesh.listPrimitives()[0];
if(primitive.listTargets().length)throw new Error('Unexpected existing morph targets');
const pos=primitive.getAttribute('POSITION'),normal=primitive.getAttribute('NORMAL'),joints=primitive.getAttribute('JOINTS_0'),weights=primitive.getAttribute('WEIGHTS_0');
const skel=root.listSkins()[0].listJoints(),upper=new Set(skel.flatMap((j,i)=>/^Rig_UpperArm_[LR]$/.test(j.getName())?[i]:[]));
if(upper.size!==2)throw new Error('Could not find upper arms');
const smooth=(a,b,x)=>{const v=Math.max(0,Math.min(1,(x-a)/(b-a)));return v*v*(3-2*v)};
const count=pos.getCount(),p=new Float64Array(count*3),d=new Float32Array(count*3),n0=new Float64Array(count*3),groups=new Map(),groupOf=new Uint32Array(count);
let moved=0,maxDelta=0;
for(let i=0;i<count;i++){
 const xyz=pos.getElement(i,[]),n=normal.getElement(i,[]),js=joints.getElement(i,[]),ws=weights.getElement(i,[]);p.set(xyz,i*3);n0.set(n,i*3);
 const [x,y,z]=xyz,upperWeight=ws.reduce((sum,v,k)=>sum+(upper.has(js[k])?v:0),0);
 // The correction is confined to the front/outer part of the upper arm;
 // it is zero in the bind pose and never changes the independent elbow test.
 const centerZ=-.035+(y-1.18)/.21*.010;
 const longitudinal=smooth(1.245,1.30,y)*(1-smooth(1.355,1.405,y));
 const front=smooth(-.004,.035,z-centerZ),lateral=smooth(.14,.19,Math.abs(x));
 const amount=longitudinal*front*lateral*Math.min(1,upperWeight*1.15);
 if(amount>1e-7){
  d[3*i]=Math.sign(x)*.0015*amount;d[3*i+2]=.0050*amount;moved++;
  maxDelta=Math.max(maxDelta,Math.hypot(d[3*i],d[3*i+1],d[3*i+2]));
 }
 const key=xyz.join(',')+'|'+n.join(',');let id=groups.get(key);if(id===undefined){id=groups.size;groups.set(key,id)}groupOf[i]=id;
}
if(moved<100||maxDelta>.006)throw new Error(`Unexpected arm correction ${moved}, ${maxDelta}`);
// Normals are adjusted by the difference between old and corrected local face
// normals, preserving the authored base normals when the morph is inactive.
const before=new Float64Array(groups.size*3),after=new Float64Array(groups.size*3),indices=primitive.getIndices().getArray();
function face(a,b,c,delta){
 const ax=p[3*a]+(delta?d[3*a]:0),ay=p[3*a+1]+(delta?d[3*a+1]:0),az=p[3*a+2]+(delta?d[3*a+2]:0);
 const ux=p[3*b]+(delta?d[3*b]:0)-ax,uy=p[3*b+1]+(delta?d[3*b+1]:0)-ay,uz=p[3*b+2]+(delta?d[3*b+2]:0)-az;
 const vx=p[3*c]+(delta?d[3*c]:0)-ax,vy=p[3*c+1]+(delta?d[3*c+1]:0)-ay,vz=p[3*c+2]+(delta?d[3*c+2]:0)-az;
 return [uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx];
}
for(let i=0;i<indices.length;i+=3){const tri=[indices[i],indices[i+1],indices[i+2]],a=face(...tri,false),b=face(...tri,true);
 for(const j of tri){const g=3*groupOf[j];for(let k=0;k<3;k++){before[g+k]+=a[k];after[g+k]+=b[k]}}
}
const dn=new Float32Array(count*3);let maxNormalAngle=0,normalMoved=0;
for(let i=0;i<count;i++){
 const g=3*groupOf[i],alen=Math.hypot(before[g],before[g+1],before[g+2]),blen=Math.hypot(after[g],after[g+1],after[g+2]);
 if(alen<1e-14||blen<1e-14)continue;
 const nv=[0,1,2].map(k=>n0[3*i+k]+after[g+k]/blen-before[g+k]/alen),len=Math.hypot(...nv);
 for(let k=0;k<3;k++)dn[3*i+k]=nv[k]/len-n0[3*i+k];
 const delta=Math.hypot(dn[3*i],dn[3*i+1],dn[3*i+2]);if(delta>1e-7)normalMoved++;
 maxNormalAngle=Math.max(maxNormalAngle,2*Math.asin(Math.min(1,delta/2))*180/Math.PI);
}
if(maxNormalAngle>15)throw new Error(`Unexpected normal change ${maxNormalAngle}`);
const target=doc.createPrimitiveTarget()
 .setAttribute('POSITION',doc.createAccessor('ArmSoftCorrection_POSITION',buffer).setType(Accessor.Type.VEC3).setArray(d))
 .setAttribute('NORMAL',doc.createAccessor('ArmSoftCorrection_NORMAL',buffer).setType(Accessor.Type.VEC3).setArray(dn));
primitive.addTarget(target);mesh.setWeights([0]);
mesh.setExtras({...mesh.getExtras(),targetNames:['ArmSoftCorrection']});

const duration=4,steps=40,times=Float32Array.from({length:steps+1},(_,i)=>duration*i/steps);
const amount=t=>(1-Math.cos(2*Math.PI*t/duration))/2,deg=Math.PI/180;
const quat=(axis,angle)=>{const s=Math.sin(angle/2);return [axis[0]*s,axis[1]*s,axis[2]*s,Math.cos(angle/2)]};
function makeAnimation(name,tracks){
 const animation=doc.createAnimation(name),input=doc.createAccessor(`${name}_Time`,buffer).setType(Accessor.Type.SCALAR).setArray(times);
 for(const [nodeName,targetPath,fn] of tracks){
  const width=targetPath==='rotation'?4:targetPath==='weights'?1:3,values=new Float32Array(times.length*width);
  for(let i=0;i<times.length;i++)values.set(fn(amount(times[i]),times[i]),i*width);
  const type=width===4?Accessor.Type.VEC4:width===3?Accessor.Type.VEC3:Accessor.Type.SCALAR;
  const out=doc.createAccessor(`${name}_${nodeName}_${targetPath}`,buffer).setType(type).setArray(values);
  const sampler=doc.createAnimationSampler().setInput(input).setOutput(out).setInterpolation('LINEAR');
  animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(byName(nodeName)).setTargetPath(targetPath).setSampler(sampler));
 }
}
const chest=byName('Rig_Chest').getTranslation();
makeAnimation('Idle_Breathing',[
 ['Rig_Spine','rotation',a=>quat([1,0,0],a*.65*deg)],
 ['Rig_Chest','rotation',a=>quat([1,0,0],-a*.45*deg)],
 ['Rig_Chest','translation',a=>[chest[0],chest[1]+a*.006,chest[2]]],
 ['Rig_Chest','scale',a=>[1+a*.045,1+a*.008,1+a*.055]],
 ...['Rig_Neck','Rig_Shoulder_L','Rig_Shoulder_R'].map(n=>[n,'scale',a=>[1/(1+a*.045),1/(1+a*.008),1/(1+a*.055)]]),
]);
makeAnimation('Test_Arms',[
 ['Rig_Shoulder_L','rotation',a=>quat([0,0,1],a*7*deg)],
 ['Rig_Shoulder_R','rotation',a=>quat([0,0,1],-a*7*deg)],
 ['Rig_UpperArm_L','rotation',a=>quat([0,0,1],a*33*deg)],
 ['Rig_UpperArm_R','rotation',a=>quat([0,0,1],-a*33*deg)],
 ['Rig_Forearm_L','rotation',a=>quat([1,0,0],-a*8*deg)],
 ['Rig_Forearm_R','rotation',a=>quat([1,0,0],-a*8*deg)],
 ['Rig_Hand_L','rotation',a=>quat([1,0,0],a*3*deg)],
 ['Rig_Hand_R','rotation',a=>quat([1,0,0],a*3*deg)],
 ['head_2','weights',a=>[a]],
]);
makeAnimation('Test_Knee',[
 // Forward hip lift and knee flex are coordinated. The ankle follows the
 // shin but gradually points the foot down, rather than keeping it level.
 // The nonlinear pitch limits floor intersections at early phases; no IK.
 ['Rig_Thigh_L','rotation',a=>quat([1,0,0],-a*40*deg)],
 ['Rig_Shin_L','rotation',a=>quat([1,0,0],a*60*deg)],
 ['Rig_Foot_L','rotation',a=>quat([1,0,0],(25*a*a-20*a)*deg)],
]);
// Put the revised idle first for generic glTF viewers that autoplay the first
// clip. glTF animations have no external index references in this asset.
const binary=Buffer.from(await io.writeBinary(doc)),jsonLength=binary.readUInt32LE(12);
if(binary.toString('ascii',16,20)!=='JSON')throw new Error('Unexpected GLB JSON chunk');
const json=JSON.parse(binary.subarray(20,20+jsonLength).toString('utf8'));
const order=['Idle_Breathing','Test_Arms','Test_Elbow','Test_Knee','Test_Head','Previous_Idle','Previous_Arms','Previous_Knee'];
const animations=new Map(json.animations.map(a=>[a.name,a]));if(animations.size!==order.length||order.some(n=>!animations.has(n)))throw new Error('Unexpected clips');
json.animations=order.map(name=>animations.get(name));
const raw=Buffer.from(JSON.stringify(json),'utf8'),padded=Buffer.alloc((raw.length+3)&~3,0x20);raw.copy(padded);
const rest=binary.subarray(20+jsonLength),out=Buffer.alloc(20+padded.length+rest.length);
out.write('glTF',0,'ascii');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(padded.length,12);out.write('JSON',16,'ascii');padded.copy(out,20);rest.copy(out,20+padded.length);
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,out);
console.log(JSON.stringify({sourceSha256:EXPECTED,outputSha256:sha(out),bytes:out.length,bones:22,triangles:32354,
 armCorrection:{movedVertices:moved,maxPositionDelta:maxDelta,normalMovedVertices:normalMoved,maxNormalAngleDegrees:maxNormalAngle},
 clips:order,durationSeconds:duration},null,2));
