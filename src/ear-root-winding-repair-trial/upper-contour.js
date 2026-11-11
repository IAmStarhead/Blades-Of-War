import * as THREE from 'three';
// Ease down the isolated upper root tips with a continuous, tapered movement.
// Outer rim, inner bowl and lobes outside this small region are unchanged.
export function softenRootTips(ears,female){
 for(const ear of ears){
  const g=ear.geometry,p=g.attributes.position,old=g.attributes.normal.clone(),side=ear.name.endsWith('left')?-1:1;
  g.computeVertexNormals();const before=g.attributes.normal.clone();let max=0;
  for(let i=0;i<p.count;i++){
   const x=side*p.getX(i),y=p.getY(i),z=p.getZ(i),edge=female?.076:.081;
   const w=THREE.MathUtils.smoothstep(y,.097,.108)*(1-THREE.MathUtils.smoothstep(x,edge,edge+.005))*(1-THREE.MathUtils.smoothstep(z,-.009,.001));
   const dy=.002*w;p.setY(i,y-dy);max=Math.max(max,dy);
  }p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;
  for(let i=0;i<p.count;i++){const v=new THREE.Vector3(old.getX(i),old.getY(i),old.getZ(i));v.add(new THREE.Vector3(n.getX(i)-before.getX(i),n.getY(i)-before.getY(i),n.getZ(i)-before.getZ(i)).multiplyScalar(.35)).normalize();n.setXYZ(i,v.x,v.y,v.z)}n.needsUpdate=true;ear.userData.tipMax=max;
 }
}
