// Construct two self-contained GLBs for a stationary shape review.
// The new body is spliced to the old nape; the previous figure is a static
// comparison only. Neither GLB has a skeleton, morphs or animation clips.
import {readFileSync} from 'node:fs';
import {Accessor, Document, NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';

const [source, geometry, outNew, outPrevious] = process.argv.slice(2);
if (!outPrevious) throw new Error('Usage: node author.mjs old.glb geometry.json new.glb previous.glb');
const io = new NodeIO();
const sourceRoot = (await io.read(source)).getRoot();
const geom = JSON.parse(readFileSync(geometry, 'utf8'));

for (const [previous, output] of [[false, outNew], [true, outPrevious]]) {
  const doc = new Document();
  const buffer = doc.createBuffer('Static data');
  const scene = doc.createScene(previous ? 'Previous static reference' : 'New static body review');
  doc.getRoot().setDefaultScene(scene);
  const cache = new Map();
  const copyMaterial = sourceMaterial => {
    if (!sourceMaterial) throw new Error('Missing material');
    if (cache.has(sourceMaterial)) return cache.get(sourceMaterial);
    const material = doc.createMaterial(sourceMaterial.getName() || 'Skin')
      .setBaseColorFactor(sourceMaterial.getBaseColorFactor())
      .setMetallicFactor(sourceMaterial.getMetallicFactor())
      .setRoughnessFactor(sourceMaterial.getRoughnessFactor())
      .setDoubleSided(sourceMaterial.getDoubleSided())
      .setAlphaMode(sourceMaterial.getAlphaMode());
    const texture = sourceMaterial.getBaseColorTexture();
    if (texture) {
      const copy = doc.createTexture(texture.getName() || 'Face texture')
        .setImage(texture.getImage().slice()).setMimeType(texture.getMimeType());
      material.setBaseColorTexture(copy);
      const a = sourceMaterial.getBaseColorTextureInfo(), b = material.getBaseColorTextureInfo();
      b.setTexCoord(a.getTexCoord()).setMagFilter(a.getMagFilter()).setMinFilter(a.getMinFilter())
        .setWrapS(a.getWrapS()).setWrapT(a.getWrapT());
    }
    cache.set(sourceMaterial, material);
    return material;
  };
  const accessor = (name, sourceAccessor, data = sourceAccessor.getArray().slice()) =>
    doc.createAccessor(name, buffer).setType(sourceAccessor.getType())
      .setArray(data).setNormalized(sourceAccessor.getNormalized());

  function originalNode(name) {
    const matches = sourceRoot.listNodes().filter(node => node.getName() === name);
    if (matches.length !== 1 || matches[0].getMesh()?.listPrimitives().length !== 1) {
      throw new Error(`Expected one source mesh: ${name}`);
    }
    return matches[0];
  }
  function copyStatic(name) {
    const node = originalNode(name), mesh = node.getMesh(), src = mesh.listPrimitives()[0];
    const primitive = doc.createPrimitive().setMaterial(copyMaterial(src.getMaterial()));
    const weights = mesh.getWeights();
    for (const semantic of src.listSemantics()) {
      // Custom and secondary color attributes belong to earlier animated
      // trials. They are neither needed nor exported in this static review.
      if (semantic.startsWith('_') || ['JOINTS_0', 'WEIGHTS_0', 'COLOR_1', 'COLOR_2'].includes(semantic)) continue;
      const original = src.getAttribute(semantic), values = original.getArray().slice();
      if (semantic === 'POSITION' || semantic === 'NORMAL') {
        for (let i = 0; i < weights.length; i++) {
          const target = src.listTargets()[i].getAttribute(semantic);
          if (!target || !weights[i]) continue;
          const deltas = target.getArray();
          for (let k = 0; k < values.length; k++) values[k] += weights[i] * deltas[k];
        }
        if (semantic === 'NORMAL') {
          for (let k = 0; k < values.length; k += 3) {
            const length = Math.hypot(values[k], values[k + 1], values[k + 2]);
            if (length) { values[k] /= length; values[k + 1] /= length; values[k + 2] /= length; }
          }
        }
      }
      primitive.setAttribute(semantic, accessor(`${name}_${semantic}`, original, values));
    }
    primitive.setIndices(accessor(`${name}_indices`, src.getIndices()));
    const copy = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(primitive));
    // Head and body coordinates in this particular source already use world
    // coordinates; ears are rigid children and require their rest transform.
    const world = node.getWorldMatrix();
    if (name.startsWith('head_') && world.some((value, i) => Math.abs(value - ([0, 5, 10, 15].includes(i) ? 1 : 0)) > 1e-7)) {
      throw new Error(`Unexpected source transform for ${name}`);
    }
    if (name.startsWith('ear-')) copy.setMatrix(world);
    scene.addChild(copy);
  }
  copyStatic('head_1');
  copyStatic('ear-makehuman-left');
  copyStatic('ear-makehuman-right');
  if (previous) {
    copyStatic('head_2');
  } else {
    const bodyMaterial = originalNode('head_2').getMesh().listPrimitives()[0].getMaterial();
    const positions = doc.createAccessor('New body positions', buffer).setType(Accessor.Type.VEC3)
      .setArray(new Float32Array(geom.positions));
    const normals = doc.createAccessor('New body normals', buffer).setType(Accessor.Type.VEC3)
      .setArray(new Float32Array(geom.normals));
    const indices = doc.createAccessor('New body indices', buffer).setType(Accessor.Type.SCALAR)
      .setArray(new Uint32Array(geom.indices));
    const primitive = doc.createPrimitive().setAttribute('POSITION', positions).setAttribute('NORMAL', normals)
      .setIndices(indices).setMaterial(copyMaterial(bodyMaterial));
    scene.addChild(doc.createNode('New body and retained nape')
      .setMesh(doc.createMesh('New body').addPrimitive(primitive)));
  }
  if (doc.getRoot().listSkins().length || doc.getRoot().listAnimations().length) throw new Error('Unexpected animation');
  await io.write(output, doc);
  console.log(`${previous ? 'Previous' : 'New'}: ${output}`);
}
