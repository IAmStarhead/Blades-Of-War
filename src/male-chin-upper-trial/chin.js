import * as THREE from 'three';
const bump=(x,c,r)=>{let q=(x-c)/r;return Math.abs(q)>=1?0:(1-q*q)**2};
// Gently advance the centre of the chin with a smooth fade to the jaw and
// lower lip; neither neck nor the drawing of the mouth is altered.
export function projectChin(g){
 const p=g.attributes.position,uv=g.attributes.uv,old=g.attributes.normal.clone();g.computeVertexNormals();const base=g.attributes.normal.clone();
 for(let i=0;i<p.count;i++){
  const a=Math.abs((uv.getX(i)-.5)*Math.PI*2),v=uv.getY(i);
  const dz=bump(a,0,.52)*(.0045*bump(v,.235,.075)+.0032*bump(v,.282,.045));
  if(dz)p.setZ(i,p.getZ(i)+dz);
 }
 p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;
 for(let i=0;i<n.count;i++){
  const q=new THREE.Vector3(old.getX(i),old.getY(i),old.getZ(i));
  q.addScaledVector(new THREE.Vector3(n.getX(i)-base.getX(i),n.getY(i)-base.getY(i),n.getZ(i)-base.getZ(i)),.5).normalize();n.setXYZ(i,q.x,q.y,q.z);
 }
 n.needsUpdate=true;
}
