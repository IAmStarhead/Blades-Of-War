// Comparisons of actual separate skinned characters, each at its own cadence.
// Two side views and one elevated foot view, 180 silent frames each.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.resolve(process.argv[2] || path.join(repo, 'work/male-gait-recovery'));
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
  for (const kind of ['walk', 'run', 'feet']) {
    await page.evaluate(kind => {
      const d = window.motionFit, footView = kind === 'feet';
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
      const ctx = canvas.getContext('2d', {alpha: false});
      window.renderMotionFrame = seconds => {
        const mode = footView ? (seconds < 3 ? 'walk' : 'run') : kind;
        d.setVersion('selected');
        if (d.state.motion !== mode) d.setMotion(mode);
        d.setPlaying(false); d.chooseView(footView ? 'high' : 'side'); d.chooseFocus(footView ? 'feet' : 'body');
        ctx.fillStyle = '#101a16'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#e1c697'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('BLADES OF WAR  /  ХОДЬБА · БЕГ', 26, 26);
        ctx.fillStyle = '#f0eee4'; ctx.font = '27px Georgia, serif';
        ctx.fillText((mode === 'walk' ? 'Ходьба' : 'Бег') + (footView ? ' — стопы' : ' — C и новый вариант'), 26, 57);
        ctx.fillStyle = '#adbfad'; ctx.font = '13px sans-serif';
        ctx.fillText('Один персонаж · у каждого свой темп', 684, 51);
        const x0 = 26, y0 = 98, width = 604, height = 520, gap = 20;
        for (const [index, variant, label] of [[0, 'previous', 'ПРЕДЫДУЩИЙ C'], [1, 'selected', 'НОВЫЙ ВАРИАНТ']]) {
          d.setVersion(variant); d.sampleSeconds(footView ? seconds % 3 : seconds); d.renderNow();
          const source = d.renderer.domElement, cropWidth = Math.min(source.width, source.height * width / height), sx = (source.width - cropWidth) / 2;
          const x = x0 + index * (width + gap);
          ctx.fillStyle = '#d7c6a5'; ctx.font = 'bold 13px sans-serif'; ctx.fillText(label, x, 83);
          ctx.drawImage(source, sx, 0, cropWidth, source.height, x, y0, width, height);
          ctx.strokeStyle = '#526359'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y0 + .5, width - 1, height - 1);
        }
        ctx.fillStyle = '#c0ccbe'; ctx.font = '13px sans-serif';
        ctx.fillText(footView ? 'Вид сверху под углом; сначала ходьба, затем бег. У каждой сетки своя скорость.' :
          'Вид сбоку. Каждый вариант и его сетка движутся в своём темпе; стопы не закреплены.', 26, 648);
        ctx.fillStyle = '#9fb2a1'; ctx.font = '12px sans-serif';
        ctx.fillText('100STYLE — Ian Mason, Sebastian Starke, Taku Komura · CC BY 4.0 · ianxmason.com/100style/', 26, 677);
        ctx.fillText('Руки нового бега и C: Open Motion Project — ACCAD / The Ohio State University · CC BY 3.0. Движения изменены; CREDITS.md.', 26, 700);
        return canvas.toDataURL('image/png').slice('data:image/png;base64,'.length);
      };
    }, kind);
    const fps = 30, seconds = 6, destination = path.join(output, `${kind}_before_after.mp4`);
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
    console.log(`${destination}: ${fps * seconds} frames, ${fps} fps`);
  }
  assert.deepEqual(errors, [], errors.join('\n'));
  const info = {method: 'Side-by-side skinned characters at the same elapsed time, each at its own cadence and grid speed; initially approximately support-aligned; offline PNG frames.',
    fps: 30, framesPerVideo: 180, durationSeconds: 6, dimensions: [1280, 720], audio: false,
    ffmpegVersion: version.stdout.split('\n')[0], modelSha256: hash(fs.readFileSync(path.join(output, 'male_gait_alternative.glb'))),
    previousModelSha256: hash(fs.readFileSync(path.join(output, 'previous_C.glb'))),
    viewerSha256: hash(fs.readFileSync(path.join(output, 'index.html'))),
    videosSha256: Object.fromEntries(['walk_before_after.mp4', 'run_before_after.mp4', 'feet_before_after.mp4'].map(x => [x, hash(fs.readFileSync(path.join(output, x)))]))};
  fs.writeFileSync(path.join(output, 'capture-info.json'), JSON.stringify(info, null, 2) + '\n');
} finally { await browser.close(); }
