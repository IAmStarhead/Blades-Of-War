import assert from 'node:assert/strict';
import * as THREE from 'three';
import {splitTriangles} from '../src/inner-orbit-transition-trial/rework.js';
import {innerOrbit} from '../src/inner-orbit-transition-trial/inner-orbit.js';
const g=splitTriangles(new THREE.SphereGeometry(.1,64,40));const p=g.attributes.position,uv=g.attributes.uv,before=p.array.slice();innerOrbit(g);let changed=0,left=0,right=0;
for(let i=0;i<p.count;i++){
 assert.equal(p.getX(i),before[3*i]);assert.equal(p.getY(i),before[3*i+1]);
 const dz=p.getZ(i)-before[3*i+2];assert(Number.isFinite(dz));
 if(dz){changed++;const x=Math.abs(uv.getX(i)*512-256),y=(1-uv.getY(i))*512;assert(x>6&&x<28&&y>234&&y<270);assert(dz<0&&dz>=-.00281);uv.getX(i)<.5?left++:right++;}
 for(let k=0;k<3;k++)assert(Number.isFinite(g.attributes.normal.getComponent(i,k)));
}
assert(changed&&left&&right);console.log('Medial orbital recess bounded, bilateral and finite.');
