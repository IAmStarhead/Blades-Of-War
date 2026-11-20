import {
  Scene, Color, HemisphereLight, DirectionalLight, WebGLRenderer, SRGBColorSpace,
  PerspectiveCamera, Vector3, Mesh, CircleGeometry, MeshBasicMaterial, DoubleSide,
} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

const container = document.querySelector('#stage');
const status = document.querySelector('#status');
const buttons = [...document.querySelectorAll('[data-model], [data-view], [data-focus], [data-action]')];
const state = {model: 'new', view: 'front', focus: 'body', light: false, ready: false};
const views = {front: 0, back: Math.PI, side: Math.PI / 2, rear45: 3 * Math.PI / 4};
const focuses = {
  body: {target: [0, .91, 0], distance: 3.65, label: 'Весь рост'},
  head: {target: [0, 1.62, -.025], distance: .93, label: 'Лицо и шея'},
  pelvis: {target: [0, 1.00, 0], distance: 1.65, label: 'Живот и таз'},
  leftHand: {target: [.31, .86, .12], distance: .70, label: 'Левая кисть'},
  rightHand: {target: [-.31, .86, .12], distance: .70, label: 'Правая кисть'},
  feet: {target: [0, .10, .03], distance: 1.25, label: 'Стопы'},
};

function bytesFromBase64(text) {
  const raw = atob(text), output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

async function start() {
  const scene = new Scene();
  scene.background = new Color(0x2e3930);
  scene.add(new HemisphereLight(0xf8efe8, 0x3b4452, 1.08));
  for (const [color, intensity, position] of [
    [0xfff5ec, 1.55, [-2.6, 4.2, 4.8]],
    [0xc8dcf5, .72, [3.2, 2.5, -2]],
    [0xffffff, .38, [.2, 1.9, 5.2]],
  ]) {
    const light = new DirectionalLight(color, intensity);
    light.position.set(...position);
    scene.add(light);
  }
  const inspectionLight = new DirectionalLight(0xffffff, .75);
  inspectionLight.position.set(0, 2.2, -4);
  inspectionLight.visible = false;
  scene.add(inspectionLight);
  // A quiet pedestal provides a spatial cue, without shadows that could be
  // mistaken for changes to the model's shape.
  const platform = new Mesh(new CircleGeometry(.72, 80), new MeshBasicMaterial({color: 0x465347, side: DoubleSide}));
  platform.rotation.x = -Math.PI / 2;
  // Both static figures have their lowest point at about 0.010 m.
  platform.position.y = .0095;
  scene.add(platform);

  const renderer = new WebGLRenderer({antialias: true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.domElement.setAttribute('aria-label', 'Неподвижная трёхмерная модель. Перетащите для вращения.');
  container.prepend(renderer.domElement);
  const camera = new PerspectiveCamera(35, 1, .01, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.enablePan = false;
  controls.minDistance = .35;
  controls.maxDistance = 7;
  controls.minPolarAngle = .08;
  controls.maxPolarAngle = Math.PI - .08;
  const render = () => renderer.render(scene, camera);
  controls.addEventListener('change', render);
  controls.addEventListener('start', () => {
    state.view = null;
    updateButtons();
  });

  const modelBytes = {
    new: bytesFromBase64(window.EMBEDDED_MODELS.new),
    previous: bytesFromBase64(window.EMBEDDED_MODELS.previous),
  };
  delete window.EMBEDDED_MODELS;
  const loader = new GLTFLoader();
  const [newModel, previousModel] = await Promise.all([
    loader.parseAsync(modelBytes.new.buffer, ''),
    loader.parseAsync(modelBytes.previous.buffer, ''),
  ]);
  if (newModel.animations.length || previousModel.animations.length) throw new Error('Ожидались неподвижные модели');
  const models = {new: newModel.scene, previous: previousModel.scene};
  scene.add(models.new, models.previous);
  models.previous.visible = false;

  function updateButtons() {
    for (const button of buttons) {
      if (button.dataset.model) button.setAttribute('aria-pressed', String(button.dataset.model === state.model));
      if (button.dataset.view) button.setAttribute('aria-pressed', String(button.dataset.view === state.view));
      if (button.dataset.focus) button.setAttribute('aria-pressed', String(button.dataset.focus === state.focus));
      if (button.dataset.action === 'light') button.setAttribute('aria-pressed', String(state.light));
    }
    document.querySelector('#model-name').textContent = state.model === 'new' ? 'Новая форма' : 'Предыдущая форма';
    document.querySelector('#model-number').textContent = state.model === 'new' ? '01' : '02';
    document.querySelector('#focus-name').textContent = focuses[state.focus].label;
  }
  function currentYaw() {
    return Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
  }
  function positionCamera(yaw, focusName) {
    const {target, distance} = focuses[focusName];
    controls.target.set(...target);
    camera.position.set(target[0] + distance * Math.sin(yaw), target[1] + distance * .07,
      target[2] + distance * Math.cos(yaw));
    camera.lookAt(controls.target);
    controls.update();
    render();
  }
  function chooseModel(which) {
    if (!models[which]) throw new Error('Неизвестная модель');
    state.model = which;
    models.new.visible = which === 'new';
    models.previous.visible = which === 'previous';
    updateButtons();
    render();
  }
  function chooseView(which) {
    if (!(which in views)) throw new Error('Неизвестный ракурс');
    state.view = which;
    positionCamera(views[which], state.focus);
    updateButtons();
  }
  function chooseFocus(which) {
    if (!(which in focuses)) throw new Error('Неизвестная область');
    const yaw = currentYaw();
    state.focus = which;
    positionCamera(yaw, which);
    updateButtons();
  }
  function download() {
    const url = URL.createObjectURL(new Blob([modelBytes.new], {type: 'model/gltf-binary'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'male_static_rebuild.glb';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  for (const button of buttons) {
    button.disabled = false;
    button.addEventListener('click', () => {
      if (button.dataset.model) chooseModel(button.dataset.model);
      else if (button.dataset.view) chooseView(button.dataset.view);
      else if (button.dataset.focus) chooseFocus(button.dataset.focus);
      else if (button.dataset.action === 'light') {
        state.light = !state.light;
        inspectionLight.visible = state.light;
        updateButtons();
        render();
      } else if (button.dataset.action === 'reset') {
        state.focus = 'body';
        chooseView('front');
      } else if (button.dataset.action === 'download') download();
    });
  }
  const resize = () => {
    const width = container.clientWidth, height = container.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  };
  new ResizeObserver(resize).observe(container);
  window.addEventListener('resize', resize);
  positionCamera(views.front, 'body');
  resize();
  state.ready = true;
  updateButtons();
  status.textContent = 'Готово к просмотру';
  status.dataset.state = 'ready';
  // Small diagnostics surface for automated browser tests; no content depends
  // on the network or on a running server.
  window.staticTrial = {state, scene, camera, controls, models, renderer, chooseModel, chooseView, chooseFocus};
}
start().catch(error => {
  console.error(error);
  status.textContent = 'Не удалось открыть модель. Попробуйте другой браузер с WebGL.';
  status.dataset.state = 'error';
});
