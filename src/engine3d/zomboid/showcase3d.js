/* ============================================================================
   BLADES OF WAR — ИНТЕРАКТИВНЫЙ 3D-СТЕНД ДИЗАЙНА (СТИЛЬ PROJECT ZOMBOID B41+)
   Два бесшовных скелетных 3D-персонажа (мужчина и женщина) + средневековый
   колодец Студёного Брода в едином рисованном low-poly стиле.
   Стабильные 60+ FPS, вращение 360°, зум, смена одежды, поз и проверка сетки.
   ============================================================================ */

import * as THREE from "three";
import {
  createZomboidCharacter3D,
  poseZomboidCharacter,
  disposeZomboidCharacter
} from "./zomboidCharacter.js";
import {
  createZomboidMedievalWell3D,
  animateZomboidWell3D
} from "./zomboidProp.js";
import {
  buildPropAtlasCanvas,
  canvasToThreeTexture
} from "./zomboidTextures.js";

const STUDIO_BG_HEX = 0x2d3034;

/* ---------- СОЗДАНИЕ ОПЦИОНАЛЬНОЙ КАМЕННОЙ ПЛОЩАДКИ ПОД НОГАМИ ---------- */
function createCobblePlinth() {
  const group = new THREE.Group();
  group.name = "CobblePlinth";

  const atlasCv = buildPropAtlasCanvas();
  const atlasTex = canvasToThreeTexture(atlasCv);

  /* Верхний круг тёсаного камня (квадрант 0..0.5, 0.5..1.0) */
  const topGeo = new THREE.CylinderGeometry(2.35, 2.46, 0.12, 32, 1);
  const uv = topGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const ux = uv.getX(i) * 3;
    const vy = uv.getY(i) * 3;
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
  const rimGeo = new THREE.TorusGeometry(2.37, 0.045, 8, 36);
  rimGeo.rotateX(Math.PI * 0.5);
  rimGeo.translate(0, -0.01, 0);
  const rimMat = new THREE.MeshLambertMaterial({ color: 0x454a52 });
  const rim = new THREE.Mesh(rimGeo, rimMat);
  rim.receiveShadow = true;
  group.add(rim);

  group.visible = false; // по умолчанию чистый сланцевый фон #2d3034 как на эталоне Project Zomboid
  return { group, dispose: () => { topGeo.dispose(); rimGeo.dispose(); stoneMat.dispose(); rimMat.dispose(); atlasTex.dispose(); } };
}

