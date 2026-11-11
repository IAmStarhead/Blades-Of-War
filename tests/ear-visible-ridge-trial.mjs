import assert from 'node:assert/strict';
import * as THREE from 'three';
import {shapeVisibleRidge} from '../src/ear-visible-ridge-trial/visible-ridge.js';
for(const female of [true,false])for(const side of [-1,1]){
 const x=female?.079:.083,z=female?-.007:-.011,g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([side*x,.08,z,side*x,.075,z-.003,side*x,.075,z+.003,side*x,.085,z+.003,side*x,.085,z-.003],3));g.setIndex([0,1,2,0,2,3,0,3,4,0,4,1]);g.computeVertexNormals();const before=g.attributes.position.array.slice(),idx=g.index.array.slice(),ear={name:side<0?'reference-ear-left':'reference-ear-right',geometry:g,userData:{}};shapeVisibleRidge([ear],female);assert(ear.userData.visibleRidgeCount>0);assert(ear.userData.visibleRidgeMax<=.0035);assert(g.attributes.position.getZ(0)>before[2]);assert.deepEqual(g.attributes.position.array.slice(3),before.slice(3));assert.deepEqual(g.index.array,idx);for(const n of g.attributes.normal.array)assert(Number.isFinite(n));
}
console.log('Front ridge is bounded, preserves boundary and topology on both sides.');
