// Animation blending for the pinned male_leg_volume_trial.glb. The two source
// gait clips are not rewritten. Additional poses and their blending are a
// deliberately separate runtime trial, not authored animation clips in the GLB.
import {
  AnimationClip,AnimationMixer,Matrix4,Quaternion,QuaternionKeyframeTrack,
  Vector3,VectorKeyframeTrack,
} from 'three';
import {PhaseClock,wrapPhase,WALK_SPEED,RUN_SPEED} from '../male-stealth-tuning/phase-clock.mjs';
import {floorEnvelope} from '../male-gait-transition/floor-envelope.mjs';
import {KneeVolumeCorrector} from '../male-leg-volume/knee-volume.mjs';
import {createFloorGuard} from '../male-stealth-crouch/floor-guard.mjs';
import combatData from './combat-clips.json';

const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const approach=(x,t,delta)=>x<t?Math.min(t,x+delta):Math.max(t,x-delta);
const ease=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
const radians=x=>x*Math.PI/180;
const axisX=new Vector3(1,0,0),axisZ=new Vector3(0,0,1);
const qx=x=>new Quaternion().setFromAxisAngle(axisX,radians(x));
const qz=x=>new Quaternion().setFromAxisAngle(axisZ,radians(x));
function qtrack(name,times,angles,axis=qx) {
  return new QuaternionKeyframeTrack(name+'.quaternion',times,angles.flatMap(x=>axis(x).toArray()));
}
function standClip() {
  const times=[0,2,4],tracks=[
    new VectorKeyframeTrack('Rig_Root.position',times,[0,-.009,0, 0,-.009,0, 0,-.009,0]),
    qtrack('Rig_Spine',times,[0,.45,0]),qtrack('Rig_Chest',times,[0,.8,0]),
    qtrack('Rig_Neck',times,[0,-.25,0]),qtrack('Rig_Head',times,[0,-.15,0]),
  ];
  for(const [side,sign] of [['L',1],['R',-1]]) {
    tracks.push(qtrack('Rig_UpperArm_'+side,times,[sign*2,sign*2,sign*2],qz));
    tracks.push(qtrack('Rig_Forearm_'+side,times,[-7,-7,-7]));
  }
  return new AnimationClip('Stand_Breathing_Trial',4,tracks);
}
function inspectClip() {
  // The action means looking into the well, not drawing or drinking water.
  // A small right-hand gesture accompanies the forward look.
  const t=[0,.35,.8,1.2,1.6,2.05];
  const tracks=[
    new VectorKeyframeTrack('Rig_Root.position',t,[0,-.009,0, 0,-.009,0, 0,-.009,0, 0,-.009,0, 0,-.009,0, 0,-.009,0]),
    qtrack('Rig_Spine',t,[0,2,8,8,3,0]),qtrack('Rig_Chest',t,[0,2,7,7,2,0]),
    qtrack('Rig_Neck',t,[0,2,7,7,2,0]),qtrack('Rig_Head',t,[0,2,10,10,3,0]),
    qtrack('Rig_UpperArm_R',t,[0,-8,-25,-25,-9,0]),
    qtrack('Rig_Forearm_R',t,[-7,-10,-16,-16,-10,-7]),
    qtrack('Rig_UpperArm_L',t,[2,2,3,3,2,2],x=>qz(x)),
    qtrack('Rig_Forearm_L',t,[-7,-7,-9,-9,-7,-7]),
  ];
  return new AnimationClip('Inspect_Well_Trial',2.05,tracks);
}
function recorded(spec) {
  const tracks=spec.tracks.map(t=>{
    const C=t.type==='vector'?VectorKeyframeTrack:QuaternionKeyframeTrack;
    return new C(t.name,t.times,t.values);
  });
  return new AnimationClip(spec.name,spec.duration,tracks);
}
// Sample the exact same sole region as the delivered phase transition. In
// general, this guards the floor; it does not implement planted-foot locking.
function createSoleGuard(model,root,mesh) {
  const p=mesh.geometry.getAttribute('position'),j=mesh.geometry.getAttribute('skinIndex'),w=mesh.geometry.getAttribute('skinWeight');
  if(!p||!j||!w||!mesh.skeleton||!root.parent)throw Error('Не найдены данные стоп модели');
  const points=[],used=new Set();
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    if(y>=.16||Math.abs(x)<=.035||Math.abs(x)>=.25)continue;
    const influences=[];
    for(let k=0;k<4;k++){const weight=w.getComponent(i,k),joint=j.getComponent(i,k);if(weight>1e-8){influences.push([joint,weight]);used.add(joint)}}
    if(influences.length)points.push({x,y,z,influences});
  }
  if(points.length<100)throw Error('Не найдены точки обеих стоп');
  const matrices=mesh.skeleton.bones.map(()=>new Matrix4()),prefix=new Matrix4(),inverseParent=new Matrix4(),delta=new Vector3();
  return function guard(phase,runWeight,anticipatedStrength,combatAnticipated=0) {
    model.updateWorldMatrix(true,true);
    // SkinnedMesh updates bindMatrixInverse here; this matters when the
    // parent actor turns or translates, even though our ground is flat.
    mesh.updateMatrixWorld(true);
    prefix.multiplyMatrices(mesh.matrixWorld,mesh.bindMatrixInverse);
    for(const k of used) matrices[k].copy(prefix).multiply(mesh.skeleton.bones[k].matrixWorld)
      .multiply(mesh.skeleton.boneInverses[k]).multiply(mesh.bindMatrix);
    let minimum=Infinity;
    for(const point of points){
      let y=0;
      for(const [k,weight] of point.influences){const e=matrices[k].elements;y+=weight*(e[1]*point.x+e[5]*point.y+e[9]*point.z+e[13])}
      minimum=Math.min(minimum,y);
    }
    const x=.002-minimum,required=x<=0?0:x<.002?x*x/.004:x-.001;
    const anticipated=Math.max(floorEnvelope(phase,runWeight)*clamp(anticipatedStrength,0,1),combatAnticipated);
    const lift=Math.max(required,anticipated);
    if(lift>0){
      inverseParent.copy(root.parent.matrixWorld).invert();const e=inverseParent.elements;
      delta.set(e[4]*lift,e[5]*lift,e[6]*lift);root.position.add(delta);model.updateWorldMatrix(true,true);
    }
    return {minimumBefore:minimum,lift,required,anticipated,vertices:points.length};
  };
}
const COMBAT_SPEED=1.10;
export class CharacterMotion {
  constructor(model,animations,{reducedMotion=false}={}) {
    this.model=model;this.root=model.getObjectByName('Rig_Root');const mesh=model.getObjectByName('NewBody');
    const walk=animations.find(x=>x.name==='Walk_Game_Trial'),run=animations.find(x=>x.name==='Run_Game_Trial');
    if(!this.root||!mesh?.isSkinnedMesh||!walk||!run||!walk.tracks.some(t=>t.name==='Rig_Root.position')||!run.tracks.some(t=>t.name==='Rig_Root.position'))
      throw Error('Модель не совпадает с принятой пробой ходьбы и бега');
    this.clock=new PhaseClock(walk.duration,run.duration);this.mixer=new AnimationMixer(model);
    const byName=Object.fromEntries(combatData.clips.map(spec=>[spec.name,recorded(spec)]));
    const clips={walk,run,idle:standClip(),inspect:inspectClip(),guard:byName.Combat_Guard,combatWalk:byName.Combat_Walk,
      jab:byName.Combat_Jab,cross:byName.Combat_Cross,kickR:byName.Combat_Kick_R,kickL:byName.Combat_Kick_L};
    if(Object.values(clips).some(x=>!x))throw Error('Не найдены движения безоружного боя');
    this.actions={};for(const name of ['walk','run','idle','inspect','guard','combatWalk']){
      const action=this.mixer.clipAction(clips[name]).reset().play();action.paused=true;action.setEffectiveWeight(0);this.actions[name]=action;
    }
    // Two instances per attack let a repeated strike crossfade from its
    // still-visible earlier instance rather than resetting the visible pose.
    this.slots=[];for(const name of ['jab','cross','kickR','kickL'])for(let i=0;i<2;i++){
      const copy=clips[name].clone();copy.name=clips[name].name+'_slot_'+i;
      const action=this.mixer.clipAction(copy).reset().play();action.paused=true;action.setEffectiveWeight(0);
      this.slots.push({name,action,time:0,weight:0});
    }
    this.clips=clips;this.guard=createSoleGuard(model,this.root,mesh);this.volume=new KneeVolumeCorrector(model);
    this.blendGuard=createFloorGuard(model.parent,model,mesh);
    this.legBones=['Thigh','Shin','Foot'].flatMap(part=>['L','R'].map(side=>model.getObjectByName(`Rig_${part}_${side}`)));
    if(this.legBones.some(b=>!b))throw Error('Не найдены кости ног');
    this.rawLegRotations=null;this.reducedMotion=reducedMotion;this.baseRootPosition=null;
    this.move=0;this.combat=0;this.combatVelocity=0;this.combatMove=0;this.combatPhase=0;this.idleTime=0;this.floor=null;
    this.activeAttack=null;this.pendingAttack=null;this.fadeResponse=17;this.render({inspectTime:null});
  }
  reset(){
    this.clock.reset('walk',0);this.move=0;this.combat=0;this.combatVelocity=0;this.combatMove=0;this.combatPhase=0;this.idleTime=0;
    this.activeAttack=null;this.pendingAttack=null;this.fadeResponse=17;for(const slot of this.slots){slot.weight=0;slot.time=0;slot.action.setEffectiveWeight(0)}
    this.render({inspectTime:null});
  }
  attack(name){
    if(!['jab','cross','kickR','kickL'].includes(name))throw Error('Unknown unarmed attack');
    // When another strike is already visible, fade more gently: switching a
    // fully extended kick at 25% weight per frame produced a foot teleport.
    this.fadeResponse=this.slots.some(s=>s.weight>.02)?5:17;
    const candidates=this.slots.filter(x=>x.name===name&&x.weight<.001);
    if(!candidates.length){this.pendingAttack=name;this.activeAttack=null;return false}
    const slot=candidates[0];slot.time=0;this.activeAttack=slot;this.pendingAttack=null;return true;
  }
  cancelAttack(){this.fadeResponse=this.slots.some(s=>s.weight>.02)?5:17;this.activeAttack=null;this.pendingAttack=null}
  get striking(){return !!this.activeAttack||!!this.pendingAttack}
  step(dt,{speed=0,running=false,fighting=false,turning=0,inspectTime=null}={}) {
    if(!Number.isFinite(dt)||dt<0)throw Error('Invalid frame time');
    // This is the earlier controller's original walk/run phase and mixing.
    const speedWeight=clamp((speed-WALK_SPEED)/(RUN_SPEED-WALK_SPEED),0,1);
    this.clock.setTargetWeight(speedWeight);
    const previous=this.clock.phase;this.clock.step(dt);
    const increment=(this.clock.phase-previous+1)%1;
    const ratio=clamp(Math.max(speed/Math.max(.001,this.clock.speed),turning*.40),0,1.25);
    this.clock.phase=wrapPhase(previous+increment*ratio);
    const targetMove=clamp(Math.max(speed/WALK_SPEED,turning*.55),0,1);
    this.move=approach(this.move,targetMove,dt*4.2);
    const targetCombatMove=clamp(Math.max(speed/COMBAT_SPEED,turning*.55),0,1);
    this.combatMove=approach(this.combatMove,targetCombatMove,dt*4.2);
    // The fight step uses the same walking legs. Share their phase clock so
    // entering, exiting or rapidly reversing combat cannot jump between two
    // unrelated steps, including while the old run blend is slowing down.
    this.combatPhase=this.clock.phase;
    // Critically damped, reversible blend: switching out of combat never waits
    // for an entry, exit or attack clip to finish.
    const target=fighting?1:0,response=12,y=this.combat-target,v=this.combatVelocity,k=v+response*y,e=Math.exp(-response*dt);
    this.combat=clamp(target+(y+k*dt)*e,0,1);this.combatVelocity=(v-response*k*dt)*e;
    if(!this.reducedMotion)this.idleTime=(this.idleTime+dt)%24;
    for(const slot of this.slots){
      if(slot.weight>.000001||slot===this.activeAttack)slot.time=Math.min(this.clips[slot.name].duration,slot.time+dt);
    }
    if(this.activeAttack&&this.activeAttack.time>=this.clips[this.activeAttack.name].duration){this.activeAttack=null;this.fadeResponse=17}
    const alpha=1-Math.exp(-dt*this.fadeResponse);
    for(const slot of this.slots){slot.weight+=(Number(slot===this.activeAttack)-slot.weight)*alpha;if(slot.weight<1e-7)slot.weight=0}
    if(this.pendingAttack){const pending=this.pendingAttack;if(this.slots.some(s=>s.name===pending&&s.weight<.001))this.attack(pending)}
    this.render({inspectTime});
  }
  render({inspectTime=null}={}) {
    if(this.baseRootPosition)this.root.position.copy(this.baseRootPosition);
    if(this.rawLegRotations)this.legBones.forEach((b,i)=>b.quaternion.copy(this.rawLegRotations[i]));
    const a=this.actions,c=this.combat,m=this.move,fm=this.combatMove;
    const duration=this.clips.inspect.duration,isInspect=Number.isFinite(inspectTime)&&inspectTime>=0&&inspectTime<=duration;
    const inspection=isInspect?ease(inspectTime/.30)*ease((duration-inspectTime)/.30):0;
    const strikeWeight=Math.min(1,this.slots.reduce((sum,s)=>sum+s.weight,0)),other=(1-inspection)*(1-strikeWeight);
    a.idle.time=this.idleTime%this.clips.idle.duration;a.walk.time=this.clock.phase*this.clock.walkDuration;
    a.run.time=this.clock.runPhase*this.clock.runDuration;a.guard.time=this.idleTime%this.clips.guard.duration;
    a.combatWalk.time=this.combatPhase*this.clips.combatWalk.duration;a.inspect.time=isInspect?inspectTime:0;
    a.idle.setEffectiveWeight(other*(1-c)*(1-m));
    a.walk.setEffectiveWeight(other*(1-c)*m*(1-this.clock.weight));a.run.setEffectiveWeight(other*(1-c)*m*this.clock.weight);
    a.guard.setEffectiveWeight(other*c*(1-fm));a.combatWalk.setEffectiveWeight(other*c*fm);a.inspect.setEffectiveWeight(inspection);
    for(const slot of this.slots){slot.action.time=slot.time;slot.action.setEffectiveWeight((1-inspection)*slot.weight)}
    this.mixer.update(0);
    if(!this.baseRootPosition)this.baseRootPosition=this.root.position.clone();else this.baseRootPosition.copy(this.root.position);
    this.rawLegRotations=this.legBones.map(b=>b.quaternion.clone());
    // For the full ordinary gait, all corrective strengths remain identical
    // to the earlier trial. Combat and action blends get a floor guard, not
    // planted-foot physics; avoid forcing a kicking knee into an IK plane.
    const locomotionBlend=(1-c)*ease((1-m)/.25),entryBlend=ease(c/.22)*ease((1-c)/.22);
    const strength=Math.max(locomotionBlend,entryBlend);
    const fitting=strength>1e-7?this.blendGuard(strikeWeight<.05,strength):{correction:0,ik:0};
    const combatAnticipated=floorEnvelope(this.combatPhase,0)*other*c*fm;
    this.floor=this.guard(this.clock.phase,this.clock.weight,other*(1-c)*m,combatAnticipated);
    this.floor.blendLift=fitting.correction;this.floor.ik=fitting.ik;this.volume.apply();
  }
}
