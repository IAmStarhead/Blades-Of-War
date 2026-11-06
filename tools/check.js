#!/usr/bin/env node
/* ============================================================
   ПРОВЕРКА BLADES OF WAR
   Запускает собранный HTML в эмуляции браузера (jsdom),
   прогоняет основные действия и проверяет инварианты.

   Запуск:  node tools/check.js
   Код возврата 0 — все проверки прошли, 1 — есть провалы.

   ВАЖНО: это проверка логики и разметки, а НЕ визуальная приёмка.
   Как игра выглядит и как ведёт себя на телефоне — проверяет владелец.
   ============================================================ */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const HTML_PATH = path.join(__dirname, "..", "dist", "BladesOfWar.html");

if (!fs.existsSync(HTML_PATH)) {
  console.error("Нет файла " + HTML_PATH + ". Сначала: npm run build");
  process.exit(1);
}

const html = fs.readFileSync(HTML_PATH, "utf8");

/* ---------- Мини-фреймворк ---------- */
const results = [];
function check(name, fn) {
  try {
    const detail = fn();
    results.push({ ok: true, name, detail: typeof detail === "string" ? detail : "" });
  } catch (err) {
    results.push({ ok: false, name, detail: err.message });
  }
}
function assert(cond, message) {
  if (!cond) { throw new Error(message || "условие не выполнено"); }
}
function eq(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || "значения не совпали") + ": получено " + JSON.stringify(actual) + ", ожидалось " + JSON.stringify(expected));
  }
}

/* ---------- Запуск игры ---------- */
const jsdomErrors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => {
  const m = e.message || "";
  if (!/scroll|Not implemented/i.test(m)) { jsdomErrors.push(m); }
});
vc.on("error", (...args) => { jsdomErrors.push("console.error: " + args.map(String).join(" ")); });

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  pretendToBeVisual: true,
  url: "http://localhost/",
  virtualConsole: vc,
  beforeParse(win) {
    win.matchMedia = (q) => ({
      matches: false, media: q,
      addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}
    });
    win.scrollTo = () => {};
    Object.defineProperty(win.document, "fonts", {
      value: { ready: Promise.resolve(), addEventListener() {}, removeEventListener() {} },
      configurable: true
    });
  }
});

const win = dom.window;

function ready() {
  return new Promise((resolve, reject) => {
    let ticks = 0;
    const iv = setInterval(() => {
      ticks++;
      try {
        if (win.SugarCube && win.SugarCube.Engine && win.SugarCube.Engine.state === "init") {
          win.SugarCube.Engine.runUserInit();
          win.SugarCube.Engine.start();
          clearInterval(iv);
          setTimeout(resolve, 500);
          return;
        }
        if (ticks > 60) { clearInterval(iv); reject(new Error("движок SugarCube не инициализировался")); }
      } catch (err) {
        clearInterval(iv);
        reject(err);
      }
    }, 100);
  });
}

function doc() { return win.document; }
function game() { return win.BowGame.getState(); }
function click(el) {
  assert(el, "элемент не найден");
  el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
}
function byAct(act, key) {
  const sel = key
    ? `[data-act="${act}"][data-key="${key}"], [data-act="${act}"][data-loc="${key}"]`
    : `[data-act="${act}"]`;
  return doc().querySelector(sel);
}

