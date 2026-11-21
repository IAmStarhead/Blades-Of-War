// Deterministic frames from the actual viewer, at normal speed and exact
// switch times. Two perspectives of the same 8.5-second demonstration.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = path.resolve(process.argv[2] || path.join(repo, 'work/male-gait-transition'));
const permitted = path.join(repo, 'work/male-gait-transition');
if (folder === repo || (folder.startsWith(repo + path.sep) && folder !== permitted && !folder.startsWith(permitted + path.sep)))
  throw Error('Choose this delivery or a separate scratch directory');
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core'), chromium = require('@sparticuz/chromium').default;
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg', version = spawnSync(ffmpeg, ['-version'], {encoding: 'utf8'});
if (version.error || version.status !== 0) throw Error('FFmpeg is required; set FFMPEG_BIN if needed');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fps = 30, frames = 255;
async function capture(kind) {
  const browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(), headless: 'shell',
    args: [...chromium.args, '--allow-file-access-from-files', '--disable-dev-shm-usage'], protocolTimeout: 180000});
  try {
    const page = await browser.newPage(), errors = [];
    await page.setViewport({width: 1360, height: 940, deviceScaleFactor: 1});
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setRequestInterception(true);
    page.on('request', r => /^(file|data|blob):/i.test(r.url()) ? r.continue() : (errors.push('external request: ' + r.url()), r.abort()));
    await page.setOfflineMode(true);
    await page.goto(pathToFileURL(path.join(folder, 'index.html')).href, {waitUntil: 'load', timeout: 60000});
    await page.waitForFunction('window.transitionDemo?.state.ready === true', {timeout: 60000});
    await page.evaluate(which => {
      const d = transitionDemo; d.setManual(true); d.reset('walk', 0);
      d.renderer.setPixelRatio(1); d.renderer.setSize(1280, 720, false); d.camera.aspect = 1280 / 720; d.camera.updateProjectionMatrix();
      d.chooseFocus(which === 'feet' ? 'feet' : 'body'); d.chooseView(which === 'feet' ? 'side' : 'front45');
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
      const ctx = canvas.getContext('2d', {alpha: false, willReadFrequently: true});
      window.captureFrame = frame => {
        if (d.renderer.getContext().isContextLost()) throw Error('WebGL context lost');
        if (frame > 0) d.step(1 / 30);
        if (frame === 60) d.setTarget('run');
        if (frame === 162) d.setTarget('walk');
        d.renderNow(); ctx.drawImage(d.renderer.domElement, 0, 0, 1280, 720);
        ctx.fillStyle = 'rgba(17,26,22,.85)'; ctx.fillRect(0, 0, 1280, 62); ctx.fillRect(0, 676, 1280, 44);
        ctx.fillStyle = '#e8d4ad'; ctx.font = 'bold 15px sans-serif'; ctx.fillText('BLADES OF WAR  /  ПЕРЕХОД ХОДЬБА ↔ БЕГ', 24, 22);
        ctx.fillStyle = '#f2f0e6'; ctx.font = '20px sans-serif';
        const text = d.state.target === 'run' ? (d.clock.weight < .98 ? 'Ходьба → бег' : 'Бег') : (d.clock.weight > .02 ? 'Бег → ходьба' : 'Ходьба');
        ctx.fillText(text + (which === 'feet' ? '  ·  стопы сбоку' : '  ·  весь рост'), 24, 49);
        ctx.fillStyle = '#d6e0d3'; ctx.font = '14px sans-serif';
        ctx.fillText('Обычная скорость · на месте · сетка приблизительная, стопы не закреплены', 24, 702);
        ctx.fillStyle = '#819486'; ctx.fillRect(996, 32, 180, 5); ctx.fillStyle = '#dec394'; ctx.fillRect(996, 32, 180 * d.clock.weight, 5);
        ctx.fillStyle = '#d6e0d3'; ctx.font = '13px sans-serif'; ctx.fillText('Доля бега', 996, 23);
        const [r, g, b] = ctx.getImageData(8, 85, 1, 1).data;
        if (r + g + b < 65) throw Error(`Blank 3D canvas at frame ${frame}`);
        return canvas.toDataURL('image/png').slice('data:image/png;base64,'.length);
      };
    }, kind);
    const name = kind === 'feet' ? 'transition_feet.mp4' : 'transition_preview.mp4';
    const destination = path.join(folder, name), temporary = path.join(folder, '.' + name + '.capture.mp4');
    const proc = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-vcodec', 'png', '-i', '-',
      '-an', '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.1', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'veryfast', '-movflags', '+faststart', temporary],
      {stdio: ['pipe', 'ignore', 'pipe']});
    let stderr = ''; proc.stderr.on('data', data => { stderr += data.toString(); });
    const ended = new Promise((resolve, reject) => {
      proc.on('error', reject); proc.on('close', code => code === 0 ? resolve() : reject(Error(`FFmpeg exited ${code}: ${stderr}`)));
    });
    try {
      for (let i = 0; i < frames; i++) {
        const png = await page.evaluate(i => window.captureFrame(i), i);
        if (!proc.stdin.write(Buffer.from(png, 'base64'))) await once(proc.stdin, 'drain');
      }
      proc.stdin.end(); await ended; assert.deepEqual(errors, [], errors.join('\n')); fs.renameSync(temporary, destination);
    } catch (error) { proc.kill(); await ended.catch(() => {}); fs.rmSync(temporary, {force: true}); throw error; }
    console.log(`${name}: ${frames} frames at ${fps} fps`);
  } finally { await browser.close(); }
}
for (const kind of ['body', 'feet']) await capture(kind);
const checked = spawnSync('python3', [path.join(repo, 'tools/male-gait-transition/qa-video.py'), folder], {cwd: repo, stdio: 'inherit'});
if (checked.error) throw checked.error;
if (checked.status !== 0) throw Error(`Decoded-video check failed (${checked.status})`);
const info = {method: 'Actual bundled viewer, deterministic 30 fps; target run at 2.0 s, target walk at 5.4 s; one full-body and one side-foot perspective.',
  fps, framesPerVideo: frames, durationSeconds: frames / fps, dimensions: [1280, 720], audio: false,
  ffmpegVersion: version.stdout.split('\n')[0], modelSha256: hash(fs.readFileSync(path.join(folder, 'male_hands_airfoot_trial.glb'))),
  viewerSha256: hash(fs.readFileSync(path.join(folder, 'index.html'))),
  videosSha256: Object.fromEntries(['transition_preview.mp4', 'transition_feet.mp4'].map(name => [name, hash(fs.readFileSync(path.join(folder, name)))]))};
fs.writeFileSync(path.join(folder, 'capture-info.json'), JSON.stringify(info, null, 2) + '\n');
