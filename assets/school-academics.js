// ============================================================
//  School (admin) Portal — Exam Announcements + Report Cards.
//  Replaces the old standalone Gradebook/Exams screens: this runs
//  on the SAME CBC engine (assets/academics-core.js, assets/grading.js,
//  assets/report-card.js) as the Teacher Portal's Marks & Grading and
//  Report Books — one system, viewed from two portals.
//
//  Exam Announcements is the ONLY place exams get created. A teacher's
//  Marks & Grading screen can only enter scores against exams announced
//  here (enforced both in that screen's UI and by RLS — see
//  setup-modules-31.sql).
//
//  Each renderer: async (sb, schoolId, el) => void
// ============================================================
(function () {
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function toast(t){ if(window.SM_toast) window.SM_toast(t, /error|fail|required|invalid/i.test(t)?"err":"ok"); }
  function modal(html, wide){
    var ov=document.createElement("div"); ov.className="overlay";
    ov.innerHTML='<div class="modal'+(wide?" wide":"")+'">'+html+'</div>';
    ov.addEventListener("click",function(e){ if(e.target===ov) ov.remove(); });
    document.body.appendChild(ov);
    return { el:ov, close:function(){ov.remove();}, q:function(s){return ov.querySelector(s);}, qa:function(s){return ov.querySelectorAll(s);} };
  }
  function classLabel(c){ return window.SamajiAcademics.classLabel(c); }

  async function loadClasses(sb, schoolId){
    var r = await sb.from("school_classes").select("*").eq("school_id",schoolId);
    return (r.data||[]).slice().sort(function(a,b){ return classLabel(a) < classLabel(b) ? -1 : 1; });
  }

  // ====================================================
  //  EXAM ANNOUNCEMENTS  (admin-only exam creation)
  // ====================================================
  async function renderExamAnnouncements(sb, schoolId, el){
    var classes = await loadClasses(sb, schoolId);
    var academic = await window.SamajiAcademics.loadAcademicContext(sb, schoolId);
    var years = academic.years, allTypes = academic.allTypes, teacherNameById = academic.teacherNameById;
    if (!classes.length){ el.innerHTML='<div class="mod-head"><div><h2>Exam Announcements</h2></div></div><div class="empty">No classes yet — add one in Settings → Classes.</div>'; return; }
    if (!years.length){ el.innerHTML='<div class="mod-head"><div><h2>Exam Announcements</h2></div></div><div class="empty">No academic year set up yet — add one in Settings → CBC Assessment.</div>'; return; }

    el.innerHTML = '<div class="mod-head"><div><h2>Exam Announcements</h2><p>Create the exams teachers can record marks against. A teacher can only enter marks for an exam you\'ve announced here.</p></div></div>'
      + '<div class="toolbar">'
      + '<div class="field"><label>Academic year</label><select id="ea-year">'+years.map(function(y){ return '<option value="'+y.id+'"'+(y.id===academic.defaultYear.id?" selected":"")+'>'+y.year+'</option>'; }).join("")+'</select></div>'
      + '<div class="field"><label>Term</label><select id="ea-term"></select></div>'
      + '<div class="field"><label>Class</label><select id="ea-class">'+classes.map(function(c){ return '<option value="'+c.id+'">'+esc(classLabel(c))+'</option>'; }).join("")+'</select></div>'
      + '</div>'
      + '<div class="panel" style="margin-top:14px;">'
      +   '<strong style="font-size:14px;">Announce an exam</strong>'
      +   '<p class="muted" style="font-size:12.5px;margin:4px 0 12px;">Pick which subjects and assessment types this announcement covers. A subject with no teacher assigned (Settings → Teachers) is skipped automatically.</p>'
      +   '<div id="ea-subjects"></div>'
      +   '<div id="ea-types" style="margin-top:12px;"></div>'
      +   '<button class="btn-primary" id="ea-announce" style="margin-top:14px;">Announce exam(s)</button>'
      +   '<div id="ea-summary" class="muted" style="font-size:12.5px;margin-top:8px;"></div>'
      + '</div>'
      + '<div class="mod-head" style="margin-top:22px;"><div><h3 style="margin:0;">Announced for this class &amp; term</h3></div></div>'
      + '<div id="ea-list"></div>';

    function populateTerms(){
      var year = years.find(function(y){ return y.id===document.getElementById("ea-year").value; });
      var sel = document.getElementById("ea-term");
      sel.innerHTML = (year.terms||[]).map(function(t){ return '<option value="'+t.id+'"'+(academic.defaultTerm && t.id===academic.defaultTerm.id?" selected":"")+'>'+esc(t.name)+'</option>'; }).join("");
      if (!year.terms.length) sel.innerHTML = '<option value="">No terms yet</option>';
    }
    populateTerms();

    var subjectsForClass = [], teacherBySubject = {};

    async function loadPanel(){
      var cls = classes.find(function(c){ return c.id===document.getElementById("ea-class").value; });
      var csr = await sb.from("class_subjects").select("subjects(id,name)").eq("class_id",cls.id);
      subjectsForClass = (csr.data||[]).map(function(x){ return x.subjects; }).filter(Boolean).sort(function(a,b){ return a.name<b.name?-1:1; });
      var cstr = await sb.from("class_subject_teachers").select("subject_id,teacher_id").eq("class_id",cls.id);
      teacherBySubject = {}; (cstr.data||[]).forEach(function(x){ teacherBySubject[x.subject_id]=x.teacher_id; });

      var subjBox = document.getElementById("ea-subjects");
      if (!subjectsForClass.length){
        subjBox.innerHTML = '<div class="empty">No subjects assigned to '+esc(classLabel(cls))+' yet — set them in Settings → Classes.</div>';
      } else {
        subjBox.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;"><label style="font-size:12.5px;font-weight:600;">Subjects</label>'
          + '<button class="btn-sm" id="ea-subj-all" type="button">Select all</button></div>'
          + '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;">'
          + subjectsForClass.map(function(s){
              var hasTeacher = !!teacherBySubject[s.id];
              return '<label class="chk-pill"'+(hasTeacher?"":' style="opacity:.5;" title="No teacher assigned"') +'><input type="checkbox" class="ea-subj" value="'+s.id+'"'+(hasTeacher?" checked":" disabled")+'> '+esc(s.name)+(hasTeacher?"":" (no teacher)")+'</label>';
            }).join("")
          + '</div>';
        document.getElementById("ea-subj-all").onclick=function(){
          document.querySelectorAll(".ea-subj:not(:disabled)").forEach(function(c){ c.checked=true; });
        };
      }

      // Only contributing assessment types are offered here — the official
      // exams are First/Second/Third Test, full stop. Formative types
      // (Observation, Portfolio, etc.) aren't announceable at all anymore;
      // a school that still has some configured in Settings → CBC
      // Assessment can leave them there, they just won't show up here.
      var MAX_TESTS = window.SamajiAcademics.MAX_TESTS;
      var types = window.SamajiGrading.typesForGrade(allTypes, cls.level).filter(function(t){ return t.contributes_to_final; })
        .slice().sort(function(a,b){ return (a.sort||0)-(b.sort||0) || (a.name<b.name?-1:1); });
      var typeBox = document.getElementById("ea-types");
      if (!types.length){
        typeBox.innerHTML = '<div class="empty">No assessment types configured for '+esc(cls.level)+' yet — add some in Settings → CBC Assessment.</div>';
      } else {
        typeBox.innerHTML = '<label style="font-size:12.5px;font-weight:600;">Test(s)</label>'
          + '<p class="muted" style="font-size:11.5px;margin:2px 0 6px;">The report card has a fixed First/Second/Third Test grid — pick at most '+MAX_TESTS+'.</p>'
          + '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;">'
          + types.map(function(t){ return '<label class="chk-pill"><input type="checkbox" class="ea-type" value="'+t.id+'"> '+esc(t.name)+'</label>'; }).join("")
          + '</div>';
        typeBox.querySelectorAll('.ea-type').forEach(function(cb){
          cb.onchange = function(){
            if (!cb.checked) return;
            var checked = typeBox.querySelectorAll('.ea-type:checked');
            if (checked.length > MAX_TESTS){
              cb.checked = false;
              toast("Only "+MAX_TESTS+" tests allowed per term (First/Second/Third Test) — uncheck one first.");
            }
          };
        });
      }
      await loadList();
    }

    async function loadList(){
      var cls = classes.find(function(c){ return c.id===document.getElementById("ea-class").value; });
      var termId = document.getElementById("ea-term").value;
      var yearId = document.getElementById("ea-year").value;
      var list = document.getElementById("ea-list");
      if (!termId){ list.innerHTML='<div class="empty">This academic year has no terms yet.</div>'; return; }

      var msRes = await sb.from("mark_sheets").select("*, subjects(name)").eq("class_id",cls.id).eq("term_id",termId).eq("academic_year_id",yearId);
      var markSheets = msRes.data||[];
      if (!markSheets.length){ list.innerHTML='<div class="empty">No exams announced yet for '+esc(classLabel(cls))+' this term.</div>'; return; }

      var msIds = markSheets.map(function(m){ return m.id; });
      var exRes = await sb.from("exams").select("id,mark_sheet_id,assessment_type_id,name").in("mark_sheet_id",msIds);
      var examsByMs = {}; (exRes.data||[]).forEach(function(e){ (examsByMs[e.mark_sheet_id]=examsByMs[e.mark_sheet_id]||[]).push(e); });
      var examIds = (exRes.data||[]).map(function(e){ return e.id; });
      var countByExam = {};
      if (examIds.length){
        var resRes = await sb.from("exam_results").select("exam_id").in("exam_id",examIds);
        (resRes.data||[]).forEach(function(r){ countByExam[r.exam_id]=(countByExam[r.exam_id]||0)+1; });
      }
      var stuRes = await sb.from("students").select("id").eq("school_id",schoolId).eq("class_id",cls.id).eq("status","active");
      var totalStudents = (stuRes.data||[]).length;

      var html = markSheets.map(function(m){
        var exams = examsByMs[m.id]||[];
        var totalEntries = exams.reduce(function(a,e){ return a+(countByExam[e.id]||0); },0);
        var badges = exams.map(function(e){ return '<span class="pill gray">'+esc(e.name)+' ('+(countByExam[e.id]||0)+'/'+totalStudents+')</span>'; }).join(" ");
        return '<div class="panel" style="margin-bottom:10px;">'
          + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">'
          +   '<div><strong style="font-size:13.5px;">'+esc(m.subjects?m.subjects.name:"—")+'</strong> <span class="muted" style="font-size:12px;">· '+esc(teacherNameById[m.teacher_id]||"no teacher")+'</span></div>'
          +   '<div style="display:flex;gap:8px;align-items:center;">'
          +     '<span class="pill '+(m.status==="published"?"green":"amber")+'">'+esc(m.status)+'</span>'
          +     (m.status==="published"
                  ? '<button class="btn-sm" data-unpub="'+m.id+'">Unpublish</button>'
                  : '<button class="btn-sm" data-pub="'+m.id+'">Publish</button>')
          +     '<button class="btn-sm danger" data-del-ms="'+m.id+'"'+(totalEntries?" disabled title=\"Marks already recorded — unpublish and clear results first\"":"")+'>Delete</button>'
          +   '</div>'
          + '</div>'
          + '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;">'+(badges||'<span class="muted">No assessment types yet.</span>')+'</div>'
          + '</div>';
      }).join("");
      list.innerHTML = html;

      list.querySelectorAll("[data-pub]").forEach(function(b){ b.onclick=async function(){
        var r=await sb.from("mark_sheets").update({ status:"published", published_at:new Date().toISOString(), published_by:null }).eq("id",b.getAttribute("data-pub"));
        if(r.error){ toast("Error: "+r.error.message); return; } toast("Published"); loadList();
      }; });
      list.querySelectorAll("[data-unpub]").forEach(function(b){ b.onclick=async function(){
        if(!await window.SM_confirm("Unpublish this exam? The subject teacher will be able to edit marks again.")) return;
        var r=await sb.from("mark_sheets").update({ status:"draft" }).eq("id",b.getAttribute("data-unpub"));
        if(r.error){ toast("Error: "+r.error.message); return; } toast("Unpublished"); loadList();
      }; });
      list.querySelectorAll("[data-del-ms]:not(:disabled)").forEach(function(b){ b.onclick=async function(){
        if(!await window.SM_confirm("Delete this exam announcement? This removes it and any (empty) result slots for every subject teacher.")) return;
        var r=await sb.from("mark_sheets").delete().eq("id",b.getAttribute("data-del-ms"));
        if(r.error){ toast("Error: "+r.error.message); return; } toast("Deleted"); loadList();
      }; });
    }

    document.getElementById("ea-year").onchange=function(){ populateTerms(); loadPanel(); };
    document.getElementById("ea-term").onchange=loadList;
    document.getElementById("ea-class").onchange=loadPanel;

    document.getElementById("ea-announce").onclick=async function(){
      var cls = classes.find(function(c){ return c.id===document.getElementById("ea-class").value; });
      var termId = document.getElementById("ea-term").value;
      var year = years.find(function(y){ return y.id===document.getElementById("ea-year").value; });
      var term = termId ? year.terms.find(function(t){ return t.id===termId; }) : null;
      var summary = document.getElementById("ea-summary");
      if (!term){ summary.textContent="Pick a term first."; return; }
      var subjectIds = Array.prototype.slice.call(document.querySelectorAll(".ea-subj:checked")).map(function(c){ return c.value; });
      var typeIds = Array.prototype.slice.call(document.querySelectorAll(".ea-type:checked")).map(function(c){ return c.value; });
      if (!subjectIds.length || !typeIds.length){ summary.textContent="Pick at least one subject and one assessment type."; return; }
      summary.textContent = "Announcing…";

      var MAX_TESTS = window.SamajiAcademics.MAX_TESTS;
      var announced = [], skipped = [], capped = [];
      for (var i=0;i<subjectIds.length;i++){
        var subjectId = subjectIds[i];
        var subject = subjectsForClass.find(function(s){ return s.id===subjectId; });
        var teacherId = teacherBySubject[subjectId];
        if (!teacherId){ skipped.push(subject ? subject.name : subjectId); continue; }

        var msSel = await sb.from("mark_sheets").select("*").eq("class_id",cls.id).eq("subject_id",subjectId).eq("term_id",term.id).eq("academic_year_id",year.id).maybeSingle();
        var markSheet = msSel.data;
        if (!markSheet){
          var msIns = await sb.from("mark_sheets").insert({ school_id:schoolId, class_id:cls.id, subject_id:subjectId, term_id:term.id, academic_year_id:year.id, teacher_id:teacherId, status:"draft" }).select().single();
          if (msIns.error){ toast("Error creating mark sheet for "+subject.name+": "+msIns.error.message); continue; }
          markSheet = msIns.data;
        }

        var exRes = await sb.from("exams").select("id,assessment_type_id").eq("mark_sheet_id",markSheet.id);
        var existingTypeIds = (exRes.data||[]).map(function(e){ return e.assessment_type_id; });
        var existingContribCount = existingTypeIds.filter(function(tid){ var t=allTypes.find(function(x){return x.id===tid;}); return t && t.contributes_to_final; }).length;

        var missingTypeIds = typeIds.filter(function(tid){ return existingTypeIds.indexOf(tid)===-1; });
        // The report card has exactly MAX_TESTS test columns — cap how many
        // *contributing* assessment types this subject's mark sheet can gain
        // in this announcement, regardless of what's checked. Formative
        // (non-contributing) types are unlimited since they don't render as
        // report-card columns.
        var remainingTestSlots = Math.max(0, MAX_TESTS - existingContribCount);
        var wasCapped = false;
        var toInsertTypeIds = missingTypeIds.filter(function(tid){
          var t = allTypes.find(function(x){ return x.id===tid; });
          if (!t || !t.contributes_to_final) return true;
          if (remainingTestSlots > 0){ remainingTestSlots--; return true; }
          wasCapped = true; return false;
        });
        if (wasCapped) capped.push(subject.name);

        if (toInsertTypeIds.length){
          var newExams = toInsertTypeIds.map(function(tid){
            var type = allTypes.find(function(t){ return t.id===tid; });
            return { school_id:schoolId, name:type.name, subject:subject.name, subject_id:subjectId, class_id:cls.id,
              teacher_id:teacherId, term:term.name, term_id:term.id, academic_year_id:year.id,
              max_score:type.max_marks, mark_sheet_id:markSheet.id, assessment_type_id:tid };
          });
          var insEx = await sb.from("exams").insert(newExams);
          if (insEx.error){ toast("Error announcing "+subject.name+": "+insEx.error.message); continue; }
        }
        if (toInsertTypeIds.length || existingTypeIds.length) announced.push(subject.name);
      }

      var msg = [];
      if (announced.length) msg.push("Announced: "+announced.join(", "));
      if (capped.length) msg.push(MAX_TESTS+"-test limit reached, some selections skipped for: "+capped.join(", "));
      if (skipped.length) msg.push("Skipped (no teacher assigned): "+skipped.join(", "));
      summary.textContent = msg.join(" · ") || "Nothing to announce.";
      if (announced.length) toast("Exam announced for "+announced.length+" subject"+(announced.length===1?"":"s"));
      loadList();
    };

    loadPanel();
  }

  // ====================================================
  //  REPORT CARDS  (admin console — filter by class/term/year,
  //  same rendering the Teacher Portal uses, freeze + print)
  // ====================================================
  async function renderReportCardsAdmin(sb, schoolId, el){
    // Kicked off now, awaited just before each place that actually prints —
    // most visits to this console are just filtering/generating, not printing.
    var reportCardLoad = window.loadScriptOnce ? window.loadScriptOnce("../assets/report-card.js") : Promise.resolve();
    var classes = await loadClasses(sb, schoolId);
    var academic = await window.SamajiAcademics.loadAcademicContext(sb, schoolId);
    var years = academic.years, allTypes = academic.allTypes, schemes = academic.schemes, teacherNameById = academic.teacherNameById;
    var scRes = await sb.from("schools").select("*").eq("id",schoolId).single();
    var school = scRes.data || { name:schoolId };
    if (!classes.length){ el.innerHTML='<div class="mod-head"><div><h2>Report Cards</h2></div></div><div class="empty">No classes yet — add one in Settings → Classes.</div>'; return; }
    if (!years.length){ el.innerHTML='<div class="mod-head"><div><h2>Report Cards</h2></div></div><div class="empty">No academic year set up yet — add one in Settings → CBC Assessment.</div>'; return; }

    el.innerHTML = '<div class="mod-head"><div><h2>Report Cards</h2><p>Filter by class, term and year to pull every learner\'s summative report — same engine as Marks &amp; Grading.</p></div>'
      + '<div style="display:flex;gap:8px;"><button class="btn-primary" id="rc-generate">Generate Report Cards</button><button class="btn-primary indigo" id="rc-print">Print all</button></div></div>'
      + '<div class="toolbar">'
      + '<div class="field"><label>Academic year</label><select id="rc-year">'+years.map(function(y){ return '<option value="'+y.id+'"'+(y.id===academic.defaultYear.id?" selected":"")+'>'+y.year+'</option>'; }).join("")+'</select></div>'
      + '<div class="field"><label>Term</label><select id="rc-term"></select></div>'
      + '<div class="field"><label>Class</label><select id="rc-class"><option value="">All classes</option>'+classes.map(function(c){ return '<option value="'+c.id+'">'+esc(classLabel(c))+'</option>'; }).join("")+'</select></div>'
      + '</div><div id="rc-status" class="muted" style="font-size:12.5px;"></div><div id="rc-table"></div>';

    function populateTerms(){
      var year = years.find(function(y){ return y.id===document.getElementById("rc-year").value; });
      var sel = document.getElementById("rc-term");
      sel.innerHTML = (year.terms||[]).map(function(t){ return '<option value="'+t.id+'"'+(academic.defaultTerm && t.id===academic.defaultTerm.id?" selected":"")+'>'+esc(t.name)+'</option>'; }).join("");
      if (!year.terms.length) sel.innerHTML = '<option value="">No terms yet</option>';
    }
    populateTerms();

    // rows: [{ cls, student, data }] — one fetchClassReportData per class in scope.
    var rows = [];

    async function load(){
      var year = years.find(function(y){ return y.id===document.getElementById("rc-year").value; });
      var termId = document.getElementById("rc-term").value;
      var term = termId ? year.terms.find(function(t){ return t.id===termId; }) : null;
      var classId = document.getElementById("rc-class").value;
      var table = document.getElementById("rc-table");
      rows = [];
      if (!term){ table.innerHTML='<div class="empty">This academic year has no terms yet.</div>'; return; }
      var scopeClasses = classId ? classes.filter(function(c){ return c.id===classId; }) : classes;

      table.innerHTML = '<div class="empty">Loading…</div>';
      for (var i=0;i<scopeClasses.length;i++){
        var cls = scopeClasses[i];
        var data = await window.SamajiAcademics.fetchClassReportData(sb, schoolId, cls, year, term, allTypes, schemes, false);
        data.students.forEach(function(s){ rows.push({ cls:cls, student:s, data:data }); });
      }

      var snapRes = rows.length ? await sb.from("report_cards").select("student_id,published_at").in("student_id",rows.map(function(r){ return r.student.id; })).eq("term_id",term.id).eq("academic_year_id",year.id) : { data:[] };
      var publishedByStudent = {}; (snapRes.data||[]).forEach(function(r){ publishedByStudent[r.student_id]=r.published_at; });

      draw(publishedByStudent, classId, year, term);
    }

    function draw(publishedByStudent, classId, year, term){
      var table = document.getElementById("rc-table");
      if (!rows.length){ table.innerHTML='<div class="empty">No active students in scope.</div>'; return; }
      var showClassCol = !classId;
      var html = '<table class="data"><thead><tr><th>Name</th>'+(showClassCol?'<th>Class</th>':'')+'<th style="text-align:right;">Overall %</th><th>Status</th><th></th></tr></thead><tbody>';
      rows.forEach(function(r){
        var summary = window.SamajiAcademics.testSummaryFor(r.data, r.student.id);
        var overall = window.SamajiAcademics.overallFromSummary(summary);
        var pub = publishedByStudent[r.student.id];
        html += '<tr><td style="font-weight:600;color:#1A1D26;">'+esc(r.student.first_name+" "+r.student.last_name)+'</td>'
          + (showClassCol ? '<td>'+esc(classLabel(r.cls))+'</td>' : '')
          + '<td style="text-align:right;">'+(overall==null?'<span class="muted">—</span>':overall+"%")+'</td>'
          + '<td>'+(pub?'<span class="pill green">Published '+esc(new Date(pub).toLocaleDateString())+'</span>':'<span class="pill gray">Not generated</span>')+'</td>'
          + '<td style="text-align:right;"><button class="btn-sm" data-print="'+r.student.id+'">Print</button></td></tr>';
      });
      html += '</tbody></table>';
      table.innerHTML = html;
      table.querySelectorAll("[data-print]").forEach(function(b){ b.onclick=function(){ printOne(rows.find(function(r){ return r.student.id===b.getAttribute("data-print"); }), year, term); }; });
    }

    async function printOne(row, year, term){
      await reportCardLoad;
      var snapRes = await sb.from("report_cards").select("*").eq("student_id",row.student.id).eq("term_id",term.id).eq("academic_year_id",year.id).maybeSingle();
      var opts = snapRes.data
        ? window.SamajiAcademics.buildSnapshotReportOpts(school, row.student, snapRes.data, row.cls, term, year, row.data.levels)
        : window.SamajiAcademics.buildLiveReportOpts(school, row.student, row.cls, term, year, row.data, teacherNameById[row.cls.class_teacher_id], (row.data.remarksByStudent[row.student.id]||{}).teacher_remark);
      var html = window.SamajiReportCard.studentReportHTML(opts);
      window.SamajiReportCard.printHTML(html, "Report Card — "+row.student.first_name+" "+row.student.last_name);
    }

    document.getElementById("rc-year").onchange=function(){ populateTerms(); load(); };
    document.getElementById("rc-term").onchange=load;
    document.getElementById("rc-class").onchange=load;

    document.getElementById("rc-generate").onclick=async function(){
      var year = years.find(function(y){ return y.id===document.getElementById("rc-year").value; });
      var termId = document.getElementById("rc-term").value;
      var term = termId ? year.terms.find(function(t){ return t.id===termId; }) : null;
      var classId = document.getElementById("rc-class").value;
      var status = document.getElementById("rc-status");
      if (!term){ status.textContent="This academic year has no terms yet."; return; }
      var scopeClasses = classId ? classes.filter(function(c){ return c.id===classId; }) : classes;
      status.textContent = "Generating…";
      var total = 0, errors = [];
      for (var i=0;i<scopeClasses.length;i++){
        var res = await window.SamajiAcademics.generateReportCards(sb, schoolId, scopeClasses[i], year, term, allTypes, schemes, teacherNameById, null);
        if (res.error) errors.push(classLabel(scopeClasses[i])+": "+res.error.message);
        total += res.count||0;
      }
      status.textContent = "Generated "+total+" report card(s)."+(errors.length?" Errors — "+errors.join("; "):"");
      toast("Report cards generated");
      load();
    };

    document.getElementById("rc-print").onclick=async function(){
      if (!rows.length){ toast("Nothing to print yet."); return; }
      await reportCardLoad;
      var year = years.find(function(y){ return y.id===document.getElementById("rc-year").value; });
      var termId = document.getElementById("rc-term").value;
      var term = termId ? year.terms.find(function(t){ return t.id===termId; }) : null;
      if (!term) return;
      var studentIds = rows.map(function(r){ return r.student.id; });
      var snapRes = await sb.from("report_cards").select("*").in("student_id",studentIds).eq("term_id",term.id).eq("academic_year_id",year.id);
      var snapByStudent = {}; (snapRes.data||[]).forEach(function(r){ snapByStudent[r.student_id]=r; });
      var cards = rows.map(function(r){
        var snap = snapByStudent[r.student.id];
        var opts = snap
          ? window.SamajiAcademics.buildSnapshotReportOpts(school, r.student, snap, r.cls, term, year, r.data.levels)
          : window.SamajiAcademics.buildLiveReportOpts(school, r.student, r.cls, term, year, r.data, teacherNameById[r.cls.class_teacher_id], (r.data.remarksByStudent[r.student.id]||{}).teacher_remark);
        return window.SamajiReportCard.studentReportHTML(opts);
      }).join("");
      window.SamajiReportCard.printHTML(cards, "Report Cards");
    };

    load();
  }

  window.SchoolModules = window.SchoolModules || {};
  window.SchoolModules["module.exams"] = renderExamAnnouncements;
  window.SchoolModules["module.academics"] = renderReportCardsAdmin;
})();
