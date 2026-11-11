import assert from 'node:assert/strict';
import * as THREE from 'three';
import {settleUpperRoot} from '../src/ear-front-surface-trial/soften-root.js';
import {softenEarStrip} from '../src/ear-front-surface-trial/soften-strip.js';
for(const side of [-1,1]){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([side*.071,.104,-.018,side*.074,.098,-.015,side*.08,.10,-.008,side*.071,.06,-.018],3));g.setIndex([0,1,2,1,3,2]);g.computeVertexNormals();
 const pos=g.attributes.position.array.slice(),idx=g.index.array.slice();const ear={name:side<0?'reference-ear-left':'reference-ear-right',geometry:g,material:new THREE.MeshLambertMaterial(),userData:{}};
 settleUpperRoot([ear]);assert.deepEqual(g.index.array,idx);assert.deepEqual([...g.attributes.position.array.slice(9,12)],[...pos.slice(9,12)]);assert(ear.userData.upperRootMax>0&&ear.userData.upperRootMax<=.003);for(const n of g.attributes.normal.array)assert(Number.isFinite(n));
 const old=ear.material;softenEarStrip([ear],true);assert.notEqual(ear.material,old);const shader={vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <color_fragment>'};ear.material.onBeforeCompile(shader);assert(shader.vertexShader.includes('vEarLocal = position'));assert(shader.fragmentShader.includes('diffuseColor.rgb *= 1.0-0.46*w'));assert.equal(ear.material.customProgramCacheKey(),'ear-strip-f');
}
console.log('Upper root adjustment keeps lobe and indices; private strip shader installed.');
