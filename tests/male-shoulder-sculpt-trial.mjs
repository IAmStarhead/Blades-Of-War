import assert from 'node:assert/strict';
import {createHumanoidSkeleton as oldSkel,buildBaseBodyGeometry as oldBody} from '../src/male-shoulder-rebuild-trial/body-character.js';
import {createHumanoidSkeleton as newSkel,buildBaseBodyGeometry as newBody} from '../src/male-shoulder-sculpt-trial/body-character.js';
for(const female of [false,true])for(const kingdom of ['north','eden']){
 const a=oldSkel(female,kingdom),b=newSkel(female,kingdom),x=oldBody(female,a.metrics),y=newBody(female,b.metrics);assert.deepEqual(a.metrics,b.metrics);
 for(const name of ['position','normal','uv','skinWeight','skinIndex'])for(const v of y.attributes[name].array)assert(Number.isFinite(v));
 assert.deepEqual(Array.from(x.index.array),Array.from(y.index.array));
 for(const name of ['uv','skinWeight','skinIndex'])assert.deepEqual(Array.from(x.attributes[name].array),Array.from(y.attributes[name].array));
 for(let i=0;i<y.attributes.skinWeight.count;i++){let w=y.attributes.skinWeight;assert(Math.abs(w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i)-1)<1e-5)}
 for(const i of y.index.array)assert(i<y.attributes.position.count);
 if(female)for(const name of ['position','normal'])assert.deepEqual(Array.from(x.attributes[name].array),Array.from(y.attributes[name].array));
 else {for(const name of ['legL','legR']){const [s,e]=x.userData.limbRanges[name];assert.deepEqual(Array.from(x.attributes.position.array.slice(s*3,e*3)),Array.from(y.attributes.position.array.slice(s*3,e*3)))}for(const name of ['torso','armL','armR']){const [s,e]=x.userData.limbRanges[name];assert.notDeepEqual(Array.from(x.attributes.position.array.slice(s*3,e*3)),Array.from(y.attributes.position.array.slice(s*3,e*3)))}}
}
console.log('Male torso and arms changed; female and male legs unchanged; topology, UV and weights preserved.');
