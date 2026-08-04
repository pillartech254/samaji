// ============================================================
//  Shared client + module metadata + helpers (both apps).
//  Loaded AFTER the supabase-js CDN script and config.js.
// ============================================================
(function () {
  var cfg = window.SAMAJI_CONFIG || {};
  window.SAMAJI_CONFIGURED =
    cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    cfg.SUPABASE_URL.indexOf("YOUR-PROJECT") === -1 &&
    cfg.SUPABASE_ANON_KEY.indexOf("YOUR-ANON") === -1;

  // Each portal (school/parent/teacher/admin) gets its own isolated auth
  // session. Supabase's default storage key is the same for every client
  // pointed at the same project, so without this, all four portals share
  // ONE browser-wide session on samaji.app — sign in as a school admin,
  // then open /admin/, and it silently logs you in there too. Scoping the
  // storageKey by the first path segment keeps each portal's login
  // completely separate, even in the same browser.
  window.getSB = function () {
    if (!window.SAMAJI_CONFIGURED || !window.supabase) return null;
    if (!window.__sb) {
      var portal = (location.pathname.split("/").filter(Boolean)[0] || "app").toLowerCase();
      window.__sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        auth: { storageKey: "sb-samaji-" + portal + "-auth" }
      });
    }
    return window.__sb;
  };

  // Module display metadata, keyed by feature flag. `icon` is a lookup key
  // into window.SamajiIcons (assets/icons.js) rather than the SVG itself,
  // resolved lazily in metaFor() so script load order doesn't matter.
  window.MODULE_META = {
    "module.students":   { name: "Students",         icon: "students",   tint: "#EEF1F5", ink: "#475467", kpi: { label: "Active students",  value: "842" } },
    "module.attendance": { name: "Attendance",       icon: "attendance", tint: "#EEF1F5", ink: "#475467", kpi: { label: "Attendance today", value: "96.4%" } },
    "module.academics":  { name: "Report Cards",     icon: "academics",  tint: "#EEF1F5", ink: "#475467" },
    "module.messaging":  { name: "Communications",   icon: "messaging",  tint: "#EEF1F5", ink: "#475467" },
    "module.finance":    { name: "Fees & Invoicing", icon: "finance",    tint: "#EEF0FF", ink: "#4F46E5", kpi: { label: "Outstanding fees", value: "$48,200" } },
    "module.exams":      { name: "Exams",            icon: "exams",      tint: "#EEF0FF", ink: "#4F46E5" },
    "module.timetable":  { name: "Timetable",        icon: "timetable",  tint: "#EEF0FF", ink: "#4F46E5" },
    "module.library":    { name: "Library",          icon: "library",    tint: "#EEF0FF", ink: "#4F46E5" },
    "module.transport":  { name: "Transport",        icon: "transport",  tint: "#EEF0FF", ink: "#4F46E5" },
    "module.payroll":    { name: "Payroll",          icon: "payroll",    tint: "#F1ECFE", ink: "#6D28D9" },
    "module.sms":        { name: "SMS Gateway",      icon: "sms",        tint: "#F1ECFE", ink: "#6D28D9" },
    "module.biometric":  { name: "Biometric",        icon: "biometric",  tint: "#F1ECFE", ink: "#6D28D9" },
    "module.analytics":  { name: "Analytics Pro",    icon: "analytics",  tint: "#F1ECFE", ink: "#6D28D9" },
    "module.api":        { name: "API & Webhooks",   icon: "api",        tint: "#F1ECFE", ink: "#6D28D9" }
  };
  window.metaFor = function (k) {
    var m = window.MODULE_META[k] || { name: k, icon: k, tint: "#EEF1F5", ink: "#475467" };
    var out = {}; for (var p in m) out[p] = m[p];
    out.icon = window.iconFor ? window.iconFor(m.icon) : "";
    return out;
  };

  // ---- Shared pagination utility ----
  // Usage:
  //   var pg = window.paginate(allRows, page, perPage);
  //   // render pg.rows (the current page slice)
  //   // append pg.html to get prev/next controls
  //   // pg.onAttach(container, function(newPage){ ... }) wires click handlers
  var PG_SIZES = [15, 25, 50, 100];
  // serverTotal: pass this when allRows is already just the current page
  // (e.g. fetched via .range() from the server) instead of the full list —
  // rows are used as-is and total/paging math uses serverTotal instead of
  // allRows.length.
  window.paginate = function (allRows, page, perPage, serverTotal) {
    perPage = perPage || 15;
    var serverMode = typeof serverTotal === "number";
    var total = serverMode ? serverTotal : allRows.length;
    var totalPages = Math.max(1, Math.ceil(total / perPage));
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    var start = (page - 1) * perPage;
    var rows = serverMode ? allRows : allRows.slice(start, start + perPage);

    var html = "";
    if (total > PG_SIZES[0]) {
      html += '<div class="pg-bar" style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;font-size:12.5px;color:#667085;">';
      html += '<span>Showing ' + (total === 0 ? 0 : start + 1) + '–' + Math.min(start + perPage, total) + ' of ' + total + '</span>';
      html += '<div style="display:flex;align-items:center;gap:6px;">';
      html += '<button class="pg-btn" data-pg="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + ' style="padding:5px 10px;border:1px solid #DDE1E6;border-radius:7px;background:#fff;cursor:pointer;font-size:12px;font-family:inherit;color:#344054;' + (page <= 1 ? 'opacity:.4;cursor:default;' : '') + '">&laquo; Prev</button>';

      // Page numbers
      var pages = [];
      if (totalPages <= 7) {
        for (var i = 1; i <= totalPages; i++) pages.push(i);
      } else {
        pages.push(1);
        if (page > 3) pages.push("...");
        for (var i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
        if (page < totalPages - 2) pages.push("...");
        pages.push(totalPages);
      }
      for (var i = 0; i < pages.length; i++) {
        var p = pages[i];
        if (p === "...") {
          html += '<span style="padding:0 4px;color:#98A2B3;">…</span>';
        } else {
          var active = p === page;
          html += '<button class="pg-btn" data-pg="' + p + '" style="padding:5px 10px;border:1px solid ' + (active ? '#0E9384' : '#DDE1E6') + ';border-radius:7px;background:' + (active ? '#0E9384' : '#fff') + ';color:' + (active ? '#fff' : '#344054') + ';cursor:pointer;font-size:12px;font-family:inherit;font-weight:' + (active ? '700' : '500') + ';">' + p + '</button>';
        }
      }

      html += '<button class="pg-btn" data-pg="' + (page + 1) + '"' + (page >= totalPages ? ' disabled' : '') + ' style="padding:5px 10px;border:1px solid #DDE1E6;border-radius:7px;background:#fff;cursor:pointer;font-size:12px;font-family:inherit;color:#344054;' + (page >= totalPages ? 'opacity:.4;cursor:default;' : '') + '">Next &raquo;</button>';
      html += '</div></div>';
    }

    return {
      rows: rows,
      html: html,
      page: page,
      totalPages: totalPages,
      total: total,
      onAttach: function (container, callback) {
        if (!container) return;
        var btns = container.querySelectorAll(".pg-btn");
        for (var i = 0; i < btns.length; i++) {
          (function (b) {
            b.onclick = function () {
              if (b.disabled) return;
              var pg = parseInt(b.getAttribute("data-pg"), 10);
              if (pg >= 1 && pg <= totalPages) callback(pg);
            };
          })(btns[i]);
        }
      }
    };
  };

  // ---- Debounce ----
  // These search boxes filter an already-loaded in-memory array (no
  // network call per keystroke — the data's already on the page), but
  // rebuilding a big table's innerHTML on every single keypress can still
  // make fast typing feel laggy. Wrap the handler: window.debounce(fn, 150).
  window.debounce = function (fn, wait) {
    wait = wait || 150;
    var t = null;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  };

  // ---- Lazy-load a plain (non-module) script exactly once ----
  // The equivalent of dynamic import() for this codebase — these files
  // predate any bundler and are plain IIFE scripts (window.SamajiX = {...}),
  // not ES modules, so a real import() isn't available for them without
  // converting every one. Injecting a <script> tag on first use gets the
  // same result: the byte cost is deferred until a feature that actually
  // needs it (printing a payslip/report card) is opened, instead of paid
  // by every session regardless of whether they're ever used.
  var scriptPromises = {};
  window.loadScriptOnce = function (src) {
    if (scriptPromises[src]) return scriptPromises[src];
    scriptPromises[src] = new Promise(function (resolve, reject) {
      var el = document.createElement("script");
      el.src = src;
      el.onload = function () { resolve(); };
      el.onerror = function () { delete scriptPromises[src]; reject(new Error("Failed to load " + src)); };
      document.head.appendChild(el);
    });
    return scriptPromises[src];
  };

  // ---- Service Worker (static asset caching + offline shell) ----
  // Registered once here rather than duplicated in all four portals'
  // HTML. Deliberately after "load" so it never competes with the
  // page's own critical requests for bandwidth/priority.
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () { /* unsupported/blocked — app works fine without it */ });
    });
  }

  // ---- Copyright year ----
  // Previously fetched from worldtimeapi.org on every single page load,
  // across all four portals — an external network round-trip for a footer
  // year that the device's own clock already gives us for free.
  window.samajiYear = function(cb) {
    cb(Math.max(2025, new Date().getFullYear()));
  };
  window.samajiYear(function(yr) {
    ["yr", "year", "year-b"].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.textContent = yr;
    });
  });

  // ---- Theme toggle (light/dark) ----
  // The initial data-theme attribute is already set by a small inline
  // script in <head> (before paint, to avoid a flash of the wrong theme).
  // This just wires up the floating toggle button.
  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("samaji-theme", t); } catch (e) {}
    var btn = document.getElementById("samaji-theme-toggle");
    if (btn) btn.textContent = t === "dark" ? "☀" : "☾";
  }
  function initThemeToggle() {
    if (document.getElementById("samaji-theme-toggle")) return;
    var btn = document.createElement("button");
    btn.id = "samaji-theme-toggle";
    btn.className = "theme-toggle";
    btn.type = "button";
    btn.setAttribute("aria-label", "Toggle dark mode");
    btn.textContent = currentTheme() === "dark" ? "☀" : "☾";
    btn.onclick = function () { applyTheme(currentTheme() === "dark" ? "light" : "dark"); };
    document.body.appendChild(btn);
  }
  if (document.body) initThemeToggle();
  else document.addEventListener("DOMContentLoaded", initThemeToggle);
})();
