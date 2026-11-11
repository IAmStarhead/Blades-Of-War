import assert from 'node:assert/strict';
import * as THREE from 'three';
import {splitTriangles} from '../src/face-profile-trial/rework.js';
import {restoreMouthProjection} from '../src/face-profile-trial/profile.js';
const g=splitTriangles(new THREE.SphereGeometry(.1,64,40)),p=g.attributes.position,uv=g.attributes.uv,before=p.array.slice();restoreMouthProjection(g);let changed=0;
for(let i=0;i<p.count;i++){assert.equal(p.getX(i),before[i*3]);assert.equal(p.getY(i),before[i*3+1]);const d=p.getZ(i)-before[i*3+2];assert(Number.isFinite(d)&&d>=0);if(d){changed++;const a=Math.abs((uv.getX(i)-.5)*Math.PI*2),v=uv.getY(i);assert(a<.55&&v>.258&&v<.419)}for(let k=0;k<3;k++)assert(Number.isFinite(g.attributes.normal.getComponent(i,k)))}assert(changed);console.log('Profile correction bounded; normals finite.');
