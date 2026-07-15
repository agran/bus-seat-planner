/* latecomers.js
 * Калькулятор доплаты за опоздание к отправлению автобуса: делит сумму,
 * которую пришлось доплатить водителю, между опоздавшими туристами так,
 * что чем больше турист опоздал, тем бо́льшую долю доплаты он берёт на
 * себя. Тот, кто не опаздывал, не платит.
 */
$(function () {
  var STORAGE_KEY = "latecomersCalc_v1";
  var rowCounter = 0;

  // --- Разбор времени опоздания ---
  // Принимает "20" (минуты), "1:20" (часы:минуты) или "1ч20м"/"1ч"/"20м".
  function parseLateness(str) {
    str = String(str || "").trim();
    if (!str) {
      return 0;
    }

    var m = str.match(/^(\d+)\s*:\s*(\d{1,2})$/);
    if (m) {
      return Number(m[1]) * 60 + Number(m[2]);
    }

    m = str.match(/^(?:(\d+)\s*ч[а-я]*\.?)?\s*(?:(\d+)\s*м[а-я]*\.?)?$/i);
    if (m && (m[1] || m[2])) {
      return Number(m[1] || 0) * 60 + Number(m[2] || 0);
    }

    var n = Number(str.replace(",", "."));
    return isNaN(n) ? 0 : n;
  }

  function formatMinutes(mins) {
    mins = Math.round(mins);
    if (mins <= 0) {
      return "0м";
    }
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    return (h > 0 ? h + "ч " : "") + m + "м";
  }

  function formatMoney(n) {
    return (
      n.toLocaleString("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " руб."
    );
  }

  // --- Распределение суммы по весам без потери копеек ---
  // Считаем в копейках и раздаём округлённый остаток тем строкам, у
  // которых после округления вниз оказалась наибольшая дробная часть
  // (метод наибольшего остатка) — так сумма всех долей точно равна
  // исходной сумме доплаты.
  function distributeAmount(totalRub, weights) {
    var totalCents = Math.round(totalRub * 100);
    var sumWeights = weights.reduce(function (a, b) {
      return a + b;
    }, 0);

    if (sumWeights <= 0 || totalCents <= 0) {
      return weights.map(function () {
        return 0;
      });
    }

    var raw = weights.map(function (w) {
      return (totalCents * w) / sumWeights;
    });
    var floors = raw.map(Math.floor);
    var distributed = floors.reduce(function (a, b) {
      return a + b;
    }, 0);
    var remainder = totalCents - distributed;

    var order = raw
      .map(function (v, i) {
        return { i: i, frac: v - floors[i] };
      })
      .sort(function (a, b) {
        return b.frac - a.frac;
      });

    var result = floors.slice();
    for (var k = 0; k < remainder && k < order.length; k++) {
      result[order[k].i]++;
    }
    return result.map(function (c) {
      return c / 100;
    });
  }

  // --- Строки таблицы ---
  function addRow(data) {
    data = data || {};
    rowCounter++;
    var tr = $(
      '<tr class="latecomerRow" data-row-id="' +
        rowCounter +
        '">' +
        '<td class="rowNum"></td>' +
        '<td><input type="text" class="latecomerName" placeholder="Например: Иванов И.И."></td>' +
        '<td><input type="text" class="latecomerLate" placeholder="20 или 1:20"></td>' +
        '<td class="shareCell">—</td>' +
        '<td class="payCell">—</td>' +
        '<td><button type="button" class="removeRow" title="Удалить">✕</button></td>' +
        "</tr>",
    );
    tr.find(".latecomerName").val(data.name || "");
    tr.find(".latecomerLate").val(data.late || "");
    $("#latecomersBody").append(tr);
    renumberRows();
  }

  function renumberRows() {
    $("#latecomersBody .latecomerRow").each(function (idx) {
      $(this)
        .find(".rowNum")
        .text(idx + 1);
    });
  }

  function collectRows() {
    var rows = [];
    $("#latecomersBody .latecomerRow").each(function () {
      var tr = $(this);
      var lateStr = tr.find(".latecomerLate").val();
      rows.push({
        tr: tr,
        name: tr.find(".latecomerName").val(),
        lateStr: lateStr,
        minutes: parseLateness(lateStr),
      });
    });
    return rows;
  }

  // --- Расчёт ---
  function calculate() {
    var rows = collectRows();
    var totalStr = $("#totalOverpay").val();
    var total = Number(String(totalStr || "").replace(",", "."));
    var exponent = Number($("#weightExponent").val()) || 1;

    // Сбрасываем прежние результаты, чтобы не путать со старым расчётом,
    // если, например, пользователь исправил опоздание и забыл нажать
    // "Рассчитать" ещё раз.
    rows.forEach(function (r) {
      r.tr.find(".shareCell").text("—");
      r.tr.find(".payCell").text("—");
    });
    $("#copyPanel").hide();

    if (rows.length === 0) {
      showSummary('<span class="warn">Добавьте хотя бы одного туриста.</span>');
      return;
    }
    if (!totalStr || isNaN(total) || total < 0) {
      showSummary(
        '<span class="warn">Укажите сумму доплаты водителю (число рублей).</span>',
      );
      return;
    }

    var weights = rows.map(function (r) {
      return Math.pow(Math.max(r.minutes, 0), exponent);
    });
    var sumWeights = weights.reduce(function (a, b) {
      return a + b;
    }, 0);

    if (sumWeights <= 0) {
      showSummary(
        '<span class="warn">Никто не опоздал (или опоздание не указано) — распределять доплату не с кого.</span>',
      );
      return;
    }

    var pays = distributeAmount(total, weights);

    var totalMinutes = 0;
    var totalPaid = 0;
    var resultLines = [];

    rows.forEach(function (r, i) {
      var share = sumWeights > 0 ? weights[i] / sumWeights : 0;
      r.tr.find(".shareCell").text((share * 100).toFixed(1) + "%");
      r.tr.find(".payCell").text(formatMoney(pays[i]));
      totalMinutes += r.minutes;
      totalPaid += pays[i];
      if (r.minutes > 0) {
        var label =
          r.name && r.name.trim() ? r.name.trim() : "Место " + (i + 1);
        resultLines.push(
          label +
            " — опоздание " +
            formatMinutes(r.minutes) +
            " — доплата " +
            formatMoney(pays[i]),
        );
      }
    });

    lastResultText = resultLines.join("\n");

    showSummary(
      "Суммарное опоздание всех туристов: " +
        formatMinutes(totalMinutes) +
        ".<br>Распределено доплаты: " +
        formatMoney(totalPaid) +
        " из " +
        formatMoney(total) +
        ".",
    );
    $("#copyPanel").show();
    $("#copyStatus").text("");
  }

  var lastResultText = "";

  function showSummary(html) {
    $("#resultSummary").html(html).show();
  }

  // --- Сохранение состояния в localStorage, чтобы не терять введённое ---
  function saveState() {
    try {
      var rows = collectRows().map(function (r) {
        return { name: r.name, late: r.lateStr };
      });
      var state = {
        total: $("#totalOverpay").val(),
        exponent: $("#weightExponent").val(),
        rows: rows,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // localStorage может быть недоступен (приватный режим и т.п.) —
      // расчёт при этом всё равно работает, просто без сохранения.
    }
  }

  function loadState() {
    var raw;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      raw = null;
    }
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function init() {
    var state = loadState();
    if (state && Array.isArray(state.rows) && state.rows.length) {
      $("#totalOverpay").val(state.total || "");
      if (state.exponent) {
        $("#weightExponent").val(state.exponent);
      }
      state.rows.forEach(function (r) {
        addRow(r);
      });
    } else {
      addRow();
      addRow();
      addRow();
    }
  }

  $(document).on("click", "#btnAddRow", function () {
    addRow();
  });

  $(document).on("click", ".removeRow", function () {
    $(this).closest(".latecomerRow").remove();
    renumberRows();
    saveState();
  });

  $(document).on("click", "#btnClearRows", function () {
    if (!confirm("Удалить всех туристов и очистить сумму доплаты?")) {
      return;
    }
    $("#latecomersBody").empty();
    $("#totalOverpay").val("");
    $("#resultSummary").hide();
    $("#copyPanel").hide();
    addRow();
    addRow();
    addRow();
    saveState();
  });

  $(document).on("click", "#btnCalculate", calculate);

  $(document).on(
    "input change",
    "#totalOverpay, #weightExponent, .latecomerName, .latecomerLate",
    saveState,
  );

  $(document).on("click", "#btnCopyResult", function () {
    if (!lastResultText) {
      return;
    }
    navigator.clipboard
      .writeText(lastResultText)
      .then(function () {
        $("#copyStatus").text("Скопировано!");
      })
      .catch(function () {
        $("#copyStatus").text("Не удалось скопировать.");
      });
  });

  init();
});
