import assert from 'node:assert/strict';
import * as THREE from 'three';
import {revealLobe} from '../src/ear-lobe-join-trial/lobe.js';
for(const side of [-1,1]){let g=new THREE.SphereGeometry(.01,32,16);g.translate(side*.075,.056,.002);let p=g.attributes.position,old=p.array.slice();revealLobe([{geometry:g}]);let changed=0;for(let i=0;i<p.count;i++){const dx=p.getX(i)-old[3*i];if(dx){changed++;assert(Math.sign(dx)===side);assert(Math.abs(dx)<=.003501)}assert.equal(p.getY(i),old[3*i+1]);assert.equal(p.getZ(i),old[3*i+2]);for(let j=0;j<3;j++)assert(Number.isFinite(g.attributes.normal.getComponent(i,j)))}assert(changed);}
console.log('Lobe displacement bounded, mirrored and finite.');
