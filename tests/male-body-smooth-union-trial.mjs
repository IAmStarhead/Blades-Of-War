import assert from 'node:assert/strict';
import {buildMaleBlockout as oldBody} from '../src/male-body-rebuild-blockout/blockout.js';
import {buildMaleBlockout as newBody,buildBlockoutShorts} from '../src/male-body-smooth-union-trial/blockout.js';
import {createHumanoidSkeleton} from '../src/male-shoulder-sculpt-trial/body-character.js';
for(const kingdom of ['north','eden']){
 const {metrics}=createHumanoidSkeleton(false,kingdom),a=oldBody(metrics),b=newBody(metrics),p=b.attributes.position;
 for(const attr of ['position','normal','uv']){assert.equal(b.attributes[attr].count,p.count);for(const v of b.attributes[attr].array)assert(Number.isFinite(v))}
 for(const i of b.index.array)assert(i<p.count);
 for(const side of ['L','R']){const old=a.userData.parts['leg'+side],next=b.userData.parts['leg'+side];assert.equal(old.vertexCount,next.vertexCount);assert.deepEqual(Array.from(a.attributes.position.array.slice(old.vertexStart*3,(old.vertexStart+old.vertexCount)*3)),Array.from(p.array.slice(next.vertexStart*3,(next.vertexStart+next.vertexCount)*3)))}
 assert.equal(b.attributes.skinWeight,undefined);assert.equal(b.userData.cuts,undefined);
 let shorts=buildBlockoutShorts(metrics);for(const i of shorts.index.array)assert(i<shorts.attributes.position.count);
}
console.log('Both leg surfaces preserved, implicit upper mesh has finite attributes and valid indices; no rig/cut functionality claimed.');
