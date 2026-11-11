import * as THREE from 'three';
// Bring the outer ear toward the head without scaling its height or profile.
// This is a visual adjustment on independent ear meshes, not a welded join.
export function settleEars(ears,female){
 for(const ear of ears){
  const side=ear.name.endsWith('left')?-1:1,g=ear.geometry,p=g.attributes.position,anchor=female?.070:.077;
  for(let i=0;i<p.count;i++){
   const x=side*p.getX(i),over=Math.max(0,x-anchor);
   p.setX(i,side*(x-.20*over));
  }
  p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal,acc=new Map();
  const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(x=>x.toFixed(6)).join(',');
  for(let i=0;i<p.count;i++){const k=key(i),v=acc.get(k)||new THREE.Vector3();v.add(new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i)));acc.set(k,v)}
  for(let i=0;i<p.count;i++){const v=acc.get(key(i)).clone().normalize();n.setXYZ(i,v.x,v.y,v.z)}n.needsUpdate=true;
 }
}
