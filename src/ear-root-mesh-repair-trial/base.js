import * as THREE from 'three';
// Hide painted facial details only on a cloned texture. The former map and all
// nose/mouth geometry stay untouched; this is not a destructive game edit.
export function hideFaceDrawing(rig){
 const old=rig.headMesh.material.map,img=old.image,c=document.createElement('canvas');c.width=img.width;c.height=img.height;
 const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height),p=pixels.data,src=p.slice(),w=c.width,h=c.height;
 // Blend across a broad front-of-face patch using undrawn adjacent skin.
 const left=Math.round(w*185/512),right=Math.round(w*327/512),top=Math.round(h*224/512),bottom=Math.round(h*388/512);
 for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
  const t=(x-left)/(right-left),fade=Math.min(1,(x-left)/12,(right-x)/12,(y-top)/12,(bottom-y)/12),i=(y*w+x)*4,l=(y*w+left)*4,r=(y*w+right)*4;
  for(let k=0;k<3;k++)p[i+k]=src[i+k]*(1-fade)+(src[l+k]*(1-t)+src[r+k]*t)*fade;
 }
 ctx.putImageData(pixels,0,0);rig.headMesh.material=rig.headMesh.material.clone();const map=old.clone();map.image=c;map.needsUpdate=true;rig.headMesh.material.map=map;
}
// Lightly relax only boundary vertices. Coincident split triangle vertices are
// grouped so movement does not tear the surface; silhouettes are not decimated.
export function softenEarContour(ears){
 for(const ear of ears){
  const g=ear.geometry,p=g.attributes.position,idx=g.index,key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(6)).join(',');
  const groups=new Map(),edges=new Map();for(let i=0;i<p.count;i++){const k=key(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i)}
  for(let i=0;i<idx.count;i+=3)for(const [a,b] of [[0,1],[1,2],[2,0]]){
   const x=key(idx.getX(i+a)),y=key(idx.getX(i+b));if(x===y)continue;const k=[x,y].sort().join('|');if(!edges.has(k))edges.set(k,{x,y,count:0});edges.get(k).count++;
  }
  const adj=new Map();for(const e of edges.values())if(e.count===1)for(const [x,y] of [[e.x,e.y],[e.y,e.x]]){if(!adj.has(x))adj.set(x,new Set());adj.get(x).add(y)}
  // Restrict the operation to the largest outer boundary component, not the
  // smaller inner-ear opening.
  const visited=new Set(),components=[];
  for(const key of adj.keys()){
   if(visited.has(key))continue;const component=[],stack=[key];visited.add(key);
   while(stack.length){const v=stack.pop();component.push(v);for(const n of adj.get(v))if(!visited.has(n)){visited.add(n);stack.push(n)}}components.push(component);
  }
  components.sort((a,b)=>b.length-a.length);const outer=new Set(components[0]||[]);
  const updates=new Map();for(const [k,neighbors] of adj){if(!outer.has(k)||neighbors.size!==2)continue;const a=k.split(',').map(Number),list=[...neighbors].map(n=>n.split(',').map(Number));
   const v=a.map((x,j)=>x*.88+(list[0][j]+list[1][j])*.06);updates.set(k,v)}
  for(const [k,v] of updates)for(const i of groups.get(k))p.setXYZ(i,...v);
  p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal,acc=new Map();
  for(let i=0;i<p.count;i++){let k=key(i),v=acc.get(k)||new THREE.Vector3();v.add(new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i)));acc.set(k,v)}
  for(let i=0;i<p.count;i++){const v=acc.get(key(i)).clone().normalize();n.setXYZ(i,v.x,v.y,v.z)}n.needsUpdate=true;ear.userData.softenedBoundaryVertices=updates.size;
 }
}
