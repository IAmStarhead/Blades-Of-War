// Structural and glTF-Validator checks on both published static models.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';
import {Matrix4} from '../male-library-motion/node_modules/three/build/three.module.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.resolve(process.argv[2] || path.join(rootDir, 'work/male-static-rebuild'));
const validate = createRequire(path.join(rootDir, 'tools/character-showcase/package.json'))('gltf-validator');
const digest = a => createHash('sha256').update(a).digest('hex');
const bytes = accessor => {
  assert.ok(accessor);
  const a = accessor.getArray();
  return Buffer.from(a.buffer, a.byteOffset, a.byteLength);
};
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a-b) < tolerance, `${a} != ${b}`);
const previousBytes = await fs.readFile(path.join(rootDir, 'work/male-body-contour/male_body_contour.glb'));
assert.equal(digest(previousBytes), 'db361ec8c18620802acb8dfa02b534a33e9e249134668ea8258c29c8a0a7fba5');
const io = new NodeIO(), original = (await io.readBinary(previousBytes)).getRoot();
const oldSkin = original.listSkins()[0];
assert.ok(oldSkin);
for (const [i, joint] of oldSkin.listJoints().entries()) {
  const matrix = new Matrix4().fromArray(joint.getWorldMatrix())
    .multiply(new Matrix4().fromArray(oldSkin.getInverseBindMatrices().getArray(), i*16));
  matrix.elements.forEach((value, k) => near(value, [0, 5, 10, 15].includes(k) ? 1 : 0));
}
const find = (root, name) => {
  const matches = root.listNodes().filter(node => node.getName() === name);
  assert.equal(matches.length, 1, name);
  return matches[0];
};

function sameBakedNode(source, result, name) {
  const a = find(source, name), b = find(result, name);
  const mesh = a.getMesh(), p = mesh.listPrimitives()[0], q = b.getMesh().listPrimitives()[0];
  assert.equal(q.listTargets().length, 0, `${name}: no morph targets in the static copy`);
  assert.equal(b.getSkin(), null);
  assert.equal(digest(bytes(p.getIndices())), digest(bytes(q.getIndices())), `${name} indices`);
  for (const semantic of q.listSemantics()) {
    assert.ok(!semantic.startsWith('_') && !['JOINTS_0', 'WEIGHTS_0', 'COLOR_1', 'COLOR_2'].includes(semantic));
    const sourceAccessor = p.getAttribute(semantic), destAccessor = q.getAttribute(semantic);
    assert.ok(sourceAccessor, `${name} ${semantic}`);
    if (semantic !== 'POSITION' && semantic !== 'NORMAL') {
      assert.equal(digest(bytes(sourceAccessor)), digest(bytes(destAccessor)), `${name} ${semantic}`);
      continue;
    }
    const baked = sourceAccessor.getArray().slice();
    for (let target = 0; target < mesh.getWeights().length; target++) {
      const attribute = p.listTargets()[target].getAttribute(semantic), weight = mesh.getWeights()[target];
      if (attribute && weight) for (let i=0; i<baked.length; i++) baked[i] += weight * attribute.getArray()[i];
    }
    if (semantic === 'NORMAL') for (let i=0; i<baked.length; i+=3) {
      const length = Math.hypot(baked[i], baked[i+1], baked[i+2]);
      if (length) for (let k=0; k<3; k++) baked[i+k] /= length;
    }
    assert.equal(digest(Buffer.from(baked.buffer, baked.byteOffset, baked.byteLength)),
      digest(bytes(destAccessor)), `${name} default-baked ${semantic}`);
  }
  a.getWorldMatrix().forEach((value, i) => near(value, b.getWorldMatrix()[i]));
  assert.deepEqual(p.getMaterial().getBaseColorFactor(), q.getMaterial().getBaseColorFactor());
}

