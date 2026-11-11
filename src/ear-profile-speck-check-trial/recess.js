import * as THREE from 'three';
// Trial-only space behind the reference ear. This alters the side of the
// private head geometry, not the face or neck, and does not weld the ear.
export function makeEarSpace(rig,female,softer=false){
 const g=rig.headMesh.geometry,p=g.attributes.position,old=g.attributes.normal.clone();g.computeVertexNormals();const before=g.attributes.normal.clone();
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),z=p.getZ(i),dy=(y-(female?.081:.084))/.025,dz=(z-(female?-.010:-.014))/.025;
  const r=dy*dy+dz*dz;if(Math.abs(x)<(female?.052:.058)||r>=1)continue;
  const w=(1-r)*(1-r);p.setX(i,x-Math.sign(x)*(softer?.0085:.010)*w);
 }p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;
 for(let i=0;i<n.count;i++){let a=new THREE.Vector3(old.getX(i),old.getY(i),old.getZ(i));a.add(new THREE.Vector3(n.getX(i)-before.getX(i),n.getY(i)-before.getY(i),n.getZ(i)-before.getZ(i)).multiplyScalar(softer?.18:.7)).normalize();n.setXYZ(i,a.x,a.y,a.z)}n.needsUpdate=true;
}
