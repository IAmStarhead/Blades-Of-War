// Validate both the approved A and the separately revised A with Khronos' validator.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'tools/character-showcase/package.json'));
const validator = require('gltf-validator');
const result = path.resolve(process.argv[2] || path.join(root, 'work/character-model-search/selected-a/refined-v2'));
const cases = [
  ['previously approved A', fs.readFileSync(path.join(root, 'work/character-model-search/selected-a/refined/female_A_refined.glb'))],
  ['A revision 2', fs.readFileSync(path.join(result, 'female_A_refined_v2.glb'))],
];
let failed = false;
for (const [name, bytes] of cases) {
  const report = await validator.validateBytes(new Uint8Array(bytes), { uri: `${name}.glb` });
  console.log(`${name}: ${report.issues.numErrors} errors, ${report.issues.numWarnings} warnings, ${report.issues.numInfos} infos`);
  if (report.issues.numErrors || report.issues.numWarnings) {
    console.error(JSON.stringify(report.issues.messages, null, 2));
    failed = true;
  }
}
if (failed) process.exitCode = 1;
