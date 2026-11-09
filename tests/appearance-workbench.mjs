import assert from 'node:assert/strict';
import {shapeBody} from '../src/appearance-workbench/shape.js';
const input=Float32Array.from([2.4,12.9,0.6, .5,10.5,.7, .83,12.55,1.0]);
const defaults={build:100,muscle:100,bust:110};
const base=shapeBody(input,0,true,defaults),muscle=shapeBody(input,0,true,{...defaults,muscle:125}),build=shapeBody(input,0,true,{...defaults,build:115}),bust=shapeBody(input,0,true,{...defaults,bust:130});
assert(muscle[0]>base[0]);assert(build[3]>base[3]);assert(bust[8]>base[8]);assert.deepEqual([...input],[...Float32Array.from([2.4,12.9,0.6,.5,10.5,.7,.83,12.55,1.0])]);
for(const v of [base,muscle,build,bust])assert([...v].every(Number.isFinite));console.log('Appearance workbench shape controls pass');
