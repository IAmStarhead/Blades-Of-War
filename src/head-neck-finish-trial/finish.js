import * as THREE from 'three';
const bump=(x,c,r)=>{let q=(x-c)/r;return Math.abs(q)>=1?0:(1-q*q)**2};
// A shallow broad temple plane: avoids brows, eye sockets and cheekbones.
// Moves surface inward, preserving the silhouette at the crown.
export function templePlanes(g){
 const p=g.attributes.position,uv=g.attributes.uv,old=g.attributes.normal.clone();g.computeVertexNormals();const base=g.attributes.normal.clone();
 for(let i=0;i<p.count;i++){
  const phi=(uv.getX(i)-.5)*2*Math.PI,v=uv.getY(i),a=Math.abs(phi);
  const dx=-Math.sign(p.getX(i))*.0018*bump(a,1.18,.55)*bump(v,.65,.13);
  if(dx)p.setX(i,p.getX(i)+dx);
 }
 p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;
 for(let i=0;i<n.count;i++){const q=new THREE.Vector3(old.getX(i),old.getY(i),old.getZ(i));q.addScaledVector(new THREE.Vector3(n.getX(i)-base.getX(i),n.getY(i)-base.getY(i),n.getZ(i)-base.getZ(i)),.45).normalize();n.setXYZ(i,q.x,q.y,q.z)}n.needsUpdate=true;
}
// Rest-pose shading-only experiment; cannot join or weld separately moving
// surfaces. Smoothly blend head normals toward nearby neck normals.
export function blendNeckSeam(rig){
 const h=rig.headMesh.geometry,b=rig.bodyMesh.geometry,hp=h.attributes.position,bp=b.attributes.position,hn=h.attributes.normal,bn=b.attributes.normal,uv=h.attributes.uv,hy=rig.metrics.headY;
 const body=[];for(let j=0;j<Math.min(bp.count,500);j++)if(bp.getY(j)>hy-.07&&Math.abs(bp.getX(j))<.085&&Math.abs(bp.getZ(j))<.09)body.push(j);
 for(let i=0;i<hp.count;i++){
  if(uv.getY(i)>.27)continue;let best=-1,d=.016**2;
  for(const j of body){const r=(hp.getX(i)-bp.getX(j))**2+(hp.getY(i)+hy-bp.getY(j))**2+(hp.getZ(i)-bp.getZ(j))**2;if(r<d){best=j;d=r}}
  if(best<0)continue;let w=.65*(1-Math.sqrt(d)/.016);w=w*w*(3-2*w);
  const a=new THREE.Vector3(hn.getX(i),hn.getY(i),hn.getZ(i)),n=new THREE.Vector3(bn.getX(best),bn.getY(best),bn.getZ(best));
  a.lerp(n,w).normalize();hn.setXYZ(i,a.x,a.y,a.z);
 }
 hn.needsUpdate=true;
}
