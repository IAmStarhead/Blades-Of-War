import assert from 'node:assert/strict';
import {buildSculptedHeadGeometry} from '../src/engine3d/bow3d/bowCharacter.js';
import {makeHeadForm} from '../src/game-anatomy-profile/head-form.js';
const earStart=41*65+2;
for(const female of [true,false])for(const kingdom of ['north','eden']){
 const source=buildSculptedHeadGeometry(female,false,kingdom),before=Float32Array.from(source.attributes.position.array),trial=makeHeadForm(source,female,kingdom);
 assert.deepEqual(source.attributes.position.array,before);assert.deepEqual(trial.attributes.uv.array,source.attributes.uv.array);assert([...trial.index.array].every(i=>i<earStart),'no ear disc triangles');assert(trial.index.count<source.index.count);assert([...trial.attributes.position.array].every(Number.isFinite));
 let delta=0;for(let i=0;i<before.length;i++)delta=Math.max(delta,Math.abs(before[i]-trial.attributes.position.array[i]));assert(delta>.005);source.computeBoundingBox();trial.computeBoundingBox();assert(Math.abs(source.boundingBox.max.y-trial.boundingBox.max.y)<1e-7);source.dispose();trial.dispose();
}
console.log('Silhouette copies changed, ear faces omitted, UV and originals retained');
