import * as THREE from 'three';
const bump=(x,c,r)=>{let q=(x-c)/r;return Math.abs(q)>=1?0:(1-q*q)**2};
// Broad, symmetric, compact-support planes. No changes to nose, mouth or brows.
export function addFacialPlanes(g,female){
 const p=g.attributes.position,uv=g.attributes.uv,old=g.attributes.normal.clone();g.computeVertexNormals();const baseline=g.attributes.normal.clone();let max=0;
 for(let i=0;i<p.count;i++){
  let a=Math.abs((uv.getX(i)-.5)*2*Math.PI),v=uv.getY(i),x=p.getX(i);
  // Side of skull and face merges gradually into the ear region.
  let temple=bump(a,1.25,.62)*bump(v,.60,.18);
  let side=bump(a,1.05,.44)*bump(v,.44,.14);
  // Broad transition under eyes and alongside nose: not a cheekbone lump.
  let underEye=bump(a,.48,.27)*bump(v,.477,.075);
  let noseSide=bump(a,.30,.14)*bump(v,.445,.075);
  let dx=-Math.sign(x)*((female?.003:.004)*temple+.0015*side);
  let dz=(female?.002:.0026)*underEye-.0014*noseSide;
  p.setX(i,x+dx);p.setZ(i,p.getZ(i)+dz);max=Math.max(max,Math.hypot(dx,dz));
 }
 p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;
 for(let i=0;i<n.count;i++){
  let q=new THREE.Vector3(old.getX(i),old.getY(i),old.getZ(i));q.addScaledVector(new THREE.Vector3(n.getX(i)-baseline.getX(i),n.getY(i)-baseline.getY(i),n.getZ(i)-baseline.getZ(i)),.65).normalize();n.setXYZ(i,q.x,q.y,q.z);
 }n.needsUpdate=true;g.userData.extraPlanesMax=max;
}
