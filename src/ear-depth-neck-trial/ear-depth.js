// Additional static shading on the recessed concha only; preserves rim and
// geometry. This is not real-time occlusion and cannot fix the ear join.
export function deepenEar(ears,female){
 for(const ear of ears){
  const p=ear.geometry.attributes.position,c=ear.geometry.attributes.color;
  for(let i=0;i<p.count;i++){
   const dy=(p.getY(i)-(female?.077:.080))/.012,dz=(p.getZ(i)-(female?-.008:-.014))/.010;
   const w=.48*Math.exp(-1.25*(dy*dy+dz*dz));
   c.setXYZ(i,c.getX(i)*(1-w),c.getY(i)*(1-w),c.getZ(i)*(1-w));
  }c.needsUpdate=true;
 }
}