/* ---------- УСТАНОВКА РЕЖИМА WIREFRAME НА ПЕРСОНАЖЕ И ОБЪЕКТЕ ---------- */
function applyWireframe(root, enabled) {
  if (!root) return;
  root.traverse((obj) => {
    if ((obj.isMesh || obj.isSkinnedMesh) && obj.material) {
      /* Не включаем сетку на прозрачном круге контактной тени под ногами */
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
export function mountZomboidShowcase(rootEl) {
  if (!rootEl) return;

  rootEl.innerHTML = `
    <div class="pz-shell">
      <div class="pz-viewport" id="pz-viewport"></div>

      <!-- Верхняя панель статуса и метрик производительности -->
      <header class="pz-topbar">
        <div class="pz-brand">
          <span class="pz-badge">3D ПРОТОТИП ДИЗАЙНА</span>
          <div class="pz-titles">
            <h1>Blades Of War · Стиль Project Zomboid 3D</h1>
            <p>Бесшовные скелетные модели (мужчина и женщина) + средневековый объект</p>
          </div>
        </div>
        <div class="pz-stats" id="pz-stats">
          <span class="pz-fps" id="pz-fps">60 FPS</span>
          <span class="pz-sep">·</span>
          <span id="pz-tris">— треуг.</span>
          <span class="pz-sep">·</span>
          <span id="pz-calls">— вызовов</span>
          <a class="pz-dl-btn" id="pz-dl-btn" href="/download" download="BladesOfWar-Zomboid3D-Demo.html" title="Скачать автономный 3D-пример одним HTML-файлом">Скачать HTML</a>
        </div>
      </header>

      <!-- Подсказка управления мышью/тачем -->
      <div class="pz-hint">
        <span><b>ЛКМ / палец</b> — крутить 360°</span>
        <span><b>Колесо / щипок</b> — приблизить</span>
        <span><b>ПКМ</b> — сдвиг камеры</span>
      </div>

      <!-- Нижняя панель переключения одежды, поз и ракурсов -->
      <aside class="pz-dock">
        <div class="pz-group">
          <span class="pz-label">Одежда / анатомия</span>
          <div class="pz-segmented" data-role="outfit">
            <button type="button" data-outfit="villager" class="is-active">Житель Брода</button>
            <button type="button" data-outfit="underwear">Исподнее (силуэт)</button>
            <button type="button" data-outfit="warrior">Воин Севера</button>
          </div>
        </div>

        <div class="pz-group">
          <span class="pz-label">Анимация (18 костей)</span>
          <div class="pz-segmented" data-role="anim">
            <button type="button" data-anim="scene" class="is-active">Живая сцена</button>
            <button type="button" data-anim="idle">Стойка</button>
            <button type="button" data-anim="walk">Походка</button>
            <button type="button" data-anim="combat">Бой</button>
          </div>
        </div>

        <div class="pz-group">
          <span class="pz-label">Фокус камеры</span>
          <div class="pz-segmented" data-role="focus">
            <button type="button" data-focus="all" class="is-active">Все</button>
            <button type="button" data-focus="female">Женщина</button>
            <button type="button" data-focus="male">Мужчина</button>
            <button type="button" data-focus="closeup">Плечи / лица</button>
            <button type="button" data-focus="well">Колодец</button>
          </div>
        </div>

        <div class="pz-group">
          <span class="pz-label">Вид</span>
          <div class="pz-segmented">
            <button type="button" id="pz-btn-turntable" title="Медленное вращение сцены">Авто 360°</button>
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

  /* ---------- 2. МЯГКОЕ ТРЁХТОЧЕЧНОЕ ОСВЕЩЕНИЕ PROJECT ZOMBOID ---------- */
  const hemiLight = new THREE.HemisphereLight(0xf3f6fb, 0x3b4048, 1.08);
  hemiLight.position.set(0, 6, 0);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff4e4, 1.15);
  keyLight.position.set(2.8, 5.2, 4.2);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 16;
  keyLight.shadow.camera.left = -3.2;
  keyLight.shadow.camera.right = 3.2;
  keyLight.shadow.camera.top = 3.2;
  keyLight.shadow.camera.bottom = -1.2;
  keyLight.shadow.bias = -0.0008;
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xb8d0f0, 0.42);
  rimLight.position.set(-3.4, 3.2, -3.2);
  scene.add(rimLight);

  /* Невидимая плоскость приёма мягких теней на чистом студийном фоне #2d3034 */
  const shadowCatcherGeo = new THREE.PlaneGeometry(12, 12);
  shadowCatcherGeo.rotateX(-Math.PI * 0.5);
  const shadowCatcherMat = new THREE.ShadowMaterial({ opacity: 0.24 });
  const shadowCatcher = new THREE.Mesh(shadowCatcherGeo, shadowCatcherMat);
  shadowCatcher.position.y = 0.001;
  shadowCatcher.receiveShadow = true;
  scene.add(shadowCatcher);

  /* ---------- 3. СБОРКА МОДЕЛЕЙ: ЖЕНЩИНА, МУЖЧИНА И СРЕДНЕВЕКОВЫЙ КОЛОДЕЦ ---------- */
  const stageGroup = new THREE.Group();
  scene.add(stageGroup);

  const plinth = createCobblePlinth();
  stageGroup.add(plinth.group);

  const state = {
    outfit: "villager",
    anim: "scene",
    focus: "all",
    turntable: false,
    showGround: false,
    wireframe: false,
    femaleRig: null,
    maleRig: null,
    wellProp: null
  };

  /* Средневековый колодец справа от персонажей */
  state.wellProp = createZomboidMedievalWell3D();
  state.wellProp.group.position.set(0.96, 0, -0.18);
  state.wellProp.group.rotation.y = -0.34;
  stageGroup.add(state.wellProp.group);

  function rebuildCharacters(outfit) {
    if (state.femaleRig) {
      stageGroup.remove(state.femaleRig.group);
      disposeZomboidCharacter(state.femaleRig);
    }
    if (state.maleRig) {
      stageGroup.remove(state.maleRig.group);
      disposeZomboidCharacter(state.maleRig);
    }

    state.femaleRig = createZomboidCharacter3D({
      female: true,
      outfit,
      hairColor: "#4b2514"
    });
    state.femaleRig.group.position.set(-1.05, 0, 0.14);
    state.femaleRig.group.rotation.y = 0.16;
    stageGroup.add(state.femaleRig.group);

    state.maleRig = createZomboidCharacter3D({
      female: false,
      outfit,
      hairColor: "#6b3c1b",
      beard: true
    });
    state.maleRig.group.position.set(-0.22, 0, 0.18);
    state.maleRig.group.rotation.y = -0.12;
    stageGroup.add(state.maleRig.group);

    if (state.wireframe) {
      applyWireframe(state.femaleRig.group, true);
      applyWireframe(state.maleRig.group, true);
    }
  }

  rebuildCharacters(state.outfit);

  /* ---------- 4. ОРБИТАЛЬНАЯ КАМЕРА 360° С ПЛАВНЫМ ФОКУСОМ ---------- */
  const FOCUS_PRESETS = {
    all:     { target: [-0.08, 1.02, -0.02], radius: 4.55, yaw: 0.08,  pitch: 0.23 },
    female:  { target: [-1.05, 0.96,  0.14], radius: 2.55, yaw: 0.18,  pitch: 0.16 },
    male:    { target: [-0.22, 1.02,  0.18], radius: 2.65, yaw: -0.14, pitch: 0.16 },
    closeup: { target: [-0.64, 1.46,  0.16], radius: 1.72, yaw: 0.04,  pitch: 0.10 },
    well:    { target: [ 0.94, 1.05, -0.18], radius: 3.15, yaw: -0.32, pitch: 0.26 }
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
    const p = FOCUS_PRESETS[key] || FOCUS_PRESETS.all;
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
      camCtrl.goalTarget.y = Math.max(0.2, Math.min(2.2, camCtrl.goalTarget.y + dy * panScale));
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
    camCtrl.goalRadius = Math.max(1.15, Math.min(8.5, camCtrl.goalRadius * factor));
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
      camCtrl.goalRadius = Math.max(1.15, Math.min(8.5, camCtrl.goalRadius * ratio));
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

    /* ВАЖНО: setPixelRatio строго ПЕРЕД setSize! */
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

  /* Защита от потери WebGL-контекста */
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

  bindSegmented("outfit", "data-outfit", (outfit) => {
    if (outfit === state.outfit) return;
    state.outfit = outfit;
    if (state.femaleRig && state.maleRig) {
      state.femaleRig.setOutfit(outfit);
      state.maleRig.setOutfit(outfit);
      if (state.wireframe) {
        applyWireframe(state.femaleRig.group, true);
        applyWireframe(state.maleRig.group, true);
      }
    } else {
      rebuildCharacters(outfit);
    }
  });

  bindSegmented("anim", "data-anim", (anim) => {
    state.anim = anim;
  });

  bindSegmented("focus", "data-focus", (focus) => {
    state.focus = focus;
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
    plinth.group.visible = state.showGround;
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

    /* Автоповорот подиума */
    if (state.turntable && !camCtrl.dragging) {
      camCtrl.goalYaw += dt * 0.42;
    }

    /* Мягкое экспоненциальное сглаживание орбитальной камеры */
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

    /* Анимация скелетов персонажей и колодца */
    if (state.femaleRig && state.maleRig) {
      if (state.anim === "scene") {
        poseZomboidCharacter(state.femaleRig, "idle", elapsed, { lookYaw: -0.10 });
        poseZomboidCharacter(state.maleRig, "walk", elapsed * 0.42, { lookYaw: -0.14 });
      } else if (state.anim === "idle") {
        poseZomboidCharacter(state.femaleRig, "idle", elapsed, { lookYaw: 0 });
        poseZomboidCharacter(state.maleRig, "idle", elapsed + 1.1, { lookYaw: 0 });
      } else if (state.anim === "walk") {
        poseZomboidCharacter(state.femaleRig, "walk", elapsed * 0.48, { lookYaw: 0 });
        poseZomboidCharacter(state.maleRig, "walk", elapsed * 0.48 + 0.5, { lookYaw: 0 });
      } else if (state.anim === "combat") {
        poseZomboidCharacter(state.femaleRig, "combat", elapsed, { lookYaw: 0.08 });
        poseZomboidCharacter(state.maleRig, "combat", elapsed + 0.8, { lookYaw: -0.08 });
      }
    }

    animateZomboidWell3D(state.wellProp, elapsed);

    renderer.render(scene, camera);

    /* Обновление счётчика FPS и геометрии 2 раза в секунду (без лишнего DOM-дерганья!) */
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
      disposeZomboidCharacter(state.femaleRig);
      disposeZomboidCharacter(state.maleRig);
      if (state.wellProp) state.wellProp.dispose();
      plinth.dispose();
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
    mountZomboidShowcase(autoRoot);
  }
}
