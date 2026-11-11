import assert from 'node:assert/strict';
import * as THREE from 'three';
import {copyMaleEarShape} from '../src/female-ear-male-shape-trial/copy-ear.js';
const mk=()=>({geometry:new THREE.SphereGeometry(.01,8,6)}),male={trialEars:[mk(),mk()]},female={trialEars:[mk(),mk()]},old=male.trialEars.map(e=>e.geometry.attributes.position.array.slice());copyMaleEarShape(female,male);
for(let i=0;i<2;i++){let a=male.trialEars[i].geometry.attributes.position,b=female.trialEars[i].geometry.attributes.position;assert.notEqual(male.trialEars[i].geometry,female.trialEars[i].geometry);assert.deepEqual(a.array,old[i]);assert.equal(a.count,b.count);for(let j=0;j<a.count;j++){assert(Math.abs(b.getX(j)-a.getX(j)*.96)<1e-6);assert(Math.abs(b.getY(j)-(.080+(a.getY(j)-.080)*.95))<1e-6);assert(Math.abs(b.getZ(j)-(a.getZ(j)+.006))<1e-6)}}console.log('Male ear geometry cloned; original remains unchanged.');
