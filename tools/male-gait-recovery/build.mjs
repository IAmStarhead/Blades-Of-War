// Build a separate 100STYLE/C gait trial and a self-contained C comparison.
// Previous deliveries are immutable inputs, never output destinations.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {NodeIO} from '../male-library-motion/node_modules/@gltf-transform/core/dist/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--output')) throw Error('Usage: node build.mjs [--output separate-directory]');
const permitted = path.join(repo, 'work/male-gait-recovery'), out = path.resolve(args[1] || permitted);
if (out === repo || (out.startsWith(repo + path.sep) && out !== permitted && !out.startsWith(permitted + path.sep)))
  throw Error('Choose a separate output directory; refusing to overwrite earlier work');
const old = path.join(repo, 'work/male-gait-refine'), sources100 = path.join(repo, 'tools/male-motion-candidates/sources');
const expectedOld = 'c0685047069bf2a25e7cdc2c23580543b7e349281ad27d64dc240d63b9446013';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(fs.readFileSync(path.join(old, 'male_gait_C_refined.glb'))), expectedOld, 'Last C trial changed');
fs.mkdirSync(out, {recursive: true});
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-gait-recovery-'));
function run(...parts) {
  const result = spawnSync(process.execPath, parts, {cwd: repo, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024});
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`Command failed: ${parts[0]} (${result.status})`);
  return result.stdout.trim();
}
try {
  const t = name => path.join(tmp, name);
  run(path.join(here, 'fix-c.mjs'), t('c.glb'), t('c.json'));
  run(path.join(here, 'retarget-100style.mjs'), t('c.glb'), t('raw.glb'), t('source.json'));
  const fit = JSON.parse(run(path.join(here, 'fit-100style.mjs'), t('raw.glb'), t('fitted.glb')));
  const knees = JSON.parse(run(path.join(here, 'walk-knees.mjs'), t('fitted.glb'), t('knees.glb')));
  run(path.join(repo, 'tools/male-motion-fit/calibrate.mjs'), t('knees.glb'), t('source.json'), t('calibrated.glb'), t('floor.json'));
  const clearance = JSON.parse(run(path.join(here, 'jog-clearance.mjs'), t('calibrated.glb'), t('clear.glb'), t('source.json')));
  const arms = JSON.parse(run(path.join(here, 'jog-arms.mjs'), t('c.glb'), t('clear.glb'), t('combined.glb')));
  const rootSmoothing = JSON.parse(run(path.join(here, 'smooth-root.mjs'), t('combined.glb'), t('smoothed.glb')));
  const io = new NodeIO(), doc = await io.read(t('smoothed.glb')), animations = doc.getRoot().listAnimations();
  assert.deepEqual(animations.map(a => a.getName()), ['Walk_C', 'Run_C']);
  animations[0].setName('Walk_100STYLE_Trial'); animations[1].setName('Jog_100STYLE_CArms_Trial');
  const model = 'male_gait_alternative.glb', previous = 'previous_C.glb';
  await io.write(path.join(out, model), doc);
  const copy = (from, to) => {
    const dest = path.join(out, to); fs.mkdirSync(path.dirname(dest), {recursive: true}); fs.copyFileSync(from, dest);
  };
  copy(path.join(old, 'male_gait_C_refined.glb'), previous);
  const require = createRequire(path.join(repo, 'tools/male-library-motion/package.json')), esbuild = require('esbuild');
  const built = await esbuild.build({entryPoints: [path.join(here, 'viewer.mjs')], nodePaths: [path.join(repo, 'tools/male-library-motion/node_modules')],
    bundle: true, write: false, format: 'iife', target: 'es2020', minify: true, legalComments: 'none'});
  let html = fs.readFileSync(path.join(here, 'viewer.template.html'), 'utf8');
  const replacements = {'__NEW_MODEL_BASE64__': fs.readFileSync(path.join(out, model)).toString('base64'),
    '__PREVIOUS_MODEL_BASE64__': fs.readFileSync(path.join(out, previous)).toString('base64'),
    '__VIEWER_BUNDLE__': built.outputFiles[0].text.replaceAll('</script', '<\\/script')};
  for (const [marker, value] of Object.entries(replacements)) {
    assert.equal(html.split(marker).length, 2, 'Missing or duplicated marker ' + marker); html = html.replace(marker, () => value);
  }
  fs.writeFileSync(path.join(out, 'index.html'), html);
  copy(path.join(here, 'README.ru.md'), 'README.md'); copy(path.join(here, 'CREDITS.md'), 'CREDITS.md');
  for (const license of ['LICENSE_CC0_ASSETS.md', 'LICENSE_MAKEHUMAN.md', 'LICENSE_THREE.txt']) copy(path.join(old, license), license);
  const sources = [];
  for (const name of ['accad_male2_walk.bvh', 'accad_male2_run.bvh', 'accad_male2_stand_to_walk.bvh'])
    for (const suffix of ['', '.LICENSE.txt']) { const file = name + suffix; copy(path.join(old, 'sources', file), 'sources/' + file); sources.push('sources/' + file); }
  for (const name of ['neutral_fw.bvh', 'neutral_fr.bvh'])
    for (const suffix of ['', '.LICENSE.txt']) { const file = name + suffix; copy(path.join(sources100, file), 'sources/' + file); sources.push('sources/' + file); }
  fs.writeFileSync(path.join(out, '.gitattributes'), '*.glb binary\n*.mp4 binary\n*.zip binary\nindex.html -text -whitespace\nsources/*.bvh -text -whitespace\nsources/*.txt -text -whitespace\n*.md text eol=lf\n*.json text eol=lf\nSHA256SUMS.txt text eol=lf\nLICENSE_MAKEHUMAN.md -diff\n');
  const source = JSON.parse(fs.readFileSync(t('source.json'), 'utf8'));
  // The arrays are intermediate calibration samples, not useful to a user of the GLB.
  for (const clip of Object.values(source.clips)) { delete clip.sourceClear; delete clip.sourceFeet; }
  const files = ['index.html', model, previous, 'README.md', 'CREDITS.md', 'LICENSE_CC0_ASSETS.md', 'LICENSE_MAKEHUMAN.md', 'LICENSE_THREE.txt', ...sources];
  const info = {scope: 'Separate 100STYLE walking/jogging experiment with adjusted C arms for the jog; previous C is byte-identical. Not a game-engine integration.',
    previousModelSha256: expectedOld, modelSha256: hash(fs.readFileSync(path.join(out, model))),
    partialC: JSON.parse(fs.readFileSync(t('c.json'), 'utf8')), source, fit, walkKnees: knees,
    floor: JSON.parse(fs.readFileSync(t('floor.json'), 'utf8')), jogSwingClearance: clearance, jogArms: arms, rootSmoothing,
    viewerGroundSpeedMps: {selected: {walk: .87092, run: 1.9000743}, previous: {walk: 1.73, run: 3.52}},
    previousPhaseOffsetCycles: {walk: .227, run: .201},
    filesSha256: Object.fromEntries(files.map(file => [file, hash(fs.readFileSync(path.join(out, file)))]))};
  fs.writeFileSync(path.join(out, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
  console.log(`Built ${path.join(out, 'index.html')} and ${model} (${info.modelSha256})`);
} finally { fs.rmSync(tmp, {recursive: true, force: true}); }
