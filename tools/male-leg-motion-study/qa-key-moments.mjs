// Focused comparison of the actual delivered viewer and the scratch research
// viewer. A second finite difference is a change in consecutive 16 ms
// displacements, not an instantaneous jump or a general realism score.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '../..');
const candidate = path.resolve(process.argv[2] || '/dev/shm/bow-leg-motion-candidate');
const reportPath = process.argv[3] ? path.resolve(process.argv[3]) : null;
if (process.argv.length > 4) throw Error('Usage: node qa-key-moments.mjs [candidate-directory] [report.json]');
const ownReport = path.join(repo, 'work/male-leg-motion-study');
if (reportPath && (reportPath === repo || (reportPath.startsWith(repo + path.sep) && !reportPath.startsWith(ownReport + path.sep))))
  throw Error('Do not overwrite an unrelated repository file');
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core'), chromium = require('@sparticuz/chromium').default;
const browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(), headless: 'shell',
  args: [...chromium.args, '--allow-file-access-from-files', '--disable-dev-shm-usage'], protocolTimeout: 120000});
const files = {delivered: path.join(repo, 'work/male-leg-volume/index.html'), candidate: path.join(candidate, 'index.html')};
async function sample(file) {
  const page = await browser.newPage(), errors = [];
  try {
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setOfflineMode(true); await page.goto(pathToFileURL(file).href, {waitUntil: 'load', timeout: 60000});
    await page.waitForFunction('window.uphillDemo?.state.ready === true', {timeout: 60000});
    const rows = await page.evaluate(() => {
      const d = uphillDemo; d.setManual(true);
      const c = d.controller, mesh = d.model.getObjectByName('NewBody'), knee = d.model.getObjectByName('Rig_Shin_R');
      const V = d.camera.position.constructor, h = .016;
      const definitions = [
        {name: 'flat15phase', grade: 0, t: .219},
        {name: 'uphill15_release', grade: 15, t: .219},
        {name: 'uphill20_release', grade: 20, t: .212},
        {name: 'uphill20_lateral', grade: 20, t: .564},
        {name: 'route15_release', grade: 15, t: .952, route: true},
      ];
      function snapshot(def, t) {
        d.terrain.setAngle(def.grade);
        const phase = (t / c.clock.runDuration) % 1, z = def.route ? -2.7 + 4.37 * t : 1.4;
        c.reset('run', phase, z); c.setVolumeEnabled(true);
        d.model.updateWorldMatrix(true, true); mesh.updateMatrixWorld(true); mesh.skeleton.update();
        const state = () => JSON.stringify([c.bones.map(b => b.quaternion.toArray()), d.actor.position.toArray(), c.clock.phase, c.clock.weight]);
        const bonesBefore = state(), p = knee.getWorldPosition(new V()).sub(d.actor.position).toArray();
        c.setVolumeEnabled(false); const without = mesh.localToWorld(mesh.getVertexPosition(3224, new V())).sub(d.actor.position).toArray();
        c.setVolumeEnabled(true); const withMorph = mesh.localToWorld(mesh.getVertexPosition(3224, new V())).sub(d.actor.position).toArray();
        return {t, phase: c.clock.phase, z, knee: p, vertexWithout: without, vertexWith: withMorph,
          stateUnaffectedByToggle: state() === bonesBefore, reachShift: c.stats.maxReachShift, morph: [...mesh.morphTargetInfluences]};
      }
      return Object.fromEntries(definitions.map(def => [def.name, [def.t - h, def.t, def.t + h].map(t => snapshot(def, t))]));
    });
    assert.deepEqual(errors, [], errors.join('\n')); return rows;
  } finally { await page.close(); }
}
try {
  const delivered = await sample(files.delivered), candidateRows = await sample(files.candidate);
  const norm = a => Math.hypot(...a);
  const second = (states, field) => states[0][field].map((v, k) => 1000 * (states[2][field][k] - 2 * states[1][field][k] + v));
  const details = {};
  for (const name of Object.keys(delivered)) {
    details[name] = {};
    for (const [label, rows] of [['delivered', delivered[name]], ['candidate', candidateRows[name]]]) {
      assert.ok(rows.every(r => r.stateUnaffectedByToggle), `${name}: volume toggle changed the bones/clock`);
      const knee = second(rows, 'knee'), before = second(rows, 'vertexWithout'), after = second(rows, 'vertexWith');
      details[name][label] = {phase: rows[1].phase, z: rows[1].z, reachShiftMm: rows[1].reachShift * 1000,
        kneeSecondDifferenceMm: norm(knee), kneeSecondDifferenceVectorMm: knee,
        vertexWithoutVolumeMm: norm(before), vertexWithVolumeMm: norm(after),
        morphContributionMm: norm(after.map((v, k) => v - before[k])), morphWeight: rows[1].morph[1]};
    }
  }
  const flat = details.flat15phase;
  assert.ok(Math.abs(flat.delivered.kneeSecondDifferenceMm - flat.candidate.kneeSecondDifferenceMm) < 1e-6);
  assert.ok(details.uphill15_release.delivered.kneeSecondDifferenceMm > 75 && details.uphill15_release.candidate.kneeSecondDifferenceMm < 25);
  assert.ok(details.uphill20_lateral.delivered.kneeSecondDifferenceMm > 50 && details.uphill20_lateral.candidate.kneeSecondDifferenceMm < 25);
  const report = {method: 'Actor-relative knee and selected material vertex; magnitude of difference between consecutive 16 ms displacement vectors, in mm. Volume switch is sampled at exactly the same pose; not a physical jump, acceleration in SI units, or a realism score.',
    dtSeconds: .016, vertexId: 3224, details,
    limitations: 'These selected instants do not establish the absence of other abrupt motion, ground sliding, collisions or perceptual artefacts.'};
  for (const [name, row] of Object.entries(details)) console.log(`${name}: knee old/new ${row.delivered.kneeSecondDifferenceMm.toFixed(2)}/${row.candidate.kneeSecondDifferenceMm.toFixed(2)} mm; vertex old without/with volume ${row.delivered.vertexWithoutVolumeMm.toFixed(2)}/${row.delivered.vertexWithVolumeMm.toFixed(2)} mm.`);
  if (reportPath) { fs.mkdirSync(path.dirname(reportPath), {recursive: true}); fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n'); }
  console.log('PASS key-moment checks. Research result is partial; the delivered trial was not modified.');
} finally { await browser.close(); }
