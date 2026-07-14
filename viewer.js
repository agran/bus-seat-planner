var $svg;
var allMestaTxt = "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20";
var isClassicProfile = true;
var currentProfileId; // id профиля автобуса, отображаемого сейчас
var update; // определяется внутри document.ready
var undoStack = []; // снимки seats поездки перед последними изменениями
var UNDO_STACK_LIMIT = 30;

$(document).ready(function () {
  console.log("ready!");

  function populateProfileSelect() {
    var $sel = $("#profileSelect");
    if ($sel.length === 0) {
      return;
    }
    $sel.empty();
    $sel.append(
      $("<option>")
        .val(SeatProfiles.CLASSIC_PROFILE_ID)
        .text("Классический Mercedes Sprinter (20 мест)"),
    );
    SeatProfiles.getProfiles().forEach(function (p) {
      $sel.append($("<option>").val(p.id).text(p.name));
    });
    $sel.val(SeatProfiles.getSelectedProfileId());
  }

  function subscribeCloudProfiles() {
    window.CloudSync.onProfilesChange(function (profiles) {
      SeatProfiles.replaceProfiles(profiles);
      var selectedId = SeatProfiles.getSelectedProfileId();
      populateProfileSelect();
      // Перерисовываем текущий профиль, если он обновился в облаке
      // (например, кто-то поменял схему в admin.html на другом устройстве).
      if (!isClassicProfile && selectedId !== SeatProfiles.CLASSIC_PROFILE_ID) {
        loadAndRenderProfile(selectedId);
      }
    });
  }

  function initCloudSync() {
    if (!window.CloudSync) {
      return;
    }
    if (window.CloudSync.isAvailable()) {
      subscribeCloudProfiles();
    } else {
      window.addEventListener("cloudsync-ready", subscribeCloudProfiles);
    }
  }

  function buildLineMesto(n, isFree, isGuide) {
    var $line = $("<div class='line-mesto'>")
      .attr("data-mesto", n)
      .attr("data-default-free", isFree ? "true" : "false")
      .attr("data-guide", isGuide ? "true" : "false");

    $line.append($("<span class='mesto-n'>").text(n + "."));
    $line.append(" ");

    var statusClass = isFree ? "mesto-status-svob" : "mesto-status-zan";
    var statusText = isFree ? "Свободно" : "Занято";
    $line.append(
      $("<span class='mesto-status'>").addClass(statusClass).text(statusText),
    );
    $line.append(" ");

    var $btn = isFree
      ? $("<button class='bZan'>").text("Занять")
      : $("<button class='bOsv'>").text("Освободить");
    $line.append($btn);
    $line.append(" ");

    // ФИО пассажира активно только для занятых мест, чтобы не заполнять
    // данные там, где ещё никто не сидит. Место гида по умолчанию занято
    // гидом, поэтому сразу подставляем "Гид" вместо пустого поля.
    var $fio = $("<input type='text' class='mestoFio'>")
      .attr("placeholder", "ФИО пассажира")
      .prop("disabled", isFree);
    if (!isFree && isGuide) {
      $fio.val("Гид");
    }
    $line.append($fio);

    // Комментарий доступен и для свободных мест — например, чтобы
    // отметить, что место нужно придержать для кого-то конкретного.
    var $comment = $("<input type='text' class='mestoComment'>").attr(
      "placeholder",
      "Комментарий",
    );
    $line.append($comment);

    return $line;
  }

  function buildClassicMestaTable() {
    var $rows = [];
    for (let i = 1; i <= 19; i++) {
      $rows.push(buildLineMesto(i, true, false));
    }
    $rows.push(buildLineMesto(20, false, false));
    $("#mestaTable").empty().append($rows);
  }

  function buildGenericMestaTable(seatNumbers, guideCell) {
    var guideNumber =
      guideCell && guideCell.number != null ? guideCell.number : null;

    // Место гида вставляем в общий порядок по номеру, чтобы список читался
    // как непрерывная нумерация мест, а не отдельным блоком в конце.
    var rows = seatNumbers.map(function (n) {
      return { n: n, isGuide: false };
    });
    if (guideNumber != null) {
      rows.push({ n: guideNumber, isGuide: true });
      rows.sort(function (a, b) {
        return a.n - b.n;
      });
    }

    var $rows = rows.map(function (row) {
      return buildLineMesto(row.n, !row.isGuide, row.isGuide);
    });
    $("#mestaTable").empty().append($rows);
  }

  // Приводит строку места к её состоянию по умолчанию для текущего профиля
  // автобуса (без учёта поездки) — нужно при переключении поездок, чтобы
  // места, не тронутые в новой поездке, не наследовали статус/ФИО из
  // предыдущей. Комментарий тоже сбрасывается — накладывается отдельно из
  // applyTripToTable(), т.к. он может быть задан и для свободного места.
  function resetLineMestoToDefault(lineMesto) {
    var isFree = lineMesto.attr("data-default-free") !== "false";
    var isGuide = lineMesto.attr("data-guide") === "true";
    setLineMestoState(
      lineMesto,
      isFree,
      isFree ? "" : isGuide ? "Гид" : "",
      "",
    );
  }

  // Единая точка изменения визуального состояния строки места: статус,
  // кнопка и поля ФИО/комментария (активность + значение) всегда меняются
  // вместе. Комментарий, в отличие от ФИО, остаётся доступным и для
  // свободного места — например, чтобы придержать его для кого-то.
  function setLineMestoState(lineMesto, isFree, name, comment) {
    var fioInput = lineMesto.find(".mestoFio");
    var commentInput = lineMesto.find(".mestoComment");
    if (isFree) {
      lineMesto
        .find(".mesto-status")
        .removeClass("mesto-status-zan")
        .addClass("mesto-status-svob")
        .html("Свободно");
      lineMesto
        .find("button")
        .removeClass("bOsv")
        .addClass("bZan")
        .html("Занять");
      fioInput.val("").prop("disabled", true);
      if (comment !== undefined && comment !== null) {
        commentInput.val(comment);
      }
    } else {
      lineMesto
        .find(".mesto-status")
        .removeClass("mesto-status-svob")
        .addClass("mesto-status-zan")
        .html("Занято");
      lineMesto
        .find("button")
        .removeClass("bZan")
        .addClass("bOsv")
        .html("Освободить");
      fioInput.prop("disabled", false);
      if (name !== undefined && name !== null) {
        fioInput.val(name);
      }
      if (comment !== undefined && comment !== null) {
        commentInput.val(comment);
      }
    }
  }

  // Накладывает на построенную таблицу мест данные текущей поездки:
  // сначала сбрасывает всё к дефолту схемы автобуса, затем применяет то,
  // что явно сохранено для этой поездки (занятость + ФИО + комментарий).
  function applyTripToTable() {
    var tripId = TripStorage.getSelectedTripId();
    $(".line-mesto[data-mesto]").each(function () {
      var lineMesto = $(this);
      resetLineMestoToDefault(lineMesto);
      var mestoN = lineMesto.attr("data-mesto");
      var data = TripStorage.getSeatData(tripId, mestoN);
      if (data) {
        setLineMestoState(lineMesto, !data.occupied, data.name, data.comment);
      }
    });
  }

  function populateTripSelect() {
    var $sel = $("#tripSelect");
    if ($sel.length === 0) {
      return;
    }
    $sel.empty();
    TripStorage.getTrips().forEach(function (t) {
      $sel.append($("<option>").val(t.id).text(t.name));
    });
    $sel.val(TripStorage.getSelectedTripId());
  }

  function setSeatVisual(mestoN, isFree) {
    if (isClassicProfile) {
      if (isFree) {
        $svg.find("#_Сидушка-" + mestoN).attr("xlink:href", "#_СидушкаЗел");
        $svg.find("#_Спинка-" + mestoN).attr("xlink:href", "#_СпинкаЗел");
        $svg.find(".Место-" + mestoN).css("fill", "#f4f7e0");
      } else {
        $svg.find("#_Сидушка-" + mestoN).attr("xlink:href", "#_СидушкаКрас");
        $svg.find("#_Спинка-" + mestoN).attr("xlink:href", "#_СпинкаКрас");
        $svg.find(".Место-" + mestoN).css("fill", "#7A7C6C");
      }
    } else {
      SeatProfiles.setGenericSeatStatus($svg, mestoN, isFree);
    }
  }

  update = function () {
    var mestaTxt = "";
    var mestaZanTxt = "";
    var tripId = TripStorage.getSelectedTripId();
    $(".line-mesto[data-mesto]").each(function () {
      var mestoN = $(this).attr("data-mesto");
      var isFree = $(this).find(".mesto-status").hasClass("mesto-status-svob");
      var fioName = $(this).find(".mestoFio").val() || "";
      var comment = $(this).find(".mestoComment").val() || "";
      if (isFree) {
        mestaTxt += mestoN + ",";
      } else {
        mestaZanTxt += mestoN + ",";
      }
      setSeatVisual(mestoN, isFree);
      TripStorage.setSeatData(tripId, mestoN, !isFree, fioName, comment);
    });

    if (mestaTxt.length > 0 && mestaTxt[mestaTxt.length - 1] === ",") {
      mestaTxt = mestaTxt.slice(0, -1);
    }
    if (mestaZanTxt.length > 0 && mestaZanTxt[mestaZanTxt.length - 1] === ",") {
      mestaZanTxt = mestaZanTxt.slice(0, -1);
    }

    $("#mestaSvobodnInput").val(mestaTxt);
    $("#mestaZanyatyInput").val(mestaZanTxt);

    //const XML = new XMLSerializer().serializeToString($svg[0]);
    //const SVG64 = utf8_to_b64(XML);

    //$('img').attr('src', 'data:image/svg+xml;base64,' + SVG64);

    SVGToImage({
      svg: $svg[0],
      mimetype: "image/png",
      width: 1550,
      quality: 1,
    })
      .then(function (base64image) {
        $("img").attr("src", base64image);
      })
      .catch(function (err) {
        console.log(err);
      });
  };

  function loadAndRenderProfile(profileId) {
    isClassicProfile = profileId === SeatProfiles.CLASSIC_PROFILE_ID;
    currentProfileId = profileId;
    // Запоминаем профиль автобуса за текущей поездкой — у разных поездок
    // может быть разный автобус.
    TripStorage.setTripProfileId(TripStorage.getSelectedTripId(), profileId);

    $("#imgParent").find("svg").remove();

    if (isClassicProfile) {
      var svgtxt = getFile("avtobusJZ3.svg");
      var doc = new DOMParser().parseFromString(svgtxt, "image/svg+xml");
      $svg = $("svg", doc);

      $svg.find("#_Сидушка-" + 20).attr("xlink:href", "#_СидушкаКрас");
      $svg.find("#_Спинка-" + 20).attr("xlink:href", "#_СпинкаКрас");
      $svg.find(".Место-" + 20).css("fill", "#7A7C6C");

      allMestaTxt = "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19";
      buildClassicMestaTable();
    } else {
      var profile = SeatProfiles.getProfile(profileId);
      if (!profile) {
        console.warn(
          "Профиль не найден, переключаюсь на классический.",
          profileId,
        );
        loadAndRenderProfile(SeatProfiles.CLASSIC_PROFILE_ID);
        return;
      }
      var seatNumbers = SeatProfiles.getSeatNumbers(profile);
      var guideCell = SeatProfiles.getGuideCell(profile);

      $svg = $(SeatProfiles.generateGenericSVG(profile, {}));

      allMestaTxt = seatNumbers.join(",");
      buildGenericMestaTable(seatNumbers, guideCell);
    }

    $("#imgParent").prepend($svg);

    if ($("#profileSelect").length) {
      $("#profileSelect").val(profileId);
    }

    // Накладываем занятость/ФИО из текущей поездки поверх дефолтов схемы.
    applyTripToTable();

    $("#mestaSvobodnInput").val(allMestaTxt);
    update();
    updateUndoButtonState();
  }

  $(document).on("change", "#profileSelect", function () {
    var newId = $(this).val();
    SeatProfiles.setSelectedProfileId(newId);
    loadAndRenderProfile(newId);
  });

  $(document).on(
    "dblclick",
    ".generic-seat:not(.generic-driver) .seat-back, .generic-seat:not(.generic-driver) .seat-cushion",
    function () {
      var mestoN = $(this).closest(".generic-seat").attr("data-seat");
      var lineMesto = $('.line-mesto[data-mesto="' + mestoN + '"]');
      lineMesto.find("button").click();
    },
  );

  // --- Отмена последнего действия (undo) ---
  // Храним снимки карты мест (seats) текущей поездки перед изменениями —
  // только в памяти (на время сессии страницы), без сохранения в
  // localStorage: это защита от "случайно нажал не то", а не полноценная
  // история версий.
  function pushUndoSnapshot() {
    var tripId = TripStorage.getSelectedTripId();
    var trip = TripStorage.getTrip(tripId);
    if (!trip) {
      return;
    }
    undoStack.push({
      tripId: tripId,
      seats: JSON.parse(JSON.stringify(trip.seats || {})),
    });
    if (undoStack.length > UNDO_STACK_LIMIT) {
      undoStack.shift();
    }
    updateUndoButtonState();
  }

  function updateUndoButtonState() {
    var tripId = TripStorage.getSelectedTripId();
    var hasUndo = undoStack.some(function (s) {
      return s.tripId === tripId;
    });
    $("#btnUndo").prop("disabled", !hasUndo);
  }

  $(document).on("click", "#btnUndo", function () {
    var tripId = TripStorage.getSelectedTripId();
    for (var i = undoStack.length - 1; i >= 0; i--) {
      if (undoStack[i].tripId === tripId) {
        var snapshot = undoStack.splice(i, 1)[0];
        TripStorage.setTripSeats(tripId, snapshot.seats);
        applyTripToTable();
        update();
        break;
      }
    }
    updateUndoButtonState();
  });

  populateProfileSelect();
  populateTripSelect();
  initCloudSync();

  $(document).on("click", ".bZan", function () {
    pushUndoSnapshot();
    var lineMesto = $(this).closest(".line-mesto");
    setLineMestoState(lineMesto, false);
    update();
    lineMesto.find(".mestoFio").trigger("focus");
  });

  $(document).on("click", ".bOsv", function () {
    pushUndoSnapshot();
    var lineMesto = $(this).closest(".line-mesto");
    setLineMestoState(lineMesto, true);
    update();
  });

  // Перед началом редактирования ФИО/комментария (первый фокус в поле)
  // делаем один снимок для undo — так отмена откатывает всю правку целиком,
  // а не по одной букве.
  $(document).on("focusin", ".mestoFio, .mestoComment", function () {
    if (!$(this).data("undoSnapshotTaken")) {
      pushUndoSnapshot();
      $(this).data("undoSnapshotTaken", true);
    }
  });
  $(document).on("focusout", ".mestoFio, .mestoComment", function () {
    $(this).data("undoSnapshotTaken", false);
  });

  // Ввод ФИО/комментария сохраняем сразу же в данные текущей поездки, без
  // ожидания клика по кнопке "Обновить" — но без полного update(), чтобы
  // не перерисовывать SVG/PNG на каждое нажатие клавиши.
  $(document).on("input", ".mestoFio, .mestoComment", function () {
    var lineMesto = $(this).closest(".line-mesto");
    var mestoN = lineMesto.attr("data-mesto");
    var isFree = lineMesto
      .find(".mesto-status")
      .hasClass("mesto-status-svob");
    TripStorage.setSeatData(
      TripStorage.getSelectedTripId(),
      mestoN,
      !isFree,
      lineMesto.find(".mestoFio").val(),
      lineMesto.find(".mestoComment").val(),
    );
  });

  $(document).on("change", "#tripSelect", function () {
    var newTripId = $(this).val();
    TripStorage.setSelectedTripId(newTripId);
    var profileId =
      TripStorage.getTripProfileId(newTripId) ||
      SeatProfiles.CLASSIC_PROFILE_ID;
    loadAndRenderProfile(profileId);
  });

  $(document).on("click", "#btnNewTrip", function () {
    var name = prompt(
      "Название новой поездки:",
      "Поездка " + (TripStorage.getTrips().length + 1),
    );
    if (name === null) {
      return;
    }
    name = name.trim();
    if (!name) {
      return;
    }
    // Новая поездка по умолчанию наследует профиль автобуса, который
    // отображается прямо сейчас — его можно сразу поменять через
    // "Профиль автобуса", это не повлияет на другие поездки.
    TripStorage.createTrip(name, currentProfileId);
    populateTripSelect();
    loadAndRenderProfile(currentProfileId);
  });

  $(document).on("click", "#btnRenameTrip", function () {
    var tripId = TripStorage.getSelectedTripId();
    var trip = TripStorage.getTrip(tripId);
    var name = prompt("Новое название поездки:", trip ? trip.name : "");
    if (name === null) {
      return;
    }
    name = name.trim();
    if (!name) {
      return;
    }
    TripStorage.renameTrip(tripId, name);
    populateTripSelect();
  });

  $(document).on("click", "#btnDeleteTrip", function () {
    var tripId = TripStorage.getSelectedTripId();
    var trip = TripStorage.getTrip(tripId);
    var trips = TripStorage.getTrips();
    var tripName = trip ? trip.name : "";
    var confirmMsg =
      trips.length <= 1
        ? "Это последняя поездка — удалить её нельзя, но можно очистить все занятые места и ФИО в ней. Очистить?"
        : "Удалить поездку «" +
          tripName +
          "»? Все занятые места и ФИО в ней будут потеряны.";
    if (!confirm(confirmMsg)) {
      return;
    }
    TripStorage.deleteTrip(tripId);
    populateTripSelect();
    var newTripId = TripStorage.getSelectedTripId();
    var profileId =
      TripStorage.getTripProfileId(newTripId) ||
      SeatProfiles.CLASSIC_PROFILE_ID;
    loadAndRenderProfile(profileId);
  });

  // Собирает поездку в переносимый JSON-объект. Профиль автобуса кладём
  // внутрь целиком (а не только id), иначе поездка на нестандартном
  // автобусе не откроется корректно в другом браузере, где такого профиля
  // ещё нет. Для классического профиля профиль не нужен — он встроен в код.
  function buildTripExportData(tripId) {
    var trip = TripStorage.getTrip(tripId);
    if (!trip) {
      return null;
    }
    var profileId = trip.profileId || SeatProfiles.CLASSIC_PROFILE_ID;
    var isClassic = profileId === SeatProfiles.CLASSIC_PROFILE_ID;
    var profile = isClassic ? null : SeatProfiles.getProfile(profileId) || null;
    return {
      fileType: "bus-seat-planner-trip",
      version: 1,
      exportedAt: new Date().toISOString(),
      trip: {
        name: trip.name,
        profileId: profileId,
        seats: trip.seats,
      },
      profile: profile,
    };
  }

  function sanitizeFileNamePart(text) {
    return String(text || "поездка")
      .trim()
      .replace(/[\\/:*?"<>|]+/g, "_")
      .slice(0, 60);
  }

  $(document).on("click", "#btnExportTrip", function () {
    var tripId = TripStorage.getSelectedTripId();
    var data = buildTripExportData(tripId);
    if (!data) {
      alert("Не удалось найти текущую поездку.");
      return;
    }
    var blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "Поездка - " + sanitizeFileNamePart(data.trip.name) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  });

  $(document).on("click", "#btnImportTrip", function () {
    $("#tripImportInput").val("").trigger("click");
  });

  $(document).on("change", "#tripImportInput", function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) {
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try {
        data = JSON.parse(reader.result);
      } catch (err) {
        alert("Не удалось прочитать файл: это не корректный JSON.");
        return;
      }
      importTripFromData(data);
    };
    reader.onerror = function () {
      alert("Не удалось прочитать файл.");
    };
    reader.readAsText(file);
  });

  // Импортирует поездку из объекта, полученного из экспортированного
  // JSON-файла: при необходимости заводит локальную копию профиля автобуса
  // (с новым id, чтобы не конфликтовать с уже существующими профилями),
  // затем создаёт новую поездку с перенесёнными местами/ФИО и переключается
  // на неё.
  function importTripFromData(data) {
    if (!data || typeof data !== "object" || !data.trip) {
      alert("Файл не похож на экспорт поездки этого приложения.");
      return;
    }
    var tripData = data.trip;
    var profileId = tripData.profileId || SeatProfiles.CLASSIC_PROFILE_ID;

    if (data.profile && profileId !== SeatProfiles.CLASSIC_PROFILE_ID) {
      // Всегда сохраняем как новый профиль (сбрасываем id), чтобы случайно
      // не перезаписать чужой существующий профиль с таким же id.
      var importedProfile = JSON.parse(JSON.stringify(data.profile));
      importedProfile.id = null;
      var saved = SeatProfiles.saveProfile(importedProfile);
      profileId = saved.id;
    } else if (
      profileId !== SeatProfiles.CLASSIC_PROFILE_ID &&
      !SeatProfiles.getProfile(profileId)
    ) {
      // В файле нет профиля, а локально такого id тоже нет — откатываемся
      // на классический, чтобы хотя бы места не потерялись.
      console.warn(
        "Профиль автобуса из файла не найден и не приложен, использую классический.",
        profileId,
      );
      profileId = SeatProfiles.CLASSIC_PROFILE_ID;
    }

    var newTrip = TripStorage.createTrip(
      (tripData.name || "Импортированная поездка") + " (импорт)",
      profileId,
    );
    var seats = tripData.seats || {};
    Object.keys(seats).forEach(function (seatNumber) {
      var seat = seats[seatNumber] || {};
      TripStorage.setSeatData(
        newTrip.id,
        seatNumber,
        !!seat.occupied,
        seat.name || "",
        seat.comment || "",
      );
    });

    populateProfileSelect();
    populateTripSelect();
    loadAndRenderProfile(profileId);
    alert('Поездка «' + newTrip.name + '» импортирована и выбрана.');
  }

  $(document).on("dblclick", "path[id]", function () {
    console.dir($(this).attr("id"));
    var mestoN = Number($(this).attr("id").match(/\d+/)[0]);
    console.dir(mestoN);
    var lineMesto = $('.line-mesto[data-mesto="' + mestoN + '"]');
    lineMesto.find("button").click();
  });

  // Собирает места для подписи под картинкой при экспорте: занятые места
  // (если включён includeFio — с ФИО, и/или если включён includeComment —
  // с комментарием, даже когда ФИО отдельно выключено) и свободные места с
  // непустым комментарием (если включён includeComment), без ФИО, например
  // "место придержано".
  function collectSeatsForExport(includeFio, includeComment) {
    var list = [];
    $(".line-mesto[data-mesto]").each(function () {
      var lineMesto = $(this);
      var isFree = lineMesto
        .find(".mesto-status")
        .hasClass("mesto-status-svob");
      var mestoN = lineMesto.attr("data-mesto");
      var comment = (lineMesto.find(".mestoComment").val() || "").trim();
      var hasComment = includeComment && comment;
      if (!isFree) {
        if (!includeFio && !hasComment) {
          return;
        }
        var name = includeFio
          ? (lineMesto.find(".mestoFio").val() || "").trim()
          : null;
        list.push({
          n: mestoN,
          name: includeFio ? name : null,
          comment: hasComment ? comment : null,
        });
      } else if (hasComment) {
        list.push({ n: mestoN, name: null, comment: comment, freeSeat: true });
      }
    });
    list.sort(function (a, b) {
      return Number(a.n) - Number(b.n);
    });
    return list;
  }

  // Строит итоговый canvas для копирования/скачивания: сама картинка схемы
  // автобуса, и (если отмечен один из чекбоксов) список мест под ней —
  // это позволяет отправить одну картинку, где видно, кто на каком месте
  // и/или какие места придержаны с пометкой. Комментарий рисуется другим
  // цветом (курсивом), чтобы визуально отличаться от ФИО/номера места.
  function buildExportCanvas() {
    var img = $("img")[0];
    var baseWidth = img.naturalWidth || 1550;
    var baseHeight = img.naturalHeight || 642;
    var includeFio = $("#includeFioOnImage").is(":checked");
    var includeComment = $("#includeCommentOnImage").is(":checked");
    var seats = collectSeatsForExport(includeFio, includeComment);

    var canvas = document.createElement("canvas");
    if (seats.length === 0) {
      canvas.width = baseWidth;
      canvas.height = baseHeight;
      canvas
        .getContext("2d")
        .drawImage(img, 0, 0, canvas.width, canvas.height);
      return Promise.resolve(canvas);
    }

    // Раскладываем список в несколько колонок, чтобы длинная поездка с
    // многими пассажирами не растягивала картинку в узкую высокую полосу.
    var fontSize = Math.max(32, Math.round(baseWidth / 38));
    var lineHeight = Math.round(fontSize * 1.5);
    var padding = Math.round(fontSize);
    var maxColumnWidth = Math.round(baseWidth / 2.2);
    var columns = baseWidth > 700 && seats.length > 12 ? 2 : 1;
    var rowsPerColumn = Math.ceil(seats.length / columns);
    var listHeight = padding * 2 + rowsPerColumn * lineHeight;

    canvas.width = baseWidth;
    canvas.height = baseHeight + listHeight;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, baseWidth, baseHeight);

    var boldFont = "bold " + fontSize + "px Arial, sans-serif";
    var commentFont = "italic " + fontSize + "px Arial, sans-serif";
    var mainColor = "#222222";
    var commentColor = "#1d6fa5";
    ctx.textBaseline = "top";
    seats.forEach(function (seat, i) {
      var col = Math.floor(i / rowsPerColumn);
      var row = i % rowsPerColumn;
      var x = padding + col * maxColumnWidth;
      var y = baseHeight + padding + row * lineHeight;
      var maxWidth = maxColumnWidth - padding;

      var leading = "Место " + seat.n + ": ";
      if (seat.name !== null) {
        leading += seat.name || "(ФИО не указано)";
      }

      ctx.font = boldFont;
      ctx.fillStyle = mainColor;
      ctx.fillText(leading, x, y, maxWidth);

      if (seat.comment !== null) {
        var leadingWidth = ctx.measureText(leading).width;
        var commentText =
          (seat.name !== null ? " — " : "") + seat.comment;
        ctx.font = commentFont;
        ctx.fillStyle = commentColor;
        ctx.fillText(
          commentText,
          x + leadingWidth,
          y,
          Math.max(0, maxWidth - leadingWidth),
        );
      }
    });

    return Promise.resolve(canvas);
  }

  // Копирует картинку в буфер обмена. Если документ в этот момент не в
  // фокусе (например, из-за долгой отрисовки картинки, DevTools, или
  // предыдущего клика, который перевёл фокус в другое окно), браузер
  // отклоняет navigator.clipboard.write с "Document is not focused" —
  // в этом случае просим пользователя кликнуть на страницу и попробовать
  // ещё раз, а не даём необработанное исключение улетать в консоль.
  // Возвращает promise, который резолвится в true при успехе и в false
  // при неудаче (после показа сообщения пользователю).
  //
  // startedAt (опционально) — performance.now() в момент клика по кнопке:
  // используется только для замера/лога общего времени операции в консоли
  // (открой DevTools → Console перед кликом, чтобы увидеть разбивку по
  // этапам: отрисовка канваса, toBlob, запись в буфер).
  function copyCanvasToClipboard(canvas, startedAt) {
    var canvasReadyAt = performance.now();
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        var blobReadyAt = performance.now();
        window.focus();
        navigator.clipboard
          .write([new ClipboardItem({ "image/png": blob })])
          .then(
            function () {
              resolve({ blobReadyAt: blobReadyAt });
            },
            reject,
          );
      }, "image/png");
    }).then(
      function (timing) {
        if (startedAt != null) {
          var writeDoneAt = performance.now();
          console.log(
            "[Копировать картинку] отрисовка канваса: " +
              (canvasReadyAt - startedAt).toFixed(0) +
              " мс; canvas→blob: " +
              (timing.blobReadyAt - canvasReadyAt).toFixed(0) +
              " мс; запись в буфер: " +
              (writeDoneAt - timing.blobReadyAt).toFixed(0) +
              " мс; всего: " +
              (writeDoneAt - startedAt).toFixed(0) +
              " мс",
          );
        }
        return true;
      },
      function (err) {
        console.error("Не удалось скопировать картинку в буфер обмена:", err);
        alert(
          "Не удалось скопировать картинку в буфер обмена (страница потеряла фокус). Кликните на страницу и попробуйте ещё раз, либо используйте кнопку «Скачать картинку».",
        );
        return false;
      },
    );
  }

  $(document).on("click", ".copy", function (e) {
    var startedAt = performance.now();
    buildExportCanvas().then(function (canvas) {
      copyCanvasToClipboard(canvas, startedAt);
    });
  });
  $(document).on("click", ".copyClose", function (e) {
    var startedAt = performance.now();
    buildExportCanvas().then(function (canvas) {
      copyCanvasToClipboard(canvas, startedAt).then(function (success) {
        if (!success) {
          return;
        }
        setTimeout(function () {
          open(location, "_self").close();
        }, 50);
      });
    });
  });

  $(document).on("click", ".save", function (e) {
    buildExportCanvas().then(function (canvas) {
      var a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = "Свободные места.png";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });
  });

  $(document).on("change", "#mestaZanyatyInput", function () {
    var arrMestaZan = $(this)
      .val()
      .replace(/[^\d,\s]/g, "")
      .split(/[\s,]+/);
    var arrMestaSvob = allMestaTxt.split(",");

    arrMestaZan.forEach(function (mestoN) {
      mestoN = mestoN.trim();

      var index = arrMestaSvob.indexOf(mestoN);
      if (index !== -1) {
        arrMestaSvob.splice(index, 1);
      }
    });

    $("#mestaSvobodnInput").val(arrMestaSvob.join(","));

    $("#mestaSvobodnInput").trigger("change");
  });

  $(document).on("change", "#mestaSvobodnInput", function () {
    pushUndoSnapshot();
    $(".line-mesto[data-mesto]").each(function () {
      setLineMestoState($(this), false);
    });

    var arrMesta = $(this)
      .val()
      .replace(/[^\d,\s]/g, "")
      .split(/[\s,]+/);
    var arrMestaZan = allMestaTxt.split(",");

    arrMesta.forEach(function (mestoN) {
      mestoN = mestoN.trim();

      var index = arrMestaZan.indexOf(mestoN);
      if (index !== -1) {
        arrMestaZan.splice(index, 1);
      }

      var lineMesto = $('.line-mesto[data-mesto="' + mestoN + '"]');
      setLineMestoState(lineMesto, true);
    });

    $("#mestaZanyatyInput").val(arrMestaZan.join(","));

    update();
  });

  $(document).on("click", ".copyMesta", function () {
    $(this).parent().find("input").select();
    document.execCommand("copy");
  });

  $(document).on("click", ".pastMesta", function () {
    var inputMesta = $(this).parent().find("input");
    //$(this).parent().find('input').select();
    navigator.clipboard.readText().then((text) => {
      inputMesta.val(text);

      $("input.pasted").removeClass("pasted");
      if (RegExp(/[^\d,\s]/g).test(text)) {
        inputMesta.addClass("pasted");
        $(".mestButton").css("color", "red");
      } else {
        inputMesta.trigger("change");
      }
    });
  });

  $(document).on("click", ".mestButton", function () {
    $(".mestButton").css("color", "");
    $("input.pasted").removeClass("pasted").trigger("change");
  });

  $(document).on("click", ".clearButton", function () {
    $("#mestaSvobodnInput").val(allMestaTxt);
    $("#mestaZanyatyInput").val(isClassicProfile ? "20" : "");
    $("#mestaSvobodnInput").trigger("change");
  });

  // Профиль автобуса привязан к поездке: если для текущей поездки уже
  // сохранён свой профиль — используем его, иначе (первый запуск/старые
  // поездки, созданные до этой привязки) — глобально выбранный профиль.
  var initialProfileId =
    TripStorage.getTripProfileId(TripStorage.getSelectedTripId()) ||
    SeatProfiles.getSelectedProfileId();
  loadAndRenderProfile(initialProfileId);
});

