import * as THREE from 'three';
// Local upper attachment easing, before generating the overlap strip.
// Both ears use the same falloff; no indices or lobe vertices are removed.
export function easeUpperTip(ears,female){
 for(const ear of ears){
  const g=ear.geometry,p=g.attributes.position,old=g.attributes.normal.clone(),side=ear.name.endsWith('left')?-1:1;g.computeVertexNormals();const base=g.attributes.normal.clone();let max=0,count=0;
  for(let i=0;i<p.count;i++){
   const x=side*p.getX(i),y=p.getY(i),z=p.getZ(i),center=female?.076:.081;
   const w=THREE.MathUtils.smoothstep(y,.099,.106)*(1-THREE.MathUtils.smoothstep(x,center+.003,center+.008))*THREE.MathUtils.smoothstep(x,center-.006,center-.002)*(1-THREE.MathUtils.smoothstep(Math.abs(z+.002),.004,.014));
   const d=.0018*w;if(d>1e-8){p.setY(i,y-d);max=Math.max(max,d);count++}
  }
  p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;
  for(let i=0;i<p.count;i++){const v=new THREE.Vector3(old.getX(i),old.getY(i),old.getZ(i));v.add(new THREE.Vector3(n.getX(i)-base.getX(i),n.getY(i)-base.getY(i),n.getZ(i)-base.getZ(i)).multiplyScalar(.4)).normalize();n.setXYZ(i,v.x,v.y,v.z)}n.needsUpdate=true;ear.userData.tipEaseMax=max;ear.userData.tipEaseVertices=count;
 }
}
