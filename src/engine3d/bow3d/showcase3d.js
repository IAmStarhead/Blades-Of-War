/* ============================================================================
   BLADES OF WAR (КЛИНКИ ВОЙНЫ) — ИНТЕРАКТИВНЫЙ 3D-СТЕНД ПЕРСОНАЖЕЙ И ОКРУЖЕНИЯ
   Контраст двух королевств Земли Эдема:
     1) Королевство Хладных Ветров (Север, вождь Норвинг IV) — хладцы
     2) Королевство Златодвор (Центр Эдема, король Родрик II) — златодворцы
   + эталонный средневековый колодец с бочкой и щитом.
   Стабильные 60+ FPS, вращение 360°, зум, смена одежды, уборов, поз и сетки.
   ============================================================================ */

import * as THREE from "three";
import { createBowPrototype3D } from "./bowPrototype.js";
import {
  BONE_IDX,
  createBowCharacter3D,
  poseBowCharacter,
  disposeBowCharacter
} from "./bowCharacter.js";
import {
  createMedievalWell3D,
  animateMedievalWell3D
} from "./bowProp.js";
import {
  createBowHorse3D,
  animateHorse3D,
  disposeBowHorse
} from "./bowHorse.js";
import {
  buildPropAtlasCanvas,
  canvasToThreeTexture
} from "./bowTextures.js";

const STUDIO_BG_HEX = 0x2d3034;

/* ---------- СОЗДАНИЕ ОПЦИОНАЛЬНОЙ КАМЕННОЙ ПЛОЩАДКИ ПОД НОГАМИ ---------- */
function createCobblePlinth() {
  const group = new THREE.Group();
  group.name = "CobblePlinth";

  const atlasCv = buildPropAtlasCanvas();
  const atlasTex = canvasToThreeTexture(atlasCv);

  /* Верхний круг тёсаного камня (квадрант 0..0.5, 0.5..1.0) */
  const topGeo = new THREE.CylinderGeometry(2.85, 2.96, 0.12, 36, 1);
  const uv = topGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const ux = uv.getX(i) * 3.5;
    const vy = uv.getY(i) * 3.5;
    const ru = (ux > 0 && ux % 1 === 0) ? 1 : ((ux % 1) + 1) % 1;
    const rv = (vy > 0 && vy % 1 === 0) ? 1 : ((vy % 1) + 1) % 1;
    uv.setXY(i, ru * 0.48 + 0.01, 0.51 + rv * 0.48);
  }
  topGeo.translate(0, -0.062, 0);

  const stoneMat = new THREE.MeshLambertMaterial({
    map: atlasTex,
    color: 0x8f969e
  });
  const plinthMesh = new THREE.Mesh(topGeo, stoneMat);
  plinthMesh.receiveShadow = true;
  group.add(plinthMesh);

  /* Тонкий деревянно-каменный бортик подиума */
  const rimGeo = new THREE.TorusGeometry(2.87, 0.045, 8, 40);
  rimGeo.rotateX(Math.PI * 0.5);
  rimGeo.translate(0, -0.01, 0);
  const rimMat = new THREE.MeshLambertMaterial({ color: 0x454a52 });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.receiveShadow = true;
  group.add(rim);

  group.visible = false; // по умолчанию чистый сланцевый фон #2d3034 витрины дизайна
  return {
    group,
    dispose: () => {
      topGeo.dispose();
      rimGeo.dispose();
      stoneMat.dispose();
      rimMat.dispose();
      atlasTex.dispose();
    }
  };
}

/* ---------- УСТАНОВКА РЕЖИМА WIREFRAME НА ПЕРСОНАЖЕ И ОБЪЕКТЕ ---------- */
function applyWireframe(root, enabled) {
  if (!root) return;
  root.traverse((obj) => {
    if ((obj.isMesh || obj.isSkinnedMesh) && obj.material) {
      if (obj.material.transparent && obj.material.opacity < 0.5) return;
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => { m.wireframe = enabled; });
      } else {
        obj.material.wireframe = enabled;
      }
    }
  });
}

