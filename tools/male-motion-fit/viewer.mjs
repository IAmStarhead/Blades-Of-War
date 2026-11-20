import {
  Scene, Color, HemisphereLight, DirectionalLight, WebGLRenderer, SRGBColorSpace,
  PerspectiveCamera, Vector3, Mesh, CircleGeometry, MeshBasicMaterial, CanvasTexture,
  RepeatWrapping, AnimationMixer, SkeletonHelper,
} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

const stage = document.querySelector('#stage'), status = document.querySelector('#status');
const buttons = [...document.querySelectorAll('button[data-motion],button[data-version],button[data-view],button[data-focus],button[data-action]')];
const slider = document.querySelector('#phase');
const state = {ready: false, motion: 'walk', version: 'selected', phase: 0, elapsed: 0, playing: false,
  slow: false, skeleton: false, movingGround: true, view: 'side', focus: 'body'};
const views = {front: 0, back: Math.PI, side: Math.PI / 2, rear45: Math.PI * .75};
const focuses = {
  body: {target: [0, .91, 0], distance: 3.75, label: 'Весь рост'},
  upper: {target: [0, 1.23, 0], distance: 2.05, label: 'Руки и торс'},
  pelvis: {bone: 'Rig_Hips', offset: [0, -.02, 0], distance: 1.60, label: 'Таз'},
  knees: {bones: ['Rig_Shin_L', 'Rig_Shin_R'], offset: [0, .02, 0], distance: 1.60, label: 'Колени'},
  feet: {bones: ['Rig_Foot_L', 'Rig_Foot_R'], offset: [0, -.01, .04], distance: 1.65, label: 'Стопы'},
  head: {bone: 'Rig_Neck', offset: [0, .06, 0], distance: 1.05, label: 'Голова и шея'},
};
// Diagnostic grid speeds for the retargeted body, not baked root motion.
// The run was reduced slightly for this rig; 3.52 m/s approximates its sampled
// support-foot speed. Horizontal sliding remains and the source was faster.
const floorSpeeds = {walk: 1.73, run: 3.52};
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
  // A repeating, one-sided floor permits inspection from below without hiding
  // feet. Its moving texture is diagnostic, not a foot-lock implementation.
  const gridCanvas = document.createElement('canvas'); gridCanvas.width = gridCanvas.height = 128;
  const ctx = gridCanvas.getContext('2d'); if (!ctx) throw Error('Canvas 2D unavailable');
  ctx.fillStyle = '#46574b'; ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#71877a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(.8, 0); ctx.lineTo(.8, 128); ctx.moveTo(0, .8); ctx.lineTo(128, .8); ctx.stroke();
  const floorTexture = new CanvasTexture(gridCanvas); floorTexture.wrapS = floorTexture.wrapT = RepeatWrapping;
  const radius = 1.75, tile = .25; floorTexture.repeat.set(radius * 2 / tile, radius * 2 / tile); floorTexture.colorSpace = SRGBColorSpace;
  const floor = new Mesh(new CircleGeometry(radius, 96), new MeshBasicMaterial({map: floorTexture}));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.001; scene.add(floor);
  const renderer = new WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6)); renderer.outputColorSpace = SRGBColorSpace;
  renderer.domElement.setAttribute('aria-label', 'Трёхмерная модель. Перетащите для вращения, используйте колесо или два пальца для масштаба.');
  stage.prepend(renderer.domElement);
  const camera = new PerspectiveCamera(35, 1, .01, 100), orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = false; orbit.enablePan = false; orbit.minDistance = .3; orbit.maxDistance = 7;
  orbit.minPolarAngle = .08; orbit.maxPolarAngle = Math.PI - .08;
  let needsRender = true;
  const invalidate = () => { needsRender = true; };
  orbit.addEventListener('change', invalidate);
  orbit.addEventListener('start', () => { state.view = null; updateControls(); });
  const modelBytes = bytesFromBase64(window.EMBEDDED_MODEL); delete window.EMBEDDED_MODEL;
  const gltf = await new GLTFLoader().parseAsync(modelBytes.buffer, ''), model = gltf.scene;
  const rig = model.getObjectByName('Rig_Root'); if (!rig) throw Error('Missing character rig');
  const rest = [];
  model.traverse(o => {
    if (o.isBone) rest.push({object: o, position: o.position.clone(), quaternion: o.quaternion.clone(), scale: o.scale.clone()});
    // Cached animated bounds can otherwise cull body pieces at a close-up.
    if (o.isSkinnedMesh) o.frustumCulled = false;
  });
  scene.add(model);
  const helper = new SkeletonHelper(rig); helper.frustumCulled = false; helper.material.depthTest = false;
  helper.material.transparent = true; helper.material.opacity = .8; helper.visible = false; scene.add(helper);
  const mixer = new AnimationMixer(model); let action = null;
  const clipName = () => state.version === 'selected' ? {walk: 'Walk_C', run: 'Run_C'}[state.motion] : {walk: 'Walk_NewBody', run: 'Run_NewBody'}[state.motion];
  const duration = () => action ? action.getClip().duration : 0;
  function restore() {
    for (const r of rest) { r.object.position.copy(r.position); r.object.quaternion.copy(r.quaternion); r.object.scale.copy(r.scale); }
  }
  function groundSpeed() { return state.version === 'selected' && state.motion !== 'stand' && state.movingGround ? floorSpeeds[state.motion] : 0; }
  function updateGround() {
    floorTexture.offset.set(0, -(state.elapsed * groundSpeed() / tile) % 1);
  }
  function targetForFocus() {
    const f = focuses[state.focus]; if (f.target) return new Vector3().fromArray(f.target);
    const names = f.bones || [f.bone], point = new Vector3();
    model.updateMatrixWorld(true);
    for (const name of names) { const bone = rig.getObjectByName(name); if (!bone) throw Error('Missing focus bone ' + name); point.add(bone.getWorldPosition(new Vector3())); }
    return point.multiplyScalar(1 / names.length).add(new Vector3().fromArray(f.offset || [0, 0, 0]));
  }
  function followFocus() {
    const target = targetForFocus(), delta = target.clone().sub(orbit.target);
    if (delta.lengthSq() > 1e-16) { orbit.target.copy(target); camera.position.add(delta); orbit.update(); }
  }
  function yaw() { return Math.atan2(camera.position.x - orbit.target.x, camera.position.z - orbit.target.z); }
  function positionCamera(angle) {
    const target = targetForFocus(), distance = focuses[state.focus].distance;
    orbit.target.copy(target); camera.position.set(target.x + distance * Math.sin(angle), target.y + distance * .07, target.z + distance * Math.cos(angle));
    camera.lookAt(target); orbit.update(); invalidate();
  }
  function samplePose() {
    if (action) { action.time = state.phase * duration(); mixer.update(0); }
    model.updateMatrixWorld(true); updateGround(); followFocus(); invalidate();
  }
  function setMotion(motion) {
    if (!['stand', 'walk', 'run'].includes(motion)) throw Error('Unknown motion');
    state.motion = motion; state.phase = 0; state.elapsed = 0;
    state.playing = motion !== 'stand' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    mixer.stopAllAction(); restore(); action = null;
    if (motion !== 'stand') {
      const clip = gltf.animations.find(a => a.name === clipName()); if (!clip) throw Error('Missing clip ' + clipName());
      action = mixer.clipAction(clip).reset().play(); action.paused = true;
    }
    samplePose(); updateControls();
  }
  function setVersion(version) {
    if (!['selected', 'previous'].includes(version)) throw Error('Unknown version');
    const oldPhase = state.phase, playing = state.playing;
    state.version = version; mixer.stopAllAction(); restore(); action = null;
    if (state.motion !== 'stand') {
      const clip = gltf.animations.find(a => a.name === clipName()); if (!clip) throw Error('Missing clip ' + clipName());
      action = mixer.clipAction(clip).reset().play(); action.paused = true;
    }
    state.phase = oldPhase; state.elapsed = oldPhase * duration(); state.playing = playing && state.motion !== 'stand';
    samplePose(); updateControls();
  }
  function setPhase(value) {
    state.phase = Math.max(0, Math.min(1, Number(value))); state.elapsed = state.phase * duration(); state.playing = false;
    samplePose(); updateControls();
  }
  function sampleSeconds(seconds) {
    if (!action) return;
    state.playing = false; state.elapsed = Math.max(0, seconds); state.phase = (state.elapsed % duration()) / duration();
    samplePose(); updateControls();
  }
  function setPlaying(playing) { state.playing = Boolean(playing) && state.motion !== 'stand'; updateControls(); }
  function chooseView(view) { if (!(view in views)) throw Error('Unknown view'); state.view = view; positionCamera(views[view]); updateControls(); }
  function chooseFocus(focus) { if (!(focus in focuses)) throw Error('Unknown focus'); const angle = yaw(); state.focus = focus; positionCamera(angle); updateControls(); }
  function updateControls() {
    for (const b of buttons) {
      if (b.dataset.motion) b.setAttribute('aria-pressed', String(b.dataset.motion === state.motion));
      if (b.dataset.version) b.setAttribute('aria-pressed', String(b.dataset.version === state.version));
      if (b.dataset.view) b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
      if (b.dataset.focus) b.setAttribute('aria-pressed', String(b.dataset.focus === state.focus));
      if (b.dataset.action === 'play') { b.textContent = state.playing ? 'Пауза' : 'Пуск'; b.disabled = !state.ready || state.motion === 'stand'; }
      if (b.dataset.action === 'slow') b.setAttribute('aria-pressed', String(state.slow));
      if (b.dataset.action === 'skeleton') { b.setAttribute('aria-pressed', String(state.skeleton)); b.textContent = state.skeleton ? 'Скрыть скелет' : 'Показать скелет'; }
      if (b.dataset.action === 'ground') {
        const available = state.version === 'selected' && state.motion !== 'stand';
        b.disabled = !state.ready || !available; b.setAttribute('aria-pressed', String(available && state.movingGround));
        b.textContent = available && state.movingGround ? 'Сетка движется' : 'Сетка неподвижна';
      }
    }
    slider.disabled = !state.ready || state.motion === 'stand'; slider.value = String(Math.round(state.phase * 1000));
    document.querySelector('#phase-value').textContent = Math.round(state.phase * 100) + '%';
    document.querySelector('#stage-title').textContent = {stand: 'Поза', walk: 'Ходьба', run: 'Бег'}[state.motion];
    document.querySelector('#stage-kicker').textContent = state.version === 'selected' ? 'Выбранная запись · C' : 'Прежние движения';
    document.querySelector('#stage-id').textContent = state.version === 'selected' ? 'C' : '↶';
    document.querySelector('#focus-label').textContent = focuses[state.focus].label;
    const speed = groundSpeed();
    document.querySelector('#floor-label').textContent = speed ? `Сетка: ≈ ${String(speed).replace('.', ',')} м/с` : 'Сетка неподвижна';
  }
  function download() {
    const url = URL.createObjectURL(new Blob([modelBytes], {type: 'model/gltf-binary'})), a = document.createElement('a');
    a.href = url; a.download = 'male_motion_C_trial.glb'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  for (const b of buttons) {
    b.disabled = false; b.addEventListener('click', () => {
      if (b.dataset.motion) setMotion(b.dataset.motion);
      else if (b.dataset.version) setVersion(b.dataset.version);
      else if (b.dataset.view) chooseView(b.dataset.view);
      else if (b.dataset.focus) chooseFocus(b.dataset.focus);
      else if (b.dataset.action === 'play') setPlaying(!state.playing);
      else if (b.dataset.action === 'slow') { state.slow = !state.slow; updateControls(); }
      else if (b.dataset.action === 'skeleton') { state.skeleton = !state.skeleton; helper.visible = state.skeleton; updateControls(); invalidate(); }
      else if (b.dataset.action === 'ground') { state.movingGround = !state.movingGround; updateGround(); updateControls(); invalidate(); }
      else if (b.dataset.action === 'download') download();
    });
  }
  slider.addEventListener('input', e => setPhase(Number(e.target.value) / 1000));
  const resize = () => {
    const width = stage.clientWidth, height = stage.clientHeight; if (!width || !height) return;
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); invalidate();
  };
  new ResizeObserver(resize).observe(stage); window.addEventListener('resize', resize);
  state.ready = true; setMotion('walk'); positionCamera(views.side); resize(); updateControls();
  status.textContent = 'Готово к просмотру'; status.dataset.state = 'ready';
  let last = null;
  document.addEventListener('visibilitychange', () => { last = null; });
  function tick(now) {
    requestAnimationFrame(tick);
    if (last !== null && state.playing && action) {
      const dt = Math.min(.1, Math.max(0, (now - last) / 1000));
      state.elapsed += dt * (state.slow ? .5 : 1); state.phase = (state.elapsed % duration()) / duration(); samplePose(); updateControls();
    }
    last = now; if (needsRender) { renderer.render(scene, camera); needsRender = false; }
  }
  requestAnimationFrame(tick);
  window.motionFit = {state, scene, camera, orbit, renderer, gltf, model, rig, helper, floor, floorTexture,
    setMotion, setVersion, setPhase, sampleSeconds, setPlaying, chooseView, chooseFocus, samplePose,
    renderNow() { renderer.render(scene, camera); needsRender = false; }};
}
start().catch(error => {
  console.error(error); status.textContent = '3D недоступно — откройте видео'; status.dataset.state = 'error';
  document.querySelector('#fallback').hidden = false;
});
