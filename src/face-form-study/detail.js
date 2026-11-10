import * as THREE from 'three';
// Small local ear-only adjustment on the comparison copy. The centre of the
// ear gets a restrained warm tint via vertex colours (no painted image map).
export function adjustEarDetail(ears,female){
 for(const ear of ears){
  const side=ear.name.endsWith('left')?-1:1,p=ear.geometry.attributes.position;
  const color=new Float32Array(p.count*3), anchor=female?.071:.077;
  for(let i=0;i<p.count;i++){
   const x=side*p.getX(i),y=p.getY(i),z=p.getZ(i);
   const height=THREE.MathUtils.smoothstep(y,female?.065:.067,female?.10:.105);
   // Pivot at the root, moving the upper outer rim slightly toward the skull.
   p.setX(i,side*(x-Math.max(0,x-anchor)*.14*height));
   const dy=(y-(female?.077:.080))/.012,dz=(z-(female?-.008:-.014))/.009;
   const tint=Math.exp(-(dy*dy+dz*dz)*1.4)*.12;
   color[i*3]=1-tint*.20;color[i*3+1]=1-tint*.70;color[i*3+2]=1-tint*.72;
  }
  p.needsUpdate=true;ear.geometry.setAttribute('color',new THREE.BufferAttribute(color,3));
  ear.material=ear.material.clone();ear.material.vertexColors=true;
  ear.geometry.computeVertexNormals();
  const n=ear.geometry.attributes.normal,acc=new Map();
  const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(x=>x.toFixed(6)).join(',');
  for(let i=0;i<p.count;i++){const k=key(i),v=acc.get(k)||new THREE.Vector3();v.add(new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i)));acc.set(k,v)}
  for(let i=0;i<p.count;i++){const v=acc.get(key(i)).clone().normalize();n.setXYZ(i,v.x,v.y,v.z)}n.needsUpdate=true;
 }
}
