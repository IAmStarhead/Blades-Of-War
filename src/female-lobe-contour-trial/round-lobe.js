import * as THREE from 'three';
// Local, smooth contour trial; no overlay or changes to the male ear.
export function roundLobe(ears){
 for(const ear of ears){const g=ear.geometry,p=g.attributes.position,orig=g.attributes.normal.clone();g.computeVertexNormals();const base=g.attributes.normal.clone();
  for(let i=0;i<p.count;i++){
   const y=p.getY(i),z=p.getZ(i),dy=(y-.054)/.010,dz=(z-.004)/.014,r=dy*dy+dz*dz;if(r>=1)continue;
   const w=(1-r)*(1-r);p.setZ(i,z+.004*w);p.setY(i,y-.001*w);
  }p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;
  for(let i=0;i<p.count;i++){let v=new THREE.Vector3(orig.getX(i),orig.getY(i),orig.getZ(i));v.add(new THREE.Vector3(n.getX(i)-base.getX(i),n.getY(i)-base.getY(i),n.getZ(i)-base.getZ(i)).multiplyScalar(.6)).normalize();n.setXYZ(i,v.x,v.y,v.z)}n.needsUpdate=true;
 }
}
