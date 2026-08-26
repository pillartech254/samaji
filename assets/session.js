// ============================================================
//  SHARED SESSION / IDLE-TIMEOUT LAYER  (all four portals)
//
//  Replaces the copy-pasted idle-watch block that lived in
//  school/, admin/, teacher/ and parent/index.html.
//
//  Three things it fixes:
//
//  1. CREDENTIALS SURVIVED SIGN-OUT. doSignOut() hid the app and
//     showed the login form again but never touched the inputs, so
//     after an idle timeout the previous user's email AND password
//     were still sitting in the box — anyone at that desk could
//     click "Sign in". clearCredentials() now wipes every auth
//     field (and the browser's autofill state) on every sign-out
//     and on every expired-session boot.
//
//  2. localStorage WRITE ON EVERY mousemove. markActive() called
//     localStorage.setItem() directly, and it was bound to
//     "mousemove" — a synchronous, main-thread-blocking disk write
//     firing 60+ times a second while the mouse moves. That alone
//     made the whole UI feel heavy. Activity is now kept in a
//     variable and flushed to localStorage at most once every
//     10 seconds.
//
//  3. The idle check ran on a 15s interval even in a hidden tab.
//     It now also re-checks immediately when the tab becomes
//     visible again, so a laptop that slept for an hour is signed
//     out the moment it wakes, not up to 15s later.
// ============================================================
(function () {
  "use strict";

  window.SamajiSession = function (opts) {
    // opts: { sb, key, idleMinutes, fields[], onExpire(reason) }
    var sb = opts.sb;
    var ACT_KEY = opts.key || "samaji_last_active";
    var IDLE_MINUTES = opts.idleMinutes || 5;
    var IDLE_MS = IDLE_MINUTES * 60 * 1000;
    var FIELDS = opts.fields || ["email", "password"];
    var FLUSH_MS = 10000; // never write to localStorage more often than this

    var idleTimer = null;
    var lastFlush = 0;
    var lastSeen = 0;
    var watching = false;

    function readStored() {
      var v = 0;
      try { v = parseInt(localStorage.getItem(ACT_KEY) || "0", 10); } catch (e) {}
      return v || 0;
    }

    function lastActive() {
      return Math.max(lastSeen, readStored());
    }

    // Hot path: bound to mousemove/scroll/etc. Must stay cheap —
    // a variable assignment, plus a localStorage write at most once
    // every FLUSH_MS. Previously this hit localStorage every call.
    function markActive() {
      var now = Date.now();
      lastSeen = now;
      if (now - lastFlush < FLUSH_MS) return;
      lastFlush = now;
      try { localStorage.setItem(ACT_KEY, String(now)); } catch (e) {}
    }

    function flushNow() {
      lastFlush = 0;
      markActive();
    }

    // Wipe every credential input and drop focus, so an idle timeout
    // never leaves the last user's email/password on screen.
    function clearCredentials() {
      for (var i = 0; i < FIELDS.length; i++) {
        var el = document.getElementById(FIELDS[i]);
        if (!el) continue;
        el.value = "";
        // Chrome/Safari will silently re-fill a password input that
        // still holds an autocomplete association. Toggling the
        // attribute forces them to treat it as a fresh field.
        if (el.type === "password") {
          el.setAttribute("autocomplete", "new-password");
          setTimeout(function (node) {
            return function () { node.setAttribute("autocomplete", "current-password"); };
          }(el), 0);
        }
        if (document.activeElement === el) el.blur();
      }
    }

    function stop() {
      if (idleTimer) { clearInterval(idleTimer); idleTimer = null; }
      watching = false;
      try { localStorage.removeItem(ACT_KEY); } catch (e) {}
      lastSeen = 0;
      lastFlush = 0;
    }

    function check() {
      if (!watching) return;
      if (Date.now() - lastActive() > IDLE_MS) {
        var reason = "You were signed out after " + IDLE_MINUTES + " minutes of inactivity.";
        stop();
        if (opts.onExpire) opts.onExpire(reason);
      }
    }

    function start() {
      if (watching) return;
      watching = true;
      flushNow();
      var events = ["mousedown", "keydown", "scroll", "touchstart", "click", "mousemove"];
      for (var i = 0; i < events.length; i++) {
        window.addEventListener(events[i], markActive, { passive: true });
      }
      // A sleeping/backgrounded tab gets throttled timers. Re-check the
      // moment it comes back so a stale tab can't linger past the limit.
      document.addEventListener("visibilitychange", function () {
        if (!document.hidden) check();
      });
      if (idleTimer) clearInterval(idleTimer);
      idleTimer = setInterval(check, 15000);
    }

    // True when a previously stored session has already gone stale.
    function isExpired() {
      var la = readStored();
      return !!(la && (Date.now() - la > IDLE_MS));
    }

    return {
      start: start,
      stop: stop,
      isExpired: isExpired,
      clearCredentials: clearCredentials,
      idleMinutes: IDLE_MINUTES,
      // Sign out without blocking the UI on the network call.
      // signOut() round-trips to Supabase to revoke the refresh token;
      // waiting for it before showing the login form is what made
      // "Sign out" feel like it hung. The local session is already
      // gone by the time the promise settles, so we fire and forget.
      signOut: function () {
        stop();
        clearCredentials();
        if (window.SamajiCache) window.SamajiCache.clear();
        try {
          var p = sb && sb.auth.signOut();
          if (p && p.catch) p.catch(function () {});
        } catch (e) {}
      }
    };
  };
})();
