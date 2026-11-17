// Non-destructive locomotion study built on the previously accepted-looking
// man. No topology is cut; this is not a production rig or dismemberment.
import {Accessor,NodeIO} from '@gltf-transform/core';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const EXPECTED='a442b85eab3e725bb54f87ce5a3e89da05e7cfefa02cf5cfbb817cf6c67fcc4d';
const args=process.argv.slice(2);if(args.length!==2)throw new Error('Usage: node locomotion.mjs INPUT.glb OUTPUT.glb');
const [input,output]=args.map(p=>path.resolve(p));
const protectedDirectories=['work/male-rig-refinement','work/male-rig-trial'].map(p=>path.resolve(p));
if(input===output||protectedDirectories.some(dir=>output===dir||output.startsWith(dir+path.sep)))throw new Error('Refusing to overwrite a previous trial');
const sha=b=>createHash('sha256').update(b).digest('hex'),bytes=await fs.readFile(input);
if(sha(bytes)!==EXPECTED)throw new Error('Unexpected source model');
const io=new NodeIO(),doc=await io.readBinary(bytes),root=doc.getRoot(),buffer=root.listBuffers()[0];
const byName=name=>{const a=root.listNodes().filter(n=>n.getName()===name);if(a.length!==1)throw new Error(`Expected one ${name}`);return a[0]};
const skins=root.listSkins();if(skins.length!==1||skins[0].listJoints().length!==22)throw new Error('Unexpected skin');
const boneNames=skins[0].listJoints().map(x=>x.getName()),index=new Map(boneNames.map((n,i)=>[n,i]));
const body=byName('head_2'),primitive=body.getMesh().listPrimitives()[0];
const pos=primitive.getAttribute('POSITION'),ja=primitive.getAttribute('JOINTS_0'),wa=primitive.getAttribute('WEIGHTS_0');
const joints=ja.getArray(),weights=wa.getArray();
const smooth=(a,b,x)=>{const q=Math.max(0,Math.min(1,(x-a)/(b-a)));return q*q*(3-2*q)};
let adjusted=0,maxIncrease=0,totalIncrease=0,duplicates=new Map();
for(let i=0;i<pos.getCount();i++){
 const [x,y,z]=pos.getElement(i,[]);if(y<=.75||y>=.98||Math.abs(x)<=.015)continue;
 const s=x>0?'L':'R',thigh=index.get(`Rig_Thigh_${s}`),hips=index.get('Rig_Hips'),spine=index.get('Rig_Spine');
 const values=new Map();for(let k=0;k<4;k++){const v=weights[4*i+k];if(v>1e-9)values.set(joints[4*i+k],(values.get(joints[4*i+k])||0)+v)}
 const current=values.get(thigh)||0,hip=values.get(hips)||0,spineWeight=values.get(spine)||0;
 const bodyWeight=current+hip+spineWeight;
 // Higher, gradual influence at the actual hip pivot rather than most of the
 // blend happening down the thigh. The center and arms remain protected.
 const strength=(1-smooth(.83,.98,y))*smooth(.015,.07,Math.abs(x));
 const next=Math.min(current+hip,Math.max(current,bodyWeight*strength)),increase=next-current;
 if(increase<1e-7)continue;
 values.set(thigh,next);values.set(hips,Math.max(0,hip-increase));
 const sorted=[...values].filter(([,w])=>w>1e-8).sort((a,b)=>b[1]-a[1]);
 if(sorted.length>4)throw new Error(`Too many weights at ${i}: ${JSON.stringify(sorted)}`);
 const sum=sorted.reduce((a,b)=>a+b[1],0);if(Math.abs(sum-1)>2e-5)throw new Error(`Bad weight sum ${sum}`);
 for(let k=0;k<4;k++){joints[4*i+k]=sorted[k]?.[0]||0;weights[4*i+k]=sorted[k]?sorted[k][1]/sum:0}
 adjusted++;maxIncrease=Math.max(maxIncrease,increase);totalIncrease+=increase;
 const key=[x,y,z].join(','),signature=Array.from({length:4},(_,k)=>[joints[4*i+k],weights[4*i+k]]);
 if(duplicates.has(key)&&JSON.stringify(duplicates.get(key))!==JSON.stringify(signature))throw new Error('UV-split seam has different hip weights');
 duplicates.set(key,signature);
}
if(adjusted<100||maxIncrease>.9)throw new Error(`Unexpected hip adjustment: ${adjusted}, ${maxIncrease}`);
const currentIdle=root.listAnimations().find(x=>x.getName()==='Idle_Breathing');if(!currentIdle)throw new Error('Missing previous idle');
currentIdle.setName('Previous_Refined_Idle');
const rad=Math.PI/180,quat=(axis,a)=>{const s=Math.sin(a/2);return [axis[0]*s,axis[1]*s,axis[2]*s,Math.cos(a/2)]};
function makeAnimation(name,duration,steps,tracks){
 const anim=doc.createAnimation(name),times=Float32Array.from({length:steps+1},(_,i)=>duration*i/steps);
 const input=doc.createAccessor(`${name}_Time`,buffer).setType(Accessor.Type.SCALAR).setArray(times);
 for(const [node,path,fn] of tracks){
  const width=path==='rotation'?4:3,values=new Float32Array((steps+1)*width);
  for(let i=0;i<=steps;i++)values.set(fn(i===steps?0:i/steps),i*width);
  const type=width===4?Accessor.Type.VEC4:Accessor.Type.VEC3;
  const output=doc.createAccessor(`${name}_${node}_${path}`,buffer).setType(type).setArray(values);
  const sampler=doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
  anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(byName(node)).setTargetPath(path).setSampler(sampler));
 }
}
const chest=byName('Rig_Chest').getTranslation();
makeAnimation('Idle_Breathing',4,40,[
 ['Rig_Spine','rotation',p=>quat([1,0,0],((1-Math.cos(2*Math.PI*p))/2)*.9*rad)],
 ['Rig_Chest','rotation',p=>quat([1,0,0],-((1-Math.cos(2*Math.PI*p))/2)*.6*rad)],
 ['Rig_Chest','translation',p=>[chest[0],chest[1]+((1-Math.cos(2*Math.PI*p))/2)*.007,chest[2]+((1-Math.cos(2*Math.PI*p))/2)*.002]],
]);

