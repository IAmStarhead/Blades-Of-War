import assert from 'node:assert/strict';
import * as THREE from 'three';
import {repairUpperRoot} from '../src/ear-root-shading-repair-trial/root-mesh.js';
for(const side of [-1,1]){
 const head=new THREE.PlaneGeometry(.1,.1,5,5);head.rotateY(Math.PI/2);head.translate(side*.070,.095,-.01);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([side*.073,.094,-.01,side*.074,.098,-.01,side*.075,.095,-.012],3));g.setIndex([0,1,2]);g.computeVertexNormals();g.setAttribute('color',new THREE.Float32BufferAttribute(Array(9).fill(1),3));
 const a={geometry:g.clone(),name:side<0?'reference-ear-left':'reference-ear-right',position:new THREE.Vector3(),userData:{}},b={geometry:g.clone(),name:a.name,position:new THREE.Vector3(),userData:{}};
 repairUpperRoot({headMesh:{geometry:head}},[a],true,false);repairUpperRoot({headMesh:{geometry:head}},[b],true,true);assert(a.userData.rootRepairTriangles>0);assert(b.userData.rootNormalAdjusted>0);assert.deepEqual(a.geometry.attributes.position.array,b.geometry.attributes.position.array);assert.deepEqual(a.geometry.index.array,b.geometry.index.array);assert.notDeepEqual(a.geometry.attributes.normal.array,b.geometry.attributes.normal.array);for(const n of b.geometry.attributes.normal.array)assert(Number.isFinite(n));
}
console.log('Normal adjustment changes lighting, not positions or triangle indices.');