function utf8_to_b64(str) {
  return window.btoa(unescape(encodeURIComponent(str)));
}

function isset() {
  // +   original by: Kevin van Zonneveld
  // +   improved by: FremyCompany
  // +   improved by: Onno Marsman
  // *     example 1: isset( undefined, true);
  // *     returns 1: false
  // *     example 2: isset( 'Kevin van Zonneveld' );
  // *     returns 2: true

  var a = arguments,
    l = a.length,
    i = 0;

  if (l === 0) {
    throw new Error("Empty isset");
  }

  while (i !== l) {
    if (typeof a[i] == "undefined" || a[i] === null) {
      return false;
    } else {
      i++;
    }
  }
  return true;
}

function getFile(strUrl, type) {
  if (!isset(type)) {
    type = "text";
  }

  var fileReturn;

  jQuery.ajax({
    url: strUrl,
    dataType: type,
    success: function (data) {
      fileReturn = data;
    },
    async: false,
  });

  return fileReturn;
}

function addZero(n) {
  return (parseInt(n) < 10 ? "0" : "") + parseInt(n);
}
function pad(n) {
  return ("00000000" + n).substr(-8);
}
function natural_expand(a) {
  return a.replace(/\d+/g, pad);
}
function natural_compare(a, b) {
  return natural_expand(a).localeCompare(natural_expand(b));
}

