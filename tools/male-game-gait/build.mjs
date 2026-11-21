// Build only this isolated delivery; never overwrite an earlier trial.
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
if (args.length && (args.length !== 2 || args[0] !== '--output'))
  throw Error('Usage: node build.mjs [--output separate-directory]');
const permitted = path.join(repo, 'work/male-game-gait'), out = path.resolve(args[1] || permitted);
if (out === repo || (out.startsWith(repo + path.sep) && out !== permitted && !out.startsWith(permitted + path.sep)))
  throw Error('Choose a separate output directory; refusing to overwrite earlier work');
fs.mkdirSync(out, {recursive: true});
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-game-gait-build-'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  const model = 'male_game_gait_trial.glb', report = path.join(temporary, 'pose.json');
  const authored = spawnSync(process.execPath, [path.join(here, 'author.mjs'), path.join(out, model), report], {cwd: repo, stdio: 'inherit'});
  if (authored.error) throw authored.error;
  if (authored.status !== 0) throw Error(`Authoring failed (${authored.status})`);
  const require = createRequire(path.join(repo, 'tools/male-library-motion/package.json')), esbuild = require('esbuild');
  const bundled = await esbuild.build({entryPoints: [path.join(here, 'viewer.mjs')],
    nodePaths: [path.join(repo, 'tools/male-library-motion/node_modules')], bundle: true, write: false,
    format: 'iife', target: 'es2020', minify: true, legalComments: 'none'});
  let html = fs.readFileSync(path.join(here, 'viewer.template.html'), 'utf8');
  const replacements = {'__MODEL_BASE64__': fs.readFileSync(path.join(out, model)).toString('base64'),
    '__VIEWER_BUNDLE__': bundled.outputFiles[0].text.replaceAll('</script', '<\\/script')};
  for (const [marker, value] of Object.entries(replacements)) {
    assert.equal(html.split(marker).length, 2, `Missing or duplicated marker ${marker}`);
    html = html.replace(marker, () => value);
  }
  fs.writeFileSync(path.join(out, 'index.html'), html);
  const copy = (source, dest) => fs.copyFileSync(source, path.join(out, dest));
  copy(path.join(here, 'README.ru.md'), 'README.md');
  copy(path.join(here, 'CREDITS.md'), 'CREDITS.md');
  copy(path.join(here, 'source/LICENSE_CC0.txt'), 'LICENSE_QUATERNIUS_CC0.txt');
  for (const name of ['LICENSE_CC0_ASSETS.md', 'LICENSE_MAKEHUMAN.md', 'LICENSE_THREE.txt'])
    copy(path.join(repo, 'work/male-gait-refine', name), name);
  fs.writeFileSync(path.join(out, '.gitattributes'), '*.glb binary\n*.mp4 binary\n*.zip binary\nindex.html -text -whitespace\n*.md text eol=lf\n*.json text eol=lf\nSHA256SUMS.txt text eol=lf\nLICENSE_MAKEHUMAN.md -diff\n');
  const files = ['index.html', model, 'README.md', 'CREDITS.md', 'LICENSE_QUATERNIUS_CC0.txt',
    'LICENSE_CC0_ASSETS.md', 'LICENSE_MAKEHUMAN.md', 'LICENSE_THREE.txt'];
  const pose = JSON.parse(fs.readFileSync(report, 'utf8'));
  const info = {scope: 'Separate adapted Quaternius 2017 walk/run trial; no previous C motion, no foot locking, not an engine integration.',
    modelSha256: hash(fs.readFileSync(path.join(out, model))), pose,
    viewerApproximateGroundSpeedMps: {walk: 1.44, run: 4.37},
    filesSha256: Object.fromEntries(files.map(file => [file, hash(fs.readFileSync(path.join(out, file)))]))};
  assert.equal(info.modelSha256, pose.sha256);
  fs.writeFileSync(path.join(out, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
  console.log(`Built ${path.join(out, 'index.html')} and ${model} (${info.modelSha256})`);
} finally {
  fs.rmSync(temporary, {recursive: true, force: true});
}
