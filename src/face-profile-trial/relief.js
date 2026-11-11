import * as THREE from 'three';
// Sculpt subtle, symmetric broad relief into a private already-subdivided head.
// Compact support keeps the nose, lips, ears and head silhouette untouched.
const smooth=t=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t)};
const bump=(x,c,r)=>{const q=Math.abs(x-c)/r;return q>=1?0:(1-q*q)**2};
export function shapeFaceRelief(g,female){
 const p=g.attributes.position,uv=g.attributes.uv,original=g.attributes.normal.clone(),weights=new Float32Array(p.count);
 for(let i=0;i<p.count;i++){
  const phi=(uv.getX(i)-.5)*2*Math.PI,a=Math.abs(phi),v=uv.getY(i);
  // Work on the front face only. Zones deliberately exclude central nose and lips.
  const cheek=bump(a,.57,.30)*bump(v,.435,.105);
  const orbit=bump(a,.42,.21)*bump(v,.505,.050);
  const brow=bump(a,.43,.23)*bump(v,.567,.038);
  const nasolabial=bump(a,.36,.13)*bump(v,.365,.035);
  const underlip=bump(a,0,.25)*bump(v,.270,.032);
  const temple=bump(a,.87,.17)*bump(v,.565,.10);
  let dz=(female?.0025:.0032)*cheek-.0015*orbit+(female?.0012:.0018)*brow-.00055*nasolabial-.00065*underlip-.0005*temple;
  // Exact exclusion for existing nose and lips and their adjacent transition.
  if((a<.26&&v>.37&&v<.57)||(a<.30&&v>.30&&v<.36))dz=0;
  if(dz){p.setZ(i,p.getZ(i)+dz);weights[i]=Math.min(1,Math.abs(dz)/.001);}
 }
 p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;
 for(let i=0;i<n.count;i++){
  const w=weights[i]*.30,v=new THREE.Vector3(original.getX(i),original.getY(i),original.getZ(i)).lerp(new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i)),w).normalize();n.setXYZ(i,v.x,v.y,v.z);
 }
 n.needsUpdate=true;
}
