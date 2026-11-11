import * as THREE from 'three';
const smooth=(a,b,x)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
// Reduce the outward tilt of each eye patch via a smooth, antisymmetric depth
// field, while retaining the original UV artwork. No view-dependent animation.
export function orientEyeSurface(g){const p=g.attributes.position,uv=g.attributes.uv,old=g.attributes.normal.clone();g.computeVertexNormals();const base=g.attributes.normal.clone();
 for(let i=0;i<p.count;i++){
  const u=uv.getX(i),v=uv.getY(i),side=u<.5?-1:1,center=side<0?224.5/512:287.5/512,du=u-center;
  const mask=(1-smooth(.018,.066,Math.abs(du)))*smooth(.467,.491,v)*(1-smooth(.526,.553,v));
  if(!mask)continue;
  const x=p.getX(i),eyeX=side*.0313, slope=-side*.48, dz=-slope*(x-eyeX)*mask*.24;
  p.setZ(i,p.getZ(i)+dz);
 }
 p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;for(let i=0;i<p.count;i++){const v=new THREE.Vector3(old.getX(i),old.getY(i),old.getZ(i)).add(new THREE.Vector3(n.getX(i)-base.getX(i),n.getY(i)-base.getY(i),n.getZ(i)-base.getZ(i)).multiplyScalar(.45)).normalize();n.setXYZ(i,v.x,v.y,v.z)}n.needsUpdate=true;
}
