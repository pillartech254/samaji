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
  //  REPORT BOOKS  (per-class printable report cards)
  // ====================================================
  async function renderReportBooks(sb, ctx, el){
    var assignments = await loadMyAssignments(sb, ctx);
    var classes = myClasses(assignments);
    if (!classes.length){ el.innerHTML='<div class="mod-head"><div><h2>Report Books</h2></div></div><div class="empty">No classes assigned yet. Ask your school admin to assign you in Settings.</div>'; return; }

    el.innerHTML = '<div class="mod-head"><div><h2>Report Books</h2><p>Compile subject scores into a printable report card per student.</p></div><button class="btn-primary" id="rb-print">Print report books</button></div>'
      + '<div class="toolbar">'
      + '<div class="field"><label>Class</label><select id="rb-class">'+classes.map(function(c){ return '<option value="'+c.id+'">'+esc(classLabel(c))+'</option>'; }).join("")+'</select></div>'
      + '<div class="field"><label>Term</label><select id="rb-term"><option>Term 1</option><option>Term 2</option><option>Term 3</option></select></div>'
      + '</div><div id="rb-table"></div>';

    var current={ students:[], subjects:[], scores:{} };
    async function load(){
      var classId = document.getElementById("rb-class").value;
      var term = document.getElementById("rb-term").value;
      var cls = classes.find(function(c){ return c.id===classId; });
      var csr = await sb.from("class_subjects").select("subjects(id,name)").eq("class_id",classId);
      var subjects = (csr.data||[]).map(function(x){ return x.subjects; }).filter(Boolean).sort(function(a,b){ return a.name<b.name?-1:1; });
      var sr = await sb.from("students").select("*").eq("school_id",ctx.schoolId).eq("class_id",classId).eq("status","active").order("first_name");
      var students = sr.data||[];
      var scores={};
      if (students.length && subjects.length){
        var gr = await sb.from("grades").select("*").eq("school_id",ctx.schoolId).eq("term",term).in("student_id",students.map(function(s){return s.id;})).in("subject",subjects.map(function(s){return s.name;}));
        (gr.data||[]).forEach(function(g){ scores[g.student_id]=scores[g.student_id]||{}; scores[g.student_id][g.subject]=g.score; });
      }
      current={ students:students, subjects:subjects, scores:scores, cls:cls, term:term };
      draw();
    }
    function avgFor(studentId){
      var row = current.scores[studentId]||{}; var vals = current.subjects.map(function(s){ return row[s.name]; }).filter(function(v){ return v!=null; });
      if (!vals.length) return null;
      return Math.round((vals.reduce(function(a,b){return a+Number(b);},0)/vals.length)*10)/10;
    }
    function draw(){
      var t=document.getElementById("rb-table");
      if (!current.students.length){ t.innerHTML='<div class="empty">No active students in this class.</div>'; return; }
      if (!current.subjects.length){ t.innerHTML='<div class="empty">No subjects assigned to this class yet — set them in Settings → Classes.</div>'; return; }
      var html='<table class="data"><thead><tr><th>Name</th>'+current.subjects.map(function(s){ return '<th style="text-align:right;">'+esc(s.name)+'</th>'; }).join("")+'<th style="text-align:right;">Average</th></tr></thead><tbody>';
      current.students.forEach(function(s){
        var row = current.scores[s.id]||{};
        html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(s.first_name+" "+s.last_name)+'</td>'
          + current.subjects.map(function(sub){ var v=row[sub.name]; return '<td style="text-align:right;">'+(v==null?'<span class="muted">—</span>':v)+'</td>'; }).join("")
          + '<td style="text-align:right;font-weight:700;">'+(avgFor(s.id)==null?"—":avgFor(s.id))+'</td></tr>';
      });
      html+='</tbody></table>';
      t.innerHTML=html;
    }
    document.getElementById("rb-class").onchange=load;
    document.getElementById("rb-term").onchange=load;
    document.getElementById("rb-print").onclick=function(){
      if (!current.students.length){ toast("Nothing to print yet."); return; }
      var cards = current.students.map(function(s){
        var row = current.scores[s.id]||{};
        var lines = current.subjects.map(function(sub){ var v=row[sub.name]; return '<div class="tsc-row"><span>'+esc(sub.name)+'</span><span>'+(v==null?"—":v)+'</span></div>'; }).join("");
        var avg = avgFor(s.id);
        return '<div class="tsc-slip rb-card" style="margin-bottom:22px;">'
          + '<div class="tsc-head"><div class="tsc-title">'+esc(ctx.school.name||"")+'</div><div class="tsc-sub">Report Book — '+esc(classLabel(current.cls))+' · '+esc(current.term)+'</div></div>'
          + '<div class="tsc-meta-row"><span>Name</span><span>'+esc(s.first_name+" "+s.last_name)+'</span></div>'
          + '<div class="tsc-meta-row"><span>Admission No</span><span>'+esc(s.admission_no||"—")+'</span></div>'
          + '<div class="tsc-section">'+lines+'</div>'
          + '<div class="tsc-net"><span>Average</span><span>'+(avg==null?"—":avg)+'</span></div>'
          + '</div>';
      }).join("");
      var html = '<style>@media print{.rb-card{page-break-after:always;}}</style>'+cards;
      window.SamajiPayslip.printHTML(html, "Report Books — "+classLabel(current.cls));
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

  window.TeacherModules = {
    dashboard: renderDashboard,
    attendance: renderAttendance,
    grading: renderGrading,
    reportbooks: renderReportBooks,
    payroll: renderPayroll
  };
})();
