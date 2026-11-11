import assert from 'node:assert/strict';
import * as THREE from 'three';
import {shadeInnerEar} from '../src/ear-inner-shadow-trial/inner-shadow.js';
for (const female of [false,true]) for (const side of [-1,1]) {
 const cy=female?.074:.076, cz=female?-.002:-.006;
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute([side*.08,cy,cz,side*.08,cy+.04,cz,side*.08,cy,cz+.04],3));
 g.setAttribute('color',new THREE.Float32BufferAttribute(Array(9).fill(1),3));
 g.setIndex([0,1,2]); const positions=g.attributes.position.array.slice(), indices=g.index.array.slice();
 shadeInnerEar([{geometry:g}],female);
 assert.deepEqual(g.attributes.position.array,positions);assert.deepEqual(g.index.array,indices);
 assert(g.attributes.color.getX(0)<.7);assert(g.attributes.color.getX(1)>.999);assert(g.attributes.color.getX(2)>.999);
 for(const c of g.attributes.color.array)assert(Number.isFinite(c)&&c>=0&&c<=1);
}
console.log('Inner tint is local and preserves ear geometry and indices.');
