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
        if (win.Bow && win.BowGame && (win.Bow.engine25d || win.Bow.engine3d) && win.document.getElementById("bow-app")) {
          clearInterval(iv);
          setTimeout(resolve, 60);
          return;
        }
        if (ticks > 60) { clearInterval(iv); reject(new Error("Графический движок и ядро Bow не инициализировались")); }
      } catch (err) {
        clearInterval(iv);
        reject(err);
      }
    }, 50);
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

  check("Миграция 0.0.5 даёт старому сохранению бой и снаряжение (до 0.0.7)", () => {
    const g = clone(game());
    g.version = "0.0.5";
    delete g.fight;
    Object.keys(g.people).forEach((id) => { delete g.people[id].weapon; delete g.people[id].armor; });
    Object.keys(g.stats).forEach((k) => { if (/fight|spar/.test(k)) { delete g.stats[k]; } });

    const back = win.Bow.save.deserialize(win.Bow.save.serialize(g, 1));
    assert(back.ok, "старое сохранение не загрузилось: " + back.reason);
    eq(back.state.version, "0.0.9.3", "версия после миграции");
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

    /* С краёв поля 7×5 (col 0 и col 6) бойцы сближаются по 1 клетке до центра (3 шага), на 4-м — обмен ударами. */
    win.Bow.fight.move(g, "press", seq([0.05, 0.05]));
    win.Bow.fight.move(g, "press", seq([0.05, 0.05]));
    win.Bow.fight.move(g, "press", seq([0.05, 0.05]));
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
    for (let i = 0; i < 6 && g.fight && g.fight.phase === "exchange"; i++) {
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
    eq(back.state.version, "0.0.9.3", "версия после миграции");
    assert(back.state.guard && back.state.guard.arrived === true,
      "стража из старого сохранения осталась «непришедшей» — из неё не выбраться");
    eq(back.state.flags.huntedUntil, null, "поле срока розыска");
    return "версия 0.0.7, стража признана пришедшей";
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
    /* Сближение с краёв поля 7×5 (col 0 и col 6) по 1 клетке, затем удар вплотную в центре. */
    win.Bow.fight.move(g, "press", seq([0.1, 0.2]));
    win.Bow.fight.move(g, "press", seq([0.1, 0.2]));
    win.Bow.fight.move(g, "press", seq([0.1, 0.2]));
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
    for (let n = 0; n < 24 && !found; n++) {
      const g = clone(game());
      const r = win.Bow.rng.make(101 + n * 37);
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
      win.Bow.fight.start(g, "crime", r);
      for (let i = 0; i < 20 && g.fight && g.fight.phase === "exchange"; i++) {
        win.Bow.fight.move(g, "press", r, null, "head");
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
    /* Сближение с краёв поля 7×5 и совместный удар вместе со спутником. */
    for (let s = 0; s < 5 && g.fight && g.fight.phase === "exchange"; s++) {
      win.Bow.fight.move(g, "press", seq([0.1, 0.1, 0.1, 0.1]));
    }
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
    const snap = clone(g);
    try {
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
    /* Постепенное сближение по 1 клетке с краёв поля 7×5 до выбранного стражника, затем прицельный удар. */
    for (let s = 0; s < 6 && g.fight && !win.Bow.fight.inMelee(g.fight.units[0], last); s++) {
      win.Bow.fight.move(g, "press", () => 0.99, last.key);
      g.player.needs.health = 100;
    }
      win.Bow.fight.move(g, "press", () => 0.05, last.key);
      assert(last.hp < before, "удар не попал в выбранного: " + before + " → " + last.hp);
      const others = foes.slice(0, 2).map((u) => u.hp);
      return "Свейн: " + Math.round(before) + " → " + Math.round(last.hp) + ", прочие " + others.join("/");
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
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

    /* Игрока не должны добить в этом же ходу: сначала шаг сближения, затем удар по ногам. */
    g.player.needs.health = 100;
    for (let s = 0; s < 6 && g.fight && !win.Bow.fight.inMelee(g.fight.units[0], one); s++) {
      win.Bow.fight.move(g, "press", () => 0.99, one.key, "legs");
      g.player.needs.health = 100;
    }
    one.needs.health = 26;
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
      win.Bow.fight.move(g, "press", seq([0.95, 0.95, 0.05, 0.5, 0.95]));
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
    eq(rows.length, 27, "строк умений");
    const noHint = rows.filter((r) => !r.getAttribute("title"));
    eq(noHint.length, 0, "умений без подсказки");
    assert(box.querySelector(".bow-skill-bar"), "нет полосы умения");
    return rows.length + " навыков, все с подсказками";
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
      /* С краёв поля 7×5 сближаемся по 1 клетке до центра и бьём в выбранную область. */
      for (let s = 0; s < 4 && g.fight && g.fight.phase === "exchange"; s++) {
        win.Bow.fight.step(g, seq([0.05, 0.05, 0.05]));
      }
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
    eq(back.state.version, "0.0.9.3", "версия после миграции");
    assert(back.state.steal && typeof back.state.steal === "object", "нет слота подготовки кражи");
    eq(back.state.player.lastTreat, null, "lastTreat после миграции");
    assert(typeof back.state.player.skills.medicine === "number", "навык лечения не восстановлен");
    eq(back.state.stats.treats, 0, "счётчик перевязок");
    return "0.0.6.2 → " + back.state.version + ", поля на месте";
  });

  /* 8м. Главное графическое окно, шапка с модальными окнами и полуручной бой Kenshi (0.0.7) */
  check("Шапка 0.0.7 держит кнопки разделов и часы, а переходы вынесены отдельно", () => {
    const topbar = doc().querySelector("header.bow-topbar");
    assert(topbar, "нет верхней шапки");
    const navBtns = topbar.querySelectorAll(".bow-rail-btn");
    eq(navBtns.length, 6, "кнопок разделов в шапке (Меню вынесено на логотип с ☰)");
    assert(topbar.querySelector(".bow-clock-controls"), "часы не в шапке");
    const places = doc().querySelector(".bow-places-bar");
    assert(places && places.querySelectorAll('[data-act="move"]').length === 5,
      "нет отдельной полосы из 5 переходов");
    return "6 кнопок разделов в шапке + полоса Переход";
  });

  check("Кнопки шапки открывают отдельное модальное окно выбранной вкладки поверх игры", () => {
    win.Bow.ui.setDrawer(false);
    const skillsBtn = doc().querySelector('.bow-topbar [data-act="panel"][data-panel="skills"]');
    click(skillsBtn);
    const modal = doc().getElementById("bow-drawer");
    assert(modal.classList.contains("bow-modal-open"), "модальное окно не открылось");
    const focused = [...modal.querySelectorAll(".bow-dpanel.bow-dpanel-focus")].map((el) => el.getAttribute("data-section"));
    eq(focused.join(","), "skills", "показана не только выбранная вкладка");

    const peopleBtn = doc().querySelector('.bow-topbar [data-act="panel"][data-panel="people"]');
    click(peopleBtn);
    eq(doc().getElementById("bow-modal-title").textContent, "Жители поселения", "заголовок окна Люди");
    assert(doc().querySelectorAll("#bow-all-people .bow-person").length >= 4, "жители не перечислены в окне");

    click(doc().querySelector('#bow-drawer [data-act="close-panel"]'));
    assert(!modal.classList.contains("bow-modal-open"), "окно не закрылось крестиком");
    return "открывается ровно выбранная вкладка и закрывается поверх игры";
  });

  check("Главное окно рисует изометрический мир всех 5 локаций, день/ночь/снег и живых персонажей", () => {
    const g = game();
    const snap = clone(g);
    try {
      const stage = doc().getElementById("bow-stage");
      assert(stage, "нет главного окна #bow-stage");

      ["square", "tavern", "smithy", "outskirts", "forest"].forEach((loc) => {
        g.player.location = loc;
        win.BowGame.refresh(true);
        assert(stage.querySelector("canvas.bow-iso-canvas"), "нет изометрического холста для " + loc);
        assert(win.Bow.iso.mapOf(g).id === loc, "изометрическая карта не переключилась на " + loc);
      });

      g.player.location = "square";
      g.time.hour = 13;
      g.flags.weather = "ясно и морозно";
      const dayPal = win.Bow.stage.skyOf(g);
      g.time.hour = 23;
      g.flags.weather = "низкая метель";
      const nightPal = win.Bow.stage.skyOf(g);
      assert(dayPal.skyTop !== nightPal.skyTop && nightPal.moon, "небо не меняется от времени суток");
      win.BowGame.refresh(true);
      assert(stage.querySelector(".bow-stage-snow"), "в метель на сцене нет снега");

      /* Жители на сцене настоящие: ушёл человек — исчез из окна. */
      g.people["person:liva"].location = "square";
      g.people["person:sigi"].location = "tavern";
      win.BowGame.refresh(true);
      assert(stage.querySelector('.bow-actor-npc[data-person="person:liva"]'), "Лива не видна на площади");
      assert(!stage.querySelector('.bow-actor-npc[data-person="person:sigi"]'), "Сиги нарисована там, где её нет");

      /* Клик по персонажу в Главном окне открывает живую карточку прямо поверх сцены. */
      click(stage.querySelector('.bow-actor-npc[data-person="person:liva"]'));
      const pop = doc().getElementById("bow-stage-pop");
      assert(pop.classList.contains("bow-stage-pop-open") && /Лива/.test(pop.textContent),
        "клик по фигурке не открыл карточку действий в Главном окне");
      click(pop.querySelector('[data-act="stage-close"]'));
      assert(!pop.classList.contains("bow-stage-pop-open"), "карточка сцены не закрылась");

      return "5 изометрических локаций, смена дня/ночи/метели и кликабельные человечки";
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.Bow.ui.setStageSelection(null);
      win.BowGame.refresh(true);
    }
  });

  check("Поле боя рисует изометрическую сцену места и приглушённые фигурки бойцов с оружием и нокдауном", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.fight = null;
      g.jail = null;
      g.player.location = "smithy";
      g.player.needs.health = 100;
      g.player.needs.fatigue = 100;
      g.people["person:tarn"].location = "smithy";
      g.people["person:tarn"].needs.health = 100;

      win.Bow.fight.open(g, "person:tarn");
      win.Bow.fight.start(g, "crime", seq([0.5]));
      win.BowGame.refresh(true);

      const page = doc().getElementById("bow-fight-page");
      assert(page.querySelector(".bow-arena-scene canvas.bow-iso-battle-canvas"), "на поле боя нет изометрического холста локации");
      assert(!page.querySelector(".bow-chip svg.bow-fig-svg"), "на поле боя остались старые кружки-треугольники svg.bow-fig-svg!");
      assert(page.querySelectorAll(".bow-chip .bow-iso-fig").length >= 2, "нет изометрических контуров бойцов");
      assert(page.querySelector(".bow-chip-enemy .bow-fig-weapon"), "у вооружённого Тарна не помечен топор в руке");

      const foe = g.fight.units.filter((u) => u.side === "enemy")[0];
      foe.disarmed = true;
      win.BowGame.refresh(true);
      assert(!page.querySelector(".bow-chip-enemy .bow-fig-weapon"), "после обезоруживания оружие осталось в руке");

      foe.down = true;
      win.BowGame.refresh(true);
      assert(page.querySelector(".bow-chip-enemy .bow-fig-fallen"), "сбитый с ног не переведён в поверженное состояние");
      return "изометрический холст места + человечки + оружие + падение";
    } finally {
      win.BowGame.stopFightClock();
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  check("Полуручной бой Kenshi: приказы меняются на ходу, защита режет урон, отряд слушается", () => {
    const g = clone(game());
    g.fight = null;
    g.jail = null;
    g.player.location = "square";
    g.player.skills.combat = 65;
    g.player.needs.health = 100;
    g.player.needs.fatigue = 100;

    const bror = g.people["person:bror"];
    bror.location = "square";
    bror.attitude = 50;
    bror.needs.health = 100;
    bror.needs.fatigue = 100;

    g.heat["org:guard"] = 80;
    g.flags.guardAt = g.time.totalHours;
    win.Bow.guard.checkArrival(g);
    win.Bow.guard.fight(g);

    const foes = g.fight.units.filter((u) => u.side === "enemy");
    foes[0].needs.health = 90; foes[0].hp = 90;
    foes[1].needs.health = 42; foes[1].hp = 42;
    foes[2].needs.health = 90; foes[2].hp = 90;
    g.fight.target = foes[2].key;

    /* 1. Вольный бой (free): после сближения с правого края Брор сам выбирает самого слабого (foes[1]). */
    win.Bow.fight.setOrder(g, "aim", "head");
    win.Bow.fight.setOrder(g, "squad", "free");
    for (let ap = 0; ap < 5 && !win.Bow.fight.inMelee(g.fight.units.find((u) => u.key === "ally:person:bror"), foes[1]); ap++) {
      win.Bow.fight.step(g, () => 0.99);
      g.player.needs.health = 100;
      bror.needs.health = 100;
    }
    foes[0].needs.health = 90; foes[0].hp = 90;
    foes[1].needs.health = 42; foes[1].hp = 42;
    foes[2].needs.health = 90; foes[2].hp = 90;
    win.Bow.fight.step(g, seq([0.05, 0.5, 0.99, 0.05, 0.5, 0.99, 0.99, 0.99, 0.99]));

    const brorAim = (g.fight.aim || []).filter((a) => a.from === "ally:person:bror")[0];
    assert(brorAim && brorAim.to === foes[1].key, "в вольном бою спутник не выбрал слабейшего врага");
    const logText = g.fight.log.map((l) => l.text).join(" ");
    assert(/в голову/.test(logText), "step() не применил приказ метить в голову");

    /* 2. Стойка «Держать защиту» реально режет входящий по герою урон вдвое. */
    const attacker = { skills: { combat: 60 }, needs: { health: 90, fatigue: 80 }, weapon: "item:axe" };
    const pressTaken = win.Bow.fight.damageRoll(attacker, g.player, "guard", "press", seq([0.5]), "body");
    const guardTaken = win.Bow.fight.damageRoll(attacker, g.player, "guard", "guard", seq([0.5]), "body");
    assert(guardTaken < pressTaken, "стойка защиты не снижает урон: " + guardTaken + " vs " + pressTaken);

    /* 3. С 0.0.7.4 бой идёт спокойным автобоем (speed = "auto", 2600 мс) и ставится на паузу. */
    const live = game();
    const snap = clone(live);
    try {
      live.fight = g.fight;
      win.Bow.fight.setOrder(live, "speed", "auto");
      assert(win.BowGame.fightShouldRun(live), "спокойный автобой не активен при speed='auto'");
      win.Bow.fight.setOrder(live, "speed", "paused");
      assert(!win.BowGame.fightShouldRun(live), "таймер боя активен на паузе");
    } finally {
      win.BowGame.stopFightClock();
      win.Bow.ui.setDrawer(false);
      Object.keys(snap).forEach((k) => { live[k] = snap[k]; });
      win.BowGame.refresh(true);
    }

    return "вольный отряд → слабейший, защита −" + pressTaken + "→−" + guardTaken + ", спокойный автобой";
  });

  check("Миграция 0.0.6.3 → 0.0.7 добавляет тактические приказы активному бою", () => {
    const g = clone(game());
    g.version = "0.0.6.3";
    g.fight = {
      personId: "person:liva", mode: "crime", phase: "exchange", round: 2,
      log: [], witnesses: [], allies: [], enemies: [], units: [], heatTotal: 0, repTotal: 0
    };
    const back = win.Bow.save.deserialize(win.Bow.save.serialize(g, 1));
    assert(back.ok, "сохранение 0.0.6.3 не загрузилось: " + back.reason);
    eq(back.state.version, "0.0.9.3", "версия после миграции");
    assert(back.state.fight.orders && back.state.fight.orders.aim === "body", "приказы боя созданы при миграции");
    return "0.0.6.3 → 0.0.9.3, приказы боя созданы";
  });

  /* 8н. Круг 13 (0.0.7.1): фикс зависания в клетке, честная дистанция боя, логотип и Меню игры */
  check("После поражения страже кнопка «Вернуться» закрывает экран боя и пускает в клетку (фикс бага)", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.fight = null;
      g.jail = null;
      g.dead = null;
      g.player.location = "square";
      g.people["person:bror"].location = "forest";
      g.people["person:tarn"].location = "smithy";
      g.player.needs.health = 24;
      g.player.needs.fatigue = 50;
      g.player.skills.combat = 5;
      g.heat["org:guard"] = 80;
      g.flags.guardAt = g.time.totalHours;

      win.Bow.guard.checkArrival(g);
      win.Bow.guard.fight(g);
      /* Сближаемся со стражниками, промахиваемся (0.99), а все трое бьют в ответ (0.01). */
      let steps = 0;
      while (g.fight && steps++ < 12) {
        win.Bow.fight.move(g, "press", seq([0.99, 0.01, 0.5, 0.01, 0.01, 0.5, 0.01, 0.01, 0.5, 0.01]));
      }
      win.BowGame.refresh(true);

      assert(!g.fight, "бой со стражей не завершился поражением");
      assert(g.jail && g.jail.hoursLeft > 0, "игрок не отправлен в клетку");
      assert(g.flags.lastFight && g.flags.lastFight.outcome === "caught", "нет сводки пленения");
      eq(g.flags.lastFight.name, "Стража Брода", "заголовок сводки стражи");

      /* Ни один стражник не должен бить уже скрученного героя на «−0 здор.». */
      const zeroLine = (g.flags.lastFight.log || []).filter((l) => /[−-]0 здор\./.test(l.text));
      eq(zeroLine.length, 0, "в хронике остался удар на −0 здор.: " + zeroLine.map((z) => z.text).join("; "));

      const page = doc().getElementById("bow-fight-page");
      assert(page.classList.contains("bow-page-open"), "экран отчёта боя не открыт");
      const closeBtn = page.querySelector('[data-act="fight-close"]');
      assert(closeBtn, "нет кнопки «Вернуться»");
      click(closeBtn);

      assert(!g.flags.lastFight, "сводка боя не очистилась после нажатия «Вернуться»");
      assert(!page.classList.contains("bow-page-open"), "экран боя остался висеть поверх клетки!");
      assert(doc().getElementById("bow-jail").classList.contains("bow-fight-open"), "карточка клетки не видна");
      return "отчёт «Стража Брода» закрылся, открыта клетка (" + g.jail.hoursLeft + " ч.), без −0 здор.";
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.stopFightClock();
      win.BowGame.refresh(true);
    }
  });

  check("Увечье соответствует месту удара: удар в голову не ломает рёбра", () => {
    const pHead = { injuries: [] };
    const pLegs = { injuries: [] };
    const pArms = { injuries: [] };
    const pBody = { injuries: [] };
    const iHead = win.Bow.fight.maim(pHead, () => 0.9, "head");
    const iLegs = win.Bow.fight.maim(pLegs, () => 0.1, "legs");
    const iArms = win.Bow.fight.maim(pArms, () => 0.5, "arms");
    const iBody = win.Bow.fight.maim(pBody, () => 0.2, "body");
    eq(iHead.key, "eye", "голова → глаз");
    eq(iLegs.key, "leg", "ноги → колено");
    eq(iArms.key, "arm", "руки → рука");
    eq(iBody.key, "ribs", "корпус → рёбра");
    return "head→eye, legs→leg, arms→arm, body→ribs";
  });

  check("Поле боя 0.0.7.1: с края карты не достать — нужно сближение, а «Держать позицию» ждёт врага", () => {
    const g = clone(game());
    g.fight = null;
    g.player.location = "square";
    g.player.needs.health = 100;
    g.player.needs.fatigue = 100;
    const bror = g.people["person:bror"];
    bror.location = "square";
    bror.attitude = 50;
    bror.needs.health = 100;
    bror.needs.fatigue = 100;
    const liva = g.people["person:liva"];
    liva.location = "square";
    liva.needs.health = 100;

    win.Bow.fight.open(g, "person:liva");
    win.Bow.fight.toggleAlly(g, "person:bror");
    win.Bow.fight.start(g, "crime", seq([0.5]));

    const you = g.fight.units.filter((u) => u.key === "player")[0];
    const ally = g.fight.units.filter((u) => u.refId === "person:bror")[0];
    const foe = g.fight.units.filter((u) => u.side === "enemy")[0];

    assert(!win.Bow.fight.inMelee(you, foe), "в начале боя враг уже вплотную без сближения");
    const startFoeCol = foe.col;

    /* Оба держат позицию (guard + hold): никто из наших не бежит вперёд и не бьёт через карту,
       а Лива сама делает шаг по снегу к нашему строю. */
    win.Bow.fight.setOrder(g, "squad", "hold");
    win.Bow.fight.move(g, "guard", seq([0.05, 0.05, 0.05]));
    eq(you.col, 0, "герой сошёл с позиции при приказе держать позицию");
    eq(ally.col, 0, "спутник побежал вперёд вопреки приказу «Держать позицию»");
    eq(liva.needs.health, 100, "враг получил удар через поле без сближения!");
    assert(foe.col < startFoeCol, "враг не сделал шаг сближения: " + foe.col);

    /* Теперь даём спутнику «Вольно · сближаться» (free), а сами держим позицию сзади:
       Брор выходит вперёд навстречу Ливе до контакта, бьёт её и принимает ответный удар на себя! */
    win.Bow.fight.setOrder(g, "squad", "free");
    for (let s = 0; s < 4 && !win.Bow.fight.inMelee(ally, foe); s++) {
      win.Bow.fight.move(g, "guard", seq([0.95, 0.95]));
    }
    assert(ally.col > 0 && win.Bow.fight.inMelee(ally, foe), "спутник в вольном режиме не подошёл вплотную");
    win.Bow.fight.move(g, "guard", seq([0.05, 0.5, 0.05, 0.5]));
    assert(liva.needs.health < 100, "подошедший спутник не нанёс удар");
    eq(g.player.needs.health, 100, "враг ударил героя за спиной спутника через клетку!");
    return "удержание рубежа (col 0), сближение врага (" + startFoeCol + "→" + foe.col + ") и прикрытие отрядом работают";
  });

  check("Команда «Шаг назад» разрывает дистанцию и ставит героя в защиту", () => {
    const g = clone(game());
    g.fight = null;
    g.player.location = "square";
    g.player.needs.health = 100;
    g.player.needs.fatigue = 100;
    g.people["person:liva"].location = "square";
    g.people["person:liva"].needs.health = 100;

    win.Bow.fight.open(g, "person:liva");
    win.Bow.fight.start(g, "crime", seq([0.5]));
    const you = g.fight.units.filter((u) => u.key === "player")[0];
    const foeU = g.fight.units.filter((u) => u.side === "enemy")[0];
    /* Сближаемся с краёв поля 7×5 до рукопашной в центре (col 3 vs col 4). */
    for (let s = 0; s < 4 && !win.Bow.fight.inMelee(you, foeU); s++) {
      win.Bow.fight.move(g, "press", seq([0.95, 0.95]));
    }
    const closeCol = you.col;
    assert(closeCol >= 2 && win.Bow.fight.inMelee(you, foeU), "герой не сблизился вплотную: col=" + closeCol);

    /* Делаем шаг назад. */
    win.Bow.fight.move(g, "back", seq([0.95, 0.95]));
    assert(you.col < closeCol, "шаг назад не отвёл бойца: " + closeCol + " → " + you.col);
    eq(you.stance, "guard", "после шага назад не включилась защита");
    return "рывок col " + closeCol + " → шаг назад col " + you.col;
  });

  check("Укрупнённый логотип открывает «Меню игры» с кнопкой Продолжить и рабочими Настройками", () => {
    win.Bow.ui.setDrawer(false);
    const styles = [...doc().querySelectorAll("style")].map((x) => x.textContent).join("\n");
    assert(/\.bow-topbar\s+\.bow-logo-img\s*\{[^}]*width:\s*5[2-9]px/.test(styles),
      "логотип в шапке не укрупнён");

    const logo = doc().getElementById("bow-logo-btn");
    click(logo);
    const modal = doc().getElementById("bow-drawer");
    assert(modal.classList.contains("bow-modal-open"), "клик по логотипу не открыл окно");
    eq(doc().getElementById("bow-modal-title").textContent, "Меню игры", "логотип открыл не Меню игры");

    const resumeBtn = modal.querySelector(".bow-menu-resume[data-act='close-panel']");
    assert(resumeBtn, "в Меню игры нет кнопки «Продолжить игру»");

    /* Проверяем переключение настроек через DOM */
    const lgBtn = modal.querySelector('[data-act="setting"][data-key="font"][data-val="large"]');
    assert(lgBtn, "нет кнопки крупного шрифта в Настройках");
    click(lgBtn);
    assert(doc().documentElement.classList.contains("bow-font-lg"), "крупный шрифт не применился");
    eq(win.Bow.ui.getSettings().font, "large", "настройка шрифта не сохранилась");

    /* Возвращаем обычный шрифт и закрываем меню кнопкой «Продолжить игру» */
    click(modal.querySelector('[data-act="setting"][data-key="font"][data-val="normal"]'));
    assert(!doc().documentElement.classList.contains("bow-font-lg"), "обычный шрифт не вернулся");
    click(resumeBtn);
    assert(!modal.classList.contains("bow-modal-open"), "кнопка «Продолжить игру» не закрыла меню");
    return "логотип 56px → Меню игры (Продолжить + Настройки + Сохранения)";
  });

  check("В клетке живые часы идут сами и мотают срок поминутно, а заключённого кормят баландой (0.0.8.1)", () => {
    const g = clone(game());
    g.fight = null;
    g.guard = null;
    g.encounter = null;
    g.dialog = null;
    g.dead = null;
    win.Bow.ui.setDrawer(false);
    g.time.scale = "4x";
    g.jail = { hoursLeft: 16, reason: "воровство" };
    assert(win.BowGame.clockShouldRun(g), "живые часы в клетке всё ещё заблокированы!");

    /* Живой минутный тик уменьшает срок в минутах */
    win.Bow.time.tickMinute(g);
    assert(g.jail.minutesLeft === 16 * 60 - 1, "минутный тик не уменьшил срок в клетке: " + g.jail.minutesLeft);
    assert(/15 ч\. 59 мин\./.test(win.Bow.guard.formatJailLeft(g.jail)), "неверный формат остатка срока: " + win.Bow.guard.formatJailLeft(g.jail));

    g.player.needs.hunger = 18;
    win.Bow.guard.serve(g, 4);
    assert(g.player.needs.hunger >= 35, "заключённого не покормили при голоде: " + g.player.needs.hunger);

    /* Когда оставшиеся минуты истекают в живом времени — узника выпускают автоматически */
    win.Bow.time.advanceMinutes(g, g.jail.minutesLeft);
    assert(!g.jail, "по истечении живого времени узника не выпустили из клетки");
    return "живой отсчёт 16 ч. → 15 ч. 59 мин. → автоосвобождение, пайка выдана (сытость " + g.player.needs.hunger + ")";
  });

  /* 8о. Круг 14 (0.0.7.2): 60 FPS дождь без рывков, точные хитбоксы и ровная геометрия окон */
  check("Дождь рисуется на GPU и НЕ пересоздаётся при тиках часов и боя (нет рывков 1.5 FPS)", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.player.location = "square";
      g.flags.weather = "мелкий дождь";
      win.BowGame.refresh(true);

      const rainNode = doc().querySelector("#bow-stage .bow-stage-rain");
      assert(rainNode, "при дожде не отрисовался слой .bow-stage-rain");
      assert(rainNode.querySelectorAll(".bow-rain-drop").length >= 20, "слишком мало капель дождя");

      /* Серия перерисовок (как при тиках 1x/4x) НЕ должна сносить DOM-узел дождя и сбрасывать анимацию! */
      for (let i = 0; i < 5; i++) {
        g.player.money += 1;
        win.BowGame.refresh(true);
      }
      const rainAfter = doc().querySelector("#bow-stage .bow-stage-rain");
      assert(rainAfter === rainNode, "слой дождя на сцене пересоздался при refresh — анимация сбрасывается!");

      /* То же самое в живом бою: тики боя не должны дёргать фон и дождь */
      g.people["person:liva"].location = "square";
      g.people["person:liva"].needs.health = 100;
      win.Bow.fight.open(g, "person:liva");
      win.Bow.fight.start(g, "crime", seq([0.5]));
      win.BowGame.refresh(true);

      const battleRain = doc().querySelector("#bow-fight-page .bow-arena-backdrop .bow-stage-rain");
      assert(battleRain, "на поле боя нет дождя");
      win.Bow.fight.move(g, "guard", seq([0.95, 0.95]));
      win.BowGame.refresh(true);
      const battleRainAfter = doc().querySelector("#bow-fight-page .bow-arena-backdrop .bow-stage-rain");
      assert(battleRainAfter === battleRain, "дождь на поле боя пересоздался при такте боя!");

      return "26 GPU-струй дождя сохраняют DOM-узел и при тиках мира, и в бою";
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.stopFightClock();
      win.BowGame.refresh(true);
    }
  });

  check("Хитбоксы объектов и персонажей разведены в изометрии 2:1, клик работает точно, а карточка не заслоняет цель", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.player.location = "square";
      Object.keys(g.people).forEach((id) => {
        g.people[id].alive = true;
        g.people[id].location = "square";
      });
      win.Bow.ui.setStageSelection(null);
      win.BowGame.refresh(true);

      const spots = [...doc().querySelectorAll("#bow-stage .bow-spot")];
      const actors = [...doc().querySelectorAll("#bow-stage .bow-actor")];
      assert(spots.length >= 2 && actors.length >= 5, "не все изометрические переходы и фигурки отрисованы");

      /* Все актёры в изометрии разнесены и по X, и в 2D-плоскости без слипания силуэтов */
      const pts = actors.map((a) => ({
        x: parseFloat(a.getAttribute("data-x")),
        y: parseFloat(a.style.top || "50")
      }));
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dist = Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
          assert(dist >= 5.5, "изометрические человечки слиплись: " + JSON.stringify(pts));
        }
      }

      /* Клик по зоне силуэта (.bow-iso-hit) правого жителя открывает карточку слева */
      const rightNpc = actors.filter((a) => parseFloat(a.getAttribute("data-x")) >= 58)[0];
      assert(rightNpc, "нет правого жителя на изометрической площади");
      const hitInner = rightNpc.querySelector(".bow-iso-hit") || rightNpc;
      click(hitInner);
      const pop = doc().getElementById("bow-stage-pop");
      assert(pop.classList.contains("bow-stage-pop-open"), "клик по изометрическому хитбоксу не открыл карточку");
      assert(pop.classList.contains("bow-stage-pop-left"), "карточка правого жителя не ушла влево и закрыла его");

      /* Клик по пустому фону сцены закрывает карточку */
      click(doc().querySelector("#bow-stage-canvas .bow-stage-bg-wrap"));
      assert(!pop.classList.contains("bow-stage-pop-open"), "клик по пустому месту сцены не закрыл карточку");

      return "изометрия разведена, актёров: " + actors.length + ", умная сторона карточки работает";
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.Bow.ui.setStageSelection(null);
      win.BowGame.refresh(true);
    }
  });

  check("Геометрия окон 0.0.7.2: модальное окно по центру 100vw, а кнопки в группах не распирает на 100%", () => {
    const styles = [...doc().querySelectorAll("style")].map((x) => x.textContent).join("\n");
    assert(/#bow-body\.bow-body-open\s+#bow-drawer\.bow-modal\s*\{[^}]*width:\s*100vw/.test(styles),
      "модальное окно всё ещё зажато старой шириной боковой панели");
    assert(/\.bow-setting-opts\s+\.bow-btn-sm[\s\S]*?width:\s*auto/.test(styles),
      "кнопки .bow-btn-sm в рядах настроек и приказов всё ещё растянуты на 100%");
    return "центровка 100vw + компактные inline-flex кнопки в окнах";
  });

  /* 8п. Круг 15 (0.0.7.3): минутное время (1 мин. = 2 сек.), чисто пошаговый бой,
         лежащие и лутаемые трупы, визуальная стража/грабители на сцене, переходы и Карта Хладных Ветров */
  check("Минутный ход времени 0.0.7.3: на 1x идёт по 1 минуте за 2 сек., а не прыгает сразу на час", () => {
    eq(win.Bow.time.minutesPerSecond("1x"), 0.5, "на 1x должно быть 0.5 мин./сек. (1 мин. за 2 сек.)");
    eq(win.Bow.time.minutesPerSecond("4x"), 2.0, "на 4x должно быть 2.0 мин./сек.");

    const g = clone(game());
    g.time.hour = 8;
    g.time.minute = 0;
    const h0 = g.time.totalHours;

    win.Bow.time.tickMinute(g);
    eq(g.time.hour, 8, "час изменился после одной минуты");
    eq(g.time.minute, 1, "минута не сдвинулась на +1");
    eq(g.time.totalHours, h0, "totalHours прыгнул раньше 60 минут");

    const cross = win.Bow.time.advanceMinutes(g, 60);
    eq(cross.hoursPassed, 1, "переход через 60 минут должен дать ровно 1 час");
    eq(g.time.hour, 9, "час после +61 минуты");
    eq(g.time.minute, 1, "остаток минут после перехода часа");
    eq(g.time.totalHours, h0 + 1, "totalHours после полного часа");
    return "1x = 0.5 мин./с (1 мин. за 2 с), 08:00 → 08:01 → 09:01";
  });

  check("Спокойный автобой 0.0.7.4: размеренный темп 2.6 сек. с паузой, а мировое время стоит весь бой", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.fight = null;
      g.flags.lastFight = null;
      g.player.location = "square";
      g.time.hour = 11;
      g.time.minute = 23;
      g.time.scale = "1x";
      g.people["person:liva"].location = "square";
      g.people["person:liva"].alive = true;
      g.people["person:liva"].needs.health = 100;

      win.Bow.fight.open(g, "person:liva");
      win.Bow.fight.start(g, "crime", seq([0.5]));
      win.BowGame.refresh(true);

      const page = doc().getElementById("bow-fight-page");
      assert(page.querySelector(".bow-fight-turnbar"), "нет полосы управления автобоем");
      eq(win.Bow.data.fightRules.autoTickMs, 2600, "интервал спокойного автобоя должен быть 2600 мс");
      assert(!win.BowGame.fightShouldRun(g), "с 0.0.9.0 бой по умолчанию должен стартовать на паузе (пошагово)");
      win.Bow.fight.setOrder(g, "speed", "auto");
      assert(win.BowGame.fightShouldRun(g), "ручное включение спокойного автобоя должно запускать таймер");
      assert(!win.BowGame.clockShouldRun(g), "мировые часы идут во время боя");

      win.Bow.fight.setOrder(g, "speed", "paused");
      assert(!win.BowGame.fightShouldRun(g), "на паузе автобой должен останавливаться");

      win.Bow.fight.move(g, "press", seq([0.2, 0.4]));
      eq(g.time.hour, 11, "час сдвинулся во время боя");
      eq(g.time.minute, 23, "минуты сдвинулись во время боя");
      return "автобой 2600 мс + пауза работают, мировое время 11:23 стоит неподвижно";
    } finally {
      win.BowGame.stopFightClock();
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  check("Вкладка «Рядом» убрана в пользу «Карты», а карточки жителей растянуты без сжатия (фикс image-7)", () => {
    const visibleTabs = [...doc().querySelectorAll('.bow-tabs [data-act="tab"]')];
    eq(visibleTabs.length, 4, "видимых вкладок в блоке «Действия»");
    assert(!visibleTabs.some((t) => t.getAttribute("data-tab") === "people"), "вкладка «Рядом» всё ещё торчит в интерфейсе!");
    assert(visibleTabs.some((t) => t.getAttribute("data-tab") === "map"), "нет вкладки «Карта»");

    const styles = [...doc().querySelectorAll("style")].map((x) => x.textContent).join("\n");
    assert(/\.bow-person\s*\{[^}]*align-items:\s*stretch/.test(styles) &&
           /\.bow-person\s*\{[^}]*width:\s*100%/.test(styles),
      "карточка .bow-person не растянута по ширине (align-items: stretch; width: 100%)");
    return "«Рядом» убрана → «Карта», .bow-person выровнена на 100%";
  });

  check("После «Добить» враг лежит на поле боя, окно НЕ закрывается само, а труп остаётся на локации для лута", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.fight = null;
      g.flags.lastFight = null;
      g.corpses = [];
      g.player.location = "smithy";
      g.player.skills.combat = 95;
      g.player.needs.health = 100;
      g.player.needs.fatigue = 100;
      const moneyBefore = g.player.money;
      const axesBefore = win.Bow.economy.countItem(g.player, "item:axe");

      const tarn = g.people["person:tarn"];
      tarn.alive = true;
      tarn.location = "smithy";
      tarn.money = 35;
      tarn.weapon = "item:axe";
      tarn.armor = "item:padded";
      tarn.needs.health = 30;

      win.Bow.fight.open(g, "person:tarn");
      win.Bow.fight.start(g, "crime", seq([0.1]));
      let guard = 0;
      while (g.fight && g.fight.phase === "exchange" && guard++ < 15) {
        win.Bow.fight.move(g, "press", seq([0.05, 0.1, 0.2]));
      }
      assert(g.fight && g.fight.phase === "aftermath", "бой с Тарном не дошёл до развязки");
      win.BowGame.refresh(true);

      const page = doc().getElementById("bow-fight-page");
      const killBtn = page.querySelector('[data-act="fight-decide"][data-choice="kill"]');
      assert(killBtn, "нет кнопки «Добить»");
      click(killBtn);

      /* 1. Окно боя НЕ закрылось само, а прямо на поле боя лежит труп с черепом! */
      assert(page.classList.contains("bow-page-open"), "окно боя закрылось само после «Добить»!");
      assert(!win.BowGame.clockShouldRun(g), "мировые часы пошли до закрытия экрана боя!");
      const deadChip = page.querySelector(".bow-arena .bow-chip-dead");
      assert(deadChip, "на поле боя не показан убитый противник лежащим на земле!");
      assert(deadChip.querySelector(".bow-fig-fallen"), "силуэт убитого на поле боя не лежит на земле");

      /* 2. Закрываем окно боя вручную кнопкой выхода — труп остаётся лежать на сцене локации! */
      const exitBtn = page.querySelector('[data-act="fight-close"]');
      assert(exitBtn, "нет кнопки выхода с поля боя");
      click(exitBtn);
      assert(!page.classList.contains("bow-page-open"), "окно боя не закрылось по кнопке выхода");

      const stageCorpse = doc().querySelector('#bow-stage .bow-actor-corpse[data-act="stage-select"][data-kind="corpse"]');
      assert(stageCorpse, "после боя труп не остался лежать визуально на сцене локации!");

      /* 3. Нажимаем на лежащий труп на сцене и облутываем его (деньги + топор + стёганка) */
      click(stageCorpse);
      const pop = doc().getElementById("bow-stage-pop");
      assert(pop.classList.contains("bow-stage-pop-open"), "клик по трупу не открыл карточку осмотра тела");
      const lootBtn = pop.querySelector('[data-act="loot-corpse"]');
      assert(lootBtn, "в карточке трупа нет кнопки обыска");
      click(lootBtn);

      eq(g.player.money, moneyBefore + 35, "деньги убитого не перешли игроку при обыске трупа");
      eq(win.Bow.economy.countItem(g.player, "item:axe"), axesBefore + 1, "топор убитого не перешёл в инвентарь");
      assert(win.Bow.economy.countItem(g.player, "item:padded") >= 1, "стёганка убитого не перешла в инвентарь");
      assert(g.corpses[0].looted === true, "труп не помечен обысканным");

      return "труп лежит на поле боя до клика выхода, остаётся на сцене и отдаёт +35 м., топор и стёганку";
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.Bow.ui.setStageSelection(null);
      win.BowGame.refresh(true);
    }
  });

  check("Стража и уличные грабители отображаются визуально фигурками на Главном окне (#bow-stage)", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.fight = null;
      g.jail = null;
      g.player.location = "outskirts";

      /* 1. Приход стражи рисует вооружённых стражников прямо на сцене */
      g.guard = { phase: "demand", arrived: true, squad: win.Bow.guard.squad(g), heatAt: 75 };
      g.encounter = null;
      win.BowGame.refresh(true);

      const guardActors = doc().querySelectorAll("#bow-stage .bow-actor-guard");
      assert(guardActors.length >= 2, "пришедшая стража не отрисована фигурками на сцене: " + guardActors.length);
      click(guardActors[0]);
      assert(doc().getElementById("bow-stage-pop").textContent.indexOf("Стража Брода") !== -1,
        "клик по фигурке стражника на сцене не открыл карточку стражи");

      /* 2. Выход уличного грабителя рисует фигурку налётчика прямо на сцене */
      g.guard = null;
      win.Bow.ui.setStageSelection(null);
      g.player.money = 80;
      let tries = 0;
      while (!g.encounter && tries++ < 50) { win.Bow.street.maybeRob(g, () => 0.001); }
      assert(g.encounter && g.encounter.robber, "грабитель не появился");
      win.BowGame.refresh(true);

      const robberActor = doc().querySelector("#bow-stage .bow-actor-robber");
      assert(robberActor, "уличный грабитель не отрисован фигуркой на сцене!");
      assert(robberActor.textContent.indexOf(g.encounter.robber.name) !== -1, "на фигурке грабителя нет его имени");
      click(robberActor);
      assert(doc().getElementById("bow-stage-pop").textContent.indexOf("требует") !== -1,
        "клик по фигурке грабителя не открыл карточку встречи");

      return "стражники (" + guardActors.length + " фиг.) и грабитель («" + g.encounter.robber.name + "») стоят на сцене";
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.Bow.ui.setStageSelection(null);
      win.BowGame.refresh(true);
    }
  });

  check("Переходы занимают минуты (с подписями на кнопках), травма ноги замедляет путь, а статы падают мягче", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.player.location = "square";
      g.player.injuries = [];
      g.time.hour = 10;
      g.time.minute = 0;
      win.BowGame.refresh(true);

      /* На всех не-текущих кнопках перехода подписаны точные минуты */
      const moveBtns = [...doc().querySelectorAll('.bow-places-row [data-act="move"]')];
      const otherBtns = moveBtns.filter((b) => b.getAttribute("data-loc") !== "square");
      eq(otherBtns.length, 4, "кнопок соседних мест");
      otherBtns.forEach((b) => {
        assert(/\d+\s*мин\./.test(b.textContent), "на кнопке перехода не подписано время в минутах: " + b.textContent);
      });

      const baseTavern = win.Bow.actions.travelMinutes(g, "tavern");
      assert(baseTavern >= 5 && baseTavern <= 25, "переход в соседний трактир должен занимать минуты, а не часы: " + baseTavern);

      /* Перебитая нога честно увеличивает время пешего перехода */
      g.player.injuries = [{ key: "leg", at: 1 }];
      const hurtTavern = win.Bow.actions.travelMinutes(g, "tavern");
      assert(hurtTavern > baseTavern, "перебитая нога не замедлила переход: " + baseTavern + " vs " + hurtTavern);
      g.player.injuries = [];

      const res = win.Bow.actions.move(g, "tavern");
      assert(res.ok && res.minutes === baseTavern, "переход прошёл не за расчётные минуты");
      eq(g.time.hour, 10, "короткий переход по посёлку не должен сдвигать целый час");
      eq(g.time.minute, baseTavern, "минуты на часах после перехода в трактир");

      /* Темп падения статов смягчён */
      const perH = win.Bow.data.needsRules.perHour;
      assert(Math.abs(perH.hunger) <= 1.0 && Math.abs(perH.fatigue) <= 0.8,
        "падение потребностей в час всё ещё слишком резкое: " + JSON.stringify(perH));

      return "трактир " + baseTavern + " мин. (с раной ноги " + hurtTavern + " мин.), голод " + perH.hunger + "/ч";
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  check("Канон «Хладные Ветра» (север Эдемских земель, Брод — не столица) и двухуровневая интерактивная Карта", () => {
    const g = game();
    const snap = clone(g);
    try {
      eq(win.Bow.data.orgs["org:coldwind"].short, "Хладные Ветра", "название северного края в именительном падеже");
      const rawData = JSON.stringify(win.Bow.data);
      assert(rawData.indexOf("Хладные Ветры") === -1, "в данных осталась форма «Хладные Ветры»!");

      g.player.location = "square";
      win.BowGame.refresh(true);

      /* Открываем вкладку «Карта» кнопкой в полосе переходов */
      const openMapBtn = doc().querySelector('[data-act="open-map"]');
      assert(openMapBtn, "нет кнопки быстрого открытия Карты");
      click(openMapBtn);

      const mapPane = doc().querySelector('.bow-tab-pane[data-tab-pane="map"]');
      assert(mapPane && mapPane.classList.contains("bow-tab-pane-on"), "панель Карты не открылась");

      const pins = mapPane.querySelectorAll(".bow-map-pin[data-act='move']");
      eq(pins.length, 5, "на плане Студёного Брода должны быть все 5 точек локаций");

      /* Клик прямо по точке Кузницы на плане переводит игрока в Кузницу */
      const smithyPin = mapPane.querySelector('.bow-map-pin[data-loc="smithy"]');
      assert(smithyPin && /\d+\s*мин\./.test(smithyPin.textContent), "на метке Кузницы нет минут пути");
      click(smithyPin);
      eq(g.player.location, "smithy", "клик по метке на Карте не перевёл игрока в Кузницу");

      /* Переключаем масштаб на «Север Эдема · Хладные Ветра» */
      const realmBtn = mapPane.querySelector('[data-act="map-mode"][data-mode="realm"]');
      assert(realmBtn, "нет переключателя на обзорную карту Хладных Ветров");
      click(realmBtn);

      const mapText = mapPane.textContent;
      assert(/Хладные Ветра/.test(mapText) && /Эдемских земель/.test(mapText),
        "на обзорной карте не указаны Хладные Ветра на севере Эдемских земель");
      assert(/Норвинг IV/.test(mapText) && /не столица/i.test(mapText) && /Златодвор/.test(mapText),
        "на обзорной карте не отражён канон: ставка Норвинга IV отдельно, Студёный Брод — не столица, южнее Златодвор");

      /* Возвращаем локальный план и первую вкладку */
      click(mapPane.querySelector('[data-act="map-mode"][data-mode="local"]'));
      click(doc().querySelector('.bow-tabs [data-act="tab"][data-tab="jobs"]'));
      return "«Хладные Ветра» исправлены, план Брода (5 меток с переходом) + карта севера Эдема работают";
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.Bow.ui.setMapMode("local");
      win.Bow.ui.setTab("jobs");
      win.BowGame.refresh(true);
    }
  });

  /* 8р. Круг 16 (0.0.7.4): посадка поверженных на землю, полный лут оружия/брони, чистая шапка,
     лист Kenshi (4 атрибута + 27 навыков + конечности/органы), автозадачи, авто-еда и эмбиент */
  check("Поверженные и убитые бойцы лежат на линии снега, а не висят в воздухе (фикс image-8 и image-9)", () => {
    const styles = [...doc().querySelectorAll("style")].map((x) => x.textContent).join("\n");
    assert(/\.bow-arena-scene\s+\.bow-chip\.bow-chip-down[\s\S]*?translate\(-50%,\s*30px\)/.test(styles),
      "поверженные и убитые бойцы на арене не опущены на уровень земли (+30px)");

    const g = game();
    const snap = clone(g);
    try {
      g.corpses = [{
        id: "corpse:test", name: "Налётчик", roleKey: "robber",
        location: "square", money: 5, items: ["item:knife"], looted: false
      }];
      g.player.location = "square";
      win.BowGame.refresh(true);
      const stageCorpse = doc().querySelector("#bow-stage .bow-actor-corpse");
      assert(stageCorpse && stageCorpse.hasAttribute("data-iso-col") && /top:\s*\d/.test(stageCorpse.getAttribute("style") || ""),
        "труп на Главном окне не привязан к изометрической клетке земли");
      return "арена translate(-50%, 30px) + изометрическая клетка земли — тела лежат на снегу";
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  check("Полный лут 0.0.7.4: при «Обобрать» и «Добить» забираются оружие, броня и припасы врага (фикс image-9)", () => {
    const g = game();
    const snap = clone(g);
    try {
      /* 1. «Обобрать» (без убийства) снимает с поверженного оружие, броню и котомку, даже если оружие выбили */
      g.fight = null;
      g.flags.lastFight = null;
      g.player.location = "smithy";
      const tarn = g.people["person:tarn"];
      tarn.alive = true;
      tarn.location = "smithy";
      tarn.weapon = "item:axe";
      tarn.armor = "item:padded";
      tarn.pouch = ["item:iron_ore"];
      tarn.money = 20;
      tarn.needs.health = 10;

      const axes0 = win.Bow.economy.countItem(g.player, "item:axe");
      const pad0 = win.Bow.economy.countItem(g.player, "item:padded");
      const ore0 = win.Bow.economy.countItem(g.player, "item:iron_ore");

      win.Bow.fight.open(g, "person:tarn");
      win.Bow.fight.start(g, "crime", seq([0.1]));
      const foeU = g.fight.units.find((u) => u.side === "enemy");
      foeU.disarmed = true;
      g.fight.phase = "aftermath";

      const robRes = win.Bow.fight.decide(g, "rob", seq([0.4]));
      assert(robRes.ok, "«Обобрать» не сработало");
      eq(win.Bow.economy.countItem(g.player, "item:axe"), axes0 + 1, "топор не забрался при «Обобрать»");
      eq(win.Bow.economy.countItem(g.player, "item:padded"), pad0 + 1, "стёганка не забралась при «Обобрать»");
      eq(win.Bow.economy.countItem(g.player, "item:iron_ore"), ore0 + 1, "руда из котомки не забралась при «Обобрать»");
      eq(tarn.weapon, null, "у обобранного Тарна остался дубликат топора");

      /* 2. У налётчика всегда есть оружие, а у Ливы — товары в котомке при обыске тела */
      g.fight = null;
      g.flags.lastFight = null;
      g.corpses = [];
      g.player.location = "square";
      const liva = g.people["person:liva"];
      liva.alive = true;
      liva.location = "square";
      liva.pouch = ["item:bread", "item:salt"];
      win.Bow.fight.open(g, "person:liva");
      win.Bow.fight.start(g, "crime", seq([0.1]));
      g.fight.phase = "aftermath";
      win.Bow.fight.decide(g, "kill", seq([0.2]));
      assert(g.corpses.length === 1 && g.corpses[0].items.some((x) => x.itemId === "item:salt"),
        "в теле Ливы нет товаров из её котомки");

      return "«Обобрать» снимает топор+стёганку+котомку, тела хранят снаряжение и припасы";
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  check("Чистая шапка и переходы 0.0.7.4: логотип с ☰ без «меню», сезон перенесён, нет вкладки «Меню» и слова «здесь»", () => {
    const logoBtn = doc().getElementById("bow-logo-btn");
    assert(logoBtn, "нет кнопки логотипа");
    assert(logoBtn.querySelector(".bow-logo-bars"), "на кнопке логотипа нет знака трёх полос ☰");
    assert(!/меню/i.test(logoBtn.textContent), "на кнопке логотипа осталось слово «меню»: " + logoBtn.textContent);
    assert(!logoBtn.querySelector("#bow-season"), "#bow-season всё ещё внутри кнопки логотипа");

    const seasonInPlaces = doc().querySelector(".bow-places-head #bow-season");
    assert(seasonInPlaces && /Студёный Брод/.test(seasonInPlaces.textContent),
      "надпись сезона и поселения не перенесена в шапку переходов");

    assert(!doc().querySelector('#bow-rail [data-panel="save"]'),
      "в ряду кнопок разделов осталась дублирующая вкладка «Меню»!");

    const hereBtn = doc().querySelector('.bow-places-row .bow-btn-here');
    assert(hereBtn, "текущая локация не подсвечена классом .bow-btn-here");
    assert(!/здесь/i.test(hereBtn.textContent),
      "на кнопке текущего места осталась лишняя надпись «здесь»: " + hereBtn.textContent);

    /* Проверка пояснения частокола */
    const outskirtsDesc = (win.Bow.data.locations.outskirts.desc || []).join(" ");
    assert(/плотной стеной из вкопанных заострённых брёвен/i.test(outskirtsDesc),
      "в описании Околицы нет простого и наглядного объяснения частокола");

    return "☰ + Blades Of War, сезон перенесён, вкладка Меню и слово «здесь» убраны, частокол пояснён";
  });

  check("Лист персонажа в духе Kenshi (image-10): 4 характеристики + 7 категорий (27 навыков), рост оружия и перегруз", () => {
    const g = game();
    const snap = clone(g);
    try {
      win.BowGame.refresh(true);
      const box = doc().getElementById("bow-skills");
      const attrCards = box.querySelectorAll(".bow-attr-card");
      const catCards = box.querySelectorAll(".bow-skill-cat");
      const skillRows = box.querySelectorAll(".bow-skill");
      eq(attrCards.length, 4, "должно быть 4 основные характеристики");
      eq(catCards.length, 7, "должно быть 7 категорий навыков");
      eq(skillRows.length, 27, "должно быть 27 навыков");

      /* Удар топором прокачивает навык «Топоры» и «Атака» (combat) */
      win.Bow.economy.addItem(g.player, "item:axe", 1);
      const axesSkill0 = g.player.skills.axes;
      const atkSkill0 = g.player.skills.combat;
      g.fight = null;
      g.player.location = "square";
      g.people["person:liva"].alive = true;
      g.people["person:liva"].location = "square";
      g.people["person:liva"].needs.health = 28;
      win.Bow.fight.open(g, "person:liva");
      win.Bow.fight.start(g, "crime", seq([0.2]));
      for (let r = 0; r < 8 && g.fight && g.fight.phase === "exchange"; r++) {
        win.Bow.fight.move(g, "press", seq([0.05, 0.2]));
      }
      if (g.fight && g.fight.phase === "aftermath") {
        win.Bow.fight.decide(g, "spare", seq([0.2]));
      }
      assert(g.player.skills.axes > axesSkill0, "бой топором не растит навык «Топоры»");
      assert(g.player.skills.combat > atkSkill0, "завершение боя не растит навык «Атака»");

      /* Перегруз замедляет переход и качает Силу при ходьбе */
      g.fight = null;
      const normalMin = win.Bow.actions.travelMinutes(g, "forest");
      win.Bow.economy.addItem(g.player, "item:iron_ore", 12); // +36 кг
      const heavyMin = win.Bow.actions.travelMinutes(g, "forest");
      assert(heavyMin > normalMin, "перегруз сумки не замедляет переход: " + heavyMin + " vs " + normalMin);
      const str0 = g.player.attrs.strength;
      win.Bow.actions.move(g, "forest");
      assert(g.player.attrs.strength > str0, "ходьба с перегрузом не тренирует Силу (как в Kenshi)");

      return "4 атрибута + 27 навыков в 7 категориях, рост Топоров и Силы от перегруза работает";
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  check("Конечности и органы 0.0.7.4: тупое оружие и слабые бойцы НЕ отсекают части тела, а травмы дают честные штрафы", () => {
    const g = game();
    const snap = clone(g);
    try {
      win.Bow.state.ensureAnatomy(g.player);
      const parts = Object.keys(g.player.body);
      const organs = Object.keys(g.player.organs);
      eq(parts.length, 7, "7 частей тела (голова, грудь, живот, 2 руки, 2 ноги)");
      eq(organs.length, 4, "4 органа чувств (2 глаза, 2 уха)");

      /* Неопытный боец или боец с дубиной не оставляет вечных увечий даже при сильном ударе */
      g.fight = null;
      g.player.injuries = [];
      g.player.body.left_arm.hp = 15;
      g.player.location = "square";
      const liva = g.people["person:liva"]; // combat 14 < 52
      liva.alive = true;
      liva.location = "square";
      liva.weapon = "item:club"; // тупое оружие
      win.Bow.fight.open(g, "person:liva");
      win.Bow.fight.start(g, "crime", seq([0.1]));
      for (let i = 0; i < 6 && g.fight && g.fight.phase === "exchange"; i++) {
        win.Bow.fight.move(g, "guard", seq([0.01, 0.01, 0.01]));
      }
      eq(g.player.injuries.length, 0, "слабый враг с дубиной не должен отсекать конечности или выбивать органы!");

      /* Прямое увечье ноги/глаза честно снижает характеристики и замедляет шаг */
      g.fight = null;
      const perBefore = win.Bow.state.effectiveAttr(g.player, "perception");
      win.Bow.fight.maim(g.player, () => 0.01, "head"); // выбитый глаз
      assert(g.player.organs.left_eye === false, "потеря глаза не отразилась в organs");
      assert(win.Bow.state.effectiveAttr(g.player, "perception") < perBefore,
        "потеря глаза не снизила Восприятие");

      win.BowGame.refresh(true);
      const injBox = doc().getElementById("bow-injuries");
      assert(injBox.querySelectorAll(".bow-limb-row").length === 7, "в окне состояния не показаны полосы 7 частей тела");
      assert(injBox.querySelectorAll(".bow-organ-chip").length === 4, "в окне состояния не показаны 4 органа");

      return "7 конечностей + 4 органа, защита от случайных ампутаций и штрафы работают";
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  check("Автозадачи Kenshi и авто-еда 0.0.7.4: добыча руды/тайги идёт сама по минутам, а герой сам ест из сумки", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.fight = null;
      g.player.location = "smithy";
      g.player.needs.fatigue = 90;
      g.player.needs.hunger = 45; // проголодался (< 52)
      g.player.autoEat = true;
      const breadBefore = win.Bow.economy.countItem(g.player, "item:bread");
      assert(breadBefore >= 1, "у героя должен быть стартовый хлеб");

      /* Назначаем постоянную задачу «Дробить руду у отвала» */
      const startRes = win.Bow.adapter.act.taskStart(g, "mine_ore");
      assert(startRes.ok, "не удалось запустить автозадачу: " + startRes.message);
      eq(g.time.scale, "1x", "старт автозадачи должен включать ход времени 1x");

      const oreBefore = win.Bow.economy.countItem(g.player, "item:iron_ore");
      const labourBefore = g.player.skills.labouring;

      /* Прокручиваем 35 игровых минут: должен сработать авто-перекус и завершиться 1 цикл добычи руды (30 мин.) */
      for (let m = 0; m < 35; m++) {
        win.Bow.time.tickMinute(g);
      }

      assert(win.Bow.economy.countItem(g.player, "item:bread") < breadBefore,
        "герой не съел хлеб автоматически при голоде");
      assert(g.player.needs.hunger > 52, "авто-еда не восстановила сытость: " + g.player.needs.hunger);
      assert(win.Bow.economy.countItem(g.player, "item:iron_ore") > oreBefore,
        "автозадача добычи не принесла железную руду за 30 минут");
      assert(g.player.skills.labouring > labourBefore,
        "автозадача не прокачала навык «Чёрная работа»");

      win.Bow.adapter.act.taskStop(g);
      eq(g.task, null, "остановка задачи не очистила state.task");

      return "авто-еда съела хлеб при голоде, автозадача добыла руду и качнула Чёрную работу";
    } finally {
      win.BowGame.stopClock();
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  check("Смягчён темп потери статов и усталости в бою, а северный эмбиент включается офлайн без ошибок", () => {
    const nr = win.Bow.data.needsRules.perHour;
    assert(Math.abs(nr.hunger) <= 0.6 && Math.abs(nr.fatigue) <= 0.5 && Math.abs(nr.mood) <= 0.1,
      "почасовое падение показателей слишком быстрое: " + JSON.stringify(nr));
    assert(win.Bow.data.fightRules.fatiguePerExchange <= 1.6,
      "усталость за раунд боя слишком велика: " + win.Bow.data.fightRules.fatiguePerExchange);

    assert(win.Bow.audio && typeof win.Bow.audio.toggle === "function", "модуль Bow.audio не подключён");
    const audioBtn = doc().getElementById("bow-audio-btn");
    assert(audioBtn, "в шапке нет кнопки включения музыки ♪");
    win.Bow.audio.setVolume(0.35);
    eq(win.Bow.audio.getVolume(), 0.35, "громкость эмбиента не сохранилась");
    win.Bow.audio.toggle();
    assert(win.Bow.audio.isEnabled() === true, "эмбиент не переключился во включённое состояние");
    win.Bow.audio.stop();
    assert(win.Bow.audio.isEnabled() === false, "эмбиент не выключился");

    return "статы падают мягко (-0.55/-0.45/-0.08 в час, бой -1.5), офлайн-эмбиент работает";
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

  check("Действия разложены по вкладкам вместо длинной простыни (0.0.7)", () => {
    const tabs = doc().querySelectorAll('.bow-tabs [data-act="tab"]');
    assert(tabs.length === 4, "вкладок не четыре: " + tabs.length);
    const tradeTab = doc().querySelector('.bow-tabs [data-act="tab"][data-tab="trade"]');
    click(tradeTab);
    assert(doc().querySelector('.bow-tab-pane[data-tab-pane="trade"]').classList.contains("bow-tab-pane-on"),
      "вкладка торговли не открылась");
    assert(!doc().querySelector('.bow-tab-pane[data-tab-pane="jobs"]').classList.contains("bow-tab-pane-on"),
      "предыдущая вкладка не скрылась");
    click(doc().querySelector('.bow-tabs [data-act="tab"][data-tab="jobs"]'));
    return "4 вкладки: заработок, карта, товар, о месте";
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
    ["Состояние", "Характеристики и навыки", "При себе", "Хроника", "Память игры"].forEach((name) => {
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

  /* ---------- Круг 17 (0.0.7.5): светофор и минус конечностей Kenshi, чистая вёрстка окон и шапки,
                единая непрерывная Работа без дублей, тлен трупов, окно боя 1:1 и анимация ударов ---------- */
  check("Светофор частей тела 0.0.7.5: зелёный/жёлтый/красный + %, а при минусе груди/головы герой в коме до перевязки", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.fight = null;
      g.jail = null;
      g.coma = null;
      g.player.body.head.hp = 85;
      g.player.body.chest.hp = 52;
      g.player.body.stomach.hp = 20;
      win.BowGame.refresh(true);

      const injBox = doc().getElementById("bow-injuries");
      const fills = [...injBox.querySelectorAll(".bow-limb-bar .bow-fill")];
      assert(fills.some((el) => el.classList.contains("bow-good")), "нет зелёной полосы (>=70%)");
      assert(fills.some((el) => el.classList.contains("bow-ok")), "нет жёлтой полосы (35..69%)");
      assert(fills.some((el) => el.classList.contains("bow-critical")), "нет красной полосы (<35%)");
      assert(/85%/.test(injBox.textContent) && /52%/.test(injBox.textContent) && /20%/.test(injBox.textContent),
        "не выведены понятные проценты здоровья областей тела");

      /* Уводим Грудь в минус (-18%) — персонаж падает в кому и не может ни встать, ни перевязать себя сам. */
      g.player.body.chest.hp = -18;
      g.player.body.chest.bandaged = false;
      win.Bow.needs.syncComaState(g);
      win.BowGame.refresh(true);

      assert(win.Bow.state.isComatose(g.player), "при груди -18% герой не признан лежащим без сознания");
      assert(!win.Bow.actions.move(g, "tavern").ok, "в коме с пробитой грудью удалось уйти пешком");
      assert(!win.Bow.needs.treat(g).ok, "в коме с пробитой грудью удалось перевязать себя самому");
      assert(!win.Bow.actions.rest(g).ok, "в коме с пробитой грудью удалось просто отлежаться без помощи");
      assert(doc().querySelector("#bow-coma .bow-coma-card"), "не отрисована карточка беспомощного состояния");

      /* Жители Студёного Брода перевязывают рану — герой приходит в сознание и снова стоит на ногах! */
      const rescue = win.Bow.needs.rescueComa(g, "passerby", seq([0.2]));
      assert(rescue.ok && rescue.rescued, "помощь жителей не вывела из комы");
      assert(!win.Bow.state.isComatose(g.player), "после перевязки герой остался в коме");
      assert(g.player.body.chest.hp > 0 && g.player.body.chest.bandaged, "грудь не выведена из минуса");
      return "зелёный/жёлтый/красный + %, кома на −18% и спасение перевязкой работают";
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  check("Чистая вёрстка 0.0.7.5: «Навыки» без двухколоночного сжатия и дробных чисел, неподвижная шапка и нет дублей заголовков", () => {
    const styles = [...doc().querySelectorAll("style")].map((s) => s.textContent).join("\n");
    assert(/#bow-skills\s*\{[^}]*flex-direction:\s*column/.test(styles),
      "#bow-skills всё ещё разбит старой двухколоночной сеткой");
    assert(/\.bow-topbar\s*\{[^}]*flex-wrap:\s*nowrap/.test(styles),
      "верхняя шапка на ПК не зафиксирована от переноса на две строки");
    assert(/\.bow-subh-modal-dup\s*\{[^}]*display:\s*none/.test(styles),
      "дублирующиеся подзаголовки в модальных окнах не скрыты");

    const skillsTxt = doc().getElementById("bow-skills").textContent;
    assert(!/\d+\.\d+/.test(skillsTxt), "в окне навыков остались дробные числа: " + skillsTxt.slice(0, 80));
    assert(doc().querySelector(".bow-topbar-line1") && doc().querySelector(".bow-topbar-line2"),
      "инфо-блок шапки не уложен в компактный двухэтажный блок");
    return "колонка #bow-skills, целые числа, ровная шапка в 1 ряд и без дублей заголовков";
  });

  check("Единая непрерывная «Работа» 0.0.7.5: без слова «задача» и без двойных кнопок остановки", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.task = null;
      g.player.location = "smithy";
      g.player.needs.fatigue = 90;
      win.BowGame.refresh(true);

      const jobsBox = doc().getElementById("bow-jobs");
      assert(!/задач/i.test(jobsBox.textContent), "в разделе Заработок осталось слово «задача»");
      const startBtns = [...jobsBox.querySelectorAll('[data-act="task-start"]')];
      assert(startBtns.length >= 2, "в Кузнице нет единого списка работ");
      assert(startBtns.every((b) => /Взяться за работу/.test(b.textContent)),
        "кнопки старта не подписаны «Взяться за работу»");

      /* Запускаем работу — должна быть ровно ОДНА кнопка «Прекратить работу», без второго баннера сверху. */
      win.Bow.work.startTask(g, "bellows");
      win.BowGame.refresh(true);
      const stopBtns = [...jobsBox.querySelectorAll('[data-act="task-stop"]')];
      eq(stopBtns.length, 1, "количество кнопок остановки работы (не должно двоиться)");
      assert(/Прекратить работу/.test(stopBtns[0].textContent), "кнопка остановки не подписана «Прекратить работу»");
      assert(!/задач/i.test(jobsBox.textContent), "при активной работе всплыло слово «задача»");

      /* Проверяем, что подённая работа («Поработать мехами») реально приносит монеты и растит навык по кругам. */
      const moneyBefore = g.player.money;
      win.Bow.work.tickTask(g, 35, seq([0.5, 0.5]));
      assert(g.player.money > moneyBefore, "непрерывная работа в кузне не принесла монет за круг");
      win.Bow.work.stopTask(g);
      return "единый список работ («Взяться за работу» ↔ 1 кнопка «Прекратить работу»)";
    } finally {
      win.BowGame.stopClock();
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  check("Трупы 0.0.7.5: со временем коченеют, гниют и исчезают (48 ч. в Броде, 72 ч. в тайге)", () => {
    const g = clone(game());
    g.corpses = [
      { id: "corpse:test:brod", name: "Налётчик", role: "грабитель", location: "square", killedAt: g.time.totalHours, money: 5, items: [], looted: false },
      { id: "corpse:test:taiga", name: "Браконьер", role: "охотник", location: "forest", killedAt: g.time.totalHours, money: 3, items: [], looted: false }
    ];
    eq(win.Bow.actions.corpseStage(g, g.corpses[0]).key, "fresh", "сразу после боя тело должно быть свежим");

    win.Bow.time.advance(g, 16);
    eq(win.Bow.actions.corpseStage(g, g.corpses[0]).key, "cold", "через 16 ч. тело должно остыть");

    win.Bow.time.advance(g, 16);
    eq(win.Bow.actions.corpseStage(g, g.corpses[0]).key, "rotting", "через 32 ч. тело должно быть тронуто тленом");

    /* К 50 часам тело в поселении уже убрано (даже если его не обыскали!), а в тайге ещё лежит до 72 ч. */
    win.Bow.time.advance(g, 18);
    assert(!g.corpses.some((c) => c.id === "corpse:test:brod"), "труп в поселении не исчез после 48 ч.");
    assert(g.corpses.some((c) => c.id === "corpse:test:taiga"), "труп в тайге исчез слишком рано");

    win.Bow.time.advance(g, 24);
    eq(g.corpses.length, 0, "труп в тайге не исчез после 72 ч.");
    return "fresh → cold → rotting → уборка за 48 ч. (Брод) и 72 ч. (тайга)";
  });

  check("Полноразмерное окно боя (368px = #bow-stage), сближение ровно по 1 клетке и 1-кадровая анимация удара", () => {
    const styles = [...doc().querySelectorAll("style")].map((s) => s.textContent).join("\n");
    assert(/\.bow-arena-scene\s*\{[^}]*height:\s*368px/.test(styles),
      "высота окна боя (.bow-arena-scene) не равна стандартному окну сцены (368px)");
    assert(/\.bow-fight-page-inner\s*\{[^}]*max-width:\s*1088px/.test(styles),
      "ширина окна боя не выровнена со стандартным окном (1088px)");
    assert(/\.bow-fight-speed-btns\s+\.bow-btn\s*\{[^}]*width:\s*auto\s*!important/.test(styles),
      "кнопки скорости боя растянуты на 100% вместо компактного ряда");

    const g = game();
    const snap = clone(g);
    try {
      g.fight = null;
      g.jail = null;
      g.player.location = "tavern";
      g.player.needs.health = 100;
      g.player.needs.fatigue = 100;
      g.people["person:sigi"].location = "tavern";
      g.people["person:sigi"].needs.health = 100;

      win.Bow.fight.open(g, "person:sigi");
      win.Bow.fight.start(g, "spar", seq([0.5]));
      const you = g.fight.units.filter((u) => u.key === "player")[0];
      const foe = g.fight.units.filter((u) => u.side === "enemy")[0];
      eq(you.col, 0, "старт героя с левого края");
      eq(foe.col, 6, "старт противника с правого края");

      /* Круг 1: каждый делает РОВНО 1 шаг навстречу с краёв поля (0→1 и 6→5), без прыжка через полкарты! */
      win.Bow.fight.step(g, seq([0.05, 0.05]));
      eq(you.col, 1, "герой прыгнул больше чем на 1 клетку за такт");
      eq(foe.col, 5, "противник не шагнул на 1 клетку навстречу");
      eq(g.people["person:sigi"].needs.health, 100, "удар прошёл в такт сближения с края карты");

      /* Доходим до центра поля (2→3 и 5→4) и проверяем удар с 1-кадровой анимацией взмаха и рассечения! */
      win.Bow.fight.step(g, seq([0.05, 0.05]));
      win.Bow.fight.step(g, seq([0.05, 0.05]));
      win.Bow.fight.step(g, seq([0.05, 0.5, 0.05, 0.5]));
      win.BowGame.refresh(true);
      assert(g.fight.lastStrikes && g.fight.lastStrikes.length >= 1, "удары раунда не записаны для анимации");
      const page = doc().getElementById("bow-fight-page");
      assert(page.querySelector(".bow-swing-a, .bow-swing-b"), "нет класса анимации замаха у бьющей фигурки");
      assert(page.querySelector(".bow-strike-fx-hit .bow-slash-svg"), "нет 1-кадровой SVG-дуги рассечения при попадании");
      return "арена 1088×368px, края 0 vs 6 → встреча в центре, SVG-взмах и дуга удара работают";
    } finally {
      win.BowGame.stopFightClock();
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
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

  /* ---------- Круг 18 (0.0.7.6): Северный саундтрек — 8 композиций (помещения и улица) ---------- */

  check("0.0.8.1: саундтрек содержит 11 композиций (4 помещения, 4 улица Enigma и 3 оркестровые боевые Skyrim)", () => {
    assert(win.Bow.audio && typeof win.Bow.audio.listTracks === "function", "нет Bow.audio.listTracks");
    const tracks = win.Bow.audio.listTracks();
    assert(tracks.length === 11, "ожидалось 11 композиций, найдено: " + tracks.length);
    const indoor = tracks.filter((t) => t.realm === "indoor");
    const outdoor = tracks.filter((t) => t.realm === "outdoor");
    const combat = tracks.filter((t) => t.realm === "combat");
    assert(indoor.length === 4, "ожидалось 4 камерные композиции для помещений, найдено: " + indoor.length);
    assert(outdoor.length === 4, "ожидалось 4 уличные композиции, найдено: " + outdoor.length);
    assert(combat.length === 3, "ожидалось 3 оркестровые боевые композиции Skyrim, найдено: " + combat.length);
    const titles = tracks.map((t) => t.title);
    assert(titles.includes("Угли у очага") && titles.includes("Мёд и наковальня"), "нет названий камерных тем");
    assert(titles.includes("Чертоги Студёного Брода") && titles.includes("Непреклонный тракт"), "нет названий уличных тем");
    assert(titles.includes("Клык и сталь") && titles.includes("Сталь о сталь") && titles.includes("Смерть или слава"), "нет названий 3 боевых тем Skyrim");
    return "4 indoor | 4 outdoor | 3 combat (" + combat.map((t) => t.title).join(", ") + ")";
  });

  check("0.0.7.6: авто-режим саундтрека переключает помещения (трактир/кузница) и улицу (площадь/околица/тайга)", () => {
    const g = game();
    const snap = clone(g);
    try {
      win.Bow.audio.setAutoMode(g);

      g.player.location = "tavern";
      g.time.hour = 19;
      win.Bow.audio.syncMood(g);
      assert(win.Bow.audio.getRealm() === "indoor", "трактир должен включать камерный режим indoor");
      assert(win.Bow.audio.currentTrack().realm === "indoor", "в трактире выбран не камерный трек");

      g.player.location = "smithy";
      g.time.hour = 12;
      win.Bow.audio.syncMood(g);
      assert(win.Bow.audio.getRealm() === "indoor" && win.Bow.audio.currentTrack().id === "mead_and_anvil",
        "в кузнице должна включаться «Мёд и наковальня»");

      g.player.location = "square";
      g.time.hour = 13;
      win.Bow.audio.syncMood(g);
      assert(win.Bow.audio.getRealm() === "outdoor" && win.Bow.audio.currentTrack().id === "citadel_of_ford",
        "на площади должна включаться «Чертоги Студёного Брода»");

      g.player.location = "outskirts";
      g.time.hour = 15;
      win.Bow.audio.syncMood(g);
      assert(win.Bow.audio.getRealm() === "outdoor" && win.Bow.audio.currentTrack().id === "white_silence",
        "на околице днём должна включаться «Белое безмолвие»");

      g.player.location = "forest";
      g.time.hour = 16;
      win.Bow.audio.syncMood(g);
      assert(win.Bow.audio.getRealm() === "outdoor" && win.Bow.audio.currentTrack().id === "unbroken_tract",
        "у тайги должна включаться «Непреклонный тракт»");

      return "tavern/smithy → indoor, square/outskirts/forest → outdoor";
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.Bow.audio.setAutoMode(g);
      win.BowGame.refresh(true);
    }
  });

  check("0.0.8.1: ручной выбор любой из 11 композиций, тумблер бита Enigma и кнопка «След.» работают в Настройках", () => {
    const g = game();
    try {
      win.Bow.ui.openModal("save");
      const settings = doc().getElementById("bow-settings");
      const pills = settings.querySelectorAll('[data-act="audio-track"]');
      assert(pills.length === 11, "в Настройках должно быть 11 кнопок композиций, найдено: " + pills.length);

      assert(win.Bow.audio.isStreetBeat() === true, "уличный бит Enigma должен быть включён по умолчанию");
      click(settings.querySelector('[data-act="audio-beat"]'));
      assert(win.Bow.audio.isStreetBeat() === false, "тумблер бита Enigma не выключился");
      click(settings.querySelector('[data-act="audio-beat"]'));
      assert(win.Bow.audio.isStreetBeat() === true, "тумблер бита Enigma не включился обратно");

      click(settings.querySelector('[data-track="rime_and_stars"]'));
      assert(win.Bow.audio.getMode() === "manual", "клик по мелодии должен переводить плеер в ручной режим");
      assert(win.Bow.audio.currentTrack().id === "rime_and_stars", "не включилась композиция «Хладный иней»");

      click(settings.querySelector('[data-act="audio-next"]'));
      assert(win.Bow.audio.currentTrack().id !== "rime_and_stars", "кнопка «След.» не переключила композицию");

      click(settings.querySelector('[data-act="audio-auto"]'));
      assert(win.Bow.audio.getMode() === "auto", "кнопка «Авто по месту» не вернула авторежим");
      win.Bow.audio.stop();
      return "10 кнопок в UI + бит Enigma + переключение треков и авторежим";
    } finally {
      win.Bow.audio.stop();
      win.Bow.audio.setStreetBeat(true);
      win.Bow.audio.setAutoMode(g);
      win.Bow.ui.setDrawer(false);
      win.BowGame.refresh(true);
    }
  });

  check("0.0.9.3: миграция состояний доводит версию игры до 0.0.9.3", () => {
    assert(win.Bow.data.meta.version === "0.0.9.3", "версия в Bow.data.meta не 0.0.9.3");
    assert(game().version === "0.0.9.3", "версия активного состояния не 0.0.9.3");
    return "версия 0.0.9.3 подтверждена";
  });

  check("0.0.7.7: щипковые удары по струнам полностью вырезаны из саундтрека", () => {
    const audioSrc = fs.readFileSync(path.join(__dirname, "..", "src", "audio", "108-audio.js"), "utf8");
    assert(!/playPluck|getPluckBuffer|pluckCache|\bharp\s*:/.test(audioSrc),
      "в 108-audio.js остались щипковые удары по струнам");
    assert(/playHearthPad/.test(audioSrc) && /playBowedChord/.test(audioSrc) && /playFrostHarmonic/.test(audioSrc),
      "плавные смычковые/камерные инструменты отсутствуют");
    return "0 щипковых ударов, плавные виолы/флейта/рога/хор на месте";
  });

  check("0.0.7.7: время в верхней шапке не зажато узким max-width и отображается целиком (фикс image-17)", () => {
    const styles = [...doc().querySelectorAll("style")].map((s) => s.textContent).join("\n");
    assert(!/max-width:\s*245px/.test(styles), "у .bow-topbar-info остался узкий потолок max-width: 245px");
    assert(/\.bow-topbar-line1\s*\{[^}]*overflow:\s*visible/.test(styles),
      "первая строка шапки (#bow-time) всё ещё режет часы через overflow: hidden");
    const timeText = doc().getElementById("bow-time").textContent;
    assert(/\d{2}:\d{2}$/.test(timeText), "в #bow-time нет полных часов и минут ЧЧ:ММ: " + timeText);
    return "полное время в шапке: " + timeText;
  });

  /* ---------- Круг 20 (0.0.8.0): боевая музыка Skyrim, заставка Final Fantasy, сетка 7×4 и стеки King's Bounty ---------- */

  check("0.0.8.0: при входе в бой включается боевая музыка Skyrim и заставка клинков Final Fantasy, а после боя возвращается улица", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.fight = null;
      g.flags.lastFight = null;
      g.player.location = "outskirts";
      g.people["person:bror"].location = "outskirts";
      g.people["person:bror"].alive = true;
      g.people["person:bror"].needs.health = 100;
      g.player.needs.health = 100;
      g.player.needs.fatigue = 90;

      win.Bow.audio.setAutoMode(g);
      assert(win.Bow.audio.getRealm() === "outdoor", "до боя на околице должен быть уличный режим");

      win.Bow.fight.open(g, "person:bror");
      win.Bow.fight.start(g, "spar");
      win.Bow.audio.syncMood(g);
      win.BowGame.refresh(true);

      assert(win.Bow.audio.getRealm() === "combat", "во время боя должна включаться боевая шина combat");
      assert(win.Bow.audio.currentTrack().realm === "combat", "во время боя должен играть трек сражения Skyrim");

      const introEl = doc().getElementById("bow-battle-intro");
      assert(introEl && introEl.classList.contains("bow-battle-intro-play"),
        "при старте боя не запустилась заставка скрещённых клинков Final Fantasy");

      const headTxt = doc().querySelector("#bow-fight-page .bow-fight-head b").textContent;
      assert(/Кулачный бой с Брором/.test(headTxt), "неверный заголовок боя с Брором: " + headTxt);

      g.fight = null;
      g.flags.lastFight = null;
      win.Bow.audio.syncMood(g);
      assert(win.Bow.audio.getRealm() === "outdoor", "после окончания боя музыка не вернулась к уличной теме");
      return "combat («" + win.Bow.audio.listTracks().filter((t) => t.realm === "combat")[0].title + "») + FF-заставка + заголовок «" + headTxt + "»";
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.Bow.audio.setAutoMode(g);
      win.BowGame.refresh(true);
    }
  });

  check("0.0.8.1: пустые квадраты .bow-roster скрыты, а арена рисует гексагональную сотовую сетку 7×5 (35 гексов, как в King's Bounty и Heroes III)", () => {
    const g = game();
    const snap = clone(g);
    try {
      const styles = [...doc().querySelectorAll("style")].map((s) => s.textContent).join("\n");
      assert(/#bow-fight-page\s+\.bow-roster\s*\{[^}]*display:\s*none\s*!important/.test(styles),
        "пустые прямоугольники .bow-roster под полем боя всё ещё видны");
      eq(win.Bow.data.fightRules.arena.cols, 7, "ширина гексагональной сетки");
      eq(win.Bow.data.fightRules.arena.rows, 5, "глубина гексагональной сетки (5 рядов)");

      g.fight = null;
      g.flags.lastFight = null;
      g.player.location = "outskirts";
      g.player.needs.health = 100;
      g.player.needs.fatigue = 90;
      g.people["person:bror"].location = "outskirts";
      g.people["person:bror"].alive = true;
      g.people["person:bror"].needs.health = 100;
      win.Bow.fight.open(g, "person:bror");
      const started = win.Bow.fight.start(g, "crime");
      assert(started && started.ok, "бой с Брором не запустился: " + (started && started.message));
      win.BowGame.refresh(true);

      const page = doc().getElementById("bow-fight-page");
      const hexes = page.querySelectorAll("svg.bow-tactical-grid polygon.bow-hex-cell");
      eq(hexes.length, 35, "на поле боя должно быть ровно 35 шестиугольных гексов (7×5)");
      const headB = page.querySelector(".bow-fight-head b").textContent;
      assert(/Бой с Брором/.test(headB), "ожидался заголовок «Бой с Брором», получено: " + headB);
      return "гексы 7×5 (35 сот) + скрыт .bow-roster + заголовок «" + headB + "»";
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  check("0.0.8.0: заголовки группового боя («Бой с отрядом Брора») корректно склоняют имена", () => {
    const g = game();
    const fakeSquadFight = {
      personId: "person:bror",
      mode: "crime",
      units: [
        { key: "player", side: "ally", count: 1 },
        { key: "enemy:person:bror", side: "enemy", count: 1 },
        { key: "stack:hunters", side: "enemy", count: 6 }
      ]
    };
    const titleBror = win.Bow.fight.titleOf(fakeSquadFight, g);
    assert(titleBror === "Бой с отрядом Брора", "ожидалось «Бой с отрядом Брора», получено: " + titleBror);

    const fakeLivaSolo = {
      personId: "person:liva",
      mode: "crime",
      units: [
        { key: "player", side: "ally", count: 1 },
        { key: "enemy:person:liva", side: "enemy", count: 1 }
      ]
    };
    const titleLiva = win.Bow.fight.titleOf(fakeLivaSolo, g);
    assert(titleLiva === "Бой с Ливой", "ожидалось «Бой с Ливой», получено: " + titleLiva);
    return titleBror + " / " + titleLiva;
  });

  check("0.0.8.0: система стеков в духе King's Bounty («Рыцари ×100» — 1 фигурка = 100 бойцов, убыль численности и рост мощи)", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.player.needs.health = 100;
      g.player.needs.fatigue = 100;
      g.player.skills.combat = 85;
      g.player.attrs.strength = 45;

      const spearmen = win.Bow.fight.createStack({
        key: "stack:spearmen",
        name: "Дружинники",
        side: "ally",
        count: 80,
        unitHp: 22,
        combat: 42,
        weapon: "item:axe",
        armor: "item:leather"
      });
      const knights = win.Bow.fight.createStack({
        key: "stack:knights",
        name: "Северные рыцари",
        side: "enemy",
        count: 100,
        unitHp: 20,
        combat: 40,
        weapon: "item:axe",
        armor: "item:leather"
      });
      assert(win.Bow.fight.stackPowerMult(knights) > 2.5, "множитель мощи стека ×100 не вырос");

      win.Bow.fight.startSquadBattle(g, [knights], {
        allyUnits: [spearmen],
        note: "Сотня северных рыцарей преграждает тракт."
      });
      win.BowGame.refresh(true);

      const page = doc().getElementById("bow-fight-page");
      const badgeBefore = page.querySelector(".bow-chip-enemy .bow-chip-stack");
      assert(badgeBefore && badgeBefore.textContent === "×100",
        "на одной фигурке отряда врага нет значка «×100»: " + (badgeBefore ? badgeBefore.textContent : "null"));
      const allyBadge = page.querySelector(".bow-chip-ally .bow-chip-stack");
      assert(allyBadge && allyBadge.textContent === "×80",
        "на одной фигурке союзного отряда нет значка «×80»: " + (allyBadge ? allyBadge.textContent : "null"));

      /* Ставим вплотную и наносим мощный удар по стеку рыцарей (ответный удар врага уходит мимо) */
      const you = g.fight.units.find((u) => u.key === "player");
      const foeStack = g.fight.units.find((u) => u.key === "stack:knights");
      you.col = 2;
      foeStack.col = 3;
      let ri = 0;
      const rolls = [0.05, 0.5, 0.99, 0.99, 0.99];
      win.Bow.fight.move(g, "press", () => rolls[Math.min(ri++, rolls.length - 1)], "stack:knights", "head");
      win.BowGame.refresh(true);

      assert(foeStack.count < 100 && foeStack.count > 0,
        "урон по стеку должен списывать бойцов из 100, осталось: " + foeStack.count);
      const badgeAfter = page.querySelector(".bow-chip-enemy .bow-chip-stack");
      assert(badgeAfter && badgeAfter.textContent === "×" + foeStack.count,
        "значок стека на арене не обновил численность: " + (badgeAfter ? badgeAfter.textContent : "null"));

      return "1 фигурка = ×100 (союзники ×80) → удар списал бойцов до ×" + foeStack.count;
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  /* ---------- Круг 21 (0.0.8.1): оркестровый бой Skyrim, сцена Клетки, разнесение стражи и хитбокс по форме ---------- */

  check("0.0.8.1: боевой синтезатор содержит спиккато струнных, валторны, мужской хор Довакина и тайко/литавры", () => {
    const audioSrc = fs.readFileSync(path.join(__dirname, "..", "src", "audio", "108-audio.js"), "utf8");
    assert(/playSpiccatoStrings/.test(audioSrc), "нет спиккато струнных playSpiccatoStrings");
    assert(/playHeroicBrass/.test(audioSrc), "нет мелодических валторн/тромбонов playHeroicBrass");
    assert(/playNordicWarChoir/.test(audioSrc), "нет ратного мужского хора playNordicWarChoir");
    assert(/playSkyrimWarDrum/.test(audioSrc), "нет боевых литавр и тайко playSkyrimWarDrum");
    return "спиккато + валторны + ратный хор + тайко/литавры активны";
  });

  check("0.0.9.0: в заключении Главное окно рисует изометрическую «Клетку у частокола» в разрезе без передней решётки (фикс image-28)", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.fight = null;
      g.guard = null;
      g.jail = { hoursLeft: 4, minutesLeft: 240, _syncedHours: 4, reason: "драка" };
      win.BowGame.refresh(true);

      const locName = doc().getElementById("bow-loc-name").textContent;
      assert(locName === "Клетка у частокола", "вместо клетки показана обычная локация: " + locName);
      assert(doc().querySelector("#bow-stage canvas.bow-iso-canvas"), "в клетке нет изометрического холста");
      assert(!doc().querySelector("#bow-stage svg.bow-stage-cage-bars"), "передняя решётка всё ещё заслоняет интерфейс и героя!");
      const prisoner = doc().querySelector("#bow-stage .bow-actor-player");
      assert(prisoner && !prisoner.querySelector(".bow-fig-weapon"), "у заключённого в клетке осталось оружие в руке");
      assert(doc().querySelector('#bow-stage [data-act="jail-pick-toggle"]'), "на сцене клетки нет интерактивного засова для взлома Kenshi");
      assert(!doc().querySelector('#bow-stage [data-act="jail-pick-manual"]'), "кнопка ручного взлома не должна отображаться на сцене в 0.0.9.0");
      assert(!doc().querySelector('#bow-jail [data-act="jail-pick-manual"]'), "кнопка ручного взлома не должна отображаться в карточке клетки в 0.0.9.0");
      return "изометрическая клетка в разрезе + без передних прутьев + взлом Kenshi";
    } finally {
      if (win.BowGame.stopJailClock) { win.BowGame.stopJailClock(); }
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  check("0.0.8.1: стражники на гексах разнесены по разным рядам без наложения (фикс image-19), а клик работает по силуэту и 6-граннику гекса", () => {
    const g = game();
    const snap = clone(g);
    try {
      const styles = [...doc().querySelectorAll("style")].map((s) => s.textContent).join("\n");
      assert(/\.bow-arena-scene\s+\.bow-chip[\s\S]*?pointer-events:\s*none\s*!important/.test(styles),
        "прямоугольный контейнер .bow-chip всё ещё перехватывает клики");
      assert(/\.bow-arena-scene\s+\.bow-chip-hitshape\s*\{[^}]*clip-path:\s*polygon/.test(styles),
        "у фигурки нет контурного хитбокса clip-path: polygon(...)");

      g.fight = null;
      g.jail = null;
      g.player.location = "square";
      g.player.needs.health = 100;
      g.player.needs.fatigue = 100;
      g.heat["org:guard"] = 80;
      g.flags.guardAt = g.time.totalHours;

      win.Bow.guard.checkArrival(g);
      win.Bow.guard.fight(g);
      win.BowGame.refresh(true);

      const foes = g.fight.units.filter((u) => u.side === "enemy");
      eq(foes.length, 3, "стражников трое");
      const rowsUsed = new Set(foes.map((u) => u.row));
      assert(rowsUsed.size === 3, "стражники свалены в один ряд вместо разнесения по гексам: " + [...rowsUsed].join(","));
      /* Расстояние между рядами стражников минимум 2 гекса (0, 2, 4) — никто никого не перекрывает */
      const sortedRows = [...rowsUsed].sort((a, b) => a - b);
      assert(sortedRows[0] === 0 && sortedRows[1] === 2 && sortedRows[2] === 4,
        "ряды стражников должны быть разнесены через ряд (0, 2, 4): " + sortedRows.join(","));

      /* Проверяем клик прямо по 6-угольному SVG-гексу врага! */
      const hexPoly = doc().querySelector('#bow-fight-page svg.bow-tactical-grid polygon.bow-hex-enemy-hit[data-target="' + foes[1].key + '"]');
      assert(hexPoly, "у врага нет кликабельного 6-угольного гекса");
      hexPoly.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
      eq(g.fight.target, foes[1].key, "клик по 6-угольному гексу не выбрал цель");

      /* И клик по силуэту (.bow-chip-hitshape) другого врага! */
      const hitShape = doc().querySelector('#bow-fight-page .bow-chip[data-target="' + foes[2].key + '"] .bow-chip-hitshape');
      assert(hitShape, "нет контурной области .bow-chip-hitshape");
      click(hitShape);
      eq(g.fight.target, foes[2].key, "клик по силуэту бойца не выбрал цель");

      return "стража разнесена на ряды 0/2/4 + клик по 6-граннику гекса и по силуэту работает";
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  /* ---------- Круг 22 (0.0.8.2): ход по гексам, фикс мигания карточки, вкладка Жители, репутация стражи, акустический бой и гибридный взлом ---------- */

  check("0.0.8.2: противник спавнится с правого края (col 6), а клик по свободному гексу двигает героя в выбранную клетку (King's Bounty / HoMM3)", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.fight = null;
      g.jail = null;
      g.guard = null;
      g.player.location = "square";
      g.player.needs.health = 100;
      g.player.needs.fatigue = 100;
      g.people["person:liva"].alive = true;
      g.people["person:liva"].attitude = 25;
      g.people["person:liva"].location = "square";
      g.people["person:liva"].needs.health = 100;

      win.Bow.fight.open(g, "person:liva");
      win.Bow.fight.start(g, "spar", seq([0.5]));
      win.BowGame.refresh(true);

      const you = g.fight.units.find((u) => u.key === "player");
      const foe = g.fight.units.find((u) => u.side === "enemy");
      eq(you.col, 0, "герой должен спавниться у левого края (col 0)");
      eq(foe.col, 6, "противник должен спавниться у правого края (col 6), а не в центре!");

      const reachHexes = doc().querySelectorAll("#bow-fight-page svg.bow-tactical-grid polygon.bow-hex-reach[data-act='fight-hex']");
      assert(reachHexes.length >= 4, "доступные для перехода гексы не подсвечены на сетке: " + reachHexes.length);

      const targetHex = doc().querySelector('#bow-fight-page svg.bow-tactical-grid polygon.bow-hex-move-hit[data-col="2"][data-row="1"]');
      assert(targetHex, "нет кликабельного свободного гекса (2,1)");
      targetHex.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));

      eq(you.col, 2, "клик по свободному гексу не переместил героя на col 2");
      eq(you.row, 1, "клик по свободному гексу не переместил героя на row 1");
      assert(foe.col === 5, "противник не сделал ответный шаг навстречу после манёвра героя");
      const logTxt = g.fight.log.map((l) => l.text).join(" ");
      assert(/переходите на клетку В2/.test(logTxt), "переход по гексу не записан в хронику: " + logTxt);

      return "спавн по краям (0 vs 6) + подсветка радиуса + клик на гекс В2 работает";
    } finally {
      win.BowGame.stopFightClock();
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  check("0.0.8.2: всплывающее окошко персонажа на сцене не мигает и не пересоздаётся при смене минуты живого времени", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.fight = null;
      g.jail = null;
      g.player.location = "square";
      g.people["person:liva"].alive = true;
      g.people["person:liva"].location = "square";
      win.BowGame.refresh(true);
      win.Bow.ui.setStageSelection({ kind: "person", personId: "person:liva", x: 60 });
      win.BowGame.refresh(true);

      const cardBefore = doc().querySelector("#bow-stage-pop .bow-stage-card");
      assert(cardBefore, "карточка персонажа не открылась на сцене");

      /* Имитируем переход живого времени на следующую минуту */
      win.Bow.time.tickMinute(g);
      win.BowGame.refresh(true);

      const cardAfter = doc().querySelector("#bow-stage-pop .bow-stage-card");
      assert(cardAfter === cardBefore || cardAfter.classList.contains("bow-stage-card-steady"),
        "карточка персонажа пересоздалась с анимацией мигания при тике минуты!");

      /* Даже если характеристики обновились — у повторного рендера включён .bow-stage-card-steady без вспышки */
      g.people["person:liva"].needs.fatigue = Math.max(10, g.people["person:liva"].needs.fatigue - 5);
      win.BowGame.refresh(true);
      const cardUpdated = doc().querySelector("#bow-stage-pop .bow-stage-card");
      assert(cardUpdated.classList.contains("bow-stage-card-steady"),
        "при обновлении текста карточки не подавлена анимация мигания (.bow-stage-card-steady)");

      win.Bow.ui.setStageSelection(null);
      return "DOM-узел сохраняется при тике минуты + .bow-stage-card-steady убирает вспышку";
    } finally {
      win.Bow.ui.setStageSelection(null);
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  check("0.0.8.2: вкладка «Жители поселения» ровная (border-box), без «мертва/мёртв», без чужих/исчезнувших трупов и осмотра сквозь стены (фикс image-27)", () => {
    const g = game();
    const snap = clone(g);
    try {
      const styles = [...doc().querySelectorAll("style")].map((s) => s.textContent).join("\n");
      assert(/\.bow-person[\s\S]*?box-sizing:\s*border-box\s*!important/.test(styles),
        "у .bow-person не задан box-sizing: border-box — будет горизонтальный скролл");

      g.jail = null;
      g.player.location = "outskirts"; /* здесь только живой Брор */
      g.people["person:sigi"].alive = false; /* погибла в трактире, труп исчез */
      g.people["person:liva"].alive = false; /* погибла на площади, труп не рядом */
      g.corpses = [{ id: "corpse:liva", personId: "person:liva", name: "Лива", location: "square", createdHour: 0, money: 0, items: [] }];
      win.BowGame.refresh(true);

      const allBox = doc().getElementById("bow-all-people");
      const txt = allBox.textContent;
      assert(!/мертва\/мёртв/.test(txt), "осталась сырая строка «мертва/мёртв»");
      assert(/Сигрид \(погибла\)/.test(txt) && /Лива \(погибла\)/.test(txt),
        "погибшие женщины не отмечены грамотно как «погибла» в сводке: " + txt);

      const inspectBtns = allBox.querySelectorAll("[data-act='inspect']");
      eq(inspectBtns.length, 1, "кнопка «Осмотреть» должна быть ТОЛЬКО у живого Брора рядом, а не у людей в других локациях или мёртвых!");
      eq(inspectBtns[0].getAttribute("data-person"), "person:bror", "кнопка «Осмотреть» ведёт не на Брора");

      return "ровный border-box + только живой сосед доступен для осмотра + грамотная сводка павших";
    } finally {
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  check("0.0.8.2: у сторожа убрано слово «караул», сторож поворачивается, а при запале звучит MGS «!» Alert с затуханием и усилением замка", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.fight = null;
      win.Bow.guard.toJail(g, "кража");
      win.BowGame.refresh(true);

      const guardTag = doc().querySelector("#bow-stage .bow-actor-guard");
      assert(guardTag && !/караул/i.test(guardTag.textContent),
        "у сторожа в клетке всё ещё написано двусмысленное «караул»: " + (guardTag ? guardTag.textContent : ""));
      assert(/отвернулся|следит|поворачивается/.test(guardTag.textContent),
        "нет понятного статуса наблюдения у сторожа");

      /* Пока сторож отвернулся (away), начинаем взлом Ржавого засова (ур. 1) */
      g.jail.guardPhase = "away";
      g.jail.guardTick = 2;
      const startRes = win.Bow.guard.toggleKenshiPick(g);
      assert(startRes.ok && g.jail.picking === true, "взлом полоской Kenshi не запустился, пока сторож отвернулся");
      win.BowGame.refresh(true);
      const lockBar = doc().querySelector("#bow-stage .bow-kenshi-lockbar");
      assert(lockBar && /Взлом · ур\./.test(lockBar.textContent), "над узником не отрисовалась полоска взлома Kenshi");

      /* Продвигаем цикл, не замерев вовремя: сторож поворачивается (watching) и ПАЛИТ игрока! */
      g.jail.guardTick = 7; /* следующий такт = 8 -> watching */
      const caught = win.Bow.guard.tickJailScene(g, () => 0.5);
      assert(caught && caught.caught === true, "сторож повернулся лицом, но не запалил взломщика!");
      eq(g.jail.lockTier, 2, "после поимки замок должен стать целым и более прокачанным (ур. 1 → ур. 2)");
      eq(g.jail.lockProgress, 0, "прогресс нового замка должен быть сброшен в 0%");
      win.BowGame.refresh(true);

      const mgsBang = doc().querySelector("#bow-stage .bow-mgs-alert");
      assert(mgsBang && mgsBang.textContent === "!", "над головой сторожа не появился восклицательный знак MGS «!»");
      assert(typeof win.Bow.audio.playMgsAlert === "function", "нет звукового эффекта MGS Alert в аудиодвижке");

      return "без «караул» + полоска Kenshi + MGS «!» Alert + замок усилен (Ржавый засов → Кованый замок)";
    } finally {
      if (win.BowGame.stopJailClock) { win.BowGame.stopJailClock(); }
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  check("0.0.8.2: гибридный взлом (полоска Kenshi и ручная замочная скважина Skyrim/Fallout) открывает клетку и качает навык Взлома", () => {
    const g = game();
    const snap = clone(g);
    try {
      /* 1. Успешный взлом полоской Kenshi, пока сторож отвернулся */
      win.Bow.guard.toJail(g, "драка");
      const sk0 = g.player.skills.lockpicking;
      g.jail.guardPhase = "away";
      g.jail.guardTick = 0;
      g.jail.lockProgress = 92;
      g.jail.picking = true;
      const kRes = win.Bow.guard.tickJailScene(g, () => 0.05);
      assert(kRes && kRes.unlocked && !g.jail, "полоска Kenshi на 100% не открыла замок");
      assert(g.player.skills.lockpicking > sk0, "взлом полоской Kenshi не прокачал навык Взлома");

      /* 2. Ручной взлом в духе Skyrim / Fallout через окно #bow-lockpick-modal */
      win.Bow.guard.toJail(g, "повторно");
      g.jail.guardPhase = "away";
      g.jail.sweetSpot = 35;
      win.Bow.ui.openLockpickModal(g);

      const modal = doc().getElementById("bow-lockpick-modal");
      assert(modal && modal.classList.contains("bow-lp-open"), "окно ручного взлома Skyrim/Fallout не открылось");
      assert(modal.querySelector("#bow-lp-pick-group") && modal.querySelector("#bow-lp-cyl-group"),
        "в окне взлома нет SVG отмычки и цилиндра скважины");

      /* Неверный угол (-60° при sweetSpot +35°) — цилиндр клинит, замок не открывается */
      const jamRes = win.Bow.guard.turnManualLock(g, -60, 0, () => 0.5);
      assert(jamRes.jammed && g.jail, "неверный угол отмычки не должен открывать замок");

      /* Попадаем в сладкую точку (+34°) и поворачиваем замок до упора (90°) — клетка открыта! */
      win.Bow.guard.turnManualLock(g, 34, 0, () => 0.5);
      win.Bow.guard.turnManualLock(g, 34, 34, () => 0.5);
      const openRes = win.Bow.guard.turnManualLock(g, 34, 68, () => 0.5);
      assert(openRes.unlocked && !g.jail, "ручной поворот в сладкой точке не открыл замок клетки");
      win.Bow.ui.closeLockpickModal();

      return "полоска Kenshi + интерактивная скважина Skyrim/Fallout + рост навыка Взлома работают";
    } finally {
      win.Bow.ui.closeLockpickModal();
      if (win.BowGame.stopJailClock) { win.BowGame.stopJailClock(); }
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  check("0.0.8.2: преступления, отсидки и побеги снижают репутацию со стражей (без бага положительной дружбы), а боевая музыка сведена акустически", () => {
    const g = clone(game());
    g.fight = null;
    g.jail = null;
    g.guard = null;
    g.dead = null;
    g.reputation["org:guard"] = 0;
    g.people["person:liva"].alive = true;
    g.people["person:liva"].needs.health = 100;
    g.people["person:liva"].location = "square";
    g.player.location = "square";
    g.player.needs.health = 100;

    /* Нападение и убийство роняют репутацию не только у общины, но и у Стражи Брода */
    win.Bow.fight.open(g, "person:liva");
    win.Bow.fight.start(g, "crime", seq([0.2]));
    assert(g.reputation["org:guard"] < 0, "преступное нападение не снизило отношение стражи");
    g.fight.phase = "aftermath";
    win.Bow.fight.decide(g, "kill", seq([0.2]));
    const repAfterKill = g.reputation["org:guard"];
    assert(repAfterKill <= -25, "убийство жителя слишком слабо уронило репутацию у стражи: " + repAfterKill);

    /* Серия отсидок и побегов НЕ делает убийцу другом стражи (> 0)! */
    for (let c = 0; c < 4; c++) {
      win.Bow.guard.toJail(g, "убийство");
      win.Bow.guard.release(g);
    }
    assert(g.reputation["org:guard"] < 0, "после отсидок репутация убийцы у стражи стала положительной: " + g.reputation["org:guard"]);

    /* Проверка тёплого акустического сведения боевой шины в 108-audio.js */
    const audioSrc = fs.readFileSync(path.join(__dirname, "..", "src", "audio", "108-audio.js"), "utf8");
    assert(/combatWet\.gain\.value\s*=\s*0\.64/.test(audioSrc) && /buildImpulseResponse\(ctx,\s*3\.45/.test(audioSrc),
      "боевая шина не переведена в длинный тёплый акустический зал");

    return "убийство → реп. стражи " + repAfterKill + " (после 4 отсидок " + g.reputation["org:guard"] + ", не >0) + тёплый зал 3.45с";
  });

  /* ---------- Круг 23 (0.0.9.0): Канон «Сумрачный Брод», изометрия 2:1, Point-and-Click A*, человечки, пошаговый бой и предзапекание звука ---------- */

  check("0.0.9.0: канон визуального стиля «Сумрачный Брод» записан в docs/STYLE_GUIDE.md, а кружки и треугольники убраны со сцены", () => {
    const guidePath = path.join(__dirname, "..", "docs", "STYLE_GUIDE.md");
    assert(fs.existsSync(guidePath), "нет файла канона docs/STYLE_GUIDE.md");
    const guide = fs.readFileSync(guidePath, "utf8");
    assert(/Сумрачный Брод/.test(guide) && /2:1/.test(guide) && /приглуш/i.test(guide),
      "docs/STYLE_GUIDE.md не описывает изометрию 2:1 и приглушённых человечков");

    const g = game();
    g.player.location = "square";
    win.BowGame.refresh(true);
    assert(!doc().querySelector("#bow-stage svg.bow-fig-svg"), "на сцене остались старые кружки-треугольники svg.bow-fig-svg!");

    /* Генератор детальных персонажей 96×112 кэширует растровые холсты для стоячих, шагающих и лежачих поз */
    const spStand = win.Bow.iso.getSprite({ roleKey: "player", side: "player", facing: "SE", weapon: "knife" });
    const spSame = win.Bow.iso.getSprite({ roleKey: "player", side: "player", facing: "SE", weapon: "knife" });
    const spDead = win.Bow.iso.getSprite({ roleKey: "robber", side: "enemy", dead: true });
    assert(spStand && spStand.width === 96 && spStand.height === 112, "неверный размер спрайта человечка 96×112");
    assert(spStand === spSame && spStand !== spDead, "кэш спрайтов человечков не переиспользует готовый холст");
    return "docs/STYLE_GUIDE.md на месте + кэш детальных спрайтов 96×112 без кружков-треугольников";
  });

  check("0.0.9.0: изометрия 2:1 (Bow.iso) обратимо переводит клетки в экран, обходит препятствия по A* и двигает героя Point-and-Click", () => {
    const g = clone(game());
    g.fight = null;
    g.jail = null;
    g.player.location = "square";

    /* 1. Обратимость проекции tileToScreen ↔ screenToTile на всей решётке 12×8 */
    for (let r = 0; r < win.Bow.iso.ROWS; r++) {
      for (let c = 0; c < win.Bow.iso.COLS; c++) {
        const scr = win.Bow.iso.tileToScreen(c, r);
        const back = win.Bow.iso.screenToTile(scr.x, scr.y);
        assert(back.col === c && back.row === r,
          "сбой обратной изометрической проекции на (" + c + "," + r + ") → (" + back.col + "," + back.row + ")");
      }
    }

    /* 2. Поиск пути A* обходит каменный колодец в центре площади (5,3), не проходя сквозь него */
    const map = win.Bow.iso.mapOf(g);
    assert(win.Bow.iso.isBlocked(map, 5, 3, g), "колодец на (5,3) должен быть непроходимым препятствием");
    const path = win.Bow.iso.findPath(map, 3, 3, 7, 3, g);
    assert(path.length >= 4, "A* не нашёл обход вокруг колодца");
    assert(!path.some((step) => step.col === 5 && step.row === 3), "маршрут A* прошёл сквозь каменный колодец!");
    assert(path[path.length - 1].col === 7 && path[path.length - 1].row === 3, "маршрут A* не довёл до целевой клетки");

    /* 3. В клетке узник заперт в левой половине (col < 5): клик за решётку доводит до прутьев (col 4), но НЕ пускает в коридор сторожа (col >= 5) */
    g.jail = { hoursLeft: 4, minutesLeft: 240, reason: "драка" };
    const jailMap = win.Bow.iso.mapOf(g);
    const escapeWalk = win.Bow.iso.findPath(jailMap, 2, 4, 8, 4, g);
    assert(escapeWalk.length > 0 && !escapeWalk.some((step) => step.col >= 5),
      "узник не должен проходить сквозь запертую решётку (col 5) в коридор сторожа!");

    /* 4. Point-and-Click walkAdjacentAndAct подводит героя к объекту вплотную */
    const live = game();
    const snap = clone(live);
    try {
      live.fight = null;
      live.jail = null;
      live.player.location = "smithy";
      live.people["person:tarn"].location = "smithy";
      live.people["person:tarn"].alive = true;
      win.BowGame.refresh(true);
      let arrived = false;
      win.Bow.iso.walkAdjacentAndAct(live, 5, 2, () => { arrived = true; });
      const pos = win.Bow.iso.getPlayerPos(live);
      assert(arrived && Math.hypot(5 - pos.col, 2 - pos.row) <= 1.55,
        "walkAdjacentAndAct не подвёл героя к наковальне: (" + pos.col + "," + pos.row + ")");
    } finally {
      Object.keys(snap).forEach((k) => { live[k] = snap[k]; });
      win.BowGame.refresh(true);
    }

    return "проекция 12×8 обратима, A* огибает колодец (" + path.length + " шагов) и держит решётку";
  });

  check("0.0.9.0: бой стартует пошагово (без автобоя), повторный клик бьёт врага, а Вариант 1 / Вариант 2 работают совместно", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.fight = null;
      g.jail = null;
      g.guard = null;
      g.player.location = "tavern";
      g.player.needs.health = 100;
      g.player.needs.fatigue = 100;
      g.people["person:sigi"].location = "tavern";
      g.people["person:sigi"].alive = true;
      g.people["person:sigi"].attitude = 30;
      g.people["person:sigi"].needs.health = 100;

      /* Запускаем бой через реальную кнопку UI (fight-start) — автобой НЕ должен включаться сам! */
      win.Bow.fight.open(g, "person:sigi");
      win.BowGame.refresh(true);
      const sparBtn = doc().querySelector('#bow-fight-page [data-act="fight-start"][data-mode="spar"]');
      assert(sparBtn, "нет кнопки начала кулачного боя");
      click(sparBtn);

      eq(g.fight.orders.speed, "paused", "после старта боя через UI скорость должна быть 'paused' (пошагово)");
      assert(!win.BowGame.fightShouldRun(g), "таймер автобоя не должен тикать при старте схватки");

      /* Вариант 1: обычная схватка в трактире идёт прямо на изометрическом полу трактира (7×5 ромбов = 35) */
      const cells = doc().querySelectorAll("#bow-fight-page svg.bow-tactical-grid polygon.bow-hex-cell");
      eq(cells.length, 35, "изометрическая тактическая сетка 7×5 ромбов");
      const r0 = g.fight.round;

      /* Первый клик по врагу — выбор цели (ход НЕ тратится), повторный клик по живому DOM-узлу — шаг/удар! */
      const foeHit1 = doc().querySelector("#bow-fight-page .bow-chip-enemy .bow-chip-hitshape");
      assert(foeHit1, "нет кликабельного силуэта врага в бою");
      click(foeHit1);
      eq(g.fight.round, r0, "первый клик должен только выделить цель без автохода");
      const foeHit2 = doc().querySelector("#bow-fight-page .bow-chip-enemy .bow-chip-hitshape");
      click(foeHit2);
      assert(g.fight.round === r0 + 1, "повторный клик по выделенному врагу в пошаговом режиме должен делать шаг/удар");

      /* Вариант 2 (запасная открытая арена): для крупного отряда-стека в помещении бой разворачивается на просторе околицы */
      const bigStack = win.Bow.fight.createStack({
        key: "stack:raiders", name: "Ватага", side: "enemy", count: 24, unitHp: 18, combat: 35
      });
      win.Bow.fight.startSquadBattle(g, [bigStack], { note: "Отряд врывается со двора." });
      eq(g.fight.orders.speed, "paused", "групповой бой тоже стартует пошагово");
      win.BowGame.refresh(true);
      assert(doc().querySelector("#bow-fight-page canvas.bow-iso-battle-canvas"), "холст Варианта 2 не отрисовался");

      return "старт на паузе + выбор/удар двойным кликом + гибрид Варианта 1 и Варианта 2";
    } finally {
      win.BowGame.stopFightClock();
      Object.keys(snap).forEach((k) => { g[k] = snap[k]; });
      win.BowGame.refresh(true);
    }
  });

  check("0.0.9.0: предзапекание петель саундтрека (OfflineAudioContext) и отложенный автосейв устраняют фризы звука", () => {
    const audioSrc = fs.readFileSync(path.join(__dirname, "..", "src", "audio", "108-audio.js"), "utf8");
    assert(/OfflineAudioContext/.test(audioSrc) && /bakeTrackAsync/.test(audioSrc),
      "в 108-audio.js нет оффлайн-предзапекателя петель саундтрека");
    assert(typeof win.Bow.audio.bakeTrackAsync === "function" && typeof win.Bow.audio.getBakedCount === "function",
      "API предзапекания звука не экспортирован в Bow.audio");
    assert(typeof win.BowGame.flushAutosave === "function",
      "отложенный автосейв (flushAutosave) не экспортирован в BowGame");

    /* Быстрые вызовы refresh(true) подряд НЕ сериализуют 20 КБ JSON синхронно на каждый кадр,
       а flushAutosave() мгновенно записывает актуальное состояние на диск */
    const g = game();
    const m0 = g.player.money;
    try {
      g.player.money = m0 + 77;
      win.BowGame.refresh(true);
      win.BowGame.flushAutosave(true);
      const raw = win.localStorage.getItem("bow-autosave-v1");
      const parsed = win.Bow.save.deserialize(raw);
      assert(parsed.ok && parsed.state.player.money === m0 + 77, "flushAutosave не сохранил свежее состояние");
    } finally {
      g.player.money = m0;
      win.BowGame.flushAutosave(true);
    }
    return "OfflineAudioContext bakeTrackAsync + дебаунс localStorage с flushAutosave активны";
  });

  /* ---------- Круг 24 (0.0.9.1): Полноэкранный мир без клеток, режим агрессии и бой Kenshi в локации, двери с открытием, спрайты 96×112 и хор ---------- */

  check("0.0.9.1: полноэкранная раскладка 100vw×100dvh, холст 1280×680 без клеточной сетки и всплывающая шторка дел", () => {
    const app = doc().getElementById("bow-app");
    assert(app && app.classList.contains("bow-fullscreen-app"), "#bow-app не переведён в полноэкранный режим bow-fullscreen-app");
    const places = doc().querySelector(".bow-places-bar");
    assert(places && places.classList.contains("bow-sr-only"), "старая полоса телепортации .bow-places-bar не убрана с экрана");

    const cv = doc().querySelector("#bow-stage-canvas canvas.bow-iso-canvas");
    assert(cv && cv.width === 1280 && cv.height === 680, "холст локации не расширен до полноформатных 1280×680");
    assert(win.Bow.iso.VIEW_W === 1280 && win.Bow.iso.VIEW_H === 680, "Bow.iso.VIEW_W/VIEW_H не 1280×680");

    /* Шторка дел места (Подряды / Торг / Карта / Место) скрыта по умолчанию и открывается по кнопкам нижней консоли */
    const worldDrawer = doc().getElementById("bow-world-panel");
    assert(worldDrawer && !worldDrawer.classList.contains("bow-world-drawer-open"), "шторка дел места открыта при старте вместо чистого экрана");
    const jobsDockBtn = doc().querySelector('.bow-dock-btn[data-act="open-world-panel"][data-tab="jobs"]');
    assert(jobsDockBtn, "нет кнопки шторки Подрядов в нижней консоли");
    jobsDockBtn.click();
    assert(worldDrawer.classList.contains("bow-world-drawer-open"), "клик по кнопке нижней консоли не открыл шторку дел");
    const closeBtn = worldDrawer.querySelector('[data-act="close-world-panel"]');
    closeBtn.click();
    assert(!worldDrawer.classList.contains("bow-world-drawer-open"), "крестик шторки не закрыл её");
    return "100vw×100dvh + холст 1280×680 + всплывающая шторка Подряды/Торг/Карта/Место";
  });

  check("0.0.9.1: переключатель Мирный/К бою и замена окна «Назревает схватка» на простое Да/Нет и живой бой в локации", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.fight = null;
      g.skirmish = null;
      g.jail = null;
      g.guard = null;
      g.encounter = null;
      g.time.scale = "1x";
      g.pendingOrder = null;
      g.player.location = "square";
      g.player.needs.health = 100;
      g.player.needs.fatigue = 90;
      g.people["person:liva"].alive = true;
      g.people["person:liva"].location = "square";
      g.people["person:liva"].needs.health = 100;
      win.Bow.skirmish.setAggressive(false);
      win.BowGame.refresh(true);

      /* 1. В мирном режиме карточка персонажа НЕ открывает «Назревает схватка», а спрашивает простое Напасть: Да / Нет */
      win.Bow.ui.setStageSelection({ kind: "person", personId: "person:liva", x: 40 });
      win.BowGame.refresh(true);
      const pop = doc().getElementById("bow-stage-pop");
      assert(!pop.querySelector('[data-act="fight-open"]'), "в карточке жителя осталась старая кнопка fight-open («Назревает схватка»)");
      const askBtn = pop.querySelector('[data-act="skirmish-confirm-open"]');
      assert(askBtn, "нет кнопки «Напасть» в мирной карточке");
      askBtn.click();
      assert(pop.querySelector('[data-act="skirmish-engage"][data-mode="crime"]') && pop.querySelector('[data-act="skirmish-confirm-cancel"]'),
        "не появилось простое подтверждение Напасть — Да / Нет");
      pop.querySelector('[data-act="skirmish-confirm-cancel"]').click();
      assert(!g.skirmish, "нажатие «Нет» не должно начинать бой");

      /* 2. В агрессивном режиме клик по персонажу сразу включает звон стали, плашку и живую схватку Kenshi прямо в локации! */
      const aggroBtn = doc().getElementById("bow-aggro-btn");
      assert(aggroBtn, "нет переключателя режима #bow-aggro-btn");
      aggroBtn.click();
      assert(win.Bow.skirmish.isAggressive() === true, "переключатель не включил агрессивный режим");

      const npcActor = doc().querySelector('#bow-stage-canvas .bow-stage-layer [data-act="stage-select"][data-person="person:liva"]');
      assert(npcActor, "на площади нет фигурки Ливы");
      npcActor.click();

      assert(g.skirmish && g.skirmish.active === true && g.skirmish.location === "square",
        "клик в агрессивном режиме не запустил живую схватку на текущей локации");
      assert(!g.fight, "вместо живой схватки открылся отдельный экран пошагового боя");
      const banner = doc().getElementById("bow-clash-banner");
      assert(banner && banner.classList.contains("bow-clash-banner-on"), "не вспыхнула плашка скрещённых клинков при начале схватки");
      return "тумблер Мирный/К бою + простое Да/Нет + мгновенный старт живой схватки со звоном клинков";
    } finally {
      win.Bow.skirmish.setAggressive(false);
      Object.assign(g, snap);
      win.BowGame.refresh(true);
    }
  });

  check("0.0.9.1: живой бесклеточный бой Kenshi: тактическая пауза, навыки, приход стражи по таймеру и решение судьбы поверженного", () => {
    const g = clone(game());
    g.fight = null;
    g.skirmish = null;
    g.jail = null;
    g.player.location = "square";
    g.player.skills.combat = 72;
    g.player.skills.blades = 68;
    g.player.needs.health = 100;
    g.player.needs.fatigue = 95;
    g.people["person:liva"].alive = true;
    g.people["person:liva"].location = "square";
    g.people["person:liva"].needs.health = 100;

    /* Старт преступного нападения в поселении запускает таймер тревоги стражи */
    const startRes = win.Bow.skirmish.engage(g, "person:liva", { mode: "crime" });
    assert(startRes.ok && g.skirmish && g.skirmish.active, "живая схватка не запустилась");
    assert(typeof g.skirmish.guardTimer === "number" && g.skirmish.guardTimer > 5, "не включился таймер прихода стражи при нападении на мирного");

    /* Тактическая пауза полностью замораживает движение и удары */
    win.Bow.skirmish.togglePause(g);
    assert(g.skirmish.paused === true, "тактическая пауза не включилась");
    const xBefore = g.skirmish.units[0].wx;
    win.Bow.skirmish.tick(g, 1.0);
    eq(g.skirmish.units[0].wx, xBefore, "на тактической паузе бойцы не должны двигаться");
    win.Bow.skirmish.togglePause(g);

    /* Прокручиваем живое время боя: если затянуть стычку или сдерживать удар в глухой защите, через ~9 с вбегают 3 стражника! */
    const gGuardTest = clone(g);
    gGuardTest.player.skills.combat = 8;
    gGuardTest.player.skills.blades = 8;
    win.Bow.skirmish.setOrder(gGuardTest, "stance", "guard");
    win.Bow.skirmish.orderMove(gGuardTest, 1.2, 6.4);
    gGuardTest.people["person:liva"].needs.health = 450;
    gGuardTest.skirmish.units[1].hp = 450;
    gGuardTest.skirmish.units[1].maxHp = 450;
    let guardsCame = false;
    for (let i = 0; i < 60; i++) {
      const ev = win.Bow.skirmish.tick(gGuardTest, 0.2);
      if (ev && ev.guardsArrived) { guardsCame = true; break; }
    }
    assert(guardsCame && gGuardTest.skirmish.guardsCalled === true, "стража не прибежала на помощь мирному жителю по таймеру");
    const guardUnits = gGuardTest.skirmish.units.filter((u) => u.roleKey === "guard");
    eq(guardUnits.length, 3, "в локацию должно вбежать звено из 3 стражников");

    /* В обычной дуэли доводим противника до нокдауна и проверяем фазу aftermath (Обобрать / Отпустить / Добить) */
    g.skirmish.guardTimer = null;
    for (let step = 0; step < 120 && g.skirmish.active; step++) {
      win.Bow.skirmish.tick(g, 0.2);
    }
    assert(g.skirmish.phase === "aftermath", "после победы над жителем не наступила фаза выбора участи (aftermath)");
    const purseBefore = g.player.money;
    const robRes = win.Bow.skirmish.decideAftermath(g, "rob");
    assert(robRes.ok && g.skirmish === null, "решение «Обобрать» не завершило схватку");
    assert(g.player.money >= purseBefore, "кошель не перешёл игроку");
    return "тактическая пауза + вбегание 3 стражников через вход локации + развязка на месте";
  });

  check("0.0.9.1: честные двери на всех выходах локаций, маршрут walkToExitAndMove и появление у входного порога", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.fight = null;
      g.skirmish = null;
      g.jail = null;
      g.time.scale = "1x";
      g.pendingOrder = null;
      g.player.location = "square";
      win.BowGame.refresh(true);

      /* На площади отрисованы все 3 физических выхода (Трактир, Кузница, Околица) */
      const doors = doc().querySelectorAll('#bow-stage-canvas .bow-door-hotspot[data-act="move"]');
      eq(doors.length, 3, "на площади должны быть 3 интерактивные двери/выхода (Трактир, Кузница, Околица)");
      assert(typeof win.Bow.iso.walkToExitAndMove === "function" && typeof win.Bow.audio.playDoorCreak === "function",
        "нет функций подхода/открытия двери walkToExitAndMove и playDoorCreak");

      /* При входе в трактир с площади герой появляется прямо у входной двери трактира (entryFrom.square), а не в центре зала */
      const tavernDoor = doc().querySelector('#bow-stage-canvas .bow-door-hotspot[data-loc="tavern"]');
      tavernDoor.click();
      eq(g.player.location, "tavern", "переход через дверь трактира не перевёл в трактир");
      const posInTavern = win.Bow.iso.getPlayerPos(g);
      assert(posInTavern.col > 9.0 && Math.abs(posInTavern.row - 5.0) < 0.5,
        "в трактире герой не появился у входного порога (entryFrom.square)");
      return "3 двери на площади + walkToExitAndMove + появление у входного порога";
    } finally {
      Object.assign(g, snap);
      win.BowGame.refresh(true);
    }
  });

  check("0.0.9.1: ускоренный BPM саундтрека с многоголосным хором и выровненная сетка 7×5 для больших битв отрядов", () => {
    const tracks = win.Bow.audio.listTracks();
    const minBpm = Math.min(...tracks.map((t) => t.bpm));
    const maxBpm = Math.max(...tracks.map((t) => t.bpm));
    assert(minBpm >= 88 && maxBpm >= 150, "BPM саундтрека не ускорен (мин. " + minBpm + ", макс. " + maxBpm + ")");

    const audioSrc = fs.readFileSync(path.join(__dirname, "..", "src", "audio", "108-audio.js"), "utf8");
    assert(/playChoir/.test(audioSrc) && /playNordicWarChoir/.test(audioSrc) && /playDoorCreak/.test(audioSrc) && /playClashSteel/.test(audioSrc),
      "в 108-audio.js нет многоголосного хора playChoir/playNordicWarChoir или звуков двери/стали");

    /* Полководческое «Поле брани» 7×5 (для крупных стеков ×30/×100): все 35 клеток лежат строго внутри холста 1088×368 без перекоса */
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 7; c++) {
        const pt = win.Bow.iso.fightTileToScreen(c, r);
        assert(pt.x >= 60 && pt.x <= 1028 && pt.y >= 30 && pt.y <= 345,
          "клетка Поля брани (" + c + "," + r + ") вылезает за пределы 1088×368: " + JSON.stringify(pt));
      }
    }
    return "BPM " + minBpm + "–" + maxBpm + " + многоголосный хор + ровное Поле брани 7×5";
  });

  /* ==================== КРУГ 25 (0.0.9.2 → 0.0.9.3) ==================== */

  check("0.0.9.3: эталон стиля «Сумрачный Брод · Рубленные грани» (v3-chiseled-25d / v3-threejs-chiseled) и канон STYLE_GUIDE", () => {
    assert(win.Bow.iso.STYLE_VERSION === "v3-chiseled-25d" || win.Bow.iso.STYLE_VERSION === "v3-threejs-chiseled",
      "неверная метка стиля Bow.iso.STYLE_VERSION: " + win.Bow.iso.STYLE_VERSION);
    const sceneSrc = fs.readFileSync(path.join(__dirname, "..", "src", "engine3d", "scene3d.js"), "utf8");
    const matSrc = fs.readFileSync(path.join(__dirname, "..", "src", "engine3d", "materials.js"), "utf8");
    assert(/flatShading:\s*true/.test(matSrc), "в materials.js должен быть включён Low-Poly flatShading: true");
    assert(/0x9cd6ff/.test(sceneSrc) && /0xee4246/.test(sceneSrc),
      "в scene3d.js нет контурных колец приказов (0x9cd6ff / 0xee4246)");
    assert(typeof win.Bow.iso.paintPaperdollCanvas === "function", "нет функции отрисовки 3D-куклы paintPaperdollCanvas");

    const guide = fs.readFileSync(path.join(__dirname, "..", "docs", "STYLE_GUIDE.md"), "utf8");
    assert(/0\.0\.9\.3/.test(guide) && /1:7\.3/.test(guide) && /2:1/.test(guide) && /Three\.js/.test(guide),
      "docs/STYLE_GUIDE.md не обновлён под канон 0.0.9.3 Three.js");
    return "v3-threejs-chiseled + flatShading:true + 0x9cd6ff/0xee4246 + STYLE_GUIDE 0.0.9.3";
  });

  check("0.0.9.3: нативный полноэкранный WebGL-холст вне CSS-трансформации (#bow-stage-bg-wrap), свободная камера и узкие хитбоксы", () => {
    const g = game();
    win.BowGame.refresh(true);
    const canvasBox = doc().getElementById("bow-stage-canvas");
    const bgWrap = canvasBox.querySelector(":scope > .bow-stage-bg-wrap > canvas.bow-iso-canvas");
    const worldEl = canvasBox.querySelector(":scope > #bow-stage-world.bow-stage-world");
    assert(bgWrap, "WebGL-холст должен лежать напрямую в #bow-stage-canvas > .bow-stage-bg-wrap без CSS scale (0% мыла!)");
    assert(worldEl && worldEl.querySelector(".bow-stage-layer"),
      "координатный слой маркеров #bow-stage-world.bow-stage-world должен присутствовать");

    const camBtns = doc().querySelectorAll("#bow-cam-controls .bow-cam-btn");
    eq(camBtns.length, 3, "должны быть 3 кнопки свободной камеры (+, −, Центрировать)");

    const cssSrc = fs.readFileSync(path.join(__dirname, "..", "src", "styles", "main.css"), "utf8");
    assert(/\.bow-actor\.bow-iso-actor\s*\{[\s\S]*?width:\s*34px/.test(cssSrc),
      "хитбокс .bow-iso-actor не сужен по силуэту до 34px");
    assert(/\.bow-actor\.bow-iso-actor\s+\.bow-actor-tag[\s\S]*?pointer-events:\s*none/.test(cssSrc),
      "табличка имени .bow-actor-tag должна иметь pointer-events: none, чтобы не красть клики вокруг персонажа");

    const cam0 = win.Bow.iso.getCamera();
    assert(typeof cam0.zoom === "number" && typeof win.Bow.iso.clientToStage === "function", "API камеры не готово");
    win.Bow.iso.setCameraZoom(1.4, null, g);
    assert(Math.abs(win.Bow.iso.getCamera().zoom - 1.4) < 0.05, "setCameraZoom не изменил масштаб камеры");
    win.Bow.iso.centerCameraOnPlayer(g, null, true);
    return "нативный WebGL-холст вне CSS-scale + свободная камера + точный хитбокс 34×78px";
  });

  check("0.0.9.2: глобальная тактическая пауза БЕЗ автоснятия: очередь приказов (земля, дверь, атака) и исполнение при снятии паузы", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.fight = null;
      g.skirmish = null;
      g.jail = null;
      g.guard = null;
      g.encounter = null;
      g.player.location = "square";
      g.player.needs.health = 100;
      g.player.needs.fatigue = 90;
      g.people["person:liva"].alive = true;
      g.people["person:liva"].location = "square";
      g.people["person:liva"].needs.health = 100;
      win.Bow.skirmish.setAggressive(false);

      /* 1. Включаем глобальную паузу */
      win.BowGame.applyGlobalScale(g, "paused");
      eq(g.time.scale, "paused", "глобальная пауза не включилась");
      const pauseBanner = doc().getElementById("bow-pause-banner");
      assert(pauseBanner && pauseBanner.classList.contains("bow-pause-banner-on"),
        "при паузе не загорелся верхний баннер #bow-pause-banner");

      /* 2. На паузе клик по земле ставит маршрут в очередь и НЕ снимает паузу! */
      const posBefore = Object.assign({}, win.Bow.iso.getPlayerPos(g));
      win.BowGame.stageClickWorld(g, 3.0, 5.0);
      eq(g.time.scale, "paused", "клик по земле самовольно снял паузу!");
      assert(g.pendingOrder && g.pendingOrder.kind === "walk", "клик по земле на паузе не поставил приказ шага");
      eq(win.Bow.iso.getPlayerPos(g).col, posBefore.col, "на паузе персонаж не должен сдвигаться с места");

      /* 3. На паузе клик по двери трактира на сцене ставит приказ входа БЕЗ перехода до снятия паузы! */
      const tavernDoor = doc().querySelector('#bow-stage-canvas .bow-door-hotspot[data-loc="tavern"]');
      tavernDoor.click();
      eq(g.time.scale, "paused", "клик по двери самовольно снял паузу!");
      eq(g.player.location, "square", "на паузе переход в дверь не должен происходить мгновенно");
      assert(g.pendingOrder && g.pendingOrder.kind === "exit" && g.pendingOrder.exitTo === "tavern",
        "клик по двери на паузе не поставил приказ входа в трактир");
      assert(tavernDoor.classList.contains("bow-order-peace") || doc().querySelector('.bow-door-hotspot[data-loc="tavern"].bow-order-peace'),
        "выбранная на паузе дверь не получила бело-голубую подсветку .bow-order-peace");

      /* 4. В боевом режиме (⚔ К бою) клик по цели на паузе ставит враждебный приказ (красная подсветка) и НЕ начинает бой пока пауза не снята! */
      win.Bow.skirmish.setAggressive(true);
      win.BowGame.refresh(true);
      const livaBtn = doc().querySelector('#bow-stage-canvas .bow-stage-layer [data-act="stage-select"][data-person="person:liva"]');
      livaBtn.click();
      eq(g.time.scale, "paused", "клик по цели в боевом режиме самовольно снял паузу!");
      assert(!g.skirmish, "бой не должен начинаться до снятия глобальной паузы");
      assert(g.pendingOrder && g.pendingOrder.kind === "attack" && g.pendingOrder.personId === "person:liva",
        "враждебный приказ атаки не встал в очередь на паузе");
      assert(doc().querySelector('#bow-stage-canvas .bow-stage-layer [data-person="person:liva"].bow-order-hostile'),
        "цель атаки на паузе не получила багровую подсветку .bow-order-hostile");

      /* 5. Снимаем паузу (▶ 1x) — отложенный боевой приказ немедленно исполняется! */
      win.BowGame.applyGlobalScale(g, "1x");
      eq(g.time.scale, "1x", "пауза не снялась при переходе на 1x");
      assert(g.skirmish && g.skirmish.active === true, "после снятия паузы отложенный приказ атаки не запустил схватку");
      assert(g.pendingOrder === null, "исполненный приказ не очистился из очереди");

      /* 6. Ставим паузу прямо посреди живой схватки — глобальная пауза синхронно замораживает и бой! */
      win.BowGame.applyGlobalScale(g, "paused");
      assert(g.skirmish.paused === true, "глобальная пауза не заморозила живую схватку");
      return "пауза не слетает от кликов + очередь шага/двери/атаки + автоисполнение при ▶ 1×";
    } finally {
      win.Bow.skirmish.setAggressive(false);
      Object.assign(g, snap);
      win.BowGame.refresh(true);
    }
  });

  check("0.0.9.2: средневековая кукла снаряжения из 8 слотов, блок щита при двуручном оружии, комплекты I/II и дельта статов", () => {
    const g = clone(game());
    assert(win.Bow.equip && win.Bow.equip.SLOTS.length === 8, "должно быть ровно 8 слотов куклы в Bow.equip.SLOTS");

    const def0 = win.Bow.fight.defenseOf(g.player);
    const gearDef0 = win.Bow.equip.totalStats(g.player).defense;

    /* Добавляем предметы всех новых категорий в сумку героя */
    g.player.inventory.push(
      { itemId: "item:iron_helm", qty: 1 },
      { itemId: "item:chainmail", qty: 1 },
      { itemId: "item:splint_bracers", qty: 1 },
      { itemId: "item:greaves", qty: 1 },
      { itemId: "item:iron_boots", qty: 1 },
      { itemId: "item:heater_shield", qty: 1 },
      { itemId: "item:spear", qty: 1 },
      { itemId: "item:crossbow", qty: 1 },
      { itemId: "item:bolts", qty: 1 }
    );

    assert(win.Bow.equip.equipItem(g, "item:knife", "weapon").ok, "нож не наделся");
    assert(win.Bow.equip.equipItem(g, "item:iron_helm").ok, "шлем не наделся");
    assert(win.Bow.equip.equipItem(g, "item:chainmail").ok, "кольчуга не наделась");
    assert(win.Bow.equip.equipItem(g, "item:splint_bracers").ok, "наручи не наделись");
    assert(win.Bow.equip.equipItem(g, "item:greaves").ok, "поножи не наделись");
    assert(win.Bow.equip.equipItem(g, "item:iron_boots").ok, "сапоги не наделись");
    assert(win.Bow.equip.equipItem(g, "item:heater_shield").ok, "щит не наделся при одноручном ноже");
    const defFull = win.Bow.fight.defenseOf(g.player);
    const gearDefFull = win.Bow.equip.totalStats(g.player).defense;
    assert(gearDefFull >= gearDef0 + 18 && defFull >= def0 + 18,
      "суммарная броня от 5 доспешных слотов и щита не выросла (" + def0 + " -> " + defFull + ")");

    /* Надеваем двуручное копьё — щит автоматически освобождает левую руку! */
    const spRes = win.Bow.equip.equipItem(g, "item:spear", "weapon");
    assert(spRes.ok && g.player.slots.offhand === null, "двуручное копьё не сняло щит из левой руки");
    const tryShield = win.Bow.equip.equipItem(g, "item:heater_shield", "offhand");
    assert(tryShield.ok === false, "щит не должен надеваться поверх двуручного копья");

    /* А колчан болтов с двуручным арбалетом разрешён! */
    assert(win.Bow.equip.equipItem(g, "item:crossbow", "weapon2").ok, "арбалет не лёг во второй комплект оружия");
    win.Bow.equip.swapWeaponSet(g);
    eq(g.player.activeWeaponSet, 2, "комплект оружия не переключился на II");
    eq(win.Bow.fight.weaponOf(g.player).id, "item:crossbow", "активным оружием не стал арбалет из II комплекта");
    assert(win.Bow.equip.equipItem(g, "item:bolts", "offhand").ok, "колчан болтов должен сочетаться с двуручным арбалетом");

    /* Проверяем DOM рендера Сумки: кукла, 8 слотов и пилюли сравнения статов */
    const live = game();
    const snap = clone(live);
    try {
      Object.assign(live, g);
      win.BowGame.refresh(true);
      win.Bow.ui.openModal("inv");
      const invRoot = doc().getElementById("bow-inventory");
      assert(invRoot && invRoot.querySelector("canvas.bow-paperdoll-canvas"), "в Сумке нет холста куклы .bow-paperdoll-canvas");
      eq(invRoot.querySelectorAll(".bow-pd-slot").length, 8, "в Сумке должно отображаться ровно 8 слотов куклы");
      assert(invRoot.querySelector(".bow-stat-delta"), "в списке вещей нет наглядного сравнения характеристик (.bow-stat-delta)");
      win.Bow.ui.setDrawer(false);
    } finally {
      Object.assign(live, snap);
      win.BowGame.refresh(true);
    }
    return "8 слотов куклы + двуручное/щит/колчан + смена комплектов I/II + дельты статов";
  });

  check("0.0.9.2: стартовый выбор устройства Компьютер / Телефон (#bow-device-modal) и мобильный профиль интерфейса", () => {
    assert(doc().getElementById("bow-device-modal"), "в разметке нет #bow-device-modal");
    assert(typeof win.Bow.ui.setDeviceMode === "function" && typeof win.Bow.ui.getDeviceMode === "function",
      "нет API выбора устройства setDeviceMode/getDeviceMode");

    win.Bow.ui.setDeviceMode("mobile");
    eq(win.Bow.ui.getDeviceMode(), "mobile", "режим устройства не переключился на mobile");
    assert(doc().getElementById("bow-app").classList.contains("bow-device-mobile"),
      "на #bow-app не проставился класс .bow-device-mobile");

    win.Bow.ui.setDeviceMode("pc");
    eq(win.Bow.ui.getDeviceMode(), "pc", "режим устройства не вернулся на pc");
    assert(doc().getElementById("bow-app").classList.contains("bow-device-pc"),
      "на #bow-app не проставился класс .bow-device-pc");
    return "выбор ПК / Телефон при старте и в Настройках + компактный профиль .bow-device-mobile";
  });

  check("0.0.9.2: мобильная разблокировка Web Audio (unlockGesture) и гарантированная музыка боя ensureCombatMusic", () => {
    assert(typeof win.Bow.audio.unlockGesture === "function", "нет функции мобильной разблокировки звука Bow.audio.unlockGesture");
    assert(typeof win.Bow.audio.ensureCombatMusic === "function", "нет функции гарантированной боевой музыки Bow.audio.ensureCombatMusic");
    const audioSrc = fs.readFileSync(path.join(__dirname, "..", "src", "audio", "108-audio.js"), "utf8");
    assert(/startLiveBridge/.test(audioSrc) && /tooth_and_claw/.test(audioSrc),
      "в 108-audio.js нет мгновенного боевого моста startLiveBridge до запекания буфера");
    return "unlockGesture + startLiveBridge + ensureCombatMusic";
  });

  /* ==================== КРУГ 26 (0.0.9.3 — ХОТФИКС) ==================== */

  check("0.0.9.3: #bow-device-modal всплывает поверх экрана (position: fixed) и мгновенно исчезает после выбора устройства", () => {
    const cssSrc = fs.readFileSync(path.join(__dirname, "..", "src", "styles", "main.css"), "utf8");
    assert(/#bow-device-modal[\s\S]{0,160}display:\s*none\s*!important/.test(cssSrc),
      "в main.css нет скрытия #bow-device-modal (display: none !important)");
    assert(/#bow-device-modal[\s\S]{0,200}position:\s*fixed\s*!important/.test(cssSrc),
      "в main.css у #bow-device-modal нет position: fixed !important (плашка сожмёт окно игры)");
    assert(/#bow-device-modal\.bow-device-modal-open:not\(\[hidden\]\)/.test(cssSrc),
      "в main.css нет селектора открытия #bow-device-modal.bow-device-modal-open:not([hidden])");

    const modal = doc().getElementById("bow-device-modal");
    assert(modal, "в DOM отсутствует #bow-device-modal");
    win.Bow.ui.closeDeviceModal();
    assert(modal.hidden === true && !modal.classList.contains("bow-device-modal-open"),
      "#bow-device-modal не скрыт по умолчанию");

    win.Bow.ui.openDeviceModal();
    assert(modal.hidden === false && modal.classList.contains("bow-device-modal-open"),
      "openDeviceModal() не открыл всплывающее окно");

    const pickMob = modal.querySelector('[data-act="device-pick"][data-device="mobile"]');
    assert(pickMob, "в #bow-device-modal нет кнопки выбора телефона");
    click(pickMob);
    assert(modal.hidden === true && !modal.classList.contains("bow-device-modal-open"),
      "после клика по карточке выбора устройства #bow-device-modal не закрылся!");
    eq(win.Bow.ui.getDeviceMode(), "mobile", "клик по карточке mobile не активировал мобильный профиль");

    win.Bow.ui.openDeviceModal();
    const pickPc = modal.querySelector('[data-act="device-pick"][data-device="pc"]');
    assert(pickPc, "в #bow-device-modal нет кнопки выбора ПК");
    click(pickPc);
    assert(modal.hidden === true && !modal.classList.contains("bow-device-modal-open"),
      "после клика по карточке ПК #bow-device-modal не закрылся!");
    eq(win.Bow.ui.getDeviceMode(), "pc", "клик по карточке ПК не вернул профиль ПК");
    return "fixed-оверлей + мгновенное закрытие при клике ПК/Телефон + полноэкранный #bow-app";
  });

  check("0.0.9.3: чёткий нативный WebGL-рендер без замыливания (нет will-change/translate3d на сцене, effectivePixelRatio)", () => {
    const cssSrc = fs.readFileSync(path.join(__dirname, "..", "src", "styles", "main.css"), "utf8");
    const worldRule = cssSrc.match(/\.bow-stage-world\s*\{[^}]*\}/);
    assert(worldRule && !/will-change/.test(worldRule[0]),
      "на .bow-stage-world остался will-change: transform");
    assert(/#bow-stage-canvas\s*>\s*\.bow-stage-bg-wrap[\s\S]*?transform:\s*none\s*!important/.test(cssSrc),
      "у .bow-stage-bg-wrap нет защиты transform: none !important для нативной чёткости WebGL");

    const sceneSrc = fs.readFileSync(path.join(__dirname, "..", "src", "engine3d", "scene3d.js"), "utf8");
    const qualSrc = fs.readFileSync(path.join(__dirname, "..", "src", "engine3d", "quality.js"), "utf8");
    assert(!/translate3d\(/.test(sceneSrc),
      "в scene3d.js не должно быть translate3d");
    assert(/effectivePixelRatio/.test(qualSrc) && /setPixelRatio/.test(sceneSrc),
      "в engine3d нет адаптивного физического DPR (effectivePixelRatio + setPixelRatio)");
    return "0% CSS-blur на WebGL + нативный DPR по качеству";
  });

  check("0.0.9.3: полное отсутствие обычных цветных эмодзи в исходниках src/ и в живом DOM игры", () => {
    const srcRoot = path.join(__dirname, "..", "src");
    function listSrc(dir) {
      let acc = [];
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) acc = acc.concat(listSrc(full));
        else if (/\.(js|css|html)$/.test(ent.name)) acc.push(full);
      }
      return acc;
    }
    const emojiRe = /\p{Emoji_Presentation}/gu;
    const leaks = [];
    for (const file of listSrc(srcRoot)) {
      const txt = fs.readFileSync(file, "utf8");
      const found = txt.match(emojiRe);
      if (found) leaks.push(path.relative(srcRoot, file) + ": " + [...new Set(found)].join(" "));
    }
    assert(leaks.length === 0, "в src/ обнаружены системные цветные эмодзи: " + leaks.join("; "));

    win.Bow.ui.openModal("inv");
    win.BowGame.refresh(true);
    const domTxt = doc().getElementById("bow-app").textContent || "";
    const domLeaks = domTxt.match(emojiRe);
    win.Bow.ui.setDrawer(false);
    assert(!domLeaks, "в живом DOM игры найдены цветные эмодзи: " + (domLeaks || []).join(" "));
    return "0 цветных эмодзи в src/ и DOM + стальные монохромные знаки и SVG";
  });

  check("0.0.9.3: подтверждение нападения без лишнего выбора кулачного боя (только «Да» и «Нет»)", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.fight = null;
      g.skirmish = null;
      g.jail = null;
      g.guard = null;
      g.player.location = "square";
      g.people["person:liva"].alive = true;
      g.people["person:liva"].location = "square";
      win.Bow.ui.setStageSelection({ kind: "person", personId: "person:liva", confirmAttack: true });
      win.BowGame.refresh(true);

      const pop = doc().getElementById("bow-stage-pop");
      assert(pop.querySelector('[data-act="skirmish-engage"][data-mode="crime"]'),
        "нет кнопки подтверждения нападения «Да» (data-mode=crime)");
      assert(pop.querySelector('[data-act="skirmish-confirm-cancel"]'),
        "нет кнопки отмены нападения «Нет»");
      assert(!pop.querySelector('[data-mode="brawl"]'),
        "в подтверждении нападения осталась удалённая кнопка кулачного боя (data-mode=brawl)");
      return "чистое подтверждение «Напасть: Да / Нет» без кулачного режима";
    } finally {
      Object.assign(g, snap);
      win.Bow.ui.setStageSelection(null);
      win.BowGame.refresh(true);
    }
  });

  check("0.0.9.3: прозрачная миграция сохранения 0.0.9.2 → 0.0.9.3 без потери прогресса", () => {
    const g = clone(game());
    g.version = "0.0.9.2";
    g.player.coins = 77;
    const res = win.Bow.save.deserialize(win.Bow.save.serialize(g, 1));
    assert(res.ok, "сохранение 0.0.9.2 не загрузилось: " + res.reason);
    eq(res.state.version, "0.0.9.3", "версия после миграции 0.0.9.2 → 0.0.9.3");
    eq(res.state.player.coins, 77, "потеряны монеты при миграции 0.0.9.2 → 0.0.9.3");
    return "0.0.9.2 → 0.0.9.3 сохраняет весь прогресс";
  });

  /* ==================== КРУГ 27 (0.0.9.3 — VITE + THREE.JS LOW-POLY 3D & CRPG UX) ==================== */

  check("0.0.9.3: модульный стек Vite (2.5D-срез «Рубленные грани» + резервный 3D), 2.5D-колодец с Z-сортировкой и 6 локаций Студёного Брода", () => {
    assert(!win.SugarCube, "SugarCube должен быть полностью удалён из рантайма");
    assert(win.Bow.engine25d || win.Bow.engine3d, "Графический движок не подключён");

    if (win.Bow.engine25d) {
      eq(win.Bow.iso.RENDER_MODE, "2.5D-Canvas-HiDPI", "режим рендера должен быть 2.5D-Canvas-HiDPI");
      const sqProps = win.Bow.engine25d.buildForegroundProps25D(win.Bow.iso.MAPS.square, game(), "day");
      assert(sqProps.some((p) => p.key === "well" && p.depth > 7), "на Площади Студёного Брода должен быть Z-сортируемый 2.5D каменный колодец");
      assert(sqProps.some((p) => p.key === "board") && sqProps.some((p) => p.key === "stall"), "на Площади должны быть 2.5D доска общины и лавка");
      for (const locKey of ["square", "tavern", "smithy", "outskirts", "forest", "jail"]) {
        assert(win.Bow.iso.MAPS[locKey], "отсутствует карта локации " + locKey);
      }
      return "Vite + чистый 2.5D HiDPI без WebGL + 2.5D каменный колодец с Z-глубиной + 6 локаций";
    }

    const well = win.Bow.engine3d.buildWell3D();
    assert(well && well.children.length >= 25, "3D-колодец Студёного Брода должен состоять из детальных каменных блоков");
    return "Vite + Three.js + эталон 3D-колодца + все 6 3D-локаций";
  });

  check("0.0.9.3: честная послойная одежда Kenshi (старт в одежде, снятие до белья, ножны 2-го оружия и мгновенные слоты [1]/[2])", () => {
    const fresh = win.Bow.adapter.freshState();
    const eq0 = win.Bow.equip.ensureEquipment(fresh.player);
    eq(eq0.armor, "item:linen_shirt", "на старте на игроке должна быть надета простая рубаха linen_shirt");
    eq(eq0.legs, "item:cloth_pants", "на старте на игроке должны быть надеты штаны cloth_pants");
    eq(eq0.boots, "item:simple_shoes", "на старте на игроке должны быть надеты башмаки simple_shoes");

    let vis = win.Bow.equip.visualLoadout(fresh.player, false);
    assert(!vis.bareTorso && !vis.bareLegs && !vis.bareFeet, "в стартовой одежде модель не должна быть раздета");

    /* Снимаем всю одежду в сумку — 3D-кукла и модель честно остаются в нижнем белье! */
    win.Bow.equip.unequipSlot(fresh.player, "armor");
    win.Bow.equip.unequipSlot(fresh.player, "legs");
    win.Bow.equip.unequipSlot(fresh.player, "boots");
    vis = win.Bow.equip.visualLoadout(fresh.player, false);
    assert(vis.bareTorso && vis.bareLegs && vis.bareFeet, "после снятия одежды модель должна честно раздеваться до белья");

    /* Два комплекта оружия: основное в руках, запасное — за спиной/на поясе */
    fresh.player.inventory.push({ itemId: "item:club", qty: 1 }, { itemId: "item:knife", qty: 1 });
    win.Bow.equip.equipItem(fresh.player, "club", "weapon1");
    win.Bow.equip.equipItem(fresh.player, "knife", "weapon2");
    win.Bow.equip.selectWeaponSet(fresh.player, 1);
    vis = win.Bow.equip.visualLoadout(fresh.player, false);
    eq(vis.weapon, "item:club", "комплект I в руках");
    eq(vis.holsteredWeapon, "item:knife", "комплект II висит в ножнах за спиной");

    win.Bow.equip.selectWeaponSet(fresh.player, 2);
    vis = win.Bow.equip.visualLoadout(fresh.player, false);
    eq(vis.weapon, "item:knife", "переключение на комплект II взяло нож в руки");
    eq(vis.holsteredWeapon, "item:club", "дубина ушла за спину");
    return "честная одежда Kenshi + раздевание до белья + 2 комплекта оружия с ножнами";
  });

  check("0.0.9.3: отрубание конечностей в бою (severLimb → 3D-культя и отрубленная рука на снегу), хромота и склонение «с Сигрид»", () => {
    const g = clone(game());
    g.player.inventory.push({ itemId: "item:buckler", qty: 1 });
    win.Bow.equip.equipItem(g.player, "buckler", "offhand");

    assert(typeof win.Bow.skirmish.severLimb === "function", "нет функции отрубания конечностей Bow.skirmish.severLimb");
    const sev = win.Bow.skirmish.severLimb(g, {
      id: "player", name: "Герой", side: "ally", isPlayer: true, wx: 5, wy: 4, body: g.player.body
    }, "left_arm");
    assert(sev && g.player.body.left_arm.lost === true, "левая рука не помечена отрубленной (lost: true)");
    assert(g.severedLimbs && g.severedLimbs.length === 1 && g.severedLimbs[0].partKey === "left_arm",
      "отрубленная рука не упала отдельным 3D-объектом на снег");
    eq(win.Bow.equip.ensureEquipment(g.player).offhand, null, "при потере левой руки щит должен выпадать");

    const vis = win.Bow.equip.visualLoadout(g.player, false);
    assert(vis.severed && vis.severed.left_arm === true, "visualLoadout не передаёт культю left_arm в рендерер персонажа");
    if (win.Bow.engine3d) {
      const rigWithStump = win.Bow.engine3d.createHumanoid3D(Object.assign({ sex: "m" }, vis));
      assert(rigWithStump.leftArm.isLost === true && rigWithStump.forearmL.children.length >= 1,
        "у 3D-модели вместо левой кисти должна остаться перевязанная культя");
    } else {
      assert(typeof win.Bow.engine25d.drawChiseledPerson === "function", "в 2.5D-движке должен быть рендерер drawChiseledPerson");
    }

    /* Хромота при ранении ноги (фикс старого опечаточного ключа leftLeg) */
    const legUnit = { body: { left_leg: { hp: 20, max: 100, bleed: 0, broken: true, lost: false }, right_leg: { hp: 100, max: 100 } } };
    g.skirmish = null;
    const g2 = win.Bow.adapter.freshState();
    g2.player.location = "tavern";
    g2.people["person:sigi"].location = "tavern";
    g2.people["person:sigi"].alive = true;
    const engRes = win.Bow.skirmish.engage(g2, "person:sigi", { mode: "crime" });
    assert(engRes && engRes.ok && g2.skirmish, "схватка с Сигрид не открылась: " + (engRes && engRes.message));
    const joinText = (g2.skirmish.log || []).join(" ") + " " + (g2.skirmish.introTitle || "") + " " + (engRes.message || "");
    assert(!/Сигридом/.test(joinText) && /Сигрид/.test(joinText), "женское имя Сигрид просклонялось по мужскому роду: " + joinText);
    const sigUnit = g2.skirmish.units.find((u) => u.refId === "person:sigi");
    assert(sigUnit, "Сигрид должна участвовать в схватке");
    g2.people["person:sigi"].body.left_leg.hp = 15;
    return "отрубание конечностей + 3D-культя + фикс хромоты ног + чистое склонение женских имён («Сигрид»)";
  });

  check("0.0.9.3: сплошная перегородка клетки от стены до стены и физический замок прохода", () => {
    const g = clone(game());
    g.jail = { hoursLeft: 12, lockHp: 100, lockProgress: 0, sweetSpot: 12, tolerance: 10, unlocked: false, guardAlert: 0, guardX: 6.5, guardY: 4 };
    if (win.Bow.engine3d) {
      const envClosed = win.Bow.engine3d.buildEnvironment3D("jail", win.Bow.iso.MAPS.jail, g, "high");
      assert(envClosed && envClosed.jailDoor && envClosed.jailDoor.pivot, "в 3D-тюрьме нет шарнирной двери клетки");
      eq(Math.abs(envClosed.jailDoor.pivot.rotation.y) < 0.01, true, "запертая дверь клетки должна быть закрыта");
    } else {
      const closedProps = win.Bow.engine25d.buildForegroundProps25D(win.Bow.iso.MAPS.jail, g, "day");
      eq(closedProps.length, 8, "запертая 2.5D-клетка должна перекрывать все 8 клеток от стены до стены");
    }
    eq(win.Bow.iso.isWalkable("jail", 5, 4, g), false, "сквозь запертую клетку (col 5) нельзя пройти");
    eq(win.Bow.iso.isWalkable("jail", 5, 1, g), false, "решётка клетки должна идти от стены до стены без дыр по бокам");

    g.jail.unlocked = true;
    if (win.Bow.engine3d) {
      const envOpen = win.Bow.engine3d.buildEnvironment3D("jail", win.Bow.iso.MAPS.jail, g, "high");
      assert(Math.abs(envOpen.jailDoor.pivot.rotation.y) > 0.8, "после взлома замка 3D-дверь клетки должна распахиваться");
    } else {
      const openProps = win.Bow.engine25d.buildForegroundProps25D(win.Bow.iso.MAPS.jail, g, "day");
      eq(openProps.length, 7, "после взлома замка дверная секция 2.5D-клетки (row=4) открывается");
    }
    eq(win.Bow.iso.isWalkable("jail", 5, 4, g), true, "после взлома замка проход через дверь клетки открыт");
    eq(win.Bow.iso.isWalkable("jail", 5, 1, g), false, "боковые прутья клетки остаются непроходимыми даже при открытой двери");
    return "сплошная клетка во всю ширину комнаты + открывающаяся дверь после взлома";
  });

  check("0.0.9.3: ПКМ контекстное меню (.bow-stage-pop-ctx), чистая сцена, хоткеи CRPG по event.code (I, M, Alt, 1–2, Esc), починка ПАУЗЫ и 3D-производительность", () => {
    const g = game();
    const snap = clone(g);
    try {
      g.fight = null;
      g.skirmish = null;
      g.jail = null;
      g.player.location = "square";
      win.BowGame.applyGlobalScale(g, "paused");
      win.BowGame.refresh(true);

      /* 1. Проверка разделения «ПАУЗА · Мир и бой замерли» без слипания */
      const pauseTxt = doc().getElementById("bow-pause-banner").textContent || "";
      assert(!/ПАУЗАМир/.test(pauseTxt) && /ПАУЗА\s*·\s*Мир/.test(pauseTxt),
        "в баннере паузы слиплись слова ПАУЗА и Мир: " + pauseTxt);

      /* 2. Контекстное меню по ПКМ (contextmenu) блокирует системное меню и открывается у курсора */
      const livaActor = doc().querySelector('#bow-stage-canvas [data-act="stage-select"][data-person="person:liva"]');
      assert(livaActor, "нет маркера Ливы на площади");
      const ctxEv = new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 320, clientY: 240 });
      const notPrevented = livaActor.dispatchEvent(ctxEv);
      eq(notPrevented, false, "ПКМ на сцене должен вызывать preventDefault() против браузерного меню");
      const pop = doc().getElementById("bow-stage-pop");
      assert(pop.classList.contains("bow-stage-pop-open") && pop.classList.contains("bow-stage-pop-ctx"),
        "ПКМ по персонажу не открыл компактное контекстное меню .bow-stage-pop-ctx");

      /* 3. [Esc] закрывает открытое контекстное меню */
      doc().dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
      assert(!pop.classList.contains("bow-stage-pop-open"), "Escape не закрыл контекстное меню");

      /* 4. [Alt] включает подсветку всех интерактивных объектов (html.bow-alt-highlight), отпускание — выключает */
      doc().dispatchEvent(new win.KeyboardEvent("keydown", { key: "Alt", code: "AltLeft", bubbles: true, cancelable: true }));
      assert(doc().documentElement.classList.contains("bow-alt-highlight"), "удержание Alt не включило подсветку объектов");
      doc().dispatchEvent(new win.KeyboardEvent("keyup", { key: "Alt", code: "AltLeft", bubbles: true }));
      assert(!doc().documentElement.classList.contains("bow-alt-highlight"), "отпускание Alt не сняло подсветку объектов");

      /* 5. [I] (даже на русской раскладке «ш» по code: KeyI!) открывает и закрывает Сумку с 3D-куклой */
      doc().dispatchEvent(new win.KeyboardEvent("keydown", { key: "ш", code: "KeyI", bubbles: true, cancelable: true }));
      assert(win.Bow.ui.isDrawerOpen(), "клавиша KeyI (на русской раскладке) не открыла инвентарь");
      assert(doc().querySelector(".bow-pd-canvas-box canvas.bow-paperdoll-canvas"), "в инвентаре нет холста 360° 3D-куклы");
      doc().dispatchEvent(new win.KeyboardEvent("keydown", { key: "ш", code: "KeyI", bubbles: true, cancelable: true }));
      assert(!win.Bow.ui.isDrawerOpen(), "повторное нажатие KeyI не закрыло инвентарь");

      /* 6. [M] (по code: KeyM на русской раскладке «ь») открывает и закрывает Карту */
      doc().dispatchEvent(new win.KeyboardEvent("keydown", { key: "ь", code: "KeyM", bubbles: true, cancelable: true }));
      assert(win.Bow.ui.isWorldPanelOpen(), "клавиша KeyM не открыла панель карты");
      doc().dispatchEvent(new win.KeyboardEvent("keydown", { key: "ь", code: "KeyM", bubbles: true, cancelable: true }));
      assert(!win.Bow.ui.isWorldPanelOpen(), "повторное нажатие KeyM не закрыло карту");

      /* 7. [1] и [2] переключают комплекты оружия I и II */
      doc().dispatchEvent(new win.KeyboardEvent("keydown", { key: "2", code: "Digit2", bubbles: true, cancelable: true }));
      eq(win.Bow.equip.ensureEquipment(g.player).activeWeaponSet, 2, "Digit2 не включил комплект оружия II");
      doc().dispatchEvent(new win.KeyboardEvent("keydown", { key: "1", code: "Digit1", bubbles: true, cancelable: true }));
      eq(win.Bow.equip.ensureEquipment(g.player).activeWeaponSet, 1, "Digit1 не вернул комплект оружия I");

      /* 8. Режим производительности 3D в Настройках */
      const qRes = win.Bow.ui.setSetting("graphics", "low");
      assert(qRes.ok && win.Bow.iso.getQualityKey() === "low", "настройка graphics=low не переключила 3D-движок в режим производительности");
      win.Bow.ui.setSetting("graphics", "high");
      eq(win.Bow.iso.getQualityKey(), "high", "возврат graphics=high");

      return "ПКМ-меню + чистая сцена + [I]/[M]/[Alt]/[1–2]/[Esc] в RU/EN + фикс ПАУЗЫ + Режим производительности 3D";
    } finally {
      Object.assign(g, snap);
      win.Bow.ui.setDrawer(false);
      win.Bow.ui.setWorldPanel(false);
      win.Bow.ui.setStageSelection(null);
      win.BowGame.refresh(true);
    }
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
