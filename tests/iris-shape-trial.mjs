import assert from 'node:assert/strict';
import {sampleX} from '../src/iris-shape-trial/iris-shape.js';
for(let y=0;y<512;y++)for(let x=0;x<512;x++){const sx=sampleX(x,y);assert(Number.isFinite(sx));assert(Math.abs((sampleX(512-x,y)+sx)-512)<1e-8);if(sx!==x){assert(y>248.3&&y<257);assert(Math.min(Math.abs(x-224.5),Math.abs(x-287.5))<12.5)}}
assert(sampleX(229,252)>229);assert(sampleX(220,252)<220);console.log('Iris warp is symmetric, finite and confined to the eye region.');
