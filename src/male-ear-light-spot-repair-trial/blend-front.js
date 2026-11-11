import * as THREE from 'three';
import {MeshBVH} from 'three-mesh-bvh';
// Pull only the upper/outside X contour towards the nearest earlier ear
// surface, in head coordinates. Y/Z and lobe are unchanged. Not a weld.
export function blendFrontContour(newEars,oldEars){
 for(let k=0;k<newEars.length;k++){
  const ear=newEars[k],old=oldEars[k],side=ear.name.endsWith('left')?-1:1,g=ear.geometry,p=g.attributes.position;
  const tree=new MeshBVH(old.geometry,{indirect:true}),oldNormals=g.attributes.normal.clone();g.computeVertexNormals();const before=g.attributes.normal.clone();let moved=0,max=0;
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i),abs=side*x;
   const height=THREE.MathUtils.smoothstep(y,.067,.075);const outer=THREE.MathUtils.smoothstep(abs,.075,.082);const weight=height*outer;
   if(weight<=0)continue;
   const query=new THREE.Vector3(x+ear.position.x-old.position.x,y+ear.position.y-old.position.y,z+ear.position.z-old.position.z);
   const hit=tree.closestPointToPoint(query,{},0,.012);if(!hit)continue;
   const target=hit.point.x+old.position.x-ear.position.x,dx=THREE.MathUtils.clamp((target-x)*.55*weight,-.0025,.0025);
   if(Math.abs(dx)<1e-7)continue;p.setX(i,x+dx);max=Math.max(max,Math.abs(dx));moved++;
  }
  p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;
  for(let i=0;i<p.count;i++){let v=new THREE.Vector3(oldNormals.getX(i),oldNormals.getY(i),oldNormals.getZ(i));v.add(new THREE.Vector3(n.getX(i)-before.getX(i),n.getY(i)-before.getY(i),n.getZ(i)-before.getZ(i)).multiplyScalar(.5)).normalize();n.setXYZ(i,v.x,v.y,v.z)}n.needsUpdate=true;ear.userData.frontBlendMoved=moved;ear.userData.frontBlendMax=max;
 }
}
