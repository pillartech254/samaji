// ============================================================
//  School-portal modules — real CRUD against Supabase.
//  Each renderer: async (sb, schoolId, el) => void
//  Registered in window.SchoolModules, keyed by feature flag.
// ============================================================
(function () {
  // ---------- tiny helpers ----------
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function money(n){ return "KES " + Number(n||0).toLocaleString(); }
  var toastT;
  function toast(t){ if(window.SM_toast) return window.SM_toast(t, /error|fail|required|invalid/i.test(t)?"err":"ok"); }
  function modal(html, wide){
    var ov=document.createElement("div"); ov.className="overlay";
    ov.innerHTML='<div class="modal'+(wide?" wide":"")+'">'+html+'</div>';
    ov.addEventListener("click",function(e){ if(e.target===ov) ov.remove(); });
    document.body.appendChild(ov);
    return { el: ov, close: function(){ ov.remove(); }, q: function(sel){ return ov.querySelector(sel); }, qa: function(sel){ return Array.prototype.slice.call(ov.querySelectorAll(sel)); } };
  }
  window.SM_toast = toast;

  // Turns a plain <select> full of students into a searchable one: pass the
  // select element, a search <input> placed above it, the full list, and a
  // label function. Options are rebuilt on every keystroke from the filtered
  // list — the select's id/.value contract is unchanged, so every existing
  // caller keeps working untouched.
  function wireSearchSelect(selectEl, searchEl, list, labelFn){
    function draw(){
      var q=(searchEl.value||"").trim().toLowerCase();
      var filtered = !q ? list : list.filter(function(s){ return labelFn(s).toLowerCase().indexOf(q)>=0; });
      var cur = selectEl.value;
      selectEl.innerHTML = filtered.length
        ? filtered.map(function(s){ return '<option value="'+s.id+'">'+esc(labelFn(s))+'</option>'; }).join("")
        : '<option value="">No matches</option>';
      if (filtered.some(function(s){ return String(s.id)===cur; })) selectEl.value = cur;
    }
    searchEl.oninput = draw;
    draw();
  }
  window.SM_wireSearchSelect = wireSearchSelect;

  // ====================================================
  //  STUDENTS / SIS
  // ====================================================
  async function renderStudents(sb, schoolId, el){
    el.innerHTML = '<div class="mod-head"><div><h2>Students</h2><p>Enrollment records, guardians and status.</p></div>'
      + '<button class="btn-primary" id="add-student">+ New student</button></div>'
      + '<div class="toolbar"><div class="search"><span style="color:#98A2B3;">⌕</span><input id="stu-search" placeholder="Search name or admission no…"></div>'
      + '<span class="muted" id="stu-count" style="font-size:12.5px;"></span></div>'
      + '<div id="stu-table"></div>';

    var all = [];
    async function load(){
      var r = await sb.from("students").select("*").eq("school_id", schoolId).order("created_at",{ascending:true});
      if (r.error){ document.getElementById("stu-table").innerHTML='<div class="empty">'+esc(r.error.message)+'</div>'; return; }
      all = r.data || []; draw();
    }
    function draw(){
      var q = (document.getElementById("stu-search").value||"").toLowerCase();
      var rows = all.filter(function(s){ return !q || (s.first_name+" "+s.last_name+" "+(s.admission_no||"")).toLowerCase().indexOf(q)>=0; });
      document.getElementById("stu-count").textContent = rows.length + " of " + all.length + " students";
      var t = document.getElementById("stu-table");
      if (!rows.length){ t.innerHTML='<div class="empty">No students yet. Click <strong>+ New student</strong> to enrol one.</div>'; return; }
      var html='<table class="data"><thead><tr><th>Adm. No</th><th>Name</th><th>Grade</th><th>Gender</th><th>Guardian</th><th>Status</th><th></th></tr></thead><tbody>';
      rows.forEach(function(s){
        html+='<tr><td class="mono" style="font-size:12px;">'+esc(s.admission_no||"—")+'</td>'
          +'<td style="font-weight:600;color:#1A1D26;">'+esc(s.first_name+" "+s.last_name)+'</td>'
          +'<td>'+esc(s.grade||"—")+'</td><td>'+esc(s.gender||"—")+'</td>'
          +'<td>'+esc(s.guardian_name||"—")+'<div class="muted" style="font-size:11px;">'+esc(s.guardian_phone||"")+'</div></td>'
          +'<td><span class="pill '+(s.status==="active"?"green":"gray")+'">'+esc(s.status)+'</span></td>'
          +'<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-edit="'+s.id+'">Edit</button> <button class="btn-sm danger" data-del="'+s.id+'">Delete</button></td></tr>';
      });
      html+='</tbody></table>';
      t.innerHTML=html;
      t.querySelectorAll("[data-edit]").forEach(function(b){ b.onclick=function(){ form(all.find(function(x){return x.id===b.getAttribute("data-edit");})); }; });
      t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=function(){ del(b.getAttribute("data-del")); }; });
    }
    function form(s){
      s = s || {};
      var m = modal('<h3>'+(s.id?"Edit student":"New student")+'</h3><p class="muted" style="font-size:12.5px;margin:0;">Saved to the <span class="mono">students</span> table.</p>'
        +'<div class="grid2">'
        +'<div class="field"><label>First name</label><input id="f-first" value="'+esc(s.first_name||"")+'"></div>'
        +'<div class="field"><label>Last name</label><input id="f-last" value="'+esc(s.last_name||"")+'"></div>'
        +'<div class="field"><label>Admission no</label><input id="f-adm" value="'+esc(s.admission_no||"")+'"></div>'
        +'<div class="field"><label>Grade</label><input id="f-grade" value="'+esc(s.grade||"")+'" placeholder="Grade 5"></div>'
        +'<div class="field"><label>Gender</label><select id="f-gender"><option value="">—</option><option'+(s.gender==="F"?" selected":"")+'>F</option><option'+(s.gender==="M"?" selected":"")+'>M</option></select></div>'
        +'<div class="field"><label>Status</label><select id="f-status"><option'+(s.status!=="inactive"?" selected":"")+'>active</option><option'+(s.status==="inactive"?" selected":"")+'>inactive</option></select></div>'
        +'<div class="field full"><label>Guardian name</label><input id="f-gname" value="'+esc(s.guardian_name||"")+'"></div>'
        +'<div class="field full"><label>Guardian phone</label><input id="f-gphone" value="'+esc(s.guardian_phone||"")+'"></div>'
        +'</div><div class="modal-actions"><button class="btn-sm" id="cancel">Cancel</button><button class="btn-primary" id="save">Save</button></div>');
      m.q("#cancel").onclick=m.close;
      m.q("#save").onclick=async function(){
        var rec={ school_id:schoolId, first_name:m.q("#f-first").value.trim(), last_name:m.q("#f-last").value.trim(),
          admission_no:m.q("#f-adm").value.trim()||null, grade:m.q("#f-grade").value.trim()||null,
          gender:m.q("#f-gender").value||null, status:m.q("#f-status").value,
          guardian_name:m.q("#f-gname").value.trim()||null, guardian_phone:m.q("#f-gphone").value.trim()||null };
        if(!rec.first_name||!rec.last_name){ toast("First and last name are required."); return; }
        var r = s.id ? await sb.from("students").update(rec).eq("id",s.id) : await sb.from("students").insert(rec);
        if(r.error){ toast("Error: "+r.error.message); return; }
        m.close(); toast(s.id?"Student updated":"Student enrolled"); load();
      };
    }
    async function del(id){
      if(!await window.SM_confirm("Delete this student and all their attendance, grades and invoices?")) return;
      var r = await sb.from("students").delete().eq("id",id);
      if(r.error){ toast("Error: "+r.error.message); return; }
      toast("Student deleted"); load();
    }
    document.getElementById("add-student").onclick=function(){ form(null); };
    document.getElementById("stu-search").oninput=draw;
    load();
  }

  // ====================================================
  //  ATTENDANCE
  // ====================================================
  async function renderAttendance(sb, schoolId, el){
    var today = new Date().toISOString().slice(0,10);
    el.innerHTML='<div class="mod-head"><div><h2>Attendance</h2><p>Mark daily attendance and save it to the register.</p></div></div>'
      +'<div class="toolbar">'
      +'<div class="field"><label>Date</label><input type="date" id="att-date" value="'+today+'"></div>'
      +'<div class="field"><label>Grade</label><select id="att-grade"><option value="">All grades</option></select></div>'
      +'<div style="flex:1;"></div><span class="muted" id="att-summary" style="font-size:12.5px;"></span>'
      +'<button class="btn-primary" id="att-save">Save register</button></div>'
      +'<div id="att-table"></div>';
    var students=[], marks={};
    var sr = await sb.from("students").select("*").eq("school_id",schoolId).eq("status","active").order("first_name");
    students = sr.data||[];
    var grades = Array.from(new Set(students.map(function(s){return s.grade;}).filter(Boolean))).sort();
    var gsel=document.getElementById("att-grade");
    grades.forEach(function(g){ var o=document.createElement("option"); o.value=g; o.textContent=g; gsel.appendChild(o); });

    async function load(){
      marks={};
      var d=document.getElementById("att-date").value;
      var r=await sb.from("attendance").select("*").eq("school_id",schoolId).eq("on_date",d);
      (r.data||[]).forEach(function(a){ marks[a.student_id]=a.status; });
      draw();
    }
    function draw(){
      var g=document.getElementById("att-grade").value;
      var rows=students.filter(function(s){ return !g||s.grade===g; });
      var present=0;
      var html='<table class="data"><thead><tr><th>Name</th><th>Grade</th><th style="text-align:right;">Mark</th></tr></thead><tbody>';
      rows.forEach(function(s){
        var st=marks[s.id]||"present"; if(st==="present")present++;
        html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(s.first_name+" "+s.last_name)+'</td><td>'+esc(s.grade||"—")+'</td>'
          +'<td style="text-align:right;"><span class="seg" data-stu="'+s.id+'">'
          +'<button data-v="present" class="'+(st==="present"?"on-present":"")+'">Present</button>'
          +'<button data-v="late" class="'+(st==="late"?"on-late":"")+'">Late</button>'
          +'<button data-v="absent" class="'+(st==="absent"?"on-absent":"")+'">Absent</button>'
          +'</span></td></tr>';
      });
      html+='</tbody></table>';
      if(!rows.length) html='<div class="empty">No active students'+(g?" in "+esc(g):"")+'.</div>';
      document.getElementById("att-table").innerHTML=html;
      document.getElementById("att-summary").textContent=rows.length?(present+" / "+rows.length+" present"):"";
      document.querySelectorAll(".seg[data-stu]").forEach(function(seg){
        var id=seg.getAttribute("data-stu");
        if(marks[id]===undefined) marks[id]="present";
        seg.querySelectorAll("button").forEach(function(b){
          b.onclick=function(){ marks[id]=b.getAttribute("data-v"); draw(); };
        });
      });
    }
    document.getElementById("att-date").onchange=load;
    document.getElementById("att-grade").onchange=draw;
    document.getElementById("att-save").onclick=async function(){
      var d=document.getElementById("att-date").value;
      var g=document.getElementById("att-grade").value;
      var rows=students.filter(function(s){ return !g||s.grade===g; });
      var payload=rows.map(function(s){ return { school_id:schoolId, student_id:s.id, on_date:d, status:marks[s.id]||"present" }; });
      if(!payload.length){ toast("Nothing to save."); return; }
      var r=await sb.from("attendance").upsert(payload,{ onConflict:"student_id,on_date" });
      if(r.error){ toast("Error: "+r.error.message); return; }
      toast("Register saved for "+d);
    };
    load();
  }

  // ====================================================
  //  FEES / INVOICING
  // ====================================================
  async function renderFees(sb, schoolId, el){
    el.innerHTML='<div class="mod-head"><div><h2>Fees &amp; Invoicing</h2><p>Issue invoices and track payment.</p></div>'
      +'<button class="btn-primary" id="fee-new">+ New invoice</button></div>'
      +'<div class="kpis" id="fee-kpis"></div>'
      +'<div style="margin-top:18px;" id="fee-table"></div>';
    var students=[];
    var sr=await sb.from("students").select("id,first_name,last_name").eq("school_id",schoolId);
    students=sr.data||[];
    var nameOf={}; students.forEach(function(s){ nameOf[s.id]=s.first_name+" "+s.last_name; });
    async function load(){
      var r=await sb.from("fee_invoices").select("*").eq("school_id",schoolId).order("created_at",{ascending:false});
      if(r.error){ document.getElementById("fee-table").innerHTML='<div class="empty">'+esc(r.error.message)+'</div>'; return; }
      var inv=r.data||[];
      var collected=inv.filter(function(i){return i.paid;}).reduce(function(a,i){return a+i.amount;},0);
      var outstanding=inv.filter(function(i){return !i.paid;}).reduce(function(a,i){return a+i.amount;},0);
      document.getElementById("fee-kpis").innerHTML=
        '<div class="panel"><div class="muted" style="font-size:12.5px;">Collected</div><div style="font-size:22px;font-weight:700;margin-top:6px;color:#067647;">'+money(collected)+'</div></div>'
        +'<div class="panel"><div class="muted" style="font-size:12.5px;">Outstanding</div><div style="font-size:22px;font-weight:700;margin-top:6px;color:#B54708;">'+money(outstanding)+'</div></div>'
        +'<div class="panel"><div class="muted" style="font-size:12.5px;">Invoices</div><div style="font-size:22px;font-weight:700;margin-top:6px;">'+inv.length+'</div></div>';
      if(!inv.length){ document.getElementById("fee-table").innerHTML='<div class="empty">No invoices yet.</div>'; return; }
      var html='<table class="data"><thead><tr><th>Student</th><th>Title</th><th>Amount</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>';
      inv.forEach(function(i){
        html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(nameOf[i.student_id]||"—")+'</td><td>'+esc(i.title)+'</td>'
          +'<td>'+money(i.amount)+'</td><td>'+esc(i.due_date||"—")+'</td>'
          +'<td><span class="pill '+(i.paid?"green":"amber")+'">'+(i.paid?"Paid":"Unpaid")+'</span></td>'
          +'<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-toggle="'+i.id+'" data-paid="'+i.paid+'">'+(i.paid?"Mark unpaid":"Mark paid")+'</button> <button class="btn-sm danger" data-del="'+i.id+'">Delete</button></td></tr>';
      });
      html+='</tbody></table>';
      var t=document.getElementById("fee-table"); t.innerHTML=html;
      t.querySelectorAll("[data-toggle]").forEach(function(b){ b.onclick=async function(){
        var r=await sb.from("fee_invoices").update({ paid: b.getAttribute("data-paid")!=="true" }).eq("id",b.getAttribute("data-toggle"));
        if(r.error){ toast("Error: "+r.error.message); return; } toast("Updated"); load();
      };});
      t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){
        if(!await window.SM_confirm("Delete this invoice?"))return;
        var r=await sb.from("fee_invoices").delete().eq("id",b.getAttribute("data-del"));
        if(r.error){ toast("Error: "+r.error.message); return; } toast("Deleted"); load();
      };});
    }
    document.getElementById("fee-new").onclick=function(){
      if(!students.length){ toast("Add a student first."); return; }
      var m=modal('<h3>New invoice</h3>'
        +'<div class="grid2">'
        +'<div class="field full"><label>Search student</label><input id="i-stu-search" placeholder="Type a name…"></div>'
        +'<div class="field full"><label>Student</label><select id="i-stu"></select></div>'
        +'<div class="field full"><label>Title</label><input id="i-title" value="Term 1 Tuition"></div>'
        +'<div class="field"><label>Amount (KES)</label><input id="i-amount" type="number" value="15000"></div>'
        +'<div class="field"><label>Due date</label><input id="i-due" type="date"></div>'
        +'</div><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Create</button></div>');
      wireSearchSelect(m.q("#i-stu"), m.q("#i-stu-search"), students, function(s){ return s.first_name+" "+s.last_name; });
      m.q("#c").onclick=m.close;
      m.q("#s").onclick=async function(){
        var rec={ school_id:schoolId, student_id:m.q("#i-stu").value, title:m.q("#i-title").value.trim()||"Invoice",
          amount:Number(m.q("#i-amount").value)||0, due_date:m.q("#i-due").value||null, paid:false };
        var r=await sb.from("fee_invoices").insert(rec);
        if(r.error){ toast("Error: "+r.error.message); return; }
        m.close(); toast("Invoice created"); load();
      };
    };
    load();
  }

  // ====================================================
  //  LIBRARY  (catalog, lending lifecycle, lost-book charges)
  // ====================================================
  async function renderLibrary(sb, schoolId, el){
    el.innerHTML='<div class="mod-head"><div><h2>Library</h2><p>Catalogue, issue and return books, and track lost-book charges.</p></div>'
      +'<button class="btn-primary" id="lib-add">+ Add book</button></div>'
      +'<div class="toolbar"><div class="seg" id="lib-tabs">'
      +'<button data-tab="catalog" class="on-present">Catalogue</button>'
      +'<button data-tab="loans">On loan</button>'
      +'<button data-tab="due">Due &amp; overdue</button>'
      +'<button data-tab="charges">Charges</button>'
      +'</div><div style="flex:1;"></div><span class="muted" id="lib-sum" style="font-size:12.5px;"></span></div>'
      +'<div id="lib-body"></div>';
    var tab="catalog", students=[], nameOf={}, gradeOf={}, whoami="";
    var sr=await sb.from("students").select("id,first_name,last_name,grade").eq("school_id",schoolId);
    students=sr.data||[];
    students.forEach(function(s){ nameOf[s.id]=s.first_name+" "+s.last_name; gradeOf[s.id]=s.grade||"—"; });
    try { var u=await sb.auth.getUser(); whoami=(u.data.user&&u.data.user.id)||""; } catch(e){}

    document.getElementById("lib-add").onclick=function(){ addBook(); };
    document.querySelectorAll("#lib-tabs button").forEach(function(b){
      b.onclick=function(){ tab=b.getAttribute("data-tab");
        document.querySelectorAll("#lib-tabs button").forEach(function(x){ x.className=""; });
        b.className="on-present"; render();
      };
    });

    function render(){
      if(tab==="catalog") return catalog();
      if(tab==="loans") return loans(false);
      if(tab==="due") return loans(true);
      return charges();
    }

    function todayStr(){ return new Date().toISOString().slice(0,10); }
    function dueStatus(dueDate){
      if(!dueDate) return {label:"No due date",cls:"gray"};
      var today=todayStr(), soon=new Date(Date.now()+3*864e5).toISOString().slice(0,10);
      if(dueDate<today) return {label:"Overdue",cls:"red"};
      if(dueDate<=soon) return {label:"Due soon",cls:"amber"};
      return {label:"On time",cls:"green"};
    }

    async function catalog(){
      var r=await sb.from("library_books").select("*").eq("school_id",schoolId).order("title");
      if(r.error){ document.getElementById("lib-body").innerHTML='<div class="empty">'+esc(r.error.message)+'</div>'; return; }
      var books=r.data||[];
      document.getElementById("lib-sum").textContent=books.length+" titles";
      if(!books.length){ document.getElementById("lib-body").innerHTML='<div class="empty">No books yet. Click <strong>+ Add book</strong>.</div>'; return; }
      var html='<table class="data"><thead><tr><th>Title</th><th>Author</th><th>Category</th><th>Shelf</th><th>Replacement cost</th><th>Available</th><th></th></tr></thead><tbody>';
      books.forEach(function(bk){
        var can=bk.copies_available>0;
        html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(bk.title)+'<div class="mono muted" style="font-size:11px;">'+esc(bk.isbn||"")+'</div></td>'
          +'<td>'+esc(bk.author||"—")+'</td><td>'+esc(bk.category||"—")+'</td><td>'+esc(bk.shelf_location||"—")+'</td>'
          +'<td>'+money(bk.replacement_cost)+'</td>'
          +'<td><span class="pill '+(can?"green":"red")+'">'+bk.copies_available+' / '+bk.copies_total+'</span></td>'
          +'<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-issue="'+bk.id+'"'+(can?"":" disabled")+'>Issue</button> <button class="btn-sm danger" data-del="'+bk.id+'">Delete</button></td></tr>';
      });
      html+='</tbody></table>';
      var t=document.getElementById("lib-body"); t.innerHTML=html;
      t.querySelectorAll("[data-issue]").forEach(function(b){ b.onclick=function(){ issue(books.find(function(x){return x.id===b.getAttribute("data-issue");})); }; });
      t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){
        if(!await window.SM_confirm("Delete this book?"))return;
        var r=await sb.from("library_books").delete().eq("id",b.getAttribute("data-del"));
        if(r.error){ toast("Error: "+r.error.message); return; } toast("Deleted"); catalog();
      };});
    }

    async function loans(dueOnly){
      var r=await sb.from("library_loans").select("*, library_books(title)").eq("school_id",schoolId).eq("status","active").order("due_date");
      if(r.error){ document.getElementById("lib-body").innerHTML='<div class="empty">'+esc(r.error.message)+'</div>'; return; }
      var ln=r.data||[];
      if(dueOnly){
        var today=todayStr(), soon=new Date(Date.now()+3*864e5).toISOString().slice(0,10);
        ln=ln.filter(function(l){ return l.due_date && l.due_date<=soon; });
      }
      document.getElementById("lib-sum").textContent=ln.length+(dueOnly?" due soon / overdue":" on loan");
      if(!ln.length){ document.getElementById("lib-body").innerHTML='<div class="empty">'+(dueOnly?"Nothing due soon — the shelf is current.":"Nothing on loan right now.")+'</div>'; return; }
      var html='<table class="data"><thead><tr><th>Book</th><th>Student</th><th>Class</th><th>Borrowed</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>';
      ln.forEach(function(l){
        var st=dueStatus(l.due_date);
        html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(l.library_books?l.library_books.title:"—")+'</td><td>'+esc(nameOf[l.student_id]||"—")+'</td>'
          +'<td>'+esc(l.class_at_borrow||gradeOf[l.student_id]||"—")+'</td>'
          +'<td>'+esc(l.borrowed_at)+'</td><td>'+esc(l.due_date||"—")+'</td>'
          +'<td><span class="pill '+st.cls+'">'+st.label+'</span></td>'
          +'<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-return="'+l.id+'" data-book="'+l.book_id+'">Return</button> <button class="btn-sm danger" data-lost="'+l.id+'" data-book="'+l.book_id+'">Mark lost</button></td></tr>';
      });
      html+='</tbody></table>';
      var t=document.getElementById("lib-body"); t.innerHTML=html;
      t.querySelectorAll("[data-return]").forEach(function(b){ b.onclick=function(){ ret(b.getAttribute("data-return"), b.getAttribute("data-book")); }; });
      t.querySelectorAll("[data-lost]").forEach(function(b){ b.onclick=function(){ markLost(ln.find(function(x){return x.id===b.getAttribute("data-lost");})); }; });
    }

    async function charges(){
      var r=await sb.from("library_charges").select("*").eq("school_id",schoolId).order("created_at",{ascending:false});
      if(r.error){ document.getElementById("lib-body").innerHTML='<div class="empty">'+esc(r.error.message)+'</div>'; return; }
      var ch=r.data||[];
      var unpaid=ch.filter(function(c){return c.status==="unpaid";}).length;
      document.getElementById("lib-sum").textContent=ch.length+" charges ("+unpaid+" unpaid)";
      if(!ch.length){ document.getElementById("lib-body").innerHTML='<div class="empty">No lost-book charges recorded. These are billed independently of the fee structure.</div>'; return; }
      var html='<table class="data"><thead><tr><th>Student</th><th>Book</th><th>Reason</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>';
      ch.forEach(function(c){
        var cls=c.status==="paid"?"green":(c.status==="waived"?"gray":"red");
        html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(nameOf[c.student_id]||"—")+'</td><td>'+esc(c.book_title)+'</td>'
          +'<td>'+esc(c.reason)+'</td><td>'+money(c.amount)+'</td>'
          +'<td><span class="pill '+cls+'">'+esc(c.status)+'</span></td>'
          +'<td style="text-align:right;white-space:nowrap;">'+(c.status==="unpaid"
            ?'<button class="btn-sm" data-paid="'+c.id+'">Mark paid</button> <button class="btn-sm" data-waive="'+c.id+'">Waive</button>'
            :'—')+'</td></tr>';
      });
      html+='</tbody></table>';
      var t=document.getElementById("lib-body"); t.innerHTML=html;
      t.querySelectorAll("[data-paid]").forEach(function(b){ b.onclick=async function(){
        var r=await sb.from("library_charges").update({status:"paid",paid_at:new Date().toISOString()}).eq("id",b.getAttribute("data-paid"));
        if(r.error){ toast("Error: "+r.error.message); return; } toast("Marked paid"); charges();
      };});
      t.querySelectorAll("[data-waive]").forEach(function(b){ b.onclick=async function(){
        if(!await window.SM_confirm("Waive this charge? The parent will no longer owe it."))return;
        var r=await sb.from("library_charges").update({status:"waived"}).eq("id",b.getAttribute("data-waive"));
        if(r.error){ toast("Error: "+r.error.message); return; } toast("Charge waived"); charges();
      };});
    }

    function addBook(){
      var m=modal('<h3>Add book</h3>'
        +'<div class="grid2">'
        +'<div class="field full"><label>Title</label><input id="b-title"></div>'
        +'<div class="field"><label>Author</label><input id="b-author"></div>'
        +'<div class="field"><label>Category</label><input id="b-cat" placeholder="Textbook"></div>'
        +'<div class="field"><label>ISBN</label><input id="b-isbn"></div>'
        +'<div class="field"><label>Shelf location</label><input id="b-shelf" placeholder="e.g. A3"></div>'
        +'<div class="field"><label>Copies</label><input id="b-copies" type="number" value="1" min="1"></div>'
        +'<div class="field"><label>Replacement cost (KES)</label><input id="b-cost" type="number" value="0" min="0"></div>'
        +'</div><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Add</button></div>');
      m.q("#c").onclick=m.close;
      m.q("#s").onclick=async function(){
        var n=Number(m.q("#b-copies").value)||1;
        var rec={ school_id:schoolId, title:m.q("#b-title").value.trim(), author:m.q("#b-author").value.trim()||null,
          category:m.q("#b-cat").value.trim()||null, isbn:m.q("#b-isbn").value.trim()||null,
          shelf_location:m.q("#b-shelf").value.trim()||null, replacement_cost:Number(m.q("#b-cost").value)||0,
          copies_total:n, copies_available:n };
        if(!rec.title){ toast("Title is required."); return; }
        var r=await sb.from("library_books").insert(rec);
        if(r.error){ toast("Error: "+r.error.message); return; }
        m.close(); toast("Book added"); catalog();
      };
    }
    function issue(bk){
      if(!students.length){ toast("Add a student first."); return; }
      var m=modal('<h3>Issue “'+esc(bk.title)+'”</h3>'
        +'<div class="grid2"><div class="field full"><label>Search student</label><input id="l-stu-search" placeholder="Type a name…"></div>'
        +'<div class="field full"><label>Student</label><select id="l-stu"></select></div>'
        +'<div class="field"><label>Days borrowed</label><input id="l-days" type="number" value="14" min="1"></div>'
        +'<div class="field"><label>Return due</label><input id="l-due-preview" disabled></div></div>'
        +'<div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Issue</button></div>');
      wireSearchSelect(m.q("#l-stu"), m.q("#l-stu-search"), students, function(s){ return s.first_name+" "+s.last_name+" — "+(s.grade||"—"); });
      function preview(){
        var d=Number(m.q("#l-days").value)||14;
        m.q("#l-due-preview").value=new Date(Date.now()+d*864e5).toISOString().slice(0,10);
      }
      m.q("#l-days").oninput=preview; preview();
      m.q("#c").onclick=m.close;
      m.q("#s").onclick=async function(){
        var days=Number(m.q("#l-days").value)||14;
        var studentId=m.q("#l-stu").value;
        var due=new Date(Date.now()+days*864e5).toISOString().slice(0,10);
        var ins=await sb.from("library_loans").insert({
          school_id:schoolId, book_id:bk.id, student_id:studentId,
          class_at_borrow:gradeOf[studentId]||null, days_allowed:days, due_date:due,
          status:"active", issued_by:whoami||null
        });
        if(ins.error){ toast("Error: "+ins.error.message); return; }
        await sb.from("library_books").update({ copies_available: bk.copies_available-1 }).eq("id",bk.id);
        m.close(); toast("Book issued — due "+due); render();
      };
    }
    async function ret(loanId, bookId){
      var today=todayStr();
      var r=await sb.from("library_loans").update({ returned_at:today, status:"returned", returned_by:whoami||null }).eq("id",loanId);
      if(r.error){ toast("Error: "+r.error.message); return; }
      var bk=await sb.from("library_books").select("copies_available,copies_total").eq("id",bookId).single();
      if(bk.data){ await sb.from("library_books").update({ copies_available: Math.min(bk.data.copies_total, bk.data.copies_available+1) }).eq("id",bookId); }
      toast("Book returned"); loans(tab==="due");
    }
    function markLost(loan){
      if(!loan) return;
      var bkTitle=(loan.library_books&&loan.library_books.title)||"this book";
      sb.from("library_books").select("*").eq("id",loan.book_id).single().then(function(bkr){
        var bk=bkr.data||{};
        var m=modal('<h3>Mark “'+esc(bkTitle)+'” lost</h3>'
          +'<p class="muted" style="font-size:12.5px;margin:0 0 10px;">This charges <strong>'+esc(nameOf[loan.student_id]||"the student")+'</strong> independently of the fee structure — it will appear to the parent as a separate Library Charge, not a fee item.</p>'
          +'<div class="field full"><label>Charge amount (KES)</label><input id="lost-amt" type="number" min="0" value="'+(bk.replacement_cost||0)+'"></div>'
          +'<div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Confirm lost</button></div>');
        m.q("#c").onclick=m.close;
        m.q("#s").onclick=async function(){
          var amt=Number(m.q("#lost-amt").value)||0;
          var today=todayStr();
          var upd=await sb.from("library_loans").update({ status:"lost", lost_at:today, lost_charge:amt }).eq("id",loan.id);
          if(upd.error){ toast("Error: "+upd.error.message); return; }
          if(amt>0){
            var ins=await sb.from("library_charges").insert({
              school_id:schoolId, student_id:loan.student_id, loan_id:loan.id,
              book_title:bkTitle, amount:amt, reason:"Lost book", status:"unpaid", recorded_by:whoami||null
            });
            if(ins.error){ toast("Loan marked lost, but charge failed: "+ins.error.message); m.close(); render(); return; }
          }
          if(bk.id){ await sb.from("library_books").update({ copies_total: Math.max(0,(bk.copies_total||1)-1) }).eq("id",bk.id); }
          m.close(); toast("Book marked lost"+(amt>0?" — KES "+amt+" charged":"")); render();
        };
      });
    }

    render();
  }

  // ====================================================
  //  TIMETABLE  (weekly scheduling grid)
  // ====================================================
  async function renderTimetable(sb, schoolId, el){
    var DAYS=["Mon","Tue","Wed","Thu","Fri"], PERIODS=[1,2,3,4,5,6];
    var sr=await sb.from("students").select("grade").eq("school_id",schoolId);
    var grades=Array.from(new Set((sr.data||[]).map(function(s){return s.grade;}).filter(Boolean))).sort();
    if(!grades.length) grades=["Grade 6"];
    var current=grades[0];
    el.innerHTML='<div class="mod-head"><div><h2>Timetable</h2><p>Set the weekly schedule per class. Empty cells are free periods.</p></div>'
      +'<div style="display:flex;gap:10px;"><button class="btn-sm" id="tt-load">Reload</button><button class="btn-primary indigo" id="tt-save">Save timetable</button></div></div>'
      +'<div class="toolbar"><div class="field"><label>Class</label><select id="tt-class"></select></div></div>'
      +'<div id="tt-grid" style="overflow-x:auto;"></div>';
    var csel=document.getElementById("tt-class");
    grades.forEach(function(g){ var o=document.createElement("option"); o.value=g; o.textContent=g; csel.appendChild(o); });
    csel.value=current; csel.onchange=function(){ current=csel.value; load(); };

    // Subjects + teachers assigned to this class in Settings (if any) feed
    // the pickers below; classes that haven't set that up yet still get
    // plain free-text fields exactly as before.
    async function loadClassMeta(grade){
      var cr=await sb.from("school_classes").select("id").eq("school_id",schoolId).eq("level",grade);
      var classIds=(cr.data||[]).map(function(c){return c.id;});
      if(!classIds.length) return {subjects:[], teacherByName:{}};
      var csr=await sb.from("class_subjects").select("subject_id, subjects(name)").in("class_id",classIds);
      var seen={}, subjects=[];
      (csr.data||[]).forEach(function(x){ if(x.subjects && !seen[x.subject_id]){ seen[x.subject_id]=true; subjects.push({id:x.subject_id, name:x.subjects.name}); } });
      subjects.sort(function(a,b){ return a.name<b.name?-1:(a.name>b.name?1:0); });
      var ctr=await sb.from("class_subject_teachers").select("subject_id, teachers(name)").in("class_id",classIds);
      var teacherById={}; (ctr.data||[]).forEach(function(x){ if(x.teachers) teacherById[x.subject_id]=x.teachers.name; });
      var teacherByName={}; subjects.forEach(function(s){ if(teacherById[s.id]) teacherByName[s.name]=teacherById[s.id]; });
      return {subjects:subjects, teacherByName:teacherByName};
    }

    async function load(){
      var meta=await loadClassMeta(current);
      var r=await sb.from("timetable_slots").select("*").eq("school_id",schoolId).eq("grade",current);
      var map={}; (r.data||[]).forEach(function(s){ map[s.day_of_week+"-"+s.period]={subject:s.subject,teacher:s.teacher||""}; });
      var html='<table class="data" style="min-width:680px;"><thead><tr><th style="width:64px;">Period</th>';
      DAYS.forEach(function(d){ html+='<th>'+d+'</th>'; });
      html+='</tr></thead><tbody>';
      PERIODS.forEach(function(p){
        html+='<tr><td style="font-weight:700;color:#1A1D26;">P'+p+'</td>';
        DAYS.forEach(function(d,di){
          var key=(di+1)+"-"+p, v=map[key]||{subject:"",teacher:""};
          var subjCell;
          if(meta.subjects.length){
            var opts='<option value="">— free period —</option>'+meta.subjects.map(function(s){ return '<option value="'+esc(s.name)+'"'+(v.subject===s.name?" selected":"")+'>'+esc(s.name)+'</option>'; }).join("");
            subjCell='<select class="tt-cell tt-subj" style="width:100%;margin-bottom:4px;font-family:inherit;font-size:12px;padding:5px 6px;border:1px solid #EEF0F2;border-radius:7px;" data-d="'+(di+1)+'" data-p="'+p+'" data-k="subject" data-prev="'+esc(v.subject)+'">'+opts+'</select>';
          } else {
            subjCell='<input class="tt-cell score-input" style="width:100%;text-align:left;margin-bottom:4px;" data-d="'+(di+1)+'" data-p="'+p+'" data-k="subject" placeholder="Subject" value="'+esc(v.subject)+'">';
          }
          var teacherVal=v.teacher||meta.teacherByName[v.subject]||"";
          html+='<td style="padding:6px;">'+subjCell
            +'<input class="tt-cell" style="width:100%;text-align:left;border:1px solid #EEF0F2;border-radius:7px;padding:5px 7px;font-family:inherit;font-size:11.5px;color:#667085;outline:none;" data-d="'+(di+1)+'" data-p="'+p+'" data-k="teacher" placeholder="Teacher" value="'+esc(teacherVal)+'"></td>';
        });
        html+='</tr>';
      });
      html+='</tbody></table>';
      document.getElementById("tt-grid").innerHTML=html;
      // picking a subject auto-fills its assigned teacher (still editable, e.g. for a substitute)
      document.querySelectorAll(".tt-subj").forEach(function(sel){
        sel.onchange=function(){
          var teacherInp=sel.closest("td").querySelector('[data-k="teacher"]');
          if(!teacherInp.value || teacherInp.value===meta.teacherByName[sel.getAttribute("data-prev")]) teacherInp.value=meta.teacherByName[sel.value]||"";
          sel.setAttribute("data-prev", sel.value);
        };
      });
    }
    document.getElementById("tt-load").onclick=load;
    document.getElementById("tt-save").onclick=async function(){
      var cells={};
      document.querySelectorAll(".tt-cell").forEach(function(inp){
        var k=inp.getAttribute("data-d")+"-"+inp.getAttribute("data-p");
        cells[k]=cells[k]||{}; cells[k][inp.getAttribute("data-k")]=inp.value.trim();
      });
      var rows=[];
      Object.keys(cells).forEach(function(k){
        if(cells[k].subject){ var dp=k.split("-"); rows.push({ school_id:schoolId, grade:current, day_of_week:Number(dp[0]), period:Number(dp[1]), subject:cells[k].subject, teacher:cells[k].teacher||null }); }
      });
      // replace this class's timetable atomically-ish
      var del=await sb.from("timetable_slots").delete().eq("school_id",schoolId).eq("grade",current);
      if(del.error){ toast("Error: "+del.error.message); return; }
      if(rows.length){ var ins=await sb.from("timetable_slots").insert(rows); if(ins.error){ toast("Error: "+ins.error.message); return; } }
      toast("Timetable saved for "+current+" ("+rows.length+" periods)");
    };
    load();
  }

  // ====================================================
  //  COMMUNICATIONS  (announcements feed)
  // ====================================================
  async function renderCommunications(sb, schoolId, el){
    var who="";
    try { var u=await sb.auth.getUser(); who=(u.data.user&&u.data.user.email)||""; } catch(e){}
    el.innerHTML='<div class="mod-head"><div><h2>Communications</h2><p>Post announcements to your school community.</p></div>'
      +'<button class="btn-primary" id="ann-new">+ New announcement</button></div><div id="ann-feed" style="margin-top:18px;"></div>';
    document.getElementById("ann-new").onclick=function(){ form(); };
    function audPill(a){ return a==="parents"?"amber":(a==="teachers"?"green":(a==="students"?"gray":"")); }
    async function load(){
      var r=await sb.from("announcements").select("*").eq("school_id",schoolId).order("created_at",{ascending:false});
      if(r.error){ document.getElementById("ann-feed").innerHTML='<div class="empty">'+esc(r.error.message)+'</div>'; return; }
      var items=r.data||[];
      if(!items.length){ document.getElementById("ann-feed").innerHTML='<div class="empty">No announcements yet.</div>'; return; }
      var html="";
      items.forEach(function(a){
        var when=new Date(a.created_at).toLocaleString();
        html+='<div class="panel" style="margin-bottom:12px;"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">'
          +'<div><div style="font-size:15px;font-weight:700;color:#1A1D26;">'+esc(a.title)+'</div>'
          +'<div class="muted" style="font-size:11.5px;margin-top:2px;">'+esc(when)+(a.created_by?(" · "+esc(a.created_by)):"")+'</div></div>'
          +'<div style="display:flex;align-items:center;gap:8px;"><span class="pill '+(audPill(a.audience)||"")+'" style="'+(a.audience==="all"?"color:#4F46E5;background:#EEF0FF;":"")+'">'+esc(a.audience)+'</span>'
          +'<button class="btn-sm danger" data-del="'+a.id+'">Delete</button></div></div>'
          +(a.body?'<p style="margin:10px 0 0;font-size:13.5px;color:#344054;line-height:1.5;">'+esc(a.body)+'</p>':"")+'</div>';
      });
      var f=document.getElementById("ann-feed"); f.innerHTML=html;
      f.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){
        if(!await window.SM_confirm("Delete this announcement?"))return;
        var r=await sb.from("announcements").delete().eq("id",b.getAttribute("data-del"));
        if(r.error){ toast("Error: "+r.error.message); return; } toast("Deleted"); load();
      };});
    }
    function form(){
      var m=modal('<h3>New announcement</h3>'
        +'<div class="grid2">'
        +'<div class="field full"><label>Title</label><input id="a-title"></div>'
        +'<div class="field full"><label>Message</label><textarea id="a-body" rows="4" style="border:1px solid #E2E5E9;border-radius:9px;padding:9px 11px;font-family:inherit;font-size:13.5px;outline:none;resize:vertical;"></textarea></div>'
        +'<div class="field full"><label>Audience</label><select id="a-aud"><option value="all">Everyone</option><option value="parents">Parents</option><option value="teachers">Teachers</option><option value="students">Students</option></select></div>'
        +'</div><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Post</button></div>');
      m.q("#c").onclick=m.close;
      m.q("#s").onclick=async function(){
        var rec={ school_id:schoolId, title:m.q("#a-title").value.trim(), body:m.q("#a-body").value.trim()||null, audience:m.q("#a-aud").value, created_by:who||null };
        if(!rec.title){ toast("Title is required."); return; }
        var r=await sb.from("announcements").insert(rec);
        if(r.error){ toast("Error: "+r.error.message); return; }
        m.close(); toast("Announcement posted"); load();
      };
    }
    load();
  }

  // ====================================================
  //  TRANSPORT  (routes · vehicles · assignments)
  // ====================================================
  async function renderTransport(sb, schoolId, el){
    var students=[], nameOf={};
    var sr=await sb.from("students").select("id,first_name,last_name").eq("school_id",schoolId);
    students=sr.data||[]; students.forEach(function(s){ nameOf[s.id]=s.first_name+" "+s.last_name; });
    var tab="routes";
    el.innerHTML='<div class="mod-head"><div><h2>Transport</h2><p>Routes, vehicles and student assignments.</p></div><div id="t-addwrap"></div></div>'
      +'<div class="toolbar"><div class="seg" id="t-tabs">'
      +'<button data-tab="routes" class="on-present">Routes</button><button data-tab="vehicles">Vehicles</button><button data-tab="assign">Assignments</button>'
      +'</div></div><div id="t-body"></div>';
    document.querySelectorAll("#t-tabs button").forEach(function(b){
      b.onclick=function(){ tab=b.getAttribute("data-tab"); document.querySelectorAll("#t-tabs button").forEach(function(x){x.className="";}); b.className="on-present"; render(); };
    });
    async function routesList(){ var r=await sb.from("transport_routes").select("*").eq("school_id",schoolId).order("name"); return r.data||[]; }

    async function render(){
      var add=document.getElementById("t-addwrap");
      if(tab==="routes"){ add.innerHTML='<button class="btn-primary" id="t-add">+ New route</button>'; document.getElementById("t-add").onclick=routeForm; await drawRoutes(); }
      else if(tab==="vehicles"){ add.innerHTML='<button class="btn-primary" id="t-add">+ New vehicle</button>'; document.getElementById("t-add").onclick=function(){ vehicleForm(); }; await drawVehicles(); }
      else { add.innerHTML='<button class="btn-primary" id="t-add">+ Assign student</button>'; document.getElementById("t-add").onclick=function(){ assignForm(); }; await drawAssign(); }
    }

    async function drawRoutes(){
      var routes=await routesList();
      var as=await sb.from("transport_assignments").select("route_id").eq("school_id",schoolId);
      var counts={}; (as.data||[]).forEach(function(a){ counts[a.route_id]=(counts[a.route_id]||0)+1; });
      if(!routes.length){ document.getElementById("t-body").innerHTML='<div class="empty">No routes yet.</div>'; return; }
      var html='<table class="data"><thead><tr><th>Route</th><th>Fare</th><th>Stops</th><th>Students</th><th></th></tr></thead><tbody>';
      routes.forEach(function(r){
        html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(r.name)+'</td><td>'+money(r.fare)+'</td><td class="muted" style="font-size:12.5px;">'+esc(r.stops||"—")+'</td><td>'+(counts[r.id]||0)+'</td>'
          +'<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-edit="'+r.id+'">Edit</button> <button class="btn-sm danger" data-del="'+r.id+'">Delete</button></td></tr>';
      });
      html+='</tbody></table>';
      var t=document.getElementById("t-body"); t.innerHTML=html;
      t.querySelectorAll("[data-edit]").forEach(function(b){ b.onclick=function(){ routeForm(routes.find(function(x){return x.id===b.getAttribute("data-edit");})); }; });
      t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete route?"))return; var r=await sb.from("transport_routes").delete().eq("id",b.getAttribute("data-del")); if(r.error){toast("Error: "+r.error.message);return;} toast("Deleted"); drawRoutes(); }; });
    }
    function routeForm(r){
      r=r||{};
      var m=modal('<h3>'+(r.id?"Edit route":"New route")+'</h3><div class="grid2">'
        +'<div class="field full"><label>Route name</label><input id="r-name" value="'+esc(r.name||"")+'"></div>'
        +'<div class="field"><label>Fare (KES)</label><input id="r-fare" type="number" value="'+(r.fare||0)+'"></div>'
        +'<div class="field full"><label>Stops (comma-separated)</label><input id="r-stops" value="'+esc(r.stops||"")+'"></div>'
        +'</div><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Save</button></div>');
      m.q("#c").onclick=m.close;
      m.q("#s").onclick=async function(){
        var rec={ school_id:schoolId, name:m.q("#r-name").value.trim(), fare:Number(m.q("#r-fare").value)||0, stops:m.q("#r-stops").value.trim()||null };
        if(!rec.name){ toast("Name required."); return; }
        var res=r.id?await sb.from("transport_routes").update(rec).eq("id",r.id):await sb.from("transport_routes").insert(rec);
        if(res.error){ toast("Error: "+res.error.message); return; } m.close(); toast("Saved"); drawRoutes();
      };
    }

    async function drawVehicles(){
      var routes=await routesList(); var rname={}; routes.forEach(function(r){ rname[r.id]=r.name; });
      var v=await sb.from("transport_vehicles").select("*").eq("school_id",schoolId).order("reg_no");
      var veh=v.data||[];
      if(!veh.length){ document.getElementById("t-body").innerHTML='<div class="empty">No vehicles yet.</div>'; return; }
      var html='<table class="data"><thead><tr><th>Reg. no</th><th>Capacity</th><th>Driver</th><th>Route</th><th></th></tr></thead><tbody>';
      veh.forEach(function(x){
        html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(x.reg_no)+'</td><td>'+(x.capacity||"—")+'</td>'
          +'<td>'+esc(x.driver_name||"—")+'<div class="muted" style="font-size:11px;">'+esc(x.driver_phone||"")+'</div></td>'
          +'<td>'+esc(x.route_id?(rname[x.route_id]||"—"):"—")+'</td>'
          +'<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-edit="'+x.id+'">Edit</button> <button class="btn-sm danger" data-del="'+x.id+'">Delete</button></td></tr>';
      });
      html+='</tbody></table>';
      var t=document.getElementById("t-body"); t.innerHTML=html;
      t.querySelectorAll("[data-edit]").forEach(function(b){ b.onclick=function(){ vehicleForm(veh.find(function(y){return y.id===b.getAttribute("data-edit");}),routes); }; });
      t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete vehicle?"))return; var r=await sb.from("transport_vehicles").delete().eq("id",b.getAttribute("data-del")); if(r.error){toast("Error: "+r.error.message);return;} toast("Deleted"); drawVehicles(); }; });
    }
    async function vehicleForm(x, routes){
      x=x||{}; routes=routes||await routesList();
      var opts='<option value="">— none —</option>'+routes.map(function(r){ return '<option value="'+r.id+'"'+(x.route_id===r.id?" selected":"")+'>'+esc(r.name)+'</option>'; }).join("");
      var m=modal('<h3>'+(x.id?"Edit vehicle":"New vehicle")+'</h3><div class="grid2">'
        +'<div class="field"><label>Reg. no</label><input id="v-reg" value="'+esc(x.reg_no||"")+'"></div>'
        +'<div class="field"><label>Capacity</label><input id="v-cap" type="number" value="'+(x.capacity||"")+'"></div>'
        +'<div class="field"><label>Driver</label><input id="v-driver" value="'+esc(x.driver_name||"")+'"></div>'
        +'<div class="field"><label>Driver phone</label><input id="v-phone" value="'+esc(x.driver_phone||"")+'"></div>'
        +'<div class="field full"><label>Route</label><select id="v-route">'+opts+'</select></div>'
        +'</div><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Save</button></div>');
      m.q("#c").onclick=m.close;
      m.q("#s").onclick=async function(){
        var rec={ school_id:schoolId, reg_no:m.q("#v-reg").value.trim(), capacity:Number(m.q("#v-cap").value)||null, driver_name:m.q("#v-driver").value.trim()||null, driver_phone:m.q("#v-phone").value.trim()||null, route_id:m.q("#v-route").value||null };
        if(!rec.reg_no){ toast("Reg. no required."); return; }
        var res=x.id?await sb.from("transport_vehicles").update(rec).eq("id",x.id):await sb.from("transport_vehicles").insert(rec);
        if(res.error){ toast("Error: "+res.error.message); return; } m.close(); toast("Saved"); drawVehicles();
      };
    }

    async function drawAssign(){
      var routes=await routesList(); var rname={}; routes.forEach(function(r){ rname[r.id]=r.name; });
      var a=await sb.from("transport_assignments").select("*").eq("school_id",schoolId);
      var rows=a.data||[];
      if(!rows.length){ document.getElementById("t-body").innerHTML='<div class="empty">No students assigned to transport yet.</div>'; return; }
      var html='<table class="data"><thead><tr><th>Student</th><th>Route</th><th>Pickup stop</th><th></th></tr></thead><tbody>';
      rows.forEach(function(x){
        html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(nameOf[x.student_id]||"—")+'</td><td>'+esc(rname[x.route_id]||"—")+'</td><td>'+esc(x.pickup_stop||"—")+'</td>'
          +'<td style="text-align:right;"><button class="btn-sm danger" data-del="'+x.id+'">Remove</button></td></tr>';
      });
      html+='</tbody></table>';
      var t=document.getElementById("t-body"); t.innerHTML=html;
      t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){ var r=await sb.from("transport_assignments").delete().eq("id",b.getAttribute("data-del")); if(r.error){toast("Error: "+r.error.message);return;} toast("Removed"); drawAssign(); }; });
    }
    async function assignForm(){
      var routes=await routesList();
      if(!students.length){ toast("Add a student first."); return; }
      if(!routes.length){ toast("Create a route first."); return; }
      var rOpts=routes.map(function(r){ return '<option value="'+r.id+'">'+esc(r.name)+'</option>'; }).join("");
      var m=modal('<h3>Assign student to transport</h3><div class="grid2">'
        +'<div class="field full"><label>Search student</label><input id="as-stu-search" placeholder="Type a name…"></div>'
        +'<div class="field full"><label>Student</label><select id="as-stu"></select></div>'
        +'<div class="field full"><label>Route</label><select id="as-route">'+rOpts+'</select></div>'
        +'<div class="field full"><label>Pickup stop</label><input id="as-stop"></div>'
        +'</div><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Assign</button></div>');
      wireSearchSelect(m.q("#as-stu"), m.q("#as-stu-search"), students, function(s){ return s.first_name+" "+s.last_name; });
      m.q("#c").onclick=m.close;
      m.q("#s").onclick=async function(){
        var rec={ school_id:schoolId, student_id:m.q("#as-stu").value, route_id:m.q("#as-route").value, pickup_stop:m.q("#as-stop").value.trim()||null };
        var r=await sb.from("transport_assignments").upsert(rec,{ onConflict:"student_id" });
        if(r.error){ toast("Error: "+r.error.message); return; } m.close(); toast("Student assigned"); drawAssign();
      };
    }
    render();
  }

  // ====================================================
  //  ANALYTICS  (read-only — aggregates other modules)
  // ====================================================
  function bars(items, color){
    var max=Math.max.apply(null, items.map(function(i){return i.v;}).concat([1]));
    return items.map(function(i){
      var w=Math.round(i.v/max*100);
      return '<div style="margin:9px 0;"><div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px;"><span style="color:#475467;">'+esc(i.label)+'</span><span style="font-weight:600;color:#1A1D26;">'+esc(i.disp!=null?i.disp:i.v)+'</span></div>'
        +'<div style="height:8px;border-radius:5px;background:#F1F2F6;overflow:hidden;"><div style="height:100%;border-radius:5px;width:'+w+'%;background:'+color+';"></div></div></div>';
    }).join("");
  }
  async function renderAnalytics(sb, schoolId, el){
    el.innerHTML='<div class="mod-head"><div><h2>Analytics Pro</h2><p>Cross-module insights from your live data.</p></div></div><div id="an-body"><div class="empty">Crunching your data…</div></div>';
    // pull data
    var st=(await sb.from("students").select("grade,status").eq("school_id",schoolId)).data||[];
    var active=st.filter(function(s){return s.status==="active";}).length;
    var fees=(await sb.from("fee_invoices").select("amount,paid").eq("school_id",schoolId)).data||[];
    var collected=fees.filter(function(f){return f.paid;}).reduce(function(a,f){return a+f.amount;},0);
    var outstanding=fees.filter(function(f){return !f.paid;}).reduce(function(a,f){return a+f.amount;},0);
    var since=new Date(Date.now()-30*864e5).toISOString().slice(0,10);
    var att=(await sb.from("attendance").select("status,on_date").eq("school_id",schoolId).gte("on_date",since)).data||[];
    var present=att.filter(function(a){return a.status==="present";}).length;
    var attRate=att.length?Math.round(present/att.length*100):null;

    // enrollment by grade
    var byGrade={}; st.forEach(function(s){ var g=s.grade||"Unspecified"; byGrade[g]=(byGrade[g]||0)+1; });
    var gradeBars=Object.keys(byGrade).sort().map(function(g){ return { label:g, v:byGrade[g] }; });

    // avg exam % by subject
    var exams=(await sb.from("exams").select("id,subject,max_score").eq("school_id",schoolId)).data||[];
    var exMap={}; exams.forEach(function(e){ exMap[e.id]=e; });
    var results=(await sb.from("exam_results").select("exam_id,score").eq("school_id",schoolId)).data||[];
    var subjAgg={};
    results.forEach(function(r){ var e=exMap[r.exam_id]; if(!e)return; var pct=r.score/(e.max_score||100)*100; subjAgg[e.subject]=subjAgg[e.subject]||{sum:0,n:0}; subjAgg[e.subject].sum+=pct; subjAgg[e.subject].n++; });
    var subjBars=Object.keys(subjAgg).map(function(s){ var avg=subjAgg[s].sum/subjAgg[s].n; return { label:s, v:Math.round(avg), disp:Math.round(avg)+"%" }; });

    // attendance breakdown
    var brk=[["present","Present"],["late","Late"],["absent","Absent"]].map(function(p){ return { label:p[1], v:att.filter(function(a){return a.status===p[0];}).length }; });

    var html='<div class="kpis">'
      +'<div class="panel"><div class="muted" style="font-size:12.5px;">Active students</div><div style="font-size:25px;font-weight:700;margin-top:7px;">'+active+'</div></div>'
      +'<div class="panel"><div class="muted" style="font-size:12.5px;">Attendance (30d)</div><div style="font-size:25px;font-weight:700;margin-top:7px;">'+(attRate==null?"—":attRate+"%")+'</div></div>'
      +'<div class="panel"><div class="muted" style="font-size:12.5px;">Fees collected</div><div style="font-size:25px;font-weight:700;margin-top:7px;color:#067647;">'+money(collected)+'</div></div>'
      +'</div>';
    html+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px;">';
    html+='<div class="panel"><strong style="font-size:14px;">Enrollment by grade</strong>'+(gradeBars.length?bars(gradeBars,"#4F46E5"):'<div class="muted" style="margin-top:10px;font-size:13px;">No students.</div>')+'</div>';
    html+='<div class="panel"><strong style="font-size:14px;">Avg exam score by subject</strong>'+(subjBars.length?bars(subjBars,"#0E9384"):'<div class="muted" style="margin-top:10px;font-size:13px;">No exam results yet.</div>')+'</div>';
    html+='<div class="panel"><strong style="font-size:14px;">Attendance breakdown (30d)</strong>'+(att.length?bars(brk,"#B54708"):'<div class="muted" style="margin-top:10px;font-size:13px;">No attendance recorded.</div>')+'</div>';
    html+='<div class="panel"><strong style="font-size:14px;">Fees status</strong>'+bars([{label:"Collected",v:collected,disp:money(collected)},{label:"Outstanding",v:outstanding,disp:money(outstanding)}],"#4F46E5")+'</div>';
    html+='</div>';
    document.getElementById("an-body").innerHTML=html;
  }

  // ====================================================
  //  PAYROLL  (staff + runs + Kenyan statutory deductions +
  //  loans/advances + TSC-style payslip via assets/payslip.js)
  // ====================================================
  async function renderPayroll(sb, schoolId, el){
    var tab="staff";
    var school = { name: schoolId };
    // Kicked off now, awaited inside render() below — payslip.js isn't
    // needed by every admin session, so it's not paid for until Payroll
    // is actually opened. Resolves instantly on every render() after the
    // first (loadScriptOnce memoizes), so this stays cheap on every tab switch.
    var payslipLoad = window.loadScriptOnce ? window.loadScriptOnce("../assets/payslip.js") : Promise.resolve();
    var sc = await sb.from("schools").select("name").eq("id",schoolId).single();
    if (sc.data) school.name = sc.data.name;

    el.innerHTML='<div class="mod-head"><div><h2>Payroll</h2><p>Staff records, loans/advances and monthly runs with PAYE, NSSF, SHIF &amp; Housing Levy.</p></div><div id="pr-addwrap"></div></div>'
      +'<div class="toolbar"><div class="seg" id="pr-tabs"><button data-tab="staff" class="on-present">Staff</button><button data-tab="loans">Loans &amp; Advances</button><button data-tab="runs">Payroll runs</button></div></div>'
      +'<div id="pr-body"></div>';
    document.querySelectorAll("#pr-tabs button").forEach(function(b){
      b.onclick=function(){ tab=b.getAttribute("data-tab"); document.querySelectorAll("#pr-tabs button").forEach(function(x){x.className="";}); b.className="on-present"; render(); };
    });
    async function render(){
      await payslipLoad;
      var add=document.getElementById("pr-addwrap");
      if(tab==="staff"){ add.innerHTML='<button class="btn-primary" id="pr-add">+ New staff</button>'; document.getElementById("pr-add").onclick=function(){ staffForm(); }; drawStaff(); }
      else if(tab==="loans"){ add.innerHTML='<button class="btn-primary" id="pr-add">+ New loan/advance</button>'; document.getElementById("pr-add").onclick=function(){ loanForm(); }; drawLoans(); }
      else { add.innerHTML='<button class="btn-primary" id="pr-add">+ Run payroll</button>'; document.getElementById("pr-add").onclick=function(){ newRun(); }; drawRuns(); }
    }

    async function loadStaff(){ var r=await sb.from("staff").select("*").eq("school_id",schoolId).order("full_name"); return r.data||[]; }
    async function loadTeachers(){ var r=await sb.from("teachers").select("id,name,email").eq("school_id",schoolId).order("name"); return r.data||[]; }

    // ---- STAFF ----
    var staffPage=1;
    async function drawStaff(pg){
      if(typeof pg==="number") staffPage=pg; else staffPage=1;
      var rows=await loadStaff();
      if(!rows.length){ document.getElementById("pr-body").innerHTML='<div class="empty">No staff yet. Click <strong>+ New staff</strong>.</div>'; return; }
      var pgData=window.paginate?window.paginate(rows,staffPage,25):{rows:rows,html:""};
      var html='<table class="data"><thead><tr><th>Name</th><th>Role</th><th>KRA PIN</th><th>Basic</th><th>Allowances</th><th>Net (est.)</th><th></th></tr></thead><tbody>';
      pgData.rows.forEach(function(s){
        var ps=window.SamajiPayslip.compute(s.basic_salary, s.house_allowance, s.transport_allowance, s.allowances, []);
        var totalAllow=(s.house_allowance||0)+(s.transport_allowance||0)+(s.allowances||0);
        html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(s.full_name)+(s.active?"":' <span class="pill gray">inactive</span>')+(s.teacher_id?' <span class="pill green" title="Linked to a teacher-portal login">portal</span>':'')+'</td><td>'+esc(s.role||"—")+'</td>'
          +'<td class="mono" style="font-size:12px;">'+esc(s.kra_pin||"—")+'</td><td>'+money(s.basic_salary)+'</td><td>'+money(totalAllow)+'</td>'
          +'<td style="font-weight:600;">'+money(ps.net)+'</td>'
          +'<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-edit="'+s.id+'">Edit</button> <button class="btn-sm danger" data-del="'+s.id+'">Delete</button></td></tr>';
      });
      html+='</tbody></table>'+pgData.html;
      var t=document.getElementById("pr-body"); t.innerHTML=html;
      t.querySelectorAll("[data-edit]").forEach(function(b){ b.onclick=function(){ staffForm(rows.find(function(x){return x.id===b.getAttribute("data-edit");})); }; });
      t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete this staff member?"))return; var r=await sb.from("staff").delete().eq("id",b.getAttribute("data-del")); if(r.error){toast("Error: "+r.error.message);return;} toast("Deleted"); drawStaff(); }; });
      if(pgData.onAttach) pgData.onAttach(t,function(p){ drawStaff(p); });
    }
    async function staffForm(s){
      s=s||{};
      var teachers=await loadTeachers();
      var tOpts='<option value="">— not linked (non-teaching staff) —</option>'+teachers.map(function(t){ return '<option value="'+t.id+'"'+(s.teacher_id===t.id?" selected":"")+'>'+esc(t.name)+(t.email?" ("+esc(t.email)+")":"")+'</option>'; }).join("");
      var m=modal('<h3>'+(s.id?"Edit staff":"New staff")+'</h3><p class="muted" style="font-size:12.5px;margin:0 0 6px;">Link to a teacher so they can see this payslip &amp; P9 in their own Teacher Portal login.</p><div class="grid2">'
        +'<div class="field full"><label>Full name</label><input id="s-name" value="'+esc(s.full_name||"")+'"></div>'
        +'<div class="field full"><label>Link to teacher (optional)</label><select id="s-teacher">'+tOpts+'</select></div>'
        +'<div class="field"><label>Role / designation</label><input id="s-role" value="'+esc(s.role||"")+'" placeholder="Senior Teacher"></div>'
        +'<div class="field"><label>Station</label><input id="s-station" value="'+esc(s.station||"")+'" placeholder="Same as school, or a different one"></div>'
        +'<div class="field"><label>ID number</label><input id="s-idno" value="'+esc(s.id_no||"")+'"></div>'
        +'<div class="field"><label>TSC / payroll number</label><input id="s-payno" value="'+esc(s.payroll_no||"")+'"></div>'
        +'<div class="field"><label>KRA PIN</label><input id="s-pin" value="'+esc(s.kra_pin||"")+'"></div>'
        +'<div class="field"><label>Basic salary</label><input id="s-basic" type="number" value="'+(s.basic_salary||0)+'"></div>'
        +'<div class="field"><label>Rental/House allowance</label><input id="s-house" type="number" value="'+(s.house_allowance||0)+'"></div>'
        +'<div class="field"><label>Commuter/Transport allowance</label><input id="s-transport" type="number" value="'+(s.transport_allowance||0)+'"></div>'
        +'<div class="field"><label>Other allowances</label><input id="s-allow" type="number" value="'+(s.allowances||0)+'"></div>'
        +'<div class="field"><label>Phone</label><input id="s-phone" value="'+esc(s.phone||"")+'"></div>'
        +'<div class="field"><label>Status</label><select id="s-active"><option value="true"'+(s.active!==false?" selected":"")+'>active</option><option value="false"'+(s.active===false?" selected":"")+'>inactive</option></select></div>'
        +'</div><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Save</button></div>', true);
      m.q("#c").onclick=m.close;
      m.q("#s").onclick=async function(){
        var rec={ school_id:schoolId, full_name:m.q("#s-name").value.trim(), role:m.q("#s-role").value.trim()||null, kra_pin:m.q("#s-pin").value.trim()||null,
          teacher_id:m.q("#s-teacher").value||null, station:m.q("#s-station").value.trim()||null,
          id_no:m.q("#s-idno").value.trim()||null, payroll_no:m.q("#s-payno").value.trim()||null,
          basic_salary:Number(m.q("#s-basic").value)||0, house_allowance:Number(m.q("#s-house").value)||0, transport_allowance:Number(m.q("#s-transport").value)||0,
          allowances:Number(m.q("#s-allow").value)||0, phone:m.q("#s-phone").value.trim()||null, active:m.q("#s-active").value==="true" };
        if(!rec.full_name){ toast("Name required."); return; }
        var res=s.id?await sb.from("staff").update(rec).eq("id",s.id):await sb.from("staff").insert(rec);
        if(res.error){ toast(res.error.message.indexOf("staff_teacher_uidx")>=0?"That teacher is already linked to another staff record.":("Error: "+res.error.message)); return; } m.close(); toast("Saved"); drawStaff();
      };
    }

    // ---- LOANS / ADVANCES ----
    async function drawLoans(){
      var staff=await loadStaff(); var nameOf={}; staff.forEach(function(s){ nameOf[s.id]=s.full_name; });
      var r=await sb.from("staff_deductions").select("*").eq("school_id",schoolId).order("created_at",{ascending:false});
      var rows=r.data||[];
      if(!rows.length){ document.getElementById("pr-body").innerHTML='<div class="empty">No loans or salary advances recorded. These are deducted automatically from each payroll run until repaid.</div>'; return; }
      var html='<table class="data"><thead><tr><th>Staff</th><th>Type</th><th>Description</th><th style="text-align:right;">Principal</th><th style="text-align:right;">Monthly</th><th style="text-align:right;">Balance</th><th>Status</th><th></th></tr></thead><tbody>';
      rows.forEach(function(d){
        html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(nameOf[d.staff_id]||"—")+'</td><td><span class="pill '+(d.kind==="loan"?"amber":"gray")+'">'+esc(d.kind)+'</span></td>'
          +'<td>'+esc(d.description||"—")+'</td><td style="text-align:right;">'+money(d.principal)+'</td><td style="text-align:right;">'+money(d.monthly_amount)+'</td>'
          +'<td style="text-align:right;font-weight:600;">'+money(d.balance)+'</td><td><span class="pill '+(d.status==="active"?"green":d.status==="completed"?"gray":"red")+'">'+esc(d.status)+'</span></td>'
          +'<td style="text-align:right;white-space:nowrap;">'+(d.status==="active"?'<button class="btn-sm" data-cancel="'+d.id+'">Cancel</button> ':'')+'<button class="btn-sm danger" data-del="'+d.id+'">Delete</button></td></tr>';
      });
      html+='</tbody></table>';
      var t=document.getElementById("pr-body"); t.innerHTML=html;
      t.querySelectorAll("[data-cancel]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Stop deducting this loan/advance? Remaining balance is written off."))return; var r=await sb.from("staff_deductions").update({status:"cancelled"}).eq("id",b.getAttribute("data-cancel")); if(r.error){toast("Error: "+r.error.message);return;} toast("Cancelled"); drawLoans(); }; });
      t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete this record? Past payslips already keep their own deduction history."))return; var r=await sb.from("staff_deductions").delete().eq("id",b.getAttribute("data-del")); if(r.error){toast("Error: "+r.error.message);return;} toast("Deleted"); drawLoans(); }; });
    }
    async function loanForm(){
      var staff=await loadStaff();
      if(!staff.length){ toast("Add staff first."); return; }
      var sOpts=staff.map(function(s){ return '<option value="'+s.id+'">'+esc(s.full_name)+'</option>'; }).join("");
      var m=modal('<h3>New loan / advance</h3><p class="muted" style="font-size:12.5px;margin:0 0 6px;">A fixed instalment is deducted from every payroll run until the balance reaches zero.</p><div class="grid2">'
        +'<div class="field full"><label>Staff</label><select id="ln-staff">'+sOpts+'</select></div>'
        +'<div class="field"><label>Type</label><select id="ln-kind"><option value="advance">Salary advance</option><option value="loan">Loan</option></select></div>'
        +'<div class="field"><label>Description</label><input id="ln-desc" placeholder="e.g. School fees advance"></div>'
        +'<div class="field"><label>Principal amount</label><input id="ln-principal" type="number" value="0"></div>'
        +'<div class="field"><label>Monthly deduction</label><input id="ln-monthly" type="number" value="0"></div>'
        +'</div><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Save</button></div>', true);
      m.q("#c").onclick=m.close;
      m.q("#s").onclick=async function(){
        var principal=Number(m.q("#ln-principal").value)||0, monthly=Number(m.q("#ln-monthly").value)||0;
        if(!principal||!monthly){ toast("Enter a principal amount and a monthly deduction."); return; }
        var rec={ school_id:schoolId, staff_id:m.q("#ln-staff").value, kind:m.q("#ln-kind").value, description:m.q("#ln-desc").value.trim()||null,
          principal:principal, monthly_amount:monthly, balance:principal, status:"active" };
        var r=await sb.from("staff_deductions").insert(rec);
        if(r.error){ toast("Error: "+r.error.message); return; } m.close(); toast("Recorded"); drawLoans();
      };
    }

    // ---- RUNS ----
    async function drawRuns(){
      var r=await sb.from("payroll_runs").select("*").eq("school_id",schoolId).order("period",{ascending:false});
      var runs=r.data||[];
      if(!runs.length){ document.getElementById("pr-body").innerHTML='<div class="empty">No payroll runs yet. Click <strong>+ Run payroll</strong>.</div>'; return; }
      var html='<table class="data"><thead><tr><th>Period</th><th>Status</th><th></th></tr></thead><tbody>';
      runs.forEach(function(x){
        html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(x.period)+'</td><td><span class="pill '+(x.status==="finalized"?"green":"amber")+'">'+esc(x.status)+'</span></td>'
          +'<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-open="'+x.id+'">Open</button> <button class="btn-sm danger" data-del="'+x.id+'">Delete</button></td></tr>';
      });
      html+='</tbody></table>';
      var t=document.getElementById("pr-body"); t.innerHTML=html;
      t.querySelectorAll("[data-open]").forEach(function(b){ b.onclick=function(){ runDetail(runs.find(function(y){return y.id===b.getAttribute("data-open");})); }; });
      t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete this run and its payslips?"))return; var r=await sb.from("payroll_runs").delete().eq("id",b.getAttribute("data-del")); if(r.error){toast("Error: "+r.error.message);return;} toast("Deleted"); drawRuns(); }; });
    }
    async function newRun(){
      var now=new Date(); var period=now.toISOString().slice(0,7);
      var staff=await loadStaff(); var active=staff.filter(function(s){return s.active;});
      if(!active.length){ toast("No active staff to pay."); return; }
      var rows=active.map(function(s){ return '<label style="display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:1px solid var(--line-2);font-size:13px;cursor:pointer;"><input type="checkbox" class="run-chk" data-staff="'+s.id+'" checked> '+esc(s.full_name)+' <span class="muted" style="margin-left:auto;font-size:11.5px;">'+esc(s.role||"")+'</span></label>'; }).join("");
      var m=modal('<h3>Run payroll</h3><p class="muted" style="font-size:12.5px;margin:0;">Pick the period and which staff to pay. Loans/advances due are deducted automatically.</p>'
        +'<div class="grid2"><div class="field full"><label>Period (month)</label><input id="run-period" type="month" value="'+period+'"></div></div>'
        +'<div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;"><strong style="font-size:13px;">Staff to pay</strong><button class="btn-sm" id="run-toggle" type="button">Select/deselect all</button></div>'
        +'<div style="max-height:280px;overflow:auto;margin-top:4px;">'+rows+'</div>'
        +'<div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Generate</button></div>', true);
      m.q("#c").onclick=m.close;
      m.q("#run-toggle").onclick=function(){ var boxes=m.qa(".run-chk"); var allOn=boxes.every(function(b){return b.checked;}); boxes.forEach(function(b){ b.checked=!allOn; }); };
      m.q("#s").onclick=async function(){
        var p=m.q("#run-period").value; if(!p){ toast("Pick a period."); return; }
        var pickedIds=m.qa(".run-chk").filter(function(b){return b.checked;}).map(function(b){return b.getAttribute("data-staff");});
        if(!pickedIds.length){ toast("Select at least one staff member."); return; }
        var picked=active.filter(function(s){ return pickedIds.indexOf(s.id)>=0; });
        // get or create the run for this period
        var runRes=await sb.from("payroll_runs").select("*").eq("school_id",schoolId).eq("period",p).maybeSingle();
        var run=runRes.data;
        if(!run){
          var ins=await sb.from("payroll_runs").insert({ school_id:schoolId, period:p, status:"draft" }).select().single();
          if(ins.error){ toast("Error: "+ins.error.message); return; }
          run=ins.data;
        } else if(run.status==="finalized"){ toast("The "+p+" run is already finalized."); return; }
        // refund any deduction instalments already applied to a re-generated slip in THIS run,
        // so re-running the same staff twice doesn't double-deduct their loan balance
        var existingRes=await sb.from("payslips").select("staff_id,deduction_lines").eq("run_id",run.id).in("staff_id",pickedIds);
        var refunds={}; // deduction id -> amount to add back to balance
        (existingRes.data||[]).forEach(function(row){ (row.deduction_lines||[]).forEach(function(l){ if(l.id) refunds[l.id]=(refunds[l.id]||0)+l.amount; }); });
        if(Object.keys(refunds).length){
          var ded=await sb.from("staff_deductions").select("*").in("id",Object.keys(refunds));
          for (var i=0;i<(ded.data||[]).length;i++){
            var d=ded.data[i]; var newBal=d.balance+refunds[d.id];
            await sb.from("staff_deductions").update({ balance:newBal, status: newBal>0 ? "active" : d.status }).eq("id",d.id);
          }
        }
        // fetch fresh (post-refund) active deductions for the picked staff
        var dedRes=await sb.from("staff_deductions").select("*").eq("status","active").in("staff_id",pickedIds);
        var dedByStaff={}; (dedRes.data||[]).forEach(function(d){ (dedByStaff[d.staff_id]=dedByStaff[d.staff_id]||[]).push(d); });
        var slips=[], dedUpdates=[];
        picked.forEach(function(s){
          var lines=[];
          (dedByStaff[s.id]||[]).forEach(function(d){
            var amt=Math.min(d.monthly_amount, d.balance);
            if(amt<=0) return;
            lines.push({ id:d.id, label:(d.kind==="loan"?"Loan":"Advance")+(d.description?" — "+d.description:""), amount:amt });
            dedUpdates.push({ id:d.id, balance:d.balance-amt });
          });
          var c=window.SamajiPayslip.compute(s.basic_salary, s.house_allowance, s.transport_allowance, s.allowances, lines);
          slips.push({ school_id:schoolId, run_id:run.id, staff_id:s.id, basic:c.basic, house_allowance:c.house_allowance, transport_allowance:c.transport_allowance,
            allowances:c.allowances, gross:c.gross, paye:c.paye, nssf:c.nssf, shif:c.shif, housing_levy:c.housing_levy,
            deductions_other:c.deductions_other, deduction_lines:c.deduction_lines, net:c.net });
        });
        var insSlips=await sb.from("payslips").upsert(slips,{ onConflict:"run_id,staff_id" });
        if(insSlips.error){ toast("Error: "+insSlips.error.message); return; }
        for (var j=0;j<dedUpdates.length;j++){
          var u=dedUpdates[j];
          await sb.from("staff_deductions").update({ balance:u.balance, status: u.balance<=0 ? "completed" : "active" }).eq("id",u.id);
        }
        m.close(); toast("Payroll generated for "+p); runDetail(run);
      };
    }
    async function runDetail(run){
      var sres=await sb.from("staff").select("id,full_name,role,station,payroll_no,id_no,kra_pin").eq("school_id",schoolId);
      var sName={}; (sres.data||[]).forEach(function(s){ sName[s.id]=s; });
      var pres=await sb.from("payslips").select("*").eq("run_id",run.id);
      var slips=pres.data||[];
      var tot=slips.reduce(function(a,p){ a.gross+=p.gross;a.paye+=p.paye;a.nssf+=p.nssf;a.shif+=p.shif;a.housing+=p.housing_levy;a.other+=(p.deductions_other||0);a.net+=p.net; return a; },{gross:0,paye:0,nssf:0,shif:0,housing:0,other:0,net:0});
      el.innerHTML='<div class="mod-head"><div><h2>Payroll · '+esc(run.period)+'</h2><p>'+slips.length+' staff · <span class="pill '+(run.status==="finalized"?"green":"amber")+'">'+esc(run.status)+'</span></p></div>'
        +'<div style="display:flex;gap:10px;"><button class="btn-sm" id="pr-back">← All runs</button>'+(run.status!=="finalized"?'<button class="btn-primary indigo" id="pr-final">Finalize</button>':"")+'</div></div>'
        +'<div class="kpis" style="grid-template-columns:repeat(3,1fr);"><div class="panel"><div class="muted" style="font-size:12.5px;">Gross</div><div style="font-size:22px;font-weight:700;margin-top:6px;">'+money(tot.gross)+'</div></div>'
        +'<div class="panel"><div class="muted" style="font-size:12.5px;">Total deductions</div><div style="font-size:22px;font-weight:700;margin-top:6px;color:#B54708;">'+money(tot.paye+tot.nssf+tot.shif+tot.housing+tot.other)+'</div></div>'
        +'<div class="panel"><div class="muted" style="font-size:12.5px;">Net pay</div><div style="font-size:22px;font-weight:700;margin-top:6px;color:#067647;">'+money(tot.net)+'</div></div></div>'
        +'<div style="overflow-x:auto;margin-top:18px;"><table class="data" style="min-width:820px;"><thead><tr><th>Staff</th><th style="text-align:right;">Gross</th><th style="text-align:right;">PAYE</th><th style="text-align:right;">NSSF</th><th style="text-align:right;">SHIF</th><th style="text-align:right;">Housing</th><th style="text-align:right;">Loans/Adv.</th><th style="text-align:right;">Net</th><th></th></tr></thead><tbody id="pr-slips"></tbody>'
        +'<tfoot><tr style="font-weight:700;background:#FCFCFD;"><td style="padding:11px 14px;">Totals</td><td style="text-align:right;padding:11px 14px;">'+money(tot.gross)+'</td><td style="text-align:right;padding:11px 14px;">'+money(tot.paye)+'</td><td style="text-align:right;padding:11px 14px;">'+money(tot.nssf)+'</td><td style="text-align:right;padding:11px 14px;">'+money(tot.shif)+'</td><td style="text-align:right;padding:11px 14px;">'+money(tot.housing)+'</td><td style="text-align:right;padding:11px 14px;">'+money(tot.other)+'</td><td style="text-align:right;padding:11px 14px;">'+money(tot.net)+'</td><td></td></tr></tfoot></table></div>';
      document.getElementById("pr-back").onclick=function(){ tab="runs"; render(); };
      if(document.getElementById("pr-final")) document.getElementById("pr-final").onclick=async function(){
        var r=await sb.from("payroll_runs").update({ status:"finalized" }).eq("id",run.id);
        if(r.error){ toast("Error: "+r.error.message); return; } toast("Run finalized"); run.status="finalized"; runDetail(run);
      };
      var body=document.getElementById("pr-slips"); var html="";
      slips.forEach(function(p){
        var s=sName[p.staff_id]||{full_name:"—"};
        html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(s.full_name)+'<div class="muted" style="font-size:11px;">'+esc(s.role||"")+'</div></td>'
          +'<td style="text-align:right;">'+money(p.gross)+'</td><td style="text-align:right;">'+money(p.paye)+'</td><td style="text-align:right;">'+money(p.nssf)+'</td><td style="text-align:right;">'+money(p.shif)+'</td><td style="text-align:right;">'+money(p.housing_levy)+'</td><td style="text-align:right;">'+money(p.deductions_other||0)+'</td>'
          +'<td style="text-align:right;font-weight:600;">'+money(p.net)+'</td><td style="text-align:right;"><button class="btn-sm" data-slip="'+p.id+'">Payslip</button></td></tr>';
      });
      body.innerHTML=html;
      body.querySelectorAll("[data-slip]").forEach(function(b){ b.onclick=function(){ var p=slips.find(function(x){return x.id===b.getAttribute("data-slip");}); payslipModal(p, sName[p.staff_id]||{}, run); }; });
    }
    function payslipModal(p, s, run){
      var slipHtml=window.SamajiPayslip.slipHTML({ school:school, staff:s, payslip:p, period:run.period });
      var m=modal('<h3>Payslip — '+esc(s.full_name||"")+'</h3>'
        +'<div style="margin-top:14px;">'+slipHtml+'</div>'
        +'<div class="modal-actions"><button class="btn-sm" id="c">Close</button><button class="btn-primary" id="pr">Print</button></div>');
      m.q("#c").onclick=m.close;
      m.q("#pr").onclick=function(){ window.SamajiPayslip.printHTML(slipHtml, "Payslip — "+(s.full_name||"")); };
    }

    render();
  }

  // ====================================================
  //  SMS GATEWAY  (compose · credit metering · log)
  // ====================================================
  async function renderSMS(sb, schoolId, el){
    el.innerHTML='<div class="mod-head"><div><h2>SMS Gateway</h2><p>Send bulk SMS. Each message segment (160 chars) costs 1 credit per recipient.</p></div></div>'
      +'<div class="kpis" id="sms-kpis"></div>'
      +'<div style="display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px;margin-top:18px;align-items:start;">'
      +'<div class="panel"><strong style="font-size:14px;">Compose</strong>'
      +'<div class="field" style="margin-top:12px;"><label>Recipients (phone numbers, comma or new-line separated)</label>'
      +'<textarea id="sms-to" rows="3" style="border:1px solid #E2E5E9;border-radius:9px;padding:9px 11px;font-family:inherit;font-size:13px;outline:none;resize:vertical;"></textarea></div>'
      +'<div style="display:flex;gap:8px;margin:8px 0;"><button class="btn-sm" id="sms-guardians">+ All guardians</button><button class="btn-sm" id="sms-staff">+ All staff</button></div>'
      +'<div class="field"><label>Message</label><textarea id="sms-body" rows="4" maxlength="640" style="border:1px solid #E2E5E9;border-radius:9px;padding:9px 11px;font-family:inherit;font-size:13.5px;outline:none;resize:vertical;" placeholder="Type your message…"></textarea></div>'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-top:10px;">'
      +'<span class="muted" style="font-size:12.5px;" id="sms-meter">0 chars · 1 segment</span>'
      +'<button class="btn-primary" id="sms-send">Send SMS</button></div></div>'
      +'<div class="panel"><strong style="font-size:14px;">Buy credits</strong><p class="muted" style="font-size:12px;margin:4px 0 12px;">Top up the credit balance.</p>'
      +'<div style="display:flex;flex-direction:column;gap:8px;">'
      +'<button class="btn-sm" data-buy="1000">+ 1,000 credits</button><button class="btn-sm" data-buy="5000">+ 5,000 credits</button><button class="btn-sm" data-buy="25000">+ 25,000 credits</button></div></div>'
      +'</div>'
      +'<div style="margin-top:22px;"><strong style="font-size:14px;">Recent messages</strong><div id="sms-log" style="margin-top:12px;"></div></div>';

    var students=[], staff=[];
    var sr=await sb.from("students").select("guardian_phone").eq("school_id",schoolId); students=sr.data||[];
    var st=await sb.from("staff").select("phone").eq("school_id",schoolId); staff=st.data||[];

    async function balance(){
      var r=await sb.from("sms_credit_ledger").select("delta").eq("school_id",schoolId);
      return (r.data||[]).reduce(function(a,x){return a+x.delta;},0);
    }
    function segs(){ var n=document.getElementById("sms-body").value.length; return Math.max(1, Math.ceil(n/160)); }
    function recips(){ return document.getElementById("sms-to").value.split(/[\s,;]+/).map(function(s){return s.trim();}).filter(Boolean); }
    function updateMeter(){ var n=document.getElementById("sms-body").value.length; var s=segs(); var r=recips().length||0; document.getElementById("sms-meter").textContent=n+" chars · "+s+" segment"+(s>1?"s":"")+" · "+r+" recipient"+(r===1?"":"s")+" = "+(s*r)+" credits"; }

    async function refresh(){
      var bal=await balance();
      document.getElementById("sms-kpis").innerHTML=
        '<div class="panel"><div class="muted" style="font-size:12.5px;">Credit balance</div><div style="font-size:25px;font-weight:700;margin-top:7px;color:'+(bal>0?"#067647":"#B42318")+';">'+bal.toLocaleString()+'</div></div>'
        +'<div class="panel"><div class="muted" style="font-size:12.5px;">Guardian numbers</div><div style="font-size:25px;font-weight:700;margin-top:7px;">'+students.filter(function(s){return s.guardian_phone;}).length+'</div></div>'
        +'<div class="panel"><div class="muted" style="font-size:12.5px;">Staff numbers</div><div style="font-size:25px;font-weight:700;margin-top:7px;">'+staff.filter(function(s){return s.phone;}).length+'</div></div>';
      var lg=await sb.from("sms_messages").select("*").eq("school_id",schoolId).order("created_at",{ascending:false}).limit(40);
      var msgs=lg.data||[];
      if(!msgs.length){ document.getElementById("sms-log").innerHTML='<div class="empty">No messages sent yet.</div>'; return; }
      var html='<table class="data"><thead><tr><th>Recipient</th><th>Message</th><th>Segments</th><th>Cost</th><th>Status</th><th>When</th></tr></thead><tbody>';
      msgs.forEach(function(m){
        html+='<tr><td class="mono" style="font-size:12px;">'+esc(m.recipient)+'</td><td style="max-width:280px;">'+esc(m.body.length>60?m.body.slice(0,60)+"…":m.body)+'</td>'
          +'<td>'+m.segments+'</td><td>'+m.cost+'</td><td><span class="pill '+(m.status==="sent"?"green":"red")+'">'+esc(m.status)+'</span></td>'
          +'<td class="muted" style="font-size:11.5px;">'+esc(new Date(m.created_at).toLocaleString())+'</td></tr>';
      });
      html+='</tbody></table>';
      document.getElementById("sms-log").innerHTML=html;
    }

    document.getElementById("sms-body").oninput=updateMeter;
    document.getElementById("sms-to").oninput=updateMeter;
    document.getElementById("sms-guardians").onclick=function(){
      var nums=students.map(function(s){return s.guardian_phone;}).filter(Boolean);
      var box=document.getElementById("sms-to"); var cur=box.value.trim();
      box.value=(cur?cur+"\n":"")+nums.join("\n"); updateMeter();
    };
    document.getElementById("sms-staff").onclick=function(){
      var nums=staff.map(function(s){return s.phone;}).filter(Boolean);
      var box=document.getElementById("sms-to"); var cur=box.value.trim();
      box.value=(cur?cur+"\n":"")+nums.join("\n"); updateMeter();
    };
    document.querySelectorAll("[data-buy]").forEach(function(b){ b.onclick=async function(){
      var amt=Number(b.getAttribute("data-buy"));
      var r=await sb.from("sms_credit_ledger").insert({ school_id:schoolId, delta:amt, reason:"topup" });
      if(r.error){ toast("Error: "+r.error.message); return; } toast("Added "+amt.toLocaleString()+" credits"); refresh();
    };});
    document.getElementById("sms-send").onclick=async function(){
      var to=recips(), body=document.getElementById("sms-body").value.trim();
      if(!to.length){ toast("Add at least one recipient."); return; }
      if(!body){ toast("Type a message."); return; }
      var s=segs(), cost=s*to.length;
      var bal=await balance();
      if(cost>bal){ toast("Insufficient credits: need "+cost+", have "+bal+"."); return; }
      // simulate delivery; record each message + one debit on the ledger
      var rows=to.map(function(n){ return { school_id:schoolId, recipient:n, body:body, segments:s, cost:s, status:"sent" }; });
      var ins=await sb.from("sms_messages").insert(rows);
      if(ins.error){ toast("Error: "+ins.error.message); return; }
      var deb=await sb.from("sms_credit_ledger").insert({ school_id:schoolId, delta:-cost, reason:"sms_send" });
      if(deb.error){ toast("Error: "+deb.error.message); return; }
      document.getElementById("sms-body").value=""; document.getElementById("sms-to").value=""; updateMeter();
      toast("Sent "+to.length+" message"+(to.length===1?"":"s")+" · "+cost+" credits used"); refresh();
    };

    updateMeter(); refresh();
  }

  // ====================================================
  //  BIOMETRIC  (devices + student enrollment)
  // ====================================================
  async function renderBiometric(sb, schoolId, el){
    var tab="devices";
    el.innerHTML='<div class="mod-head"><div><h2>Biometric Access</h2><p>Register devices and enrol students. Live device sync runs via the on-prem agent.</p></div><div id="bio-addwrap"></div></div>'
      +'<div class="toolbar"><div class="seg" id="bio-tabs"><button data-tab="devices" class="on-present">Devices</button><button data-tab="enroll">Enrollment</button></div></div>'
      +'<div id="bio-body"></div>';
    document.querySelectorAll("#bio-tabs button").forEach(function(b){
      b.onclick=function(){ tab=b.getAttribute("data-tab"); document.querySelectorAll("#bio-tabs button").forEach(function(x){x.className="";}); b.className="on-present"; render(); };
    });
    function render(){
      var add=document.getElementById("bio-addwrap");
      if(tab==="devices"){ add.innerHTML='<button class="btn-primary" id="bio-add">+ New device</button>'; document.getElementById("bio-add").onclick=function(){ deviceForm(); }; drawDevices(); }
      else { add.innerHTML=""; drawEnroll(); }
    }
    async function drawDevices(){
      var r=await sb.from("biometric_devices").select("*").eq("school_id",schoolId).order("name");
      var rows=r.data||[];
      if(!rows.length){ document.getElementById("bio-body").innerHTML='<div class="empty">No devices yet.</div>'; return; }
      var html='<table class="data"><thead><tr><th>Device</th><th>Location</th><th>Type</th><th>Serial</th><th>Status</th><th></th></tr></thead><tbody>';
      rows.forEach(function(d){
        html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(d.name)+'</td><td>'+esc(d.location||"—")+'</td><td>'+esc(d.device_type)+'</td>'
          +'<td class="mono" style="font-size:12px;">'+esc(d.serial||"—")+'</td><td><span class="pill '+(d.active?"green":"gray")+'">'+(d.active?"online":"offline")+'</span></td>'
          +'<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-edit="'+d.id+'">Edit</button> <button class="btn-sm danger" data-del="'+d.id+'">Delete</button></td></tr>';
      });
      html+='</tbody></table>';
      var t=document.getElementById("bio-body"); t.innerHTML=html;
      t.querySelectorAll("[data-edit]").forEach(function(b){ b.onclick=function(){ deviceForm(rows.find(function(x){return x.id===b.getAttribute("data-edit");})); }; });
      t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete device?"))return; var r=await sb.from("biometric_devices").delete().eq("id",b.getAttribute("data-del")); if(r.error){toast("Error: "+r.error.message);return;} toast("Deleted"); drawDevices(); }; });
    }
    function deviceForm(d){
      d=d||{};
      var m=modal('<h3>'+(d.id?"Edit device":"New device")+'</h3><div class="grid2">'
        +'<div class="field full"><label>Name</label><input id="d-name" value="'+esc(d.name||"")+'"></div>'
        +'<div class="field"><label>Location</label><input id="d-loc" value="'+esc(d.location||"")+'"></div>'
        +'<div class="field"><label>Type</label><select id="d-type"><option'+(d.device_type==="fingerprint"||!d.device_type?" selected":"")+'>fingerprint</option><option'+(d.device_type==="rfid"?" selected":"")+'>rfid</option><option'+(d.device_type==="face"?" selected":"")+'>face</option></select></div>'
        +'<div class="field"><label>Serial</label><input id="d-serial" value="'+esc(d.serial||"")+'"></div>'
        +'<div class="field"><label>Status</label><select id="d-active"><option value="true"'+(d.active!==false?" selected":"")+'>online</option><option value="false"'+(d.active===false?" selected":"")+'>offline</option></select></div>'
        +'</div><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Save</button></div>');
      m.q("#c").onclick=m.close;
      m.q("#s").onclick=async function(){
        var rec={ school_id:schoolId, name:m.q("#d-name").value.trim(), location:m.q("#d-loc").value.trim()||null, device_type:m.q("#d-type").value, serial:m.q("#d-serial").value.trim()||null, active:m.q("#d-active").value==="true" };
        if(!rec.name){ toast("Name required."); return; }
        var res=d.id?await sb.from("biometric_devices").update(rec).eq("id",d.id):await sb.from("biometric_devices").insert(rec);
        if(res.error){ toast("Error: "+res.error.message); return; } m.close(); toast("Saved"); drawDevices();
      };
    }
    async function drawEnroll(){
      var sres=await sb.from("students").select("id,first_name,last_name,grade").eq("school_id",schoolId).eq("status","active").order("first_name");
      var students=sres.data||[];
      var er=await sb.from("biometric_enrollments").select("student_id").eq("school_id",schoolId);
      var enrolled={}; (er.data||[]).forEach(function(x){ enrolled[x.student_id]=true; });
      if(!students.length){ document.getElementById("bio-body").innerHTML='<div class="empty">No active students.</div>'; return; }
      var count=students.filter(function(s){return enrolled[s.id];}).length;
      var html='<div class="muted" style="font-size:12.5px;margin-bottom:10px;">'+count+' of '+students.length+' students enrolled</div>';
      html+='<table class="data"><thead><tr><th>Name</th><th>Grade</th><th style="text-align:right;">Biometric</th></tr></thead><tbody>';
      students.forEach(function(s){
        var on=!!enrolled[s.id];
        html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(s.first_name+" "+s.last_name)+'</td><td>'+esc(s.grade||"—")+'</td>'
          +'<td style="text-align:right;"><button class="btn-sm '+(on?"":"")+'" data-enr="'+s.id+'" data-on="'+on+'" style="'+(on?"color:#067647;border-color:#BBF7D0;background:#ECFDF3;":"")+'">'+(on?"✓ Enrolled":"Enroll")+'</button></td></tr>';
      });
      html+='</tbody></table>';
      var t=document.getElementById("bio-body"); t.innerHTML=html;
      t.querySelectorAll("[data-enr]").forEach(function(b){ b.onclick=async function(){
        var id=b.getAttribute("data-enr"), on=b.getAttribute("data-on")==="true";
        if(on){ var r=await sb.from("biometric_enrollments").delete().eq("student_id",id); if(r.error){toast("Error: "+r.error.message);return;} toast("Unenrolled"); }
        else { var r=await sb.from("biometric_enrollments").insert({ school_id:schoolId, student_id:id }); if(r.error){toast("Error: "+r.error.message);return;} toast("Student enrolled"); }
        drawEnroll();
      };});
    }
    render();
  }

  // ====================================================
  //  API & WEBHOOKS  (key management + endpoints)
  // ====================================================
  function randomToken(){ var s="sk_live_"; var c="abcdef0123456789"; for(var i=0;i<32;i++) s+=c[Math.floor(Math.random()*c.length)]; return s; }
  async function renderAPI(sb, schoolId, el){
    var tab="keys";
    el.innerHTML='<div class="mod-head"><div><h2>API &amp; Webhooks</h2><p>Issue API keys and register webhook endpoints for integrations.</p></div><div id="api-addwrap"></div></div>'
      +'<div class="toolbar"><div class="seg" id="api-tabs"><button data-tab="keys" class="on-present">API keys</button><button data-tab="hooks">Webhooks</button></div></div>'
      +'<div id="api-body"></div>';
    document.querySelectorAll("#api-tabs button").forEach(function(b){
      b.onclick=function(){ tab=b.getAttribute("data-tab"); document.querySelectorAll("#api-tabs button").forEach(function(x){x.className="";}); b.className="on-present"; render(); };
    });
    function render(){
      var add=document.getElementById("api-addwrap");
      if(tab==="keys"){ add.innerHTML='<button class="btn-primary" id="api-add">+ New key</button>'; document.getElementById("api-add").onclick=keyForm; drawKeys(); }
      else { add.innerHTML='<button class="btn-primary" id="api-add">+ New webhook</button>'; document.getElementById("api-add").onclick=hookForm; drawHooks(); }
    }
    function mask(tok){ return tok.slice(0,11)+"…"+tok.slice(-4); }
    async function drawKeys(){
      var r=await sb.from("api_keys").select("*").eq("school_id",schoolId).order("created_at",{ascending:false});
      var rows=r.data||[];
      if(!rows.length){ document.getElementById("api-body").innerHTML='<div class="empty">No API keys yet. Click <strong>+ New key</strong>.</div>'; return; }
      var html='<table class="data"><thead><tr><th>Name</th><th>Token</th><th>Status</th><th>Created</th><th></th></tr></thead><tbody>';
      rows.forEach(function(k){
        html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(k.name)+'</td><td class="mono" style="font-size:12px;">'+esc(mask(k.token))+'</td>'
          +'<td><span class="pill '+(k.active?"green":"gray")+'">'+(k.active?"active":"revoked")+'</span></td>'
          +'<td class="muted" style="font-size:11.5px;">'+esc(new Date(k.created_at).toLocaleDateString())+'</td>'
          +'<td style="text-align:right;white-space:nowrap;">'+(k.active?'<button class="btn-sm" data-revoke="'+k.id+'">Revoke</button> ':'')+'<button class="btn-sm danger" data-del="'+k.id+'">Delete</button></td></tr>';
      });
      html+='</tbody></table>';
      var t=document.getElementById("api-body"); t.innerHTML=html;
      t.querySelectorAll("[data-revoke]").forEach(function(b){ b.onclick=async function(){ var r=await sb.from("api_keys").update({active:false}).eq("id",b.getAttribute("data-revoke")); if(r.error){toast("Error: "+r.error.message);return;} toast("Key revoked"); drawKeys(); }; });
      t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete this key?"))return; var r=await sb.from("api_keys").delete().eq("id",b.getAttribute("data-del")); if(r.error){toast("Error: "+r.error.message);return;} toast("Deleted"); drawKeys(); }; });
    }
    function keyForm(){
      var m=modal('<h3>New API key</h3><div class="grid2"><div class="field full"><label>Key name</label><input id="k-name" placeholder="Mobile app integration"></div></div>'
        +'<div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Generate</button></div>');
      m.q("#c").onclick=m.close;
      m.q("#s").onclick=async function(){
        var name=m.q("#k-name").value.trim(); if(!name){ toast("Name required."); return; }
        var token=randomToken();
        var r=await sb.from("api_keys").insert({ school_id:schoolId, name:name, token:token, active:true });
        if(r.error){ toast("Error: "+r.error.message); return; }
        m.close();
        var m2=modal('<h3>API key created</h3><p class="muted" style="font-size:12.5px;margin:0 0 12px;">Copy it now — for security it is shown in full only once.</p>'
          +'<div class="mono" style="font-size:13px;background:#15171E;color:#7CE0CE;padding:12px 14px;border-radius:9px;word-break:break-all;">'+esc(token)+'</div>'
          +'<div class="modal-actions"><button class="btn-primary" id="ok">Done</button></div>');
        m2.q("#ok").onclick=function(){ m2.close(); drawKeys(); };
      };
    }
    async function drawHooks(){
      var r=await sb.from("webhooks").select("*").eq("school_id",schoolId).order("created_at",{ascending:false});
      var rows=r.data||[];
      if(!rows.length){ document.getElementById("api-body").innerHTML='<div class="empty">No webhooks yet.</div>'; return; }
      var html='<table class="data"><thead><tr><th>Endpoint URL</th><th>Event</th><th>Status</th><th></th></tr></thead><tbody>';
      rows.forEach(function(w){
        html+='<tr><td class="mono" style="font-size:12px;color:#1A1D26;">'+esc(w.url)+'</td><td><span class="pill" style="color:#4F46E5;background:#EEF0FF;">'+esc(w.event)+'</span></td>'
          +'<td><span class="pill '+(w.active?"green":"gray")+'">'+(w.active?"active":"paused")+'</span></td>'
          +'<td style="text-align:right;"><button class="btn-sm danger" data-del="'+w.id+'">Delete</button></td></tr>';
      });
      html+='</tbody></table>';
      var t=document.getElementById("api-body"); t.innerHTML=html;
      t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete webhook?"))return; var r=await sb.from("webhooks").delete().eq("id",b.getAttribute("data-del")); if(r.error){toast("Error: "+r.error.message);return;} toast("Deleted"); drawHooks(); }; });
    }
    function hookForm(){
      var events=["student.created","student.updated","fee.paid","attendance.recorded","exam.published"];
      var opts=events.map(function(e){ return '<option>'+e+'</option>'; }).join("");
      var m=modal('<h3>New webhook</h3><div class="grid2">'
        +'<div class="field full"><label>Endpoint URL</label><input id="w-url" placeholder="https://example.com/hooks/scholaris"></div>'
        +'<div class="field full"><label>Event</label><select id="w-event">'+opts+'</select></div>'
        +'</div><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Add</button></div>');
      m.q("#c").onclick=m.close;
      m.q("#s").onclick=async function(){
        var url=m.q("#w-url").value.trim(); if(!url){ toast("URL required."); return; }
        var r=await sb.from("webhooks").insert({ school_id:schoolId, url:url, event:m.q("#w-event").value, active:true });
        if(r.error){ toast("Error: "+r.error.message); return; } m.close(); toast("Webhook added"); drawHooks();
      };
    }
    render();
  }

  // ====================================================
  //  Generic placeholder for modules not yet built
  // ====================================================
  function placeholder(name){
    return async function(sb, schoolId, el){
      el.innerHTML='<div class="mod-head"><div><h2>'+esc(name)+'</h2><p>This licensed module is on the build roadmap.</p></div></div>'
        +'<div class="empty" style="margin-top:18px;">The <strong>'+esc(name)+'</strong> workspace is licensed and routed here.<br>Its internal screens are being built next — Students, Attendance, Report Cards and Fees are live now.</div>';
    };
  }

  window.SchoolModules = {
    "module.students":   renderStudents,
    "module.attendance": renderAttendance,
    // "module.academics" (Report Cards) and "module.exams" (Exam
    // Announcements) are registered by assets/school-academics.js,
    // loaded right after this file — they need the shared CBC engine
    // (assets/academics-core.js) that the old Gradebook/Exams screens
    // never used.
    "module.finance":    renderFees,
    "module.messaging":  renderCommunications,
    "module.timetable":  renderTimetable,
    "module.library":    renderLibrary,
    "module.transport":  renderTransport,
    "module.payroll":    renderPayroll,
    "module.sms":        renderSMS,
    "module.biometric":  renderBiometric,
    "module.analytics":  renderAnalytics,
    "module.api":        renderAPI
  };
})();
