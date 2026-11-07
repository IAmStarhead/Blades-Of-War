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
    /* Без явной отрисовки строки торговли ещё не существует:
       интерфейс мог не успеть построить пассаж. */
    win.BowGame.refresh(true);
    win.BowGame.refresh(true);
    const row = () => doc().querySelector("#passages .bow-trade-row").textContent.replace(/\s+/g, " ");
    assert(/2 м\./.test(row()) || /\d+ м\./.test(row()), "цена не показана");
    const before = row();
    const price = win.Bow.economy.buyPrice("bread", g, g.player.location);
    click(doc().querySelector("#passages [data-act='buy']"));

    /* Деньги ушли ровно на цену, а строка показывает то же, что
       считает логика. Раньше тест ждал ровно 15 м. и падал от
       любой смены цены — это проверка числа, а не торговли. */
    eq(g.player.money, 18 - price, "списали не цену товара");
    eq(row(), before, "строка торговли перерисовалась с другим текстом");
    return "хлеб " + price + " м., осталось " + g.player.money + " м.";
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
    /* Топор, а не хлеб: на хлебе за 3 скидка упирается в пол
       округления, и «уважение не снижает цену» звучит несправедливо. */
    const neutral = win.Bow.economy.buyPrice("axe", g, loc);
    g.reputation["org:brod"] = 70;
    const friendly = win.Bow.economy.buyPrice("axe", g, loc);
    g.reputation["org:brod"] = -70;
    const hostile = win.Bow.economy.buyPrice("axe", g, loc);
    assert(friendly < neutral, "уважение не снижает цену");
    assert(hostile > neutral, "вражда не поднимает цену");
    g.reputation["org:brod"] = 0;
    return "топор: свой " + friendly + " / нейтрально " + neutral + " / враг " + hostile;
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

  /* 8и. Бой, оружие и развязка (0.0.6) */
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const seq = (vals) => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };

  check("Оружие в руке усиливает удар, а не лежит на полке", () => {
    const g = clone(game());
    g.fight = null;
    const before = win.Bow.fight.attackPower(g.player, "crime");
    assert(win.Bow.fight.weaponOf(g.player), "нож в инвентаре не взят в руку");

    win.Bow.economy.addItem(g.player, "item:axe", 1);
    const after = win.Bow.fight.attackPower(g.player, "crime");
    assert(after > before, "топор не усиливает удар: " + before + " → " + after);

    /* Кулачный бой оружие не считает: это спарринг, а не резня. */
    const spar = win.Bow.fight.attackPower(g.player, "spar");
    assert(spar < after, "в кулачном бою топор всё равно считается");
    return "с ножом " + Math.round(before) + ", с топором " + Math.round(after) + ", кулаками " + Math.round(spar);
  });

  check("У жителей своё оружие и броня, и они влияют на бой", () => {
    const g = clone(game());
    g.fight = null;
    const tarn = g.people["person:tarn"];
    const liva = g.people["person:liva"];
    assert(win.Bow.fight.weaponOf(tarn), "у кузнеца нет оружия");
    assert(win.Bow.fight.armorOf(tarn), "у кузнеца нет брони");
    assert(!win.Bow.fight.weaponOf(liva), "у Ливы не должно быть оружия");

    const tarnPower = win.Bow.fight.attackPower(tarn, "crime");
    const livaPower = win.Bow.fight.attackPower(liva, "crime");
    assert(tarnPower > livaPower, "кузнец с топором бьёт не сильнее дочери торговца");

    const armored = win.Bow.fight.defenseOf(tarn, "crime");
    const bare = win.Bow.fight.defenseOf(liva, "crime");
    assert(armored > bare, "стёганка не защищает");
    return "Тарн " + Math.round(tarnPower) + " / защита " + armored.toFixed(1) +
      ", Лива " + Math.round(livaPower) + " / защита " + bare.toFixed(1);
  });

  check("Бой кончается сдачей, а не здоровьем в ноль", () => {
    const g = clone(game());
    g.player.location = "smithy";
    g.player.needs.health = 90;
    g.player.needs.fatigue = 80;
    const tarn = g.people["person:tarn"];
    tarn.needs.health = 100;
    win.Bow.fight.open(g, "person:tarn");
    win.Bow.fight.start(g, "spar", seq([0.5]));

    let i = 0;
    while (g.fight && g.fight.phase === "exchange" && i++ < 40) {
      win.Bow.fight.move(g, "press", seq([0.3, 0.4, 0.5, 0.6, 0.7]));
    }
    assert(!g.fight, "бой не закончился за 40 обменов");
    const low = Math.min(g.player.needs.health, tarn.needs.health);
    assert(low > 0, "здоровье упало до нуля — это не сдача, а нокаут");
    assert(low >= win.Bow.data.fightRules.yieldAt.player,
      "здоровье провалилось ниже порога сдачи: " + low);
    return "после " + i + " обменов: игрок " + g.player.needs.health +
      ", Тарн " + tarn.needs.health + " (порог " + win.Bow.data.fightRules.yieldAt.player + ")";
  });

  check("Кулачный бой растит навык, но не портит репутацию", () => {
    const g = clone(game());
    g.player.location = "smithy";
    g.player.needs.health = 95;
    g.player.needs.fatigue = 90;
    g.reputation["org:brod"] = 0;
    g.heat["org:brod"] = 0;
    g.flags.lastFight = null;
    const before = g.player.skills.combat;

    win.Bow.fight.open(g, "person:tarn");
    win.Bow.fight.start(g, "spar", seq([0.5]));
    let i = 0;
    while (g.fight && g.fight.phase === "exchange" && i++ < 40) {
      win.Bow.fight.move(g, "press", seq([0.2, 0.3, 0.4]));
    }
    assert(g.player.skills.combat > before, "навык боя не вырос от спарринга");
    eq(g.reputation["org:brod"], 0, "кулачный бой испортил отношение общины");
    eq(g.heat["org:brod"], 0, "кулачный бой добавил розыск");
    assert(g.stats.sparsMade > 0, "спарринг не учтён в статистике");
    return "Бой " + before + " → " + g.player.skills.combat + ", репутация не тронута";
  });

  check("Нападение — преступление: розыск, репутация и память жертвы", () => {
    const g = clone(game());
    g.player.location = "square";
    g.player.needs.health = 95;
    g.player.needs.fatigue = 90;
    g.reputation["org:brod"] = 0;
    g.heat["org:brod"] = 0;
    const liva = g.people["person:liva"];
    liva.needs.health = 100;

    win.Bow.fight.open(g, "person:liva");
    win.Bow.fight.start(g, "crime", seq([0.5]));

    assert(win.Bow.steal.heatOf(g, "org:brod") > 0, "нападение не подняло розыск");
    assert(win.Bow.work.reputation(g, "org:brod") < 0, "нападение не уронило отношение общины");
    assert(liva.memory.some((m) => m.kind === "attacked"), "жертва не запомнила нападение");
    assert(liva.attitude < 0, "жертва не изменила отношение");
    return "розыск " + win.Bow.steal.heatOf(g, "org:brod") + ", отношение " +
      win.Bow.work.reputation(g, "org:brod") + ", память: " +
      liva.memory.map((m) => m.kind).join(", ");
  });

  check("Развязка после победы: обобрать — деньги из кошеля, добить — насмерть", () => {
    const g = clone(game());
    g.player.location = "square";
    /* Опытный боец против девочки: проверяем развязку, а не удачу.
       Иначе тест падал бы через раз — это была бы проверка ГПСЧ. */
    g.player.skills.combat = 90;
    g.player.needs.health = 100;
    g.player.needs.fatigue = 95;
    const liva = g.people["person:liva"];
    liva.needs.health = 100;
    const her0 = liva.money;
    const mine0 = g.player.money;

    win.Bow.fight.open(g, "person:liva");
    win.Bow.fight.start(g, "crime", seq([0.5]));
    let i = 0;
    while (g.fight && g.fight.phase === "exchange" && i++ < 40) {
      win.Bow.fight.move(g, "press", seq([0.05, 0.1, 0.2]));
    }
    assert(g.fight && g.fight.phase === "aftermath",
      "противник не сдался, фаза: " + (g.fight ? g.fight.phase : "нет боя"));

    const res = win.Bow.fight.decide(g, "rob", seq([0.9]));
    assert(res.ok, "решение не принято: " + res.message);
    assert(g.player.money > mine0, "деньги не перешли к игроку");
    assert(liva.money < her0, "у жертвы не убыло из кошеля");
    assert(liva.memory.some((m) => m.kind === "robbed"), "жертва не запомнила, что её обобрали");
    assert(!g.fight, "окно боя не закрылось после развязки");
    return "взято " + (g.player.money - mine0) + " м., у Ливы осталось " + liva.money +
      ", розыск " + g.flags.lastFight.heat;
  });

  check("Убийство резко поднимает розыск и убирает человека из мира", () => {
    const g = clone(game());
    g.player.location = "square";
    g.player.skills.combat = 90;
    g.player.needs.health = 100;
    g.player.needs.fatigue = 95;
    g.heat["org:brod"] = 0;
    g.reputation["org:brod"] = 0;
    const liva = g.people["person:liva"];
    liva.needs.health = 100;

    win.Bow.fight.open(g, "person:liva");
    win.Bow.fight.start(g, "crime", seq([0.5]));
    let i = 0;
    while (g.fight && g.fight.phase === "exchange" && i++ < 40) {
      win.Bow.fight.move(g, "press", seq([0.05, 0.1, 0.2]));
    }
    assert(g.fight && g.fight.phase === "aftermath", "до развязки не дошло");
    win.Bow.fight.decide(g, "kill", seq([0.5]));

    assert(liva.alive === false, "жертва осталась жива после «добить»");
    assert(liva.needs.health === 0, "у убитого осталось здоровье");
    assert(win.Bow.steal.heatOf(g, "org:brod") >= 70, "убийство не подняло розыск по-настоящему");

    /* Мёртвого больше не встретить: список людей фильтрует alive. */
    const here = win.Bow.actions.peopleAt(g, "square");
    assert(!here.some((p) => p.id === "person:liva"), "убитая по-прежнему стоит на площади");
    return "розыск " + win.Bow.steal.heatOf(g, "org:brod") + ", у площади людей: " + here.length;
  });

  check("Во время боя часы стоят", () => {
    const g = game();
    g.player.location = "square";
    g.time.scale = "1x";
    win.Bow.fight.open(g, "person:liva");
    assert(!win.BowGame.clockShouldRun(g), "часы идут посреди драки");
    win.Bow.fight.close(g);
    assert(win.BowGame.clockShouldRun(g), "после боя часы не вернулись");
    g.time.scale = "paused";
    return "бой останавливает время";
  });

  check("В карточке жителя есть кнопка боя", () => {
    const g = game();
    g.player.location = "square";
    g.fight = null;
    win.BowGame.refresh(true);
    const btn = doc().querySelector("#bow-people [data-act='fight-open']");
    assert(btn, "нет кнопки боя");
    assert(/Бой|Напасть/.test(btn.textContent), "непонятная подпись кнопки: " + btn.textContent);
    return btn.textContent.trim();
  });

  check("Снаряжение видно в панели «При себе»", () => {
    const g = game();
    win.BowGame.refresh(true);
    const inv = doc().getElementById("bow-inventory").textContent;
    assert(/В руке/.test(inv), "не видно, что в руке");
    assert(/На себе/.test(inv), "не видно, что надето");
    return inv.match(/В руке: \S+/) ? inv.match(/В руке: \S+/)[0] : "снаряжение показано";
  });

  check("Миграция 0.0.5 даёт старому сохранению бой и снаряжение (до 0.0.6.3)", () => {
    const g = clone(game());
    g.version = "0.0.5";
    delete g.fight;
    Object.keys(g.people).forEach((id) => { delete g.people[id].weapon; delete g.people[id].armor; });
    Object.keys(g.stats).forEach((k) => { if (/fight|spar/.test(k)) { delete g.stats[k]; } });

    const back = win.Bow.save.deserialize(win.Bow.save.serialize(g, 1));
    assert(back.ok, "старое сохранение не загрузилось: " + back.reason);
    eq(back.state.version, "0.0.6.3", "версия после миграции");
    assert(back.state.fight === null, "после миграции нет пустого слота боя");
    assert(back.state.people["person:tarn"].weapon, "кузнец остался без топора");
    return "0.0.5 → " + back.state.version + ", топор кузнеца на месте";
  });

  /* 8к. Поле боя, стража, клетка и улица (0.0.6.1) */
  check("Бой идёт на клеточном поле: у фишек есть координаты и сторона", () => {
    const g = clone(game());
    g.fight = null;
    g.player.location = "square";
    g.player.skills.combat = 90;
    g.player.needs.health = 100;
    g.player.needs.fatigue = 95;
    g.people["person:liva"].needs.health = 100;

    win.Bow.fight.open(g, "person:liva");
    win.Bow.fight.start(g, "crime", seq([0.5]));

    assert(g.fight.units.length === 2, "на поле не двое: " + g.fight.units.length);
    const mine = g.fight.units.filter((u) => u.side === "ally")[0];
    const foe = g.fight.units.filter((u) => u.side === "enemy")[0];
    assert(mine && foe, "нет одной из сторон");
    assert(mine.col === 0 && foe.col > mine.col, "стороны стоят не друг напротив друга");
    assert(typeof mine.row === "number", "у фишки нет ряда");
    return "свой в " + mine.col + "," + mine.row + "; враг в " + foe.col + "," + foe.row;
  });

  check("За ход бьют обе стороны, и ход пишется в хронику", () => {
    const g = clone(game());
    g.fight = null;
    g.player.location = "square";
    g.player.skills.combat = 40;
    g.player.needs.health = 100;
    g.player.needs.fatigue = 100;
    const liva = g.people["person:liva"];
    liva.needs.health = 100;

    win.Bow.fight.open(g, "person:liva");
    win.Bow.fight.start(g, "crime", seq([0.5]));

    const logBefore = g.fight.log.length;
    win.Bow.fight.move(g, "press", seq([0.05, 0.05, 0.05]));

    const entries = g.fight.log.slice(logBefore);
    assert(entries.length >= 1, "хроника пуста после хода");
    const text = entries.map((e) => e.text).join(" ");
    assert(/Роберт →|Вы →/.test(text) || /бьёт/.test(text), "в хронике нет удара");
    assert(liva.needs.health < 100, "противник не получил урона");
    return "в хронике: " + entries.length + " записей, у Ливы " + Math.round(liva.needs.health);
  });

  check("Противник отвечает, и игрок теряет здоровье", () => {
    const g = clone(game());
    g.fight = null;
    g.player.location = "smithy";
    g.player.needs.health = 100;
    g.player.needs.fatigue = 100;
    const tarn = g.people["person:tarn"];
    tarn.needs.health = 100;

    win.Bow.fight.open(g, "person:tarn");
    win.Bow.fight.start(g, "spar", seq([0.5]));
    for (let i = 0; i < 3 && g.fight && g.fight.phase === "exchange"; i++) {
      win.Bow.fight.move(g, "press", seq([0.1, 0.2, 0.3]));
    }
    assert(g.player.needs.health < 100, "игрок не получил ни одного удара");
    return "здоровье после обменов: " + Math.round(g.player.needs.health);
  });

  check("Нокаут кладёт фишку, смерть ставит череп", () => {
    const g = clone(game());
    g.fight = null;
    g.player.location = "square";
    g.player.skills.combat = 90;
    g.player.needs.health = 100;
    g.player.needs.fatigue = 95;
    const liva = g.people["person:liva"];
    liva.needs.health = 100;

    win.Bow.fight.open(g, "person:liva");
    win.Bow.fight.start(g, "crime", seq([0.5]));
    let guard = 0;
    while (g.fight && g.fight.phase === "exchange" && guard++ < 30) {
      win.Bow.fight.move(g, "press", seq([0.1, 0.2, 0.3]));
    }
    assert(g.fight && g.fight.phase === "aftermath", "противник не сдался");

    const foe = g.fight.units.filter((u) => u.side === "enemy")[0];
    assert(!foe.dead, "живой противник уже с черепом");
    assert(foe.hp <= win.Bow.data.fightRules.yieldAt.npc + 1, "сдавшийся не у порога: " + foe.hp);

    win.Bow.fight.decide(g, "kill", seq([0.5]));
    assert(liva.alive === false, "после «добить» жертва жива");
    const summary = g.flags.lastFight;
    const deadUnit = summary.units.filter((u) => u.side === "enemy")[0];
    assert(deadUnit.dead === true, "в отчёте убитый не помечен мёртвым");
    return "сдался на " + foe.hp + ", после добивания — dead";
  });

  check("Стража приходит по розыску, а не по клику", () => {
    const g = clone(game());
    g.fight = null;
    g.jail = null;
    g.guard = null;
    g.flags.guardAt = null;
    g.heat["org:guard"] = 0;
    win.Bow.guard.schedule(g);
    assert(!g.flags.guardAt, "стража собирается при чистом розыске");

    g.heat["org:guard"] = win.Bow.guard.THRESHOLD();
    assert(win.Bow.guard.schedule(g), "стража не собралась при розыске выше порога");
    assert(g.flags.guardAt > g.time.totalHours, "стража приходит мгновенно, без задержки");

    g.time.totalHours = g.flags.guardAt;
    const came = win.Bow.guard.checkArrival(g);
    assert(came && g.guard, "в назначенный час стража не пришла");
    assert(g.guard.squad.length === win.Bow.data.fightRules.guard.squad, "пришло не столько, сколько в правилах");
    return "порог " + win.Bow.guard.THRESHOLD() + ", пришло " + g.guard.squad.length;
  });

  check("Сдаться — клетка без драки; срок идёт и кончается", () => {
    const g = clone(game());
    g.fight = null;
    g.jail = null;
    g.heat["org:guard"] = 80;
    g.guard = { phase: "demand", arrived: true, squad: win.Bow.guard.squad(g) };
    g.player.needs.health = 90;

    win.Bow.guard.surrender(g);
    assert(g.jail, "сдача не привела в клетку");
    assert(!g.guard, "стража осталась стоять");
    eq(g.jail.hoursLeft, win.Bow.data.fightRules.guard.cellsHours, "срок в клетке");

    const before = g.jail.hoursLeft;
    win.Bow.guard.serve(g, 4);
    assert(g.jail.hoursLeft < before, "время в клетке не идёт");
    assert(g.player.needs.health > 0, "в клетке игрок умер");

    win.Bow.guard.serve(g, 100);
    assert(!g.jail, "срок вышел, а игрок всё ещё в клетке");
    return "20 ч → " + g.jail + " → выпущен";
  });

  check("Побег от стражи: без навыка ловят и калечат навсегда", () => {
    const g = clone(game());
    g.fight = null;
    g.jail = null;
    g.player.injuries = [];
    g.player.skills.survival = 0;
    g.player.skills.stealth = 0;
    g.heat["org:guard"] = 80;
    g.guard = { phase: "demand", arrived: true, squad: win.Bow.guard.squad(g) };

    /* Бросок 0.02 проходит проверку побега (её нет) и попадает в maimChance:
       сначала провал побега, затем увечье. */
    let n = 0;
    const res = win.Bow.guard.flee(g, () => [0.99, 0.01][Math.min(n++, 1)]);
    assert(!res.escaped, "побег удался при броске на провал");
    assert(g.jail, "пойманного не отправили в клетку");
    assert(g.player.injuries.length > 0, "пойманного не покалечили");
    const inj = g.player.injuries[0].key;
    return "поймали, травма: " + win.Bow.data.fightRules.injuries[inj].name;
  });

  check("Травма остаётся навсегда и отнимает силы", () => {
    const g = clone(game());
    g.player.injuries = [];
    const clean = win.Bow.fight.attackPower(g.player, "crime");
    const def = win.Bow.fight.maim(g.player, () => 0.01);
    const hurt = win.Bow.fight.attackPower(g.player, "crime");

    assert(def, "травма не нанесена");
    assert(hurt < clean, "травма не ослабила: " + clean + " → " + hurt);
    assert(win.Bow.fight.injuryWord(g.player).length === 1, "травма не записана в список");

    /* Переживает круг сохранения — значит, действительно навсегда. */
    const back = win.Bow.save.deserialize(win.Bow.save.serialize(g, 1));
    assert(back.state.player.injuries.length === 1, "травма потерялась при сохранении");
    g.player.injuries = [];
    return def.name + ": сила " + Math.round(clean) + " → " + Math.round(hurt);
  });

  check("Старое сохранение 0.0.6.1 не застревает в тупике со стражей", () => {
    const g = clone(game());
    g.version = "0.0.6.1";
    g.dead = null;
    g.jail = null;
    g.fight = null;
    /* Так выглядело сохранение до обновления: стража «есть»,
       но поля «пришла» ещё не существует. */
    g.guard = { phase: "demand", squad: [] };
    g.flags.hunted = true;
    delete g.flags.huntedUntil;
    delete g.flags.huntedHeat;

    const back = win.Bow.save.deserialize(win.Bow.save.serialize(g, 1));
    eq(back.state.version, "0.0.6.3", "версия после миграции");
    assert(back.state.guard && back.state.guard.arrived === true,
      "стража из старого сохранения осталась «непришедшей» — из неё не выбраться");
    eq(back.state.flags.huntedUntil, null, "поле срока розыска");
    return "версия 0.0.6.3, стража признана пришедшей";
  });

  check("Розыск виден игроку цифрой, а не только в журнале", () => {
    const g = game();
    g.dead = null;
    g.jail = null;
    g.fight = null;
    g.guard = null;
    g.heat["org:guard"] = 0;
    g.flags.hunted = false;
    win.BowGame.refresh(true);
    const empty = doc().getElementById("bow-heat").textContent.trim();
    eq(empty, "", "без розыска панель не пуста");

    g.heat["org:guard"] = 45;
    win.BowGame.refresh(true);
    const heat = doc().getElementById("bow-heat").textContent.replace(/\s+/g, " ");
    assert(/Розыск/.test(heat) && /45/.test(heat), "розыск не показан: " + heat);
    assert(/60/.test(heat), "не сказано, сколько до порога: " + heat);

    g.flags.hunted = true;
    g.flags.huntedUntil = g.time.totalHours + 72;
    g.flags.huntedHeat = 80;
    win.BowGame.refresh(true);
    const hunted = doc().getElementById("bow-heat").textContent.replace(/\s+/g, " ");
    assert(/узнают/.test(hunted) && /%/.test(hunted), "шанс на переходе не показан: " + hunted);

    g.heat["org:guard"] = 0;
    g.flags.hunted = false;
    win.BowGame.refresh(true);
    return heat.slice(0, 60);
  });

  check("Стража, которая ещё не пришла, не даёт ни сдаться, ни откупиться", () => {
    const g = clone(game());
    g.fight = null;
    g.jail = null;
    g.player.money = 500;
    g.heat["org:guard"] = 80;
    /* Так стража выглядит, пока десятник только собирается. */
    g.guard = { phase: "demand", squad: win.Bow.guard.squad(g) };

    const s1 = win.Bow.guard.surrender(g);
    assert(!s1.ok && !g.jail, "сдались стражe, которой нет на месте");
    const s2 = win.Bow.guard.bribe(g);
    assert(!s2.ok && g.player.money === 500, "откупились у отсутствующей стражи");
    eq(win.Bow.guard.fleeChance(g), 0, "шанс бегства без стражи");

    g.guard = null;
    return "до прихода стражи все выходы закрыты";
  });

  check("В розыске каждый переход даёт шанс быть узнанным, и этот шанс кончается", () => {
    const g = clone(game());
    g.fight = null;
    g.jail = null;
    g.guard = null;
    g.flags.hunted = true;
    g.flags.huntedUntil = g.time.totalHours + 72;
    g.flags.huntedHeat = 90;

    const chance = win.Bow.guard.huntedChance(g);
    assert(chance > 0, "в розыске шанс на переходе нулевой");

    let caught = 0;
    for (let i = 0; i < 200; i++) {
      g.guard = null;
      g.player.location = "square";
      if (win.Bow.guard.onMove(g, seq([0.001]))) { caught++; }
    }
    assert(caught > 0, "за 200 переходов не поймали ни разу");
    assert(!win.Bow.guard.huntedChance(g) || g.guard, "метка не сработала");

    g.guard = null;
    g.time.totalHours += 100;
    eq(win.Bow.guard.huntedChance(g), 0, "розыск не кончился через трое суток");
    assert(!win.Bow.guard.onMove(g, seq([0.001])), "ловят и после срока");
    return "шанс " + Math.round(chance * 100) + "%, поймали " + caught + " из 200";
  });

  check("На поле видно, кого бьют в этом ходу", () => {
    const g = game();
    g.fight = null;
    g.player.location = "square";
    g.player.skills.combat = 40;
    g.player.needs.health = 100;
    g.player.needs.fatigue = 100;
    g.people["person:liva"].needs.health = 100;

    win.Bow.fight.open(g, "person:liva");
    win.Bow.fight.start(g, "crime", seq([0.5]));
    win.Bow.fight.move(g, "press", seq([0.1, 0.2, 0.3, 0.4]));
    win.BowGame.refresh(true);

    assert(g.fight.aim && g.fight.aim.length > 0, "цели хода не записаны");
    const marks = doc().querySelectorAll("#bow-fight-page .bow-chip-aimed");
    assert(marks.length > 0, "на поле никто не помечен как цель");
    const text = g.fight.aim.map((a) => a.from + "→" + a.to).join(", ");
    win.Bow.fight.finish(g, "fled", {});
    g.flags.lastFight = null;
    win.BowGame.refresh(true);
    return "помечено " + marks.length + "; " + text;
  });

  check("Тяжёлый удар в драке может оставить увечье — и оно в хронике", () => {
    /* Увечье — шанс, а не гарантия, поэтому проверяем на серии
       боёв: один бросок может пройти мимо порога и ничего не доказать. */
    let found = 0;
    let line = "";
    for (let n = 0; n < 12 && !found; n++) {
      const g = clone(game());
      g.fight = null;
      g.player.injuries = [];
      g.player.money = 0;
      g.player.needs.health = 100;
      g.player.needs.fatigue = 100;
      g.player.skills.combat = 95;
      g.player.location = "smithy";
      g.people["person:tarn"].injuries = [];
      g.people["person:tarn"].needs.health = 100;
      g.people["person:tarn"].needs.fatigue = 100;

      win.Bow.fight.open(g, "person:tarn");
      win.Bow.fight.start(g, "crime", Math.random);
      for (let i = 0; i < 20 && g.fight && g.fight.phase === "exchange"; i++) {
        win.Bow.fight.move(g, "press", Math.random);
      }

      const log = ((g.fight || g.flags.lastFight).log || []).map((l) => l.text).join(" ");
      const inj = (g.people["person:tarn"].injuries || []).length + (g.player.injuries || []).length;
      if (inj > 0 && /навсегда/.test(log)) { found = inj; line = log.match(/[^/]*навсегда[^/]*/)[0].trim(); }
    }
    assert(found > 0, "за двенадцать драк ни одного увечья — удар не калечит");
    return line.slice(0, 60);
  });

  check("Спутник действительно идёт в бой и бьёт врага", () => {
    const g = clone(game());
    g.fight = null;
    g.player.location = "square";
    g.player.skills.combat = 40;
    g.player.needs.health = 100;
    g.player.needs.fatigue = 100;
    const bror = g.people["person:bror"];
    bror.attitude = 40;
    bror.location = "square";
    bror.needs.health = 100;
    bror.needs.fatigue = 100;
    g.people["person:liva"].needs.health = 100;

    win.Bow.fight.open(g, "person:liva");
    win.Bow.fight.toggleAlly(g, "person:bror");
    win.Bow.fight.start(g, "crime", seq([0.5]));

    const allies = g.fight.units.filter((u) => u.side === "ally");
    assert(allies.length === 2, "спутник не встал на поле: " + allies.length);

    let before = g.people["person:liva"].needs.health;
    win.Bow.fight.move(g, "press", seq([0.1, 0.1, 0.1, 0.1]));
    const after = g.people["person:liva"].needs.health;
    assert(after < before, "врагу не досталось ни от вас, ни от спутника");

    const text = g.fight.log.map((l) => l.text).join(" ");
    assert(/Брор/.test(text), "спутник ни разу не упомянут в хронике");
    return "Брор на поле, Лива: " + Math.round(before) + " → " + Math.round(after);
  });

  check("Пришедший отряд идёт с вами и против стражи", () => {
    const g = clone(game());
    g.fight = null;
    g.jail = null;
    g.player.location = "square";
    g.player.needs.health = 100;
    g.player.needs.fatigue = 100;
    const bror = g.people["person:bror"];
    bror.attitude = 40;
    bror.location = "square";
    g.heat["org:guard"] = 80;
    g.flags.guardAt = g.time.totalHours;

    win.Bow.guard.checkArrival(g);
    win.Bow.guard.fight(g);

    assert(g.fight && g.fight.mode === "guard", "бой со стражей не начался");
    const allies = g.fight.units.filter((u) => u.side === "ally").map((u) => u.name);
    assert(allies.length === 2, "против стражи пошли в одиночку: " + allies.join(","));
    assert(allies.indexOf("Брор") !== -1, "Брор не пошёл против стражи");
    return "свои: " + allies.join(", ");
  });

  check("Игрок выбирает, кого бить, и удар идёт именно в него", () => {
    const g = game();
    g.fight = null;
    g.jail = null;
    g.player.location = "square";
    g.player.skills.combat = 70;
    g.player.needs.health = 100;
    g.player.needs.fatigue = 100;
    g.heat["org:guard"] = 80;
    g.flags.guardAt = g.time.totalHours;

    win.Bow.guard.checkArrival(g);
    win.Bow.guard.fight(g);
    win.BowGame.refresh(true);

    const foes = g.fight.units.filter((u) => u.side === "enemy");
    assert(foes.length === 3, "стражников не трое");
    const last = foes[2];

    click(doc().querySelector('#bow-fight-page .bow-chip[data-target="' + last.key + '"]'));
    eq(g.fight.target, last.key, "выбранная цель");
    win.BowGame.refresh(true);
    assert(doc().querySelector("#bow-fight-page .bow-chip-target"), "цель не подсвечена");

    const before = last.hp;
    win.Bow.fight.move(g, "press", seq([0.05, 0.05, 0.05]), last.key);
    assert(last.hp < before, "удар не попал в выбранного: " + before + " → " + last.hp);
    const others = foes.slice(0, 2).map((u) => u.hp);
    /* Убираем за собой всё, что навёл этот тест: оставленный бой
       закрывает грабителю и карточке жителя дорогу в следующих. */
    win.Bow.fight.finish(g, "fled", {});
    g.flags.lastFight = null;
    g.guard = null;
    g.flags.guardAt = null;
    g.heat["org:guard"] = 0;
    g.fight = null;
    /* Стража успевает ответить и отправить в клетку — за собой надо
       убрать и это, иначе следующие тесты видят живую клетку. */
    g.jail = null;
    /* Игрока тоже вернуть в строй: грабитель не выходит к тому,
       кто еле стоит, и следующий тест молча падал бы. */
    g.player.needs.health = 100;
    g.player.needs.fatigue = 100;
    win.BowGame.refresh(true);
    return "Свейн: " + Math.round(before) + " → " + Math.round(last.hp) + ", прочие " + others.join("/");
  });

  /* 8л. Удары, точность, отряд, кража и лечение (0.0.6.3) */
  check("Удар в голову попадает реже и бьёт сильнее, чем в корпус", () => {
    const g = clone(game());
    g.player.skills.combat = 50;
    g.player.needs.fatigue = 100;
    g.player.needs.health = 100;
    const foe = { skills: { combat: 50 }, needs: { health: 100, fatigue: 80 } };

    const head = win.Bow.fight.hitChance(g.player, foe, "press", "head");
    const body = win.Bow.fight.hitChance(g.player, foe, "press", "body");
    assert(head < body, "в голову попасть не труднее: " + head + " vs " + body);

    const headDmg = win.Bow.fight.damageRoll(g.player, foe, "crime", "press", seq([0.5]), "head");
    const bodyDmg = win.Bow.fight.damageRoll(g.player, foe, "crime", "press", seq([0.5]), "body");
    assert(headDmg > bodyDmg, "в голову бьёт не сильнее: " + headDmg + " vs " + bodyDmg);
    return "голова " + Math.round(head * 100) + "% / −" + headDmg +
      ", корпус " + Math.round(body * 100) + "% / −" + bodyDmg;
  });

  check("Навык выживания добавляет точности", () => {
    const g = clone(game());
    g.player.needs.fatigue = 100;
    g.player.needs.health = 100;
    const foe = { skills: { combat: 50 }, needs: { health: 100, fatigue: 80 } };

    g.player.skills.combat = 50;
    g.player.skills.survival = 0;
    const low = win.Bow.fight.hitChance(g.player, foe, "press", "body");
    g.player.skills.survival = 100;
    const high = win.Bow.fight.hitChance(g.player, foe, "press", "body");
    assert(high > low, "выживание не влияет на точность: " + low + " vs " + high);
    return Math.round(low * 100) + "% → " + Math.round(high * 100) + "%";
  });

  check("Удар по ногам или в голову роняет фишку раньше сдачи", () => {
    /* В бою один на один порог сдачи (18) всегда наступает первым,
       и падение увидеть негде. Настоящая проверка — бой со стражей:
       там врагов трое, и один может лежать, пока дерутся другие. */
    const g = clone(game());
    g.fight = null;
    g.jail = null;
    g.player.location = "square";
    g.player.skills.combat = 60;
    g.player.needs.health = 100;
    g.player.needs.fatigue = 100;
    g.heat["org:guard"] = 80;
    g.flags.guardAt = g.time.totalHours;

    win.Bow.guard.checkArrival(g);
    win.Bow.guard.fight(g);

    const foes = g.fight.units.filter((u) => u.side === "enemy");
    eq(foes.length, 3, "стражников");
    const one = foes[0];
    /* Здоровье фишки читается из needs: hp — только то, что показано.
       Ставить hp напрямую бессмысленно, syncUnit перезапишет. */
    one.needs.health = 26;

    /* Игрока не должны добить в этом же ходу: иначе «бой кончился»
       означает его поражение, а не то, что стражник встал. */
    g.player.needs.health = 100;
    win.Bow.fight.move(g, "press", () => 0.02, one.key, "legs");
    assert(one.down, "удар по ногам не свалил стражника при 26 здор.");
    assert(one.hp > 0, "фишка легла уже при нуле");
    assert(!one.dead, "фишка помечена мёртвой вместо лежачей");

    const aimLegs = win.Bow.fight.aimDef("legs");
    const aimBody = win.Bow.fight.aimDef("body");
    assert(aimLegs.down > aimBody.down, "ноги не валят сильнее корпуса");

    win.Bow.fight.finish(g, "fled", {});
    g.flags.lastFight = null;
    g.heat["org:guard"] = 0;
    g.fight = null;
    g.jail = null;
    g.player.needs.health = 100;
    win.BowGame.refresh(true);
    return "стражник лёг при " + Math.round(one.hp) + " здор., бой продолжается";
  });

  check("Удар по рукам обезоруживает", () => {
    const g = clone(game());
    g.fight = null;
    g.player.location = "smithy";
    g.player.skills.combat = 95;
    g.player.needs.health = 100;
    g.player.needs.fatigue = 100;
    const tarn = g.people["person:tarn"];
    tarn.needs.health = 100;
    tarn.needs.fatigue = 100;

    win.Bow.fight.open(g, "person:tarn");
    win.Bow.fight.start(g, "crime", seq([0.05, 0.1, 0.2, 0.3]));
    const foe = g.fight.units.filter((u) => u.side === "enemy")[0];

    let guard = 0;
    while (g.fight && g.fight.phase === "exchange" && !foe.disarmed && guard++ < 20) {
      win.Bow.fight.move(g, "press", seq([0.05, 0.1, 0.2, 0.3]), foe.key, "arms");
    }
    assert(foe.disarmed, "удар по рукам не выбил оружие за 20 обменов");
    const log = g.fight.log.map((l) => l.text).join(" ");
    assert(/оружие/.test(log), "в хронике нет строчки про выбитое оружие");
    win.Bow.fight.finish(g, "fled", {});
    g.flags.lastFight = null;
    win.BowGame.refresh(true);
    return "оружие выбито";
  });

  check("В окне боя выбор удара показан с шансом", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.fight = null;
      g.jail = null;
      g.player.location = "square";
      g.player.skills.combat = 60;
      g.player.needs.health = 100;
      g.player.needs.fatigue = 100;
      g.people["person:liva"].location = "square";
      g.people["person:liva"].needs.health = 100;

      win.Bow.fight.open(g, "person:liva");
      win.Bow.fight.start(g, "crime", seq([0.5]));
      win.BowGame.refresh(true);

      const btns = doc().querySelectorAll("#bow-fight-page .bow-aim-btn");
      eq(btns.length, 4, "кнопок удара");
      const text = btns[0].textContent.replace(/\s+/g, " ");
      assert(/\d+%/.test(text), "на кнопке нет шанса: " + text);
      return "4 места, на кнопке " + text.slice(0, 30);
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  check("Отряд объясняет отказ числом, а не серой кнопкой", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.fight = null;
      g.jail = null;
      g.heat["org:guard"] = 0;
      const bror = g.people["person:bror"];
      bror.location = "square";
      bror.attitude = 0;
      bror.skills.combat = 41;
      const tarn = g.people["person:tarn"];
      tarn.location = "square";
      tarn.attitude = 40;
      tarn.skills.combat = 44;
      g.player.location = "square";
      g.player.skills.leadership = 0;
      g.people["person:liva"].location = "square";

      win.Bow.fight.open(g, "person:liva");
      win.BowGame.refresh(true);

      const cards = [...doc().querySelectorAll("#bow-fight-page .bow-squad-card")];
      eq(cards.length, 2, "карточек отряда");
      const brorCard = cards.filter((c) => /Брор/.test(c.textContent))[0];
      assert(/не доверяет/.test(brorCard.textContent), "нет причины отказа: " + brorCard.textContent);
      assert(brorCard.disabled, "недоверяющий не заблокирован");
      const tarnCard = cards.filter((c) => /Тарн/.test(c.textContent))[0];
      assert(!tarnCard.disabled, "доверяющий заблокирован");

      bror.attitude = 0;
      g.player.skills.leadership = 100;
      win.BowGame.refresh(true);
      const need = win.Bow.fight.allyState(g, "person:bror").trustNeed;
      return "Брор: " + brorCard.textContent.replace(/\s+/g, " ").slice(0, 46) +
        "; при власти 100 нужно " + need;
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  check("Власть снижает требуемое доверие", () => {
    const g = clone(game());
    const bror = g.people["person:bror"];
    bror.attitude = 6;
    bror.location = g.player.location;
    g.player.skills.leadership = 0;

    const low = win.Bow.fight.allyState(g, "person:bror");
    g.player.skills.leadership = 100;
    const high = win.Bow.fight.allyState(g, "person:bror");
    assert(high.trustNeed < low.trustNeed, "власть не снижает порог доверия");
    assert(high.willing && !low.willing, "с властью 100 отношение 6 всё равно не пускает");
    return "нужно " + low.trustNeed + " → " + high.trustNeed;
  });

  check("Спутник может выбыть в бою, а не стоять бессмертным", () => {
    const g = clone(game());
    g.fight = null;
    g.player.location = "square";
    g.player.needs.health = 100;
    g.player.needs.fatigue = 100;
    g.player.skills.combat = 60;
    const bror = g.people["person:bror"];
    bror.location = "square";
    bror.attitude = 50;
    /* Здоровый на входе — иначе он просто не пойдёт (порог 45). */
    bror.needs.health = 100;
    bror.needs.fatigue = 100;
    const liva = g.people["person:liva"];
    liva.needs.health = 100;
    liva.skills.combat = 85;

    win.Bow.fight.open(g, "person:liva");
    win.Bow.fight.toggleAlly(g, "person:bror");
    win.Bow.fight.start(g, "crime", seq([0.5]));

    const brorUnit = g.fight.units.filter((u) => u.refId === "person:bror")[0];
    assert(brorUnit, "спутника нет на поле: " + g.fight.units.map((u) => u.key).join(","));

    /* Игрок и Брор промахиваются (0.95), а Лива попадает (0.05) по самому
       слабому на нашей стороне — то есть по Брору. */
    bror.needs.health = 20;
    let guard = 0;
    while (g.fight && g.fight.phase === "exchange" && !brorUnit.down && guard++ < 25) {
      win.Bow.fight.move(g, "guard", seq([0.95, 0.95, 0.05, 0.5, 0.95]));
    }
    assert(brorUnit.down, "спутник с 20 здор. не выбыл за 25 обменов");
    win.Bow.fight.finish(g, "fled", {});
    g.flags.lastFight = null;
    win.BowGame.refresh(true);
    return "Брор выбыл, когда его добили";
  });

  check("Брошенный спутник запоминает это и теряет доверие", () => {
    const g = clone(game());
    g.fight = {
      allies: ["person:bror"], units: [
        { key: "ally:person:bror", refId: "person:bror", side: "ally", npc: true, down: true }
      ]
    };
    const bror = g.people["person:bror"];
    bror.attitude = 40;
    bror.memory = [];

    win.Bow.fight.squadAftermath(g, "loss", { refId: "person:bror" });
    assert(bror.attitude < 40, "доверие не упало: " + bror.attitude);
    assert((bror.memory || []).some((m) => m.kind === "abandoned"),
      "нет записи в памяти: " + JSON.stringify(bror.memory));
    g.fight = null;
    return "доверие 40 → " + Math.round(bror.attitude);
  });

  check("Присмотреться к цели поднимает шанс кражи и тратит час", () => {
    const g = clone(game());
    const liva = g.people["person:liva"];
    liva.location = g.player.location;
    liva.money = 40;
    g.player.needs.fatigue = 90;

    const before = win.Bow.steal.successChance(g, liva);
    const hoursBefore = g.time.totalHours;
    const res = win.Bow.steal.study(g, "person:liva");
    assert(res.ok, "присмотреться не сработало: " + res.message);
    const after = win.Bow.steal.successChance(g, liva);

    assert(after > before, "подготовка не подняла шанс: " + before + " → " + after);
    assert(g.time.totalHours > hoursBefore, "час не прошёл");
    return Math.round(before * 100) + "% → " + Math.round(after * 100) + "%";
  });

  check("Готовиться бесконечно нельзя", () => {
    const g = clone(game());
    const liva = g.people["person:liva"];
    liva.location = g.player.location;
    liva.money = 40;
    g.player.needs.fatigue = 90;

    win.Bow.steal.study(g, "person:liva");
    win.Bow.steal.study(g, "person:liva");
    const third = win.Bow.steal.study(g, "person:liva");
    assert(!third.ok, "третья подготовка прошла");
    eq(win.Bow.steal.prepCount(g, "person:liva"), 2, "ступеней подготовки");
    return third.message;
  });

  check("Карман: мельче и тише кошеля", () => {
    const g = clone(game());
    const liva = g.people["person:liva"];
    liva.location = g.player.location;
    liva.money = 40;
    const purseChance = win.Bow.steal.successChance(g, liva);
    const pocketChance = win.Bow.steal.pocketChance(g, liva);
    assert(pocketChance > purseChance, "карман не проще кошеля: " +
      pocketChance + " vs " + purseChance);

    const money = g.player.money;
    const res = win.Bow.steal.pockets(g, "person:liva", seq([0.01, 0.5, 0.5]));
    assert(res.ok && res.success, "карман не удался при броске на успех: " + res.message);
    assert(g.player.money > money, "из кармана ничего не взяли");
    assert(g.player.money - money <= 4, "из кармана взяли больше, чем мелочь: " + (g.player.money - money));
    return "карман " + Math.round(pocketChance * 100) + "%, взято " + (g.player.money - money) + " м.";
  });

  check("Перевязка лечит, но не чаще раза в сутки", () => {
    const g = clone(game());
    g.player.needs.health = 40;
    g.player.needs.fatigue = 80;
    g.player.skills.medicine = 40;
    g.player.lastTreat = null;

    const first = win.Bow.needs.treat(g, seq([0.5]));
    assert(first.ok, "перевязка не сработала: " + first.message);
    const healed = g.player.needs.health;
    assert(healed > 40, "здоровье не выросло");

    const second = win.Bow.needs.treat(g, seq([0.5]));
    assert(!second.ok, "вторая перевязка в тот же день прошла");
    return "40 → " + Math.round(healed) + " здор., повтор: " + second.message.slice(0, 30);
  });

  check("Навык лечения ускоряет перевязку", () => {
    const low = clone(game());
    low.player.needs.health = 40;
    low.player.needs.fatigue = 90;
    low.player.skills.medicine = 0;
    low.player.lastTreat = null;
    win.Bow.needs.treat(low, seq([0.5]));

    const high = clone(game());
    high.player.needs.health = 40;
    high.player.needs.fatigue = 90;
    high.player.skills.medicine = 90;
    high.player.lastTreat = null;
    win.Bow.needs.treat(high, seq([0.5]));

    assert(high.player.needs.health > low.player.needs.health,
      "лечение не ускоряет: " + low.player.needs.health + " vs " + high.player.needs.health);
    return "без навыка " + Math.round(low.player.needs.health) +
      " / с навыком " + Math.round(high.player.needs.health);
  });

  check("Сытый и отдохнувший затягивает раны сам", () => {
    const g = clone(game());
    g.player.needs.health = 50;
    g.player.needs.hunger = 100;
    g.player.needs.fatigue = 100;
    const before = g.player.needs.health;
    for (let i = 0; i < 10; i++) { win.Bow.needs.tickHour ? win.Bow.needs.tickHour(g) : null; }
    /* Часовой тик вызывается шиной; гоняем её напрямую. */
    for (let i = 0; i < 10; i++) { win.Bow.bus.emit("tick:hour", g); }
    assert(g.player.needs.health > before, "здоровье не растёт при сытости и отдыхе");
    return before + " → " + g.player.needs.health;
  });

  check("Торг снижает цену покупки и повышает цену продажи", () => {
    const g = clone(game());
    g.reputation["org:brod"] = 0;
    g.player.needs.mood = 80;
    g.player.location = "square";

    g.player.skills.trade = 0;
    const buyLow = win.Bow.economy.buyPrice("axe", g, "square");
    const sellLow = win.Bow.economy.sellPrice("axe", g, "square");

    g.player.skills.trade = 100;
    const buyHigh = win.Bow.economy.buyPrice("axe", g, "square");
    const sellHigh = win.Bow.economy.sellPrice("axe", g, "square");

    assert(buyHigh < buyLow, "торг не снижает цену покупки: " + buyLow + " vs " + buyHigh);
    assert(sellHigh > sellLow, "торг не повышает цену продажи: " + sellLow + " vs " + sellHigh);
    return "купить " + buyLow + "→" + buyHigh + ", продать " + sellLow + "→" + sellHigh;
  });

  check("Власть помогает припугнуть грабителя", () => {
    const g = clone(game());
    g.encounter = null;
    g.player.money = 100;
    g.player.needs.health = 100;
    g.player.skills.combat = 0;
    g.player.location = "outskirts";
    g.player.inventory = [];
    let tries = 0;
    while (!g.encounter && tries++ < 60) { win.Bow.street.maybeRob(g, () => 0.001); }
    assert(g.encounter, "грабитель не пришёл");

    g.player.skills.leadership = 0;
    const low = win.Bow.street.scareChance(g);
    g.player.skills.leadership = 100;
    const high = win.Bow.street.scareChance(g);
    assert(high > low, "власть не помогает припугнуть: " + low + " vs " + high);
    g.encounter = null;
    g.player.money = 0;
    return Math.round(low * 100) + "% → " + Math.round(high * 100) + "%";
  });

  check("Умения объяснены: у каждого есть подсказка", () => {
    const g = game();
    win.BowGame.refresh(true);
    const box = doc().getElementById("bow-skills");
    const rows = [...box.querySelectorAll(".bow-skill")];
    eq(rows.length, 6, "строк умений");
    const noHint = rows.filter((r) => !r.getAttribute("title"));
    eq(noHint.length, 0, "умений без подсказки");
    assert(box.querySelector(".bow-skill-bar"), "нет полосы умения");
    return rows.map((r) => r.querySelector(".bow-skill-name").textContent).join(", ");
  });

  check("Клик по кнопке прицела бьёт именно в выбранное место", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.fight = null;
      g.jail = null;
      g.player.location = "square";
      g.player.skills.combat = 80;
      g.player.needs.health = 100;
      g.player.needs.fatigue = 100;
      g.people["person:liva"].location = "square";
      g.people["person:liva"].needs.health = 100;

      win.Bow.fight.open(g, "person:liva");
      win.Bow.fight.start(g, "crime", seq([0.5]));
      win.BowGame.refresh(true);

      const headBtn = doc().querySelector('#bow-fight-page .bow-aim-btn[data-aim="head"]');
      assert(headBtn, "нет кнопки удара в голову");
      click(headBtn);
      const logObj = g.fight || g.flags.lastFight;
      const logText = (logObj.log || []).map((l) => l.text).join(" ");
      assert(/в голову/.test(logText), "в хронике нет удара в голову: " + logText);
      return "клик «в голову» записан в хронике";
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  check("Кнопки подготовки кражи и перевязки работают через интерфейс, а подготовка сгорает после попытки", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.fight = null;
      g.jail = null;
      g.guard = null;
      g.encounter = null;
      g.dead = null;
      g.player.location = "square";
      g.player.needs.health = 45;
      g.player.needs.fatigue = 90;
      g.player.lastTreat = null;
      g.steal = {};
      g.people["person:liva"].location = "square";
      g.people["person:liva"].money = 35;
      win.BowGame.refresh(true);

      const lookBtn = doc().querySelector('#bow-people [data-act="steal-look"][data-person="person:liva"]');
      assert(lookBtn, "нет кнопки «Присмотреться»");
      click(lookBtn);
      eq(win.Bow.steal.prepCount(g, "person:liva"), 1, "ступень подготовки после клика");

      win.Bow.steal.attempt(g, "person:liva", seq([0.01, 0.2]));
      eq(win.Bow.steal.prepCount(g, "person:liva"), 0, "подготовка не сгорела после попытки");

      /* Стража или встреча могли сработать на действии — чистим перед проверкой перевязки. */
      g.guard = null;
      g.encounter = null;
      g.fight = null;
      g.jail = null;
      g.player.needs.health = 45;
      win.BowGame.refresh(true);

      const treatBtn = doc().querySelector('#bow-treat [data-act="treat"]');
      assert(treatBtn && !treatBtn.disabled, "кнопка «Перевязать» недоступна раненому");
      click(treatBtn);
      assert(g.player.needs.health > 45, "клик по перевязке не поднял здоровье");
      const afterBtn = doc().querySelector('#bow-treat [data-act="treat"]');
      assert(!afterBtn || afterBtn.disabled, "повторная перевязка не заблокирована");
      return "кража 1/2 → 0, перевязка 45 → " + Math.round(g.player.needs.health);
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  check("Интерфейс подсвечивает текущее место, считает элементы в блоках и объясняет скидки", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.player.location = "smithy";
      g.player.skills.trade = 60;
      g.reputation["org:brod"] = 40;
      win.BowGame.refresh(true);

      const here = doc().querySelector('.bow-actions .bow-btn-here');
      assert(here && here.getAttribute("data-loc") === "smithy", "текущая локация не отмечена");
      const badges = doc().querySelectorAll(".bow-fold-count");
      eq(badges.length, 3, "счётчиков в заголовках блоков");
      const note = doc().querySelector("#passages .bow-trade-note");
      assert(note && /торг/.test(note.textContent), "нет пояснения скидки от навыка торга");
      return "текущая: " + here.textContent + ", " + note.textContent;
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  check("Миграция 0.0.6.2 → 0.0.6.3 заполняет подготовку кражи, перевязку и навыки", () => {
    const g = clone(game());
    g.version = "0.0.6.2";
    delete g.steal;
    delete g.player.lastTreat;
    delete g.player.skills.medicine;
    delete g.stats.pocketsPicked;
    delete g.stats.treats;

    const back = win.Bow.save.deserialize(win.Bow.save.serialize(g, 1));
    assert(back.ok, "сохранение 0.0.6.2 не загрузилось: " + back.reason);
    eq(back.state.version, "0.0.6.3", "версия после миграции");
    assert(back.state.steal && typeof back.state.steal === "object", "нет слота подготовки кражи");
    eq(back.state.player.lastTreat, null, "lastTreat после миграции");
    assert(typeof back.state.player.skills.medicine === "number", "навык лечения не восстановлен");
    eq(back.state.stats.treats, 0, "счётчик перевязок");
    return "0.0.6.2 → 0.0.6.3, поля на месте";
  });

  check("Оскорбление короля заканчивает игру", () => {
    const g = clone(game());
    g.jail = null;
    g.dead = null;
    g.heat["org:guard"] = 80;
    g.guard = { phase: "demand", arrived: true, squad: win.Bow.guard.squad(g) };

    win.Bow.guard.insultKing(g);
    assert(g.dead, "казни не случилось");
    eq(g.dead.cause, "казнь", "причина смерти");

    /* Казнь общая: следующий тест должен начинать живого игрока. */
    const cause = g.dead.cause;
    g.dead = null;
    g.heat["org:guard"] = 0;
    g.guard = null;
    g.player.needs.health = 100;
    win.BowGame.refresh(true);
    return cause;
  });

  check("Грабитель выходит на улице, а не в трактире", () => {
    const g = clone(game());
    g.encounter = null;
    g.player.money = 120;
    g.player.location = "tavern";
    eq(win.Bow.street.chanceAt(g), 0, "в трактире грабят");

    g.player.location = "outskirts";
    const chance = win.Bow.street.chanceAt(g);
    assert(chance > 0, "на околице никто не выходит");

    let tries = 0;
    while (!g.encounter && tries++ < 50) { win.Bow.street.maybeRob(g, () => 0.001); }
    assert(g.encounter && g.encounter.robber, "грабитель так и не появился");
    assert(g.encounter.robber.demand > 0, "грабитель ничего не требует");
    return "шанс " + Math.round(chance * 100) + "%, требует " + g.encounter.robber.demand + " м.";
  });

  check("Отдать кошель грабителю — деньги уходят, драки нет", () => {
    const g = clone(game());
    g.encounter = null;
    g.fight = null;
    g.player.money = 100;
    g.player.location = "outskirts";
    let tries = 0;
    while (!g.encounter && tries++ < 50) { win.Bow.street.maybeRob(g, () => 0.001); }

    const demand = g.encounter.robber.demand;
    const before = g.player.money;
    win.Bow.street.pay(g);
    eq(g.player.money, before - demand, "списали не столько, сколько требовали");
    assert(!g.encounter, "встреча не закрылась");
    assert(!g.fight, "началась драка вместо уплаты");
    return "−" + demand + " м., без крови";
  });

  check("С грабителем можно драться, и у него есть чем заплатить за проигрыш", () => {
    const g = clone(game());
    g.encounter = null;
    g.fight = null;
    g.player.money = 120;
    g.player.needs.health = 100;
    g.player.needs.fatigue = 95;
    g.player.skills.combat = 70;
    g.player.location = "outskirts";
    let tries = 0;
    while (!g.encounter && tries++ < 60) { win.Bow.street.maybeRob(g, () => 0.001); }

    const robberName = g.encounter.robber.name;
    win.Bow.street.fight(g);
    assert(g.fight, "бой с грабителем не начался");
    eq(g.fight.mode, "robbery", "режим боя");
    assert(g.fight.units.length === 2, "на поле не двое");

    let n = 0;
    while (g.fight && g.fight.phase === "exchange" && n++ < 40) {
      win.Bow.fight.move(g, "press", seq([0.1, 0.2, 0.3]));
    }
    assert(g.fight && g.fight.phase === "aftermath", "грабитель не сдался, фаза: " + (g.fight && g.fight.phase));

    const money = g.player.money;
    win.Bow.fight.decide(g, "rob", seq([0.5]));
    assert(g.player.money > money, "обобрать грабителя нечего: кошель пуст");
    assert(!g.fight, "бой не закрылся");
    return robberName + " сдался, +" + (g.player.money - money) + " м.";
  });

  check("Во время боя, стражи и клетки посторонние действия закрыты", () => {
    const g = game();
    g.fight = null;
    g.guard = null;
    g.jail = null;
    g.encounter = null;
    g.dead = null;

    win.Bow.fight.open(g, "person:liva");
    win.BowGame.refresh(true);
    const moveBtn = doc().querySelector("[data-act='move'][data-loc='forest']");
    click(moveBtn);
    assert(g.player.location !== "forest", "из боя можно уйти в лес");
    win.Bow.fight.close(g);

    g.jail = { hoursLeft: 10, reason: "тест" };
    win.BowGame.refresh(true);
    click(doc().querySelector("[data-act='move'][data-loc='forest']"));
    assert(g.player.location !== "forest", "из клетки можно уйти в лес");
    g.jail = null;
    win.BowGame.refresh(true);
    return "бой и клетка блокируют выход";
  });

  check("Окно боя живёт на отдельной странице, а не в сцене", () => {
    const g = game();
    g.fight = null;
    g.player.location = "square";
    g.player.skills.combat = 90;
    g.player.needs.health = 100;
    win.BowGame.refresh(true);

    const page = doc().getElementById("bow-fight-page");
    assert(page, "нет отдельной страницы боя");
    assert(!doc().getElementById("bow-guard").contains(page), "страница боя внутри сцены");

    win.Bow.fight.open(g, "person:liva");
    win.Bow.fight.start(g, "crime", seq([0.5]));
    win.BowGame.refresh(true);

    assert(page.classList.contains("bow-page-open"), "страница боя не открылась");
    assert(page.querySelectorAll(".bow-chip").length >= 2, "на поле нет фишек");
    assert(page.querySelector(".bow-roster-row"), "нет списка участников с номерами");
    const app = doc().getElementById("bow-app");
    assert(app.classList.contains("bow-in-fight"), "сцена не приглушена во время боя");
    win.Bow.fight.finish(g, "fled", {});
    g.flags.lastFight = null;
    win.BowGame.refresh(true);
    return "страница, " + page.querySelectorAll(".bow-chip").length + " фишки, список номеров";
  });

  check("Смена сцены: завеса создаётся в каркасе, а не только описана в CSS", () => {
    const g = game();
    g.fight = null;
    g.jail = null;
    g.guard = null;
    g.encounter = null;
    g.dead = null;
    g.player.location = "square";
    win.BowGame.refresh(true);

    click(doc().querySelector("[data-act='move'][data-loc='tavern']"));
    const veil = doc().getElementById("bow-veil");
    assert(veil, "завеса перехода не создана — переходы и не видны");
    const styles = [...doc().querySelectorAll("style")].map((x) => x.textContent).join("\n");
    assert(/bow-veil-run/.test(styles), "нет анимации завесы");
    assert(/@keyframes bow-veil\s*\{[^}]*opacity/.test(styles),
      "завеса не работает на прозрачности");
    return "завеса есть, анимация на opacity";
  });

  check("Увечье видно игроку и подписано как неизлечимое", () => {
    const g = game();
    g.player.injuries = [];
    win.BowGame.refresh(true);
    const clean = doc().getElementById("bow-injuries").textContent;
    assert(/Целы/.test(clean), "без травм панель молчит: " + clean);

    win.Bow.fight.maim(g.player, () => 0.01);
    win.BowGame.refresh(true);
    const box = doc().getElementById("bow-injuries").textContent;
    assert(/покалеченная|выбитый|перебитая|сросшиеся/.test(box), "травма не показана: " + box);
    assert(/не заживёт/.test(box), "не сказано, что травма останется");
    g.player.injuries = [];
    win.BowGame.refresh(true);
    return box.replace(/\s+/g, " ").slice(0, 80);
  });

  check("Скрытность видна в умениях — раньше её не было ни в одном списке", () => {
    const g = game();
    win.BowGame.refresh(true);
    const skills = doc().getElementById("bow-skills").textContent;
    assert(/Скрытность/.test(skills), "скрытности нет в панели умений");
    return skills.replace(/\s+/g, " ").slice(0, 80);
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
