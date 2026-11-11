import * as THREE from 'three';
// Move only a small strip on the front-visible ear bowl towards the front.
// The edge and lobe are fixed, with compact tapered support in all axes.
export function shapeVisibleRidge(ears,female){
 for(const ear of ears){
  const g=ear.geometry,p=g.attributes.position,old=g.attributes.normal.clone(),side=ear.name.endsWith('left')?-1:1,idx=g.index,edges=new Map();
  for(let i=0;i<idx.count;i+=3)for(let j=0;j<3;j++){const a=idx.getX(i+j),b=idx.getX(i+(j+1)%3),k=a<b?`${a}:${b}`:`${b}:${a}`;edges.set(k,(edges.get(k)||0)+1)}
  const boundary=new Set();for(const [k,c] of edges)if(c===1)k.split(':').forEach(v=>boundary.add(+v));
  g.computeVertexNormals();const reference=g.attributes.normal.clone();let count=0,max=0;
  for(let i=0;i<p.count;i++){
   if(boundary.has(i))continue;const x=side*p.getX(i),y=p.getY(i),z=p.getZ(i);
   const dx=(x-(female?.079:.083))/.0045,dy=(y-.080)/.010,dz=(z-(female?-.007:-.011))/.007,r=dx*dx+dy*dy+dz*dz;
   if(r>=1)continue;const d=.0035*(1-r)*(1-r);p.setZ(i,z+d);count++;max=Math.max(max,d);
  }
  p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;
  for(let i=0;i<p.count;i++){const v=new THREE.Vector3(old.getX(i),old.getY(i),old.getZ(i));v.add(new THREE.Vector3(n.getX(i)-reference.getX(i),n.getY(i)-reference.getY(i),n.getZ(i)-reference.getZ(i)).multiplyScalar(.65)).normalize();n.setXYZ(i,v.x,v.y,v.z)}n.needsUpdate=true;ear.userData.visibleRidgeCount=count;ear.userData.visibleRidgeMax=max;
 }
}
