import {refineNose as base} from '../nose-root-trial/nose.js';
const gauss=(x,w)=>Math.exp(-((x/w)**2));
// Experimental nose shapes on the same already-approved head; no game presets.
export function kingdomNose(source,female,central){
 const g=base(source,female),p=g.attributes.position,uv=g.attributes.uv;
 for(let i=0;i<p.count;i++){
  const phi=(uv.getX(i)-.5)*2*Math.PI,v=uv.getY(i),abs=Math.abs(phi);
  const ridge=gauss(phi,.16)*gauss(v-.465,.065),tip=gauss(phi,.13)*gauss(v-.408,.03);
  const wings=gauss(abs-.14,.075)*gauss(v-.408,.04);
  let x=p.getX(i),z=p.getZ(i);
  if(central){
   // Smaller tip, softer bridge: keep the recess at the root intact.
   z-=.0025*ridge+.0035*tip+.0008*wings;
   x*=1-.04*gauss(abs-.15,.12)*gauss(v-.41,.05);
  }else{
   // Softer female ridge; male wings slightly broader without enlarging head.
   if(female)z-=.0018*ridge+.001*tip;
   const amount=female?.025:.08;
   x*=1+amount*gauss(abs-.16,.11)*gauss(v-.408,.045);
   z+=(female?.0004:.0015)*wings;
  }
  p.setXYZ(i,x,p.getY(i),z);
 }
 p.needsUpdate=true;
 // Keep previous face normals outside the edited region; use the updated
 // geometry normals only near the nose for shading of the changed surface.
 const old=g.attributes.normal.clone();g.computeVertexNormals();const n=g.attributes.normal;
 for(let i=0;i<n.count;i++){
  const phi=(uv.getX(i)-.5)*2*Math.PI,v=uv.getY(i),w=gauss(phi,.27)*gauss(v-.435,.11);
  let x=old.getX(i)*(1-w)+n.getX(i)*w,y=old.getY(i)*(1-w)+n.getY(i)*w,z=old.getZ(i)*(1-w)+n.getZ(i)*w;
  const len=Math.hypot(x,y,z)||1;n.setXYZ(i,x/len,y/len,z/len);
 }
 n.needsUpdate=true;return g;
}
