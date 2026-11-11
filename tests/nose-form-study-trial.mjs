import assert from 'node:assert/strict';
import * as THREE from 'three';
import {splitTriangles} from '../src/nose-form-study-trial/rework.js';
import {shapeNose} from '../src/nose-form-study-trial/nose-form.js';
for (const female of [false,true]) {
 const g=splitTriangles(new THREE.SphereGeometry(.1,64,40)),p=g.attributes.position,uv=g.attributes.uv,before=p.array.slice();shapeNose(g,female);let changed=0;
 for(let i=0;i<p.count;i++){
  assert.equal(p.getX(i),before[3*i]);assert.equal(p.getY(i),before[3*i+1]);
  const d=p.getZ(i)-before[3*i+2];assert(Number.isFinite(d));
  if(d){changed++;assert(d>0&&d<.006);assert(Math.abs((uv.getX(i)-.5)*2*Math.PI)<.27);assert(uv.getY(i)>.367&&uv.getY(i)<.53);}
  for(let k=0;k<3;k++)assert(Number.isFinite(g.attributes.normal.getComponent(i,k)));
 }assert(changed);
}
console.log('Nose shape bounded and finite for both heads.');
