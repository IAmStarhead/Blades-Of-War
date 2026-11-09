/* ============================================================
   BOW 3D SCENE ENGINE (0.0.9.3) — Модульный изометрический 3D-движок
   Студёного Брода на Vite + Three.js.
   • Честная ортографическая 3D-проекция 2:1 с аппаратным Z-буфером;
   • 0% замыливания при любом зуме (нативный рендер в размер экрана × DPR);
   • Динамическое освещение суток + мерцающий свет горна, очага, жаровни и костра;
   • 3D-рейкастинг персонажей, дверей, реквизита и земли (ЛКМ / ПКМ / Тач);
   • Подсветка всех интерактивных объектов локации при удержании [Alt];
   • Режим производительности (Высокое / Среднее / Производительность);
   • Безопасный headless-режим для автотестов JSDOM без WebGL.
   ============================================================ */
import * as THREE from "three";
import {
  getQualityProfile,
  getQualityKey,
  setQualityKey,
  getAllQualityProfiles,
  effectivePixelRatio,
  onQualityChange
} from "./quality.js";
import { getMat, getBasicMat, PALETTE } from "./materials.js";
import { createHumanoid3D, poseHumanoid3D, buildSeveredLimbMesh } from "./humanoid3d.js";
import { buildEnvironment3D, buildProp3D, buildWell3D, buildJailCellPartition3D } from "./props3d.js";

const VIEW_W = 1280;
const VIEW_H = 680;
const COLS = 12;
const ROWS = 8;
const TILE_W = 86;
const TILE_H = 43;
const ORIGIN_X = 590;
const ORIGIN_Y = 122;

const BATTLE_W = 1088;
const BATTLE_H = 368;
const FIGHT_TW = 90;
const FIGHT_TH = 42;
const FIGHT_OX = 480;
const FIGHT_OY = 64;

/* Точный коэффициент ортографической камеры 2:1 (наклон 30° к горизонту):
   1 шаг по (col - row) даёт 1/√2 единиц камеры = 43 базовых пикселя. */
const BASE_PX_PER_UNIT = (TILE_W * 0.5) * Math.SQRT2; // ~60.811183
const ISO_COS30 = Math.sqrt(3) * 0.5;
const CAM_DIST = 28;
const CAM_OFFSET_VEC = new THREE.Vector3(
  CAM_DIST * (ISO_COS30 / Math.SQRT2),
  CAM_DIST * 0.5,
  CAM_DIST * (ISO_COS30 / Math.SQRT2)
);

/* ---------- Карты 6 локаций Студёного Брода (без открытого мира в 0.0.9.3) ---------- */
const MAPS = {
  square: {
    id: "square",
    outdoor: true,
    floorKind: "cobble_snow",
    spawn: { col: 2.0, row: 6.2, facing: "NE" },
    entryFrom: {
      tavern: { col: 1.4, row: 3.2, facing: "SE" },
      smithy: { col: 9.6, row: 2.2, facing: "SW" },
      outskirts: { col: 9.8, row: 6.0, facing: "NW" }
    },
    npcSlots: [
      { col: 2.4, row: 4.0, facing: "SE" },
      { col: 5.4, row: 4.4, facing: "SW" },
      { col: 7.8, row: 4.0, facing: "SW" },
      { col: 9.8, row: 3.0, facing: "NW" },
      { col: 10.4, row: 1.4, facing: "SW" }
    ],
    obstacles: [
      { col: 5, row: 3, kind: "well", label: "Каменный колодец" },
      { col: 3, row: 1, kind: "brazier", light: 1.35, lightColor: "#ff8c3a" },
      { col: 2, row: 0, kind: "crates" },
      { col: 8, row: 0, kind: "stall" }
    ],
    spots: [
      { key: "well", col: 5, row: 3, title: "Каменный колодец", sub: "ледяная вода под срубом", desc: "Ворот обмёрз льдом, но бадья ходит исправно. Вокруг колодца сходятся все тропы Брода.", tab: "jobs", tabLabel: "Подряды у площади" },
      { key: "stall", col: 8, row: 0, title: "Торговый навес", sub: "ряды и прилавки", desc: "Под плотной рогожей пахнет ржаной мукой, солониной и дёгтем.", tab: "trade", tabLabel: "Открыть торг" },
      { key: "brazier", col: 3, row: 1, title: "Угольная жаровня", sub: "живой жар на ветру", desc: "Кованая корзина с раскалёнными углями — здесь греют ладони путники и караульные." }
    ],
    exits: [
      { col: 0, row: 3, to: "tavern", label: "Трактир", doorKind: "porch_door", wallSide: "NW" },
      { col: 11, row: 2, to: "smithy", label: "Кузница", doorKind: "forge_arch", wallSide: "NE" },
      { col: 11, row: 6, to: "outskirts", label: "Околица", doorKind: "road_gate", wallSide: "SE" }
    ]
  },

  tavern: {
    id: "tavern",
    outdoor: false,
    floorKind: "planks",
    wallKind: "timber",
    spawn: { col: 8.8, row: 5.0, facing: "NW" },
    entryFrom: {
      square: { col: 9.6, row: 5.0, facing: "NW" }
    },
    npcSlots: [
      { col: 7.2, row: 2.2, facing: "SW" },
      { col: 4.2, row: 3.0, facing: "SE" },
      { col: 6.0, row: 5.2, facing: "NW" },
      { col: 2.2, row: 4.2, facing: "NE" }
    ],
    obstacles: [
      { col: 4, row: 0, kind: "hearth", light: 1.65, lightColor: "#ff9442" },
      { col: 3, row: 4, kind: "table" },
      { col: 7, row: 4, kind: "table" },
      { col: 8, row: 1, kind: "bar" },
      { col: 1, row: 1, kind: "bunk" }
    ],
    spots: [
      { key: "hearth", col: 4, row: 0, title: "Каменный очаг", sub: "тёплый сруб и котёл", desc: "Берёзовые поленья трещат ровно; в закопчённом котле густеет горячая похлёбка." },
      { key: "bar", col: 8, row: 1, title: "Стойка Сигрид", sub: "снедь, похлёбка и эль", desc: "Дубовая доска отполирована локтями. За стойкой всегда найдётся тёплый хлеб и кружка.", tab: "trade", tabLabel: "Снедь и питьё" },
      { key: "bunk", col: 1, row: 1, title: "Лавка с тулупом", sub: "сон в тепле", desc: "Широкая скамья у тёплой бревенчатой стены — лучшее место переждать стужу.", act: "rest", actLabel: "Отдохнуть в тепле" }
    ],
    exits: [
      { col: 11, row: 5, to: "square", label: "На площадь", doorKind: "inner_door", wallSide: "SE" }
    ]
  },

  smithy: {
    id: "smithy",
    outdoor: false,
    floorKind: "flagstone",
    wallKind: "stone",
    spawn: { col: 8.8, row: 5.0, facing: "NW" },
    entryFrom: {
      square: { col: 9.6, row: 5.0, facing: "NW" }
    },
    npcSlots: [
      { col: 4.2, row: 2.4, facing: "SE" },
      { col: 7.2, row: 4.2, facing: "NW" },
      { col: 2.2, row: 5.2, facing: "NE" }
    ],
    obstacles: [
      { col: 3, row: 0, kind: "forge", light: 1.85, lightColor: "#ff6e24" },
      { col: 5, row: 2, kind: "anvil" },
      { col: 6, row: 1, kind: "trough" },
      { col: 1, row: 2, kind: "crates" }
    ],
    spots: [
      { key: "forge", col: 3, row: 0, title: "Кузнечный горн", sub: "меха и багровый уголь", desc: "Жар бьёт в лицо с трёх шагов. В горне добела раскаляются полосы северного железа." },
      { key: "anvil", col: 5, row: 2, title: "Наковальня Тарна", sub: "поковка и подряды", desc: "Тяжёлый стальной рог гудит от ударов ручника. Здесь всегда нужны крепкие руки.", tab: "jobs", tabLabel: "Подряды кузни" },
      { key: "rack", col: 8, row: 0, title: "Стойка с поковками", sub: "топоры, ножи и броня", desc: "Свежие клинки и топоры смазаны жиром от ржавчины.", tab: "trade", tabLabel: "Товар кузни" }
    ],
    exits: [
      { col: 11, row: 5, to: "square", label: "На площадь", doorKind: "inner_door", wallSide: "SE" }
    ]
  },

  outskirts: {
    id: "outskirts",
    outdoor: true,
    floorKind: "snow_road",
    spawn: { col: 2.2, row: 4.2, facing: "SE" },
    entryFrom: {
      square: { col: 1.4, row: 4.2, facing: "SE" },
      forest: { col: 9.6, row: 4.2, facing: "NW" }
    },
    npcSlots: [
      { col: 6.2, row: 3.0, facing: "SW" },
      { col: 5.0, row: 5.2, facing: "NE" },
      { col: 8.2, row: 2.4, facing: "SW" }
    ],
    obstacles: [
      { col: 6, row: 0, kind: "torch_post", light: 1.25, lightColor: "#ff953c" },
      { col: 3, row: 2, kind: "woodpile" },
      { col: 8, row: 5, kind: "rock" }
    ],
    spots: [
      { key: "gate", col: 6, row: 0, title: "Ворота частокола", sub: "рубеж Студёного Брода", desc: "Заострённые брёвна лиственницы вкопаны в мерзлоту. За ними тянется зимник к тайге." },
      { key: "wood", col: 3, row: 2, title: "Дровяные козлы", sub: "колка и заготовка дров", desc: "Мёрзлые берёзовые кряжи ждут колуна — община честно платит за каждую сажень.", tab: "jobs", tabLabel: "Взяться за работу" }
    ],
    exits: [
      { col: 0, row: 4, to: "square", label: "Площадь", doorKind: "road_gate", wallSide: "NW" },
      { col: 11, row: 4, to: "forest", label: "Опушка тайги", doorKind: "forest_trail", wallSide: "SE" }
    ]
  },

  forest: {
    id: "forest",
    outdoor: true,
    floorKind: "taiga_snow",
    spawn: { col: 2.2, row: 4.2, facing: "SE" },
    entryFrom: {
      outskirts: { col: 1.5, row: 4.2, facing: "SE" }
    },
    npcSlots: [
      { col: 6.4, row: 4.2, facing: "SW" },
      { col: 4.2, row: 2.2, facing: "SE" },
      { col: 8.2, row: 5.2, facing: "NW" }
    ],
    obstacles: [
      { col: 2, row: 1, kind: "pine" },
      { col: 7, row: 1, kind: "pine" },
      { col: 9, row: 3, kind: "pine" },
      { col: 3, row: 6, kind: "pine" },
      { col: 5, row: 3, kind: "campfire", light: 1.50, lightColor: "#ff8c38" }
    ],
    spots: [
      { key: "fire", col: 5, row: 3, title: "Охотничий костерок", sub: "дым и еловый лапник", desc: "У старого корня тлеют смолистые сучья — здесь отогревают пальцы перед охотой.", act: "rest", actLabel: "Привал у огня" },
      { key: "trail", col: 8, row: 1, title: "Звериный лаз", sub: "следы на глубоком насте", desc: "Цепочка лисьих и куньих следов уходит под заснеженные лапы вековых елей.", tab: "jobs", tabLabel: "Промысел в тайге" }
    ],
    exits: [
      { col: 0, row: 4, to: "outskirts", label: "Околица", doorKind: "forest_trail", wallSide: "NW" }
    ]
  },

  jail: {
    id: "jail",
    outdoor: false,
    floorKind: "cell_stone",
    wallKind: "stone",
    spawn: { col: 2.2, row: 4.0, facing: "NE" },
    entryFrom: {},
    npcSlots: [],
    obstacles: [
      { col: 1, row: 2, kind: "straw" },
      { col: 1, row: 6, kind: "bucket" },
      { col: 5, row: 0, kind: "bars_seg" },
      { col: 5, row: 1, kind: "bars_seg" },
      { col: 5, row: 2, kind: "bars_seg" },
      { col: 5, row: 3, kind: "bars_door" },
      { col: 5, row: 4, kind: "bars_seg" },
      { col: 5, row: 5, kind: "bars_seg" },
      { col: 5, row: 6, kind: "bars_seg" },
      { col: 5, row: 7, kind: "bars_seg" },
      { col: 9, row: 1, kind: "brazier", light: 1.45, lightColor: "#ff8834" }
    ],
    spots: [],
    exits: []
  }
};

