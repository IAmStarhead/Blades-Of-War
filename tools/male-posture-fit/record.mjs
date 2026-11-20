// Deterministic source-time comparison of both actual skinned characters.
// Identical side camera, phase and ground; 180 frames per silent video.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.resolve(process.argv[2] || path.join(repo, 'work/male-posture-fit'));
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core'), chromium = require('@sparticuz/chromium').default;
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg', version = spawnSync(ffmpeg, ['-version'], {encoding: 'utf8'});
if (version.error || version.status !== 0) throw Error('FFmpeg is required (set FFMPEG_BIN if needed)');
const hash = b => createHash('sha256').update(b).digest('hex');
const browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(), headless: 'shell',
  args: [...chromium.args, '--allow-file-access-from-files', '--disable-dev-shm-usage'], protocolTimeout: 180000});
try {
  const page = await browser.newPage(); await page.setViewport({width: 1440, height: 1000, deviceScaleFactor: 1});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setRequestInterception(true);
  page.on('request', r => /^(file|data|blob):/i.test(r.url()) ? r.continue() : (errors.push('external request: ' + r.url()), r.abort()));
  await page.setOfflineMode(true); await page.goto(pathToFileURL(path.join(output, 'index.html')).href, {waitUntil: 'load', timeout: 60000});
  await page.waitForFunction('window.motionFit?.state.ready === true', {timeout: 60000});
  for (const mode of ['walk', 'run']) {
    await page.evaluate(mode => {
      const d = window.motionFit; d.setVersion('selected'); d.setMotion(mode); d.setPlaying(false); d.chooseFocus('body'); d.chooseView('side'); d.sampleSeconds(0); d.renderNow();
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
      const ctx = canvas.getContext('2d', {alpha: false});
      window.renderMotionFrame = seconds => {
        d.sampleSeconds(seconds);
        ctx.fillStyle = '#101a16'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#e1c697'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('BLADES OF WAR  /  ОСАНКА И БЁДРА', 26, 26);
        ctx.fillStyle = '#f0eee4'; ctx.font = '27px Georgia, serif';
        ctx.fillText(mode === 'walk' ? 'Ходьба C — до и после' : 'Бег C — до и после', 26, 57);
        ctx.fillStyle = '#adbfad'; ctx.font = '13px sans-serif';
        ctx.fillText('Один момент шага · один ракурс · тот же персонаж', 684, 51);
        const x0 = 26, y0 = 98, width = 604, height = 520, gap = 20;
        for (const [index, variant, label] of [[0, 'previous', 'ДО ПРАВКИ'], [1, 'selected', 'ПОСЛЕ ПРАВКИ']]) {
          d.setVersion(variant); d.renderNow();
          const source = d.renderer.domElement, cropWidth = Math.min(source.width, source.height * width / height), sx = (source.width - cropWidth) / 2;
          const x = x0 + index * (width + gap);
          ctx.fillStyle = '#d7c6a5'; ctx.font = 'bold 13px sans-serif'; ctx.fillText(label, x, 83);
          ctx.drawImage(source, sx, 0, cropWidth, source.height, x, y0, width, height);
          ctx.strokeStyle = '#526359'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y0 + .5, width - 1, height - 1);
        }
        ctx.fillStyle = '#c0ccbe'; ctx.font = '13px sans-serif';
        ctx.fillText('Вид сбоку. Модель движется на месте; сетка приблизительная, стопы не закреплены.', 26, 648);
        ctx.fillStyle = '#9fb2a1'; ctx.font = '12px sans-serif';
        ctx.fillText('Open Motion Project — ACCAD / The Ohio State University · CC BY 3.0 · accad.osu.edu · creativecommons.org/licenses/by/3.0/', 26, 677);
        ctx.fillText('Движения изменены и адаптированы под риг; подробнее — CREDITS.md. Прежние файлы не изменены.', 26, 700);
        return canvas.toDataURL('image/png').slice('data:image/png;base64,'.length);
      };
    }, mode);
    const fps = 30, seconds = 6, destination = path.join(output, `${mode}_before_after.mp4`);
    const proc = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-vcodec', 'png', '-i', '-',
      '-an', '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.1', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'veryfast', '-movflags', '+faststart', destination],
      {stdio: ['pipe', 'ignore', 'pipe']});
    let stderr = ''; proc.stderr.on('data', data => { stderr += data.toString(); });
    const ended = new Promise((resolve, reject) => {
      proc.on('error', reject); proc.on('close', code => code === 0 ? resolve() : reject(Error(`FFmpeg exited ${code}: ${stderr}`)));
    });
    try {
      for (let i = 0; i < fps * seconds; i++) {
        const frame = await page.evaluate(t => window.renderMotionFrame(t), i / fps);
        if (!proc.stdin.write(Buffer.from(frame, 'base64'))) await once(proc.stdin, 'drain');
      }
      proc.stdin.end(); await ended;
    } catch (e) { proc.kill(); await ended.catch(() => {}); throw e; }
    console.log(`${destination}: ${fps * seconds} deterministic frames, ${fps} fps`);
  }
  assert.deepEqual(errors, [], errors.join('\n'));
  const info = {method: 'Side-by-side, synchronized old and corrected actual skinned characters; deterministic source-time PNG frames piped to FFmpeg.',
    fps: 30, framesPerVideo: 180, durationSeconds: 6, dimensions: [1280, 720], audio: false,
    ffmpegVersion: version.stdout.split('\n')[0], modelSha256: hash(fs.readFileSync(path.join(output, 'male_posture_C_trial.glb'))),
    previousModelSha256: hash(fs.readFileSync(path.join(output, 'previous_C_trial.glb'))),
    viewerSha256: hash(fs.readFileSync(path.join(output, 'index.html'))),
    videosSha256: Object.fromEntries(['walk_before_after.mp4', 'run_before_after.mp4'].map(x => [x, hash(fs.readFileSync(path.join(output, x)))]))};
  fs.writeFileSync(path.join(output, 'capture-info.json'), JSON.stringify(info, null, 2) + '\n');
} finally { await browser.close(); }
