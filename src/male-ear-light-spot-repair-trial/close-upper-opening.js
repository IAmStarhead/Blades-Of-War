import * as THREE from 'three';
// Fill only a compact closed upper-ear boundary; retain all existing vertices.
// This repairs a hole in the ear mesh, not a weld to the head.
export function closeUpperOpening(ears){
 for(const ear of ears){
  const g=ear.geometry,p=g.attributes.position,idx=g.index,edges=new Map(),adj=new Map(),side=ear.name.endsWith('left')?-1:1;
  for(let i=0;i<idx.count;i+=3)for(let j=0;j<3;j++){let a=idx.getX(i+j),b=idx.getX(i+(j+1)%3),key=a<b?`${a}:${b}`:`${b}:${a}`,e=edges.get(key)||{a,b,count:0};e.count++;edges.set(key,e)}
  for(const e of edges.values())if(e.count===1)for(const [a,b] of [[e.a,e.b],[e.b,e.a]]){if(!adj.has(a))adj.set(a,new Set());adj.get(a).add(b)}
  let patched=0,seen=new Set(),indices=Array.from(idx.array);
  for(const start of adj.keys()){
   if(seen.has(start))continue;const stack=[start],comp=[];seen.add(start);while(stack.length){let v=stack.pop();comp.push(v);for(const u of adj.get(v))if(!seen.has(u)){seen.add(u);stack.push(u)}}
   if(comp.length<8||comp.length>18||comp.some(i=>adj.get(i).size!==2))continue;
   const xs=comp.map(i=>side*p.getX(i)),ys=comp.map(i=>p.getY(i)),zs=comp.map(i=>p.getZ(i)),range=v=>Math.max(...v)-Math.min(...v),mean=v=>v.reduce((a,b)=>a+b,0)/v.length;
   if(mean(xs)<.075||mean(xs)>.088||mean(ys)<.092||mean(ys)>.100||mean(zs)<-.018||mean(zs)>-.006||range(xs)>.012||range(ys)>.008||range(zs)>.010)continue;
   let loop=[start],prev=-1,cur=start;do{const next=[...adj.get(cur)].find(x=>x!==prev);prev=cur;cur=next;if(cur!==start)loop.push(cur)}while(cur!==start&&loop.length<=comp.length);
   if(cur!==start||loop.length!==comp.length)continue;
   const tris=THREE.ShapeUtils.triangulateShape(loop.map(i=>new THREE.Vector2(p.getX(i),p.getY(i))),[]);if(tris.length!==loop.length-2)continue;
   // Orient against the existing directed boundary edge. Adjacent manifold
   // triangles should traverse their common edge in opposite directions.
   let mapped=tris.map(t=>t.map(i=>loop[i])),votes=0;
   for(const t of mapped)for(let j=0;j<3;j++){const a=t[j],b=t[(j+1)%3],e=edges.get(a<b?`${a}:${b}`:`${b}:${a}`);if(e?.count===1)votes+=(e.a===a&&e.b===b)?-1:1;}
   if(votes<0)mapped=mapped.map(([a,b,c])=>[b,a,c]);for(const t of mapped)indices.push(...t);patched+=mapped.length;
  }
  if(patched)g.setIndex(indices);ear.userData.upperOpeningTriangles=patched;
 }
}
