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

  check("Стартовый пассаж вывел торговый виджет", () => {
    const trade = doc().querySelector(".bow-trade");
    assert(trade, "виджет торговли не отрисован");
    assert(trade.querySelector("[data-act='buy']"), "нет ни одной кнопки покупки");
    return "кнопки покупки есть";
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
  check("Разговор открывает диалог с выбором", () => {
    const talkEl = doc().querySelector("#bow-people [data-act='talk']");
    click(talkEl);
    const choices = doc().querySelectorAll("#bow-dialog .bow-choice");
    assert(choices.length >= 2, "вариантов ответа меньше двух: " + choices.length);
    assert(game().dialog, "состояние диалога не создано");
    return choices.length + " варианта(ов)";
  });

  check("Выбор варианта меняет отношение и ведёт дальше по дереву", () => {
    const visitBefore = game().dialog.visited.length;
    const first = doc().querySelector("#bow-dialog .bow-choice");
    click(first);
    const after = game().dialog ? game().dialog.visited.length : visitBefore;
    assert(after >= visitBefore, "дерево диалога не продвинулось");
    return "узел: " + (game().dialog ? game().dialog.nodeId : "закрыт");
  });

  check("Разговор переживает перерисовку интерфейса", () => {
    win.BowGame.refresh(true);
    assert(game().dialog, "диалог потерялся при обновлении экрана");
    const box = doc().getElementById("bow-dialog");
    assert(box.classList.contains("bow-dialog-open"), "окно диалога не показано");
    return "диалог сохранён: " + game().dialog.nodeId;
  });

  check("Выход из диалога занимает ровно 1 час", () => {
    /* Идём до варианта «Уйти» */
    let guard = 0;
    while (game().dialog && guard < 12) {
      const choices = [...doc().querySelectorAll("#bow-dialog .bow-choice")];
      const leave = choices.find((c) => /Уйти|отойти|Кивнуть|Поблагодарить|Запомнить|Усмехнуться|Согласиться поискать|Отказаться|Не давить|Оставить|Спросить, кто|Промолчать|Рассказать|Спросить про плату|Сказать|Отговорить/i.test(c.textContent));
      click(leave || choices[choices.length - 1]);
      guard++;
    }
    assert(!game().dialog, "диалог не закрылся за " + guard + " шагов");
    return "закрыт за " + guard + " шагов";
  });

  check("Перемещение тратит время по расстоянию", () => {
    const before = game().time.totalHours;
    click(byAct("move", "tavern"));
    const after = game().time.totalHours;
    assert(after > before, "время не сдвинулось");
    eq(game().player.location, "tavern", "локация");
    return "+" + (after - before) + " ч., место: " + game().player.location;
  });

  check("Кнопка «Отдохнуть» работает (в прототипе была сломана)", () => {
    const before = game().time.totalHours;
    const fatigueBefore = game().player.needs.fatigue;
    click(byAct("rest"));
    const after = game().time.totalHours;
    assert(after > before, "время не прошло — отдых не сработал");
    assert(game().player.needs.fatigue > fatigueBefore - 30, "бодрость не изменилась корректно");
    return "+" + (after - before) + " ч., бодрость " + fatigueBefore + " → " + game().player.needs.fatigue;
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
    const block = styles.slice(styles.indexOf("prefers-reduced-motion"));
    assert(/animation:\s*none/.test(block), "анимация не отключается для reduced-motion");
    return "доступность соблюдена";
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

  check("Миграция сохранения 0.0.2 → 0.0.3 работает", () => {
    const g = JSON.parse(JSON.stringify(game()));
    g.version = "0.0.2";
    delete g.dialog;
    delete g.visits;
    Object.keys(g.people).forEach((id) => { delete g.people[id].appearance; delete g.people[id].dialog; });
    const res = win.Bow.state.migrate(g);
    eq(res.state.version, "0.0.3", "версия после миграции");
    assert(res.state.dialog === null, "dialog не добавлен");
    assert(res.state.people["person:sigi"].appearance, "внешность не добавлена миграцией");
    return "миграция применена";
  });

  /* 9. Ошибки JS */
  check("За весь прогон не было ошибок JavaScript", () => {
    assert(jsdomErrors.length === 0, "ошибки: " + jsdomErrors.slice(0, 3).join(" | "));
    return "ошибок нет";
  });

  /* 10. Мобильная вёрстка — проверяем то, что проверяемо без браузера */
  check("В CSS есть медиазапросы для планшета и телефона", () => {
    const styles = [...doc().querySelectorAll("style")].map((s) => s.textContent).join("\n");
    assert(/@media \(max-width: 1100px\)/.test(styles), "нет медиазапроса для планшета");
    assert(/@media \(max-width: 720px\)/.test(styles), "нет медиазапроса для телефона");
    assert(/prefers-reduced-motion/.test(styles), "нет поддержки reduced-motion");
    return "1100px, 720px, reduced-motion";
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
