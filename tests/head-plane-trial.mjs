import assert from 'node:assert/strict';
import * as THREE from 'three';
import {headPlanes} from '../src/head-plane-trial/head-planes.js';
for(const female of [true,false]) {
 const g=new THREE.BufferGeometry();const samples=[[.37,.45,-.06,.08,.06],[.63,.45,.06,.08,.06],[.5,.48,0,.08,.1],[.5,.33,0,.04,.1],[0,.70,0,.12,-.1],[1,.70,0,.12,-.1]];
 g.setAttribute('position',new THREE.Float32BufferAttribute(samples.flatMap(s=>s.slice(2)),3));g.setAttribute('uv',new THREE.Float32BufferAttribute(samples.flatMap(s=>s.slice(0,2)),2));g.setAttribute('normal',new THREE.Float32BufferAttribute(samples.flatMap(()=>[0,0,1]),3));g.setIndex([0,2,1,0,3,2,1,2,3,0,4,3,1,3,5]);const before=g.attributes.position.array.slice();headPlanes(g,female);const p=g.attributes.position;for(let i=6;i<12;i++)assert.equal(p.array[i],before[i]);assert.ok(Math.abs(p.getX(0)+p.getX(1))<1e-7);assert.ok(Math.abs(p.getZ(0)-p.getZ(1))<1e-7);assert.ok(p.getZ(4)>before[14]);assert.ok(Math.abs(p.getZ(4)-p.getZ(5))<1e-7);assert.ok(g.userData.planeMax<.01);for(const n of g.attributes.normal.array)assert.ok(Number.isFinite(n));
}
console.log('head-plane trial: symmetry, protected nose/mouth and posterior change passed');
