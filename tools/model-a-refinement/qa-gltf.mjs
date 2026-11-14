// Validate the original model A and the revised GLB using Khronos glTF Validator.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'tools/character-showcase/package.json'));
const validator = require('gltf-validator');
const sourceZip = path.join(root, 'work/character-model-search/selected-a/female_A_with_lashes_showcase.zip');
const result = path.resolve(process.argv[2] || path.join(root, 'work/character-model-search/selected-a/refined'));
const cases = [
  ['original A', execFileSync('unzip', ['-p', sourceZip, 'female_A_original.glb'], { maxBuffer: 10_000_000 })],
  ['revised A', fs.readFileSync(path.join(result, 'female_A_refined.glb'))],
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
