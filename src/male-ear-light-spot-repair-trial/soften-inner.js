import * as THREE from 'three';
// Tapered smoothing in the ear bowl only. Fixed boundary vertices prevent
// opening edges from drifting; lobe and head are not touched.
export function softenInnerEar(ears, steps=10){
 for(const ear of ears){
  const g=ear.geometry,p=g.attributes.position,n=g.attributes.normal,old=n.clone(),idx=g.index,neighbors=Array.from({length:p.count},()=>new Set()),edges=new Map();
  for(let i=0;i<idx.count;i+=3)for(let j=0;j<3;j++){
   const a=idx.getX(i+j),b=idx.getX(i+(j+1)%3),key=a<b?`${a}:${b}`:`${b}:${a}`;neighbors[a].add(b);neighbors[b].add(a);edges.set(key,(edges.get(key)||0)+1);
  }
  const boundary=new Set();for(const [key,count] of edges)if(count===1)key.split(':').forEach(i=>boundary.add(Number(i)));
  g.computeVertexNormals();const originalGeomNormal=g.attributes.normal.clone();let max=0,moved=0;
  for(let step=0;step<steps;step++){
   const positions=p.array.slice(),updates=[];
   for(let i=0;i<p.count;i++){
    if(boundary.has(i)||neighbors[i].size<3)continue;
    const x=Math.abs(positions[3*i]),y=positions[3*i+1],z=positions[3*i+2];
    const dy=(y-.081)/.012,dz=(z+.008)/.012,dx=(x-.076)/.011,r=dy*dy+dz*dz+dx*dx;
    if(r>=1)continue;const w=(1-r)*(1-r),v=new THREE.Vector3(positions[3*i],y,z),avg=new THREE.Vector3();
    for(const j of neighbors[i])avg.add(new THREE.Vector3(positions[3*j],positions[3*j+1],positions[3*j+2]));avg.multiplyScalar(1/neighbors[i].size);
    const d=avg.sub(v).multiplyScalar(.45*w);if(d.length()>.00025)d.setLength(.00025);max=Math.max(max,d.length());if(d.lengthSq()>1e-16){moved++;updates.push([i,v.add(d)])}
   }
   for(const [i,v] of updates)p.setXYZ(i,v.x,v.y,v.z);
  }
  p.needsUpdate=true;g.computeVertexNormals();const out=g.attributes.normal;
  for(let i=0;i<p.count;i++){
   const v=new THREE.Vector3(old.getX(i),old.getY(i),old.getZ(i));v.add(new THREE.Vector3(out.getX(i)-originalGeomNormal.getX(i),out.getY(i)-originalGeomNormal.getY(i),out.getZ(i)-originalGeomNormal.getZ(i)).multiplyScalar(.5)).normalize();out.setXYZ(i,v.x,v.y,v.z);
  }
  out.needsUpdate=true;ear.userData.innerRelaxStepMax=max;ear.userData.innerRelaxUpdates=moved;
 }
}
