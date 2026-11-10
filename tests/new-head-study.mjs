import assert from 'node:assert/strict';
import {createNewHead} from '../src/new-head-study/new-head.js';
for(const female of [true,false]){
 const g=createNewHead(female),p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,idx=g.index;assert.equal(p.count,69*65);assert.equal(idx.count,68*64*6);assert.equal(uv.count,p.count);for(const a of [p,n,uv])for(const v of a.array)assert.ok(Number.isFinite(v));for(let j=0;j<69;j++)for(let i=0;i<=32;i++){const a=j*65+i,b=j*65+64-i;assert.ok(Math.abs(p.getX(a)+p.getX(b))<1e-6);assert.ok(Math.abs(p.getY(a)-p.getY(b))<1e-6);assert.ok(Math.abs(p.getZ(a)-p.getZ(b))<1e-6)}for(const i of idx.array)assert.ok(i<p.count);g.dispose();
}
console.log('new head: topology, symmetry, UV and finite normals passed');
