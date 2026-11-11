import assert from 'node:assert/strict';
import * as THREE from 'three';
import { splitTriangles, reworkGeometry } from '../src/eye-shadow-neutral-trial/rework.js';
import { smoothBrowSurface } from '../src/eye-shadow-neutral-trial/repair.js';
const g = splitTriangles(new THREE.SphereGeometry(.1,64,40));
reworkGeometry(g,false,true);
const before = g.attributes.position.array.slice(), uv = g.attributes.uv;
smoothBrowSurface(g);
let changed=0;
for (let i=0;i<g.attributes.position.count;i++) {
  assert.equal(g.attributes.position.getX(i),before[3*i]);
  assert.equal(g.attributes.position.getY(i),before[3*i+1]);
  const z=g.attributes.position.getZ(i);
  assert(Number.isFinite(z));
  if (z!==before[3*i+2]) {
    changed++;
    const v=uv.getY(i), a=Math.abs((uv.getX(i)-.5)*Math.PI*2);
    assert(v>=.525 && v<=.68 && a<=.95);
  }
  for(let k=0;k<3;k++) assert(Number.isFinite(g.attributes.normal.getComponent(i,k)));
}
assert(changed>0);
console.log('Brow smoothing changes only the masked Z coordinates; normals remain finite.');
