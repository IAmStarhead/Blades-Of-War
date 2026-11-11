import * as THREE from 'three';
// Close the small boundary opening in the ear's front surface using its own
// boundary vertices. Does not weld the ear to the head or add any vertices.
export function closeInnerGap(ears){
 for(const ear of ears){
  const g=ear.geometry,p=g.attributes.position,idx=g.index,edges=new Map(),adj=new Map();
  for(let i=0;i<idx.count;i+=3)for(let j=0;j<3;j++){
   const a=idx.getX(i+j),b=idx.getX(i+(j+1)%3),key=a<b?`${a}:${b}`:`${b}:${a}`;
   let e=edges.get(key)||{a,b,n:0};e.n++;edges.set(key,e);
  }
  for(const e of edges.values())if(e.n===1)for(const [a,b] of [[e.a,e.b],[e.b,e.a]]){if(!adj.has(a))adj.set(a,new Set());adj.get(a).add(b)}
  const seen=new Set();let patched=0;
  for(const start of adj.keys()){
   if(seen.has(start))continue;const stack=[start],component=[];seen.add(start);
   while(stack.length){let v=stack.pop();component.push(v);for(const j of adj.get(v))if(!seen.has(j)){seen.add(j);stack.push(j)}}
   if((component.length!==6 && component.length!==8)||component.some(i=>adj.get(i).size!==2))continue;
   const ys=component.map(i=>p.getY(i)),zs=component.map(i=>p.getZ(i)),xs=component.map(i=>p.getX(i));
   const span=a=>Math.max(...a)-Math.min(...a),mean=a=>a.reduce((x,y)=>x+y,0)/a.length;
   if(span(xs)<.010||span(xs)>.019||span(ys)>.006||span(zs)>.004||mean(ys)<.075||mean(ys)>.083||mean(zs)>-.007||mean(zs)<-.019)continue;
   const loop=[start];let prev=-1,cur=start;do{const next=[...adj.get(cur)].find(i=>i!==prev);prev=cur;cur=next;if(cur!==start)loop.push(cur)}while(cur!==start&&loop.length<=component.length);
   if(cur!==start||loop.length!==component.length)continue;
   const shape=loop.map(i=>new THREE.Vector2(p.getX(i),p.getY(i))),tris=THREE.ShapeUtils.triangulateShape(shape,[]);
   if(tris.length!==loop.length-2)continue;
   const all=Array.from(idx.array);for(const t of tris)all.push(...t.map(i=>loop[i]));g.setIndex(all);patched+=tris.length;
  }
  ear.userData.closedGapTriangles=patched;
 }
}