/* ---------- Базовая геометрия координат 2:1 ---------- */
function clampVal(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

function tileToScreen(col, row) {
  return {
    x: ORIGIN_X + (col - row) * (TILE_W * 0.5),
    y: ORIGIN_Y + (col + row) * (TILE_H * 0.5)
  };
}

function screenToWorld(sx, sy) {
  const dx = (sx - ORIGIN_X) / (TILE_W * 0.5);
  const dy = (sy - ORIGIN_Y) / (TILE_H * 0.5);
  return {
    wx: (dx + dy) * 0.5,
    wy: (dy - dx) * 0.5
  };
}

function screenToTile(sx, sy) {
  const w = screenToWorld(sx, sy);
  return { col: Math.round(w.wx), row: Math.round(w.wy), wx: w.wx, wy: w.wy };
}

function fightTileToScreen(col, row) {
  return {
    x: FIGHT_OX + (col - row) * (FIGHT_TW * 0.5),
    y: FIGHT_OY + (col + row) * (FIGHT_TH * 0.5) + 46
  };
}

function mapOf(state) {
  if (state && state.jail) { return MAPS.jail; }
  const loc = (state && state.player && state.player.location) || "square";
  return MAPS[loc] || MAPS.square;
}

/* Угол 3D-поворота модели (в Three.js ось +Z = row+, ось +X = col+, rotation.y = atan2(dx, dz)) */
function facingToYaw(facing) {
  if (facing === "SE") { return Math.PI * 0.5; }   // +col
  if (facing === "NW") { return -Math.PI * 0.5; }  // -col
  if (facing === "NE") { return Math.PI; }         // -row
  return 0;                                        // SW (+row)
}

function facingFromDelta(dc, dr) {
  if (Math.abs(dc) >= Math.abs(dr)) {
    return dc >= 0 ? "SE" : "NW";
  }
  return dr >= 0 ? "SW" : "NE";
}

function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + diff * clampVal(t, 0, 1);
}

/* ---------- Живое состояние сцены, навигации, Alt-подсветки и 3D-куклы ---------- */
const runtime = {
  locKey: "",
  px: 2.0,
  py: 6.2,
  facing: "NE",
  yaw: Math.PI,
  path: [],
  destWorld: null,
  hoverWorld: null,
  hoverEntityId: null,
  altHighlight: false,
  pendingAction: null,
  stepPhase: 0,
  doorAnim: null,
  rafId: null,
  ambientRafId: null,
  lastTs: 0,
  lastRenderMs: 0,
  paperdollYaw: 0.42,
  camera: {
    zoom: 1.0,
    panX: 0,
    panY: 0,
    lastScale: 1.0,
    initializedForLoc: ""
  }
};

function isWorldPaused(state) {
  return !!(state && state.time && state.time.scale === "paused");
}

function isLiveBrowser() {
  if (typeof document === "undefined") { return false; }
  const el = document.getElementById("bow-stage-canvas") || document.getElementById("bow-app") || document.documentElement;
  if (!el || !el.getBoundingClientRect) { return false; }
  const r = el.getBoundingClientRect();
  return !!(r && r.width > 0);
}

function isHeadlessOrCalm() {
  if (!isLiveBrowser()) { return true; }
  if (typeof document !== "undefined" && document.documentElement && document.documentElement.classList.contains("bow-motion-calm")) {
    return true;
  }
  return false;
}

/* ---------- Управление свободной ортографической 3D-камерой ---------- */
function computeViewMetrics(viewportEl) {
  const vp = viewportEl || (typeof document !== "undefined" ? document.getElementById("bow-stage-canvas") : null);
  const rect = (vp && vp.getBoundingClientRect) ? vp.getBoundingClientRect() : null;
  const vw = (rect && rect.width > 0) ? rect.width : VIEW_W;
  const vh = (rect && rect.height > 0) ? rect.height : VIEW_H;
  const isMob = !!(typeof document !== "undefined" && document.documentElement && document.documentElement.classList.contains("bow-device-mobile"));

  const baseScale = isMob
    ? Math.max(vw / (VIEW_W * 0.62), vh / VIEW_H)
    : Math.max(vw / VIEW_W, vh / VIEW_H);

  const z = clampVal(runtime.camera.zoom || 1, 0.65, 2.35);
  const scale = baseScale * z;
  const scaledW = VIEW_W * scale;
  const scaledH = VIEW_H * scale;

  const maxPanX = Math.max(0, (scaledW - vw) * 0.5 + (isMob ? 110 : 80));
  const maxPanY = Math.max(0, (scaledH - vh) * 0.5 + (isMob ? 80 : 60));
  runtime.camera.panX = clampVal(runtime.camera.panX || 0, -maxPanX, maxPanX);
  runtime.camera.panY = clampVal(runtime.camera.panY || 0, -maxPanY, maxPanY);
  runtime.camera.lastScale = scale;

  const tx = (vw - scaledW) * 0.5 + runtime.camera.panX;
  const ty = (vh - scaledH) * 0.5 + runtime.camera.panY;

  return { vw, vh, scale, tx, ty, rectValid: !!(rect && rect.width > 0 && rect.height > 0) };
}

function getCamera() {
  return {
    zoom: runtime.camera.zoom,
    panX: runtime.camera.panX,
    panY: runtime.camera.panY
  };
}

/* Позиционирование невидимого слоя интерактивных маркеров в точном соответствии с 3D-камерой (БЕЗ замыливания WebGL-холста!) */
function applyCameraToDom(viewportEl, state) {
  if (typeof document === "undefined") { return; }
  const vp = viewportEl || document.getElementById("bow-stage-canvas");
  if (!vp) { return; }
  const overlay = vp.querySelector(".bow-stage-actors-iso");
  const m = computeViewMetrics(vp);
  if (overlay) {
    if (!m.rectValid) {
      overlay.style.transform = "translate(0px,0px) scale(1)";
    } else {
      overlay.style.width = VIEW_W + "px";
      overlay.style.height = VIEW_H + "px";
      overlay.style.transformOrigin = "0 0";
      overlay.style.transform = "translate(" + Math.round(m.tx) + "px," + Math.round(m.ty) + "px) scale(" + m.scale.toFixed(4) + ")";
    }
  }
  if (m.rectValid && glState.ready) {
    render3DNow(state || getGlobalState());
  }
}

function centerCameraOnPlayer(state, viewportEl, resetZoom) {
  ensurePlayerPos(state);
  if (resetZoom) { runtime.camera.zoom = 1.0; }
  const pScr = tileToScreen(runtime.px, runtime.py);
  const vp = viewportEl || (typeof document !== "undefined" ? document.getElementById("bow-stage-canvas") : null);
  const rect = (vp && vp.getBoundingClientRect) ? vp.getBoundingClientRect() : null;
  if (rect && rect.width > 0 && rect.height > 0) {
    const isMob = !!(typeof document !== "undefined" && document.documentElement && document.documentElement.classList.contains("bow-device-mobile"));
    const baseScale = isMob
      ? Math.max(rect.width / (VIEW_W * 0.62), rect.height / VIEW_H)
      : Math.max(rect.width / VIEW_W, rect.height / VIEW_H);
    const scale = baseScale * (runtime.camera.zoom || 1);
    runtime.camera.panX = (VIEW_W * 0.5 - pScr.x) * scale;
    runtime.camera.panY = (VIEW_H * 0.5 - (pScr.y - 36)) * scale;
  } else {
    runtime.camera.panX = 0;
    runtime.camera.panY = 0;
  }
  applyCameraToDom(vp, state);
}

function panCameraBy(dx, dy, viewportEl, state) {
  runtime.camera.panX = (runtime.camera.panX || 0) + (dx || 0);
  runtime.camera.panY = (runtime.camera.panY || 0) + (dy || 0);
  applyCameraToDom(viewportEl, state);
}

function setCameraZoom(nextZoom, viewportEl, state) {
  runtime.camera.zoom = clampVal(nextZoom, 0.65, 2.35);
  applyCameraToDom(viewportEl, state);
  return runtime.camera.zoom;
}

