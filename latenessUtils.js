/* latenessUtils.js
 * Общие утилиты для страниц-калькуляторов доплаты за опоздание к автобусу
 * (latecomers.html — пропорциональная модель, waitingBlocks.html —
 * блочная модель по 30-минутным отрезкам ожидания).
 */
var LatenessUtils = (function () {
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

  return {
    parseLateness: parseLateness,
    formatMinutes: formatMinutes,
    formatMoney: formatMoney,
    distributeAmount: distributeAmount,
  };
})();
