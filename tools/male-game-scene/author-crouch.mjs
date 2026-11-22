// Author two experimental crouch poses specifically for the pinned 52-bone
// character. This writes animation data only; it does not alter the GLB.
// The 22-bone stealth trial is an algorithmic reference, not a compatible clip.
import {NodeIO} from '@gltf-transform/core';
import {Bone, Euler, Matrix4, Quaternion, Vector3} from 'three';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const model = path.join(repo, 'work/male-leg-volume/male_leg_volume_trial.glb');
const expected = 'eb569ef2269a8d7e40378590614beebc933edd3bdcd7340f8146494ceb975484';
const bytes = fs.readFileSync(model);
if (createHash('sha256').update(bytes).digest('hex') !== expected) throw Error('Unexpected input character');
const doc = await new NodeIO().readBinary(bytes), root = doc.getRoot();
const skin = root.listSkins()[0], nodes = skin.listJoints(), names = nodes.map(n => n.getName());
if (nodes.length !== 52) throw Error('Expected the 52-bone character');
const meshNode = root.listNodes().find(n => n.getName() === 'NewBody');
const prim = meshNode?.getMesh()?.listPrimitives()[0];
if (!prim || !meshNode.getSkin()) throw Error('Missing skinned NewBody mesh');
const position = prim.getAttribute('POSITION'), joints = prim.getAttribute('JOINTS_0'), weights = prim.getAttribute('WEIGHTS_0');
const rig = new Map();
for (const node of nodes) {
  const bone = new Bone();
  bone.name = node.getName(); bone.position.fromArray(node.getTranslation());
  bone.quaternion.fromArray(node.getRotation()); bone.scale.fromArray(node.getScale());
  if (bone.quaternion.angleTo(new Quaternion()) > 1e-7 || bone.scale.distanceTo(new Vector3(1,1,1)) > 1e-7)
    throw Error(`Unexpected bind transform ${bone.name}`);
  rig.set(bone.name, bone);
}
for (const node of nodes) {
  const parent = node.getParentNode()?.getName();
  if (rig.has(parent)) rig.get(parent).add(rig.get(node.getName()));
}
const skeleton = rig.get('Rig_Root');
const inverse = nodes.map((_, i) => new Matrix4().fromArray(skin.getInverseBindMatrices().getElement(i, [])));
const matrices = nodes.map(() => new Matrix4());
const sole = {L: [], R: []};
for (let i = 0; i < position.getCount(); i++) {
  const [x,y,z] = position.getElement(i, []);
  if (y >= .16 || Math.abs(x) <= .035 || Math.abs(x) >= .25) continue;
  sole[x > 0 ? 'L' : 'R'].push({p: [x,y,z], j: joints.getElement(i, []), w: weights.getElement(i, [])});
}
if (sole.L.length < 50 || sole.R.length < 50) throw Error('Expected both sole regions');
const P = bone => bone.getWorldPosition(new Vector3());
const Q = bone => bone.getWorldQuaternion(new Quaternion());
const rad = x => x * Math.PI / 180;
const X = new Vector3(1,0,0), Y = new Vector3(0,1,0), Z = new Vector3(0,0,1);
const qx = x => new Quaternion().setFromAxisAngle(X, rad(x));
const qy = x => new Quaternion().setFromAxisAngle(Y, rad(x));
const qz = x => new Quaternion().setFromAxisAngle(Z, rad(x));
const clamp = (v,a,b) => Math.max(a, Math.min(b,v));
const smooth = t => { t = clamp(t,0,1); return t*t*(3-2*t); };
function reset() {
  for (const node of nodes) {
    const bone = rig.get(node.getName());
    bone.position.fromArray(node.getTranslation()); bone.quaternion.fromArray(node.getRotation());
    bone.scale.fromArray(node.getScale());
  }
  skeleton.updateMatrixWorld(true);
}
function minimumFoot(side) {
  skeleton.updateMatrixWorld(true);
  for (let i = 0; i < nodes.length; i++) matrices[i].multiplyMatrices(rig.get(names[i]).matrixWorld, inverse[i]);
  let min = Infinity;
  for (const v of sole[side]) {
    let y = 0;
    for (let k = 0; k < 4; k++) if (v.w[k]) {
      const e = matrices[v.j[k]].elements;
      y += v.w[k]*(e[1]*v.p[0] + e[5]*v.p[1] + e[9]*v.p[2] + e[13]);
    }
    min = Math.min(min,y);
  }
  return min;
}
// Two-bone solve constrained to forward-bending knees; retain foot orientation.
function solveLeg(side, goal) {
  const thigh = rig.get('Rig_Thigh_'+side), shin = rig.get('Rig_Shin_'+side), foot = rig.get('Rig_Foot_'+side);
  skeleton.updateMatrixWorld(true);
  const a = P(thigh); let b = P(shin), c = P(foot);
  const footQ = Q(foot), l1 = a.distanceTo(b), l2 = b.distanceTo(c);
  const direction = goal.clone().sub(a); let distance = direction.length();
  if (distance < 1e-8) throw Error('Degenerate leg target');
  const miss = Math.max(0, distance-(l1+l2-.0002), Math.abs(l1-l2)+.0002-distance);
  distance = clamp(distance,Math.abs(l1-l2)+.0002,l1+l2-.0002);
  direction.normalize(); const target = a.clone().addScaledVector(direction,distance);
  const along=(l1*l1+distance*distance-l2*l2)/(2*distance);
  const height=Math.sqrt(Math.max(0,l1*l1-along*along));
  const forward=new Vector3(0,0,1).addScaledVector(direction,-direction.z);
  if (forward.lengthSq()<1e-10) throw Error('Degenerate knee plane');
  forward.normalize(); const desired=a.clone().addScaledVector(direction,along).addScaledVector(forward,height);
  let turn=new Quaternion().setFromUnitVectors(b.clone().sub(a).normalize(),desired.clone().sub(a).normalize());
  thigh.quaternion.copy(Q(thigh.parent).invert().multiply(turn.multiply(Q(thigh)))).normalize(); skeleton.updateMatrixWorld(true);
  b=P(shin); c=P(foot);
  turn.setFromUnitVectors(c.clone().sub(b).normalize(),target.clone().sub(b).normalize());
  shin.quaternion.copy(Q(shin.parent).invert().multiply(turn.multiply(Q(shin)))).normalize(); skeleton.updateMatrixWorld(true);
  foot.quaternion.copy(Q(foot.parent).invert().multiply(footQ)).normalize(); skeleton.updateMatrixWorld(true);
  return miss;
}
function footRoll(pitch) {
  const a=rad(pitch), z=pitch<0?-.045:.145, y=-.086;
  return z-(z*Math.cos(a)+y*Math.sin(a));
}
function pathAt(t,c) {
  t=((t%1)+1)%1; const A=c.speed*c.duration*c.stance/2;
  if (t<c.stance) {
    const s=t/c.stance;
    return {z:A*(1-2*s),height:0,pitch:-4*(1-smooth(s/.2))+10*smooth((s-.77)/.23),contact:true};
  }
  const s=(t-c.stance)/(1-c.stance),m=-2*A*(1-c.stance)/c.stance;
  return {z:(2*s*s*s-3*s*s+1)*(-A)+(s*s*s-2*s*s+s)*m+(-2*s*s*s+3*s*s)*A+(s*s*s-s*s)*m,
    height:.050*Math.sin(Math.PI*Math.pow(s,.85))**2,pitch:10+(-4-10)*smooth(s),contact:false};
}
const animated = names.filter(n => !n.startsWith('Rig_Finger') && n !== 'Rig_Root');
function makeCrouch(kind) {
  const walking=kind==='walk', c={duration:walking?1.6:2.4,speed:.38,stance:.68}, steps=120;
  const frames=[], stats={soleResidual:0,reachMiss:0,rootY:[Infinity,-Infinity],kneeDegrees:[Infinity,-Infinity],hipDegrees:[Infinity,-Infinity],flightFrames:0};
  for (let i=0;i<steps;i++) {
    const phase=i/steps,wave=Math.cos(2*Math.PI*phase),shift=Math.sin(2*Math.PI*phase),breath=Math.sin(2*Math.PI*phase);
    reset();
    const rootX=walking?.003*shift:0,rootY=-.195+(walking?.003*Math.cos(4*Math.PI*phase):.0015*breath);
    skeleton.position.set(rootX,rootY,0);
    rig.get('Rig_Hips').quaternion.copy(qy(walking?-1.5*wave:0).multiply(qz(walking?.6*shift:0)).multiply(qx(4)));
    rig.get('Rig_Spine').quaternion.copy(qy(walking?2*wave:0).multiply(qx(14+(walking?.3*shift:.4*breath))));
    rig.get('Rig_Chest').quaternion.copy(qx(3+(walking?0:.5*breath)));
    rig.get('Rig_Neck').quaternion.copy(qx(-9)); rig.get('Rig_Head').quaternion.copy(qx(-8));
    const paths={};
    for (const [side,sign,offset] of [['L',1,0],['R',-1,.5]]) {
      const t=(phase+offset)%1,arm=walking?8*Math.cos(2*Math.PI*t):0;
      rig.get('Rig_UpperArm_'+side).quaternion.copy(qz(sign*6).multiply(qx(-8+arm)));
      rig.get('Rig_Forearm_'+side).quaternion.copy(qx(-30+(walking?2*Math.sin(2*Math.PI*t):breath)));
      paths[side]=walking?pathAt(t,c):{z:sign*.015,height:0,pitch:0,contact:true};
    }
    if (!paths.L.contact && !paths.R.contact) stats.flightFrames++;
    skeleton.updateMatrixWorld(true);
    const goals={};
    for (const [side,sign] of [['L',1],['R',-1]]) {
      const foot=rig.get('Rig_Foot_'+side), shin=rig.get('Rig_Shin_'+side), motion=paths[side];
      foot.quaternion.copy(Q(shin).invert().multiply(qy(sign*4).multiply(qx(motion.pitch)))); skeleton.updateMatrixWorld(true);
      const ankle=P(foot),targetY=.002+motion.height;
      goals[side]={x:sign*.139,z:-.033+motion.z+footRoll(motion.pitch),targetY,y:ankle.y+targetY-minimumFoot(side)};
    }
    for (let iteration=0;iteration<7;iteration++) for (const side of ['L','R']) {
      const g=goals[side],ankle=P(rig.get('Rig_Foot_'+side));
      const miss=solveLeg(side,new Vector3(g.x,ankle.y+g.targetY-minimumFoot(side),g.z));
      if (iteration===6) stats.reachMiss=Math.max(stats.reachMiss,miss);
    }
    for (const side of ['L','R']) {
      const residual=Math.abs(minimumFoot(side)-goals[side].targetY);stats.soleResidual=Math.max(stats.soleResidual,residual);
      const a=P(rig.get('Rig_Thigh_'+side)),b=P(rig.get('Rig_Shin_'+side)),d=P(rig.get('Rig_Foot_'+side));
      const bend=b.clone().sub(a).normalize().angleTo(d.clone().sub(b).normalize())*180/Math.PI;
      const hip=-new Euler().setFromQuaternion(rig.get('Rig_Thigh_'+side).quaternion,'XYZ').x*180/Math.PI;
      stats.kneeDegrees[0]=Math.min(stats.kneeDegrees[0],bend);stats.kneeDegrees[1]=Math.max(stats.kneeDegrees[1],bend);
      stats.hipDegrees[0]=Math.min(stats.hipDegrees[0],hip);stats.hipDegrees[1]=Math.max(stats.hipDegrees[1],hip);
    }
    stats.rootY[0]=Math.min(stats.rootY[0],rootY);stats.rootY[1]=Math.max(stats.rootY[1],rootY);
    frames.push({root:skeleton.position.toArray(),rotations:new Map(animated.map(n=>[n,rig.get(n).quaternion.clone()]))});
  }
  if (stats.soleResidual>.005 || stats.reachMiss>.005 || stats.flightFrames) throw Error('Crouch fitting error '+JSON.stringify(stats));
  frames.push({root:[...frames[0].root],rotations:new Map([...frames[0].rotations].map(([n,q])=>[n,q.clone()]))});
  const rounded=v=>Math.round(v*1e7)/1e7;
  const times=frames.map((_,i)=>rounded(c.duration*i/steps));
  const tracks=[{name:'Rig_Root.position',type:'vector',times,values:frames.flatMap(f=>f.root.map(rounded))}];
  for (const name of animated) {
    const values=[];let previous=null;
    for (const frame of frames) {
      const q=frame.rotations.get(name).clone();if(previous && previous.dot(q)<0)q.set(-q.x,-q.y,-q.z,-q.w);
      values.push(...q.toArray().map(rounded));previous=q;
    }
    tracks.push({name:name+'.quaternion',type:'quaternion',times,values});
  }
  return {name:walking?'Crouch_Walk_Trial':'Crouch_Idle_Trial',duration:c.duration,speed:walking?c.speed:0,tracks,stats};
}
const data={modelSha256:expected,notes:'Procedural trial on the current 52-bone rig, not old 22-bone clips. Floor samples exclude knee morphs, which do not affect soles.',clips:[makeCrouch('idle'),makeCrouch('walk')]};
const output=process.argv[2]?path.resolve(process.argv[2]):path.join(here,'crouch-clips.json');
if (output===model || (output.startsWith(repo+path.sep) && output!==path.join(here,'crouch-clips.json'))) throw Error('Refusing to overwrite another repo artifact');
fs.writeFileSync(output,JSON.stringify(data)+'\n');
console.log(JSON.stringify(data.clips.map(({name,duration,speed,stats})=>({name,duration,speed,stats})),null,2));
