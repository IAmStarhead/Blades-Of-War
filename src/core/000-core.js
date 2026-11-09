/* ============================================================
   BOW CORE — базовые утилиты, ГПСЧ, шина событий.
   ВАЖНО: этот модуль ничего не знает про SugarCube и про DOM.
   ============================================================ */
(function (global) {
  "use strict";

  var Bow = global.Bow = global.Bow || {};

  /* --- Детерминированный ГПСЧ (mulberry32) ---
     Один и тот же seed даёт один и тот же мир: это нужно для
     воспроизводимых багов и честных сохранений. */
  Bow.rng = {
    make: function (seed) {
      var a = seed >>> 0;
      return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        var t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },
    int: function (rng, min, max) {
      return min + Math.floor(rng() * (max - min + 1));
    },
    pick: function (rng, arr) {
      if (!arr || arr.length === 0) { return null; }
      return arr[Math.floor(rng() * arr.length)];
    }
  };

  Bow.util = {
    clamp: function (value, min, max) {
      return Math.min(max, Math.max(min, value));
    },
    round1: function (value) {
      return Math.round(value * 10) / 10;
    },
    clone: function (value) {
      return JSON.parse(JSON.stringify(value));
    },
    isPlainObject: function (value) {
      return value !== null && typeof value === "object" && !Array.isArray(value);
    },
    /* Безопасное чтение вложенного поля: get(obj, "a.b.c", fallback) */
    get: function (obj, path, fallback) {
      var parts = String(path).split(".");
      var cur = obj;
      for (var i = 0; i < parts.length; i++) {
        if (cur === null || cur === undefined || typeof cur !== "object") { return fallback; }
        cur = cur[parts[i]];
      }
      return cur === undefined ? fallback : cur;
    },
    /* Предельный размер журнала: старые записи обрезаются, память не растёт бесконечно. */
    trim: function (arr, limit) {
      if (arr.length > limit) { arr.splice(0, arr.length - limit); }
      return arr;
    }
  };

  /* --- Шина событий ---
     Системы подписываются, а не вызывают друг друга напрямую. */
  Bow.bus = (function () {
    var handlers = {};

    return {
      on: function (name, fn) {
        (handlers[name] = handlers[name] || []).push(fn);
        return function () { Bow.bus.off(name, fn); };
      },
      off: function (name, fn) {
        var list = handlers[name];
        if (!list) { return; }
        var idx = list.indexOf(fn);
        if (idx !== -1) { list.splice(idx, 1); }
      },
      emit: function (name, payload, extra) {
        var list = handlers[name];
        if (!list) { return; }
        for (var i = 0; i < list.length; i++) {
          try {
            list[i](payload, extra);
          } catch (err) {
            if (global.console) { global.console.error("[Bow.bus] Ошибка в обработчике " + name, err); }
          }
        }
      },
      clear: function () { handlers = {}; }
    };
  })();

})(typeof window !== "undefined" ? window : this);
