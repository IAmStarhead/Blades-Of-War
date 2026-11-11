import assert from 'node:assert/strict';
import * as THREE from 'three';
import {roundUpperEar} from '../src/ear-front-rounding-trial/round-upper.js';
for (const side of [-1,1]) {
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([side*.08,.07,0,side*.09,.10,0,side*.08,.105,.005,side*.07,.10,0],3));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();
 const before=g.attributes.position.array.slice(),indices=g.index.array.slice();const ear={geometry:g,userData:{}};
 roundUpperEar([ear]);assert.deepEqual(g.index.array,indices);assert.deepEqual([...g.attributes.position.array.slice(0,3)],[...before.slice(0,3)]);assert([...g.attributes.position.array].some((v,i)=>Math.abs(v-before[i])>1e-6));assert(ear.userData.roundUpperStepMax<=.00050001);
 for(const n of g.attributes.normal.array)assert(Number.isFinite(n));
}
console.log('Upper-ear relaxation leaves lower vertices and indices intact on both sides.');
