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

  // --- Распределение суммы по весам, округляя каждую долю до десятков
  //     рублей ---
  // Раздаём деньги "укрупнёнными" единицами (по умолчанию 10 руб.) методом
  // наибольшего остатка, как в distributeAmount, но в единицах округления,
  // а не в копейках. Если после этого остаётся мелкий "хвост" (когда сама
  // сумма не делится на единицу округления без остатка), он целиком
  // достаётся участнику с наивысшим приоритетом (обычно — самому опоздавшему),
  // чтобы у остальных суммы оставались круглыми. При равенстве дробных
  // остатков лишняя единица округления также достаётся участнику с более
  // высоким приоритетом — так округление "в пользу" идёт тем, кто опоздал
  // меньше (у них остаётся более выгодное — округлённое вниз — значение).
  function distributeAmountRounded(totalRub, weights, priorities, roundTo) {
    var unit = roundTo > 0 ? roundTo : 10;
    var unitCents = Math.round(unit * 100);
    var totalCents = Math.round(totalRub * 100);
    var sumWeights = weights.reduce(function (a, b) {
      return a + b;
    }, 0);
    var n = weights.length;

    if (sumWeights <= 0 || totalCents <= 0) {
      return weights.map(function () {
        return 0;
      });
    }

    priorities =
      priorities && priorities.length === n
        ? priorities
        : weights.map(function () {
            return 0;
          });

    var rawUnits = weights.map(function (w) {
      return (totalCents * w) / sumWeights / unitCents;
    });
    var flooredUnits = rawUnits.map(Math.floor);
    var baseCents = flooredUnits.reduce(function (a, b) {
      return a + b;
    }, 0);
    var remainderCents = totalCents - baseCents * unitCents;
    var extraUnits = Math.floor(remainderCents / unitCents);
    var leftoverCents = remainderCents - extraUnits * unitCents;

    var order = rawUnits
      .map(function (v, i) {
        return { i: i, frac: v - flooredUnits[i], priority: priorities[i] };
      })
      .sort(function (a, b) {
        if (b.frac !== a.frac) {
          return b.frac - a.frac;
        }
        // При равных дробных остатках лишнюю "десятку" отдаём более
        // опоздавшему (выше приоритет), чтобы у менее опоздавших
        // сохранился более выгодный округлённый вниз результат.
        return b.priority - a.priority;
      });

    var unitsResult = flooredUnits.slice();
    for (var k = 0; k < extraUnits && k < order.length; k++) {
      unitsResult[order[k].i]++;
    }

    var cents = unitsResult.map(function (u) {
      return u * unitCents;
    });

    // Неделимый "хвост" (меньше единицы округления) целиком достаётся
    // участнику с наивысшим приоритетом — обычно самому опоздавшему.
    if (leftoverCents > 0) {
      var maxIdx = 0;
      for (var i = 1; i < n; i++) {
        if (priorities[i] > priorities[maxIdx]) {
          maxIdx = i;
        }
      }
      cents[maxIdx] += leftoverCents;
    }

    return cents.map(function (c) {
      return c / 100;
    });
  }

  return {
    parseLateness: parseLateness,
    formatMinutes: formatMinutes,
    formatMoney: formatMoney,
    distributeAmount: distributeAmount,
    distributeAmountRounded: distributeAmountRounded,
  };
})();
