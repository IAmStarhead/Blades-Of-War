// A non-destructive profile and walking study based on the published trial.
// The user-approved model/rig and prior trial are not overwritten.
import {Accessor,NodeIO} from '@gltf-transform/core';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const EXPECTED='bf967a9abea76c35ecbbeebde644a34a2b45984ab13526d9047680e6487d6200';
const args=process.argv.slice(2);if(args.length!==2)throw new Error('Usage: node refine.mjs INPUT.glb OUTPUT.glb');
const [input,output]=args.map(p=>path.resolve(p));
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),own=path.join(repo,'work/male-walk-refinement');
if(input===output||(output.startsWith(repo+path.sep)&&!output.startsWith(own+path.sep)))throw new Error('Refusing to overwrite another repository artifact');
const sha=b=>createHash('sha256').update(b).digest('hex'),bytes=await fs.readFile(input);if(sha(bytes)!==EXPECTED)throw new Error('Unexpected source model');
const io=new NodeIO(),doc=await io.readBinary(bytes),root=doc.getRoot(),buffer=root.listBuffers()[0];
const byName=name=>{const a=root.listNodes().filter(n=>n.getName()===name);if(a.length!==1)throw new Error(`Expected one ${name}`);return a[0]};
const smooth=(a,b,x)=>{const q=Math.max(0,Math.min(1,(x-a)/(b-a)));return q*q*(3-2*q)};
const deriv=(a,b,x)=>{const q=(x-a)/(b-a);return q>0&&q<1?6*q*(1-q)/(b-a):0};
const profile={strength:.010,y0:1.300,y1:1.465,y2:1.520,y3:1.625,z0:-.140,z1:.010,x0:.090,x1:.210};
function correction([x,y,z],normal){
 const {strength:s,y0,y1,y2,y3,z0,z1,x0,x1}=profile;
 const lo=smooth(y0,y1,y),hi=1-smooth(y2,y3,y),back=1-smooth(z0,z1,z),mid=1-smooth(x0,x1,Math.abs(x));
 const d=s*lo*hi*back*mid;if(d<1e-10)return {position:[0,0,0],normal:[0,0,0]};
 // Analytic inverse-transpose of the deformation gradient preserves the
 // already-smoothed nape normals rather than re-faceting the head mesh.
 const dx=-s*lo*hi*back*deriv(x0,x1,Math.abs(x))*Math.sign(x);
 const dy=s*(deriv(y0,y1,y)*hi-lo*deriv(y2,y3,y))*back*mid;
 const dz=1-s*lo*hi*deriv(z0,z1,z)*mid;
 if(dz<.25)throw new Error('Profile deformation is not locally invertible');
 let n=[normal[0]-dx*normal[2]/dz,normal[1]-dy*normal[2]/dz,normal[2]/dz],m=Math.hypot(...n);
 n=n.map((v,i)=>v/m-normal[i]);return {position:[0,0,d],normal:n};
}
const stats={};
for(const name of ['head_1','head_2']){
 const mesh=byName(name).getMesh(),primitive=mesh.listPrimitives()[0],position=primitive.getAttribute('POSITION'),normal=primitive.getAttribute('NORMAL');
 const dp=new Float32Array(position.getCount()*3),dn=new Float32Array(position.getCount()*3);let count=0,max=0,normalMax=0;
 const duplicated=new Map();for(let i=0;i<position.getCount();i++){
  const p=position.getElement(i,[]),n=normal.getElement(i,[]),delta=correction(p,n);dp.set(delta.position,i*3);dn.set(delta.normal,i*3);
  const length=Math.hypot(...delta.position),nlen=Math.hypot(...delta.normal);if(length>1e-7)count++;max=Math.max(max,length);normalMax=Math.max(normalMax,2*Math.asin(Math.min(1,nlen/2))*180/Math.PI);
  const key=p.join(',');if(duplicated.has(key)&&JSON.stringify(duplicated.get(key))!==JSON.stringify(delta.position))throw new Error('Position-split seam profile mismatch');duplicated.set(key,delta.position);
 }
 const target=doc.createPrimitiveTarget()
  .setAttribute('POSITION',doc.createAccessor(`ProfilePosition_${name}`,buffer).setType(Accessor.Type.VEC3).setArray(dp))
  .setAttribute('NORMAL',doc.createAccessor(`ProfileNormal_${name}`,buffer).setType(Accessor.Type.VEC3).setArray(dn));
 primitive.addTarget(target);
 if(name==='head_1'){
  if(primitive.listTargets().length!==1)throw new Error('Unexpected head targets');
  mesh.setWeights([1]);mesh.setExtras({...mesh.getExtras(),targetNames:['NeckProfile']});
 } else {
  if(primitive.listTargets().length!==2)throw new Error('Unexpected body targets');
  mesh.setWeights([0,1]);mesh.setExtras({...mesh.getExtras(),targetNames:['ArmSoftCorrection','NeckProfile']});
 }
 stats[name]={vertices:count,maxPosition:max,maxNormalDegrees:normalMax};
}
// The previous arm test animates one morph weight. Preserve every original
// value and append the default neck weight so that this clip remains usable.
const body=byName('head_2');
for(const anim of root.listAnimations())for(const channel of anim.listChannels())if(channel.getTargetNode()===body&&channel.getTargetPath()==='weights'){
 const out=channel.getSampler().getOutput(),a=out.getArray(),b=new Float32Array(a.length*2);for(let i=0;i<a.length;i++){b[2*i]=a[i];b[2*i+1]=1}out.setArray(b);
}
const previous=root.listAnimations().find(a=>a.getName()==='Walk_Loop');if(!previous)throw new Error('Previous walking clip missing');previous.setName('Previous_Walk');