function clientToStage(clientX, clientY, viewportEl) {
  const vp = viewportEl || (typeof document !== "undefined" ? document.getElementById("bow-stage-canvas") : null);
  if (!vp || !vp.getBoundingClientRect) {
    return { sx: VIEW_W * 0.5, sy: VIEW_H * 0.5 };
  }
  const r = vp.getBoundingClientRect();
  if (!r || r.width <= 0 || r.height <= 0) {
    return { sx: VIEW_W * 0.5, sy: VIEW_H * 0.5 };
  }
  const m = computeViewMetrics(vp);
  const localX = clientX - r.left;
  const localY = clientY - r.top;
  return {
    sx: (localX - m.tx) / m.scale,
    sy: (localY - m.ty) / m.scale
  };
}

/* ---------- Позиция игрока и A* поиск пути ---------- */
function ensurePlayerPos(state) {
  const map = mapOf(state);
  const key = map.id;
  if (runtime.locKey !== key) {
    const prev = runtime.locKey;
    runtime.locKey = key;
    runtime.path = [];
    runtime.destWorld = null;
    runtime.pendingAction = null;
    runtime.doorAnim = null;
    if (state && state.pendingOrder) { state.pendingOrder = null; }
    const entry = (prev && map.entryFrom && map.entryFrom[prev]) ? map.entryFrom[prev] : map.spawn;
    runtime.px = entry.col;
    runtime.py = entry.row;
    runtime.facing = entry.facing || "SE";
    runtime.yaw = facingToYaw(runtime.facing);
    runtime.camera.initializedForLoc = "";
  }
  if (map.id === "jail" && runtime.px >= 4.4) {
    runtime.px = 2.4;
    runtime.py = 3.8;
    runtime.facing = "NE";
    runtime.yaw = facingToYaw("NE");
  }
}

function setPlayerPos(state, wx, wy, facing) {
  ensurePlayerPos(state);
  runtime.px = wx;
  runtime.py = wy;
  if (facing) {
    runtime.facing = facing;
    runtime.yaw = facingToYaw(facing);
  }
}

function isBlocked(map, col, row, state) {
  if (typeof map === "string") { map = MAPS[map] || MAPS.square; }
  if (!map || col < 0 || col >= COLS || row < 0 || row >= ROWS) { return true; }
  if (map.id === "jail") {
    const isOpen = !!(state && state.jail && (state.jail.unlocked || state.jail.escaped));
    if (!isOpen && col >= 5) { return true; }
    if (isOpen && col === 5 && row !== 4) { return true; }
  }
  for (let i = 0; i < (map.obstacles || []).length; i++) {
    const ob = map.obstacles[i];
    /* В клетке проход (5,4) или (4,4) управляется замком решётки выше */
    if (map.id === "jail" && (ob.kind === "bars_seg" || ob.kind === "bars_door")) { continue; }
    if (ob.col === col && ob.row === row) { return true; }
  }
  return false;
}

function isWalkable(locOrMap, col, row, state) {
  const map = typeof locOrMap === "string" ? (MAPS[locOrMap] || MAPS.square) : locOrMap;
  return !isBlocked(map, Math.round(col), Math.round(row), state);
}

function findPath(map, sc, sr, tc, tr, state) {
  sc = clampVal(Math.round(sc), 0, COLS - 1);
  sr = clampVal(Math.round(sr), 0, ROWS - 1);
  tc = clampVal(Math.round(tc), 0, COLS - 1);
  tr = clampVal(Math.round(tr), 0, ROWS - 1);

  if (isBlocked(map, tc, tr, state)) {
    let best = null;
    let bestScore = 9999;
    for (let rad = 1; rad <= COLS && !best; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) { continue; }
          const nc = tc + dc;
          const nr = tr + dr;
          if (!isBlocked(map, nc, nr, state)) {
            const score = Math.hypot(nc - tc, nr - tr) * 10 + Math.hypot(nc - sc, nr - sr);
            if (score < bestScore) { bestScore = score; best = { col: nc, row: nr }; }
          }
        }
      }
    }
    if (!best) { return []; }
    tc = best.col;
    tr = best.row;
  }

  if (sc === tc && sr === tr) { return []; }

  const open = [{ col: sc, row: sr, g: 0, f: Math.hypot(tc - sc, tr - sr), parent: null }];
  const closed = {};
  const dirs = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]
  ];

  let guard = 0;
  while (open.length && guard++ < 260) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift();
    const ck = cur.col + "," + cur.row;
    if (closed[ck]) { continue; }
    closed[ck] = true;

    if (cur.col === tc && cur.row === tr) {
      const out = [];
      let n = cur;
      while (n && n.parent) {
        out.unshift({ col: n.col, row: n.row });
        n = n.parent;
      }
      return out;
    }

    for (let i = 0; i < dirs.length; i++) {
      const nc = cur.col + dirs[i][0];
      const nr = cur.row + dirs[i][1];
      const nk = nc + "," + nr;
      if (closed[nk] || isBlocked(map, nc, nr, state)) { continue; }
      if (dirs[i][0] !== 0 && dirs[i][1] !== 0) {
        if (isBlocked(map, cur.col + dirs[i][0], cur.row, state) || isBlocked(map, cur.col, cur.row + dirs[i][1], state)) {
          continue;
        }
      }
      const ng = cur.g + dirs[i][2];
      open.push({ col: nc, row: nr, g: ng, f: ng + Math.hypot(tc - nc, tr - nr), parent: cur });
    }
  }
  return [];
}

/* ---------- Сторож клетки с честным 360°-маршрутом ---------- */
function jailGuardIsoState(jail) {
  const phase = (jail && jail.guardPhase) || "watching";
  const tick = (jail && typeof jail.guardTick === "number") ? jail.guardTick : 0;
  if (phase === "away") {
    return { col: 8.6 + (tick % 2) * 0.4, row: 2.0, facing: "SE", yaw: Math.PI * 0.68, phase: "away" };
  }
  if (phase === "turning") {
    return { col: 7.5, row: 2.7, facing: "NW", yaw: -Math.PI * 0.22, phase: "turning" };
  }
  if (phase === "alert") {
    return { col: 6.1, row: 3.0, facing: "NW", yaw: -Math.PI * 0.5, phase: "alert" };
  }
  return { col: 6.9, row: 3.0, facing: "NW", yaw: -Math.PI * 0.5, phase: "watching" };
}

/* ---------- Полный сбор сущностей локации (с честной одеждой Kenshi и отрубленными конечностями) ---------- */
function getGlobalBow() {
  return (typeof window !== "undefined" && window.Bow) ? window.Bow : (globalThis.Bow || {});
}
function getGlobalState() {
  const g = typeof window !== "undefined" ? window : globalThis;
  return (g.BowGame && g.BowGame.getState) ? g.BowGame.getState() : null;
}

