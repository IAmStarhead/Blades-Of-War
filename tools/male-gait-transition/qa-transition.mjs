// Exercise the actual bundled viewer and actual GLB, not a surrogate skeleton.
// Results are sampled proxies, not proof of natural motion or zero collisions.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = path.resolve(process.argv[2] || path.join(repo, 'work/male-gait-transition'));
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core'), chromium = require('@sparticuz/chromium').default;
const browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(), headless: 'shell',
  args: [...chromium.args, '--allow-file-access-from-files', '--disable-dev-shm-usage'], protocolTimeout: 300000});
try {
  const errors = [], page = await browser.newPage(), baseline = await browser.newPage();
  for (const p of [page, baseline]) {
    p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await p.setViewport({width: 1280, height: 900, deviceScaleFactor: 1}); await p.setOfflineMode(true);
  }
  await page.goto(pathToFileURL(path.join(folder, 'index.html')).href, {waitUntil: 'load', timeout: 60000});
  await baseline.goto(pathToFileURL(path.join(repo, 'work/male-hand-flight/index.html')).href, {waitUntil: 'load', timeout: 60000});
  await page.waitForFunction('window.transitionDemo?.state.ready === true', {timeout: 60000});
  await baseline.waitForFunction('window.motionFit?.state.ready === true', {timeout: 60000});
  const reference = await baseline.evaluate(() => {
    const d = motionFit, result = {};
    for (const mode of ['walk', 'run']) {
      d.setMotion(mode); d.setPlaying(false); result[mode] = [];
      for (let i = 0; i < 65; i++) {
        const phase = i === 64 ? 1 : (i + .37) / 64;
        const p = mode === 'run' ? ((phase - 3 / 32) % 1 + 1) % 1 : phase;
        d.setPhase(p); d.model.updateMatrixWorld(true);
        const bones = []; d.rig.traverse(o => { if (o.isBone) bones.push({name: o.name, p: o.position.toArray(), q: o.quaternion.toArray(), s: o.scale.toArray()}); });
        result[mode].push(bones);
      }
    }
    return result;
  });
  const endpoints = await page.evaluate(() => {
    const d = transitionDemo, result = {}; d.setManual(true);
    for (const mode of ['walk', 'run']) {
      result[mode] = [];
      for (let i = 0; i < 65; i++) {
        const phase = i === 64 ? 1 : (i + .37) / 64;
        d.reset(mode, phase); d.model.updateWorldMatrix(true, true);
        const bones = []; d.rig.traverse(o => { if (o.isBone) bones.push({name: o.name, p: o.position.toArray(), q: o.quaternion.toArray(), s: o.scale.toArray()}); });
        result[mode].push({bones, lift: d.locomotion.floor.lift});
      }
    }
    return result;
  });
  let maxPosition = 0, maxQuaternion = 0, maxScale = 0, endpointLift = 0;
  const dist = (a, b, sign = 1) => Math.hypot(...a.map((x, i) => x - sign * b[i]));
  for (const mode of ['walk', 'run']) for (let i = 0; i < reference[mode].length; i++) {
    const original = reference[mode][i], current = endpoints[mode][i].bones;
    endpointLift = Math.max(endpointLift, endpoints[mode][i].lift); assert.equal(current.length, original.length);
    for (let j = 0; j < original.length; j++) {
      assert.equal(original[j].name, current[j].name);
      maxPosition = Math.max(maxPosition, dist(original[j].p, current[j].p));
      maxQuaternion = Math.max(maxQuaternion, Math.min(dist(original[j].q, current[j].q), dist(original[j].q, current[j].q, -1)));
      maxScale = Math.max(maxScale, dist(original[j].s, current[j].s));
    }
  }
  assert.ok(maxPosition < 1e-6 && maxQuaternion < 1e-6 && maxScale < 1e-6 && endpointLift === 0,
    `source endpoints differ: ${JSON.stringify({maxPosition, maxQuaternion, maxScale, endpointLift})}`);
  await baseline.close();
  console.log(`PASS 130 settled endpoint poses match the previous viewer's bones; max position ${maxPosition.toExponential(2)} m, quaternion component distance ${maxQuaternion.toExponential(2)}; no lift.`);

  const data = await page.evaluate(() => {
    const d = transitionDemo, L = d.locomotion, mesh = d.model.getObjectByName('NewBody');
    const attribute = mesh.geometry.attributes.position, sole = [];
    for (let i = 0; i < attribute.count; i++) {
      const x = attribute.getX(i), y = attribute.getY(i);
      if (y < .16 && Math.abs(x) > .035 && Math.abs(x) < .25) sole.push(i);
    }
    const V = d.camera.position.constructor, Q = d.camera.quaternion.constructor, point = new V();
    function actualLowest() {
      d.model.updateWorldMatrix(true, true); mesh.skeleton.update(); let low = Infinity;
      for (const i of sole) { mesh.getVertexPosition(i, point); mesh.localToWorld(point); low = Math.min(low, point.y); }
      return low;
    }
    const names = ['Rig_Hips', 'Rig_Chest', 'Rig_Thigh_L', 'Rig_Shin_L', 'Rig_Foot_L', 'Rig_Thigh_R', 'Rig_Shin_R', 'Rig_Foot_R', 'Rig_Hand_L', 'Rig_Hand_R'];
    function pose() {
      d.model.updateWorldMatrix(true, true);
      return names.map(name => { const b = d.rig.getObjectByName(name); return {p: b.getWorldPosition(new V()).toArray(), q: b.getWorldQuaternion(new Q()).toArray()}; });
    }
    const vdist = (a, b) => Math.hypot(...a.map((x, i) => x - b[i]));
    const qangle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.reduce((s, x, i) => s + x * b[i], 0)) / (Math.hypot(...a) * Math.hypot(...b))));
    function change(a, b) {
      let position = 0, angle = 0;
      for (let j = 0; j < a.length; j++) { position = Math.max(position, vdist(a[j].p, b[j].p)); angle = Math.max(angle, qangle(a[j].q, b[j].q)); }
      return {position, angle};
    }
    const grid = {rawMin: Infinity, protectedMin: Infinity, maxLift: 0, endpointLift: 0, actualError: 0, worst: null, count: 0};
    // Sample phase/weight space, including points not necessarily visited by
    // a simple one-shot transition. Independently check selected vertices.
    for (let i = 0; i < 512; i++) for (let j = 0; j <= 10; j++) {
      d.clock.phase = (i + .37) / 512; d.clock.weight = j / 10; d.clock.velocity = 0;
      L.apply(); const f = L.floor, corrected = f.minimumBefore + f.lift;
      grid.count++; grid.rawMin = Math.min(grid.rawMin, f.minimumBefore); grid.protectedMin = Math.min(grid.protectedMin, corrected);
      if (f.lift > grid.maxLift) { grid.maxLift = f.lift; grid.worst = {phase: d.clock.phase, weight: d.clock.weight}; }
      if (j === 0 || j === 10) grid.endpointLift = Math.max(grid.endpointLift, f.lift);
      if ((i % 64 === 0) && (j % 2 === 0)) grid.actualError = Math.max(grid.actualError, Math.abs(actualLowest() - corrected));
    }
    // Reapplying the identical guarded pose must not accumulate root height.
    d.clock.phase = grid.worst.phase; d.clock.weight = grid.worst.weight; L.apply();
    const repeated = pose(), root = d.rig.position.clone();
    for (let i = 0; i < 20; i++) L.apply();
    const repeat = change(repeated, pose()); repeat.root = root.distanceTo(d.rig.position);
    const trajectories = {maxPosition: 0, maxAngle: 0, maxLiftDelta: 0, minFloor: Infinity, maxLift: 0, cases: 0, actualError: 0};
    const click = {position: 0, angle: 0, phase: 0, weight: 0, velocity: 0, distance: 0, grid: 0, count: 0};
    for (const mode of ['walk', 'run']) for (let k = 0; k < 16; k++) {
      d.reset(mode, (k + .37) / 16); const target = mode === 'walk' ? 'run' : 'walk';
      const before = pose(), snapshot = {phase: d.clock.phase, weight: d.clock.weight, velocity: d.clock.velocity, distance: d.clock.distance, grid: d.floorTexture.offset.y};
      d.setTarget(target); const instant = change(before, pose()); click.position = Math.max(click.position, instant.position); click.angle = Math.max(click.angle, instant.angle);
      for (const field of ['phase', 'weight', 'velocity', 'distance']) click[field] = Math.max(click[field], Math.abs(snapshot[field] - d.clock[field]));
      click.grid = Math.max(click.grid, Math.abs(snapshot.grid - d.floorTexture.offset.y)); click.count++;
      let prev = before, prevLift = L.floor.lift;
      for (let j = 0; j < 130; j++) {
        d.step(.01); const current = pose(), delta = change(prev, current), f = L.floor;
        trajectories.maxPosition = Math.max(trajectories.maxPosition, delta.position); trajectories.maxAngle = Math.max(trajectories.maxAngle, delta.angle);
        trajectories.maxLiftDelta = Math.max(trajectories.maxLiftDelta, Math.abs(f.lift - prevLift));
        trajectories.minFloor = Math.min(trajectories.minFloor, f.minimumBefore + f.lift); trajectories.maxLift = Math.max(trajectories.maxLift, f.lift);
        if (k % 4 === 0 && j % 20 === 0) trajectories.actualError = Math.max(trajectories.actualError, Math.abs(actualLowest() - (f.minimumBefore + f.lift)));
        prev = current; prevLift = f.lift;
      }
      trajectories.cases++;
    }
    const steady = {maxPosition: 0, maxAngle: 0};
    for (const mode of ['walk', 'run']) for (let k = 0; k < 4; k++) {
      d.reset(mode, (k + .37) / 4); let prev = pose();
      for (let j = 0; j < 130; j++) {
        d.step(.01); const current = pose(), delta = change(prev, current);
        steady.maxPosition = Math.max(steady.maxPosition, delta.position); steady.maxAngle = Math.max(steady.maxAngle, delta.angle); prev = current;
      }
    }
    const reverse = {position: 0, angle: 0, phase: 0, weight: 0, velocity: 0, distance: 0, grid: 0, count: 0, continuedVelocity: false};
    for (const mode of ['walk', 'run']) for (let k = 0; k < 16; k++) for (const delay of [.05, .15, .3, .5]) {
      d.reset(mode, (k + .61) / 16); d.setTarget(mode === 'walk' ? 'run' : 'walk');
      d.step(delay); const before = pose(), snapshot = {phase: d.clock.phase, weight: d.clock.weight, velocity: d.clock.velocity, distance: d.clock.distance, grid: d.floorTexture.offset.y};
      d.setTarget(mode); const delta = change(before, pose()); reverse.position = Math.max(reverse.position, delta.position); reverse.angle = Math.max(reverse.angle, delta.angle);
      for (const field of ['phase', 'weight', 'velocity', 'distance']) reverse[field] = Math.max(reverse[field], Math.abs(snapshot[field] - d.clock[field]));
      reverse.grid = Math.max(reverse.grid, Math.abs(snapshot.grid - d.floorTexture.offset.y)); reverse.count++;
      if (Math.abs(d.clock.velocity) > .01) reverse.continuedVelocity = true;
      d.step(.7); if (Math.abs(d.clock.weight - (mode === 'run' ? 1 : 0)) > .01) throw Error('Reversal did not approach target');
    }
    return {sole: sole.length, guardVertices: L.guard.vertices, grid, repeat, trajectories, steady, click, reverse};
  });
  assert.ok(data.sole > 2000 && data.sole === data.guardVertices);
  assert.ok(data.grid.rawMin < 0, 'test did not exercise floor guard');
  assert.ok(data.grid.protectedMin >= .0009 && data.grid.maxLift < .012 && data.grid.endpointLift === 0 && data.grid.actualError < 1e-5, `grid floor ${JSON.stringify(data.grid)}`);
  assert.ok(data.repeat.position < 1e-9 && data.repeat.root < 1e-9 && data.repeat.angle < 1e-6, `repeat pose ${JSON.stringify(data.repeat)}`);
  assert.ok(data.trajectories.minFloor >= .0009 && data.trajectories.maxLift < .012 && data.trajectories.actualError < 1e-5,
    `trajectory floor ${JSON.stringify(data.trajectories)}`);
  assert.ok(data.trajectories.maxPosition < .09 && data.trajectories.maxAngle < .6 && data.trajectories.maxLiftDelta < .003,
    `10ms trajectory steps too large: ${JSON.stringify(data.trajectories)}`);
  assert.ok(data.trajectories.maxPosition < 1.2 * data.steady.maxPosition && data.trajectories.maxAngle < 1.2 * data.steady.maxAngle,
    'sampled transition joint steps unexpectedly exceed sampled steady motion');
  for (const test of [data.click, data.reverse]) {
    assert.ok(test.position < 1e-9 && test.angle < 1e-6 && test.phase === 0 && test.weight === 0 && test.velocity === 0 && test.distance === 0 && test.grid === 0, `switch discontinuity ${JSON.stringify(test)}`);
  }
  assert.ok(data.reverse.continuedVelocity);
  assert.deepEqual(errors, [], errors.join('\n'));
  console.log(`PASS ${data.grid.count} phase/weight poses, ${data.trajectories.cases} transitions and ${data.reverse.count} mid-transition reversals; ${data.sole} selected sole vertices.`);
  console.log(`Grid raw minimum ${(data.grid.rawMin * 1000).toFixed(2)} mm, protected minimum ${(data.grid.protectedMin * 1000).toFixed(2)} mm, max lift ${(data.grid.maxLift * 1000).toFixed(2)} mm, independent skinning error ${(data.grid.actualError * 1000).toFixed(4)} mm.`);
  console.log(`Trajectory max 10ms joint displacement ${(data.trajectories.maxPosition * 1000).toFixed(2)} mm, world rotation ${(data.trajectories.maxAngle * 180 / Math.PI).toFixed(2)}°, lift change ${(data.trajectories.maxLiftDelta * 1000).toFixed(2)} mm.`);
  console.log(`For context, sampled steady clips: max 10ms joint displacement ${(data.steady.maxPosition * 1000).toFixed(2)} mm, world rotation ${(data.steady.maxAngle * 180 / Math.PI).toFixed(2)}°.`);
  console.log('PASS unchanged pose/clock/velocity/grid at target and reversal; repeated guarded sample does not accumulate.');
  console.log('NOTE: these finite samples do not establish foot lock, all-time clearance, collision absence or artistic quality.');
} finally { await browser.close(); }
