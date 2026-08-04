// ============================================================
//  MINISTRY OF EDUCATION-style CBC summative report card —
//  reproduces the official Term Summative Report grid (ACTIVITIES
//  x First/Second/Third Test, each split into EE(4)/ME(3)/AE(2)/BE(1)
//  checkmark columns) as printable HTML. Pure rendering (no network
//  calls) so the same function works from the Teacher Portal today
//  and the School/Parent Portals later. Mirrors the print-popup
//  pattern in assets/payslip.js.
//
//  opts: {
//    school: {name, logo_url},
//    student: {first_name,last_name,admission_no,upi,photo_url},
//    cls: {level, stream},                     -- e.g. {level:'Grade 6', stream:'East'}
//    term: {name, start_date, end_date},        -- term.name e.g. 'Term 2'
//    facilitatorName, facilitatorRemark,
//    subjectRows: [{ name, tests:[competencyCode|null, ...] }],
//    levels: grading_levels[]  (for band -> color, unused for the
//            checkmark grid itself but kept for future badge reuse),
//    totalPercentPerTest: [number|null, ...],
//    averageCodePerTest:  [competencyCode|null, ...],
//    attendance: {daysOpen,daysPresent,daysAbsent}|null,
//    promotionStatus: string|null,
//    verificationCode: string|null,             -- only set on a frozen
//            (published) report card; prints a verification QR + code
//    published: true|false|undefined,           -- undefined = no stamp
//    publishedAt: iso date string
//  }
// ============================================================
(function () {
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }

  // Standard CBC catalog — still used by the Teacher Portal's Ratings &
  // Remarks modal (assets/teacher-modules.js), even though this specific
  // report card no longer prints those ratings itself.
  var CATALOG = {
    competency: ["Communication","Critical Thinking","Creativity","Citizenship","Digital Literacy","Learning to Learn","Self Efficacy"],
    value: ["Respect","Responsibility","Integrity","Peace","Unity","Love","Patriotism","Care","Honesty"],
    psychomotor: ["Sports","Music","Art & Craft","Hygiene","Leadership"]
  };

  var BANDS = ["EE","ME","AE","BE"];
  var BAND_HEAD = { EE:"EE<br>(4)", ME:"ME<br>(3)", AE:"AE<br>(2)", BE:"BE<br>(1)" };
  var ORDINALS = ["First","Second","Third","Fourth","Fifth","Sixth","Seventh","Eighth"];
  function ordinal(i){ return ORDINALS[i] || ((i+1)+"th"); }

  function termWord(name){
    if (!name) return "TERM";
    var m = String(name).match(/(\d+)/);
    var WORDS = ["","ONE","TWO","THREE","FOUR","FIVE","SIX"];
    if (m) { var n = parseInt(m[1],10); if (WORDS[n]) return "TERM "+WORDS[n]; }
    return String(name).toUpperCase();
  }

  // Maps a class level ('Grade 6', 'PP1', 'Grade 3'...) to the CBC
  // school-segment phrase printed on the form, matching the official
  // template: PP1/PP2 and Grades 1-3 are "Early Years Education", Grades
  // 4-6 are "Middle School (Upper Primary)", 7-9 "Junior School".
  function gradeSegment(level){
    var s = String(level||"");
    if (/pp\s*[12]/i.test(s)) return "EARLY YEARS EDUCATION";
    var m = s.match(/(\d+)/);
    if (m){
      var n = parseInt(m[1],10);
      if (n>=1 && n<=3) return "EARLY YEARS EDUCATION";
      if (n>=4 && n<=6) return "MIDDLE SCHOOL (UPPER PRIMARY)";
      if (n>=7 && n<=9) return "JUNIOR SCHOOL";
      if (n>=10) return "SENIOR SCHOOL";
    }
    return "MIDDLE SCHOOL (UPPER PRIMARY)";
  }

  function fmtDate(d){
    if (!d) return "—";
    var dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt.getTime())) return esc(String(d));
    var dd = String(dt.getDate()).padStart(2,"0"), mm = String(dt.getMonth()+1).padStart(2,"0"), yyyy = dt.getFullYear();
    return dd+"/"+mm+"/"+yyyy;
  }

  // Generic decorative crest — schematic, not a reproduction of any
  // official state seal — used purely to give the printed form the
  // formal look of the paper original.
  var COAT_SVG = '<svg viewBox="0 0 64 64" width="46" height="46">'
    + '<g fill="none" stroke="#101626" stroke-width="1.6">'
    + '<path d="M32 5 L56 13 V29 C56 44 46 55 32 59 C18 55 8 44 8 29 V13 Z"/>'
    + '<path d="M19 47 L45 17 M45 47 L19 17" stroke-width="1.1"/>'
    + '<circle cx="32" cy="27" r="7"/>'
    + '<path d="M32 20 L34 25 L32 30 L30 25 Z" fill="#101626" stroke="none"/>'
    + '</g></svg>';

  // A grading scheme's competency_code may be a plain band ('EE') or a
  // finer sub-level ('EE1'/'EE2', with its own points value) — the printed
  // grid still only has 4 physical columns, so a sub-level always checks
  // its base band's column.
  function baseBand(code){ return code ? String(code).slice(0,2).toUpperCase() : null; }

  function bandCells(code){
    var band = baseBand(code);
    return BANDS.map(function(b){
      return '<td class="rc-checkcell">'+(band===b ? '<span class="rc-check">&#10003;</span>' : '')+'</td>';
    }).join("");
  }

  // Renders the verification QR as inline SVG via the vendored qrcode-gen.js
  // (window.qrcode) — callers lazy-load it alongside this file, so it may not
  // be present; the report still prints fine without the QR image, just the
  // plain-text code.
  function qrSvg(text){
    if (!window.qrcode) return "";
    try{
      var qr = window.qrcode(0, "M");
      qr.addData(text);
      qr.make();
      return qr.createSvgTag({cellSize:2, margin:1});
    }catch(e){ return ""; }
  }

  function studentReportHTML(opts){
    opts = opts || {};
    var school = opts.school||{}, s = opts.student||{}, cls = opts.cls||{}, term = opts.term||{};
    var subjectRows = opts.subjectRows||[];
    // Fixed at 3 (First/Second/Third Test) to match the official KICD
    // summative report grid — capped here too in case opts came from
    // somewhere other than assets/academics-core.js's own MAX_TESTS cap.
    var testCount = Math.min((subjectRows[0] && subjectRows[0].tests && subjectRows[0].tests.length)
      || (opts.totalPercentPerTest||[]).length || 0, 3);
    var testIdx = []; for (var i=0;i<testCount;i++) testIdx.push(i);

    var stampLabel = opts.published===false ? "DRAFT" : "ORIGINAL";

    var head = ''
      +'<div class="rc-govhead">'
      +'  <div class="rc-logo">'+(school.logo_url?'<img src="'+esc(school.logo_url)+'">':'<div class="rc-logo-ph">'+esc((school.name||"S").charAt(0))+'</div>')+'</div>'
      +'  <div class="rc-govtext">'
      +'    <div class="rc-ministry">MINISTRY OF EDUCATION</div>'
      +'    <div class="rc-dept">STATE DEPARTMENT OF MIDDLE LEARNING AND BASIC EDUCATION</div>'
      +'    <div class="rc-formtitle">'+esc(termWord(term.name))+' SUMMATIVE REPORT FOR '+esc(gradeSegment(cls.level))+'</div>'
      +'    <div class="rc-gradeline">'+esc(String(cls.level||"").toUpperCase())+'</div>'
      +'  </div>'
      +'  <div class="rc-coat">'+COAT_SVG+'</div>'
      +'</div>';

    var classStr = String(cls.level||"—") + (cls.stream ? " "+cls.stream : "");
    var bioTable = ''
      +'<table class="rc-bio2"><tbody>'
      +'<tr><td class="k">Learner\'s Name:</td><td class="v">'+esc((s.first_name||"")+" "+(s.last_name||""))+'</td>'
      +'<td class="k">Admission No:</td><td class="v">'+esc(s.admission_no||"—")+'</td></tr>'
      +'<tr><td class="k">Name of School:</td><td class="v">'+esc(school.name||"—")+'</td>'
      +'<td class="k">Facilitator\'s Name:</td><td class="v">'+esc(opts.facilitatorName||"—")+'</td></tr>'
      +'<tr><td class="k">UPI:</td><td class="v">'+esc(s.upi||"—")+'</td>'
      +'<td class="k">Class:</td><td class="v">'+esc(classStr)+'</td></tr>'
      +'</tbody></table>';
    var photoBox = '<div class="rc-photo">'+(s.photo_url?'<img src="'+esc(s.photo_url)+'">':'<span class="rc-photo-ph">Photo</span>')+'</div>';
    var bio = '<div class="rc-biowrap">'+bioTable+photoBox+'</div>';

    var grid = '<table class="rc-grid"><thead>'
      +'<tr><th rowspan="2" class="rc-actcol">ACTIVITIES</th>'
      + testIdx.map(function(i){ return '<th colspan="4">'+esc(ordinal(i).toUpperCase())+' TEST</th>'; }).join("")
      +'</tr><tr>'
      + testIdx.map(function(){ return BANDS.map(function(b){ return '<th class="rc-band">'+BAND_HEAD[b]+'</th>'; }).join(""); }).join("")
      +'</tr></thead><tbody>'
      + subjectRows.map(function(r){
          return '<tr><td class="rc-actname">'+esc(r.name)+'</td>'
            + testIdx.map(function(i){ return bandCells((r.tests||[])[i]); }).join("")
            + '</tr>';
        }).join("")
      + '<tr class="rc-totalrow"><td class="rc-rowlabel">Total Percentage</td>'
        + testIdx.map(function(i){ var v=(opts.totalPercentPerTest||[])[i]; return '<td colspan="4" class="rc-totalcell">'+(v==null?"":v+"%")+'</td>'; }).join("")
        + '</tr>'
      + '<tr class="rc-avgrow"><td class="rc-rowlabel">Average Score</td>'
        + testIdx.map(function(i){ return bandCells((opts.averageCodePerTest||[])[i]); }).join("")
        + '</tr>'
      + '</tbody></table>';

    var remarks = '<div class="rc-remarksbox">'
      +'<div class="rc-remarks-label">Facilitator\'s remarks based on:- core competencies, achievements, PCI\'s development and Values:</div>'
      +'<div class="rc-remarks-text">'+esc(opts.facilitatorRemark||"")+'</div>'
      +'</div>';

    var att = opts.attendance;
    var attStr = att && att.daysOpen ? (att.daysPresent||0)+" / "+att.daysOpen+" days" : "—";
    var statusBar = '<div class="rc-statusbar">'
      +'<span>ATTENDANCE: <strong>'+esc(attStr)+'</strong></span>'
      +'<span>PROMOTION STATUS: <strong>'+esc(opts.promotionStatus||"—")+'</strong></span>'
      +'</div>';

    var genDate = fmtDate(new Date());
    var signatures = '<table class="rc-signtable"><tbody>'
      +'<tr><td class="rc-signlabel">Facilitator\'s Signature:</td><td class="rc-signline"></td><td class="rc-signlabel">Date:</td><td class="rc-datefilled">'+esc(genDate)+'</td></tr>'
      +'<tr><td class="rc-signlabel">Head Teacher\'s Signature:</td><td class="rc-signline"></td><td class="rc-signlabel">Date:</td><td class="rc-signline"></td></tr>'
      +'<tr><td class="rc-signlabel">Parent/Guardian\'s Signature:</td><td class="rc-signline"></td><td class="rc-signlabel">Date:</td><td class="rc-signline"></td></tr>'
      +'</tbody></table>';

    var dates = '<div class="rc-datesrow">'
      +'<span>OPENING DATE: <strong>'+esc(fmtDate(term.start_date))+'</strong></span>'
      +'<span>CLOSING DATE: <strong>'+esc(fmtDate(term.end_date))+'</strong></span>'
      +'</div>';

    var watermark = school.logo_url ? '<div class="rc-watermark" style="background-image:url(\''+esc(school.logo_url).replace(/'/g,"%27")+'\');"></div>' : '';

    var verify = '';
    if (opts.verificationCode){
      var verifyUrl = (typeof window!=="undefined" && window.location ? window.location.origin : "") + "/verify.html?code=" + opts.verificationCode;
      var svg = qrSvg(verifyUrl);
      verify = '<div class="rc-verify">'
        + (svg ? '<div class="rc-verify-qr">'+svg+'</div>' : '')
        + '<div class="rc-verify-text">Verify this report at<br><strong>'+esc(verifyUrl.replace(/^https?:\/\//,""))+'</strong><br>Code: <span class="mono">'+esc(opts.verificationCode)+'</span></div>'
        + '</div>';
    }

    return '<div class="rc-card">'
      + '<div class="rc-stamp'+(stampLabel==="DRAFT"?" rc-stamp-draft":"")+'">'+esc(stampLabel)+'</div>'
      + watermark
      + '<div class="rc-content">'
      +   head + bio + grid + remarks + statusBar + signatures + dates
      +   '<div class="rc-foot2">'+verify+'<span>Generated by Samaji School System · '+esc(genDate)+'</span></div>'
      + '</div>'
      + '</div>';
  }

  var RC_CSS = ''
    +'body{font-family:Georgia,"Times New Roman",serif;background:#fff;margin:0;padding:18px;color:#101626;}'
    +'.rc-card{max-width:740px;margin:0 auto 26px;border:3px double #101626;padding:20px 24px;page-break-after:always;position:relative;overflow:hidden;background:#fff;}'
    +'.rc-content{position:relative;z-index:1;}'
    +'.rc-watermark{position:absolute;inset:70px;background-repeat:no-repeat;background-position:center;background-size:contain;opacity:.07;z-index:0;pointer-events:none;}'
    +'.rc-stamp{position:absolute;top:14px;right:16px;border:1.5px solid #101626;padding:4px 14px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;z-index:2;background:#fff;}'
    +'.rc-stamp-draft{color:#B54708;border-color:#B54708;}'
    +'.rc-govhead{display:flex;align-items:flex-start;gap:12px;border-bottom:2px solid #101626;padding-bottom:10px;margin-bottom:12px;}'
    +'.rc-logo,.rc-coat{flex:none;width:54px;height:54px;display:flex;align-items:center;justify-content:center;}'
    +'.rc-logo img{max-width:100%;max-height:100%;object-fit:contain;}'
    +'.rc-logo-ph{width:48px;height:48px;border-radius:50%;background:#F4F6F8;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:19px;}'
    +'.rc-govtext{flex:1;text-align:center;}'
    +'.rc-ministry{font-size:16px;font-weight:700;letter-spacing:.02em;}'
    +'.rc-dept{font-size:10.5px;font-weight:600;margin-top:2px;}'
    +'.rc-formtitle{font-size:11.5px;font-weight:700;margin-top:7px;text-transform:uppercase;letter-spacing:.02em;}'
    +'.rc-gradeline{font-size:15px;font-weight:700;margin-top:8px;letter-spacing:.06em;}'
    +'.rc-biowrap{display:flex;align-items:flex-start;gap:12px;}'
    +'table.rc-bio2{width:100%;border-collapse:collapse;font-size:12px;margin-bottom:12px;flex:1;}'
    +'table.rc-bio2 td{border-bottom:1px solid #101626;padding:5px 4px;}'
    +'table.rc-bio2 td.k{font-weight:700;width:120px;white-space:nowrap;}'
    +'table.rc-bio2 td.v{padding-left:4px;}'
    +'.rc-photo{flex:none;width:64px;height:78px;border:1px solid #101626;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#F8FAFB;}'
    +'.rc-photo img{width:100%;height:100%;object-fit:cover;}'
    +'.rc-photo-ph{font-size:9px;color:#98A2B3;text-transform:uppercase;}'
    +'table.rc-grid{width:100%;border-collapse:collapse;font-size:10.5px;margin-top:4px;}'
    +'table.rc-grid th,table.rc-grid td{border:1px solid #101626;padding:4px 3px;text-align:center;}'
    +'table.rc-grid th{font-size:9.5px;font-weight:700;background:#F4F6F8;line-height:1.3;}'
    +'.rc-actcol{width:150px;}'
    +'td.rc-actname{text-align:left;font-weight:700;padding-left:6px;white-space:nowrap;}'
    +'.rc-check{font-weight:700;font-size:12px;}'
    +'tr.rc-totalrow td,tr.rc-avgrow td{font-weight:700;background:#FAFBFC;}'
    +'td.rc-rowlabel{text-align:left;font-weight:700;padding-left:6px;text-transform:uppercase;white-space:nowrap;font-size:9.5px;}'
    +'td.rc-totalcell{font-size:11px;}'
    +'.rc-remarksbox{margin-top:14px;border:1px solid #101626;padding:8px 10px;min-height:56px;}'
    +'.rc-remarks-label{font-size:10px;font-weight:700;margin-bottom:6px;}'
    +'.rc-remarks-text{font-size:12px;line-height:1.7;min-height:34px;}'
    +'.rc-statusbar{display:flex;justify-content:space-between;margin-top:10px;font-size:11px;font-weight:700;text-transform:uppercase;}'
    +'table.rc-signtable{width:100%;border-collapse:collapse;font-size:11px;margin-top:16px;}'
    +'table.rc-signtable td{padding:9px 4px 4px;vertical-align:bottom;}'
    +'td.rc-signlabel{white-space:nowrap;font-weight:600;}'
    +'td.rc-signline{border-bottom:1px solid #101626;min-width:90px;}'
    +'td.rc-datefilled{border-bottom:1px solid #101626;font-weight:700;padding-left:6px;}'
    +'.rc-datesrow{display:flex;justify-content:space-between;margin-top:16px;font-size:11.5px;font-weight:700;}'
    +'.rc-foot2{margin-top:16px;display:flex;align-items:center;justify-content:center;gap:14px;text-align:center;font-size:9px;color:#667085;}'
    +'.rc-verify{display:flex;align-items:center;gap:8px;text-align:left;}'
    +'.rc-verify-qr svg{display:block;width:44px;height:44px;}'
    +'.rc-verify-text{font-size:8.5px;line-height:1.5;}'
    +'.rc-verify-text .mono{font-family:"Courier New",monospace;font-weight:700;color:#101626;}'
    +'@page{ size:A4 portrait; margin:10mm; }'
    +'@media print{ body{padding:0;} .rc-card{page-break-after:always;border:2px double #101626;box-shadow:none;} }';

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