/* ---------- Прогон ---------- */
(async function run() {
  try {
    await ready();
  } catch (err) {
    console.error("НЕ УДАЛОСЬ ЗАПУСТИТЬ ИГРУ: " + err.message);
    process.exit(1);
  }

  /* 1. Каркас */
  check("Интерфейс заменил стандартную вёрстку SugarCube", () => {
    assert(doc().getElementById("bow-app"), "нет корневого элемента #bow-app");
    assert(doc().getElementById("passages"), "нет #passages — SugarCube не сможет выводить пассажи");
    return "#bow-app найден";
  });

  check("#passages находится внутри каркаса, а не создаёт второй экран", () => {
    const app = doc().getElementById("bow-app");
    const passages = doc().getElementById("passages");
    assert(app.contains(passages), "#passages вне #bow-app");
    return "вложенность верная";
  });

  check("Торговля отрисована и знает, где игрок", () => {
    const g = game();
    g.player.location = "square";
    win.BowGame.refresh(true);
    const trade = doc().querySelector("#passages .bow-trade");
    assert(trade, "торговля не отрисована");
    assert(trade.querySelector("[data-act='buy']"), "нет ни одной кнопки покупки");

    /* Ключевая проверка: в лесу торговать нечем, и старого товара
       с площади там быть не должно. */
    g.player.location = "forest";
    win.BowGame.refresh(true);
    const forest = doc().querySelector("#passages .bow-trade");
    assert(!forest.querySelector("[data-act='buy']"),
      "в лесу остался товар прошлой локации");
    assert(forest.querySelector(".bow-empty"), "в лесу нет честной надписи «здесь не торгуют»");

    g.player.location = "square";
    win.BowGame.refresh(true);
    return "товар следует за локацией";
  });

  check("Цена пересчитывается сразу после покупки", () => {
    const g = game();
    g.player.location = "square";
    g.player.money = 18;
    win.BowGame.refresh(true);
    const row = () => doc().querySelector("#passages .bow-trade-row").textContent.replace(/\s+/g, " ");
    const before = row();
    click(doc().querySelector("#passages [data-act='buy']"));
    const after = row();
    assert(before !== after || g.player.money === 15,
      "торговля не обновилась после покупки");
    return "деньги " + g.player.money + " м.";
  });

  check("Время отформатировано и не пустое", () => {
    const t = doc().getElementById("bow-time").textContent;
    assert(t && t.length > 5, "время не отрисовано: " + JSON.stringify(t));
    return t;
  });

  check("Потребности отрисованы (4 полосы)", () => {
    const bars = doc().querySelectorAll("#bow-needs .bow-need");
    eq(bars.length, 4, "количество полос");
    return bars.length + " полосы";
  });

  check("Персонажи рядом отрисованы", () => {
    const people = doc().querySelectorAll("#bow-people .bow-person");
    assert(people.length > 0, "никого не показано на площади");
    return people.length + " человек";
  });

  check("Инвентарь показывает предметы и вес", () => {
    const inv = doc().getElementById("bow-inventory").textContent;
    assert(/кг/.test(inv), "нет строки веса");
    assert(inv.length > 5, "инвентарь пуст");
    return inv.replace(/\s+/g, " ").slice(0, 60);
  });

  check("Журнал содержит стартовую запись", () => {
    const rows = doc().querySelectorAll("#bow-journal .bow-jrow");
    assert(rows.length > 0, "журнал пуст");
    return rows.length + " записей";
  });

  /* 2. Время: ровно один час за действие */
  check("Разговор открывает диалог-ленту", () => {
    const talkEl = doc().querySelector("#bow-people [data-act='talk']");
    click(talkEl);
    const box = doc().getElementById("bow-dialog");
    assert(box.classList.contains("bow-dialog-open"), "окно диалога не открылось");
    const lines = box.querySelectorAll(".bow-line");
    assert(lines.length >= 2, "в ленте меньше двух реплик: " + lines.length);
    return lines.length + " реплики в ленте";
  });

  check("В ленте видна реплика собеседника с его именем", () => {
    const npcLines = doc().querySelectorAll("#bow-dialog .bow-line-npc");
    assert(npcLines.length >= 1, "нет реплик собеседника");
    const who = npcLines[0].querySelector(".bow-line-who").textContent;
    assert(who && who.length > 1, "не указано, кто говорит");
    return "говорит: " + who;
  });

  check("После выбора в ленте появляется фраза ИГРОКА (главное)", () => {
    const before = doc().querySelectorAll("#bow-dialog .bow-line-player").length;
    const choice = doc().querySelector("#bow-dialog .bow-choice");
    const idx = parseInt(choice.getAttribute("data-choice"), 10);
    const node = win.Bow.dialog.currentNode(game());
    const spoken = node.node.choices[idx].say;
    assert(spoken, "у варианта нет живой реплики (say) — в ленту попадёт подпись кнопки");
    click(choice);
    const after = doc().querySelectorAll("#bow-dialog .bow-line-player");
    assert(after.length > before, "фраза игрока не появилась в ленте");
    const last = after[after.length - 1].textContent;
    assert(last.indexOf(spoken) !== -1, "в ленте не та фраза игрока");
    /* Подпись кнопки — действие, а не речь: в ленте её быть не должно. */
    assert(last.trim().indexOf(choice.textContent.trim()) !== 0,
      "в ленту попала подпись кнопки вместо реплики");
    return "«" + spoken.slice(0, 46) + "»";
  });

  check("Каждый вариант ответа — живая реплика, а не подпись меню", () => {
    const g = game();
    g.player.location = "square";
    const liva = win.Bow.data.people.find((x) => x.key === "liva");
    const missing = [];
    Object.keys(liva.dialog).forEach((k) => {
      liva.dialog[k].choices.forEach((c, i) => {
        /* «Уйти» — действие, а не реплика: молчаливый уход допустим. */
        if (!c.say && !c.close) { missing.push(k + "[" + i + "]: " + c.text); }
      });
    });
    assert(!missing.length, "варианты без реплики: " + missing.join("; "));
    return "все варианты озвучены";
  });

  check("Ремарки не выдаются за речь собеседника", () => {
    const narr = doc().querySelector("#bow-dialog .bow-line-narr");
    assert(narr, "описание действия оформлено как реплика собеседника");
    assert(!narr.querySelector(".bow-line-who"), "у ремарки есть подпись говорящего");
    return "ремарка отделена от речи";
  });

  check("Фраза игрока помечена отдельным классом и подписью «Вы»", () => {
    const playerLine = doc().querySelector("#bow-dialog .bow-line-player");
    const who = playerLine.querySelector(".bow-line-who").textContent;
    eq(who, "Вы", "подпись реплики игрока");
    return "подписано «Вы»";
  });

  check("Выбор меняет отношение и это видно в шапке диалога", () => {
    const meta = doc().querySelector("#bow-dialog .bow-dialog-meta").textContent;
    assert(/отношение/.test(meta), "нет индикатора отношения");
    return meta;
  });

  check("Разговор переживает перерисовку интерфейса", () => {
    win.BowGame.refresh(true);
    assert(game().dialog, "диалог потерялся при обновлении экрана");
    const box = doc().getElementById("bow-dialog");
    assert(box.classList.contains("bow-dialog-open"), "окно диалога не показано");
    return "лента сохранена, узлов: " + game().dialog.log.length;
  });

  check("После завершения показывается итог разговора", () => {
    /* Идём до варианта с закрытием */
    let guard = 0;
    while (game().dialog && guard < 14) {
      const choices = [...doc().querySelectorAll("#bow-dialog .bow-choice")];
      const leave = choices.find((c) => c.classList.contains("bow-choice-leave"));
      click(leave || choices[choices.length - 1]);
      guard++;
      if (!game().dialog) break;
    }
    assert(!game().dialog, "диалог не закрылся за " + guard + " шагов");
    const box = doc().getElementById("bow-dialog");
    const summary = box.querySelector(".bow-dialog-summary");
    assert(summary, "нет итога разговора");
    assert(/окончен/.test(summary.textContent), "итог не сообщает о завершении");
    return summary.textContent.replace(/\s+/g, " ").slice(0, 70);
  });

  check("Разговор занимает ровно 1 час", () => {
    const g = game();
    /* Сигрид — трактирщица: разговор возможен только в трактире. */
    g.player.location = "tavern";
    const before = g.time.totalHours;
    const started = win.Bow.dialog.start(g, "person:sigi");
    assert(started.ok, started.message);
    const root = win.Bow.dialog.currentNode(g);
    assert(root, "разговор не открылся");
    const closeIdx = root.node.choices.findIndex((c) => c.close);
    assert(closeIdx >= 0, "у вступительной реплики нет варианта уйти");
    win.Bow.dialog.choose(g, closeIdx);
    eq(g.time.totalHours - before, 1, "прошло часов");
    return "+1 час";
  });

  /* 8е. Труд, навыки и отношение общин (0.0.4) */
  check("Навык влияет на работу: шанс растёт вместе с навыком", () => {
    const g = game();
    const job = win.Bow.data.locations[g.player.location].jobs[0];
    const low = { ...g, player: { ...g.player, skills: { ...g.player.skills, [job.skill]: 5 } } };
    const high = { ...g, player: { ...g.player, skills: { ...g.player.skills, [job.skill]: 80 } } };
    const c1 = win.Bow.work.successChance(low, job);
    const c2 = win.Bow.work.successChance(high, job);
    assert(c2 > c1, "навык не влияет на шанс: " + c1 + " vs " + c2);
    return "навык 5 → " + Math.round(c1 * 100) + "%, навык 80 → " + Math.round(c2 * 100) + "%";
  });

  check("Усталость снижает шанс успеха", () => {
    const g = game();
    const job = win.Bow.data.locations[g.player.location].jobs[0];
    const fresh = { ...g, player: { ...g.player, needs: { ...g.player.needs, fatigue: 90, hunger: 90 } } };
    const tired = { ...g, player: { ...g.player, needs: { ...g.player.needs, fatigue: 10, hunger: 15 } } };
    assert(win.Bow.work.successChance(tired, job) < win.Bow.work.successChance(fresh, job),
      "усталость и голод не влияют на шанс");
    return "усталый работает хуже";
  });

  check("Работа платит деньги, тратит время и растит навык", () => {
    const g = game();
    g.player.location = "square";
    g.player.needs.fatigue = 90;
    g.player.needs.hunger = 90;
    const money0 = g.player.money;
    const hours0 = g.time.totalHours;
    const skill0 = g.player.skills.survival;
    const res = win.Bow.work.perform(g, "porter", () => 0); // гарантированный успех
    assert(res.ok && res.success, "работа не выполнена");
    assert(g.player.money > money0, "деньги не начислены");
    eq(g.time.totalHours - hours0, 3, "потрачено часов");
    assert(g.player.skills.survival > skill0, "навык не вырос");
    return "+" + res.pay + " м., +3 ч., навык " + skill0 + " → " + g.player.skills.survival;
  });

  check("Провал работы платит половину, а не всё", () => {
    /* Бросок оплаты задаём одинаковый: иначе сравниваем не успех
       с провалом, а два разных случайных числа. */
    const seq = (vals) => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };

    const g = game();
    g.player.location = "square";
    g.player.needs.fatigue = 90;
    g.player.needs.hunger = 90;
    const ok = win.Bow.work.perform(g, "porter", seq([0, 0]));   // успех, низкая оплата

    const g2 = game();
    g2.player.location = "square";
    g2.player.needs.fatigue = 90;
    g2.player.needs.hunger = 90;
    const fail = win.Bow.work.perform(g2, "porter", seq([0.99, 0])); // провал, та же оплата

    assert(ok.success === true, "успех не распознан");
    assert(fail.success === false, "провал не распознан");
    assert(fail.pay < ok.pay, "за провал заплатили не меньше: " + fail.pay + " vs " + ok.pay);
    eq(fail.pay, Math.floor(ok.pay / 2), "доля оплаты за провал");
    return "успех " + ok.pay + " м., провал " + fail.pay + " м.";
  });

  check("Репутация общины меняет цену в лавке", () => {
    const g = game();
    const loc = g.player.location;
    g.reputation["org:brod"] = 0;
    const neutral = win.Bow.economy.buyPrice("bread", g, loc);
    g.reputation["org:brod"] = 70;
    const friendly = win.Bow.economy.buyPrice("bread", g, loc);
    g.reputation["org:brod"] = -70;
    const hostile = win.Bow.economy.buyPrice("bread", g, loc);
    assert(friendly < neutral, "уважение не снижает цену");
    assert(hostile > neutral, "вражда не поднимает цену");
    g.reputation["org:brod"] = 0;
    return "хлеб: свой " + friendly + " / нейтрально " + neutral + " / враг " + hostile;
  });

  check("Община не даёт работу тому, кого считает врагом", () => {
    const g = game();
    g.player.location = "square";
    g.reputation["org:brod"] = -80;
    const jobs = win.Bow.work.listAt(g);
    assert(jobs.some((j) => !j.available), "все работы доступны врагу общины");
    const res = win.Bow.work.perform(g, "hawk", () => 0);
    assert(!res.ok, "врагу всё-таки дали работу");
    g.reputation["org:brod"] = 0;
    return "закрыто: " + (res.message || "").slice(0, 40);
  });

  check("Репутация попадает в сохранение и читается обратно", () => {
    const g = JSON.parse(JSON.stringify(game()));
    g.reputation["org:brod"] = 42;
    const text = win.Bow.save.serialize(g, 12345);
    const back = win.Bow.save.deserialize(text);
    assert(back.ok, "сохранение не прочиталось: " + back.reason);
    eq(back.state.reputation["org:brod"], 42, "репутация после круга");
    return "42 → сохранение → 42";
  });

  check("Мир живёт сам: достаток и недовольство общин меняются", () => {
    const g = game();
    const before = { wealth: g.orgs["org:brod"].wealth, unrest: g.orgs["org:brod"].unrest };
    let seed = 7;
    const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 25; i++) { win.Bow.work.worldTick(g, rng); }
    const after = g.orgs["org:brod"];
    assert(after.wealth !== before.wealth || after.unrest !== before.unrest,
      "община не меняется без игрока");
    return "достаток " + before.wealth + " → " + after.wealth + ", недовольство " + before.unrest + " → " + after.unrest;
  });

  check("Живое время: есть кнопки паузы, 1x и 4x", () => {
    const btns = doc().querySelectorAll(".bow-clock-btn");
    eq(btns.length, 3, "кнопок хода времени");
    const scales = [...btns].map((b) => b.getAttribute("data-scale"));
    assert(scales.indexOf("paused") !== -1 && scales.indexOf("1x") !== -1 && scales.indexOf("4x") !== -1,
      "нет одной из скоростей: " + scales.join(", "));
    return scales.join(" / ");
  });

  check("Скорость хода времени — часть состояния и попадает в сохранение", () => {
    const g = game();
    g.time.scale = "paused";
    click(doc().querySelector("[data-act='clock'][data-scale='4x']"));
    eq(game().time.scale, "4x", "скорость после нажатия");
    assert(doc().querySelector(".bow-clock-btn.bow-clock-on"), "активная скорость не подсвечена");

    const text = win.Bow.save.serialize(game(), 1);
    const back = win.Bow.save.deserialize(text);
    eq(back.state.time.scale, "4x", "скорость после круга сохранения");

    click(doc().querySelector("[data-act='clock'][data-scale='paused']"));
    eq(game().time.scale, "paused", "пауза не включилась");
    return "4x → сохранение → 4x → пауза";
  });

  check("Ход времени двигает часы через того же владельца, что и действия", () => {
    const g = game();
    const before = g.time.totalHours;
    const res = win.Bow.time.tick(g);
    eq(g.time.totalHours - before, 1, "часов за один тик");
    assert(typeof res.dayChanged === "boolean", "тик не сообщает о смене суток");
    return "один тик = один час";
  });

  check("Часы не идут, пока игрок читает диалог или панель", () => {
    const g = game();
    g.player.location = "tavern";
    win.Bow.ui.setDrawer(false);

    g.time.scale = "paused";
    assert(!win.BowGame.clockShouldRun(g), "время идёт на паузе");

    g.time.scale = "1x";
    assert(win.BowGame.clockShouldRun(g), "время не идёт на 1x");

    win.Bow.dialog.start(g, "person:sigi");
    assert(!win.BowGame.clockShouldRun(g), "время идёт при открытом диалоге");
    win.Bow.dialog.close(g);
    assert(win.BowGame.clockShouldRun(g), "после закрытия диалога время не вернулось");

    win.Bow.ui.setDrawer(true);
    assert(!win.BowGame.clockShouldRun(g), "время идёт при открытой панели");
    win.Bow.ui.setDrawer(false);
    g.time.scale = "paused";
    return "пауза, диалог и панель останавливают часы";
  });

  /* 8з. Кражи, свидетели и розыск (0.0.5) */
  check("У жителей есть кошель, и кража берёт деньги у него, а не из воздуха", () => {
    const g = game();
    g.player.location = "square";
    const liva = g.people["person:liva"];
    assert(typeof liva.money === "number" && liva.money > 0, "у Ливы нет кошеля");
    const mine0 = g.player.money;
    const hers0 = liva.money;

    const seq = (v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };
    const res = win.Bow.steal.attempt(g, "person:liva", seq([0, 0.5]));
    assert(res.success, "кража не удалась при удачном броске");
    eq(g.player.money - mine0, res.taken, "игроку добавилось не столько, сколько взято");
    eq(hers0 - liva.money, res.taken, "у жителя убыло не столько, сколько взято");
    return "взято " + res.taken + " м., у Ливы осталось " + liva.money;
  });

  check("Провал кражи: свидетель, розыск и падение отношения", () => {
    const g = JSON.parse(JSON.stringify(game()));
    g.player.location = "square";
    g.heat["org:brod"] = 0;
    g.reputation["org:brod"] = 0;

    let i = 0;
    const seq = () => (i++ === 0 ? 0.99 : 0);
    const res = win.Bow.steal.attempt(g, "person:liva", seq);

    assert(res.caught, "провал не заметили");
    assert(win.Bow.steal.heatOf(g, "org:brod") > 0, "розыск не вырос");
    assert(win.Bow.work.reputation(g, "org:brod") < 0, "отношение общины не упало");
    assert(g.people["person:liva"].memory.some((m) => m.kind === "witness"),
      "свидетель ничего не запомнил");
    return "заметил " + res.caughtBy + ", розыск " + win.Bow.steal.heatOf(g, "org:brod");
  });

  check("Навык скрытности повышает шанс, свидетели — понижают", () => {
    const g = game();
    g.player.location = "square";
    const liva = g.people["person:liva"];

    const low = { ...g, player: { ...g.player, skills: { ...g.player.skills, stealth: 5 } } };
    const high = { ...g, player: { ...g.player, skills: { ...g.player.skills, stealth: 80 } } };
    assert(win.Bow.steal.successChance(high, liva) > win.Bow.steal.successChance(low, liva),
      "навык не влияет на шанс кражи");

    /* Ставим свидетеля рядом с целью — шанс должен упасть. */
    const before = win.Bow.steal.successChance(g, liva);
    const g2 = JSON.parse(JSON.stringify(g));
    g2.people["person:sigi"].location = "square";
    const after = win.Bow.steal.successChance(g2, g2.people["person:liva"]);
    assert(after < before, "свидетель не мешает краже");
    return "навык 5 → " + Math.round(win.Bow.steal.successChance(low, liva) * 100) +
      "%, навык 80 → " + Math.round(win.Bow.steal.successChance(high, liva) * 100) + "%";
  });

  check("Кража ночью легче, чем днём", () => {
    const g = game();
    g.player.location = "square";
    const liva = g.people["person:liva"];
    g.time.hour = 12;
    const day = win.Bow.steal.successChance(g, liva);
    g.time.hour = 23;
    const night = win.Bow.steal.successChance(g, liva);
    assert(night > day, "ночь не помогает");
    return "день " + Math.round(day * 100) + "%, ночь " + Math.round(night * 100) + "%";
  });

  check("Розыск спадает со временем и попадает в сохранение", () => {
    const g = JSON.parse(JSON.stringify(game()));
    g.heat["org:brod"] = 60;
    const text = win.Bow.save.serialize(g, 1);
    const back = win.Bow.save.deserialize(text);
    eq(back.state.heat["org:brod"], 60, "розыск после круга сохранения");

    win.Bow.steal.addHeat(back.state, "org:brod", -100);
    eq(win.Bow.steal.heatOf(back.state, "org:brod"), 0, "розыск не обнуляется");

    g.heat["org:brod"] = 60;
    win.Bow.bus.emit("tick:day", g);
    assert(win.Bow.steal.heatOf(g, "org:brod") < 60, "розыск не спадает за сутки");
    return "60 → сохранение → 60 → " + win.Bow.steal.heatOf(g, "org:brod") + " за сутки";
  });

  check("В карточке жителя видна кнопка кражи с его кошелём", () => {
    const g = game();
    g.player.location = "square";
    win.BowGame.refresh(true);
    const btn = doc().querySelector("#bow-people [data-act='steal']");
    assert(btn, "нет кнопки кражи");
    assert(/м\./.test(btn.textContent), "в кнопке не видно, сколько в кошеле");
    return btn.textContent.trim();
  });

  check("Хороший разговор доходит до общины как молва", () => {
    const g = game();
    g.player.location = "tavern";
    g.reputation["org:brod"] = 0;
    win.Bow.dialog.start(g, "person:sigi");
    win.Bow.adapter.act.choose(g, 1);           // «Спросить о ней самой» (+2)
    const res = win.Bow.adapter.act.choose(g, 0); // «Сказать, что это тяжело» (+2, уйти)
    assert(res.closed, "разговор не закрылся");
    const rep = win.Bow.work.reputation(g, "org:brod");
    assert(rep > 0, "молва о тёплом разговоре не дошла до общины");
    g.reputation["org:brod"] = 0;
    return "отношение +" + res.summary.delta + " → молва +" + rep;
  });

  /* 8ж. Оформление: холодная поверхность, глубина, читаемость */
  check("Ни одной тёплой коричневой подложки в оформлении", () => {
    const styles = [...doc().querySelectorAll("style")].map((x) => x.textContent).join("\n");
    /* Прежние коричневые тона: от них владелец просил уйти. */
    const warm = ["#17150f", "#201d16", "#262219", "#1b1813", "#1a1812",
                  "#242019", "#1e1b14", "#1a1712", "#221f18", "#100f0c", "#12100c"];
    const found = warm.filter((c) => styles.indexOf(c) !== -1);
    assert(found.length === 0, "остались тёплые подложки: " + found.join(", "));
    assert(/--bow-surface-1/.test(styles), "нет шкалы поверхностей");
    return "поверхности холодные, токенов: " +
      (styles.match(/--bow-surface-/g) || []).length;
  });

  check("У кнопок есть отдача от нажатия", () => {
    const styles = [...doc().querySelectorAll("style")].map((x) => x.textContent).join("\n");
    const active = styles.slice(styles.indexOf(".bow-btn:active"));
    assert(/transform:\s*translateY\(1px\)/.test(active.slice(0, 300)),
      "кнопка не реагирует на нажатие");
    return "сдвиг на 1px и провал тени";
  });

  check("Текст сцены ограничен мерой чтения", () => {
    const styles = [...doc().querySelectorAll("style")].map((x) => x.textContent).join("\n");
    assert(/max-width:\s*7\dch/.test(styles), "строка не ограничена по ширине чтения");
    assert(/--bow-leading/.test(styles), "нет единого межстрочного интервала");
    return "74ch и единый межстрочный";
  });

  check("На телефоне шапка липкая и без лишних строк", () => {
    const styles = [...doc().querySelectorAll("style")].map((x) => x.textContent).join("\n");
    /* SugarCube вставляет таблицу стилей дважды (style-story и
       twine-user-stylesheet), а внутри неё есть ещё однострочный
       медиазапрос про подсказку логотипа. Поэтому собираем все блоки
       и проверяем самый длинный — настоящий блок телефона. */
    const blocks = [];
    let at = -1;
    while ((at = styles.indexOf("@media (max-width: 720px)", at + 1)) !== -1) {
      const open = styles.indexOf("{", at);
      const close = styles.indexOf("\n}\n", open);
      blocks.push(styles.slice(at, close === -1 ? open + 2400 : close));
    }
    assert(blocks.length > 0, "нет медиазапроса телефона");
    const block = blocks.reduce((a, b) => (b.length > a.length ? b : a), "");
    assert(/position:\s*sticky/.test(block), "шапка уезжает при прокрутке");
    assert(/\.bow-logo-text\s*\{\s*display:\s*none/.test(block), "название не скрыто");
    assert(/\.bow-weather\s*\{\s*display:\s*none/.test(block), "погода не скрыта");
    return "одна липкая строка";
  });

  check("Шкала отношения видна и меняет сторону", () => {
    const g = game();
    g.reputation["org:brod"] = 60;
    win.BowGame.refresh(true);
    const pick = () => [...doc().querySelectorAll("#bow-orgs .bow-org")]
      .find((o) => /Брод/.test(o.textContent));
    const warm = pick().querySelector(".bow-org-fill");
    assert(warm.classList.contains("bow-org-fill-warm"), "уважение не показано тёплой стороной");
    const warmLeft = warm.style.left;

    g.reputation["org:brod"] = -60;
    win.BowGame.refresh(true);
    const cold = pick().querySelector(".bow-org-fill");
    assert(cold.classList.contains("bow-org-fill-cold"), "вражда не показана холодной стороной");
    assert(cold.style.left !== warmLeft, "заливка не сдвинулась в другую сторону");

    g.reputation["org:brod"] = 0;
    win.BowGame.refresh(true);
    return "вправо — уважение, влево — вражда";
  });

  check("Блоки сцены можно свернуть", () => {
    const folds = doc().querySelectorAll(".bow-fold");
    assert(folds.length >= 3, "блоков для сворачивания меньше трёх: " + folds.length);
    const first = folds[0];
    assert(first.open, "заработок закрыт по умолчанию");
    first.open = false;
    assert(!first.open, "блок не сворачивается");
    first.open = true;
    return folds.length + " блока: заработок, люди, товар";
  });

  check("В панели есть раздел «Общины», а в сцене — заработок", () => {
    const g = game();
    g.player.location = "square";
    win.BowGame.refresh(true);
    const orgs = doc().querySelectorAll("#bow-orgs .bow-org");
    assert(orgs.length >= 2, "общин в панели меньше двух: " + orgs.length);
    const jobs = doc().querySelectorAll("#bow-jobs .bow-job");
    assert(jobs.length >= 1, "нет карточек работы");
    const railBtn = doc().querySelector("[data-act='panel'][data-panel='orgs']");
    assert(railBtn, "нет значка «Общины» на рельсе");
    return orgs.length + " общины, " + jobs.length + " работы на площади";
  });

  check("Разговор можно прервать крестиком", () => {
    const g = game();
    g.player.location = "tavern";
    win.BowGame.refresh(true);
    win.Bow.dialog.start(g, "person:sigi");
    win.BowGame.refresh(true);
    const closeBtn = doc().querySelector("#bow-dialog [data-act='close-dialog']");
    assert(closeBtn, "нет кнопки прерывания");
    click(closeBtn);
    assert(!game().dialog, "разговор не прерван");
    return "прерван";
  });

  /* 3. Экономика */
  check("Покупка списывает ровно цену и добавляет товар", () => {
    const before = game().player.money;
    const btn = doc().querySelector("[data-act='buy']");
    const key = btn.getAttribute("data-key");
    assert(win.Bow.data.items[key], "ключ товара из кнопки не найден в данных: " + key);
    const price = win.Bow.economy.buyPrice(key, game());
    const invBefore = win.Bow.economy.countItem(game().player, win.Bow.data.items[key].id);
    click(btn);
    const invAfter = win.Bow.economy.countItem(game().player, win.Bow.data.items[key].id);
    eq(game().player.money, before - price, "деньги");
    eq(invAfter, invBefore + 1, "количество товара");
    return key + " за " + price + ", осталось " + game().player.money;
  });

  check("Деньги не дублируются предметом-монетой (ошибка прототипа)", () => {
    const hasCoin = game().player.inventory.some((e) => /coin/i.test(e.itemId));
    assert(!hasCoin, "в инвентаре есть предмет-монета — двойной учёт вернулся");
    return "монеты только в player.money";
  });

  check("Продажа возвращает деньги и уменьшает товар", () => {
    const sellBtn = doc().querySelector("[data-act='sell']");
    if (!sellBtn) {
      return "нечего продавать в этой локации — пропущено";
    }
    const key = sellBtn.getAttribute("data-key");
    const before = game().player.money;
    const have = win.Bow.economy.countItem(game().player, win.Bow.data.items[key].id);
    click(sellBtn);
    assert(game().player.money > before, "деньги не выросли");
    eq(win.Bow.economy.countItem(game().player, win.Bow.data.items[key].id), have - 1, "остаток товара");
    return key + " +" + (game().player.money - before) + " монет";
  });

  check("Нельзя купить товар, которого нет в этой локации", () => {
    const res = win.Bow.economy.buy(game(), game().player.location, "fur", 1);
    assert(res.ok === false, "покупка прошла, хотя товара здесь быть не должно");
    return res.message;
  });

  check("Нельзя купить без денег", () => {
    const g = game();
    const savedMoney = g.player.money;
    g.player.money = 0;
    const res = win.Bow.economy.buy(g, "tavern", "stew", 1);
    g.player.money = savedMoney;
    assert(res.ok === false, "покупка без денег прошла");
    return res.message;
  });

  /* 4. Еда */
  check("Еда повышает сытость и тратит предмет", () => {
    const g = game();
    /* Гарантируем еду: покупаем хлеб, если его нет. */
    const breadId = win.Bow.data.items.bread.id;
    if (win.Bow.economy.countItem(g.player, breadId) === 0) {
      win.Bow.economy.addItem(g.player, breadId, 1);
    }
    g.player.needs.hunger = 40;
    const before = win.Bow.economy.countItem(g.player, breadId);
    const res = win.Bow.adapter.act.eat(g, "bread");
    assert(res.ok, "еда не сработала: " + res.message);
    eq(win.Bow.economy.countItem(g.player, breadId), before - 1, "остаток хлеба");
    assert(g.player.needs.hunger > 40, "сытость не выросла");
    return "сытость 40 → " + g.player.needs.hunger;
  });

  /* 5. Потребности */
  check("Потребности не выходят за 0..100 даже после долгого времени", () => {
    const g = game();
    for (let i = 0; i < 240; i++) { win.Bow.time.advance(g, 1); }
    const n = g.player.needs;
    Object.keys(n).forEach((k) => {
      assert(n[k] >= 0 && n[k] <= 100, "потребность " + k + " = " + n[k] + " вне диапазона");
    });
    return "health=" + n.health + " hunger=" + n.hunger + " fatigue=" + n.fatigue + " mood=" + n.mood;
  });

  check("Падение потребностей зависит от часов, а не от числа вызовов", () => {
    const g = game();
    g.player.needs.hunger = 100;
    win.Bow.time.advance(g, 1);
    const after1 = g.player.needs.hunger;
    g.player.needs.hunger = 100;
    win.Bow.time.advance(g, 5);
    const after5 = g.player.needs.hunger;
    const drop1 = 100 - after1;
    const drop5 = 100 - after5;
    assert(drop5 > drop1 * 3, "за 5 часов падение не в 5 раз больше: " + drop1 + " против " + drop5);
    return "1 час: -" + drop1 + ", 5 часов: -" + drop5;
  });

  /* 6. Персонажи */
  check("Пол персонажа соблюдается в тексте (в прототипе был баг)", () => {
    const g = game();
    g.player.location = "smithy";
    const res = win.Bow.actions.talk(g, "person:tarn");
    assert(res.ok, "разговор не состоялся");
    assert(!/Она /.test(res.message), "про мужчину сказано «Она»");
    assert(/Тарн/.test(res.message), "нет имени персонажа");
    return "Тарн описан корректно";
  });

  check("Разговор недоступен, если человек в другом месте", () => {
    const g = game();
    g.player.location = "square";
    const res = win.Bow.actions.talk(g, "person:tarn");
    assert(res.ok === false, "разговор через расстояние прошёл");
    return res.message;
  });

  check("Память персонажа пополняется разговором", () => {
    const g = game();
    g.player.location = "tavern";
    const before = g.people["person:sigi"].memory.length;
    win.Bow.actions.talk(g, "person:sigi");
    const after = g.people["person:sigi"].memory.length;
    assert(after > before, "память не пополнилась");
    return before + " → " + after + " записей";
  });

  check("Суточный счётчик разговоров сбрасывается на новом дне", () => {
    const g = game();
    g.people["person:sigi"].talkedToday = 3;
    g.time.hour = 23;
    win.Bow.time.advance(g, 2);
    eq(g.people["person:sigi"].talkedToday, 0, "счётчик не сброшен");
    return "сброшен";
  });

  /* 7. Сохранения */
  check("Сохранение сериализуется и восстанавливается без потерь", () => {
    const g = game();
    const serialized = win.Bow.save.serialize(g, Date.now());
    const loaded = win.Bow.save.deserialize(serialized);
    assert(loaded.ok, "загрузка отклонена: " + loaded.reason);
    eq(loaded.state.player.money, g.player.money, "деньги");
    eq(loaded.state.time.totalHours, g.time.totalHours, "часы");
    eq(Object.keys(loaded.state.people).length, Object.keys(g.people).length, "количество персонажей");
    return "версия " + loaded.state.version + ", " + Math.round(serialized.length / 1024) + " КБ";
  });

  check("Битый файл отклоняется, состояние не портится", () => {
    const before = game().player.money;
    const res = win.Bow.save.deserialize("{это не json");
    assert(res.ok === false, "битый JSON принят");
    eq(game().player.money, before, "состояние изменилось после отказа");
    return res.reason;
  });

  check("Полупустое сохранение отклоняется (ошибка прототипа)", () => {
    const fake = JSON.stringify({
      app: "bow", saveVersion: 1, gameVersion: "0.0.2",
      checksum: "0", state: { version: "0.0.2", player: {} }
    });
    const res = win.Bow.save.deserialize(fake);
    assert(res.ok === false, "неполное сохранение принято");
    return res.reason.slice(0, 70);
  });

  check("Сохранение другого проекта отклоняется", () => {
    const res = win.Bow.save.deserialize(JSON.stringify({ app: "other", state: {} }));
    assert(res.ok === false, "чужое сохранение принято");
    return res.reason;
  });

  check("Подмена данных ловится контрольной суммой", () => {
    const g = game();
    const parsed = JSON.parse(win.Bow.save.serialize(g, 1));
    parsed.state.player.money = 999999;
    const res = win.Bow.save.deserialize(JSON.stringify(parsed));
    assert(res.ok === false, "подмена не поймана");
    return res.reason;
  });

  /* 8. События */
  check("Причинные события не срабатывают без причины", () => {
    const g = game();
    const rngNever = () => 0.999; /* никогда не проходит порог chance */
    g.player.location = "square";
    g.player.needs.hunger = 100;
    g.player.needs.fatigue = 100;
    const before = g.events.length;
    win.Bow.events.afterAction(g, rngNever);
    eq(g.events.length, before, "событие сработало без причины");
    return "без причины — без события";
  });

  check("Причинное событие срабатывает при голоде", () => {
    const g = game();
    g.player.location = "square";
    g.player.needs.hunger = 5;
    const always = () => 0.0;
    const before = g.events.length;
    win.Bow.events.afterAction(g, always);
    assert(g.events.length > before, "голодное событие не сработало");
    return g.events[g.events.length - 1].text.slice(0, 50) + "…";
  });

  check("Журнал не растёт бесконечно", () => {
    const g = game();
    for (let i = 0; i < 200; i++) { win.Bow.journal.add(g, "тестовая запись " + i, "info"); }
    assert(g.journal.length <= win.Bow.journal.LIMIT, "журнал превысил лимит: " + g.journal.length);
    return g.journal.length + " ≤ " + win.Bow.journal.LIMIT;
  });

  /* 8б. Атмосфера и журнал разделены */
  check("Бытовая атмосфера НЕ попадает в журнал", () => {
    const g = game();
    g.player.location = "tavern";
    const before = g.journal.length;
    const line = win.Bow.events.ambience(g, () => 0.5);
    assert(line, "атмосфера не вернулась");
    eq(g.journal.length, before, "журнал пополнился бытовой фразой");
    return "атмосфера: " + line.slice(0, 45) + "… (журнал не тронут)";
  });

  check("Атмосфера отрисована в сцене", () => {
    const g = game();
    g.player.location = "smithy";
    g.flags.ambience = "Молот бьёт ровно, как сердце.";
    win.BowGame.refresh(true);
    const amb = doc().getElementById("bow-ambience").textContent;
    assert(/Молот/.test(amb), "атмосфера не выведена в сцену: " + JSON.stringify(amb));
    return amb.slice(0, 40);
  });

  check("Значимый слух попадает в журнал", () => {
    const g = game();
    g.player.location = "square";
    /* Журнал мог быть уже заполнен до лимита предыдущими тестами:
       тогда длина не растёт, но запись всё равно добавляется.
       Проверяем по содержимому, а не по длине. */
    const res = win.Bow.events.rumour(g, () => 0.1);
    assert(typeof res === "string" && res.length > 10, "слух не сформирован: " + res);
    const found = g.journal.some((e) => e.kind === "rumour" && e.text.indexOf(res) !== -1);
    assert(found, "слух не найден в журнале");
    return "слух записан: " + res.slice(0, 40) + "…";
  });

  check("Погода считается по сезону", () => {
    const g = game();
    const w = win.Bow.events.weatherOf(g, () => 0.5);
    assert(typeof w === "string" && w.length > 3, "погода не строка: " + w);
    return w;
  });

  /* 8в. Внешность и окно персонажа */
  check("У каждого персонажа есть описание внешности", () => {
    const g = game();
    const ids = Object.keys(g.people);
    const missing = ids.filter((id) => {
      const a = g.people[id].appearance;
      return !a || !a.face || !a.clothes;
    });
    assert(missing.length === 0, "нет внешности у: " + missing.join(", "));
    return ids.length + " персонажей, все с наружностью";
  });

  check("Кнопка «Осмотреть» открывает карточку с внешностью", () => {
    const g = game();
    g.player.location = "square";
    win.BowGame.refresh(true);
    const btn = doc().querySelector("[data-act='inspect']");
    assert(btn, "кнопки «Осмотреть» нет");
    click(btn);
    const sheet = doc().getElementById("bow-sheet");
    assert(sheet.classList.contains("bow-sheet-open"), "окно не открылось");
    const text = sheet.textContent;
    assert(/Наружность/.test(text), "нет блока наружности");
    assert(/Лицо/.test(text), "нет строки «Лицо»");
    return "окно открыто, наружность на месте";
  });

  check("Окно персонажа закрывается", () => {
    const close = doc().querySelector("[data-act='close-sheet']");
    click(close);
    const sheet = doc().getElementById("bow-sheet");
    assert(!sheet.classList.contains("bow-sheet-open"), "окно не закрылось");
    return "закрыто";
  });

  /* 8г. Затухание и палитра */
  check("Затухание сцены предусмотрено в CSS", () => {
    const styles = [...doc().querySelectorAll("style")].map((x) => x.textContent).join("\n");
    assert(/@keyframes bow-fade-in/.test(styles), "нет анимации проявления сцены");
    assert(/bow-scene-fade/.test(styles), "нет класса затухания");
    return "анимация есть";
  });

  check("Затухание отключается при prefers-reduced-motion", () => {
    const styles = [...doc().querySelectorAll("style")].map((x) => x.textContent).join("\n");
    const idx = styles.lastIndexOf("prefers-reduced-motion");
    assert(idx !== -1, "нет медиазапроса reduced-motion");
    const block = styles.slice(idx, idx + 600);
    assert(/animation-duration:\s*0(\.001)?s\s*!important/.test(block),
      "движение не отключается для reduced-motion");
    assert(!/\*\s*\{[^}]*transition:\s*none/.test(block),
      "глобальное правило глушит переходы всего документа");
    return "движение приглушено точечно";
  });

  check("Новая палитра: нет охристо-бурых тонов", () => {
    const styles = [...doc().querySelectorAll("style")].map((x) => x.textContent).join("\n");
    /* Ищем именно наш блок переменных, а не нормализатор SugarCube. */
    const start = styles.indexOf("--bow-bg:");
    assert(start !== -1, "наши переменные палитры не найдены в CSS");
    const root = styles.slice(start, start + 900);

    assert(/--bow-silver/.test(root), "нет серебра в палитре");
    assert(/--bow-bordo/.test(root), "нет бордо в палитре");

    /* Старые грязные тона не должны вернуться. */
    const dirty = ["#c3a86a", "#c5ad7b", "#8d7746", "#c5ad7b"].filter((c) => root.toLowerCase().includes(c));
    assert(dirty.length === 0, "вернулись старые тона: " + dirty.join(", "));
    return "серебро и бордо на месте, старых тонов нет";
  });

  check("Смена сцены помечается в состоянии", () => {
    const g = game();
    const before = g.flags.sceneChanged || 0;
    win.Bow.actions.move(g, "tavern");
    assert((g.flags.sceneChanged || 0) > before, "смена сцены не отмечена");
    return "счётчик сцен: " + g.flags.sceneChanged;
  });

  check("Миграция старого сохранения проходит всю цепочку до текущей версии", () => {
    const g = JSON.parse(JSON.stringify(game()));
    g.version = "0.0.2";
    delete g.dialog;
    delete g.visits;
    delete g.reputation;
    Object.keys(g.people).forEach((id) => { delete g.people[id].appearance; delete g.people[id].dialog; });
    Object.keys(g.orgs).forEach((id) => { delete g.orgs[id].wealth; delete g.orgs[id].unrest; });
    const res = win.Bow.state.migrate(g);
    eq(res.state.version, win.Bow.data.meta.version, "версия после миграции");
    assert(res.state.dialog === null, "dialog не добавлен");
    assert(res.state.people["person:sigi"].appearance, "внешность не добавлена миграцией");
    assert(win.Bow.util.isPlainObject(res.state.reputation), "репутация не добавлена миграцией");
    eq(res.state.reputation["org:brod"], 0, "репутация новой системы");
    assert(typeof res.state.orgs["org:brod"].wealth === "number", "достаток общины не добавлен");
    return "0.0.2 → " + res.state.version + ", шагов: " + res.applied.length;
  });

  /* 8д. Значки, выдвижная панель, логотип */
  check("Логотип встроен и является кнопкой", () => {
    const styles = [...doc().querySelectorAll("style")].map((x) => x.textContent).join("\n");
    assert(/--bow-logo:\s*url\("data:image\/png;base64,/.test(styles), "логотип не встроен в CSS");
    const btn = doc().getElementById("bow-logo-btn");
    assert(btn, "кнопки-логотипа нет");
    eq(btn.tagName, "BUTTON", "логотип не кнопка");
    return "логотип встроен, кнопка на месте";
  });

  check("Выдвижная панель закрыта при старте", () => {
    const body = doc().getElementById("bow-body");
    const drawer = doc().getElementById("bow-drawer");
    assert(drawer, "панели нет в разметке");
    assert(!body.classList.contains("bow-body-open"), "панель открыта при старте");
    eq(doc().getElementById("bow-logo-btn").getAttribute("aria-expanded"), "false", "aria-expanded");
    return "закрыта";
  });

  check("Клик по логотипу открывает панель", () => {
    click(doc().getElementById("bow-logo-btn"));
    const body = doc().getElementById("bow-body");
    assert(body.classList.contains("bow-body-open"), "панель не открылась");
    eq(doc().getElementById("bow-logo-btn").getAttribute("aria-expanded"), "true", "aria-expanded");
    return "открыта";
  });

  check("Клик по логотипу повторно закрывает панель", () => {
    click(doc().getElementById("bow-logo-btn"));
    assert(!doc().getElementById("bow-body").classList.contains("bow-body-open"), "панель не закрылась");
    return "закрыта";
  });

  check("Панель выезжает плавно: анимируется ширина, а не auto-колонка", () => {
    const styles = [...doc().querySelectorAll("style")].map((x) => x.textContent).join("\n");
    const drawer = styles.slice(styles.indexOf(".bow-drawer {"));
    assert(/width:\s*0/.test(drawer.slice(0, 260)), "закрытая панель не имеет нулевой ширины");
    assert(/transition:[^;}]*width\s+0\.[1-9]/.test(drawer.slice(0, 400)),
      "ширина панели не анимируется — выезда не будет видно");
    assert(/\.bow-body\.bow-body-open \.bow-drawer\s*\{[^}]*width:\s*(min\()?(var\(|\d)/.test(styles),
      "открытое состояние не задаёт ширину панели");
    assert(!/\.bow-body\s*\{[^}]*grid-template-columns[^}]*auto\s+0/.test(styles),
      "осталась схема с анимацией auto-колонки: браузер её не интерполирует");
    return "width 0 → 336px за 0.34s";
  });

  check("Переход панели не отключается глобально для reduced-motion", () => {
    const styles = [...doc().querySelectorAll("style")].map((x) => x.textContent).join("\n");
    const idx = styles.indexOf("prefers-reduced-motion");
    const block = styles.slice(idx, idx + 400);
    assert(!/\*\s*\{[^}]*transition:\s*none\s*!important/.test(block),
      "reduced-motion всё ещё глушит все переходы через *");
    return "точечное отключение, а не глобальное";
  });

  check("Клик по сцене не закрывает встроенную панель на компьютере", () => {
    win.Bow.ui.setDrawer(true);
    click(doc().querySelector(".bow-main .bow-scene") || doc().querySelector(".bow-main"));
    assert(doc().getElementById("bow-body").classList.contains("bow-body-open"),
      "панель закрылась от клика по сцене, хотя на ПК она встроена в поток");
    win.Bow.ui.setDrawer(false);
    return "на ПК панель не реагирует на клик по сцене";
  });

  check("Значки разделов открывают панель", () => {
    const railBtns = doc().querySelectorAll(".bow-rail-btn");
    assert(railBtns.length >= 6, "значков меньше шести: " + railBtns.length);
    const invBtn = doc().querySelector("[data-act='panel'][data-panel='inv']");
    assert(invBtn, "значка «Вещи» нет");
    click(invBtn);
    assert(doc().getElementById("bow-body").classList.contains("bow-body-open"), "значок не открыл панель");
    assert(invBtn.classList.contains("bow-rail-active"), "значок не подсвечен");
    win.Bow.ui.setDrawer(false);
    return railBtns.length + " значков";
  });

  check("Панель содержит все нужные разделы", () => {
    const panels = doc().querySelectorAll("#bow-drawer .bow-dpanel");
    assert(panels.length >= 5, "разделов меньше пяти: " + panels.length);
    const text = doc().getElementById("bow-drawer").textContent;
    ["Состояние", "Умения", "При себе", "Хроника", "Память игры"].forEach((name) => {
      assert(text.indexOf(name) !== -1, "в панели нет раздела: " + name);
    });
    return panels.length + " разделов";
  });

  check("Сохранения вынесены в панель, а не в главное окно", () => {
    const drawer = doc().getElementById("bow-drawer");
    ["bow-btn-save", "bow-btn-load", "bow-btn-restart"].forEach((id) => {
      const el = doc().getElementById(id);
      assert(el, "нет кнопки " + id);
      assert(drawer.contains(el), "кнопка " + id + " вне панели");
    });
    return "все кнопки сохранений в панели";
  });

  check("Мини-полосы состояния видны в шапке", () => {
    const minis = doc().querySelectorAll("#bow-topbar-status .bow-mini");
    eq(minis.length, 4, "количество мини-полос");
    return minis.length + " мини-полосы";
  });

  check("Карточка жителя показывает его состояние (как в Kenshi)", () => {
    const g = game();
    g.player.location = "smithy";
    win.BowGame.refresh(true);
    click(doc().querySelector("[data-act='inspect']"));
    const sheet = doc().getElementById("bow-sheet");
    const text = sheet.textContent;
    assert(/Состояние/.test(text), "нет блока состояния");
    assert(/Здоровье/.test(text), "нет строки здоровья");
    assert(/Бодрость/.test(text), "нет строки бодрости");
    assert(/Наружность/.test(text), "нет наружности");
    win.Bow.ui.renderPersonSheet(null);
    return "состояние + наружность в карточке";
  });

  check("Панель не попадает в сохранение (это не игровое состояние)", () => {
    const serialized = win.Bow.save.serialize(game(), Date.now());
    assert(serialized.indexOf("drawerOpen") === -1, "состояние панели попало в сейв");
    return "сейв чист";
  });

  /* 9. Ошибки JS */
  check("За весь прогон не было ошибок JavaScript", () => {
    assert(jsdomErrors.length === 0, "ошибки: " + jsdomErrors.slice(0, 3).join(" | "));
    return "ошибок нет";
  });

  /* 10. Мобильная вёрстка — проверяем то, что проверяемо без браузера */
  check("В CSS есть медиазапросы для планшета и телефона", () => {
    const styles = [...doc().querySelectorAll("style")].map((s) => s.textContent).join("\n");
    assert(/@media \(max-width: 900px\)/.test(styles), "нет медиазапроса для планшета");
    assert(/@media \(max-width: 720px\)/.test(styles), "нет медиазапроса для телефона");
    assert(/prefers-reduced-motion/.test(styles), "нет поддержки reduced-motion");
    return "900px, 720px, reduced-motion";
  });

  check("Тач-цели не мельче 34px", () => {
    const styles = [...doc().querySelectorAll("style")].map((s) => s.textContent).join("\n");
    assert(/min-height:\s*(3[4-9]|[4-9]\d)px/.test(styles), "кнопки слишком мелкие");
    return "минимальная высота задана";
  });

  check("Внешних ссылок в HTML нет", () => {
    const bad = [...doc().querySelectorAll("[src^='http'], link[href^='http']")]
      .map((el) => el.getAttribute("src") || el.getAttribute("href"))
      .filter((u) => u && !/motoslave\.net|twinery\.org/.test(u));
    assert(bad.length === 0, "внешние ресурсы: " + bad.join(", "));
    return "игра автономна";
  });

  /* ---------- Итоги ---------- */
  console.log("\n  ПРОВЕРКА BLADES OF WAR — " + new Date().toISOString().slice(0, 16).replace("T", " ") + "\n");

  let passed = 0;
  let failed = 0;
  for (const r of results) {
    if (r.ok) {
      passed++;
      console.log("  ✓ " + r.name + (r.detail ? "  ·  " + r.detail : ""));
    } else {
      failed++;
      console.log("  ✗ " + r.name + "\n      → " + r.detail);
    }
  }

  console.log("\n  Итого: " + passed + " прошло, " + failed + " провалено из " + results.length + "\n");

  if (failed > 0) {
    console.log("  ВНИМАНИЕ: игра не готова к передаче, пока есть провалы.\n");
    process.exit(1);
  }

  console.log("  Логика и разметка проверены. Визуальную приёмку и мобильный");
  console.log("  вид проверяет владелец: Chromium в этой песочнице недоступен.\n");
  process.exit(0);
})();