// In-place cycles are authored around an explicit stance/swing foot path.
// These numbers are a small-scale prototype, not captured motion or full IK.
const config={walk:{duration:1.0,speed:.9,stance:.60,clearance:.075},run:{duration:.72,speed:2.2,stance:.38,clearance:.12}};
const L1=Math.hypot(.38,.06),L2=Math.hypot(.37,.01),restUpper=Math.atan2(.06,.38),restLower=Math.atan2(.01,.37);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
let worstStanceReach=0,worstSwingReach=0;
function gait(phase,type,offset=0){
 phase=(phase%1+1)%1;const c=config[type],run=type==='run',p=(phase+offset)%1;let rootY,flight=0;
 if(!run)rootY=-.055+.040*(.5-.5*Math.cos(4*Math.PI*phase));
 else {
  const right=(phase+.5)%1;let q;
  if(phase<c.stance){q=phase/c.stance;rootY=-.060+.025*Math.sin(Math.PI*q)**2}
  else if(right<c.stance){q=right/c.stance;rootY=-.060+.025*Math.sin(Math.PI*q)**2}
  else {q=phase<.5?(phase-c.stance)/(.5-c.stance):(phase-.5-c.stance)/(.5-c.stance);flight=.10*Math.sin(Math.PI*q)**2;rootY=-.060+flight}
 }
 const half=c.speed*c.duration*c.stance/2;let z,pitch,lift;
 if(p<c.stance){
  const u=p/c.stance;z=half*(1-2*u);
  pitch=(run?-8:-6)*(1-smooth(0,.2,u))+(run?18:12)*smooth(.75,1,u);lift=0;
 } else {
  const u=(p-c.stance)/(1-c.stance),start=-half,end=half,m=-c.speed*c.duration*(1-c.stance);
  // Match the initial and final velocity of the planted-foot segment.
  z=(2*u**3-3*u*u+1)*start+(u**3-2*u*u+u)*m+(-2*u**3+3*u*u)*end+(u**3-u*u)*m;
  pitch=(run?18:12)+((run?-8:-6)-(run?18:12))*smooth(0,1,u);
  lift=c.clearance*Math.sin(Math.PI*u)**2+flight;
 }
 const compensation=pitch>0?.18*Math.sin(pitch*rad):.065*Math.sin(-pitch*rad);
 let ankle=.112+compensation+lift,down=.87+rootY-ankle,dist=Math.hypot(down,z),reach=L1+L2-.0001;
 const excess=Math.max(0,dist-reach);
 if(p<c.stance)worstStanceReach=Math.max(worstStanceReach,excess);else worstSwingReach=Math.max(worstSwingReach,excess);
 if(dist>reach){down=Math.sqrt(Math.max(.0001,reach*reach-z*z));ankle=.87+rootY-down;dist=Math.hypot(down,z)}
 const phi=Math.atan2(-z,down),a=Math.acos(clamp((L1*L1+dist*dist-L2*L2)/(2*L1*dist),-1,1));
 const b=Math.acos(clamp((L2*L2+dist*dist-L1*L1)/(2*L2*dist),-1,1));
 const hip=phi-a-restUpper,knee=phi+b-restLower-hip,foot=pitch*rad-hip-knee;
 return {rootY,hip,knee,foot};
}
for(const [type,c] of Object.entries(config)){
 const run=type==='run',swing=(run?28:14)*rad,forearm=(run?-52:-7)*rad,lean=(run?7:1.2)*rad;
 const tracks=[['Rig_Root','translation',p=>[0,gait(p,type).rootY,0]],
  ['Rig_Spine','rotation',p=>quat([1,0,0],lean)],
  ['Rig_Chest','rotation',p=>quat([1,0,0],-lean*.20)],
 ];
 for(const [side,offset,sign] of [['L',0,1],['R',.5,-1]])tracks.push(
  [`Rig_Thigh_${side}`,'rotation',p=>quat([1,0,0],gait(p,type,offset).hip)],
  [`Rig_Shin_${side}`,'rotation',p=>quat([1,0,0],gait(p,type,offset).knee)],
  [`Rig_Foot_${side}`,'rotation',p=>quat([1,0,0],gait(p,type,offset).foot)],
  [`Rig_Shoulder_${side}`,'rotation',p=>quat([1,0,0],sign*swing*.16*Math.cos(2*Math.PI*p))],
  [`Rig_UpperArm_${side}`,'rotation',p=>quat([1,0,0],sign*swing*.84*Math.cos(2*Math.PI*p))],
  [`Rig_Forearm_${side}`,'rotation',p=>quat([1,0,0],forearm+sign*(run?5:2)*rad*Math.cos(2*Math.PI*p))],
  [`Rig_Hand_${side}`,'rotation',p=>quat([1,0,0],-sign*(run?3:1)*rad*Math.cos(2*Math.PI*p))],
 );
 makeAnimation(type==='walk'?'Walk_Loop':'Run_Loop',c.duration,120,tracks);
}
if(worstStanceReach>.004)throw new Error(`Unreachable planted-foot target: ${worstStanceReach}`);
const binary=Buffer.from(await io.writeBinary(doc)),len=binary.readUInt32LE(12);
if(binary.toString('ascii',16,20)!=='JSON')throw new Error('Unexpected GLB JSON chunk');
const json=JSON.parse(binary.subarray(20,20+len).toString('utf8'));
const order=['Idle_Breathing','Walk_Loop','Run_Loop','Test_Arms','Test_Elbow','Test_Knee','Test_Head','Previous_Refined_Idle','Previous_Idle','Previous_Arms','Previous_Knee'];
const animations=new Map(json.animations.map(a=>[a.name,a]));if(animations.size!==order.length||order.some(n=>!animations.has(n)))throw new Error('Unexpected clips');
json.animations=order.map(n=>animations.get(n));
const raw=Buffer.from(JSON.stringify(json),'utf8'),padded=Buffer.alloc((raw.length+3)&~3,0x20);raw.copy(padded);
const rest=binary.subarray(20+len),out=Buffer.alloc(20+padded.length+rest.length);
out.write('glTF',0,'ascii');out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(padded.length,12);out.write('JSON',16,'ascii');padded.copy(out,20);rest.copy(out,20+padded.length);
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,out);
console.log(JSON.stringify({sourceSha256:EXPECTED,outputSha256:sha(out),bytes:out.length,bones:22,triangles:32354,
 hipWeights:{adjustedVertices:adjusted,maxIncrease,meanIncrease:totalIncrease/adjusted},
 gait:config,worstStanceReach,worstSwingReach,clips:order},null,2));
