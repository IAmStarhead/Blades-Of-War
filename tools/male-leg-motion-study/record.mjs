// Record paired 15° fixed-position runs for this study. Each half uses the
// same phase and camera, at one-quarter real-time speed. The first section
// compares old and experimental IK; the second isolates the volume morph.
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '../..');
const candidate = path.resolve(process.argv[2] || '/dev/shm/bow-leg-motion-candidate');
const dest = path.resolve(process.argv[3] || '/dev/shm/bow-leg-motion-comparison.mp4');
if (process.argv.length > 4) throw Error('Usage: node record.mjs [candidate-directory] [output.mp4]');
const permitted = path.join(repo, 'work/male-leg-motion-study');
if (dest === repo || (dest.startsWith(repo + path.sep) && !dest.startsWith(permitted + path.sep)))
  throw Error('Do not overwrite a previous delivery');
if (!dest.endsWith('.mp4')) throw Error('Output must be an MP4');
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
const version = spawnSync(ffmpeg, ['-version'], {encoding: 'utf8'});
if (version.status !== 0) throw Error('FFmpeg required; set FFMPEG_BIN');
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core'), chromium = require('@sparticuz/chromium').default;
const browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(), headless: 'shell',
  args: [...chromium.args, '--allow-file-access-from-files', '--disable-dev-shm-usage'], protocolTimeout: 120000});
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'bow-motion-study-'));
const old = path.join(repo, 'work/male-leg-volume/index.html');
const clips = [
  {name: 'original-on', file: old, correction: true, label: 'ТЕКУЩИЙ ВАРИАНТ · ОБЪЁМ ВКЛЮЧЁН'},
  {name: 'experiment', file: path.join(candidate, 'index.html'), correction: true, label: 'ЭКСПЕРИМЕНТ · ОБЪЁМ ВКЛЮЧЁН'},
  {name: 'original-off', file: old, correction: false, label: 'ТЕКУЩИЙ ВАРИАНТ · ОБЪЁМ ВЫКЛЮЧЕН'},
];
async function limit(promise, ms) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Video capture timed out')), ms); })]);
  } finally { clearTimeout(timer); }
}
async function capture(clip) {
  const page = await browser.newPage(), errors = [];
  try {
    await page.setViewport({width: 1000, height: 800, deviceScaleFactor: 1});
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setOfflineMode(true); await page.goto(pathToFileURL(clip.file).href, {waitUntil: 'load', timeout: 60000});
    await page.waitForFunction('window.uphillDemo?.state.ready === true', {timeout: 60000});
    await page.evaluate(({correct, label}) => {
      const d = uphillDemo; d.setManual(true); d.setAngle(15); d.controller.reset('run', 0, 1.4); d.setCorrection(correct);
      d.renderer.setPixelRatio(1); d.renderer.setSize(640, 640, false); d.camera.aspect = 1; d.camera.updateProjectionMatrix();
      const V = d.camera.position.constructor, a = d.actor.position.clone(), target = a.clone().add(new V(0, .58, 0));
      d.orbit.target.copy(target); d.camera.position.set(a.x + 2.35, target.y + 2.35 * .08, a.z); d.orbit.update();
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 720;
      const ctx = canvas.getContext('2d', {alpha: false});
      window.studyFrame = i => {
        d.controller.setPhase((i / 30 * .25 / d.clock.runDuration) % 1); d.renderNow();
        ctx.fillStyle = '#101912'; ctx.fillRect(0, 0, 640, 720); ctx.drawImage(d.renderer.domElement, 0, 64, 640, 640);
        ctx.fillStyle = '#f2e7d0'; ctx.font = 'bold 19px sans-serif'; ctx.fillText(label, 15, 27);
        ctx.fillStyle = '#c4d5c6'; ctx.font = '16px sans-serif'; ctx.fillText('Бег · склон 15° · вид сбоку', 15, 51);
        ctx.font = '13px sans-serif'; ctx.fillText('Поза на месте · ¼ скорости · стопы не закреплены', 14, 717);
        return canvas.toDataURL('image/png').slice('data:image/png;base64,'.length);
      };
    }, {correct: clip.correction, label: clip.label});
    const file = path.join(temp, clip.name + '.mp4');
    const proc = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', '30', '-vcodec', 'png', '-i', '-',
      '-an', '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.1', '-pix_fmt', 'yuv420p', '-crf', '22', '-preset', 'veryfast', file],
    {stdio: ['pipe', 'ignore', 'pipe']});
    let stderr = ''; proc.stderr.on('data', data => { stderr += data.toString(); });
    const ended = new Promise((resolve, reject) => {
      proc.on('error', reject); proc.on('close', code => code === 0 ? resolve() : reject(Error(`FFmpeg ${code}: ${stderr}`)));
    });
    try {
      for (let i = 0; i < 90; i++) {
        const png = await limit(page.evaluate(i => window.studyFrame(i), i), 30000);
        if (!proc.stdin.write(Buffer.from(png, 'base64'))) await limit(once(proc.stdin, 'drain'), 30000);
        if (i && i % 30 === 0) console.log(`${clip.name}: ${i}/90 frames`);
      }
      proc.stdin.end(); await limit(ended, 60000);
      assert.deepEqual(errors, [], errors.join('\n')); console.log(`${clip.name}: 90 frames`);
    } catch (error) { proc.kill('SIGKILL'); await ended.catch(() => {}); throw error; }
    return file;
  } finally { await page.close().catch(() => {}); }
}
try {
  const paths = []; for (const clip of clips) paths.push(await capture(clip));
  fs.mkdirSync(path.dirname(dest), {recursive: true});
  const temporary = dest + '.temporary.mp4';
  const combined = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y',
    '-i', paths[0], '-i', paths[1], '-i', paths[2], '-filter_complex',
    '[0:v]split=2[a][b];[a][1:v]hstack=inputs=2[first];[2:v][b]hstack=inputs=2[second];[first][second]concat=n=2:v=1:a=0[out]',
    '-map', '[out]', '-an', '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.1', '-pix_fmt', 'yuv420p',
    '-crf', '22', '-preset', 'veryfast', '-movflags', '+faststart', temporary], {encoding: 'utf8'});
  if (combined.status !== 0) throw Error(`FFmpeg composition failed: ${combined.stderr}`);
  fs.renameSync(temporary, dest); console.log(`Research comparison: ${dest}`);
} finally {
  await browser.close().catch(() => {});
  fs.rmSync(temp, {recursive: true, force: true});
}
