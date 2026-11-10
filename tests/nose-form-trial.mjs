import assert from 'node:assert/strict';
import {buildSculptedHeadGeometry} from '../src/engine3d/bow3d/bowCharacter.js';
import {refineNose} from '../src/nose-form-trial/nose.js';
for(const female of [false,true]){
 const original=buildSculptedHeadGeometry(female,false,'north'),before=Float32Array.from(original.attributes.position.array),trial=refineNose(original,female);
 assert.deepEqual(original.attributes.position.array,before);
 assert.equal(trial.index.count,original.index.count*4);
 assert([...trial.attributes.position.array,...trial.attributes.normal.array].every(Number.isFinite));
 for(let i=0;i<original.attributes.position.count;i++){
  const v=original.attributes.uv.getY(i),phi=(original.attributes.uv.getX(i)-.5)*2*Math.PI;
  if(Math.abs(phi)>.7||v<.25||v>.65)assert(Math.abs(trial.attributes.position.getZ(i)-original.attributes.position.getZ(i))<1e-6);
 }
 assert([...trial.index.array].every(i=>i<trial.attributes.position.count));
 original.dispose();trial.dispose();
}
console.log('Nose trial: isolated mesh, finite indices/normals, distant surface unchanged');
