import * as THREE from 'three';
const bump=(x,c,r)=>{const q=Math.abs(x-c)/r;return q>=1?0:(1-q*q)**2};
// Local broad low-amplitude z changes, never touching the central nose/lips.
export function enhanceRelief(g,female){
 const p=g.attributes.position,uv=g.attributes.uv,n0=g.attributes.normal.clone(),weights=new Float32Array(p.count);
 for(let i=0;i<p.count;i++){
  const a=Math.abs((uv.getX(i)-.5)*2*Math.PI),v=uv.getY(i);
  if((a<.30&&v>.30&&v<.36)||(a<.26&&v>.37&&v<.57))continue;
  const dz=(female?.0018:.0023)*bump(a,.60,.32)*bump(v,.445,.11)-.0007*bump(a,.42,.20)*bump(v,.51,.05)+.0005*bump(a,.44,.21)*bump(v,.57,.045)-.0003*bump(a,.36,.12)*bump(v,.365,.035);
  if(dz){p.setZ(i,p.getZ(i)+dz);weights[i]=Math.min(1,Math.abs(dz)/.001)}
 }
 p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;
 for(let i=0;i<n.count;i++){const v=new THREE.Vector3(n0.getX(i),n0.getY(i),n0.getZ(i)).lerp(new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i)),weights[i]*.22).normalize();n.setXYZ(i,v.x,v.y,v.z)}n.needsUpdate=true;
}
