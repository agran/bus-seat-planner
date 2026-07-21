/* seatProfiles.js
 * Общий модуль для admin.html и index.html:
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
 * в viewer.js для полной обратной совместимости со старыми ссылками.
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

  // ---- Генерация SVG-картинки в стиле дизайна «Схема микроавтобуса» ----
  // Визуальный стиль и геометрия — по макетам дизайнера: тёмно-зелёный фон
  // с жёлтым свечением снизу, белый кузов с серым салоном, кресла
  // «спинка + сидушка» (зелёные — свободные, красные — занятые),
  // полупрозрачная плашка-легенда «ЗАНЯТОЕ / СВОБОДНОЕ МЕСТО» под автобусом.

  // Сетка кресел внутри салона (в нативных единицах кресла дизайнера).
  var COL_GAP = 28; // горизонтальный зазор между креслами (проход по ряду)
  var ROW_GAP = 8; // вертикальный зазор между рядами
  var SALON_PAD_X = 40; // отступ салона от крайних колонок кресел
  var SALON_PAD_Y = 30; // отступ салона от крайних рядов кресел
  var CANVAS_MARGIN = 70; // поле фона вокруг кузова
  var LEGEND_GAP_V = 40; // расстояние от кузова до плашки-легенды

  var NS = "http://www.w3.org/2000/svg";

  // Геометрия кресла дизайнера, нативный размер 134x107:
  // спинка слева (перед автобуса — справа), сидушка справа, декоративные
  // «вставки» на спинке рисуются через маску.
  var SEAT_DW = 134;
  var SEAT_DH = 107;
  var SEAT_BACK_D =
    "M0 23.7204C0 10.8211 10.8069 0.553861 23.6893 1.21409L40.6882 2.08529V104.915L23.6893 105.786C10.8069 106.446 0 96.1789 0 83.2796V23.7204Z";
  var SEAT_MASK_D =
    "M0 22.5359C0 10.0897 10.0897 0 22.5359 0H47V107H22.5359C10.0897 107 0 96.9103 0 84.4641V22.5359Z";
  var SEAT_DETAIL1_D =
    "M27.5141 20.4298C27.5141 27.1672 17.4742 32.6289 11.2571 32.6289C5.03996 32.6289 0 27.1672 0 20.4298C0 13.6924 5.03996 -7.93666 11.2571 -7.93666C26.8542 -14.6978 76.0688 3.23376 27.5141 20.4298Z";
  var SEAT_DETAIL2_D =
    "M27.5141 86.0971C27.5141 79.3597 17.4742 73.8979 11.2571 73.8979C5.03996 73.8979 0 79.3597 0 86.0971C0 92.8345 5.03996 114.464 11.2571 114.464C26.8542 121.225 76.0688 103.293 27.5141 86.0971Z";
  var SEAT_CUSHION_D =
    "M27 20C27 8.9543 35.9543 0 47 0H114C125.046 0 134 8.95431 134 20V87C134 98.0457 125.046 107 114 107H47C35.9543 107 27 98.0457 27 87V20Z";

  // Кузов микроавтобуса дизайнера, нативный размер 1473x621.
  // Салон (серая зона) в этих координатах: x 92..1253, y 80..550 —
  // под него масштабируется весь кузов, чтобы вместить сетку кресел.
  var BUS_DW = 1473;
  var BUS_DH = 621;
  var BUS_SALON_X = 92;
  var BUS_SALON_Y = 80;
  var BUS_SALON_W = 1161; // 1253 - 92
  var BUS_SALON_H = 470; // 550 - 80
  var BUS_BODY_PATHS = [
    { d: "M0 107.559C0 74.422 26.8629 47.5591 60 47.5591H1275.45C1285.36 47.5591 1295.26 48.3783 1305.04 50.0082L1376.2 61.8689C1402.17 66.1972 1423.52 84.7315 1431.44 109.838L1465.11 216.446C1470.34 233.007 1473 250.271 1473 267.638V316.059V364.48C1473 381.847 1470.34 399.111 1465.11 415.672L1431.44 522.281C1423.52 547.387 1402.17 565.921 1376.2 570.249L1305.04 582.11C1295.26 583.74 1285.36 584.559 1275.45 584.559H60C26.8629 584.559 0 557.696 0 524.559V107.559Z", fill: "white" },
    { d: "M0 119.334C0 114.431 5.56013 111.598 9.52631 114.479L23.5087 124.636C33.8691 132.162 40 144.193 40 156.999V474.119C40 486.925 33.8691 498.956 23.5087 506.482L9.52632 516.639C5.56013 519.52 0 516.687 0 511.785V504.839V441.746V315.559V189.372V126.279V119.334Z", fill: "#D9D9D9" },
    { d: "M92 112.559C92 94.886 106.327 80.5591 124 80.5591L1233.77 80.5591C1243.02 80.5591 1251.04 86.96 1253.09 95.98C1285.94 240.522 1285.94 390.596 1253.09 535.138C1251.04 544.158 1243.02 550.559 1233.77 550.559H124C106.327 550.559 92 536.232 92 518.559V112.559Z", fill: "#898989" },
    { d: "M92 112.74C92 95.0671 106.327 80.7402 124 80.7402H1047C1064.67 80.7402 1079 95.0671 1079 112.74V518.74C1079 536.413 1064.67 550.74 1047 550.74H124C106.327 550.74 92 536.413 92 518.74V112.74Z", fill: "#AFAFAF" },
    { d: "M40 315.74H0", stroke: "white", "stroke-width": 6 },
    { d: "M1453 187.212L1291.21 108.476C1285.58 105.735 1279.31 110.818 1280.83 116.893C1313.44 247.33 1313.44 383.788 1280.83 514.225C1279.31 520.3 1285.58 525.383 1291.21 522.643L1453 443.906", stroke: "#F0F0F0", "stroke-width": 6 },
    { d: "M1392.62 104.644C1388.12 92.0751 1366.71 68.0923 1356.57 58.7402C1421.92 58.7402 1444.09 107.342 1444.09 149.534C1421.56 149.534 1398.26 120.356 1392.62 104.644Z", fill: "#D9D9D9" },
    { d: "M1392.62 527.63C1388.12 540.199 1366.71 564.182 1356.57 573.534C1421.92 573.534 1444.09 524.933 1444.09 482.74C1421.56 482.74 1398.26 511.919 1392.62 527.63Z", fill: "#D9D9D9" },
    { d: "M1312.92 160.348C1312.15 154.795 1318.73 151.308 1322.89 155.072L1324.23 156.284C1336.33 167.247 1344.59 181.816 1347.76 197.835L1353.67 227.619C1355.17 235.192 1349.38 242.248 1341.66 242.248C1331.73 242.248 1323.32 234.929 1321.95 225.095L1312.92 160.348Z", fill: "#F0F0F0" },
    { d: "M1312.92 471.555C1312.15 477.108 1318.73 480.594 1322.89 476.83L1324.23 475.618C1336.33 464.656 1344.59 450.086 1347.76 434.067L1353.67 404.283C1355.17 396.711 1349.38 389.655 1341.66 389.655C1331.73 389.655 1323.32 396.974 1321.95 406.808L1312.92 471.555Z", fill: "#F0F0F0" },
    { d: "M1258.76 565.847L1271.7 573.316L1283.77 552.405C1285.43 549.535 1284.44 545.866 1281.57 544.209L1279.03 542.74C1276.16 541.083 1272.49 542.067 1270.83 544.936L1258.76 565.847Z", fill: "#F0F0F0" },
    { d: "M1234.96 607.085L1241.69 610.971C1251.26 616.494 1263.49 613.216 1269.01 603.65L1274.64 593.908C1280.16 584.342 1276.88 572.11 1267.32 566.587L1260.59 562.702L1234.96 607.085Z", fill: "#D9D9D9" },
    { d: "M1258.76 55.124L1271.7 47.6552L1283.77 68.5655C1285.43 71.4352 1284.44 75.1048 1281.57 76.7616L1279.03 78.2305C1276.16 79.8873 1272.49 78.9041 1270.83 76.0343L1258.76 55.124Z", fill: "#F0F0F0" },
    { d: "M1234.96 13.8853L1241.69 9.99987C1251.26 4.47702 1263.49 7.75452 1269.01 17.3204L1274.64 27.0629C1280.16 36.6288 1276.88 48.8606 1267.32 54.3834L1260.59 58.2688L1234.96 13.8853Z", fill: "#D9D9D9" },
  ];

  // Колёсные арки дизайнера (верхняя/нижняя, одинаковые по x: 281..510,
  // центр 395.5). Рисуются отдельно от кузова: их положение вдоль автобуса
  // настраивается в профиле (rearWheelsAfterCol).
  var WHEEL_TOP_D =
    "M291.088 43.7883C305.646 38.3463 321.063 35.5591 336.606 35.5591H454.394C469.937 35.5591 485.354 38.3463 499.912 43.7883L510 47.5591H281L291.088 43.7883Z";
  var WHEEL_BOTTOM_D =
    "M291.088 588.33C305.646 593.772 321.063 596.559 336.606 596.559H454.394C469.937 596.559 485.354 593.772 499.912 588.33L510 584.559H281L291.088 588.33Z";
  var WHEEL_CENTER_X = 395.5; // центр арки в нативных координатах кузова

  // Плашка-легенда дизайнера (трапеция 1550x203, полупрозрачная).
  var LEGEND_DW = 1550;
  var LEGEND_DH = 203;
  var LEGEND_BAR_D =
    "M70.7635 111.991C125.705 41.3308 210.196 0 299.702 0H1250.3C1339.8 0 1424.3 41.3308 1479.24 111.991L1550 203H0L70.7635 111.991Z";

  // Счётчик сгенерированных картинок — для уникальных id масок/фильтров,
  // чтобы несколько SVG на одной странице не конфликтовали.
  var svgInstanceCounter = 0;

  // Копия правил из seatProfiles.css, встраиваемая прямо в генерируемый SVG
  // (нужно для корректного экспорта/копирования картинки — см. generateGenericSVG).
  var GENERIC_SVG_CSS =
    ".generic-seat{filter:drop-shadow(0 3px 3px rgba(0,0,0,0.3));}" +
    ".seat-back{cursor:pointer;pointer-events:fill;}" +
    ".seat-cushion{cursor:pointer;pointer-events:fill;}" +
    ".seat-detail{pointer-events:none;}" +
    ".seat-back.free{fill:#0C3322;}" +
    ".seat-cushion.free{fill:#0C6D43;}" +
    ".seat-detail.free{fill:#031B11;}" +
    ".seat-back.occupied{fill:#6F1616;}" +
    ".seat-cushion.occupied{fill:#A82020;}" +
    ".seat-detail.occupied{fill:#530707;}" +
    ".seat-back.driver{fill:#262626;cursor:default;}" +
    ".seat-cushion.driver{fill:#333333;cursor:default;}" +
    ".seat-detail.driver{fill:#050505;}" +
    ".seat-text{fill:#ffffff;font-size:48px;font-weight:700;font-family:Arial,sans-serif;font-variant-numeric:tabular-nums;pointer-events:none;user-select:none;}" +
    ".generic-guide .seat-text{font-size:38px;}" +
    ".generic-driver .seat-text{font-size:30px;}" +
    ".seat-subtext{fill:#ffffff;font-size:20px;font-weight:700;font-family:Arial,sans-serif;pointer-events:none;user-select:none;opacity:0.85;}" +
    ".door-floor{fill:#ffffff;}" +
    ".door-text{fill:#51677a;font-family:Arial,sans-serif;font-size:20px;font-weight:700;pointer-events:none;user-select:none;}" +
    ".legend-label-text{fill:#ffffff;font-size:36px;font-weight:700;font-family:Arial,sans-serif;pointer-events:none;user-select:none;}";

  function el(tag, attrs) {
    var e = document.createElementNS(NS, tag);
    if (attrs) {
      for (var k in attrs) {
        e.setAttribute(k, attrs[k]);
      }
    }
    return e;
  }

  // Собирает <g> с креслом дизайнера: спинка + декоративные вставки через
  // маску + сидушка + номер белым текстом по центру сидушки.
  // x, y — левый верхний угол кресла; scale — масштаб от нативных 134x107.
  function buildSeatGroup(
    x,
    y,
    scale,
    statusClass,
    label,
    specialType,
    subLabel,
    maskId,
  ) {
    var g = el("g", {
      class:
        "generic-seat" +
        (specialType === "guide" ? " generic-guide" : "") +
        (specialType === "driver" ? " generic-driver" : ""),
      transform:
        "translate(" + x + " " + y + ")" +
        (scale && scale !== 1 ? " scale(" + scale + ")" : ""),
    });

    g.appendChild(
      el("path", { class: "seat-back " + statusClass, d: SEAT_BACK_D }),
    );

    var detail = el("g", { mask: "url(#" + maskId + ")" });
    detail.appendChild(
      el("path", { class: "seat-detail " + statusClass, d: SEAT_DETAIL1_D }),
    );
    detail.appendChild(
      el("path", { class: "seat-detail " + statusClass, d: SEAT_DETAIL2_D }),
    );
    g.appendChild(detail);

    g.appendChild(
      el("path", { class: "seat-cushion " + statusClass, d: SEAT_CUSHION_D }),
    );

    // Центр сидушки — (80.5, 53.5) в нативных координатах кресла.
    var text = el("text", {
      class: "seat-text",
      x: 80.5,
      y: subLabel ? 40 : 53.5,
      "text-anchor": "middle",
      "dominant-baseline": "central",
    });
    text.textContent = label;
    g.appendChild(text);

    if (subLabel) {
      var sub = el("text", {
        class: "seat-subtext",
        x: 80.5,
        y: 84,
        "text-anchor": "middle",
        "dominant-baseline": "central",
      });
      sub.textContent = subLabel;
      g.appendChild(sub);
    }

    return g;
  }

  // Дверь — белый проём от ячейки двери к ближайшему борту (side:
  // "top"/"bottom", edgeY — граница серой зоны салона). В месте примыкания
  // к стенке — внешнее скругление (галтель): боковые стороны проёма плавно
  // расходятся дугами наружу и сливаются с линией стенки, будто стенка
  // салона вдаётся в салон у двери. Край проёма заканчивается ровно на
  // границе салона, поэтому на белом борту кузова дверь не видна.
  function buildDoorGroup(x, y, w, h, side, edgeY) {
    var g = el("g", {
      class: "generic-door generic-door-" + side,
      "data-door": "true",
    });
    // Ширина проёма — как у места целиком (спинка + сидушка).
    var x0 = x;
    var x1 = x + w;
    var cornerR = 20; // скругление углов у ячейки — как у сидушек
    var filletR = 14; // радиус внешнего скругления у стенки
    var d;
    if (side === "bottom") {
      var top = y + 6;
      d =
        "M " + (x0 + cornerR) + " " + top +
        " H " + (x1 - cornerR) +
        " A " + cornerR + " " + cornerR + " 0 0 1 " + x1 + " " + (top + cornerR) +
        " V " + (edgeY - filletR) +
        " A " + filletR + " " + filletR + " 0 0 0 " + (x1 + filletR) + " " + edgeY +
        " H " + (x0 - filletR) +
        " A " + filletR + " " + filletR + " 0 0 0 " + x0 + " " + (edgeY - filletR) +
        " V " + (top + cornerR) +
        " A " + cornerR + " " + cornerR + " 0 0 1 " + (x0 + cornerR) + " " + top +
        " Z";
    } else {
      var bottom = y + h - 6;
      d =
        "M " + (x0 + cornerR) + " " + bottom +
        " H " + (x1 - cornerR) +
        " A " + cornerR + " " + cornerR + " 0 0 0 " + x1 + " " + (bottom - cornerR) +
        " V " + (edgeY + filletR) +
        " A " + filletR + " " + filletR + " 0 0 1 " + (x1 + filletR) + " " + edgeY +
        " H " + (x0 - filletR) +
        " A " + filletR + " " + filletR + " 0 0 1 " + x0 + " " + (edgeY + filletR) +
        " V " + (bottom - cornerR) +
        " A " + cornerR + " " + cornerR + " 0 0 0 " + (x0 + cornerR) + " " + bottom +
        " Z";
    }
    g.appendChild(el("path", { class: "door-floor", d: d }));
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
    svgInstanceCounter++;
    var maskId = "seat-mask-" + svgInstanceCounter;
    var clipId = "canvas-clip-" + svgInstanceCounter;
    var blurId = "glow-blur-" + svgInstanceCounter;

    var bounds = getOccupiedBounds(profile);
    var rows = bounds.maxRow - bounds.minRow + 1;
    var cols = bounds.maxCol - bounds.minCol + 1;

    // Сетка кресел в нативных единицах кресла; салон кузова масштабируется
    // под неё (кузов тянется неравномерно — скругления слегка деформируются,
    // но общий силуэт и пропорции дизайна сохраняются).
    var gridW = cols * SEAT_DW + (cols - 1) * COL_GAP;
    var gridH = rows * SEAT_DH + (rows - 1) * ROW_GAP;
    var salonW = gridW + SALON_PAD_X * 2;
    var salonH = gridH + SALON_PAD_Y * 2;

    var busSX = salonW / BUS_SALON_W;
    var busSY = salonH / BUS_SALON_H;
    var busW = BUS_DW * busSX;
    var busH = BUS_DH * busSY;

    var width = busW + CANVAS_MARGIN * 2;
    var legendH = width * (LEGEND_DH / LEGEND_DW);
    var totalHeight = CANVAS_MARGIN + busH + LEGEND_GAP_V + legendH;

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

    var defs = el("defs");

    // Клип по холсту — свечение не должно вылезать за края картинки.
    var clip = el("clipPath", { id: clipId });
    clip.appendChild(
      el("rect", { x: 0, y: 0, width: width, height: totalHeight }),
    );
    defs.appendChild(clip);

    // Размытие для жёлтого свечения (гауссово, как в макете).
    var blur = el("filter", {
      id: blurId,
      x: "-50%",
      y: "-50%",
      width: "200%",
      height: "200%",
    });
    blur.appendChild(
      el("feGaussianBlur", { stdDeviation: 105 * (width / LEGEND_DW) }),
    );
    defs.appendChild(blur);

    // Маска декоративных вставок на спинке кресла (общая для всех кресел).
    var mask = el("mask", {
      id: maskId,
      maskUnits: "userSpaceOnUse",
      x: 0,
      y: 0,
      width: SEAT_DW,
      height: SEAT_DH,
    });
    mask.appendChild(el("path", { d: SEAT_MASK_D, fill: "white" }));
    defs.appendChild(mask);

    svg.appendChild(defs);

    // Фон: тёмно-зелёный + жёлтое свечение снизу по центру.
    svg.appendChild(
      el("rect", {
        x: 0,
        y: 0,
        width: width,
        height: totalHeight,
        fill: "#0C6D43",
      }),
    );
    var glowScale = width / LEGEND_DW;
    var glow = el("g", { "clip-path": "url(#" + clipId + ")" });
    glow.appendChild(
      el("ellipse", {
        cx: width / 2,
        cy: totalHeight + 281 * glowScale,
        rx: 744 * glowScale,
        ry: 515 * glowScale,
        fill: "#FBBC04",
        filter: "url(#" + blurId + ")",
      }),
    );
    svg.appendChild(glow);

    // Кузов автобуса (масштабированный кузов дизайнера).
    var busX0 = CANVAS_MARGIN;
    var busY0 = CANVAS_MARGIN;
    var busGroup = el("g", {
      class: "bus-body",
      transform:
        "translate(" + busX0 + " " + busY0 + ") scale(" + busSX + " " + busSY + ")",
    });
    BUS_BODY_PATHS.forEach(function (p) {
      var attrs = { d: p.d };
      if (p.stroke) {
        attrs.stroke = p.stroke;
        attrs["stroke-width"] = p["stroke-width"];
        attrs.fill = "none";
      } else {
        attrs.fill = p.fill;
      }
      busGroup.appendChild(el("path", attrs));
    });
    svg.appendChild(busGroup);

    // Сетка кресел центрируется внутри салона кузова.
    var salonX = busX0 + BUS_SALON_X * busSX;
    var salonY = busY0 + BUS_SALON_Y * busSY;
    var seatX0 = salonX + (salonW - gridW) / 2;
    var seatY0 = salonY + (salonH - gridH) / 2;

    // Колёсные арки: положение задней оси настраивается в профиле (между
    // какими колонками мест), как в старом генераторе. Если настройка не
    // задана или некорректна — штатная позиция арок из макета дизайнера.
    var wheelDx = 0;
    var rearAfterCol = parseInt(profile.rearWheelsAfterCol, 10);
    if (!isNaN(rearAfterCol)) {
      var localBoundary = rearAfterCol - bounds.minCol;
      if (localBoundary >= 1 && localBoundary <= cols - 1) {
        var wheelCenterCanvasX =
          seatX0 + localBoundary * (SEAT_DW + COL_GAP) - COL_GAP / 2;
        wheelDx = (wheelCenterCanvasX - busX0) / busSX - WHEEL_CENTER_X;
      }
    }
    var wheelsGroup = el("g", {
      class: "bus-wheels",
      transform: "translate(" + wheelDx + " 0)",
    });
    wheelsGroup.appendChild(el("path", { d: WHEEL_TOP_D, fill: "#CFCFCF" }));
    wheelsGroup.appendChild(el("path", { d: WHEEL_BOTTOM_D, fill: "#CFCFCF" }));
    busGroup.appendChild(wheelsGroup);

    var seatsLayer = el("g", { class: "seats-layer" });

    for (var r = bounds.minRow; r <= bounds.maxRow; r++) {
      for (var c = bounds.minCol; c <= bounds.maxCol; c++) {
        var idx = r * profile.cols + c;
        var cell = profile.cells[idx];
        if (!cell || cell.type === "empty") {
          continue;
        }

        var x = seatX0 + (c - bounds.minCol) * (SEAT_DW + COL_GAP);
        var y = seatY0 + (r - bounds.minRow) * (SEAT_DH + ROW_GAP);

        if (cell.type === "door") {
          // Дверь примыкает к ближайшему борту: если ячейка ближе к верхнему
          // ряду — проём тянется вверх, иначе — вниз. Край — граница серой
          // зоны салона (80.56 / 550.56 в нативных координатах кузова).
          var distanceToTop = r - bounds.minRow;
          var distanceToBottom = bounds.maxRow - r;
          var doorSide = distanceToTop <= distanceToBottom ? "top" : "bottom";
          var salonEdgeY =
            doorSide === "bottom"
              ? busY0 + 550.56 * busSY
              : busY0 + 80.56 * busSY;
          seatsLayer.appendChild(
            buildDoorGroup(x, y, SEAT_DW, SEAT_DH, doorSide, salonEdgeY),
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
            1,
            guideStatus,
            cell.number != null ? cell.number : "Гид",
            "guide",
            "Гид",
            maskId,
          );
          gg.setAttribute("data-guide", "true");
          if (cell.number != null) {
            gg.setAttribute("data-seat", cell.number);
          }
          seatsLayer.appendChild(gg);
          continue;
        }

        if (cell.type === "driver") {
          var dg = buildSeatGroup(
            x,
            y,
            1,
            "driver",
            "Вод.",
            "driver",
            null,
            maskId,
          );
          dg.setAttribute("data-driver", "true");
          seatsLayer.appendChild(dg);
          continue;
        }

        if (cell.type === "seat" && cell.number != null) {
          var status =
            initialStatus[cell.number] === "occupied" ? "occupied" : "free";
          var sg = buildSeatGroup(
            x,
            y,
            1,
            status,
            cell.number,
            null,
            null,
            maskId,
          );
          sg.setAttribute("data-seat", cell.number);
          seatsLayer.appendChild(sg);
        }
      }
    }

    svg.appendChild(seatsLayer);

    // Плашка-легенда «ЗАНЯТОЕ / СВОБОДНОЕ МЕСТО» — часть самой картинки,
    // чтобы сохранялась и при копировании/скачивании PNG.
    var legendScale = width / LEGEND_DW;
    var legendLayer = el("g", {
      class: "seat-legend-layer",
      transform:
        "translate(0 " + (totalHeight - legendH) + ") scale(" + legendScale + ")",
    });
    legendLayer.appendChild(
      el("path", {
        d: LEGEND_BAR_D,
        fill: "#3AA878",
        "fill-opacity": 0.2,
      }),
    );
    // Позиции мини-кресел и подписей — как в макете дизайнера:
    // красное кресло слева («занятое»), зелёное справа («свободное»).
    [
      { status: "occupied", label: "ЗАНЯТОЕ МЕСТО", x: 292 },
      { status: "free", label: "СВОБОДНОЕ МЕСТО", x: 820 },
    ].forEach(function (item) {
      legendLayer.appendChild(
        buildSeatGroup(item.x, 54, 1, item.status, "", null, null, maskId),
      );
      var labelText = el("text", {
        class: "legend-label-text",
        x: item.x + 170,
        y: 107.5,
        "dominant-baseline": "central",
      });
      labelText.textContent = item.label;
      legendLayer.appendChild(labelText);
    });

    svg.appendChild(legendLayer);

    return svg;
  }

  // Установить визуальный статус места на generic SVG (jQuery-обёртка $svg).
  // Спинка/сидушка/вставки рисуются как <path>, поэтому селектор не привязан
  // к тегу — только к data-seat и классам элементов.
  function setGenericSeatStatus($svg, seatNumber, isFree) {
    var $rects = $svg.find(
      '[data-seat="' +
        seatNumber +
        '"] .seat-back, ' +
        '[data-seat="' +
        seatNumber +
        '"] .seat-cushion, ' +
        '[data-seat="' +
        seatNumber +
        '"] .seat-detail',
    );
    $rects.removeClass("free occupied").addClass(isFree ? "free" : "occupied");
  }

  // Небольшая самостоятельная SVG-иконка кресла для легенды/подсказок —
  // точная копия отрисовки места на схеме (спинка + сидушка), без номера.
  function generateSeatIconSVG(statusClass) {
    svgInstanceCounter++;
    var maskId = "seat-icon-mask-" + svgInstanceCounter;
    var svg = el("svg", {
      xmlns: NS,
      viewBox: "0 0 " + SEAT_DW + " " + SEAT_DH,
      width: 56,
      height: 45,
      class: "seat-legend-icon",
    });
    var mask = el("mask", {
      id: maskId,
      maskUnits: "userSpaceOnUse",
      x: 0,
      y: 0,
      width: SEAT_DW,
      height: SEAT_DH,
    });
    mask.appendChild(el("path", { d: SEAT_MASK_D, fill: "white" }));
    var defs = el("defs");
    defs.appendChild(mask);
    svg.appendChild(defs);
    svg.appendChild(buildSeatGroup(0, 0, 1, statusClass, "", null, null, maskId));
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
