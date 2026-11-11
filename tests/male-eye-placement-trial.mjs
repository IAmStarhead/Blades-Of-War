import assert from 'node:assert/strict';
import {raisePixels} from '../src/male-eye-placement-trial/raise-eyes.js';
const w=512,h=512,src=new Uint8ClampedArray(w*h*4);for(let i=3;i<src.length;i+=4)src[i]=255;
for(const x of [224,288])for(const y of [236,252])src[(y*w+x)*4]=255;
const before=src.slice(),out=raisePixels(src,w,h,6);assert.deepEqual(src,before);
for(const x of [224,288])for(const y of [236,252]){assert.equal(out[((y-6)*w+x)*4],255);assert.equal(out[(y*w+x)*4],0)}
for(const y of [20,320,350,490])for(const x of [200,224,256,288,312])for(let k=0;k<4;k++)assert.equal(out[(y*w+x)*4+k],src[(y*w+x)*4+k]);
console.log('Eye and brow samples shift upwards together; mouth and distant regions remain unchanged.');
