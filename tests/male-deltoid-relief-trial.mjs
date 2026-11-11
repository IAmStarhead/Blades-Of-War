import assert from 'node:assert/strict';
import {createHumanoidSkeleton as oldSkel,buildBaseBodyGeometry as oldBody} from '../src/male-upper-relief-trial/body-character.js';
import {createHumanoidSkeleton as newSkel,buildBaseBodyGeometry as newBody} from '../src/male-deltoid-relief-trial/body-character.js';
for(const female of [false,true])for(const kingdom of ['north','eden']){
 let a=oldSkel(female,kingdom),b=newSkel(female,kingdom),x=oldBody(female,a.metrics),y=newBody(female,b.metrics);assert.deepEqual(a.metrics,b.metrics);
 for(const n of ['position','normal','uv','skinWeight'])for(const v of y.attributes[n].array)assert(Number.isFinite(v));
 for(let i=0;i<y.attributes.skinWeight.count;i++){let w=y.attributes.skinWeight;assert(Math.abs(w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i)-1)<1e-5)}
 for(let i of y.index.array)assert(i<y.attributes.position.count);
 if(female){for(const n of ['position','normal','uv','skinIndex','skinWeight'])assert.deepEqual(Array.from(x.attributes[n].array),Array.from(y.attributes[n].array));assert.deepEqual(Array.from(x.index.array),Array.from(y.index.array));assert.equal(y.attributes.color,undefined)}
 else {assert.equal(y.attributes.position.count,x.attributes.position.count+126);const color=y.attributes.color;assert(color);let tinted=0;for(let i=0;i<color.count;i++){if(color.getX(i)<.99999){tinted++;assert(i<y.userData.limbRanges.torso[1]);assert(y.attributes.position.getY(i)/b.metrics.hScale>1.49)}}assert(tinted>0);for(const name of ['legL','legR']){const [a0,a1]=x.userData.limbRanges[name],[b0,b1]=y.userData.limbRanges[name];assert.deepEqual(Array.from(x.attributes.position.array.slice(a0*3,a1*3)),Array.from(y.attributes.position.array.slice(b0*3,b1*3)))}}
}
console.log('Male-only chest and deltoid relief, extra arm vertices and localized neck tint; female and male legs unchanged; weights normalized.');