function collectSceneEntities(state, stageSel) {
  if (!state || !state.player) { return []; }
  ensurePlayerPos(state);
  const Bow = getGlobalBow();
  const map = mapOf(state);
  const entities = [];
  const isAggro = !!(Bow.skirmish && Bow.skirmish.isAggressive && Bow.skirmish.isAggressive());
  const pLoad = (Bow.equip && Bow.equip.visualLoadout)
    ? Bow.equip.visualLoadout(state.player, !!state.jail)
    : { head: "", armor: "", hands: "", legs: "", boots: "", weapon: "", holsteredWeapon: "", shield: "", bareTorso: false, bareLegs: false, bareFeet: false, severed: {} };
  const pend = state.pendingOrder || null;

  if (state.skirmish && (state.skirmish.active || state.skirmish.phase === "aftermath") && state.skirmish.location === state.player.location) {
    const sk = state.skirmish;
    sk.units.forEach((u) => {
      const scr = tileToScreen(u.wx, u.wy);
      const isP = u.key === "player";
      const refActor = isP ? state.player : (u.refId && state.people ? state.people[u.refId] : u.actorObj);
      const unitSevered = Object.assign({}, u.severed || {});
      if (refActor && refActor.body) {
        ["left_arm", "right_arm", "left_leg", "right_leg"].forEach((lk) => {
          if (refActor.body[lk] && refActor.body[lk].lost) { unitSevered[lk] = true; }
        });
      }
      const yaw = typeof u.yaw === "number" ? (Math.PI * 0.5 - u.yaw) : facingToYaw(u.facing || "SE");
      entities.push({
        type: isP ? "player" : (u.side === "ally" ? "ally" : "skirmish_foe"),
        id: u.key,
        unitKey: u.key,
        personId: u.refId || null,
        col: u.wx,
        row: u.wy,
        x: scr.x,
        y: scr.y,
        depth: u.wx + u.wy,
        roleKey: u.roleKey,
        isPlayer: isP,
        side: isP ? "player" : u.side,
        facing: u.facing || "SE",
        yaw,
        pose: u.pose || "idle",
        poseTtl: u.poseTtl || 0,
        swingKind: u.swingKind || "slash",
        ready: sk.active && !u.down && !u.dead,
        female: !!u.female,
        weapon: u.disarmed ? "none" : (u.weapon || "none"),
        holsteredWeapon: isP ? pLoad.holsteredWeapon : "",
        armor: isP ? pLoad.armor : (u.armor || "item:linen_shirt"),
        headGear: isP ? pLoad.head : (u.roleKey === "guard" ? "iron_helm" : ""),
        handsGear: isP ? pLoad.hands : "",
        legsGear: isP ? pLoad.legs : "item:cloth_pants",
        bootsGear: isP ? pLoad.boots : "item:simple_shoes",
        offhand: isP ? pLoad.offhand : "",
        shield: isP ? pLoad.shield : (u.shield ? "heater_shield" : ""),
        bareTorso: isP ? pLoad.bareTorso : false,
        bareLegs: isP ? pLoad.bareLegs : false,
        bareFeet: isP ? pLoad.bareFeet : false,
        severed: unitSevered,
        hp: u.hp,
        maxHp: u.maxHp || 100,
        down: !!u.down,
        dead: !!u.dead,
        selected: sk.targetKey === u.key || !!(pend && pend.targetId === u.key),
        hostileHighlight: (u.side === "enemy" && (sk.targetKey === u.key || runtime.hoverEntityId === u.key)),
        name: u.name
      });
    });
    return entities;
  }

  const isComa = !!(Bow.state && Bow.state.isComatose && Bow.state.isComatose(state.player));
  const pScr = tileToScreen(runtime.px, runtime.py);
  const pWep = (state.jail || !Bow.stage || !Bow.stage.weaponKindOf) ? "none" : Bow.stage.weaponKindOf(state, state.player);

  entities.push({
    type: "player",
    id: "player",
    isPlayer: true,
    col: runtime.px,
    row: runtime.py,
    x: pScr.x,
    y: pScr.y,
    depth: runtime.px + runtime.py,
    roleKey: state.jail ? "prisoner" : "player",
    side: "player",
    facing: runtime.facing,
    yaw: runtime.yaw,
    pose: (runtime.path.length > 0 && !isWorldPaused(state)) ? "walk" : "idle",
    walkPhase: runtime.stepPhase * 8.0,
    ready: isAggro && !state.jail && !isComa,
    female: state.player && state.player.pron === "f",
    weapon: pLoad.severed.right_arm ? "none" : pWep,
    holsteredWeapon: pLoad.holsteredWeapon,
    armor: pLoad.armor,
    headGear: pLoad.head,
    handsGear: pLoad.hands,
    legsGear: pLoad.legs,
    bootsGear: pLoad.boots,
    offhand: pLoad.offhand,
    shield: pLoad.shield,
    bareTorso: pLoad.bareTorso,
    bareLegs: pLoad.bareLegs,
    bareFeet: pLoad.bareFeet,
    severed: pLoad.severed,
    down: isComa,
    dead: !!state.dead,
    selected: !!(stageSel && stageSel.kind === "self"),
    name: state.player.name || "Вы"
  });

  if (state.jail) {
    const gs = jailGuardIsoState(state.jail);
    const gScr = tileToScreen(gs.col, gs.row);
    entities.push({
      type: "jail_guard",
      id: "jail:guard",
      col: gs.col,
      row: gs.row,
      x: gScr.x,
      y: gScr.y,
      depth: gs.col + gs.row,
      roleKey: "guard",
      side: gs.phase === "alert" ? "enemy" : "neutral",
      facing: gs.facing,
      yaw: gs.yaw,
      guardPhase: gs.phase,
      pose: "idle",
      weapon: "spear",
      armor: "item:padded",
      headGear: "item:iron_helm",
      legsGear: "item:wool_trousers",
      bootsGear: "item:iron_boots",
      shield: "heater_shield",
      bareTorso: false,
      bareLegs: false,
      bareFeet: false,
      severed: {},
      selected: runtime.hoverEntityId === "jail:guard",
      hostileHighlight: gs.phase === "alert",
      name: "Сторож"
    });
    return entities;
  }

  const loc = state.player.location;
  const npcs = Object.keys(state.people || {}).map((id) => state.people[id])
    .filter((p) => p && p.alive && p.location === loc);

  npcs.forEach((p, idx) => {
    const slot = map.npcSlots[idx % map.npcSlots.length] || { col: 6.2, row: 4.0, facing: "SW" };
    const scr = tileToScreen(slot.col, slot.row);
    const rKey = p.id === "person:tarn" ? "smith" : (p.id === "person:bror" ? "hunter" : (p.id === "person:sigi" ? "innkeeper" : "villager"));
    const isSel = !!(stageSel && stageSel.kind === "person" && stageSel.personId === p.id) ||
                  !!(pend && pend.targetId === p.id) ||
                  runtime.hoverEntityId === p.id;
    const isHostile = (isAggro && (runtime.hoverEntityId === p.id || (pend && pend.kind === "attack" && pend.targetId === p.id))) ||
                      (p.attitude <= -25 && isSel);
    const npcLoad = (Bow.equip && Bow.equip.visualLoadout) ? Bow.equip.visualLoadout(p, false) : { severed: {} };
    entities.push({
      type: "npc",
      id: p.id,
      person: p,
      col: slot.col,
      row: slot.row,
      x: scr.x,
      y: scr.y,
      depth: slot.col + slot.row,
      roleKey: rKey,
      side: p.attitude >= 15 ? "ally" : (p.attitude <= -25 ? "enemy" : "neutral"),
      facing: slot.facing || "SW",
      yaw: facingToYaw(slot.facing || "SW"),
      pose: "idle",
      female: p.pron === "f",
      weapon: npcLoad.severed.right_arm ? "none" : (Bow.stage && Bow.stage.weaponKindOf ? Bow.stage.weaponKindOf(state, p) : "none"),
      armor: p.armor || "item:linen_shirt",
      legsGear: "item:wool_trousers",
      bootsGear: "item:travel_boots",
      bareTorso: false,
      bareLegs: false,
      bareFeet: false,
      severed: npcLoad.severed,
      selected: isSel,
      hostileHighlight: isHostile,
      name: p.name
    });
  });

  if (state.guard && state.guard.arrived && Array.isArray(state.guard.squad)) {
    const gSlots = [{ col: 6.2, row: 2.2 }, { col: 7.4, row: 4.2 }, { col: 5.4, row: 5.2 }];
    state.guard.squad.slice(0, 3).forEach((gu, idx) => {
      const sl = gSlots[idx] || { col: 7, row: 3 };
      const scr = tileToScreen(sl.col, sl.row);
      const gid = "guard:" + idx;
      const gSel = !!(stageSel && stageSel.kind === "guard") || runtime.hoverEntityId === gid || !!(pend && pend.targetId === gid);
      entities.push({
        type: "guard",
        id: gid,
        col: sl.col,
        row: sl.row,
        x: scr.x,
        y: scr.y,
        depth: sl.col + sl.row,
        roleKey: "guard",
        side: "enemy",
        facing: "SW",
        yaw: Math.atan2(runtime.px - sl.col, runtime.py - sl.row),
        pose: "idle",
        ready: true,
        weapon: "spear",
        armor: "item:padded",
        headGear: "item:iron_helm",
        legsGear: "item:wool_trousers",
        bootsGear: "item:iron_boots",
        shield: "heater_shield",
        bareTorso: false,
        bareLegs: false,
        bareFeet: false,
        severed: {},
        selected: gSel,
        hostileHighlight: gSel || isAggro,
        name: gu.name || "Стражник"
      });
    });
  }

  if (state.encounter && state.encounter.robber) {
    const rScr = tileToScreen(6.2, 3.2);
    const rSel = !!(stageSel && stageSel.kind === "robber") || runtime.hoverEntityId === "robber" || !!(pend && pend.targetId === "robber");
    entities.push({
      type: "robber",
      id: "robber",
      col: 6.2,
      row: 3.2,
      x: rScr.x,
      y: rScr.y,
      depth: 9.4,
      roleKey: "robber",
      side: "enemy",
      facing: "SW",
      yaw: Math.atan2(runtime.px - 6.2, runtime.py - 3.2),
      pose: "idle",
      ready: true,
      weapon: "knife",
      armor: "item:padded",
      legsGear: "item:wool_trousers",
      bootsGear: "item:travel_boots",
      bareTorso: false,
      bareLegs: false,
      bareFeet: false,
      severed: {},
      selected: rSel,
      hostileHighlight: true,
      name: state.encounter.robber.name || "Грабитель"
    });
  }

  const corpses = Bow.actions && Bow.actions.corpsesAt ? Bow.actions.corpsesAt(state, loc) : [];
  corpses.slice(0, 4).forEach((c, idx) => {
    const cc = typeof c.isoCol === "number" ? c.isoCol : (3.4 + idx * 1.9);
    const cr = typeof c.isoRow === "number" ? c.isoRow : 6.0;
    const scr = tileToScreen(cc, cr);
    entities.push({
      type: "corpse",
      id: c.id,
      corpse: c,
      col: cc,
      row: cr,
      x: scr.x,
      y: scr.y,
      depth: cc + cr - 0.8,
      roleKey: c.roleKey || "villager",
      side: "neutral",
      yaw: (idx * 1.2) % 6.28,
      female: c.pron === "f",
      armor: "item:linen_shirt",
      legsGear: "item:cloth_pants",
      bootsGear: "item:simple_shoes",
      dead: true,
      selected: !!(stageSel && stageSel.kind === "corpse" && stageSel.corpseId === c.id) || runtime.hoverEntityId === c.id,
      name: c.name || "Тело"
    });
  });

  return entities;
}

/* ============================================================
   WEBGL THREE.JS RENDERER (ГЛАВНАЯ СЦЕНА + 3D-КУКЛА + РЕЙКАСТЕР)
   ============================================================ */
const glState = {
  attempted: false,
  ready: false,
  renderer: null,
  canvas: null,
  scene: null,
  camera: null,
  hemiLight: null,
  dirLight: null,
  fireLights: [],
  envGroup: null,
  builtLocKey: "",
  builtQualityKey: "",
  propGroup: null,
  actorGroup: null,
  actorCache: new Map(),
  limbGroup: null,
  fxGroup: null,
  snowPoints: null,
  raycaster: new THREE.Raycaster(),
  pickables: [],

  /* Второй компактный рендерер для 3D-куклы снаряжения в инвентаре */
  pdRenderer: null,
  pdScene: null,
  pdCamera: null,
  pdRigWrap: null,
  pdLastSig: ""
};

function canCreateWebGL() {
  if (typeof document === "undefined" || typeof WebGLRenderingContext === "undefined") {
    return false;
  }
  try {
    const probe = document.createElement("canvas");
    const ctx = probe.getContext("webgl2") || probe.getContext("webgl");
    return !!ctx;
  } catch (_e) {
    return false;
  }
}

