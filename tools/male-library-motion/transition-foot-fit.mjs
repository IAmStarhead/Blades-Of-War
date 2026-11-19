import {AnimationMixer,Quaternion,Vector3} from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {createFloorGuard} from './floor-guard.mjs';

// During a blend into or out of the new deep squat, matching joint rotations
// directly can drag the soles well below the old trajectory. A non-rendered
// clone evaluates the *delivered* blended pose and its existing floor guard.
// The new legs then aim at those old ankle positions and foot orientations.
// This is a transition aid, not a horizontal plant/foot lock or physics.
export function createTransitionFootFit(player,male,clips){
  const reference=clone(male);reference.visible=false;reference.name='delivered-transition-reference';player.add(reference);
  const body=reference.getObjectByName('head_2'),mixer=new AnimationMixer(reference),actions={};
  const names={soft:'Relaxed_Hands_Idle',old:'Relaxed_Hands_Previous_Idle',walk:'Leg_Refined_Walk',run:'Leg_Refined_Run',
    crouchIdle:'Leg_Refined_Crouch_Idle',crouchWalk:'Leg_Refined_Crouch_Walk'};
  for(const [kind,name] of Object.entries(names)){
    const clip=clips.get(name);if(!clip)throw Error('Не найден эталон перехода '+name);
    const action=mixer.clipAction(clip.clone());action.reset().play();action.paused=true;action.setEffectiveWeight(0);actions[kind]=action;
  }
  const guard=createFloorGuard(player,reference,body),worldPosition=b=>b.getWorldPosition(new Vector3()),worldRotation=b=>b.getWorldQuaternion(new Quaternion());
  const root=reference.getObjectByName('Rig_Root'),legs=['L','R'].flatMap(side=>['Thigh','Shin','Foot'].map(name=>reference.getObjectByName(`Rig_${name}_${side}`)));
  let rawPose=null;
  function solve(side,goal,footWorld){
    const thigh=male.getObjectByName('Rig_Thigh_'+side),shin=male.getObjectByName('Rig_Shin_'+side),foot=male.getObjectByName('Rig_Foot_'+side);
    player.updateMatrixWorld(true);const hip=worldPosition(thigh);let knee=worldPosition(shin),ankle=worldPosition(foot);
    const upper=hip.distanceTo(knee),lower=knee.distanceTo(ankle),direction=goal.clone().sub(hip);let distance=direction.length();
    if(distance<1e-8)return {miss:Infinity};
    const lo=Math.abs(upper-lower)+.0001,hi=upper+lower-.0001,miss=Math.max(0,distance-hi,lo-distance);
    distance=Math.max(lo,Math.min(hi,distance));direction.normalize();const target=hip.clone().addScaledVector(direction,distance);
    const along=(upper*upper+distance*distance-lower*lower)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-along*along));
    // Keep the knee on the forward-facing branch of the two-link solution.
    // Near full extension its raw plane can cross zero and suddenly flip by
    // 180 degrees, even though the ankle target itself changes smoothly.
    const ref=knee.clone().sub(hip),plane=ref.clone().addScaledVector(direction,-ref.dot(direction));
    const forward=new Vector3(0,0,1).applyQuaternion(worldRotation(player));forward.addScaledVector(direction,-forward.dot(direction));
    if(forward.lengthSq()<1e-9)return {miss:Infinity};forward.normalize();
    const lateral=direction.clone().cross(forward).normalize();
    if(plane.lengthSq()<1e-9)plane.copy(forward);else plane.normalize();
    const coherence=Math.max(0,Math.min(1,plane.dot(forward)/.25));
    const offset=Math.max(-.2,Math.min(.2,plane.dot(lateral)))*coherence;
    plane.copy(forward).multiplyScalar(Math.sqrt(1-offset*offset)).addScaledVector(lateral,offset).normalize();
    const desired=hip.clone().addScaledVector(direction,along).addScaledVector(plane,height);
    let turn=new Quaternion().setFromUnitVectors(knee.clone().sub(hip).normalize(),desired.clone().sub(hip).normalize());
    let world=turn.multiply(worldRotation(thigh));thigh.quaternion.copy(worldRotation(thigh.parent).invert().multiply(world)).normalize();player.updateMatrixWorld(true);
    knee=worldPosition(shin);ankle=worldPosition(foot);turn.setFromUnitVectors(ankle.clone().sub(knee).normalize(),target.clone().sub(knee).normalize());
    world=turn.multiply(worldRotation(shin));shin.quaternion.copy(worldRotation(shin.parent).invert().multiply(world)).normalize();player.updateMatrixWorld(true);
    foot.quaternion.copy(worldRotation(foot.parent).invert().multiply(footWorld)).normalize();player.updateMatrixWorld(true);
    return {miss,error:worldPosition(foot).distanceTo(goal)};
  }
  return function fit({phase,breathTime,breath,moving,runBlend,crouch,progress}){
    const standing=1-crouch;
    actions.soft.time=actions.old.time=breathTime%4;
    actions.walk.time=phase;actions.run.time=phase*.70;
    actions.crouchIdle.time=breathTime%2.4;actions.crouchWalk.time=phase*1.6;
    actions.soft.setEffectiveWeight(breath==='soft'?standing*(1-moving):0);
    actions.old.setEffectiveWeight(breath==='old'?standing*(1-moving):0);
    actions.walk.setEffectiveWeight(standing*moving*(1-runBlend));actions.run.setEffectiveWeight(standing*moving*runBlend);
    actions.crouchIdle.setEffectiveWeight(crouch*(1-moving));actions.crouchWalk.setEffectiveWeight(crouch*moving);
    // AnimationMixer skips writes for unchanged values. Restore the unguarded
    // pose first, otherwise repeated renders at the same phase accumulate IK.
    if(rawPose){root.position.copy(rawPose.root);legs.forEach((bone,i)=>bone.quaternion.copy(rawPose.legs[i]))}
    mixer.update(0);rawPose={root:root.position.clone(),legs:legs.map(bone=>bone.quaternion.clone())};
    const t=Math.max(0,Math.min(1,crouch/.60)),strength=progress>0&&progress<1?t*t*(3-2*t):1;
    guard(true,strength);player.updateMatrixWorld(true);
    // Near an upright pose a virtually straight knee has no stable bend
    // plane. Ease into the fitted solution rather than switching branches in
    // one frame; the ordinary floor guard handles the residual there.
    const x=Math.max(0,Math.min(1,crouch/.20)),fit=x*x*(3-2*x);
    let miss=0,error=0;
    for(const side of ['L','R']){
      const bones=['Thigh','Shin','Foot'].map(name=>male.getObjectByName(`Rig_${name}_${side}`));
      const original=bones.map(b=>b.quaternion.clone()),foot=reference.getObjectByName('Rig_Foot_'+side);
      const result=solve(side,worldPosition(foot),worldRotation(foot));
      if(fit<1)for(let i=0;i<bones.length;i++){
        const solved=bones[i].quaternion.clone();bones[i].quaternion.copy(original[i]).slerp(solved,fit).normalize();
      }
      player.updateMatrixWorld(true);
      miss=Math.max(miss,result.miss);error=Math.max(error,result.error||0);
    }
    return {miss,error};
  };
}
