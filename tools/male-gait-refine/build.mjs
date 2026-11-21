// Build the separate gait refit and an offline comparison with the previous trial.
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
const permitted = path.join(repo, 'work/male-gait-refine'), out = path.resolve(args[1] || permitted);
if (out === repo || (out.startsWith(repo + path.sep) && out !== permitted && !out.startsWith(permitted + path.sep)))
  throw Error('Choose a separate output directory; refusing to overwrite earlier work');
const old = path.join(repo, 'work/male-posture-fit'), expected = 'c72ec5c2386362d4f4c30dc0e541ffa3c6664f9ca4c27d49d8cd428ce87c3847';
const hash = b => createHash('sha256').update(b).digest('hex');
assert.equal(hash(fs.readFileSync(path.join(old, 'male_posture_C_trial.glb'))), expected, 'Previous posture model changed');
fs.mkdirSync(out, {recursive: true});
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-gait-refine-build-'));
function run(...parts) {
  const result = spawnSync(process.execPath, parts, {cwd: repo, stdio: 'inherit'});
  if (result.error) throw result.error; if (result.status !== 0) throw Error(`Command failed: ${parts[0]} (${result.status})`);
}
try {
  const posed = path.join(tmp, 'posed.glb'), poseReport = path.join(tmp, 'pose.json'), skinReport = path.join(tmp, 'skin.json');
  const model = 'male_gait_C_refined.glb', previous = 'previous_posture_C.glb';
  run(path.join(here, 'author.mjs'), posed, poseReport);
  run(path.join(here, 'skin.mjs'), posed, path.join(out, model), skinReport);
  const copy = (from, to) => { const dest = path.join(out, to); fs.mkdirSync(path.dirname(dest), {recursive: true}); fs.copyFileSync(from, dest); };
  copy(path.join(old, 'male_posture_C_trial.glb'), previous);
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
  const sources = fs.readdirSync(path.join(old, 'sources')).sort(); assert.equal(sources.length, 6);
  for (const name of sources) copy(path.join(old, 'sources', name), 'sources/' + name);
  fs.writeFileSync(path.join(out, '.gitattributes'), '*.glb binary\n*.mp4 binary\n*.zip binary\nindex.html -text -whitespace\nsources/*.bvh -text -whitespace\nsources/*.txt -text -whitespace\n*.md text eol=lf\n*.json text eol=lf\nSHA256SUMS.txt text eol=lf\nLICENSE_MAKEHUMAN.md -diff\n');
  const files = ['index.html', model, previous, 'README.md', 'CREDITS.md', 'LICENSE_CC0_ASSETS.md', 'LICENSE_MAKEHUMAN.md', 'LICENSE_THREE.txt',
    ...sources.map(name => 'sources/' + name)];
  const info = {scope: 'Separate shoulder, upper-thigh and toe-direction fitting trial. The previous posture model is byte-identical for honest comparison.',
    previousModelSha256: expected, pose: JSON.parse(fs.readFileSync(poseReport, 'utf8')), skin: JSON.parse(fs.readFileSync(skinReport, 'utf8')),
    viewerGroundSpeedMps: {walk: 1.73, run: 3.52}, filesSha256: Object.fromEntries(files.map(file => [file, hash(fs.readFileSync(path.join(out, file)))]))};
  fs.writeFileSync(path.join(out, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
  console.log(`Built ${path.join(out, 'index.html')} and ${model} (${hash(fs.readFileSync(path.join(out, model)))})`);
} finally { fs.rmSync(tmp, {recursive: true, force: true}); }
