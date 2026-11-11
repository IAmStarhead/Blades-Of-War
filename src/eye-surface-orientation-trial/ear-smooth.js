import * as THREE from 'three';
// One Loop subdivision on the private ear mesh. The cropped scalp margin
// remains an overlapping attachment, not a welded ear-to-head junction.
export function roundEars(ears){
 for(const ear of ears){
  const src=ear.geometry,p=src.attributes.position,idx=src.index,verts=[],colors=[],faces=[],lookup=new Map(), col=src.attributes.color;
  function id(i){const v=[p.getX(i),p.getY(i),p.getZ(i)],key=v.map(n=>n.toFixed(6)).join(',');if(!lookup.has(key)){lookup.set(key,verts.length);verts.push(new THREE.Vector3(...v));colors.push(new THREE.Vector3(col.getX(i),col.getY(i),col.getZ(i)))}return lookup.get(key)}
  for(let i=0;i<idx.count;i+=3){let f=[id(idx.getX(i)),id(idx.getX(i+1)),id(idx.getX(i+2))];if(new Set(f).size===3)faces.push(f)}
  const edges=new Map(),neighbors=verts.map(()=>new Set()),boundary=verts.map(()=>new Set());
  const key=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
  for(const [a,b,c] of faces)for(const [x,y,z] of [[a,b,c],[b,c,a],[c,a,b]]){let k=key(x,y);if(!edges.has(k))edges.set(k,{a:x,b:y,opp:[]});edges.get(k).opp.push(z);neighbors[x].add(y);neighbors[y].add(x)}
  for(const e of edges.values())if(e.opp.length===1){boundary[e.a].add(e.b);boundary[e.b].add(e.a)}
  function subdivide(values){
   const out=values.map((v,i)=>{if(boundary[i].size===2){const [a,b]=[...boundary[i]];return v.clone().multiplyScalar(.75).addScaledVector(values[a],.125).addScaledVector(values[b],.125)}if(boundary[i].size||neighbors[i].size<3)return v.clone();const n=neighbors[i].size,beta=n===3?3/16:3/(8*n),r=v.clone().multiplyScalar(1-n*beta);for(const j of neighbors[i])r.addScaledVector(values[j],beta);return r});
   for(const e of edges.values()){const v=new THREE.Vector3();if(e.opp.length===2)v.addScaledVector(values[e.a],.375).addScaledVector(values[e.b],.375).addScaledVector(values[e.opp[0]],.125).addScaledVector(values[e.opp[1]],.125);else v.addScaledVector(values[e.a],.5).addScaledVector(values[e.b],.5);e.newIndex=out.length;out.push(v)}return out;
  }
  const out=subdivide(verts),outColors=subdivide(colors);
  const indices=[];for(const [a,b,c] of faces){const ab=edges.get(key(a,b)).newIndex,bc=edges.get(key(b,c)).newIndex,ca=edges.get(key(c,a)).newIndex;indices.push(a,ab,ca,b,bc,ab,c,ca,bc,ab,bc,ca)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(out.flatMap(v=>v.toArray()),3));g.setAttribute('color',new THREE.Float32BufferAttribute(outColors.flatMap(v=>v.toArray()),3));g.setIndex(indices);g.computeVertexNormals();ear.geometry=g;src.dispose();
 }
}
