import assert from 'node:assert/strict';
import * as THREE from 'three';
import {blendFrontContour} from '../src/ear-old-front-new-profile-trial/blend-front.js';
for(const side of [-1,1]){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([side*.083,.085,0,side*.084,.090,.001,side*.083,.06,0],3));g.setIndex([0,1,2]);g.computeVertexNormals();const before=g.attributes.position.array.slice(),indices=g.index.array.slice();
 const h=new THREE.BufferGeometry();h.setAttribute('position',new THREE.Float32BufferAttribute([side*.089,.05,-.02,side*.089,.11,-.02,side*.089,.08,.02],3));h.setIndex([0,1,2]);h.computeVertexNormals();const e={name:side<0?'reference-ear-left':'reference-ear-right',geometry:g,position:new THREE.Vector3(),userData:{}},o={geometry:h,position:new THREE.Vector3()};blendFrontContour([e],[o]);assert(e.userData.frontBlendMoved>0);assert(e.userData.frontBlendMax<=.0025);assert.notEqual(g.attributes.position.getX(0),before[0]);assert.equal(g.attributes.position.getX(2),before[6]);for(let i=0;i<g.attributes.position.count;i++){assert.equal(g.attributes.position.getY(i),before[3*i+1]);assert.equal(g.attributes.position.getZ(i),before[3*i+2]);}assert.deepEqual(g.index.array,indices);for(const n of g.attributes.normal.array)assert(Number.isFinite(n));
}
console.log('Blending only changes bounded upper X coordinates and preserves the lobe and topology.');
