// Rebuild the separate C/C character-fitting trial and its standalone viewer.
// Videos are captured separately by record.mjs; package.py assembles the ZIP.
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
const out = path.resolve(args[1] || path.join(repo, 'work/male-motion-fit'));
const permitted = path.join(repo, 'work/male-motion-fit');
if (out === repo || (out.startsWith(repo + path.sep) && out !== permitted && !out.startsWith(permitted + path.sep)))
  throw Error('Choose a separate output directory; refusing to overwrite earlier work');
fs.mkdirSync(out, {recursive: true});
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-motion-fit-'));
const run = (...parts) => {
  const result = spawnSync(process.execPath, parts, {cwd: repo, stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`Command failed: ${parts[0]} (exit ${result.status})`);
};
const hash = b => createHash('sha256').update(b).digest('hex');
const model = 'male_motion_C_trial.glb';
try {
  const raw = path.join(tmp, 'raw.glb'), infoPath = path.join(tmp, 'intermediate.json');
  const adjusted = path.join(tmp, 'adjusted.glb'), ikPath = path.join(tmp, 'swing.json'), floorPath = path.join(tmp, 'floor.json');
  run(path.join(here, 'retarget.mjs'), raw, infoPath);
  run(path.join(here, 'swing-foot.mjs'), raw, infoPath, adjusted, ikPath);
  run(path.join(here, 'calibrate.mjs'), adjusted, infoPath, path.join(out, model), floorPath);
  const require = createRequire(path.join(repo, 'tools/male-library-motion/package.json'));
  const esbuild = require('esbuild');
  const built = await esbuild.build({entryPoints: [path.join(here, 'viewer.mjs')],
    nodePaths: [path.join(repo, 'tools/male-library-motion/node_modules')], bundle: true, write: false,
    format: 'iife', target: 'es2020', minify: true, legalComments: 'none'});
  let html = fs.readFileSync(path.join(here, 'viewer.template.html'), 'utf8');
  const replacements = {'__MODEL_BASE64__': fs.readFileSync(path.join(out, model)).toString('base64'),
    '__VIEWER_BUNDLE__': built.outputFiles[0].text.replaceAll('</script', '<\\/script')};
  for (const [marker, value] of Object.entries(replacements)) {
    assert.equal(html.split(marker).length, 2, 'Missing or duplicated marker ' + marker);
    html = html.replace(marker, () => value);
  }
  fs.writeFileSync(path.join(out, 'index.html'), html);
  const copy = (from, to) => { const target = path.join(out, to); fs.mkdirSync(path.dirname(target), {recursive: true}); fs.copyFileSync(from, target); };
  copy(path.join(here, 'README.ru.md'), 'README.md');
  copy(path.join(here, 'CREDITS.md'), 'CREDITS.md');
  copy(path.join(repo, 'work/male-body-contour/LICENSE_CC0_ASSETS.md'), 'LICENSE_CC0_ASSETS.md');
  copy(path.join(repo, 'tools/male-static-rebuild/sources/LICENSE.MAKEHUMAN.md'), 'LICENSE_MAKEHUMAN.md');
  copy(path.join(repo, 'tools/male-library-motion/node_modules/three/LICENSE'), 'LICENSE_THREE.txt');
  for (const file of ['accad_male2_walk.bvh', 'accad_male2_run.bvh', 'accad_male2_stand_to_walk.bvh']) {
    const source = file.includes('stand_to_walk') ? path.join(here, 'sources') : path.join(repo, 'tools/male-motion-candidates/sources');
    copy(path.join(source, file), 'sources/' + file);
    copy(path.join(source, file + '.LICENSE.txt'), 'sources/' + file + '.LICENSE.txt');
  }
  fs.writeFileSync(path.join(out, '.gitattributes'), '*.glb binary\n*.mp4 binary\n*.zip binary\nindex.html -text -whitespace\nsources/*.bvh -text -whitespace\nsources/*.txt -text -whitespace\n*.md text eol=lf\n*.json text eol=lf\nSHA256SUMS.txt text eol=lf\nLICENSE_MAKEHUMAN.md -diff\n');
  const files = ['index.html', model, 'README.md', 'CREDITS.md', 'LICENSE_CC0_ASSETS.md', 'LICENSE_MAKEHUMAN.md', 'LICENSE_THREE.txt',
    ...fs.readdirSync(path.join(out, 'sources')).sort().map(x => 'sources/' + x)];
  const metadata = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
  metadata.scope = 'Separate C/C fitting trial on an unchanged copy of the delivered mesh, skin and rig; not a production animation.';
  metadata.sourceMirror = 'https://github.com/rywible/wrela/tree/3dd01b4ef0d1b28848c5020afff1bf66fed0f2eb/content/humanoid/assets';
  metadata.swingFoot = JSON.parse(fs.readFileSync(ikPath, 'utf8'));
  metadata.rootCalibration = JSON.parse(fs.readFileSync(floorPath, 'utf8'));
  metadata.viewerGroundSpeedMps = {Walk_C: 1.73, Run_C: 3.52};
  metadata.filesSha256 = Object.fromEntries(files.map(file => [file, hash(fs.readFileSync(path.join(out, file)))]));
  fs.writeFileSync(path.join(out, 'build-info.json'), JSON.stringify(metadata, null, 2) + '\n');
  console.log(`Built ${path.join(out, 'index.html')} and ${model} (${hash(fs.readFileSync(path.join(out, model)))})`);
} finally { fs.rmSync(tmp, {recursive: true, force: true}); }
