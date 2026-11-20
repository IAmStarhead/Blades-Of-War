// Extract only the old body surface and its default neck correction for the
// static splice. The original GLB is read-only; the face is copied separately.
import {writeFileSync} from 'node:fs';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';

const [source, output] = process.argv.slice(2);
if (!source || !output) throw new Error('Usage: node extract-head.mjs source.glb body.json');
const root = (await new NodeIO().read(source)).getRoot();
const node = root.listNodes().find(n => n.getName() === 'head_2');
if (!node?.getMesh() || node.getMesh().listPrimitives().length !== 1) throw new Error('Missing old body');
const mesh = node.getMesh(), primitive = mesh.listPrimitives()[0], targets = primitive.listTargets();
const weights = mesh.getWeights();
if (targets.length !== 26 || weights.length !== 26 || weights[1] !== 1 || weights.some((w, i) => i !== 1 && w !== 0)) {
  throw new Error('Unexpected old body default shape');
}
const attribute = (p, name) => {
  const a = p.getAttribute(name);
  if (!a) throw new Error(`Missing ${name}`);
  return Array.from(a.getArray());
};
const result = {
  positions: attribute(primitive, 'POSITION'),
  normals: attribute(primitive, 'NORMAL'),
  positionDelta: attribute(targets[1], 'POSITION'),
  normalDelta: attribute(targets[1], 'NORMAL'),
  indices: Array.from(primitive.getIndices().getArray()),
};
if (result.positions.length !== 10920 * 3 || result.indices.length !== 56376) throw new Error('Unexpected old topology');
writeFileSync(output, JSON.stringify(result));
