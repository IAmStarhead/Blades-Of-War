// Build two *additional* in-place clips from CMU motion capture. The approved
// mesh, skin, neck morph and every existing animation remain unchanged.
// See README.md and mocap/READMEFIRST.txt for source, calibration and limits.
import {Accessor, NodeIO} from '@gltf-transform/core';
import {BVHLoader} from 'three/addons/loaders/BVHLoader.js';
import {AnimationMixer, Bone, Matrix4, Quaternion, Vector3} from 'three';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const REPO=path.resolve(HERE,'../..');
const OWN=path.join(REPO,'work/male-reference-locomotion');
const SOURCE_SHA='e32fca3f789abbb0eebcf17f21cba5d2a981155de50e155982bbcb0281574d6c';
const SOURCES=[
  {name:'Reference_Walk',file:'02_01.bvh',sha:'cf56db43157acc3d200b3d4215523f54d354a8926bea67e1f6c8031bd335ba7e',
   start:136,end:268,duration:1.0,strideScale:.85,neckDegrees:9,headDegrees:18,armOutDegrees:11,soleLimit:.08},
  {name:'Reference_Run',file:'35_17.bvh',sha:'50c6469efea1edbba0f7acd46b1fa72e0b74b78e1698aa1b441990bd2a78d730',
   start:32,end:121,duration:.75,strideScale:.90,neckDegrees:6,headDegrees:10,armOutDegrees:0,soleLimit:.20},
];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const args=process.argv.slice(2);
if(args.length!==2)throw new Error('Usage: node retarget.mjs INPUT.glb OUTPUT.glb');
const [input,output]=args.map(p=>path.resolve(p));
if(input===output||(output.startsWith(REPO+path.sep)&&!output.startsWith(OWN+path.sep)))
  throw new Error('Refusing to overwrite another repository artifact');
const bytes=fs.readFileSync(input);
if(sha(bytes)!==SOURCE_SHA)throw new Error('Unexpected previous model');
for(const c of SOURCES){
  c.path=path.join(HERE,'mocap',c.file);
  if(sha(fs.readFileSync(c.path))!==c.sha)throw new Error(`Unexpected capture: ${c.file}`);
}

const io=new NodeIO(),doc=await io.readBinary(bytes),root=doc.getRoot(),buffer=root.listBuffers()[0];
const nodes=new Map();
for(const node of root.listNodes())if(node.getName().startsWith('Rig_')){
  if(nodes.has(node.getName()))throw new Error(`Duplicate bone ${node.getName()}`);
  nodes.set(node.getName(),node);
}
if(nodes.size!==22||root.listSkins().length!==1)throw new Error('Unexpected source rig');
for(const c of SOURCES)if(root.listAnimations().some(a=>a.getName()===c.name))throw new Error(`Clip already exists: ${c.name}`);

// The target rig has identity bind orientations. A separate Three skeleton is
// used only for the offline retarget and two-link foot fitting.
const target=new Map();
for(const [name,node] of nodes){
  const b=new Bone();b.name=name;b.position.fromArray(node.getTranslation());b.quaternion.fromArray(node.getRotation());
  if(b.quaternion.angleTo(new Quaternion())>1e-7)throw new Error(`Unexpected bind rotation: ${name}`);
  target.set(name,b);
}
for(const [name,bone] of target){
  const parent=nodes.get(name).getParentNode()?.getName();
  if(target.has(parent))target.get(parent).add(bone);
}
const targetRoot=target.get('Rig_Root');targetRoot.updateMatrixWorld(true);
const bodyNodes=root.listNodes().filter(n=>n.getName()==='head_2');
if(bodyNodes.length!==1)throw new Error('Unexpected body mesh');
const body=bodyNodes[0].getMesh().listPrimitives()[0],position=body.getAttribute('POSITION'),
      joints=body.getAttribute('JOINTS_0'),weights=body.getAttribute('WEIGHTS_0'),skin=root.listSkins()[0];
const rig=skin.listJoints().map(n=>target.get(n.getName())),inverseAccessor=skin.getInverseBindMatrices(),
      inverse=rig.map((_,i)=>new Matrix4().fromArray(inverseAccessor.getElement(i,[]))),
      matrices=rig.map(()=>new Matrix4());
