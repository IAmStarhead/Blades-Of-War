import * as THREE from 'three';
// Hide the cropped scalp margin inside the existing head, keeping the raised
// anatomical ear. The meshes still overlap; this does not weld topology.
export function fitEarEdge(rig,ears,female=true){
 const head=new THREE.Mesh(rig.headMesh.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));head.updateMatrixWorld(true);
 const ray=new THREE.Raycaster();
 for(const ear of ears){
  const side=ear.name.endsWith('left')?-1:1,p=ear.geometry.attributes.position;
  for(let i=0;i<p.count;i++){
   const x=side*p.getX(i),y=p.getY(i),z=p.getZ(i);
   ray.set(new THREE.Vector3(side*.3,y,z),new THREE.Vector3(-side,0,0));
   const hit=ray.intersectObject(head,false)[0];if(!hit)continue;
   let t=Math.max(0,Math.min(1,((female?.076:.082)-x)/.005));t=t*t*(3-2*t);
   const goal=Math.min(x,Math.abs(hit.point.x)-.00035);
   p.setX(i,side*(x*(1-t)+goal*t));
  }
  p.needsUpdate=true;ear.geometry.computeVertexNormals();
  // The extracted geometry contains split triangle vertices; average their
  // normals at coincident positions without changing the ear's shape.
  const n=ear.geometry.attributes.normal,acc=new Map(),key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(x=>x.toFixed(6)).join(',');
  for(let i=0;i<p.count;i++){let k=key(i),a=acc.get(k)||new THREE.Vector3();a.add(new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i)));acc.set(k,a)}
  for(let i=0;i<p.count;i++){let a=acc.get(key(i)).clone().normalize();n.setXYZ(i,a.x,a.y,a.z)}n.needsUpdate=true;
 }
 head.material.dispose();
}
