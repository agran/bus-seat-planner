/* seatProfiles.js
 * Общий модуль для admin.html и avtobusJZ.html:
 * - хранение профилей расположения мест в localStorage
 * - генерация схематичной SVG-картинки автобуса по произвольному профилю
 *
 * Профиль:
 * {
 *   id: string,
 *   name: string,
 *   rows: number,
 *   cols: number,
 *   cells: [ { type: 'empty'|'seat'|'guide'|'driver'|'door', number: number|null } ... ]  // rows*cols, по строкам
 * }
 *
 * Специальный профиль "classic-20" — это старая жёстко зашитая схема Mercedes Sprinter
 * (avtobusJZ3.svg), она не хранится в localStorage и обрабатывается отдельным кодом
 * в avtobusJZ.js для полной обратной совместимости со старыми ссылками.
 */

var SeatProfiles = (function () {
  var STORAGE_KEY = "busSeatProfiles_v1";
  var CLASSIC_PROFILE_ID = "classic-20";

  function loadStore() {
    var raw;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      raw = null;
    }
    if (!raw) {
      return { profiles: [], selectedId: CLASSIC_PROFILE_ID };
    }
    try {
      var store = JSON.parse(raw);
      if (!store || typeof store !== "object") {
        return { profiles: [], selectedId: CLASSIC_PROFILE_ID };
      }
      if (!Array.isArray(store.profiles)) {
        store.profiles = [];
      }
      if (!store.selectedId) {
        store.selectedId = CLASSIC_PROFILE_ID;
      }
      return store;
    } catch (e) {
      return { profiles: [], selectedId: CLASSIC_PROFILE_ID };
    }
  }

  function saveStore(store) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      console.error("Не удалось сохранить профили в localStorage", e);
    }
  }

  function getProfiles() {
    return loadStore().profiles;
  }

  function getProfile(id) {
    if (id === CLASSIC_PROFILE_ID) {
      return getClassicProfileStub();
    }
    var profiles = getProfiles();
    for (var i = 0; i < profiles.length; i++) {
      if (profiles[i].id === id) {
        return profiles[i];
      }
    }
    return null;
  }

  function getClassicProfileStub() {
    return {
      id: CLASSIC_PROFILE_ID,
      name: "Классический Mercedes Sprinter (20 мест)",
      classic: true,
    };
  }

  function generateId() {
    return (
      "p_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function saveProfile(profile) {
    var store = loadStore();
    if (!profile.id) {
      profile.id = generateId();
    }
    var found = false;
    for (var i = 0; i < store.profiles.length; i++) {
      if (store.profiles[i].id === profile.id) {
        store.profiles[i] = profile;
        found = true;
        break;
      }
    }
    if (!found) {
      store.profiles.push(profile);
    }
    saveStore(store);
    return profile;
  }

  function deleteProfile(id) {
    var store = loadStore();
    store.profiles = store.profiles.filter(function (p) {
      return p.id !== id;
    });
    if (store.selectedId === id) {
      store.selectedId = CLASSIC_PROFILE_ID;
    }
    saveStore(store);
  }

  // Полностью заменяет локальный кэш профилей списком, полученным из
  // облака (Firestore), не трогая выбранный профиль (он хранится только
  // в настройках браузера, per-device).
  function replaceProfiles(profiles) {
    var store = loadStore();
    store.profiles = profiles || [];
    saveStore(store);
  }

  function getSelectedProfileId() {
    var store = loadStore();
    return store.selectedId || CLASSIC_PROFILE_ID;
  }

  function setSelectedProfileId(id) {
    var store = loadStore();
    store.selectedId = id;
    saveStore(store);
  }

  // Список номеров мест (без учёта места гида), отсортированный по возрастанию.
  function getSeatNumbers(profile) {
    var numbers = [];
    if (!profile || !profile.cells) {
      return numbers;
    }
    profile.cells.forEach(function (cell) {
      if (cell && cell.type === "seat" && cell.number != null) {
        numbers.push(cell.number);
      }
    });
    numbers.sort(function (a, b) {
      return a - b;
    });
    return numbers;
  }

  function getGuideCell(profile) {
    if (!profile || !profile.cells) {
      return null;
    }
    for (var i = 0; i < profile.cells.length; i++) {
      if (profile.cells[i] && profile.cells[i].type === "guide") {
        return profile.cells[i];
      }
    }
    return null;
  }

  function getDriverCell(profile) {
    if (!profile || !profile.cells) {
      return null;
    }
    for (var i = 0; i < profile.cells.length; i++) {
      if (profile.cells[i] && profile.cells[i].type === "driver") {
        return profile.cells[i];
      }
    }
    return null;
  }

  function validateProfile(profile) {
    var errors = [];
    if (!profile.name || !profile.name.trim()) {
      errors.push("Не указано название профиля.");
    }
    if (!profile.rows || !profile.cols) {
      errors.push("Не заданы размеры сетки.");
    }
    var numbers = getSeatNumbers(profile);
    if (numbers.length === 0) {
      errors.push("В профиле нет ни одного места.");
    }
    // Уникальность номеров проверяем вместе с местом гида —
    // оно входит в общую нумерацию.
    var numbered = [];
    profile.cells.forEach(function (cell) {
      if (
        cell &&
        (cell.type === "seat" || cell.type === "guide") &&
        cell.number != null
      ) {
        numbered.push(cell.number);
      }
    });
    var seen = {};
    numbered.forEach(function (n) {
      if (seen[n]) {
        errors.push("Номер места " + n + " используется более одного раза.");
      }
      seen[n] = true;
    });
    profile.cells.forEach(function (cell) {
      if (
        cell &&
        cell.type === "seat" &&
        (cell.number == null || isNaN(cell.number))
      ) {
        errors.push("У одного из мест не задан номер.");
      }
    });
    var driverCount = profile.cells.filter(function (cell) {
      return cell && cell.type === "driver";
    }).length;
    if (driverCount > 1) {
      errors.push("В профиле может быть только одно место водителя.");
    }
    return errors;
  }

  // ---- Генерация схематичной SVG-картинки ----

  var CELL_W = 90; // ширина ячейки-места вдоль автобуса (шаг сетки)
  var CELL_H = 68; // высота ячейки (поперёк салона) — салон "площе", как настоящий
  var SEAT_W = CELL_W * 0.9; // сама сидушка уже ячейки — между креслами виден зазор
  var GAP = 22; // расстояние между соседними ячейками (с учётом узкого кресла — заметный проход)
  var GAP_Y = 10;
  var PAD = 46;
  var CABIN_INSET = 16; // отступ салона (голубая зона) от внешнего корпуса
  var CAB_WIDTH = 70; // небольшая носовая зона справа (лобовое стекло, руль)

  var NS = "http://www.w3.org/2000/svg";

  // Копия правил из seatProfiles.css, встраиваемая прямо в генерируемый SVG
  // (нужно для корректного экспорта/копирования картинки — см. generateGenericSVG).
  var GENERIC_SVG_CSS =
    ".bus-frame{fill:#fdfdfb;stroke:#37414a;stroke-width:3;}" +
    ".bus-cabin{fill:#dde6f2;stroke:none;}" +
    ".bus-side-window{fill:#9fbcd4;stroke:none;}" +
    ".generic-seat{filter:drop-shadow(0 3px 2px rgba(44,58,38,0.35));}" +
    ".bus-windshield{fill:none;stroke:#7fa3c4;stroke-width:10;stroke-linecap:round;}" +
    ".bus-steering{fill:none;stroke:#4a555f;stroke-width:4;}" +
    ".bus-steering-inner{fill:#4a555f;}" +
    ".bus-wheel{fill:#2c3238;stroke:none;}" +
    ".bus-wheel-sidewall{fill:#6d7780;}" +
    ".bus-direction-arrow{fill:none;stroke:#9fb4c8;stroke-width:4;stroke-linecap:round;stroke-linejoin:round;}" +
    ".bus-headlight{fill:#ffd977;stroke:none;}" +
    ".bus-tail-light{fill:#d9534f;stroke:none;}" +
    ".door-floor{fill:#fbfdff;stroke:#6f8ea9;stroke-width:2.5;}" +
    ".door-threshold{stroke:#f0b429;stroke-width:6;stroke-linecap:round;}" +
    ".door-leaf{fill:#cfe0ee;stroke:#6f8ea9;stroke-width:2;}" +
    ".door-handle{stroke:#51677a;stroke-width:3;stroke-linecap:round;}" +
    ".door-slide-arrow{fill:none;stroke:#7c93a6;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;}" +
    ".door-text{fill:#51677a;font-family:Arial,sans-serif;font-size:12px;font-weight:700;pointer-events:none;stroke:#fff;stroke-width:3px;paint-order:stroke fill;stroke-linejoin:round;}" +
    ".seat-back{stroke:rgba(30,36,26,0.55);stroke-width:1.5;cursor:pointer;pointer-events:fill;}" +
    ".seat-cushion{stroke:rgba(30,36,26,0.55);stroke-width:1.5;cursor:pointer;pointer-events:fill;}" +
    ".seat-back.free,.seat-cushion.free{fill:#8fae55;}" +
    ".seat-back.free{fill:#79994a;}" +
    ".seat-back.occupied,.seat-cushion.occupied{fill:#a33a34;}" +
    ".seat-back.occupied{fill:#8a2e29;}" +
    ".seat-back.guide,.seat-cushion.guide{fill:#5f7480;cursor:default;}" +
    ".seat-back.guide{fill:#4c5e67;}" +
    ".seat-back.driver,.seat-cushion.driver{fill:#3f6680;cursor:default;}" +
    ".seat-back.driver{fill:#315268;}" +
    ".seat-text{fill:#f4f7e0;font-size:32px;font-weight:700;font-family:Arial,sans-serif;pointer-events:none;user-select:none;}" +
    ".generic-guide .seat-text{font-size:26px;}" +
    ".generic-driver .seat-text{font-size:18px;}" +
    ".seat-subtext{fill:#dbe4ea;font-size:13px;font-weight:700;font-family:Arial,sans-serif;pointer-events:none;user-select:none;}" +
    ".legend-label-text{fill:#2c3a26;font-size:22px;font-weight:700;font-family:Arial,sans-serif;pointer-events:none;user-select:none;}";

  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    if (attrs) {
      for (var k in attrs) {
        e.setAttribute(k, attrs[k]);
      }
    }
    return e;
  }

  // Собирает <g> с сиденьем: спинка — тёмная вертикальная полоса слева,
  // сидушка — закруглённый прямоугольник справа с номером по центру.
  // Автобус едет вправо, поэтому пассажир "смотрит" направо, а спинка кресла — слева.
  function buildSeatGroup(x, y, w, h, statusClass, label, specialType, subLabel) {
    var g = el("g", {
      class:
        "generic-seat" +
        (specialType === "guide" ? " generic-guide" : "") +
        (specialType === "driver" ? " generic-driver" : ""),
    });

    // Сидушка уже, чем ячейка сетки — центрируем её, оставляя проход по бокам.
    var seatW = Math.min(SEAT_W, w);
    var offsetX = x + (w - seatW) / 2;
    var backW = seatW * 0.22;

    // Спинка кресла.
    var back = el("rect", {
      class: "seat-back " + statusClass,
      x: offsetX,
      y: y,
      width: backW + seatW * 0.1,
      height: h,
      rx: h * 0.14,
      ry: h * 0.14,
    });
    g.appendChild(back);

    // Сидушка (основная часть кресла), слегка перекрывает спинку для целостности формы.
    var cushion = el("rect", {
      class: "seat-cushion " + statusClass,
      x: offsetX + backW,
      y: y + h * 0.05,
      width: seatW - backW,
      height: h * 0.9,
      rx: h * 0.16,
      ry: h * 0.16,
    });
    g.appendChild(cushion);

    var text = el("text", {
      class: "seat-text",
      x: offsetX + backW + (seatW - backW) / 2,
      y: subLabel ? y + h * 0.4 : y + h / 2,
      "text-anchor": "middle",
      "dominant-baseline": "central",
    });
    text.textContent = label;
    g.appendChild(text);

    if (subLabel) {
      var sub = el("text", {
        class: "seat-subtext",
        x: offsetX + backW + (seatW - backW) / 2,
        y: y + h * 0.74,
        "text-anchor": "middle",
        "dominant-baseline": "central",
      });
      sub.textContent = subLabel;
      g.appendChild(sub);
    }

    return g;
  }

  // Одностворчатая раздвижная дверь: рама проёма + сдвинутая створка сбоку
  // (характерно для микроавтобусов/туристических автобусов), с ручкой и
  // маленькими стрелками, показывающими направление сдвига.
  function buildDoorGroup(x, y, w, h, side, bodyY0, bodyY1) {
    var g = el("g", {
      class: "generic-door generic-door-" + side,
      "data-door": "true",
    });
    var doorWidth = w * 0.62;
    var doorX = x + (w - doorWidth) / 2;
    var floorY = side === "top" ? bodyY0 + 5 : y + h * 0.28;
    var floorBottom = side === "top" ? y + h * 0.72 : bodyY1 - 5;
    var thresholdY = side === "top" ? bodyY0 + 7 : bodyY1 - 7;
    var doorH = floorBottom - floorY;

    // Проём двери (рама).
    g.appendChild(
      el("rect", {
        class: "door-floor",
        x: doorX,
        y: floorY,
        width: doorWidth,
        height: doorH,
        rx: 7,
        ry: 7,
      }),
    );
    g.appendChild(
      el("line", {
        class: "door-threshold",
        x1: doorX + 5,
        y1: thresholdY,
        x2: doorX + doorWidth - 5,
        y2: thresholdY,
      }),
    );

    // Створка сдвинута к одному краю проёма — открытая часть видна рядом.
    var leafWidth = doorWidth * 0.56;
    var leafX = doorX + doorWidth - leafWidth - 3;
    g.appendChild(
      el("rect", {
        class: "door-leaf",
        x: leafX,
        y: floorY + 4,
        width: leafWidth,
        height: doorH - 8,
        rx: 5,
        ry: 5,
      }),
    );
    // Ручка створки — короткая вертикальная перекладина у переднего края.
    g.appendChild(
      el("line", {
        class: "door-handle",
        x1: leafX + leafWidth * 0.22,
        y1: floorY + doorH * 0.35,
        x2: leafX + leafWidth * 0.22,
        y2: floorY + doorH * 0.65,
      }),
    );
    // Стрелки на открытой части проёма показывают направление сдвига створки.
    var arrowY = floorY + doorH / 2;
    [0.28, 0.5].forEach(function (frac) {
      var ax = doorX + (leafX - doorX) * frac + 6;
      g.appendChild(
        el("path", {
          class: "door-slide-arrow",
          d:
            "M " +
            (ax + 5) +
            " " +
            (arrowY - 5) +
            " L " +
            (ax - 3) +
            " " +
            arrowY +
            " L " +
            (ax + 5) +
            " " +
            (arrowY + 5),
        }),
      );
    });

    // Подпись держим ближе к салону (подальше от внешнего борта, где рядом
    // рисуются колёсные выступы) — для верхней и нижней стороны это разные
    // края дверного проёма.
    var text = el("text", {
      class: "door-text",
      x: doorX + doorWidth / 2,
      y: floorY + doorH * (side === "top" ? 0.86 : 0.14),
      "text-anchor": "middle",
      "dominant-baseline": "central",
    });
    text.textContent = "Дверь";
    g.appendChild(text);
    return g;
  }
  function getOccupiedBounds(profile) {
    var minRow = profile.rows;
    var maxRow = -1;
    var minCol = profile.cols;
    var maxCol = -1;

    for (var r = 0; r < profile.rows; r++) {
      for (var c = 0; c < profile.cols; c++) {
        var cell = profile.cells[r * profile.cols + c];
        if (cell && cell.type !== "empty") {
          minRow = Math.min(minRow, r);
          maxRow = Math.max(maxRow, r);
          minCol = Math.min(minCol, c);
          maxCol = Math.max(maxCol, c);
        }
      }
    }

    if (maxRow < 0) {
      return { minRow: 0, maxRow: 0, minCol: 0, maxCol: 0 };
    }
    return {
      minRow: minRow,
      maxRow: maxRow,
      minCol: minCol,
      maxCol: maxCol,
    };
  }

  // initialStatus: { seatNumber: 'free'|'occupied' }
  function generateGenericSVG(profile, initialStatus) {
    initialStatus = initialStatus || {};
    var bounds = getOccupiedBounds(profile);
    var rows = bounds.maxRow - bounds.minRow + 1;
    var cols = bounds.maxCol - bounds.minCol + 1;

    var seatsWidth = cols * CELL_W + (cols + 1) * GAP;
    var seatsHeight = rows * CELL_H + (rows + 1) * GAP_Y;

    var width = seatsWidth + PAD * 2 + CAB_WIDTH;
    var height = seatsHeight + PAD * 2;
    var LEGEND_H = 56; // полоса легенды "свободное/занятое место" под автобусом
    var totalHeight = height + LEGEND_H;

    var svg = el("svg", {
      id: "_generic_bus_svg",
      viewBox: "0 0 " + width + " " + totalHeight,
      width: width,
      height: totalHeight,
      xmlns: NS,
    });

    // Встраиваем стили прямо в SVG, чтобы картинка оставалась корректно
    // раскрашенной и при экспорте (копирование/скачивание PNG сериализует
    // SVG отдельно от страницы, внешний seatProfiles.css к нему не применяется).
    var styleEl = el("style");
    styleEl.textContent = GENERIC_SVG_CSS;
    svg.appendChild(styleEl);

    var bodyX0 = PAD / 2;
    var bodyY0 = PAD / 2;
    var bodyX1 = width - PAD / 2;
    var bodyY1 = height - PAD / 2;

    // Кузов автобуса.
    svg.appendChild(
      el("path", {
        class: "bus-frame",
        d: buildFramePath(width, height, PAD),
      }),
    );

    // Пол салона — единое пространство, включая места водителя и гида.
    svg.appendChild(
      el("rect", {
        class: "bus-cabin",
        x: bodyX0 + CABIN_INSET,
        y: bodyY0 + CABIN_INSET,
        width: width - PAD - CABIN_INSET * 2,
        height: height - PAD - CABIN_INSET * 2,
        rx: 18,
        ry: 18,
      }),
    );

    // Дверь в профиле "выключает" оконную секцию своего борта. Двери могут
    // быть с обеих сторон одной колонки одновременно, поэтому храним набор
    // сторон, а не единственное значение.
    var doorSidesByColumn = {};
    for (var doorRow = bounds.minRow; doorRow <= bounds.maxRow; doorRow++) {
      for (var doorCol = bounds.minCol; doorCol <= bounds.maxCol; doorCol++) {
        var doorCell = profile.cells[doorRow * profile.cols + doorCol];
        if (doorCell && doorCell.type === "door") {
          var localDoorCol = doorCol - bounds.minCol;
          var distanceToTop = doorRow - bounds.minRow;
          var distanceToBottom = bounds.maxRow - doorRow;
          var side = distanceToTop <= distanceToBottom ? "top" : "bottom";
          if (!doorSidesByColumn[localDoorCol]) {
            doorSidesByColumn[localDoorCol] = {};
          }
          doorSidesByColumn[localDoorCol][side] = true;
        }
      }
    }

    // Оси колёс. Задняя ось: либо между указанными колонками, либо автоматически.
    var rearAxleX = bodyX0 + Math.max(82, seatsWidth * 0.18);
    var rearAfterCol = parseInt(profile.rearWheelsAfterCol, 10);
    if (!isNaN(rearAfterCol)) {
      var localBoundary = rearAfterCol - bounds.minCol;
      if (localBoundary >= 1 && localBoundary <= cols - 1) {
        rearAxleX = PAD + GAP + localBoundary * (CELL_W + GAP) - GAP / 2;
      }
    }
    var frontAxleX = bodyX1 - 96;

    // Боковые окна выровнены по колонкам кресел — ровный ритм остекления.
    for (var windowCol = 0; windowCol < cols; windowCol++) {
      var windowX = PAD + GAP + windowCol * (CELL_W + GAP) + 6;
      [
        { y: bodyY0 + 5, side: "top" },
        { y: bodyY1 - 15, side: "bottom" },
      ].forEach(function (windowSide) {
        if (doorSidesByColumn[windowCol] && doorSidesByColumn[windowCol][windowSide.side]) {
          return;
        }
        svg.appendChild(
          el("rect", {
            class: "bus-side-window",
            x: windowX,
            y: windowSide.y,
            width: CELL_W - 12,
            height: 10,
            rx: 5,
            ry: 5,
          }),
        );
      });
    }

    // Заднее стекло.
    svg.appendChild(
      el("rect", {
        class: "bus-side-window",
        x: bodyX0 + 5,
        y: height / 2 - Math.max(30, seatsHeight * 0.22),
        width: 10,
        height: Math.max(60, seatsHeight * 0.44),
        rx: 5,
        ry: 5,
      }),
    );

    // Лобовое стекло и руль (отдельной кабины нет — салон единый).
    svg.appendChild(
      el("path", {
        class: "bus-windshield",
        d:
          "M " +
          (bodyX1 - 30) +
          " " +
          (bodyY0 + 58) +
          " Q " +
          (bodyX1 - 12) +
          " " +
          height / 2 +
          " " +
          (bodyX1 - 30) +
          " " +
          (bodyY1 - 58),
      }),
    );

    // Руль — на уровне места водителя и вплотную перед ним (по ходу движения).
    var driverCenterY = null;
    var driverRightX = null;
    for (var dRow = bounds.minRow; dRow <= bounds.maxRow; dRow++) {
      for (var dCol = bounds.minCol; dCol <= bounds.maxCol; dCol++) {
        var dCell = profile.cells[dRow * profile.cols + dCol];
        if (dCell && dCell.type === "driver") {
          driverCenterY =
            PAD +
            GAP_Y +
            (dRow - bounds.minRow) * (CELL_H + GAP_Y) +
            CELL_H / 2;
          driverRightX =
            PAD + GAP + (dCol - bounds.minCol) * (CELL_W + GAP) + CELL_W;
        }
      }
    }
    var steeringX =
      driverRightX !== null
        ? Math.min(driverRightX + 24, bodyX1 - 30)
        : bodyX1 - 48;
    var steeringY = driverCenterY !== null ? driverCenterY : bodyY0 + 58;
    svg.appendChild(
      el("circle", {
        class: "bus-steering",
        cx: steeringX,
        cy: steeringY,
        r: 16,
      }),
    );
    svg.appendChild(
      el("circle", {
        class: "bus-steering-inner",
        cx: steeringX,
        cy: steeringY,
        r: 5,
      }),
    );

    // Колёса рисуются под кузовом (первым слоем): снаружи виден только
    // аккуратный выступ шины — примыкание к борту получается само собой.
    var wheelsLayer = el("g", { class: "wheels-layer" });
    [rearAxleX, frontAxleX].forEach(function (wheelX) {
      [
        { y: bodyY0 - 14, sidewallY: bodyY0 - 10 },
        { y: bodyY1 - 10, sidewallY: bodyY1 + 3 },
      ].forEach(function (wheelPos) {
        wheelsLayer.appendChild(
          el("rect", {
            class: "bus-wheel",
            x: wheelX - 34,
            y: wheelPos.y,
            width: 68,
            height: 24,
            rx: 8,
            ry: 8,
          }),
        );
        wheelsLayer.appendChild(
          el("rect", {
            class: "bus-wheel-sidewall",
            x: wheelX - 22,
            y: wheelPos.sidewallY,
            width: 44,
            height: 5,
            rx: 2.5,
            ry: 2.5,
          }),
        );
      });
    });
    svg.insertBefore(wheelsLayer, svg.firstChild);

    // Стрелка направления движения — перед лобовым стеклом, со стороны салона,
    // чтобы не перекрывать стекло.
    var noseArrowX = bodyX1 - 66;
    svg.appendChild(
      el("path", {
        class: "bus-direction-arrow",
        d:
          "M " +
          (noseArrowX - 5) +
          " " +
          (height / 2 - 9) +
          " L " +
          (noseArrowX + 4) +
          " " +
          height / 2 +
          " L " +
          (noseArrowX - 5) +
          " " +
          (height / 2 + 9),
      }),
    );

    // Светотехника: фары на носу, фонари на корме.
    [bodyY0 + 44, bodyY1 - 44].forEach(function (lightY) {
      svg.appendChild(
        el("rect", {
          class: "bus-headlight",
          x: bodyX1 - 12,
          y: lightY - 10,
          width: 8,
          height: 20,
          rx: 4,
          ry: 4,
        }),
      );
      svg.appendChild(
        el("rect", {
          class: "bus-tail-light",
          x: bodyX0 + 4,
          y: lightY - 9,
          width: 6,
          height: 18,
          rx: 3,
          ry: 3,
        }),
      );
    });

    var seatsLayer = el("g", { class: "seats-layer" });

    for (var r = bounds.minRow; r <= bounds.maxRow; r++) {
      for (var c = bounds.minCol; c <= bounds.maxCol; c++) {
        var idx = r * profile.cols + c;
        var cell = profile.cells[idx];
        if (!cell || cell.type === "empty") {
          continue;
        }

        var x = PAD + GAP + (c - bounds.minCol) * (CELL_W + GAP);
        var y = PAD + GAP_Y + (r - bounds.minRow) * (CELL_H + GAP_Y);

        if (cell.type === "door") {
          var distanceToTop = r - bounds.minRow;
          var distanceToBottom = bounds.maxRow - r;
          var doorSide = distanceToTop <= distanceToBottom ? "top" : "bottom";
          seatsLayer.appendChild(
            buildDoorGroup(x, y, CELL_W, CELL_H, doorSide, bodyY0, bodyY1),
          );
          continue;
        }
        if (cell.type === "guide") {
          // Место гида по умолчанию занято, но остаётся переключаемым,
          // как обычное место — просто с подписью "Гид".
          var guideStatus =
            initialStatus[cell.number] === "free" ? "free" : "occupied";
          var gg = buildSeatGroup(
            x,
            y,
            CELL_W,
            CELL_H,
            guideStatus,
            cell.number != null ? cell.number : "Гид",
            "guide",
            "Гид",
          );
          gg.setAttribute("data-guide", "true");
          if (cell.number != null) {
            gg.setAttribute("data-seat", cell.number);
          }
          seatsLayer.appendChild(gg);
          continue;
        }

        if (cell.type === "driver") {
          var dg = buildSeatGroup(x, y, CELL_W, CELL_H, "driver", "Вод.", "driver");
          dg.setAttribute("data-driver", "true");
          seatsLayer.appendChild(dg);
          continue;
        }

        if (cell.type === "seat" && cell.number != null) {
          var status =
            initialStatus[cell.number] === "occupied" ? "occupied" : "free";
          var sg = buildSeatGroup(x, y, CELL_W, CELL_H, status, cell.number, null);
          sg.setAttribute("data-seat", cell.number);
          seatsLayer.appendChild(sg);
        }
      }
    }

    svg.appendChild(seatsLayer);

    // Легенда "свободное / занятое место" — часть самой картинки, чтобы
    // сохранялась и при копировании/скачивании PNG.
    var legendY = height + LEGEND_H / 2 - 16;
    var legendIconW = 40;
    var legendIconH = 32;
    var legendGap = 10; // между иконкой и подписью (внутри одного пункта — плотнее)
    var legendItemGap = 70; // между "свободное место" и "занятое место" (пункты — дальше друг от друга)

    var legendItems = [
      { status: "free", label: "свободное место" },
      { status: "occupied", label: "занятое место" },
    ];

    // Считаем ширину каждого пункта по длине текста, чтобы разместить оба
    // пункта по центру картинки.
    var approxCharW = 9.5;
    var itemWidths = legendItems.map(function (item) {
      return legendIconW + legendGap + item.label.length * approxCharW;
    });
    var legendTotalWidth =
      itemWidths[0] + itemWidths[1] + legendItemGap;
    var legendX = (width - legendTotalWidth) / 2;

    var legendLayer = el("g", { class: "seat-legend-layer" });
    legendItems.forEach(function (item, i) {
      var itemX = legendX;
      for (var k = 0; k < i; k++) {
        itemX += itemWidths[k] + legendItemGap;
      }
      var iconGroup = buildSeatGroup(
        itemX,
        legendY,
        legendIconW,
        legendIconH,
        item.status,
        "",
      );
      legendLayer.appendChild(iconGroup);

      var labelText = el("text", {
        class: "legend-label-text",
        x: itemX + legendIconW + legendGap,
        y: legendY + legendIconH / 2,
        "dominant-baseline": "central",
      });
      labelText.textContent = item.label;
      legendLayer.appendChild(labelText);
    });

    svg.appendChild(legendLayer);

    return svg;
  }

  // Путь корпуса автобуса: закруглённый нос справа (перед), более прямая корма слева (зад).
  function buildFramePath(width, height, pad) {
    var x0 = pad / 2;
    var y0 = pad / 2;
    var x1 = width - pad / 2;
    var y1 = height - pad / 2;
    var rearR = 18; // радиус скругления кормы (слева)
    var frontR = 46; // радиус скругления носа (справа)

    return (
      "M " +
      (x0 + rearR) +
      " " +
      y0 +
      " L " +
      (x1 - frontR) +
      " " +
      y0 +
      " Q " +
      x1 +
      " " +
      y0 +
      " " +
      x1 +
      " " +
      (y0 + frontR) +
      " L " +
      x1 +
      " " +
      (y1 - frontR) +
      " Q " +
      x1 +
      " " +
      y1 +
      " " +
      (x1 - frontR) +
      " " +
      y1 +
      " L " +
      (x0 + rearR) +
      " " +
      y1 +
      " Q " +
      x0 +
      " " +
      y1 +
      " " +
      x0 +
      " " +
      (y1 - rearR) +
      " L " +
      x0 +
      " " +
      (y0 + rearR) +
      " Q " +
      x0 +
      " " +
      y0 +
      " " +
      (x0 + rearR) +
      " " +
      y0 +
      " Z"
    );
  }

  // Установить визуальный статус места на generic SVG (jQuery-обёртка $svg).
  function setGenericSeatStatus($svg, seatNumber, isFree) {
    var $rects = $svg.find(
      '[data-seat="' +
        seatNumber +
        '"] rect.seat-back, ' +
        '[data-seat="' +
        seatNumber +
        '"] rect.seat-cushion',
    );
    $rects.removeClass("free occupied").addClass(isFree ? "free" : "occupied");
  }

  // Небольшая самостоятельная SVG-иконка кресла для легенды/подсказок —
  // точная копия отрисовки места на схеме (спинка + сидушка), без номера.
  function generateSeatIconSVG(statusClass) {
    var w = 46;
    var h = 40;
    var svg = el("svg", {
      xmlns: NS,
      viewBox: "0 0 " + w + " " + h,
      width: w,
      height: h,
      class: "seat-legend-icon",
    });
    svg.appendChild(buildSeatGroup(3, 2, w - 6, h - 4, statusClass, ""));
    return svg;
  }

  return {
    CLASSIC_PROFILE_ID: CLASSIC_PROFILE_ID,
    getProfiles: getProfiles,
    getProfile: getProfile,
    saveProfile: saveProfile,
    deleteProfile: deleteProfile,
    replaceProfiles: replaceProfiles,
    getSelectedProfileId: getSelectedProfileId,
    setSelectedProfileId: setSelectedProfileId,
    getSeatNumbers: getSeatNumbers,
    getGuideCell: getGuideCell,
    getDriverCell: getDriverCell,
    validateProfile: validateProfile,
    generateGenericSVG: generateGenericSVG,
    setGenericSeatStatus: setGenericSeatStatus,
    generateSeatIconSVG: generateSeatIconSVG,
    generateId: generateId,
  };
})();
