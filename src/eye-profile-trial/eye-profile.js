import * as THREE from 'three';
const smooth=(a,b,x)=>{let t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
// Flatten the small eye surfaces to face the character's forward direction,
// with a smooth blend back to the unmodified temples and brow. This is a
// geometry experiment, not a rotating eye or camera-facing billboard.
export function orientEyes(g){
 const p=g.attributes.position,uv=g.attributes.uv,prev=p.array.slice(),old=g.attributes.normal.clone();g.computeVertexNormals();const base=g.attributes.normal.clone();
 function z(r,t){return prev[3*(r*65+t)+2]}
 function at(u,v){const f=v*40,r=Math.max(0,Math.min(39,Math.floor(f))),rv=f-r,t=u*64,i=Math.max(0,Math.min(63,Math.floor(t))),tv=t-i;return (1-rv)*((1-tv)*z(r,i)+tv*z(r,i+1))+rv*((1-tv)*z(r+1,i)+tv*z(r+1,i+1))}
 for(let i=0;i<p.count;i++){
  const u=uv.getX(i),v=uv.getY(i),center=u<.5?222.7/512:289.3/512,dx=Math.abs(u-center);
  const mask=(1-smooth(.010,.060,dx))*smooth(.466,.495,v)*(1-smooth(.521,.548,v));
  if(mask){const target=at(center,v);p.setZ(i,p.getZ(i)+(target-p.getZ(i))*.32*mask)}
 }
 p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;for(let i=0;i<p.count;i++){
  const v=new THREE.Vector3(old.getX(i),old.getY(i),old.getZ(i)).add(new THREE.Vector3(n.getX(i)-base.getX(i),n.getY(i)-base.getY(i),n.getZ(i)-base.getZ(i))).normalize();n.setXYZ(i,v.x,v.y,v.z)
 }n.needsUpdate=true;
}
