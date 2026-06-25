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

  window.getSB = function () {
    if (!window.SAMAJI_CONFIGURED || !window.supabase) return null;
    if (!window.__sb) window.__sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    return window.__sb;
  };

  // Module display metadata, keyed by feature flag.
  window.MODULE_META = {
    "module.students":   { name: "Students",         mono: "S", tint: "#EEF1F5", ink: "#475467", kpi: { label: "Active students",  value: "842" } },
    "module.attendance": { name: "Attendance",       mono: "A", tint: "#EEF1F5", ink: "#475467", kpi: { label: "Attendance today", value: "96.4%" } },
    "module.academics":  { name: "Academics",        mono: "A", tint: "#EEF1F5", ink: "#475467" },
    "module.messaging":  { name: "Communications",   mono: "C", tint: "#EEF1F5", ink: "#475467" },
    "module.finance":    { name: "Fees & Invoicing", mono: "F", tint: "#EEF0FF", ink: "#4F46E5", kpi: { label: "Outstanding fees", value: "$48,200" } },
    "module.exams":      { name: "Exams",            mono: "E", tint: "#EEF0FF", ink: "#4F46E5" },
    "module.timetable":  { name: "Timetable",        mono: "T", tint: "#EEF0FF", ink: "#4F46E5" },
    "module.library":    { name: "Library",          mono: "L", tint: "#EEF0FF", ink: "#4F46E5" },
    "module.transport":  { name: "Transport",        mono: "T", tint: "#EEF0FF", ink: "#4F46E5" },
    "module.payroll":    { name: "Payroll",          mono: "P", tint: "#F1ECFE", ink: "#6D28D9" },
    "module.sms":        { name: "SMS Gateway",      mono: "S", tint: "#F1ECFE", ink: "#6D28D9" },
    "module.biometric":  { name: "Biometric",        mono: "B", tint: "#F1ECFE", ink: "#6D28D9" },
    "module.analytics":  { name: "Analytics Pro",    mono: "A", tint: "#F1ECFE", ink: "#6D28D9" },
    "module.api":        { name: "API & Webhooks",   mono: "A", tint: "#F1ECFE", ink: "#6D28D9" }
  };
  window.metaFor = function (k) { return window.MODULE_META[k] || { name: k, mono: "•", tint: "#EEF1F5", ink: "#475467" }; };
})();
