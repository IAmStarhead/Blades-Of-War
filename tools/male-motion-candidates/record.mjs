// Record two side-view MP4s of the same source-joint review, without touching
// the project character. Frames use deterministic source time; FFmpeg encodes
// them at 30 fps even when a software WebGL renderer is slower than real time.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(dir, '../..');
const output = path.resolve(process.argv[2] || path.join(repo, 'work/male-motion-candidates'));
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium').default;
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_BIN || await chromium.executablePath(),
  headless: 'shell',
  args: [...chromium.args, '--disable-dev-shm-usage'],
  protocolTimeout: 180000,
});
try {
  const page = await browser.newPage();
  await page.setViewport({width: 1440, height: 900, deviceScaleFactor: 1});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request', r => /^(file|data|blob):/i.test(r.url()) ? r.continue() : r.abort());
  await page.setOfflineMode(true);
  await page.goto(pathToFileURL(path.join(output, 'index.html')).href, {waitUntil: 'load'});
  await page.waitForFunction('window.motionReview?.state.ready === true', {timeout: 60000});

  for (const mode of ['walk', 'run']) {
    await page.evaluate(async mode => {
      const review = window.motionReview;
      review.setPlaying(false); review.setMode(mode); review.setView('side'); review.setPhase(0);
      document.querySelector('#comparison').scrollIntoView({block: 'start'});
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      review.renderNow();
      const out = document.createElement('canvas');
      out.width = 1280; out.height = 640;
      const ctx = out.getContext('2d', {alpha: false});
      const labels = mode === 'walk'
        ? ['A · 100STYLE — спокойная', 'B · ACCAD Male 1 — умеренная', 'C · ACCAD Male 2 — быстрая']
        : ['A · 100STYLE — лёгкий бег', 'B · ACCAD Male 1 — быстрый', 'C · ACCAD Male 2 — энергичный'];
      window.renderComparisonFrame = seconds => {
        review.data.candidates[mode].forEach(c => { review.actors[c.id].elapsed = seconds; review.actors[c.id].exactEnd = false; });
        review.renderNow();
        const source = review.renderer.domElement, cb = source.getBoundingClientRect();
        const ratio = source.width / cb.width;
        ctx.fillStyle = '#101815'; ctx.fillRect(0, 0, out.width, out.height);
        ctx.fillStyle = '#e5c793'; ctx.font = 'bold 14px sans-serif';
        ctx.fillText('BLADES OF WAR  /  ПРЕДВАРИТЕЛЬНЫЙ ОТБОР', 25, 25);
        ctx.fillStyle = '#f0eee3'; ctx.font = '25px Georgia, serif';
        ctx.fillText(mode === 'walk' ? 'Ходьба: варианты A / B / C' : 'Бег: варианты A / B / C', 25, 56);
        ctx.fillStyle = '#b2c1b3'; ctx.font = '13px sans-serif';
        ctx.fillText('Исходная скорость · отдельные манекены · повтор без сглаживания', 680, 51);
        const width = 400, height = 448, gap = 14, left = 26, top = 99;
        for (let i = 0; i < 3; i++) {
          const x = left + i * (width + gap);
          ctx.fillStyle = '#d9c49e'; ctx.font = 'bold 14px sans-serif'; ctx.fillText(labels[i], x, 83);
          const r = document.querySelector(`[data-stage="${i}"]`).getBoundingClientRect();
          ctx.drawImage(source, (r.left - cb.left) * ratio, (r.top - cb.top) * ratio, r.width * ratio, r.height * ratio, x, top, width, height);
          ctx.strokeStyle = '#46574b'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, top + .5, width - 1, height - 1);
        }
        ctx.fillStyle = '#b5c3b5'; ctx.font = '12px sans-serif';
        ctx.fillText('A: The 100STYLE Dataset – Ian Mason, S. Starke, T. Komura · CC BY 4.0 · ianxmason.com/100style · creativecommons.org/licenses/by/4.0/', 26, 571);
        ctx.fillText('B, C: Open Motion Project – ACCAD / The Ohio State University · CC BY 3.0 · accad.osu.edu · creativecommons.org/licenses/by/3.0/', 26, 592);
        ctx.fillStyle = '#90a394';
        ctx.fillText('Выбраны и повторены фрагменты; направление и положение для просмотра изменены. Риг персонажа не используется.', 26, 617);
        return out.toDataURL('image/png').slice('data:image/png;base64,'.length);
      };
    }, mode);
    const fps = 30, seconds = 6, destination = path.join(output, `${mode}_comparison.mp4`);
    const proc = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-vcodec', 'png', '-i', '-', '-an', '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.1', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'veryfast', '-movflags', '+faststart', destination], {stdio: ['pipe', 'ignore', 'pipe']});
    let stderr = '';
    proc.stderr.on('data', data => { stderr += data.toString(); });
    const ended = new Promise((resolve, reject) => {
      proc.on('error', reject);
      proc.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg exited ${code}: ${stderr}`)));
    });
    try {
      for (let i = 0; i < fps * seconds; i++) {
        const base64 = await page.evaluate(t => window.renderComparisonFrame(t), i / fps);
        if (!proc.stdin.write(Buffer.from(base64, 'base64'))) await once(proc.stdin, 'drain');
      }
      proc.stdin.end();
      await ended;
    } catch (e) {
      proc.kill();
      await ended.catch(() => {});
      throw e;
    }
    console.log(`${destination}: ${fps * seconds} source-timed frames at ${fps} fps`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
} finally {
  await browser.close();
}
