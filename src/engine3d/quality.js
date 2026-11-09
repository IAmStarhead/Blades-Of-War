/* ============================================================
   BOW 3D QUALITY — Режим производительности для ПК и телефонов (0.0.9.3).
   Три профиля:
     • high   — «Высокое»: нативный HiDPI (до 2.0×), мягкие 3D-тени 2048px,
                сглаживание MSAA, полная дальность мелких деталей и снега, 60 FPS.
     • medium — «Среднее»: чёткий рендер (до 1.5×), тени 1024px, средняя плотность
                частиц и мелкого декора, 45 FPS.
     • low    — «Производительность» (для слабых ПК и бюджетных телефонов):
                буфер 1.0× (или 0.85× на очень плотных экранах), быстрые контактные
                тени вместо теневых карт, сокращённый радиус мелких деталей (камни,
                травинки, дальние ёлки за частоколом), 25% частиц снега, лимит 30 FPS.
   ============================================================ */

const PROFILES = {
  high: {
    key: "high",
    label: "Высокое",
    desc: "Максимальная чёткость HiDPI, 3D-тени от объектов и полная детализация окружения.",
    maxPixelRatio: 2.0,
    antialias: true,
    shadows: true,
    shadowMapSize: 2048,
    detailRadius: 99,
    perimeterTrees: 16,
    particleMult: 1.0,
    maxFps: 60
  },
  medium: {
    key: "medium",
    label: "Среднее",
    desc: "Сбалансированная чёткость 1.5×, облегчённые тени и умеренный снегопад.",
    maxPixelRatio: 1.5,
    antialias: true,
    shadows: true,
    shadowMapSize: 1024,
    detailRadius: 9.5,
    perimeterTrees: 10,
    particleMult: 0.55,
    maxFps: 45
  },
  low: {
    key: "low",
    label: "Производительность",
    desc: "Для телефонов и слабых ПК: облегчённое разрешение, контактные тени и скрытие дальних мелочей ради высокого FPS.",
    maxPixelRatio: 1.0,
    antialias: false,
    shadows: false,
    shadowMapSize: 512,
    detailRadius: 5.8,
    perimeterTrees: 5,
    particleMult: 0.22,
    maxFps: 30
  }
};

let currentKey = "high";
const listeners = [];

export function getQualityProfile(key) {
  const k = key || currentKey;
  return PROFILES[k] || PROFILES.high;
}

export function getQualityKey() {
  return currentKey;
}

export function getAllQualityProfiles() {
  return [PROFILES.high, PROFILES.medium, PROFILES.low];
}

export function setQualityKey(key) {
  if (!PROFILES[key]) { return PROFILES[currentKey]; }
  const changed = currentKey !== key;
  currentKey = key;
  if (changed) {
    for (let i = 0; i < listeners.length; i++) {
      try { listeners[i](PROFILES[currentKey]); } catch (_e) { /* ignore */ }
    }
  }
  return PROFILES[currentKey];
}

export function onQualityChange(fn) {
  if (typeof fn === "function") { listeners.push(fn); }
}

export function effectivePixelRatio(profile) {
  const p = profile || getQualityProfile();
  const dpr = (typeof window !== "undefined" && window.devicePixelRatio) ? window.devicePixelRatio : 1;
  if (p.key === "low") {
    return Math.min(1.0, Math.max(0.85, dpr * 0.75));
  }
  return Math.min(p.maxPixelRatio, Math.max(1.0, dpr));
}
