import assert from 'node:assert/strict';
import {createAppearanceMaterial} from '../src/character-editor/appearance.js';
for(const female of [false,true]) {
 const mat=createAppearanceMaterial(female,16.2,'#bda79a');
 const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\nvec4 diffuseColor = vec4( diffuse, opacity );'};
 mat.onBeforeCompile(shader);
 assert.equal(shader.uniforms.bowFloor.value,16.2);
 assert.equal(shader.uniforms.bowFemale.value,female?1:0);
 assert.match(shader.vertexShader,/bowSurfacePosition=position/);
 assert.match(shader.fragmentShader,/vec3 linen/);
 assert.match(shader.fragmentShader,/bra\*=bowFemale/);
 assert.ok(mat.customProgramCacheKey().includes(female?'female':'male'));
 mat.dispose();
}
console.log('Editor appearance: shader setup for skin and underwear in both body types');
