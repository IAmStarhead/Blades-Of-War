#!/usr/bin/env bash
# ============================================================
# Сборка Blades Of War: .twee-модули → один самодостаточный HTML
#
# Порядок сборки важен: сначала ядро и данные, затем интерфейс,
# затем пассажи. StoryData и Start должны идти после виджетов,
# поэтому 100-start.twee подключается последним.
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BUILD_DIR=".build"
COMBINED="$BUILD_DIR/combined.twee"
OUT="dist/BladesOfWar.html"
FORMAT="vendor/format.js"

mkdir -p "$BUILD_DIR" dist

# --- Проверки окружения ---
if [ ! -f "$FORMAT" ]; then
  echo "ОШИБКА: нет $FORMAT (формат истории SugarCube 2.37.3)." >&2
  echo "Скачать: https://github.com/tmedwards/sugarcube-2/releases/tag/v2.37.3" >&2
  exit 1
fi

if ! npx --no-install extwee --version >/dev/null 2>&1; then
  echo "ОШИБКА: не найден extwee. Установка: npm i -D extwee" >&2
  exit 1
fi

# --- Склейка в правильном порядке ---
: > "$COMBINED"

echo "Склейка модулей…"
for f in src/js/*.twee; do
  cat "$f" >> "$COMBINED"
  printf '\n\n' >> "$COMBINED"
  echo "  + $f"
done

for f in src/ui/*.twee; do
  cat "$f" >> "$COMBINED"
  printf '\n\n' >> "$COMBINED"
  echo "  + $f"
done

for f in src/passages/*.twee; do
  cat "$f" >> "$COMBINED"
  printf '\n\n' >> "$COMBINED"
  echo "  + $f"
done

# --- Проверка дубликатов имён пассажей (частая ошибка при склейке) ---
echo "Проверка имён пассажей…"
DUPES=$(grep -o '^:: [^[]*' "$COMBINED" | sed 's/^:: //' | sed 's/[[:space:]]*$//' | sort | uniq -d)
if [ -n "$DUPES" ]; then
  echo "ОШИБКА: дублирующиеся пассажи:" >&2
  echo "$DUPES" >&2
  exit 1
fi

# --- Сборка ---
echo "Сборка HTML…"
npx --no-install extwee -c -i "$COMBINED" -o "$OUT" -s "$FORMAT"

# --- Проверка результата ---
if [ ! -f "$OUT" ]; then
  echo "ОШИБКА: HTML не создан." >&2
  exit 1
fi

# Внешние ссылки недопустимы: игра должна работать без интернета.
EXTERNAL=$(grep -o 'src="https\?://[^"]*"\|href="https\?://[^"]*"' "$OUT" | grep -v 'motoslave.net\|twinery.org' | head -5 || true)
if [ -n "$EXTERNAL" ]; then
  echo "ВНИМАНИЕ: в HTML есть внешние ссылки:" >&2
  echo "$EXTERNAL" >&2
fi

SIZE=$(du -h "$OUT" | cut -f1)
COUNT=$(grep -o '<tw-passagedata' "$OUT" | wc -l)
echo ""
echo "Готово: $OUT"
echo "  размер: $SIZE"
echo "  пассажей: $COUNT"
