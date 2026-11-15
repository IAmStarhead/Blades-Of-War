// Validate the previous hand/ear model and the separate fist trial.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'tools/character-showcase/package.json'));
const validator = require('gltf-validator');
const directory = path.resolve(process.argv[2] || path.join(root, 'work/character-model-search/selected-a/fist-refinement-trial'));
const inputs = [
  ['previous hand/ear study', path.join(root, 'work/character-model-search/selected-a/hand-ear-study/female_A_hands_ears.glb')],
  ['separate fist trial', path.join(directory, 'female_A_fist_trial.glb')],
];
for (const [name, file] of inputs) {
  const report = await validator.validateBytes(new Uint8Array(fs.readFileSync(file)), { uri: `${name}.glb` });
  console.log(`${name}: ${report.issues.numErrors} errors, ${report.issues.numWarnings} warnings, ${report.issues.numInfos} infos`);
  if (report.issues.numErrors || report.issues.numWarnings) {
    console.error(JSON.stringify(report.issues.messages, null, 2));
    process.exitCode = 1;
  }
}
