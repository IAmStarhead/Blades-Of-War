import * as THREE from 'three';
// Reveal the lower/front ear surface where the copied scalp intersects it.
// The ear still overlaps the head; this does not weld them.
export function revealLobe(ears){
 for(const ear of ears){const g=ear.geometry,p=g.attributes.position,n=g.attributes.normal,orig=n.clone();g.computeVertexNormals();let baseline=g.attributes.normal.clone();
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),dy=(p.getY(i)-.056)/.012,dz=(p.getZ(i)-.002)/.012,r=dy*dy+dz*dz;
   if(r<1){const w=(1-r)*(1-r);p.setX(i,x+Math.sign(x)*.0035*w);}
  }p.needsUpdate=true;g.computeVertexNormals();const nn=g.attributes.normal;
  for(let i=0;i<nn.count;i++){let v=new THREE.Vector3(orig.getX(i),orig.getY(i),orig.getZ(i));v.add(new THREE.Vector3(nn.getX(i)-baseline.getX(i),nn.getY(i)-baseline.getY(i),nn.getZ(i)-baseline.getZ(i)).multiplyScalar(.65)).normalize();nn.setXYZ(i,v.x,v.y,v.z)}nn.needsUpdate=true;
 }
}
