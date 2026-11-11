import * as THREE from 'three';
import {MeshBVH,acceleratedRaycast} from 'three-mesh-bvh';
// Shading-only trial: no triangle removal or ear/head position changes.
export function balanceEarEdge(rig,ears){
 const head=rig.headMesh.geometry,oldTree=head.boundsTree;head.boundsTree=new MeshBVH(head,{indirect:true});const probe=new THREE.Mesh(head,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));probe.raycast=acceleratedRaycast;probe.updateMatrixWorld(true);const ray=new THREE.Raycaster();ray.firstHitOnly=true;
 for(const ear of ears){let g=ear.geometry,p=g.attributes.position,n=g.attributes.normal,col=g.attributes.color,side=ear.name.endsWith('left')?-1:1;
  for(let i=0;i<p.count;i++){
   let y=p.getY(i),z=p.getZ(i),x=side*p.getX(i),dy=(y-.052)/.012,dz=(z-.006)/.016,r=dy*dy+dz*dz;if(r>=1)continue;
   const w=(1-r)*(1-r);for(let k=0;k<3;k++)col.setComponent(i,k,THREE.MathUtils.lerp(col.getComponent(i,k),1,.5*w));
   ray.set(new THREE.Vector3(side*.3,y+ear.position.y,z+ear.position.z),new THREE.Vector3(-side,0,0));let hit=ray.intersectObject(probe,false)[0];if(!hit||Math.abs(x-Math.abs(hit.point.x))>.009)continue;
   let target=hit.normal;if(!target)continue;let v=new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i));v.lerp(target,.45*w).normalize();n.setXYZ(i,v.x,v.y,v.z);
  }n.needsUpdate=true;col.needsUpdate=true;
 }
 probe.material.dispose();head.boundsTree=oldTree;
}
