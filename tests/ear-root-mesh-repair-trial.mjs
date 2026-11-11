import assert from 'node:assert/strict';
import * as THREE from 'three';
import {repairUpperRoot} from '../src/ear-root-mesh-repair-trial/root-mesh.js';
for(const side of [-1,1]){
 const head=new THREE.PlaneGeometry(.1,.1,5,5);head.rotateY(Math.PI/2);head.translate(side*.070,.095,-.01);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([side*.073,.09,-.01,side*.074,.1,-.01,side*.075,.095,-.015],3));g.setIndex([0,1,2]);g.computeVertexNormals();g.setAttribute('color',new THREE.Float32BufferAttribute(Array(9).fill(1),3));
 const old=g.attributes.position.array.slice(),hp=head.attributes.position.array.slice(),indices=head.index.array.slice();const ear={geometry:g,name:side<0?'reference-ear-left':'reference-ear-right',position:new THREE.Vector3(),userData:{}};
 repairUpperRoot({headMesh:{geometry:head}},[ear],true);assert(ear.userData.rootRepairTriangles>0);assert.deepEqual(g.attributes.position.array.slice(0,old.length),old);assert.deepEqual(head.attributes.position.array,hp);assert.deepEqual(head.index.array,indices);for(const i of g.index.array)assert(i<g.attributes.position.count);for(const n of g.attributes.normal.array)assert(Number.isFinite(n));
}
console.log('Overlap strip adds bounded indexed ear geometry and leaves original head and ear vertices intact.');
