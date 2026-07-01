// ============================================================
//  Teacher Portal tab renderers.
//  Each renderer: async (sb, ctx, el) => void
//  ctx = { schoolId, school, teacher, flags }
//  Registered on window.TeacherModules.
// ============================================================
(function () {
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function money(n){ return "KES " + Number(n||0).toLocaleString(); }

  // The Teacher Portal doesn't load school-plus.js (that's where the School
  // Portal's toast UI lives), so it needs its own — same #sm-toasts/.sm-toast
  // markup and CSS classes (already shared via styles.css) for a consistent look.
  var TICONS={
    ok:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M8 12.5l2.5 2.5L16 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    err:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 7v6M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    "":'<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };
  function smToast(msg, type){
    type = type || "";
    // On mobile, a still-focused score input keeps the on-screen keyboard open,
    // which can cover a bottom-anchored toast entirely. Blurring first dismisses
    // the keyboard immediately so the toast is actually visible.
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    var wrap = document.getElementById("sm-toasts");
    if (!wrap){ wrap = document.createElement("div"); wrap.id = "sm-toasts"; document.body.appendChild(wrap); }
    var t = document.createElement("div"); t.className = "sm-toast " + type;
    t.innerHTML = '<span class="ti">'+(TICONS[type]||TICONS[""])+'</span><span>'+esc(msg)+'</span>';
    wrap.appendChild(t);
    setTimeout(function(){ t.classList.add("out"); setTimeout(function(){ t.remove(); }, 260); }, 2800);
  }
  if (!window.SM_toast) window.SM_toast = smToast;
  function toast(t){ window.SM_toast(t, /error|fail|required|invalid/i.test(t)?"err":"ok"); }
  function classLabel(c){ if(!c) return "—"; return c.level + (c.stream ? " "+c.stream : ""); }
  function uniq(arr){ return Array.from(new Set(arr)); }

  // Every screen needs "which classes/subjects am I assigned to" — load once.
  async function loadMyAssignments(sb, ctx){
    var r = await sb.from("class_subject_teachers")
      .select("class_id, subject_id, school_classes(id,level,stream), subjects(id,name)")
      .eq("teacher_id", ctx.teacher.id);
    return r.data || [];
  }
  function myClasses(assignments){
    var seen={}, out=[];
    assignments.forEach(function(a){
      if(!a.school_classes || seen[a.class_id]) return;
      seen[a.class_id]=true; out.push(a.school_classes);
    });
    return out.sort(function(x,y){ return classLabel(x) < classLabel(y) ? -1 : 1; });
  }

  // ====================================================
  //  DASHBOARD
  // ====================================================
  async function renderDashboard(sb, ctx, el){
    el.innerHTML = '<div class="mod-head"><div><h2>Dashboard</h2><p>Overview of your classes at '+esc(ctx.school.name||"")+'.</p></div></div>'
      + '<div class="statgrid" id="dash-stats"></div>'
      + '<div class="cardrow" style="margin-top:18px;"><div class="panel" style="width:100%;"><strong style="font-size:14px;">My Classes &amp; Subjects</strong><div id="dash-classes" style="margin-top:12px;"></div></div></div>';

    var assignments = await loadMyAssignments(sb, ctx);
    var classIds = uniq(assignments.map(function(a){ return a.class_id; }));
    var students = [];
    if (classIds.length){
      var sr = await sb.from("students").select("id,class_id").eq("school_id",ctx.schoolId).eq("status","active").in("class_id",classIds);
      students = sr.data || [];
    }
    var marked=0, absent=0;
    if (students.length){
      var today = new Date().toISOString().slice(0,10);
      var ar = await sb.from("attendance").select("student_id,status").eq("school_id",ctx.schoolId).eq("on_date",today).in("student_id",students.map(function(s){return s.id;}));
      (ar.data||[]).forEach(function(a){ marked++; if(a.status==="absent") absent++; });
    }
    function stat(lbl,val,bg,ink){ return '<div class="stat"><div class="ic" style="background:'+bg+';color:'+ink+';"></div><div class="lbl">'+lbl+'</div><div class="val">'+val+'</div></div>'; }
    $set("dash-stats",
      stat("My classes", classIds.length, "#EEF0FF", "#4F46E5")
      + stat("My students", students.length, "#ECFDF3", "#067647")
      + stat("Marked today", marked, "#FFF6ED", "#C2410C")
      + stat("Absent today", absent, "#FEF3F2", "#B42318"));

    var box = document.getElementById("dash-classes");
    if (!assignments.length){
      box.innerHTML = '<div class="empty">No classes assigned yet. Ask your school admin to assign you in Settings.</div>';
    } else {
      box.innerHTML = '<table class="data"><thead><tr><th>Class</th><th>Subject</th></tr></thead><tbody>'
        + assignments.map(function(a){ return '<tr><td style="font-weight:600;color:#1A1D26;">'+esc(classLabel(a.school_classes))+'</td><td>'+esc(a.subjects?a.subjects.name:"—")+'</td></tr>'; }).join("")
        + '</tbody></table>';
    }
  }
  function $set(id, html){ var e=document.getElementById(id); if(e) e.innerHTML = html; }

  // ====================================================
  //  ATTENDANCE  (scoped to the teacher's own classes)
  // ====================================================
  async function renderAttendance(sb, ctx, el){
    var assignments = await loadMyAssignments(sb, ctx);
    var classes = myClasses(assignments);
    var today = new Date().toISOString().slice(0,10);
    if (!classes.length){ el.innerHTML='<div class="mod-head"><div><h2>Attendance</h2></div></div><div class="empty">No classes assigned yet. Ask your school admin to assign you in Settings.</div>'; return; }

    el.innerHTML = '<div class="mod-head"><div><h2>Attendance</h2><p>Mark daily attendance for your classes.</p></div></div>'
      + '<div class="toolbar">'
      + '<div class="field"><label>Class</label><select id="att-class">'+classes.map(function(c){ return '<option value="'+c.id+'">'+esc(classLabel(c))+'</option>'; }).join("")+'</select></div>'
      + '<div class="field"><label>Date</label><input type="date" id="att-date" value="'+today+'"></div>'
      + '<div style="flex:1;"></div><span class="muted" id="att-summary" style="font-size:12.5px;"></span>'
      + '<button class="btn-primary" id="att-save">Save register</button></div>'
      + '<div id="att-table"></div>';

    var students=[], marks={};
    async function load(){
      var classId = document.getElementById("att-class").value;
      var sr = await sb.from("students").select("*").eq("school_id",ctx.schoolId).eq("class_id",classId).eq("status","active").order("first_name");
      students = sr.data||[];
      marks={};
      var d = document.getElementById("att-date").value;
      if (students.length){
        var r = await sb.from("attendance").select("*").eq("school_id",ctx.schoolId).eq("on_date",d).in("student_id",students.map(function(s){return s.id;}));
        (r.data||[]).forEach(function(a){ marks[a.student_id]=a.status; });
      }
      draw();
    }
    function draw(){
      var t=document.getElementById("att-table");
      if (!students.length){ t.innerHTML='<div class="empty">No active students in this class yet.</div>'; document.getElementById("att-summary").textContent=""; return; }
      var present=0;
      var html='<table class="data"><thead><tr><th>Name</th><th style="text-align:right;">Status</th></tr></thead><tbody>';
      students.forEach(function(s){
        var st = marks[s.id]||"present"; if(st==="present") present++;
        html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(s.first_name+" "+s.last_name)+'</td>'
          +'<td style="text-align:right;"><select class="att-status" data-stu="'+s.id+'">'
          +['present','absent','late'].map(function(o){ return '<option value="'+o+'"'+(st===o?" selected":"")+'>'+o+'</option>'; }).join("")
          +'</select></td></tr>';
      });
      html+='</tbody></table>';
      t.innerHTML=html;
      document.getElementById("att-summary").textContent = students.length+" students · "+present+" present so far";
    }
    document.getElementById("att-class").onchange=load;
    document.getElementById("att-date").onchange=load;
    document.getElementById("att-save").onclick=async function(){
      var d = document.getElementById("att-date").value;
      var payload=[];
      document.querySelectorAll(".att-status").forEach(function(sel){ payload.push({ school_id:ctx.schoolId, student_id:sel.getAttribute("data-stu"), on_date:d, status:sel.value }); });
      if (!payload.length){ toast("No students to save."); return; }
      var r = await sb.from("attendance").upsert(payload,{ onConflict:"student_id,on_date" });
      if (r.error){ toast("Error: "+r.error.message); return; }
      toast("Register saved for "+d); load();
    };
    load();
  }

  // ====================================================
  //  MARKS & GRADING  (scoped to the teacher's own class+subject pairs)
  //  Weighted CBC assessment grid: assessment types are columns, the
  //  Total/Grade are computed live via assets/grading.js as the teacher
  //  types, then saved as mark_sheets + exams + exam_results.
  // ====================================================
  async function renderGrading(sb, ctx, el){
    var assignments = await loadMyAssignments(sb, ctx);
    if (!assignments.length){ el.innerHTML='<div class="mod-head"><div><h2>Marks &amp; Grading</h2></div></div><div class="empty">No classes/subjects assigned yet. Ask your school admin to assign you in Settings.</div>'; return; }
    var pairs = assignments.filter(function(a){ return a.school_classes && a.subjects; });
    if (!pairs.length){ el.innerHTML='<div class="mod-head"><div><h2>Marks &amp; Grading</h2></div></div><div class="empty">No subjects assigned yet. Ask your school admin to assign you in Settings.</div>'; return; }

    var ayRes = await sb.from("academic_years").select("*, terms(*)").eq("school_id",ctx.schoolId).order("year",{ascending:false});
    var years = ayRes.data||[];
    if (!years.length){ el.innerHTML='<div class="mod-head"><div><h2>Marks &amp; Grading</h2></div></div><div class="empty">No academic year set up yet. Ask your school admin to set one up in Settings → CBC Assessment.</div>'; return; }
    years.forEach(function(y){ y.terms = (y.terms||[]).slice().sort(function(a,b){ return a.sort-b.sort; }); });

    var atRes = await sb.from("assessment_types").select("*").eq("school_id",ctx.schoolId).order("name");
    var allTypes = atRes.data||[];
    var schemeRes = await sb.from("grading_schemes").select("*, grading_levels(*)").eq("school_id",ctx.schoolId);
    var schemes = schemeRes.data||[];

    var defaultYear = years.find(function(y){ return y.status==="active"; }) || years[0];
    var defaultTerm = defaultYear.terms.find(function(t){ return t.status==="active"; }) || defaultYear.terms[0];

    el.innerHTML = '<div class="mod-head"><div><h2>Marks &amp; Grading</h2><p>Enter scores per assessment type — the weighted total and grade update automatically.</p></div></div>'
      + '<div class="toolbar">'
      + '<div class="field"><label>Class &amp; subject</label><select id="gb-pair">'+pairs.map(function(a,i){ return '<option value="'+i+'">'+esc(classLabel(a.school_classes))+' — '+esc(a.subjects.name)+'</option>'; }).join("")+'</select></div>'
      + '<div class="field"><label>Academic year</label><select id="gb-year">'+years.map(function(y){ return '<option value="'+y.id+'"'+(y.id===defaultYear.id?" selected":"")+'>'+y.year+'</option>'; }).join("")+'</select></div>'
      + '<div class="field"><label>Term</label><select id="gb-term"></select></div>'
      + '<div style="flex:1;"></div><button class="btn-primary indigo" id="gb-save">Save scores</button></div>'
      + '<div id="gb-grid"></div>';

    function populateTerms(){
      var year = years.find(function(y){ return y.id===document.getElementById("gb-year").value; });
      var sel = document.getElementById("gb-term");
      sel.innerHTML = (year.terms||[]).map(function(t){ return '<option value="'+t.id+'"'+(defaultTerm && t.id===defaultTerm.id?" selected":"")+'>'+esc(t.name)+'</option>'; }).join("");
      if (!year.terms.length) sel.innerHTML = '<option value="">No terms yet</option>';
    }
    populateTerms();

    var state = { pair:null, year:null, term:null, students:[], types:[], scheme:null, markSheet:null, scores:{} };

    async function load(){
      var pair = pairs[Number(document.getElementById("gb-pair").value)];
      var year = years.find(function(y){ return y.id===document.getElementById("gb-year").value; });
      var termId = document.getElementById("gb-term").value;
      var term = termId ? year.terms.find(function(t){ return t.id===termId; }) : null;
      var grid = document.getElementById("gb-grid");
      if (!term){ grid.innerHTML='<div class="empty">This academic year has no terms yet.</div>'; return; }

      var classLevel = pair.school_classes.level;
      var types = window.SamajiGrading.typesForGrade(allTypes, classLevel);
      var scheme = window.SamajiGrading.schemeForGrade(schemes, classLevel);

      var stuRes = await sb.from("students").select("*").eq("school_id",ctx.schoolId).eq("class_id",pair.class_id).eq("status","active").order("first_name");
      var students = stuRes.data||[];

      var scores = {};
      var msRes = await sb.from("mark_sheets").select("*").eq("class_id",pair.class_id).eq("subject_id",pair.subject_id).eq("term_id",term.id).eq("academic_year_id",year.id).maybeSingle();
      var markSheet = msRes.data;
      if (markSheet && students.length){
        var exRes = await sb.from("exams").select("id,assessment_type_id").eq("mark_sheet_id",markSheet.id);
        var exams = exRes.data||[];
        if (exams.length){
          var typeByExam = {}; exams.forEach(function(e){ typeByExam[e.id]=e.assessment_type_id; });
          var resRes = await sb.from("exam_results").select("*").in("exam_id",exams.map(function(e){return e.id;}));
          (resRes.data||[]).forEach(function(r){
            scores[r.student_id] = scores[r.student_id] || {};
            scores[r.student_id][typeByExam[r.exam_id]] = r.score;
          });
        }
      }
      state = { pair:pair, year:year, term:term, students:students, types:types, scheme:scheme, markSheet:markSheet, scores:scores };
      draw();
    }

    function rowTotalAndLevel(sid){
      var row = state.scores[sid]||{};
      var scoreArr = state.types.map(function(t){ return { assessment_type_id:t.id, score: row[t.id] }; });
      var total = window.SamajiGrading.weightedTotal(scoreArr, state.types);
      var levels = state.scheme ? (state.scheme.grading_levels||[]) : [];
      var lvl = total==null ? null : window.SamajiGrading.levelFor(levels, total);
      return { total:total, lvl:lvl };
    }
    function badgeHTML(lvl){
      if (!lvl) return '<span class="muted">—</span>';
      var c = lvl.color || "#475467";
      return '<span class="pill" style="background:'+c+'22;color:'+c+';">'+esc(lvl.grade_label || lvl.competency_code || "—")+'</span>';
    }

    function draw(){
      var grid = document.getElementById("gb-grid");
      if (!state.students.length){ grid.innerHTML='<div class="empty">No active students in this class.</div>'; return; }
      if (!state.types.length){ grid.innerHTML='<div class="empty">No assessment types configured for '+esc(state.pair.school_classes.level)+' yet. Ask your school admin to add some in Settings → CBC Assessment.</div>'; return; }
      var html='<div style="overflow-x:auto;"><table class="data" style="min-width:'+(480+state.types.length*100)+'px;"><thead><tr><th>Name</th>'
        + state.types.map(function(t){ return '<th style="text-align:right;">'+esc(t.name)+'<div class="muted" style="font-size:10px;font-weight:500;">/'+t.max_marks+' · '+t.weight_percent+'%</div></th>'; }).join("")
        + '<th style="text-align:right;">Total</th><th>Grade</th></tr></thead><tbody>';
      state.students.forEach(function(s){
        var row = state.scores[s.id]||{};
        var tl = rowTotalAndLevel(s.id);
        html+='<tr data-row="'+s.id+'"><td style="font-weight:600;color:#1A1D26;white-space:nowrap;">'+esc(s.first_name+" "+s.last_name)+'</td>'
          + state.types.map(function(t){ var v=row[t.id]; return '<td style="text-align:right;"><input class="gb-score" type="number" min="0" max="'+t.max_marks+'" data-stu="'+s.id+'" data-type="'+t.id+'" value="'+(v!=null?v:"")+'" style="width:64px;text-align:right;"></td>'; }).join("")
          + '<td class="gb-total" style="text-align:right;font-weight:700;">'+(tl.total==null?'<span class="muted">—</span>':tl.total)+'</td>'
          + '<td class="gb-grade">'+badgeHTML(tl.lvl)+'</td></tr>';
      });
      html+='</tbody></table></div>';
      grid.innerHTML = html;
      grid.querySelectorAll(".gb-score").forEach(function(inp){
        inp.oninput = function(){
          var sid = inp.getAttribute("data-stu"), tid = inp.getAttribute("data-type");
          state.scores[sid] = state.scores[sid] || {};
          state.scores[sid][tid] = inp.value === "" ? null : Number(inp.value);
          var tl = rowTotalAndLevel(sid);
          var tr = grid.querySelector('tr[data-row="'+sid+'"]');
          tr.querySelector(".gb-total").innerHTML = tl.total==null ? '<span class="muted">—</span>' : tl.total;
          tr.querySelector(".gb-grade").innerHTML = badgeHTML(tl.lvl);
        };
      });
    }

    document.getElementById("gb-pair").onchange=load;
    document.getElementById("gb-year").onchange=function(){ populateTerms(); load(); };
    document.getElementById("gb-term").onchange=load;
    document.getElementById("gb-save").onclick=async function(){
      if (!state.students.length || !state.types.length) return;
      var markSheet = state.markSheet;
      if (!markSheet){
        var ins = await sb.from("mark_sheets").insert({ school_id:ctx.schoolId, class_id:state.pair.class_id, subject_id:state.pair.subject_id,
          term_id:state.term.id, academic_year_id:state.year.id, teacher_id:ctx.teacher.id, status:"draft" }).select().single();
        if (ins.error){ toast("Error: "+ins.error.message); return; }
        markSheet = ins.data; state.markSheet = markSheet;
      }
      var exRes = await sb.from("exams").select("id,assessment_type_id").eq("mark_sheet_id",markSheet.id);
      var examByType = {}; (exRes.data||[]).forEach(function(e){ examByType[e.assessment_type_id]=e.id; });
      var missing = state.types.filter(function(t){ return !examByType[t.id]; });
      if (missing.length){
        var newExams = missing.map(function(t){ return { school_id:ctx.schoolId, name:t.name, subject:state.pair.subjects.name, subject_id:state.pair.subject_id,
          class_id:state.pair.class_id, teacher_id:ctx.teacher.id, term:state.term.name, term_id:state.term.id, academic_year_id:state.year.id,
          max_score:t.max_marks, mark_sheet_id:markSheet.id, assessment_type_id:t.id }; });
        var insEx = await sb.from("exams").insert(newExams).select();
        if (insEx.error){ toast("Error: "+insEx.error.message); return; }
        (insEx.data||[]).forEach(function(e){ examByType[e.assessment_type_id]=e.id; });
      }
      var levels = state.scheme ? (state.scheme.grading_levels||[]) : [];
      var payload = [];
      document.querySelectorAll(".gb-score").forEach(function(inp){
        if (inp.value==="") return;
        var tid=inp.getAttribute("data-type"), sid=inp.getAttribute("data-stu"), examId=examByType[tid];
        if (!examId) return;
        var type = state.types.find(function(t){ return t.id===tid; });
        var score = Number(inp.value);
        var pct = (score/(type.max_marks||100))*100;
        var lvl = window.SamajiGrading.levelFor(levels, pct);
        payload.push({ school_id:ctx.schoolId, exam_id:examId, student_id:sid, score:score,
          grade: lvl ? (lvl.grade_label || lvl.competency_code) : null, remarks: lvl ? lvl.remark : null });
      });
      if (!payload.length){ toast("Enter at least one score."); return; }
      var r = await sb.from("exam_results").upsert(payload, { onConflict:"exam_id,student_id" });
      if (r.error){ toast("Error: "+r.error.message); return; }
      toast("Saved "+payload.length+" score"+(payload.length===1?"":"s")+" for "+state.pair.subjects.name+" · "+state.term.name);
      load();
    };
    load();
  }

  // ====================================================
  //  REPORT BOOKS  (real KICD-style colored report cards, built from
  //  Marks & Grading's weighted totals + learner ratings/remarks)
  // ====================================================
  async function renderReportBooks(sb, ctx, el){
    var assignments = await loadMyAssignments(sb, ctx);
    var classes = myClasses(assignments);
    var ctRes = await sb.from("school_classes").select("*").eq("class_teacher_id", ctx.teacher.id);
    (ctRes.data||[]).forEach(function(c){ if(!classes.some(function(x){return x.id===c.id;})) classes.push(c); });
    classes.sort(function(a,b){ return classLabel(a) < classLabel(b) ? -1 : 1; });
    if (!classes.length){ el.innerHTML='<div class="mod-head"><div><h2>Report Books</h2></div></div><div class="empty">No classes assigned yet. Ask your school admin to assign you in Settings.</div>'; return; }

    var ayRes = await sb.from("academic_years").select("*, terms(*)").eq("school_id",ctx.schoolId).order("year",{ascending:false});
    var years = ayRes.data||[];
    if (!years.length){ el.innerHTML='<div class="mod-head"><div><h2>Report Books</h2></div></div><div class="empty">No academic year set up yet. Ask your school admin to set one up in Settings → CBC Assessment.</div>'; return; }
    years.forEach(function(y){ y.terms=(y.terms||[]).slice().sort(function(a,b){return a.sort-b.sort;}); });

    var atRes = await sb.from("assessment_types").select("*").eq("school_id",ctx.schoolId);
    var allTypes = atRes.data||[];
    var schemeRes = await sb.from("grading_schemes").select("*, grading_levels(*)").eq("school_id",ctx.schoolId);
    var schemes = schemeRes.data||[];
    var teachersRes = await sb.from("teachers").select("id,name").eq("school_id",ctx.schoolId);
    var teacherNameById = {}; (teachersRes.data||[]).forEach(function(t){ teacherNameById[t.id]=t.name; });

    var defaultYear = years.find(function(y){ return y.status==="active"; }) || years[0];
    var defaultTerm = defaultYear.terms.find(function(t){ return t.status==="active"; }) || defaultYear.terms[defaultYear.terms.length-1];
    var isPublisherRole = ctx.teacher.school_position==="principal" || ctx.teacher.school_position==="deputy_principal";

    el.innerHTML = '<div class="mod-head"><div><h2>Report Books</h2><p>Real, colored CBC report cards — pulling live from Marks &amp; Grading.</p></div><button class="btn-primary" id="rb-print">Print all</button></div>'
      + '<div class="toolbar">'
      + '<div class="field"><label>Class</label><select id="rb-class">'+classes.map(function(c){ return '<option value="'+c.id+'">'+esc(classLabel(c))+'</option>'; }).join("")+'</select></div>'
      + '<div class="field"><label>Academic year</label><select id="rb-year">'+years.map(function(y){ return '<option value="'+y.id+'"'+(y.id===defaultYear.id?" selected":"")+'>'+y.year+'</option>'; }).join("")+'</select></div>'
      + '<div class="field"><label>Reporting term</label><select id="rb-term"></select></div>'
      + '</div><div id="rb-table"></div>';

    function populateTerms(){
      var year = years.find(function(y){ return y.id===document.getElementById("rb-year").value; });
      var sel = document.getElementById("rb-term");
      sel.innerHTML = year.terms.map(function(t){ return '<option value="'+t.id+'"'+(defaultTerm && t.id===defaultTerm.id?" selected":"")+'>'+esc(t.name)+'</option>'; }).join("");
      if (!year.terms.length) sel.innerHTML = '<option value="">No terms yet</option>';
    }
    populateTerms();

    var current = { cls:null, year:null, term:null, termsUpTo:[], students:[], subjects:[], types:[], scheme:null, levels:[],
      termScoreFor:function(){ return null; }, ratingsByStudent:{}, remarksByStudent:{}, attByStudent:{}, isClassTeacher:false, isPublisher:false };

    async function load(){
      var classId = document.getElementById("rb-class").value;
      var cls = classes.find(function(c){ return c.id===classId; });
      var year = years.find(function(y){ return y.id===document.getElementById("rb-year").value; });
      var termId = document.getElementById("rb-term").value;
      var term = termId ? year.terms.find(function(t){ return t.id===termId; }) : null;
      var t = document.getElementById("rb-table");
      if (!term){ t.innerHTML='<div class="empty">This academic year has no terms yet.</div>'; return; }
      var termsUpTo = year.terms.filter(function(x){ return x.sort<=term.sort; });

      var csr = await sb.from("class_subjects").select("subjects(id,name)").eq("class_id",classId);
      var subjects = (csr.data||[]).map(function(x){ return x.subjects; }).filter(Boolean).sort(function(a,b){ return a.name<b.name?-1:1; });

      var sr = await sb.from("students").select("*").eq("school_id",ctx.schoolId).eq("class_id",classId).eq("status","active").order("first_name");
      var students = sr.data||[];
      var studentIds = students.map(function(s){ return s.id; });

      var types = window.SamajiGrading.typesForGrade(allTypes, cls.level);
      var scheme = window.SamajiGrading.schemeForGrade(schemes, cls.level);
      var levels = scheme ? (scheme.grading_levels||[]) : [];

      var msRes = await sb.from("mark_sheets").select("*").eq("class_id",classId).eq("academic_year_id",year.id);
      var markSheets = msRes.data||[];
      var msByKey = {}; markSheets.forEach(function(m){ msByKey[m.subject_id+"|"+m.term_id]=m.id; });
      var msIds = markSheets.map(function(m){ return m.id; });

      var examsByMs = {}, typeByExam = {};
      if (msIds.length){
        var exRes = await sb.from("exams").select("id,mark_sheet_id,assessment_type_id").in("mark_sheet_id",msIds);
        (exRes.data||[]).forEach(function(e){ (examsByMs[e.mark_sheet_id]=examsByMs[e.mark_sheet_id]||[]).push(e); typeByExam[e.id]=e.assessment_type_id; });
      }
      var resultsByExam = {};
      var allExamIds = Object.keys(typeByExam);
      if (allExamIds.length && studentIds.length){
        var resRes = await sb.from("exam_results").select("exam_id,student_id,score").in("exam_id",allExamIds).in("student_id",studentIds);
        (resRes.data||[]).forEach(function(r){ (resultsByExam[r.exam_id]=resultsByExam[r.exam_id]||{})[r.student_id]=r.score; });
      }
      function termScoreFor(subjectId, termId2, studentId){
        var msId = msByKey[subjectId+"|"+termId2];
        if (!msId) return null;
        var exams = examsByMs[msId]||[];
        var scoreArr = exams.map(function(e){ return { assessment_type_id:e.assessment_type_id, score:(resultsByExam[e.id]||{})[studentId] }; });
        return window.SamajiGrading.weightedTotal(scoreArr, types);
      }

      var ratingsByStudent = {};
      if (studentIds.length){
        var ratingsRes = await sb.from("learner_ratings").select("*").in("student_id",studentIds).eq("term_id",term.id).eq("academic_year_id",year.id);
        (ratingsRes.data||[]).forEach(function(r){
          ratingsByStudent[r.student_id] = ratingsByStudent[r.student_id] || { competency:{}, value:{}, psychomotor:{} };
          ratingsByStudent[r.student_id][r.category][r.item_name] = r.level_code;
        });
      }
      var remarksByStudent = {};
      if (studentIds.length){
        var remarksRes = await sb.from("report_remarks").select("*").in("student_id",studentIds).eq("term_id",term.id).eq("academic_year_id",year.id);
        (remarksRes.data||[]).forEach(function(r){ remarksByStudent[r.student_id]=r; });
      }
      var attByStudent = {};
      if (studentIds.length){
        var attQ = sb.from("attendance").select("student_id,status,on_date").eq("school_id",ctx.schoolId).in("student_id",studentIds);
        if (term.start_date) attQ = attQ.gte("on_date",term.start_date);
        if (term.end_date) attQ = attQ.lte("on_date",term.end_date);
        var attRes = await attQ;
        (attRes.data||[]).forEach(function(a){
          attByStudent[a.student_id] = attByStudent[a.student_id] || { daysOpen:0, daysPresent:0, daysAbsent:0 };
          attByStudent[a.student_id].daysOpen++;
          if (a.status==="present") attByStudent[a.student_id].daysPresent++;
          else if (a.status==="absent") attByStudent[a.student_id].daysAbsent++;
        });
      }

      current = { cls:cls, year:year, term:term, termsUpTo:termsUpTo, subjects:subjects, students:students, types:types, scheme:scheme, levels:levels,
        termScoreFor:termScoreFor, ratingsByStudent:ratingsByStudent, remarksByStudent:remarksByStudent, attByStudent:attByStudent,
        isClassTeacher: cls.class_teacher_id===ctx.teacher.id, isPublisher: isPublisherRole };
      draw();
    }

    function subjectRowsFor(studentId){
      return current.subjects.map(function(sub){
        var termScores = current.termsUpTo.map(function(t){ return current.termScoreFor(sub.id, t.id, studentId); });
        var valid = termScores.filter(function(v){ return v!=null; });
        var average = valid.length ? Math.round((valid.reduce(function(a,b){ return a+b; },0)/valid.length)*10)/10 : null;
        var lvl = average==null ? null : window.SamajiGrading.levelFor(current.levels, average);
        return { name:sub.name, termScores:termScores, termNames:current.termsUpTo.map(function(t){ return t.name; }),
          average:average, gradeLabel: lvl && lvl.grade_label, competencyCode: lvl && lvl.competency_code, remark: lvl && lvl.remark };
      });
    }

    function draw(){
      var t=document.getElementById("rb-table");
      if (!current.students.length){ t.innerHTML='<div class="empty">No active students in this class.</div>'; return; }
      if (!current.subjects.length){ t.innerHTML='<div class="empty">No subjects assigned to this class yet — set them in Settings → Classes.</div>'; return; }
      var html='<table class="data"><thead><tr><th>Name</th>'+current.subjects.map(function(s){ return '<th style="text-align:right;">'+esc(s.name)+'</th>'; }).join("")+'<th style="text-align:right;">Overall Avg</th><th></th></tr></thead><tbody>';
      current.students.forEach(function(s){
        var rows = subjectRowsFor(s.id);
        var valid = rows.map(function(r){ return r.average; }).filter(function(v){ return v!=null; });
        var overall = valid.length ? Math.round((valid.reduce(function(a,b){ return a+b; },0)/valid.length)*10)/10 : null;
        html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(s.first_name+" "+s.last_name)+'</td>'
          + rows.map(function(r){ return '<td style="text-align:right;">'+(r.average==null?'<span class="muted">—</span>':r.average)+'</td>'; }).join("")
          + '<td style="text-align:right;font-weight:700;">'+(overall==null?'<span class="muted">—</span>':overall)+'</td>'
          + '<td style="text-align:right;white-space:nowrap;">'+((current.isClassTeacher||current.isPublisher)?'<button class="btn-sm" data-rate="'+s.id+'">Ratings &amp; Remarks</button> ':'')+'<button class="btn-sm" data-print="'+s.id+'">Print</button></td></tr>';
      });
      html+='</tbody></table>';
      t.innerHTML=html;
      t.querySelectorAll("[data-rate]").forEach(function(b){ b.onclick=function(){ ratingsModal(current.students.find(function(s){ return s.id===b.getAttribute("data-rate"); })); }; });
      t.querySelectorAll("[data-print]").forEach(function(b){ b.onclick=function(){ printOne(current.students.find(function(s){ return s.id===b.getAttribute("data-print"); })); }; });
    }

    function levelOptions(selected){
      var codes = Array.from(new Set((current.levels||[]).map(function(l){ return l.competency_code; }).filter(Boolean)));
      return '<option value="">—</option>'+codes.map(function(c){ return '<option value="'+c+'"'+(selected===c?" selected":"")+'>'+c+'</option>'; }).join("");
    }
    function ratingsModal(s){
      var ratings = current.ratingsByStudent[s.id]||{ competency:{}, value:{}, psychomotor:{} };
      var remark = current.remarksByStudent[s.id]||{};
      var canEditRatings = current.isClassTeacher, canEditPrincipal = current.isPublisher;
      function section(title, cat){
        return '<div class="section-h">'+title+'</div>'+window.SamajiReportCard.CATALOG[cat].map(function(name){
          return '<div class="field"><label>'+esc(name)+'</label>'+(canEditRatings
            ? '<select class="rt-lvl" data-cat="'+cat+'" data-name="'+esc(name)+'">'+levelOptions(ratings[cat][name])+'</select>'
            : '<div style="padding:9px 0;font-weight:600;">'+esc(ratings[cat][name]||"—")+'</div>')+'</div>';
        }).join("");
      }
      var m = modal('<h3>Ratings &amp; Remarks — '+esc(s.first_name+" "+s.last_name)+'</h3><p class="muted" style="font-size:12.5px;margin:0 0 8px;">'+esc(current.term.name)+' · '+current.year.year+'</p>'
        + '<div class="grid2">'
        + section("Core Competencies","competency")
        + section("Values","value")
        + section("Psychomotor Skills","psychomotor")
        + '<div class="field full"><label>Teacher\'s remark</label>'+(canEditRatings?'<textarea id="rt-teacher-remark" rows="3" style="width:100%;font-family:inherit;font-size:13px;border:1.5px solid var(--line);border-radius:9px;padding:9px 11px;">'+esc(remark.teacher_remark||"")+'</textarea>':'<div class="muted">'+esc(remark.teacher_remark||"—")+'</div>')+'</div>'
        + '<div class="field full"><label>Head Teacher\'s remark</label>'+(canEditPrincipal?'<textarea id="rt-principal-remark" rows="3" style="width:100%;font-family:inherit;font-size:13px;border:1.5px solid var(--line);border-radius:9px;padding:9px 11px;">'+esc(remark.principal_remark||"")+'</textarea>':'<div class="muted">'+esc(remark.principal_remark||"—")+'</div>')+'</div>'
        + '</div><div class="modal-actions"><button class="btn-sm" id="c">Close</button>'+((canEditRatings||canEditPrincipal)?'<button class="btn-primary" id="sv">Save</button>':'')+'</div>', true);
      m.q("#c").onclick=m.close;
      if (m.q("#sv")) m.q("#sv").onclick=async function(){
        if (canEditRatings){
          var payload=[];
          m.qa(".rt-lvl").forEach(function(sel){ if (sel.value) payload.push({ school_id:ctx.schoolId, student_id:s.id, term_id:current.term.id, academic_year_id:current.year.id, category:sel.getAttribute("data-cat"), item_name:sel.getAttribute("data-name"), level_code:sel.value }); });
          if (payload.length){ var r=await sb.from("learner_ratings").upsert(payload,{ onConflict:"student_id,term_id,academic_year_id,category,item_name" }); if (r.error){ toast("Error: "+r.error.message); return; } }
        }
        var remRec = { school_id:ctx.schoolId, student_id:s.id, term_id:current.term.id, academic_year_id:current.year.id,
          teacher_remark: canEditRatings ? (m.q("#rt-teacher-remark").value.trim()||null) : (remark.teacher_remark||null),
          principal_remark: canEditPrincipal ? (m.q("#rt-principal-remark").value.trim()||null) : (remark.principal_remark||null) };
        var rr = await sb.from("report_remarks").upsert(remRec,{ onConflict:"student_id,term_id,academic_year_id" });
        if (rr.error){ toast("Error: "+rr.error.message); return; }
        m.close(); toast("Saved"); load();
      };
    }

    function reportOpts(s){
      return { school:ctx.school, student:s, classLabel:classLabel(current.cls), classTeacherName: teacherNameById[current.cls.class_teacher_id]||"—",
        term:current.term, academicYear:current.year, subjectRows:subjectRowsFor(s.id), levels:current.levels, attendance:current.attByStudent[s.id],
        ratings:current.ratingsByStudent[s.id]||{}, teacherRemark:(current.remarksByStudent[s.id]||{}).teacher_remark, principalRemark:(current.remarksByStudent[s.id]||{}).principal_remark };
    }
    function printOne(s){
      var html = window.SamajiReportCard.studentReportHTML(reportOpts(s));
      window.SamajiReportCard.printHTML(html, "Report Card — "+s.first_name+" "+s.last_name);
    }

    document.getElementById("rb-class").onchange=load;
    document.getElementById("rb-year").onchange=function(){ populateTerms(); load(); };
    document.getElementById("rb-term").onchange=load;
    document.getElementById("rb-print").onclick=function(){
      if (!current.students.length){ toast("Nothing to print yet."); return; }
      var cards = current.students.map(function(s){ return window.SamajiReportCard.studentReportHTML(reportOpts(s)); }).join("");
      window.SamajiReportCard.printHTML(cards, "Report Books — "+classLabel(current.cls));
    };
    load();
  }

  // ====================================================
  //  MY PAYROLL  (own payslips, selectable by month + P9)
  // ====================================================
  async function renderPayroll(sb, ctx, el){
    el.innerHTML = '<div class="mod-head"><div><h2>My Payroll</h2><p>Your payslips and annual tax deduction card (P9).</p></div></div><div id="pay-body"></div>';
    var sres = await sb.from("staff").select("*").eq("teacher_id",ctx.teacher.id).maybeSingle();
    var staffRow = sres.data;
    var body = document.getElementById("pay-body");
    if (!staffRow){
      body.innerHTML = '<div class="empty">Your payroll record hasn\'t been set up yet. Ask your school admin to link you in Payroll → Staff.</div>';
      return;
    }
    var pres = await sb.from("payslips").select("*, payroll_runs(period,status)").eq("staff_id",staffRow.id);
    var slips = (pres.data||[]).filter(function(p){ return p.payroll_runs; }).sort(function(a,b){ return a.payroll_runs.period < b.payroll_runs.period ? 1 : -1; });

    var tab="slip";
    body.innerHTML = '<div class="toolbar" style="margin-top:0;"><div class="seg" id="pay-tabs"><button data-t="slip" class="on-present">Payslip</button><button data-t="p9">P9 Form</button></div></div><div id="pay-view" style="margin-top:14px;"></div>';
    document.querySelectorAll("#pay-tabs button").forEach(function(b){ b.onclick=function(){ tab=b.getAttribute("data-t"); document.querySelectorAll("#pay-tabs button").forEach(function(x){x.className="";}); b.className="on-present"; draw(); }; });

    function draw(){ if (tab==="slip") drawSlip(); else drawP9(); }

    function drawSlip(){
      var view=document.getElementById("pay-view");
      if (!slips.length){ view.innerHTML='<div class="empty">No payslips yet — ask your admin to run payroll for you.</div>'; return; }
      view.innerHTML = '<div class="toolbar" style="margin-top:0;"><div class="field"><label>Month</label><select id="pay-period">'
        + slips.map(function(p){ return '<option value="'+p.id+'">'+esc(window.SamajiPayslip.periodLabel(p.payroll_runs.period))+'</option>'; }).join("")
        + '</select></div><div style="flex:1;"></div><button class="btn-primary" id="pay-print">Print</button></div>'
        + '<div id="pay-slip" style="margin-top:14px;"></div>';
      function renderSelected(){
        var p = slips.find(function(x){ return x.id===document.getElementById("pay-period").value; });
        document.getElementById("pay-slip").innerHTML = window.SamajiPayslip.slipHTML({ school:ctx.school, staff:staffRow, payslip:p, period:p.payroll_runs.period });
        document.getElementById("pay-print").onclick=function(){
          window.SamajiPayslip.printHTML(document.getElementById("pay-slip").innerHTML, "Payslip — "+(staffRow.full_name||""));
        };
      }
      document.getElementById("pay-period").onchange=renderSelected;
      renderSelected();
    }
    function drawP9(){
      var view=document.getElementById("pay-view");
      var years = uniq(slips.map(function(p){ return p.payroll_runs.period.slice(0,4); })).sort().reverse();
      if (!years.length){ view.innerHTML='<div class="empty">No payslips yet — a P9 needs at least one payroll run.</div>'; return; }
      view.innerHTML = '<div class="toolbar" style="margin-top:0;"><div class="field"><label>Year</label><select id="pay-year">'
        + years.map(function(y){ return '<option value="'+y+'">'+y+'</option>'; }).join("")
        + '</select></div><div style="flex:1;"></div><button class="btn-primary" id="p9-print">Print</button></div>'
        + '<div id="pay-p9" style="margin-top:14px;"></div>';
      function renderYear(){
        var year = document.getElementById("pay-year").value;
        var rows = slips.filter(function(p){ return p.payroll_runs.period.slice(0,4)===year; }).map(function(p){
          var full = window.SamajiPayslip.compute(p.basic, p.house_allowance, p.transport_allowance, p.allowances, p.deduction_lines);
          return { period:p.payroll_runs.period, basic:p.basic, house_allowance:p.house_allowance, transport_allowance:p.transport_allowance,
            allowances:p.allowances, gross:p.gross, nssf:p.nssf, taxable:full.taxable, tax_charged:full.tax_charged, relief:full.relief, paye:p.paye };
        });
        document.getElementById("pay-p9").innerHTML = window.SamajiPayslip.p9HTML({ school:ctx.school, staff:staffRow, year:year, rows:rows });
        document.getElementById("p9-print").onclick=function(){
          window.SamajiPayslip.printHTML(document.getElementById("pay-p9").innerHTML, "P9 — "+(staffRow.full_name||"")+" — "+year);
        };
      }
      document.getElementById("pay-year").onchange=renderYear;
      renderYear();
    }
    draw();
  }

  // ====================================================
  //  PUBLISH RESULTS  (Principal/Deputy Principal only —
  //  gated purely by teachers.school_position, a title, not a login role)
  // ====================================================
  async function renderPublish(sb, ctx, el){
    el.innerHTML = '<div class="mod-head"><div><h2>Publish Results</h2><p>Publishing locks a class &amp; subject\'s marks for that term so the report card can be finalized.</p></div></div><div id="pub-table"></div>';
    var r = await sb.from("mark_sheets").select("*, school_classes(level,stream), subjects(name), terms(name), academic_years(year), teachers(name)").eq("school_id",ctx.schoolId).order("created_at",{ascending:false});
    var rows = r.data||[];
    var t = document.getElementById("pub-table");
    if (!rows.length){ t.innerHTML='<div class="empty">No mark sheets recorded yet.</div>'; return; }
    var html='<table class="data"><thead><tr><th>Class</th><th>Subject</th><th>Term</th><th>Year</th><th>Teacher</th><th>Status</th><th></th></tr></thead><tbody>';
    rows.forEach(function(m){
      var cls = m.school_classes ? (m.school_classes.level+(m.school_classes.stream?" "+m.school_classes.stream:"")) : "—";
      html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(cls)+'</td><td>'+esc(m.subjects?m.subjects.name:"—")+'</td><td>'+esc(m.terms?m.terms.name:"—")+'</td><td>'+(m.academic_years?m.academic_years.year:"—")+'</td>'
        +'<td>'+esc(m.teachers?m.teachers.name:"—")+'</td>'
        +'<td><span class="pill '+(m.status==="published"?"green":"amber")+'">'+esc(m.status)+'</span></td>'
        +'<td style="text-align:right;">'+(m.status==="published"?'<button class="btn-sm" data-unpub="'+m.id+'">Unpublish</button>':'<button class="btn-primary" data-pub="'+m.id+'">Publish</button>')+'</td></tr>';
    });
    html+='</tbody></table>';
    t.innerHTML=html;
    t.querySelectorAll("[data-pub]").forEach(function(b){ b.onclick=async function(){
      var res=await sb.from("mark_sheets").update({ status:"published", published_at:new Date().toISOString(), published_by:ctx.teacher.id }).eq("id",b.getAttribute("data-pub"));
      if (res.error){ toast("Error: "+res.error.message); return; } toast("Published"); renderPublish(sb,ctx,el);
    }; });
    t.querySelectorAll("[data-unpub]").forEach(function(b){ b.onclick=async function(){
      if (!window.confirm("Unpublish this mark sheet? The teacher will be able to edit it again.")) return;
      var res=await sb.from("mark_sheets").update({ status:"draft" }).eq("id",b.getAttribute("data-unpub"));
      if (res.error){ toast("Error: "+res.error.message); return; } toast("Unpublished"); renderPublish(sb,ctx,el);
    }; });
  }

  window.TeacherModules = {
    dashboard: renderDashboard,
    attendance: renderAttendance,
    grading: renderGrading,
    reportbooks: renderReportBooks,
    payroll: renderPayroll,
    publish: renderPublish
  };
})();
