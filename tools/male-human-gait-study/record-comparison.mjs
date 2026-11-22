// Research-only comparison; the existing trial is loaded read-only.
// The two externally licensed reference clips are supplied separately.
// Their licenses and source links are recorded in work/male-human-gait-study/README.md.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (process.argv.length !== 5 || !['walk', 'run'].includes(process.argv[2])) {
  throw Error('Usage: node record-comparison.mjs walk|run path/to/reference.mp4 output.mp4');
}
const mode = process.argv[2], source = path.resolve(process.argv[3]), output = path.resolve(process.argv[4]);
const permitted = path.join(repo, 'work/male-human-gait-study') + path.sep;
if (output.startsWith(repo + path.sep) && !output.startsWith(permitted)) throw Error('Do not modify a previous delivery');
if (!output.endsWith('.mp4') || fs.existsSync(output)) throw Error('Output must be a new .mp4 file');
const configurations = {
  walk: {
    sha256: '3c84100a75b04459f210842041d0cdeaf61a02f0b73a2aaf7d9211208f4b1669',
    startPhase: 1 / 4, cameraX: -3.0, title: 'РЕАЛЬНАЯ ХОДЬБА И ТЕКУЩИЙ ПЕРСОНАЖ — ВИД СБОКУ',
    reference: 'Человек · асфальт · кроссовки · съёмка 30 кадр/с',
    limitations: 'Скорости и размеры не выравнивались; обувь и поверхность различаются.',
    credit: 'Запись человека: mikecredence / wgvp · AGPL-3.0. Подробности — в отчёте.',
    // The original two-camera frame is 1516x960. Crop from the genuine left
    // side-camera panel and pan the crop approximately with the walking person.
    filter: "trim=start=11.8:end=13.8,setpts=PTS-STARTPTS,crop=300:300:x='68+205*t':y=350,scale=560:560,setpts=2*PTS,fps=30,setsar=1",
  },
  run: {
    sha256: '84f2de8ccfc8ddaad7be42ad6c46c68226d3f6b0a13a986d57528e451afc0ce2',
    startPhase: 13 / 32, cameraX: 3.0, title: 'РЕАЛЬНЫЙ БЕГ И ТЕКУЩИЙ ПЕРСОНАЖ — ВИД СБОКУ',
    reference: 'Человек · беговая дорожка · съёмка 30 кадр/с',
    limitations: 'Дорожка движется; её скорость и уклон неизвестны. Звук отсутствует.',
    credit: 'Запись человека: zzzhushi / GaitLab · MIT. Подробности — в отчёте.',
    filter: 'trim=start=4.2:end=6.2,setpts=PTS-STARTPTS,crop=640:640:40:640,scale=560:560,setpts=2*PTS,fps=30,setsar=1',
  },
};
const cfg = configurations[mode];
const actual = createHash('sha256').update(fs.readFileSync(source)).digest('hex');
if (actual !== cfg.sha256) throw Error('Unexpected reference clip: verify source and SHA-256 in the study README');
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
if (spawnSync(ffmpeg, ['-version'], {stdio: 'ignore'}).status !== 0) throw Error('FFmpeg required; set FFMPEG_BIN');
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core'), chromium = require('@sparticuz/chromium').default;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-human-gait-'));
let browser;
async function limit(promise, ms) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {timer = setTimeout(() => reject(Error('Capture timed out')), ms);})]); }
  finally { clearTimeout(timer); }
}
try {
  browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(), headless: 'shell',
    args: [...chromium.args, '--allow-file-access-from-files', '--disable-dev-shm-usage'], protocolTimeout: 120000});
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewport({width: 900, height: 800, deviceScaleFactor: 1});
  await page.setOfflineMode(true);
  await page.goto(pathToFileURL(path.join(repo, 'work/male-leg-volume/index.html')).href, {waitUntil: 'load', timeout: 60000});
  await page.waitForFunction('window.uphillDemo?.state.ready === true', {timeout: 60000});
  const bg = await page.evaluate(({mode, cfg}) => {
    const d = window.uphillDemo;
    d.setManual(true); d.setAngle(0); d.controller.reset(mode, cfg.startPhase, -2.5); d.setCorrection(true);
    d.renderer.setPixelRatio(1); d.renderer.setSize(560, 560, false); d.camera.aspect = 1; d.camera.updateProjectionMatrix();
    const mesh = d.model.getObjectByName('NewBody'), rest = mesh.geometry.getAttribute('position'), footIds = [];
    for (let i = 0; i < rest.count; i++) {
      const x = rest.getX(i);
      if (rest.getY(i) < .16 && Math.abs(x) > .035 && Math.abs(x) < .25) footIds.push(i);
    }
    window.gaitComparisonFrame = i => {
      if (i > 0) d.controller.step(1 / 60);
      const V = d.camera.position.constructor, a = d.actor.position, target = a.clone().add(new V(0, .58, 0));
      // Track the actor over the stationary grid, not an in-place frozen pose.
      d.orbit.target.copy(target); d.camera.position.set(a.x + cfg.cameraX, target.y, a.z); d.orbit.update(); d.renderNow();
      // Check that the visible foot meshes stay inside the frame throughout the clip.
      d.model.updateWorldMatrix(true, true); mesh.updateMatrixWorld(true); mesh.skeleton.update();
      const p = new V(), bounds = {minX: 1, maxX: -1, minY: 1, maxY: -1};
      for (const id of footIds) {
        mesh.getVertexPosition(id, p); mesh.localToWorld(p); p.project(d.camera);
        bounds.minX = Math.min(bounds.minX, p.x); bounds.maxX = Math.max(bounds.maxX, p.x);
        bounds.minY = Math.min(bounds.minY, p.y); bounds.maxY = Math.max(bounds.maxY, p.y);
      }
      return {png: d.renderer.domElement.toDataURL('image/png').split(',')[1], bounds};
    };
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
    const c = canvas.getContext('2d'); c.fillStyle = '#101912'; c.fillRect(0, 0, 1280, 720);
    c.fillStyle = '#f4eddd'; c.font = 'bold 21px sans-serif'; c.fillText(cfg.title, 40, 27);
    c.fillStyle = '#e9cda0'; c.font = '16px sans-serif';
    c.fillText(cfg.reference, 40, 63); c.fillText('Персонаж · ровный пол 0° · текущая проба', 680, 63);
    c.fillStyle = '#c4d5c6'; c.font = '15px sans-serif';
    c.fillText('Сначала ½ скорости, затем обычная. Фазы приблизительно совмещены только в начале.', 40, 664);
    c.fillText(cfg.limitations, 40, 684); c.fillText(cfg.credit, 40, 704);
    return canvas.toDataURL('image/png').split(',')[1];
  }, {mode, cfg});
  const background = path.join(tmp, 'background.png'), avatar = path.join(tmp, 'avatar.mp4');
  fs.writeFileSync(background, Buffer.from(bg, 'base64'));
  const proc = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', '30', '-vcodec', 'png', '-i', '-',
    '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '19', '-preset', 'veryfast', avatar], {stdio: ['pipe', 'ignore', 'pipe']});
  let stderr = ''; proc.stderr.on('data', b => { stderr += b.toString(); });
  const ended = new Promise((resolve, reject) => {
    proc.on('error', reject); proc.on('close', code => code === 0 ? resolve() : reject(Error(`FFmpeg ${code}: ${stderr}`)));
  });
  try {
    let bounds = {minX: 1, maxX: -1, minY: 1, maxY: -1};
    for (let i = 0; i < 120; i++) {
      const frame = await limit(page.evaluate(i => window.gaitComparisonFrame(i), i), 30000);
      bounds = {minX: Math.min(bounds.minX, frame.bounds.minX), maxX: Math.max(bounds.maxX, frame.bounds.maxX),
        minY: Math.min(bounds.minY, frame.bounds.minY), maxY: Math.max(bounds.maxY, frame.bounds.maxY)};
      if (!proc.stdin.write(Buffer.from(frame.png, 'base64'))) await limit(once(proc.stdin, 'drain'), 30000);
      if (i && i % 30 === 0) console.log(`${mode}: ${i}/120 avatar frames`);
    }
    assert.ok(bounds.minX > -.98 && bounds.maxX < .98 && bounds.minY > -.98 && bounds.maxY < .98,
      `Some selected foot vertices leave the image: ${JSON.stringify(bounds)}`);
    console.log('Selected foot bounds in normalized screen coordinates:', bounds);
    proc.stdin.end(); await limit(ended, 60000);
  } catch (error) { proc.kill('SIGKILL'); await ended.catch(() => {}); throw error; }
  assert.deepEqual(errors, [], errors.join('\n'));
  const composed = path.join(tmp, 'comparison.mp4');
  const filters = [
    `[2:v]${cfg.filter}[human]`,
    '[0:v][human]overlay=40:80:shortest=1[first]',
    '[first][1:v]overlay=680:80:shortest=1,trim=duration=4,setpts=PTS-STARTPTS,format=yuv420p[half]',
    // Replay the same two seconds at original time after the slow section.
    '[half]split=2[slow][forfast]',
    // Frame-rate conversion rounds the two-second replay down by one frame;
    // hold its last frame once so each section is exactly six seconds long.
    '[forfast]setpts=0.5*(PTS-STARTPTS),fps=30,tpad=stop_mode=clone:stop=1,trim=duration=2[fast]',
    '[slow][fast]concat=n=2:v=1:a=0,format=yuv420p[out]',
  ].join(';');
  const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-loop', '1', '-framerate', '30', '-i', background,
    '-i', avatar, '-i', source, '-filter_complex', filters, '-map', '[out]', '-an', '-frames:v', '180',
    '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.1', '-pix_fmt', 'yuv420p', '-crf', '21',
    '-preset', 'veryfast', '-movflags', '+faststart', composed], {encoding: 'utf8'});
  if (result.status !== 0) throw Error(`Video composition failed: ${result.stderr}`);
  fs.mkdirSync(path.dirname(output), {recursive: true}); fs.copyFileSync(composed, output, fs.constants.COPYFILE_EXCL);
  console.log(`Research comparison written: ${output}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  fs.rmSync(tmp, {recursive: true, force: true});
}
