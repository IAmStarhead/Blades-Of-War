import {
  Scene, Color, HemisphereLight, DirectionalLight, WebGLRenderer, SRGBColorSpace,
  PerspectiveCamera, Vector3, Mesh, CircleGeometry, MeshBasicMaterial, CanvasTexture,
  RepeatWrapping, SkeletonHelper,
} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {LocomotionTransition} from './locomotion-three.mjs';

const stage = document.querySelector('#stage'), status = document.querySelector('#status');
const buttons = [...document.querySelectorAll('button[data-motion],button[data-view],button[data-focus],button[data-action]')];
const slider = document.querySelector('#phase');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = {ready: false, target: 'walk', phase: 0, weight: 0, velocity: 0, playing: !reducedMotion,
  auto: !reducedMotion, autoTime: 0, slow: false, skeleton: false, movingGround: true, view: 'front45', focus: 'body', manual: false, lift: 0};
const views = {front: 0, back: Math.PI, side: Math.PI / 2, front45: Math.PI * .25, rear45: Math.PI * .75, high: Math.PI / 2, highFront: 0};
const focuses = {
  body: {target: [0, .91, 0], distance: 3.75, label: 'Весь рост'},
  upper: {target: [0, 1.23, 0], distance: 2.05, label: 'Руки и торс'},
  hands: {bones: ['Rig_Hand_L', 'Rig_Hand_R'], distance: 1.55, label: 'Обе кисти'},
  feet: {bones: ['Rig_Foot_L', 'Rig_Foot_R'], offset: [0, -.01, .04], distance: 1.95, label: 'Стопы'},
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
  ctx.fillStyle = '#46574b'; ctx.fillRect(0, 0, 128, 128); ctx.strokeStyle = '#71877a'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(.8, 0); ctx.lineTo(.8, 128); ctx.moveTo(0, .8); ctx.lineTo(128, .8); ctx.stroke();
  const floorTexture = new CanvasTexture(gridCanvas); floorTexture.wrapS = floorTexture.wrapT = RepeatWrapping;
  const radius = 1.75, tile = .25; floorTexture.repeat.set(radius * 2 / tile, radius * 2 / tile); floorTexture.colorSpace = SRGBColorSpace;
  const floor = new Mesh(new CircleGeometry(radius, 96), new MeshBasicMaterial({map: floorTexture})); floor.rotation.x = -Math.PI / 2; floor.position.y = -.001; scene.add(floor);
  const renderer = new WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6)); renderer.outputColorSpace = SRGBColorSpace;
  renderer.domElement.setAttribute('aria-label', 'Трёхмерная модель. Перетащите для вращения; колесо или два пальца меняют масштаб.');
  stage.prepend(renderer.domElement);
  const camera = new PerspectiveCamera(35, 1, .01, 100), orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = false; orbit.enablePan = false; orbit.minDistance = .3; orbit.maxDistance = 7;
  orbit.minPolarAngle = .08; orbit.maxPolarAngle = Math.PI - .08;
  let needsRender = true, last = null, gridDistance = 0;
  const invalidate = () => { needsRender = true; };
  orbit.addEventListener('change', invalidate); orbit.addEventListener('start', () => { state.view = null; updateControls(); });

  const modelBytes = bytesFromBase64(window.EMBEDDED_MODEL); delete window.EMBEDDED_MODEL;
  const gltf = await new GLTFLoader().parseAsync(modelBytes.buffer, ''), model = gltf.scene, rig = model.getObjectByName('Rig_Root');
  if (!rig) throw Error('Missing character rig');
  model.traverse(o => { if (o.isSkinnedMesh) o.frustumCulled = false; });
  scene.add(model);
  const helper = new SkeletonHelper(rig); helper.frustumCulled = false; helper.material.depthTest = false;
  helper.material.transparent = true; helper.material.opacity = .8; helper.visible = false; scene.add(helper);
  const locomotion = new LocomotionTransition(model, gltf.animations), clock = locomotion.clock;

  function syncState() {
    state.phase = clock.phase; state.weight = clock.weight; state.velocity = clock.velocity;
    state.target = clock.target ? 'run' : 'walk'; state.lift = locomotion.floor.lift;
  }
  function updateGround() { floorTexture.offset.set(0, -(gridDistance / tile) % 1); }
  function targetForFocus() {
    const f = focuses[state.focus]; if (f.target) return new Vector3().fromArray(f.target);
    const names = f.bones || [f.bone], point = new Vector3(); model.updateWorldMatrix(true, true);
    for (const name of names) { const bone = rig.getObjectByName(name); if (!bone) throw Error('Missing focus bone ' + name); point.add(bone.getWorldPosition(new Vector3())); }
    return point.multiplyScalar(1 / names.length).add(new Vector3().fromArray(f.offset || [0, 0, 0]));
  }
  function followFocus() {
    const target = targetForFocus(), delta = target.clone().sub(orbit.target);
    if (delta.lengthSq() > 1e-16) { orbit.target.copy(target); camera.position.add(delta); orbit.update(); }
  }
  function yaw() { return Math.atan2(camera.position.x - orbit.target.x, camera.position.z - orbit.target.z); }
  function focusDistance(angle) {
    if (state.focus === 'body') return Math.max(3.75, 2.6 / Math.max(camera.aspect, .3));
    if (state.focus === 'hands') return Math.max(1.55, 1.70 / Math.max(camera.aspect, .3));
    if (['footL', 'footR'].includes(state.focus)) return Math.max(1.05, .77 / Math.max(camera.aspect, .3));
    if (state.focus !== 'feet') return focuses[state.focus].distance;
    const base = Math.max(1.95, .25 + (2.5 * Math.abs(Math.sin(angle)) + .45 * Math.abs(Math.cos(angle))) / Math.max(camera.aspect, .3));
    return state.view === 'high' ? base * 1.20 : state.view === 'highFront' ? base * .96 : base;
  }
  function positionCamera(angle) {
    const target = targetForFocus(), distance = focusDistance(angle), high = ['high', 'highFront'].includes(state.view);
    const horizontal = state.view === 'highFront' ? .62 : high ? .72 : 1, elevation = state.view === 'highFront' ? 1.25 : high ? .84 : .07;
    orbit.target.copy(target); camera.position.set(target.x + distance * horizontal * Math.sin(angle), target.y + distance * elevation, target.z + distance * horizontal * Math.cos(angle));
    camera.lookAt(target); orbit.update(); invalidate();
  }
  function chooseView(view) { if (!(view in views)) throw Error('Unknown view'); state.view = view; positionCamera(views[view]); updateControls(); }
  function chooseFocus(focus) { if (!(focus in focuses)) throw Error('Unknown focus'); const angle = yaw(); state.focus = focus; positionCamera(angle); updateControls(); }
  function updateControls() {
    syncState();
    for (const b of buttons) {
      if (b.dataset.motion) b.setAttribute('aria-pressed', String(b.dataset.motion === state.target));
      if (b.dataset.view) b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
      if (b.dataset.focus) b.setAttribute('aria-pressed', String(b.dataset.focus === state.focus));
      if (b.dataset.action === 'play') { b.textContent = state.playing ? 'Пауза' : 'Пуск'; b.disabled = !state.ready; }
      if (b.dataset.action === 'auto') { b.setAttribute('aria-pressed', String(state.auto)); b.textContent = state.auto ? 'Автопоказ: вкл' : 'Автопоказ: выкл'; }
      if (b.dataset.action === 'slow') b.setAttribute('aria-pressed', String(state.slow));
      if (b.dataset.action === 'skeleton') { b.setAttribute('aria-pressed', String(state.skeleton)); b.textContent = state.skeleton ? 'Скрыть скелет' : 'Показать скелет'; }
      if (b.dataset.action === 'ground') { b.setAttribute('aria-pressed', String(state.movingGround)); b.textContent = state.movingGround ? 'Сетка движется' : 'Сетка неподвижна'; }
    }
    slider.disabled = !state.ready; slider.value = String(Math.round(clock.phase * 1000));
    document.querySelector('#phase-value').textContent = Math.round(clock.phase * 100) + '%';
    const percent = Math.round(clock.weight * 100);
    document.querySelector('#blend-value').textContent = percent + '%';
    document.querySelector('#blend').value = percent;
    const transition = state.target === 'run' ? clock.weight < .98 : clock.weight > .02;
    document.querySelector('#stage-title').textContent = transition ? (state.target === 'run' ? 'Ходьба → бег' : 'Бег → ходьба') : (state.target === 'run' ? 'Бег' : 'Ходьба');
    document.querySelector('#stage-kicker').textContent = state.auto ? 'Автопоказ · плавный переход' : 'Ручное переключение';
    document.querySelector('#focus-label').textContent = focuses[state.focus].label;
    const displaySpeed = clock.speed * (state.slow ? .5 : 1);
    document.querySelector('#floor-label').textContent = state.movingGround ? `Сетка: ≈ ${displaySpeed.toFixed(1).replace('.', ',')} м/с` : 'Сетка неподвижна';
    const message = !state.playing ? 'Пауза · нажмите «Пуск»' : state.auto ? 'Автопоказ повторяется' : 'Выберите ходьбу или бег';
    // Avoid re-announcing an unchanged live-region message every animation frame.
    if (status.textContent !== message) status.textContent = message;
    status.dataset.state = 'ready';
  }
  function afterPose() { updateGround(); followFocus(); updateControls(); invalidate(); }
  function oneStep(dt) {
    const before = clock.distance; locomotion.step(dt);
    if (state.movingGround) gridDistance += clock.distance - before;
  }
  function advance(dt) {
    if (!(Number.isFinite(dt) && dt >= 0)) throw Error('Invalid elapsed time');
    // Auto-play events happen at exact simulation times even at low FPS.
    // Manual selection cancels auto and never resets phase or blend velocity.
    let remaining = dt;
    while (state.auto && remaining > 1e-10) {
      const next = state.autoTime < 2 ? 2 : state.autoTime < 5.4 ? 5.4 : 8.5;
      const part = Math.min(remaining, next - state.autoTime);
      if (part > 0) { oneStep(part); state.autoTime += part; remaining -= part; }
      if (state.autoTime >= next - 1e-9) {
        if (next === 2) locomotion.setTarget('run');
        else if (next === 5.4) locomotion.setTarget('walk');
        else { state.autoTime = 0; locomotion.setTarget('walk'); }
      }
    }
    if (!state.auto && remaining > 0) oneStep(remaining);
    if (dt === 0) locomotion.apply();
    afterPose();
  }
  function synchronizeNow() {
    if (last !== null && state.playing && !state.manual && !document.hidden) {
      const now = performance.now(), dt = Math.max(0, (now - last) / 1000);
      advance(dt * (state.slow ? .5 : 1)); last = now;
    }
  }
  function setTarget(mode) {
    synchronizeNow(); state.auto = false; locomotion.setTarget(mode); updateControls();
  }
  function setPlaying(playing) { synchronizeNow(); state.playing = Boolean(playing); last = null; updateControls(); }
  function setAuto(auto) {
    synchronizeNow(); state.auto = Boolean(auto);
    if (state.auto) { state.autoTime = 0; locomotion.setTarget('walk'); state.playing = true; }
    last = null; updateControls();
  }
  function setPhase(phase) {
    synchronizeNow(); state.auto = false; state.playing = false; last = null;
    locomotion.setPhase(phase); afterPose();
  }
  function setSlow(slow) { synchronizeNow(); state.slow = Boolean(slow); last = null; updateControls(); }
  // Explicit reset/manual stepping are used by the capture and QA, not by the
  // walk/run buttons. Neither the user's switch nor reversal calls reset().
  function reset(mode = 'walk', phase = 0) {
    state.auto = false; state.autoTime = 0; state.playing = false; last = null; gridDistance = 0;
    locomotion.reset(mode, phase); afterPose();
  }
  function setManual(manual) { synchronizeNow(); state.manual = Boolean(manual); last = null; }
  function download() {
    const url = URL.createObjectURL(new Blob([modelBytes], {type: 'model/gltf-binary'})), a = document.createElement('a');
    a.href = url; a.download = 'male_hands_airfoot_trial.glb'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  for (const b of buttons) {
    b.disabled = false; b.addEventListener('click', () => {
      if (b.dataset.motion) setTarget(b.dataset.motion);
      else if (b.dataset.view) chooseView(b.dataset.view);
      else if (b.dataset.focus) chooseFocus(b.dataset.focus);
      else if (b.dataset.action === 'play') setPlaying(!state.playing);
      else if (b.dataset.action === 'auto') setAuto(!state.auto);
      else if (b.dataset.action === 'slow') setSlow(!state.slow);
      else if (b.dataset.action === 'skeleton') { state.skeleton = !state.skeleton; helper.visible = state.skeleton; updateControls(); invalidate(); }
      else if (b.dataset.action === 'ground') { synchronizeNow(); state.movingGround = !state.movingGround; updateControls(); invalidate(); }
      else if (b.dataset.action === 'download') download();
    });
  }
  slider.addEventListener('input', e => setPhase(Number(e.target.value) / 1000));
  const resize = () => {
    const width = stage.clientWidth, height = stage.clientHeight; if (!width || !height) return;
    const previousAspect = camera.aspect; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
    if (['feet', 'body', 'hands', 'footL', 'footR'].includes(state.focus) && camera.aspect < previousAspect) {
      const offset = camera.position.clone().sub(orbit.target), minimum = focusDistance(yaw()) * (state.view === 'highFront' ? Math.hypot(.62, 1.25) : state.view === 'high' ? Math.hypot(.72, .84) : Math.hypot(1, .07));
      if (offset.length() < minimum) { camera.position.copy(orbit.target).add(offset.setLength(minimum)); orbit.update(); }
    }
    invalidate();
  };
  new ResizeObserver(resize).observe(stage); window.addEventListener('resize', resize);
  state.ready = true; updateGround(); positionCamera(views.front45); resize(); updateControls();
  document.addEventListener('visibilitychange', () => { last = null; });
  function tick(now) {
    requestAnimationFrame(tick);
    if (document.hidden) { last = null; return; }
    if (last !== null && state.playing && !state.manual) advance(Math.max(0, (now - last) / 1000) * (state.slow ? .5 : 1));
    last = now; if (needsRender) { renderer.render(scene, camera); needsRender = false; }
  }
  requestAnimationFrame(tick);
  window.transitionDemo = {state, model, rig, gltf, scene, camera, orbit, renderer, floor, floorTexture, helper, locomotion, clock,
    setTarget, setPhase, setPlaying, setAuto, setSlow, setManual, reset, step: advance, chooseView, chooseFocus,
    renderNow() { renderer.render(scene, camera); needsRender = false; }};
}
start().catch(error => {
  console.error(error); status.textContent = '3D недоступно — откройте видео'; status.dataset.state = 'error';
  document.querySelector('#fallback').hidden = false;
});
