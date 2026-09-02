// ============================================================
//  Shared icon set — replaces the old single-letter module tiles
//  with real line-style SVGs, consistent everywhere: landing page,
//  admin console, school portal, teacher portal, parent portal.
//  All icons: 24x24 viewBox, stroke-based, currentColor, 18x18 on
//  screen (matches the existing dashboard stat-card icon sizing).
// ============================================================
(function () {
  var S = 'width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"';

  var ICONS = {
    // ---- academic modules ----
    students:   '<svg '+S+'><circle cx="9" cy="8" r="3.2" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="17" cy="9" r="2.4" stroke="currentColor" stroke-width="1.6"/><path d="M15.2 13.6c2.4.4 4.3 2.3 4.3 5.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    attendance: '<svg '+S+'><rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M4 9.5h16M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8.5 14.3l2.2 2.2L16 11.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    academics:  '<svg '+S+'><path d="M4 7l8-4 8 4-8 4-8-4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 9.5V14c0 1.5 1.8 2.5 4 2.5s4-1 4-2.5V9.5" stroke="currentColor" stroke-width="1.8"/></svg>',
    messaging:  '<svg '+S+'><path d="M4 5h16v11H10l-4 3.5V16H4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M8 9h8M8 12.5h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    exams:      '<svg '+S+'><rect x="5" y="4" width="14" height="17" rx="2" stroke="currentColor" stroke-width="1.8"/><rect x="9" y="2.3" width="6" height="3" rx="1" stroke="currentColor" stroke-width="1.6"/><path d="M9 13l2 2 4-4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    timetable:  '<svg '+S+'><rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M4 9.5h16M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M9 13h2M13 13h2M9 16.5h2M13 16.5h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    library:    '<svg '+S+'><path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5c.8 0 1.5-.7 1.5-1.5v-13z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    transport:  '<svg '+S+'><rect x="3.5" y="6" width="17" height="10" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 11h17" stroke="currentColor" stroke-width="1.8"/><circle cx="7.5" cy="18.4" r="1.5" stroke="currentColor" stroke-width="1.6"/><circle cx="16.5" cy="18.4" r="1.5" stroke="currentColor" stroke-width="1.6"/></svg>',
    finance:    '<svg '+S+'><rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.8"/></svg>',
    // ---- advanced / add-on modules ----
    payroll:    '<svg '+S+'><rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M3 10h18" stroke="currentColor" stroke-width="1.8"/><circle cx="17" cy="14.5" r="1.3" fill="currentColor"/></svg>',
    sms:        '<svg '+S+'><rect x="7" y="2" width="10" height="20" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M10 18h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M9.5 7h5M9.5 10h5M9.5 13h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    biometric:  '<svg '+S+'><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    analytics:  '<svg '+S+'><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    api:        '<svg '+S+'><rect x="2.3" y="9" width="8" height="6" rx="3" stroke="currentColor" stroke-width="1.8" transform="rotate(-30 6.3 12)"/><rect x="13.7" y="9" width="8" height="6" rx="3" stroke="currentColor" stroke-width="1.8" transform="rotate(-30 17.7 12)"/></svg>',
    // ---- chrome / nav (dashboard, reports, settings, etc.) ----
    dashboard:  '<svg '+S+'><path d="M4 11L12 4l8 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    reports:    '<svg '+S+'><path d="M7 3h7l4 4v14H7z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 3v4h4" stroke="currentColor" stroke-width="1.8"/><path d="M9.5 17v-3M12.5 17v-5M15.5 17v-2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    settings:   '<svg '+S+'><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/><path d="M12 3v2.6M12 18.4V21M21 12h-2.6M5.6 12H3M18.4 5.6l-1.9 1.9M7.5 16.5l-1.9 1.9M18.4 18.4l-1.9-1.9M7.5 7.5L5.6 5.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    schools:    '<svg '+S+'><path d="M4 21V6l8-3 8 3v15" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 21v-6h6v6" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 10h.01M15 10h.01M9 14h.01M15 14h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    licensing:  '<svg '+S+'><circle cx="8" cy="15" r="4" stroke="currentColor" stroke-width="1.8"/><path d="M11 12l9-9M16 7l2 2M19 4l2 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    users:      '<svg '+S+'><circle cx="9" cy="8" r="3.2" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="17" cy="9" r="2.4" stroke="currentColor" stroke-width="1.6"/><path d="M15.2 13.6c2.4.4 4.3 2.3 4.3 5.4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    mpesa:      '<svg '+S+'><rect x="7" y="2" width="10" height="20" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M10 18h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12 6v5l3 2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    database:   '<svg '+S+'><ellipse cx="12" cy="6" rx="8" ry="3" stroke="currentColor" stroke-width="1.8"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" stroke="currentColor" stroke-width="1.8"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" stroke="currentColor" stroke-width="1.8"/></svg>',
    maintenance: '<svg '+S+'><path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4l-2.5 2.5-2-2 2.5-2.5z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    // ---- teacher portal ----
    marks:       '<svg '+S+'><path d="M4 20h4L18 10l-4-4L4 16v4z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M13 7l4 4" stroke="currentColor" stroke-width="1.8"/></svg>',
    reportbooks: '<svg '+S+'><circle cx="12" cy="9" r="5" stroke="currentColor" stroke-width="1.8"/><path d="M9 13.5L7.5 21l4.5-2.5 4.5 2.5-1.5-7.5" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    publish:     '<svg '+S+'><rect x="7" y="3" width="10" height="7" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M9 10v3h6v-3" stroke="currentColor" stroke-width="1.8"/><rect x="5" y="17" width="14" height="4" rx="1" stroke="currentColor" stroke-width="1.8"/></svg>',
    // ---- parent portal ----
    payments:      '<svg '+S+'><rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.8"/></svg>',
    announcements: '<svg '+S+'><path d="M4 10v4a1 1 0 0 0 1 1h2l8 4V5L7 9H5a1 1 0 0 0-1 1z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>'
  };
  var FALLBACK = '<svg '+S+'><circle cx="12" cy="12" r="3.5" fill="currentColor"/></svg>';

  window.SamajiIcons = ICONS;
  window.iconFor = function (key) { return ICONS[key] || FALLBACK; };

  // For static markup: <span class="tile" data-icon="students"></span>
  // then call window.SamajiIcons.fill() once the DOM is ready.
  window.SamajiIcons.fill = function (root) {
    (root || document).querySelectorAll("[data-icon]").forEach(function (el) {
      el.innerHTML = window.iconFor(el.getAttribute("data-icon"));
    });
  };
})();
