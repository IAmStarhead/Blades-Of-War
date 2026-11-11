import * as THREE from 'three';
// Pull only the upper inner root of the copied female ear into the scalp.
// Smooth taper, no deletion or change to the lower lobe.
export function settleUpperRoot(ears){
 for(const ear of ears){
  const side=ear.name.endsWith('left')?-1:1,g=ear.geometry,p=g.attributes.position,old=g.attributes.normal.clone();g.computeVertexNormals();const base=g.attributes.normal.clone();
  let max=0;
  for(let i=0;i<p.count;i++){
   const x=side*p.getX(i),y=p.getY(i),z=p.getZ(i);
   const wy=THREE.MathUtils.smoothstep(y,.087,.099),wx=1-THREE.MathUtils.smoothstep(x,.072,.080),wz=1-THREE.MathUtils.smoothstep(z,-.014,-.005);
   const d=.003*wy*wx*wz;max=Math.max(max,d);p.setX(i,side*(x-d));
  }
  p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;
  for(let i=0;i<p.count;i++){const v=new THREE.Vector3(old.getX(i),old.getY(i),old.getZ(i));v.add(new THREE.Vector3(n.getX(i)-base.getX(i),n.getY(i)-base.getY(i),n.getZ(i)-base.getZ(i)).multiplyScalar(.4)).normalize();n.setXYZ(i,v.x,v.y,v.z)}
  n.needsUpdate=true;ear.userData.upperRootMax=max;
 }
}
