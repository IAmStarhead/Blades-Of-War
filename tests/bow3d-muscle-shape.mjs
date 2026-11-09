import assert from 'node:assert/strict';
import {buildBaseBodyGeometry, createHumanoidSkeleton} from '../src/engine3d/bow3d/bowCharacter.js';
for (const kingdom of ['north','eden']) {
  const {metrics:m} = createHumanoidSkeleton(false,kingdom);
  const geo = buildBaseBodyGeometry(false,m);
  const p = geo.attributes.position;
  const rings = [];
  // Torso is a sequence of 21-vertex horizontal rings.
  for (let i=0; i<geo.userData.limbRanges.torso[1]; i+=21) rings.push(i);
  const ring = y => rings.find(i => Math.abs(p.getY(i)-y*m.hScale)<1e-5);
  const chest=ring(1.270), waist=ring(1.110);
  assert.notEqual(chest,undefined); assert.notEqual(waist,undefined);
  assert.ok(p.getX(chest+15)>p.getX(waist+15), 'chest is wider than waist');
  // Radius of the chest at the pectoral is gently fuller than at the sternum.
  const center = p.getZ(chest+10)-0.002;
  const phi = 0.2*Math.PI;
  const pec = (p.getZ(chest+12)-0.002)/Math.cos(phi);
  assert.ok(pec>center+0.005 && pec<center+0.035, 'moderate pectoral relief');
  for(let i=0;i<p.count;i++) assert.ok(Number.isFinite(p.getX(i)+p.getY(i)+p.getZ(i)));
  geo.dispose();
}
console.log('Muscle shape: chest/waist proportions and restrained pectoral relief OK');
