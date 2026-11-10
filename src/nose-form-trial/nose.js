import * as THREE from 'three';
// Split each triangle without moving the source surface, then shape only the
// nose area on the clone. More samples make the tip and alae less blocky.
export function refineNose(source,female){
 const pos=source.attributes.position,uv=source.attributes.uv,old=source.index;
 const verts=Array.from(pos.array),coords=Array.from(uv.array), normals=Array.from(source.attributes.normal.array),edges=new Map(),idx=[];
 function midpoint(a,b){
  const key=a<b?`${a},${b}`:`${b},${a}`;if(edges.has(key))return edges.get(key);
  const i=verts.length/3;for(let j=0;j<3;j++)verts.push((pos.array[a*3+j]+pos.array[b*3+j])/2);
  for(let j=0;j<2;j++)coords.push((uv.array[a*2+j]+uv.array[b*2+j])/2);
  const n=source.attributes.normal;for(let j=0;j<3;j++)normals.push((n.array[a*3+j]+n.array[b*3+j])/2);
  edges.set(key,i);return i;
 }
 for(let i=0;i<old.count;i+=3){
  const a=old.getX(i),b=old.getX(i+1),c=old.getX(i+2),ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);
  idx.push(a,ab,ca,ab,b,bc,ca,bc,c,ab,bc,ca);
 }
 const gauss=(x,w)=>Math.exp(-((x/w)**2));
 for(let i=0;i<verts.length/3;i++){
  const u=coords[2*i],v=coords[2*i+1],phi=(u-.5)*2*Math.PI;
  // Broad, continuous ridge and a softly rounded tip and wings.
  const bridge=gauss(phi,.145)*gauss(v-.465,.065);
  const tip=gauss(phi,.12)*gauss(v-.407,.027);
  const wings=gauss(Math.abs(phi)-.14,.065)*gauss(v-.408,.032);
  verts[i*3+2]+=(female?.002:.003)*bridge+(female?.0025:.0035)*tip+.002*wings;
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(coords,2));g.setIndex(idx);g.computeVertexNormals();
 const n=g.attributes.normal;
 for(let i=0;i<n.count;i++){
  const phi=(coords[i*2]-.5)*2*Math.PI,v=coords[i*2+1];
  const mix=gauss(phi,.25)*gauss(v-.435,.11);
  const x=normals[i*3]*(1-mix)+n.getX(i)*mix,y=normals[i*3+1]*(1-mix)+n.getY(i)*mix,z=normals[i*3+2]*(1-mix)+n.getZ(i)*mix;
  const q=new THREE.Vector3(x,y,z).normalize();n.setXYZ(i,q.x,q.y,q.z);
 }
 n.needsUpdate=true;return g;
}