// Gentle walking cycle. The cycle is in place and uses a baked two-link foot
// path, not runtime IK. Speed remains the same as the user's control trial.
const walk={duration:.90,speed:.9,stance:.60,clearance:.040,rootMin:-0.04,rootBob:0.03};
const rad=Math.PI/180,quat=(axis,a)=>{const s=Math.sin(a/2);return [axis[0]*s,axis[1]*s,axis[2]*s,Math.cos(a/2)]};
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const L1=Math.hypot(.38,.06),L2=Math.hypot(.37,.01),restUpper=Math.atan2(.06,.38),restLower=Math.atan2(.01,.37);
// Compute the lowest point of the original sole at each foot angle, in the
// foot joint's bind coordinates. This avoids making the heel float on landing.
const sole={L:[],R:[]},pts=body.getMesh().listPrimitives()[0].getAttribute('POSITION');
for(let i=0;i<pts.getCount();i++){let [x,y,z]=pts.getElement(i,[]);if(y<.06&&Math.abs(x)>.03&&Math.abs(x)<.22)sole[x>0?'L':'R'].push([y-.12,z+.075])}
if(!sole.L.length||!sole.R.length)throw new Error('Could not sample both original soles');
function ankleFor(pitch,offset){let theta=pitch*rad,c=Math.cos(theta),s=Math.sin(theta),min=Infinity;for(let [y,z] of sole[offset===0?'L':'R'])min=Math.min(min,c*y-s*z);return .002-min}
// Keep the heel steady on landing and the forefoot steady during push-off,
// instead of rotating the sole around its centre while it should be planted.
function contactZ(pitch){let t=pitch*rad,heel=pitch<0,dy=heel?-.105:-.108,dz=heel?-.040:.195;return Math.sin(t)*dy+(Math.cos(t)-1)*dz}
let worstStanceReach=0,worstSwingReach=0;
function gait(phase,offset=0){
 phase=(phase%1+1)%1;const c=walk,p=(phase+offset)%1,rootY=c.rootMin+c.rootBob*(.5-.5*Math.cos(4*Math.PI*phase));
 const half=c.speed*c.duration*c.stance/2;let z,pitch,lift;
 if(p<c.stance){const u=p/c.stance;z=half*(1-2*u);pitch=-8*(1-smooth(0,.22,u))+16*smooth(.73,1,u);lift=0}
 else {
  const u=(p-c.stance)/(1-c.stance),start=-half,end=half,m=-c.speed*c.duration*(1-c.stance);
  z=(2*u**3-3*u*u+1)*start+(u**3-2*u*u+u)*m+(-2*u**3+3*u*u)*end+(u**3-u*u)*m;
  pitch=16-24*smooth(0,1,u);lift=c.clearance*Math.sin(Math.PI*u)**2;
 }
 z-=contactZ(pitch);
 let ankle=ankleFor(pitch,offset)+lift,down=.87+rootY-ankle,dist=Math.hypot(down,z),reach=L1+L2-.0001;
 const excess=Math.max(0,dist-reach);if(p<c.stance)worstStanceReach=Math.max(worstStanceReach,excess);else worstSwingReach=Math.max(worstSwingReach,excess);
 if(dist>reach){down=Math.sqrt(Math.max(.0001,reach*reach-z*z));ankle=.87+rootY-down;dist=Math.hypot(down,z)}
 const phi=Math.atan2(-z,down),a=Math.acos(clamp((L1*L1+dist*dist-L2*L2)/(2*L1*dist),-1,1));
 const b=Math.acos(clamp((L2*L2+dist*dist-L1*L1)/(2*L2*dist),-1,1));
 const hip=phi-a-restUpper,knee=phi+b-restLower-hip,foot=pitch*rad-hip-knee;return {rootY,hip,knee,foot};
}
const tracks=[['Rig_Root','translation',p=>[0,gait(p).rootY,0]],
 ['Rig_Spine','rotation',p=>quat([1,0,0],1.5*rad)],
 ['Rig_Chest','rotation',p=>quat([1,0,0],-.35*rad)],
 ['Rig_Neck','rotation',p=>quat([1,0,0],-1.15*rad)],
];
for(const [side,offset,sign] of [['L',0,1],['R',.5,-1]])tracks.push(
 [`Rig_Thigh_${side}`,'rotation',p=>quat([1,0,0],gait(p,offset).hip)],
 [`Rig_Shin_${side}`,'rotation',p=>quat([1,0,0],gait(p,offset).knee)],
 [`Rig_Foot_${side}`,'rotation',p=>quat([1,0,0],gait(p,offset).foot)],
 [`Rig_Shoulder_${side}`,'rotation',p=>quat([1,0,0],sign*2.5*rad*Math.cos(2*Math.PI*p))],
 [`Rig_UpperArm_${side}`,'rotation',p=>quat([1,0,0],sign*15.5*rad*Math.cos(2*Math.PI*p))],
 [`Rig_Forearm_${side}`,'rotation',p=>quat([1,0,0],(-10+sign*2.5*Math.cos(2*Math.PI*p))*rad)],
 [`Rig_Hand_${side}`,'rotation',p=>quat([1,0,0],-sign*1.5*rad*Math.cos(2*Math.PI*p))],
);
const steps=120,animation=doc.createAnimation('Walk_Loop'),times=Float32Array.from({length:steps+1},(_,i)=>walk.duration*i/steps);
const inputTime=doc.createAccessor('Walk_Refined_Time',buffer).setType(Accessor.Type.SCALAR).setArray(times);
for(const [name,pathName,fn] of tracks){const width=pathName==='rotation'?4:3,values=new Float32Array((steps+1)*width);
 for(let i=0;i<=steps;i++)values.set(fn(i===steps?0:i/steps),width*i);
 const value=doc.createAccessor(`Walk_Refined_${name}_${pathName}`,buffer).setType(width===4?Accessor.Type.VEC4:Accessor.Type.VEC3).setArray(values);
 const sampler=doc.createAnimationSampler().setInput(inputTime).setOutput(value).setInterpolation('LINEAR');
 animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(byName(name)).setTargetPath(pathName).setSampler(sampler));
}
if(worstStanceReach>.004)throw new Error(`Unreachable planted-foot target ${worstStanceReach}`);
const binary=Buffer.from(await io.writeBinary(doc)),len=binary.readUInt32LE(12);
if(binary.toString('ascii',16,20)!=='JSON')throw new Error('Unexpected GLB JSON chunk');const json=JSON.parse(binary.subarray(20,20+len).toString('utf8'));
const order=['Idle_Breathing','Walk_Loop','Run_Loop','Test_Arms','Test_Elbow','Test_Knee','Test_Head','Previous_Walk','Previous_Refined_Idle','Previous_Idle','Previous_Arms','Previous_Knee'];
const map=new Map(json.animations.map(a=>[a.name,a]));if(map.size!==order.length||order.some(n=>!map.has(n)))throw new Error('Unexpected clips');json.animations=order.map(n=>map.get(n));
const raw=Buffer.from(JSON.stringify(json),'utf8'),padded=Buffer.alloc((raw.length+3)&~3,0x20);raw.copy(padded);
const rest=binary.subarray(20+len),out=Buffer.alloc(20+padded.length+rest.length);out.write('glTF',0,'ascii');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(padded.length,12);out.write('JSON',16,'ascii');padded.copy(out,20);rest.copy(out,20+padded.length);
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,out);
console.log(JSON.stringify({sourceSha256:EXPECTED,outputSha256:sha(out),bytes:out.length,bones:22,triangles:32354,profile,profileStats:stats,walk,worstStanceReach,worstSwingReach,clips:order},null,2));