function initThreeIfPossible(targetCanvas) {
  if (glState.attempted && !glState.ready) { return false; }
  if (!isLiveBrowser()) { return false; }

  const q = getQualityProfile();
  if (!glState.ready) {
    glState.attempted = true;
    if (!canCreateWebGL()) { return false; }
    try {
      glState.renderer = new THREE.WebGLRenderer({
        canvas: targetCanvas,
        antialias: q.antialias,
        powerPreference: "high-performance",
        alpha: false
      });
      glState.canvas = targetCanvas;
      glState.renderer.shadowMap.enabled = q.shadows;
      glState.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      glState.renderer.outputColorSpace = THREE.SRGBColorSpace;

      glState.scene = new THREE.Scene();
      glState.scene.background = new THREE.Color("#141d27");

      glState.camera = new THREE.OrthographicCamera(-10, 10, 6, -6, 0.1, 90);

      glState.hemiLight = new THREE.HemisphereLight(0xbdd4ea, 0x2a333d, 0.92);
      glState.scene.add(glState.hemiLight);

      glState.dirLight = new THREE.DirectionalLight(0xdce9f7, 1.05);
      glState.dirLight.position.set(-7, 15, 6);
      glState.dirLight.castShadow = q.shadows;
      glState.dirLight.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
      glState.dirLight.shadow.camera.near = 1;
      glState.dirLight.shadow.camera.far = 36;
      glState.dirLight.shadow.camera.left = -10;
      glState.dirLight.shadow.camera.right = 10;
      glState.dirLight.shadow.camera.top = 10;
      glState.dirLight.shadow.camera.bottom = -10;
      glState.dirLight.shadow.bias = -0.0012;
      glState.scene.add(glState.dirLight);
      glState.scene.add(glState.dirLight.target);
      glState.dirLight.target.position.set(5.5, 0, 3.5);

      glState.propGroup = new THREE.Group();
      glState.actorGroup = new THREE.Group();
      glState.limbGroup = new THREE.Group();
      glState.fxGroup = new THREE.Group();
      glState.scene.add(glState.propGroup);
      glState.scene.add(glState.limbGroup);
      glState.scene.add(glState.actorGroup);
      glState.scene.add(glState.fxGroup);

      buildSnowParticles3D();
      glState.ready = true;
    } catch (_err) {
      glState.ready = false;
      return false;
    }
  } else if (targetCanvas && glState.canvas !== targetCanvas) {
    /* Если DOM пересоздал узел canvas, переносим или пересоздаём рендерер */
    try {
      glState.renderer.dispose();
    } catch (_e) { /* ignore */ }
    glState.ready = false;
    glState.attempted = false;
    return initThreeIfPossible(targetCanvas);
  }
  return glState.ready;
}

function buildSnowParticles3D() {
  if (glState.snowPoints) {
    glState.scene.remove(glState.snowPoints);
  }
  const count = 220;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = -2 + ((i * 73) % 160) * 0.1;
    positions[i * 3 + 1] = ((i * 37) % 60) * 0.1;
    positions[i * 3 + 2] = -2 + ((i * 53) % 120) * 0.1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xe6eff8,
    size: 3.2,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.72
  });
  glState.snowPoints = new THREE.Points(geo, mat);
  glState.scene.add(glState.snowPoints);
}

onQualityChange((prof) => {
  if (!glState.ready || !glState.renderer) { return; }
  glState.renderer.shadowMap.enabled = prof.shadows;
  glState.dirLight.castShadow = prof.shadows;
  glState.dirLight.shadow.mapSize.set(prof.shadowMapSize, prof.shadowMapSize);
  if (glState.dirLight.shadow.map) {
    glState.dirLight.shadow.map.dispose();
    glState.dirLight.shadow.map = null;
  }
  glState.builtQualityKey = "";
  const st = getGlobalState();
  if (st) { render3DNow(st); }
});

function rebuildLocation3DIfNeeded(map) {
  const q = getQualityProfile();
  if (glState.builtLocKey === map.id && glState.builtQualityKey === q.key && glState.envGroup) {
    return;
  }
  glState.builtLocKey = map.id;
  glState.builtQualityKey = q.key;

  if (glState.envGroup) {
    glState.scene.remove(glState.envGroup);
  }
  glState.fireLights.forEach((l) => glState.scene.remove(l));
  glState.fireLights = [];
  glState.propGroup.clear();
  glState.pickables = [];

  glState.envGroup = buildEnvironment3D(map, q);
  glState.scene.add(glState.envGroup);
  glState.envGroup.traverse((obj) => {
    if (obj.isMesh && (obj.userData.pickTarget || obj.userData.isGround)) {
      glState.pickables.push(obj);
    }
  });

  /* Реквизит и интерактивные объекты локации */
  (map.obstacles || []).forEach((ob) => {
    /* В клетке решётка строится единой сплошной 3D-перегородкой в buildEnvironment3D! */
    if (map.id === "jail" && (ob.kind === "bars_seg" || ob.kind === "bars_door")) {
      return;
    }
    const propMesh = buildProp3D(ob.kind, q.key);
    propMesh.position.set(ob.col, 0, ob.row);

    const matchedSpot = (map.spots || []).find((s) => Math.abs(s.col - ob.col) <= 0.6 && Math.abs(s.row - ob.row) <= 0.6);
    if (matchedSpot) {
      propMesh.traverse((ch) => {
        if (ch.isMesh) {
          ch.userData.pickTarget = { kind: "spot", spot: matchedSpot, col: matchedSpot.col, row: matchedSpot.row };
          glState.pickables.push(ch);
        }
      });
    }
    propMesh.userData.col = ob.col;
    propMesh.userData.row = ob.row;
    glState.propGroup.add(propMesh);

    if (ob.light) {
      const pt = new THREE.PointLight(new THREE.Color(ob.lightColor || "#ff8e3c"), ob.light * 2.4, 7.5, 1.6);
      pt.position.set(ob.col, 1.15, ob.row + 0.15);
      pt.userData.baseIntensity = ob.light * 2.4;
      glState.scene.add(pt);
      glState.fireLights.push(pt);
    }
  });

  /* Стойки/точки взаимодействия без отдельного obstacle (например, стойка с поковками в кузнице или звериный лаз) */
  (map.spots || []).forEach((sp) => {
    const hasOb = (map.obstacles || []).some((ob) => Math.abs(ob.col - sp.col) <= 0.6 && Math.abs(ob.row - sp.row) <= 0.6);
    if (!hasOb) {
      const markerProp = sp.key === "rack" ? buildProp3D("crates", q.key) : buildProp3D("rock", q.key);
      markerProp.position.set(sp.col, 0, sp.row);
      markerProp.traverse((ch) => {
        if (ch.isMesh) {
          ch.userData.pickTarget = { kind: "spot", spot: sp, col: sp.col, row: sp.row };
          glState.pickables.push(ch);
        }
      });
      glState.propGroup.add(markerProp);
    }
  });
}

function updateLightingAndSky(state, map, nowSec) {
  const Bow = getGlobalBow();
  const sky = (Bow.stage && Bow.stage.skyOf) ? Bow.stage.skyOf(state) : { phase: "day", skyTop: "#18222d", snowy: false };
  const isOutdoor = !!map.outdoor;

  if (!isOutdoor) {
    glState.scene.background.set("#0e131a");
    glState.hemiLight.color.set("#90a5bc");
    glState.hemiLight.groundColor.set("#2b231d");
    glState.hemiLight.intensity = 0.76;
    glState.dirLight.color.set("#ffd9b3");
    glState.dirLight.intensity = 0.58;
  } else if (sky.phase === "night") {
    glState.scene.background.set("#0a1018");
    glState.hemiLight.color.set("#6785a8");
    glState.hemiLight.groundColor.set("#18222e");
    glState.hemiLight.intensity = 0.58;
    glState.dirLight.color.set("#8bb4de");
    glState.dirLight.intensity = 0.68;
  } else if (sky.phase === "dawn" || sky.phase === "dusk") {
    glState.scene.background.set("#18212e");
    glState.hemiLight.color.set("#b69f96");
    glState.hemiLight.groundColor.set("#242f3b");
    glState.hemiLight.intensity = 0.80;
    glState.dirLight.color.set("#f0b27a");
    glState.dirLight.intensity = 0.96;
  } else {
    glState.scene.background.set("#212e3b");
    glState.hemiLight.color.set("#cfe0f0");
    glState.hemiLight.groundColor.set("#384654");
    glState.hemiLight.intensity = 0.98;
    glState.dirLight.color.set("#eef5fc");
    glState.dirLight.intensity = 1.12;
  }

  /* Живое дыхание огня в горне, жаровне, очаге и костре */
  for (let i = 0; i < glState.fireLights.length; i++) {
    const fl = glState.fireLights[i];
    fl.intensity = fl.userData.baseIntensity * (0.90 + Math.sin(nowSec * 8.5 + i * 2.1) * 0.10);
  }
  glState.propGroup.traverse((ch) => {
    if (ch.userData && ch.userData.flickerFlame) {
      const s = 0.88 + Math.sin(nowSec * 11.0 + ch.id) * 0.14;
      ch.scale.y = 0.32 * s;
    }
  });
}

function updateOrthoCamera(viewportEl) {
  const m = computeViewMetrics(viewportEl);
  const q = getQualityProfile();
  const pr = effectivePixelRatio(q);
  const targetW = Math.max(2, Math.round(m.vw * pr));
  const targetH = Math.max(2, Math.round(m.vh * pr));

  if (glState.canvas.width !== targetW || glState.canvas.height !== targetH) {
    glState.renderer.setSize(m.vw, m.vh, false);
    glState.renderer.setPixelRatio(pr);
  }

  /* Привязываем центр камеры к (ORIGIN_X, ORIGIN_Y) в базовых координатах VIEW_W × VIEW_H */
  const centerStageX = (m.vw * 0.5 - m.tx) / m.scale;
  const centerStageY = (m.vh * 0.5 - m.ty) / m.scale;
  const centerWorld = screenToWorld(centerStageX, centerStageY);

  const lookTarget = new THREE.Vector3(centerWorld.wx, 0, centerWorld.wy);
  glState.camera.position.copy(lookTarget).add(CAM_OFFSET_VEC);
  glState.camera.lookAt(lookTarget);

  const pxPerCamUnit = BASE_PX_PER_UNIT * m.scale;
  const halfW = (m.vw * 0.5) / pxPerCamUnit;
  const halfH = (m.vh * 0.5) / pxPerCamUnit;

  glState.camera.left = -halfW;
  glState.camera.right = halfW;
  glState.camera.top = halfH;
  glState.camera.bottom = -halfH;
  glState.camera.updateProjectionMatrix();
}

function actorSignature(ent) {
  const sev = ent.severed || {};
  return [
    ent.roleKey || "",
    ent.side || "",
    ent.female ? "f" : "m",
    ent.isPlayer ? "P" : "N",
    ent.armor || "",
    ent.headGear || "",
    ent.handsGear || "",
    ent.legsGear || "",
    ent.bootsGear || "",
    ent.weapon || "",
    ent.holsteredWeapon || "",
    ent.offhand || "",
    ent.shield || "",
    ent.bareTorso ? "1" : "0",
    ent.bareLegs ? "1" : "0",
    ent.bareFeet ? "1" : "0",
    sev.left_arm ? "1" : "0",
    sev.right_arm ? "1" : "0",
    sev.left_leg ? "1" : "0",
    sev.right_leg ? "1" : "0"
  ].join("|");
}

