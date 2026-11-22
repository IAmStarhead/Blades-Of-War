// Reproducible *proximity* scan, not a foot-contact or sliding detector.
// Samples individual skinned vertices in the delivered viewer on flat ground.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (process.argv.length > 3) throw Error('Usage: node scan-flat.mjs [new-report.json]');
const output = process.argv[2] ? path.resolve(process.argv[2]) : null;
const own = path.join(repo, 'work/male-human-gait-study') + path.sep;
if (output && output.startsWith(repo + path.sep) && !output.startsWith(own)) throw Error('Do not modify another delivery');
if (output && fs.existsSync(output)) throw Error('Report must be a new file');
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core'), chromium = require('@sparticuz/chromium').default;
const browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(), headless: 'shell',
  args: [...chromium.args, '--allow-file-access-from-files', '--disable-dev-shm-usage'], protocolTimeout: 300000});
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setOfflineMode(true);
  await page.goto(pathToFileURL(path.join(repo, 'work/male-leg-volume/index.html')).href, {waitUntil: 'load', timeout: 60000});
  await page.waitForFunction('window.uphillDemo?.state.ready === true', {timeout: 60000});
  const data = await page.evaluate(() => {
    const d = window.uphillDemo; d.setManual(true); d.setAngle(0);
    const c = d.controller, mesh = d.model.getObjectByName('NewBody'), V = d.camera.position.constructor;
    const positions = mesh.geometry.getAttribute('position'), ids = {L: [], R: []};
    // Select vertices in each foot using their rest-space coordinates. These
    // include the feet, not a verified force-bearing contact patch.
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i);
      if (y < .16 && Math.abs(x) > .035 && Math.abs(x) < .25) ids[x > 0 ? 'L' : 'R'].push(i);
    }
    const out = {method: '120 Hz, two flat gait cycles. A surface sample is only near ground, not proof of physical foot contact. A point at or below the tolerance can move as the foot rolls.',
      sampleHz: 120, pointCounts: {L: ids.L.length, R: ids.R.length}, modes: {}};
    for (const mode of ['walk', 'run']) {
      c.reset(mode, 0, -2.0);
      const duration = mode === 'walk' ? c.clock.walkDuration : c.clock.runDuration, speed = c.clock.speed;
      const states = [], tracks = Object.fromEntries(['L', 'R'].map(side => [side, ids[side].map(id => ({id, ys: [], zs: []}))]));
      for (let j = 0; j <= Math.ceil(duration * 2 * 120); j++) {
        const t = j / 120, phase = (t / duration) % 1, z = -2 + speed * t;
        c.reset(mode, phase, z); c.setVolumeEnabled(true);
        d.model.updateWorldMatrix(true, true); mesh.updateMatrixWorld(true); mesh.skeleton.update();
        for (const side of ['L', 'R']) for (const track of tracks[side]) {
          const p = mesh.localToWorld(mesh.getVertexPosition(track.id, new V()));
          track.ys.push(p.y); track.zs.push(p.z);
        }
        states.push({t, phase, z, lift: c.stats.lift,
          gaps: {L: c.stats.fitted.L.gap + c.stats.lift, R: c.stats.fitted.R.gap + c.stats.lift}});
      }
      const near = {};
      for (const threshold of [.005, .010, .012, .020]) {
        const candidates = [];
        for (const side of ['L', 'R']) for (const track of tracks[side]) {
          let start = -1;
          const finish = end => {
            if (start < 0 || end - start < 6) return;
            const zs = track.zs.slice(start, end + 1), ys = track.ys.slice(start, end + 1);
            candidates.push({side, id: track.id, startFrame: start, endFrame: end, startTime: start / 120, endTime: end / 120,
              duration: (end - start) / 120, startPhase: states[start].phase, endPhase: states[end].phase,
              zRangeMm: 1000 * (Math.max(...zs) - Math.min(...zs)), zNetMm: 1000 * (zs.at(-1) - zs[0]),
              yMinMm: 1000 * Math.min(...ys), yMaxMm: 1000 * Math.max(...ys)});
          };
          for (let j = 0; j < track.ys.length; j++) {
            if (track.ys[j] <= threshold) { if (start < 0) start = j; }
            else { finish(j - 1); start = -1; }
          }
          finish(track.ys.length - 1);
        }
        candidates.sort((a, b) => b.zRangeMm - a.zRangeMm);
        near[threshold] = {candidateCount: candidates.length, top: candidates.slice(0, 5)};
      }
      out.modes[mode] = {duration, speed, cadenceStepsPerMinute: 120 / duration, near, states};
    }
    return out;
  });
  assert.deepEqual(errors, [], errors.join('\n'));
  assert.ok(data.pointCounts.L > 100 && data.pointCounts.R > 100);
  for (const [mode, row] of Object.entries(data.modes)) {
    console.log(`${mode}: cycle ${row.duration.toFixed(6)} s, speed ${row.speed} m/s; sampled ${data.pointCounts.L}+${data.pointCounts.R} foot vertices`);
    for (const [threshold, entry] of Object.entries(row.near)) {
      console.log(`  height <= ${threshold} m; representative candidate:`, entry.top[0]);
    }
  }
  if (output) { fs.mkdirSync(path.dirname(output), {recursive: true}); fs.writeFileSync(output, JSON.stringify(data, null, 2) + '\n', {flag: 'wx'}); }
  console.log('NOTE: near-ground motion is not evidence of contact or actual slipping.');
} finally { await browser.close(); }
