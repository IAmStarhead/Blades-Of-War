// Validate the source fist trial and the brow-only model.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'tools/character-showcase/package.json'));
const validator = require('gltf-validator');
const result = path.resolve(process.argv[2] || path.join(root, 'work/character-model-search/selected-a/brow-study'));
for (const [label, file] of [
  ['preceding fist trial', path.join(root, 'work/character-model-search/selected-a/fist-refinement-trial/female_A_fist_trial.glb')],
  ['brow-only trial', path.join(result, 'female_A_brows_lower.glb')],
]) {
  const report = await validator.validateBytes(new Uint8Array(fs.readFileSync(file)), { uri: `${label}.glb` });
  console.log(`${label}: ${report.issues.numErrors} errors, ${report.issues.numWarnings} warnings, ${report.issues.numInfos} infos`);
  if (report.issues.numErrors || report.issues.numWarnings) {
    console.error(JSON.stringify(report.issues.messages, null, 2));
    process.exitCode = 1;
  }
}
