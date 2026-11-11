import assert from 'node:assert/strict';
import {buildMaleBlockout,buildBlockoutShorts} from '../src/male-body-rebuild-blockout/blockout.js';
import {createHumanoidSkeleton} from '../src/male-shoulder-sculpt-trial/body-character.js';
const names=['neck',...['L','R'].flatMap(s=>['shoulder','upperArm','elbow','wrist','hip','upperLeg','knee','ankle'].map(n=>n+s))];
for(const kingdom of ['north','eden']){
 const {metrics}=createHumanoidSkeleton(false,kingdom),g=buildMaleBlockout(metrics),p=g.attributes.position;
 assert.deepEqual(Object.keys(g.userData.cuts).sort(),names.sort());
 for(const a of ['position','normal','uv'])for(const v of g.attributes[a].array)assert(Number.isFinite(v));
 for(const idx of g.index.array)assert(idx<p.count);
 for(const [name,cut] of Object.entries(g.userData.cuts)){
  assert.equal(cut.ring.length,32,name);assert.equal(new Set(cut.ring).size,32,name);
  const part=g.userData.parts[cut.part];assert(part);
  for(const i of cut.ring){assert(i>=part.vertexStart&&i<part.vertexStart+part.vertexCount);assert(Math.abs(p.getY(i)-cut.y)<1e-6)}
 }
 for(const n of ['shoulder','upperArm','elbow','wrist','hip','upperLeg','knee','ankle'])assert(Math.abs(g.userData.cuts[n+'L'].y-g.userData.cuts[n+'R'].y)<1e-8);
 const shorts=buildBlockoutShorts(metrics);for(const v of shorts.attributes.position.array)assert(Number.isFinite(v));for(const i of shorts.index.array)assert(i<shorts.attributes.position.count);
 // Static mesh with planning rings only: no claim that a cut or deformation works.
 assert.equal(g.attributes.skinWeight,undefined);
}
console.log('Static male blockout: valid separate surfaces and planning loops for head and limbs; no cut/rig implementation.');
