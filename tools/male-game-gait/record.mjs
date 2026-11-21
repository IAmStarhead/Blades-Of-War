// Render the actual isolated viewer at fixed source times: three silent 6 s
// videos at 30 fps. Fixed timestamps prevent a slow headless GPU from turning
// the run into slow motion. A capture-content test decodes every frame.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const folder = path.resolve(process.argv[2] || path.join(repo, 'work/male-game-gait'));
const permitted = path.join(repo, 'work/male-game-gait');
if (folder === repo || (folder.startsWith(repo + path.sep) && folder !== permitted && !folder.startsWith(permitted + path.sep)))
  throw Error('Choose this delivery or a separate scratch directory');
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core'), chromium = require('@sparticuz/chromium').default;
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg', version = spawnSync(ffmpeg, ['-version'], {encoding: 'utf8'});
if (version.error || version.status !== 0) throw Error('FFmpeg is required; set FFMPEG_BIN if needed');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function capture(kind) {
  const browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(), headless: 'shell',
    args: [...chromium.args, '--allow-file-access-from-files', '--disable-dev-shm-usage'], protocolTimeout: 180000});
  try {
    const page = await browser.newPage();
    await page.setViewport({width: 1360, height: 940, deviceScaleFactor: 1});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setRequestInterception(true);
    page.on('request', request => /^(file|data|blob):/i.test(request.url()) ? request.continue() : (errors.push('external request: ' + request.url()), request.abort()));
    await page.setOfflineMode(true);
    await page.goto(pathToFileURL(path.join(folder, 'index.html')).href, {waitUntil: 'load', timeout: 60000});
    await page.waitForFunction('window.motionFit?.state.ready === true', {timeout: 60000});
    await page.evaluate(() => {
      const d = window.motionFit;
      d.renderer.setPixelRatio(1);
      d.renderer.setSize(1280, 720, false);
      d.camera.aspect = 1280 / 720;
      d.camera.updateProjectionMatrix();
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
      const ctx = canvas.getContext('2d', {alpha: false, willReadFrequently: true});
      let lastMode = null, lastView = null, lastFocus = null;
      window.renderMotionFrame = (kind, seconds) => {
        if (d.renderer.getContext().isContextLost()) throw Error('WebGL context lost during capture');
        const feet = kind === 'feet', mode = feet ? (seconds < 3 ? 'walk' : 'run') : kind;
        const view = feet ? 'high' : seconds < 2 ? 'side' : seconds < 4 ? 'front' : 'front45';
        const focus = feet ? 'feet' : 'body';
        if (mode !== lastMode) { d.setMotion(mode); lastMode = mode; }
        d.setPlaying(false);
        if (focus !== lastFocus) { d.chooseFocus(focus); lastFocus = focus; }
        if (view !== lastView) { d.chooseView(view); lastView = view; }
        d.sampleSeconds(feet ? seconds % 3 : seconds);
        d.renderNow();
        ctx.drawImage(d.renderer.domElement, 0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(17,26,22,.82)'; ctx.fillRect(0, 0, 1280, 58); ctx.fillRect(0, 675, 1280, 45);
        ctx.fillStyle = '#e8d4ad'; ctx.font = 'bold 16px sans-serif'; ctx.fillText('BLADES OF WAR  /  НОВАЯ ПРОБА', 24, 23);
        ctx.fillStyle = '#f2f0e6'; ctx.font = '20px sans-serif';
        const angle = {side: 'сбоку', front: 'спереди', front45: 'спереди ¾', high: 'сверху ¾'}[view];
        ctx.fillText((mode === 'walk' ? 'Ходьба' : 'Бег') + (feet ? ' — стопы' : '') + '  ·  ' + angle, 24, 49);
        ctx.fillStyle = '#d6e0d3'; ctx.font = '14px sans-serif';
        ctx.fillText('Обычная скорость · цикл на месте · сетка приблизительная, стопы не закреплены', 24, 702);
        const [r, g, b] = ctx.getImageData(8, 85, 1, 1).data;
        if (r + g + b < 65) throw Error(`Blank 3D canvas at ${seconds.toFixed(3)}s: ${r},${g},${b}`);
        return canvas.toDataURL('image/png').slice('data:image/png;base64,'.length);
      };
    });
    const fps = 30, frames = 180, destination = path.join(folder, `${kind}_preview.mp4`);
    const temporary = path.join(folder, `.${kind}_preview.capture.mp4`);
    const proc = spawn(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-vcodec', 'png', '-i', '-',
      '-an', '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.1', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'veryfast', '-movflags', '+faststart', temporary],
      {stdio: ['pipe', 'ignore', 'pipe']});
    let stderr = ''; proc.stderr.on('data', data => { stderr += data.toString(); });
    const ended = new Promise((resolve, reject) => {
      proc.on('error', reject); proc.on('close', code => code === 0 ? resolve() : reject(Error(`FFmpeg exited ${code}: ${stderr}`)));
    });
    try {
      for (let i = 0; i < frames; i++) {
        const frame = await page.evaluate((which, time) => window.renderMotionFrame(which, time), kind, i / fps);
        if (!proc.stdin.write(Buffer.from(frame, 'base64'))) await once(proc.stdin, 'drain');
      }
      proc.stdin.end(); await ended;
      assert.deepEqual(errors, [], errors.join('\n'));
      fs.renameSync(temporary, destination);
    } catch (error) {
      proc.kill(); await ended.catch(() => {}); fs.rmSync(temporary, {force: true}); throw error;
    }
    console.log(`${destination}: ${frames} frames at ${fps} fps`);
  } finally { await browser.close(); }
}
for (const kind of ['walk', 'run', 'feet']) await capture(kind);
const checked = spawnSync('python3', [path.join(repo, 'tools/male-game-gait/qa-video.py'), folder], {cwd: repo, stdio: 'inherit'});
if (checked.error) throw checked.error;
if (checked.status !== 0) throw Error(`Decoded-video check failed (${checked.status})`);
const info = {method: 'Actual skinned viewer at fixed timestamps; side, front and three-quarter views, plus a close foot view.',
  fps: 30, framesPerVideo: 180, durationSeconds: 6, dimensions: [1280, 720], audio: false,
  ffmpegVersion: version.stdout.split('\n')[0], modelSha256: hash(fs.readFileSync(path.join(folder, 'male_game_gait_trial.glb'))),
  viewerSha256: hash(fs.readFileSync(path.join(folder, 'index.html'))),
  videosSha256: Object.fromEntries(['walk_preview.mp4', 'run_preview.mp4', 'feet_preview.mp4'].map(name => [name, hash(fs.readFileSync(path.join(folder, name)))]))};
fs.writeFileSync(path.join(folder, 'capture-info.json'), JSON.stringify(info, null, 2) + '\n');
