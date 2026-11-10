import assert from 'node:assert/strict';
import {buildSculptedHeadGeometry} from '../src/engine3d/bow3d/bowCharacter.js';
import {refineNose as before} from '../src/nose-form-trial/nose.js';
import {refineNose as after} from '../src/nose-root-trial/nose.js';
for(const female of [false,true]){
 const source=buildSculptedHeadGeometry(female,false,'north'),saved=Float32Array.from(source.attributes.position.array),a=before(source,female),b=after(source,female);
 assert.deepEqual(source.attributes.position.array,saved);assert.deepEqual(a.index.array,b.index.array);
 assert([...b.attributes.position.array,...b.attributes.normal.array].every(Number.isFinite));
 let changed=0;for(let i=0;i<a.attributes.position.count;i++){
  const delta=a.attributes.position.getZ(i)-b.attributes.position.getZ(i),v=a.attributes.uv.getY(i),phi=(a.attributes.uv.getX(i)-.5)*2*Math.PI;
  if(delta>0.0001)changed++;
  if(v<.40||v>.66||Math.abs(phi)>.65)assert(Math.abs(delta)<1e-6);
 }
 assert(changed>0);for(const g of [source,a,b])g.dispose();
}
console.log('Nose-root trial: isolated, finite; edits localized to nose root');
