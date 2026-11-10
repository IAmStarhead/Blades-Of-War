import assert from 'node:assert/strict';
import {buildSculptedHeadGeometry} from '../src/engine3d/bow3d/bowCharacter.js';
import {makeHeadForm} from '../src/game-head-form/head-form.js';
for(const female of [true,false])for(const kingdom of ['north','eden']){
 const original=buildSculptedHeadGeometry(female,false,kingdom),before=Float32Array.from(original.attributes.position.array),test=makeHeadForm(original,female,kingdom);
 assert.notEqual(test,original);assert.deepEqual(original.attributes.position.array,before,'original geometry must remain unchanged');assert.deepEqual(test.index.array,original.index.array,'topology stays the same');assert.deepEqual(test.attributes.uv.array,original.attributes.uv.array,'face texture mapping stays the same');
 assert(test.attributes.position.array.some((x,i)=>Math.abs(x-before[i])>1e-4),'geometry actually changes');assert([...test.attributes.position.array].every(Number.isFinite));
 original.computeBoundingBox();test.computeBoundingBox();assert(Math.abs(original.boundingBox.max.y-test.boundingBox.max.y)<1e-6);assert(Math.abs(original.boundingBox.min.y-test.boundingBox.min.y)<1e-6);
 original.dispose();test.dispose();
}
console.log('Original geometry preserved, modified copies finite; UV and height retained');