if(rig.some(b=>!b))throw new Error('Skin has an unknown bone');
const sole=[];
for(let i=0;i<position.getCount();i++){
  const p=position.getElement(i,[]);
  if(p[1]>=.12||Math.abs(p[0])<=.03||Math.abs(p[0])>=.22)continue;
  // Neither existing corrective morph moves the sampled feet.
  for(const morph of body.listTargets()){
    const a=morph.getAttribute('POSITION');
    if(a&&Math.hypot(...a.getElement(i,[]))>1e-8)throw new Error('A foot morph needs to be included in the solver');
  }
  sole.push({side:p[0]>0?'L':'R',p:new Vector3().fromArray(p),j:joints.getElement(i,[]),w:weights.getElement(i,[])});
}
if(!sole.some(v=>v.side==='L')||!sole.some(v=>v.side==='R'))throw new Error('Missing feet');
function minimumFoot(side){
  targetRoot.updateMatrixWorld(true);
  for(let j=0;j<rig.length;j++)matrices[j].multiplyMatrices(rig[j].matrixWorld,inverse[j]);
  let minimum=Infinity;
  for(const vertex of sole){
    if(vertex.side!==side)continue;
    let y=0;
    for(let k=0;k<4;k++)if(vertex.w[k]){
      const e=matrices[vertex.j[k]].elements,p=vertex.p;
      y+=vertex.w[k]*(e[1]*p.x+e[5]*p.y+e[9]*p.z+e[13]);
    }
    minimum=Math.min(minimum,y);
  }
  return minimum;
}

// Source/target names correspond to the same anatomical segment. Global bind
// directions are aligned before local rotations are recovered; frame zero in
// the BVH is Hahne's synthetic T-pose, NOT a frame of recorded motion.
const TRACKS=new Map([
  ['Rig_Hips','Hips'],['Rig_Spine','Spine'],['Rig_Chest','Spine1'],['Rig_Neck','Neck1'],['Rig_Head','Head'],
  ['Rig_UpperArm_L','LeftArm'],['Rig_Forearm_L','LeftForeArm'],['Rig_UpperArm_R','RightArm'],['Rig_Forearm_R','RightForeArm'],
  ['Rig_Thigh_L','LeftUpLeg'],['Rig_Shin_L','LeftLeg'],['Rig_Foot_L','LeftFoot'],
  ['Rig_Thigh_R','RightUpLeg'],['Rig_Shin_R','RightLeg'],['Rig_Foot_R','RightFoot'],
]);
const SEGMENTS=[
  ['Rig_UpperArm_L','Rig_Forearm_L','LeftArm','LeftForeArm'],['Rig_Forearm_L','Rig_Hand_L','LeftForeArm','LeftHand'],
  ['Rig_UpperArm_R','Rig_Forearm_R','RightArm','RightForeArm'],['Rig_Forearm_R','Rig_Hand_R','RightForeArm','RightHand'],
  ['Rig_Thigh_L','Rig_Shin_L','LeftUpLeg','LeftLeg'],['Rig_Shin_L','Rig_Foot_L','LeftLeg','LeftFoot'],['Rig_Foot_L','Rig_Toes_L','LeftFoot','LeftToeBase'],
  ['Rig_Thigh_R','Rig_Shin_R','RightUpLeg','RightLeg'],['Rig_Shin_R','Rig_Foot_R','RightLeg','RightFoot'],['Rig_Foot_R','Rig_Toes_R','RightFoot','RightToeBase'],
];
const radians=degrees=>degrees*Math.PI/180;
const axisX=new Vector3(1,0,0),axisZ=new Vector3(0,0,1);
const worldPosition=b=>b.getWorldPosition(new Vector3());
const worldRotation=b=>b.getWorldQuaternion(new Quaternion());

