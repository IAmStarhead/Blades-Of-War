import assert from 'node:assert/strict';
import {buildSculptedHeadGeometry} from '../src/engine3d/bow3d/bowCharacter.js';
import {kingdomNose} from '../src/nose-kingdom-trial/nose-variants.js';
import {straightenBridge} from '../src/straight-nose-trial/straighten.js';
for(const female of [false,true]){
 const source=buildSculptedHeadGeometry(female,false,'north'),copy=Float32Array.from(source.attributes.position.array),g=kingdomNose(source,female,true),before=Float32Array.from(g.attributes.position.array);
 straightenBridge(g);assert.deepEqual(source.attributes.position.array,copy);
 let points=[];const p=g.attributes.position,uv=g.attributes.uv;
 for(let i=0;i<p.count;i++){
  const v=uv.getY(i),u=uv.getX(i);
  if(Math.abs(u-.5)<1e-6&&v>=.425-1e-6&&v<=.525+1e-6)points.push([p.getY(i),p.getZ(i)]);
  if(v<.42||v>.53||Math.abs(u-.5)>.12)assert.equal(p.getZ(i),before[i*3+2]);
 }
 points.sort((a,b)=>a[0]-b[0]);assert(points.length>=9);const a=points[0],b=points.at(-1);
 for(const [y,z] of points)assert(Math.abs(z-(a[1]+(b[1]-a[1])*(y-a[0])/(b[0]-a[0])))<1e-6);
 assert([...p.array,...g.attributes.normal.array].every(Number.isFinite));source.dispose();g.dispose();
}
console.log('Central bridge centreline is straight, source unchanged, edits localized');
