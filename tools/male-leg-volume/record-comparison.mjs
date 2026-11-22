// Capture the actual offline viewer with the same pose on both sides. The
// comparison is a synchronized recording, not a pair of separate animations.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const permitted = path.join(repo, 'work/male-leg-volume'), folder = path.resolve(process.argv[2] || permitted);
if (folder === repo || (folder.startsWith(repo + path.sep) && folder !== permitted && !folder.startsWith(permitted + path.sep)))
  throw Error('Choose this delivery or a separate scratch directory');
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core'), chromium = require('@sparticuz/chromium').default;
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg', version = spawnSync(ffmpeg, ['-version'], {encoding: 'utf8'});
if (version.error || version.status !== 0) throw Error('FFmpeg is required; set FFMPEG_BIN if needed');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(), headless: 'shell',
  args: [...chromium.args, '--allow-file-access-from-files', '--disable-dev-shm-usage'], protocolTimeout: 300000});
try {
  const page = await browser.newPage(), errors = [];
  await page.setViewport({width: 1300, height: 940, deviceScaleFactor: 1});
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setRequestInterception(true);
  page.on('request', r => /^(file|data|blob):/i.test(r.url()) ? r.continue() : (errors.push('external request: ' + r.url()), r.abort()));
  await page.setOfflineMode(true); await page.goto(pathToFileURL(path.join(folder, 'index.html')).href, {waitUntil: 'load', timeout: 60000});
  await page.waitForFunction('window.uphillDemo?.state.ready === true', {timeout: 60000});
  await page.evaluate(() => {
    const d = uphillDemo; d.setManual(true); d.examplePose();
    d.renderer.setPixelRatio(1); d.renderer.setSize(600, 600, false); d.camera.aspect = 1; d.camera.updateProjectionMatrix();
    d.chooseView('side'); d.chooseFocus('knees');
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
    const ctx = canvas.getContext('2d', {alpha: false, willReadFrequently: true});
    function draw(title, subtitle) {
      ctx.fillStyle = '#17231c'; ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = '#e7d0aa'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('BLADES OF WAR  /  ПРОБА ОБЪЁМА НОГИ', 25, 22);
      ctx.fillStyle = '#f1eee4'; ctx.font = '20px sans-serif'; ctx.fillText(title, 25, 49);
      ctx.textAlign = 'right'; ctx.font = '15px sans-serif'; ctx.fillStyle = '#c0cfbd'; ctx.fillText(subtitle, 1255, 47); ctx.textAlign = 'left';
      for (const [enabled, x, label] of [[false, 20, 'ДО'], [true, 660, 'ПОСЛЕ']]) {
        d.setCorrection(enabled); d.renderNow(); ctx.drawImage(d.renderer.domElement, x, 65, 600, 600);
        ctx.fillStyle = 'rgba(20,31,24,.88)'; ctx.fillRect(x + 12, 77, 110, 34);
        ctx.fillStyle = enabled ? '#e9cf9d' : '#ecece1'; ctx.font = 'bold 17px sans-serif'; ctx.fillText(label, x + 24, 100);
      }
      ctx.fillStyle = '#c0cfbd'; ctx.font = '14px sans-serif';
      ctx.fillText('Одна поза и один ракурс; меняется только поправка объёма. Без звука.', 25, 698);
      if (ctx.getImageData(28, 120, 1, 1).data.slice(0, 3).reduce((a, b) => a + b, 0) < 60) throw Error('Blank 3D canvas');
      return canvas.toDataURL('image/png').slice('data:image/png;base64,'.length);
    }
    window.comparisonStill = () => draw('Кадр бега с верхней площадки', 'Снимок · сравнение формы');
    window.comparisonFrame = frame => {
      if (frame === 0) d.setAngle(0);
      if (frame === 90) d.setAngle(15);
      const phase = .9020178539918424 + frame * .5 / (30 * d.clock.runDuration);
      d.controller.reset('run', phase, 1.4); d.step(0);
      d.chooseView('side'); d.chooseFocus('knees');
      return draw('Бег · сравнение до / после', `${frame < 90 ? 'Ровно 0°' : 'Склон 15°'} · скорость ½`);
    };
  });
  const still = await page.evaluate(() => window.comparisonStill());
  fs.writeFileSync(path.join(folder, 'sravnenie_nogi.png'), Buffer.from(still, 'base64'));
  const temporary = path.join(folder, '.leg_comparison.capture.mp4'), destination = path.join(folder, 'leg_comparison.mp4');
  const proc = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', '30', '-vcodec', 'png', '-i', '-',
    '-an', '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.1', '-pix_fmt', 'yuv420p', '-crf', '22', '-preset', 'veryfast', '-movflags', '+faststart', temporary],
    {stdio: ['pipe', 'ignore', 'pipe']});
  let stderr = ''; proc.stderr.on('data', b => { stderr += b.toString(); });
  const ended = new Promise((resolve, reject) => { proc.on('error', reject); proc.on('close', code => code === 0 ? resolve() : reject(Error(`FFmpeg ${code}: ${stderr}`))); });
  try {
    for (let i = 0; i < 180; i++) {
      const png = await page.evaluate(frame => window.comparisonFrame(frame), i);
      if (!proc.stdin.write(Buffer.from(png, 'base64'))) await once(proc.stdin, 'drain');
    }
    proc.stdin.end(); await ended; assert.deepEqual(errors, [], errors.join('\n')); fs.renameSync(temporary, destination);
  } catch (error) { proc.kill(); await ended.catch(() => {}); fs.rmSync(temporary, {force: true}); throw error; }
  const info = {method: 'Actual offline viewer. Both panes render the same pose before and after a morph toggle.',
    still: 'Screenshot-equivalent run phase on the upper plateau.', video: '180 frames at 30 fps, in-place running at half speed; first 3 s on 0°, last 3 s on 15° terrain with runtime IK.',
    viewerSha256: hash(fs.readFileSync(path.join(folder, 'index.html'))), modelSha256: hash(fs.readFileSync(path.join(folder, 'male_leg_volume_trial.glb'))),
    stillSha256: hash(fs.readFileSync(path.join(folder, 'sravnenie_nogi.png'))), videoSha256: hash(fs.readFileSync(destination)),
    ffmpegVersion: version.stdout.split('\n')[0]};
  fs.writeFileSync(path.join(folder, 'comparison-info.json'), JSON.stringify(info, null, 2) + '\n');
  console.log(`Captured same-pose comparison PNG and 180-frame video: ${info.videoSha256}`);
} finally { await browser.close(); }
