// Build a single-file offline source-motion viewer. The project's character is
// deliberately not an input. Run from the repository root with Node 22.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {BVHLoader} from '../male-library-motion/node_modules/three/examples/jsm/loaders/BVHLoader.js';
import {AnimationMixer, Vector3} from '../male-library-motion/node_modules/three/build/three.module.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, '../..');
const output = path.resolve(process.argv[2] || path.join(repo, 'work/male-motion-candidates'));
const require = createRequire(path.join(repo, 'tools/male-library-motion/package.json'));
const esbuild = require('esbuild');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const config = JSON.parse(fs.readFileSync(path.join(dir, 'candidates.json'), 'utf8'));
const sources = {};
const loader = new BVHLoader();
const manifest = {scope: 'Source-only motion review; no project-character retarget.', sourceMirror: 'https://github.com/rywible/wrela/tree/3dd01b4ef0d1b28848c5020afff1bf66fed0f2eb/content/humanoid/assets', candidates: {walk: [], run: []}};

for (const [mode, entries] of Object.entries(config)) {
  assert.equal(entries.length, 3);
  for (const candidate of entries) {
    const bytes = fs.readFileSync(path.join(dir, 'sources', candidate.id + '.bvh'));
    assert.equal(hash(bytes), candidate.sha256, `Source changed: ${candidate.id}`);
    sources[candidate.id] = bytes.toString('utf8');
    const {skeleton, clip} = loader.parse(sources[candidate.id]);
    const root = skeleton.bones[0];
    const track = clip.tracks.find(t => t.name === 'Hips.position');
    assert.ok(track && root.name === 'Hips');
    const times = track.times, values = track.values, a = candidate.startFrame, b = candidate.endFrame;
    assert.ok(a >= 0 && b > a && b < times.length - 1, `Window outside source: ${candidate.id}`);
    assert.ok(Math.abs(1 / times[1] - candidate.frameRate) < .002, `Unexpected rate: ${candidate.id}`);
    const start = times[a], end = times[b], duration = end - start;
    const dx = values[b * 3] - values[a * 3], dz = values[b * 3 + 2] - values[a * 3 + 2];
    const heading = Math.atan2(dx, dz), speed = Math.hypot(dx, dz) * .01 / duration;
    const mixer = new AnimationMixer(root), action = mixer.clipAction(clip).play();
    action.paused = true;
    const map = new Map(skeleton.bones.map(bone => [bone.name, bone]));
    const footSuffix = candidate.id.startsWith('neutral_') ? ['Ankle', 'Toe'] : ['Foot', 'ToeBase'];
    const v = new Vector3();
    let floorCm = Infinity, highestLowestCm = -Infinity;
    function sample(time) {
      action.time = time; mixer.update(0);
      root.position.x = 0; root.position.z = 0;
      root.updateMatrixWorld(true);
    }
    for (let i = a; i <= b; i++) {
      sample(times[i]);
      let low = Infinity;
      for (const side of ['Left', 'Right']) {
        const ankle = map.get(side + footSuffix[0]), toe = map.get(side + footSuffix[1]);
        assert.ok(ankle && toe && toe.children[0]);
        for (const bone of [ankle, toe, toe.children[0]]) low = Math.min(low, bone.getWorldPosition(v).y);
      }
      floorCm = Math.min(floorCm, low);
      highestLowestCm = Math.max(highestLowestCm, low);
    }
    const snapshot = time => {
      sample(time);
      return Object.fromEntries(skeleton.bones.filter(bone => bone.name !== 'ENDSITE').map(bone => [bone.name, bone.getWorldPosition(v).toArray()]));
    };
    const first = snapshot(start), last = snapshot(end);
    const seam = Object.entries(first).map(([name, xyz]) => ({name, cm: Math.hypot(...xyz.map((value, i) => value - last[name][i]))})).sort((x, y) => y.cm - x.cm);
    const profile = {startFrame: a, endFrame: b, start, end, duration, heading, speed, floorCm};
    candidate.profile = profile;
    manifest.candidates[mode].push({
      id: candidate.id, letter: candidate.letter, sha256: candidate.sha256,
      frameRate: candidate.frameRate, sourceFrameCount: times.length,
      sourceFramesZeroBased: [a, b],
      originalDatasetFramesZeroBased: candidate.datasetStartFrame === undefined ? null : [a + candidate.datasetStartFrame, b + candidate.datasetStartFrame],
      durationSeconds: duration, averageHorizontalSpeedMetresPerSecond: speed,
      yawAlignmentRadians: -heading, floorCm,
      sampledMaxLowestFootPointCmAboveFloor: highestLowestCm - floorCm,
      unblendedLoopLargestNamedJointJumpCm: seam[0],
    });
  }
}
const built = await esbuild.build({
  entryPoints: [path.join(dir, 'viewer.mjs')],
  nodePaths: [path.join(repo, 'tools/male-library-motion/node_modules')],
  bundle: true, write: false, format: 'iife', target: 'es2020', minify: true,
  legalComments: 'none',
});
let template = fs.readFileSync(path.join(dir, 'viewer.template.html'), 'utf8');
const embedded = JSON.stringify({candidates: config, sources}).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
const code = built.outputFiles[0].text.replaceAll('</script', '<\\/script');
assert.equal(template.split('__MOTION_DATA__').length, 2);
assert.equal(template.split('__VIEWER_BUNDLE__').length, 2);
template = template.replace('__MOTION_DATA__', () => embedded).replace('__VIEWER_BUNDLE__', () => code);
fs.mkdirSync(output, {recursive: true});
fs.writeFileSync(path.join(output, 'index.html'), template);
fs.writeFileSync(path.join(output, 'build-info.json'), JSON.stringify(manifest, null, 2) + '\n');
for (const name of ['README.md', 'CREDITS.md']) fs.copyFileSync(path.join(dir, name), path.join(output, name));
fs.copyFileSync(path.join(repo, 'tools/male-library-motion/node_modules/three/LICENSE'), path.join(output, 'LICENSE_THREE.txt'));
console.log(`Built ${path.join(output, 'index.html')} (${template.length} characters)`);
for (const [mode, rows] of Object.entries(manifest.candidates)) for (const row of rows) {
  console.log(`${mode} ${row.letter} ${row.id}: ${row.durationSeconds.toFixed(3)} s, ${row.averageHorizontalSpeedMetresPerSecond.toFixed(2)} m/s, unblended max joint seam ${row.unblendedLoopLargestNamedJointJumpCm.cm.toFixed(2)} cm`);
}
