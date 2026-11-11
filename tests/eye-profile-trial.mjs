import assert from 'node:assert/strict';
import * as THREE from 'three';
import {splitTriangles} from '../src/eye-profile-trial/rework.js';
import {orientEyes} from '../src/eye-profile-trial/eye-profile.js';
const g=splitTriangles(new THREE.SphereGeometry(.1,64,40)),p=g.attributes.position,uv=g.attributes.uv,before=p.array.slice();orientEyes(g);let changed=0;
for(let i=0;i<p.count;i++){
 assert.equal(p.getX(i),before[3*i]);assert.equal(p.getY(i),before[3*i+1]);assert(Number.isFinite(p.getZ(i)));
 if(p.getZ(i)!==before[3*i+2]){changed++;const u=uv.getX(i),v=uv.getY(i),c=u<.5?222.7/512:289.3/512;assert(Math.abs(u-c)<.06&&v>.466&&v<.548)}
 for(let k=0;k<3;k++)assert(Number.isFinite(g.attributes.normal.getComponent(i,k)));
}assert(changed>0);console.log('Eye surface changes are bounded and finite.');
