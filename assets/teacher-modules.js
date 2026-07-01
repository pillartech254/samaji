// ============================================================
//  Teacher Portal tab renderers.
//  Each renderer: async (sb, ctx, el) => void
//  ctx = { schoolId, school, teacher, flags }
//  Registered on window.TeacherModules.
// ============================================================
(function () {
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function money(n){ return "KES " + Number(n||0).toLocaleString(); }
  function toast(t){ if(window.SM_toast) return window.SM_toast(t, /error|fail|required|invalid/i.test(t)?"err":"ok"); }
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
  // ====================================================
  async function renderGrading(sb, ctx, el){
    var assignments = await loadMyAssignments(sb, ctx);
    if (!assignments.length){ el.innerHTML='<div class="mod-head"><div><h2>Marks &amp; Grading</h2></div></div><div class="empty">No classes/subjects assigned yet. Ask your school admin to assign you in Settings.</div>'; return; }
    var pairs = assignments.filter(function(a){ return a.school_classes && a.subjects; });

    el.innerHTML = '<div class="mod-head"><div><h2>Marks &amp; Grading</h2><p>Enter and save scores for your classes and subjects.</p></div></div>'
      + '<div class="toolbar">'
      + '<div class="field"><label>Class &amp; subject</label><select id="gb-pair">'+pairs.map(function(a,i){ return '<option value="'+i+'">'+esc(classLabel(a.school_classes))+' — '+esc(a.subjects.name)+'</option>'; }).join("")+'</select></div>'
      + '<div class="field"><label>Term</label><select id="gb-term"><option>Term 1</option><option>Term 2</option><option>Term 3</option></select></div>'
      + '<div style="flex:1;"></div><button class="btn-primary indigo" id="gb-save">Save scores</button></div>'
      + '<div id="gb-table"></div>';

    var students=[];
    async function load(){
      var pair = pairs[Number(document.getElementById("gb-pair").value)];
      var term = document.getElementById("gb-term").value;
      var sr = await sb.from("students").select("*").eq("school_id",ctx.schoolId).eq("class_id",pair.class_id).eq("status","active").order("first_name");
      students = sr.data||[];
      var existing={};
      if (students.length){
        var r = await sb.from("grades").select("*").eq("school_id",ctx.schoolId).eq("term",term).eq("subject",pair.subjects.name).in("student_id",students.map(function(s){return s.id;}));
        (r.data||[]).forEach(function(g){ existing[g.student_id]=g.score; });
      }
      var t=document.getElementById("gb-table");
      if (!students.length){ t.innerHTML='<div class="empty">No active students in this class.</div>'; return; }
      var html='<table class="data"><thead><tr><th>Name</th><th style="text-align:right;">Score / 100</th></tr></thead><tbody>';
      students.forEach(function(s){
        var v=existing[s.id]; v=(v==null?"":v);
        html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(s.first_name+" "+s.last_name)+'</td>'
          +'<td style="text-align:right;"><input class="gb-score" type="number" min="0" max="100" data-stu="'+s.id+'" value="'+v+'" style="width:90px;text-align:right;"></td></tr>';
      });
      html+='</tbody></table>';
      t.innerHTML=html;
    }
    document.getElementById("gb-pair").onchange=load;
    document.getElementById("gb-term").onchange=load;
    document.getElementById("gb-save").onclick=async function(){
      var pair = pairs[Number(document.getElementById("gb-pair").value)];
      var term = document.getElementById("gb-term").value;
      var payload=[];
      document.querySelectorAll(".gb-score").forEach(function(inp){ if(inp.value!==""){ payload.push({ school_id:ctx.schoolId, student_id:inp.getAttribute("data-stu"), subject:pair.subjects.name, term:term, score:Number(inp.value) }); } });
      if (!payload.length){ toast("Enter at least one score."); return; }
      var r = await sb.from("grades").upsert(payload,{ onConflict:"student_id,subject,term" });
      if (r.error){ toast("Error: "+r.error.message); return; }
      toast("Saved "+payload.length+" scores for "+pair.subjects.name+" · "+term);
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
