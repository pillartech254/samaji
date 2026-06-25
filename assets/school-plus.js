// ============================================================
//  Samaji — "Plus" layer: Settings, richer Students, Fee
//  structures + collection + receipts, Reports, and chart
//  helpers. Loaded AFTER school-modules.js; overrides the
//  Students & Fees renderers and adds Settings/Reports.
// ============================================================
(function () {
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];}); }
  function money(n){ return "KES " + Number(n||0).toLocaleString(); }
  function toast(t){ if(window.SM_toast) window.SM_toast(t, /error|fail|required|invalid/i.test(t)?"err":"ok"); }
  function modal(html, wide){
    var ov=document.createElement("div"); ov.className="overlay";
    ov.innerHTML='<div class="modal'+(wide?" wide":"")+'">'+html+'</div>';
    ov.addEventListener("click",function(e){ if(e.target===ov) ov.remove(); });
    document.body.appendChild(ov);
    return { el:ov, close:function(){ov.remove();}, q:function(s){return ov.querySelector(s);}, qa:function(s){return ov.querySelectorAll(s);} };
  }
  var COUNTIES=["Mombasa","Kwale","Kilifi","Tana River","Lamu","Taita-Taveta","Garissa","Wajir","Mandera","Marsabit","Isiolo","Meru","Tharaka-Nithi","Embu","Kitui","Machakos","Makueni","Nyandarua","Nyeri","Kirinyaga","Murang'a","Kiambu","Turkana","West Pokot","Samburu","Trans-Nzoia","Uasin Gishu","Elgeyo-Marakwet","Nandi","Baringo","Laikipia","Nakuru","Narok","Kajiado","Kericho","Bomet","Kakamega","Vihiga","Bungoma","Busia","Siaya","Kisumu","Homa Bay","Migori","Kisii","Nyamira","Nairobi"];

  // ---------- chart helpers (pure SVG, no deps) ----------
  var PAL=["#0E9384","#4F46E5","#F59E0B","#EC4899","#06B6D4","#8B5CF6","#10B981","#EF4444","#3B82F6","#F97316"];
  function barChart(data, opts){ // data:[{label,value,color?}]
    opts=opts||{}; var h=opts.height||180, w=opts.width||520, pad=28, bw=opts.bw||34;
    var max=Math.max(1,Math.max.apply(null,data.map(function(d){return d.value;})));
    var n=data.length, gap=(w-pad-8)/n, plotH=h-pad-22;
    var bars=data.map(function(d,i){
      var bh=Math.round(plotH*d.value/max), x=pad+i*gap+(gap-bw)/2, y=h-22-bh;
      var c=d.color||PAL[i%PAL.length];
      return '<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+Math.max(bh,2)+'" rx="5" fill="'+c+'"></rect>'
        +'<text x="'+(x+bw/2)+'" y="'+(y-5)+'" text-anchor="middle" font-size="10.5" font-weight="700" fill="#475467">'+(opts.fmt?opts.fmt(d.value):d.value)+'</text>'
        +'<text x="'+(x+bw/2)+'" y="'+(h-7)+'" text-anchor="middle" font-size="10" fill="#98A2B3">'+esc(d.label)+'</text>';
    }).join("");
    var grid=""; for(var g=0;g<=3;g++){ var gy=h-22-plotH*g/3; grid+='<line x1="'+pad+'" y1="'+gy+'" x2="'+w+'" y2="'+gy+'" stroke="#F0F1F4"></line>'; }
    return '<svg viewBox="0 0 '+w+' '+h+'" width="100%" preserveAspectRatio="xMidYMid meet">'+grid+bars+'</svg>';
  }
  function lineChart(data, opts){ // data:[{label,value}]
    opts=opts||{}; var h=opts.height||190, w=opts.width||520, pad=30;
    var max=Math.max(1,Math.max.apply(null,data.map(function(d){return d.value;})));
    var n=data.length, plotH=h-pad-22, plotW=w-pad-10;
    var pts=data.map(function(d,i){ var x=pad+plotW*(n<2?0.5:i/(n-1)); var y=h-22-plotH*d.value/max; return [x,y]; });
    var path=pts.map(function(p,i){return (i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1);}).join(" ");
    var area=path+" L"+pts[pts.length-1][0].toFixed(1)+" "+(h-22)+" L"+pts[0][0].toFixed(1)+" "+(h-22)+" Z";
    var dots=pts.map(function(p,i){return '<circle cx="'+p[0].toFixed(1)+'" cy="'+p[1].toFixed(1)+'" r="3.5" fill="#0E9384" stroke="#fff" stroke-width="2"></circle>'
      +'<text x="'+p[0].toFixed(1)+'" y="'+(h-7)+'" text-anchor="middle" font-size="10" fill="#98A2B3">'+esc(data[i].label)+'</text>';}).join("");
    var grid=""; for(var g=0;g<=3;g++){ var gy=h-22-plotH*g/3; grid+='<line x1="'+pad+'" y1="'+gy+'" x2="'+w+'" y2="'+gy+'" stroke="#F0F1F4"></line>'; }
    return '<svg viewBox="0 0 '+w+' '+h+'" width="100%" preserveAspectRatio="xMidYMid meet"><defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E9384" stop-opacity="0.18"/><stop offset="1" stop-color="#0E9384" stop-opacity="0"/></linearGradient></defs>'
      +grid+'<path d="'+area+'" fill="url(#lg)"></path><path d="'+path+'" fill="none" stroke="#0E9384" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></path>'+dots+'</svg>';
  }
  function donut(data, opts){ // data:[{label,value,color?}]
    opts=opts||{}; var size=opts.size||150, r=size/2-12, cx=size/2, cy=size/2, sw=opts.sw||20;
    var total=data.reduce(function(a,d){return a+d.value;},0)||1, a0=-Math.PI/2;
    var segs=data.map(function(d,i){
      var frac=d.value/total, a1=a0+frac*Math.PI*2;
      var large=frac>0.5?1:0, x0=cx+r*Math.cos(a0), y0=cy+r*Math.sin(a0), x1=cx+r*Math.cos(a1), y1=cy+r*Math.sin(a1);
      var c=d.color||PAL[i%PAL.length]; a0=a1;
      if(frac<=0) return "";
      if(frac>=0.999) return '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+c+'" stroke-width="'+sw+'"></circle>';
      return '<path d="M'+x0.toFixed(1)+' '+y0.toFixed(1)+' A'+r+' '+r+' 0 '+large+' 1 '+x1.toFixed(1)+' '+y1.toFixed(1)+'" fill="none" stroke="'+c+'" stroke-width="'+sw+'" stroke-linecap="round"></path>';
    }).join("");
    return '<svg viewBox="0 0 '+size+' '+size+'" width="'+size+'" height="'+size+'">'+segs
      +'<text x="'+cx+'" y="'+(cy-2)+'" text-anchor="middle" font-size="22" font-weight="700" fill="#15171E">'+total+'</text>'
      +'<text x="'+cx+'" y="'+(cy+14)+'" text-anchor="middle" font-size="10" fill="#98A2B3">'+esc(opts.center||"Total")+'</text></svg>';
  }
  function legend(data){ return '<div class="legend">'+data.map(function(d,i){return '<div class="li"><span class="sw" style="background:'+(d.color||PAL[i%PAL.length])+'"></span>'+esc(d.label)+' <strong style="color:#15171E;margin-left:2px;">'+d.value+'</strong></div>';}).join("")+'</div>'; }
  window.SamajiCharts={ bar:barChart, line:lineChart, donut:donut, legend:legend, PAL:PAL };

  // ====================================================
  //  Custom alerts, confirms & toasts (replace native)
  // ====================================================
  var ICONS={
    warn:'<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 4l9 16H3z" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M12 10v4M12 17h.01" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    danger:'<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.9"/><path d="M12 7v6M12 16h.01" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    info:'<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.9"/><path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    ok:'<svg width="26" height="26" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.9"/><path d="M8 12.5l2.5 2.5L16 9" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  var TICONS={ ok:ICONS.ok, err:ICONS.danger, info:ICONS.info, "":'<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><path d="M12 8v5M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>' };
  function smToast(msg, type){
    type=type||"";
    var wrap=document.getElementById("sm-toasts");
    if(!wrap){ wrap=document.createElement("div"); wrap.id="sm-toasts"; document.body.appendChild(wrap); }
    var t=document.createElement("div"); t.className="sm-toast "+type;
    t.innerHTML='<span class="ti">'+(TICONS[type]||TICONS[""])+'</span><span>'+esc(msg)+'</span>';
    wrap.appendChild(t);
    setTimeout(function(){ t.classList.add("out"); setTimeout(function(){ t.remove(); },260); }, 2800);
  }
  window.SM_toast=function(msg,type){ smToast(msg,type); };

  function dialog(opts){
    return new Promise(function(resolve){
      var kind=opts.kind||"warn", confirm=opts.confirm!==false;
      var ov=document.createElement("div"); ov.className="overlay";
      ov.innerHTML='<div class="dlg"><div class="di '+kind+'">'+(ICONS[kind]||ICONS.warn)+'</div>'
        +'<h4>'+esc(opts.title||"Are you sure?")+'</h4><p>'+esc(opts.message||"")+'</p>'
        +'<div class="dlg-actions">'
        +(confirm?'<button data-x="0">'+esc(opts.cancelText||"Cancel")+'</button>':'')
        +'<button class="primary'+(kind==="danger"?" danger":"")+'" data-x="1">'+esc(opts.okText||(confirm?"Confirm":"OK"))+'</button>'
        +'</div></div>';
      function done(v){ ov.style.animation="ovrIn .18s reverse both"; setTimeout(function(){ ov.remove(); },150); resolve(v); }
      ov.addEventListener("click",function(e){ if(e.target===ov && confirm) done(false); });
      document.body.appendChild(ov);
      ov.querySelectorAll("[data-x]").forEach(function(b){ b.onclick=function(){ done(b.getAttribute("data-x")==="1"); }; });
      var p=ov.querySelector(".primary"); if(p) p.focus();
    });
  }
  // returns Promise<boolean>; works with `if(!await SM_confirm(...))`
  window.SM_confirm=function(message, opts){ opts=opts||{}; return dialog({ kind:opts.kind||"danger", title:opts.title||"Please confirm", message:message, okText:opts.okText||"Yes, continue", cancelText:opts.cancelText||"Cancel", confirm:true }); };
  window.SM_alert=function(message, opts){ opts=opts||{}; return dialog({ kind:opts.kind||"info", title:opts.title||"Notice", message:message, okText:opts.okText||"Got it", confirm:false }); };

  // shared loaders
  async function loadClasses(sb, schoolId){ var r=await sb.from("school_classes").select("*").eq("school_id",schoolId).order("sort").order("stream"); return r.data||[]; }
  function classLabel(c){ return c.level + (c.stream? " "+c.stream : ""); }

  // ====================================================
  //  SETTINGS  (admin academic setup)
  // ====================================================
  async function renderSettings(sb, schoolId, el){
    var tab="classes";
    el.innerHTML='<div class="mod-head"><div><h2>School Settings</h2><p>Configure classes, streams, boarding and fee structures. Set these once — they power registration and billing.</p></div></div>'
      +'<div class="tabs" id="set-tabs">'
      +'<button data-t="classes" class="on">Classes &amp; Streams</button>'
      +'<button data-t="dorms">Dormitories</button>'
      +'<button data-t="fees">Fee Structures</button>'
      +'</div><div id="set-body" style="margin-top:18px;"></div>';
    el.querySelectorAll("#set-tabs button").forEach(function(b){ b.onclick=function(){ tab=b.getAttribute("data-t"); el.querySelectorAll("#set-tabs button").forEach(function(x){x.classList.remove("on");}); b.classList.add("on"); render(); }; });
    function render(){ if(tab==="classes") classes(); else if(tab==="dorms") dorms(); else fees(); }

    // ----- classes & streams -----
    async function classes(){
      var body=document.getElementById("set-body");
      body.innerHTML='<div class="toolbar" style="margin-top:0;"><span class="muted" style="font-size:12.5px;flex:1;">Each row is a class (a level, optionally split into streams). Students pick one of these at registration.</span>'
        +'<button class="btn-sm" id="seed-cbc">Load Kenyan CBC defaults</button><button class="btn-primary" id="add-class">+ Add class</button></div><div id="cls-table"></div>';
      var list=await loadClasses(sb, schoolId);
      var t=document.getElementById("cls-table");
      if(!list.length){ t.innerHTML='<div class="empty">No classes yet. Click <strong>Load Kenyan CBC defaults</strong> to populate PP1–Grade 9, or add your own.</div>'; }
      else {
        var html='<table class="data"><thead><tr><th>Level</th><th>Stream</th><th>Curriculum</th><th>Capacity</th><th>Students</th><th></th></tr></thead><tbody>';
        // count students per class
        var cr=await sb.from("students").select("class_id").eq("school_id",schoolId);
        var counts={}; (cr.data||[]).forEach(function(s){ if(s.class_id) counts[s.class_id]=(counts[s.class_id]||0)+1; });
        list.forEach(function(c){
          html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(c.level)+'</td><td>'+(c.stream?esc(c.stream):'<span class="muted">—</span>')+'</td>'
            +'<td><span class="pill gray">'+esc(c.curriculum)+'</span></td><td>'+c.capacity+'</td><td>'+(counts[c.id]||0)+'</td>'
            +'<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-edit="'+c.id+'">Edit</button> <button class="btn-sm danger" data-del="'+c.id+'">Delete</button></td></tr>';
        });
        t.innerHTML=html+'</tbody></table>';
        t.querySelectorAll("[data-edit]").forEach(function(b){ b.onclick=function(){ classForm(list.find(function(x){return x.id===b.getAttribute("data-edit");})); }; });
        t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete this class? Students keep their record but lose the link."))return; var r=await sb.from("school_classes").delete().eq("id",b.getAttribute("data-del")); if(r.error){toast("Error: "+r.error.message);return;} toast("Class deleted"); classes(); }; });
      }
      document.getElementById("add-class").onclick=function(){ classForm(null); };
      document.getElementById("seed-cbc").onclick=async function(){
        var levels=["PP1","PP2","Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9"];
        var rows=levels.map(function(lv,i){ return { school_id:schoolId, level:lv, stream:null, curriculum:"CBC", sort:i }; });
        var r=await sb.from("school_classes").upsert(rows,{ onConflict:"school_id,level,stream", ignoreDuplicates:true });
        if(r.error){ toast("Error: "+r.error.message); return; } toast("Kenyan CBC classes loaded"); classes();
      };
    }
    function classForm(c){
      c=c||{};
      var m=modal('<h3>'+(c.id?"Edit class":"Add class")+'</h3>'
        +'<div class="grid2">'
        +'<div class="field"><label>Level</label><input id="c-level" value="'+esc(c.level||"")+'" placeholder="Grade 6"></div>'
        +'<div class="field"><label>Stream (optional)</label><input id="c-stream" value="'+esc(c.stream||"")+'" placeholder="East / A / Blue"></div>'
        +'<div class="field"><label>Curriculum</label><select id="c-cur"><option'+(c.curriculum!=="8-4-4"?" selected":"")+'>CBC</option><option'+(c.curriculum==="8-4-4"?" selected":"")+'>8-4-4</option></select></div>'
        +'<div class="field"><label>Capacity</label><input id="c-cap" type="number" value="'+(c.capacity||40)+'"></div>'
        +'</div><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Save</button></div>');
      m.q("#c").onclick=m.close;
      m.q("#s").onclick=async function(){
        var rec={ school_id:schoolId, level:m.q("#c-level").value.trim(), stream:m.q("#c-stream").value.trim()||null, curriculum:m.q("#c-cur").value, capacity:Number(m.q("#c-cap").value)||40 };
        if(!rec.level){ toast("Level is required."); return; }
        var r=c.id? await sb.from("school_classes").update(rec).eq("id",c.id) : await sb.from("school_classes").insert(rec);
        if(r.error){ toast("Error: "+(r.error.message.indexOf("duplicate")>=0?"That level + stream already exists.":r.error.message)); return; }
        m.close(); toast("Saved"); classes();
      };
    }

    // ----- dormitories -----
    async function dorms(){
      var body=document.getElementById("set-body");
      body.innerHTML='<div class="toolbar" style="margin-top:0;"><span class="muted" style="font-size:12.5px;flex:1;">Boarding houses students can be assigned to during registration.</span><button class="btn-primary" id="add-dorm">+ Add dormitory</button></div><div id="dorm-table"></div>';
      var r=await sb.from("dormitories").select("*").eq("school_id",schoolId).order("name");
      var list=r.data||[], t=document.getElementById("dorm-table");
      if(!list.length){ t.innerHTML='<div class="empty">No dormitories yet. Add one for boarding students.</div>'; }
      else {
        var cr=await sb.from("students").select("dormitory_id").eq("school_id",schoolId);
        var counts={}; (cr.data||[]).forEach(function(s){ if(s.dormitory_id) counts[s.dormitory_id]=(counts[s.dormitory_id]||0)+1; });
        var html='<table class="data"><thead><tr><th>Name</th><th>Gender</th><th>Capacity</th><th>Occupancy</th><th>Captain</th><th></th></tr></thead><tbody>';
        list.forEach(function(d){
          var occ=counts[d.id]||0, pct=Math.min(100,Math.round(occ/(d.capacity||1)*100));
          html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(d.name)+'</td><td><span class="pill '+(d.gender==="Boys"?"":d.gender==="Girls"?"amber":"gray")+'">'+esc(d.gender)+'</span></td><td>'+d.capacity+'</td>'
            +'<td style="min-width:120px;">'+occ+'/'+d.capacity+'<div class="bar" style="margin-top:4px;"><span style="width:'+pct+'%;background:'+(pct>90?"#EF4444":"#0E9384")+'"></span></div></td>'
            +'<td>'+esc(d.captain||"—")+'</td>'
            +'<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-edit="'+d.id+'">Edit</button> <button class="btn-sm danger" data-del="'+d.id+'">Delete</button></td></tr>';
        });
        t.innerHTML=html+'</tbody></table>';
        t.querySelectorAll("[data-edit]").forEach(function(b){ b.onclick=function(){ dormForm(list.find(function(x){return x.id===b.getAttribute("data-edit");})); }; });
        t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete this dormitory?"))return; var r=await sb.from("dormitories").delete().eq("id",b.getAttribute("data-del")); if(r.error){toast("Error: "+r.error.message);return;} toast("Deleted"); dorms(); }; });
      }
      document.getElementById("add-dorm").onclick=function(){ dormForm(null); };
    }
    function dormForm(d){
      d=d||{};
      var m=modal('<h3>'+(d.id?"Edit dormitory":"Add dormitory")+'</h3><div class="grid2">'
        +'<div class="field"><label>Name</label><input id="d-name" value="'+esc(d.name||"")+'" placeholder="Kilimanjaro"></div>'
        +'<div class="field"><label>Gender</label><select id="d-gender"><option'+(d.gender==="Boys"?" selected":"")+'>Boys</option><option'+(d.gender==="Girls"?" selected":"")+'>Girls</option><option'+(d.gender==="Mixed"||!d.gender?" selected":"")+'>Mixed</option></select></div>'
        +'<div class="field"><label>Capacity</label><input id="d-cap" type="number" value="'+(d.capacity||30)+'"></div>'
        +'<div class="field"><label>House captain</label><input id="d-cap2" value="'+esc(d.captain||"")+'"></div>'
        +'</div><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Save</button></div>');
      m.q("#c").onclick=m.close;
      m.q("#s").onclick=async function(){
        var rec={ school_id:schoolId, name:m.q("#d-name").value.trim(), gender:m.q("#d-gender").value, capacity:Number(m.q("#d-cap").value)||30, captain:m.q("#d-cap2").value.trim()||null };
        if(!rec.name){ toast("Name required."); return; }
        var r=d.id? await sb.from("dormitories").update(rec).eq("id",d.id) : await sb.from("dormitories").insert(rec);
        if(r.error){ toast("Error: "+r.error.message); return; } m.close(); toast("Saved"); dorms();
      };
    }

    // ----- fee structures -----
    async function fees(){
      var body=document.getElementById("set-body");
      body.innerHTML='<div class="toolbar" style="margin-top:0;"><span class="muted" style="font-size:12.5px;flex:1;">Define what each class is billed per term. The Fees module uses these to compute every student\u2019s balance.</span><button class="btn-primary" id="add-fs">+ New structure</button></div><div id="fs-list"></div>';
      var r=await sb.from("fee_structures").select("*, fee_items(amount)").eq("school_id",schoolId).order("year",{ascending:false}).order("level");
      var list=r.data||[], t=document.getElementById("fs-list");
      if(!list.length){ t.innerHTML='<div class="empty">No fee structures yet. Create one per class/term — e.g. Grade 6 · Term 1.</div>'; }
      else {
        var html='<table class="data"><thead><tr><th>Class level</th><th>Term</th><th>Year</th><th>Items</th><th>Total / student</th><th></th></tr></thead><tbody>';
        list.forEach(function(f){
          var total=(f.fee_items||[]).reduce(function(a,i){return a+Number(i.amount);},0);
          html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(f.level)+'</td><td>'+esc(f.term)+'</td><td>'+f.year+'</td><td>'+(f.fee_items||[]).length+'</td>'
            +'<td style="font-weight:700;">'+money(total)+'</td>'
            +'<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-edit="'+f.id+'">Edit items</button> <button class="btn-sm danger" data-del="'+f.id+'">Delete</button></td></tr>';
        });
        t.innerHTML=html+'</tbody></table>';
        t.querySelectorAll("[data-edit]").forEach(function(b){ b.onclick=function(){ fsEditor(list.find(function(x){return x.id===b.getAttribute("data-edit");})); }; });
        t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete this fee structure and its items?"))return; var r=await sb.from("fee_structures").delete().eq("id",b.getAttribute("data-del")); if(r.error){toast("Error: "+r.error.message);return;} toast("Deleted"); fees(); }; });
      }
      document.getElementById("add-fs").onclick=async function(){
        var classes=await loadClasses(sb, schoolId);
        var levels=Array.from(new Set(classes.map(function(c){return c.level;})));
        if(!levels.length){ toast("Add classes first (Classes & Streams tab)."); return; }
        var yr=new Date().getFullYear();
        var m=modal('<h3>New fee structure</h3><div class="grid3">'
          +'<div class="field"><label>Class level</label><select id="fs-level">'+levels.map(function(l){return '<option>'+esc(l)+'</option>';}).join("")+'</select></div>'
          +'<div class="field"><label>Term</label><select id="fs-term"><option>Term 1</option><option>Term 2</option><option>Term 3</option></select></div>'
          +'<div class="field"><label>Year</label><input id="fs-year" type="number" value="'+yr+'"></div>'
          +'</div><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Create &amp; add items</button></div>');
        m.q("#c").onclick=m.close;
        m.q("#s").onclick=async function(){
          var rec={ school_id:schoolId, level:m.q("#fs-level").value, term:m.q("#fs-term").value, year:Number(m.q("#fs-year").value)||yr, name:m.q("#fs-level").value+" — "+m.q("#fs-term").value };
          var r=await sb.from("fee_structures").insert(rec).select().single();
          if(r.error){ toast("Error: "+(r.error.message.indexOf("duplicate")>=0?"A structure for that class/term/year exists.":r.error.message)); return; }
          m.close(); fsEditor(r.data);
        };
      };
    }
    async function fsEditor(fs){
      var body=document.getElementById("set-body");
      body.innerHTML='<button class="btn-sm" id="fs-back" style="margin-bottom:14px;">← All structures</button>'
        +'<div class="chartcard"><div class="ch-head"><div><h3>'+esc(fs.level)+' · '+esc(fs.term)+' '+fs.year+'</h3><div class="sub">Line items billed to every '+esc(fs.level)+' student this term.</div></div><button class="btn-primary" id="fi-add">+ Add item</button></div>'
        +'<div id="fi-table"></div></div>';
      document.getElementById("fs-back").onclick=fees;
      async function draw(){
        var r=await sb.from("fee_items").select("*").eq("structure_id",fs.id).order("sort");
        var items=r.data||[], t=document.getElementById("fi-table");
        var total=items.reduce(function(a,i){return a+Number(i.amount);},0);
        if(!items.length){ t.innerHTML='<div class="empty" style="margin-top:6px;">No items yet. Add Tuition, Boarding, Transport, etc.</div>'; }
        else{
          var html='<table class="data"><thead><tr><th>Item</th><th>Type</th><th>Amount</th><th></th></tr></thead><tbody>';
          items.forEach(function(i){ html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(i.name)+'</td><td>'+(i.mandatory?'<span class="pill green">Mandatory</span>':'<span class="pill gray">Optional</span>')+'</td><td style="font-weight:600;">'+money(i.amount)+'</td><td style="text-align:right;"><button class="btn-sm danger" data-del="'+i.id+'">Remove</button></td></tr>'; });
          html+='<tr><td colspan="2" style="text-align:right;font-weight:700;">Total per student</td><td style="font-weight:700;color:#0E9384;">'+money(total)+'</td><td></td></tr>';
          t.innerHTML=html+'</tbody></table>';
          t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){ var r=await sb.from("fee_items").delete().eq("id",b.getAttribute("data-del")); if(r.error){toast("Error: "+r.error.message);return;} draw(); }; });
        }
      }
      document.getElementById("fi-add").onclick=function(){
        var m=modal('<h3>Add fee item</h3><div class="grid2">'
          +'<div class="field"><label>Item name</label><input id="fi-name" placeholder="Tuition"></div>'
          +'<div class="field"><label>Amount (KES)</label><input id="fi-amt" type="number" value="0"></div>'
          +'<div class="field full"><label>Type</label><select id="fi-mand"><option value="true">Mandatory</option><option value="false">Optional</option></select></div>'
          +'</div><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Add</button></div>');
        m.q("#c").onclick=m.close;
        m.q("#s").onclick=async function(){
          var name=m.q("#fi-name").value.trim(); if(!name){ toast("Name required."); return; }
          var r=await sb.from("fee_items").insert({ structure_id:fs.id, name:name, amount:Number(m.q("#fi-amt").value)||0, mandatory:m.q("#fi-mand").value==="true" });
          if(r.error){ toast("Error: "+r.error.message); return; } m.close(); draw();
        };
      };
      draw();
    }
    render();
  }

  // ====================================================
  //  STUDENTS v2  (rich biodata, class & dorm dropdowns)
  // ====================================================
  async function renderStudentsV2(sb, schoolId, el){
    el.innerHTML='<div class="mod-head"><div><h2>Students</h2><p>Enrollment records, biodata, class and boarding.</p></div><button class="btn-primary" id="add-student">+ New student</button></div>'
      +'<div class="toolbar"><div class="search"><span style="color:#98A2B3;">⌕</span><input id="stu-search" placeholder="Search name or admission no…"></div>'
      +'<select id="stu-class-filter"><option value="">All classes</option></select>'
      +'<span class="muted" id="stu-count" style="font-size:12.5px;margin-left:auto;"></span></div><div id="stu-table"></div>';
    var classes=await loadClasses(sb, schoolId);
    var dr=await sb.from("dormitories").select("*").eq("school_id",schoolId).order("name"); var dorms=dr.data||[];
    var classOf={}; classes.forEach(function(c){ classOf[c.id]=classLabel(c); });
    var dormOf={}; dorms.forEach(function(d){ dormOf[d.id]=d.name; });
    var cf=document.getElementById("stu-class-filter"); classes.forEach(function(c){ cf.innerHTML+='<option value="'+c.id+'">'+esc(classLabel(c))+'</option>'; });
    var all=[];
    async function load(){
      var r=await sb.from("students").select("*").eq("school_id",schoolId).order("created_at",{ascending:true});
      if(r.error){ document.getElementById("stu-table").innerHTML='<div class="empty">'+esc(r.error.message)+'</div>'; return; }
      all=r.data||[]; draw();
    }
    function draw(){
      var q=(document.getElementById("stu-search").value||"").toLowerCase();
      var cfv=document.getElementById("stu-class-filter").value;
      var rows=all.filter(function(s){ return (!q||(s.first_name+" "+s.last_name+" "+(s.admission_no||"")).toLowerCase().indexOf(q)>=0) && (!cfv||s.class_id===cfv); });
      document.getElementById("stu-count").textContent=rows.length+" of "+all.length+" students";
      var t=document.getElementById("stu-table");
      if(!rows.length){ t.innerHTML='<div class="empty">No students match. Click <strong>+ New student</strong> to enrol one.</div>'; return; }
      var html='<table class="data"><thead><tr><th>Adm. No</th><th>Name</th><th>Class</th><th>Gender</th><th>Boarding</th><th>Guardian</th><th>Status</th><th></th></tr></thead><tbody>';
      rows.forEach(function(s){
        var boarding=s.residence==="Boarder"?('<span class="pill" style="color:#6D28D9;background:#F1ECFE;">'+esc(dormOf[s.dormitory_id]||"Boarder")+'</span>'):'<span class="pill gray">Day</span>';
        html+='<tr><td class="mono" style="font-size:12px;">'+esc(s.admission_no||"—")+'</td>'
          +'<td style="font-weight:600;color:#1A1D26;">'+esc(s.first_name+" "+s.last_name)+'</td>'
          +'<td>'+esc(classOf[s.class_id]||s.grade||"—")+'</td><td>'+esc(s.gender||"—")+'</td><td>'+boarding+'</td>'
          +'<td>'+esc(s.guardian_name||"—")+'<div class="muted" style="font-size:11px;">'+esc(s.guardian_phone||"")+'</div></td>'
          +'<td><span class="pill '+(s.status==="active"?"green":"gray")+'">'+esc(s.status)+'</span></td>'
          +'<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-view="'+s.id+'">View</button> <button class="btn-sm" data-edit="'+s.id+'">Edit</button> <button class="btn-sm danger" data-del="'+s.id+'">Delete</button></td></tr>';
      });
      t.innerHTML=html+'</tbody></table>';
      t.querySelectorAll("[data-edit]").forEach(function(b){ b.onclick=function(){ form(all.find(function(x){return x.id===b.getAttribute("data-edit");})); }; });
      t.querySelectorAll("[data-view]").forEach(function(b){ b.onclick=function(){ view(all.find(function(x){return x.id===b.getAttribute("data-view");})); }; });
      t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete this student and all related records?"))return; var r=await sb.from("students").delete().eq("id",b.getAttribute("data-del")); if(r.error){toast("Error: "+r.error.message);return;} toast("Student deleted"); load(); }; });
    }
    function view(s){
      var c=classOf[s.class_id]||s.grade||"—";
      function row(k,v){ return '<div><div class="muted" style="font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;">'+k+'</div><div style="font-weight:600;font-size:13.5px;margin-top:2px;">'+esc(v||"—")+'</div></div>'; }
      modal('<h3>'+esc(s.first_name+" "+s.last_name)+'</h3><p class="muted" style="font-size:12.5px;margin:0;">'+esc(s.admission_no||"")+' · '+esc(c)+'</p>'
        +'<div class="modal-body"><div class="grid3" style="margin-top:16px;gap:14px;">'
        +row("Gender",s.gender)+row("Date of birth",s.date_of_birth)+row("Admitted",s.admission_date)
        +row("Boarding",s.residence)+row("Dormitory",dormOf[s.dormitory_id])+row("Blood group",s.blood_group)
        +row("County",s.county)+row("Nationality",s.nationality)+row("Religion",s.religion)
        +'<div style="grid-column:1/-1;" class="section-h">Guardian</div>'
        +row("Name",s.guardian_name)+row("Relationship",s.guardian_relation)+row("Phone",s.guardian_phone)
        +row("Email",s.guardian_email)+'<div></div><div></div>'
        +'<div style="grid-column:1/-1;">'+row("Medical notes",s.medical_notes)+'</div>'
        +'</div></div><div class="modal-actions"><button class="btn-primary" id="ok">Close</button></div>',true).q("#ok").onclick=function(){ document.querySelector(".overlay").remove(); };
    }
    function nextAdm(){
      var nums=all.map(function(s){ var m=/(\d+)$/.exec(s.admission_no||""); return m?parseInt(m[1]):0; });
      var max=nums.length?Math.max.apply(null,nums):0; return "ADM-"+String(max+1).padStart(4,"0");
    }
    function form(s){
      s=s||{};
      var classOpts='<option value="">— select class —</option>'+classes.map(function(c){ return '<option value="'+c.id+'"'+(s.class_id===c.id?" selected":"")+'>'+esc(classLabel(c))+'</option>'; }).join("");
      var dormOpts='<option value="">— none —</option>'+dorms.map(function(d){ return '<option value="'+d.id+'"'+(s.dormitory_id===d.id?" selected":"")+'>'+esc(d.name)+' ('+esc(d.gender)+')</option>'; }).join("");
      var countyOpts='<option value="">—</option>'+COUNTIES.map(function(c){ return '<option'+(s.county===c?" selected":"")+'>'+esc(c)+'</option>'; }).join("");
      var m=modal('<h3>'+(s.id?"Edit student":"New student")+'</h3><p class="muted" style="font-size:12.5px;margin:0;">Full enrollment record.</p>'
        +'<div class="modal-body"><div class="grid3">'
        +'<div class="section-h">Identity</div>'
        +'<div class="field"><label>First name</label><input id="f-first" value="'+esc(s.first_name||"")+'"></div>'
        +'<div class="field"><label>Last name</label><input id="f-last" value="'+esc(s.last_name||"")+'"></div>'
        +'<div class="field"><label>Admission no</label><input id="f-adm" value="'+esc(s.admission_no||nextAdm())+'"></div>'
        +'<div class="field"><label>Gender</label><select id="f-gender"><option value="">—</option><option'+(s.gender==="M"?" selected":"")+'>M</option><option'+(s.gender==="F"?" selected":"")+'>F</option></select></div>'
        +'<div class="field"><label>Date of birth</label><input id="f-dob" type="date" value="'+esc(s.date_of_birth||"")+'"></div>'
        +'<div class="field"><label>Admission date</label><input id="f-admdate" type="date" value="'+esc(s.admission_date||new Date().toISOString().slice(0,10))+'"></div>'
        +'<div class="section-h">Placement</div>'
        +'<div class="field"><label>Class &amp; stream</label><select id="f-class">'+classOpts+'</select></div>'
        +'<div class="field"><label>Boarding</label><select id="f-res"><option'+(s.residence!=="Boarder"?" selected":"")+'>Day</option><option'+(s.residence==="Boarder"?" selected":"")+'>Boarder</option></select></div>'
        +'<div class="field"><label>Dormitory</label><select id="f-dorm">'+dormOpts+'</select></div>'
        +'<div class="field"><label>Status</label><select id="f-status"><option'+(s.status!=="inactive"?" selected":"")+'>active</option><option'+(s.status==="inactive"?" selected":"")+'>inactive</option></select></div>'
        +'<div class="section-h">Background</div>'
        +'<div class="field"><label>County</label><select id="f-county">'+countyOpts+'</select></div>'
        +'<div class="field"><label>Nationality</label><input id="f-nat" value="'+esc(s.nationality||"Kenyan")+'"></div>'
        +'<div class="field"><label>Religion</label><input id="f-rel" value="'+esc(s.religion||"")+'"></div>'
        +'<div class="field"><label>Blood group</label><select id="f-blood"><option value="">—</option>'+["A+","A-","B+","B-","O+","O-","AB+","AB-"].map(function(b){return '<option'+(s.blood_group===b?" selected":"")+'>'+b+'</option>';}).join("")+'</select></div>'
        +'<div class="field full" style="grid-column:span 2;"><label>Medical notes</label><input id="f-med" value="'+esc(s.medical_notes||"")+'" placeholder="Allergies, conditions…"></div>'
        +'<div class="section-h">Guardian</div>'
        +'<div class="field"><label>Guardian name</label><input id="f-gname" value="'+esc(s.guardian_name||"")+'"></div>'
        +'<div class="field"><label>Relationship</label><select id="f-grel"><option value="">—</option>'+["Mother","Father","Guardian","Grandparent","Uncle","Aunt","Sibling","Other"].map(function(r){return '<option'+(s.guardian_relation===r?" selected":"")+'>'+r+'</option>';}).join("")+'</select></div>'
        +'<div class="field"><label>Guardian phone</label><input id="f-gphone" value="'+esc(s.guardian_phone||"")+'" placeholder="+2547…"></div>'
        +'<div class="field" style="grid-column:span 3;"><label>Guardian email</label><input id="f-gemail" value="'+esc(s.guardian_email||"")+'"></div>'
        +'</div></div><div class="modal-actions"><button class="btn-sm" id="cancel">Cancel</button><button class="btn-primary" id="save">Save student</button></div>',true);
      // auto-select grade text from class for legacy 'grade' column
      m.q("#cancel").onclick=m.close;
      m.q("#save").onclick=async function(){
        var clsId=m.q("#f-class").value||null;
        var cls=classes.find(function(c){return c.id===clsId;});
        var rec={ school_id:schoolId, first_name:m.q("#f-first").value.trim(), last_name:m.q("#f-last").value.trim(),
          admission_no:m.q("#f-adm").value.trim()||null, gender:m.q("#f-gender").value||null,
          date_of_birth:m.q("#f-dob").value||null, admission_date:m.q("#f-admdate").value||null,
          class_id:clsId, grade:cls?cls.level:(s.grade||null), residence:m.q("#f-res").value,
          dormitory_id:m.q("#f-dorm").value||null, status:m.q("#f-status").value,
          county:m.q("#f-county").value||null, nationality:m.q("#f-nat").value.trim()||null,
          religion:m.q("#f-rel").value.trim()||null, blood_group:m.q("#f-blood").value||null,
          medical_notes:m.q("#f-med").value.trim()||null, guardian_name:m.q("#f-gname").value.trim()||null,
          guardian_relation:m.q("#f-grel").value||null, guardian_phone:m.q("#f-gphone").value.trim()||null,
          guardian_email:m.q("#f-gemail").value.trim()||null };
        if(!rec.first_name||!rec.last_name){ toast("First and last name are required."); return; }
        var r=s.id? await sb.from("students").update(rec).eq("id",s.id) : await sb.from("students").insert(rec);
        if(r.error){ toast("Error: "+r.error.message); return; }
        m.close(); toast(s.id?"Student updated":"Student enrolled"); load();
      };
    }
    document.getElementById("add-student").onclick=function(){
      if(!classes.length){ toast("Set up classes first (Settings → Classes & Streams)."); return; }
      form(null);
    };
    document.getElementById("stu-search").oninput=draw;
    document.getElementById("stu-class-filter").onchange=draw;
    load();
  }

  // ====================================================
  //  FEES v2  (structure-aware collection + receipts)
  // ====================================================
  async function renderFeesV2(sb, schoolId, el){
    var school=null;
    async function init(){
      var sc=await sb.from("schools").select("*").eq("id",schoolId).single(); school=sc.data||{name:schoolId};
      var students=(await sb.from("students").select("id,first_name,last_name,grade,class_id,admission_no").eq("school_id",schoolId)).data||[];
      var structures=(await sb.from("fee_structures").select("*, fee_items(amount)").eq("school_id",schoolId)).data||[];
      var payments=(await sb.from("fee_payments").select("*").eq("school_id",schoolId)).data||[];
      // billed per student = structure total for their level (sum across active terms)
      var totalByLevelTerm={}; structures.forEach(function(s){ totalByLevelTerm[s.level]= (totalByLevelTerm[s.level]||0) + (s.fee_items||[]).reduce(function(a,i){return a+Number(i.amount);},0); });
      var paidByStudent={}; payments.forEach(function(p){ paidByStudent[p.student_id]=(paidByStudent[p.student_id]||0)+Number(p.amount); });
      var billedTotal=0, collected=0;
      students.forEach(function(s){ var b=totalByLevelTerm[s.grade]||0; billedTotal+=b; });
      collected=payments.reduce(function(a,p){return a+Number(p.amount);},0);
      var outstanding=Math.max(0,billedTotal-collected);

      el.innerHTML='<div class="mod-head"><div><h2>Fees &amp; Invoicing</h2><p>Collect fees against each class\u2019s structure and issue professional receipts.</p></div>'
        +'<button class="btn-primary" id="collect">+ Collect payment</button></div>'
        +'<div class="statgrid" style="grid-template-columns:repeat(4,1fr);">'
        +stat("Billed (term)",money(billedTotal),"#EEF0FF","#4F46E5",icDoc())
        +stat("Collected",money(collected),"#ECFDF3","#067647",icCash())
        +stat("Outstanding",money(outstanding),"#FFF6ED","#C2410C",icAlert())
        +stat("Collection rate",(billedTotal?Math.round(collected/billedTotal*100):0)+"%","#F1ECFE","#6D28D9",icChart())
        +'</div>'
        +'<div class="tabs" id="fee-tabs"><button data-t="ledger" class="on">Student ledger</button><button data-t="receipts">Receipts</button></div>'
        +'<div id="fee-body" style="margin-top:16px;"></div>';
      document.getElementById("collect").onclick=function(){ if(!students.length){toast("Enrol students first.");return;} collectForm(); };
      var tab="ledger";
      el.querySelectorAll("#fee-tabs button").forEach(function(b){ b.onclick=function(){ tab=b.getAttribute("data-t"); el.querySelectorAll("#fee-tabs button").forEach(function(x){x.classList.remove("on");}); b.classList.add("on"); tab==="ledger"?ledger():receipts(); }; });

      function ledger(){
        var body=document.getElementById("fee-body");
        if(!students.length){ body.innerHTML='<div class="empty">No students yet.</div>'; return; }
        var html='<table class="data"><thead><tr><th>Student</th><th>Class</th><th>Billed</th><th>Paid</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody>';
        students.forEach(function(s){
          var billed=totalByLevelTerm[s.grade]||0, paid=paidByStudent[s.id]||0, bal=billed-paid;
          var st= bal<=0&&billed>0?"green":(paid>0?"amber":"red"), lbl= billed===0?"No structure":(bal<=0?"Cleared":(paid>0?"Partial":"Unpaid"));
          if(billed===0) st="gray";
          html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(s.first_name+" "+s.last_name)+'<div class="muted" style="font-size:11px;">'+esc(s.admission_no||"")+'</div></td>'
            +'<td>'+esc(s.grade||"—")+'</td><td>'+money(billed)+'</td><td style="color:#067647;font-weight:600;">'+money(paid)+'</td>'
            +'<td style="font-weight:700;color:'+(bal>0?"#C2410C":"#067647")+';">'+money(Math.max(0,bal))+'</td>'
            +'<td><span class="pill '+st+'">'+lbl+'</span></td>'
            +'<td style="text-align:right;white-space:nowrap;"><button class="btn-primary" style="padding:6px 12px;font-size:12px;" data-pay="'+s.id+'">Collect</button></td></tr>';
        });
        body.innerHTML=html+'</tbody></table>';
        body.querySelectorAll("[data-pay]").forEach(function(b){ b.onclick=function(){ collectForm(b.getAttribute("data-pay")); }; });
      }
      async function receipts(){
        var body=document.getElementById("fee-body");
        var r=await sb.from("fee_payments").select("*").eq("school_id",schoolId).order("paid_at",{ascending:false});
        var rows=r.data||[]; var nameOf={}; students.forEach(function(s){ nameOf[s.id]=s.first_name+" "+s.last_name; });
        if(!rows.length){ body.innerHTML='<div class="empty">No receipts issued yet.</div>'; return; }
        var html='<table class="data"><thead><tr><th>Receipt no</th><th>Student</th><th>Amount</th><th>Method</th><th>Date</th><th></th></tr></thead><tbody>';
        rows.forEach(function(p){
          html+='<tr><td class="mono" style="font-size:12px;font-weight:600;">'+esc(p.receipt_no)+'</td><td style="font-weight:600;color:#1A1D26;">'+esc(nameOf[p.student_id]||"—")+'</td>'
            +'<td style="font-weight:700;color:#067647;">'+money(p.amount)+'</td><td><span class="pill gray">'+esc(p.method)+'</span></td>'
            +'<td class="muted" style="font-size:12px;">'+new Date(p.paid_at).toLocaleDateString()+'</td>'
            +'<td style="text-align:right;"><button class="btn-sm" data-r="'+p.id+'">View receipt</button></td></tr>';
        });
        body.innerHTML=html+'</tbody></table>';
        body.querySelectorAll("[data-r]").forEach(function(b){ b.onclick=function(){ var p=rows.find(function(x){return x.id===b.getAttribute("data-r");}); showReceipt(p, students.find(function(s){return s.id===p.student_id;})); }; });
      }

      function collectForm(preId){
        var opts=students.map(function(s){ return '<option value="'+s.id+'"'+(preId===s.id?" selected":"")+'>'+esc(s.first_name+" "+s.last_name)+(s.admission_no?" ("+esc(s.admission_no)+")":"")+'</option>'; }).join("");
        function balOf(id){ var s=students.find(function(x){return x.id===id;}); var billed=s?(totalByLevelTerm[s.grade]||0):0; var paid=paidByStudent[id]||0; return {billed:billed,paid:paid,bal:Math.max(0,billed-paid),s:s}; }
        var m=modal('<h3>Collect payment</h3><div class="grid2">'
          +'<div class="field full"><label>Student</label><select id="p-stu">'+opts+'</select></div>'
          +'<div class="field full"><div id="p-bal" style="background:#F8FAFB;border:1px solid #EEF0F2;border-radius:10px;padding:11px 13px;font-size:12.5px;"></div></div>'
          +'<div class="field"><label>Amount (KES)</label><input id="p-amt" type="number" placeholder="0"></div>'
          +'<div class="field"><label>Method</label><select id="p-method"><option>Cash</option><option>M-Pesa</option><option>Bank</option><option>Cheque</option><option>Card</option></select></div>'
          +'<div class="field"><label>Term</label><select id="p-term"><option>Term 1</option><option>Term 2</option><option>Term 3</option></select></div>'
          +'<div class="field"><label>Reference (M-Pesa/Cheque)</label><input id="p-ref" placeholder="e.g. SLJ7XK2P"></div>'
          +'<div class="field full"><label>Note (optional)</label><input id="p-note"></div>'
          +'</div><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Record &amp; print receipt</button></div>');
        function refreshBal(){ var b=balOf(m.q("#p-stu").value); m.q("#p-bal").innerHTML='Billed <strong>'+money(b.billed)+'</strong> &nbsp;·&nbsp; Paid <strong style="color:#067647;">'+money(b.paid)+'</strong> &nbsp;·&nbsp; Balance <strong style="color:#C2410C;">'+money(b.bal)+'</strong>'+(b.billed===0?' <span class="muted">(no fee structure for '+esc(b.s?b.s.grade:"")+')</span>':''); if(!m.q("#p-amt").value&&b.bal>0) m.q("#p-amt").value=b.bal; }
        m.q("#p-stu").onchange=refreshBal; refreshBal();
        m.q("#c").onclick=m.close;
        m.q("#s").onclick=async function(){
          var sid=m.q("#p-stu").value, amt=Number(m.q("#p-amt").value)||0;
          if(amt<=0){ toast("Enter an amount."); return; }
          var rn=await sb.rpc("next_receipt_no",{ p_school:schoolId });
          var receiptNo=rn.data||("RCT-"+Date.now());
          var who=(await sb.auth.getUser()).data.user; who=who?who.email:null;
          var rec={ school_id:schoolId, student_id:sid, receipt_no:receiptNo, amount:amt, method:m.q("#p-method").value, reference:m.q("#p-ref").value.trim()||null, term:m.q("#p-term").value, year:new Date().getFullYear(), note:m.q("#p-note").value.trim()||null, received_by:who };
          var r=await sb.from("fee_payments").insert(rec).select().single();
          if(r.error){ toast("Error: "+r.error.message); return; }
          paidByStudent[sid]=(paidByStudent[sid]||0)+amt;
          m.close(); toast("Payment recorded — receipt "+receiptNo);
          showReceipt(r.data, students.find(function(s){return s.id===sid;}));
          init(); // refresh stats + ledger
        };
      }
      ledger();
    }

    function showReceipt(p, stu){
      var billed=0; // compute fresh
      sb.from("fee_structures").select("level, fee_items(amount)").eq("school_id",schoolId).eq("level",stu?stu.grade:"").then(function(res){
        var structs=res.data||[]; billed=structs.reduce(function(a,s){return a+(s.fee_items||[]).reduce(function(x,i){return x+Number(i.amount);},0);},0);
        sb.from("fee_payments").select("amount").eq("school_id",schoolId).eq("student_id",p.student_id).then(function(pr){
          var paid=(pr.data||[]).reduce(function(a,x){return a+Number(x.amount);},0);
          var bal=Math.max(0,billed-paid), status= bal<=0&&billed>0?"PAID IN FULL":(paid>0?"PART PAYMENT":"RECEIVED");
          var sName=stu?(stu.first_name+" "+stu.last_name):"—";
          var ov=document.createElement("div"); ov.className="overlay";
          ov.innerHTML='<div style="display:flex;flex-direction:column;align-items:center;gap:14px;">'
            +'<div id="print-area"><div class="rcpt">'
            +'<div class="rc-top"><div class="rc-logo"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M5 18L4 7l4.5 5L12 4l3.5 8L20 7l-1 11H5z"/><rect x="5" y="19.2" width="14" height="2.1" rx="1.05"/></svg> Samaji</div>'
            +'<div class="rc-school">'+esc(school.name||"School")+'</div><div class="rc-sub">Official Fee Receipt</div>'
            +'<div class="rc-stamp">'+status+'</div></div>'
            +'<div class="rc-body"><div class="rc-meta">'
            +'<div><div class="k">Receipt No</div><div class="v">'+esc(p.receipt_no)+'</div></div>'
            +'<div><div class="k">Date</div><div class="v">'+new Date(p.paid_at||Date.now()).toLocaleDateString()+'</div></div>'
            +'<div><div class="k">Student</div><div class="v">'+esc(sName)+'</div></div>'
            +'<div><div class="k">Adm No</div><div class="v">'+esc(stu&&stu.admission_no||"—")+'</div></div>'
            +'<div><div class="k">Class</div><div class="v">'+esc(stu&&stu.grade||"—")+'</div></div>'
            +'<div><div class="k">Term</div><div class="v">'+esc(p.term)+' '+p.year+'</div></div>'
            +'<div><div class="k">Method</div><div class="v">'+esc(p.method)+(p.reference?' · '+esc(p.reference):'')+'</div></div>'
            +'<div><div class="k">Received by</div><div class="v">'+esc(p.received_by||"—")+'</div></div>'
            +'</div>'
            +'<div class="rc-amt"><div><div style="font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;color:#067647;">Amount Paid</div><div class="big">'+money(p.amount)+'</div></div>'
            +'<svg width="40" height="40" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#067647"/><path d="M8 12.5l2.5 2.5L16 9" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'
            +(billed>0?'<div class="rc-bal"><span class="muted">Term billed: '+money(billed)+'</span><span style="font-weight:700;color:'+(bal>0?"#C2410C":"#067647")+';">Balance: '+money(bal)+'</span></div>':'')
            +(p.note?'<div class="rc-line" style="border:none;color:#667085;">Note: '+esc(p.note)+'</div>':'')
            +'</div><div class="rc-foot">Thank you. This is a computer-generated receipt — '+esc(p.receipt_no)+'<br>Powered by Samaji · Pillartech Solutions</div>'
            +'</div></div>'
            +'<div style="display:flex;gap:10px;"><button class="btn-sm" id="rc-close">Close</button><button class="btn-primary" id="rc-print">🖨 Print receipt</button></div></div>';
          ov.addEventListener("click",function(e){ if(e.target===ov) ov.remove(); });
          document.body.appendChild(ov);
          ov.querySelector("#rc-close").onclick=function(){ ov.remove(); };
          ov.querySelector("#rc-print").onclick=function(){ window.print(); };
        });
      });
    }
    function stat(lbl,val,bg,ink,ic){ return '<div class="stat"><div class="ic" style="background:'+bg+';color:'+ink+'">'+ic+'</div><div class="lbl">'+lbl+'</div><div class="val">'+val+'</div></div>'; }
    init();
  }

  // ====================================================
  //  REPORTS
  // ====================================================
  async function renderReports(sb, schoolId, el){
    el.innerHTML='<div class="mod-head"><div><h2>Reports &amp; Analytics</h2><p>Live insight across enrollment, finance and attendance.</p></div></div><div id="rep-body"><div class="empty">Loading insights…</div></div>';
    var students=(await sb.from("students").select("*").eq("school_id",schoolId)).data||[];
    var classes=await loadClasses(sb, schoolId);
    var payments=(await sb.from("fee_payments").select("*").eq("school_id",schoolId)).data||[];
    var structures=(await sb.from("fee_structures").select("*, fee_items(amount)").eq("school_id",schoolId)).data||[];
    var classOf={}; classes.forEach(function(c){ classOf[c.id]=c.level; });

    // enrollment by gender
    var male=students.filter(function(s){return s.gender==="M";}).length, female=students.filter(function(s){return s.gender==="F";}).length, other=students.length-male-female;
    // enrollment by level
    var byLevel={}; students.forEach(function(s){ var lv=s.grade||classOf[s.class_id]||"Unassigned"; byLevel[lv]=(byLevel[lv]||0)+1; });
    var levelOrder=["PP1","PP2","Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9"];
    var levelData=Object.keys(byLevel).sort(function(a,b){ var ia=levelOrder.indexOf(a),ib=levelOrder.indexOf(b); return (ia<0?99:ia)-(ib<0?99:ib); }).map(function(k){ return {label:k.replace("Grade ","G"),value:byLevel[k]}; });
    // collection by method
    var byMethod={}; payments.forEach(function(p){ byMethod[p.method]=(byMethod[p.method]||0)+Number(p.amount); });
    var methodData=Object.keys(byMethod).map(function(k){ return {label:k,value:Math.round(byMethod[k])}; });
    // collection trend by month (last 6)
    var months=[]; var now=new Date();
    for(var i=5;i>=0;i--){ var d=new Date(now.getFullYear(),now.getMonth()-i,1); months.push({key:d.getFullYear()+"-"+d.getMonth(),label:d.toLocaleString("en",{month:"short"}),value:0}); }
    payments.forEach(function(p){ var d=new Date(p.paid_at); var key=d.getFullYear()+"-"+d.getMonth(); var m=months.find(function(x){return x.key===key;}); if(m) m.value+=Number(p.amount); });
    // finance totals
    var totalByLevel={}; structures.forEach(function(s){ totalByLevel[s.level]=(totalByLevel[s.level]||0)+(s.fee_items||[]).reduce(function(a,i){return a+Number(i.amount);},0); });
    var billed=students.reduce(function(a,s){return a+(totalByLevel[s.grade]||0);},0);
    var collected=payments.reduce(function(a,p){return a+Number(p.amount);},0);
    var outstanding=Math.max(0,billed-collected);
    var C=window.SamajiCharts;

    var genderData=[{label:"Male",value:male,color:"#4F46E5"},{label:"Female",value:female,color:"#EC4899"}]; if(other>0) genderData.push({label:"Other",value:other,color:"#94A3B8"});

    document.getElementById("rep-body").innerHTML=
      '<div class="statgrid">'
      +sCard("Total students",students.length,"#EEF0FF","#4F46E5")
      +sCard("Boarders",students.filter(function(s){return s.residence==="Boarder";}).length,"#F1ECFE","#6D28D9")
      +sCard("Fees collected",money(collected),"#ECFDF3","#067647")
      +sCard("Outstanding",money(outstanding),"#FFF6ED","#C2410C")
      +'</div>'
      +'<div class="cardrow c2">'
      +'<div class="chartcard"><div class="ch-head"><h3>Fee collection trend</h3><span class="sub">Last 6 months</span></div>'+C.line(months,{height:200})+'</div>'
      +'<div class="chartcard"><div class="ch-head"><h3>Enrollment by gender</h3></div><div style="display:flex;align-items:center;gap:20px;"><div>'+C.donut(genderData,{center:"Students"})+'</div><div style="flex:1;">'+C.legend(genderData)+'</div></div></div>'
      +'</div>'
      +'<div class="cardrow c2">'
      +'<div class="chartcard"><div class="ch-head"><h3>Enrollment by class</h3></div>'+(levelData.length?C.bar(levelData,{height:190}):empty())+'</div>'
      +'<div class="chartcard"><div class="ch-head"><h3>Collection by method</h3></div>'+(methodData.length?'<div style="display:flex;align-items:center;gap:20px;"><div>'+C.donut(methodData,{center:"KES"})+'</div><div style="flex:1;">'+C.legend(methodData.map(function(d,i){return {label:d.label,value:money(d.value),color:C.PAL[i%C.PAL.length]};}))+'</div></div>':empty())+'</div>'
      +'</div>'
      +'<div class="chartcard"><div class="ch-head"><h3>Finance summary</h3><span class="sub">'+(billed?Math.round(collected/billed*100):0)+'% collected</span></div>'
      +'<div class="bar" style="height:14px;"><span style="width:'+(billed?Math.round(collected/billed*100):0)+'%;background:linear-gradient(90deg,#0E9384,#10B981);"></span></div>'
      +'<div style="display:flex;justify-content:space-between;margin-top:10px;font-size:12.5px;"><span class="muted">Collected <strong style="color:#067647;">'+money(collected)+'</strong></span><span class="muted">Billed <strong style="color:#15171E;">'+money(billed)+'</strong></span></div></div>';

    function sCard(l,v,bg,ink){ return '<div class="stat"><div class="lbl">'+l+'</div><div class="val" style="color:'+ink+'">'+v+'</div></div>'; }
    function empty(){ return '<div class="empty" style="padding:24px;">Not enough data yet.</div>'; }
  }

  // icons
  function icDoc(){ return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M7 3h7l4 4v14H7z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 3v4h4" stroke="currentColor" stroke-width="1.8"/></svg>'; }
  function icCash(){ return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.8"/></svg>'; }
  function icAlert(){ return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 4l9 16H3z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 10v4M12 17h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'; }
  function icChart(){ return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'; }

  // expose + override
  window.SamajiPlus={ settings:renderSettings, students:renderStudentsV2, fees:renderFeesV2, reports:renderReports };
  if(window.SchoolModules){
    window.SchoolModules["module.students"]=renderStudentsV2;
    window.SchoolModules["module.finance"]=renderFeesV2;
  }
})();
