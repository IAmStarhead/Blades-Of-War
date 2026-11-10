import assert from 'node:assert/strict';
import {buildSculptedHeadGeometry} from '../src/engine3d/bow3d/bowCharacter.js';
import {makeHeadForm} from '../src/jaw-construction-wip/head-form.js';
const main=41*65, top=main+1;
for(const female of [false,true])for(const kingdom of ['north','eden']){
 const source=buildSculptedHeadGeometry(female,false,kingdom),before=Float32Array.from(source.attributes.position.array),g=makeHeadForm(source,female,kingdom);
 assert.deepEqual(source.attributes.position.array,before);
 assert([...g.attributes.position.array].every(Number.isFinite));
 assert([...g.index.array].every(i=>i<main||i===top));
 assert(![...g.index.array].includes(main),'bottom pole cap removed');
 for(let r=0;r<41;r++) {let a=r*65,b=a+64,p=g.attributes.position;assert(Math.hypot(p.getX(a)-p.getX(b),p.getY(a)-p.getY(b),p.getZ(a)-p.getZ(b))<1e-6)}
 source.computeBoundingBox();g.computeBoundingBox();assert(Math.abs(source.boundingBox.max.y-g.boundingBox.max.y)<1e-7);
 source.dispose();g.dispose();
}
console.log('Working clone, neck opening, seam, height and finite coordinates verified');
