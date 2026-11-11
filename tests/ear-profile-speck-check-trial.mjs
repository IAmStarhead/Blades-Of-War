import assert from 'node:assert/strict';
import * as THREE from 'three';
import {repairUpperRoot} from '../src/ear-profile-speck-check-trial/root-mesh.js';
for(const side of [-1,1]){
 const head=new THREE.PlaneGeometry(.1,.1,5,5);head.rotateY(Math.PI/2);head.translate(side*.070,.095,-.01);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([side*.073,.094,-.01,side*.074,.098,-.01,side*.075,.095,-.012],3));g.setIndex([0,1,2]);g.computeVertexNormals();g.setAttribute('color',new THREE.Float32BufferAttribute(Array(9).fill(1),3));
 const old=g.attributes.position.array.slice(),a={geometry:g.clone(),name:side<0?'reference-ear-left':'reference-ear-right',position:new THREE.Vector3(),userData:{}},b={geometry:g.clone(),name:a.name,position:new THREE.Vector3(),userData:{}};
 repairUpperRoot({headMesh:{geometry:head}},[a],true,false);repairUpperRoot({headMesh:{geometry:head}},[b],true,true);assert(a.userData.rootRepairTriangles>0);assert.equal(b.userData.rootRepairTriangles,0);assert.deepEqual(b.geometry.attributes.position.array.slice(0,old.length),old);for(const i of a.geometry.index.array)assert(i<a.geometry.attributes.position.count);for(const n of a.geometry.attributes.normal.array)assert(Number.isFinite(n));
}
console.log('Selective strip omission keeps original ear vertices and removes expected test strip.');
