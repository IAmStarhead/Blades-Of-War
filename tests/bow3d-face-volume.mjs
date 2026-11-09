import assert from 'node:assert/strict';
import {buildSculptedHeadGeometry} from '../src/engine3d/bow3d/bowCharacter.js';
for (const female of [false,true]) for (const kingdom of ['north','eden']) for (const beard of (female ? [false] : [false,true])) {
  const g=buildSculptedHeadGeometry(female,beard,kingdom), p=g.attributes.position, n=g.attributes.normal;
  const cols=65, rows=41;
  assert.ok(p.count >= cols*rows+2+104, 'head has a dense continuous surface and ears');
  const index=(r,s)=>r*cols+s;
  // Nose projection remains integrated into the front of the head.
  const tip=index(17,32), side=index(17,28);
  assert.ok(p.getZ(tip)>p.getZ(side)+0.006, 'nose projects beyond adjoining face');
  for(let r=0;r<rows;r++) {
    const a=index(r,0), b=index(r,64);
    assert.ok(Math.hypot(p.getX(a)-p.getX(b),p.getY(a)-p.getY(b),p.getZ(a)-p.getZ(b))<1e-6, 'UV seam coincides');
  }
  for(let i=0;i<p.count;i++) assert.ok(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)+n.getX(i)+n.getY(i)+n.getZ(i)), 'finite surface');
  g.dispose();
}
console.log('Face volume: integrated nose, UV seam and dense head mesh OK');
