import assert from 'node:assert/strict';
import * as THREE from 'three';
import {softenInnerEar} from '../src/female-ear-inner-soften-trial/soften-inner.js';
for(const side of [-1,1]){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([side*.076,.081,-.008,side*.071,.076,-.009,side*.081,.076,-.009,side*.081,.086,-.009,side*.071,.086,-.009],3));g.setIndex([0,1,2,0,2,3,0,3,4,0,4,1]);g.computeVertexNormals();const before=g.attributes.position.array.slice(),index=g.index.array.slice(),ear={geometry:g,userData:{}};softenInnerEar([ear]);assert.deepEqual(g.index.array,index);assert.deepEqual(g.attributes.position.array.slice(3),before.slice(3));assert.notEqual(g.attributes.position.getZ(0),before[2]);assert(ear.userData.innerRelaxStepMax<=.00025001);for(const v of g.attributes.normal.array)assert(Number.isFinite(v));
}
console.log('Interior relax is bounded, fixes boundary vertices and preserves topology.');
