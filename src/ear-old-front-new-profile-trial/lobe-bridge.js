import * as THREE from 'three';
import {MeshBVH,acceleratedRaycast} from 'three-mesh-bvh';
// Local triangle strip from the lower ear boundary into the existing scalp.
// Separate intersecting meshes, not a weld. Only affects the trial copy.
export function extendFemaleLobe(rig,ears){
 const head=rig.headMesh.geometry,tree=head.boundsTree;head.boundsTree=new MeshBVH(head,{indirect:true});const mesh=new THREE.Mesh(head,new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));mesh.raycast=acceleratedRaycast;mesh.updateMatrixWorld(true);const ray=new THREE.Raycaster();ray.firstHitOnly=true;
 for(const ear of ears){const g=ear.geometry,p=g.attributes.position,col=g.attributes.color,idx=g.index,side=ear.name.endsWith('left')?-1:1,edges=new Map();
  for(let i=0;i<idx.count;i+=3)for(const [a,b] of [[0,1],[1,2],[2,0]]){let u=idx.getX(i+a),v=idx.getX(i+b),key=[u,v].sort((x,y)=>x-y).join(',');const e=edges.get(key)||{u,v,n:0};e.n++;edges.set(key,e)}
  const pos=Array.from(p.array),colors=Array.from(col.array),normals=Array.from(g.attributes.normal.array),indices=Array.from(idx.array),added=new Map();
  function endpoint(i){if(added.has(i))return added.get(i);const y=p.getY(i),z=p.getZ(i)+.0035;ray.set(new THREE.Vector3(side*.3,y+ear.position.y,z+ear.position.z),new THREE.Vector3(-side,0,0));let hit=ray.intersectObject(mesh,false)[0];if(!hit)return null;const j=pos.length/3;pos.push(side*(Math.abs(hit.point.x)-.0015),y,z);colors.push(col.getX(i),col.getY(i),col.getZ(i));normals.push(g.attributes.normal.getX(i),g.attributes.normal.getY(i),g.attributes.normal.getZ(i));added.set(i,j);return j}
  let count=0;for(const e of edges.values())if(e.n===1){const y=(p.getY(e.u)+p.getY(e.v))/2,z=(p.getZ(e.u)+p.getZ(e.v))/2;if(y<.05||y>.067||z<.007||z>.020)continue;const a=endpoint(e.u),b=endpoint(e.v);if(a===null||b===null)continue;indices.push(e.v,e.u,a,e.v,a,b);count++}
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));ear.userData.lobeStripEdges=count;
 }mesh.material.dispose();head.boundsTree=tree;
}