/* ---------- ГЛАВНАЯ ИНИЦИАЛИЗАЦИЯ СТЕНДА ---------- */
export function mountBowShowcase(rootEl) {
  if (!rootEl) return;

  rootEl.innerHTML = `
    <div class="pz-shell">
      <div class="pz-viewport" id="pz-viewport"></div>

      <!-- Верхняя панель статуса и метрик производительности -->
      <header class="pz-topbar">
        <div class="pz-brand">
          <span class="pz-badge">КЛИНКИ ВОЙНЫ · 3D РЕВИЗИЯ 6 · СРАВНЕНИЕ</span>
          <div class="pz-titles">
            <h1>Blades Of War · Земли Эдема: Хладные Ветра vs Златодвор</h1>
            <p id="pz-description">Прототип тела и головы: кнопка «Сравнить» в фокусе камеры</p>
          </div>
        </div>
        <div class="pz-stats" id="pz-stats">
          <span class="pz-fps" id="pz-fps">60 FPS</span>
          <span class="pz-sep">·</span>
          <span id="pz-tris">— треуг.</span>
          <span class="pz-sep">·</span>
          <span id="pz-calls">— вызовов</span>
          <a class="pz-dl-btn" id="pz-dl-btn" href="/download" download="BladesOfWar-3D-Demo.html" title="Скачать автономный 3D-пример одним HTML-файлом">Скачать HTML</a>
        </div>
      </header>

      <!-- Подсказка управления мышью/тачем -->
      <div class="pz-hint">
        <span><b>Слева:</b> Хладные Ветра (Север)</span>
        <span><b>Справа:</b> Златодвор (Центр Эдема)</span>
        <span><b>ЛКМ</b> — крутить 360°</span>
        <span><b>Колесо</b> — зум</span>
        <span><b>ПКМ</b> — сдвиг</span>
      </div>

      <!-- Нижняя панель переключения королевств, одежды, поз и ракурсов -->
      <aside class="pz-dock">
        <div class="pz-group">
          <span class="pz-label">Королевство</span>
          <div class="pz-segmented" data-role="kingdom">
            <button type="button" data-kingdom="both" class="is-active">Оба (контраст)</button>
            <button type="button" data-kingdom="north">Хладные Ветра</button>
            <button type="button" data-kingdom="eden">Златодвор</button>
          </div>
        </div>

        <div class="pz-group">
          <span class="pz-label">Комплект</span>
          <div class="pz-segmented" data-role="outfit">
            <button type="button" data-outfit="villager" class="is-active">Житель</button>
            <button type="button" data-outfit="underwear">Исподнее</button>
            <button type="button" data-outfit="warrior">Воин</button>
          </div>
        </div>

        <div class="pz-group">
          <span class="pz-label">Причёска / убор</span>
          <div class="pz-segmented" data-role="hair">
            <button type="button" data-hair="classic" class="is-active">Классика</button>
            <button type="button" data-hair="short">Короткая</button>
            <button type="button" data-hair="long">До плеч</button>
            <button type="button" data-hair="headwear">Убор</button>
          </div>
        </div>

        <div class="pz-group">
          <span class="pz-label">Анимация</span>
          <div class="pz-segmented" data-role="anim">
            <button type="button" data-anim="scene" class="is-active">Сцена</button>
            <button type="button" data-anim="idle">Стойка</button>
            <button type="button" data-anim="walk">Походка</button>
            <button type="button" data-anim="combat">Бой</button>
          </div>
        </div>

        <div class="pz-group">
          <span class="pz-label">Фокус камеры</span>
          <div class="pz-segmented" data-role="focus">
            <button type="button" data-focus="all" class="is-active">Все</button>
            <button type="button" data-focus="facesNorth">Лица Севера</button>
            <button type="button" data-focus="facesEden">Лица Центра</button>
            <button type="button" data-focus="legs">Таз / шаг</button>
            <button type="button" data-focus="compare">Сравнить</button>
            <button type="button" data-focus="compareFaces">Сравнить лица</button>
            <button type="button" data-focus="rider">Конник</button>
            <button type="button" data-focus="well">Колодец</button>
          </div>
        </div>

        <div class="pz-group">
          <span class="pz-label">Вид</span>
          <div class="pz-segmented">
            <button type="button" id="pz-btn-turntable" title="Медленное вращение сцены">360°</button>
            <button type="button" id="pz-btn-ground" title="Показать каменную площадку под ногами">Подиум</button>
            <button type="button" id="pz-btn-wire" title="Показать чистую low-poly сетку">Сетка</button>
          </div>
        </div>
      </aside>
    </div>
  `;

  /* Скрываем кнопку скачивания с сервера, если файл уже открыт локально через file:// */
  const dlBtn = rootEl.querySelector("#pz-dl-btn");
  if (dlBtn && window.location.protocol === "file:") {
    dlBtn.style.display = "none";
  }

  const viewport = rootEl.querySelector("#pz-viewport");
  const fpsEl = rootEl.querySelector("#pz-fps");
  const trisEl = rootEl.querySelector("#pz-tris");
  const callsEl = rootEl.querySelector("#pz-calls");

  /* ---------- 1. ИНИЦИАЛИЗАЦИЯ WEBGL БЕЗ ПОТЕРЬ КОНТЕКСТА И РЫВКОВ ---------- */
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
    alpha: false,
    stencil: false
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(STUDIO_BG_HEX, 1);

  const canvas = renderer.domElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.touchAction = "none";
  viewport.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(STUDIO_BG_HEX);

  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 60);

  /* ---------- 2. МЯГКОЕ ТРЁХТОЧЕЧНОЕ ОСВЕЩЕНИЕ ВИТРИНЫ ---------- */
  const hemiLight = new THREE.HemisphereLight(0xf3f6fb, 0x3b4048, 1.06);
  hemiLight.position.set(0, 6, 0);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff4e4, 1.15);
  keyLight.position.set(2.8, 5.4, 4.2);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 18;
  keyLight.shadow.camera.left = -3.8;
  keyLight.shadow.camera.right = 3.8;
  keyLight.shadow.camera.top = 3.4;
  keyLight.shadow.camera.bottom = -1.4;
  keyLight.shadow.bias = -0.0008;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xb8d0f0, 0.42);
  rimLight.position.set(-3.6, 3.2, -3.2);
  scene.add(rimLight);

  /* Невидимая плоскость приёма мягких теней на чистом студийном фоне #2d3034 */
  const shadowCatcherGeo = new THREE.PlaneGeometry(14, 14);
  shadowCatcherGeo.rotateX(-Math.PI * 0.5);
  const shadowCatcherMat = new THREE.ShadowMaterial({ opacity: 0.24 });
  const shadowCatcher = new THREE.Mesh(shadowCatcherGeo, shadowCatcherMat);
  shadowCatcher.position.y = 0.001;
  shadowCatcher.receiveShadow = true;
  scene.add(shadowCatcher);

  /* ---------- 3. СБОРКА МОДЕЛЕЙ: ХЛАДНЫЕ ВЕТРА, КОЛОДЕЦ И ЗЛАТОДВОР ---------- */
  const stageGroup = new THREE.Group();
  scene.add(stageGroup);

  const plinth = createCobblePlinth();
  stageGroup.add(plinth.group);

  const state = {
    kingdomFilter: "both",
    outfit: "villager",
    hairStyle: "classic",
    anim: "scene",
    focus: "all",
    turntable: false,
    showGround: false,
    wireframe: false,
    northFemale: null,
    northMale: null,
    edenFemale: null,
    edenMale: null,
    wellProp: null,
    horse: null,
    rider: null
  };

  /* Эталонный средневековый колодец (10/10) в сердце сцены между двумя королевствами */
  state.wellProp = createMedievalWell3D();
  state.wellProp.group.position.set(0.0, 0, -0.34);
  state.wellProp.group.rotation.y = -0.22;
  stageGroup.add(state.wellProp.group);

  /* БОЕВОЙ КОНЬ СЕВЕРА со всадником — за колодцем, в глубине сцены.
     Всадник — северянин-воин, сидит ребёнком якоря седла в позе "ride". */
  state.horse = createBowHorse3D({ kingdom: "north" });
  state.horse.group.position.set(0.35, 0, -1.72);
  state.horse.group.rotation.y = 0.55;
  stageGroup.add(state.horse.group);

  state.rider = createBowCharacter3D({
    female: false,
    kingdom: "north",
    outfit: "warrior",
    hairStyle: "classic"
  });
  /* Таз всадника садится точно в седло: опускаем группу на высоту таза позы "ride" */
  state.rider.group.position.set(0, -(state.rider.metrics.hipY - 0.012), 0.01);
  state.rider.contactShadow.visible = false; // тень даёт конь
  state.horse.saddleAnchor.add(state.rider.group);
  poseBowCharacter(state.rider, "ride", 0);
  // Два независимых повода от уздечки до кистей, обновляются вместе с позой.
  const reinMaterial = new THREE.LineBasicMaterial({ color: 0x39271a });
  const reins = [1, -1].map(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9), 3));
    const line = new THREE.Line(geometry, reinMaterial);
    line.frustumCulled = false;
    state.horse.group.add(line);
    return line;
  });
  function updateReins() {
    state.horse.group.updateWorldMatrix(true, true);
    reins.forEach((line, i) => {
      const side = i === 0 ? 1 : -1;
      const from = state.horse.parts.headPivot.localToWorld(new THREE.Vector3(side * 0.075, -0.025, 0.18));
      const hand = state.rider.bones[i === 0 ? BONE_IDX.HAND_L : BONE_IDX.HAND_R];
      const to = hand.localToWorld(new THREE.Vector3(0, -0.04, 0.01));
      state.horse.group.worldToLocal(from);
      state.horse.group.worldToLocal(to);
      const middle = from.clone().lerp(to, 0.5);
      middle.y -= 0.08;
      const pos = line.geometry.attributes.position;
      [from, middle, to].forEach((v, j) => pos.setXYZ(j, v.x, v.y, v.z));
      pos.needsUpdate = true;
    });
  }
  updateReins();

  // Отдельная сцена сравнения: слева направо старая/новая женщина,
  // старый/новый мужчина. Старые модели на основной сцене не меняются.
  const compareGroup = new THREE.Group();
  compareGroup.position.z = 5;
  compareGroup.visible = false;
  stageGroup.add(compareGroup);
  const comparePlinth = createCobblePlinth();
  compareGroup.add(comparePlinth.group);
  const compareRigs = [
    createBowCharacter3D({ female: true, kingdom: "north", outfit: "underwear" }),
    createBowPrototype3D({ female: true, kingdom: "north" }),
    createBowCharacter3D({ female: false, kingdom: "north", outfit: "underwear" }),
    createBowPrototype3D({ female: false, kingdom: "north" })
  ];
  compareRigs.forEach((rig, i) => {
    rig.group.position.set((i - 1.5) * 0.55, 0, 0);
    compareGroup.add(rig.group);
  });

  function allRigs() {
    return [state.northFemale, state.northMale, state.edenFemale, state.edenMale].filter(Boolean);
  }

  function rebuildCharacters(outfit) {
    allRigs().forEach((rig) => {
      stageGroup.remove(rig.group);
      disposeBowCharacter(rig);
    });

    /* 1. КОРОЛЕВСТВО ХЛАДНЫХ ВЕТРОВ (СЕВЕР, НОРВИНГ IV) — СЛЕВА */
    state.northFemale = createBowCharacter3D({
      female: true,
      kingdom: "north",
      outfit,
      hairStyle: state.hairStyle
    });
    state.northFemale.group.position.set(-1.66, 0, 0.16);
    state.northFemale.group.rotation.y = 0.18;
    stageGroup.add(state.northFemale.group);

    state.northMale = createBowCharacter3D({
      female: false,
      kingdom: "north",
      outfit,
      hairStyle: state.hairStyle
    });
    state.northMale.group.position.set(-0.98, 0, 0.24);
    state.northMale.group.rotation.y = 0.08;
    stageGroup.add(state.northMale.group);

    /* 2. КОРОЛЕВСТВО ЗЛАТОДВОР (ЦЕНТР ЗЕМЛИ ЭДЕМА, РОДРИК II) — СПРАВА */
    state.edenFemale = createBowCharacter3D({
      female: true,
      kingdom: "eden",
      outfit,
      hairStyle: state.hairStyle
    });
    state.edenFemale.group.position.set(0.98, 0, 0.24);
    state.edenFemale.group.rotation.y = -0.08;
    stageGroup.add(state.edenFemale.group);

    state.edenMale = createBowCharacter3D({
      female: false,
      kingdom: "eden",
      outfit,
      hairStyle: state.hairStyle
    });
    state.edenMale.group.position.set(1.66, 0, 0.16);
    state.edenMale.group.rotation.y = -0.18;
    stageGroup.add(state.edenMale.group);

    syncKingdomVisibility();

    if (state.wireframe) {
      allRigs().forEach((rig) => applyWireframe(rig.group, true));
    }
  }

  function syncKingdomVisibility() {
    const comparing = state.focus === "compare" || state.focus === "compareFaces";
    const showNorth = !comparing && (state.kingdomFilter === "both" || state.kingdomFilter === "north");
    const showEden  = !comparing && (state.kingdomFilter === "both" || state.kingdomFilter === "eden");
    compareGroup.visible = comparing;
    plinth.group.visible = state.showGround && !comparing;
    comparePlinth.group.visible = state.showGround && comparing;
    state.wellProp.group.visible = !comparing;
    rootEl.querySelector("#pz-description").textContent = comparing
      ? "Слева направо: старая / новая женщина · старый / новый мужчина. Все в исподнем."
      : "Прототип тела и головы: кнопка «Сравнить» в фокусе камеры";
    if (state.horse) state.horse.group.visible = showNorth;
    if (state.northFemale) state.northFemale.group.visible = showNorth;
    if (state.northMale)   state.northMale.group.visible = showNorth;
    if (state.edenFemale)  state.edenFemale.group.visible = showEden;
    if (state.edenMale)    state.edenMale.group.visible = showEden;
  }

  rebuildCharacters(state.outfit);

  /* ---------- 4. ОРБИТАЛЬНАЯ КАМЕРА 360° С ПЛАВНЫМ ФОКУСОМ ---------- */
  const FOCUS_PRESETS = {
    all:        { target: [ 0.00, 1.04, -0.02], radius: 5.35, yaw: 0.00,  pitch: 0.21 },
    northGroup: { target: [-1.18, 1.02,  0.14], radius: 3.15, yaw: 0.12,  pitch: 0.17 },
    edenGroup:  { target: [ 1.18, 1.04,  0.14], radius: 3.15, yaw: -0.12, pitch: 0.17 },
    facesNorth: { target: [-1.32, 1.48,  0.20], radius: 1.56, yaw: 0.12,  pitch: 0.08 },
    facesEden:  { target: [ 1.32, 1.50,  0.20], radius: 1.56, yaw: -0.12, pitch: 0.08 },
    legs:       { target: [-1.28, 0.72,  0.20], radius: 2.35, yaw: 0.16,  pitch: 0.12 },
    compare:    { target: [ 0.00, 0.90, 5.00], radius: 4.5, yaw: 0.00, pitch: 0.04 },
    compareFaces: { target: [0.00, 1.55, 5.00], radius: 3.1, yaw: 0.00, pitch: 0.02 },
    rider:      { target: [ 0.35, 1.12, -1.72], radius: 3.05, yaw: 2.72,  pitch: 0.14 },
    well:       { target: [ 0.00, 1.06, -0.34], radius: 3.05, yaw: -0.22, pitch: 0.25 }
  };

  const camCtrl = {
    target: new THREE.Vector3(...FOCUS_PRESETS.all.target),
    goalTarget: new THREE.Vector3(...FOCUS_PRESETS.all.target),
    radius: FOCUS_PRESETS.all.radius,
    goalRadius: FOCUS_PRESETS.all.radius,
    yaw: FOCUS_PRESETS.all.yaw,
    goalYaw: FOCUS_PRESETS.all.yaw,
    pitch: FOCUS_PRESETS.all.pitch,
    goalPitch: FOCUS_PRESETS.all.pitch,
    dragging: false,
    panMode: false,
    lastX: 0,
    lastY: 0,
    pinchDist: 0
  };

  function setFocusPreset(key) {
    let resolvedKey = key;
    if (key === "legs" && state.kingdomFilter === "eden") {
      camCtrl.goalTarget.set(1.28, 0.74, 0.20);
      camCtrl.goalRadius = 2.35;
      camCtrl.goalYaw = -0.16;
      camCtrl.goalPitch = 0.12;
      return;
    }
    if (key === "all") {
      if (state.kingdomFilter === "north") resolvedKey = "northGroup";
      else if (state.kingdomFilter === "eden") resolvedKey = "edenGroup";
    }
    const p = FOCUS_PRESETS[resolvedKey] || FOCUS_PRESETS.all;
    camCtrl.goalTarget.set(p.target[0], p.target[1], p.target[2]);
    camCtrl.goalRadius = p.radius;
    camCtrl.goalYaw = p.yaw;
    camCtrl.goalPitch = p.pitch;
  }

  /* Управление мышью и тачем */
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    camCtrl.dragging = true;
    camCtrl.panMode = e.button === 2 || e.button === 1 || e.shiftKey;
    camCtrl.lastX = e.clientX;
    camCtrl.lastY = e.clientY;
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!camCtrl.dragging) return;
    const dx = e.clientX - camCtrl.lastX;
    const dy = e.clientY - camCtrl.lastY;
    camCtrl.lastX = e.clientX;
    camCtrl.lastY = e.clientY;

    if (camCtrl.panMode) {
      const panScale = camCtrl.radius * 0.0014;
      const rightX = Math.cos(camCtrl.yaw);
      const rightZ = -Math.sin(camCtrl.yaw);
      camCtrl.goalTarget.x -= rightX * dx * panScale;
      camCtrl.goalTarget.z -= rightZ * dx * panScale;
      camCtrl.goalTarget.y = Math.max(0.18, Math.min(2.3, camCtrl.goalTarget.y + dy * panScale));
    } else {
      camCtrl.goalYaw -= dx * 0.0075;
      camCtrl.goalPitch = Math.max(-0.12, Math.min(1.18, camCtrl.goalPitch + dy * 0.0065));
    }
  });

  const endDrag = () => { camCtrl.dragging = false; };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.09 : 0.91;
    camCtrl.goalRadius = Math.max(1.05, Math.min(9.5, camCtrl.goalRadius * factor));
  }, { passive: false });

  /* Двухпальцевый зум на смартфонах/планшетах */
  canvas.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
      camCtrl.dragging = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      camCtrl.pinchDist = Math.hypot(dx, dy);
    }
  }, { passive: true });

  canvas.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2 && camCtrl.pinchDist > 0) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = camCtrl.pinchDist / Math.max(20, dist);
      camCtrl.pinchDist = dist;
      camCtrl.goalRadius = Math.max(1.05, Math.min(9.5, camCtrl.goalRadius * ratio));
    }
  }, { passive: true });

  /* ---------- 5. СТРОГО КОРРЕКТНЫЙ РЕСАЙЗ (БЕЗ ПЕРЕСОЗДАНИЯ БУФЕРА В RAF!) ---------- */
  let lastW = 0;
  let lastH = 0;
  let lastDpr = 0;

  function syncViewportSize() {
    const w = Math.max(1, viewport.clientWidth || window.innerWidth);
    const h = Math.max(1, viewport.clientHeight || window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    if (w === lastW && h === lastH && dpr === lastDpr) return;
    lastW = w;
    lastH = h;
    lastDpr = dpr;

    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  syncViewportSize();
  const resizeObserver = typeof ResizeObserver !== "undefined"
    ? new ResizeObserver(() => syncViewportSize())
    : null;
  if (resizeObserver) resizeObserver.observe(viewport);
  window.addEventListener("resize", syncViewportSize);

  let contextLost = false;
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    contextLost = true;
  });
  canvas.addEventListener("webglcontextrestored", () => {
    contextLost = false;
    lastW = 0;
    syncViewportSize();
  });

  /* ---------- 6. ОБРАБОТЧИКИ ПАНЕЛИ УПРАВЛЕНИЯ ---------- */
  function activateSegmentBtn(role, attr, val) {
    const wrap = rootEl.querySelector(`[data-role="${role}"]`);
    if (!wrap) return;
    wrap.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("is-active", b.getAttribute(attr) === val);
    });
  }

  function bindSegmented(role, attr, onPick) {
    const wrap = rootEl.querySelector(`[data-role="${role}"]`);
    if (!wrap) return;
    wrap.addEventListener("click", (e) => {
      const btn = e.target.closest(`button[${attr}]`);
      if (!btn) return;
      wrap.querySelectorAll("button").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      onPick(btn.getAttribute(attr));
    });
  }

  bindSegmented("kingdom", "data-kingdom", (k) => {
    state.kingdomFilter = k;
    syncKingdomVisibility();
    if (k === "north" && state.focus === "facesEden") {
      state.focus = "facesNorth";
      activateSegmentBtn("focus", "data-focus", "facesNorth");
    } else if (k === "eden" && state.focus === "facesNorth") {
      state.focus = "facesEden";
      activateSegmentBtn("focus", "data-focus", "facesEden");
    }
    setFocusPreset(state.focus);
  });

  bindSegmented("outfit", "data-outfit", (outfit) => {
    if (outfit === state.outfit) return;
    state.outfit = outfit;
    const rigs = allRigs();
    if (rigs.length === 4) {
      rigs.forEach((rig) => {
        rig.setOutfit(outfit);
        if (state.wireframe) applyWireframe(rig.group, true);
      });
    } else {
      rebuildCharacters(outfit);
    }
  });

  bindSegmented("hair", "data-hair", (hairStyle) => {
    if (hairStyle === state.hairStyle) return;
    state.hairStyle = hairStyle;
    [...allRigs(), ...compareRigs].forEach((rig) => {
      rig.setHairStyle(hairStyle);
      if (state.wireframe) applyWireframe(rig.group, true);
    });
  });

  bindSegmented("anim", "data-anim", (anim) => {
    state.anim = anim;
  });

  bindSegmented("focus", "data-focus", (focus) => {
    state.focus = focus;
    syncKingdomVisibility();
    /* Если пользователь кликнул Лица Севера или Лица Центра при скрытом королевстве — автоматически покажем его */
    if (focus === "facesNorth" && state.kingdomFilter === "eden") {
      state.kingdomFilter = "both";
      activateSegmentBtn("kingdom", "data-kingdom", "both");
      syncKingdomVisibility();
    } else if (focus === "facesEden" && state.kingdomFilter === "north") {
      state.kingdomFilter = "both";
      activateSegmentBtn("kingdom", "data-kingdom", "both");
      syncKingdomVisibility();
    }
    setFocusPreset(focus);
  });

  const btnTurntable = rootEl.querySelector("#pz-btn-turntable");
  btnTurntable.addEventListener("click", () => {
    state.turntable = !state.turntable;
    btnTurntable.classList.toggle("is-active", state.turntable);
  });

  const btnGround = rootEl.querySelector("#pz-btn-ground");
  btnGround.addEventListener("click", () => {
    state.showGround = !state.showGround;
    const comparing = state.focus === "compare" || state.focus === "compareFaces";
    plinth.group.visible = state.showGround && !comparing;
    comparePlinth.group.visible = state.showGround && comparing;
    shadowCatcher.visible = !state.showGround;
    btnGround.classList.toggle("is-active", state.showGround);
  });

  const btnWire = rootEl.querySelector("#pz-btn-wire");
  btnWire.addEventListener("click", () => {
    state.wireframe = !state.wireframe;
    btnWire.classList.toggle("is-active", state.wireframe);
    applyWireframe(stageGroup, state.wireframe);
  });

  /* ---------- 7. ГЛАВНЫЙ ЦИКЛ 60+ FPS ---------- */
  let rafId = 0;
  let prevNow = performance.now();
  let elapsed = 0;
  let fpsFrames = 0;
  let fpsAccum = 0;

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    if (contextLost) return;

    const dt = Math.min(0.05, Math.max(0.0005, (now - prevNow) * 0.001));
    prevNow = now;
    elapsed += dt;

    if (state.turntable && !camCtrl.dragging) {
      camCtrl.goalYaw += dt * 0.42;
    }

    const damp = 1 - Math.exp(-dt * 10.5);
    camCtrl.target.lerp(camCtrl.goalTarget, damp);
    camCtrl.radius += (camCtrl.goalRadius - camCtrl.radius) * damp;
    camCtrl.yaw += (camCtrl.goalYaw - camCtrl.yaw) * damp;
    camCtrl.pitch += (camCtrl.goalPitch - camCtrl.pitch) * damp;

    const cosP = Math.cos(camCtrl.pitch);
    camera.position.set(
      camCtrl.target.x + Math.sin(camCtrl.yaw) * cosP * camCtrl.radius,
      camCtrl.target.y + Math.sin(camCtrl.pitch) * camCtrl.radius,
      camCtrl.target.z + Math.cos(camCtrl.yaw) * cosP * camCtrl.radius
    );
    camera.lookAt(camCtrl.target);

    /* Анимация скелетов обоих королевств (естественный живой темп ходьбы без замедления и хромоты!) */
    if (state.northFemale && state.northMale && state.edenFemale && state.edenMale) {
      if (state.anim === "scene") {
        poseBowCharacter(state.northFemale, "idle", elapsed,        { lookYaw: 0.06 });
        poseBowCharacter(state.northMale,   "walk", elapsed * 0.94, { lookYaw: 0.04 });
        poseBowCharacter(state.edenFemale,  "idle", elapsed + 1.3,  { lookYaw: -0.06 });
        poseBowCharacter(state.edenMale,    "walk", elapsed * 0.94 + 0.65, { lookYaw: -0.04 });
      } else if (state.anim === "idle") {
        poseBowCharacter(state.northFemale, "idle", elapsed,       { lookYaw: 0 });
        poseBowCharacter(state.northMale,   "idle", elapsed + 0.9, { lookYaw: 0 });
        poseBowCharacter(state.edenFemale,  "idle", elapsed + 1.7, { lookYaw: 0 });
        poseBowCharacter(state.edenMale,    "idle", elapsed + 2.4, { lookYaw: 0 });
      } else if (state.anim === "walk") {
        poseBowCharacter(state.northFemale, "walk", elapsed,        { lookYaw: 0 });
        poseBowCharacter(state.northMale,   "walk", elapsed + 0.35, { lookYaw: 0 });
        poseBowCharacter(state.edenFemale,  "walk", elapsed + 0.70, { lookYaw: 0 });
        poseBowCharacter(state.edenMale,    "walk", elapsed + 1.05, { lookYaw: 0 });
      } else if (state.anim === "combat") {
        poseBowCharacter(state.northFemale, "combat", elapsed,       { lookYaw: 0.08 });
        poseBowCharacter(state.northMale,   "combat", elapsed + 0.6, { lookYaw: 0.06 });
        poseBowCharacter(state.edenFemale,  "combat", elapsed + 1.2, { lookYaw: -0.06 });
        poseBowCharacter(state.edenMale,    "combat", elapsed + 1.8, { lookYaw: -0.08 });
      }
    }

    // Синхронные позы в парах делают различия читаемыми.
    if (compareGroup.visible) {
      const mode = state.anim === "scene" ? "idle" : state.anim;
      compareRigs.forEach((rig) => poseBowCharacter(rig, mode, elapsed));
    }

    /* Конный воин: в «Сцене» и «Походке» конь идёт шагом, в «Стойке» отдыхает,
       в «Бою» стоит, а всадник держит поводья */
    if (state.horse && state.rider) {
      const horseMode = (state.anim === "scene" || state.anim === "walk") ? "walk" : "idle";
      animateHorse3D(state.horse, horseMode, elapsed);
      poseBowCharacter(state.rider, "ride", elapsed);
      updateReins();
    }

    animateMedievalWell3D(state.wellProp, elapsed);

    renderer.render(scene, camera);

    fpsFrames++;
    fpsAccum += dt;
    if (fpsAccum >= 0.5) {
      const fps = Math.round(fpsFrames / fpsAccum);
      fpsEl.textContent = `${fps} FPS`;
      fpsEl.style.color = fps >= 55 ? "#8be28b" : fps >= 35 ? "#f0c96b" : "#f07b6b";
      trisEl.textContent = `${renderer.info.render.triangles.toLocaleString("ru-RU")} треуг.`;
      callsEl.textContent = `${renderer.info.render.calls} draw calls`;
      fpsFrames = 0;
      fpsAccum = 0;
    }
  }

  rafId = requestAnimationFrame(tick);

  return {
    dispose() {
      cancelAnimationFrame(rafId);
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener("resize", syncViewportSize);
      allRigs().forEach((rig) => disposeBowCharacter(rig));
      compareRigs.forEach((rig) => disposeBowCharacter(rig));
      if (state.rider) { state.rider.group.removeFromParent(); disposeBowCharacter(state.rider); }
      if (state.horse) disposeBowHorse(state.horse);
      if (state.wellProp) state.wellProp.dispose();
      plinth.dispose();
      comparePlinth.dispose();
      shadowCatcherGeo.dispose();
      shadowCatcherMat.dispose();
      renderer.dispose();
    }
  };
}

/* Автозапуск при открытии стенда напрямую */
if (typeof document !== "undefined") {
  const autoRoot = document.getElementById("pz-showcase-root");
  if (autoRoot) {
    mountBowShowcase(autoRoot);
  }
}
