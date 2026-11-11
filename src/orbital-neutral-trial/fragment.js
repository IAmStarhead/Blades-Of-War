import * as THREE from 'three';
// Remove the shallow upper/back scalp margin, preserving the raised ear rim.
// Applied only to copied male ear meshes. Not a topology weld.
export function trimBackFragment(rig,ears){
 const head=new THREE.Mesh(rig.headMesh.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));head.updateMatrixWorld(true);const ray=new THREE.Raycaster();
 for(const ear of ears){
  const side=ear.name.endsWith('left')?-1:1,p=ear.geometry.attributes.position,idx=ear.geometry.index,kept=[];let removed=0;
  for(let i=0;i<idx.count;i+=3){
   const ids=[idx.getX(i),idx.getX(i+1),idx.getX(i+2)];
   const avg=fn=>ids.reduce((sum,j)=>sum+fn(j),0)/3;
   const x=avg(j=>side*p.getX(j)),y=avg(j=>p.getY(j)),z=avg(j=>p.getZ(j));
   ray.set(new THREE.Vector3(side*.3,y,z),new THREE.Vector3(-side,0,0));const hit=ray.intersectObject(head,false)[0];
   if(hit&&y>.084&&z<-.015&&x-Math.abs(hit.point.x)<.0055){removed++;continue}
   kept.push(...ids);
  }
  ear.geometry.setIndex(kept);ear.userData.removedFragmentFaces=removed;
 }
 head.material.dispose();
}
