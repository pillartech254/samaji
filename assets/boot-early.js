// ============================================================
//  EARLY BOOT — start the auth round-trip as soon as possible.
//
//  Before: every portal's boot logic lived in a big inline <script>
//  at the very bottom of the page, so the first auth request didn't
//  leave the browser until ALL the module scripts (school-plus.js
//  alone is 2,166 lines) had downloaded, parsed and executed. On a
//  Kenyan mobile connection that's most of a second of dead time
//  where the network sat idle behind the CPU.
//
//  Now: this file runs right after config.js/app.js and kicks the
//  session lookup off immediately. The heavy module scripts keep
//  downloading in parallel while Supabase is answering, so the two
//  costs overlap instead of stacking. By the time the portal's own
//  code runs, the session is usually already resolved and it can
//  render straight away.
//
//  Nothing here decides anything — it only starts the request and
//  parks the promise on window.__samajiBoot for the portal to await.
// ============================================================
(function () {
  "use strict";
  var sb = window.getSB && window.getSB();
  if (!sb) { window.__samajiBoot = Promise.resolve(null); return; }

  // getSession() reads the persisted session from localStorage and
  // refreshes it over the network only if the access token is expired.
  window.__samajiBoot = sb.auth.getSession()
    .then(function (s) { return (s && s.data && s.data.session) || null; })
    .catch(function () { return null; });
})();