const docs = {};
for (const file of ['male_static_rebuild.glb', 'previous_static_reference.glb']) {
  const data = await fs.readFile(path.join(output, file));
  const validation = await validate.validateBytes(new Uint8Array(data), {uri: file, maxIssues: 100});
  if (validation.issues.numErrors || validation.issues.numWarnings) console.log(JSON.stringify(validation.issues, null, 2));
  assert.equal(validation.issues.numErrors, 0, file + ' validator errors');
  assert.equal(validation.issues.numWarnings, 0, file + ' validator warnings');
  const result = (await io.readBinary(data)).getRoot();
  assert.equal(result.listSkins().length, 0);
  assert.equal(result.listAnimations().length, 0);
  assert.equal(result.listNodes().filter(n => n.getMesh()).length, 4);
  assert.deepEqual(result.listTextures().map(t => digest(t.getImage())), original.listTextures().map(t => digest(t.getImage())));
  for (const name of ['head_1', 'ear-makehuman-left', 'ear-makehuman-right']) sameBakedNode(original, result, name);
  docs[file] = result;
  console.log(`PASS ${file}: Validator 0 errors/0 warnings, retained head and ears, no skin or animations`);
}
sameBakedNode(original, docs['previous_static_reference.glb'], 'head_2');
console.log('PASS: previous reference is the original default static body, face and ears');

const fresh = docs['male_static_rebuild.glb'];
const body = find(fresh, 'New body and retained nape').getMesh().listPrimitives()[0];
const pos = body.getAttribute('POSITION').getArray(), normals = body.getAttribute('NORMAL').getArray();
const index = body.getIndices().getArray();
assert.equal(pos.length / 3, 14703);
assert.equal(index.length / 3, 28196);
assert.equal(body.listTargets().length, 0);
for (let i=0; i<pos.length; i+=3) {
  assert.ok([...pos.slice(i,i+3), ...normals.slice(i,i+3)].every(Number.isFinite));
  near(Math.hypot(...normals.slice(i,i+3)), 1, 2e-6);
}
const edges = new Map(), bridgeEdges = new Map();
const key = (a,b) => a < b ? `${a}:${b}` : `${b}:${a}`;
const add = (map, k) => map.set(k, (map.get(k) || 0) + 1);
let minimumDot=Infinity, minimumArea=Infinity;
const joinStart = 18370 + 1594;
for (let face=0; face<index.length/3; face++) {
  const a=index[face*3], b=index[face*3+1], c=index[face*3+2];
  assert.ok(a<pos.length/3 && b<pos.length/3 && c<pos.length/3);
  for (const [x,y] of [[a,b],[b,c],[c,a]]) {
    add(edges, key(x,y));
    if (face >= joinStart) add(bridgeEdges, key(x,y));
  }
  if (face < joinStart) continue;
  const ux=pos[3*b]-pos[3*a], uy=pos[3*b+1]-pos[3*a+1], uz=pos[3*b+2]-pos[3*a+2];
  const vx=pos[3*c]-pos[3*a], vy=pos[3*c+1]-pos[3*a+1], vz=pos[3*c+2]-pos[3*a+2];
  const cross=[uy*vz-uz*vy, uz*vx-ux*vz, ux*vy-uy*vx];
  const normal=[0,1,2].map(i => (normals[3*a+i]+normals[3*b+i]+normals[3*c+i])/3);
  const area=Math.hypot(...cross), dot=cross.reduce((sum,x,i)=>sum+x*normal[i],0)/(area*Math.hypot(...normal));
  minimumArea=Math.min(minimumArea,area);minimumDot=Math.min(minimumDot,dot);
}
assert.equal(index.length/3-joinStart, 8232);
assert.ok(minimumArea>1e-12 && minimumDot>0, `bridge: area ${minimumArea}, dot ${minimumDot}`);
const boundary = [...edges].filter(([,count]) => count===1);
assert.equal(boundary.length, 1208);
assert.equal([...edges.values()].filter(count=>count>2).length, 0);
let seam=0;
for (const [edge, count] of bridgeEdges) if (count===1) {
  assert.equal(edges.get(edge), 2, `unstitched boundary ${edge}`);
  const [a,b] = edge.split(':').map(Number), ya=pos[3*a+1], yb=pos[3*b+1];
  assert.ok((Math.abs(ya-1.510)<1e-6 && Math.abs(yb-1.510)<1e-6) ||
            (Math.abs(ya-1.545)<1e-6 && Math.abs(yb-1.545)<1e-6));
  seam++;
}
assert.equal(seam, 588);
const boundaryY = boundary.flatMap(([edge]) => edge.split(':').map(x => pos[3*Number(x)+1]));
assert.ok(Math.min(...boundaryY)>1.55 && Math.max(...boundaryY)<1.61);
console.log(`PASS: ${seam} join boundary edges have two neighbors, ${index.length/3-joinStart} bridge faces; min normal dot ${minimumDot.toFixed(5)}, min double area ${minimumArea}`);
console.log(`NOTE: ${boundary.length} open body edges remain in the retained head region; no claim of watertightness.`);
