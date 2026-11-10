import * as THREE from 'three';
// Trial: lift only ear interior vertices above the head skin and hide the
// ellipsoid insert. This is still an overlapping mesh, not a welded ear.
export function liftConcha(rig,ears,female){
 const head=new THREE.Mesh(rig.headMesh.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));head.updateMatrixWorld(true);
 const ray=new THREE.Raycaster();
 for(const ear of ears){
  ear.userData.root.visible=false;
  const p=ear.geometry.attributes.position,side=ear.name.endsWith('left')?-1:1;
  for(let i=0;i<p.count;i++){
   const x=side*p.getX(i),y=p.getY(i),z=p.getZ(i);
   const dy=(y-(female?.078:.081))/.019,dz=(z-(female?-.006:-.012))/.016;
   const r=Math.sqrt(dy*dy+dz*dz),w=1-THREE.MathUtils.smoothstep(r,.55,1.2);
   if(!w)continue;
   ray.set(new THREE.Vector3(side*.3,y,z),new THREE.Vector3(-side,0,0));
   const hit=ray.intersectObject(head,false)[0];
   if(hit){const target=Math.abs(hit.point.x)+.001; p.setX(i,side*(x+Math.max(0,target-x)*w));}
  }
  p.needsUpdate=true;ear.geometry.computeVertexNormals();
  const n=ear.geometry.attributes.normal,acc=new Map(),key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(x=>x.toFixed(6)).join(',');
  for(let i=0;i<p.count;i++){const k=key(i),v=acc.get(k)||new THREE.Vector3();v.add(new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i)));acc.set(k,v)}
  for(let i=0;i<p.count;i++){const v=acc.get(key(i)).clone().normalize();n.setXYZ(i,v.x,v.y,v.z)}n.needsUpdate=true;
 }
 head.material.dispose();
}
