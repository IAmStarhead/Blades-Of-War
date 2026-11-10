import * as THREE from 'three';
// Close the small, inner boundary cycle in the reference-ear mesh. Index
// triangles reference the actual boundary vertices, not a separate insert.
export function stitchConcha(rig,ears,female){
 // Make room behind the newly closed concha, only on the two side patches.
 // Never modify the face, neck, or shared source geometry.
 const hp=rig.headMesh.geometry.attributes.position, oldNormals=rig.headMesh.geometry.attributes.normal.clone();
 for(let i=0;i<hp.count;i++){
  const x=hp.getX(i),y=hp.getY(i),z=hp.getZ(i);
  if(Math.abs(x)<(female?.05:.06))continue;
  const dy=(y-(female?.071:.075))/.014,dz=(z-(female?-.006:-.004))/.013;
  const w=Math.exp(-(dy*dy+dz*dz)*1.5);
  hp.setX(i,x-Math.sign(x)*.004*w);
 }
 hp.needsUpdate=true;rig.headMesh.geometry.computeVertexNormals();
 const hn=rig.headMesh.geometry.attributes.normal;
 for(let i=0;i<hp.count;i++){
  const x=hp.getX(i),y=hp.getY(i),z=hp.getZ(i);
  const dy=(y-(female?.071:.075))/.018,dz=(z-(female?-.006:-.004))/.017;
  const w=Math.abs(x)>(female?.05:.06)?Math.exp(-(dy*dy+dz*dz)):0;
  const v=new THREE.Vector3(oldNormals.getX(i),oldNormals.getY(i),oldNormals.getZ(i)).lerp(new THREE.Vector3(hn.getX(i),hn.getY(i),hn.getZ(i)),w).normalize();hn.setXYZ(i,v.x,v.y,v.z);
 }hn.needsUpdate=true;
 for(const ear of ears){
  const g=ear.geometry,p=g.attributes.position,idx=g.index;
  const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(n=>n.toFixed(5)).join(',');
  const edges=new Map(),representative=new Map();
  for(let i=0;i<idx.count;i+=3)for(const [a,b] of [[0,1],[1,2],[2,0]]){
   const ia=idx.getX(i+a),ib=idx.getX(i+b),ka=key(ia),kb=key(ib),id=[ka,kb].sort().join('|');
   representative.set(ka,ia);representative.set(kb,ib);
   if(!edges.has(id))edges.set(id,{a:ka,b:kb,count:0});edges.get(id).count++;
  }
  const adj=new Map();for(const e of edges.values())if(e.count===1)for(const [a,b] of [[e.a,e.b],[e.b,e.a]]){if(!adj.has(a))adj.set(a,[]);adj.get(a).push(b)}
  const seen=new Set(),parent=new Map(),depth=new Map(),cycles=[];
  function walk(v,prev,d){seen.add(v);parent.set(v,prev);depth.set(v,d);for(const n of adj.get(v)){
   if(n===prev)continue;
   if(!seen.has(n))walk(n,v,d+1);
   else if(depth.get(n)<depth.get(v)){let q=v,path=[v];while(q!==n && q!==null){q=parent.get(q);if(q)path.push(q)}if(q===n)cycles.push(path)}
  }}
  for(const v of adj.keys())if(!seen.has(v))walk(v,null,0);
  const candidates=cycles.filter(c=>c.length>=3).sort((a,b)=>a.length-b.length);
  const loop=candidates.find(c=>{let ys=c.map(k=>p.getY(representative.get(k)));return Math.max(...ys)-Math.min(...ys)<.025});
  if(!loop)throw new Error('No usable inner ear boundary');
  const points=loop.map(k=>{let i=representative.get(k);return new THREE.Vector2(p.getZ(i),p.getY(i))});
  const faces=THREE.ShapeUtils.triangulateShape(points,[]),all=Array.from(idx.array);
  // Winding of new faces must oppose the adjacent face along the boundary.
  // The ear sides can have opposite winding, so derive it per ear.
  let same=0,opposite=0;
  for(const f of faces)for(let j=0;j<3;j++){
   const a=loop[f[j]],b=loop[f[(j+1)%3]],e=edges.get([a,b].sort().join('|'));
   if(e&&e.count===1){if(e.a===a&&e.b===b)same++;else opposite++;}
  }
  for(const f of faces){const order=same>opposite?[f[0],f[2],f[1]]:f;for(const n of order)all.push(representative.get(loop[n]));}
  ear.userData.windingEvidence={same,opposite};
  g.setIndex(all);ear.userData.stitchedFaces=faces.length;ear.userData.stitchedBoundary=loop.length;
  // Hide the old ellipsoid, revealing the actual stitched surface.
  ear.userData.root.visible=false;
  g.computeVertexNormals();
  const norm=g.attributes.normal,acc=new Map();
  for(let i=0;i<p.count;i++){const k=key(i),a=acc.get(k)||new THREE.Vector3();a.add(new THREE.Vector3(norm.getX(i),norm.getY(i),norm.getZ(i)));acc.set(k,a)}
  for(let i=0;i<p.count;i++){const a=acc.get(key(i)).clone().normalize();norm.setXYZ(i,a.x,a.y,a.z)}norm.needsUpdate=true;
 }
}
