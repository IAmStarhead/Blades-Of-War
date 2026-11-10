import * as THREE from 'three';
// Fade the low-lying rear scalp remnant where it lies near the head surface.
// This is a visual transition on a copied material, not a topological weld.
export function fadeMaleMargin(rig,ears){
 const head=new THREE.Mesh(rig.headMesh.geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));head.updateMatrixWorld(true);const ray=new THREE.Raycaster();
 for(const ear of ears){
  const side=ear.name.endsWith('left')?-1:1,g=ear.geometry,p=g.attributes.position,old=g.attributes.color,rgba=new Float32Array(p.count*4);
  for(let i=0;i<p.count;i++){
   const x=side*p.getX(i),y=p.getY(i),z=p.getZ(i);
   const rear=1-THREE.MathUtils.smoothstep(z,-.019,-.010);
   ray.set(new THREE.Vector3(side*.3,y,z),new THREE.Vector3(-side,0,0));const hit=ray.intersectObject(head,false)[0];
   const dist=hit?x-Math.abs(hit.point.x):1;
   const near=1-THREE.MathUtils.smoothstep(dist,.0003,.0045);
   rgba[4*i]=old.getX(i);rgba[4*i+1]=old.getY(i);rgba[4*i+2]=old.getZ(i);const upper=THREE.MathUtils.smoothstep(y,.085,.097);
   rgba[4*i+3]=1-.85*rear*near*upper;
  }
  g.setAttribute('color',new THREE.BufferAttribute(rgba,4));ear.material=ear.material.clone();ear.material.transparent=false;ear.material.alphaTest=.45;ear.material.depthWrite=true;ear.material.needsUpdate=true;
 }
 head.material.dispose();
}
