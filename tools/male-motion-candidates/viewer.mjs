// Six independent BVH takes are drawn as schematic joint-following mannequins.
// No project mesh, weights or animation clips are loaded or changed.
import * as THREE from 'three';
import {BVHLoader} from 'three/examples/jsm/loaders/BVHLoader.js';

const data = window.MOTION_DATA;
const status = document.querySelector('#status');
const comparison = document.querySelector('#comparison');
const stages = [...document.querySelectorAll('[data-stage]')];
const cards = [...document.querySelectorAll('[data-slot]')];
const slider = document.querySelector('#phase');
const sliderValue = document.querySelector('#phase-value');
const playButton = document.querySelector('#play');
const speedSelect = document.querySelector('#speed');
const choice = document.querySelector('#choice');

const state = {
  ready: false,
  mode: 'walk',
  view: 'side',
  angle: -Math.PI / 2,
  highView: false,
  playing: true,
  speed: 1,
  picks: {walk: null, run: null},
};

try {
  const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true, preserveDrawingBuffer: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  comparison.append(renderer.domElement);

  const sphere = new THREE.SphereGeometry(1, 20, 12);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 16, 1);
  const body = new THREE.MeshStandardMaterial({color: 0xd0d9d6, roughness: .68, metalness: .06});
  const left = new THREE.MeshStandardMaterial({color: 0xd4d9ce, roughness: .7});
  const right = new THREE.MeshStandardMaterial({color: 0x90aead, roughness: .7});
  const leftJoint = new THREE.MeshStandardMaterial({color: 0xe0c59e, roughness: .6});
  const rightJoint = new THREE.MeshStandardMaterial({color: 0x7caaaa, roughness: .65});
  const upAxis = new THREE.Vector3(0, 1, 0);
  const loader = new BVHLoader();

  function makeActor(candidate) {
    const cfg = candidate.profile;
    const {skeleton, clip} = loader.parse(data.sources[candidate.id]);
    const root = skeleton.bones[0];
    const bones = new Map(skeleton.bones.map(b => [b.name, b]));
    const mixer = new THREE.AnimationMixer(root);
    const action = mixer.clipAction(clip).play();
    action.paused = true;
    const style = candidate.id.startsWith('neutral_');
    // These are actual joints of the source BVH, not a retarget to our body.
    const names = style ? {
      neck: 'Neck', head: 'Head',
      shoulder: ['LeftShoulder', 'RightShoulder'], elbow: ['LeftElbow', 'RightElbow'], wrist: ['LeftWrist', 'RightWrist'],
      thigh: ['LeftHip', 'RightHip'], knee: ['LeftKnee', 'RightKnee'], ankle: ['LeftAnkle', 'RightAnkle'], toe: ['LeftToe', 'RightToe'],
    } : {
      neck: 'Neck', head: 'Head',
      shoulder: ['LeftArm', 'RightArm'], elbow: ['LeftForeArm', 'RightForeArm'], wrist: ['LeftHand', 'RightHand'],
      thigh: ['LeftUpLeg', 'RightUpLeg'], knee: ['LeftLeg', 'RightLeg'], ankle: ['LeftFoot', 'RightFoot'], toe: ['LeftToeBase', 'RightToeBase'],
    };
    const get = name => {
      const bone = bones.get(name);
      if (!bone) throw new Error(`Missing ${name} in ${candidate.id}`);
      return bone;
    };

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x182125);
    scene.add(new THREE.HemisphereLight(0xc7e7ff, 0x35403c, 2.4));
    const light = new THREE.DirectionalLight(0xffefdb, 3);
    light.position.set(-3, 5, 4);
    scene.add(light);

    // A repeated quarter-metre grid makes the original horizontal root motion
    // visible under the centered figure. It is not a foot-locking correction.
    const tile = document.createElement('canvas');
    tile.width = tile.height = 64;
    const ctx = tile.getContext('2d');
    ctx.fillStyle = '#263638';
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = '#52655d';
    ctx.globalAlpha = .40;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(.5, 0); ctx.lineTo(.5, 64);
    ctx.moveTo(0, .5); ctx.lineTo(64, .5);
    ctx.stroke();
    const texture = new THREE.CanvasTexture(tile);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.repeat.set(14.4, 14.4); // 3.6 metres / .25 metres
    texture.anisotropy = 4;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.8, 64), new THREE.MeshBasicMaterial({map: texture, side: THREE.FrontSide}));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const figure = new THREE.Group();
    figure.rotation.y = -cfg.heading;
    scene.add(figure);
    const parts = [];
    const markers = new Map();
    function ball(which, radius, material) {
      const mesh = new THREE.Mesh(sphere, material);
      figure.add(mesh);
      parts.push({type: 'ball', which, radius, mesh});
      if (Array.isArray(which)) markers.set(`${which[0]}_${which[1]}`, mesh);
    }
    function segment(from, to, radius, material) {
      const mesh = new THREE.Mesh(cylinder, material);
      figure.add(mesh);
      parts.push({type: 'segment', from, to, radius, mesh});
    }
    function blob(type, material) {
      const mesh = new THREE.Mesh(sphere, material);
      figure.add(mesh);
      parts.push({type, mesh});
    }
    blob('torso', body); blob('pelvis', body);
    segment('shoulderMid', 'neck', .060, body);
    segment('neck', 'head', .052, body);
    ball('neck', .055, body);
    blob('head', body);
    for (let side = 0; side < 2; side++) {
      const material = side ? right : left;
      const markerMaterial = side ? rightJoint : leftJoint;
      segment(['shoulder', side], ['elbow', side], .052, material);
      segment(['elbow', side], ['wrist', side], .041, material);
      segment(['wrist', side], ['handEnd', side], .038, material);
      segment(['thigh', side], ['knee', side], .075, material);
      segment(['knee', side], ['ankle', side], .055, material);
      segment(['ankle', side], ['toeEnd', side], .047, material);
      for (const [name, radius] of [['shoulder', .057], ['elbow', .049], ['wrist', .041], ['thigh', .077], ['knee', .061], ['ankle', .051], ['handEnd', .039], ['toeEnd', .042]]) {
        ball([name, side], radius, markerMaterial);
      }
    }
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 100);
    const track = clip.tracks.find(t => t.name === 'Hips.position');
    if (!track) throw new Error(`Missing root position in ${candidate.id}`);
    const pv = track.values;
    // Sample translation independently: the mixer caches equal successive
    // samples, while we deliberately zero the visual root after each update.
    // Reading the mutated Bone again would make the ground jump on pause/seek.
    const rootPosition = track.createInterpolant(new Float32Array(3));
    const sx = pv[cfg.startFrame * 3], sz = pv[cfg.startFrame * 3 + 2];
    const dx = pv[cfg.endFrame * 3] - sx, dz = pv[cfg.endFrame * 3 + 2] - sz;
    const coords = {};
    const tmp = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), direction = new THREE.Vector3();
    const basis = new THREE.Matrix4(), rotation = new THREE.Quaternion();
    const baseHeight = .045 - cfg.floorCm * .01;
    const point = bone => bone.getWorldPosition(tmp).clone().multiplyScalar(.01).add(new THREE.Vector3(0, baseHeight, 0));
    const coord = key => Array.isArray(key) ? coords[key[0]][key[1]] : coords[key];
    const actor = {candidate, scene, camera, figure, texture, root, skeleton, clip, markers, names, elapsed: 0, exactEnd: false};

    actor.update = () => {
      const cycles = actor.exactEnd ? 0 : Math.floor(actor.elapsed / cfg.duration);
      const local = actor.exactEnd ? cfg.duration : ((actor.elapsed % cfg.duration) + cfg.duration) % cfg.duration;
      action.time = cfg.start + local;
      mixer.update(0);
      // Keep the original horizontal trajectory even when the pose is sampled
      // repeatedly at the same time (for example while paused).
      const sourcePosition = rootPosition.evaluate(cfg.start + local);
      const tx = (sourcePosition[0] - sx + cycles * dx) * .01;
      const tz = (sourcePosition[2] - sz + cycles * dz) * .01;
      const c = Math.cos(-cfg.heading), s = Math.sin(-cfg.heading);
      texture.offset.x = ((c * tx + s * tz) / .25) % 1;
      texture.offset.y = -((-s * tx + c * tz) / .25) % 1;
      root.position.x = 0;
      root.position.z = 0;
      root.updateMatrixWorld(true);
      for (const name of ['neck', 'head']) coords[name] = point(get(names[name]));
      for (const name of ['shoulder', 'elbow', 'wrist', 'thigh', 'knee', 'ankle', 'toe']) coords[name] = names[name].map(n => point(get(n)));
      coords.headEnd = point(get(names.head).children[0]);
      coords.handEnd = names.wrist.map(n => point(get(n).children[0]));
      coords.toeEnd = names.toe.map(n => point(get(n).children[0]));
      const hipMid = new THREE.Vector3().addVectors(...coords.thigh).multiplyScalar(.5);
      const shoulderMid = new THREE.Vector3().addVectors(...coords.shoulder).multiplyScalar(.5);
      coords.shoulderMid = shoulderMid;
      const up = new THREE.Vector3().subVectors(shoulderMid, hipMid).normalize();
      const x = new THREE.Vector3().subVectors(coords.shoulder[0], coords.shoulder[1]).normalize();
      const z = new THREE.Vector3().crossVectors(x, up).normalize();
      x.crossVectors(up, z).normalize();
      basis.makeBasis(x, up, z);
      rotation.setFromRotationMatrix(basis);
      for (const part of parts) {
        const mesh = part.mesh;
        if (part.type === 'ball') {
          mesh.position.copy(coord(part.which));
          mesh.scale.setScalar(part.radius);
        } else if (part.type === 'segment') {
          a.copy(coord(part.from)); b.copy(coord(part.to));
          mesh.position.addVectors(a, b).multiplyScalar(.5);
          direction.subVectors(b, a);
          mesh.quaternion.setFromUnitVectors(upAxis, direction.clone().normalize());
          mesh.scale.set(part.radius, direction.length(), part.radius);
        } else if (part.type === 'torso') {
          mesh.position.lerpVectors(hipMid, shoulderMid, .53);
          mesh.quaternion.copy(rotation);
          mesh.scale.set(.165, hipMid.distanceTo(shoulderMid) * .59, .105);
        } else if (part.type === 'pelvis') {
          mesh.position.copy(hipMid).lerp(shoulderMid, .09);
          mesh.quaternion.copy(rotation);
          mesh.scale.set(.145, .10, .09);
        } else if (part.type === 'head') {
          a.copy(coords.head); b.copy(coords.headEnd);
          mesh.position.lerpVectors(a, b, .48);
          direction.subVectors(b, a);
          mesh.quaternion.setFromUnitVectors(upAxis, direction.clone().normalize());
          mesh.scale.set(.084, direction.length() * .59, .080);
        }
      }
      figure.updateMatrixWorld(true);
    };
    return actor;
  }

  const actors = Object.fromEntries(Object.values(data.candidates).flat().map(candidate => [candidate.id, makeActor(candidate)]));
  const current = () => data.candidates[state.mode];
  let frame = 0, lastTime = null, renderedWidth = 0, renderedHeight = 0;
  function schedule() {
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function renderNow() {
    const bounds = comparison.getBoundingClientRect();
    const w = Math.max(1, Math.round(bounds.width)), h = Math.max(1, Math.round(bounds.height));
    if (w !== renderedWidth || h !== renderedHeight) {
      renderer.setSize(w, h, false);
      renderedWidth = w; renderedHeight = h;
    }
    renderer.setScissorTest(false);
    renderer.setClearColor(0, 0);
    renderer.clear(true, true, true);
    renderer.setScissorTest(true);
    current().forEach((candidate, i) => {
      const actor = actors[candidate.id];
      actor.update();
      const rect = stages[i].getBoundingClientRect();
      if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > innerHeight) return;
      const x = rect.left - bounds.left, y = bounds.bottom - rect.bottom;
      const aspect = rect.width / rect.height;
      // Keep long strides inside narrow tablet columns instead of cropping them.
      const span = Math.max(state.highView ? 2.85 : 2.38, 1.9 / aspect);
      const camera = actor.camera;
      camera.left = -span * aspect / 2; camera.right = -camera.left;
      camera.top = span / 2; camera.bottom = -span / 2;
      camera.position.set(4 * Math.sin(state.angle), state.highView ? 6.12 : 2.0, 4 * Math.cos(state.angle));
      camera.lookAt(0, 1, 0);
      camera.updateProjectionMatrix();
      renderer.setViewport(x, y, rect.width, rect.height);
      renderer.setScissor(x, y, rect.width, rect.height);
      renderer.render(actor.scene, camera);
    });
    const first = actors[current()[0].id], d = first.candidate.profile.duration;
    const fraction = first.exactEnd ? 1 : (first.elapsed % d) / d;
    slider.value = String(Math.round(fraction * 1000));
    sliderValue.textContent = `${Math.round(fraction * 100)}%`;
  }
  function tick(now) {
    frame = 0;
    if (state.playing) {
      // Keep real-time speed even if a frame is dropped. Visibility changes
      // reset the clock so a background tab does not jump ahead on return.
      const dt = lastTime === null ? 0 : Math.min((now - lastTime) / 1000, 1);
      for (const candidate of current()) {
        const actor = actors[candidate.id];
        actor.exactEnd = false;
        actor.elapsed += dt * state.speed;
      }
      lastTime = now;
    } else lastTime = null;
    renderNow();
    if (state.playing) schedule();
  }
  function setPlaying(value) {
    state.playing = !!value;
    lastTime = null;
    playButton.innerHTML = state.playing ? 'Ⅱ &nbsp; Пауза' : '▶ &nbsp; Воспроизвести';
    playButton.setAttribute('aria-label', state.playing ? 'Поставить на паузу' : 'Продолжить воспроизведение');
    schedule();
  }
  function setPhase(value) {
    const fraction = THREE.MathUtils.clamp(value, 0, 1);
    setPlaying(false);
    for (const candidate of current()) {
      const actor = actors[candidate.id];
      actor.elapsed = fraction * candidate.profile.duration;
      actor.exactEnd = fraction === 1;
    }
    renderNow();
  }
  function refreshCards() {
    current().forEach((candidate, i) => {
      const card = cards[i];
      const selected = state.picks[state.mode] === candidate.id;
      card.querySelector('.card-label').textContent = `${state.mode === 'walk' ? 'Ходьба' : 'Бег'} · вариант ${candidate.letter}`;
      card.querySelector('.card-title').textContent = candidate.title;
      card.querySelector('.card-source').textContent = `${candidate.subtitle} · ${candidate.license}`;
      card.querySelector('.letter').textContent = candidate.letter;
      card.querySelector('.stage-code').textContent = candidate.letter;
      card.querySelector('.stage').setAttribute('aria-label', `${state.mode === 'walk' ? 'Ходьба' : 'Бег'} ${candidate.letter}: ${candidate.title}. Схематичный анимированный манекен.`);
      card.querySelector('.metrics').innerHTML = `<strong>≈ ${candidate.profile.speed.toFixed(2).replace('.', ',')} м/с</strong> &nbsp;·&nbsp; ${candidate.frameRate} кадров/с &nbsp;·&nbsp; ${candidate.profile.duration.toFixed(2).replace('.', ',')} с / цикл`;
      card.querySelector('.card-desc').textContent = candidate.description;
      card.querySelector('.recommend').textContent = candidate.recommended ? 'Мой предварительный кандидат' : '\u00a0';
      const button = card.querySelector('[data-pick]');
      button.disabled = false;
      button.setAttribute('aria-pressed', String(selected));
      button.innerHTML = selected ? 'Отмечено для выбора <span aria-hidden="true">✓</span>' : `Отметить ${state.mode === 'walk' ? 'ходьбу' : 'бег'} ${candidate.letter} <span aria-hidden="true">↗</span>`;
    });
    const selectedLetter = mode => data.candidates[mode].find(c => c.id === state.picks[mode])?.letter || '—';
    choice.textContent = `Ходьба ${selectedLetter('walk')} · Бег ${selectedLetter('run')}`;
  }
  function setMode(mode) {
    if (!data.candidates[mode]) return;
    state.mode = mode;
    for (const candidate of current()) { actors[candidate.id].elapsed = 0; actors[candidate.id].exactEnd = false; }
    lastTime = null;
    for (const button of document.querySelectorAll('[data-mode]')) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    refreshCards();
    schedule();
  }
  const angles = {side: -Math.PI / 2, threequarter: -.85, front: 0, back: Math.PI, top: -.8};
  function setView(view) {
    if (!(view in angles)) return;
    state.view = view;
    state.angle = angles[view];
    state.highView = view === 'top';
    for (const button of document.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed', String(button.dataset.view === view));
    schedule();
  }
  function pick(index) {
    const candidate = current()[index];
    if (!candidate) return;
    state.picks[state.mode] = state.picks[state.mode] === candidate.id ? null : candidate.id;
    refreshCards();
  }

  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
  document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.view)));
  document.querySelectorAll('[data-pick]').forEach(button => button.addEventListener('click', () => pick(Number(button.dataset.pick))));
  playButton.addEventListener('click', () => setPlaying(!state.playing));
  slider.addEventListener('input', () => setPhase(Number(slider.value) / 1000));
  speedSelect.addEventListener('change', () => { state.speed = Number(speedSelect.value); lastTime = null; schedule(); });
  for (const stage of stages) {
    let drag = null;
    stage.addEventListener('pointerdown', event => {
      if (event.button !== 0 && event.pointerType !== 'touch') return;
      drag = {id: event.pointerId, x: event.clientX, angle: state.angle};
      stage.setPointerCapture(event.pointerId);
    });
    stage.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const delta = event.clientX - drag.x;
      if (Math.abs(delta) < 1) return;
      state.angle = drag.angle + delta * .009;
      state.view = 'custom';
      document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', 'false'));
      schedule();
    });
    const end = event => { if (drag?.id === event.pointerId) drag = null; };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    stage.addEventListener('lostpointercapture', end);
  }
  window.addEventListener('resize', schedule, {passive: true});
  window.addEventListener('scroll', schedule, {passive: true});
  document.addEventListener('visibilitychange', () => { lastTime = null; if (!document.hidden) schedule(); });
  if ('ResizeObserver' in window) new ResizeObserver(schedule).observe(comparison);

  refreshCards();
  setView('side');
  setPlaying(true);
  state.ready = true;
  status.dataset.state = 'ready';
  status.textContent = 'Исходные фрагменты готовы к сравнению';
  // Exposed for reproducible offline numerical/browser QA, not an integration API.
  window.motionReview = {state, data, actors, renderer, renderNow, setMode, setView, setPhase, setPlaying, pick};
  schedule();
} catch (error) {
  console.error(error);
  status.dataset.state = 'error';
  status.textContent = '3D-просмотр не запустился. Откройте видео сравнения ниже.';
  document.querySelector('#videos').open = true;
  window.motionReview = {state, error: String(error)};
}
