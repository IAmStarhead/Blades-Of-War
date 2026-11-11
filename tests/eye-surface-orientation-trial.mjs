import assert from 'node:assert/strict';
import * as THREE from 'three';
import {splitTriangles} from '../src/eye-surface-orientation-trial/rework.js';
import {orientEyeSurface} from '../src/eye-surface-orientation-trial/eye-surface.js';
const g=splitTriangles(new THREE.SphereGeometry(.1,64,40)),p=g.attributes.position,uv=g.attributes.uv,before=p.array.slice();orientEyeSurface(g);let count=0;
for(let i=0;i<p.count;i++){assert.equal(p.getX(i),before[i*3]);assert.equal(p.getY(i),before[i*3+1]);let z=p.getZ(i);assert(Number.isFinite(z));if(z!==before[i*3+2]){count++;let u=uv.getX(i),v=uv.getY(i),c=u<.5?224.5/512:287.5/512;assert(Math.abs(u-c)<.066&&v>.467&&v<.553)}for(let k=0;k<3;k++)assert(Number.isFinite(g.attributes.normal.getComponent(i,k)))}assert(count>0);console.log('Eye surface modification bounded, geometry and normals finite.');
