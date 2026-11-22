// Deterministically capture the actual offline viewer. Run is shown once at
// normal speed and once at half speed; the other videos use real-time steps.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const permitted = path.join(repo, 'work/male-uphill'), folder = path.resolve(process.argv[2] || permitted);
if (folder === repo || (folder.startsWith(repo + path.sep) && folder !== permitted && !folder.startsWith(permitted + path.sep)))
  throw Error('Choose this delivery or a separate scratch directory');
const require = createRequire(path.join(repo, 'tools/character-showcase/package.json'));
const puppeteer = require('puppeteer-core'), chromium = require('@sparticuz/chromium').default;
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg', version = spawnSync(ffmpeg, ['-version'], {encoding: 'utf8'});
if (version.error || version.status !== 0) throw Error('FFmpeg is required; set FFMPEG_BIN if needed');
const hash = bytes => createHash('sha256').update(bytes).digest('hex'), fps = 30;
const clips = [{kind: 'walk', name: 'uphill_walk.mp4', frames: 210}, {kind: 'run', name: 'uphill_run.mp4', frames: 210},
  {kind: 'transition', name: 'uphill_transition.mp4', frames: 180}, {kind: 'feet', name: 'uphill_feet.mp4', frames: 180}];
const markers = {};
async function capture({kind, name, frames}) {
  const browser = await puppeteer.launch({executablePath: process.env.CHROME_BIN || await chromium.executablePath(), headless: 'shell',
    args: [...chromium.args, '--allow-file-access-from-files', '--disable-dev-shm-usage'], protocolTimeout: 300000});
  try {
    const page = await browser.newPage(), errors = [];
    await page.setViewport({width: 1360, height: 940, deviceScaleFactor: 1});
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setRequestInterception(true);
    page.on('request', r => /^(file|data|blob):/i.test(r.url()) ? r.continue() : (errors.push('external request: ' + r.url()), r.abort()));
    await page.setOfflineMode(true); await page.goto(pathToFileURL(path.join(folder, 'index.html')).href, {waitUntil: 'load', timeout: 60000});
    await page.waitForFunction('window.uphillDemo?.state.ready === true', {timeout: 60000});
    await page.evaluate(which => {
      const d = uphillDemo; d.setManual(true); d.setAngle(15); d.restart(which === 'run' ? 'run' : 'walk', true);
      d.renderer.setPixelRatio(1); d.renderer.setSize(1280, 720, false); d.camera.aspect = 1280 / 720; d.camera.updateProjectionMatrix();
      d.chooseView('side'); d.chooseFocus(which === 'feet' ? 'feet' : 'body');
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
      const ctx = canvas.getContext('2d', {alpha: false, willReadFrequently: true}); window.captureMarkers = [];
      window.captureFrame = frame => {
        if (d.renderer.getContext().isContextLost()) throw Error('WebGL context lost');
        if (which === 'run' && frame === 75) { d.restart('run', true); d.setSlow(true); }
        else if (frame > 0) d.step((1 / 30) * (which === 'run' && frame > 75 ? .5 : 1));
        if ((which === 'transition' || which === 'feet') && (frame === 51 || frame === 72)) {
          d.setTarget(frame === 51 ? 'run' : 'walk');
          window.captureMarkers.push({frame, target: d.state.target, z: d.actor.position.z, slopeDegrees: d.controller.stats.slopeDegrees});
        }
        d.renderNow(); ctx.drawImage(d.renderer.domElement, 0, 0, 1280, 720);
        ctx.fillStyle = 'rgba(17,26,22,.88)'; ctx.fillRect(0, 0, 1280, 66); ctx.fillRect(0, 675, 1280, 45);
        ctx.fillStyle = '#e8d4ad'; ctx.font = 'bold 15px sans-serif'; ctx.fillText('BLADES OF WAR  /  ПОДЪЁМ НА СКЛОН 15°', 24, 22);
        let title = d.state.target === 'run' ? (d.clock.weight < .98 ? 'Ходьба → бег' : 'Бег') : (d.clock.weight > .02 ? 'Бег → ходьба' : 'Ходьба');
        if (which === 'run') title += frame >= 75 ? '  ·  повтор на ½ скорости' : '  ·  обычная скорость';
        else title += which === 'feet' ? '  ·  стопы сбоку' : '  ·  обычная скорость';
        ctx.fillStyle = '#f2f0e6'; ctx.font = '20px sans-serif'; ctx.fillText(title, 24, 50);
        ctx.fillStyle = '#d6e0d3'; ctx.font = '14px sans-serif';
        ctx.fillText('Проба: стопы не закреплены, возможно скольжение  ·  без звука', 24, 703);
        ctx.fillStyle = '#819486'; ctx.fillRect(992, 38, 180, 5); ctx.fillStyle = '#dec394'; ctx.fillRect(992, 38, 180 * d.state.progress, 5);
        ctx.fillStyle = '#d6e0d3'; ctx.font = '13px sans-serif'; ctx.fillText('Путь наверх', 992, 26);
        const [r, g, b] = ctx.getImageData(8, 85, 1, 1).data;
        if (r + g + b < 65) throw Error(`Blank 3D canvas at frame ${frame}`);
        return canvas.toDataURL('image/png').slice('data:image/png;base64,'.length);
      };
    }, kind);
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
      proc.stdin.end(); await ended; assert.deepEqual(errors, [], errors.join('\n'));
      markers[kind] = await page.evaluate(() => window.captureMarkers);
      if (kind === 'transition' || kind === 'feet') assert.ok(markers[kind].length === 2 && markers[kind].every(m => m.slopeDegrees > 14.9), JSON.stringify(markers[kind]));
      fs.renameSync(temporary, destination);
    } catch (error) { proc.kill(); await ended.catch(() => {}); fs.rmSync(temporary, {force: true}); throw error; }
    console.log(`${name}: ${frames} frames at ${fps} fps`);
  } finally { await browser.close(); }
}
for (const clip of clips) await capture(clip);
const checked = spawnSync('python3', [path.join(repo, 'tools/male-uphill/qa-video.py'), folder], {cwd: repo, stdio: 'inherit'});
if (checked.error) throw checked.error;
if (checked.status !== 0) throw Error(`Decoded-video check failed (${checked.status})`);
const info = {method: 'Actual bundled viewer, deterministic 30 fps, straight 15° course. The run repeats at half speed after 2.5 s.',
  schedule: 'Transition and feet: target run at 1.7 s, walk at 2.4 s; both switches occur on the full grade.', markers,
  fps, framesPerVideo: Object.fromEntries(clips.map(c => [c.name, c.frames])), dimensions: [1280, 720], audio: false,
  ffmpegVersion: version.stdout.split('\n')[0], modelSha256: hash(fs.readFileSync(path.join(folder, 'male_hands_airfoot_trial.glb'))),
  viewerSha256: hash(fs.readFileSync(path.join(folder, 'index.html'))),
  videosSha256: Object.fromEntries(clips.map(c => [c.name, hash(fs.readFileSync(path.join(folder, c.name)))]))};
fs.writeFileSync(path.join(folder, 'capture-info.json'), JSON.stringify(info, null, 2) + '\n');
