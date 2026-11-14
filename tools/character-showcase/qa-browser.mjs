// Headless browser regression for the self-contained HTML. An instrumented copy
// is made in a temporary directory; the deliverable itself is never modified.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const here = path.dirname(fileURLToPath(import.meta.url));
function option(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  if (!process.argv[index + 1] || process.argv[index + 1].startsWith('--')) throw new Error(`Missing value for ${name}`);
  return process.argv[index + 1];
}
const directory = path.resolve(option('--showcase', path.join(here, '../../work/character-showcase/prototype')));
const capture = option('--capture', null);
const shots = option('--shots', null);
if (shots) fs.mkdirSync(shots, { recursive: true });
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-showcase-qa-'));
let browser;
try {
  const html = fs.readFileSync(path.join(directory, 'BladesOfWar_Showcase.html'), 'utf8');
  const marker = 'window.preview = { male: maleChar.root, female: femaleChar.root, well: wellProp.group, state };';
  if (!html.includes(marker)) throw new Error('Could not instrument showcase: preview marker is missing.');
  const debugPath = path.join(temporary, 'showcase-debug.html');
  fs.writeFileSync(debugPath, html.replace(marker, 'window.qa = {scene,camera,controls,femaleChar,maleChar,renderer,state,studioFloor};\n' + marker));
  const executablePath = process.env.CHROME_BIN || await chromium.executablePath();
  browser = await puppeteer.launch({
    executablePath, headless: 'shell',
    args: [...chromium.args, '--allow-file-access-from-files', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1100, height: 850, deviceScaleFactor: 1 },
  });
  const page = await browser.newPage();
  const browserErrors = [];
  page.on('pageerror', error => browserErrors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('request', request => { if (/^https?:/i.test(request.url())) browserErrors.push(`Unexpected network request: ${request.url()}`); });
  await page.goto(pathToFileURL(debugPath).href, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction('window.ready === true', { timeout: 120000 });
  const smoke = await page.evaluate(() => {
    const click = (attr, val) => document.querySelector(`[data-${attr}="${val}"]`).click();
    const failures = [];
    let steps = 0;
    if (document.querySelector('#chkBlink').checked) document.querySelector('#chkBlink').click();
    window.qa.controls.enableDamping = false;
    for (const mode of ['eve', 'adam', 'pair', 'well']) {
      click('mode', mode);
      for (const race of ['zlato', 'khlad']) {
        click('race', race);
        const hands = mode === 'well' ? ['rest'] : ['rest', 'fist_l', 'fist_r', 'fist_both', 'guard'];
        for (const hand of hands) {
          if (mode !== 'well') click('hand', hand);
          const expressions = mode === 'well' ? ['neutral'] : ['neutral', 'smile', 'sad', 'angry'];
          for (const expression of expressions) {
            if (mode !== 'well') click('expr', expression);
            ++steps;
            const {state, femaleChar, maleChar} = window.qa;
            const label = `${mode}/${race}/${hand}/${expression}`;
            if (state.mode !== mode || state.race !== race || (mode !== 'well' && (state.hand !== hand || state.expr !== expression))) failures.push(`state: ${label}`);
            if (femaleChar.root.visible !== ['eve', 'pair'].includes(mode) || maleChar.root.visible !== ['adam', 'pair'].includes(mode) || window.preview.well.visible !== ['pair', 'well'].includes(mode)) failures.push(`visibility: ${label}`);
            for (const [character, scale] of [[femaleChar, 1.025], [maleChar, 1.04]]) {
              if (Math.abs(character.root.scale.x - (race === 'khlad' ? scale : 1)) > 1e-8) failures.push(`scale: ${label}`);
              if (character.skinMat.map !== (race === 'khlad' ? character.khladSkinTex : character.zlatoSkinTex)) failures.push(`skin texture: ${label}`);
              if (character.eyeMat.map !== (race === 'khlad' ? character.khladEyeTex : character.zlatoEyeTex)) failures.push(`eye texture: ${label}`);
              for (const [name, value] of [['race_khlad', race === 'khlad' ? 1 : 0], ['expr_smile', expression === 'smile' ? 1 : 0], ['expr_sad', expression === 'sad' ? 1 : 0], ['expr_angry', expression === 'angry' ? 1 : 0]]) {
                if (mode === 'well' && name !== 'race_khlad') continue;
                for (const mesh of character.skinnedMeshes) {
                  if (mesh.morphTargetInfluences && Math.abs(mesh.morphTargetInfluences[character.morphIdx[name]] - value) > 1e-6) failures.push(`morph ${mesh.name}/${name}: ${label}`);
                }
              }
              if (!Number.isFinite(character.root.position.y)) failures.push(`grounding: ${label}`);
            }
          }
        }
      }
    }
    for (const view of ['full', 'head', 'profile', 'hands', 'well']) {
      click('view', view);
      if (window.qa.state.view !== view) failures.push(`view: ${view}`);
    }
    for (const [id, name] of [['chkSpin', 'autoRotate'], ['chkBlink', 'autoBlink']]) {
      const box = document.querySelector(`#${id}`);
      box.click(); if (!window.qa.state[name]) failures.push(`${id} did not start`);
      box.click(); if (window.qa.state[name]) failures.push(`${id} did not stop`);
    }
    return {steps, failures};
  });
  console.log('UI combinations:', smoke.steps, 'failures:', smoke.failures.length);
  if (smoke.steps !== 122 || smoke.failures.length) throw new Error(JSON.stringify(smoke.failures));

  const stability = await page.evaluate(() => {
    const click = (attr, val) => document.querySelector(`[data-${attr}="${val}"]`).click();
    let cases = 0, maxDifference = 0, failures = [];
    function snapshot(c) {
      return [c.root.position.x, c.root.position.y, c.root.position.z, c.root.scale.x,
        ...Object.keys(c.boneMap).sort().flatMap(name => c.boneMap[name].quaternion.toArray())];
    }
    for (const mode of ['eve', 'adam']) for (const race of ['zlato', 'khlad']) for (const hand of ['rest', 'fist_both', 'guard']) {
      click('mode', mode); click('race', race); click('hand', hand);
      const c = mode === 'eve' ? window.qa.femaleChar : window.qa.maleChar;
      const initial = snapshot(c);
      for (let repeat = 0; repeat < 10; ++repeat) {
        click('hand', 'rest'); click('race', race === 'khlad' ? 'zlato' : 'khlad');
        click('hand', 'guard'); click('race', race); click('hand', hand);
      }
      const after = snapshot(c);
      const delta = Math.max(...after.map((n, i) => Math.abs(n - initial[i])));
      maxDifference = Math.max(maxDifference, delta); ++cases;
      if (delta > 1e-9) failures.push(`${mode}/${race}/${hand}: ${delta}`);
    }
    return {cases, maxDifference, failures};
  });
  console.log('Repeated-switch cases:', stability.cases, 'max component difference:', stability.maxDifference);
  if (stability.failures.length) throw new Error(JSON.stringify(stability.failures));

  // A camera preset is useful only if the selected hands actually fit on screen.
  // Check every UI hand mode, including the guard and the shared scene.
  async function checkHandFraming(viewport) {
    await page.setViewport(viewport);
    return page.evaluate(() => {
      const click = (attr, val) => document.querySelector(`[data-${attr}="${val}"]`).click();
      let cases = 0, worst = 0, failures = [];
      for (const mode of ['eve', 'adam', 'pair']) for (const race of ['zlato', 'khlad']) for (const hand of ['rest', 'fist_l', 'fist_r', 'fist_both', 'guard']) {
        click('mode', mode); click('race', race); click('hand', hand); click('view', 'hands');
        const sides = hand === 'fist_l' ? ['L'] : hand === 'fist_r' ? ['R'] : ['L', 'R'];
        const chars = mode === 'pair' ? [window.qa.femaleChar, window.qa.maleChar] : [mode === 'eve' ? window.qa.femaleChar : window.qa.maleChar];
        let count = 0, extreme = 0;
        window.qa.camera.updateMatrixWorld(true);
        for (const c of chars) {
          const mesh = c.bodyMesh, geom = mesh.geometry, index = geom.attributes.skinIndex, weight = geom.attributes.skinWeight;
          const selected = mesh.skeleton.bones.map(b => sides.some(s => b.name.endsWith('_' + s)) && /^(wrist|metacarpal|finger)/.test(b.name));
          const p = mesh.position.clone(); c.root.updateMatrixWorld(true); mesh.skeleton.update();
          for (let i = 0; i < geom.attributes.position.count; ++i) {
            let sum = 0;
            for (let k = 0; k < 4; ++k) if (selected[index.getComponent(i, k)]) sum += weight.getComponent(i, k);
            if (sum < .35) continue;
            mesh.getVertexPosition(i, p); mesh.localToWorld(p); p.project(window.qa.camera);
            extreme = Math.max(extreme, Math.abs(p.x), Math.abs(p.y)); ++count;
          }
        }
        ++cases; worst = Math.max(worst, extreme);
        if (!count || extreme > .99) failures.push(`${mode}/${race}/${hand}: ${count} vertices, NDC ${extreme}`);
      }
      return {cases, worst, failures};
    });
  }
  for (const [label, viewport] of [
    ['desktop', {width: 1100, height: 850, deviceScaleFactor: 1}],
    ['mobile', {width: 390, height: 844, deviceScaleFactor: 1}],
  ]) {
    const framing = await checkHandFraming(viewport);
    console.log(`Hands camera ${label}:`, framing.cases, 'cases; largest projected coordinate:', framing.worst);
    if (framing.failures.length) throw new Error(`Hands camera ${label}: ${JSON.stringify(framing.failures)}`);
  }
  async function checkBodyFraming(viewport) {
    await page.setViewport(viewport);
    return page.evaluate(() => {
      const click = (attr, val) => document.querySelector(`[data-${attr}="${val}"]`).click();
      let cases = 0, worst = 0, worstWell = 0, failures = [];
      for (const mode of ['eve', 'adam', 'pair']) for (const race of ['zlato', 'khlad']) for (const hand of ['rest', 'fist_l', 'fist_r', 'fist_both', 'guard']) for (const view of ['full', 'profile']) {
        click('mode', mode); click('race', race); click('hand', hand); click('view', view);
        const chars = mode === 'pair' ? [window.qa.femaleChar, window.qa.maleChar] : [mode === 'eve' ? window.qa.femaleChar : window.qa.maleChar];
        const camera = window.qa.camera;
        camera.updateMatrixWorld(true);
        let extreme = 0, outsideDepth = 0;
        for (const c of chars) {
          const mesh = c.bodyMesh, p = mesh.position.clone(); c.root.updateMatrixWorld(true); mesh.skeleton.update();
          for (let i = 0; i < mesh.geometry.attributes.position.count; ++i) {
            mesh.getVertexPosition(i, p); mesh.localToWorld(p); p.project(camera);
            extreme = Math.max(extreme, Math.abs(p.x), Math.abs(p.y));
            if (Math.abs(p.z) > 1) ++outsideDepth;
          }
        }
        ++cases; worst = Math.max(worst, extreme);
        if (extreme > .99 || outsideDepth) failures.push(`${mode}/${race}/${hand}/${view}: NDC ${extreme}, depth ${outsideDepth}`);
        if (mode === 'pair') {
          let wellExtreme = 0;
          const well = window.preview.well; well.updateMatrixWorld(true);
          well.traverse(obj => {
            if (!obj.isMesh || !obj.geometry?.attributes?.position) return;
            const geometry = obj.geometry;
            if (!geometry.boundingBox) geometry.computeBoundingBox();
            const box = geometry.boundingBox, p = camera.position.clone();
            for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
              p.set(x, y, z); obj.localToWorld(p); p.project(camera);
              wellExtreme = Math.max(wellExtreme, Math.abs(p.x), Math.abs(p.y));
            }
          });
          worstWell = Math.max(worstWell, wellExtreme);
          if (wellExtreme > .99) failures.push(`well in ${race}/${hand}/${view}: NDC ${wellExtreme}`);
        }
      }
      return {cases, worst, worstWell, failures};
    });
  }
  for (const [label, viewport] of [
    ['desktop', {width: 1100, height: 850, deviceScaleFactor: 1}],
    ['mobile', {width: 390, height: 844, deviceScaleFactor: 1}],
  ]) {
    const framing = await checkBodyFraming(viewport);
    console.log(`Body camera ${label}:`, framing.cases, 'cases; largest projected coordinate:', framing.worst, '; well:', framing.worstWell);
    if (framing.failures.length) throw new Error(`Body camera ${label}: ${JSON.stringify(framing.failures)}`);
  }
  // Faces should fit after expressions change, including both heads in the shared scene.
  async function checkHeadFraming(viewport) {
    await page.setViewport(viewport);
    return page.evaluate(() => {
      const click = (attr, val) => document.querySelector(`[data-${attr}="${val}"]`).click();
      let cases = 0, worst = 0, failures = [];
      for (const mode of ['eve', 'adam', 'pair']) for (const race of ['zlato', 'khlad']) for (const expression of ['neutral', 'smile', 'sad', 'angry']) {
        click('mode', mode); click('race', race); click('expr', 'neutral'); click('view', 'head'); click('expr', expression);
        const chars = mode === 'pair' ? [window.qa.femaleChar, window.qa.maleChar] : [mode === 'eve' ? window.qa.femaleChar : window.qa.maleChar];
        const camera = window.qa.camera; camera.updateMatrixWorld(true);
        let extreme = 0, count = 0;
        for (const c of chars) {
          const mesh = c.bodyMesh, geom = mesh.geometry, indices = geom.attributes.skinIndex, weights = geom.attributes.skinWeight;
          const head = mesh.skeleton.bones.map(b => b.name === 'head' || /^(special|eye)/.test(b.name));
          const p = mesh.position.clone(); c.root.updateMatrixWorld(true); mesh.skeleton.update();
          for (let i = 0; i < geom.attributes.position.count; ++i) {
            let weight = 0;
            for (let k = 0; k < 4; ++k) if (head[indices.getComponent(i, k)]) weight += weights.getComponent(i, k);
            if (weight < .35) continue;
            mesh.getVertexPosition(i, p); mesh.localToWorld(p); p.project(camera);
            extreme = Math.max(extreme, Math.abs(p.x), Math.abs(p.y)); ++count;
          }
        }
        ++cases; worst = Math.max(worst, extreme);
        if (!count || extreme > .99) failures.push(`${mode}/${race}/${expression}: ${count} vertices, NDC ${extreme}`);
      }
      return {cases, worst, failures};
    });
  }
  for (const [label, viewport] of [
    ['desktop', {width: 1100, height: 850, deviceScaleFactor: 1}],
    ['mobile', {width: 390, height: 844, deviceScaleFactor: 1}],
  ]) {
    const framing = await checkHeadFraming(viewport);
    console.log(`Head camera ${label}:`, framing.cases, 'cases; largest projected coordinate:', framing.worst);
    if (framing.failures.length) throw new Error(`Head camera ${label}: ${JSON.stringify(framing.failures)}`);
  }

  // The well close-up used to point at an invisible prop in a solo mode.
  const wellViews = await page.evaluate(() => {
    const click = (attr, val) => document.querySelector(`[data-${attr}="${val}"]`).click();
    let cases = 0, worst = 0, failures = [];
    for (const mode of ['eve', 'adam', 'pair']) for (const race of ['zlato', 'khlad']) {
      click('mode', mode); click('race', race); click('view', 'well');
      const {state, camera} = window.qa, well = window.preview.well;
      camera.updateMatrixWorld(true); well.updateMatrixWorld(true);
      if (!well.visible || (mode !== 'pair' && state.mode !== 'well')) failures.push(`invisible well from ${mode}/${race}`);
      let extreme = 0, count = 0;
      well.traverse(obj => {
        if (!obj.isMesh || !obj.geometry?.attributes?.position) return;
        if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
        const box = obj.geometry.boundingBox, p = camera.position.clone();
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          p.set(x, y, z); obj.localToWorld(p); p.project(camera);
          extreme = Math.max(extreme, Math.abs(p.x), Math.abs(p.y)); ++count;
        }
      });
      ++cases; worst = Math.max(worst, extreme);
      if (!count || extreme > .99) failures.push(`well close-up ${mode}/${race}: NDC ${extreme}`);
    }
    return {cases, worst, failures};
  });
  console.log('Well close-up:', wellViews.cases, 'cases; largest projected coordinate:', wellViews.worst);
  if (wellViews.failures.length) throw new Error(JSON.stringify(wellViews.failures));

  const desktop = {width: 1100, height: 850, deviceScaleFactor: 1};
  const mobile = {width: 390, height: 844, deviceScaleFactor: 1};
  async function viewportAndWait(viewport) {
    await page.setViewport(viewport);
    await page.waitForFunction(() => {
      const el = document.querySelector('#view'), canvas = el.querySelector('canvas');
      return Math.abs(window.qa.camera.aspect - el.clientWidth / el.clientHeight) < 1e-8 &&
        canvas.width === el.clientWidth && canvas.height === el.clientHeight;
    }, {timeout: 30000});
    if (viewport.width <= 820) {
      const actual = await page.evaluate(() => document.querySelector('#view').clientHeight);
      const expected = Math.max(360, viewport.height * .62);
      if (Math.abs(actual - expected) > 1) throw new Error(`Mobile viewport height ${actual}, expected ${expected}`);
    }
  }
  // Run inside the page both before and after resizing, without re-clicking a preset.
  function currentHandProjection() {
    const {state, camera, femaleChar, maleChar} = window.qa;
    const sides = state.hand === 'fist_l' ? ['L'] : state.hand === 'fist_r' ? ['R'] : ['L', 'R'];
    const chars = state.mode === 'pair' ? [femaleChar, maleChar] : [state.mode === 'eve' ? femaleChar : maleChar];
    camera.updateMatrixWorld(true);
    let extreme = 0, count = 0;
    for (const c of chars) {
      const mesh = c.bodyMesh, geom = mesh.geometry, indices = geom.attributes.skinIndex, weights = geom.attributes.skinWeight;
      const selected = mesh.skeleton.bones.map(b => sides.some(s => b.name.endsWith('_' + s)) && /^(wrist|metacarpal|finger)/.test(b.name));
      const p = mesh.position.clone(); c.root.updateMatrixWorld(true); mesh.skeleton.update();
      for (let i = 0; i < geom.attributes.position.count; ++i) {
        let weight = 0;
        for (let k = 0; k < 4; ++k) if (selected[indices.getComponent(i, k)]) weight += weights.getComponent(i, k);
        if (weight < .35) continue;
        mesh.getVertexPosition(i, p); mesh.localToWorld(p); p.project(camera);
        extreme = Math.max(extreme, Math.abs(p.x), Math.abs(p.y)); ++count;
      }
    }
    return {extreme, count};
  }
  const resizeCases = [
    ['eve', 'zlato', 'rest', desktop, mobile], ['eve', 'khlad', 'fist_l', mobile, desktop],
    ['eve', 'khlad', 'guard', desktop, mobile], ['adam', 'zlato', 'fist_r', desktop, mobile],
    ['adam', 'khlad', 'guard', mobile, desktop], ['pair', 'zlato', 'guard', desktop, mobile],
    ['pair', 'khlad', 'fist_both', mobile, desktop],
  ];
  let worstResizedHand = 0;
  for (const [mode, race, hand, from, to] of resizeCases) {
    await viewportAndWait(from);
    await page.evaluate(({mode, race, hand}) => {
      for (const [key, value] of Object.entries({mode, race, hand, view: 'hands'})) document.querySelector(`[data-${key}="${value}"]`).click();
    }, {mode, race, hand});
    const before = await page.evaluate(currentHandProjection);
    await viewportAndWait(to);
    const after = await page.evaluate(currentHandProjection);
    worstResizedHand = Math.max(worstResizedHand, before.extreme, after.extreme);
    if (!before.count || !after.count || before.extreme > .99 || after.extreme > .99) throw new Error(`Hands on resize ${mode}/${race}/${hand}: ${JSON.stringify({before, after})}`);
  }
  console.log('Active hands preset after resize:', resizeCases.length, 'cases; largest projected coordinate:', worstResizedHand);

  // A real orbit interaction should not be reset by resize.
  await viewportAndWait(desktop);
  await page.evaluate(() => {document.querySelector('[data-mode="eve"]').click(); document.querySelector('[data-view="hands"]').click();});
  const initialCamera = await page.evaluate(() => window.qa.camera.position.toArray());
  const rect = await (await page.$('canvas')).boundingBox();
  await page.mouse.move(rect.x + rect.width * .5, rect.y + rect.height * .5);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * .5 + 60, rect.y + rect.height * .5 + 20, {steps: 3});
  await page.mouse.up();
  const orbitedCamera = await page.evaluate(() => window.qa.camera.position.toArray());
  if (Math.max(...orbitedCamera.map((v, i) => Math.abs(v - initialCamera[i]))) < 1e-5) throw new Error('Orbit interaction did not move the camera');
  await viewportAndWait(mobile);
  const resizedManualCamera = await page.evaluate(() => window.qa.camera.position.toArray());
  const manualDifference = Math.max(...resizedManualCamera.map((v, i) => Math.abs(v - orbitedCamera[i])));
  if (manualDifference > 1e-6) throw new Error(`Manual orbit was reset on resize: ${manualDifference}`);
  console.log('Manual orbit retained on resize; max position difference:', manualDifference);

  // Verify the CSS height on a fresh mobile load as well as a desktop-to-mobile transition.
  const mobilePage = await browser.newPage();
  mobilePage.on('pageerror', error => browserErrors.push(String(error)));
  try {
    await mobilePage.setViewport(mobile);
    await mobilePage.goto(pathToFileURL(debugPath).href, {waitUntil: 'load', timeout: 60000});
    await mobilePage.waitForFunction('window.ready === true', {timeout: 120000});
    const fresh = await mobilePage.evaluate(() => ({height: document.querySelector('#view').clientHeight, aspect: window.qa.camera.aspect}));
    if (Math.abs(fresh.height - Math.max(360, mobile.height * .62)) > 1 || Math.abs(fresh.aspect - mobile.width / fresh.height) > 1e-8) throw new Error(`Fresh mobile viewport: ${JSON.stringify(fresh)}`);
    console.log('Fresh mobile viewport height:', fresh.height);
  } finally {
    await mobilePage.close();
  }
  await viewportAndWait(desktop);

  const poses = [];
  for (const mode of ['eve', 'adam']) for (const race of ['zlato', 'khlad']) for (const hand of ['rest', 'fist_l', 'fist_r', 'fist_both', 'guard']) {
    const sample = await page.evaluate(({mode, race, hand}) => {
      const click = (attr, val) => document.querySelector(`[data-${attr}="${val}"]`).click();
      click('mode', mode); click('race', race); click('hand', hand);
      const character = mode === 'eve' ? window.qa.femaleChar : window.qa.maleChar;
      const mesh = character.bodyMesh;
      character.root.updateMatrixWorld(true); mesh.skeleton.update();
      const p = mesh.position.clone(), original = mesh.geometry.attributes.position;
      const skinIndex = mesh.geometry.attributes.skinIndex, skinWeight = mesh.geometry.attributes.skinWeight;
      const positions = [], footMin = {L: Infinity, R: Infinity};
      for (let i = 0; i < original.count; ++i) {
        mesh.getVertexPosition(i, p); mesh.localToWorld(p);
        positions.push(p.x, p.y, p.z);
        if (original.getY(i) > .22) continue;
        for (const side of ['L', 'R']) {
          let weight = 0;
          for (let j = 0; j < 4; ++j) {
            const bone = mesh.skeleton.bones[skinIndex.getComponent(i, j)];
            if (bone.name.endsWith('_' + side) && /^(foot|toe)/.test(bone.name)) weight += skinWeight.getComponent(i, j);
          }
          if (weight > .5) footMin[side] = Math.min(footMin[side], p.y);
        }
      }
      return {mode, race, hand, positions, footMin, floorY: window.qa.studioFloor.position.y};
    }, {mode, race, hand});
    for (const [side, minimum] of Object.entries(sample.footMin)) {
      const gap = minimum - sample.floorY;
      if (!Number.isFinite(gap) || gap < -1e-6 || gap > .0005) throw new Error(`Foot/floor mismatch ${mode}/${race}/${hand}/${side}: ${gap}m`);
    }
    poses.push(sample);
  }
  console.log('Captured posed geometries and checked feet:', poses.length);
  if (capture) fs.writeFileSync(capture, JSON.stringify(poses));

  // The shared scene has a different ground (y=0) than the solo studio floor.
  const pairFeet = await page.evaluate(() => {
    const click = (attr, val) => document.querySelector(`[data-${attr}="${val}"]`).click();
    const result = [];
    for (const race of ['zlato', 'khlad']) for (const hand of ['rest', 'guard']) {
      click('mode', 'pair'); click('race', race); click('hand', hand);
      for (const c of [window.qa.femaleChar, window.qa.maleChar]) {
        const mesh = c.bodyMesh, p = mesh.position.clone(), attr = mesh.geometry.attributes.position;
        c.root.updateMatrixWorld(true); mesh.skeleton.update();
        let min = Infinity;
        for (let i = 0; i < attr.count; i++) if (attr.getY(i) <= .22) {
          mesh.getVertexPosition(i, p); mesh.localToWorld(p); min = Math.min(min, p.y);
        }
        result.push({race, hand, min});
      }
    }
    return result;
  });
  if (pairFeet.some(item => Math.abs(item.min) > 1e-6)) throw new Error(`Pair ground mismatch: ${JSON.stringify(pairFeet)}`);
  console.log('Pair grounding checks:', pairFeet.length);

  // Test non-UI interpolation and all three skinned meshes, including lashes.
  const intermediate = await page.evaluate(() => {
    let cases = 0, failures = [];
    for (const c of [window.qa.femaleChar, window.qa.maleChar]) for (const value of [0, .25, .5, .75, 1]) {
      c.setMorph('race_khlad', value); ++cases;
      for (const mesh of c.skinnedMeshes) {
        if (mesh.morphTargetInfluences && Math.abs(mesh.morphTargetInfluences[c.morphIdx.race_khlad] - value) > 1e-7) failures.push(`${mesh.name}: ${value}`);
      }
    }
    return {cases, failures};
  });
  if (intermediate.failures.length) throw new Error(JSON.stringify(intermediate.failures));
  console.log('Intermediate morph cases:', intermediate.cases);

  if (shots) {
    const screenshot = async name => {
      await new Promise(resolve => setTimeout(resolve, 100));
      await (await page.$('canvas')).screenshot({path: path.join(shots, name + '.png')});
    };
    for (const mode of ['eve', 'adam']) for (const race of ['zlato', 'khlad']) {
      await page.evaluate(({mode, race}) => {
        const click = (attr, val) => document.querySelector(`[data-${attr}="${val}"]`).click();
        click('mode', mode); click('race', race); click('hand', 'rest'); click('expr', 'neutral'); click('view', 'full');
      }, {mode, race});
      await screenshot(`${mode}-${race}-full`);
      await page.evaluate(({mode, race}) => {
        const scale = race === 'khlad' ? (mode === 'adam' ? 1.04 : 1.025) : 1;
        const height = (mode === 'adam' ? .90 : .85) * scale;
        const {camera, controls} = window.qa;
        controls.target.set(0, height, 0); camera.position.set(0, height, -3.75); controls.update();
      }, {mode, race});
      await screenshot(`${mode}-${race}-back`);
      await page.evaluate(() => document.querySelector('[data-view="profile"]').click());
      await screenshot(`${mode}-${race}-profile`);
      await page.evaluate(() => document.querySelector('[data-view="head"]').click());
      await screenshot(`${mode}-${race}-head`);
      await page.evaluate(mode => (mode === 'eve' ? window.qa.femaleChar : window.qa.maleChar).setMorph('race_khlad', .5), mode);
      await screenshot(`${mode}-${race}-morph-half`);
      await page.evaluate(() => {document.querySelector('[data-hand="fist_both"]').click(); document.querySelector('[data-view="hands"]').click();});
      await screenshot(`${mode}-${race}-fists`);
      await page.evaluate(() => document.querySelector('[data-hand="guard"]').click());
      await screenshot(`${mode}-${race}-guard-hands`);
      await page.evaluate(() => document.querySelector('[data-view="full"]').click());
      await screenshot(`${mode}-${race}-guard-full`);
    }
    for (const race of ['zlato', 'khlad']) {
      await page.evaluate(race => {
        for (const [key, value] of Object.entries({mode: 'pair', race, hand: 'guard', expr: 'neutral', view: 'full'})) document.querySelector(`[data-${key}="${value}"]`).click();
      }, race);
      await screenshot(`pair-${race}-full`);
      await page.evaluate(() => document.querySelector('[data-view="profile"]').click());
      await screenshot(`pair-${race}-profile`);
      await page.evaluate(() => document.querySelector('[data-view="head"]').click());
      await screenshot(`pair-${race}-head`);
    }
    await page.evaluate(() => document.querySelector('[data-mode="well"]').click());
    await screenshot('well');
    await viewportAndWait(mobile);
    await page.evaluate(() => {
      for (const [key, value] of Object.entries({mode: 'pair', race: 'khlad', hand: 'guard', view: 'full'})) document.querySelector(`[data-${key}="${value}"]`).click();
    });
    await screenshot('mobile-pair-khlad-full');
    await page.evaluate(() => document.querySelector('[data-view="profile"]').click());
    await screenshot('mobile-pair-khlad-profile');
    await viewportAndWait(desktop);
    console.log('Review screenshots written to:', shots);
  }
  if (browserErrors.length) throw new Error(`Browser errors: ${JSON.stringify(browserErrors)}`);
  console.log('Browser errors: 0');
} finally {
  if (browser) await browser.close();
  fs.rmSync(temporary, {recursive: true, force: true});
}
