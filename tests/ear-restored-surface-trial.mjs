import assert from 'node:assert/strict';
import * as THREE from 'three';
import {shadeBowlBacking} from '../src/ear-restored-surface-trial/bowl-shading.js';
for(const female of [true,false]){
 let y=female?.083:.088,z=female?-.008:-.014,g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([.07,y,z,-.07,y,z,0,y,z,.07,y+.08,z],3));let before=g.attributes.position.array.slice();shadeBowlBacking(g,female);assert.deepEqual(g.attributes.position.array,before);let c=g.attributes.color;assert(c.getX(0)<.65);assert.equal(c.getX(0),c.getX(1));assert.equal(c.getX(2),1);assert(c.getX(3)>.999);for(let x of c.array)assert(x>=.639&&x<=1);
}
console.log('Bowl backing tint is bounded and symmetric; no positions changed.');
