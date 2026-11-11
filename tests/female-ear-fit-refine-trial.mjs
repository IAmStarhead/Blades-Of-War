import assert from 'node:assert/strict';
import * as THREE from 'three';
import {copyMaleEarShape} from '../src/female-ear-fit-refine-trial/copy-ear.js';
const mk=()=>({geometry:new THREE.SphereGeometry(.01,8,6)}),male={trialEars:[mk(),mk()]},left={trialEars:[mk(),mk()]},right={trialEars:[mk(),mk()]},original=male.trialEars.map(e=>e.geometry.attributes.position.array.slice());copyMaleEarShape(left,male);copyMaleEarShape(right,male,true);
for(let i=0;i<2;i++){let a=male.trialEars[i].geometry.attributes.position,b=left.trialEars[i].geometry.attributes.position,c=right.trialEars[i].geometry.attributes.position;assert.deepEqual(a.array,original[i]);assert.notEqual(a,c);for(let j=0;j<a.count;j++){assert(Math.abs(b.getX(j)-a.getX(j)*.96)<1e-6);assert(Math.abs(c.getX(j)-a.getX(j)*.95)<1e-6);assert(Math.abs(c.getZ(j)-b.getZ(j)+.002)<1e-6);assert.equal(b.getY(j),c.getY(j));}}
console.log('Both fitted copies preserve source male geometry.');
