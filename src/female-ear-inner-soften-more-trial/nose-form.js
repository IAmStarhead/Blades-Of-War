import * as THREE from 'three';
const bump=(x,c,r)=>{let t=(x-c)/r;return Math.abs(t)>=1?0:(1-t*t)**2};
// Sculpt a rounded tip, two soft alar wings, and a subtle continuous bridge.
// All changes taper to zero before the mouth and eye socket.
export function shapeNose(g,female){
 const p=g.attributes.position,uv=g.attributes.uv,old=g.attributes.normal.clone();
 g.computeVertexNormals();const baseline=g.attributes.normal.clone();
 for(let i=0;i<p.count;i++){
  const phi=Math.abs((uv.getX(i)-.5)*2*Math.PI),v=uv.getY(i);
  const bridge=bump(phi,0,.24)*bump(v,.458,.072);
  const tip=bump(phi,0,.25)*bump(v,.415,.048);
  const wings=bump(phi,.15,.12)*bump(v,.411,.043);
  const dz=(female?.0010:.0014)*bridge+(female?.0023:.0030)*tip+(female?.0010:.0015)*wings;
  if(dz)p.setZ(i,p.getZ(i)+dz);
 }
 p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;
 for(let i=0;i<n.count;i++){
  const value=new THREE.Vector3(old.getX(i),old.getY(i),old.getZ(i));
  value.addScaledVector(new THREE.Vector3(n.getX(i)-baseline.getX(i),n.getY(i)-baseline.getY(i),n.getZ(i)-baseline.getZ(i)),.48).normalize();n.setXYZ(i,value.x,value.y,value.z);
 }
 n.needsUpdate=true;
}
