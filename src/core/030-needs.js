/* ============================================================
   BOW NEEDS — потребности и здоровье.
   Падение зависит от прошедших часов, а не от числа вызовов.
   Границы 0..100 соблюдаются всегда, в обе стороны.
   ============================================================ */
(function (global) {
  "use strict";

  var Bow = global.Bow = global.Bow || {};

  var KEYS = ["health", "hunger", "fatigue", "mood"];

  function ensure(person) {
    KEYS.forEach(function (k) {
      if (typeof person.needs[k] !== "number" || isNaN(person.needs[k])) {
        person.needs[k] = 50;
      }
      person.needs[k] = Bow.util.clamp(person.needs[k], 0, 100);
    });
    return person;
  }

  /* Часовая деградация. Вызывается подпиской на tick:hour. */
  function hourly(state) {
    var rules = Bow.data.needsRules;
    var targets = [state.player];

    Object.keys(state.people).forEach(function (id) {
      var n = state.people[id];
      if (n.alive) { targets.push(n); }
    });

    targets.forEach(function (person) {
      ensure(person);
      var n = person.needs;

      if (n.hunger > 0) {
        n.hunger += rules.perHour.hunger;
      }
      if (n.fatigue > 0) {
        n.fatigue += rules.perHour.fatigue;
      }
      n.mood += rules.perHour.mood;

      /* Последствия голода и истощения — только для игрока:
         у NPC ресурсы считаются упрощённо (производительность). */
      if (person === state.player) {
        var hungry = n.hunger < rules.hungerLow;
        var tired = n.fatigue < rules.fatigueLow;

        if (hungry && tired) {
          n.health += rules.healthPenalty.both;
        } else if (hungry) {
          n.health += rules.healthPenalty.hunger;
        } else if (tired) {
          n.health += rules.healthPenalty.fatigue;
        } else if (n.health < 100) {
          /* Сытый и отдохнувший затягивает раны сам. До 0.0.6.3
             здоровье только падало: подняться было нечем, и любая
             драка оставляла игрока калекой до конца игры. */
          n.health += healRate(person);
        }
        /* Заживление и кровопотеря частей тела за час (в духе Kenshi, 0.0.7.5):
           если голова/грудь/живот ушли в минус и не перевязаны — рана не затягивается сама,
           а медленно теряет кровь (-1.5 в час, на -100 — смерть). Перевязанная рана идёт вверх. */
        if (person.body) {
          var limbHeal = (!hungry && !tired) ? healRate(person) * 1.4 : healRate(person) * 0.45;
          Object.keys(person.body).forEach(function (bk) {
            var limb = person.body[bk];
            if (!limb || limb.lost) { return; }
            var isVital = (bk === "head" || bk === "chest" || bk === "stomach");
            if (limb.hp < 0 && !limb.bandaged) {
              if (isVital) {
                limb.hp = Math.max(-100, Bow.util.round1(limb.hp - 1.5));
              }
            } else if (limb.hp < limb.max) {
              var bonus = limb.bandaged ? 1.7 : 1.0;
              limb.hp = Math.min(limb.max, Bow.util.round1(limb.hp + limbHeal * bonus));
              if (limb.hp >= limb.max) { limb.bandaged = false; }
            }
          });
          syncComaState(state);
        }
        if (hungry) {
          n.mood += rules.moodPenaltyHunger;
        }
      }

      KEYS.forEach(function (k) {
        n[k] = Bow.util.clamp(n[k], 0, 100);
        n[k] = Bow.util.round1(n[k]);
      });
    });
  }

  /* Скорость естественного заживления за час. Лечение (навык)
     ускоряет его втрое: это первая механика, которая вообще
     опирается на «Лечение». */
  function healRate(person) {
    var base = (Bow.data.needsRules && Bow.data.needsRules.healPerHour) || 0.4;
    var medicine = (person.skills && person.skills.medicine) || 0;
    return base * (1 + medicine / 50);
  }

  /* Сколько дней продержится персонаж при текущем голоде — для подсказки в UI.
     Это оценка, а не точная механика. */
  function estimateDaysOfHunger(person) {
    var rules = Bow.data.needsRules;
    var perHour = Math.abs(rules.perHour.hunger);
    var hoursLeft = person.needs.hunger / perHour;
    return Math.max(0, Math.round((hoursLeft / 24) * 10) / 10);
  }

  /* ---------- Лечение (0.0.6.3) ----------
     Отдых лечит медленно. Осмотр и перевязка — быстрее и сразу,
     но стоят часа и усталости, и делать их можно не бесконечно:
     рана за сутки перевязывается один раз, а не десять.

     Навык лечения решает, сколько вернётся. Без навыка почти
     ничего: «полежать» умеют все, «перевязать» — нет. */
  function hasWoundedLimbs(person) {
    if (!person || !person.body) { return false; }
    return Object.keys(person.body).some(function (k) {
      var l = person.body[k];
      return l && !l.lost && l.hp < l.max;
    });
  }

  function treat(state, rng) {
    var p = state.player;
    var n = p.needs;
    if (Bow.state && Bow.state.isComatose && Bow.state.isComatose(p)) {
      var crit = Bow.state.criticalVitalOf(p);
      return {
        ok: false,
        message: "Область «" + crit.label + "» ушла в минус (" + Math.round(crit.hp) + "%) — вы без сознания и не можете перевязать себя сами. Нужна чужая помощь."
      };
    }
    var limbHurt = hasWoundedLimbs(p);
    if (n.health >= 100 && !limbHurt) { return { ok: false, message: "Вы целы. Лечить нечего." }; }
    if (n.fatigue < 8) { return { ok: false, message: "Руки не держат бинт. Нужен отдых." }; }

    /* lastTreat = 0 значит «ещё не лечили», а не «лечили в нулевой
       час». Иначе первая же перевязка недоступна всю первую смену. */
    var last = p.lastTreat || 0;
    var everTreated = !!p.lastTreat;
    if (everTreated && state.time.totalHours - last < 24) {
      var left = 24 - (state.time.totalHours - last);
      return { ok: false, message: "Раны только начали схватываться. Через " + Math.ceil(left) + " ч." };
    }

    var medicine = p.skills.medicine || 0;
    /* Без навыка — 4, с сотней навыка — 22. Разница в пять раз. */
    var rawGain = Math.round(4 + medicine * 0.18 + (rng ? rng() : Math.random()) * 3);
    /* Больше, чем не хватает, не вернёшь, и потолок — 30 за раз. */
    var gain = n.health < 100 ? Math.max(1, Math.min(rawGain, 30, 100 - n.health)) : 0;

    Bow.time.advance(state, 1);
    Bow.needs.applyChange(p, "fatigue", -3);
    if (gain > 0) {
      Bow.needs.applyChange(p, "health", gain);
    }
    if (p.body) {
      var limbRestore = Math.round(12 + medicine * 0.28);
      Object.keys(p.body).forEach(function (bk) {
        var limb = p.body[bk];
        if (limb && !limb.lost && limb.hp < limb.max) {
          limb.hp = Math.min(limb.max, limb.hp + limbRestore);
          limb.bandaged = limb.hp < limb.max;
        }
      });
    }
    p.lastTreat = Math.max(1, state.time.totalHours);

    /* Навык растёт от дела, а не от чтения. */
    var before = medicine;
    p.skills.medicine = Math.min(100, Math.round((medicine + (medicine < 40 ? 1.2 : 0.6)) * 10) / 10);

    state.stats.treats = (state.stats.treats || 0) + 1;
    Bow.journal.add(state, "Перевязка: +" + gain + " здор. (Лечение " +
      p.skills.medicine + ")", "heal");

    return {
      ok: true,
      healed: gain,
      medicine: p.skills.medicine,
      message: "Вы промыли и перевязали раны: +" + gain + " здор. Лечение " +
        before.toFixed(1) + " → " + p.skills.medicine + "."
    };
  }

  /* ---------- Авто-еда (как в Kenshi, 0.0.7.4) ----------
     Если у героя в сумке есть съестное, а сытость опустилась до порога,
     он сам съедает порцию без лишних кликов. */
  var AUTO_EAT_ORDER = ["berries", "bread", "raw_meat", "stew"];

  function autoEatCheck(state) {
    if (!state || !state.player || state.dead || state.fight || state.jail) { return null; }
    var p = state.player;
    if (p.autoEat === false) { return null; }
    var threshold = (Bow.data.needsRules && Bow.data.needsRules.autoEatBelow) || 52;
    if (p.needs.hunger > threshold) { return null; }

    /* Выбираем съестной предмет из сумки (сначала простые дорожные припасы). */
    var chosenDef = null;
    for (var i = 0; i < AUTO_EAT_ORDER.length; i++) {
      var k = AUTO_EAT_ORDER[i];
      var d = Bow.data.items[k];
      if (d && d.food && Bow.economy.countItem(p, d.id) > 0) {
        chosenDef = d;
        break;
      }
    }
    if (!chosenDef) {
      (p.inventory || []).forEach(function (entry) {
        if (chosenDef || entry.qty <= 0) { return; }
        var def = Bow.economy.findItemDef(entry.itemId);
        if (def && def.food) { chosenDef = def; }
      });
    }
    if (!chosenDef) { return null; }

    if (!Bow.economy.removeItem(p, chosenDef.id, 1)) { return null; }
    applyChange(p, "hunger", chosenDef.food);
    applyChange(p, "mood", 1);
    var msg = "Авто-перекус из сумки: " + chosenDef.name + " (+" + chosenDef.food + " сытости).";
    state.flags = state.flags || {};
    state.flags.lastAutoEat = msg;
    if (Bow.journal && Bow.journal.add) {
      Bow.journal.add(state, msg, "food");
    }
    return { ate: chosenDef.id, name: chosenDef.name, food: chosenDef.food, message: msg };
  }

  function toggleAutoEat(state) {
    if (!state || !state.player) { return false; }
    state.player.autoEat = state.player.autoEat === false ? true : false;
    return state.player.autoEat;
  }

  function applyChange(person, key, delta) {
    if (KEYS.indexOf(key) === -1) { return; }
    person.needs[key] = Bow.util.clamp(Bow.util.round1((person.needs[key] + delta)), 0, 100);
  }

  /* Ключ слова и текст для интерфейса — в одном месте. */
  function label(key) {
    return { health: "Здоровье", hunger: "Сытость", fatigue: "Бодрость", mood: "Расположение духа" }[key] || key;
  }

  /* Цвет-подсказка для полосы потребностей. */
  function level(value) {
    if (value <= 20) { return "critical"; }
    if (value <= 45) { return "low"; }
    if (value <= 75) { return "ok"; }
    return "good";
  }

  /* Наглядный светофор для частей тела (0.0.7.5):
     зелёный (>=70%) — цела, жёлтый (35..69%) — не очень, красный (<35% и минус) — плохо. */
  function limbLevel(pct, lost) {
    if (lost || pct < 0) { return "critical"; }
    if (pct < 35) { return "low"; }
    if (pct < 70) { return "ok"; }
    return "good";
  }

  /* Синхронизация состояния беспамятства (комы) при уходе головы/груди/живота в минус. */
  function syncComaState(state) {
    if (!state || !state.player || state.dead) { return null; }
    var p = state.player;
    var crit = Bow.state && Bow.state.criticalVitalOf ? Bow.state.criticalVitalOf(p) : null;
    if (crit && crit.hp <= -100) {
      state.coma = null;
      state.dead = {
        cause: "bleedout",
        text: "Тяжёлая рана («" + crit.label + "») ушла до −100% без чужой перевязки. Дыхание оборвалось на снегу.",
        hours: state.time ? state.time.totalHours : 0
      };
      Bow.journal.add(state, "Гибель от неостановленной кровопотери («" + crit.label + "» −100%).", "death");
      return state.dead;
    }
    if (crit && crit.hp < 0 && !crit.bandaged) {
      if (state.task && Bow.work && Bow.work.stopTask) {
        Bow.work.stopTask(state, "Вы рухнули без сознания — работа прервана.");
      }
      if (state.time && state.time.scale !== "paused" && Bow.time && Bow.time.setScale) {
        Bow.time.setScale(state, "paused");
      }
      state.coma = {
        partKey: crit.key,
        partLabel: crit.label,
        hp: crit.hp,
        sinceHours: (state.coma && typeof state.coma.sinceHours === "number")
          ? state.coma.sinceHours
          : (state.time ? state.time.totalHours : 0)
      };
      return state.coma;
    }
    state.coma = null;
    return null;
  }

  /* Чужая помощь лежачему в минусе персонажу (спутник, житель поселения или ожидание прохожего). */
  function rescueComa(state, how, rng) {
    if (!state || !state.player) { return { ok: false, message: "Нет состояния." }; }
    var p = state.player;
    var crit = Bow.state && Bow.state.criticalVitalOf ? Bow.state.criticalVitalOf(p) : null;
    if (!crit || (crit.hp >= 0 && !state.coma)) {
      state.coma = null;
      return { ok: false, message: "Вы уже в сознании и можете держаться на ногах." };
    }
    var r = rng || (Bow.adapter ? Bow.adapter.rng : Math.random);

    function stabilize(helperName, restoreMin) {
      Object.keys(p.body || {}).forEach(function (bk) {
        var l = p.body[bk];
        if (!l || l.lost) { return; }
        if (l.hp < 0) {
          l.hp = Math.min(l.max, Math.max(restoreMin, Math.round(l.hp + 26)));
          l.bandaged = true;
        } else if (l.hp < 55) {
          l.hp = Math.min(l.max, l.hp + 12);
          l.bandaged = true;
        }
      });
      if (p.needs.health < 18) { p.needs.health = 18; }
      state.coma = null;
      syncComaState(state);
      var msg = helperName + " туго перевязывает ваши раны и приводит вас в чувство. Вы снова можете стоять на ногах.";
      Bow.journal.add(state, msg, "heal");
      return { ok: true, rescued: true, message: msg };
    }

    if (how === "companion") {
      var comp = null;
      Object.keys(state.people || {}).forEach(function (id) {
        var n = state.people[id];
        if (!comp && n && n.alive && n.following) { comp = n; }
      });
      if (!comp) {
        return { ok: false, message: "Рядом нет спутника, который шёл бы с вами." };
      }
      Bow.time.advance(state, 1);
      return stabilize(comp.name, 10);
    }

    if (how === "passerby") {
      if (p.location === "forest") {
        return { ok: false, message: "В тайге нет лавок и дворов — остаётся только ждать случайного следопыта." };
      }
      var fee = Math.min(p.money, 6);
      if (fee > 0) {
        p.money -= fee;
      } else if (state.reputation && typeof state.reputation["org:brod"] === "number") {
        state.reputation["org:brod"] = Math.max(-100, state.reputation["org:brod"] - 2);
      }
      Bow.time.advance(state, 1);
      var helper = fee > 0
        ? "Прохожий из Студёного Брода (взяв " + fee + " м. за чистую тряпицу и травы)"
        : "Сердобольная жительница Брода (в долг под честное слово)";
      return stabilize(helper, 8);
    }

    /* how === "wait": пролежать час в надежде, что кто-нибудь пройдёт мимо. */
    var chance = p.location === "forest" ? 0.25 : 0.68;
    Bow.time.advance(state, 1);
    if (state.dead) {
      return { ok: false, dead: true, message: state.dead.text };
    }
    if (r() < chance) {
      var finder = p.location === "forest" ? "Проходивший по тропе охотник" : "Случайный возчик";
      return stabilize(finder, 6);
    }
    syncComaState(state);
    var updated = Bow.state.criticalVitalOf(p);
    return {
      ok: true,
      rescued: false,
      message: "Час прошёл в полузабытьи на холоде — никто не подошёл («" +
        (updated ? updated.label + ": " + Math.round(updated.hp) + "%" : "") + "»)."
    };
  }

  Bow.needs = {
    treat: treat,
    hasWoundedLimbs: hasWoundedLimbs,
    limbLevel: limbLevel,
    syncComaState: syncComaState,
    rescueComa: rescueComa,
    autoEatCheck: autoEatCheck,
    toggleAutoEat: toggleAutoEat,
    healRate: healRate,
    KEYS: KEYS,
    hourly: hourly,
    ensure: ensure,
    applyChange: applyChange,
    label: label,
    level: level,
    estimateDaysOfHunger: estimateDaysOfHunger
  };

  /* Подписка: ядро не знает, кто её установил. */
  Bow.bus.on("tick:hour", hourly);

})(typeof window !== "undefined" ? window : this);
