// Copy the actual finalized male trial geometry onto the female trial only.
// Both ears remain separate meshes attached to HEAD, not welded to the scalp.
export function copyMaleEarShape(femaleRig,maleRig){
 for(let k=0;k<2;k++){
  const target=femaleRig.trialEars[k],source=maleRig.trialEars[k],g=source.geometry.clone(),p=g.attributes.position;
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
   p.setXYZ(i,x*.96,.080+(y-.080)*.95,z+.006);
  }p.needsUpdate=true;target.geometry.dispose();target.geometry=g;
 }
}
