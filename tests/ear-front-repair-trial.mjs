import assert from 'node:assert/strict';
import * as THREE from 'three';
import {trimRearFlap} from '../src/ear-front-repair-trial/cleanup.js';
for (const side of [-1,1]) {
 const geometry=()=>{let g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([side*.08,.078,-.02,side*.08,.079,-.02,side*.08,.078,-.021,side*.08,.069,-.02,side*.08,.07,-.02,side*.08,.069,-.021],3));g.setIndex([0,1,2,3,4,5]);return g};
 const old={geometry:geometry(),name:side<0?'reference-ear-left':'reference-ear-right',userData:{}};
 const trial={geometry:geometry(),name:old.name,userData:{}};const pos=trial.geometry.attributes.position.array.slice();
 trimRearFlap([old],true,true);trimRearFlap([trial],true,'partial');
 assert.equal(old.geometry.index.count,0);assert.equal(trial.geometry.index.count,3);
 assert.deepEqual(trial.geometry.attributes.position.array,pos);
}
console.log('Partial trim retains the upper rear patch on both sides without moving vertices.');
