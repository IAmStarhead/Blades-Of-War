import {
  Scene, Color, HemisphereLight, DirectionalLight, WebGLRenderer, SRGBColorSpace,
  PerspectiveCamera, Vector3, Group, Mesh, BufferGeometry, Float32BufferAttribute,
  MeshBasicMaterial, CanvasTexture, RepeatWrapping, DoubleSide, SkeletonHelper,
} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {PhaseClock} from '../male-uphill/phase-clock.mjs';
import {RampTerrain, START, END, SPAWN, FINISH} from '../male-uphill/terrain.mjs';
import {UphillController} from '../male-uphill/uphill-controller.mjs';
import {withKneeVolume} from './knee-volume.mjs';

const stage = document.querySelector('#stage'), status = document.querySelector('#status'), slider = document.querySelector('#phase');
const buttons = [...document.querySelectorAll('button[data-motion],button[data-grade],button[data-view],button[data-focus],button[data-action],button[data-correction]')];
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = {ready: false, target: 'walk', phase: 0, weight: 0, velocity: 0, angle: 15, playing: !reduced,
  finished: false, example: false, corrected: true, slow: false, skeleton: false, view: 'side', focus: 'body', manual: false, progress: 0, altitude: 0};
const views = {side: Math.PI / 2, front45: Math.PI * .25, front: 0, back: Math.PI, rear45: Math.PI * .75};
const focuses = {
  body: {offset: [0, .92, 0], distance: 4.25, label: 'Весь рост'},
  knees: {bones: ['Rig_Shin_L', 'Rig_Shin_R'], distance: 1.8, label: 'Колени'},
  feet: {bones: ['Rig_Foot_L', 'Rig_Foot_R'], offset: [0, -.01, .04], distance: 1.95, label: 'Обе стопы'},
  footL: {bone: 'Rig_Foot_L', distance: 1.05, label: 'Левая стопа'},
  footR: {bone: 'Rig_Foot_R', distance: 1.05, label: 'Правая стопа'},
};
function bytesFromBase64(text) {
  const raw = atob(text), bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
async function start() {
  const scene = new Scene(); scene.background = new Color(0x27342c);
  scene.add(new HemisphereLight(0xf8efe8, 0x3b4452, 1.08));
  for (const [color, intensity, position] of [[0xfff5ec, 1.55, [-2.6, 4.2, 4.8]], [0xc8dcf5, .72, [3.2, 2.5, -2]], [0xffffff, .38, [.2, 1.9, 5.2]]]) {
    const light = new DirectionalLight(color, intensity); light.position.set(...position); scene.add(light);
  }
  const gridCanvas = document.createElement('canvas'); gridCanvas.width = gridCanvas.height = 128;
  const ctx = gridCanvas.getContext('2d'); if (!ctx) throw Error('Canvas 2D unavailable');
  ctx.fillStyle = '#46574b'; ctx.fillRect(0, 0, 128, 128); ctx.strokeStyle = '#82988a'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(.8, 0); ctx.lineTo(.8, 128); ctx.moveTo(0, .8); ctx.lineTo(128, .8); ctx.stroke();
  const floorTexture = new CanvasTexture(gridCanvas); floorTexture.wrapS = floorTexture.wrapT = RepeatWrapping; floorTexture.colorSpace = SRGBColorSpace;
  const terrain = new RampTerrain(state.angle); let ground = null;
  function rebuildGround() {
    if (ground) { scene.remove(ground); ground.geometry.dispose(); ground.material.dispose(); }
    const positions = [], uvs = [], indices = [], segments = 400;
    for (let i = 0; i <= segments; i++) {
      const z = -5 + i * 14 / segments;
      for (const x of [-4, 4]) { positions.push(x, terrain.height(x, z) - .001, z); uvs.push(x * 2, z * 2); }
    }
    for (let i = 0; i < segments; i++) { const a = 2 * i; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
    ground = new Mesh(geometry, new MeshBasicMaterial({map: floorTexture, side: DoubleSide})); scene.add(ground);
  }
  rebuildGround();
  const renderer = new WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6)); renderer.outputColorSpace = SRGBColorSpace;
  renderer.domElement.setAttribute('aria-label', 'Трёхмерный подъём на склон. Перетащите для вращения; колесо или два пальца меняют масштаб.');
  stage.prepend(renderer.domElement);
  const camera = new PerspectiveCamera(35, 1, .01, 150), orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = false; orbit.enablePan = false; orbit.minDistance = .3; orbit.maxDistance = 55;
  orbit.minPolarAngle = .08; orbit.maxPolarAngle = Math.PI - .08;
  let needsRender = true, last = null;
  const invalidate = () => { needsRender = true; };
  orbit.addEventListener('change', invalidate); orbit.addEventListener('start', () => { state.view = null; updateControls(); });
  const modelBytes = bytesFromBase64(window.EMBEDDED_MODEL); delete window.EMBEDDED_MODEL;
  const gltf = await new GLTFLoader().parseAsync(modelBytes.buffer, ''), model = gltf.scene, rig = model.getObjectByName('Rig_Root');
  if (!rig) throw Error('Missing character rig');
  model.traverse(o => { if (o.isSkinnedMesh) o.frustumCulled = false; });
  const actor = new Group(); actor.add(model); scene.add(actor);
  const helper = new SkeletonHelper(rig); helper.frustumCulled = false; helper.material.depthTest = false;
  helper.material.transparent = true; helper.material.opacity = .8; helper.visible = false; scene.add(helper);
  const VolumeUphillController = withKneeVolume(UphillController);
  const controller = new VolumeUphillController(actor, model, gltf.animations, terrain), clock = controller.clock;
  controller.reset('walk', 0, SPAWN);
  function syncState() {
    state.phase = clock.phase; state.weight = clock.weight; state.velocity = clock.velocity;
    state.target = clock.target ? 'run' : 'walk';
    state.progress = Math.max(0, Math.min(1, (actor.position.z - SPAWN) / (FINISH - SPAWN)));
    state.altitude = terrain.height(actor.position.x, actor.position.z);
  }
  function targetForFocus() {
    if (state.view === 'overview') {
      const z = (START + END) / 2; return new Vector3(0, terrain.height(0, z) + .7, z);
    }
    const f = focuses[state.focus];
    if (f.offset && !f.bones && !f.bone) return actor.position.clone().add(new Vector3().fromArray(f.offset));
    const names = f.bones || [f.bone], point = new Vector3(); model.updateWorldMatrix(true, true);
    for (const name of names) { const bone = rig.getObjectByName(name); if (!bone) throw Error('Missing focus bone ' + name); point.add(bone.getWorldPosition(new Vector3())); }
    return point.multiplyScalar(1 / names.length).add(new Vector3().fromArray(f.offset || [0, 0, 0]));
  }
  function followFocus() {
    if (state.view === 'overview') return;
    const target = targetForFocus(), delta = target.clone().sub(orbit.target);
    if (delta.lengthSq() > 1e-16) { orbit.target.copy(target); camera.position.add(delta); orbit.update(); }
  }
  function yaw() { return Math.atan2(camera.position.x - orbit.target.x, camera.position.z - orbit.target.z); }
  function focusDistance(angle) {
    if (state.focus === 'body') return Math.max(4.25, 2.7 / Math.max(camera.aspect, .3));
    if (state.focus === 'knees') return Math.max(1.8, 1.3 / Math.max(camera.aspect, .3));
    if (['footL', 'footR'].includes(state.focus)) return Math.max(1.05, .77 / Math.max(camera.aspect, .3));
    return Math.max(1.95, .25 + (2.5 * Math.abs(Math.sin(angle)) + .45 * Math.abs(Math.cos(angle))) / Math.max(camera.aspect, .3));
  }
  function positionCamera(angle) {
    const target = targetForFocus();
    if (state.view === 'overview') {
      const distance = Math.max(13, 18 / Math.max(camera.aspect, .3));
      orbit.target.copy(target); camera.position.set(target.x + distance, target.y + distance * .38, target.z);
    } else {
      const distance = focusDistance(angle); orbit.target.copy(target);
      camera.position.set(target.x + distance * Math.sin(angle), target.y + distance * .14, target.z + distance * Math.cos(angle));
    }
    camera.lookAt(target); orbit.update(); invalidate();
  }
  function chooseView(view) {
    if (view !== 'overview' && !(view in views)) throw Error('Unknown view');
    state.view = view; positionCamera(view === 'overview' ? Math.PI / 2 : views[view]); updateControls();
  }
  function chooseFocus(focus) {
    if (!(focus in focuses)) throw Error('Unknown focus');
    const angle = state.view === 'overview' ? Math.PI / 2 : yaw(); state.focus = focus;
    if (state.view === 'overview') state.view = 'side';
    positionCamera(angle); updateControls();
  }
  function updateControls() {
    syncState();
    for (const b of buttons) {
      if (b.dataset.motion) b.setAttribute('aria-pressed', String(b.dataset.motion === state.target));
      if (b.dataset.grade) b.setAttribute('aria-pressed', String(Number(b.dataset.grade) === state.angle));
      if (b.dataset.view) b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
      if (b.dataset.focus) b.setAttribute('aria-pressed', String(b.dataset.focus === state.focus && state.view !== 'overview'));
      if (b.dataset.correction) b.setAttribute('aria-pressed', String((b.dataset.correction === 'after') === state.corrected));
      if (b.dataset.action === 'play') { b.textContent = state.playing ? 'Пауза' : state.finished ? 'Ещё раз' : 'Пуск'; b.disabled = !state.ready; }
      if (b.dataset.action === 'slow') b.setAttribute('aria-pressed', String(state.slow));
      if (b.dataset.action === 'skeleton') { b.setAttribute('aria-pressed', String(state.skeleton)); b.textContent = state.skeleton ? 'Скрыть скелет' : 'Показать скелет'; }
    }
    slider.disabled = !state.ready; slider.value = String(Math.round(clock.phase * 1000));
    document.querySelector('#phase-value').textContent = Math.round(clock.phase * 100) + '%';
    document.querySelector('#progress').value = Math.round(state.progress * 100);
    document.querySelector('#progress-value').textContent = Math.round(state.progress * 100) + '%';
    document.querySelector('#blend-value').textContent = Math.round(clock.weight * 100) + '%';
    document.querySelector('#blend').value = Math.round(clock.weight * 100);
    const transitioning = state.target === 'run' ? clock.weight < .98 : clock.weight > .02;
    const title = transitioning ? (state.target === 'run' ? 'Ходьба → бег' : 'Бег → ходьба') : state.target === 'run' ? 'Бег' : 'Ходьба';
    document.querySelector('#stage-title').textContent = title;
    document.querySelector('#stage-kicker').textContent = state.angle ? `Подъём · склон ${state.angle}°` : 'Движение по ровной земле';
    document.querySelector('#focus-label').textContent = state.view === 'overview' ? 'Весь маршрут' : focuses[state.focus].label;
    document.querySelector('#height-label').textContent = `Высота: +${state.altitude.toFixed(2).replace('.', ',')} м`;
    const message = state.example ? 'Кадр для сравнения · пауза' : state.finished ? 'Подъём завершён · нажмите «Ещё раз»' : !state.playing ? 'Пауза · нажмите «Пуск»' : 'Персонаж движется по поверхности';
    if (status.textContent !== message) status.textContent = message;
    status.dataset.state = 'ready';
  }
  function afterPose() { followFocus(); updateControls(); invalidate(); }
  function predictedDistance(dt) {
    const probe = new PhaseClock(clock.walkDuration, clock.runDuration);
    Object.assign(probe, {phase: clock.phase, weight: clock.weight, velocity: clock.velocity, target: clock.target, distance: clock.distance});
    probe.step(dt); return probe.distance - clock.distance;
  }
  function advance(dt) {
    if (!(Number.isFinite(dt) && dt >= 0)) throw Error('Invalid elapsed time');
    if (state.finished) return;
    const remaining = Math.max(0, FINISH - actor.position.z);
    if (dt > 0 && predictedDistance(dt) >= remaining) {
      let lo = 0, hi = dt;
      for (let i = 0; i < 32; i++) { const mid = (lo + hi) / 2; if (predictedDistance(mid) < remaining) lo = mid; else hi = mid; }
      controller.step(hi); state.finished = true; state.playing = false; last = null;
    } else controller.step(dt);
    afterPose();
  }
  function synchronizeNow() {
    if (last !== null && state.playing && !state.manual && !document.hidden) {
      const now = performance.now(), dt = Math.max(0, (now - last) / 1000);
      advance(dt * (state.slow ? .5 : 1)); last = now;
    }
  }
  function restart(mode = state.target, play = true) {
    last = null; state.finished = false; state.example = false; state.playing = Boolean(play);
    controller.reset(mode, 0, SPAWN); afterPose();
  }
  function setCorrection(enabled) {
    synchronizeNow(); controller.setVolumeEnabled(enabled); state.corrected = enabled; updateControls(); invalidate();
  }
  function examplePose() {
    synchronizeNow(); last = null;
    state.angle = 15; terrain.setAngle(15); rebuildGround();
    // Matches the pose reached by a run from the standard spawn at the end of
    // the 15° route. The phase offset is already handled by PhaseClock.
    controller.reset('run', .9020178539918424, FINISH);
    state.finished = true; state.example = true; state.playing = false;
    chooseView('side'); chooseFocus('knees'); afterPose();
  }
  function setTarget(mode) {
    synchronizeNow(); if (state.finished) { restart(mode, true); return; }
    controller.setTarget(mode); updateControls();
  }
  function setPlaying(playing) {
    synchronizeNow();
    if (state.finished && playing) { restart(state.target, true); return; }
    state.playing = Boolean(playing); last = null; updateControls();
  }
  function setAngle(angle) {
    synchronizeNow();
    if (![0, 10, 15, 20].includes(angle)) throw Error('Unknown test slope');
    state.angle = angle; terrain.setAngle(angle); rebuildGround(); restart(state.target, true);
    if (state.view === 'overview') positionCamera(Math.PI / 2);
  }
  function setPhase(phase) { synchronizeNow(); state.example = false; state.playing = false; last = null; controller.setPhase(phase); afterPose(); }
  function setSlow(slow) { synchronizeNow(); state.slow = Boolean(slow); last = null; updateControls(); }
  function setManual(manual) { synchronizeNow(); state.manual = Boolean(manual); last = null; }
  function download() {
    const url = URL.createObjectURL(new Blob([modelBytes], {type: 'model/gltf-binary'})), a = document.createElement('a');
    a.href = url; a.download = 'male_leg_volume_trial.glb'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  for (const b of buttons) {
    b.disabled = false; b.addEventListener('click', () => {
      if (b.dataset.motion) setTarget(b.dataset.motion);
      else if (b.dataset.correction) setCorrection(b.dataset.correction === 'after');
      else if (b.dataset.grade) setAngle(Number(b.dataset.grade));
      else if (b.dataset.view) chooseView(b.dataset.view);
      else if (b.dataset.focus) chooseFocus(b.dataset.focus);
      else if (b.dataset.action === 'play') setPlaying(!state.playing);
      else if (b.dataset.action === 'restart') { synchronizeNow(); restart(state.target, true); }
      else if (b.dataset.action === 'example') examplePose();
      else if (b.dataset.action === 'slow') setSlow(!state.slow);
      else if (b.dataset.action === 'skeleton') { state.skeleton = !state.skeleton; helper.visible = state.skeleton; updateControls(); invalidate(); }
      else if (b.dataset.action === 'download') download();
    });
  }
  slider.addEventListener('input', e => setPhase(Number(e.target.value) / 1000));
  const resize = () => {
    const width = stage.clientWidth, height = stage.clientHeight; if (!width || !height) return;
    const previousAspect = camera.aspect; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
    if (state.view === 'overview' && camera.aspect < previousAspect) positionCamera(Math.PI / 2);
    else if (state.view !== 'overview' && camera.aspect < previousAspect) {
      const offset = camera.position.clone().sub(orbit.target), minimum = focusDistance(yaw()) * Math.hypot(1, .14);
      if (offset.length() < minimum) { camera.position.copy(orbit.target).add(offset.setLength(minimum)); orbit.update(); }
    }
    invalidate();
  };
  new ResizeObserver(resize).observe(stage); window.addEventListener('resize', resize);
  state.ready = true; positionCamera(views.side); resize(); updateControls();
  document.addEventListener('visibilitychange', () => { last = null; });
  function tick(now) {
    requestAnimationFrame(tick); if (document.hidden) { last = null; return; }
    if (last !== null && state.playing && !state.manual) advance(Math.max(0, (now - last) / 1000) * (state.slow ? .5 : 1));
    last = now; if (needsRender) { renderer.render(scene, camera); needsRender = false; }
  }
  requestAnimationFrame(tick);
  window.uphillDemo = {state, actor, model, rig, gltf, scene, camera, orbit, renderer, terrain, controller, clock, helper,
    setTarget, setPhase, setPlaying, setAngle, setSlow, setManual, setCorrection, examplePose, restart, step: advance, chooseView, chooseFocus,
    get ground() { return ground; }, renderNow() { renderer.render(scene, camera); needsRender = false; }};
}
start().catch(error => {
  console.error(error); status.textContent = '3D недоступно — откройте видео'; status.dataset.state = 'error';
  document.querySelector('#fallback').hidden = false;
});
