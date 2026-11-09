/* ============================================================================
   ENGINE 2.5D — Классическая изометрия старых времён на новый лад (0.0.9.3-2.5D)
   - Нулевая нагрузка на GPU/CPU (запечённый HiDPI-фон + кэш гранёных спрайтов)
   - 0% вероятности белого/чёрного экрана (чистый аппаратный Canvas 2D без сбоев WebGL)
   - Честная 2.5D Z-сортировка (герой заходит ЗА каменный колодец и ели)
   - 3-слойный атмосферный северный снегопад и стелющаяся позёмка
   - Полигональные фигуры строго по эталону владельца (image-49.png)
   ============================================================================ */

import { drawChiseledPerson, getCachedActorCanvas } from "./chiseledActor25d.js";
import { bakeLocationBackdrop25D, buildForegroundProps25D } from "./squareScene25d.js";
import { getQualityKey, getQualityProfile, setQualityKey, getAllQualityProfiles, effectivePixelRatio, onQualityChange } from "../engine3d/quality.js";
import { MAPS as ENGINE3D_MAPS } from "./maps25d.js";

const VIEW_W = 1280;
const VIEW_H = 680;
const BATTLE_W = 1088;
const BATTLE_H = 368;
const COLS = 12;
const ROWS = 8;
const TILE_W = 86;
const TILE_H = 43;
const ORIGIN_X = 590;
const ORIGIN_Y = 122;

const FIGHT_COLS = 7;
const FIGHT_ROWS = 5;
const FIGHT_TW = 90;
const FIGHT_TH = 42;
const FIGHT_OX = 480;
const FIGHT_OY = 64;

function clampVal(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

function getGlobalBow() {
  const g = typeof window !== "undefined" ? window : globalThis;
  g.Bow = g.Bow || {};
  return g.Bow;
}

function getGlobalState() {
  const g = typeof window !== "undefined" ? window : globalThis;
  return (g.BowGame && g.BowGame.getState) ? g.BowGame.getState() : null;
}

function isLiveBrowser() {
  if (typeof window === "undefined" || typeof document === "undefined") { return false; }
  const ua = (window.navigator && window.navigator.userAgent) || "";
  return !/jsdom/i.test(ua);
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
    wx: (dy + dx) * 0.5,
    wy: (dy - dx) * 0.5
  };
}

function screenToTile(sx, sy) {
  const w = screenToWorld(sx, sy);
  return {
    col: clampVal(Math.round(w.wx), 0, COLS - 1),
    row: clampVal(Math.round(w.wy), 0, ROWS - 1)
  };
}

function fightTileToScreen(col, row) {
  return {
    x: FIGHT_OX + (col - row) * (FIGHT_TW * 0.5),
    y: FIGHT_OY + (col + row) * (FIGHT_TH * 0.5) + 46
  };
}

function mapOf(state) {
  if (state && state.jail) { return ENGINE3D_MAPS.jail; }
  const loc = (state && state.player && state.player.location) || "square";
  return ENGINE3D_MAPS[loc] || ENGINE3D_MAPS.square;
}

function facingToYaw(facing) {
  if (facing === "SE") { return 0.65; }
  if (facing === "NW") { return -2.45; }
  if (facing === "NE") { return 2.45; }
  return -0.65;
}

function deltaToFacing(dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? "SE" : "NW";
  }
  return dy >= 0 ? "SW" : "NE";
}

function isWorldPaused(state) {
  return !!(state && state.time && state.time.scale === "paused");
}

/* ---------- 3-слойная система северного снега и позёмки (без «дешёвых точек»!) ---------- */
const SNOW_FLAKES = [];
const SNOW_STREAKS = [];
(function initWeatherPools() {
  for (let i = 0; i < 150; i++) {
    const layer = i < 85 ? 1 : 2; // 1 = средний слой сцены, 2 = крупный передний боке-слой
    SNOW_FLAKES.push({
      x: (i * 97.3) % VIEW_W,
      y: (i * 53.7) % VIEW_H,
      r: layer === 2 ? (2.4 + (i % 4) * 0.65) : (1.1 + (i % 3) * 0.45),
      vy: layer === 2 ? (46 + (i % 5) * 9) : (24 + (i % 6) * 5),
      vx: layer === 2 ? (-22 - (i % 4) * 5) : (-11 - (i % 5) * 3),
      swayAmp: layer === 2 ? 14 : 9,
      swayFreq: 1.1 + (i % 7) * 0.22,
      phase: i * 0.77,
      alpha: layer === 2 ? 0.52 : 0.74,
      layer
    });
  }
  /* Стелющаяся ветровая позёмка по сугробам */
  for (let j = 0; j < 22; j++) {
    SNOW_STREAKS.push({
      x: (j * 131) % VIEW_W,
      y: 120 + ((j * 67) % (VIEW_H - 160)),
      len: 55 + (j % 5) * 22,
      speed: 75 + (j % 4) * 20,
      alpha: 0.08 + (j % 3) * 0.035
    });
  }
})();

