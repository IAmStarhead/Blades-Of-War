import assert from 'node:assert/strict';
import * as THREE from 'three';
import {fitBoundary} from '../src/ear-boundary-fit-trial/boundary.js';
for(const side of [-1,1]){
 const head=new THREE.SphereGeometry(.08,32,24), earG=new THREE.PlaneGeometry(.01,.01,3,3);earG.rotateY(Math.PI/2);earG.translate(side*.086,0,0);const prior=earG.attributes.position.array.slice(),headIndex=head.index.array.slice(),ear={geometry:earG,name:side<0?'reference-ear-left':'reference-ear-right',position:new THREE.Vector3(),userData:{}};
 fitBoundary({headMesh:{geometry:head}},[ear]);assert(ear.userData.boundaryFitMoved>0);assert.deepEqual(head.index.array,headIndex);assert.equal(head.boundsTree,undefined);let p=earG.attributes.position,n=earG.attributes.normal;for(let i=0;i<p.count;i++){assert.equal(p.getY(i),prior[3*i+1]);assert.equal(p.getZ(i),prior[3*i+2]);for(let k=0;k<3;k++)assert(Number.isFinite(n.getComponent(i,k)))}
}console.log('Boundary fitting moves vertices without changing head indices.');
