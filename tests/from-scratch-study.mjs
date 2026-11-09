import fs from 'node:fs';
import assert from 'node:assert/strict';
const bodies=JSON.parse(fs.readFileSync('src/from-scratch-study/bodies.json','utf8'));
for (const name of ['female','male']) {
 const {positions,indices}=bodies[name];
 assert.equal(positions.length%3,0);assert.equal(indices.length%3,0);
 assert.ok(indices.length/3>6000 && indices.length/3<=6500);
 assert.ok(positions.every(Number.isFinite));
 assert.ok(indices.every(i=>Number.isInteger(i)&&i>=0&&i<positions.length/3));
}
console.log('Procedural trial mesh arrays valid');
