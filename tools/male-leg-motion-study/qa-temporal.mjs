// Compare knee trajectory curvature along complete routes and reversible
// walk/run transitions. A finite second difference is not a realism score.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '../..');
const candidate = path.resolve(process.argv[2] || '/dev/shm/bow-leg-motion-candidate');
const reportPath = process.argv[3] ? path.resolve(process.argv[3]) : null;
if (process.argv.length > 4) throw Error('Usage: node qa-temporal.mjs [candidate-directory] [report.json]');
const ownReport = path.join(repo, 'work/male-leg-motion-study');
if (reportPath && (reportPath === repo || (reportPath.startsWith(repo + path.sep) && !reportPath.startsWith(ownReport + path.sep))))
  throw Error('Do not overwrite an unrelated repository file');
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core'), chromium = require('@sparticuz/chromium').default;
const browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(), headless: 'shell',
  args: [...chromium.args, '--allow-file-access-from-files', '--disable-dev-shm-usage'], protocolTimeout: 300000});
async function sample(file) {
  const page = await browser.newPage(), errors = [];
  try {
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setOfflineMode(true); await page.goto(pathToFileURL(file).href, {waitUntil: 'load', timeout: 60000});
    await page.waitForFunction('window.uphillDemo?.state.ready === true', {timeout: 60000});
    const rows = await page.evaluate(() => {
      const d = uphillDemo; d.setManual(true);
      const c = d.controller, V = d.camera.position.constructor;
      const knees = ['Rig_Shin_L', 'Rig_Shin_R'].map(n => d.model.getObjectByName(n));
      const pose = () => knees.map(b => b.getWorldPosition(new V()).sub(d.actor.position).toArray());
      const second = (a, b, c) => a.map((q, j) => Math.hypot(...q.map((v, k) => v - 2 * b[j][k] + c[j][k])));
      const out = [];
      function run(grade, mode, phase, z, scenario) {
        d.terrain.setAngle(grade); c.reset(mode, phase, z);
        const other = mode === 'walk' ? 'run' : 'walk'; if (scenario === 'reversal') c.setTarget(other);
        let prevprev = null, prev = pose(), max = 0, record = null, minGap = Infinity, steps = 0;
        while (steps < (scenario === 'route' ? 600 : 70) && (scenario !== 'route' || d.actor.position.z < 6.6)) {
          steps++; if (scenario === 'reversal' && steps === 13) c.setTarget(mode);
          if (scenario === 'reversal' && steps === 25) c.setTarget(other);
          c.step(.016); const now = pose(), stats = c.stats; minGap = Math.min(minGap, stats.correctedGap);
          if (prevprev) {
            const values = second(prevprev, prev, now), j = values.indexOf(Math.max(...values));
            if (values[j] > max) {
              max = values[j]; record = {t: steps * .016, phase: c.clock.phase, weight: c.clock.weight,
                z: d.actor.position.z, joint: j ? 'R' : 'L', shift: stats.maxReachShift, lift: stats.lift};
            }
          }
          prevprev = prev; prev = now;
        }
        if (scenario === 'route' && d.actor.position.z < 6.6) throw Error('Route did not finish');
        out.push({grade, mode, phase, z, scenario, max, minGap, steps, record});
      }
      for (const grade of [0, 5, 10, 15, 17.5, 20]) for (const mode of ['walk', 'run'])
        for (const phase of [0, .13, .37, .72]) run(grade, mode, phase, -2.7, 'route');
      for (const grade of [0, 5, 10, 15, 17.5, 20]) for (const mode of ['walk', 'run'])
        for (const z of [-1.55, -.7, 1.4, 4.9, 5.5]) for (let k = 0; k < 8; k++)
          run(grade, mode, (k + .37) / 8, z, 'reversal');
      return out;
    });
    assert.deepEqual(errors, [], errors.join('\n')); return rows;
  } finally { await page.close(); }
}
try {
  const old = await sample(path.join(repo, 'work/male-leg-volume/index.html'));
  const next = await sample(path.join(candidate, 'index.html'));
  assert.equal(old.length, 528); assert.equal(next.length, old.length);
  const cases = old.map((a, i) => {
    const b = next[i];
    for (const field of ['scenario', 'grade', 'mode', 'phase', 'z', 'steps']) assert.equal(a[field], b[field], `Mismatch ${field}`);
    assert.ok(a.minGap >= .0009 && b.minGap >= .0009, 'Selected sole sampler fell below minimum gap');
    return {old: a, candidate: b, differenceMm: (b.max - a.max) * 1000};
  });
  const gradeRows = [];
  for (const scenario of ['route', 'reversal']) for (const grade of [0, 5, 10, 15, 17.5, 20]) {
    const subset = cases.filter(x => x.old.scenario === scenario && x.old.grade === grade);
    const delta = subset.map(x => x.differenceMm).sort((a, b) => a - b), median = (delta[(delta.length - 1) >> 1] + delta[delta.length >> 1]) / 2;
    const row = {scenario, grade, cases: subset.length, oldMaxMm: Math.max(...subset.map(x => x.old.max)) * 1000,
      candidateMaxMm: Math.max(...subset.map(x => x.candidate.max)) * 1000, medianChangeMm: median,
      worstIncreaseMm: delta.at(-1), improvedOver5mm: delta.filter(x => x < -5).length, worsenedOver5mm: delta.filter(x => x > 5).length};
    if (grade === 0) assert.ok(Math.max(...delta.map(Math.abs)) < 1e-6, 'Flat-ground behavior changed');
    gradeRows.push(row);
    console.log(`${scenario} ${grade}° (${row.cases}): max old/new ${row.oldMaxMm.toFixed(2)}/${row.candidateMaxMm.toFixed(2)} mm; cases improved/worsened >5 mm ${row.improvedOver5mm}/${row.worsenedOver5mm}.`);
  }
  const route15 = gradeRows.find(r => r.scenario === 'route' && r.grade === 15);
  assert.ok(route15.candidateMaxMm < route15.oldMaxMm - 10, 'Expected sampled 15° route improvement');
  const regressions = cases.slice().sort((a, b) => b.differenceMm - a.differenceMm).slice(0, 5).map(x => ({
    grade: x.old.grade, scenario: x.old.scenario, mode: x.old.mode, startPhase: x.old.phase, startZ: x.old.z,
    oldMaxMm: x.old.max * 1000, candidateMaxMm: x.candidate.max * 1000, differenceMm: x.differenceMm, candidateMoment: x.candidate.record,
  }));
  const report = {method: 'Actor-relative knee: maximum magnitude of change between successive 16 ms displacement vectors in each sampled trajectory. Not an instantaneous jump, anatomical acceleration, or a complete visual-quality score.',
    timeStepSeconds: .016, cases: cases.length, gradeRows, regressions,
    limitations: 'Finite test course, motions and starting phases only. Each row reports the maximum for a case, which may occur at different moments. Candidate changes the stride and does not lock feet.'};
  if (reportPath) { fs.mkdirSync(path.dirname(reportPath), {recursive: true}); fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n'); }
  console.log(`Largest case-level increase: +${regressions[0].differenceMm.toFixed(2)} mm (${regressions[0].scenario}, ${regressions[0].grade}°); do not treat the experiment as a complete fix.`);
} finally { await browser.close(); }
