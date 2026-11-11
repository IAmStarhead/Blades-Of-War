import assert from 'node:assert/strict';
import * as THREE from 'three';
import {addInnerRelief} from '../src/ear-inner-relief-strong-trial/inner-relief.js';
for(const female of [true,false])for(const side of [-1,1]){
 const x=female?.076:.081,z=female?-.007:-.011,g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([side*x,.081,z,side*x,.075,z-.003,side*x,.075,z+.003,side*x,.087,z+.003,side*x,.087,z-.003],3));g.setIndex([0,1,2,0,2,3,0,3,4,0,4,1]);g.computeVertexNormals();const before=g.attributes.position.array.slice(),idx=g.index.array.slice(),ear={name:side<0?'reference-ear-left':'reference-ear-right',geometry:g,userData:{}};addInnerRelief([ear],female,.0036);assert(ear.userData.innerReliefVertices>0);assert(ear.userData.innerReliefMax<=.0036);assert(side*g.attributes.position.getX(0)>side*before[0]);assert.deepEqual(g.attributes.position.array.slice(3),before.slice(3));assert.deepEqual(g.index.array,idx);for(const n of g.attributes.normal.array)assert(Number.isFinite(n));
}
console.log('Bounded inner relief preserves open boundary and indices for both sides and sexes.');
