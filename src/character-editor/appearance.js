import * as THREE from 'three';

// Procedural, texture-free skin and simple underwear on the existing surface.
// Fabric is a shader mask, not a separate 3D garment or a clothing system.
export function createAppearanceMaterial(female, floor, color) {
 const mat=new THREE.MeshStandardMaterial({color,roughness:.93,metalness:0});
 mat.onBeforeCompile=shader=>{
  shader.uniforms.bowFloor={value:floor};
  shader.uniforms.bowFemale={value:female?1:0};
  shader.vertexShader=shader.vertexShader
   .replace('#include <common>','#include <common>\nvarying vec3 bowSurfacePosition;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nbowSurfacePosition=position;');
  shader.fragmentShader=shader.fragmentShader
   .replace('#include <common>',`#include <common>
     varying vec3 bowSurfacePosition;
     uniform float bowFloor;
     uniform float bowFemale;
   `)
   .replace('vec4 diffuseColor = vec4( diffuse, opacity );',`vec4 diffuseColor = vec4( diffuse, opacity );
     vec3 p = bowSurfacePosition;
     float y = p.y + bowFloor;
     float fine = sin(p.x*46.0 + sin(p.y*13.0))*sin(p.z*37.0 + p.y*18.0);
     float broad = sin(p.y*3.2 + p.x*2.1)*sin(p.z*3.8 - p.x*1.3);
     diffuseColor.rgb *= 1.0 + .006*fine + .010*broad;
     // Linen shorts: softened seams, applied only near the pelvis.
     float ax=abs(p.x);
     float legEdge=7.70+0.70*smoothstep(.55,1.42,ax);
     float brief=smoothstep(legEdge-.08,legEdge+.08,y)*(1.0-smoothstep(9.76,9.89,y));
     brief*=1.0-smoothstep(1.68,2.05,ax);
     // Simple wrapped band to cover the bust on the female base.
     float bra=smoothstep(12.0,12.12,y)*(1.0-smoothstep(13.22,13.34,y));
     bra*=1.0-smoothstep(1.24,1.50,ax);
     bra*=bowFemale;
     float fabric=max(brief,bra);
     float weave=1.0+.025*sin(p.x*60.0)*sin(y*68.0);
     vec3 linen=vec3(.15,.14,.12)*weave;
     diffuseColor.rgb=mix(diffuseColor.rgb,linen,fabric);
   `);
 };
 mat.customProgramCacheKey=()=>`bow-body-appearance-v1-${female?'female':'male'}`;
 return mat;
}
