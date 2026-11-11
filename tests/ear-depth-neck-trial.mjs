import assert from 'node:assert/strict';
import * as THREE from 'three';
import {deepenEar} from '../src/ear-depth-neck-trial/ear-depth.js';
for(const female of [true,false]){
 const y=female?.077:.080,z=female?-.008:-.014;
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([.08,y,z,.08,y+.05,z],3));geometry.setAttribute('color',new THREE.Float32BufferAttribute([1,1,1,1,1,1],3));let before=geometry.attributes.position.array.slice();deepenEar([{geometry}],female);assert.deepEqual(before,geometry.attributes.position.array);const c=geometry.attributes.color;assert(c.getX(0)<.53 && c.getX(0)>.51);assert(c.getX(1)>.999);console.log(female?'female':'male','ear tint bounded');
}
