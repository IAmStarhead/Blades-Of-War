import assert from 'node:assert/strict';
import {createHumanoidSkeleton as oldSkel,buildBaseBodyGeometry as oldBody} from '../src/male-deltoid-relief-trial/body-character.js';
import {createHumanoidSkeleton as newSkel,buildBaseBodyGeometry as newBody} from '../src/male-deltoid-anatomy-trial/body-character.js';
for(const female of [false,true])for(const kingdom of ['north','eden']){
 const a=oldSkel(female,kingdom),b=newSkel(female,kingdom),x=oldBody(female,a.metrics),y=newBody(female,b.metrics);assert.deepEqual(a.metrics,b.metrics);
 for(const n of ['position','normal','uv','skinWeight','skinIndex'])for(const v of y.attributes[n].array)assert(Number.isFinite(v));
 assert.deepEqual(Array.from(x.index.array),Array.from(y.index.array));
 for(const n of ['uv','skinWeight','skinIndex'])assert.deepEqual(Array.from(x.attributes[n].array),Array.from(y.attributes[n].array));
 for(let i=0;i<y.attributes.skinWeight.count;i++){let w=y.attributes.skinWeight;assert(Math.abs(w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i)-1)<1e-5)}
 for(let i of y.index.array)assert(i<y.attributes.position.count);
 if(female)for(const n of ['position','normal'])assert.deepEqual(Array.from(x.attributes[n].array),Array.from(y.attributes[n].array));
 else {for(const name of ['torso','legL','legR']){const [start,end]=x.userData.limbRanges[name];assert.deepEqual(Array.from(x.attributes.position.array.slice(start*3,end*3)),Array.from(y.attributes.position.array.slice(start*3,end*3)))}for(const name of ['armL','armR']){const [start,end]=x.userData.limbRanges[name];assert.notDeepEqual(Array.from(x.attributes.position.array.slice(start*3,end*3)),Array.from(y.attributes.position.array.slice(start*3,end*3)))}}
}
console.log('Shoulder trial: male arms changed; female, male torso/legs, indices and weights unchanged.');