function isInt(value) {
  return (
    !isNaN(value) &&
    parseInt(Number(value)) == value &&
    !isNaN(parseInt(value, 10))
  );
}

function hasNumber(myString) {
  return /\d/.test(myString);
}

function SVGToImage(settings) {
  let _settings = {
    svg: null,
    // Usually all SVG have transparency, so PNG is the way to go by default
    mimetype: "image/png",
    quality: 0.92,
    width: "auto",
    height: "auto",
    outputFormat: "base64",
  };

  // Override default settings
  for (let key in settings) {
    _settings[key] = settings[key];
  }

  return new Promise(function (resolve, reject) {
    let svgNode;

    // Create SVG Node if a plain string has been provided
    if (typeof _settings.svg == "string") {
      // Create a non-visible node to render the SVG string
      let SVGContainer = document.createElement("div");
      SVGContainer.style.display = "none";
      SVGContainer.innerHTML = _settings.svg;
      svgNode = SVGContainer.firstElementChild;
    } else {
      svgNode = _settings.svg;
    }

    let canvas = document.createElement("canvas");
    let context = canvas.getContext("2d");

    let svgXml = new XMLSerializer().serializeToString(svgNode);
    let svgBase64 = "data:image/svg+xml;base64," + utf8_to_b64(svgXml);

    const image = new Image();

    image.onload = function () {
      let finalWidth, finalHeight;

      // Calculate width if set to auto and the height is specified (to preserve aspect ratio)
      if (_settings.width === "auto" && _settings.height !== "auto") {
        finalWidth = (this.width / this.height) * _settings.height;
        // Use image original width
      } else if (_settings.width === "auto") {
        finalWidth = this.naturalWidth;
        // Use custom width
      } else {
        finalWidth = _settings.width;
      }

      // Calculate height if set to auto and the width is specified (to preserve aspect ratio)
      if (_settings.height === "auto" && _settings.width !== "auto") {
        finalHeight = (this.height / this.width) * _settings.width;
        // Use image original height
      } else if (_settings.height === "auto") {
        finalHeight = this.naturalHeight;
        // Use custom height
      } else {
        finalHeight = _settings.height;
      }

      // Define the canvas intrinsic size
      canvas.width = finalWidth;
      canvas.height = finalHeight;

      // Render image in the canvas
      context.drawImage(this, 0, 0, finalWidth, finalHeight);

      if (_settings.outputFormat == "blob") {
        // Fullfil and Return the Blob image
        canvas.toBlob(
          function (blob) {
            resolve(blob);
          },
          _settings.mimetype,
          _settings.quality,
        );
      } else {
        // Fullfil and Return the Base64 image
        resolve(canvas.toDataURL(_settings.mimetype, _settings.quality));
      }
    };

    // Load the SVG in Base64 to the image
    image.src = svgBase64;
  });
}
