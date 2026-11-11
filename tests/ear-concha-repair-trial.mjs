import assert from 'node:assert/strict';
import * as THREE from 'three';
import {repairEarBowl} from '../src/ear-concha-repair-trial/concha.js';
for(const female of [true,false])for(const side of [-1,1]){
 const material=new THREE.MeshBasicMaterial({color:0xffffff}),root=new THREE.Mesh(new THREE.SphereGeometry(),material);root.position.set(side*.075,.08,-.005);root.visible=false;const ear={userData:{root}};repairEarBowl([ear],female);assert(root.visible);assert.notEqual(root.material,material);assert.equal(material.color.r,1);assert(Math.abs(root.position.x)<.075);assert(root.scale.x<.004);assert(root.material.color.r<1);
}
console.log('Experimental inserts stay isolated from original material.');
