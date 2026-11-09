/* ============================================================
   BOW 3D MATERIALS — Гранёные матовые и металлические материалы
   северного канона «Сумрачный Брод · Рубленные грани» (0.0.9.3).
   Все материалы используют flatShading: true для чёткой скульптурной
   огранки (как на эталонах наёмника и каменного колодца) без мыла.
   ============================================================ */
import * as THREE from "three";

const matCache = new Map();

export function getMat(colorHex, opts = {}) {
  const metal = typeof opts.metalness === "number" ? opts.metalness : 0.06;
  const rough = typeof opts.roughness === "number" ? opts.roughness : 0.86;
  const emissive = opts.emissive || 0x000000;
  const emissiveIntensity = typeof opts.emissiveIntensity === "number" ? opts.emissiveIntensity : 0;
  const opacity = typeof opts.opacity === "number" ? opts.opacity : 1.0;
  const transparent = opacity < 0.999 || !!opts.transparent;
  const doubleSide = !!opts.doubleSide;
  const flat = opts.flat !== false;

  const key = `${colorHex}|${metal.toFixed(2)}|${rough.toFixed(2)}|${emissive}|${emissiveIntensity.toFixed(2)}|${opacity.toFixed(2)}|${doubleSide ? 1 : 0}|${flat ? 1 : 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex),
      metalness: metal,
      roughness: rough,
      flatShading: flat,
      emissive: new THREE.Color(emissive),
      emissiveIntensity,
      transparent,
      opacity,
      side: doubleSide ? THREE.DoubleSide : THREE.FrontSide
    });
    matCache.set(key, m);
  }
  return m;
}

export function getBasicMat(colorHex, opacity = 1.0, doubleSide = true) {
  const key = `basic|${colorHex}|${opacity.toFixed(2)}|${doubleSide ? 1 : 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorHex),
      transparent: opacity < 0.999,
      opacity,
      side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
      depthWrite: opacity >= 0.95
    });
    matCache.set(key, m);
  }
  return m;
}

/* Палитра канонических северных материалов */
export const PALETTE = {
  skinMale: "#cca07e",
  skinFemale: "#dbb294",
  skinCold: "#bfa089",
  undergarment: "#9c917e",
  bandage: "#cfc4ae",
  bloodFresh: "#7e191d",
  bloodDark: "#4e0e12",

  linenLight: "#988e7b",
  linenWarm: "#8a7b66",
  woolSlate: "#3d4c5c",
  woolTeal: "#2f4750",
  woolPlum: "#4f3640",
  woolForest: "#35463a",
  woolRust: "#633c32",
  apronCream: "#b8ac95",
  furTrim: "#7c6852",
  furLight: "#a7947b",
  scarfCrimson: "#6d2c2c",
  scarfBlue: "#2e4861",

  leatherDark: "#38291f",
  leatherMid: "#523b2a",
  leatherBelt: "#2a1e17",
  leatherBoots: "#33251c",

  brigandineBody: "#463327",
  paddedCloth: "#6b6253",
  chainmailSteel: "#727d88",
  steelBright: "#b9c5d1",
  steelEdge: "#dde6ef",
  steelDark: "#4b5560",
  ironForged: "#313840",
  brassBuckle: "#b59552",

  woodAged: "#5b4634",
  woodDark: "#3e2f23",
  woodPine: "#6e553d",
  woodPlank: "#664f3b",
  barkTaiga: "#382c23",
  needlesDark: "#22362d",
  needlesMid: "#2c4439",

  stoneLight: "#6f7b87",
  stoneMid: "#596470",
  stoneDark: "#434d57",
  stoneWarm: "#696660",
  slateRoof: "#323d49",
  slateEdge: "#485666",

  snowPure: "#cfdbe6",
  snowShadow: "#9fb0c1",
  snowTrampled: "#788694",
  icePale: "#8eb2cc",
  emberCore: "#ff7b29",
  emberHot: "#ffb347"
};