// Move an ankle toward an offline target while preserving its world
// orientation and the capture's current knee bend plane. Not runtime IK.
function solveLeg(side,targetPoint){
  const thigh=target.get('Rig_Thigh_'+side),shin=target.get('Rig_Shin_'+side),foot=target.get('Rig_Foot_'+side);
  targetRoot.updateMatrixWorld(true);
  const hip=worldPosition(thigh);let knee=worldPosition(shin),ankle=worldPosition(foot);
  const footRotation=worldRotation(foot),upper=hip.distanceTo(knee),lower=knee.distanceTo(ankle);
  let direction=targetPoint.clone().sub(hip),distance=direction.length();
  if(distance>upper+lower-.0001){
    direction.multiplyScalar((upper+lower-.0001)/distance);targetPoint=hip.clone().add(direction);distance=direction.length();
  }
  if(distance<=Math.abs(upper-lower)+1e-6)throw new Error('Degenerate IK target');
  direction.normalize();
  const along=(upper*upper+distance*distance-lower*lower)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-along*along));
  let plane=knee.clone().sub(hip).addScaledVector(direction,-knee.clone().sub(hip).dot(direction));
  if(plane.lengthSq()<1e-10)plane.set(0,0,1).addScaledVector(direction,-direction.z);
  plane.normalize();
  const newKnee=hip.clone().addScaledVector(direction,along).addScaledVector(plane,height);
  let turn=new Quaternion().setFromUnitVectors(knee.clone().sub(hip).normalize(),newKnee.clone().sub(hip).normalize());
  let world=turn.multiply(worldRotation(thigh)),parent=worldRotation(thigh.parent);
  thigh.quaternion.copy(parent.invert().multiply(world));targetRoot.updateMatrixWorld(true);
  knee=worldPosition(shin);ankle=worldPosition(foot);
  turn.setFromUnitVectors(ankle.clone().sub(knee).normalize(),targetPoint.clone().sub(knee).normalize());
  world=turn.multiply(worldRotation(shin));parent=worldRotation(shin.parent);
  shin.quaternion.copy(parent.invert().multiply(world));targetRoot.updateMatrixWorld(true);
  parent=worldRotation(foot.parent);foot.quaternion.copy(parent.invert().multiply(footRotation));targetRoot.updateMatrixWorld(true);
}

