// Build a separate, offline C follow-up; never overwrite previous deliveries.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '../..');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--output')) throw Error('Usage: node build.mjs [--output separate-directory]');
const permitted = path.join(repo, 'work/male-gait-feedback'), out = path.resolve(args[1] || permitted);
if (out === repo || (out.startsWith(repo + path.sep) && out !== permitted && !out.startsWith(permitted + path.sep)))
  throw Error('Choose a separate output directory; refusing to overwrite earlier work');
const old = path.join(repo, 'work/male-gait-refine'), expected = 'c0685047069bf2a25e7cdc2c23580543b7e349281ad27d64dc240d63b9446013';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(fs.readFileSync(path.join(old, 'male_gait_C_refined.glb'))), expected, 'Previous C model changed');
fs.mkdirSync(out, {recursive: true});
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-c-feedback-build-'));
try {
  const model = 'male_C_head_feet_trial.glb', previous = 'previous_C.glb', reportPath = path.join(tmp, 'pose.json');
  const result = spawnSync(process.execPath, [path.join(here, 'author.mjs'), path.join(out, model), reportPath], {cwd: repo, stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`Authoring failed (${result.status})`);
  const copy = (from, to) => { const dest = path.join(out, to); fs.mkdirSync(path.dirname(dest), {recursive: true}); fs.copyFileSync(from, dest); };
  copy(path.join(old, 'male_gait_C_refined.glb'), previous);
  const require = createRequire(path.join(repo, 'tools/male-library-motion/package.json')), esbuild = require('esbuild');
  const built = await esbuild.build({entryPoints: [path.join(here, 'viewer.mjs')], nodePaths: [path.join(repo, 'tools/male-library-motion/node_modules')],
    bundle: true, write: false, format: 'iife', target: 'es2020', minify: true, legalComments: 'none'});
  let html = fs.readFileSync(path.join(here, 'viewer.template.html'), 'utf8');
  const replacements = {'__NEW_MODEL_BASE64__': fs.readFileSync(path.join(out, model)).toString('base64'),
    '__PREVIOUS_MODEL_BASE64__': fs.readFileSync(path.join(out, previous)).toString('base64'),
    '__VIEWER_BUNDLE__': built.outputFiles[0].text.replaceAll('</script', '<\\/script')};
  for (const [marker, value] of Object.entries(replacements)) {
    assert.equal(html.split(marker).length, 2, `Missing or duplicated marker ${marker}`); html = html.replace(marker, () => value);
  }
  fs.writeFileSync(path.join(out, 'index.html'), html);
  copy(path.join(here, 'README.ru.md'), 'README.md'); copy(path.join(here, 'CREDITS.md'), 'CREDITS.md');
  for (const name of ['LICENSE_CC0_ASSETS.md', 'LICENSE_MAKEHUMAN.md', 'LICENSE_THREE.txt']) copy(path.join(old, name), name);
  const sources = [];
  for (const base of ['accad_male2_walk.bvh', 'accad_male2_run.bvh', 'accad_male2_stand_to_walk.bvh'])
    for (const suffix of ['', '.LICENSE.txt']) { const name = base + suffix; copy(path.join(old, 'sources', name), 'sources/' + name); sources.push('sources/' + name); }
  fs.writeFileSync(path.join(out, '.gitattributes'), '*.glb binary\n*.mp4 binary\n*.zip binary\nindex.html -text -whitespace\nsources/*.bvh -text -whitespace\nsources/*.txt -text -whitespace\n*.md text eol=lf\n*.json text eol=lf\nSHA256SUMS.txt text eol=lf\nLICENSE_MAKEHUMAN.md -diff\n');
  const files = ['index.html', model, previous, 'README.md', 'CREDITS.md', 'LICENSE_CC0_ASSETS.md', 'LICENSE_MAKEHUMAN.md', 'LICENSE_THREE.txt', ...sources];
  const pose = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const info = {scope: 'Separate, conservative C follow-up after rejecting the 100STYLE/C mix. Upper body, timing and shared skin are from C; not an in-game integration.',
    previousModelSha256: expected, modelSha256: hash(fs.readFileSync(path.join(out, model))), pose,
    viewerGroundSpeedMps: {walk: 1.73, run: 3.52}, filesSha256: Object.fromEntries(files.map(file => [file, hash(fs.readFileSync(path.join(out, file)))]))};
  assert.equal(info.modelSha256, pose.outputSha256);
  fs.writeFileSync(path.join(out, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
  console.log(`Built ${path.join(out, 'index.html')} and ${model} (${info.modelSha256})`);
} finally { fs.rmSync(tmp, {recursive: true, force: true}); }
