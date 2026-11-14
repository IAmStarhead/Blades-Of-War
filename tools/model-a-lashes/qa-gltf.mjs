// Validate both the original and the modified GLB with Khronos glTF Validator.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'tools/character-showcase/package.json'));
const validator = require('gltf-validator');
const result = path.resolve(process.argv[2] || path.join(root, 'work/character-model-search/selected-a'));
const zip = path.join(result, 'female_A_with_lashes_showcase.zip');
const cases = [
  ['original', execFileSync('unzip', ['-p', zip, 'female_A_original.glb'], { maxBuffer: 10_000_000 })],
  ['with lashes', fs.readFileSync(path.join(result, 'female_A_with_lashes.glb'))],
];
let failed = false;
for (const [name, bytes] of cases) {
  const report = await validator.validateBytes(new Uint8Array(bytes), { uri: `${name}.glb` });
  console.log(`${name}: ${report.issues.numErrors} errors, ${report.issues.numWarnings} warnings`);
  if (report.issues.numErrors || report.issues.numWarnings) {
    console.log(JSON.stringify(report.issues.messages, null, 2));
    failed = true;
  }
}
if (failed) process.exitCode = 1;
