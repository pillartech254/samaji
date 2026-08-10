// ============================================================
//  Librarian Portal tab renderers.
//  Each renderer: async (sb, ctx, el) => void
//  ctx = { schoolId, school, librarianId, flags }
//  Registered on window.LibrarianModules.
//
//  Scope is deliberately narrow: a librarian issues books, receives
//  them back, and marks a book lost (which raises an independent
//  library charge). No catalogue add/delete and no charge
//  waiving/payment here — those stay admin-only in the School Portal
//  (assets/school-modules.js renderLibrary).
// ============================================================
(function () {
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function money(n){ return "KES " + Number(n||0).toLocaleString(); }

  // Librarian Portal doesn't load school-plus.js — same #sm-toasts/.sm-toast
  // markup and CSS classes (shared via styles.css) reproduced here, exactly
  // as the Teacher Portal already does in assets/teacher-modules.js.
  var TICONS={
    ok:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M8 12.5l2.5 2.5L16 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    err:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 7v6M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    "":'<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };
  function smToast(msg, type){
    type = type || "";
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

  function modal(html, wide){
    var ov=document.createElement("div"); ov.className="overlay";
    ov.innerHTML='<div class="modal'+(wide?" wide":"")+'">'+html+'</div>';
    ov.addEventListener("click",function(e){ if(e.target===ov) ov.remove(); });
    document.body.appendChild(ov);
    return { el:ov, close:function(){ov.remove();}, q:function(s){return ov.querySelector(s);}, qa:function(s){return Array.prototype.slice.call(ov.querySelectorAll(s));} };
  }

  // Same searchable-select behavior as the School Portal's copy
  // (assets/school-modules.js) — duplicated here since this is a
  // separate portal with its own script bundle.
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

  function todayStr(){ return new Date().toISOString().slice(0,10); }
  function dueStatus(dueDate){
    if(!dueDate) return {label:"No due date",cls:"gray"};
    var today=todayStr(), soon=new Date(Date.now()+3*864e5).toISOString().slice(0,10);
    if(dueDate<today) return {label:"Overdue",cls:"red"};
    if(dueDate<=soon) return {label:"Due soon",cls:"amber"};
    return {label:"On time",cls:"green"};
  }

  async function loadStudents(sb, ctx){
    var r = await sb.from("students").select("id,first_name,last_name,grade").eq("school_id", ctx.schoolId);
    var list = r.data || [], nameOf={}, gradeOf={};
    list.forEach(function(s){ nameOf[s.id]=s.first_name+" "+s.last_name; gradeOf[s.id]=s.grade||"—"; });
    return { list:list, nameOf:nameOf, gradeOf:gradeOf };
  }

  async function returnLoan(sb, ctx, loanId, bookId, onDone){
    var r = await sb.from("library_loans").update({ returned_at: todayStr(), status:"returned", returned_by: ctx.librarianId||null }).eq("id", loanId);
    if (r.error){ toast("Error: "+r.error.message); return; }
    var bk = await sb.from("library_books").select("copies_available,copies_total").eq("id", bookId).single();
    if (bk.data){ await sb.from("library_books").update({ copies_available: Math.min(bk.data.copies_total, bk.data.copies_available+1) }).eq("id", bookId); }
    toast("Book returned"); if (onDone) onDone();
  }

  function markLostFlow(sb, ctx, loan, bookTitle, onDone){
    sb.from("library_books").select("*").eq("id", loan.book_id).single().then(function(bkr){
      var bk = bkr.data || {};
      var m = modal('<h3>Mark “'+esc(bookTitle)+'” lost</h3>'
        +'<p class="muted" style="font-size:12.5px;margin:0 0 10px;">This raises an independent Library Charge for the parent — it does not touch the fee structure.</p>'
        +'<div class="field full"><label>Charge amount (KES)</label><input id="lost-amt" type="number" min="0" value="'+(bk.replacement_cost||0)+'"></div>'
        +'<div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Confirm lost</button></div>');
      m.q("#c").onclick = m.close;
      m.q("#s").onclick = async function(){
        var amt = Number(m.q("#lost-amt").value) || 0;
        var upd = await sb.from("library_loans").update({ status:"lost", lost_at: todayStr(), lost_charge: amt }).eq("id", loan.id);
        if (upd.error){ toast("Error: "+upd.error.message); return; }
        if (amt > 0){
          var ins = await sb.from("library_charges").insert({
            school_id: ctx.schoolId, student_id: loan.student_id, loan_id: loan.id,
            book_title: bookTitle, amount: amt, reason: "Lost book", status: "unpaid", recorded_by: ctx.librarianId||null
          });
          if (ins.error){ toast("Loan marked lost, but charge failed: "+ins.error.message); m.close(); if (onDone) onDone(); return; }
        }
        if (bk.id){ await sb.from("library_books").update({ copies_total: Math.max(0,(bk.copies_total||1)-1) }).eq("id", bk.id); }
        m.close(); toast("Book marked lost"+(amt>0?" — KES "+amt+" charged":"")); if (onDone) onDone();
      };
    });
  }

  function issueFlow(sb, ctx, bk, students, onDone){
    if (!students.list.length){ toast("No students found for this school."); return; }
    var m = modal('<h3>Issue “'+esc(bk.title)+'”</h3>'
      +'<div class="grid2"><div class="field full"><label>Search student</label><input id="l-stu-search" placeholder="Type a name…"></div>'
      +'<div class="field full"><label>Student</label><select id="l-stu"></select></div>'
      +'<div class="field"><label>Days borrowed</label><input id="l-days" type="number" value="14" min="1"></div>'
      +'<div class="field"><label>Return due</label><input id="l-due-preview" disabled></div></div>'
      +'<div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Issue</button></div>');
    wireSearchSelect(m.q("#l-stu"), m.q("#l-stu-search"), students.list, function(s){ return s.first_name+" "+s.last_name+" — "+(s.grade||"—"); });
    function preview(){ var d=Number(m.q("#l-days").value)||14; m.q("#l-due-preview").value=new Date(Date.now()+d*864e5).toISOString().slice(0,10); }
    m.q("#l-days").oninput = preview; preview();
    m.q("#c").onclick = m.close;
    m.q("#s").onclick = async function(){
      var days = Number(m.q("#l-days").value) || 14;
      var studentId = m.q("#l-stu").value;
      var due = new Date(Date.now()+days*864e5).toISOString().slice(0,10);
      var ins = await sb.from("library_loans").insert({
        school_id: ctx.schoolId, book_id: bk.id, student_id: studentId,
        class_at_borrow: students.gradeOf[studentId]||null, days_allowed: days, due_date: due,
        status: "active", issued_by: ctx.librarianId||null
      });
      if (ins.error){ toast("Error: "+ins.error.message); return; }
      await sb.from("library_books").update({ copies_available: bk.copies_available-1 }).eq("id", bk.id);
      m.close(); toast("Book issued — due "+due); if (onDone) onDone();
    };
  }

  // ---------------- DASHBOARD ----------------
  async function dashboard(sb, ctx, el){
    el.innerHTML = '<div class="mod-head"><div><h2>Dashboard</h2><p>Today at a glance.</p></div></div><div id="lb-dash-body">Loading…</div>';
    var r = await sb.from("library_loans").select("*, library_books(title)").eq("school_id", ctx.schoolId).eq("status","active").order("due_date");
    var body = document.getElementById("lb-dash-body");
    if (r.error){ body.innerHTML = '<div class="empty">'+esc(r.error.message)+'</div>'; return; }
    var ln = r.data || [];
    var today = todayStr(), soon = new Date(Date.now()+3*864e5).toISOString().slice(0,10);
    var overdue = ln.filter(function(l){ return l.due_date && l.due_date<today; });
    var dueSoon = ln.filter(function(l){ return l.due_date && l.due_date>=today && l.due_date<=soon; });
    var students = await loadStudents(sb, ctx);

    var cards = '<div class="kpis">'
      +'<div class="panel"><div class="muted" style="font-size:12.5px;">On loan</div><div style="font-size:25px;font-weight:700;margin-top:7px;">'+ln.length+'</div></div>'
      +'<div class="panel"><div class="muted" style="font-size:12.5px;">Due soon</div><div style="font-size:25px;font-weight:700;margin-top:7px;color:#B54708;">'+dueSoon.length+'</div></div>'
      +'<div class="panel"><div class="muted" style="font-size:12.5px;">Overdue</div><div style="font-size:25px;font-weight:700;margin-top:7px;color:#B42318;">'+overdue.length+'</div></div>'
      +'</div>';

    var flagged = overdue.concat(dueSoon);
    var table;
    if (!flagged.length){
      table = '<div class="empty" style="margin-top:16px;">Nothing due soon or overdue — the shelf is current.</div>';
    } else {
      table = '<h3 style="margin:20px 0 10px;font-size:15px;">Due soon &amp; overdue</h3><table class="data"><thead><tr><th>Book</th><th>Student</th><th>Class</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>';
      flagged.forEach(function(l){
        var st = dueStatus(l.due_date);
        table += '<tr><td style="font-weight:600;color:#1A1D26;">'+esc(l.library_books?l.library_books.title:"—")+'</td>'
          +'<td>'+esc(students.nameOf[l.student_id]||"—")+'</td><td>'+esc(l.class_at_borrow||students.gradeOf[l.student_id]||"—")+'</td>'
          +'<td>'+esc(l.due_date||"—")+'</td><td><span class="pill '+st.cls+'">'+st.label+'</span></td>'
          +'<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-return="'+l.id+'" data-book="'+l.book_id+'">Return</button> <button class="btn-sm danger" data-lost="'+l.id+'">Mark lost</button></td></tr>';
      });
      table += '</tbody></table>';
    }
    body.innerHTML = cards + table;
    body.querySelectorAll("[data-return]").forEach(function(b){ b.onclick=function(){ returnLoan(sb, ctx, b.getAttribute("data-return"), b.getAttribute("data-book"), function(){ dashboard(sb, ctx, el); }); }; });
    body.querySelectorAll("[data-lost]").forEach(function(b){ b.onclick=function(){
      var loan = flagged.find(function(x){ return x.id===b.getAttribute("data-lost"); });
      if (loan) markLostFlow(sb, ctx, loan, loan.library_books?loan.library_books.title:"this book", function(){ dashboard(sb, ctx, el); });
    }; });
  }

  // ---------------- CATALOGUE (browse + issue only) ----------------
  async function catalogue(sb, ctx, el){
    el.innerHTML = '<div class="mod-head"><div><h2>Catalogue</h2><p>Browse titles and issue a book to a student.</p></div></div>'
      +'<div class="toolbar"><div class="search"><span style="color:#98A2B3;">⌕</span><input id="cat-search" placeholder="Search title or author…"></div></div>'
      +'<div id="cat-body">Loading…</div>';
    var r = await sb.from("library_books").select("*").eq("school_id", ctx.schoolId).order("title");
    if (r.error){ document.getElementById("cat-body").innerHTML = '<div class="empty">'+esc(r.error.message)+'</div>'; return; }
    var books = r.data || [];
    var students = await loadStudents(sb, ctx);

    function draw(){
      var q = (document.getElementById("cat-search").value||"").toLowerCase();
      var rows = books.filter(function(b){ return !q || (b.title+" "+(b.author||"")).toLowerCase().indexOf(q)>=0; });
      var t = document.getElementById("cat-body");
      if (!rows.length){ t.innerHTML = '<div class="empty">No matching titles.</div>'; return; }
      var html = '<table class="data"><thead><tr><th>Title</th><th>Author</th><th>Category</th><th>Shelf</th><th>Available</th><th></th></tr></thead><tbody>';
      rows.forEach(function(bk){
        var can = bk.copies_available>0;
        html += '<tr><td style="font-weight:600;color:#1A1D26;">'+esc(bk.title)+'<div class="mono muted" style="font-size:11px;">'+esc(bk.isbn||"")+'</div></td>'
          +'<td>'+esc(bk.author||"—")+'</td><td>'+esc(bk.category||"—")+'</td><td>'+esc(bk.shelf_location||"—")+'</td>'
          +'<td><span class="pill '+(can?"green":"red")+'">'+bk.copies_available+' / '+bk.copies_total+'</span></td>'
          +'<td style="text-align:right;"><button class="btn-sm" data-issue="'+bk.id+'"'+(can?"":" disabled")+'>Issue</button></td></tr>';
      });
      html += '</tbody></table>';
      t.innerHTML = html;
      t.querySelectorAll("[data-issue]").forEach(function(b){ b.onclick=function(){
        var bk = books.find(function(x){ return x.id===b.getAttribute("data-issue"); });
        issueFlow(sb, ctx, bk, students, draw);
      }; });
    }
    document.getElementById("cat-search").oninput = draw;
    draw();
  }

  // ---------------- LOANS (active + history) ----------------
  async function loans(sb, ctx, el){
    el.innerHTML = '<div class="mod-head"><div><h2>Loans</h2><p>Books currently out, and recent history.</p></div></div>'
      +'<div class="toolbar"><div class="seg" id="ln-tabs"><button data-tab="active" class="on-present">Active</button><button data-tab="history">Returned &amp; lost</button></div></div>'
      +'<div id="ln-body">Loading…</div>';
    var students = await loadStudents(sb, ctx);
    var tabState = "active";
    document.querySelectorAll("#ln-tabs button").forEach(function(b){
      b.onclick = function(){ tabState = b.getAttribute("data-tab");
        document.querySelectorAll("#ln-tabs button").forEach(function(x){ x.className=""; });
        b.className = "on-present"; draw();
      };
    });

    async function draw(){
      var body = document.getElementById("ln-body");
      body.innerHTML = "Loading…";
      var q = sb.from("library_loans").select("*, library_books(title)").eq("school_id", ctx.schoolId);
      q = tabState==="active" ? q.eq("status","active").order("due_date") : q.in("status",["returned","lost"]).order("created_at",{ascending:false}).limit(100);
      var r = await q;
      if (r.error){ body.innerHTML = '<div class="empty">'+esc(r.error.message)+'</div>'; return; }
      var ln = r.data || [];
      if (!ln.length){ body.innerHTML = '<div class="empty">'+(tabState==="active"?"Nothing on loan right now.":"No returned or lost books yet.")+'</div>'; return; }
      var html = '<table class="data"><thead><tr><th>Book</th><th>Student</th><th>Class</th><th>Borrowed</th><th>'+(tabState==="active"?"Due":"Outcome")+'</th><th>Status</th>'+(tabState==="active"?"<th></th>":"")+'</tr></thead><tbody>';
      ln.forEach(function(l){
        var statusCell;
        if (tabState==="active"){ var st=dueStatus(l.due_date); statusCell='<span class="pill '+st.cls+'">'+st.label+'</span>'; }
        else if (l.status==="lost"){ statusCell='<span class="pill red">Lost'+(l.lost_charge?" — "+money(l.lost_charge):"")+'</span>'; }
        else { statusCell='<span class="pill green">Returned</span>'; }
        html += '<tr><td style="font-weight:600;color:#1A1D26;">'+esc(l.library_books?l.library_books.title:"—")+'</td>'
          +'<td>'+esc(students.nameOf[l.student_id]||"—")+'</td><td>'+esc(l.class_at_borrow||students.gradeOf[l.student_id]||"—")+'</td>'
          +'<td>'+esc(l.borrowed_at)+'</td><td>'+esc(tabState==="active"?(l.due_date||"—"):(l.returned_at||l.lost_at||"—"))+'</td>'
          +'<td>'+statusCell+'</td>';
        if (tabState==="active"){
          html += '<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-return="'+l.id+'" data-book="'+l.book_id+'">Return</button> <button class="btn-sm danger" data-lost="'+l.id+'">Mark lost</button></td>';
        }
        html += '</tr>';
      });
      html += '</tbody></table>';
      body.innerHTML = html;
      body.querySelectorAll("[data-return]").forEach(function(b){ b.onclick=function(){ returnLoan(sb, ctx, b.getAttribute("data-return"), b.getAttribute("data-book"), draw); }; });
      body.querySelectorAll("[data-lost]").forEach(function(b){ b.onclick=function(){
        var loan = ln.find(function(x){ return x.id===b.getAttribute("data-lost"); });
        if (loan) markLostFlow(sb, ctx, loan, loan.library_books?loan.library_books.title:"this book", draw);
      }; });
    }
    draw();
  }

  window.LibrarianModules = { dashboard: dashboard, catalogue: catalogue, loans: loans };
})();
