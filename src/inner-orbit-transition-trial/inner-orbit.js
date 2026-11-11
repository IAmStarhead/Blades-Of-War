import * as THREE from 'three';
// A symmetric, shallow medial orbital hollow between the drawn inner eye
// corners and the bridge. Fade to zero before the bridge centre and cheeks.
const bump=(x,c,r)=>{const q=(x-c)/r;return Math.abs(q)>=1?0:(1-q*q)**2};
export function innerOrbit(g){
 const p=g.attributes.position,uv=g.attributes.uv,old=g.attributes.normal.clone();
 g.computeVertexNormals();const base=g.attributes.normal.clone();
 for(let i=0;i<p.count;i++){
  const x=Math.abs(uv.getX(i)*512-256), y=(1-uv.getY(i))*512;
  const dz=-.0028*bump(x,17,11)*bump(y,252,18);
  if(dz)p.setZ(i,p.getZ(i)+dz);
 }
 p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;
 for(let i=0;i<n.count;i++){
  const normal=new THREE.Vector3(old.getX(i),old.getY(i),old.getZ(i));
  normal.addScaledVector(new THREE.Vector3(n.getX(i)-base.getX(i),n.getY(i)-base.getY(i),n.getZ(i)-base.getZ(i)),.65).normalize();
  n.setXYZ(i,normal.x,normal.y,normal.z);
 }
 n.needsUpdate=true;
}
