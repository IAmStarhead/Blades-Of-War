import * as THREE from 'three';
const smooth=(a,b,x)=>{let t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
const band=(a,b,c,d,x)=>smooth(a,b,x)*(1-smooth(c,d,x));
// Connected, broad zones rather than point-like lumps. Smooth masks protect
// the accepted nose, lips, jaw, skull height and the back of the head.
export function reshapeFace(g,female){
 const p=g.attributes.position,uv=g.attributes.uv,n0=g.attributes.normal.clone(),weight=new Float32Array(p.count);let max=0;
 for(let i=0;i<p.count;i++){
  const u=uv.getX(i),v=uv.getY(i),a=Math.abs((u-.5)*Math.PI*2);
  const nose=(1-smooth(.26,.42,a))*band(.34,.39,.56,.62,v);
  const mouth=(1-smooth(.30,.43,a))*band(.27,.30,.36,.40,v);
  const mask=1-Math.max(nose,mouth);
  // The cheek extends into the temple and midface, not a small round bump.
  const mid=band(.44,.70,1.05,1.48,a)*band(.30,.37,.49,.59,v);
  const upper=band(.43,.64,.88,1.25,a)*band(.48,.53,.58,.66,v);
  const dz=mask*((female?.0013:.0018)*mid+(female?.0005:.0008)*upper);
  // Small structural width change only above the approved jawline.
  const width=band(.44,.66,1.12,1.5,a)*band(.34,.40,.50,.61,v);
  const dx=p.getX(i)*(female?.025:.045)*width*mask;
  p.setXYZ(i,p.getX(i)+dx,p.getY(i),p.getZ(i)+dz);max=Math.max(max,Math.hypot(dx,dz));weight[i]=Math.min(1,(Math.abs(dx)+Math.abs(dz))/.003);
 }
 p.needsUpdate=true;g.computeVertexNormals();let n=g.attributes.normal;
 for(let i=0;i<n.count;i++){const v=new THREE.Vector3(n0.getX(i),n0.getY(i),n0.getZ(i)).lerp(new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i)),weight[i]*.45).normalize();n.setXYZ(i,v.x,v.y,v.z)}n.needsUpdate=true;g.userData.structureMaxDisplacement=max;
}
