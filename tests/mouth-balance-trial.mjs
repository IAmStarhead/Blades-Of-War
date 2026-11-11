import assert from 'node:assert/strict';
import * as THREE from 'three';
import {splitTriangles} from '../src/mouth-balance-trial/rework.js';
import {relaxMuzzle} from '../src/mouth-balance-trial/rebalance.js';
const g=splitTriangles(new THREE.SphereGeometry(.1,64,40)),p=g.attributes.position,uv=g.attributes.uv,before=p.array.slice();
relaxMuzzle(g);let count=0;
for(let i=0;i<p.count;i++){
 assert.equal(p.getX(i),before[3*i]);assert.equal(p.getY(i),before[3*i+1]);
 const d=p.getZ(i)-before[3*i+2];assert(Number.isFinite(d));assert(d<=0);
 if(d){count++;const a=Math.abs((uv.getX(i)-.5)*Math.PI*2),v=uv.getY(i);assert(a<.55&&v>.258&&v<.408)}
 for(let k=0;k<3;k++)assert(Number.isFinite(g.attributes.normal.getComponent(i,k)));
}assert(count>0);console.log('Muzzle correction stays within its UV region; coordinates and normals are finite.');
