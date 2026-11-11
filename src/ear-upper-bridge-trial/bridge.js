import * as THREE from 'three';
import {MeshBVH, acceleratedRaycast} from 'three-mesh-bvh';
// Overlapping upper-root strip built from the ear's open edges to the head.
// This is not a welded mesh and is kept off the lower lobe.
export function bridgeUpperRoot(rig,ears,female){
 const head=rig.headMesh.geometry,oldTree=head.boundsTree;head.boundsTree=new MeshBVH(head,{indirect:true});
 const probe=new THREE.Mesh(head,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));probe.raycast=acceleratedRaycast;probe.updateMatrixWorld(true);const ray=new THREE.Raycaster();ray.firstHitOnly=true;
 for(const ear of ears){
  const g=ear.geometry,p=g.attributes.position,n=g.attributes.normal,c=g.attributes.color,idx=g.index,side=ear.name.endsWith('left')?-1:1,edges=new Map();
  for(let i=0;i<idx.count;i+=3)for(let j=0;j<3;j++){let a=idx.getX(i+j),b=idx.getX(i+(j+1)%3),key=a<b?`${a}:${b}`:`${b}:${a}`;let e=edges.get(key)||{a,b,n:0};e.n++;edges.set(key,e)}
  const positions=Array.from(p.array),normals=Array.from(n.array),colors=Array.from(c.array),indices=Array.from(idx.array),cache=new Map();let added=0;
  function endpoint(i){
   if(cache.has(i))return cache.get(i);
   const x=side*p.getX(i),y=p.getY(i),z=p.getZ(i);
   if(y<.080||y>.112||x>(female?.080:.085)||z> .002){cache.set(i,null);return null}
   ray.set(new THREE.Vector3(side*.3,y+ear.position.y,z+ear.position.z),new THREE.Vector3(-side,0,0));const hit=ray.intersectObject(probe,false)[0];
   if(!hit||Math.abs(x-Math.abs(hit.point.x))>.012){cache.set(i,null);return null}
   const j=positions.length/3;positions.push(side*(Math.abs(hit.point.x)-.0006),y,z);
   // Keep the shading of the boundary rather than recalculating the entire ear.
   normals.push(n.getX(i),n.getY(i),n.getZ(i));colors.push(c.getX(i),c.getY(i),c.getZ(i));cache.set(i,j);return j;
  }
  for(const e of edges.values())if(e.n===1){const a=endpoint(e.a),b=endpoint(e.b);if(a===null||b===null)continue;indices.push(e.a,e.b,b,e.a,b,a);added+=2}
  if(added){g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeBoundingSphere()}
  ear.userData.upperBridgeTriangles=added;
 }
 probe.material.dispose();head.boundsTree=oldTree;
}
