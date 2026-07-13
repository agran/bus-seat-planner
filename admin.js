/* admin.js — логика редактора профилей мест */

$(document).ready(function () {
  var currentProfile = null; // редактируемый профиль (в памяти, ещё не обязательно сохранён)

  function subscribeCloudProfiles() {
    window.CloudSync.onProfilesChange(function (profiles) {
      SeatProfiles.replaceProfiles(profiles);
      refreshProfileList();
    });
  }

  function updateCloudStatusUI(user) {
    var loggedIn = !!user;
    $("#cloudLoginForm").toggle(!loggedIn);
    $("#btnCloudLogout").toggle(loggedIn);
    if (loggedIn) {
      $("#cloudStatus").text(
        "Облачное хранилище: вы вошли как " + user.email + ", можно сохранять/удалять.",
      );
    } else {
      $("#cloudStatus").text(
        "Облачное хранилище: без входа профили видны всем, но сохранять/удалять может только администратор.",
      );
    }
  }

  function initCloudSync() {
    if (!window.CloudSync) {
      $("#cloudStatus").text("Облачное хранилище недоступно, работаем только локально.");
      return;
    }
    window.CloudSync.onAuthChange(updateCloudStatusUI);
    if (window.CloudSync.isAvailable()) {
      subscribeCloudProfiles();
    } else {
      window.addEventListener("cloudsync-ready", subscribeCloudProfiles);
      $("#cloudStatus").text("Облачное хранилище: подключение…");
    }
  }

  $("#btnCloudLogin").on("click", function () {
    var email = $("#cloudEmail").val().trim();
    var password = $("#cloudPassword").val();
    if (!email || !password) {
      showStatus("Введите email и пароль администратора.", "error");
      return;
    }
    window.CloudSync.login(email, password)
      .then(function () {
        $("#cloudPassword").val("");
        showStatus("Вход выполнен.", "ok");
      })
      .catch(function (err) {
        showStatus("Ошибка входа: " + err.message, "error");
      });
  });

  $("#btnTogglePassword").on("click", function () {
    var $input = $("#cloudPassword");
    var showing = $input.attr("type") === "text";
    $input.attr("type", showing ? "password" : "text");
    $(this).text(showing ? "👁" : "🙈");
  });

  $("#btnCloudLogout").on("click", function () {
    window.CloudSync.logout();
  });

  function blankCell() {
    return { type: "empty", number: null };
  }

  function makeEmptyProfile(rows, cols) {
    var cells = [];
    for (var i = 0; i < rows * cols; i++) {
      cells.push(blankCell());
    }
    return {
      id: null,
      name: "",
      rows: rows,
      cols: cols,
      cells: cells,
    };
  }

  function refreshProfileList() {
    var $sel = $("#profileList");
    $sel.empty();
    $sel.append($("<option>").val("__new__").text("— новый профиль —"));
    SeatProfiles.getProfiles().forEach(function (p) {
      $sel.append($("<option>").val(p.id).text(p.name));
    });
    if (currentProfile && currentProfile.id) {
      $sel.val(currentProfile.id);
    } else {
      $sel.val("__new__");
    }
  }

  function refreshRearWheelsSelect() {
    var $sel = $("#rearWheelsSelect");
    $sel.empty();
    $sel.append($("<option>").val("").text("автоматически"));
    for (var c = 1; c < currentProfile.cols; c++) {
      $sel.append(
        $("<option>")
          .val(c)
          .text("между колонками " + c + " и " + (c + 1)),
      );
    }
    var val = parseInt(currentProfile.rearWheelsAfterCol, 10);
    $sel.val(!isNaN(val) && val >= 1 && val < currentProfile.cols ? val : "");
  }

  function loadProfileIntoEditor(profile) {
    currentProfile = JSON.parse(JSON.stringify(profile));
    $("#profileName").val(currentProfile.name || "");
    $("#rowsInput").val(currentProfile.rows);
    $("#colsInput").val(currentProfile.cols);
    refreshRearWheelsSelect();
    renderGrid();
    renderPreview();
  }

  function renderGrid() {
    var $grid = $("#gridDesigner");
    $grid.empty();

    for (var r = 0; r < currentProfile.rows; r++) {
      var $row = $('<div class="grid-row">');
      for (var c = 0; c < currentProfile.cols; c++) {
        var idx = r * currentProfile.cols + c;
        var cell = currentProfile.cells[idx];
        var $cell = $('<div class="grid-cell">')
          .addClass(cell.type)
          .attr("data-idx", idx);

        if (cell.type === "seat") {
          $cell.append(
            $('<span class="cell-number">').text(
              cell.number != null ? cell.number : "?",
            ),
          );
          $cell.append(
            $('<button type="button" class="cell-edit" title="Изменить номер места">✎</button>'),
          );
        } else if (cell.type === "guide") {
          $cell.text(cell.number != null ? "Гид " + cell.number : "Гид");
        } else if (cell.type === "driver") {
          $cell.text("Вод.");
        } else if (cell.type === "door") {
          $cell.text("Дверь");
        }

        $row.append($cell);
      }
      $grid.append($row);
    }
  }

  function nextFreeNumber() {
    var used = {};
    currentProfile.cells.forEach(function (c) {
      if ((c.type === "seat" || c.type === "guide") && c.number != null) {
        used[c.number] = true;
      }
    });
    var n = 1;
    while (used[n]) {
      n++;
    }
    return n;
  }

  $(document).on("click", ".cell-edit", function (e) {
    e.stopPropagation();
    var idx = $(this).closest(".grid-cell").data("idx");
    var cell = currentProfile.cells[idx];
    var input = prompt(
      "Номер места:",
      cell.number != null ? cell.number : "",
    );
    if (input === null) {
      return;
    }
    var val = parseInt(input.trim(), 10);
    if (isNaN(val)) {
      alert("Номер места должен быть числом.");
      return;
    }
    cell.number = val;
    renderGrid();
    renderPreview();
  });

  $(document).on("click", ".grid-cell", function () {
    var idx = $(this).data("idx");
    var cell = currentProfile.cells[idx];

    if (cell.type === "empty") {
      cell.type = "seat";
      cell.number = nextFreeNumber();
    } else if (cell.type === "seat") {
      // Гид сохраняет номер места — оно входит в общую нумерацию.
      cell.type = "guide";
    } else if (cell.type === "guide") {
      cell.type = "door";
      cell.number = null;
    } else if (cell.type === "door") {
      currentProfile.cells.forEach(function (otherCell) {
        if (otherCell.type === "driver") {
          otherCell.type = "empty";
          otherCell.number = null;
        }
      });
      cell.type = "driver";
      cell.number = null;
    } else {
      cell.type = "empty";
      cell.number = null;
    }

    renderGrid();
    renderPreview();
  });

  function renderPreview() {
    var $parent = $("#previewParent");
    $parent.empty();
    try {
      var svg = SeatProfiles.generateGenericSVG(currentProfile, {});
      $parent.append(svg);
    } catch (e) {
      $parent.text("Ошибка предпросмотра: " + e.message);
    }
  }

  $("#btnResize").on("click", function () {
    var rows = parseInt($("#rowsInput").val(), 10) || 1;
    var cols = parseInt($("#colsInput").val(), 10) || 1;

    var newCells = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        if (r < currentProfile.rows && c < currentProfile.cols) {
          newCells.push(currentProfile.cells[r * currentProfile.cols + c]);
        } else {
          newCells.push(blankCell());
        }
      }
    }
    currentProfile.rows = rows;
    currentProfile.cols = cols;
    currentProfile.cells = newCells;
    if (
      currentProfile.rearWheelsAfterCol != null &&
      currentProfile.rearWheelsAfterCol >= cols
    ) {
      currentProfile.rearWheelsAfterCol = null;
    }
    refreshRearWheelsSelect();

    renderGrid();
    renderPreview();
  });

  $("#rearWheelsSelect").on("change", function () {
    var val = parseInt($(this).val(), 10);
    currentProfile.rearWheelsAfterCol = isNaN(val) ? null : val;
    renderPreview();
  });

  function computeSeatOrder(order) {
    var rows = currentProfile.rows;
    var cols = currentProfile.cols;
    var seatIdxs = [];

    function isSeat(idx) {
      // Место гида участвует в нумерации наравне с обычными местами.
      var type = currentProfile.cells[idx].type;
      return type === "seat" || type === "guide";
    }

    if (order === "row-lr") {
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var idx = r * cols + c;
          if (isSeat(idx)) seatIdxs.push(idx);
        }
      }
    } else if (order === "row-rl") {
      for (var r2 = 0; r2 < rows; r2++) {
        for (var c2 = cols - 1; c2 >= 0; c2--) {
          var idx2 = r2 * cols + c2;
          if (isSeat(idx2)) seatIdxs.push(idx2);
        }
      }
    } else if (order === "col-lr-tb") {
      for (var c3 = 0; c3 < cols; c3++) {
        for (var r3 = 0; r3 < rows; r3++) {
          var idx3 = r3 * cols + c3;
          if (isSeat(idx3)) seatIdxs.push(idx3);
        }
      }
    } else if (order === "col-lr-bt") {
      for (var c3b = 0; c3b < cols; c3b++) {
        for (var r3b = rows - 1; r3b >= 0; r3b--) {
          var idx3b = r3b * cols + c3b;
          if (isSeat(idx3b)) seatIdxs.push(idx3b);
        }
      }
    } else if (order === "col-rl-tb") {
      for (var c4 = cols - 1; c4 >= 0; c4--) {
        for (var r4 = 0; r4 < rows; r4++) {
          var idx4 = r4 * cols + c4;
          if (isSeat(idx4)) seatIdxs.push(idx4);
        }
      }
    } else if (order === "col-rl-bt") {
      for (var c4b = cols - 1; c4b >= 0; c4b--) {
        for (var r4b = rows - 1; r4b >= 0; r4b--) {
          var idx4b = r4b * cols + c4b;
          if (isSeat(idx4b)) seatIdxs.push(idx4b);
        }
      }
    } else if (order === "snake-rows") {
      for (var r5 = 0; r5 < rows; r5++) {
        var leftToRight = r5 % 2 === 0;
        for (var i5 = 0; i5 < cols; i5++) {
          var c5 = leftToRight ? i5 : cols - 1 - i5;
          var idx5 = r5 * cols + c5;
          if (isSeat(idx5)) seatIdxs.push(idx5);
        }
      }
    } else if (order === "snake-cols") {
      for (var c6 = 0; c6 < cols; c6++) {
        var topToBottom = c6 % 2 === 0;
        for (var i6 = 0; i6 < rows; i6++) {
          var r6 = topToBottom ? i6 : rows - 1 - i6;
          var idx6 = r6 * cols + c6;
          if (isSeat(idx6)) seatIdxs.push(idx6);
        }
      }
    }

    return seatIdxs;
  }

  $("#btnAutoNumber").on("click", function () {
    var order = $("#numberingOrder").val();
    var seatIdxs = computeSeatOrder(order);

    seatIdxs.forEach(function (idx, i) {
      currentProfile.cells[idx].number = i + 1;
    });

    renderGrid();
    renderPreview();
  });

  $("#btnNewProfile").on("click", function () {
    loadProfileIntoEditor(makeEmptyProfile(5, 7));
    refreshProfileList();
    showStatus("", "");
  });

  $("#btnDuplicateProfile").on("click", function () {
    var copy = JSON.parse(JSON.stringify(currentProfile));
    copy.id = null;
    copy.name = (copy.name || "Профиль") + " (копия)";
    loadProfileIntoEditor(copy);
    refreshProfileList();
  });

  $("#btnDeleteProfile").on("click", function () {
    if (!currentProfile.id) {
      showStatus("Профиль ещё не сохранён.", "error");
      return;
    }
    if (!confirm('Удалить профиль "' + currentProfile.name + '"?')) {
      return;
    }
    if (window.CloudSync && window.CloudSync.isLoggedIn()) {
      window.CloudSync.deleteProfile(currentProfile.id)
        .then(function () {
          loadProfileIntoEditor(makeEmptyProfile(5, 7));
          refreshProfileList();
          showStatus("Профиль удалён из облака.", "ok");
        })
        .catch(function (err) {
          showStatus("Ошибка удаления: " + err.message, "error");
        });
    } else {
      SeatProfiles.deleteProfile(currentProfile.id);
      loadProfileIntoEditor(makeEmptyProfile(5, 7));
      refreshProfileList();
      showStatus("Профиль удалён локально.", "ok");
    }
  });

  $("#profileList").on("change", function () {
    var id = $(this).val();
    if (id === "__new__") {
      loadProfileIntoEditor(makeEmptyProfile(5, 7));
      return;
    }
    var profile = SeatProfiles.getProfile(id);
    if (profile) {
      loadProfileIntoEditor(profile);
    }
  });

  function showStatus(msg, kind) {
    $("#saveStatus").removeClass("ok error").addClass(kind).text(msg);
  }

  $("#btnSaveProfile").on("click", function () {
    currentProfile.name = $("#profileName").val().trim();

    var errors = SeatProfiles.validateProfile(currentProfile);
    if (errors.length > 0) {
      showStatus(errors.join(" "), "error");
      return;
    }

    if (window.CloudSync && window.CloudSync.isLoggedIn()) {
      window.CloudSync.saveProfile(currentProfile)
        .then(function (saved) {
          currentProfile = saved;
          refreshProfileList();
          showStatus("Профиль сохранён в облако.", "ok");
        })
        .catch(function (err) {
          showStatus("Ошибка сохранения в облако: " + err.message, "error");
        });
    } else {
      var saved = SeatProfiles.saveProfile(currentProfile);
      currentProfile = saved;
      refreshProfileList();
      showStatus(
        "Профиль сохранён локально (войдите в облако, чтобы поделиться им со всеми).",
        "ok",
      );
    }
  });

  $("#btnExport").on("click", function () {
    $("#jsonArea").val(JSON.stringify(currentProfile, null, 2));
  });

  $("#btnImport").on("click", function () {
    try {
      var parsed = JSON.parse($("#jsonArea").val());
      if (!parsed.rows || !parsed.cols || !Array.isArray(parsed.cells)) {
        throw new Error("Некорректный формат профиля.");
      }
      parsed.id = null; // импортируем как новый профиль, чтобы не перезаписать чужой по id
      loadProfileIntoEditor(parsed);
      showStatus("Профиль загружен из JSON, не забудьте сохранить.", "ok");
    } catch (e) {
      showStatus("Ошибка импорта: " + e.message, "error");
    }
  });

  // Инициализация: если есть сохранённые профили — открываем первый, иначе создаём новый.
  var profiles = SeatProfiles.getProfiles();
  if (profiles.length > 0) {
    loadProfileIntoEditor(profiles[0]);
  } else {
    loadProfileIntoEditor(makeEmptyProfile(5, 7));
  }
  refreshProfileList();
  initCloudSync();
});
