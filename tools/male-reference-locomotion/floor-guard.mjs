import {Matrix4} from 'three';

// This is a small vertical root correction after animation blending, NOT
// foot-lock IK. It uses every vertex in the original foot/ankle regions and
// the actual skin matrices. It cannot keep planted feet from sliding in X/Z.
export function createFloorGuard(player,male,body){
  const root=male.getObjectByName('Rig_Root'),skin=body.skeleton,g=body.geometry,
        rest=g.attributes.position,indices=g.attributes.skinIndex,weights=g.attributes.skinWeight;
  const points=[],used=new Set(),matrices=skin.bones.map(()=>new Matrix4());
  for(let i=0;i<rest.count;i++){
    const x=rest.getX(i),y=rest.getY(i),z=rest.getZ(i);
    if(y>=.12||Math.abs(x)<=.03||Math.abs(x)>=.22)continue;
    const js=[],ws=[];
    for(let k=0;k<4;k++){
      const weight=weights.getComponent(i,k);
      if(weight>1e-8){const joint=indices.getComponent(i,k);js.push(joint);ws.push(weight);used.add(joint)}
    }
    points.push({x,y,z,js,ws});
  }
  if(!points.length)throw new Error('Не найдены точки стоп');
  return function preventFloorPenetration(){
    player.updateMatrixWorld(true);
    for(const j of used)matrices[j].multiplyMatrices(skin.bones[j].matrixWorld,skin.boneInverses[j]).multiply(body.bindMatrix);
    let minimum=Infinity;
    for(const p of points){
      let y=0;
      for(let k=0;k<p.js.length;k++){
        const m=matrices[p.js[k]].elements;
        y+=p.ws[k]*(m[1]*p.x+m[5]*p.y+m[9]*p.z+m[13]);
      }
      minimum=Math.min(minimum,y);
    }
    const correction=Math.max(0,.001-minimum);
    if(correction>1e-8){root.position.y+=correction;player.updateMatrixWorld(true)}
    return {minimum,correction};
  };
}
