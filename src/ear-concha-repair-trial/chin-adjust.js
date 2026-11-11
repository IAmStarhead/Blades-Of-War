import * as THREE from 'three';
const bump=(x,c,r)=>{const t=(x-c)/r;return Math.abs(t)>=1?0:(1-t*t)**2};
export function adjustChin(g,female){
 const p=g.attributes.position,uv=g.attributes.uv,old=g.attributes.normal.clone();g.computeVertexNormals();const base=g.attributes.normal.clone();
 for(let i=0;i<p.count;i++){
  const a=Math.abs((uv.getX(i)-.5)*2*Math.PI),v=uv.getY(i);
  const dz=bump(a,0,.55)*((female?.0045:.0040)*bump(v,.24,.085)+(female?.0014:.0010)*bump(v,.28,.045));
  if(dz)p.setZ(i,p.getZ(i)+dz);
 }
 p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;
 for(let i=0;i<n.count;i++){
  const q=new THREE.Vector3(old.getX(i),old.getY(i),old.getZ(i));q.addScaledVector(new THREE.Vector3(n.getX(i)-base.getX(i),n.getY(i)-base.getY(i),n.getZ(i)-base.getZ(i)),.5).normalize();n.setXYZ(i,q.x,q.y,q.z);
 }n.needsUpdate=true;
}
