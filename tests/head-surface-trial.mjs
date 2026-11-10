import assert from 'node:assert/strict';
import * as THREE from 'three';
import {sculptSurface} from '../src/head-surface-trial/surface.js';
for(const female of [true,false]){
 const g=new THREE.BufferGeometry(); const samples=[[.38,.46,-.06,.08,.07],[.62,.46,.06,.08,.07],[.5,.48,0,.08,.1],[.5,.33,0,.04,.1],[.15,.7,-.05,.15,-.05],[.85,.7,.05,.15,-.05]];
 g.setAttribute('position',new THREE.Float32BufferAttribute(samples.flatMap(s=>s.slice(2)),3));g.setAttribute('uv',new THREE.Float32BufferAttribute(samples.flatMap(s=>s.slice(0,2)),2));g.setAttribute('normal',new THREE.Float32BufferAttribute(samples.flatMap(()=>[0,0,1]),3));g.setIndex([0,2,1,0,3,2,1,2,3,0,4,3,1,3,5]);const before=g.attributes.position.array.slice();sculptSurface(g,female);const p=g.attributes.position;
 for(let i=6;i<12;i++)assert.equal(p.array[i],before[i]);for(let i=0;i<p.count;i++)assert.equal(p.getY(i),before[i*3+1]);assert.ok(Math.abs(p.getX(0)+p.getX(1))<1e-7);assert.ok(Math.abs(p.getZ(0)-p.getZ(1))<1e-7);assert.ok(g.userData.surfaceMax>0&&g.userData.surfaceMax<.01);for(const n of g.attributes.normal.array)assert.ok(Number.isFinite(n));
}
console.log('head surface: symmetry, protected centre, height and normals passed');