function buildClip(c){
  const parsed=new BVHLoader().parse(fs.readFileSync(c.path,'utf8'));
  const sourceRoot=parsed.skeleton.bones[0],mixer=new AnimationMixer(sourceRoot),action=mixer.clipAction(parsed.clip).play();action.paused=true;
  const source=new Map(parsed.skeleton.bones.map(b=>[b.name,b]));
  const track=parsed.clip.tracks.find(t=>t.name==='Hips.position');
  if(!track||c.end>=track.times.length||c.start<1)throw new Error(`Invalid frame interval for ${c.file}`);
  const frameTime=track.times[1];
  if(Math.abs(frameTime-1/120)>1e-5)throw new Error(`Unexpected sample rate in ${c.file}`);
  const setFrame=f=>{action.time=f*frameTime;mixer.update(0);sourceRoot.updateMatrixWorld(true)};
  const sq=n=>worldRotation(source.get(n)),sp=n=>worldPosition(source.get(n)),tp=n=>worldPosition(target.get(n));
  setFrame(0);targetRoot.position.set(0,0,0);
  for(const bone of target.values())bone.quaternion.identity();
  targetRoot.updateMatrixWorld(true);
  const inverseBind=new Map([...TRACKS].map(([,name])=>[name,sq(name).invert()])),align=new Map();
  for(const [tb,tc,sb,sc] of SEGMENTS){
    const targetDirection=tp(tc).sub(tp(tb)).normalize(),sourceDirection=sp(sc).sub(sp(sb)).normalize();
    align.set(tb,new Quaternion().setFromUnitVectors(targetDirection,sourceDirection));
  }
  const sourceRestHip=sp('Hips').y,scale=.049,footBind={Left:sq('LeftFoot').invert(),Right:sq('RightFoot').invert()};
  const frames=[];
  for(let f=c.start;f<=c.end;f++){
    setFrame(f);
    const hipY=(sp('Hips').y-sourceRestHip)*scale;
    targetRoot.position.set(0,hipY,0);for(const bone of target.values())bone.quaternion.identity();targetRoot.updateMatrixWorld(true);
    for(const [targetName,sourceName] of TRACKS){
      const bone=target.get(targetName),desired=sq(sourceName).multiply(inverseBind.get(sourceName)).multiply(align.get(targetName)||new Quaternion());
      // The BVH conversion explicitly warns that its invented T-pose may
      // leave heads looking up and elbows through hips after retargeting.
      if(targetName==='Rig_Neck'||targetName==='Rig_Head')
        desired.multiply(new Quaternion().setFromAxisAngle(axisX,radians(targetName==='Rig_Neck'?c.neckDegrees:c.headDegrees)));
      if(c.armOutDegrees&&targetName.startsWith('Rig_UpperArm_'))
        desired.premultiply(new Quaternion().setFromAxisAngle(axisZ,radians(targetName.endsWith('_L')?c.armOutDegrees:-c.armOutDegrees)));
      bone.quaternion.copy(worldRotation(bone.parent).invert().multiply(desired)).normalize();targetRoot.updateMatrixWorld(true);
    }
    const rotations=new Map([...TRACKS.keys()].map(n=>[n,target.get(n).quaternion.clone()])),desiredSole={};
    for(const [side,letter] of [['Left','L'],['Right','R']]){
      const rotation=sq(side+'Foot').multiply(footBind[side]);
      // Approximate source heel and forefoot points. These are not measured
      // force-plate contacts; they only guide the target's vertical fitting.
      const heel=sp(side+'Foot').add(new Vector3(0,-1.2,-.4).applyQuaternion(rotation));
      const toe=sp(side+'ToeBase').add(new Vector3(0,-.55,0).applyQuaternion(rotation));
      const proxy=Math.min(heel.y,toe.y);
      desiredSole[letter]=.002+Math.min(c.soleLimit,Math.max(0,(proxy-.4)*scale));
    }
    frames.push({hipY,rotations,desiredSole});
  }

  // CMU warns its foot joints can be noisy. Filter foot rotations and the
  // derived sole heights, retaining the measured upper/lower leg trajectory.
  const count=frames.length-1;
  for(const side of ['L','R']){
    const old=frames.map(f=>f.desiredSole[side]);
    for(let i=0;i<=count;i++){
      let sum=0,total=0;
      for(let k=-3;k<=3;k++){
        const weight=Math.exp(-.5*(k/1.7)**2);
        sum+=weight*old[Math.max(0,Math.min(count,i+k))];total+=weight;
      }
      frames[i].desiredSole[side]=sum/total;
    }
  }
  for(const bone of ['Rig_Foot_L','Rig_Foot_R']){
    const old=frames.map(f=>f.rotations.get(bone).clone());
    for(let i=0;i<=count;i++){
      const ref=old[i];let x=0,y=0,z=0,w=0;
      for(let k=-4;k<=4;k++){
        const q=old[Math.max(0,Math.min(count,i+k))],sign=ref.dot(q)<0?-1:1,weight=Math.exp(-.5*(k/2.1)**2)*sign;
        x+=q.x*weight;y+=q.y*weight;z+=q.z*weight;w+=q.w*weight;
      }
      frames[i].rotations.set(bone,new Quaternion(x,y,z,w).normalize());
    }
  }

  // The performer was not perfectly periodic. Taper the residual end/start
  // difference across the last fifth so the selected stride actually loops.
  const first=frames[0],last=frames.at(-1);
  for(let i=0;i<frames.length;i++){
    const phase=i/count,x=Math.max(0,Math.min(1,(phase-.8)/.2)),t=x*x*(3-2*x),frame=frames[i];
    frame.hipY+=(first.hipY-last.hipY)*t;
    for(const side of ['L','R'])frame.desiredSole[side]+=(first.desiredSole[side]-last.desiredSole[side])*t;
    for(const bone of TRACKS.keys()){
      const correction=last.rotations.get(bone).clone().invert().multiply(first.rotations.get(bone));
      frame.rotations.get(bone).multiply(new Quaternion().slerp(correction,t)).normalize();
    }
  }

  const hipMean=frames.reduce((a,f)=>a+f.hipY,0)/frames.length;let worstResidual=0,rootConstraints=0;
  for(const frame of frames){
    targetRoot.position.set(0,0,0);for(const bone of target.values())bone.quaternion.identity();
    for(const [bone,q] of frame.rotations)target.get(bone).quaternion.copy(q);
    targetRoot.updateMatrixWorld(true);
    // Start with measured vertical pelvis motion. Shorten the horizontal foot
    // path for this character and lower the root if a sole target is beyond
    // the two-segment leg's reach. The fitting is baked into the GLB.
    let rootY=frame.hipY-hipMean-.015;const targets={};
    for(const side of ['L','R']){
      const hip=worldPosition(target.get('Rig_Thigh_'+side)),knee=worldPosition(target.get('Rig_Shin_'+side)),ankle=worldPosition(target.get('Rig_Foot_'+side));
      targets[side]={x:ankle.x,z:hip.z+(ankle.z-hip.z)*c.strideScale};
      const ankleY=ankle.y+frame.desiredSole[side]-minimumFoot(side),max=hip.distanceTo(knee)+knee.distanceTo(ankle)-.006,
            dx=targets[side].x-hip.x,dz=targets[side].z-hip.z,remaining=max*max-dx*dx-dz*dz;
      if(remaining<0)throw new Error(`${c.name}: horizontal ankle target is unreachable`);
      const bound=ankleY+Math.sqrt(remaining)-hip.y;
      if(rootY>bound){rootY=bound;rootConstraints++}
    }
    targetRoot.position.set(0,rootY,0);targetRoot.updateMatrixWorld(true);
    for(let iteration=0;iteration<3;iteration++)for(const side of ['L','R']){
      const ankle=worldPosition(target.get('Rig_Foot_'+side)),delta=frame.desiredSole[side]-minimumFoot(side);
      ankle.y+=delta;ankle.x=targets[side].x;ankle.z=targets[side].z;solveLeg(side,ankle);
    }
    for(const side of ['L','R'])worstResidual=Math.max(worstResidual,Math.abs(minimumFoot(side)-frame.desiredSole[side]));
    frame.hipY=rootY;
    for(const bone of frame.rotations.keys())frame.rotations.set(bone,target.get(bone).quaternion.clone());
  }
  if(worstResidual>1e-4)throw new Error(`${c.name}: offline sole fit error ${worstResidual}`);

  const animation=doc.createAnimation(c.name),times=Float32Array.from(frames.map((_,i)=>c.duration*i/count));
  const inputTime=doc.createAccessor(c.name+'_Time',buffer).setType(Accessor.Type.SCALAR).setArray(times);
  function addChannel(bone,pathName,width,values){
    const output=doc.createAccessor(c.name+'_'+bone+'_'+pathName,buffer)
      .setType(width===4?Accessor.Type.VEC4:Accessor.Type.VEC3).setArray(values);
    const sampler=doc.createAnimationSampler().setInput(inputTime).setOutput(output).setInterpolation('LINEAR');
    animation.addSampler(sampler).addChannel(doc.createAnimationChannel().setTargetNode(nodes.get(bone)).setTargetPath(pathName).setSampler(sampler));
  }
  addChannel('Rig_Root','translation',3,Float32Array.from(frames.flatMap(f=>[0,f.hipY,0])));
  for(const bone of TRACKS.keys()){
    let previous=null;const values=new Float32Array(frames.length*4);
    for(let i=0;i<frames.length;i++){
      const q=frames[i].rotations.get(bone);
      if(previous&&previous.dot(q)<0)q.set(-q.x,-q.y,-q.z,-q.w);
      q.toArray(values,i*4);previous=q;
    }
    addChannel(bone,'rotation',4,values);
  }
  return {name:c.name,source:c.file,sourceSha256:c.sha,sourceFrames:[c.start,c.end],sourceFrameTime:frameTime,
    duration:c.duration,strideScale:c.strideScale,neckDegrees:c.neckDegrees,headDegrees:c.headDegrees,
    armOutDegrees:c.armOutDegrees,rootConstraints,worstSoleFitMetres:worstResidual,
    rootY:[Math.min(...frames.map(f=>f.hipY)),Math.max(...frames.map(f=>f.hipY))]};
}
const clips=SOURCES.map(buildClip);

// glTF-Transform replaces an empty morph target name with its numeric index
// on read. Restore the original names explicitly, so serialization does not
// silently alter the accepted model's targetNames metadata.
const sourceJSON=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
for(const sourceNode of sourceJSON.nodes.filter(n=>n.mesh!==undefined)){
  const mesh=sourceJSON.meshes[sourceNode.mesh],names=mesh.extras?.targetNames;
  if(!names)continue;
  const matching=root.listNodes().filter(n=>n.getName()===sourceNode.name);
  if(matching.length!==1)throw new Error(`Cannot restore morph names: ${sourceNode.name}`);
  for(const primitive of matching[0].getMesh().listPrimitives()){
    const targets=primitive.listTargets();
    if(targets.length!==names.length)throw new Error(`Unexpected morph target count: ${sourceNode.name}`);
    targets.forEach((target,index)=>target.setName(names[index]));
  }
}
const result=Buffer.from(await io.writeBinary(doc));fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,result);
console.log(JSON.stringify({sourceSha256:SOURCE_SHA,outputSha256:sha(result),bytes:result.length,bones:rig.length,
  soleVertices:sole.length,clips,allAnimations:root.listAnimations().map(a=>a.getName())},null,2));
