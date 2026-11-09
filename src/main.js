/* ============================================================
   BLADES OF WAR — 0.0.9.3 · Low-Poly 3D Engine (Vite + Three.js)
   Точка входа модульной сборки без Twine / SugarCube 2.
   Строгий порядок модулей (учитывая ES-module hoisting):
   ============================================================ */

/* 0. Монтирование стилей и каркаса интерфейса #bow-app в DOM */
import "./ui/000-shell.js";

/* 1. Чистое ядро симуляции Студёного Брода */
import "./core/000-core.js";
import "./core/005-data.js";
import "./core/010-state.js";
import "./core/020-time.js";
import "./core/030-needs.js";
import "./core/040-economy.js";
import "./core/050-journal.js";
import "./core/055-work.js";
import "./core/057-steal.js";
import "./core/058-fight.js";
import "./core/059-skirmish.js";
import "./core/060-actions.js";
import "./core/065-dialog.js";
import "./core/066-guard.js";
import "./core/067-street.js";
import "./core/070-events.js";
import "./core/080-save.js";
import "./core/100-adapter.js";

/* 2. Изометрический 2.5D-движок «Рубленные грани» (HiDPI Canvas 2D, 0 мс WebGL-потерь, эталон image-49)
      Резервный 3D-движок сохранён в ./engine3d/boot3d.js на случай возврата к Three.js. */
import "./engine25d/boot25d.js";
// import "./engine3d/boot3d.js";

/* 3. Процедурный северный оркестрово-хоровой саундтрек и звуки боя */
import "./audio/108-audio.js";

/* 4. Слой CRPG-интерфейса, контекстного меню ПКМ и хоткеев */
import "./ui/105-stage.js";
import "./ui/110-ui.js";
import "./ui/900-game.js";
