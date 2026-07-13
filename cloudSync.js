/* cloudSync.js — синхронизация профилей мест с Firestore.
 *
 * Работает как надстройка над SeatProfiles (localStorage остаётся
 * оффлайн-кэшем): любой, кто открыл сайт, читает профили из Firestore
 * публично (без входа), а редактировать (admin.html) может только тот,
 * кто вошёл под email/паролем администратора (Firebase Authentication).
 *
 * Экспортирует window.CloudSync с методами:
 *   onProfilesChange(cb)  — подписка на список профилей (realtime)
 *   saveProfile(profile)  — сохранить профиль в Firestore (нужен вход)
 *   deleteProfile(id)     — удалить профиль из Firestore (нужен вход)
 *   login(email, password)
 *   logout()
 *   onAuthChange(cb)      — cb(user|null) при входе/выходе
 *   isLoggedIn()
 *   isAvailable()         — true, если Firebase SDK успешно загрузился
 */
(function () {
  var FIREBASE_SDK_VERSION = "10.14.1";
  var CDN_BASE =
    "https://www.gstatic.com/firebasejs/" + FIREBASE_SDK_VERSION + "/";

  var authChangeListeners = [];
  var currentUser = null;
  var available = false;

  function notifyAuthListeners(user) {
    authChangeListeners.forEach(function (cb) {
      try {
        cb(user);
      } catch (e) {
        console.error("Ошибка в обработчике onAuthChange", e);
      }
    });
  }

  var api = {
    isAvailable: function () {
      return available;
    },
    isLoggedIn: function () {
      return !!currentUser;
    },
    onAuthChange: function (cb) {
      authChangeListeners.push(cb);
      cb(currentUser);
    },
    onProfilesChange: function () {
      console.warn("CloudSync ещё не готов (Firebase не загрузился).");
      return function unsubscribe() {};
    },
    saveProfile: function () {
      return Promise.reject(new Error("Firebase недоступен."));
    },
    deleteProfile: function () {
      return Promise.reject(new Error("Firebase недоступен."));
    },
    login: function () {
      return Promise.reject(new Error("Firebase недоступен."));
    },
    logout: function () {
      return Promise.resolve();
    },
  };

  window.CloudSync = api;

  if (!window.FIREBASE_CONFIG) {
    console.error(
      "firebase-config.js не подключён — облачная синхронизация отключена.",
    );
    return;
  }

  Promise.all([
    import(/* webpackIgnore: true */ CDN_BASE + "firebase-app.js"),
    import(/* webpackIgnore: true */ CDN_BASE + "firebase-firestore.js"),
    import(/* webpackIgnore: true */ CDN_BASE + "firebase-auth.js"),
  ])
    .then(function (mods) {
      var appMod = mods[0];
      var fsMod = mods[1];
      var authMod = mods[2];

      var app = appMod.initializeApp(window.FIREBASE_CONFIG);
      var db = fsMod.getFirestore(app);
      var auth = authMod.getAuth(app);

      var profilesCol = fsMod.collection(db, "profiles");

      authMod.onAuthStateChanged(auth, function (user) {
        currentUser = user;
        notifyAuthListeners(user);
      });

      api.isLoggedIn = function () {
        return !!currentUser;
      };

      api.onProfilesChange = function (cb) {
        return fsMod.onSnapshot(
          profilesCol,
          function (snapshot) {
            var profiles = [];
            snapshot.forEach(function (docSnap) {
              var data = docSnap.data();
              profiles.push({
                id: docSnap.id,
                name: data.name,
                rows: data.rows,
                cols: data.cols,
                rearWheelsAfterCol: data.rearWheelsAfterCol,
                cells: data.cells,
              });
            });
            cb(profiles);
          },
          function (err) {
            console.error("Ошибка чтения профилей из Firestore", err);
          },
        );
      };

      api.saveProfile = function (profile) {
        if (!currentUser) {
          return Promise.reject(
            new Error("Нужно войти, чтобы сохранять профили."),
          );
        }
        var id = profile.id || SeatProfiles.generateId();
        var ref = fsMod.doc(db, "profiles", id);
        var payload = {
          name: profile.name || "",
          rows: profile.rows,
          cols: profile.cols,
          cells: profile.cells,
          updatedAt: fsMod.serverTimestamp(),
        };
        if (profile.rearWheelsAfterCol != null) {
          payload.rearWheelsAfterCol = profile.rearWheelsAfterCol;
        }
        return fsMod.setDoc(ref, payload).then(function () {
          var saved = {};
          for (var k in profile) {
            saved[k] = profile[k];
          }
          saved.id = id;
          return saved;
        });
      };

      api.deleteProfile = function (id) {
        if (!currentUser) {
          return Promise.reject(
            new Error("Нужно войти, чтобы удалять профили."),
          );
        }
        return fsMod.deleteDoc(fsMod.doc(db, "profiles", id));
      };

      api.login = function (email, password) {
        return authMod.signInWithEmailAndPassword(auth, email, password);
      };

      api.logout = function () {
        return authMod.signOut(auth);
      };

      available = true;
      window.dispatchEvent(new Event("cloudsync-ready"));
    })
    .catch(function (err) {
      console.error(
        "Не удалось загрузить Firebase SDK, работаем только с localStorage.",
        err,
      );
    });
})();
