// Static vertex tint on the ear's inner bowl, not a cast shadow. Geometry,
// colour of the rim, and the separate ear root remain unchanged.
export function shadeEarRecess(ears,female){
 for(const ear of ears){
  const p=ear.geometry.attributes.position,c=ear.geometry.attributes.color;
  for(let i=0;i<p.count;i++){
   const dy=(p.getY(i)-(female?.077:.080))/.010,dz=(p.getZ(i)-(female?-.008:-.014))/.008;
   const weight=.42*Math.exp(-1.0*(dy*dy+dz*dz));
   c.setXYZ(i,c.getX(i)*(1-weight),c.getY(i)*(1-weight),c.getZ(i)*(1-weight));
  }
  c.needsUpdate=true;
 }
}
