/* waitingBlocks.js
 * Калькулятор доплаты за опоздание к отправлению автобуса — блочная
 * модель: водитель берёт фиксированную ставку за каждый отрезок ожидания
 * (например 500 руб. за каждые 30 минут). Отрезки идут по очереди:
 * первый отрезок оплачивают все опоздавшие, второй — только те, кто
 * задержал автобус дольше длины одного отрезка, и т.д. Внутри отрезка
 * стоимость делится поровну между всеми, кто в нём ещё присутствовал.
 */
$(function () {
  var STORAGE_KEY = "waitingBlocksCalc_v1";
  var rowCounter = 0;

  var formatMinutes = LatenessUtils.formatMinutes;
  var formatMoney = LatenessUtils.formatMoney;
  var distributeAmount = LatenessUtils.distributeAmount;

  var lastResultText = "";

  // Шаг изменения опоздания — берём текущую длительность отрезка ожидания,
  // чтобы администратор округлял справедливо, по тем же отрезкам.
  function currentStep() {
    var v = Number(String($("#blockLength").val() || "").replace(",", "."));
    return v > 0 ? v : 30;
  }

  function renderLateValue(tr) {
    var minutes = Number(tr.find(".latecomerLate").data("minutes")) || 0;
    tr.find(".lateValue").text(
      minutes > 0 ? formatMinutes(minutes) : "не опоздал",
    );
    tr.find(".lateMinus").prop("disabled", minutes <= 0);
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
        '<td>' +
        '<span class="latecomerLate lateStepper">' +
        '<button type="button" class="lateMinus" title="Уменьшить опоздание">−</button>' +
        '<span class="lateValue">не опоздал</span>' +
        '<button type="button" class="latePlus" title="Увеличить опоздание">+</button>' +
        "</span>" +
        "</td>" +
        '<td class="blocksCell">—</td>' +
        '<td class="payCell">—</td>' +
        '<td><button type="button" class="removeRow" title="Удалить">✕</button></td>' +
        "</tr>",
    );
    tr.find(".latecomerName").val(data.name || "");
    tr.find(".latecomerLate").data("minutes", Number(data.minutes) || 0);
    renderLateValue(tr);
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
      var minutes = Number(tr.find(".latecomerLate").data("minutes")) || 0;
      rows.push({
        tr: tr,
        name: tr.find(".latecomerName").val(),
        minutes: minutes,
      });
    });
    return rows;
  }

  // --- Расчёт ---
  function calculate() {
    var rows = collectRows();
    var rate = Number(String($("#blockRate").val() || "").replace(",", "."));
    var blockLen = Number(
      String($("#blockLength").val() || "").replace(",", "."),
    );

    rows.forEach(function (r) {
      r.tr.find(".blocksCell").text("—");
      r.tr.find(".payCell").text("—");
    });
    $("#copyPanel").hide();
    $("#breakdownPanel").hide();
    $("#breakdownBody").empty();

    if (rows.length === 0) {
      showSummary('<span class="warn">Добавьте хотя бы одного туриста.</span>');
      return;
    }
    if (!$("#blockRate").val() || isNaN(rate) || rate <= 0) {
      showSummary(
        '<span class="warn">Укажите ставку за отрезок ожидания (число рублей больше нуля).</span>',
      );
      return;
    }
    if (!$("#blockLength").val() || isNaN(blockLen) || blockLen <= 0) {
      showSummary(
        '<span class="warn">Укажите длительность отрезка в минутах (больше нуля).</span>',
      );
      return;
    }

    // Сколько полных/неполных отрезков "занял" своим опозданием каждый
    // турист — неполный отрезок всё равно считается целиком, так как
    // водитель ждал реально до этой минуты.
    rows.forEach(function (r) {
      r.blocksNeeded = r.minutes > 0 ? Math.ceil(r.minutes / blockLen) : 0;
    });

    var maxBlocks = rows.reduce(function (m, r) {
      return Math.max(m, r.blocksNeeded);
    }, 0);

    if (maxBlocks === 0) {
      showSummary(
        '<span class="warn">Никто не опоздал (или опоздание не указано) — доплаты нет.</span>',
      );
      return;
    }

    var pays = rows.map(function () {
      return 0;
    });
    var breakdownRows = [];
    var totalCost = 0;

    for (var k = 1; k <= maxBlocks; k++) {
      var participantIdx = [];
      rows.forEach(function (r, i) {
        if (r.blocksNeeded >= k) {
          participantIdx.push(i);
        }
      });
      if (participantIdx.length === 0) {
        continue;
      }
      var weights = participantIdx.map(function () {
        return 1;
      });
      var shares = distributeAmount(rate, weights);
      participantIdx.forEach(function (rowIdx, j) {
        pays[rowIdx] += shares[j];
      });
      totalCost += rate;

      var rangeStart = (k - 1) * blockLen + 1;
      var rangeEnd = k * blockLen;
      var names = participantIdx.map(function (i) {
        var r = rows[i];
        return r.name && r.name.trim() ? r.name.trim() : "Место " + (i + 1);
      });
      breakdownRows.push({
        label: "Отрезок " + k + " (" + rangeStart + "–" + rangeEnd + " мин.)",
        names: names.join(", "),
        cost: rate,
        each: shares[0],
        count: participantIdx.length,
      });
    }

    var totalMinutes = 0;
    var totalPaid = 0;
    var resultLines = [];

    rows.forEach(function (r, i) {
      r.tr.find(".blocksCell").text(r.blocksNeeded || "0");
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
            " (" +
            r.blocksNeeded +
            " отрезк." +
            ") — доплата " +
            formatMoney(pays[i]),
        );
      }
    });

    lastResultText = resultLines.join("\n");

    showSummary(
      "Понадобилось отрезков ожидания: " +
        maxBlocks +
        ".<br>Общая стоимость ожидания: " +
        formatMoney(totalCost) +
        ".<br>Распределено между опоздавшими: " +
        formatMoney(totalPaid) +
        ".",
    );

    breakdownRows.forEach(function (b) {
      var tr = $("<tr><td></td><td></td><td></td><td></td></tr>");
      tr.find("td:eq(0)").text(b.label);
      tr.find("td:eq(1)").text(b.names);
      tr.find("td:eq(2)").text(formatMoney(b.cost));
      tr.find("td:eq(3)").text(formatMoney(b.each) + " (÷" + b.count + ")");
      $("#breakdownBody").append(tr);
    });
    $("#breakdownPanel").show();

    $("#copyPanel").show();
    $("#copyStatus").text("");
  }

  function showSummary(html) {
    $("#resultSummary").html(html).show();
  }

  // --- Сохранение состояния в localStorage ---
  function saveState() {
    try {
      var rows = collectRows().map(function (r) {
        return { name: r.name, minutes: r.minutes };
      });
      var state = {
        rate: $("#blockRate").val(),
        blockLength: $("#blockLength").val(),
        rows: rows,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // localStorage может быть недоступен — расчёт всё равно работает.
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
      $("#blockRate").val(state.rate || "500");
      $("#blockLength").val(state.blockLength || "30");
      state.rows.forEach(function (r) {
        // Совместимость со старым форматом (текстовое поле "late").
        var minutes =
          typeof r.minutes === "number"
            ? r.minutes
            : LatenessUtils.parseLateness(r.late || "");
        addRow({ name: r.name, minutes: minutes });
      });
    } else {
      $("#blockRate").val("500");
      $("#blockLength").val("30");
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

  $(document).on("click", ".latePlus", function () {
    var tr = $(this).closest(".latecomerRow");
    var late = tr.find(".latecomerLate");
    var minutes = (Number(late.data("minutes")) || 0) + currentStep();
    late.data("minutes", minutes);
    renderLateValue(tr);
    saveState();
  });

  $(document).on("click", ".lateMinus", function () {
    var tr = $(this).closest(".latecomerRow");
    var late = tr.find(".latecomerLate");
    var minutes = Math.max(
      0,
      (Number(late.data("minutes")) || 0) - currentStep(),
    );
    late.data("minutes", minutes);
    renderLateValue(tr);
    saveState();
  });

  $(document).on("click", "#btnClearRows", function () {
    if (!confirm("Удалить всех туристов и сбросить настройки отрезков?")) {
      return;
    }
    $("#latecomersBody").empty();
    $("#blockRate").val("500");
    $("#blockLength").val("30");
    $("#resultSummary").hide();
    $("#breakdownPanel").hide();
    $("#copyPanel").hide();
    addRow();
    addRow();
    addRow();
    saveState();
  });

  $(document).on("click", "#btnCalculate", calculate);

  $(document).on(
    "input change",
    "#blockRate, #blockLength, .latecomerName",
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
