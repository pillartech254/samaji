// ============================================================
//  KICD-style CBC report card — printable HTML, colored grade/
//  competency badges from the school's own grading scheme.
//  Pure rendering (no network calls) so the same function works
//  from the Teacher Portal today and the School/Parent Portals
//  later. Mirrors the print-popup pattern in assets/payslip.js.
// ============================================================
(function () {
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }

  // Standard CBC catalog. A school can't yet customize this list from the
  // UI (that's a natural follow-up), but the ratings themselves — which
  // level each item earned — are fully data-driven from learner_ratings.
  var CATALOG = {
    competency: ["Communication","Critical Thinking","Creativity","Citizenship","Digital Literacy","Learning to Learn","Self Efficacy"],
    value: ["Respect","Responsibility","Integrity","Peace","Unity","Love","Patriotism","Care","Honesty"],
    psychomotor: ["Sports","Music","Art & Craft","Hygiene","Leadership"]
  };

  function badge(code, levels){
    if (!code) return '<span class="rc-muted">—</span>';
    var lvl = (levels||[]).find(function(l){ return l.competency_code===code; });
    var color = lvl ? (lvl.color||"#475467") : "#475467";
    return '<span class="rc-badge" style="background:'+color+'22;color:'+color+';">'+esc(code)+'</span>';
  }

  // opts: {
  //   school: {name, address, phone, email, motto, logo_url},
  //   student: {first_name,last_name,admission_no,gender,date_of_birth},
  //   classLabel, classTeacherName, term:{name}, academicYear:{year},
  //   subjectRows: [{name, termScores:[num|null,...], termNames:[...], average, gradeLabel, competencyCode, remark}],
  //   levels: grading_levels[] (for badge coloring),
  //   attendance: {daysOpen, daysPresent, daysAbsent},
  //   ratings: { competency:{ItemName:'EE'}, value:{...}, psychomotor:{...} },
  //   teacherRemark, principalRemark
  // }
  function studentReportHTML(opts){
    var school = opts.school||{}, s = opts.student||{};
    var termNames = (opts.subjectRows[0] && opts.subjectRows[0].termNames) || [];
    var attendancePct = opts.attendance && opts.attendance.daysOpen
      ? Math.round((opts.attendance.daysPresent/opts.attendance.daysOpen)*100) : null;

    var head = ''
      +'<div class="rc-head">'
      +'  <div class="rc-emblem">'+(school.logo_url?'<img src="'+esc(school.logo_url)+'">':'<div class="rc-emblem-ph">🛡</div>')+'</div>'
      +'  <div class="rc-headtext">'
      +'    <div class="rc-school">'+esc(school.name||"School")+'</div>'
      +'    <div class="rc-addr">'+esc(school.address||"")+'</div>'
      +'    <div class="rc-addr">'+[school.phone,school.email].filter(Boolean).map(esc).join(" · ")+'</div>'
      +(school.motto?'<div class="rc-motto">"'+esc(school.motto)+'"</div>':'')
      +'    <div class="rc-doctitle">'+esc(opts.term && opts.term.name || "")+' Report — Academic Year '+esc(opts.academicYear && opts.academicYear.year || "")+'</div>'
      +'  </div>'
      +'  <div class="rc-emblem">'+(school.logo_url?'<img src="'+esc(school.logo_url)+'">':'<div class="rc-emblem-ph">'+esc((school.name||"S").charAt(0))+'</div>')+'</div>'
      +'</div>';

    var bio = ''
      +'<table class="rc-bio"><tbody>'
      +'<tr><td class="k">Learner</td><td class="v">'+esc((s.first_name||"")+" "+(s.last_name||""))+'</td><td class="k">Adm No</td><td class="v">'+esc(s.admission_no||"—")+'</td></tr>'
      +'<tr><td class="k">Class</td><td class="v">'+esc(opts.classLabel||"—")+'</td><td class="k">Gender</td><td class="v">'+esc(s.gender||"—")+'</td></tr>'
      +'<tr><td class="k">Class Teacher</td><td class="v">'+esc(opts.classTeacherName||"—")+'</td><td class="k">DOB</td><td class="v">'+esc(s.date_of_birth||"—")+'</td></tr>'
      +'</tbody></table>';

    var assess = '<table class="rc-table"><thead><tr><th style="text-align:left;">Learning Area</th>'
      + termNames.map(function(n){ return '<th>'+esc(n)+'</th>'; }).join("")
      + '<th>Average</th><th>Grade</th><th>Competency</th><th style="text-align:left;">Remark</th></tr></thead><tbody>'
      + (opts.subjectRows||[]).map(function(r){
          return '<tr><td style="text-align:left;font-weight:600;">'+esc(r.name)+'</td>'
            + r.termScores.map(function(v){ return '<td>'+(v==null?'<span class="rc-muted">—</span>':v)+'</td>'; }).join("")
            + '<td style="font-weight:700;">'+(r.average==null?'<span class="rc-muted">—</span>':r.average)+'</td>'
            + '<td>'+(r.gradeLabel?esc(r.gradeLabel):'<span class="rc-muted">—</span>')+'</td>'
            + '<td>'+badge(r.competencyCode, opts.levels)+'</td>'
            + '<td style="text-align:left;">'+esc(r.remark||"—")+'</td></tr>';
        }).join("")
      + '</tbody></table>';

    var attendance = '<table class="rc-mini"><tbody>'
      +'<tr><td class="k">Days Open</td><td class="v">'+(opts.attendance?opts.attendance.daysOpen:"—")+'</td></tr>'
      +'<tr><td class="k">Days Present</td><td class="v">'+(opts.attendance?opts.attendance.daysPresent:"—")+'</td></tr>'
      +'<tr><td class="k">Days Absent</td><td class="v">'+(opts.attendance?opts.attendance.daysAbsent:"—")+'</td></tr>'
      +'<tr><td class="k">Attendance</td><td class="v">'+(attendancePct==null?"—":attendancePct+"%")+'</td></tr>'
      +'</tbody></table>';

    function ratingTable(title, category){
      var items = CATALOG[category];
      var ratings = (opts.ratings && opts.ratings[category]) || {};
      return '<table class="rc-mini rc-rating"><thead><tr><th colspan="2" style="text-align:left;">'+esc(title)+'</th></tr></thead><tbody>'
        + items.map(function(name){ return '<tr><td class="k" style="text-align:left;">'+esc(name)+'</td><td class="v">'+badge(ratings[name], opts.levels)+'</td></tr>'; }).join("")
        + '</tbody></table>';
    }

    var remarks = ''
      +'<div class="rc-remark"><div class="rc-remark-h">Teacher\'s Remarks</div><div class="rc-remark-b">'+esc(opts.teacherRemark||"—")+'</div></div>'
      +'<div class="rc-remark"><div class="rc-remark-h">Head Teacher\'s Remarks</div><div class="rc-remark-b">'+esc(opts.principalRemark||"—")+'</div></div>';

    var signatures = '<div class="rc-signrow">'
      +'<div class="rc-sign"><div class="rc-signline"></div>Class Teacher</div>'
      +'<div class="rc-sign"><div class="rc-signline"></div>Head Teacher</div>'
      +'<div class="rc-sign"><div class="rc-signline"></div>Parent / Guardian</div>'
      +'</div>';

    // opts.published===true  -> this came from a frozen report_cards snapshot (official).
    // opts.published===false -> live preview computed from current marks, not yet issued.
    var statusBanner = opts.published===false
      ? '<div class="rc-banner rc-banner-draft">DRAFT — not yet officially published. Marks may still change.</div>'
      : (opts.published===true
        ? '<div class="rc-banner rc-banner-official">Official published report'+(opts.publishedAt?(' · '+esc(new Date(opts.publishedAt).toLocaleDateString())):'')+'</div>'
        : '');

    return '<div class="rc-card">'
      + statusBanner + head + bio
      + '<div class="rc-section-h">Learning Areas</div>' + assess
      + '<div class="rc-grid2">'
      +   '<div>'+ '<div class="rc-section-h">Attendance</div>' + attendance + '</div>'
      +   '<div>'+ ratingTable("Core Competencies","competency") + '</div>'
      + '</div>'
      + '<div class="rc-grid2">'
      +   '<div>'+ ratingTable("Values","value") + '</div>'
      +   '<div>'+ ratingTable("Psychomotor Skills","psychomotor") + '</div>'
      + '</div>'
      + remarks + signatures
      + '<div class="rc-foot">Generated '+esc(new Date().toLocaleDateString())+' · Samaji School System</div>'
      + '</div>';
  }

  var RC_CSS = ''
    +'body{font-family:"IBM Plex Sans",system-ui,sans-serif;background:#fff;margin:0;padding:18px;color:#101626;}'
    +'.rc-card{max-width:760px;margin:0 auto 26px;border:2px solid #101626;padding:20px 24px;page-break-after:always;position:relative;}'
    +'.rc-banner{text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:6px 10px;border-radius:6px;margin-bottom:10px;}'
    +'.rc-banner-draft{background:#FFF6E8;color:#B54708;border:1px dashed #B54708;}'
    +'.rc-banner-official{background:#ECFDF3;color:#067647;border:1px solid #067647;}'
    +'.rc-head{display:flex;align-items:center;gap:14px;border-bottom:2px solid #101626;padding-bottom:12px;margin-bottom:12px;}'
    +'.rc-emblem{flex:none;width:56px;height:56px;border-radius:8px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#F4F6F8;font-size:22px;}'
    +'.rc-emblem img{width:100%;height:100%;object-fit:contain;}'
    +'.rc-headtext{flex:1;text-align:center;}'
    +'.rc-school{font-size:18px;font-weight:700;letter-spacing:-.01em;}'
    +'.rc-addr{font-size:11px;color:#475467;}'
    +'.rc-motto{font-size:11px;font-style:italic;color:#0E9384;margin-top:2px;}'
    +'.rc-doctitle{font-size:12.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-top:8px;}'
    +'table.rc-bio{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:14px;}'
    +'table.rc-bio td{border:1px solid #D0D5DD;padding:6px 9px;}'
    +'table.rc-bio td.k{color:#475467;font-weight:600;width:110px;background:#FAFBFC;}'
    +'.rc-section-h{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#475467;margin:14px 0 6px;border-bottom:1px solid #D0D5DD;padding-bottom:3px;}'
    +'table.rc-table{width:100%;border-collapse:collapse;font-size:11.5px;}'
    +'table.rc-table th,table.rc-table td{border:1px solid #D0D5DD;padding:6px 8px;text-align:center;}'
    +'table.rc-table th{background:#F4F6F8;font-size:10px;text-transform:uppercase;letter-spacing:.03em;}'
    +'.rc-grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:12px;}'
    +'table.rc-mini{width:100%;border-collapse:collapse;font-size:11.5px;}'
    +'table.rc-mini th{background:#F4F6F8;font-size:10.5px;text-transform:uppercase;padding:6px 8px;border:1px solid #D0D5DD;}'
    +'table.rc-mini td{border:1px solid #D0D5DD;padding:5px 8px;}'
    +'table.rc-mini td.k{color:#475467;}'
    +'table.rc-mini td.v{text-align:right;font-weight:600;}'
    +'.rc-badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;}'
    +'.rc-muted{color:#98A2B3;}'
    +'.rc-remark{margin-top:12px;border:1px solid #D0D5DD;border-radius:6px;}'
    +'.rc-remark-h{background:#F4F6F8;font-size:10.5px;font-weight:700;text-transform:uppercase;padding:5px 9px;border-bottom:1px solid #D0D5DD;}'
    +'.rc-remark-b{font-size:12px;padding:9px;min-height:20px;}'
    +'.rc-signrow{display:flex;justify-content:space-between;gap:14px;margin-top:26px;font-size:11px;color:#475467;text-align:center;}'
    +'.rc-sign{flex:1;}'
    +'.rc-signline{border-top:1px solid #101626;margin-bottom:5px;height:30px;}'
    +'.rc-foot{margin-top:18px;text-align:center;font-size:9.5px;color:#98A2B3;}'
    +'@media print{ body{padding:0;} .rc-card{page-break-after:always;border:1px solid #101626;} }';

  function printHTML(innerHTML, title){
    var w = window.open("", "_blank", "width=820,height=900");
    if (!w) return false;
    w.document.write('<!DOCTYPE html><html><head><title>'+esc(title||"Report Card")+'</title><style>'+RC_CSS+'</style></head><body>'+innerHTML+'</body></html>');
    w.document.close();
    w.onload = function(){ w.focus(); w.print(); };
    setTimeout(function(){ try{ w.focus(); w.print(); }catch(e){} }, 300);
    return true;
  }

  window.SamajiReportCard = {
    CATALOG: CATALOG,
    studentReportHTML: studentReportHTML,
    printHTML: printHTML,
    css: RC_CSS
  };
})();
