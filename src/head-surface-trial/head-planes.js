import * as THREE from 'three';
const smooth=(a,b,x)=>{let t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t)};
const band=(a,b,c,d,x)=>smooth(a,b,x)*(1-smooth(c,d,x));
const gauss=(x,c,w)=>Math.exp(-(((x-c)/w)**2));
// A head-only study: broad facial forms and a restrained reduction in the
// rounded rear skull profile; protection fades around the nose, lips and jaw.
export function headPlanes(g,female){
 const p=g.attributes.position,uv=g.attributes.uv,old=g.attributes.normal.clone(),changes=new Float32Array(p.count);let max=0;
 for(let i=0;i<p.count;i++){
  let x=p.getX(i),y=p.getY(i),z=p.getZ(i),a=Math.abs((uv.getX(i)-.5)*2*Math.PI),v=uv.getY(i);
  const nose=(1-smooth(.26,.45,a))*band(.34,.39,.56,.63,v),mouth=(1-smooth(.30,.46,a))*band(.27,.30,.36,.42,v),guard=1-Math.max(nose,mouth);
  const side=band(.32,.6,1.0,1.45,a);
  // Cheek merges into the side of the face. Socket sits below the brow.
  const cheek=side*gauss(v,.455,.115),socket=gauss(a,.46,.23)*gauss(v,.505,.035),brow=gauss(a,.46,.25)*gauss(v,.555,.05);
  let dz=guard*((female?.0030:.0040)*cheek-(female?.0012:.0015)*socket+(female?.0013:.0020)*brow);
  // Shape the back half of the cranium, but leave ear root and lower jaw alone.
  const back=smooth(1.55,2.35,a)*band(.23,.42,.86,1.02,v);
  const backDelta=(-z)*(female?.06:.065)*back;
  dz+=backDelta;
  const temple=band(.95,1.25,1.95,2.35,a)*band(.53,.65,.84,.98,v);
  const dx=x*((female?.014:.028)*side*band(.32,.4,.52,.62,v)*guard-(female?.035:.045)*temple);
  p.setXYZ(i,x+dx,y,z+dz);changes[i]=Math.min(1,(Math.abs(dx)+Math.abs(dz))/.003);max=Math.max(max,Math.hypot(dx,dz));
 }
 p.needsUpdate=true;g.computeVertexNormals();const n=g.attributes.normal;
 for(let i=0;i<n.count;i++){const norm=new THREE.Vector3(old.getX(i),old.getY(i),old.getZ(i)).lerp(new THREE.Vector3(n.getX(i),n.getY(i),n.getZ(i)),changes[i]*.35).normalize();n.setXYZ(i,norm.x,norm.y,norm.z)}n.needsUpdate=true;g.userData.planeMax=max;
}
