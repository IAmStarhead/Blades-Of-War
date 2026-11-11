import * as THREE from 'three';
const bump=(x,c,r)=>{const q=Math.abs(x-c)/r;return q>=1?0:(1-q*q)**2};
const smooth=t=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t)};
// Broader low-amplitude transitions instead of stacked local bulges.
// Preserve the central nose/lips and lower jaw. A mild female upper-head
// width adjustment reduces the tall/narrow appearance without changing height.
export function alignOrbit(g,female){
 const p=g.attributes.position,uv=g.attributes.uv,original=g.attributes.normal.clone(),weights=new Float32Array(p.count);
 for(let i=0;i<p.count;i++){
  const a=Math.abs((uv.getX(i)-.5)*2*Math.PI),v=uv.getY(i);
  const cheek=bump(a,.60,.40)*bump(v,.445,.15);
  const socket=bump(a,.44,.27)*bump(v,.505,.052);
  const brow=bump(a,.45,.27)*bump(v,.545,.042);
  let dz=(female?.0027:.0031)*cheek-(female?.00065:.0009)*socket+(female?.00035:.0008)*brow;
  // Softly fade toward the protected nose and mouth, with exact exclusion.
  const protectN=(1-smooth((a-.26)/.12))*smooth((v-.35)/.05)*(1-smooth((v-.57)/.05));
  const protectM=(1-smooth((a-.30)/.10))*smooth((v-.28)/.03)*(1-smooth((v-.36)/.03));
  dz*=1-Math.max(protectN,protectM);
  if((a<.26&&v>.37&&v<.57)||(a<.30&&v>.30&&v<.36))dz=0;
  const widen=female ? .035*bump(v,.78,.20) : 0;
  const dx=p.getX(i)*widen;
  if(dz||dx){p.setX(i,p.getX(i)+dx);p.setZ(i,p.getZ(i)+dz);weights[i]=Math.min(1,(Math.abs(dz)+Math.abs(dx))/.0008)}
 }
 p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;
 for(let i=0;i<n.count;i++){
  const v=new THREE.Vector3(original.getX(i),original.getY(i),original.getZ(i)).lerp(new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i)),weights[i]*.25).normalize();n.setXYZ(i,v.x,v.y,v.z);
 }
 n.needsUpdate=true;
}
