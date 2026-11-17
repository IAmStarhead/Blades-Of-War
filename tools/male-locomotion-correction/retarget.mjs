// Add two adapted CMU clips and four local, zero-by-default joint correctives.
// Base geometry, skin weights, nape normals and previous poses are preserved;
// the old arm-morph weight track is padded to match the expanded morph count.
// See README.md and mocap/READMEFIRST.txt for source, calibration and limits.
import {Accessor, NodeIO} from '@gltf-transform/core';
import {BVHLoader} from 'three/addons/loaders/BVHLoader.js';
import {AnimationMixer, Bone, Euler, Matrix4, Quaternion, Vector3} from 'three';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const REPO=path.resolve(HERE,'../..');
const OWN=path.join(REPO,'work/male-locomotion-correction');
const SOURCE_SHA='a7a2d08f8c92a11c713cc855a734437a98cd7e3e1e6cf8e19baafe32db572343';
const SOURCES=[
  {name:'Corrected_Walk',file:'02_02.bvh',sha:'569a1dcb5dba169249761fe32c9fc1e5fed5e75db43bd50576a514e57d1ca7a1',
   start:141,end:257,duration:1.0,strideScale:.50,neckDegrees:18,headDegrees:27,headYawCenter:2,headRollCenter:-3,armOutDegrees:17,kneeSideLimit:0,soleLimit:.08},
  {name:'Corrected_Run',file:'02_03.bvh',sha:'6f4d38b92b041221030de2e1058903e0f7a8fa08f9c6c9efabf7df9a128011ac',
   start:48,end:139,duration:.75,strideScale:.90,neckDegrees:15,headDegrees:29,headYawCenter:.4,headRollCenter:-.5,spineDegrees:-4,armOutDegrees:20,kneeSideLimit:.20,soleLimit:.20},
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

// In linear blend skinning the blend of two rotations contracts the mesh at
// bends. These four conservative, zero-by-default corrective morph targets are
// baked into the GLB; no custom viewer shader or change to the skin weights.
// For a canonical joint bend, use 65% of the difference toward a two-bone
// dual-quaternion reference, mapped back through the LBS matrix to bind space.
// DQS can bulge, so this is deliberately partial, not a claim of exact anatomy.
const CORRECTIVES=[
  {name:'Elbow_L',parent:'Rig_UpperArm_L',child:'Rig_Forearm_L',axis:[-.85,0,.5268],degrees:100},
  {name:'Elbow_R',parent:'Rig_UpperArm_R',child:'Rig_Forearm_R',axis:[-.85,0,-.5268],degrees:100},
  {name:'Knee_L',parent:'Rig_Thigh_L',child:'Rig_Shin_L',axis:[1,0,0],degrees:100},
  {name:'Knee_R',parent:'Rig_Thigh_R',child:'Rig_Shin_R',axis:[1,0,0],degrees:100},
];
const totalVertices=position.getCount(),basePos=new Float64Array(totalVertices*3),baseNormal=new Float64Array(totalVertices*3);
const normalAttr=body.getAttribute('NORMAL'),groups=new Map(),groupOf=new Uint32Array(totalVertices);
for(let i=0;i<totalVertices;i++){
  const p=position.getElement(i,[]),n=normalAttr.getElement(i,[]);basePos.set(p,3*i);baseNormal.set(n,3*i);
  const key=p.join(',')+'|'+n.join(',');let id=groups.get(key);if(id===undefined){id=groups.size;groups.set(key,id)}groupOf[i]=id;
}
const skinIndex=new Map(skin.listJoints().map((b,i)=>[b.getName(),i]));
const oldBodyWeights=bodyNodes[0].getMesh().getWeights();
if(oldBodyWeights.length!==2||body.listTargets().length!==2)throw new Error('Unexpected body morph layout');
function correctedNormals(delta){
  const before=new Float64Array(groups.size*3),after=new Float64Array(groups.size*3),indices=body.getIndices().getArray();
  function face(a,b,c,morph){
    const v=i=>new Vector3(basePos[3*i]+(morph?delta[3*i]:0),basePos[3*i+1]+(morph?delta[3*i+1]:0),basePos[3*i+2]+(morph?delta[3*i+2]:0));
    const A=v(a),B=v(b).sub(A),C=v(c).sub(A);return B.cross(C);
  }
  for(let i=0;i<indices.length;i+=3){const tri=[indices[i],indices[i+1],indices[i+2]],a=face(...tri,false),b=face(...tri,true);
    for(const index of tri){const g=3*groupOf[index];before[g]+=a.x;before[g+1]+=a.y;before[g+2]+=a.z;after[g]+=b.x;after[g+1]+=b.y;after[g+2]+=b.z}
  }
  const output=new Float32Array(totalVertices*3);let changed=0,maxAngle=0;
  for(let i=0;i<totalVertices;i++){
    const j=3*i,g=3*groupOf[i],a=new Vector3().fromArray(before,g),b=new Vector3().fromArray(after,g);
    if(a.distanceToSquared(b)<1e-24||a.lengthSq()<1e-24||b.lengthSq()<1e-24)continue;
    const n=new Vector3().fromArray(baseNormal,j),newN=n.clone().add(b.normalize()).sub(a.normalize()).normalize();
    const d=newN.sub(n);d.toArray(output,j);if(d.lengthSq()>1e-14)changed++;
    maxAngle=Math.max(maxAngle,2*Math.asin(Math.min(1,d.length()/2))*180/Math.PI);
  }
  return {output,changed,maxAngle};
}
let correctiveStats=[];
for(const c of CORRECTIVES){
  targetRoot.position.set(0,0,0);for(const b of target.values())b.quaternion.identity();targetRoot.updateMatrixWorld(true);
  const pivot=worldPosition(target.get(c.child)),q=new Quaternion().setFromAxisAngle(new Vector3().fromArray(c.axis).normalize(),radians(c.degrees));
  const shift=pivot.clone().sub(pivot.clone().applyQuaternion(q));
  const dual=new Quaternion(shift.x,shift.y,shift.z,0).multiply(q);
  dual.set(dual.x*.5,dual.y*.5,dual.z*.5,dual.w*.5);
  const mat=new Matrix4().makeRotationFromQuaternion(q);mat.setPosition(shift);
  const delta=new Float32Array(totalVertices*3);let moved=0,max=0;
  for(let i=0;i<totalVertices;i++){
    const js=joints.getElement(i,[]),ws=weights.getElement(i,[]);let a=0,b=0;
    for(let k=0;k<4;k++){if(js[k]===skinIndex.get(c.parent))a+=ws[k];if(js[k]===skinIndex.get(c.child))b+=ws[k]}
    const sum=a+b;if(sum<.98||a<1e-4||b<1e-4)continue;
    a/=sum;b/=sum;
    const real=new Quaternion(q.x*b,q.y*b,q.z*b,a+q.w*b),len=Math.hypot(real.x,real.y,real.z,real.w);
    real.set(real.x/len,real.y/len,real.z/len,real.w/len);
    const d=new Quaternion(dual.x*b/len,dual.y*b/len,dual.z*b/len,dual.w*b/len).multiply(real.clone().conjugate());
    const p=new Vector3().fromArray(basePos,3*i),ideal=p.clone().applyQuaternion(real).add(new Vector3(d.x,d.y,d.z).multiplyScalar(2));
    const elements=mat.elements,M=new Matrix4();for(let k=0;k<16;k++)M.elements[k]=b*elements[k]+a*(k%5===0?1:0);
    const corrected=ideal.applyMatrix4(M.invert()).sub(p);
    // Smoothly suppress non-two-bone areas at the edge of the local region.
    const fade=Math.min(1,Math.max(0,(sum-.98)/.02)),strength=.65*fade;
    corrected.multiplyScalar(strength);corrected.toArray(delta,3*i);let distance=corrected.length();if(distance>1e-7)moved++;max=Math.max(max,distance);
  }
  if(moved<20||max>.04)throw new Error(`Unexpected ${c.name} morph: ${moved}, ${max}`);
  const normal=correctedNormals(delta);
  const morph=doc.createPrimitiveTarget().setName(c.name)
    .setAttribute('POSITION',doc.createAccessor(c.name+'_POSITION',buffer).setType(Accessor.Type.VEC3).setArray(delta))
    .setAttribute('NORMAL',doc.createAccessor(c.name+'_NORMAL',buffer).setType(Accessor.Type.VEC3).setArray(normal.output));
  body.addTarget(morph);correctiveStats.push({name:c.name,movedVertices:moved,maxDeltaMetres:max,normalVertices:normal.changed,maxNormalAngleDegrees:normal.maxAngle});
}
bodyNodes[0].getMesh().setWeights([...oldBodyWeights,...CORRECTIVES.map(()=>0)]);
// The sole existing weight animation is padded with zeroes, preserving its
// two original channels and every earlier pose while satisfying glTF arity.
for(const animation of root.listAnimations())for(const channel of animation.listChannels()){
  if(channel.getTargetNode()!==bodyNodes[0]||channel.getTargetPath()!=='weights')continue;
  const sampler=channel.getSampler(),old=sampler.getOutput(),input=sampler.getInput();
  if(sampler.getInterpolation()!=='LINEAR'||old.getCount()!==input.getCount()*2)throw new Error('Unexpected legacy morph animation');
  const expanded=new Float32Array(input.getCount()*(2+CORRECTIVES.length)),arr=old.getArray();
  for(let i=0;i<input.getCount();i++){expanded[i*6]=arr[i*2];expanded[i*6+1]=arr[i*2+1]}
  sampler.setOutput(doc.createAccessor(animation.getName()+'_BodyWeightsPadded',buffer).setType(Accessor.Type.SCALAR).setArray(expanded));
}
function correctiveWeight(q,c){
  const angle=2*Math.acos(Math.min(1,Math.abs(q.w)));
  return Math.min(1.5,(1-Math.cos(angle/2))/(1-Math.cos(radians(c.degrees)/2)));
}

// Move an ankle toward an offline target while preserving its world
// orientation. A forward-facing knee plane avoids a singularity when the
// captured knee briefly straightens. This is an intentional adaptation.
function solveLeg(side,targetPoint,sideLimit){
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
  const forward=new Vector3(0,0,1).addScaledVector(direction,-direction.z).normalize();
  const lateral=direction.clone().cross(forward).normalize();
  if(plane.lengthSq()<1e-10)plane.copy(forward);else plane.normalize();
  // Near a straight knee the mocap knee plane can flip backwards or sideways.
  // Keep the hinge facing forward and retain only a small lateral component.
  const coherence=Math.max(0,Math.min(1,plane.dot(forward)/.25));
  const offset=Math.max(-sideLimit,Math.min(sideLimit,plane.dot(lateral)))*coherence;
  plane.copy(forward).multiplyScalar(Math.sqrt(1-offset*offset)).addScaledVector(lateral,offset).normalize();
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
      // Calibrate the facing direction in this character's coordinates and
      // damp, rather than freeze, the source head oscillation in three axes.
      if(targetName==='Rig_Head'){
        const e=new Euler().setFromQuaternion(desired,'YXZ');
        e.x*=.7;e.y=(e.y-radians(c.headYawCenter))*.7;e.z=(e.z-radians(c.headRollCenter))*.7;
        desired.setFromEuler(e);
      }
      if(c.spineDegrees&&targetName==='Rig_Spine')desired.multiply(new Quaternion().setFromAxisAngle(axisX,radians(c.spineDegrees)));
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
      ankle.y+=delta;ankle.x=targets[side].x;ankle.z=targets[side].z;solveLeg(side,ankle,c.kneeSideLimit);
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
  // Baked, standard glTF morph weights track local joint flexion. The original
  // arm and neck morphs remain independent; the viewer may toggle the neck.
  const values=new Float32Array(frames.length*(2+CORRECTIVES.length));
  for(let i=0;i<frames.length;i++){
    values[6*i]=oldBodyWeights[0];values[6*i+1]=oldBodyWeights[1];
    for(let j=0;j<CORRECTIVES.length;j++)values[6*i+2+j]=correctiveWeight(frames[i].rotations.get(CORRECTIVES[j].child),CORRECTIVES[j]);
  }
  const morphOutput=doc.createAccessor(c.name+'_BodyWeights',buffer).setType(Accessor.Type.SCALAR).setArray(values);
  const morphSampler=doc.createAnimationSampler().setInput(inputTime).setOutput(morphOutput).setInterpolation('LINEAR');
  animation.addSampler(morphSampler).addChannel(doc.createAnimationChannel().setTargetNode(bodyNodes[0]).setTargetPath('weights').setSampler(morphSampler));
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
    headYawCenterDegrees:c.headYawCenter,headRollCenterDegrees:c.headRollCenter,headMotionFactor:.7,spineDegrees:c.spineDegrees||0,armOutDegrees:c.armOutDegrees,kneeSideLimit:c.kneeSideLimit,rootConstraints,worstSoleFitMetres:worstResidual,
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
    if(targets.length<names.length)throw new Error(`Unexpected morph target count: ${sourceNode.name}`);
    names.forEach((name,index)=>targets[index].setName(name));
  }
}
const result=Buffer.from(await io.writeBinary(doc));fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,result);
console.log(JSON.stringify({sourceSha256:SOURCE_SHA,outputSha256:sha(result),bytes:result.length,bones:rig.length,
  soleVertices:sole.length,correctives:correctiveStats,clips,allAnimations:root.listAnimations().map(a=>a.getName())},null,2));