const RING_GEO = new THREE.RingGeometry(0.28, 0.36, 24);
const DISC_GEO = new THREE.CircleGeometry(0.30, 18);

function syncActorsAndFx3D(state, map, stageSel, nowSec) {
  const entities = collectSceneEntities(state, stageSel);
  const activeIds = new Set();
  const q = getQualityProfile();

  /* Скрытие мелких дальних деталей в Режиме производительности */
  if (glState.envGroup) {
    glState.envGroup.traverse((ch) => {
      if (ch.userData && ch.userData.isFineDetail) {
        const d = Math.hypot(ch.position.x - runtime.px, ch.position.z - runtime.py);
        ch.visible = d <= q.detailRadius;
      }
    });
  }

  /* Анимация 3D-дверей и двери клетки */
  if (glState.envGroup && glState.envGroup.userData.doorPivots) {
    const pivots = glState.envGroup.userData.doorPivots;
    Object.keys(pivots).forEach((toKey) => {
      const p = pivots[toKey];
      const openProg = (runtime.doorAnim && runtime.doorAnim.exitTo === toKey) ? runtime.doorAnim.progress : 0;
      p.rotation.y = -openProg * 1.35;
    });
  }
  if (map.id === "jail" && glState.envGroup && glState.envGroup.userData.jailPartition) {
    const jp = glState.envGroup.userData.jailPartition;
    if (jp.userData.doorPivot) {
      const jailOpen = (state.jail && state.jail.escaped) ? 1 : 0;
      jp.userData.doorPivot.rotation.y = jailOpen * 1.32;
    }
    if (glState.envGroup.userData.guardVisionCone) {
      const jg = entities.find((e) => e.type === "jail_guard");
      const cone = glState.envGroup.userData.guardVisionCone;
      if (jg) {
        cone.visible = true;
        cone.position.set(jg.col, 0.03, jg.row);
        cone.rotation.y = jg.yaw;
      } else {
        cone.visible = false;
      }
    }
  }

  /* 3D-модели всех людей на локации */
  entities.forEach((ent) => {
    activeIds.add(ent.id);
    const sig = actorSignature(ent);
    let entry = glState.actorCache.get(ent.id);
    if (!entry || entry.sig !== sig) {
      if (entry) { glState.actorGroup.remove(entry.wrap); }
      const wrap = new THREE.Group();
      const rig = createHumanoid3D(ent);
      wrap.add(rig.root);

      /* Мягкая контактная тень под ногами (работает даже когда ShadowMap выключен в режиме Производительность!) */
      const shadowDisc = new THREE.Mesh(DISC_GEO, getBasicMat("#070b10", 0.38, false));
      shadowDisc.rotation.x = -Math.PI * 0.5;
      shadowDisc.position.y = 0.015;
      wrap.add(shadowDisc);

      /* 3D-кольцо выделения / цели / Alt-подсветки */
      const ringMesh = new THREE.Mesh(RING_GEO, getBasicMat("#9cd6ff", 0.88, true));
      ringMesh.rotation.x = -Math.PI * 0.5;
      ringMesh.position.y = 0.024;
      ringMesh.visible = false;
      wrap.add(ringMesh);

      rig.root.traverse((ch) => {
        if (ch.isMesh) {
          ch.userData.entityPick = ent.id;
        }
      });

      entry = { sig, wrap, rig, ringMesh };
      glState.actorCache.set(ent.id, entry);
      glState.actorGroup.add(wrap);
    }

    entry.wrap.userData.entitySnapshot = ent;
    entry.wrap.position.set(ent.col, 0, ent.row);
    entry.rig.root.rotation.y = typeof ent.yaw === "number" ? ent.yaw : facingToYaw(ent.facing);

    poseHumanoid3D(entry.rig, {
      time: isWorldPaused(state) ? 0 : nowSec,
      pose: ent.pose,
      poseTtl: ent.poseTtl,
      swingKind: ent.swingKind,
      walkPhase: ent.walkPhase,
      ready: ent.ready,
      down: ent.down,
      dead: ent.dead
    });

    /* Подсветка кольца под ногами (выбранный / наведённый / Alt / враг) */
    const showRing = ent.selected || ent.hostileHighlight || runtime.hoverEntityId === ent.id || (runtime.altHighlight && ent.type !== "player");
    entry.ringMesh.visible = showRing || ent.type === "player";
    if (ent.hostileHighlight) {
      entry.ringMesh.material = getBasicMat("#ee4246", 0.92, true);
    } else if (ent.selected || runtime.hoverEntityId === ent.id) {
      entry.ringMesh.material = getBasicMat("#9cd6ff", 0.90, true);
    } else if (runtime.altHighlight && ent.type !== "player") {
      entry.ringMesh.material = getBasicMat("#e5c46b", 0.78, true);
    } else {
      entry.ringMesh.material = getBasicMat("#7fb2df", 0.36, true);
    }
  });

  for (const [id, entry] of glState.actorCache.entries()) {
    if (!activeIds.has(id)) {
      glState.actorGroup.remove(entry.wrap);
      glState.actorCache.delete(id);
    }
  }

  /* Отрубленные 3D-конечности на снегу локации */
  glState.limbGroup.clear();
  const limbsHere = Array.isArray(state.severedLimbs)
    ? state.severedLimbs.filter((l) => l && l.location === map.id)
    : [];
  limbsHere.forEach((ld) => {
    const lm = buildSeveredLimbMesh(ld);
    lm.position.set(ld.wx, 0, ld.wy);
    glState.limbGroup.add(lm);
  });

  /* Маркеры маршрута и подсветка интерактивных объектов по Alt */
  glState.fxGroup.clear();
  if (runtime.altHighlight) {
    (map.spots || []).forEach((sp) => {
      const r = new THREE.Mesh(RING_GEO, getBasicMat("#e5c46b", 0.85, true));
      r.rotation.x = -Math.PI * 0.5;
      r.position.set(sp.col, 0.03, sp.row);
      r.scale.set(1.45, 1.45, 1);
      glState.fxGroup.add(r);
    });
    (map.exits || []).forEach((ex) => {
      const r = new THREE.Mesh(RING_GEO, getBasicMat("#9cd6ff", 0.85, true));
      r.rotation.x = -Math.PI * 0.5;
      r.position.set(ex.col, 0.03, ex.row);
      r.scale.set(1.55, 1.55, 1);
      glState.fxGroup.add(r);
    });
  }

  const orderTone = (state.pendingOrder && state.pendingOrder.kind === "attack") ? "#ee4246" : "#9cd6ff";
  if (runtime.path && runtime.path.length) {
    runtime.path.forEach((pt, idx) => {
      const dot = new THREE.Mesh(DISC_GEO, getBasicMat(orderTone, idx === runtime.path.length - 1 ? 0.78 : 0.35, true));
      dot.rotation.x = -Math.PI * 0.5;
      dot.position.set(pt.wx, 0.028, pt.wy);
      dot.scale.set(idx === runtime.path.length - 1 ? 0.85 : 0.32, idx === runtime.path.length - 1 ? 0.85 : 0.32, 1);
      glState.fxGroup.add(dot);
    });
  }

  /* Снегопад на открытых локациях (с учётом Режима производительности) */
  if (glState.snowPoints) {
    const Bow = getGlobalBow();
    const sky = (Bow.stage && Bow.stage.skyOf) ? Bow.stage.skyOf(state) : { snowy: true };
    const showSnow = !!map.outdoor && (sky.snowy || map.id === "forest" || map.id === "outskirts" || map.id === "square");
    glState.snowPoints.visible = showSnow && q.particleMult > 0.1;
    if (glState.snowPoints.visible && !isWorldPaused(state)) {
      const pos = glState.snowPoints.geometry.attributes.position;
      const limit = Math.floor(pos.count * q.particleMult);
      glState.snowPoints.geometry.setDrawRange(0, limit);
      for (let i = 0; i < limit; i++) {
        let y = pos.getY(i) - 0.035;
        let x = pos.getX(i) - 0.012;
        if (y < 0.05) { y = 5.8; }
        if (x < -2) { x = 13.5; }
        pos.setY(i, y);
        pos.setX(i, x);
      }
      pos.needsUpdate = true;
    }
  }
}

function render3DNow(state, explicitStageSel) {
  if (!state || !glState.ready || !glState.renderer || !glState.canvas) { return; }
  const vp = typeof document !== "undefined" ? document.getElementById("bow-stage-canvas") : null;
  if (!vp) { return; }
  const map = mapOf(state);
  const Bow = getGlobalBow();
  const stageSel = explicitStageSel !== undefined
    ? explicitStageSel
    : (Bow.ui && Bow.ui.getStageSelection ? Bow.ui.getStageSelection() : null);

  if (runtime.camera.initializedForLoc !== map.id) {
    runtime.camera.initializedForLoc = map.id;
    centerCameraOnPlayer(state, vp, false);
  }

  const nowSec = (typeof performance !== "undefined" ? performance.now() : Date.now()) * 0.001;
  rebuildLocation3DIfNeeded(map);
  updateLightingAndSky(state, map, nowSec);
  updateOrthoCamera(vp);
  syncActorsAndFx3D(state, map, stageSel, nowSec);
  glState.renderer.render(glState.scene, glState.camera);
}

/* Фоновый цикл живого дыхания сцены (огни, боевые замахи, снег) с умным лимитом FPS и сном на паузе */
function ensureAmbientLoop() {
  if (runtime.ambientRafId || !isLiveBrowser()) { return; }
  function loop(ts) {
    runtime.ambientRafId = requestAnimationFrame(loop);
    const st = getGlobalState();
    if (!st || !glState.ready) { return; }
    const q = getQualityProfile();
    const minInterval = isWorldPaused(st) ? 220 : (1000 / (q.maxFps || 60));
    if (ts - runtime.lastRenderMs < minInterval) { return; }
    runtime.lastRenderMs = ts;
    render3DNow(st);
  }
  runtime.ambientRafId = requestAnimationFrame(loop);
}

function paintStageCanvas(canvas, state, stageSel) {
  if (!canvas || !state) { return; }
  ensurePlayerPos(state);
  if (initThreeIfPossible(canvas)) {
    render3DNow(state, stageSel);
    ensureAmbientLoop();
  }
}

