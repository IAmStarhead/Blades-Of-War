import assert from 'node:assert/strict';
import * as THREE from 'three';
import {bridgeUpperRoot} from '../src/ear-upper-bridge-trial/bridge.js';
for(const side of [-1,1]){
 const head=new THREE.PlaneGeometry(.2,.2,1,1);head.rotateY(Math.PI/2);head.translate(side*.07,.09,-.01);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([side*.075,.09,-.01,side*.076,.10,-.01,side*.078,.095,-.015],3));g.setIndex([0,1,2]);g.computeVertexNormals();g.setAttribute('color',new THREE.Float32BufferAttribute(Array(9).fill(1),3));
 const pos=g.attributes.position.array.slice(),headpos=head.attributes.position.array.slice(),headidx=head.index.array.slice();const ear={geometry:g,name:side<0?'reference-ear-left':'reference-ear-right',position:new THREE.Vector3(),userData:{}};
 bridgeUpperRoot({headMesh:{geometry:head}},[ear],true);assert(ear.userData.upperBridgeTriangles>0);assert.deepEqual(g.attributes.position.array.slice(0,pos.length),pos);assert.deepEqual(head.attributes.position.array,headpos);assert.deepEqual(head.index.array,headidx);for(const v of g.index.array)assert(v<g.attributes.position.count);for(const v of g.attributes.normal.array)assert(Number.isFinite(v));
}
console.log('Bridge adds ear triangles without moving original vertices or changing head geometry.');
