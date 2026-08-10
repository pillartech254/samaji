// ============================================================
//  School Portal — Dashboard (command-center rewrite).
//
//  Reuses existing services rather than re-deriving them:
//    - window.SamajiCache   (assets/idb-cache.js)      whole-table reads
//    - window.SamajiCharts  (assets/school-plus.js)    bar/donut/legend
//    - window.SamajiAcademics.loadAcademicContext       current year/term
//    - the same billed/paid fee formula school-plus.js's Fees screen uses
//      (kept as an independent copy inside loadFinance()/renderFinanceFromData()
//      below rather than refactoring that screen's internals under this
//      change — it handles real money and is already tested).
//
//  Entry point: window.SchoolDashboard.render(sb, schoolId, el, ctx)
//    ctx = { flags, schoolName, openModule, showReports }
//
//  Every section renders its own skeleton immediately, then fills in
//  independently as its own (small, targeted) query resolves — a slow
//  or failed panel never blocks the others. Nothing here re-fetches
//  the full row set just to show a count: anything that's purely a
//  number uses a head:true exact count.
// ============================================================
(function () {
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function money(n){ return "KES " + Number(n||0).toLocaleString(); }
  function pct1(a,b){ return b>0 ? Math.round((a/b)*1000)/10 : null; }
  function todayISO(){ return new Date().toISOString().slice(0,10); }
  function clamp(n,lo,hi){ return Math.max(lo,Math.min(hi,n)); }
  function timeAgo(iso){
    var ms = Date.now() - new Date(iso).getTime();
    if (ms < 0) ms = 0;
    var m = Math.floor(ms/60000);
    if (m < 1) return "just now";
    if (m < 60) return m + " min ago";
    var h = Math.floor(m/60);
    if (h < 24) return h + (h===1?" hour ago":" hours ago");
    var d = Math.floor(h/24);
    return d + (d===1?" day ago":" days ago");
  }
  var LEVEL_ORDER = ["PP1","PP2","Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12"];
  function levelSort(a,b){ var ia=LEVEL_ORDER.indexOf(a),ib=LEVEL_ORDER.indexOf(b); return (ia<0?99:ia)-(ib<0?99:ib); }

  function statCard(lbl,val,bg,ink,ic,sub,drillFlag){
    return '<div class="stat"'+(drillFlag?' data-drill="'+drillFlag+'" style="cursor:pointer;"':'')+'>'
      +'<div class="ic" style="background:'+bg+';color:'+ink+'">'+ic+'</div>'
      +'<div class="lbl">'+esc(lbl)+'</div><div class="val">'+val+'</div>'
      +(sub?'<div class="muted" style="font-size:11.5px;margin-top:4px;">'+sub+'</div>':'')
      +(drillFlag?'<div class="drill-hint"><svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>':'')
      +'</div>';
  }
  function skelCard(){ return '<div class="stat"><div class="skel" style="height:14px;width:50%;margin-bottom:10px;"></div><div class="skel" style="height:26px;width:70%;"></div></div>'; }
  function panelSkel(lines){
    lines = lines||3;
    var rows=''; for (var i=0;i<lines;i++) rows += '<div class="skel" style="height:13px;margin-top:'+(i?10:0)+'px;width:'+(90-i*8)+'%;"></div>';
    return '<div class="panel">'+rows+'</div>';
  }
  function errBox(title, msg, retryFn){
    var id = "err-"+Math.random().toString(36).slice(2);
    setTimeout(function(){ var b=document.getElementById(id); if(b&&retryFn) b.onclick=retryFn; },0);
    return '<div class="panel"><strong style="font-size:14px;">'+esc(title)+'</strong>'
      +'<p class="muted" style="font-size:12.5px;margin:6px 0 10px;">'+esc(msg)+'</p>'
      +(retryFn?'<button class="btn-sm" id="'+id+'">Retry</button>':'')+'</div>';
  }

  var ICONS = {
    students:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3.2" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="17" cy="9" r="2.4" stroke="currentColor" stroke-width="1.6"/></svg>',
    check:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M8 12l2.5 2.5L16 9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    money:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.8"/></svg>',
    alert:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 3l9 16H3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 9v4M12 16h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    staff:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    library:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5c.8 0 1.5-.7 1.5-1.5v-13z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    clock:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  async function render(sb, schoolId, el, ctx){
    var FLAGS = ctx.flags||{};
    var schoolName = ctx.schoolName||schoolId;
    var openModule = ctx.openModule||function(){};
    var showReports = ctx.showReports||function(){};

    el.innerHTML =
      '<div class="mod-head"><div><h2>Dashboard</h2><p id="dash-sub">Live overview of '+esc(schoolName)+'.</p></div>'
      + '<div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">'
      + '<div id="dash-term-wrap"></div>'
      + (FLAGS["module.students"]?'<div class="field"><label>Class</label><select id="dash-class"><option value="">All classes</option></select></div>':'')
      + '</div></div>'
      + '<div class="statgrid" id="dash-kpis">'+skelCard()+skelCard()+skelCard()+skelCard()+skelCard()+'</div>'
      + '<div id="dash-pulse" style="margin-top:18px;">'+panelSkel(1)+'</div>'
      + '<div class="cardrow c2" style="margin-top:18px;"><div id="dash-finance">'+panelSkel(4)+'</div><div id="dash-attention">'+panelSkel(4)+'</div></div>'
      + '<div class="cardrow c2" style="margin-top:18px;"><div id="dash-academic">'+panelSkel(4)+'</div><div id="dash-attendance">'+panelSkel(4)+'</div></div>'
      + '<div class="cardrow c2" style="margin-top:18px;"><div id="dash-payments">'+panelSkel(4)+'</div><div id="dash-upcoming">'+panelSkel(4)+'</div></div>'
      + '<div id="dash-activity" style="margin-top:18px;">'+panelSkel(4)+'</div>'
      + '<div class="cardrow c2" id="dash-charts" style="margin-top:18px;display:none;"></div>'
      + '<div style="display:flex;align-items:baseline;justify-content:space-between;margin-top:24px;"><h2 style="margin:0;font-size:15px;">Your modules</h2><span class="muted" style="font-size:12.5px;" id="dash-mod-count"></span></div>'
      + '<div class="tiles" id="dash-tiles" style="margin-top:13px;"></div>';

    // ---- shared state, filled in progressively by independent loaders ----
    var PULSE = {}; // attendancePct, feePct, academicPct, defaulters, overdueBooks, lowAttendance, pendingMarks, stuckTx, unpaidLibCharges
    var allStudents = [];
    var currentClassFilter = "";
    var dashAttendanceRows = null, dashFeeData = null;

    // ---------------------------------------------------------
    //  SCHOOL PULSE + ATTENTION REQUIRED — recomputed every time a
    //  contributing loader finishes, so both fill in progressively
    //  instead of waiting on every single data source.
    // ---------------------------------------------------------
    function renderPulse(){
      var box = document.getElementById("dash-pulse");
      if (!box) return;
      var parts = [];
      if (PULSE.attendancePct!=null) parts.push({label:"Attendance",value:PULSE.attendancePct});
      if (PULSE.feePct!=null) parts.push({label:"Fees collected",value:PULSE.feePct});
      if (PULSE.academicPct!=null) parts.push({label:"Academic average",value:PULSE.academicPct});
      var issues = 0;
      if (PULSE.defaulters) issues += 1;
      if (PULSE.overdueBooks) issues += 1;
      if (PULSE.pendingMarks) issues += 1;
      if (PULSE.lowAttendance) issues += 1;
      if (PULSE.stuckTx) issues += 1;
      if (PULSE.unpaidLibCharges) issues += 1;
      if (PULSE.noStructurePaid) issues += 1;

      var worstPct = parts.length ? Math.min.apply(null, parts.map(function(p){return p.value;})) : null;
      var dot = "🟢", label = "School operating normally";
      if (worstPct!=null && worstPct < 60) { dot="🔴"; label="Attention needed — figures below target"; }
      else if ((worstPct!=null && worstPct < 80) || issues >= 3) { dot="🟡"; label="Mostly on track — a few things need a look"; }

      if (!parts.length && !issues) {
        box.innerHTML = '<div class="panel"><span class="muted" style="font-size:13px;">Enable Attendance, Fees or Academics to see a live school pulse here.</span></div>';
        return;
      }
      box.innerHTML = '<div class="panel" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">'
        + '<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:19px;">'+dot+'</span><strong style="font-size:14px;">'+label+'</strong></div>'
        + '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);">'
        + parts.map(function(p){ return '<span><strong style="color:var(--ink);">'+p.value+'%</strong> '+esc(p.label)+'</span>'; }).join('')
        + '</div>'
        + (issues ? '<span class="pill amber" style="white-space:nowrap;">⚠ '+issues+' item'+(issues>1?'s':'')+' need'+(issues>1?'':'s')+' attention</span>' : '<span class="pill green">✓ No critical issues</span>')
        + '</div>';
    }

    function renderAttention(){
      var box = document.getElementById("dash-attention");
      if (!box) return;
      var items = [];
      if (PULSE.defaulters) items.push({dot:"🔴", text: PULSE.defaulters + " student"+(PULSE.defaulters>1?"s have":" has")+" overdue fee balances", link:"View students →", flag:"module.finance"});
      if (PULSE.lowAttendance) items.push({dot:"🟠", text: PULSE.lowAttendance + " absent today ("+PULSE.absentPctToday+"% of marked attendance)", link:"View attendance →", flag:"module.attendance"});
      if (PULSE.pendingMarks) items.push({dot:"🟠", text: PULSE.pendingMarks + " mark sheet"+(PULSE.pendingMarks>1?"s":"")+" not yet published this term", link:"View report cards →", flag:"module.academics"});
      if (PULSE.overdueBooks) items.push({dot:"🟡", text: PULSE.overdueBooks + " library book"+(PULSE.overdueBooks>1?"s are":" is")+" overdue", link:"View library →", flag:"module.library"});
      if (PULSE.unpaidLibCharges) items.push({dot:"🟡", text: PULSE.unpaidLibCharges + " unpaid lost-book charge"+(PULSE.unpaidLibCharges>1?"s":""), link:"View library →", flag:"module.library"});
      if (PULSE.stuckTx) items.push({dot:"🟡", text: PULSE.stuckTx + " M-Pesa/KCB transaction"+(PULSE.stuckTx>1?"s":"")+" stuck pending", link:"View fees →", flag:"module.finance"});
      if (PULSE.noStructurePaid) items.push({dot:"🟡", text: PULSE.noStructurePaid + " student"+(PULSE.noStructurePaid>1?"s have":" has")+" fee payments recorded but no fee structure for their class", link:"View fees →", flag:"module.finance"});

      var loadedCount = [PULSE.defaultersLoaded,PULSE.lowAttendanceLoaded,PULSE.pendingMarksLoaded,PULSE.libraryLoaded,PULSE.txLoaded].filter(Boolean).length;
      var expected = [FLAGS["module.finance"],FLAGS["module.attendance"],FLAGS["module.academics"],FLAGS["module.library"],FLAGS["module.finance"]].filter(Boolean).length;

      var html = '<div class="panel"><strong style="font-size:15px;">Attention required</strong>';
      if (!items.length) {
        html += loadedCount < expected
          ? '<div style="margin-top:12px;"><div class="skel" style="height:13px;width:80%;"></div></div>'
          : '<p class="muted" style="font-size:13px;margin-top:10px;">✓ No critical issues requiring attention.</p>';
      } else {
        html += '<div style="margin-top:10px;display:flex;flex-direction:column;gap:10px;">'
          + items.map(function(it){
              return '<div class="attn-row" data-flag="'+it.flag+'" style="cursor:pointer;padding:9px 11px;border:1px solid var(--line);border-radius:9px;display:flex;justify-content:space-between;align-items:center;gap:10px;">'
                + '<span style="font-size:13px;">'+it.dot+' '+esc(it.text)+'</span>'
                + '<span class="muted" style="font-size:11.5px;white-space:nowrap;">'+it.link+'</span></div>';
            }).join('')
          + '</div>';
      }
      html += '</div>';
      box.innerHTML = html;
      box.querySelectorAll("[data-flag]").forEach(function(row){
        row.onclick = function(){ openModule(row.getAttribute("data-flag")); };
      });
    }

    // ---------------------------------------------------------
    //  Academic context (current year/term) — loaded at most ONCE per
    //  dashboard visit and shared by the header badge, Academic
    //  Performance and Upcoming, via one memoized promise. Each of
    //  those three used to call loadAcademicContext() independently,
    //  which — since none of them awaited each other — raced: the
    //  same 4 queries (academic_years+terms, assessment_types,
    //  grading_schemes, teachers) could fire twice concurrently on
    //  every single dashboard load.
    // ---------------------------------------------------------
    var academicContextPromise = null;
    function getAcademicContext(){
      if (!FLAGS["module.academics"] || !window.SamajiAcademics) return Promise.resolve(null);
      if (!academicContextPromise) academicContextPromise = window.SamajiAcademics.loadAcademicContext(sb, schoolId).catch(function(){ return null; });
      return academicContextPromise;
    }

    // ---------------------------------------------------------
    //  HEADER — current academic year/term (real; falls back to a
    //  plain label if the Academics module isn't licensed).
    // ---------------------------------------------------------
    (async function loadTerm(){
      var wrap = document.getElementById("dash-term-wrap");
      if (!wrap) return;
      var academic = await getAcademicContext();
      if (!academic) { wrap.innerHTML=""; return; }
      if (academic.defaultYear && academic.defaultTerm) {
        wrap.innerHTML = '<span class="pill indigo" style="font-size:12.5px;">'+esc(academic.defaultTerm.name)+' &middot; '+academic.defaultYear.year+'</span>';
      }
    })();

    // ---------------------------------------------------------
    //  STUDENTS + gender/enrollment charts (also feeds the class filter)
    // ---------------------------------------------------------
    async function loadStudents(){
      if (!FLAGS["module.students"]) { renderKpi("students", null); return; }
      try {
        allStudents = window.SamajiCache ? await window.SamajiCache.get(sb, schoolId, "students", "*") : ((await sb.from("students").select("*").eq("school_id",schoolId)).data||[]);
        var classSel = document.getElementById("dash-class");
        if (classSel) {
          var levels = Array.from(new Set(allStudents.map(function(s){return s.grade;}).filter(Boolean))).sort(levelSort);
          classSel.innerHTML = '<option value="">All classes</option>'+levels.map(function(g){ return '<option value="'+esc(g)+'">'+esc(g)+'</option>'; }).join("");
          classSel.onchange = function(){ currentClassFilter = classSel.value; redrawForClassFilter(); };
        }
        redrawForClassFilter();
        drawEnrollmentCharts();
      } catch(e){ renderKpi("students", "err"); }
    }

    function scopedStudents(){
      return currentClassFilter ? allStudents.filter(function(s){ return s.grade===currentClassFilter; }) : allStudents;
    }

    function redrawForClassFilter(){
      var students = scopedStudents();
      var active = students.filter(function(s){ return s.status!=="inactive"; }).length;
      renderKpi("students", {
        val: students.length,
        sub: active + " active" + (students.length!==active ? " · "+(students.length-active)+" inactive" : "")
      });
      // Class filter also re-scopes attendance-today and finance, if already loaded.
      if (dashAttendanceRows) renderAttendanceFromRows(dashAttendanceRows);
      if (dashFeeData) renderFinanceFromData(dashFeeData);
      drawEnrollmentCharts();
    }

    function drawEnrollmentCharts(){
      var box = document.getElementById("dash-charts");
      var C = window.SamajiCharts;
      if (!box || !C || !allStudents.length) return;
      var students = scopedStudents();
      var byLevel = {}; students.forEach(function(s){ var lv=s.grade||"Unassigned"; byLevel[lv]=(byLevel[lv]||0)+1; });
      var ld = Object.keys(byLevel).sort(levelSort).map(function(k){ return {label:k.replace("Grade ","G"), value:byLevel[k]}; });
      var male=students.filter(function(s){return s.gender==="M";}).length;
      var female=students.filter(function(s){return s.gender==="F";}).length;
      var other=students.length-male-female;
      var gd=[{label:"Male",value:male,color:"#4F46E5"},{label:"Female",value:female,color:"#EC4899"}]; if(other>0) gd.push({label:"Other",value:other,color:"#94A3B8"});
      box.style.display = "";
      box.innerHTML =
        '<div class="chartcard" data-drill="reports" style="cursor:pointer;"><div class="ch-head"><h3>Enrollment by class</h3><span class="muted" style="font-size:11.5px;">View report →</span></div>'+(ld.length?C.bar(ld,{height:170}):'<div class="empty">No students yet.</div>')+'</div>'
        + '<div class="chartcard" data-drill="reports" style="cursor:pointer;"><div class="ch-head"><h3>Gender split</h3><span class="muted" style="font-size:11.5px;">View report →</span></div><div style="display:flex;align-items:center;gap:20px;"><div>'+C.donut(gd,{center:"Students",size:130})+'</div><div style="flex:1;">'+C.legend(gd)+'</div></div></div>';
      box.querySelectorAll("[data-drill]").forEach(function(c){ c.onclick=function(){ showReports(); }; });
    }

    // ---------------------------------------------------------
    //  TODAY'S ATTENDANCE
    // ---------------------------------------------------------
    async function loadAttendanceToday(){
      if (!FLAGS["module.attendance"]) { renderKpi("attendance", null); return; }
      try {
        var r = await sb.from("attendance").select("student_id,status").eq("school_id",schoolId).eq("on_date",todayISO());
        dashAttendanceRows = r.data||[];
        renderAttendanceFromRows(dashAttendanceRows);
      } catch(e){
        renderKpi("attendance","err");
        var p = document.getElementById("dash-attendance");
        if (p) p.innerHTML = errBox("Today's Attendance","Unable to load attendance.",loadAttendanceToday);
      }
    }
    function renderAttendanceFromRows(rows){
      var students = scopedStudents();
      var studentIds = currentClassFilter ? {} : null;
      if (studentIds) students.forEach(function(s){ studentIds[s.id]=true; });
      var scoped = studentIds ? rows.filter(function(r){ return studentIds[r.student_id]; }) : rows;
      var present=0, absent=0, late=0;
      scoped.forEach(function(r){ if(r.status==="present") present++; else if(r.status==="absent") absent++; else if(r.status==="late") late++; });
      var marked = scoped.length;
      var attPct = marked>0 ? pct1(present+late, marked) : null; // "present" for the day = present or late-but-in

      renderKpi("attendance", marked>0 ? { val: attPct+"%", sub: present+" present · "+absent+" absent · "+late+" late" } : { val: "—", sub: "Not taken yet today" });

      PULSE.attendancePct = attPct;
      PULSE.lowAttendance = marked>0 && absent>0 && pct1(absent,marked) >= 15 ? absent : 0;
      PULSE.absentPctToday = marked>0 ? pct1(absent,marked) : 0;
      PULSE.lowAttendanceLoaded = true;
      renderPulse(); renderAttention();

      var panel = document.getElementById("dash-attendance");
      if (!panel) return;
      var C = window.SamajiCharts;
      if (marked===0) {
        panel.innerHTML = '<div class="panel"><strong style="font-size:15px;">Today\'s attendance</strong><p class="muted" style="font-size:13px;margin-top:10px;">No attendance records have been recorded today.</p><button class="btn-sm" id="dash-goto-att" style="margin-top:6px;">Go to Attendance</button></div>';
        var b=document.getElementById("dash-goto-att"); if(b) b.onclick=function(){ openModule("module.attendance"); };
        return;
      }
      var dd=[{label:"Present",value:present,color:"#0E9384"},{label:"Absent",value:absent,color:"#D92D20"},{label:"Late",value:late,color:"#E65100"}];
      panel.innerHTML = '<div class="panel" data-drill="module.attendance" style="cursor:pointer;">'
        + '<div style="display:flex;justify-content:space-between;align-items:baseline;"><strong style="font-size:15px;">Today\'s attendance</strong><span class="muted" style="font-size:11.5px;">View attendance →</span></div>'
        + '<div style="display:flex;align-items:center;gap:18px;margin-top:12px;">'+(C?C.donut(dd,{center:attPct+"%",size:120}):'')+'<div style="flex:1;">'+(C?C.legend(dd):'')+'</div></div>'
        + '</div>';
      panel.querySelector("[data-drill]").onclick = function(){ openModule("module.attendance"); };
    }

    // ---------------------------------------------------------
    //  FINANCE — same billed/paid formula as the Fees & Invoicing
    //  screen (assets/school-plus.js renderFeesV2); kept as its own
    //  copy here deliberately rather than refactoring that screen's
    //  internals for this change, since it handles real money and is
    //  already tested — the formula is copied faithfully, not
    //  reinvented.
    // ---------------------------------------------------------
    async function loadFinance(){
      if (!FLAGS["module.finance"]) { renderKpi("collected",null); renderKpi("outstanding",null); return; }
      try {
        var cache = window.SamajiCache;
        var structures = cache ? await cache.get(sb,schoolId,"fee_structures","*, fee_items(amount)") : ((await sb.from("fee_structures").select("*, fee_items(amount)").eq("school_id",schoolId)).data||[]);
        var payments = cache ? await cache.get(sb,schoolId,"fee_payments","*") : ((await sb.from("fee_payments").select("*").eq("school_id",schoolId)).data||[]);
        dashFeeData = { structures:structures, payments:payments };
        renderFinanceFromData(dashFeeData);
      } catch(e){
        renderKpi("collected","err"); renderKpi("outstanding","err");
        var f = document.getElementById("dash-finance");
        if (f) f.innerHTML = errBox("Fees Collection","Unable to load financial data.",loadFinance);
        var p = document.getElementById("dash-payments");
        if (p) p.innerHTML = errBox("Recent Payments","Unable to load payments.",loadFinance);
      }
    }
    function renderFinanceFromData(data){
      var students = scopedStudents();
      var studentIds = {}; students.forEach(function(s){ studentIds[s.id]=true; });
      var totalByLevel = {}; data.structures.forEach(function(s){ totalByLevel[s.level]=(totalByLevel[s.level]||0)+(s.fee_items||[]).reduce(function(a,i){return a+Number(i.amount);},0); });
      function billedFor(s){ return s?((totalByLevel[s.grade]||0)+(Number(s.opening_balance)||0)):0; }
      function tuitionOf(p){ return Number(p.amount)-(Number(p.transport_amount)||0); }

      var scopedPayments = currentClassFilter ? data.payments.filter(function(p){ return studentIds[p.student_id]; }) : data.payments;
      var paidByStudent = {}; scopedPayments.forEach(function(p){ paidByStudent[p.student_id]=(paidByStudent[p.student_id]||0)+tuitionOf(p); });

      // Students with real payments but no fee structure for their grade
      // (billedFor()===0) inflate "collected" with nothing to bill it
      // against — left unflagged that reads as ">100% collected", which
      // looks broken rather than telling you what actually needs fixing
      // (a missing/misconfigured fee structure for their class).
      var billedTotal=0, collected=0, defaulters=0, noStructureCount=0, noStructurePaid=0;
      students.forEach(function(s){
        var billed=billedFor(s), paid=paidByStudent[s.id]||0;
        billedTotal+=billed;
        if (billed>0 && paid<billed) defaulters++;
        if (billed===0 && paid>0) { noStructureCount++; noStructurePaid+=paid; }
      });
      collected = scopedPayments.reduce(function(a,p){ return a+tuitionOf(p); },0);
      var outstanding = Math.max(0, billedTotal-collected);
      var collectionPct = pct1(collected, billedTotal);

      renderKpi("collected", { val: money(collected), sub: billedTotal>0 ? ("of "+money(billedTotal)+" billed · "+collectionPct+"%") : "no fee structure yet" });
      renderKpi("outstanding", { val: money(outstanding), sub: defaulters + " student"+(defaulters!==1?"s":"")+" with balances" });

      // Feeds School Pulse's "fees collected" figure — capped at 100 so an
      // unstructured-payment distortion (see above) can't drag the whole
      // pulse status into "operating normally" territory on a fluke, or
      // display a nonsensical >100% next to Attendance/Academic there.
      PULSE.feePct = billedTotal>0 ? clamp(collectionPct,0,100) : null;
      PULSE.defaulters = defaulters;
      PULSE.noStructurePaid = noStructureCount;
      PULSE.defaultersLoaded = true;
      renderPulse(); renderAttention();

      var today = todayISO();
      var todaysPayments = data.payments.filter(function(p){ return (p.paid_at||"").slice(0,10)===today; });
      var todayTotal = todaysPayments.reduce(function(a,p){ return a+Number(p.amount); },0);
      var byMethod = {}; todaysPayments.forEach(function(p){ byMethod[p.method||"Other"]=(byMethod[p.method||"Other"]||0)+Number(p.amount); });

      var fBox = document.getElementById("dash-finance");
      if (fBox) {
        var overCollected = collected > billedTotal;
        var barPct = clamp(collectionPct||0,0,100);
        fBox.innerHTML = '<div class="panel" data-drill="module.finance" style="cursor:pointer;">'
          + '<div style="display:flex;justify-content:space-between;align-items:baseline;"><strong style="font-size:15px;">Fees collection</strong><span class="muted" style="font-size:11.5px;">View finance →</span></div>'
          + (billedTotal>0
            ? '<div style="font-size:22px;font-weight:700;margin-top:10px;">'+money(collected)+' <span class="muted" style="font-size:13px;font-weight:500;">collected</span></div>'
              + '<div style="background:var(--line);border-radius:20px;height:9px;margin-top:9px;overflow:hidden;"><div style="background:#0E9384;height:100%;width:'+barPct+'%;border-radius:20px;"></div></div>'
              + (overCollected
                ? '<div class="muted" style="font-size:11.5px;margin-top:5px;">Fully collected against '+money(billedTotal)+' billed'+(noStructureCount>0?' — '+money(noStructurePaid)+' of that is from '+noStructureCount+' student'+(noStructureCount>1?'s':'')+' with no fee structure assigned (see below)':'')+'</div>'
                : '<div class="muted" style="font-size:11.5px;margin-top:5px;">'+collectionPct+'% of '+money(billedTotal)+' expected &middot; '+money(outstanding)+' outstanding</div>')
            : '<p class="muted" style="font-size:13px;margin-top:10px;">No fee structure configured yet.</p>')
          + '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line);">'
          + '<div class="muted" style="font-size:11.5px;text-transform:uppercase;letter-spacing:.03em;">Today\'s collection</div>'
          + '<div style="font-size:18px;font-weight:700;margin-top:3px;">'+money(todayTotal)+'</div>'
          + (Object.keys(byMethod).length ? '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:6px;">'+Object.keys(byMethod).map(function(m){ return '<span class="muted" style="font-size:11.5px;">'+esc(m)+' <strong style="color:var(--ink);">'+money(byMethod[m])+'</strong></span>'; }).join('')+'</div>' : '<div class="muted" style="font-size:11.5px;margin-top:4px;">No payments today yet.</div>')
          + '</div></div>';
        fBox.querySelector("[data-drill]").onclick = function(){ openModule("module.finance"); };
      }

      var pBox = document.getElementById("dash-payments");
      if (pBox) {
        var recent = data.payments.slice().sort(function(a,b){ return new Date(b.paid_at)-new Date(a.paid_at); }).slice(0,6);
        var nameOf = {}; allStudents.forEach(function(s){ nameOf[s.id]=s.first_name+" "+s.last_name; });
        pBox.innerHTML = '<div class="panel">'
          + '<div style="display:flex;justify-content:space-between;align-items:baseline;"><strong style="font-size:15px;">Recent payments</strong>'+(recent.length?'<span class="muted" style="font-size:11.5px;cursor:pointer;" data-drill="module.finance">View all →</span>':'')+'</div>'
          + (recent.length
            ? '<div style="margin-top:10px;display:flex;flex-direction:column;gap:9px;">' + recent.map(function(p){
                return '<div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;">'
                  + '<span>'+esc(nameOf[p.student_id]||"—")+'</span>'
                  + '<span style="display:flex;gap:8px;align-items:center;"><span class="pill gray" style="font-size:10.5px;">'+esc(p.method||"—")+'</span><strong style="color:#067647;">'+money(p.amount)+'</strong></span></div>';
              }).join('') + '</div>'
            : '<p class="muted" style="font-size:13px;margin-top:10px;">No payments recorded yet.</p>')
          + '</div>';
        var d = pBox.querySelector("[data-drill]"); if (d) d.onclick=function(){ openModule("module.finance"); };
      }
    }

    // ---------------------------------------------------------
    //  STAFF — no staff-attendance data exists in the schema, so
    //  this shows the most useful real staff metric available
    //  (active headcount) rather than fabricating present/absent.
    // ---------------------------------------------------------
    async function loadStaff(){
      if (!FLAGS["module.payroll"]) { renderKpi("staff", null); return; }
      try {
        var r = await sb.from("staff").select("id",{count:"exact",head:true}).eq("school_id",schoolId).eq("active",true);
        renderKpi("staff", { val: r.count||0, sub: "Active staff on payroll" });
      } catch(e){ renderKpi("staff","err"); }
    }

    // ---------------------------------------------------------
    //  LIBRARY alerts (overdue loans, unpaid lost-book charges)
    // ---------------------------------------------------------
    async function loadLibraryAlerts(){
      if (!FLAGS["module.library"]) { PULSE.libraryLoaded = true; renderAttention(); return; }
      try {
        var today = todayISO();
        var overdueRes = await sb.from("library_loans").select("id",{count:"exact",head:true}).eq("school_id",schoolId).eq("status","active").lt("due_date",today);
        var chargesRes = await sb.from("library_charges").select("id",{count:"exact",head:true}).eq("school_id",schoolId).eq("status","unpaid");
        PULSE.overdueBooks = overdueRes.count||0;
        PULSE.unpaidLibCharges = chargesRes.count||0;
      } catch(e){ PULSE.overdueBooks = 0; PULSE.unpaidLibCharges = 0; }
      PULSE.libraryLoaded = true;
      renderAttention();
    }

    // ---------------------------------------------------------
    //  STUCK M-PESA / KCB TRANSACTIONS (reconciliation flag) —
    //  real, from the payment tables built alongside those
    //  integrations; a transaction pending >30 min is worth a look.
    // ---------------------------------------------------------
    async function loadTxAlerts(){
      if (!FLAGS["module.finance"]) { PULSE.txLoaded = true; renderAttention(); return; }
      try {
        var cutoff = new Date(Date.now()-30*60000).toISOString();
        var mR = await sb.from("mpesa_transactions").select("id",{count:"exact",head:true}).eq("school_id",schoolId).eq("status","pending").lt("created_at",cutoff);
        var kR = await sb.from("kcb_transactions").select("id",{count:"exact",head:true}).eq("school_id",schoolId).eq("status","pending").lt("created_at",cutoff);
        PULSE.stuckTx = (mR.count||0)+(kR.count||0);
      } catch(e){ PULSE.stuckTx = 0; }
      PULSE.txLoaded = true;
      renderAttention();
    }

    // ---------------------------------------------------------
    //  ACADEMIC PERFORMANCE — reuses the exact same frozen
    //  report_cards.overall_average source as the Academic
    //  Analytics trend chart (assets/school-academics.js), so the
    //  dashboard figure always agrees with that screen.
    // ---------------------------------------------------------
    async function loadAcademicPerformance(){
      if (!FLAGS["module.academics"]) return;
      var box = document.getElementById("dash-academic");
      try {
        var academic = await getAcademicContext();
        if (!academic || !academic.defaultTerm) {
          if (box) box.innerHTML = '<div class="panel"><strong style="font-size:15px;">Academic performance</strong><p class="muted" style="font-size:13px;margin-top:10px;">No academic year/term configured yet.</p></div>';
          return;
        }
        var rc = await sb.from("report_cards").select("overall_average,class_label").eq("school_id",schoolId).eq("term_id",academic.defaultTerm.id);
        var rows = (rc.data||[]).filter(function(r){ return r.overall_average!=null; });

        var pendingRes = await sb.from("mark_sheets").select("id",{count:"exact",head:true}).eq("school_id",schoolId).eq("term_id",academic.defaultTerm.id).neq("status","published");
        PULSE.pendingMarks = pendingRes.count||0;
        PULSE.pendingMarksLoaded = true;
        renderAttention();

        if (!rows.length) {
          if (box) box.innerHTML = '<div class="panel"><strong style="font-size:15px;">Academic performance</strong><p class="muted" style="font-size:13px;margin-top:10px;">No report cards generated yet for '+esc(academic.defaultTerm.name)+'. Marks may still be in progress.</p></div>';
          PULSE.academicPct = null;
          renderPulse();
          return;
        }
        var overall = Math.round(rows.reduce(function(a,r){return a+r.overall_average;},0)/rows.length*10)/10;
        var byClass = {}; rows.forEach(function(r){ var k=r.class_label||"—"; byClass[k]=byClass[k]||{sum:0,n:0}; byClass[k].sum+=r.overall_average; byClass[k].n++; });
        var classBars = Object.keys(byClass).sort(levelSort).map(function(k){ return {label:k, value: Math.round(byClass[k].sum/byClass[k].n*10)/10}; });

        PULSE.academicPct = overall;
        renderPulse();

        if (box) {
          var C = window.SamajiCharts;
          box.innerHTML = '<div class="panel" data-drill="module.analytics" style="cursor:pointer;">'
            + '<div style="display:flex;justify-content:space-between;align-items:baseline;"><strong style="font-size:15px;">Academic performance — '+esc(academic.defaultTerm.name)+'</strong><span class="muted" style="font-size:11.5px;">View analytics →</span></div>'
            + '<div style="font-size:24px;font-weight:700;margin-top:8px;">'+overall+'%<span class="muted" style="font-size:12px;font-weight:500;margin-left:6px;">school average</span></div>'
            + (classBars.length && C ? '<div style="margin-top:10px;">'+C.bar(classBars,{height:150,fmt:function(v){return v+"%";}})+'</div>' : '')
            + '</div>';
          box.querySelector("[data-drill]").onclick = function(){ openModule("module.analytics"); };
        }
      } catch(e){
        if (box) box.innerHTML = errBox("Academic Performance","Unable to load academic analytics.",loadAcademicPerformance);
      }
    }

    // ---------------------------------------------------------
    //  UPCOMING — real future exam dates + current term end date.
    //  No generic events/meetings table exists, so nothing beyond
    //  this is fabricated.
    // ---------------------------------------------------------
    async function loadUpcoming(){
      var box = document.getElementById("dash-upcoming");
      if (!box) return;
      if (!FLAGS["module.exams"]) { box.innerHTML=''; return; }
      try {
        var today = todayISO();
        var r = await sb.from("exams").select("name,subject,term,exam_date").eq("school_id",schoolId).gte("exam_date",today).order("exam_date").limit(6);
        var items = (r.data||[]).map(function(x){ return { date:x.exam_date, label:x.name+" — "+x.subject }; });
        var academic = await getAcademicContext();
        if (academic && academic.defaultTerm && academic.defaultTerm.end_date && academic.defaultTerm.end_date>=today) {
          items.push({ date: academic.defaultTerm.end_date, label: academic.defaultTerm.name+" ends" });
        }
        items.sort(function(a,b){ return a.date<b.date?-1:1; });
        box.innerHTML = '<div class="panel">'
          + '<div style="display:flex;justify-content:space-between;align-items:baseline;"><strong style="font-size:15px;">Upcoming</strong>'+(items.length?'<span class="muted" style="font-size:11.5px;cursor:pointer;" data-drill="module.exams">View exams →</span>':'')+'</div>'
          + (items.length
            ? '<div style="margin-top:10px;display:flex;flex-direction:column;gap:9px;">'+items.slice(0,6).map(function(it){
                return '<div style="display:flex;justify-content:space-between;font-size:13px;"><span>'+esc(it.label)+'</span><span class="muted" style="font-size:11.5px;">'+new Date(it.date).toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"})+'</span></div>';
              }).join('')+'</div>'
            : '<p class="muted" style="font-size:13px;margin-top:10px;">No upcoming exams scheduled.</p>')
          + '</div>';
        var d = box.querySelector("[data-drill]"); if (d) d.onclick=function(){ openModule("module.exams"); };
      } catch(e){ box.innerHTML = errBox("Upcoming","Unable to load upcoming exams.",loadUpcoming); }
    }

    // ---------------------------------------------------------
    //  RECENT ACTIVITY — a human-readable feed built from real,
    //  already-timestamped rows (payments, enrollments, library
    //  loans). Deliberately NOT the audit_log table: that's a
    //  security trail of raw before/after JSON on sensitive tables
    //  (fee_payments, students, profiles, schools, mpesa_config),
    //  meant for incident investigation — surfacing its diffs on a
    //  dashboard would leak more than an activity feed should.
    // ---------------------------------------------------------
    async function loadRecentActivity(){
      var box = document.getElementById("dash-activity");
      if (!box) return;
      try {
        var jobs = [];
        if (FLAGS["module.finance"]) jobs.push(sb.from("fee_payments").select("student_id,amount,method,paid_at").eq("school_id",schoolId).order("paid_at",{ascending:false}).limit(4).then(function(r){ return (r.data||[]).map(function(p){ return {t:p.paid_at, text:"Fee payment "+money(p.amount)+" via "+(p.method||"—")}; }); }));
        if (FLAGS["module.students"]) jobs.push(sb.from("students").select("first_name,last_name,created_at").eq("school_id",schoolId).order("created_at",{ascending:false}).limit(3).then(function(r){ return (r.data||[]).map(function(s){ return {t:s.created_at, text:"Student enrolled — "+s.first_name+" "+s.last_name}; }); }));
        if (FLAGS["module.library"]) jobs.push(sb.from("library_loans").select("created_at, library_books(title)").eq("school_id",schoolId).order("created_at",{ascending:false}).limit(3).then(function(r){ return (r.data||[]).map(function(l){ return {t:l.created_at, text:"Book issued — "+(l.library_books?l.library_books.title:"—")}; }); }));
        var results = await Promise.all(jobs);
        var events = [].concat.apply([], results).filter(function(e){ return e.t; });
        events.sort(function(a,b){ return new Date(b.t)-new Date(a.t); });
        events = events.slice(0,8);
        box.innerHTML = '<div class="panel"><strong style="font-size:15px;">Recent activity</strong>'
          + (events.length
            ? '<div style="margin-top:10px;display:flex;flex-direction:column;gap:9px;">'+events.map(function(e){
                return '<div style="display:flex;justify-content:space-between;font-size:13px;"><span>✓ '+esc(e.text)+'</span><span class="muted" style="font-size:11.5px;white-space:nowrap;">'+timeAgo(e.t)+'</span></div>';
              }).join('')+'</div>'
            : '<p class="muted" style="font-size:13px;margin-top:10px;">No recent activity yet.</p>')
          + '</div>';
      } catch(e){ box.innerHTML = errBox("Recent Activity","Unable to load recent activity.",loadRecentActivity); }
    }

    // ---------------------------------------------------------
    //  KPI grid — built once flags are known, filled progressively.
    // ---------------------------------------------------------
    var KPI_DEFS = [
      { key:"students",   lbl:"Students",         bg:"#EEF0FF", ink:"#4F46E5", ic:ICONS.students, flag:"module.students",   drill:"module.students" },
      { key:"attendance", lbl:"Today's attendance",bg:"#ECFDF3", ink:"#067647", ic:ICONS.check,    flag:"module.attendance", drill:"module.attendance" },
      { key:"collected",  lbl:"Fees collected",   bg:"#FFF6ED", ink:"#C2410C", ic:ICONS.money,    flag:"module.finance",    drill:"module.finance" },
      { key:"outstanding",lbl:"Fees outstanding", bg:"#FEF1F0", ink:"#B42318", ic:ICONS.alert,    flag:"module.finance",    drill:"module.finance" },
      { key:"staff",      lbl:"Staff",            bg:"#F1ECFE", ink:"#6D28D9", ic:ICONS.staff,    flag:"module.payroll",    drill:"module.payroll" }
    ];
    function buildKpiSkeleton(){
      var grid = document.getElementById("dash-kpis");
      var visible = KPI_DEFS.filter(function(d){ return FLAGS[d.flag]; });
      if (!visible.length) { grid.innerHTML = '<div class="empty" style="grid-column:1/-1;">Enable Students, Attendance, Fees or Payroll to see live figures here.</div>'; return; }
      // Tagged with data-kpi so renderKpi() can find and replace each one
      // in place once its real data arrives, instead of appending a
      // duplicate card next to an orphaned skeleton.
      grid.innerHTML = visible.map(function(d){ return skelCard().replace('<div class="stat">', '<div class="stat" data-kpi="'+d.key+'">'); }).join('');
    }
    function renderKpi(key, payload){
      var def = KPI_DEFS.find(function(d){ return d.key===key; });
      if (!def || !FLAGS[def.flag]) return;
      var grid = document.getElementById("dash-kpis");
      if (!grid) return;
      var existing = grid.querySelector('[data-kpi="'+key+'"]');
      var html;
      if (payload==="err") {
        html = '<div class="stat" data-kpi="'+key+'"><div class="ic" style="background:'+def.bg+';color:'+def.ink+'">'+def.ic+'</div><div class="lbl">'+esc(def.lbl)+'</div><div class="val" style="font-size:14px;color:var(--muted);">Unavailable</div></div>';
      } else if (payload==null) {
        return; // module not licensed — never rendered
      } else {
        html = statCard(def.lbl, payload.val, def.bg, def.ink, def.ic, payload.sub, def.drill);
        html = html.replace('<div class="stat"', '<div class="stat" data-kpi="'+key+'"');
      }
      var wrapper = document.createElement("div"); wrapper.innerHTML = html;
      var node = wrapper.firstElementChild;
      if (existing) existing.replaceWith(node); else grid.appendChild(node);
      var drillEl = node.hasAttribute("data-drill") ? node : null;
      if (drillEl) drillEl.onclick = function(){ openModule(def.drill); };
    }
    buildKpiSkeleton();

    // ---- module tiles (kept, shrunk — sidebar already navigates) ----
    var granted = Object.keys(FLAGS).filter(function(k){ return FLAGS[k]; });
    document.getElementById("dash-mod-count").textContent = granted.length+" enabled";
    var tiles = document.getElementById("dash-tiles");
    granted.forEach(function(k){
      var m = window.metaFor(k), b = document.createElement("button"); b.className = "modtile";
      b.innerHTML = '<span class="tile" style="background:'+m.tint+';color:'+m.ink+'">'+m.icon+'</span><div style="font-size:13px;font-weight:600;">'+m.name+'</div>';
      b.onclick = function(){ openModule(k); };
      tiles.appendChild(b);
    });

    // ---- kick everything off in parallel — nothing here blocks anything else ----
    loadStudents();
    loadAttendanceToday();
    loadFinance();
    loadStaff();
    loadLibraryAlerts();
    loadTxAlerts();
    loadAcademicPerformance();
    loadUpcoming();
    loadRecentActivity();
  }

  window.SchoolDashboard = { render: render };
})();
