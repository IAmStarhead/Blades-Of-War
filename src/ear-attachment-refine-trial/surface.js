import * as THREE from 'three';
const smooth=(a,b,x)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
const gaussian=(x,center,width)=>Math.exp(-(((x-center)/width)**2));
// Trial on a private head: broad orbital/cheek volumes, tapered before the
// accepted central nose and mouth. Existing face texture remains in place.
export function sculptSurface(g,female){
 const p=g.attributes.position,uv=g.attributes.uv,old=g.attributes.normal.clone(),w=new Float32Array(p.count);let max=0;
 for(let i=0;i<p.count;i++){
  const u=uv.getX(i),v=uv.getY(i),a=Math.abs((u-.5)*Math.PI*2);
  const side=smooth(.28,.67,a)*(1-smooth(1.10,1.65,a));
  const cheek=side*gaussian(v,.455,.13);
  const orbit=gaussian(a,.48,.27)*gaussian(v,.505,.050)*smooth(.27,.44,a);
  const brow=gaussian(a,.49,.29)*gaussian(v,.565,.07)*smooth(.27,.44,a);
  const dz=(female?.0018:.0025)*cheek-(female?.0008:.0012)*orbit+(female?.0008:.0012)*brow;
  // Exact guard including a broad smooth margin for the approved nose/mouth.
  const protect=(1-smooth(.26,.53,a))*smooth(.30,.38,v)*(1-smooth(.57,.65,v));
  const mouth=(1-smooth(.30,.54,a))*smooth(.26,.30,v)*(1-smooth(.36,.43,v));
  const guard=1-Math.max(protect,mouth),d=dz*guard;
  const width=(female?.040:.065)*side*gaussian(v,.46,.16)*guard;const dx=p.getX(i)*width;
  p.setX(i,p.getX(i)+dx);p.setZ(i,p.getZ(i)+d);w[i]=Math.min(1,(Math.abs(d)+Math.abs(dx))/.003);max=Math.max(max,Math.hypot(dx,d));
 }
 p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;
 for(let i=0;i<n.count;i++){const q=new THREE.Vector3(old.getX(i),old.getY(i),old.getZ(i)).lerp(new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i)),w[i]*.35).normalize();n.setXYZ(i,q.x,q.y,q.z)}n.needsUpdate=true;g.userData.surfaceMax=max;
}
