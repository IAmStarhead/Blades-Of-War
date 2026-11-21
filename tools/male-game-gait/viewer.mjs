import {
  Scene, Color, HemisphereLight, DirectionalLight, WebGLRenderer, SRGBColorSpace,
  PerspectiveCamera, Vector3, Mesh, CircleGeometry, MeshBasicMaterial, CanvasTexture,
  RepeatWrapping, AnimationMixer, SkeletonHelper,
} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

const stage = document.querySelector('#stage'), status = document.querySelector('#status');
const buttons = [...document.querySelectorAll('button[data-motion],button[data-view],button[data-focus],button[data-action]')];
const slider = document.querySelector('#phase');
const quickButtons = [...document.querySelectorAll('button[data-quick-motion]')];
const state = {ready: false, motion: 'walk', version: 'selected', phase: 0, elapsed: 0, playing: false,
  slow: false, skeleton: false, movingGround: true, view: 'front45', focus: 'body'};
// Elevated side view avoids hiding the trailing foot behind the torso.
const views = {front: 0, back: Math.PI, side: Math.PI / 2, front45: Math.PI * .25, rear45: Math.PI * .75, high: Math.PI / 2};
const focuses = {
  body: {target: [0, .91, 0], distance: 3.75, label: 'Весь рост'},
  upper: {target: [0, 1.23, 0], distance: 2.05, label: 'Руки и торс'},
  shoulders: {bone: 'Rig_Chest', offset: [0, .07, 0], distance: 1.3, label: 'Плечи'},
  pelvis: {bone: 'Rig_Hips', offset: [0, -.02, 0], distance: 1.60, label: 'Таз и бёдра'},
  knees: {bones: ['Rig_Shin_L', 'Rig_Shin_R'], offset: [0, .02, 0], distance: 1.60, label: 'Колени'},
  feet: {bones: ['Rig_Foot_L', 'Rig_Foot_R'], offset: [0, -.01, .04], distance: 1.95, label: 'Стопы'},
  head: {bone: 'Rig_Neck', offset: [0, .06, 0], distance: 1.05, label: 'Голова и шея'},
};
// Visual reference only, inferred from near-floor samples; no foot locking.
const floorSpeeds = {walk: 1.44, run: 4.37};
function bytesFromBase64(text) {
  const raw = atob(text), out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
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
  renderer.domElement.setAttribute('aria-label', 'Трёхмерная модель. Перетащите для вращения, используйте колесо или два пальца для масштаба.');
  stage.prepend(renderer.domElement);
  const camera = new PerspectiveCamera(35, 1, .01, 100), orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = false; orbit.enablePan = false; orbit.minDistance = .3; orbit.maxDistance = 7;
  orbit.minPolarAngle = .08; orbit.maxPolarAngle = Math.PI - .08;
  let needsRender = true, last = null; const invalidate = () => { needsRender = true; };
  orbit.addEventListener('change', invalidate); orbit.addEventListener('start', () => { state.view = null; updateControls(); });

  // One embedded GLB keeps the viewer usable offline.
  const modelBytes = {selected: bytesFromBase64(window.EMBEDDED_MODEL)};
  delete window.EMBEDDED_MODEL;
  const loader = new GLTFLoader(), models = {};
  for (const [key, bytes] of Object.entries(modelBytes)) {
    const gltf = await loader.parseAsync(bytes.buffer, ''), model = gltf.scene, rig = model.getObjectByName('Rig_Root');
    if (!rig) throw Error('Missing character rig: ' + key);
    const rest = [];
    model.traverse(o => {
      if (o.isBone) rest.push({object: o, position: o.position.clone(), quaternion: o.quaternion.clone(), scale: o.scale.clone()});
      if (o.isSkinnedMesh) o.frustumCulled = false;
    });
    const helper = new SkeletonHelper(rig); helper.frustumCulled = false; helper.material.depthTest = false;
    helper.material.transparent = true; helper.material.opacity = .8; helper.visible = false;
    const mixer = new AnimationMixer(model); scene.add(model, helper);
    models[key] = {gltf, model, rig, rest, helper, mixer, action: null};
  }
  const active = () => models[state.version];
  const clipName = (key, motion) => ({walk: 'Walk_Game_Trial', run: 'Run_Game_Trial'})[motion];
  function duration() { return models.selected.action ? models.selected.action.getClip().duration : 0; }
  function restore(m) { for (const r of m.rest) { r.object.position.copy(r.position); r.object.quaternion.copy(r.quaternion); r.object.scale.copy(r.scale); } }
  function updateVisibility() {
    for (const [key, m] of Object.entries(models)) { m.model.visible = key === state.version; m.helper.visible = key === state.version && state.skeleton; }
    invalidate();
  }
  function groundSpeed() { return state.motion !== 'stand' && state.movingGround ? floorSpeeds[state.motion] : 0; }
  function updateGround() { floorTexture.offset.set(0, -(state.elapsed * groundSpeed() / tile) % 1); }
  function targetForFocus() {
    const f = focuses[state.focus]; if (f.target) return new Vector3().fromArray(f.target);
    const m = active(), names = f.bones || [f.bone], point = new Vector3(); m.model.updateMatrixWorld(true);
    for (const name of names) { const bone = m.rig.getObjectByName(name); if (!bone) throw Error('Missing focus bone ' + name); point.add(bone.getWorldPosition(new Vector3())); }
    return point.multiplyScalar(1 / names.length).add(new Vector3().fromArray(f.offset || [0, 0, 0]));
  }
  function followFocus() {
    const target = targetForFocus(), delta = target.clone().sub(orbit.target);
    if (delta.lengthSq() > 1e-16) { orbit.target.copy(target); camera.position.add(delta); orbit.update(); }
  }
  function yaw() { return Math.atan2(camera.position.x - orbit.target.x, camera.position.z - orbit.target.z); }
  function focusDistance(angle) {
    // At tablet widths the controls occupy a second column, leaving a tall,
    // narrow stage. Widen the full-body view as well as the feet view there.
    if (state.focus === 'body') return Math.max(focuses.body.distance, 2.6 / Math.max(camera.aspect, .3));
    if (state.focus !== 'feet') return focuses[state.focus].distance;
    const base = Math.max(1.95, .25 + (2.5 * Math.abs(Math.sin(angle)) + .45 * Math.abs(Math.cos(angle))) / Math.max(camera.aspect, .3));
    // A raised camera projects the extended, airborne foot further from the
    // target. Leave extra room rather than clipping toes at that preset.
    return state.view === 'high' ? base * 1.20 : base;
  }
  function positionCamera(angle) {
    const target = targetForFocus(), distance = focusDistance(angle);
    const high = state.view === 'high', horizontal = high ? .72 : 1, elevation = high ? .84 : .07;
    orbit.target.copy(target); camera.position.set(target.x + distance * horizontal * Math.sin(angle), target.y + distance * elevation, target.z + distance * horizontal * Math.cos(angle));
    camera.lookAt(target); orbit.update(); invalidate();
  }
  function samplePose() {
    for (const m of Object.values(models)) { if (m.action) { m.action.time = state.phase * m.action.getClip().duration; m.mixer.update(0); } m.model.updateMatrixWorld(true); }
    updateGround(); followFocus(); invalidate();
  }
  function setMotion(motion) {
    if (!['stand', 'walk', 'run'].includes(motion)) throw Error('Unknown motion');
    last = null;
    state.motion = motion; state.phase = 0; state.elapsed = 0;
    state.playing = motion !== 'stand' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const [key, m] of Object.entries(models)) {
      m.mixer.stopAllAction(); restore(m); m.action = null;
      if (motion !== 'stand') {
        const clip = m.gltf.animations.find(a => a.name === clipName(key, motion)); if (!clip) throw Error('Missing clip ' + clipName(key, motion));
        m.action = m.mixer.clipAction(clip).reset().play(); m.action.paused = true;
      }
    }
    samplePose(); updateControls();
  }
  function setPhase(value) {
    last = null; state.phase = Math.max(0, Math.min(1, Number(value))); state.elapsed = state.phase * duration(); state.playing = false;
    samplePose(); updateControls();
  }
  function sampleSeconds(seconds) {
    if (!models.selected.action) return;
    last = null; state.playing = false; state.elapsed = Math.max(0, seconds); state.phase = (state.elapsed % duration()) / duration();
    samplePose(); updateControls();
  }
  function setPlaying(playing) { last = null; state.playing = Boolean(playing) && state.motion !== 'stand'; updateControls(); }
  function chooseView(view) { if (!(view in views)) throw Error('Unknown view'); state.view = view; positionCamera(views[view]); updateControls(); }
  function chooseFocus(focus) { if (!(focus in focuses)) throw Error('Unknown focus'); const angle = yaw(); state.focus = focus; positionCamera(angle); updateControls(); }
  function updateControls() {
    for (const b of buttons) {
      if (b.dataset.motion) b.setAttribute('aria-pressed', String(b.dataset.motion === state.motion));
      if (b.dataset.view) b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
      if (b.dataset.focus) b.setAttribute('aria-pressed', String(b.dataset.focus === state.focus));
      if (b.dataset.action === 'play') { b.textContent = state.playing ? 'Пауза' : 'Пуск'; b.disabled = !state.ready || state.motion === 'stand'; }
      if (b.dataset.action === 'slow') b.setAttribute('aria-pressed', String(state.slow));
      if (b.dataset.action === 'skeleton') { b.setAttribute('aria-pressed', String(state.skeleton)); b.textContent = state.skeleton ? 'Скрыть скелет' : 'Показать скелет'; }
      if (b.dataset.action === 'ground') {
        const available = state.motion !== 'stand'; b.disabled = !state.ready || !available;
        b.setAttribute('aria-pressed', String(available && state.movingGround));
        b.textContent = available && state.movingGround ? 'Сетка движется' : 'Сетка неподвижна';
      }
    }
    for (const b of quickButtons) {
      if (b.dataset.quickMotion) b.setAttribute('aria-pressed', String(b.dataset.quickMotion === state.motion));
    }
    slider.disabled = !state.ready || state.motion === 'stand'; slider.value = String(Math.round(state.phase * 1000));
    document.querySelector('#phase-value').textContent = Math.round(state.phase * 100) + '%';
    document.querySelector('#stage-title').textContent = {stand: 'Поза', walk: 'Ходьба', run: 'Бег'}[state.motion];
    document.querySelector('#stage-kicker').textContent = 'Новая пара движений';
    document.querySelector('#stage-id').textContent = 'ПРОБА';
    document.querySelector('#focus-label').textContent = focuses[state.focus].label;
    const speed = groundSpeed(); document.querySelector('#floor-label').textContent = speed ? `Сетка: ≈ ${String(speed).replace('.', ',')} м/с` : 'Сетка неподвижна';
  }
  function download() {
    const url = URL.createObjectURL(new Blob([modelBytes.selected], {type: 'model/gltf-binary'})), a = document.createElement('a');
    a.href = url; a.download = 'male_game_gait_trial.glb'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  for (const b of buttons) {
    b.disabled = false; b.addEventListener('click', () => {
      if (b.dataset.motion) setMotion(b.dataset.motion);
      else if (b.dataset.view) chooseView(b.dataset.view);
      else if (b.dataset.focus) chooseFocus(b.dataset.focus);
      else if (b.dataset.action === 'play') setPlaying(!state.playing);
      else if (b.dataset.action === 'slow') { last = null; state.slow = !state.slow; updateControls(); }
      else if (b.dataset.action === 'skeleton') { state.skeleton = !state.skeleton; updateVisibility(); updateControls(); }
      else if (b.dataset.action === 'ground') { state.movingGround = !state.movingGround; updateGround(); updateControls(); invalidate(); }
      else if (b.dataset.action === 'download') download();
    });
  }
  for (const b of quickButtons) {
    b.disabled = false; b.addEventListener('click', () => {
      if (b.dataset.quickMotion) setMotion(b.dataset.quickMotion);
    });
  }
  slider.addEventListener('input', e => setPhase(Number(e.target.value) / 1000));
  const resize = () => {
    const width = stage.clientWidth, height = stage.clientHeight; if (!width || !height) return;
    const previousAspect = camera.aspect; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix();
    if ((state.focus === 'feet' || state.focus === 'body') && camera.aspect < previousAspect) {
      const offset = camera.position.clone().sub(orbit.target), minimum = focusDistance(yaw()) * (state.view === 'high' ? Math.hypot(.72, .84) : Math.hypot(1, .07));
      if (offset.length() < minimum) { camera.position.copy(orbit.target).add(offset.setLength(minimum)); orbit.update(); }
    }
    invalidate();
  };
  new ResizeObserver(resize).observe(stage); window.addEventListener('resize', resize);
  state.ready = true; setMotion('walk'); updateVisibility(); positionCamera(views.front45); resize(); updateControls();
  status.textContent = 'Готово к просмотру'; status.dataset.state = 'ready';
  document.addEventListener('visibilitychange', () => { last = null; });
  function tick(now) {
    requestAnimationFrame(tick);
    if (document.hidden) { last = null; return; }
    if (last !== null && state.playing && models.selected.action) {
      // Use elapsed wall time even if rendering is slow. Clamping to 100 ms
      // per frame made the run play in slow motion on low-frame-rate devices.
      const dt = Math.max(0, (now - last) / 1000);
      state.elapsed += dt * (state.slow ? .5 : 1); state.phase = (state.elapsed % duration()) / duration(); samplePose(); updateControls();
    }
    last = now; if (needsRender) { renderer.render(scene, camera); needsRender = false; }
  }
  requestAnimationFrame(tick);
  window.motionFit = {state, models, scene, camera, orbit, renderer, floor, floorTexture,
    get model() { return active().model; }, get rig() { return active().rig; }, get gltf() { return active().gltf; }, get helper() { return active().helper; },
    setMotion, setPhase, sampleSeconds, setPlaying, chooseView, chooseFocus, samplePose,
    renderNow() { renderer.render(scene, camera); needsRender = false; }};
}
start().catch(error => {
  console.error(error); status.textContent = '3D недоступно — откройте видео'; status.dataset.state = 'error';
  document.querySelector('#fallback').hidden = false;
});
