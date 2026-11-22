// Separate offline viewer and runtime; never overwrite the previous delivery.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '../..');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--output')) throw Error('Usage: node build.mjs [--output separate-directory]');
const permitted = path.join(repo, 'work/male-leg-volume'), out = path.resolve(args[1] || permitted);
if (out === repo || (out.startsWith(repo + path.sep) && out !== permitted && !out.startsWith(permitted + path.sep)))
  throw Error('Choose this delivery or a separate scratch directory; refusing to overwrite earlier work');
fs.mkdirSync(out, {recursive: true});
const model = 'male_leg_volume_trial.glb', authorReport = 'author-report.json';
const run = spawnSync(process.execPath, [path.join(here, 'author.mjs'), path.join(out, model), path.join(out, authorReport)], {cwd: repo, stdio: 'inherit'});
if (run.error) throw run.error; if (run.status !== 0) throw Error(`Author failed (${run.status})`);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = fs.readFileSync(path.join(out, model)), pose = JSON.parse(fs.readFileSync(path.join(out, authorReport), 'utf8'));
assert.equal(hash(bytes), pose.outputSha256);
const old = path.join(repo, 'work/male-uphill'), copy = (from, to) => fs.copyFileSync(from, path.join(out, to));
for (const name of ['terrain.mjs', 'uphill-controller.mjs', 'phase-clock.mjs', 'floor-envelope.mjs', 'locomotion-three.mjs'])
  copy(path.join(repo, 'tools/male-uphill', name), name);
copy(path.join(here, 'knee-volume.mjs'), 'knee-volume.mjs');
copy(path.join(here, 'README.ru.md'), 'README.md');
copy(path.join(here, 'DEVELOPMENT.md'), 'DEVELOPMENT.md');
for (const name of ['LICENSE_CC0_ASSETS.md', 'LICENSE_MAKEHUMAN.md', 'LICENSE_QUATERNIUS_CC0.txt', 'LICENSE_THREE.txt']) copy(path.join(old, name), name);
const credits = '# Leg-volume trial\n\nThe preceding character is `work/male-hand-flight/male_hands_airfoot_trial.glb` (SHA-256 `' + pose.sourceSha256 + '`). This separate GLB adds local knee-volume morphs and weight tracks; it does not replace that model. The inherited credits are below.\n\n---\n\n' + fs.readFileSync(path.join(old, 'CREDITS.md'), 'utf8');
fs.writeFileSync(path.join(out, 'CREDITS.md'), credits);
const require = createRequire(path.join(repo, 'tools/male-library-motion/package.json')), esbuild = require('esbuild');
const built = await esbuild.build({entryPoints: [path.join(here, 'viewer.mjs')], nodePaths: [path.join(repo, 'tools/male-library-motion/node_modules')],
  bundle: true, write: false, format: 'iife', target: 'es2020', minify: true, legalComments: 'none'});
let html = fs.readFileSync(path.join(here, 'viewer.template.html'), 'utf8');
for (const [marker, value] of Object.entries({'__MODEL_BASE64__': bytes.toString('base64'), '__VIEWER_BUNDLE__': built.outputFiles[0].text.replaceAll('</script', '<\\/script')})) {
  assert.equal(html.split(marker).length, 2, `Missing or duplicated marker ${marker}`); html = html.replace(marker, () => value);
}
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, '.gitattributes'), '*.glb binary\n*.mp4 binary\n*.png binary\n*.zip binary\nindex.html -text -whitespace\n*.md text eol=lf\n*.mjs text eol=lf\n*.json text eol=lf\nSHA256SUMS.txt text eol=lf\nLICENSE_MAKEHUMAN.md -diff\n');
const files = ['.gitattributes', 'index.html', model, authorReport, 'README.md', 'DEVELOPMENT.md', 'CREDITS.md', 'terrain.mjs', 'uphill-controller.mjs',
  'phase-clock.mjs', 'floor-envelope.mjs', 'locomotion-three.mjs', 'knee-volume.mjs', 'LICENSE_CC0_ASSETS.md', 'LICENSE_MAKEHUMAN.md', 'LICENSE_QUATERNIUS_CC0.txt', 'LICENSE_THREE.txt'];
const info = {scope: 'Separate knee-volume trial on the existing straight uphill demonstration; no game integration.',
  previousModelSha256: pose.sourceSha256, modelSha256: hash(bytes), pose,
  runtime: 'Baked weights for original single clips; recompute from the current local knee quaternions after blending and terrain IK.',
  runPhaseOffsetCycles: -3 / 32, terrain: '0–20° smooth straight heightfield; no foot lock.',
  filesSha256: Object.fromEntries(files.map(file => [file, hash(fs.readFileSync(path.join(out, file)))]))};
fs.writeFileSync(path.join(out, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`Built ${path.join(out, 'index.html')} using ${model} (${info.modelSha256})`);