export function registerEngine25D(globalObj) {
  const Bow = getGlobalBow();

  const runtime = {
    locKey: "",
    px: 5.5,
    py: 4.5,
    facing: "SE",
    yaw: 0.55,
    stepPhase: 0,
    path: [],
    rafId: null,
    ambientRafId: null,
    lastTick: 0,
    lastRenderMs: 0,
    onArrive: null,
    onFrameRepaint: null,
    hoverScreen: null,
    hoverEntityId: null,
    altHighlight: false,
    paperdollYaw: 0.45,
    backdropCache: {
      key: "",
      canvas: null
    },
    camera: {
      panX: 0,
      panY: 0,
      zoom: 1,
      minZoom: 0.68,
      maxZoom: 2.35,
      initializedForLoc: ""
    }
  };

  function computeViewMetrics(viewportEl) {
    const el = viewportEl || (typeof document !== "undefined" ? document.getElementById("bow-stage-canvas") : null);
    let vw = VIEW_W;
    let vh = VIEW_H;
    if (el && el.getBoundingClientRect) {
      const r = el.getBoundingClientRect();
      if (r && r.width > 40 && r.height > 40) {
        vw = r.width;
        vh = r.height;
      }
    }
    const baseFit = Math.max(vw / VIEW_W, vh / VIEW_H);
    const scale = baseFit * runtime.camera.zoom;

    const scaledW = VIEW_W * scale;
    const scaledH = VIEW_H * scale;
    const slackX = Math.max(220, (scaledW - vw) * 0.5 + 180);
    const slackY = Math.max(160, (scaledH - vh) * 0.5 + 140);
    runtime.camera.panX = clampVal(runtime.camera.panX, -slackX, slackX);
    runtime.camera.panY = clampVal(runtime.camera.panY, -slackY, slackY);

    const tx = (vw - scaledW) * 0.5 + runtime.camera.panX;
    const ty = (vh - scaledH) * 0.5 + runtime.camera.panY;
    return { vw, vh, baseFit, scale, tx, ty };
  }

  function applyCameraToDom(viewportEl, optState) {
    const el = viewportEl || (typeof document !== "undefined" ? document.getElementById("bow-stage-canvas") : null);
    if (!el) { return; }
    const worldEl = el.querySelector("#bow-stage-world");
    if (!worldEl) { return; }
    const m = computeViewMetrics(el);
    worldEl.style.transform =
      "translate(" + Math.round(m.tx) + "px, " + Math.round(m.ty) + "px) scale(" + m.scale.toFixed(4) + ")";
    const st = optState || getGlobalState();
    if (st) { renderStage25DNow(st); }
  }

  function centerCameraOnPlayer(state, viewportEl, resetZoom) {
    const el = viewportEl || (typeof document !== "undefined" ? document.getElementById("bow-stage-canvas") : null);
    if (resetZoom) {
      const isMob = typeof document !== "undefined" && document.documentElement &&
        document.documentElement.classList.contains("bow-device-mobile");
      runtime.camera.zoom = isMob ? 0.96 : 1.04;
    }
    ensurePlayerPos(state);
    const pScr = tileToScreen(runtime.px, runtime.py);
    let vw = VIEW_W;
    let vh = VIEW_H;
    if (el && el.getBoundingClientRect) {
      const r = el.getBoundingClientRect();
      if (r && r.width > 40 && r.height > 40) { vw = r.width; vh = r.height; }
    }
    const baseFit = Math.max(vw / VIEW_W, vh / VIEW_H);
    const scale = baseFit * runtime.camera.zoom;
    runtime.camera.panX = (VIEW_W * 0.5 - pScr.x) * scale;
    runtime.camera.panY = (VIEW_H * 0.5 - (pScr.y - 28)) * scale;
    applyCameraToDom(el, state);
  }

  function panCameraBy(dxPx, dyPx, viewportEl, optState) {
    runtime.camera.panX += dxPx;
    runtime.camera.panY += dyPx;
    applyCameraToDom(viewportEl, optState);
  }

  function setCameraZoom(nextZoom, viewportEl, optState) {
    const prevZ = runtime.camera.zoom;
    const z = clampVal(nextZoom, runtime.camera.minZoom, runtime.camera.maxZoom);
    if (Math.abs(z - prevZ) < 0.001) { return z; }
    const ratio = z / prevZ;
    runtime.camera.zoom = z;
    runtime.camera.panX *= ratio;
    runtime.camera.panY *= ratio;
    applyCameraToDom(viewportEl, optState);
    return z;
  }

  function getCamera() {
    return {
      panX: runtime.camera.panX,
      panY: runtime.camera.panY,
      zoom: runtime.camera.zoom,
      minZoom: runtime.camera.minZoom,
      maxZoom: runtime.camera.maxZoom
    };
  }

  function clientToStage(clientX, clientY, viewportEl) {
    const el = viewportEl || (typeof document !== "undefined" ? document.getElementById("bow-stage-canvas") : null);
    if (!el || !el.getBoundingClientRect) { return { sx: VIEW_W * 0.5, sy: VIEW_H * 0.5 }; }
    const r = el.getBoundingClientRect();
    if (!r || r.width <= 0 || r.height <= 0) { return { sx: VIEW_W * 0.5, sy: VIEW_H * 0.5 }; }
    const m = computeViewMetrics(el);
    return {
      sx: (clientX - r.left - m.tx) / m.scale,
      sy: (clientY - r.top - m.ty) / m.scale
    };
  }

  /* ---------- Навигация A* и коллизии ---------- */
  function ensurePlayerPos(state) {
    const map = mapOf(state);
    if (runtime.locKey !== map.id) {
      const prev = runtime.locKey;
      runtime.locKey = map.id;
      runtime.path = [];
      runtime.onArrive = null;
      if (state && state.pendingOrder) { state.pendingOrder = null; }
      const entry = (prev && map.entryFrom && map.entryFrom[prev]) ? map.entryFrom[prev] : map.spawn;
      runtime.px = entry.col;
      runtime.py = entry.row;
      runtime.facing = entry.facing || "SE";
      runtime.yaw = facingToYaw(runtime.facing);
      runtime.camera.initializedForLoc = "";
    }
    if (map.id === "jail" && runtime.px >= 4.4 && !(state && state.jail && (state.jail.unlocked || state.jail.escaped))) {
      runtime.px = 2.4;
      runtime.py = 3.8;
      runtime.facing = "NE";
      runtime.yaw = facingToYaw("NE");
    }
  }

  function setPlayerPos(state, wx, wy, facing) {
    ensurePlayerPos(state);
    runtime.px = clampVal(wx, 0.2, COLS - 0.8);
    runtime.py = clampVal(wy, 0.2, ROWS - 0.8);
    if (facing) {
      runtime.facing = facing;
      runtime.yaw = facingToYaw(facing);
    }
  }

  function getPlayerPos(state) {
    ensurePlayerPos(state);
    return { col: runtime.px, row: runtime.py, facing: runtime.facing, yaw: runtime.yaw };
  }

  function isBlocked(map, col, row, state) {
    if (typeof map === "string") { map = ENGINE3D_MAPS[map] || ENGINE3D_MAPS.square; }
    if (!map || col < 0 || col >= COLS || row < 0 || row >= ROWS) { return true; }
    if (map.id === "jail") {
      const isOpen = !!(state && state.jail && (state.jail.unlocked || state.jail.escaped));
      if (!isOpen && col >= 5) { return true; }
      if (isOpen && col === 5 && row !== 4) { return true; }
    }
    for (let i = 0; i < (map.obstacles || []).length; i++) {
      const ob = map.obstacles[i];
      if (map.id === "jail" && (ob.kind === "bars_seg" || ob.kind === "bars_door")) { continue; }
      if (ob.col === col && ob.row === row) { return true; }
    }
    return false;
  }

  function isWalkable(locOrMap, col, row, state) {
    const map = typeof locOrMap === "string" ? (ENGINE3D_MAPS[locOrMap] || ENGINE3D_MAPS.square) : locOrMap;
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

  function jailGuardIsoState(jail) {
    const phase = (jail && jail.guardPhase) || "watching";
    const tick = (jail && typeof jail.guardTick === "number") ? jail.guardTick : 0;
    if (phase === "away") {
      return { col: 9.5, row: 1.5, facing: "NE", yaw: 2.3, pose: "idle", phase };
    }
    if (phase === "turning") {
      return { col: 7.4, row: 3.0, facing: "NW", yaw: -2.2, pose: "walk", walkPhase: tick * 0.9, phase };
    }
    if (phase === "alert") {
      return { col: 6.1, row: 4.0, facing: "NW", yaw: -1.6, pose: "idle", phase };
    }
    return { col: 6.8, row: 3.9, facing: "NW", yaw: -1.6, pose: "idle", phase };
  }

  /* ---------- Сбор сущностей локации (игрок, жители, стража, бойцы, павшие) ---------- */
  function collectSceneEntities(state, stageSel) {
    if (!state || !state.player) { return []; }
    ensurePlayerPos(state);
    const map = mapOf(state);
    const entities = [];
    const isAggro = !!(Bow.skirmish && Bow.skirmish.isAggressive && Bow.skirmish.isAggressive());
    const pend = state.pendingOrder || null;

    const pLoad = (Bow.equip && Bow.equip.visualLoadout)
      ? Bow.equip.visualLoadout(state.player, !!state.jail)
      : { armor: "item:linen_shirt", legs: "item:cloth_pants", boots: "item:simple_shoes", severed: {} };

    /* Живая схватка в локации */
    if (state.skirmish && state.skirmish.active && !state.jail) {
      const sk = state.skirmish;
      (sk.units || []).forEach((u) => {
        const scr = tileToScreen(u.wx, u.wy);
        const isTarget = (sk.targetKey === u.key && u.side === "enemy" && !u.down && !u.dead);
        const yaw = typeof u.yaw === "number" ? u.yaw : facingToYaw(u.facing || "SE");
        if (u.isPlayer) {
          entities.push({
            type: "player",
            id: "player",
            unitKey: u.key,
            isPlayer: true,
            col: u.wx,
            row: u.wy,
            x: scr.x,
            y: scr.y,
            depth: u.wx + u.wy,
            roleKey: "player",
            side: "player",
            facing: u.facing || "SE",
            yaw,
            pose: u.pose || "idle",
            walkPhase: u.walkPhase || 0,
            attackProgress: u.attackAnim || 0,
            ready: !u.down && !u.dead,
            female: state.player.pron === "f",
            weapon: pLoad.severed.right_arm ? "none" : (u.weapon || pLoad.weapon),
            holsteredWeapon: pLoad.holsteredWeapon,
            armor: pLoad.armor,
            headGear: pLoad.head,
            handsGear: pLoad.hands,
            legsGear: pLoad.legs,
            bootsGear: pLoad.boots,
            shield: pLoad.shield,
            bareTorso: pLoad.bareTorso,
            bareLegs: pLoad.bareLegs,
            bareFeet: pLoad.bareFeet,
            severed: pLoad.severed,
            down: !!u.down,
            dead: !!u.dead,
            name: state.player.name || "Вы",
            hpPct: Math.max(0, Math.min(100, Math.round((u.hp / (u.maxHp || 100)) * 100)))
          });
        } else {
          const refNpc = u.refId && state.people ? state.people[u.refId] : null;
          const nLoad = (refNpc && Bow.equip && Bow.equip.visualLoadout)
            ? Bow.equip.visualLoadout(refNpc, false)
            : { severed: {} };
          entities.push({
            type: u.side === "ally" ? "skirmish_ally" : "skirmish_foe",
            id: u.key,
            unitKey: u.key,
            person: refNpc,
            col: u.wx,
            row: u.wy,
            x: scr.x,
            y: scr.y,
            depth: u.wx + u.wy,
            roleKey: u.roleKey || (u.side === "enemy" ? "guard" : "hunter"),
            side: u.side,
            facing: u.facing || "NW",
            yaw,
            pose: u.pose || "idle",
            walkPhase: u.walkPhase || 0,
            attackProgress: u.attackAnim || 0,
            ready: !u.down && !u.dead,
            female: !!(refNpc && refNpc.pron === "f"),
            weapon: u.weapon || "club",
            armor: (refNpc && refNpc.armor) || (u.roleKey === "guard" ? "item:chainmail" : "item:padded"),
            headGear: u.roleKey === "guard" ? "item:iron_helm" : "",
            legsGear: "item:wool_trousers",
            bootsGear: "item:travel_boots",
            shield: u.roleKey === "guard" ? "heater_shield" : "",
            bareTorso: false,
            bareLegs: false,
            bareFeet: false,
            severed: nLoad.severed || {},
            down: !!u.down,
            dead: !!u.dead,
            selected: isTarget,
            hostileHighlight: u.side === "enemy" && !u.down && !u.dead,
            name: u.name,
            hpPct: Math.max(0, Math.min(100, Math.round((u.hp / (u.maxHp || 100)) * 100)))
          });
        }
      });
      return entities;
    }

    const isComa = !!(Bow.state && Bow.state.isComatose && Bow.state.isComatose(state.player));
    const pScr = tileToScreen(runtime.px, runtime.py);
    const pWep = (state.jail || !Bow.stage || !Bow.stage.weaponKindOf)
      ? "none"
      : Bow.stage.weaponKindOf(state, state.player);

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
      weapon: pLoad.severed.right_arm ? "none" : (pWep !== "none" ? pWep : pLoad.weapon),
      holsteredWeapon: pLoad.holsteredWeapon,
      armor: pLoad.armor,
      headGear: pLoad.head,
      handsGear: pLoad.hands,
      legsGear: pLoad.legs,
      bootsGear: pLoad.boots,
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
        pose: gs.pose,
        walkPhase: gs.walkPhase || 0,
        weapon: "spear",
        armor: "item:chainmail",
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
      .filter((p) => p && p.alive !== false && p.location === loc);

    npcs.forEach((npc, idx) => {
      const slot = (map.npcSlots && map.npcSlots[idx]) || { col: 6 + idx, row: 2 + (idx % 3), facing: "SW" };
      const scr = tileToScreen(slot.col, slot.row);
      const roleKey = npc.id === "person:tarn" ? "smith"
        : npc.id === "person:bror" ? "hunter"
        : npc.id === "person:sigi" ? "innkeeper"
        : "villager";
      const wep = (Bow.stage && Bow.stage.weaponKindOf) ? Bow.stage.weaponKindOf(state, npc) : "none";
      const isSel = !!(stageSel && stageSel.kind === "person" && stageSel.personId === npc.id) ||
        runtime.hoverEntityId === npc.id ||
        !!(pend && pend.personId === npc.id);
      const isHostileOrder = !!(pend && pend.kind === "attack" && pend.personId === npc.id) ||
        (isAggro && runtime.hoverEntityId === npc.id);
      const nLoad = (Bow.equip && Bow.equip.visualLoadout) ? Bow.equip.visualLoadout(npc, false) : { severed: {} };

      entities.push({
        type: "npc",
        id: npc.id,
        person: npc,
        col: slot.col,
        row: slot.row,
        x: scr.x,
        y: scr.y,
        depth: slot.col + slot.row,
        roleKey,
        side: npc.inSquad ? "ally" : "neutral",
        facing: slot.facing || "SW",
        yaw: facingToYaw(slot.facing || "SW"),
        pose: "idle",
        female: npc.pron === "f",
        weapon: wep,
        armor: npc.armor || "item:linen_shirt",
        legsGear: "item:wool_trousers",
        bootsGear: "item:simple_shoes",
        bareTorso: false,
        bareLegs: false,
        bareFeet: false,
        severed: nLoad.severed || {},
        selected: isSel,
        hostileHighlight: isHostileOrder,
        name: npc.name
      });
    });

    if (state.guard && state.guard.arrived) {
      const gCount = Math.min(3, state.guard.count || 2);
      for (let gi = 0; gi < gCount; gi++) {
        const gc = 6.8 + gi * 0.9;
        const gr = 4.6 + (gi % 2) * 0.8;
        const gScr = tileToScreen(gc, gr);
        const gid = "guard:" + gi;
        entities.push({
          type: "guard",
          id: gid,
          col: gc,
          row: gr,
          x: gScr.x,
          y: gScr.y,
          depth: gc + gr,
          roleKey: "guard",
          side: "enemy",
          facing: "NW",
          yaw: -2.2,
          pose: "idle",
          ready: true,
          weapon: gi === 0 ? "spear" : "axe",
          armor: "item:chainmail",
          headGear: "item:iron_helm",
          legsGear: "item:wool_trousers",
          bootsGear: "item:iron_boots",
          shield: "heater_shield",
          bareTorso: false,
          bareLegs: false,
          bareFeet: false,
          severed: {},
          selected: !!(stageSel && stageSel.kind === "guard") || runtime.hoverEntityId === gid,
          hostileHighlight: true,
          name: "Стражник"
        });
      }
    }

    if (state.encounter && state.encounter.robber) {
      const rScr = tileToScreen(6.2, 3.2);
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
        yaw: -0.7,
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
        selected: !!(stageSel && stageSel.kind === "robber") || runtime.hoverEntityId === "robber",
        hostileHighlight: true,
        name: state.encounter.robber.name || "Грабитель"
      });
    }

    const corpses = (Bow.actions && Bow.actions.corpsesAt) ? Bow.actions.corpsesAt(state, loc) : [];
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
        female: c.pron === "f",
        armor: "item:linen_shirt",
        legsGear: "item:cloth_pants",
        bootsGear: "item:simple_shoes",
        bareTorso: false,
        bareLegs: false,
        bareFeet: false,
        severed: {},
        dead: true,
        selected: !!(stageSel && stageSel.kind === "corpse" && stageSel.corpseId === c.id),
        name: c.name || "Тело"
      });
    });

    return entities;
  }

  /* ---------- ГЛАВНАЯ ОТРИСОВКА 2.5D-СЦЕНЫ В НАТИВНОМ РАЗРЕШЕНИИ ---------- */
  let boundCanvas = null;

  function renderStage25DNow(state, explicitStageSel) {
    if (!state || !isLiveBrowser()) { return; }
    const vp = document.getElementById("bow-stage-canvas");
    const cv = boundCanvas || (vp && vp.querySelector("canvas.bow-iso-canvas"));
    if (!vp || !cv) { return; }
    boundCanvas = cv;

    const map = mapOf(state);
    if (runtime.camera.initializedForLoc !== map.id) {
      runtime.camera.initializedForLoc = map.id;
      centerCameraOnPlayer(state, vp, false);
    }

    const m = computeViewMetrics(vp);
    const q = getQualityProfile();
    const dpr = clampVal(effectivePixelRatio(q), 1, 2);
    const targetW = Math.max(2, Math.round(m.vw * dpr));
    const targetH = Math.max(2, Math.round(m.vh * dpr));
    if (cv.width !== targetW || cv.height !== targetH) {
      cv.width = targetW;
      cv.height = targetH;
    }

    const ctx = cv.getContext("2d");
    if (!ctx) { return; }

    const sky = (Bow.stage && Bow.stage.skyOf) ? Bow.stage.skyOf(state) : { phase: "day", snowy: true };
    const skyPhase = sky.phase || "day";

    /* 1. Запекаем задник локации ОДИН РАЗ для (locId + skyPhase + dpr) */
    const bdKey = map.id + "|" + skyPhase + "|" + dpr.toFixed(1);
    if (runtime.backdropCache.key !== bdKey || !runtime.backdropCache.canvas) {
      runtime.backdropCache.key = bdKey;
      runtime.backdropCache.canvas = bakeLocationBackdrop25D(map, skyPhase, dpr);
    }

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* Заливка краёв экрана спокойным северным тоном (никогда не вспыхнет белым или пустым!) */
    ctx.fillStyle = !map.outdoor ? "#0d1219" : (skyPhase === "night" ? "#0b121b" : "#344556");
    ctx.fillRect(0, 0, m.vw, m.vh);

    /* Переходим в мировые координаты камеры (m.tx, m.ty, m.scale) на нативном DPR! */
    ctx.save();
    ctx.translate(m.tx, m.ty);
    ctx.scale(m.scale, m.scale);

    /* Рисуем запечённый 2.5D-пейзаж с сугробами, брусчаткой и архитектурой */
    ctx.drawImage(runtime.backdropCache.canvas, 0, 0, VIEW_W, VIEW_H);

    const nowSec = (typeof performance !== "undefined" ? performance.now() : Date.now()) * 0.001;
    const paused = isWorldPaused(state);

    /* 2. Нижний слой погоды: стелющаяся по насту ветровая позёмка */
    if (map.outdoor && q.particleMult > 0.25) {
      ctx.strokeStyle = "rgba(226, 238, 250, 0.14)";
      ctx.lineWidth = 2.2;
      for (let i = 0; i < SNOW_STREAKS.length; i++) {
        const st = SNOW_STREAKS[i];
        const sx = paused
          ? st.x
          : ((st.x - nowSec * st.speed) % (VIEW_W + 200) + (VIEW_W + 200)) % (VIEW_W + 200) - 100;
        ctx.globalAlpha = st.alpha;
        ctx.beginPath();
        ctx.moveTo(sx, st.y);
        ctx.lineTo(sx - st.len, st.y + st.len * 0.22);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    /* 3. Отрубленные конечности в пятнах крови на снегу */
    const limbsHere = Array.isArray(state.severedLimbs)
      ? state.severedLimbs.filter((l) => l && l.location === map.id)
      : [];
    limbsHere.forEach((ld) => {
      const lp = tileToScreen(ld.wx, ld.wy);
      ctx.fillStyle = "rgba(116, 18, 20, 0.78)";
      ctx.beginPath();
      ctx.ellipse(lp.x, lp.y + 2, 16, 7.5, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#5c4a38";
      ctx.fillRect(lp.x - 10, lp.y - 2, 18, 5);
    });

    /* 4. Тактические кольца на земле: маршрут, подсветка [Alt] и кольца целей */
    const stageSel = explicitStageSel !== undefined
      ? explicitStageSel
      : (Bow.ui && Bow.ui.getStageSelection ? Bow.ui.getStageSelection() : null);

    if (runtime.path && runtime.path.length) {
      const isHostileOrder = !!(state.pendingOrder && state.pendingOrder.kind === "attack");
      const colHex = isHostileOrder ? "#ee4246" : "#9cd6ff";
      runtime.path.forEach((pt, idx) => {
        const sp = tileToScreen(pt.col !== undefined ? pt.col : pt.wx, pt.row !== undefined ? pt.row : pt.wy);
        const isLast = idx === runtime.path.length - 1;
        ctx.strokeStyle = colHex;
        ctx.lineWidth = isLast ? 2.2 : 1.3;
        ctx.globalAlpha = isLast ? 0.88 : 0.42;
        ctx.beginPath();
        ctx.ellipse(sp.x, sp.y, isLast ? 18 : 6, isLast ? 9 : 3, 0, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.globalAlpha = 1;
    }

    if (runtime.altHighlight) {
      (map.spots || []).forEach((sp) => {
        const p = tileToScreen(sp.col, sp.row);
        ctx.strokeStyle = "#e5c46b";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 28, 13, 0, 0, Math.PI * 2);
        ctx.stroke();
      });
      (map.exits || []).forEach((ex) => {
        const p = tileToScreen(ex.col, ex.row);
        ctx.strokeStyle = "#9cd6ff";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, 30, 14, 0, 0, Math.PI * 2);
        ctx.stroke();
      });
    }

    /* 5. ЕДИНЫЙ 2.5D СПИСОК ПО ГЛУБИНЕ (Z-SORT): Каменный колодец, ели, прилавки И люди! */
    const props25d = buildForegroundProps25D(map, state, skyPhase);
    const entities = collectSceneEntities(state, stageSel);
    const renderQueue = [];

    props25d.forEach((pr) => {
      renderQueue.push({
        depth: pr.depth,
        draw: () => pr.draw(ctx)
      });
    });

    const spriteDpr = clampVal(dpr * Math.max(1, runtime.camera.zoom), 1.5, 3.0);
    entities.forEach((ent) => {
      renderQueue.push({
        depth: ent.depth,
        draw: () => {
          /* Тактическое кольцо под ногами (у героя — тонкое спокойное, у выбранных/врагов — яркое) */
          if (ent.hostileHighlight || ent.selected || runtime.hoverEntityId === ent.id || runtime.altHighlight || ent.isPlayer) {
            ctx.save();
            ctx.strokeStyle = ent.hostileHighlight
              ? "#ee4246"
              : (ent.selected || runtime.hoverEntityId === ent.id ? "#9cd6ff" : (runtime.altHighlight && !ent.isPlayer ? "#e5c46b" : "rgba(140, 194, 238, 0.38)"));
            ctx.lineWidth = (ent.hostileHighlight || ent.selected) ? 2.4 : 1.5;
            ctx.beginPath();
            ctx.ellipse(ent.x, ent.y + 1, 20, 9.5, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }

          const spr = getCachedActorCanvas(ent, spriteDpr);
          ctx.drawImage(
            spr,
            ent.x - spr._anchorX,
            ent.y - spr._anchorY,
            spr._logicalW,
            spr._logicalH
          );
        }
      });
    });

    renderQueue.sort((a, b) => a.depth - b.depth);
    for (let i = 0; i < renderQueue.length; i++) {
      renderQueue[i].draw();
    }

    /* 6. Средний слой живого северного снегопада (внутри координат сцены) */
    if (map.outdoor && q.particleMult > 0.1) {
      const maxFlakes = Math.floor(SNOW_FLAKES.length * q.particleMult);
      for (let i = 0; i < maxFlakes; i++) {
        const f = SNOW_FLAKES[i];
        if (f.layer !== 1) { continue; }
        const t = paused ? 0 : nowSec;
        const fx = (((f.x + t * f.vx + Math.sin(t * f.swayFreq + f.phase) * f.swayAmp) % VIEW_W) + VIEW_W) % VIEW_W;
        const fy = (((f.y + t * f.vy) % VIEW_H) + VIEW_H) % VIEW_H;
        ctx.fillStyle = "rgba(232, 241, 250, " + f.alpha + ")";
        /* Рисуем маленьким гранёным ромбиком, а не квадратным пикселем! */
        ctx.beginPath();
        ctx.moveTo(fx, fy - f.r);
        ctx.lineTo(fx + f.r, fy);
        ctx.lineTo(fx, fy + f.r);
        ctx.lineTo(fx - f.r, fy);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.restore(); // конец мировых координат сцены

    /* 7. Передний боке-слой крупных хлопьев снега + благородная тёмная виньетка по краям экрана */
    if (map.outdoor && q.particleMult > 0.35) {
      const maxFlakes = Math.floor(SNOW_FLAKES.length * q.particleMult);
      for (let i = 0; i < maxFlakes; i++) {
        const f = SNOW_FLAKES[i];
        if (f.layer !== 2) { continue; }
        const t = paused ? 0 : nowSec;
        const fx = (((f.x + t * f.vx + Math.sin(t * f.swayFreq + f.phase) * f.swayAmp) % m.vw) + m.vw) % m.vw;
        const fy = (((f.y + t * f.vy) % m.vh) + m.vh) % m.vh;
        ctx.fillStyle = "rgba(236, 244, 252, " + (f.alpha * 0.68).toFixed(2) + ")";
        ctx.beginPath();
        ctx.arc(fx, fy, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /* Тонкая художественная виньетка в духе классических изометрических RPG */
    const vig = ctx.createRadialGradient(m.vw * 0.5, m.vh * 0.5, Math.min(m.vw, m.vh) * 0.36, m.vw * 0.5, m.vh * 0.5, Math.max(m.vw, m.vh) * 0.74);
    vig.addColorStop(0, "rgba(8, 12, 18, 0)");
    vig.addColorStop(1, "rgba(6, 9, 14, 0.44)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, m.vw, m.vh);

    ctx.restore();
  }

  /* Плавный лёгкий цикл погоды (на паузе спит на 5 FPS и тратит <0.2 мс!) */
  function ensureAmbientLoop() {
    if (runtime.ambientRafId || !isLiveBrowser()) { return; }
    function loop(ts) {
      runtime.ambientRafId = requestAnimationFrame(loop);
      const st = getGlobalState();
      if (!st) { return; }
      const q = getQualityProfile();
      const minInterval = isWorldPaused(st) ? 250 : (1000 / Math.min(60, q.maxFps || 60));
      if (ts - runtime.lastRenderMs < minInterval) { return; }
      runtime.lastRenderMs = ts;
      renderStage25DNow(st);
    }
    runtime.ambientRafId = requestAnimationFrame(loop);
  }

  function paintStageCanvas(canvas, state, stageSel) {
    if (!canvas || !state) { return; }
    boundCanvas = canvas;
    ensurePlayerPos(state);
    renderStage25DNow(state, stageSel);
    ensureAmbientLoop();
  }

  /* ---------- 2.5D Кукла снаряжения в окне инвентаря (крупный план эталона image-49!) ---------- */
  function paintPaperdollCanvas(canvas, state) {
    if (!canvas || !state || !state.player || !isLiveBrowser()) { return; }
    const dpr = clampVal((window.devicePixelRatio || 1), 1.5, 2.5);
    const cssW = 168;
    const cssH = 208;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) { return; }

    const load = (Bow.equip && Bow.equip.visualLoadout)
      ? Bow.equip.visualLoadout(state.player, !!state.jail)
      : { armor: "item:linen_shirt", legs: "item:cloth_pants", boots: "item:simple_shoes", severed: {} };

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    /* Спокойный сланцевый градиент фона точно как на эталонном скриншоте image-49! */
    const bg = ctx.createLinearGradient(0, 0, 0, cssH);
    bg.addColorStop(0, "#171c23");
    bg.addColorStop(0.82, "#1c222b");
    bg.addColorStop(1, "#12161d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssW, cssH);

    ctx.translate(cssW * 0.52, cssH - 18);
    ctx.scale(0.94, 0.94);

    drawChiseledPerson(ctx, {
      paperdoll: false,
      isPlayer: true,
      roleKey: state.jail ? "prisoner" : "player",
      female: state.player.pron === "f",
      yaw: runtime.paperdollYaw,
      armor: load.armor,
      headGear: load.head,
      handsGear: load.hands,
      legsGear: load.legs,
      bootsGear: load.boots,
      weapon: load.weapon,
      holsteredWeapon: load.holsteredWeapon,
      shield: load.shield || load.offhand,
      bareTorso: load.bareTorso,
      bareLegs: load.bareLegs,
      bareFeet: load.bareFeet,
      severed: load.severed
    });

    ctx.restore();
  }

  function rotatePaperdollBy(deltaRad, optState) {
    runtime.paperdollYaw += deltaRad;
    const st = optState || getGlobalState();
    if (st && typeof document !== "undefined") {
      const pd = document.querySelector("canvas.bow-paperdoll-canvas");
      if (pd) { paintPaperdollCanvas(pd, st); }
    }
  }

  /* ---------- Точный 2.5D хит-тест для ЛКМ и ПКМ контекстного меню ---------- */
  function raycastClient(clientX, clientY, state) {
    const st = state || getGlobalState();
    const vp = typeof document !== "undefined" ? document.getElementById("bow-stage-canvas") : null;
    if (!st || !vp) { return null; }

    const pt = clientToStage(clientX, clientY, vp);
    const wPt = screenToWorld(pt.sx, pt.sy);
    const map = mapOf(st);

    /* 1. Проверяем людей (спереди назад по глубине, чтобы клик брал ближнего к зрителю!) */
    const entities = collectSceneEntities(st, null).slice().sort((a, b) => b.depth - a.depth);
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      const dx = Math.abs(pt.sx - e.x);
      const dy = e.y - pt.sy; // стопы в e.y, голова примерно в e.y - 84
      if (e.down || e.dead) {
        if (dx <= 34 && Math.abs(pt.sy - e.y) <= 20) {
          return { kind: "entity", entity: e, wx: wPt.wx, wy: wPt.wy };
        }
      } else if (dx <= 20 && dy >= -8 && dy <= 88) {
        return { kind: "entity", entity: e, wx: wPt.wx, wy: wPt.wy };
      }
    }

    /* 2. Проверяем двери выходов */
    for (let i = 0; i < (map.exits || []).length; i++) {
      const ex = map.exits[i];
      const ep = tileToScreen(ex.col, ex.row);
      if (Math.abs(pt.sx - ep.x) <= 34 && (ep.y - pt.sy) >= -14 && (ep.y - pt.sy) <= 78) {
        return { kind: "exit", exitTo: ex.to, label: ex.label, col: ex.col, row: ex.row, wx: ex.col, wy: ex.row };
      }
    }

    /* 3. Проверяем 2.5D-объекты (колодец, доска подрядов, лавка, замок клетки) */
    const props = buildForegroundProps25D(map, st, "day").sort((a, b) => b.depth - a.depth);
    for (let i = 0; i < props.length; i++) {
      const pr = props[i];
      if (!pr.hitRadiusX) { continue; }
      if (Math.abs(pt.sx - pr.x) <= pr.hitRadiusX && (pr.y - pt.sy) >= -16 && (pr.y - pt.sy) <= pr.hitHeight) {
        if (pr.jailDoor) { return { kind: "jail_door", wx: 5, wy: 4 }; }
        if (pr.spot) { return { kind: "spot", spot: pr.spot, col: pr.spot.col, row: pr.spot.row, wx: pr.spot.col, wy: pr.spot.row }; }
      }
    }

    return {
      kind: "ground",
      wx: wPt.wx,
      wy: wPt.wy,
      col: clampVal(Math.round(wPt.wx), 0, COLS - 1),
      row: clampVal(Math.round(wPt.wy), 0, ROWS - 1)
    };
  }

  /* ---------- Движение Point-and-Click по маршруту A* ---------- */
  function stopWalkLoop() {
    if (runtime.rafId && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(runtime.rafId);
    }
    runtime.rafId = null;
  }

  function cancelPlannedWalk() {
    stopWalkLoop();
    runtime.path = [];
    runtime.onArrive = null;
  }

  function previewOrderPath(state, targetCol, targetRow) {
    ensurePlayerPos(state);
    const map = mapOf(state);
    const steps = findPath(map, runtime.px, runtime.py, targetCol, targetRow, state);
    runtime.path = steps.map((s) => ({ col: s.col, row: s.row, wx: s.col, wy: s.row }));
    renderStage25DNow(state);
    return runtime.path;
  }

  function startWalkSteps(state, steps, onArrive, onRepaint) {
    runtime.path = steps.map((s) => ({ col: s.col, row: s.row, wx: s.col, wy: s.row }));
    runtime.onArrive = onArrive || null;
    runtime.onFrameRepaint = onRepaint || null;

    if (!runtime.path.length) {
      if (runtime.onArrive) {
        const cb = runtime.onArrive;
        runtime.onArrive = null;
        cb();
      }
      return true;
    }

    /* В безголовых JSDOM-тестах мгновенно доводим до конечной точки */
    if (!isLiveBrowser()) {
      const last = runtime.path[runtime.path.length - 1];
      const dx = last.col - runtime.px;
      const dy = last.row - runtime.py;
      runtime.facing = deltaToFacing(dx, dy);
      runtime.yaw = Math.atan2(dx, dy);
      runtime.px = last.col;
      runtime.py = last.row;
      runtime.path = [];
      if (runtime.onArrive) {
        const cbNow = runtime.onArrive;
        runtime.onArrive = null;
        cbNow();
      }
      return true;
    }

    stopWalkLoop();
    runtime.lastTick = performance.now();

    function stepFrame(now) {
      const dt = Math.min(0.08, Math.max(0.001, (now - runtime.lastTick) * 0.001));
      runtime.lastTick = now;

      if (isWorldPaused(state)) {
        runtime.rafId = requestAnimationFrame(stepFrame);
        return;
      }

      if (!runtime.path.length) {
        stopWalkLoop();
        if (runtime.onFrameRepaint) { runtime.onFrameRepaint(); }
        if (runtime.onArrive) {
          const done = runtime.onArrive;
          runtime.onArrive = null;
          done();
        }
        return;
      }

      const next = runtime.path[0];
      const dx = next.col - runtime.px;
      const dy = next.row - runtime.py;
      const dist = Math.hypot(dx, dy);
      const speed = 3.35; // клеток в секунду

      if (dist <= speed * dt) {
        runtime.px = next.col;
        runtime.py = next.row;
        runtime.path.shift();
      } else {
        runtime.px += (dx / dist) * speed * dt;
        runtime.py += (dy / dist) * speed * dt;
        runtime.facing = deltaToFacing(dx, dy);
        runtime.yaw = Math.atan2(dx, dy);
      }
      runtime.stepPhase += dt * 1.45;
      renderStage25DNow(state);
      if (runtime.onFrameRepaint) { runtime.onFrameRepaint(); }
      runtime.rafId = requestAnimationFrame(stepFrame);
    }

    runtime.rafId = requestAnimationFrame(stepFrame);
    return true;
  }

  function walkTo(state, targetCol, targetRow, onArrive, onRepaint) {
    ensurePlayerPos(state);
    const map = mapOf(state);
    const steps = findPath(map, runtime.px, runtime.py, targetCol, targetRow, state);
    return startWalkSteps(state, steps, onArrive, onRepaint);
  }

  function walkAdjacentAndAct(state, targetCol, targetRow, onArrive, onRepaint) {
    ensurePlayerPos(state);
    const map = mapOf(state);
    if (Math.hypot(targetCol - runtime.px, targetRow - runtime.py) <= 1.52) {
      const dx = targetCol - runtime.px;
      const dy = targetRow - runtime.py;
      runtime.facing = deltaToFacing(dx, dy);
      runtime.yaw = Math.atan2(dx, dy);
      if (onArrive) { onArrive(); }
      return true;
    }
    let best = null;
    let bestD = 999;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dc === 0 && dr === 0) { continue; }
        const nc = Math.round(targetCol) + dc;
        const nr = Math.round(targetRow) + dr;
        if (!isBlocked(map, nc, nr, state)) {
          const d = Math.hypot(nc - runtime.px, nr - runtime.py);
          if (d < bestD) { bestD = d; best = { col: nc, row: nr }; }
        }
      }
    }
    if (!best) {
      if (onArrive) { onArrive(); }
      return false;
    }
    const steps = findPath(map, runtime.px, runtime.py, best.col, best.row, state);
    return startWalkSteps(state, steps, () => {
      const dx = targetCol - runtime.px;
      const dy = targetRow - runtime.py;
      runtime.facing = deltaToFacing(dx, dy);
      runtime.yaw = Math.atan2(dx, dy);
      if (onArrive) { onArrive(); }
    }, onRepaint);
  }

  function walkToExitAndMove(state, exitTo, onDoMove, onRepaint) {
    ensurePlayerPos(state);
    const map = mapOf(state);
    const ex = (map.exits || []).find((e) => e.to === exitTo);
    if (!ex) {
      if (onDoMove) { onDoMove(); }
      return true;
    }
    const steps = findPath(map, runtime.px, runtime.py, ex.col, ex.row, state);
    return startWalkSteps(state, steps, () => {
      if (Bow.audio && Bow.audio.playDoorCreak) { Bow.audio.playDoorCreak(); }
      if (onDoMove) { onDoMove(); }
    }, onRepaint);
  }

  /* Отрисовка арены «Поле брани» (групповой тактический бой 7×5) */
  function paintBattleCanvas(canvas, fight, state) {
    if (!canvas || !fight || !isLiveBrowser()) { return; }
    const ctx = canvas.getContext("2d");
    if (!ctx) { return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
    bg.addColorStop(0, "#1c2734");
    bg.addColorStop(1, "#2b3948");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    (fight.units || []).forEach((u) => {
      const p = fightTileToScreen(u.col || 0, u.row || 0);
      const spr = getCachedActorCanvas({
        roleKey: u.key === "player" ? "player" : "guard",
        isPlayer: u.key === "player",
        facing: u.side === "ally" ? "SE" : "NW",
        weapon: u.weapon || "sword",
        armor: u.side === "ally" ? "item:padded" : "item:chainmail",
        down: u.state === "down",
        dead: u.state === "dead"
      }, 2);
      ctx.drawImage(spr, p.x - spr._anchorX, p.y - spr._anchorY, spr._logicalW, spr._logicalH);
    });
  }

  function setHoverScreen(sx, sy) { runtime.hoverScreen = { sx, sy }; }
  function setHoverEntity(id) { runtime.hoverEntityId = id || null; }

  function setAltHighlight(active) {
    const next = !!active;
    if (runtime.altHighlight === next) { return; }
    runtime.altHighlight = next;
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.classList.toggle("bow-alt-highlight", next);
    }
    const st = getGlobalState();
    if (st) { renderStage25DNow(st); }
  }

  function isAltHighlight() { return runtime.altHighlight; }

  function blitWithOutline(ctx, img, x, y, w, h) {
    if (ctx && img) { ctx.drawImage(img, x, y, w, h); }
  }

  const spriteCompatCache = new Map();
  function getSprite(spec = {}) {
    const key = JSON.stringify(spec);
    if (spriteCompatCache.has(key)) { return spriteCompatCache.get(key); }
    const cv = (typeof document !== "undefined" && document.createElement)
      ? document.createElement("canvas")
      : { width: 96, height: 112 };
    cv.width = 96;
    cv.height = 112;
    spriteCompatCache.set(key, cv);
    return cv;
  }

  onQualityChange(() => {
    runtime.backdropCache.key = "";
    const st = getGlobalState();
    if (st) { renderStage25DNow(st); }
  });

  const api = {
    STYLE_VERSION: "v3-chiseled-25d",
    RENDER_MODE: "2.5D-Canvas-HiDPI",
    ORDER_PEACE_HEX: 0x9cd6ff,
    ORDER_HOSTILE_HEX: 0xee4246,
    MAPS: ENGINE3D_MAPS,
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
    getQualityKey,
    getQualityProfile,
    setQualityKey,
    getAllQualityProfiles
  };

  Bow.iso = api;
  Bow.engine25d = {
    drawChiseledPerson,
    getCachedActorCanvas,
    bakeLocationBackdrop25D,
    buildForegroundProps25D,
    api
  };
  return api;
}
