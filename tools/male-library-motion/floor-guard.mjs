import {Matrix4,Quaternion,Vector3} from 'three';

// A light vertical correction for blended poses. If a foot crosses the floor,
// first fold that leg toward the closest reachable ankle target while keeping
// the existing foot orientation. Only any remaining error lifts the root.
// This is NOT horizontal foot locking, contact physics, or a general IK system.
export function createFloorGuard(player,male,body){
  const root=male.getObjectByName('Rig_Root'),skin=body.skeleton,g=body.geometry,
        rest=g.attributes.position,indices=g.attributes.skinIndex,weights=g.attributes.skinWeight;
  const points={L:[],R:[]},used=new Set(),matrices=skin.bones.map(()=>new Matrix4());
  for(let i=0;i<rest.count;i++){
    const x=rest.getX(i),y=rest.getY(i),z=rest.getZ(i);
    if(y>=.12||Math.abs(x)<=.03||Math.abs(x)>=.22)continue;
    const js=[],ws=[];
    for(let k=0;k<4;k++){
      const weight=weights.getComponent(i,k);
      if(weight>1e-8){const joint=indices.getComponent(i,k);js.push(joint);ws.push(weight);used.add(joint)}
    }
    points[x>0?'L':'R'].push({x,y,z,js,ws});
  }
  if(!points.L.length||!points.R.length)throw new Error('Не найдены точки стоп');
  const position=b=>b.getWorldPosition(new Vector3()),rotation=b=>b.getWorldQuaternion(new Quaternion());
  function minima(){
    player.updateMatrixWorld(true);
    for(const j of used)matrices[j].multiplyMatrices(skin.bones[j].matrixWorld,skin.boneInverses[j]).multiply(body.bindMatrix);
    const out={L:Infinity,R:Infinity};
    for(const side of ['L','R'])for(const p of points[side]){
      let y=0;for(let k=0;k<p.js.length;k++){
        const m=matrices[p.js[k]].elements;y+=p.ws[k]*(m[1]*p.x+m[5]*p.y+m[9]*p.z+m[13]);
      }out[side]=Math.min(out[side],y);
    }
    return out;
  }
  function raiseFoot(side,delta){
    const thigh=male.getObjectByName('Rig_Thigh_'+side),shin=male.getObjectByName('Rig_Shin_'+side),foot=male.getObjectByName('Rig_Foot_'+side);
    player.updateMatrixWorld(true);
    const hip=position(thigh);let knee=position(shin),ankle=position(foot);
    const footWorld=rotation(foot),upper=hip.distanceTo(knee),lower=knee.distanceTo(ankle);
    const target=ankle.clone().add(new Vector3(0,delta,0));let direction=target.clone().sub(hip),distance=direction.length();
    const lo=Math.abs(upper-lower)+.0001,hi=upper+lower-.0001;
    if(distance<1e-8)return;
    if(distance<lo||distance>hi){distance=Math.max(lo,Math.min(hi,distance));direction.setLength(distance);target.copy(hip).add(direction)}
    direction.normalize();const along=(upper*upper+distance*distance-lower*lower)/(2*distance),height=Math.sqrt(Math.max(0,upper*upper-along*along));
    let plane=knee.clone().sub(hip).addScaledVector(direction,-knee.clone().sub(hip).dot(direction));
    const forward=new Vector3(0,0,1).applyQuaternion(rotation(player));forward.addScaledVector(direction,-forward.dot(direction));
    if(forward.lengthSq()<1e-10)return;forward.normalize();
    const lateral=direction.clone().cross(forward).normalize();
    if(plane.lengthSq()<1e-10)plane.copy(forward);else plane.normalize();
    const coherence=Math.max(0,Math.min(1,plane.dot(forward)/.25));
    const offset=Math.max(-.20,Math.min(.20,plane.dot(lateral)))*coherence;
    plane.copy(forward).multiplyScalar(Math.sqrt(1-offset*offset)).addScaledVector(lateral,offset).normalize();
    const newKnee=hip.clone().addScaledVector(direction,along).addScaledVector(plane,height);
    let turn=new Quaternion().setFromUnitVectors(knee.clone().sub(hip).normalize(),newKnee.clone().sub(hip).normalize());
    let world=turn.multiply(rotation(thigh));thigh.quaternion.copy(rotation(thigh.parent).invert().multiply(world)).normalize();player.updateMatrixWorld(true);
    knee=position(shin);ankle=position(foot);
    turn.setFromUnitVectors(ankle.clone().sub(knee).normalize(),target.clone().sub(knee).normalize());
    world=turn.multiply(rotation(shin));shin.quaternion.copy(rotation(shin.parent).invert().multiply(world)).normalize();player.updateMatrixWorld(true);
    foot.quaternion.copy(rotation(foot.parent).invert().multiply(footWorld)).normalize();player.updateMatrixWorld(true);
  }
  return function preventFloorPenetration(allowIK=true,ikStrength=1){
    let minimum=minima(),ik=0;
    // Near the fully upright end of a crouch transition, the bind knee is
    // almost straight. Fade out IK there to avoid a sudden switch between
    // the forward-bend solution and the unchanged bind pose. The root handles
    // the rest. Split the requested strength over the three remeasurements.
    const strength=Math.max(0,Math.min(1,ikStrength)),fraction=1-Math.pow(1-strength,1/3);
    // The sole has a small share of shin weights, so remeasure after fitting.
    for(let iteration=0;allowIK&&iteration<3;iteration++)for(const side of ['L','R']){
      const delta=(.001-minimum[side])*fraction;if(delta>1e-5){raiseFoot(side,delta);ik=Math.max(ik,delta);minimum=minima()}
    }
    const before=Math.min(minimum.L,minimum.R),correction=Math.max(0,.001-before);
    if(correction>1e-8){root.position.y+=correction;player.updateMatrixWorld(true)}
    return {minimum:before,correction,ik};
  };
}
