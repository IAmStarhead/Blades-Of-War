// Rebuild the research-only viewer in a scratch directory. The delivered
// volume trial, its GLB and the earlier uphill controller remain untouched.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '../..');
const out = path.resolve(process.argv[2] || '/dev/shm/bow-leg-motion-candidate');
if (process.argv.length > 3) throw Error('Usage: node build-candidate.mjs [scratch-directory]');
if (out === repo || out.startsWith(repo + path.sep)) throw Error('Build this experiment outside the repository, never over a delivery');
fs.mkdirSync(out, {recursive: true});
const resolvedOut = fs.realpathSync(out), resolvedRepo = fs.realpathSync(repo);
if (resolvedOut === resolvedRepo || resolvedOut.startsWith(resolvedRepo + path.sep)) throw Error('Scratch path resolves inside the repository');
if (fs.readdirSync(out).length && !fs.existsSync(path.join(out, 'EXPERIMENT.txt')))
  throw Error('Choose an empty scratch directory or a previous build of this experiment');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const glbPath = path.join(repo, 'work/male-leg-volume/male_leg_volume_trial.glb');
const sourceHtml = path.join(repo, 'work/male-leg-volume/index.html');
const viewer = path.join(repo, 'tools/male-leg-volume/viewer.mjs');
const candidate = path.join(here, 'experimental-uphill-controller.mjs');
const glb = fs.readFileSync(glbPath);
assert.equal(hash(glb), 'eb569ef2269a8d7e40378590614beebc933edd3bdcd7340f8146494ceb975484', 'Unexpected GLB');
assert.equal(hash(fs.readFileSync(sourceHtml)), '54881fea21b19115578de6dc6f001a160a7e72fd46c3c29066ef008c274c8de7', 'Unexpected delivered viewer');
const require = createRequire(path.join(repo, 'tools/male-library-motion/package.json')), esbuild = require('esbuild');
let swaps = 0;
const built = await esbuild.build({
  entryPoints: [viewer], nodePaths: [path.join(repo, 'tools/male-library-motion/node_modules')],
  bundle: true, write: false, format: 'iife', target: 'es2020', minify: true, legalComments: 'none',
  plugins: [{name: 'research-controller', setup(build) {
    build.onResolve({filter: /^\.\.\/male-uphill\/uphill-controller\.mjs$/}, args => {
      if (args.importer !== viewer) return;
      swaps++; return {path: candidate};
    });
  }}],
});
assert.equal(swaps, 1, 'Expected exactly one candidate controller substitution');
let html = fs.readFileSync(path.join(repo, 'tools/male-leg-volume/viewer.template.html'), 'utf8');
for (const [marker, value] of Object.entries({
  '__MODEL_BASE64__': glb.toString('base64'),
  '__VIEWER_BUNDLE__': built.outputFiles[0].text.replaceAll('</script', '<\\/script'),
})) {
  assert.equal(html.split(marker).length, 2, `Missing/duplicated ${marker}`);
  html = html.replace(marker, () => value);
}
fs.mkdirSync(out, {recursive: true});
fs.writeFileSync(path.join(out, 'index.html'), html);
const info = {scope: 'Research-only comparison; not a delivered fix or game integration.',
  modelSha256: hash(glb), deliveredViewerSha256: hash(fs.readFileSync(sourceHtml)),
  candidateControllerSha256: hash(fs.readFileSync(candidate)), htmlSha256: hash(Buffer.from(html))};
fs.writeFileSync(path.join(out, 'build-info.json'), JSON.stringify(info, null, 2) + '\n');
fs.writeFileSync(path.join(out, 'EXPERIMENT.txt'), 'Research only. This is not the previous delivered trial and is not an approved fix.\n');
console.log(`Built experimental viewer ${out} using unchanged model ${info.modelSha256}.`);
