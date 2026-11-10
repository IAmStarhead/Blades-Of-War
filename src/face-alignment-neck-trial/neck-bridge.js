import * as THREE from 'three';
// Static, trial-only neck connection: trim overlapping torso rings and span
// from the head underside to a matching 20-sided body neck contour.
export function connectNeck(rig,female){
 const body=rig.bodyMesh.geometry, bp=body.attributes.position;
 const start=female?357:252, tubeEnd=female?420:315;
 const bodyIndices=body.index,keep=[];
 for(let i=0;i<bodyIndices.count;i+=3){const a=bodyIndices.getX(i),b=bodyIndices.getX(i+1),c=bodyIndices.getX(i+2);
  if(a<tubeEnd&&b<tubeEnd&&c<tubeEnd&&Math.max(a,b,c)>start+20)continue;
  keep.push(a,b,c);
 }
 body.setIndex(keep);body.computeVertexNormals();
 const head=rig.headMesh.geometry, old=head.attributes.position, uv=head.attributes.uv, seg=64, row=5, count=old.count;
 let v=new Float32Array((count+65)*3),u=new Float32Array((count+65)*2);v.set(old.array);u.set(uv.array);
 for(let s=0;s<=seg;s++){
  const t=s*20/seg,j=Math.floor(t),f=t-j,a=start+Math.min(j,20),b=start+Math.min(j+1,20);
  const idx=count+s;
  v[3*idx]=THREE.MathUtils.lerp(bp.getX(a),bp.getX(b),f);
  v[3*idx+1]=THREE.MathUtils.lerp(bp.getY(a),bp.getY(b),f)-rig.metrics.headY;
  v[3*idx+2]=THREE.MathUtils.lerp(bp.getZ(a),bp.getZ(b),f);
  u[2*idx]=s/seg;u[2*idx+1]=.10;
 }
 const indices=[],hidx=head.index;
 for(let i=0;i<hidx.count;i+=3){const a=hidx.getX(i),b=hidx.getX(i+1),c=hidx.getX(i+2);if(a<row*65||b<row*65||c<row*65)continue;indices.push(a,b,c)}
 // ring order follows the original generator; same winding as original rings.
 for(let s=0;s<seg;s++){let a=count+s,b=count+s+1,c=row*65+s,d=c+1;indices.push(a,b,c,b,d,c)}
 head.setAttribute('position',new THREE.BufferAttribute(v,3));head.setAttribute('uv',new THREE.BufferAttribute(u,2));head.setIndex(indices);head.computeVertexNormals();
}
