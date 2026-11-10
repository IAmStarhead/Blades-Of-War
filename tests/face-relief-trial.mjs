import assert from 'node:assert/strict';
import {buildSculptedHeadGeometry} from '../src/engine3d/bow3d/bowCharacter.js';
import {kingdomNose} from '../src/nose-kingdom-trial/nose-variants.js';
import {straightenBridge} from '../src/straight-nose-trial/straighten.js';
import {shapeFaceRelief} from '../src/face-relief-trial/relief.js';
for(const female of [true,false]){
 const source=buildSculptedHeadGeometry(female,false,'north'),g=kingdomNose(source,female,true);straightenBridge(g);
 const before=Float32Array.from(g.attributes.position.array),normals=Float32Array.from(g.attributes.normal.array),index=Array.from(g.index.array);
 shapeFaceRelief(g,female);const p=g.attributes.position,uv=g.attributes.uv;let changed=0,max=0;
 assert.deepEqual(Array.from(g.index.array),index);
 for(let i=0;i<p.count;i++){
  const a=Math.abs((uv.getX(i)-.5)*2*Math.PI),v=uv.getY(i),d=p.getZ(i)-before[i*3+2];
  assert.equal(p.getX(i),before[i*3]);assert.equal(p.getY(i),before[i*3+1]);
  if((a<.26&&v>.37&&v<.57)||(a<.30&&v>.30&&v<.36)){assert.equal(d,0);for(let j=0;j<3;j++)assert(Math.abs(g.attributes.normal.array[i*3+j]-normals[i*3+j])<1e-6)}
  if(Math.abs(d)>1e-7)changed++;max=Math.max(max,Math.abs(d));
 }
 assert(changed>50);assert(max<.004);assert([...p.array,...g.attributes.normal.array].every(Number.isFinite));
 console.log(female?'female':'male',{changed,max});source.dispose();g.dispose();
}
