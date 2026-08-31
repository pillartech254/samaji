// ============================================================
//  Persistent, stale-while-revalidate request cache — the vanilla-JS
//  equivalent of "Dexie + TanStack Query" for a buildless, no-bundler
//  app (plain <script> tags, no npm). Two layers:
//    1. SamajiIDB   — a tiny wrapper over the native IndexedDB API
//       (no Dexie dependency) for cross-reload persistence.
//    2. SamajiCache — the public API every portal already calls
//       (get/invalidate/clear/preload), now backed by IndexedDB +
//       an in-memory hot layer, with stale-while-revalidate baked
//       into get(): a stale hit returns instantly AND kicks off a
//       silent background refetch that updates the cache for next
//       time (and notifies any watch() subscriber so an already-open
//       screen can refresh itself without the user doing anything).
//  Same public shape as the old in-memory-only SamajiCache, so every
//  existing call site keeps working unmodified — this is a drop-in
//  upgrade, not a rewrite of the callers.
// ============================================================
(function () {
  var DB_NAME = "samaji-cache", DB_VERSION = 1, STORE = "kv";
  var FRESH_MS = 30000;      // within this window, a hit is fresh: no background revalidate
  var STALE_MS = 24 * 3600000; // beyond this, don't even use the stale value — force a real fetch

  var dbPromise = null;
  function openDB(){
    if (dbPromise) return dbPromise;
    if (!("indexedDB" in window)) { dbPromise = Promise.resolve(null); return dbPromise; }
    dbPromise = new Promise(function(resolve){
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { resolve(null); return; }
      req.onupgradeneeded = function(){
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
      };
      req.onsuccess = function(){ resolve(req.result); };
      req.onerror = function(){ resolve(null); }; // private-browsing / disabled storage: fall back to memory-only
    });
    return dbPromise;
  }
  function idbGet(key){
    return openDB().then(function(db){
      if (!db) return undefined;
      return new Promise(function(resolve){
        try {
          var tx = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
          tx.onsuccess = function(){ resolve(tx.result ? tx.result.value : undefined); };
          tx.onerror = function(){ resolve(undefined); };
        } catch (e) { resolve(undefined); }
      });
    });
  }
  function idbSet(key, value){
    return openDB().then(function(db){
      if (!db) return;
      return new Promise(function(resolve){
        try {
          var tx = db.transaction(STORE, "readwrite").objectStore(STORE).put({ key: key, value: value });
          tx.onsuccess = function(){ resolve(); };
          tx.onerror = function(){ resolve(); };
        } catch (e) { resolve(); }
      });
    });
  }
  function idbDeletePrefix(prefix){
    return openDB().then(function(db){
      if (!db) return;
      return new Promise(function(resolve){
        try {
          var store = db.transaction(STORE, "readwrite").objectStore(STORE);
          var req = store.openCursor();
          req.onsuccess = function(){
            var cur = req.result;
            if (!cur) { resolve(); return; }
            if (!prefix || String(cur.key).indexOf(prefix) === 0) cur.delete();
            cur.continue();
          };
          req.onerror = function(){ resolve(); };
        } catch (e) { resolve(); }
      });
    });
  }
  function idbClear(){
    return openDB().then(function(db){
      if (!db) return;
      return new Promise(function(resolve){
        try {
          var tx = db.transaction(STORE, "readwrite").objectStore(STORE).clear();
          tx.onsuccess = function(){ resolve(); };
          tx.onerror = function(){ resolve(); };
        } catch (e) { resolve(); }
      });
    });
  }

  window.SamajiIDB = { get: idbGet, set: idbSet, deletePrefix: idbDeletePrefix, clear: idbClear };

  // ---------------------------------------------------------------
  //  SamajiCache — public API (unchanged shape from the previous
  //  in-memory-only version in assets/school-plus.js).
  // ---------------------------------------------------------------
  var mem = {};              // key -> { t: timestamp, data: any }
  var inflight = {};         // key -> Promise (de-dupes concurrent identical fetches)
  var watchers = {};         // table -> [fn(data)]

  // Was `table + "|" + sel` — no school scoping at all. IndexedDB
  // persists across page loads AND logins, so on a shared device (a
  // school's front-desk computer, a support person switching between
  // schools) the FIRST account to cache "students|*" would have that
  // exact same cached value handed to a COMPLETELY DIFFERENT school's
  // session the next time anyone loaded that same key — a real
  // cross-account data leak, not a performance quirk. schoolId is
  // already a parameter every get() call already passes; folding it
  // into the key itself is what actually scopes the cache per school.
  function k(table, sel, schoolId){ return table + "|" + (sel || "*") + "|" + (schoolId || ""); }

  function notify(table, data){
    (watchers[table] || []).forEach(function(fn){ try { fn(data); } catch (e) {} });
  }

  // Runs the actual Supabase query and updates both cache layers.
  function fetchAndStore(sb, schoolId, table, sel, key){
    if (inflight[key]) return inflight[key];
    var p = sb.from(table).select(sel || "*").eq("school_id", schoolId).then(function(r){
      var data = r.data || [];
      mem[key] = { t: Date.now(), data: data };
      idbSet(key, { t: mem[key].t, data: data }); // fire-and-forget persistence
      delete inflight[key];
      notify(table, data);
      return data;
    }).catch(function(){ delete inflight[key]; return mem[key] ? mem[key].data : []; });
    inflight[key] = p;
    return p;
  }

  // Stale-while-revalidate: a fresh hit returns as-is; a stale hit
  // returns immediately too, but silently triggers a background
  // refetch so the NEXT call (or an active watch() subscriber) sees
  // current data. Only a true miss awaits the network.
  async function get(sb, schoolId, table, sel){
    var key = k(table, sel, schoolId);
    var hit = mem[key];
    if (!hit) {
      var persisted = await idbGet(key);
      if (persisted && Date.now() - persisted.t < STALE_MS) {
        mem[key] = persisted;
        hit = persisted;
      }
    }
    if (hit) {
      var age = Date.now() - hit.t;
      if (age > FRESH_MS) fetchAndStore(sb, schoolId, table, sel, key); // background revalidate, don't await
      return hit.data;
    }
    return fetchAndStore(sb, schoolId, table, sel, key);
  }

  function invalidate(table){
    Object.keys(mem).forEach(function(key){ if (!table || key.indexOf(table + "|") === 0) delete mem[key]; });
    idbDeletePrefix(table ? table + "|" : "");
  }

  function clear(){ mem = {}; inflight = {}; idbClear(); }

  // A screen can opt into "silently refresh me when this table's
  // cache gets revalidated in the background" instead of polling.
  function watch(table, fn){
    (watchers[table] = watchers[table] || []).push(fn);
    return function unwatch(){
      var arr = watchers[table] || [];
      var i = arr.indexOf(fn); if (i >= 0) arr.splice(i, 1);
    };
  }

  function preload(sb, schoolId){
    return Promise.all([
      get(sb, schoolId, "students", "*"),
      get(sb, schoolId, "school_classes", "*"),
      get(sb, schoolId, "dormitories", "*"),
      get(sb, schoolId, "fee_structures", "*, fee_items(amount)"),
      get(sb, schoolId, "fee_payments", "*")
    ]).catch(function(){});
  }

  // ---------------------------------------------------------------
  //  getCustom — same stale-while-revalidate machinery as get(), but
  //  for a query shape get() can't express: get() always runs
  //  `.from(table).select(sel).eq("school_id", schoolId)`, which
  //  fits the School/Teacher Portals' data (everything scoped by one
  //  school) but not the Parent Portal's (fee_payments filtered by a
  //  specific set of student ids, mpesa_transactions filtered by
  //  parent_id, neither a plain "all of this table for my school"
  //  query). getCustom(key, fetcherFn) takes an arbitrary cache key
  //  and an arbitrary async function instead of assuming the query
  //  shape, reusing the same in-memory + IndexedDB layers, the same
  //  in-flight de-dupe, and the same watch()/notify() mechanism (a
  //  watcher just needs to use the same key it cached under, whether
  //  that key is a table name from get() or an arbitrary string from
  //  getCustom() — watchers/notify were always plain string-keyed).
  // ---------------------------------------------------------------
  function fetchAndStoreCustom(key, fetcherFn){
    if (inflight[key]) return inflight[key];
    var p = Promise.resolve().then(fetcherFn).then(function(data){
      mem[key] = { t: Date.now(), data: data };
      idbSet(key, mem[key]); // fire-and-forget persistence
      delete inflight[key];
      notify(key, data);
      return data;
    }).catch(function(){ delete inflight[key]; return mem[key] ? mem[key].data : null; });
    inflight[key] = p;
    return p;
  }

  async function getCustom(key, fetcherFn){
    var hit = mem[key];
    if (!hit) {
      var persisted = await idbGet(key);
      if (persisted && Date.now() - persisted.t < STALE_MS) {
        mem[key] = persisted;
        hit = persisted;
      }
    }
    if (hit) {
      var age = Date.now() - hit.t;
      if (age > FRESH_MS) fetchAndStoreCustom(key, fetcherFn); // background revalidate, don't await
      return hit.data;
    }
    return fetchAndStoreCustom(key, fetcherFn);
  }

  function invalidateCustom(key){
    delete mem[key];
    idbDeletePrefix(key);
  }

  // invalidateCustom only exact-matches the in-memory cache (though it
  // already prefix-matches IndexedDB, inconsistently) — fine for a
  // single known key, but fee_payments/report_cards/etc getCustom()
  // keys are suffixed with a sorted student-id list that varies by
  // which children happen to be involved in a given read, so there's
  // no single exact key to invalidate after, say, a payment completes
  // for one child. Mirrors invalidate()'s already-correct prefix
  // behavior, for the getCustom() namespace.
  function invalidateCustomPrefix(prefix){
    Object.keys(mem).forEach(function(key){ if (key.indexOf(prefix) === 0) delete mem[key]; });
    idbDeletePrefix(prefix);
  }

  window.SamajiCache = { get: get, invalidate: invalidate, clear: clear, preload: preload, watch: watch, getCustom: getCustom, invalidateCustom: invalidateCustom, invalidateCustomPrefix: invalidateCustomPrefix };
})();
