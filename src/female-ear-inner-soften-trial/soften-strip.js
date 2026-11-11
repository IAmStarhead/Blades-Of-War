// Soften the bright back surface visible through the inner ear's open seam.
// Static tint in local coordinates, not a weld or actual cast shadow.
export function softenEarStrip(ears,female) {
 for(const ear of ears){
  const material=ear.material.clone(), y=female?.0792:.0798,z=female?-.0157:-.0197;
  material.onBeforeCompile=shader=>{
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vEarLocal;').replace('#include <begin_vertex>','#include <begin_vertex>\nvEarLocal = position;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vEarLocal;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
     float dy=(vEarLocal.y-${y.toFixed(4)})/.0038;
     float dz=(vEarLocal.z-(${z.toFixed(4)}))/.0035;
     float w=exp(-1.2*(dy*dy+dz*dz));
     diffuseColor.rgb *= 1.0-0.46*w;`);
  };
  material.customProgramCacheKey=()=>`ear-strip-${female?'f':'m'}`;
  material.needsUpdate=true;ear.material=material;
 }
}
