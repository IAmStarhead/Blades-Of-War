import assert from 'node:assert/strict';
import {eyePatch} from '../src/volume-eye-trial/volume-eye.js';
const patch=eyePatch(.0105,.0032,.0108,0,0xc9c6ba,true),p=patch.geometry.attributes.position;
for(let i=0;i<p.count;i++)for(let j=0;j<3;j++)assert(Number.isFinite(p.getComponent(i,j)));
assert.equal(p.count,49*13);assert(patch.geometry.index.count>0);console.log('Eye surface vertices and indices are finite.');