/* ---------- 3D-Рейкастер кликов мыши / ПКМ / Тача по 3D-моделям ---------- */
function raycastClient(clientX, clientY, state) {
  const st = state || getGlobalState();
  const vp = typeof document !== "undefined" ? document.getElementById("bow-stage-canvas") : null;
  if (!st || !vp) { return null; }

  const stagePt = clientToStage(clientX, clientY, vp);
  const fallbackWorld = screenToWorld(stagePt.sx, stagePt.sy);

  if (glState.ready && glState.camera) {
    const r = vp.getBoundingClientRect();
    if (r && r.width > 0 && r.height > 0) {
      const ndc = new THREE.Vector2(
        ((clientX - r.left) / r.width) * 2 - 1,
        -((clientY - r.top) / r.height) * 2 + 1
      );
      glState.raycaster.setFromCamera(ndc, glState.camera);

      /* 1. Сначала проверяем 3D-людей и бойцов (самый высокий приоритет) */
      const actorMeshes = [];
      glState.actorGroup.traverse((ch) => {
        if (ch.isMesh && ch.userData.entityPick) { actorMeshes.push(ch); }
      });
      const actorHits = glState.raycaster.intersectObjects(actorMeshes, false);
      if (actorHits.length > 0) {
        const hitId = actorHits[0].object.userData.entityPick;
        const entry = glState.actorCache.get(hitId);
        if (entry && entry.wrap.userData.entitySnapshot) {
          return { kind: "entity", entity: entry.wrap.userData.entitySnapshot, wx: fallbackWorld.wx, wy: fallbackWorld.wy };
        }
      }

      /* 2. Проверяем двери, порталы и интерактивные 3D-объекты (колодец, горн, очаг, стойка, клетка) */
      const envHits = glState.raycaster.intersectObjects(glState.pickables, false);
      for (let i = 0; i < envHits.length; i++) {
        const h = envHits[i];
        const pt = h.object.userData.pickTarget;
        if (pt) {
          return Object.assign({}, pt, { wx: h.point.x, wy: h.point.z });
        }
        if (h.object.userData.isGround) {
          return { kind: "ground", wx: h.point.x, wy: h.point.z, col: Math.round(h.point.x), row: Math.round(h.point.z) };
        }
      }
    }
  }

  return { kind: "ground", wx: fallbackWorld.wx, wy: fallbackWorld.wy, col: Math.round(fallbackWorld.wx), row: Math.round(fallbackWorld.wy) };
}

/* ---------- 3D-Кукла снаряжения в окне инвентаря (с вращением на 360° и 0 дёрганий!) ---------- */
function paintPaperdollCanvas(canvas, state) {
  if (!canvas || !state || !state.player) { return; }
  if (!isLiveBrowser() || !canCreateWebGL()) { return; }

  const Bow = getGlobalBow();
  const load = (Bow.equip && Bow.equip.visualLoadout)
    ? Bow.equip.visualLoadout(state.player, !!state.jail)
    : {};

  try {
    if (!glState.pdRenderer) {
      glState.pdRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      glState.pdRenderer.outputColorSpace = THREE.SRGBColorSpace;
      glState.pdScene = new THREE.Scene();

      const hemi = new THREE.HemisphereLight(0xd8e6f4, 0x2b3440, 1.15);
      const keyLight = new THREE.DirectionalLight(0xfff1de, 1.25);
      keyLight.position.set(2.5, 4.0, 3.5);
      const rimLight = new THREE.DirectionalLight(0x7fb2df, 0.65);
      rimLight.position.set(-3.0, 2.5, -2.5);
      glState.pdScene.add(hemi, keyLight, rimLight);

      /* Круглый каменный пьедестал куклы */
      const ped = new THREE.Mesh(
        new THREE.CylinderGeometry(0.48, 0.54, 0.08, 12),
        getMat(PALETTE.stoneDark, { roughness: 0.88 })
      );
      ped.position.set(0, -0.04, 0);
      glState.pdScene.add(ped);

      glState.pdRigWrap = new THREE.Group();
      glState.pdScene.add(glState.pdRigWrap);

      glState.pdCamera = new THREE.OrthographicCamera(-0.78, 0.78, 1.88, -0.10, 0.1, 20);
      glState.pdCamera.position.set(0, 1.12, 4.2);
      glState.pdCamera.lookAt(0, 0.88, 0);
    }

    const q = getQualityProfile();
    const pr = Math.min(2, effectivePixelRatio(q));
    const cssW = 168;
    const cssH = 208;
    glState.pdRenderer.setSize(cssW, cssH, false);
    glState.pdRenderer.setPixelRatio(pr);

    const spec = {
      isPlayer: true,
      side: "player",
      roleKey: state.jail ? "prisoner" : "player",
      female: state.player.pron === "f",
      armor: load.armor,
      headGear: load.head,
      handsGear: load.hands,
      legsGear: load.legs,
      bootsGear: load.boots,
      weapon: load.weapon,
      holsteredWeapon: load.holsteredWeapon,
      offhand: load.offhand,
      shield: load.shield,
      bareTorso: load.bareTorso,
      bareLegs: load.bareLegs,
      bareFeet: load.bareFeet,
      severed: load.severed
    };
    const sig = actorSignature(spec);
    if (glState.pdLastSig !== sig) {
      glState.pdLastSig = sig;
      glState.pdRigWrap.clear();
      const rig = createHumanoid3D(spec);
      poseHumanoid3D(rig, { pose: "idle", ready: !!load.weapon });
      glState.pdRigWrap.add(rig.root);
    }
    glState.pdRigWrap.rotation.y = runtime.paperdollYaw;
    glState.pdRenderer.render(glState.pdScene, glState.pdCamera);

    canvas.width = Math.round(cssW * pr);
    canvas.height = Math.round(cssH * pr);
    const ctx2d = canvas.getContext("2d");
    if (ctx2d) {
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
      ctx2d.drawImage(glState.pdRenderer.domElement, 0, 0, canvas.width, canvas.height);
    }
  } catch (_e) { /* ignore headless */ }
}

function rotatePaperdollBy(deltaRad, state) {
  runtime.paperdollYaw += deltaRad;
  if (typeof document !== "undefined") {
    const cv = document.querySelector("canvas.bow-paperdoll-canvas");
    if (cv) { paintPaperdollCanvas(cv, state || getGlobalState()); }
  }
}

