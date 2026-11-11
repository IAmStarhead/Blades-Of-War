import * as THREE from 'three';
import {createHead,STUDIES} from '../head-balance/head.js';
// CC0 MakeHuman-derived anatomical mesh (see head-reference README). Extract
// just the ear/attachment area; no replacement head is attached to the game.
export function addTrialEars(rig,female){
 const template=createHead(female,STUDIES[2]),src=template.children[0].geometry,p=src.attributes.position,idx=src.index;
 const mat=rig.headMesh.material.clone();mat.map=null;mat.color.set(female?0xe0cbbf:0xdac4b7);mat.side=THREE.DoubleSide;const ears=[];
 for(const side of [-1,1]){
  const points=[],tri=[],faces=[];
  for(let i=0;i<idx.count;i+=3){
   const ids=[idx.getX(i),idx.getX(i+1),idx.getX(i+2)],v=ids.map(j=>({x:p.getX(j)*side,y:p.getY(j),z:p.getZ(j)}));
   const x=v.reduce((s,a)=>s+a.x,0)/3,y=v.reduce((s,a)=>s+a.y,0)/3,z=v.reduce((s,a)=>s+a.z,0)/3;
   // Region around the original ear including a small attachment margin.
   const ok=x>(female?.60:.59)&&y>(female?-.52:-.40)&&y<(female?.13:.20)&&z>(female?-.31:-.22)&&z<(female?.17:.22);
   if(!ok)continue;
   // Reject coarse neighbouring scalp triangles stretching beyond the ear.
   const longest=Math.max(...v.map((a,j)=>Math.hypot(a.x-v[(j+1)%3].x,a.y-v[(j+1)%3].y,a.z-v[(j+1)%3].z)));
   if(longest>.16)continue;
   faces.push({ids,v});
  }
  // Preserve only the largest connected patch; cropped isolated scalp shards
  // are not part of the ear. Faces connect via shared source vertices.
  const byVertex=new Map();faces.forEach((f,i)=>f.ids.forEach(id=>{if(!byVertex.has(id))byVertex.set(id,[]);byVertex.get(id).push(i)}));
  const visited=new Set(),components=[];
  for(let i=0;i<faces.length;i++){if(visited.has(i))continue;const stack=[i],component=[];visited.add(i);while(stack.length){let j=stack.pop();component.push(j);for(const id of faces[j].ids)for(const n of byVertex.get(id)){if(!visited.has(n)){visited.add(n);stack.push(n)}}}components.push(component)}
  components.sort((a,b)=>b.length-a.length);
  for(const fi of components[0]||[]){for(const q of faces[fi].v){
    const ox=(female?.072:.078)+(q.x-(female?.72:.71))*.10;
    const oy=(female?.095:.092)+q.y*.095;
    const oz=(female?-.005:-.012)+q.z*.10;
    points.push(side*ox,oy,oz);tri.push(tri.length);
   }}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setIndex(tri);g.computeVertexNormals();
  const accum=new Map(),normal=g.attributes.normal,pos=g.attributes.position;
  for(let i=0;i<pos.count;i++){
   const key=[pos.getX(i),pos.getY(i),pos.getZ(i)].map(x=>x.toFixed(6)).join(',');
   const cur=accum.get(key)||new THREE.Vector3();cur.add(new THREE.Vector3(normal.getX(i),normal.getY(i),normal.getZ(i)));accum.set(key,cur);
  }
  for(let i=0;i<pos.count;i++){
   const key=[pos.getX(i),pos.getY(i),pos.getZ(i)].map(x=>x.toFixed(6)).join(',');const n=accum.get(key).clone().normalize();normal.setXYZ(i,n.x,n.y,n.z);
  }
  normal.needsUpdate=true;const ear=new THREE.Mesh(g,mat);ear.name='reference-ear-'+(side<0?'left':'right');rig.headMesh.parent.add(ear);ears.push(ear);
  // A small buried root fills the gap left by cropping the reference ear.
  // It overlaps both surfaces; it is not a weld.
  const root=new THREE.Mesh(new THREE.SphereGeometry(1,16,12),mat);
  root.scale.set(.0055,.016,.010);
  root.position.set(side*(female?.071:.077),female?.078:.082,-.005);
  root.name='ear-root-'+(side<0?'left':'right');rig.headMesh.parent.add(root);ear.userData.root=root;
 }
 template.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)o.material.dispose()});return ears;
}
