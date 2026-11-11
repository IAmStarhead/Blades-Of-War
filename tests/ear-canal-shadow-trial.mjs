import assert from 'node:assert/strict';
import * as THREE from 'three';
import {shadeCanal} from '../src/ear-canal-shadow-trial/canal.js';
for(const side of [-1,1]) {
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([side*.07,.0715,.003,side*.07,.10,.03,side*.07,.05,-.03],3));g.setAttribute('color',new THREE.Float32BufferAttribute(Array(9).fill(1),3));g.setIndex([0,1,2]);
 const pos=g.attributes.position.array.slice(),idx=g.index.array.slice();shadeCanal({trialEars:[{geometry:g}]},true);
 assert.deepEqual(g.attributes.position.array,pos);assert.deepEqual(g.index.array,idx);assert(g.attributes.color.getX(0)<.5);assert(g.attributes.color.getX(1)>.999);
}
console.log('Female canal tint is local; geometry and indices unchanged.');
