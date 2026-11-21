// Build a separate offline walk/run transition trial from the exact last GLB.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '../..');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--output')) throw Error('Usage: node build.mjs [--output separate-directory]');
const permitted = path.join(repo, 'work/male-gait-transition'), out = path.resolve(args[1] || permitted);
if (out === repo || (out.startsWith(repo + path.sep) && out !== permitted && !out.startsWith(permitted + path.sep)))
  throw Error('Choose a separate output directory; refusing to overwrite earlier work');
const old = path.join(repo, 'work/male-hand-flight'), model = 'male_hands_airfoot_trial.glb';
const expected = '576077e068f2c48a88c208be0ad72b4214e42164d1e5b0f0f9f7050f3967e2bf';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = fs.readFileSync(path.join(old, model));
assert.equal(hash(bytes), expected, 'Previous model changed');
fs.mkdirSync(out, {recursive: true});
const copy = (from, to) => fs.copyFileSync(from, path.join(out, to));
copy(path.join(old, model), model);
for (const name of ['phase-clock.mjs', 'floor-envelope.mjs', 'locomotion-three.mjs']) copy(path.join(here, name), name);
copy(path.join(here, 'README.ru.md'), 'README.md');
for (const name of ['LICENSE_CC0_ASSETS.md', 'LICENSE_MAKEHUMAN.md', 'LICENSE_QUATERNIUS_CC0.txt', 'LICENSE_THREE.txt']) copy(path.join(old, name), name);
const credits = '# Transition trial\n\nThis trial uses the exact `male_hands_airfoot_trial.glb` (SHA-256 `' + expected + '`) without changing its contents. The viewer phase-locks and blends those clips at runtime; the vertical floor guard and transition are not baked into the GLB. The inherited credits are below.\n\n---\n\n' + fs.readFileSync(path.join(old, 'CREDITS.md'), 'utf8');
fs.writeFileSync(path.join(out, 'CREDITS.md'), credits);
const require = createRequire(path.join(repo, 'tools/male-library-motion/package.json')), esbuild = require('esbuild');
const built = await esbuild.build({entryPoints: [path.join(here, 'viewer.mjs')], nodePaths: [path.join(repo, 'tools/male-library-motion/node_modules')],
  bundle: true, write: false, format: 'iife', target: 'es2020', minify: true, legalComments: 'none'});
let html = fs.readFileSync(path.join(here, 'viewer.template.html'), 'utf8');
for (const [marker, value] of Object.entries({'__MODEL_BASE64__': bytes.toString('base64'), '__VIEWER_BUNDLE__': built.outputFiles[0].text.replaceAll('</script', '<\\/script')})) {
  assert.equal(html.split(marker).length, 2, `Missing or duplicated marker ${marker}`); html = html.replace(marker, () => value);
}
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, '.gitattributes'), '*.glb binary\n*.mp4 binary\n*.zip binary\nindex.html -text -whitespace\n*.md text eol=lf\n*.mjs text eol=lf\n*.json text eol=lf\nSHA256SUMS.txt text eol=lf\nLICENSE_MAKEHUMAN.md -diff\n');
const files = ['.gitattributes', 'index.html', model, 'README.md', 'CREDITS.md', 'phase-clock.mjs', 'floor-envelope.mjs', 'locomotion-three.mjs',
  'LICENSE_CC0_ASSETS.md', 'LICENSE_MAKEHUMAN.md', 'LICENSE_QUATERNIUS_CC0.txt', 'LICENSE_THREE.txt'];
const info = {scope: 'Runtime phase-locked walk/run blend on the unchanged last character; no engine integration or baked transition.',
  sourceModel: 'work/male-hand-flight/' + model, sourceModelSha256: expected, modelSha256: hash(fs.readFileSync(path.join(out, model))),
  runPhaseOffsetCycles: -3 / 32, responsePerSecond: 11, viewerGroundSpeedMps: {walk: 1.44, run: 4.37},
  guard: 'Anticipatory phase/weight lift envelope plus measured C1 fallback against selected skinned soles, world floor Y=0; no horizontal foot lock.',
  filesSha256: Object.fromEntries(files.map(file => [file, hash(fs.readFileSync(path.join(out, file)))]))};
fs.writeFileSync(path.join(out, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`Built ${path.join(out, 'index.html')} using unchanged ${model} (${info.modelSha256})`);
