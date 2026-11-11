import assert from 'node:assert/strict';
import * as THREE from 'three';
import {extendFemaleLobe} from '../src/ear-finish-attempt-trial/lobe-bridge.js';
for(const side of [-1,1]){
 let head=new THREE.SphereGeometry(.09,32,24),earG=new THREE.BufferGeometry();earG.setAttribute('position',new THREE.Float32BufferAttribute([side*.06,.055,.01,side*.06,.060,.012,side*.06,.055,.015],3));earG.setAttribute('color',new THREE.Float32BufferAttribute([1,1,1,1,1,1,1,1,1],3));earG.setIndex([0,1,2]);earG.computeVertexNormals();let headIndex=head.index.array.slice(),ear={geometry:earG,name:side<0?'reference-ear-left':'reference-ear-right',position:new THREE.Vector3(),userData:{}};extendFemaleLobe({headMesh:{geometry:head}},[ear]);assert(ear.userData.lobeStripEdges>0);assert(earG.index.count>3);assert.deepEqual(head.index.array,headIndex);for(const a of ['position','normal','color'])for(const v of earG.attributes[a].array)assert(Number.isFinite(v));for(const i of earG.index.array)assert(i<earG.attributes.position.count);
}console.log('Trial strip adds indexed finite triangles without changing head indices.');
