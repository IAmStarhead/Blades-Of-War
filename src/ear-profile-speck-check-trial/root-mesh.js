import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';
// Experimental local overlap strip from the upper inner ear boundary to the
// nearest scalp surface. Geometry stays attached to the same HEAD bone.
export function repairUpperRoot(rig,ears,female,skipSpeck=false){
 const head=rig.headMesh.geometry,tree=new MeshBVH(head,{indirect:true}),hp=head.attributes.position,hn=head.attributes.normal,hi=head.index;
 for(const ear of ears){
  const side=ear.name.endsWith('left')?-1:1,g=ear.geometry,p=g.attributes.position,n=g.attributes.normal,c=g.attributes.color,idx=g.index,edges=new Map();
  for(let i=0;i<idx.count;i+=3)for(let k=0;k<3;k++){const a=idx.getX(i+k),b=idx.getX(i+(k+1)%3),key=a<b?`${a}:${b}`:`${b}:${a}`;const e=edges.get(key)||{a,b,count:0};e.count++;edges.set(key,e)}
  const ps=Array.from(p.array),ns=Array.from(n.array),cs=Array.from(c.array),ix=Array.from(idx.array),cache=new Map();
  function project(i){
   if(cache.has(i))return cache.get(i);const x=side*(p.getX(i)+ear.position.x),y=p.getY(i),z=p.getZ(i);
   if(y<.084||y>.111||x>(female?.078:.084)||z>.004){cache.set(i,null);return null}
   const source=new THREE.Vector3(p.getX(i)+ear.position.x,y+ear.position.y,z+ear.position.z),hit=tree.closestPointToPoint(source,{},0,.006);
   if(!hit||hit.distance<.00015){cache.set(i,null);return null}
   const f=hit.faceIndex, ids=[hi.getX(f*3),hi.getX(f*3+1),hi.getX(f*3+2)];
   const a=new THREE.Vector3().fromBufferAttribute(hp,ids[0]),b=new THREE.Vector3().fromBufferAttribute(hp,ids[1]),d=new THREE.Vector3().fromBufferAttribute(hp,ids[2]);
   const bary=new THREE.Vector3();THREE.Triangle.getBarycoord(hit.point,a,b,d,bary);
   const normal=new THREE.Vector3();ids.forEach((id,k)=>normal.addScaledVector(new THREE.Vector3().fromBufferAttribute(hn,id),[bary.x,bary.y,bary.z][k]));normal.normalize();
   const end=hit.point.clone().addScaledVector(normal,-.00035).sub(ear.position);const start=new THREE.Vector3(p.getX(i),y,z),prior=new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i));
   const added=[];for(const t of [.5,1]){const v=start.clone().lerp(end,t),nn=prior.clone().lerp(normal,t*.7).normalize();added.push(ps.length/3);ps.push(v.x,v.y,v.z);ns.push(nn.x,nn.y,nn.z);cs.push(c.getX(i),c.getY(i),c.getZ(i))}cache.set(i,added);return added;
  }
  let count=0;for(const e of edges.values())if(e.count===1){const cy=(p.getY(e.a)+p.getY(e.b))/2,cz=(p.getZ(e.a)+p.getZ(e.b))/2;if(skipSpeck && cy>.092 && cy<.100 && cz>-.015 && cz<-.006)continue;let a=project(e.a),b=project(e.b);if(!a||!b)continue;ix.push(e.a,e.b,b[0],e.a,b[0],a[0],a[0],b[0],b[1],a[0],b[1],a[1]);count+=4}
  if(count){g.setAttribute('position',new THREE.Float32BufferAttribute(ps,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(ns,3));g.setAttribute('color',new THREE.Float32BufferAttribute(cs,3));g.setIndex(ix);g.computeBoundingSphere()}
  ear.userData.rootRepairTriangles=count;
 }
}
