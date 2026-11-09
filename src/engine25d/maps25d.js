/* ============================================================================
   MAPS 2.5D — Геометрия и интерактивные узлы локаций Студёного Брода
   (Лёгкий модуль без импорта Three.js для мгновенной загрузки 2.5D-среза)
   ============================================================================ */

export const MAPS = {
  square: {
    id: "square",
    outdoor: true,
    floorKind: "cobble_snow",
    spawn: { col: 3.8, row: 4.4, facing: "SE" },
    entryFrom: {
      tavern: { col: 1.2, row: 3.0, facing: "SE" },
      smithy: { col: 8.0, row: 1.2, facing: "SW" },
      outskirts: { col: 9.8, row: 5.8, facing: "NW" }
    },
    npcSlots: [
      { col: 6.2, row: 3.8, facing: "SW" },
      { col: 2.8, row: 3.4, facing: "SE" },
      { col: 7.4, row: 2.6, facing: "SW" },
      { col: 8.8, row: 4.8, facing: "NW" },
      { col: 4.2, row: 5.6, facing: "NE" }
    ],
    obstacles: [
      { col: 5, row: 3, kind: "well", label: "Каменный колодец" },
      { col: 3, row: 1, kind: "board", label: "Доска подрядов" },
      { col: 8, row: 2, kind: "stall", label: "Лавка припасов" }
    ],
    spots: [
      { key: "well", col: 5, row: 3, title: "Каменный колодец", sub: "ледяная вода под срубом", desc: "Ворот обмёрз льдом, но бадья ходит исправно. Вокруг колодца сходятся все тропы Брода.", tab: "jobs", tabLabel: "Подряды у площади" },
      { key: "board", col: 3, row: 1, title: "Доска общины", sub: "вести и подряды", desc: "На сосновом щите под снежным козырьком прибиты распоряжения старосты и заявки на работу.", tab: "jobs", tabLabel: "Смотреть подряды" },
      { key: "stall", col: 8, row: 2, title: "Торговый прилавок", sub: "припасы и снасть", desc: "На тёсаных досках разложены связки вяленой рыбы, меха и дорожная утварь.", tab: "trade", tabLabel: "Открыть торг" }
    ],
    exits: [
      { col: 0, row: 3, to: "tavern", label: "Трактир «Хромой олень»", doorKind: "porch_door", wallSide: "NW" },
      { col: 8, row: 0, to: "smithy", label: "Кузница Тарна", doorKind: "forge_arch", wallSide: "NE" },
      { col: 11, row: 6, to: "outskirts", label: "К околице", doorKind: "road_gate", wallSide: "SE" }
    ]
  },

  tavern: {
    id: "tavern",
    outdoor: false,
    floorKind: "planks",
    wallKind: "timber",
    spawn: { col: 8.8, row: 5.0, facing: "NW" },
    entryFrom: {
      square: { col: 9.6, row: 5.0, facing: "NW" }
    },
    npcSlots: [
      { col: 7.2, row: 2.2, facing: "SW" },
      { col: 4.2, row: 3.0, facing: "SE" },
      { col: 6.0, row: 5.2, facing: "NW" },
      { col: 2.2, row: 4.2, facing: "NE" }
    ],
    obstacles: [
      { col: 4, row: 0, kind: "hearth" },
      { col: 3, row: 4, kind: "table" },
      { col: 7, row: 4, kind: "table" },
      { col: 8, row: 1, kind: "bar" },
      { col: 1, row: 1, kind: "bunk" }
    ],
    spots: [
      { key: "hearth", col: 4, row: 0, title: "Каменный очаг", sub: "тёплый сруб и котёл", desc: "Берёзовые поленья трещат ровно; в закопчённом котле густеет горячая похлёбка." },
      { key: "bar", col: 8, row: 1, title: "Стойка Сигрид", sub: "снедь, похлёбка и эль", desc: "Дубовая доска отполирована локтями. За стойкой всегда найдётся тёплый хлеб и кружка.", tab: "trade", tabLabel: "Снедь и питьё" },
      { key: "bunk", col: 1, row: 1, title: "Лавка с тулупом", sub: "сон в тепле", desc: "Широкая скамья у тёплой бревенчатой стены — лучшее место переждать стужу.", act: "rest", actLabel: "Отдохнуть в тепле" }
    ],
    exits: [
      { col: 11, row: 5, to: "square", label: "На площадь", doorKind: "inner_door", wallSide: "SE" }
    ]
  },

  smithy: {
    id: "smithy",
    outdoor: false,
    floorKind: "flagstone",
    wallKind: "stone",
    spawn: { col: 8.8, row: 5.0, facing: "NW" },
    entryFrom: {
      square: { col: 9.6, row: 5.0, facing: "NW" }
    },
    npcSlots: [
      { col: 4.2, row: 2.4, facing: "SE" },
      { col: 7.2, row: 4.2, facing: "NW" },
      { col: 2.2, row: 5.2, facing: "NE" }
    ],
    obstacles: [
      { col: 3, row: 0, kind: "forge" },
      { col: 5, row: 2, kind: "anvil" },
      { col: 6, row: 1, kind: "trough" },
      { col: 1, row: 2, kind: "crates" }
    ],
    spots: [
      { key: "forge", col: 3, row: 0, title: "Кузнечный горн", sub: "меха и багровый уголь", desc: "Жар бьёт в лицо с трёх шагов. В горне добела раскаляются полосы северного железа." },
      { key: "anvil", col: 5, row: 2, title: "Наковальня Тарна", sub: "поковка и подряды", desc: "Тяжёлый стальной рог гудит от ударов ручника. Здесь всегда нужны крепкие руки.", tab: "jobs", tabLabel: "Подряды кузни" },
      { key: "rack", col: 8, row: 0, title: "Стойка с поковками", sub: "топоры, ножи и броня", desc: "Свежие клинки и топоры смазаны жиром от ржавчины.", tab: "trade", tabLabel: "Товар кузни" }
    ],
    exits: [
      { col: 11, row: 5, to: "square", label: "На площадь", doorKind: "inner_door", wallSide: "SE" }
    ]
  },

  outskirts: {
    id: "outskirts",
    outdoor: true,
    floorKind: "snow_road",
    spawn: { col: 2.2, row: 4.2, facing: "SE" },
    entryFrom: {
      square: { col: 1.4, row: 4.2, facing: "SE" },
      forest: { col: 9.6, row: 4.2, facing: "NW" }
    },
    npcSlots: [
      { col: 6.2, row: 3.0, facing: "SW" },
      { col: 5.0, row: 5.2, facing: "NE" },
      { col: 8.2, row: 2.4, facing: "SW" }
    ],
    obstacles: [
      { col: 6, row: 0, kind: "torch_post" },
      { col: 3, row: 2, kind: "woodpile" },
      { col: 8, row: 5, kind: "rock" }
    ],
    spots: [
      { key: "gate", col: 6, row: 0, title: "Ворота частокола", sub: "рубеж Студёного Брода", desc: "Заострённые брёвна лиственницы вкопаны в мерзлоту. За ними тянется зимник к тайге." },
      { key: "wood", col: 3, row: 2, title: "Дровяные козлы", sub: "колка и заготовка дров", desc: "Мёрзлые берёзовые кряжи ждут колуна — община честно платит за каждую сажень.", tab: "jobs", tabLabel: "Взяться за работу" }
    ],
    exits: [
      { col: 0, row: 4, to: "square", label: "Площадь", doorKind: "road_gate", wallSide: "NW" },
      { col: 11, row: 4, to: "forest", label: "Опушка тайги", doorKind: "forest_trail", wallSide: "SE" }
    ]
  },

  forest: {
    id: "forest",
    outdoor: true,
    floorKind: "taiga_snow",
    spawn: { col: 2.2, row: 4.2, facing: "SE" },
    entryFrom: {
      outskirts: { col: 1.5, row: 4.2, facing: "SE" }
    },
    npcSlots: [
      { col: 6.4, row: 4.2, facing: "SW" },
      { col: 4.2, row: 2.2, facing: "SE" },
      { col: 8.2, row: 5.2, facing: "NW" }
    ],
    obstacles: [
      { col: 2, row: 1, kind: "pine" },
      { col: 7, row: 1, kind: "pine" },
      { col: 9, row: 3, kind: "pine" },
      { col: 3, row: 6, kind: "pine" },
      { col: 5, row: 3, kind: "campfire" }
    ],
    spots: [
      { key: "fire", col: 5, row: 3, title: "Охотничий костерок", sub: "дым и еловый лапник", desc: "У старого корня тлеют смолистые сучья — здесь отогревают пальцы перед охотой.", act: "rest", actLabel: "Привал у огня" },
      { key: "trail", col: 8, row: 1, title: "Звериный лаз", sub: "следы на глубоком насте", desc: "Цепочка лисьих и куньих следов уходит под заснеженные лапы вековых елей.", tab: "jobs", tabLabel: "Промысел в тайге" }
    ],
    exits: [
      { col: 0, row: 4, to: "outskirts", label: "Околица", doorKind: "forest_trail", wallSide: "NW" }
    ]
  },

  jail: {
    id: "jail",
    outdoor: false,
    floorKind: "cell_stone",
    wallKind: "stone",
    spawn: { col: 2.2, row: 4.0, facing: "NE" },
    entryFrom: {},
    npcSlots: [],
    obstacles: [
      { col: 1, row: 2, kind: "straw" },
      { col: 1, row: 6, kind: "bucket" },
      { col: 5, row: 0, kind: "bars_seg" },
      { col: 5, row: 1, kind: "bars_seg" },
      { col: 5, row: 2, kind: "bars_seg" },
      { col: 5, row: 3, kind: "bars_seg" },
      { col: 5, row: 4, kind: "bars_door" },
      { col: 5, row: 5, kind: "bars_seg" },
      { col: 5, row: 6, kind: "bars_seg" },
      { col: 5, row: 7, kind: "bars_seg" },
      { col: 9, row: 1, kind: "brazier" }
    ],
    spots: [],
    exits: []
  }
};
