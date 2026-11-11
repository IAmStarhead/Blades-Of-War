import * as THREE from 'three';
// Small tapered relief in the bowl, in geometry, not a dark overlay.
export function addInnerRelief(ears,female){
 for(const ear of ears){
  const g=ear.geometry,p=g.attributes.position,old=g.attributes.normal.clone(),side=ear.name.endsWith('left')?-1:1,idx=g.index,edge=new Map();
  for(let i=0;i<idx.count;i+=3)for(let j=0;j<3;j++){let a=idx.getX(i+j),b=idx.getX(i+(j+1)%3),k=a<b?`${a}:${b}`:`${b}:${a}`;edge.set(k,(edge.get(k)||0)+1)}
  const boundary=new Set();for(const [k,c] of edge)if(c===1)k.split(':').forEach(x=>boundary.add(Number(x)));
  g.computeVertexNormals();const before=g.attributes.normal.clone();let moved=0,max=0;
  for(let i=0;i<p.count;i++){
   if(boundary.has(i))continue;
   const x=side*p.getX(i),y=p.getY(i),z=p.getZ(i),dy=(y-.081)/.008,dz=(z-(female?-.007:-.011))/.006,dx=(x-(female?.076:.081))/.009,r=dy*dy+dz*dz+dx*dx;
   if(r>=1)continue;const d=.0012*(1-r)*(1-r);p.setX(i,p.getX(i)+side*d);max=Math.max(max,d);moved++;
  }
  p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;
  for(let i=0;i<p.count;i++){const v=new THREE.Vector3(old.getX(i),old.getY(i),old.getZ(i));v.add(new THREE.Vector3(n.getX(i)-before.getX(i),n.getY(i)-before.getY(i),n.getZ(i)-before.getZ(i)).multiplyScalar(.5)).normalize();n.setXYZ(i,v.x,v.y,v.z)}n.needsUpdate=true;ear.userData.innerReliefMax=max;ear.userData.innerReliefVertices=moved;
 }
}
