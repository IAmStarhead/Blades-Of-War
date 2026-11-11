// Soft, static vertex tint within the concha. It is not a light-dependent cast
// shadow; rim, lobe, vertex positions and triangle indices are left untouched.
export function shadeInnerEar(ears, female) {
 for (const ear of ears) {
  const p=ear.geometry.attributes.position, c=ear.geometry.attributes.color;
  for (let i=0;i<p.count;i++) {
   const y=(p.getY(i)-(female?.074:.076))/.008;
   const z=(p.getZ(i)-(female?-.002:-.006))/.007;
   const weight=.38*Math.exp(-1.25*(y*y+z*z));
   c.setXYZ(i,c.getX(i)*(1-weight),c.getY(i)*(1-weight),c.getZ(i)*(1-weight));
  }
  c.needsUpdate=true;
 }
}
