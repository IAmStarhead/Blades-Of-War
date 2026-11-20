// Exercise the actual self-contained page, completely offline. Mobile is
// Chromium emulation only, not a physical Android device.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core'), chromium = require('@sparticuz/chromium').default;
const output = path.resolve(process.argv[2] || path.join(root, 'work/male-static-rebuild'));
const errors = [], temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-static-download-'));
const browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(),
  headless: 'shell', args: [...chromium.args, '--allow-file-access-from-files', '--disable-dev-shm-usage']});
const hash = data => createHash('sha256').update(data).digest('hex');
async function open(viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  page.on('pageerror', error => errors.push('page: '+error.message));
  page.on('console', message => {
    if (message.type()==='error' || (message.type()==='warn' && message.text().startsWith('THREE.'))) errors.push('console: '+message.text());
  });
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (/^(file|data|blob):/i.test(request.url())) request.continue();
    else { errors.push('external request: '+request.url()); request.abort(); }
  });
  await page.setOfflineMode(true);
  await page.goto(pathToFileURL(path.join(output,'index.html')).href, {waitUntil:'load', timeout: 60000});
  await page.waitForFunction('window.staticTrial?.state.ready===true', {timeout: 60000});
  return page;
}
async function viewState(page) {
  return page.evaluate(() => ({
    state: {...staticTrial.state}, position: staticTrial.camera.position.toArray(), target: staticTrial.controls.target.toArray(),
    visible: [staticTrial.models.new.visible, staticTrial.models.previous.visible],
  }));
}
async function canvasHash(page) {
  await page.evaluate(() => staticTrial.renderer.render(staticTrial.scene, staticTrial.camera));
  return hash(await (await page.$('canvas')).screenshot({type:'png'}));
}
const closeArray = (a,b,tolerance=1e-9) => {
  assert.equal(a.length,b.length);
  a.forEach((v,i)=>assert.ok(Math.abs(v-b[i])<tolerance,`${v} != ${b[i]}`));
};
try {
  const desktop = await open({width: 1280, height: 1000, deviceScaleFactor: 1});
  assert.equal(await desktop.$eval('#status', el => el.dataset.state), 'ready');
  assert.equal(await desktop.evaluate(() => 'EMBEDDED_MODELS' in window), false);
  const first = await viewState(desktop), initialImage = await canvasHash(desktop);
  assert.equal(first.state.model, 'new');
  assert.deepEqual(first.visible, [true, false]);
  await desktop.click('[data-model="previous"]');
  const old = await viewState(desktop), oldImage = await canvasHash(desktop);
  assert.deepEqual(old.visible, [false,true]);
  closeArray(first.position, old.position); closeArray(first.target, old.target);
  assert.notEqual(initialImage, oldImage, 'switching must visibly change the rendered model');
  await desktop.click('[data-model="new"]');
  assert.equal(await canvasHash(desktop), initialImage, 'switching back must restore the same render');
  for (const view of ['front','back','side','rear45']) {
    await desktop.click(`[data-view="${view}"]`);
    assert.equal((await viewState(desktop)).state.view, view);
    assert.equal(await desktop.$eval(`[data-view="${view}"]`, b=>b.getAttribute('aria-pressed')), 'true');
  }
  for (const focus of ['body','head','pelvis','leftHand','rightHand','feet']) {
    await desktop.click(`[data-focus="${focus}"]`);
    assert.equal((await viewState(desktop)).state.focus, focus);
    assert.equal(await desktop.$eval(`[data-focus="${focus}"]`, b=>b.getAttribute('aria-pressed')), 'true');
  }
  await desktop.click('[data-focus="body"]');
  await desktop.click('[data-view="back"]');
  const unlit = await canvasHash(desktop);
  await desktop.click('[data-action="light"]');
  assert.equal((await viewState(desktop)).state.light, true);
  assert.notEqual(unlit, await canvasHash(desktop));
  await desktop.click('[data-action="light"]');
  assert.equal(await canvasHash(desktop), unlit);
  await desktop.click('[data-action="reset"]');
  assert.equal((await viewState(desktop)).state.view, 'front');
  const beforeDrag = await viewState(desktop);
  const box = await (await desktop.$('canvas')).boundingBox();
  await desktop.mouse.move(box.x + box.width*.7, box.y + box.height*.45);
  await desktop.mouse.down();
  await desktop.mouse.move(box.x + box.width*.55, box.y + box.height*.42, {steps: 8});
  await desktop.mouse.up();
  const afterDrag = await viewState(desktop);
  assert.equal(afterDrag.state.view, null);
  assert.ok(Math.hypot(...afterDrag.position.map((v,i)=>v-beforeDrag.position[i])) > .1, 'mouse drag rotates camera');
  const beforeZoom = await desktop.evaluate(()=>staticTrial.camera.position.distanceTo(staticTrial.controls.target));
  await desktop.mouse.wheel({deltaY: -200});
  await desktop.waitForFunction((d)=>Math.abs(staticTrial.camera.position.distanceTo(staticTrial.controls.target)-d)>.01, {}, beforeZoom);

  const client = await desktop.target().createCDPSession();
  await client.send('Browser.setDownloadBehavior', {behavior:'allow', downloadPath:temp, eventsEnabled:true});
  const downloaded = new Promise((resolve,reject) => {
    const timer=setTimeout(()=>reject(new Error('download timed out')),20000);
    let started;
    client.on('Browser.downloadWillBegin', event => {started=event});
    client.on('Browser.downloadProgress', event => {
      if (event.state==='canceled') {clearTimeout(timer); reject(new Error('download canceled'));}
      if (event.state==='completed') {clearTimeout(timer); resolve({started,event});}
    });
  });
  await desktop.click('[data-action="download"]');
  const download = await downloaded;
  assert.ok(download.started.url.startsWith('blob:'));
  assert.equal(download.started.suggestedFilename, 'male_static_rebuild.glb');
  assert.deepEqual(fs.readFileSync(path.join(temp, 'male_static_rebuild.glb')), fs.readFileSync(path.join(output, 'male_static_rebuild.glb')));
  console.log('PASS: offline desktop rendering, exact comparison-camera preservation, presets, lighting, mouse rotation/zoom, and byte-identical GLB download');
  await desktop.close();

  for (const viewport of [
    {width:320,height:700,deviceScaleFactor:1,isMobile:true,hasTouch:true},
    {width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true},
    {width:768,height:1024,deviceScaleFactor:1,isMobile:true,hasTouch:true},
  ]) {
    const mobile = await open(viewport);
    const dimensions = await mobile.evaluate(() => ({client:document.documentElement.clientWidth,
      scroll:document.documentElement.scrollWidth, stage:document.querySelector('#stage').getBoundingClientRect().toJSON()}));
    assert.ok(dimensions.scroll<=dimensions.client+1, JSON.stringify(dimensions));
    assert.ok(dimensions.stage.width>250 && dimensions.stage.height>350, JSON.stringify(dimensions));
    await mobile.click('[data-model="previous"]');
    assert.equal((await viewState(mobile)).state.model, 'previous');
    await mobile.click('[data-model="new"]');
    await mobile.click('[data-view="side"]');
    await mobile.click('[data-focus="head"]');
    assert.equal((await viewState(mobile)).state.focus, 'head');
    await mobile.$eval('canvas', element => element.scrollIntoView({block:'center'}));
    const bounds = await (await mobile.$('canvas')).boundingBox();
    const oldPosition = (await viewState(mobile)).position;
    const touch = await mobile.target().createCDPSession();
    const x = bounds.x + bounds.width*.55, y = bounds.y + bounds.height*.46;
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-60,y:y+15,id:1}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const rotated = await viewState(mobile);
    assert.ok(Math.hypot(...rotated.position.map((v,i)=>v-oldPosition[i])) > .01, `touch rotation at ${viewport.width}`);
    const distanceBeforePinch = await mobile.evaluate(()=>staticTrial.camera.position.distanceTo(staticTrial.controls.target));
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-25,y,id:1},{x:x+25,y,id:2}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-50,y,id:1},{x:x+50,y,id:2}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const distanceAfterPinch = await mobile.evaluate(()=>staticTrial.camera.position.distanceTo(staticTrial.controls.target));
    assert.ok(Math.abs(distanceAfterPinch-distanceBeforePinch)>.01, `pinch zoom at ${viewport.width}`);
    await mobile.close();
    console.log(`PASS: emulated ${viewport.width}x${viewport.height}, no horizontal overflow, mobile buttons, rotation and pinch zoom`);
  }
  assert.deepEqual(errors, [], errors.join('\n'));
  console.log('PASS: no external requests or browser errors. Emulation is not a physical Android test.');
} finally {
  await browser.close();
  fs.rmSync(temp, {recursive:true,force:true});
}