/* ---------- Поле брани крупных отрядов (компактный тактический рендер) ---------- */
function paintBattleCanvas(canvas, state) {
  if (!canvas || !state || !state.fight) { return; }
  const ctx = canvas.getContext && canvas.getContext("2d");
  if (!ctx) { return; }
  const pr = isLiveBrowser() ? Math.min(2, window.devicePixelRatio || 1) : 1;
  if (canvas.width !== Math.round(BATTLE_W * pr) || canvas.height !== Math.round(BATTLE_H * pr)) {
    canvas.width = Math.round(BATTLE_W * pr);
    canvas.height = Math.round(BATTLE_H * pr);
  }
  ctx.setTransform(pr, 0, 0, pr, 0, 0);
  ctx.fillStyle = "#141d26";
  ctx.fillRect(0, 0, BATTLE_W, BATTLE_H);

  const f = state.fight;
  const Bow = getGlobalBow();
  const reachable = (Bow.fight && Bow.fight.reachableHexes) ? Bow.fight.reachableHexes(state) : [];

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 7; c++) {
      const pt = fightTileToScreen(c, r);
      const isReach = reachable.some((h) => h.col === c && h.row === r);
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y - FIGHT_TH * 0.5);
      ctx.lineTo(pt.x + FIGHT_TW * 0.5, pt.y);
      ctx.lineTo(pt.x, pt.y + FIGHT_TH * 0.5);
      ctx.lineTo(pt.x - FIGHT_TW * 0.5, pt.y);
      ctx.closePath();
      ctx.fillStyle = isReach ? "rgba(156,214,255,0.16)" : ((c + r) % 2 ? "#212e3b" : "#1b2632");
      ctx.fill();
      ctx.strokeStyle = isReach ? "#9cd6ff" : "rgba(140,165,190,0.22)";
      ctx.lineWidth = isReach ? 1.6 : 1;
      ctx.stroke();
    }
  }

  (f.units || []).filter((u) => u && !u.fled).forEach((u) => {
    const pt = fightTileToScreen(u.col || 0, u.row || 0);
    ctx.beginPath();
    ctx.ellipse(pt.x, pt.y + 4, 24, 11, 0, 0, Math.PI * 2);
    ctx.fillStyle = u.side === "enemy" ? "rgba(238,66,70,0.34)" : "rgba(156,214,255,0.34)";
    ctx.fill();
    ctx.strokeStyle = u.side === "enemy" ? "#ee4246" : "#9cd6ff";
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

/* ---------- Движение героя по локации (walkTo / walkAdjacentAndAct / walkToExitAndMove) ---------- */
function stopWalkLoop() {
  if (runtime.rafId && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(runtime.rafId);
  }
  runtime.rafId = null;
  runtime.lastTs = 0;
}

function cancelPlannedWalk() {
  stopWalkLoop();
  runtime.path = [];
  runtime.destWorld = null;
  runtime.pendingAction = null;
}

function previewOrderPath(state, targetWx, targetWy) {
  ensurePlayerPos(state);
  const map = mapOf(state);
  const gridPath = findPath(map, runtime.px, runtime.py, targetWx, targetWy, state);
  runtime.path = gridPath.map((pt, idx) => (
    idx === gridPath.length - 1
      ? { wx: clampVal(targetWx, 0.3, COLS - 0.6), wy: clampVal(targetWy, 0.3, ROWS - 0.6) }
      : { wx: pt.col, wy: pt.row }
  ));
  runtime.destWorld = runtime.path.length ? runtime.path[runtime.path.length - 1] : null;
  render3DNow(state);
}

function walkTo(state, targetWx, targetWy, onArrive, onRepaint) {
  ensurePlayerPos(state);
  const map = mapOf(state);
  const gridPath = findPath(map, runtime.px, runtime.py, targetWx, targetWy, state);
  const waypoints = gridPath.map((pt, idx) => (
    idx === gridPath.length - 1
      ? { wx: clampVal(targetWx, 0.3, COLS - 0.6), wy: clampVal(targetWy, 0.3, ROWS - 0.6) }
      : { wx: pt.col, wy: pt.row }
  ));

  runtime.pendingAction = onArrive || null;

  if (isHeadlessOrCalm() || waypoints.length === 0) {
    if (waypoints.length) {
      const last = waypoints[waypoints.length - 1];
      const dc = last.wx - runtime.px;
      const dr = last.wy - runtime.py;
      runtime.facing = facingFromDelta(dc, dr);
      runtime.yaw = Math.atan2(dc, dr);
      runtime.px = last.wx;
      runtime.py = last.wy;
    }
    runtime.path = [];
    runtime.destWorld = null;
    const doneNow = runtime.pendingAction;
    runtime.pendingAction = null;
    if (doneNow) { doneNow(); }
    if (onRepaint) { onRepaint(); }
    return;
  }

  runtime.path = waypoints;
  runtime.destWorld = waypoints[waypoints.length - 1];

  if (runtime.rafId) { return; }
  function frame(ts) {
    if (isWorldPaused(state)) {
      runtime.lastTs = ts;
      runtime.rafId = requestAnimationFrame(frame);
      return;
    }
    if (!runtime.lastTs) { runtime.lastTs = ts; }
    const dt = Math.min(0.08, Math.max(0.008, (ts - runtime.lastTs) / 1000));
    runtime.lastTs = ts;

    if (!runtime.path.length) {
      stopWalkLoop();
      runtime.destWorld = null;
      const fin = runtime.pendingAction;
      runtime.pendingAction = null;
      if (fin) { fin(); }
      if (onRepaint) { onRepaint(); }
      render3DNow(state);
      return;
    }

    const next = runtime.path[0];
    const dc = next.wx - runtime.px;
    const dr = next.wy - runtime.py;
    const dist = Math.hypot(dc, dr);
    const timeMult = (state && state.time && state.time.scale === "4x") ? 1.55 : 1.0;
    const speed = 4.9 * timeMult * dt;

    runtime.facing = facingFromDelta(dc, dr);
    runtime.yaw = lerpAngle(runtime.yaw, Math.atan2(dc, dr), Math.min(1, dt * 14));
    runtime.stepPhase += dt * timeMult;

    if (dist <= speed) {
      runtime.px = next.wx;
      runtime.py = next.wy;
      runtime.path.shift();
    } else {
      runtime.px += (dc / dist) * speed;
      runtime.py += (dr / dist) * speed;
    }

    render3DNow(state);
    if (onRepaint) { onRepaint(); }
    runtime.rafId = requestAnimationFrame(frame);
  }
  runtime.rafId = requestAnimationFrame(frame);
}

function walkToExitAndMove(state, targetLoc, doMoveFn, onRepaint) {
  ensurePlayerPos(state);
  const Bow = getGlobalBow();
  const map = mapOf(state);
  if (isHeadlessOrCalm() || !map.exits || !map.exits.length) {
    if (doMoveFn) { doMoveFn(); }
    return "instant";
  }

  let ex = map.exits.find((e) => e.to === targetLoc) || map.exits[0];
  const approachX = Math.max(0.6, Math.min(COLS - 0.8, ex.col + (ex.col <= 1 ? 0.8 : (ex.col >= 10 ? -0.8 : 0))));
  const approachY = Math.max(0.6, Math.min(ROWS - 0.8, ex.row));

  walkTo(state, approachX, approachY, () => {
    const dc = ex.col - runtime.px;
    const dr = ex.row - runtime.py;
    runtime.facing = facingFromDelta(dc, dr);
    runtime.yaw = Math.atan2(dc, dr);

    const isDoor = (ex.doorKind === "porch_door" || ex.doorKind === "forge_arch" || ex.doorKind === "inner_door");
    if (!isDoor) {
      if (Bow.ui && Bow.ui.triggerVeil) { Bow.ui.triggerVeil(); }
      if (doMoveFn) { doMoveFn(); }
      return;
    }

    if (Bow.audio && Bow.audio.playDoorCreak) { Bow.audio.playDoorCreak(); }
    runtime.doorAnim = { exitTo: ex.to, progress: 0.05 };
    let elapsed = 0;
    let prevTs = Date.now();
    function animDoor() {
      const now = Date.now();
      if (!isWorldPaused(state)) { elapsed += (now - prevTs); }
      prevTs = now;
      const t = Math.min(1, elapsed / 300);
      runtime.doorAnim = { exitTo: ex.to, progress: t };
      render3DNow(state);
      if (t < 1) {
        requestAnimationFrame(animDoor);
      } else {
        runtime.doorAnim = null;
        if (Bow.ui && Bow.ui.triggerVeil) { Bow.ui.triggerVeil(); }
        if (doMoveFn) { doMoveFn(); }
      }
    }
    requestAnimationFrame(animDoor);
  }, onRepaint);
  return "walking";
}

function walkAdjacentAndAct(state, targetCol, targetRow, onArrive, onRepaint) {
  ensurePlayerPos(state);
  const map = mapOf(state);
  const dist = Math.hypot(targetCol - runtime.px, targetRow - runtime.py);
  if (dist <= 1.55) {
    runtime.path = [];
    const dc = targetCol - runtime.px;
    const dr = targetRow - runtime.py;
    runtime.facing = facingFromDelta(dc, dr);
    runtime.yaw = Math.atan2(dc, dr);
    if (onArrive) { onArrive(); }
    render3DNow(state);
    if (onRepaint) { onRepaint(); }
    return;
  }

  let best = null;
  let bestScore = 9999;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dc === 0 && dr === 0) { continue; }
      const nc = Math.round(targetCol) + dc;
      const nr = Math.round(targetRow) + dr;
      if (isBlocked(map, nc, nr, state)) { continue; }
      const score = Math.hypot(nc - runtime.px, nr - runtime.py) + (dc !== 0 && dr !== 0 ? 0.25 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = { col: nc, row: nr };
      }
    }
  }
  if (!best) {
    if (onArrive) { onArrive(); }
    if (onRepaint) { onRepaint(); }
    return;
  }
  walkTo(state, best.col, best.row, () => {
    const dc = targetCol - runtime.px;
    const dr = targetRow - runtime.py;
    runtime.facing = facingFromDelta(dc, dr);
    runtime.yaw = Math.atan2(dc, dr);
    if (onArrive) { onArrive(); }
    render3DNow(state);
  }, onRepaint);
}

function setHoverScreen(sx, sy, entityId) {
  runtime.hoverEntityId = entityId || null;
  const w = screenToWorld(sx, sy);
  if (w.wx >= -0.5 && w.wx <= COLS && w.wy >= -0.5 && w.wy <= ROWS) {
    runtime.hoverWorld = { wx: w.wx, wy: w.wy, col: Math.round(w.wx), row: Math.round(w.wy) };
  } else {
    runtime.hoverWorld = null;
  }
  return runtime.hoverWorld;
}

function setHoverEntity(entityId) {
  if (runtime.hoverEntityId !== (entityId || null)) {
    runtime.hoverEntityId = entityId || null;
    const st = getGlobalState();
    if (st) { render3DNow(st); }
  }
}

function setAltHighlight(active) {
  const next = !!active;
  if (runtime.altHighlight !== next) {
    runtime.altHighlight = next;
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.classList.toggle("bow-alt-highlight", next);
    }
    const st = getGlobalState();
    if (st) { render3DNow(st); }
  }
  return runtime.altHighlight;
}

function isAltHighlight() {
  return !!runtime.altHighlight;
}

function getPlayerPos(state) {
  ensurePlayerPos(state);
  return {
    col: runtime.px,
    row: runtime.py,
    facing: runtime.facing,
    yaw: runtime.yaw,
    walking: runtime.path.length > 0 && !isWorldPaused(state)
  };
}

/* Совместимость со старыми тестами контурной подсветки */
function blitWithOutline(ctx, srcCanvas, dx, dy) {
  if (ctx && srcCanvas) { ctx.drawImage(srcCanvas, dx || 0, dy || 0); }
}

export function registerEngine3D(globalObj) {
  const g = globalObj || (typeof window !== "undefined" ? window : globalThis);
  const Bow = g.Bow = g.Bow || {};

  const spriteCompatCache = new Map();
  function getSprite(spec = {}) {
    const key = JSON.stringify(spec);
    if (spriteCompatCache.has(key)) { return spriteCompatCache.get(key); }
    const cv = (typeof document !== "undefined" && document.createElement)
      ? document.createElement("canvas")
      : { width: 96, height: 112 };
    cv.width = 96;
    cv.height = 112;
    cv._rig3d = createHumanoid3D(spec);
    spriteCompatCache.set(key, cv);
    return cv;
  }

  const api = {
    STYLE_VERSION: "v3-threejs-chiseled",
    ORDER_PEACE_HEX: 0x9cd6ff,
    ORDER_HOSTILE_HEX: 0xee4246,
    ENGINE: "Three.js",
    THREE_REVISION: THREE.REVISION,
    MAPS,
    VIEW_W,
    VIEW_H,
    BATTLE_W,
    BATTLE_H,
    COLS,
    ROWS,
    mapOf,
    tileToScreen,
    screenToWorld,
    screenToTile,
    fightTileToScreen,
    findPath,
    isBlocked,
    isWalkable,
    getSprite,
    blitWithOutline,
    paintPaperdollCanvas,
    rotatePaperdollBy,
    collectSceneEntities,
    jailGuardIsoState,
    paintStageCanvas,
    paintBattleCanvas,
    walkTo,
    walkToExitAndMove,
    walkAdjacentAndAct,
    previewOrderPath,
    cancelPlannedWalk,
    stopWalkLoop,
    setHoverScreen,
    setHoverEntity,
    setAltHighlight,
    isAltHighlight,
    raycastClient,
    setPlayerPos,
    getPlayerPos,
    getCamera,
    applyCameraToDom,
    centerCameraOnPlayer,
    panCameraBy,
    setCameraZoom,
    clientToStage,
    /* Управление качеством и Режимом производительности (0.0.9.3) */
    getQualityKey,
    getQualityProfile,
    setQualityKey,
    getAllQualityProfiles
  };

  Bow.iso = api;
  Bow.engine3d = {
    THREE,
    createHumanoid3D,
    poseHumanoid3D,
    buildSeveredLimbMesh,
    buildEnvironment3D,
    buildProp3D,
    buildWell3D,
    buildJailCellPartition3D,
    api
  };
  return api;
}
