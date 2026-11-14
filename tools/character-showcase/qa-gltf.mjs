// Structural validation of both GLBs and of the copies embedded in the HTML.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import validator from 'gltf-validator';

const here = path.dirname(fileURLToPath(import.meta.url));
const directory = path.resolve(process.argv[2] || path.join(here, '../../work/character-showcase/prototype'));
const html = fs.readFileSync(path.join(directory, 'BladesOfWar_Showcase.html'), 'utf8');
let failed = false;
for (const [variable, file] of [['FEMALE_URI', 'female_fixed.glb'], ['MALE_URI', 'male_fixed.glb']]) {
  const bytes = fs.readFileSync(path.join(directory, 'assets/models', file));
  const embedded = html.match(new RegExp(`const ${variable}\\s*=\\s*"data:model/gltf-binary;base64,([^"]+)";`));
  const identical = Boolean(embedded && Buffer.from(embedded[1], 'base64').equals(bytes));
  const report = await validator.validateBytes(new Uint8Array(bytes), { uri: file });
  console.log(`${file}: embedded=${identical}, errors=${report.issues.numErrors}, warnings=${report.issues.numWarnings}, info=${report.issues.numInfos}`);
  if (!identical || report.issues.numErrors || report.issues.numWarnings) failed = true;
}
if (failed) process.exitCode = 1;
