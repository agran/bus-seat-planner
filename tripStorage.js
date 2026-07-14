/* tripStorage.js
 * Хранение "поездок" в localStorage: у каждой поездки — своё название и
 * свой набор данных по местам (занято/свободно + ФИО пассажира).
 * Используется в index.html, чтобы можно было завести несколько поездок
 * и переключаться между ними, не теряя данные предыдущих.
 *
 * Поездка:
 * {
 *   id: string,
 *   name: string,
 *   seats: { [seatNumber: string]: { occupied: boolean, name: string } }
 * }
 *
 * Все данные хранятся только в браузере (localStorage), никуда не отправляются.
 */

var TripStorage = (function () {
  var STORAGE_KEY = "busSeatTrips_v1";

  function loadStore() {
    var raw;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      raw = null;
    }
    var store = null;
    if (raw) {
      try {
        store = JSON.parse(raw);
      } catch (e) {
        store = null;
      }
    }
    if (!store || typeof store !== "object" || !Array.isArray(store.trips)) {
      store = { trips: [], selectedTripId: null };
    }
    var changed = false;
    if (store.trips.length === 0) {
      var trip = createTripObject("Поездка 1");
      store.trips.push(trip);
      store.selectedTripId = trip.id;
      changed = true;
    }
    if (
      !store.selectedTripId ||
      !store.trips.some(function (t) {
        return t.id === store.selectedTripId;
      })
    ) {
      store.selectedTripId = store.trips[0].id;
      changed = true;
    }
    // Сразу сохраняем, если пришлось создать поездку по умолчанию или
    // подправить selectedTripId — иначе при следующем вызове (до первого
    // реального изменения) мы бы снова не нашли сохранённых данных и
    // создали ещё одну поездку с новым id.
    if (changed) {
      saveStore(store);
    }
    return store;
  }

  function saveStore(store) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      console.error("Не удалось сохранить поездки в localStorage", e);
    }
  }

  function generateId() {
    return (
      "trip_" +
      Date.now().toString(36) +
      "_" +
      Math.random().toString(36).slice(2, 8)
    );
  }

  function createTripObject(name) {
    return { id: generateId(), name: name, seats: {} };
  }

  function getTrips() {
    return loadStore().trips;
  }

  function getSelectedTripId() {
    return loadStore().selectedTripId;
  }

  function getTrip(id) {
    var store = loadStore();
    for (var i = 0; i < store.trips.length; i++) {
      if (store.trips[i].id === id) {
        return store.trips[i];
      }
    }
    return null;
  }

  function getSelectedTrip() {
    var store = loadStore();
    return getTrip(store.selectedTripId) || store.trips[0];
  }

  function setSelectedTripId(id) {
    var store = loadStore();
    if (
      store.trips.some(function (t) {
        return t.id === id;
      })
    ) {
      store.selectedTripId = id;
      saveStore(store);
    }
  }

  function createTrip(name) {
    var store = loadStore();
    var trip = createTripObject(name || "Новая поездка");
    store.trips.push(trip);
    store.selectedTripId = trip.id;
    saveStore(store);
    return trip;
  }

  function renameTrip(id, name) {
    var store = loadStore();
    var trip = store.trips.filter(function (t) {
      return t.id === id;
    })[0];
    if (trip) {
      trip.name = name;
      saveStore(store);
    }
  }

  // Удаляет поездку. Если она была выбрана — переключается на первую
  // оставшуюся (или создаёт новую, если поездок больше не осталось).
  function deleteTrip(id) {
    var store = loadStore();
    if (store.trips.length <= 1) {
      // Не даём удалить последнюю поездку — обнуляем её данные вместо этого.
      store.trips[0].seats = {};
      saveStore(store);
      return;
    }
    store.trips = store.trips.filter(function (t) {
      return t.id !== id;
    });
    if (store.selectedTripId === id) {
      store.selectedTripId = store.trips[0].id;
    }
    saveStore(store);
  }

  // Возвращает { occupied, name } для места в поездке, если для него
  // явно сохранялось состояние, иначе null (значит — используем то, что
  // задано в самой схеме автобуса по умолчанию: например, место гида
  // изначально занято, а обычные места изначально свободны).
  function getSeatData(tripId, seatNumber) {
    var trip = getTrip(tripId);
    var key = String(seatNumber);
    if (trip && trip.seats && trip.seats[key]) {
      return {
        occupied: !!trip.seats[key].occupied,
        name: trip.seats[key].name || "",
      };
    }
    return null;
  }

  // Всегда сохраняет явную запись (даже "свободно, без имени"), чтобы
  // при следующей загрузке место не откатилось к умолчанию из схемы
  // (актуально для мест, которые по умолчанию отмечены занятыми).
  function setSeatData(tripId, seatNumber, occupied, name) {
    var store = loadStore();
    var trip = store.trips.filter(function (t) {
      return t.id === tripId;
    })[0];
    if (!trip) {
      return;
    }
    var key = String(seatNumber);
    trip.seats[key] = { occupied: !!occupied, name: name || "" };
    saveStore(store);
  }

  return {
    getTrips: getTrips,
    getTrip: getTrip,
    getSelectedTrip: getSelectedTrip,
    getSelectedTripId: getSelectedTripId,
    setSelectedTripId: setSelectedTripId,
    createTrip: createTrip,
    renameTrip: renameTrip,
    deleteTrip: deleteTrip,
    getSeatData: getSeatData,
    setSeatData: setSeatData,
  };
})();
