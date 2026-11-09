/* ============================================================
   BOW ACTIONS — действия игрока.
   Каждое действие: проверка условий → изменение состояния →
   продвижение времени → запись в журнал → событие в шине.
   Если действие не выполнено, состояние не меняется.
   ============================================================ */
(function (global) {
  "use strict";

  var Bow = global.Bow = global.Bow || {};

  function loc(state) {
    return Bow.data.locations[state.player.location];
  }

  function peopleAt(state, locationId) {
    return Object.keys(state.people)
      .map(function (id) { return state.people[id]; })
      .filter(function (p) { return p.alive && p.location === locationId; });
  }

  function corpsesAt(state, locationId) {
    return (state.corpses || []).filter(function (c) {
      return c && c.location === locationId;
    });
  }

  function formatDuration(mins) {
    var m = Math.max(1, Math.round(mins || 0));
    if (m < 60) { return m + " мин."; }
    var h = Math.floor(m / 60);
    var rem = m % 60;
    return rem ? (h + " ч. " + rem + " мин.") : (h + " ч.");
  }

  /* Честное время пути между двумя точками поселения в минутах:
     зависит от реального расстояния на плане Студёного Брода и травмы ноги. */
  function travelMinutes(state, toKey) {
    var target = Bow.data.locations[toKey];
    if (!target) { return 0; }
    if (!state || !state.player || state.player.location === toKey) { return 0; }

    var from = loc(state);
    var base;
    if (from && typeof from.mapX === "number" && typeof target.mapX === "number") {
      var dx = target.mapX - from.mapX;
      var dy = target.mapY - from.mapY;
      base = Math.max(6, Math.round(Math.sqrt(dx * dx + dy * dy) * 0.75));
    } else if (typeof target.travelMinutes === "number" && target.travelMinutes > 0) {
      base = target.travelMinutes;
    } else {
      base = Math.max(10, (target.travelHours || 1) * 15);
    }

    var legPenalty = 1;
    var inj = (state.player && state.player.injuries) || [];
    for (var i = 0; i < inj.length; i++) {
      if (inj[i] && inj[i].key === "leg_lost") {
        legPenalty = Math.max(legPenalty, 2.1);
      } else if (inj[i] && inj[i].key === "leg") {
        var tr = (Bow.data.fightRules && Bow.data.fightRules.injuries &&
          Bow.data.fightRules.injuries.leg && Bow.data.fightRules.injuries.leg.travel) || 1.5;
        legPenalty = Math.max(legPenalty, tr);
      }
    }
    var b = state.player && state.player.body;
    if (b && ((b.left_leg && b.left_leg.lost) || (b.right_leg && b.right_leg.lost))) {
      legPenalty = Math.max(legPenalty, 2.1);
    }

    var ath = (state.player && state.player.skills && state.player.skills.athletics) || 22;
    var athFactor = ath > 25 ? (1 - Math.min(0.30, (ath - 22) * 0.004)) : 1;

    var encFactor = 1;
    if (Bow.economy && Bow.economy.totalWeight && Bow.economy.maxWeight) {
      var curW = Bow.economy.totalWeight(state.player);
      var maxW = Bow.economy.maxWeight(state.player);
      if (curW > maxW && maxW > 0) {
        encFactor = 1 + Math.min(1.2, (curW - maxW) / maxW);
      }
    }

    return Math.max(4, Math.round(base * legPenalty * athFactor * encFactor));
  }

  /* ---------- Перемещение ---------- */
  function move(state, toKey) {
    if (Bow.state && Bow.state.isComatose && Bow.state.isComatose(state.player)) {
      var cv = Bow.state.criticalVitalOf(state.player);
      return { ok: false, message: "Область «" + cv.label + "» в минусе (" + Math.round(cv.hp) + "%) — вы лежите без сил и не можете идти сами." };
    }
    var target = Bow.data.locations[toKey];
    if (!target) { return { ok: false, message: "Такого места нет." }; }
    if (state.player.location === toKey) { return { ok: false, message: "Вы уже здесь." }; }

    if (state.task) { state.task = null; }

    var minutes = travelMinutes(state, toKey);
    var durText = formatDuration(minutes);

    var firstVisit = !state.visits[toKey];
    state.player.location = toKey;
    state.visits[toKey] = (state.visits[toKey] || 0) + 1;
    state.stats.actionsTaken += 1;
    if (Bow.work && Bow.work.growSkill) {
      Bow.work.growSkill(state.player, "athletics", 0.2);
      if (Bow.economy && Bow.economy.totalWeight && Bow.economy.maxWeight &&
          Bow.economy.totalWeight(state.player) > Bow.economy.maxWeight(state.player) &&
          Bow.work.growAttr) {
        Bow.work.growAttr(state.player, "strength", 0.25);
      }
    }

    Bow.time.advanceMinutes(state, minutes);
    if (Bow.needs && Bow.needs.autoEatCheck) {
      Bow.needs.autoEatCheck(state);
    }

    /* Погода пересчитывается при смене сцены: она часть атмосферы. */
    state.flags.weather = Bow.events.weatherOf(state, Bow.adapter ? Bow.adapter.rng : Math.random);

    /* Смена сцены помечается для затухания экрана (визуальная часть). */
    state.flags.sceneChanged = (state.flags.sceneChanged || 0) + 1;

    var arrival = firstVisit
      ? "Вы впервые пришли: " + target.name + " (в пути " + durText + ")."
      : "Вы пришли: " + target.name + " (в пути " + durText + ").";
    Bow.journal.add(state, arrival, "move");

    /* Атмосфера новой сцены — сразу, чтобы экран не был пустым. */
    state.flags.ambience = Bow.events.ambience(state, Bow.adapter ? Bow.adapter.rng : Math.random);

    var hours = Math.round((minutes / 60) * 100) / 100;
    Bow.bus.emit("player:moved", { state: state, location: toKey, minutes: minutes, hours: hours });

    return {
      ok: true,
      message: target.name + " · в пути " + durText,
      minutes: minutes,
      hours: hours,
      firstVisit: firstVisit
    };
  }

  /* ---------- Обыск тела ---------- */
  function lootCorpse(state, corpseId) {
    if (!Array.isArray(state.corpses)) { state.corpses = []; }
    var corpse = null;
    for (var i = 0; i < state.corpses.length; i++) {
      if (state.corpses[i] && state.corpses[i].id === corpseId) {
        corpse = state.corpses[i];
        break;
      }
    }
    if (!corpse) { return { ok: false, message: "Тела здесь уже нет." }; }
    if (corpse.location !== state.player.location) {
      return { ok: false, message: "Это тело лежит в другом месте." };
    }
    if (corpse.looted || ((corpse.money || 0) <= 0 && (!corpse.items || !corpse.items.length))) {
      corpse.looted = true;
      return { ok: false, message: "У " + corpse.name + " больше нечего взять." };
    }

    var taken = [];
    var coins = Math.max(0, Math.round(corpse.money || 0));
    if (coins > 0) {
      state.player.money += coins;
      corpse.money = 0;
      taken.push(coins + " м.");
    }

    (corpse.items || []).forEach(function (entry) {
      if (!entry || !entry.itemId || !(entry.qty > 0)) { return; }
      Bow.economy.addItem(state.player, entry.itemId, entry.qty);
      var def = Bow.economy.findItemDef(entry.itemId);
      taken.push((def ? def.name : entry.itemId) + (entry.qty > 1 ? " ×" + entry.qty : ""));
    });
    corpse.items = [];
    corpse.looted = true;
    state.stats.actionsTaken += 1;

    if (!(state.flags && state.flags.lastFight)) {
      Bow.time.advanceMinutes(state, 5);
    }

    var summary = taken.length ? taken.join(", ") : "ничего ценного";
    Bow.journal.add(state, "Обыскали тело (" + corpse.name + "): " + summary + ".", "crime");
    return {
      ok: true,
      coins: coins,
      taken: taken,
      message: "С тела (" + corpse.name + ") забрано: " + summary + "."
    };
  }

  /* ---------- Еда ---------- */
  function eat(state, itemKey) {
    var def = Bow.data.items[itemKey];
    if (!def || !def.food) { return { ok: false, message: "Это не еда." }; }
    if (Bow.economy.countItem(state.player, def.id) <= 0) {
      return { ok: false, message: "У вас нет: " + def.name + "." };
    }

    Bow.economy.removeItem(state.player, def.id, 1);
    Bow.needs.applyChange(state.player, "hunger", def.food);
    if (def.mood) { Bow.needs.applyChange(state.player, "mood", def.mood); }
    state.stats.actionsTaken += 1;

    /* Перекус занимает четверть часа, а не целый час. */
    Bow.time.advanceMinutes(state, 15);

    Bow.journal.add(state, "Вы съели: " + def.name + ".", "eat");
    return { ok: true, message: "Съедено: " + def.name + ". Сытость +" + def.food + "." };
  }

  /* ---------- Питьё (пиво и подобное) ---------- */
  function drink(state, itemKey) {
    var def = Bow.data.items[itemKey];
    if (!def || !def.mood) { return { ok: false, message: "Это не напиток." }; }
    if (Bow.economy.countItem(state.player, def.id) <= 0) {
      return { ok: false, message: "У вас нет: " + def.name + "." };
    }

    Bow.economy.removeItem(state.player, def.id, 1);
    Bow.needs.applyChange(state.player, "mood", def.mood);
    /* Пиво чуть притупляет усталость, но и сушит — честная плата. */
    Bow.needs.applyChange(state.player, "fatigue", 4);
    Bow.needs.applyChange(state.player, "hunger", -2);
    state.stats.actionsTaken += 1;

    Bow.time.advanceMinutes(state, 15);
    Bow.journal.add(state, "Вы выпили: " + def.name + ".", "drink");
    return { ok: true, message: "Выпито: " + def.name + ". Настроение +" + def.mood + "." };
  }

  /* ---------- Отдых ---------- */
  function rest(state) {
    var rules = Bow.data.needsRules;
    var here = loc(state);
    var allowed = here && (here.id === "loc:tavern" || here.id === "loc:square");

    var hours = allowed ? rules.sleepHours : Math.max(2, Math.round(rules.sleepHours / 2));

    if (Bow.state && Bow.state.isComatose && Bow.state.isComatose(state.player)) {
      var cvRest = Bow.state.criticalVitalOf(state.player);
      return { ok: false, message: "Область «" + cvRest.label + "» в минусе — вы без сознания и не встанете сами, пока кто-нибудь не перевяжет рану." };
    }
    if (state.task) { state.task = null; }
    Bow.time.advance(state, hours);
    Bow.needs.applyChange(state.player, "fatigue", allowed ? rules.rest.fatigue : Math.round(rules.rest.fatigue / 2));
    Bow.needs.applyChange(state.player, "health", allowed ? rules.rest.health : 1);
    Bow.needs.applyChange(state.player, "mood", allowed ? rules.rest.mood : 2);
    if (state.player.body) {
      var limbRest = allowed ? 18 : 7;
      Object.keys(state.player.body).forEach(function (bk) {
        var limb = state.player.body[bk];
        if (limb && !limb.lost && limb.hp < limb.max && !(limb.hp < 0 && !limb.bandaged)) {
          limb.hp = Math.min(limb.max, limb.hp + limbRest);
        }
      });
    }
    state.stats.actionsTaken += 1;

    if (allowed) {
      Bow.journal.add(state, "Вы отдохнули в тепле (" + hours + " ч.).", "rest");
      return { ok: true, message: "Отдых " + hours + " ч. Бодрость +" + rules.rest.fatigue + "." };
    }

    Bow.journal.add(state, "Вы поспали под открытым небом (" + hours + " ч.). Холодно.", "rest");
    return { ok: true, message: "Сон на холоде: " + hours + " ч. Бодрость восстановлена лишь наполовину." };
  }

  /* ---------- Осмотреться ---------- */
  function look(state) {
    var here = loc(state);
    if (!here) { return { ok: false, message: "Вокруг пусто." }; }
    state.stats.actionsTaken += 1;
    return { ok: true, message: here.name };
  }

  /* ---------- Разговор ---------- */
  /*
     Диалог собран из данных персонажа. Пол берётся из поля pron,
     поэтому «она» про мужчину появиться не может.
  */
  function talk(state, personId) {
    var person = state.people[personId];
    if (!person || !person.alive) { return { ok: false, message: "Здесь никого нет." }; }
    if (person.location !== state.player.location) {
      return { ok: false, message: person.name + " сейчас в другом месте." };
    }

    var talkedBefore = person.memory.some(function (m) { return m.kind === "talk"; });
    var lineIndex = person.talkedToday % person.lines.length;
    var line = person.lines[lineIndex];

    var parts = [];
    parts.push(talkedBefore ? person.name + " встречает вас как знакомого." : person.greet);
    parts.push(line);

    /* Влияние отношения на тон — видно игроку, а не спрятано. */
    if (person.attitude >= 20) {
      parts.push("В голосе " + (person.pron === "f" ? "её" : "его") + " слышится расположение.");
    } else if (person.attitude <= -20) {
      parts.push(person.pron === "f" ? "Она говорит сухо и не смотрит в глаза." : "Он говорит сухо и не смотрит в глаза.");
    }

    person.talkedToday += 1;
    person.memory.push({
      kind: "talk",
      text: "Разговаривал(а) с " + state.player.name + " (" + Bow.time.format(state) + ").",
      weight: 1,
      totalHours: state.time.totalHours
    });
    Bow.util.trim(person.memory, 40);

    state.player.memory.push({
      kind: "talk",
      subject: person.id,
      text: "Разговор с " + person.name + ".",
      totalHours: state.time.totalHours
    });
    Bow.util.trim(state.player.memory, 60);

    /* Разговор занимает час игры. */
    Bow.time.advance(state, 1);
    state.stats.talksMade += 1;
    state.stats.actionsTaken += 1;

    Bow.journal.add(state, "Разговор: " + person.name + ".", "talk");

    return { ok: true, message: parts.join("\n\n"), person: person.id, name: person.name };
  }

  /* Стадия тлена тела по прошедшим часам (0.0.7.5). */
  function corpseStage(state, corpse) {
    var nowH = (state && state.time && typeof state.time.totalHours === "number") ? state.time.totalHours : 0;
    var bornH = (corpse && typeof corpse.killedAt === "number")
      ? corpse.killedAt
      : (corpse && typeof corpse.createdAtHours === "number" ? corpse.createdAtHours : nowH);
    var age = Math.max(0, nowH - bornH);
    var maxHours = (corpse && corpse.location === "forest") ? 72 : 48;
    if (age < 12) {
      return { key: "fresh", label: "свежее тело", hoursAge: age, maxHours: maxHours };
    }
    if (age < 28) {
      return { key: "cold", label: "остывшее тело", hoursAge: age, maxHours: maxHours };
    }
    return { key: "rotting", label: "тронуто тленом", hoursAge: age, maxHours: maxHours };
  }

  /* Каждый час тела коченеют, гниют и исчезают:
     в Студёном Броде жители убирают мертвецов за околицу (~48 ч.),
     а в тайге тела растаскивает зверьё и заносит снегом (~72 ч.). */
  function decayCorpses(state) {
    if (!state || !Array.isArray(state.corpses) || !state.corpses.length) { return; }
    var nowH = (state.time && typeof state.time.totalHours === "number") ? state.time.totalHours : 0;
    var removedHere = [];
    state.corpses = state.corpses.filter(function (c) {
      if (!c) { return false; }
      var bornH = typeof c.killedAt === "number" ? c.killedAt : (c.createdAtHours || 0);
      var age = nowH - bornH;
      var limit = c.location === "forest" ? 72 : 48;
      if (age >= limit) {
        if (state.player && c.location === state.player.location) {
          removedHere.push(c);
        }
        return false;
      }
      c.decayStage = corpseStage(state, c).key;
      return true;
    });
    if (removedHere.length && Bow.journal && Bow.journal.add) {
      var first = removedHere[0];
      var note = first.location === "forest"
        ? "Тело (" + first.name + ") за время растащило таёжное зверьё и замело снегом."
        : "Жители убрали и схоронили истлевшее тело (" + first.name + ") за околицей.";
      Bow.journal.add(state, note, "world");
    }
  }

  Bow.actions = {
    move: move,
    travelMinutes: travelMinutes,
    formatDuration: formatDuration,
    corpsesAt: corpsesAt,
    corpseStage: corpseStage,
    decayCorpses: decayCorpses,
    lootCorpse: lootCorpse,
    eat: eat,
    drink: drink,
    rest: rest,
    look: look,
    talk: talk,
    peopleAt: peopleAt,
    location: loc
  };

  Bow.bus.on("tick:hour", decayCorpses);

  /* Сброс суточных счётчиков разговоров. */
  Bow.bus.on("tick:day", function (state) {
    Object.keys(state.people).forEach(function (id) {
      state.people[id].talkedToday = 0;
    });
    decayCorpses(state);
  });

})(typeof window !== "undefined" ? window : this);
