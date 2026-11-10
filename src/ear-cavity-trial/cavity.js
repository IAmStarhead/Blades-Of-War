import * as THREE from 'three';
// Split only the newly reconstructed concha faces, introducing a displaced
// centroid per triangle and a restrained local vertex-colour shadow.
// Ear/head remain distinct meshes; this is a static trial, not a weld.
export function shapeCavity(ears,female){
 for(const ear of ears){
  const g=ear.geometry,p=g.attributes.position,col=g.attributes.color,idx=g.index,nFaces=ear.userData.stitchedFaces,side=ear.name.endsWith('left')?-1:1;
  if(!nFaces || !col || col.itemSize!==3)throw Error('ear concha attributes missing');
  const start=idx.count-3*nFaces,points=Array.from(p.array),colors=Array.from(col.array),indices=Array.from(idx.array.slice(0,start));
  const cy=female?.070:.075,cz=female?-.006:-.004;
  const weight=(y,z)=>Math.exp(-(((y-cy)/.009)**2+((z-cz)/.008)**2)*1.15);
  for(let i=0;i<p.count;i++){
   const t=.18*weight(p.getY(i),p.getZ(i));colors[3*i]*=1-t*.65;colors[3*i+1]*=1-t*.8;colors[3*i+2]*=1-t*.8;
  }
  for(let i=start;i<idx.count;i+=3){
   const a=idx.getX(i),b=idx.getX(i+1),c=idx.getX(i+2);
   const x=(p.getX(a)+p.getX(b)+p.getX(c))/3,y=(p.getY(a)+p.getY(b)+p.getY(c))/3,z=(p.getZ(a)+p.getZ(b)+p.getZ(c))/3,t=weight(y,z),j=points.length/3;
   points.push(x+side*.0012*t,y,z);
   for(let k=0;k<3;k++)colors.push((colors[3*a+k]+colors[3*b+k]+colors[3*c+k])/3*(1-.10*t));
   indices.push(a,b,j,b,c,j,c,a,j);
  }
  g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
  const pos=g.attributes.position,n=g.attributes.normal,acc=new Map(),key=i=>[pos.getX(i),pos.getY(i),pos.getZ(i)].map(x=>x.toFixed(6)).join(',');
  for(let i=0;i<pos.count;i++){const k=key(i),v=acc.get(k)||new THREE.Vector3();v.add(new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i)));acc.set(k,v)}
  for(let i=0;i<pos.count;i++){const v=acc.get(key(i)).clone().normalize();n.setXYZ(i,v.x,v.y,v.z)}n.needsUpdate=true;
  ear.userData.cavityTriangles=nFaces*3;
 }
}
