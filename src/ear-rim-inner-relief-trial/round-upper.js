import * as THREE from 'three';
// Relax only the upper part of the already-restored ear. No indices, lower
// lobe or head vertices are modified. Preserve the pre-existing normal field
// and apply only the change caused by this local relaxation.
export function roundUpperEar(ears) {
 for(const ear of ears){
  const g=ear.geometry,p=g.attributes.position,n=g.attributes.normal,old=n.clone(),idx=g.index;
  const adj=Array.from({length:p.count},()=>new Set());
  for(let i=0;i<idx.count;i+=3){const a=idx.getX(i),b=idx.getX(i+1),c=idx.getX(i+2);for(const [u,v] of [[a,b],[b,c],[c,a]]){adj[u].add(v);adj[v].add(u)}}
  g.computeVertexNormals();const reference=g.attributes.normal.clone();
  let max=0;
  for(let step=0;step<8;step++){
   const oldp=p.array.slice(),updates=[];
   for(let i=0;i<p.count;i++){
    const y=oldp[3*i+1],w=THREE.MathUtils.smoothstep(y,.087,.103);
    if(!w||!adj[i].size)continue;
    let avg=new THREE.Vector3();for(const j of adj[i])avg.add(new THREE.Vector3(oldp[3*j],oldp[3*j+1],oldp[3*j+2]));avg.multiplyScalar(1/adj[i].size);
    let v=new THREE.Vector3(oldp[3*i],y,oldp[3*i+2]),d=avg.sub(v).multiplyScalar(.42*w); if(d.length()>.0005)d.setLength(.0005);
    max=Math.max(max,d.length());updates.push([i,v.add(d)]);
   }
   for(const [i,v] of updates)p.setXYZ(i,v.x,v.y,v.z);
  }
  p.needsUpdate=true;g.computeVertexNormals();const out=g.attributes.normal;
  for(let i=0;i<p.count;i++){
   const y=p.getY(i),w=THREE.MathUtils.smoothstep(y,.087,.103);const v=new THREE.Vector3(old.getX(i),old.getY(i),old.getZ(i));
   v.add(new THREE.Vector3(out.getX(i)-reference.getX(i),out.getY(i)-reference.getY(i),out.getZ(i)-reference.getZ(i)).multiplyScalar(.65*w)).normalize();out.setXYZ(i,v.x,v.y,v.z);
  }out.needsUpdate=true;ear.userData.roundUpperStepMax=max;
 }
}
