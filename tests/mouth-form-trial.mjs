import assert from 'node:assert/strict';
import * as THREE from 'three';
import {splitTriangles} from '../src/mouth-form-trial/rework.js';
import {sculptMouth} from '../src/mouth-form-trial/mouth-form.js';
const g=splitTriangles(new THREE.SphereGeometry(.1,64,40)), p=g.attributes.position, uv=g.attributes.uv, before=p.array.slice();
sculptMouth(g);let count=0;
for(let i=0;i<p.count;i++){
 assert.equal(p.getX(i),before[3*i]);assert.equal(p.getY(i),before[3*i+1]);
 assert(Number.isFinite(p.getZ(i)));
 if(p.getZ(i)!==before[3*i+2]){count++;const a=Math.abs((uv.getX(i)-.5)*Math.PI*2),v=uv.getY(i);assert(a<.43&&v>.256&&v<.394)}
 for(let k=0;k<3;k++)assert(Number.isFinite(g.attributes.normal.getComponent(i,k)));
}
assert(count>0);console.log('Mouth deformation is finite, symmetric by construction and limited to its UV region.');
