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
  // collected-vs-target columns (Zeraki style): light track = target, colored fill = collected, % label
  function targetBars(data, opts){ // data:[{label,collected,target}]
    opts=opts||{}; var h=opts.height||210, w=opts.width||560, pad=30, bw=opts.bw||30;
    var max=Math.max(1,Math.max.apply(null,data.map(function(d){return Math.max(d.target,d.collected);})));
    var n=data.length, gap=(w-pad-8)/Math.max(n,1), plotH=h-pad-30;
    var grid=""; for(var g=0;g<=3;g++){ var gy=h-26-plotH*g/3; grid+='<line x1="'+pad+'" y1="'+gy+'" x2="'+w+'" y2="'+gy+'" stroke="#F0F1F4"></line>'; }
    var cols=data.map(function(d,i){
      var x=pad+i*gap+(gap-bw)/2;
      var th=plotH*d.target/max, ch=plotH*Math.min(d.collected,max)/max;
      var ty=h-26-th, cy=h-26-ch;
      var pct=d.target>0?Math.round(d.collected/d.target*100):0;
      var col=pct>=100?"#067647":pct>=60?"#0E9384":pct>=30?"#F59E0B":"#EF4444";
      return '<rect x="'+x+'" y="'+ty+'" width="'+bw+'" height="'+Math.max(th,2)+'" rx="5" fill="#EAF0EE"></rect>'
        +'<rect x="'+x+'" y="'+cy+'" width="'+bw+'" height="'+Math.max(ch,2)+'" rx="5" fill="'+col+'"><title>'+esc(d.label)+': '+pct+'% ('+Math.round(d.collected).toLocaleString()+' / '+Math.round(d.target).toLocaleString()+')</title></rect>'
        +'<text x="'+(x+bw/2)+'" y="'+(cy-5)+'" text-anchor="middle" font-size="9.5" font-weight="700" fill="'+col+'">'+pct+'%</text>'
        +'<text x="'+(x+bw/2)+'" y="'+(h-10)+'" text-anchor="middle" font-size="10" fill="#98A2B3">'+esc(d.label)+'</text>';
    }).join("");
    return '<svg viewBox="0 0 '+w+' '+h+'" width="100%" preserveAspectRatio="xMidYMid meet">'+grid+cols+'</svg>';
  }
  window.SamajiCharts={ bar:barChart, line:lineChart, donut:donut, legend:legend, targetBars:targetBars, PAL:PAL };

  // ====================================================
  //  Cache layer — now lives in assets/idb-cache.js, loaded before
  //  this file. That version is a strict upgrade over what used to
  //  be defined inline here: it persists to IndexedDB (survives a
  //  reload, not just a single session), adds stale-while-revalidate,
  //  and already has the same in-flight-request de-dup fix this file
  //  used to carry inline (the "preload() and the dashboard's own
  //  first render both ask for the same tables" race). Same public
  //  shape (get/invalidate/clear/preload), so every call site below
  //  keeps working unmodified.
  var SamajiCache = window.SamajiCache;
  function cget(sb, schoolId, table, sel){ return SamajiCache.get(sb, schoolId, table, sel); }

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
    // On mobile, a still-focused number/text input keeps the on-screen keyboard
    // open, which can cover a bottom-anchored toast entirely. Blurring first
    // dismisses the keyboard immediately so the toast is actually visible.
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
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
  async function loadClasses(sb, schoolId){
    var rows=await cget(sb, schoolId, "school_classes", "*");
    return rows.slice().sort(function(a,b){ return ((a.sort||0)-(b.sort||0)) || ((a.stream||"")<(b.stream||"")?-1:(a.stream||"")>(b.stream||"")?1:0); });
  }
  function classLabel(c){ return c.level + (c.stream? " "+c.stream : ""); }

  // ====================================================
  //  SETTINGS  (admin academic setup)
  // ====================================================
  async function renderSettings(sb, schoolId, el){
    var tab="classes";
    el.innerHTML='<div class="mod-head"><div><h2>School Settings</h2><p>Configure classes, streams, boarding and fee structures. Set these once — they power registration and billing.</p></div></div>'
      +'<div class="tabs" id="set-tabs">'
      +'<button data-t="profile">School Profile</button>'
      +'<button data-t="classes" class="on">Classes &amp; Streams</button>'
      +'<button data-t="subjects">Subjects</button>'
      +'<button data-t="teachers">Teachers</button>'
      +'<button data-t="dorms">Dormitories</button>'
      +'<button data-t="fees">Fee Structures</button>'
      +'<button data-t="cbc">CBC Assessment</button>'
      +'<button data-t="activity">Activity Log</button>'
      +'</div><div id="set-body" style="margin-top:18px;"></div>';
    el.querySelectorAll("#set-tabs button").forEach(function(b){ b.onclick=function(){ tab=b.getAttribute("data-t"); el.querySelectorAll("#set-tabs button").forEach(function(x){x.classList.remove("on");}); b.classList.add("on"); render(); }; });
    function render(){ if(tab==="profile") profileTab(); else if(tab==="classes") classes(); else if(tab==="subjects") subjects(); else if(tab==="teachers") teachersTab(); else if(tab==="dorms") dorms(); else if(tab==="fees") fees(); else if(tab==="activity") activityLog(); else cbcSetup(); }

    // ---------- Activity Log: read-only trail of who changed what ----
    // (audit_log is populated entirely by DB triggers — see
    // setup-modules-26.sql — nothing in this app writes to it directly)
    var actPage=1;
    async function activityLog(pg){
      if(typeof pg==="number") actPage=pg; else actPage=1;
      var body=document.getElementById("set-body");
      body.innerHTML='<div class="skel" style="height:200px;"></div>';
      var r=await sb.from("audit_log").select("*").eq("school_id",schoolId).order("created_at",{ascending:false}).limit(500);
      if(r.error){ body.innerHTML='<div class="empty" style="color:#C2410C;">Could not load activity log: '+esc(r.error.message)+'</div>'; return; }
      var rows=r.data||[];
      if(!rows.length){ body.innerHTML='<div class="empty">No activity recorded yet.</div>'; return; }
      var pgData=window.paginate(rows,actPage,25);
      var actionColor={INSERT:"#067647",UPDATE:"#B54708",DELETE:"#C2410C"};
      var html='<p class="muted" style="font-size:12.5px;margin:0 0 12px;">Every change to payments, fee structures, student records, account roles and M-Pesa configuration for this school — recorded automatically, cannot be edited from this app.</p>'
        +'<table class="data"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Table</th><th>Record</th></tr></thead><tbody>';
      pgData.rows.forEach(function(row){
        html+='<tr><td style="white-space:nowrap;font-size:12px;">'+new Date(row.created_at).toLocaleString()+'</td>'
          +'<td>'+esc(row.actor_email||"—")+(row.actor_id?'':' <span class="muted" style="font-size:11px;">(automated)</span>')+'</td>'
          +'<td><span class="pill" style="color:'+(actionColor[row.action]||"#475467")+';background:'+(actionColor[row.action]||"#475467")+'1a;">'+esc(row.action)+'</span></td>'
          +'<td class="mono" style="font-size:12px;">'+esc(row.table_name)+'</td>'
          +'<td class="mono" style="font-size:11px;color:#98A2B3;">'+esc((row.record_id||"").slice(0,8))+'</td></tr>';
      });
      body.innerHTML=html+'</tbody></table>'+pgData.html;
      pgData.onAttach(body,function(p){ activityLog(p); });
    }

    // ----- school profile & logo -----
    async function profileTab(){
      var body=document.getElementById("set-body");
      var sc=await sb.from("schools").select("*").eq("id",schoolId).single();
      var info=sc.data||{};
      var logoUrl=info.logo_url||"";
      if(!logoUrl) try{ logoUrl=localStorage.getItem("school_logo_"+schoolId)||""; }catch(e2){}
      body.innerHTML='<div class="chartcard" style="max-width:640px;">'
        +'<div class="ch-head"><h3>School Profile &amp; Logo</h3></div>'
        +'<div style="display:flex;gap:24px;align-items:flex-start;margin-top:12px;">'
        +'<div id="logo-preview" style="width:100px;height:100px;border-radius:12px;border:2px dashed #DDE1E6;display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;background:#F8FAFB;">'
        +(logoUrl?'<img src="'+esc(logoUrl)+'" style="width:100%;height:100%;object-fit:contain;">':'<span class="muted" style="font-size:11px;text-align:center;">No logo<br>uploaded</span>')
        +'</div>'
        +'<div style="flex:1;"><div class="field"><label>School name</label><input id="sp-name" value="'+esc(info.name||"")+'" style="width:100%;"></div>'
        +'<div class="field"><label>Address / Location</label><input id="sp-addr" value="'+esc(info.address||"")+'" style="width:100%;"></div>'
        +'<div class="grid2"><div class="field"><label>Phone</label><input id="sp-phone" value="'+esc(info.phone||"")+'"></div>'
        +'<div class="field"><label>Email</label><input id="sp-email" value="'+esc(info.email||"")+'"></div></div>'
        +'<div class="field"><label>Motto / Tagline</label><input id="sp-motto" value="'+esc(info.motto||"")+'" placeholder="e.g. Education for a Better Tomorrow" style="width:100%;"></div>'
        +'<div style="display:flex;gap:10px;margin-top:12px;">'
        +'<label class="btn-sm" style="cursor:pointer;"><input type="file" id="sp-logo-file" accept="image/*" style="display:none;"> ⬆ Upload logo</label>'
        +(logoUrl?'<button class="btn-sm danger" id="sp-logo-rm">Remove logo</button>':'')
        +'</div></div></div>'
        +'<div class="modal-actions" style="margin-top:18px;"><button class="btn-primary" id="sp-save">Save profile</button></div>'
        +'</div>';
      document.getElementById("sp-logo-file").onchange=async function(e){
        var file=e.target.files[0]; if(!file) return;
        if(file.size>500*1024){ toast("Logo must be under 500 KB."); return; }
        var ext=(file.name.split(".").pop()||"png").toLowerCase().replace(/[^a-z0-9]/g,"")||"png";
        var path=schoolId+"/logo."+ext;
        var up=await sb.storage.from("school-logos").upload(path, file, {upsert:true, cacheControl:"3600", contentType:file.type||undefined});
        if(up.error){ toast("Logo upload failed: "+up.error.message); return; }
        var pub=sb.storage.from("school-logos").getPublicUrl(path);
        var publicUrl=(pub.data&&pub.data.publicUrl)?pub.data.publicUrl+"?v="+Date.now():"";
        var r=await sb.from("schools").update({logo_url:publicUrl}).eq("id",schoolId);
        if(r.error){ toast("Logo uploaded but couldn't be saved to your profile: "+r.error.message); return; }
        try{ localStorage.removeItem("school_logo_"+schoolId); }catch(e2){}
        toast("Logo saved"); profileTab();
      };
      var rmBtn=document.getElementById("sp-logo-rm");
      if(rmBtn) rmBtn.onclick=async function(){
        var r=await sb.from("schools").update({logo_url:null}).eq("id",schoolId);
        if(r.error){ toast("Couldn't remove logo: "+r.error.message); return; }
        try{ localStorage.removeItem("school_logo_"+schoolId); }catch(e2){}
        toast("Logo removed"); profileTab();
      };
      document.getElementById("sp-save").onclick=async function(){
        var name=document.getElementById("sp-name").value.trim();
        if(!name){ toast("School name is required."); return; }
        var rec={name:name, phone:document.getElementById("sp-phone").value.trim()||null, address:document.getElementById("sp-addr").value.trim()||null, email:document.getElementById("sp-email").value.trim()||null, motto:document.getElementById("sp-motto").value.trim()||null};
        var r=await sb.from("schools").update(rec).eq("id",schoolId);
        if(r.error){ toast("Couldn't save profile: "+r.error.message); return; }
        toast("Profile saved");
      };
    }

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
            +'<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-csub="'+c.id+'">Subjects &amp; teachers</button> <button class="btn-sm" data-edit="'+c.id+'">Edit</button> <button class="btn-sm danger" data-del="'+c.id+'">Delete</button></td></tr>';
        });
        t.innerHTML=html+'</tbody></table>';
        t.querySelectorAll("[data-edit]").forEach(function(b){ b.onclick=function(){ classForm(list.find(function(x){return x.id===b.getAttribute("data-edit");})); }; });
        t.querySelectorAll("[data-csub]").forEach(function(b){ b.onclick=function(){ classSubjectsForm(list.find(function(x){return x.id===b.getAttribute("data-csub");})); }; });
        t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete this class? Students keep their record but lose the link."))return; var r=await sb.from("school_classes").delete().eq("id",b.getAttribute("data-del")); if(r.error){toast("Error: "+r.error.message);return;} SamajiCache.invalidate("school_classes"); toast("Class deleted"); classes(); }; });
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
        SamajiCache.invalidate("school_classes");
        m.close(); toast("Saved"); classes();
      };
    }

    // ----- subjects & teachers assigned to a class -----
    async function classSubjectsForm(c){
      var sr=await sb.from("subjects").select("*").eq("school_id",schoolId).order("name"); var allSubjects=sr.data||[];
      if(!allSubjects.length){ toast("Add subjects first, in the Subjects tab."); return; }
      var tr=await sb.from("teachers").select("*").eq("school_id",schoolId).order("name"); var allTeachers=tr.data||[];
      var csr=await sb.from("class_subjects").select("subject_id").eq("class_id",c.id); var assignedIds=(csr.data||[]).map(function(x){return x.subject_id;});
      var ctr=await sb.from("class_subject_teachers").select("*").eq("class_id",c.id); var teacherBySubj={}; (ctr.data||[]).forEach(function(x){ teacherBySubj[x.subject_id]=x.teacher_id; });
      var teacherOpts=function(selected){ return '<option value="">— unassigned —</option>'+allTeachers.map(function(t){return '<option value="'+t.id+'"'+(selected===t.id?" selected":"")+'>'+esc(t.name)+'</option>';}).join(""); };
      var rows=allSubjects.map(function(s){
        var checked=assignedIds.indexOf(s.id)>=0;
        return '<div class="cst-row" style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line-2);">'
          +'<label style="display:flex;align-items:center;gap:8px;flex:1;cursor:pointer;font-size:13px;"><input type="checkbox" class="cst-chk" data-sid="'+s.id+'"'+(checked?" checked":"")+'> '+esc(s.name)+'</label>'
          +'<select class="cst-teacher" data-sid="'+s.id+'" style="min-width:190px;"'+(checked?"":" disabled")+'>'+teacherOpts(teacherBySubj[s.id])+'</select>'
          +'</div>';
      }).join("");
      var m=modal('<h3>Subjects &amp; teachers — '+esc(classLabel(c))+'</h3><p class="muted" style="font-size:12.5px;margin:0 0 6px;">Tick the subjects this class takes and assign who teaches each one. This feeds the Timetable.</p>'
        +'<div style="max-height:380px;overflow:auto;">'+rows+'</div>'
        +'<div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Save</button></div>', true);
      m.q("#c").onclick=m.close;
      m.qa(".cst-chk").forEach(function(chk){ chk.onchange=function(){ var sel=m.el.querySelector('.cst-teacher[data-sid="'+chk.getAttribute("data-sid")+'"]'); sel.disabled=!chk.checked; }; });
      m.q("#s").onclick=async function(){
        var checkedIds=[]; m.qa(".cst-chk").forEach(function(chk){ if(chk.checked) checkedIds.push(chk.getAttribute("data-sid")); });
        var del=await sb.from("class_subjects").delete().eq("class_id",c.id);
        if(del.error){ toast("Error: "+del.error.message); return; }
        if(checkedIds.length){
          var ins=await sb.from("class_subjects").insert(checkedIds.map(function(sid){ return { class_id:c.id, subject_id:sid }; }));
          if(ins.error){ toast("Error: "+ins.error.message); return; }
        }
        var delT=await sb.from("class_subject_teachers").delete().eq("class_id",c.id);
        if(delT.error){ toast("Error: "+delT.error.message); return; }
        var teacherRows=[];
        checkedIds.forEach(function(sid){ var sel=m.el.querySelector('.cst-teacher[data-sid="'+sid+'"]'); if(sel.value) teacherRows.push({ class_id:c.id, subject_id:sid, teacher_id:sel.value }); });
        if(teacherRows.length){
          var insT=await sb.from("class_subject_teachers").insert(teacherRows);
          if(insT.error){ toast("Saved subjects, but teacher assignment failed: "+insT.error.message); m.close(); classes(); return; }
        }
        m.close(); toast("Saved"); classes();
      };
    }

    // ----- subjects catalog -----
    async function subjects(){
      var body=document.getElementById("set-body");
      body.innerHTML='<div class="toolbar" style="margin-top:0;"><span class="muted" style="font-size:12.5px;flex:1;">The subject catalog for this school — used when assigning subjects to a class.</span><button class="btn-primary" id="add-subject">+ Add subject</button></div><div id="subj-table"></div>';
      var r=await sb.from("subjects").select("*").eq("school_id",schoolId).order("name");
      var list=r.data||[], t=document.getElementById("subj-table");
      if(!list.length){ t.innerHTML='<div class="empty">No subjects yet. Add one, e.g. Mathematics.</div>'; }
      else {
        var html='<table class="data"><thead><tr><th>Name</th><th>Code</th><th></th></tr></thead><tbody>';
        list.forEach(function(s){
          html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(s.name)+'</td><td>'+(s.code?esc(s.code):'<span class="muted">—</span>')+'</td>'
            +'<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-edit="'+s.id+'">Edit</button> <button class="btn-sm danger" data-del="'+s.id+'">Delete</button></td></tr>';
        });
        t.innerHTML=html+'</tbody></table>';
        t.querySelectorAll("[data-edit]").forEach(function(b){ b.onclick=function(){ subjectForm(list.find(function(x){return x.id===b.getAttribute("data-edit");})); }; });
        t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete this subject? It will be removed from any classes it's assigned to."))return; var r=await sb.from("subjects").delete().eq("id",b.getAttribute("data-del")); if(r.error){toast("Error: "+r.error.message);return;} toast("Deleted"); subjects(); }; });
      }
      document.getElementById("add-subject").onclick=function(){ subjectForm(null); };
    }
    function subjectForm(s){
      s=s||{};
      var m=modal('<h3>'+(s.id?"Edit subject":"Add subject")+'</h3><div class="grid2">'
        +'<div class="field"><label>Name</label><input id="sj-name" value="'+esc(s.name||"")+'" placeholder="Mathematics"></div>'
        +'<div class="field"><label>Code (optional)</label><input id="sj-code" value="'+esc(s.code||"")+'" placeholder="MATH"></div>'
        +'</div><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="sv">Save</button></div>');
      m.q("#c").onclick=m.close;
      m.q("#sv").onclick=async function(){
        var rec={ school_id:schoolId, name:m.q("#sj-name").value.trim(), code:m.q("#sj-code").value.trim()||null };
        if(!rec.name){ toast("Name is required."); return; }
        var r=s.id? await sb.from("subjects").update(rec).eq("id",s.id) : await sb.from("subjects").insert(rec);
        if(r.error){ toast("Error: "+(r.error.message.indexOf("duplicate")>=0?"That subject already exists.":r.error.message)); return; }
        m.close(); toast("Saved"); subjects();
      };
    }

    // ----- teacher directory -----
    var POSITION_LABEL={ principal:"Principal", deputy_principal:"Deputy Principal", dos:"Director of Studies" };
    async function teachersTab(){
      var body=document.getElementById("set-body");
      body.innerHTML='<div class="toolbar" style="margin-top:0;"><span class="muted" style="font-size:12.5px;flex:1;">Teaching staff directory — assign them to subjects from the Classes tab, and to a class as class teacher below. A teacher signs up at <span class="mono">/teacher/</span> with the email below to get their own portal login.</span><button class="btn-primary" id="add-teacher">+ Add teacher</button></div><div id="tch-table"></div>';
      var r=await sb.from("teachers").select("*").eq("school_id",schoolId).order("name");
      var list=r.data||[], t=document.getElementById("tch-table");
      var clsRes=await loadClasses(sb, schoolId);
      var classTeacherOf={}; clsRes.forEach(function(c){ if(c.class_teacher_id) classTeacherOf[c.class_teacher_id]=c; });
      if(!list.length){ t.innerHTML='<div class="empty">No teachers yet. Add your teaching staff here.</div>'; }
      else {
        var html='<table class="data"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Class teacher of</th><th>Portal login</th><th></th></tr></thead><tbody>';
        list.forEach(function(s){
          var ct=classTeacherOf[s.id];
          html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(s.name)+'</td><td>'+(s.email?esc(s.email):'<span class="muted">—</span>')+'</td><td>'+(s.phone?esc(s.phone):'<span class="muted">—</span>')+'</td>'
            +'<td>'+(s.school_position?'<span class="pill indigo">'+esc(POSITION_LABEL[s.school_position]||s.school_position)+'</span>':'<span class="muted">—</span>')+'</td>'
            +'<td>'+(ct?'<span class="pill green">'+esc(classLabel(ct))+'</span>':'<span class="muted">—</span>')+'</td>'
            +'<td>'+(s.auth_user_id?'<span class="pill green">active</span>':'<span class="pill gray">not signed up</span>')+'</td>'
            +'<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-edit="'+s.id+'">Edit</button> <button class="btn-sm danger" data-del="'+s.id+'">Delete</button></td></tr>';
        });
        t.innerHTML=html+'</tbody></table>';
        t.querySelectorAll("[data-edit]").forEach(function(b){ b.onclick=function(){ teacherForm(list.find(function(x){return x.id===b.getAttribute("data-edit");})); }; });
        t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete this teacher? They will be unassigned from any classes/subjects and lose portal access."))return; var r=await sb.from("teachers").delete().eq("id",b.getAttribute("data-del")); if(r.error){toast("Error: "+r.error.message);return;} toast("Deleted"); teachersTab(); }; });
      }
      document.getElementById("add-teacher").onclick=function(){ teacherForm(null); };
    }
    async function teacherForm(s){
      s=s||{};
      var classes=await loadClasses(sb, schoolId);
      var tNamesRes=await sb.from("teachers").select("id,name").eq("school_id",schoolId);
      var teacherNameById={}; (tNamesRes.data||[]).forEach(function(t){ teacherNameById[t.id]=t.name; });
      // Which class (if any) is this teacher currently the class teacher of —
      // pre-selects the dropdown below when editing.
      var currentClassId = s.id ? (classes.find(function(c){ return c.class_teacher_id===s.id; })||{}).id : "";
      var classOpts = '<option value="">— Not a class teacher —</option>' + classes.map(function(c){
        var taken = c.class_teacher_id && c.class_teacher_id!==s.id;
        return '<option value="'+c.id+'"'+(c.id===currentClassId?" selected":"")+'>'+esc(classLabel(c))+(taken?' (currently: '+esc(teacherNameById[c.class_teacher_id]||"another teacher")+')':'')+'</option>';
      }).join("");
      var m=modal('<h3>'+(s.id?"Edit teacher":"Add teacher")+'</h3><div class="grid2">'
        +'<div class="field full"><label>Full name</label><input id="t-name" value="'+esc(s.name||"")+'" placeholder="Jane Wambui"></div>'
        +'<div class="field"><label>Email (used to sign in at /teacher/)</label><input id="t-email" value="'+esc(s.email||"")+'" placeholder="jane@school.ac.ke"></div>'
        +'<div class="field"><label>Phone</label><input id="t-phone" value="'+esc(s.phone||"")+'" placeholder="07XX XXX XXX"></div>'
        +'<div class="field"><label>School position</label><select id="t-position">'
          +'<option value=""'+(!s.school_position?" selected":"")+'>— Teacher —</option>'
          +'<option value="principal"'+(s.school_position==="principal"?" selected":"")+'>Principal</option>'
          +'<option value="deputy_principal"'+(s.school_position==="deputy_principal"?" selected":"")+'>Deputy Principal</option>'
          +'<option value="dos"'+(s.school_position==="dos"?" selected":"")+'>Director of Studies</option>'
        +'</select></div>'
        +'<div class="field full"><label>Class teacher of</label><select id="t-classteacher">'+classOpts+'</select>'
        +'<p class="muted" style="font-size:11.5px;margin:5px 0 0;">This is the name printed as "Facilitator" on that class\'s report cards, and who records core competencies/values &amp; the overall remark in Report Books.</p></div>'
        +'</div><p class="muted" style="font-size:12px;margin:12px 0 0;">KRA PIN, ID/payroll number and salary are set in <strong>Payroll → Staff</strong>, linked to this teacher.</p><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="sv">Save</button></div>', true);
      m.q("#c").onclick=m.close;
      m.q("#sv").onclick=async function(){
        var rec={ school_id:schoolId, name:m.q("#t-name").value.trim(), email:m.q("#t-email").value.trim()||null, phone:m.q("#t-phone").value.trim()||null,
          school_position:m.q("#t-position").value||null };
        if(!rec.name){ toast("Name is required."); return; }
        var selectedClassId = m.q("#t-classteacher").value;
        if (selectedClassId){
          var target = classes.find(function(c){ return c.id===selectedClassId; });
          if (target && target.class_teacher_id && target.class_teacher_id!==s.id){
            if (!await window.SM_confirm(classLabel(target)+" already has a class teacher. Reassign to "+(rec.name||"this teacher")+"?")) return;
          }
        }
        var r=s.id? await sb.from("teachers").update(rec).eq("id",s.id) : await sb.from("teachers").insert(rec).select().single();
        if(r.error){ toast("Error: "+r.error.message); return; }
        var teacherId = s.id || (r.data && r.data.id);
        // Clear this teacher from any OTHER class that previously had them as class
        // teacher, then set the newly-chosen one (a class has at most one class teacher).
        var clearFrom = classes.filter(function(c){ return c.class_teacher_id===teacherId && c.id!==selectedClassId; }).map(function(c){ return c.id; });
        if (clearFrom.length){
          var clr=await sb.from("school_classes").update({ class_teacher_id:null }).in("id",clearFrom);
          if(clr.error){ toast("Saved teacher, but couldn't clear previous class-teacher assignment: "+clr.error.message); m.close(); teachersTab(); return; }
        }
        if (selectedClassId){
          var setCt=await sb.from("school_classes").update({ class_teacher_id:teacherId }).eq("id",selectedClassId);
          if(setCt.error){ toast("Saved teacher, but couldn't set class teacher: "+setCt.error.message); m.close(); teachersTab(); return; }
        }
        if (clearFrom.length || selectedClassId) SamajiCache.invalidate("school_classes");
        m.close(); toast("Saved"); teachersTab();
      };
    }

    // ----- CBC assessment setup (academic years/terms, assessment types, grading schemes) -----
    async function cbcSetup(){
      var body=document.getElementById("set-body");
      var sub="years";
      body.innerHTML='<div class="toolbar" style="margin-top:0;"><div class="seg" id="cbc-tabs"><button data-s="years" class="on-present">Years &amp; Terms</button><button data-s="assess">Assessment Types</button><button data-s="grading">Grading Schemes</button></div></div><div id="cbc-body" style="margin-top:14px;"></div>';
      body.querySelectorAll("#cbc-tabs button").forEach(function(b){ b.onclick=function(){ sub=b.getAttribute("data-s"); body.querySelectorAll("#cbc-tabs button").forEach(function(x){x.className="";}); b.className="on-present"; draw(); }; });
      function draw(){ if(sub==="years") yearsTermsTab(); else if(sub==="assess") assessmentTypesTab(); else gradingSchemesTab(); }

      // ----- years & terms -----
      async function yearsTermsTab(){
        var cb=document.getElementById("cbc-body");
        cb.innerHTML='<div class="toolbar" style="margin-top:0;"><span class="muted" style="font-size:12.5px;flex:1;">Academic years and their terms. Only one year and one term should typically be marked active at a time.</span><button class="btn-primary" id="add-year">+ Add academic year</button></div><div id="years-list"></div>';
        var r=await sb.from("academic_years").select("*, terms(*)").eq("school_id",schoolId).order("year",{ascending:false});
        var list=r.data||[]; var wrap=document.getElementById("years-list");
        if(!list.length){ wrap.innerHTML='<div class="empty">No academic years yet. Click <strong>+ Add academic year</strong>.</div>'; }
        else {
          wrap.innerHTML=list.map(function(ay){
            var terms=(ay.terms||[]).slice().sort(function(a,b){return a.sort-b.sort;});
            return '<div class="panel" style="margin-bottom:12px;"><div style="display:flex;align-items:center;justify-content:space-between;">'
              +'<strong style="font-size:14px;">'+ay.year+'</strong>'
              +'<div style="display:flex;align-items:center;gap:8px;"><span class="pill '+(ay.status==="active"?"green":ay.status==="closed"?"gray":"amber")+'">'+ay.status+'</span>'
              +'<button class="btn-sm" data-add-term="'+ay.id+'">+ Term</button> <button class="btn-sm danger" data-del-year="'+ay.id+'">Delete</button></div></div>'
              +(terms.length?'<table class="data" style="margin-top:10px;"><thead><tr><th>Term</th><th>Dates</th><th>Status</th><th></th></tr></thead><tbody>'
                + terms.map(function(t){ return '<tr><td style="font-weight:600;">'+esc(t.name)+'</td><td>'+(t.start_date&&t.end_date?(t.start_date+" – "+t.end_date):'<span class="muted">—</span>')+'</td>'
                  +'<td><span class="pill '+(t.status==="active"?"green":t.status==="closed"?"gray":"amber")+'">'+t.status+'</span></td>'
                  +'<td style="text-align:right;"><button class="btn-sm" data-edit-term="'+t.id+'">Edit</button> <button class="btn-sm danger" data-del-term="'+t.id+'">Delete</button></td></tr>'; }).join("")
                +'</tbody></table>' : '<div class="empty" style="margin-top:10px;">No terms yet for this year.</div>')
              +'</div>';
          }).join("");
          wrap.querySelectorAll("[data-add-term]").forEach(function(b){ b.onclick=function(){ termForm(b.getAttribute("data-add-term"), null); }; });
          wrap.querySelectorAll("[data-edit-term]").forEach(function(b){ b.onclick=function(){ var term=null; list.some(function(ay){ term=(ay.terms||[]).find(function(t){return t.id===b.getAttribute("data-edit-term");}); return term; }); if(term) termForm(term.academic_year_id, term); }; });
          wrap.querySelectorAll("[data-del-term]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete this term?"))return; var r=await sb.from("terms").delete().eq("id",b.getAttribute("data-del-term")); if(r.error){toast("Error: "+r.error.message);return;} toast("Deleted"); yearsTermsTab(); }; });
          wrap.querySelectorAll("[data-del-year]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete this academic year and all its terms?"))return; var r=await sb.from("academic_years").delete().eq("id",b.getAttribute("data-del-year")); if(r.error){toast("Error: "+r.error.message);return;} toast("Deleted"); yearsTermsTab(); }; });
        }
        document.getElementById("add-year").onclick=function(){ yearForm(); };
      }
      function yearForm(){
        var now=new Date();
        var m=modal('<h3>Add academic year</h3><div class="grid2">'
          +'<div class="field"><label>Year</label><input id="ay-year" type="number" value="'+now.getFullYear()+'"></div>'
          +'<div class="field"><label>Status</label><select id="ay-status"><option value="upcoming">upcoming</option><option value="active" selected>active</option><option value="closed">closed</option></select></div>'
          +'</div><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Save</button></div>');
        m.q("#c").onclick=m.close;
        m.q("#s").onclick=async function(){
          var year=Number(m.q("#ay-year").value); if(!year){ toast("Enter a year."); return; }
          var r=await sb.from("academic_years").insert({ school_id:schoolId, year:year, status:m.q("#ay-status").value }).select().single();
          if(r.error){ toast(r.error.message.indexOf("duplicate")>=0?"That year already exists.":("Error: "+r.error.message)); return; }
          m.close(); toast("Academic year added"); yearsTermsTab();
        };
      }
      function termForm(academicYearId, t){
        t=t||{};
        var m=modal('<h3>'+(t.id?"Edit term":"Add term")+'</h3><div class="grid2">'
          +'<div class="field"><label>Name</label><input id="tm-name" value="'+esc(t.name||"")+'" placeholder="Term 1"></div>'
          +'<div class="field"><label>Sort order</label><input id="tm-sort" type="number" value="'+(t.sort||1)+'"></div>'
          +'<div class="field"><label>Start date</label><input id="tm-start" type="date" value="'+(t.start_date||"")+'"></div>'
          +'<div class="field"><label>End date</label><input id="tm-end" type="date" value="'+(t.end_date||"")+'"></div>'
          +'<div class="field full"><label>Status</label><select id="tm-status"><option value="upcoming"'+(t.status==="upcoming"?" selected":"")+'>upcoming</option><option value="active"'+(t.status==="active"?" selected":"")+'>active</option><option value="closed"'+(t.status==="closed"?" selected":"")+'>closed</option></select></div>'
          +'</div><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Save</button></div>', true);
        m.q("#c").onclick=m.close;
        m.q("#s").onclick=async function(){
          var rec={ school_id:schoolId, academic_year_id:academicYearId, name:m.q("#tm-name").value.trim(), sort:Number(m.q("#tm-sort").value)||0,
            start_date:m.q("#tm-start").value||null, end_date:m.q("#tm-end").value||null, status:m.q("#tm-status").value };
          if(!rec.name){ toast("Name is required."); return; }
          var r=t.id? await sb.from("terms").update(rec).eq("id",t.id) : await sb.from("terms").insert(rec);
          if(r.error){ toast(r.error.message.indexOf("duplicate")>=0?"That term already exists for this year.":("Error: "+r.error.message)); return; }
          m.close(); toast("Saved"); yearsTermsTab();
        };
      }

      // ----- assessment types -----
      async function assessmentTypesTab(){
        var cb=document.getElementById("cbc-body");
        cb.innerHTML='<div class="toolbar" style="margin-top:0;"><span class="muted" style="font-size:12.5px;flex:1;">The assessment types teachers can record marks against (CAT 1, Project, End Term Exam…), each with a weight toward the final subject score.</span><button class="btn-primary" id="add-assess">+ Add assessment type</button></div><div id="assess-table"></div>';
        var r=await sb.from("assessment_types").select("*").eq("school_id",schoolId).order("name");
        var list=r.data||[]; var t=document.getElementById("assess-table");
        if(!list.length){ t.innerHTML='<div class="empty">No assessment types yet.</div>'; }
        else {
          list=list.slice().sort(function(a,b){ return (a.sort||0)-(b.sort||0) || (a.name<b.name?-1:1); });
          var html='<table class="data"><thead><tr><th style="text-align:right;">Order</th><th>Name</th><th style="text-align:right;">Max marks</th><th style="text-align:right;">Weight</th><th>Counts to final</th><th>Grades</th><th></th></tr></thead><tbody>';
          list.forEach(function(a){
            html+='<tr><td style="text-align:right;color:#98A2B3;">'+(a.sort||0)+'</td><td style="font-weight:600;color:#1A1D26;">'+esc(a.name)+(a.is_system?' <span class="pill gray">default</span>':'')+'</td>'
              +'<td style="text-align:right;">'+a.max_marks+'</td><td style="text-align:right;">'+a.weight_percent+'%</td>'
              +'<td>'+(a.contributes_to_final?'<span class="pill green">Yes</span>':'<span class="pill gray">No</span>')+'</td>'
              +'<td>'+(a.applicable_grades&&a.applicable_grades.length?esc(a.applicable_grades.join(", ")):'<span class="muted">All</span>')+'</td>'
              +'<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-edit="'+a.id+'">Edit</button> <button class="btn-sm danger" data-del="'+a.id+'">Delete</button></td></tr>';
          });
          html+='</tbody></table>'; t.innerHTML=html;
          t.querySelectorAll("[data-edit]").forEach(function(b){ b.onclick=function(){ assessmentForm(list.find(function(x){return x.id===b.getAttribute("data-edit");})); }; });
          t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete this assessment type?"))return; var r=await sb.from("assessment_types").delete().eq("id",b.getAttribute("data-del")); if(r.error){toast("Error: "+r.error.message);return;} toast("Deleted"); assessmentTypesTab(); }; });
        }
        document.getElementById("add-assess").onclick=function(){ assessmentForm(); };
      }
      function assessmentForm(a){
        a=a||{};
        var m=modal('<h3>'+(a.id?"Edit":"Add")+' assessment type</h3><div class="grid2">'
          +'<div class="field full"><label>Name</label><input id="as-name" value="'+esc(a.name||"")+'" placeholder="CAT 1"></div>'
          +'<div class="field"><label>Max marks</label><input id="as-max" type="number" value="'+(a.max_marks||100)+'"></div>'
          +'<div class="field"><label>Weight toward final (%)</label><input id="as-weight" type="number" value="'+(a.weight_percent!=null?a.weight_percent:100)+'"></div>'
          +'<div class="field"><label>Counts toward final score</label><select id="as-contrib"><option value="true"'+(a.contributes_to_final!==false?" selected":"")+'>Yes</option><option value="false"'+(a.contributes_to_final===false?" selected":"")+'>No</option></select></div>'
          +'<div class="field"><label>Test order (sets First/Second/Third Test on the report card)</label><input id="as-sort" type="number" value="'+(a.sort||0)+'"></div>'
          +'<div class="field"><label>Applicable grades (comma separated, blank = all)</label><input id="as-grades" value="'+esc((a.applicable_grades||[]).join(", "))+'" placeholder="Grade 1, Grade 2"></div>'
          +'</div><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Save</button></div>', true);
        m.q("#c").onclick=m.close;
        m.q("#s").onclick=async function(){
          var gradesRaw=m.q("#as-grades").value.trim();
          var rec={ school_id:schoolId, name:m.q("#as-name").value.trim(), max_marks:Number(m.q("#as-max").value)||100,
            weight_percent:Number(m.q("#as-weight").value)||0, contributes_to_final:m.q("#as-contrib").value==="true",
            sort:Number(m.q("#as-sort").value)||0,
            applicable_grades: gradesRaw ? gradesRaw.split(",").map(function(s){return s.trim();}).filter(Boolean) : null };
          if(!rec.name){ toast("Name is required."); return; }
          var r=a.id? await sb.from("assessment_types").update(rec).eq("id",a.id) : await sb.from("assessment_types").insert(rec);
          if(r.error){ toast(r.error.message.indexOf("duplicate")>=0?"That assessment type already exists.":("Error: "+r.error.message)); return; }
          m.close(); toast("Saved"); assessmentTypesTab();
        };
      }

      // ----- grading schemes -----
      async function gradingSchemesTab(){
        var cb=document.getElementById("cbc-body");
        cb.innerHTML='<div class="toolbar" style="margin-top:0;"><span class="muted" style="font-size:12.5px;flex:1;">Score bands used to turn a percentage into a grade/competency on report cards.</span><button class="btn-primary" id="add-scheme">+ Add grading scheme</button></div><div id="scheme-list"></div>';
        var r=await sb.from("grading_schemes").select("*, grading_levels(*)").eq("school_id",schoolId).order("name");
        var list=r.data||[]; var wrap=document.getElementById("scheme-list");
        if(!list.length){ wrap.innerHTML='<div class="empty">No grading schemes yet.</div>'; }
        else {
          wrap.innerHTML=list.map(function(s){
            var levels=(s.grading_levels||[]).slice().sort(function(a,b){return a.sort-b.sort;});
            return '<div class="panel" style="margin-bottom:12px;"><div style="display:flex;align-items:center;justify-content:space-between;">'
              +'<strong style="font-size:14px;">'+esc(s.name)+(s.is_default?' <span class="pill green">default</span>':'')+'</strong>'
              +'<div style="display:flex;gap:8px;"><button class="btn-sm" data-add-level="'+s.id+'">+ Band</button> <button class="btn-sm" data-edit-scheme="'+s.id+'">Edit</button> <button class="btn-sm danger" data-del-scheme="'+s.id+'">Delete</button></div></div>'
              +(levels.length?'<table class="data" style="margin-top:10px;"><thead><tr><th>Range</th><th>Grade</th><th>Competency</th><th style="text-align:right;">Points</th><th>Remark</th><th></th></tr></thead><tbody>'
                + levels.map(function(l){ return '<tr><td>'+l.min_score+'–'+l.max_score+'</td><td style="font-weight:600;"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:'+esc(l.color||"#98A2B3")+';margin-right:6px;"></span>'+esc(l.grade_label||"—")+'</td>'
                  +'<td>'+(l.competency_code?esc(l.competency_code)+' — '+esc(l.competency_label||""):'<span class="muted">—</span>')+'</td>'
                  +'<td style="text-align:right;">'+(l.points!=null?l.points:'<span class="muted">—</span>')+'</td>'
                  +'<td>'+esc(l.remark||"—")+'</td>'
                  +'<td style="text-align:right;"><button class="btn-sm" data-edit-level="'+l.id+'">Edit</button> <button class="btn-sm danger" data-del-level="'+l.id+'">Delete</button></td></tr>'; }).join("")
                +'</tbody></table>' : '<div class="empty" style="margin-top:10px;">No bands yet — add one, e.g. 90–100 = EE1, 4.0 points.</div>')
              +'</div>';
          }).join("");
          wrap.querySelectorAll("[data-add-level]").forEach(function(b){ b.onclick=function(){ levelForm(b.getAttribute("data-add-level"), null); }; });
          wrap.querySelectorAll("[data-edit-scheme]").forEach(function(b){ b.onclick=function(){ schemeForm(list.find(function(x){return x.id===b.getAttribute("data-edit-scheme");})); }; });
          wrap.querySelectorAll("[data-del-scheme]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete this grading scheme and all its bands?"))return; var r=await sb.from("grading_schemes").delete().eq("id",b.getAttribute("data-del-scheme")); if(r.error){toast("Error: "+r.error.message);return;} toast("Deleted"); gradingSchemesTab(); }; });
          wrap.querySelectorAll("[data-edit-level]").forEach(function(b){ b.onclick=function(){ var lvl=null; list.some(function(s){ lvl=(s.grading_levels||[]).find(function(l){return l.id===b.getAttribute("data-edit-level");}); return lvl; }); if(lvl) levelForm(lvl.scheme_id, lvl); }; });
          wrap.querySelectorAll("[data-del-level]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete this band?"))return; var r=await sb.from("grading_levels").delete().eq("id",b.getAttribute("data-del-level")); if(r.error){toast("Error: "+r.error.message);return;} toast("Deleted"); gradingSchemesTab(); }; });
        }
        document.getElementById("add-scheme").onclick=function(){ schemeForm(); };
      }
      function schemeForm(s){
        s=s||{};
        var m=modal('<h3>'+(s.id?"Edit":"Add")+' grading scheme</h3><div class="grid2">'
          +'<div class="field full"><label>Name</label><input id="gs-name" value="'+esc(s.name||"")+'" placeholder="CBC Standard Scheme"></div>'
          +'<div class="field"><label>Default scheme</label><select id="gs-default"><option value="false"'+(!s.is_default?" selected":"")+'>No</option><option value="true"'+(s.is_default?" selected":"")+'>Yes</option></select></div>'
          +'<div class="field"><label>Applicable grades (comma separated, blank = all)</label><input id="gs-grades" value="'+esc((s.applicable_grades||[]).join(", "))+'" placeholder="Grade 1, Grade 2"></div>'
          +'</div><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="sv">Save</button></div>', true);
        m.q("#c").onclick=m.close;
        m.q("#sv").onclick=async function(){
          var gradesRaw=m.q("#gs-grades").value.trim();
          var rec={ school_id:schoolId, name:m.q("#gs-name").value.trim(), is_default:m.q("#gs-default").value==="true",
            applicable_grades: gradesRaw ? gradesRaw.split(",").map(function(x){return x.trim();}).filter(Boolean) : null };
          if(!rec.name){ toast("Name is required."); return; }
          var r=s.id? await sb.from("grading_schemes").update(rec).eq("id",s.id) : await sb.from("grading_schemes").insert(rec);
          if(r.error){ toast(r.error.message.indexOf("duplicate")>=0?"That scheme already exists.":("Error: "+r.error.message)); return; }
          m.close(); toast("Saved"); gradingSchemesTab();
        };
      }
      function levelForm(schemeId, l){
        l=l||{};
        var m=modal('<h3>'+(l.id?"Edit":"Add")+' grading band</h3><div class="grid2">'
          +'<div class="field"><label>Min score</label><input id="lv-min" type="number" value="'+(l.min_score!=null?l.min_score:0)+'"></div>'
          +'<div class="field"><label>Max score</label><input id="lv-max" type="number" value="'+(l.max_score!=null?l.max_score:100)+'"></div>'
          +'<div class="field"><label>Grade letter (optional)</label><input id="lv-grade" value="'+esc(l.grade_label||"")+'" placeholder="A"></div>'
          +'<div class="field"><label>Competency code (optional)</label><input id="lv-code" value="'+esc(l.competency_code||"")+'" placeholder="EE1"></div>'
          +'<div class="field"><label>Points (optional)</label><input id="lv-points" type="number" step="0.5" value="'+(l.points!=null?l.points:"")+'" placeholder="4.0"></div>'
          +'<div class="field full"><label>Competency label (optional)</label><input id="lv-label" value="'+esc(l.competency_label||"")+'" placeholder="Exceeding Expectation"></div>'
          +'<div class="field"><label>Remark (optional)</label><input id="lv-remark" value="'+esc(l.remark||"")+'" placeholder="Excellent"></div>'
          +'<div class="field"><label>Badge color</label><input id="lv-color" type="color" value="'+esc(l.color||"#0E9384")+'" style="height:38px;padding:4px;"></div>'
          +'</div><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Save</button></div>', true);
        m.q("#c").onclick=m.close;
        m.q("#s").onclick=async function(){
          var minS=Number(m.q("#lv-min").value), maxS=Number(m.q("#lv-max").value);
          if(maxS<minS){ toast("Max score must be at least the min score."); return; }
          var pointsRaw=m.q("#lv-points").value.trim();
          var rec={ scheme_id:schemeId, min_score:minS, max_score:maxS, grade_label:m.q("#lv-grade").value.trim()||null,
            competency_code:m.q("#lv-code").value.trim()||null, competency_label:m.q("#lv-label").value.trim()||null, remark:m.q("#lv-remark").value.trim()||null,
            points: pointsRaw?Number(pointsRaw):null, color:m.q("#lv-color").value||null };
          var r=l.id? await sb.from("grading_levels").update(rec).eq("id",l.id) : await sb.from("grading_levels").insert(rec);
          if(r.error){ toast("Error: "+r.error.message); return; }
          m.close(); toast("Saved"); gradingSchemesTab();
        };
      }

      draw();
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
        t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete this dormitory?"))return; var r=await sb.from("dormitories").delete().eq("id",b.getAttribute("data-del")); if(r.error){toast("Error: "+r.error.message);return;} SamajiCache.invalidate("dormitories"); toast("Deleted"); dorms(); }; });
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
        if(r.error){ toast("Error: "+r.error.message); return; } SamajiCache.invalidate("dormitories"); m.close(); toast("Saved"); dorms();
      };
    }

    // ----- fee structures -----
    async function fees(){
      var body=document.getElementById("set-body");
      body.innerHTML='<div class="toolbar" style="margin-top:0;"><span class="muted" style="font-size:12.5px;flex:1;">Define what each class is billed per term. The Fees module uses these to compute every student\u2019s balance.</span><button class="btn-primary" id="add-fs">+ New structure</button></div><div id="fs-list"></div>';
      var r=await sb.from("fee_structures").select("*, fee_items(name,amount,mandatory,sort)").eq("school_id",schoolId).order("year",{ascending:false}).order("level");
      var list=r.data||[], t=document.getElementById("fs-list");
      if(!list.length){ t.innerHTML='<div class="empty">No fee structures yet. Create one per class/term — e.g. Grade 6 · Term 1.</div>'; }
      else {
        var html='<table class="data"><thead><tr><th>Class level</th><th>Term</th><th>Year</th><th>Items</th><th>Total / student</th><th></th></tr></thead><tbody>';
        list.forEach(function(f){
          var total=(f.fee_items||[]).reduce(function(a,i){return a+Number(i.amount);},0);
          html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(f.level)+'</td><td>'+esc(f.term)+'</td><td>'+f.year+'</td><td>'+(f.fee_items||[]).length+'</td>'
            +'<td style="font-weight:700;">'+money(total)+'</td>'
            +'<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-dup="'+f.id+'">Duplicate</button> <button class="btn-sm" data-edit="'+f.id+'">Edit items</button> <button class="btn-sm danger" data-del="'+f.id+'">Delete</button></td></tr>';
        });
        t.innerHTML=html+'</tbody></table>';
        t.querySelectorAll("[data-edit]").forEach(function(b){ b.onclick=function(){ fsEditor(list.find(function(x){return x.id===b.getAttribute("data-edit");})); }; });
        t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete this fee structure and its items?"))return; var r=await sb.from("fee_structures").delete().eq("id",b.getAttribute("data-del")); if(r.error){toast("Error: "+r.error.message);return;} SamajiCache.invalidate("fee_structures"); toast("Deleted"); fees(); }; });
        t.querySelectorAll("[data-dup]").forEach(function(b){ b.onclick=function(){
          var f=list.find(function(x){return x.id===b.getAttribute("data-dup");});
          if(!f) return;
          var allTerms=["Term 1","Term 2","Term 3"];
          var existing={}; list.forEach(function(x){ if(x.level===f.level && x.year===f.year) existing[x.term]=true; });
          var available=allTerms.filter(function(t){ return !existing[t]; });
          if(!available.length){ toast("All three terms already have a structure for "+f.level+" "+f.year+"."); return; }
          var checkboxes=available.map(function(t){ return '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 0;"><input type="checkbox" value="'+esc(t)+'" checked> '+esc(t)+'</label>'; }).join("");
          var items=(f.fee_items||[]);
          var itemList=items.length?items.map(function(i){return esc(i.name||"Item")+" — "+money(i.amount);}).join("<br>"):'<span class="muted">No items</span>';
          var dm=modal('<h3>Duplicate fee structure</h3>'
            +'<p class="muted" style="font-size:12.5px;margin:0;">Copy <strong>'+esc(f.level)+' · '+esc(f.term)+' '+f.year+'</strong> ('+money((items).reduce(function(a,i){return a+Number(i.amount);},0))+') to other terms with the same items.</p>'
            +'<div style="margin-top:12px;padding:10px 12px;background:#F8FAFB;border:1px solid #EEF0F2;border-radius:8px;font-size:12.5px;">'+itemList+'</div>'
            +'<div style="margin-top:14px;"><strong style="font-size:12.5px;">Duplicate to:</strong><div id="dup-terms" style="margin-top:6px;">'+checkboxes+'</div></div>'
            +'<div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Duplicate</button></div>');
          dm.q("#c").onclick=dm.close;
          dm.q("#s").onclick=async function(){
            var checks=dm.q("#dup-terms").querySelectorAll("input:checked");
            var selected=[]; checks.forEach(function(c){ selected.push(c.value); });
            if(!selected.length){ toast("Select at least one term."); return; }
            var btn=dm.q("#s"); btn.disabled=true; btn.textContent="Duplicating…";
            var created=0;
            for(var i=0;i<selected.length;i++){
              var term=selected[i];
              var rec={school_id:schoolId, level:f.level, term:term, year:f.year, name:f.level+" — "+term};
              var nr=await sb.from("fee_structures").insert(rec).select().single();
              if(nr.error){ toast("Error for "+term+": "+nr.error.message); continue; }
              if(items.length){
                var newItems=items.map(function(it){ return {structure_id:nr.data.id, name:it.name, amount:Number(it.amount), mandatory:it.mandatory, sort:it.sort||0}; });
                var ir=await sb.from("fee_items").insert(newItems);
                if(ir.error) toast("Items error for "+term+": "+ir.error.message);
              }
              created++;
            }
            SamajiCache.invalidate("fee_structures");
            dm.close(); toast("Duplicated to "+created+" term"+(created===1?"":"s")+"."); fees();
          };
        }; });
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
          var r=await sb.from("fee_structures").insert(rec).select().single(); SamajiCache.invalidate("fee_structures");
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
          t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){ var r=await sb.from("fee_items").delete().eq("id",b.getAttribute("data-del")); if(r.error){toast("Error: "+r.error.message);return;} SamajiCache.invalidate("fee_structures"); draw(); }; });
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
          var r=await sb.from("fee_items").insert({ structure_id:fs.id, name:name, amount:Number(m.q("#fi-amt").value)||0, mandatory:m.q("#fi-mand").value==="true" }); SamajiCache.invalidate("fee_structures");
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
    el.innerHTML='<div class="mod-head"><div><h2>Students</h2><p>Enrollment records, biodata, class and boarding.</p></div>'
      +'<div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn-sm" id="import-students">⭱ Import CSV</button><button class="btn-sm" id="import-balances">⭱ Import opening balances</button><button class="btn-sm" id="promote-students">⇪ Promote to next class</button><button class="btn-primary" id="add-student">+ New student</button></div></div>'
      +'<div class="toolbar"><div class="search"><span style="color:#98A2B3;">⌕</span><input id="stu-search" placeholder="Search name or admission no…"></div>'
      +'<select id="stu-class-filter"><option value="">All classes</option></select>'
      +'<span class="muted" id="stu-count" style="font-size:12.5px;margin-left:auto;"></span></div><div id="stu-table"></div>';
    var classes=await loadClasses(sb, schoolId);
    var dr=await sb.from("dormitories").select("*").eq("school_id",schoolId).order("name"); var dorms=dr.data||[];
    var rr=await sb.from("transport_routes").select("*").eq("school_id",schoolId).order("name"); var routes=rr.data||[];
    var classOf={}; classes.forEach(function(c){ classOf[c.id]=classLabel(c); });
    var dormOf={}; dorms.forEach(function(d){ dormOf[d.id]=d.name; });
    var routeOf={}; routes.forEach(function(r){ routeOf[r.id]=r.name; });
    var cf=document.getElementById("stu-class-filter"); classes.forEach(function(c){ cf.innerHTML+='<option value="'+c.id+'">'+esc(classLabel(c))+'</option>'; });
    var all=[];
    async function load(){
      var all2=await cget(sb, schoolId, "students", "*");
      all=all2.slice().sort(function(a,b){ return new Date(a.created_at||0)-new Date(b.created_at||0); });
      draw();
    }
    var stuPage=1;
    function draw(pg){
      if(typeof pg==="number") stuPage=pg; else stuPage=1;
      var q=(document.getElementById("stu-search").value||"").toLowerCase();
      var cfv=document.getElementById("stu-class-filter").value;
      var rows=all.filter(function(s){ return (!q||(s.first_name+" "+s.last_name+" "+(s.admission_no||"")).toLowerCase().indexOf(q)>=0) && (!cfv||s.class_id===cfv); });
      document.getElementById("stu-count").textContent=rows.length+" of "+all.length+" students";
      var t=document.getElementById("stu-table");
      if(!rows.length){ t.innerHTML='<div class="empty">No students match. Click <strong>+ New student</strong> to enrol one.</div>'; return; }
      var siblingMap={};
      all.forEach(function(x){ if(x.guardian_phone){ if(!siblingMap[x.guardian_phone]) siblingMap[x.guardian_phone]=[]; siblingMap[x.guardian_phone].push(x); } });
      var pgData=window.paginate(rows,stuPage);
      var pageRows=pgData.rows;
      var html='<table class="data"><thead><tr><th>Adm. No</th><th>Name</th><th>Class</th><th>Gender</th><th>Boarding</th><th>Guardian</th><th>Status</th><th></th></tr></thead><tbody>';
      pageRows.forEach(function(s){
        var boarding=s.residence==="Boarder"?('<span class="pill" style="color:#6D28D9;background:#F1ECFE;">'+esc(dormOf[s.dormitory_id]||"Boarder")+'</span>'):'<span class="pill gray">Day</span>';
        var siblings=s.guardian_phone?siblingMap[s.guardian_phone]:[];
        var siblingHtml='';
        if(siblings && siblings.length>1){
          var others=siblings.filter(function(x){return x.id!==s.id;});
          siblingHtml='<div style="font-size:10.5px;margin-top:2px;"><span style="color:#067647;font-weight:600;">⚇ Sibling'+(others.length>1?"s":"")+': </span>'+others.map(function(o){return '<span style="color:#4F46E5;">'+esc(o.first_name+" "+o.last_name)+'</span>';}).join(", ")+'</div>';
        }
        html+='<tr><td class="mono" style="font-size:12px;">'+esc(s.admission_no||"—")+'</td>'
          +'<td style="font-weight:600;color:#1A1D26;">'+esc(s.first_name+" "+s.last_name)+siblingHtml+'</td>'
          +'<td>'+esc(classOf[s.class_id]||s.grade||"—")+'</td><td>'+esc(s.gender||"—")+'</td><td>'+boarding+'</td>'
          +'<td>'+esc(s.guardian_name||"—")+'<div class="muted" style="font-size:11px;">'+esc(s.guardian_phone||"")+'</div></td>'
          +'<td><span class="pill '+(s.status==="active"?"green":"gray")+'">'+esc(s.status)+'</span></td>'
          +'<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-view="'+s.id+'">View</button> <button class="btn-sm" data-edit="'+s.id+'">Edit</button> <button class="btn-sm" data-promo="'+s.id+'">Promote</button> <button class="btn-sm danger" data-del="'+s.id+'">Delete</button></td></tr>';
      });
      t.innerHTML=html+'</tbody></table>'+pgData.html;
      pgData.onAttach(t,function(p){ draw(p); });
      t.querySelectorAll("[data-edit]").forEach(function(b){ b.onclick=function(){ form(all.find(function(x){return x.id===b.getAttribute("data-edit");})); }; });
      t.querySelectorAll("[data-view]").forEach(function(b){ b.onclick=function(){ view(all.find(function(x){return x.id===b.getAttribute("data-view");})); }; });
      t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){
        var sid=b.getAttribute("data-del");
        var stu=all.find(function(x){return x.id===sid;});
        var pr=await sb.from("fee_payments").select("amount,transport_amount").eq("student_id",sid);
        var fp=await sb.from("fee_structures").select("level, fee_items(amount)").eq("school_id",schoolId).eq("level",stu?stu.grade:"");
        var billed=(fp.data||[]).reduce(function(a,s){return a+(s.fee_items||[]).reduce(function(x,i){return x+Number(i.amount);},0);},0)+(Number(stu&&stu.opening_balance)||0);
        var paid=(pr.data||[]).reduce(function(a,p){return a+(Number(p.amount)-(Number(p.transport_amount)||0));},0);
        if(billed>0 && paid<billed){ toast("Cannot delete — student has an outstanding balance of "+money(billed-paid)+". Clear fees first."); return; }
        if(!await window.SM_confirm("Delete this student and all related records?"))return;
        var r=await sb.from("students").delete().eq("id",sid);
        if(r.error){toast("Error: "+r.error.message);return;} SamajiCache.invalidate("students"); toast("Student deleted"); load();
      }; });
      t.querySelectorAll("[data-promo]").forEach(function(b){ b.onclick=function(){ var s=all.find(function(x){return x.id===b.getAttribute("data-promo");}); if(s) promoteStudent(s); }; });
    }
    function promoteStudent(s){
      var curClass=classes.find(function(c){return c.id===s.class_id;});
      var fromLabel=curClass?classLabel(curClass):(s.grade||"Unknown");
      var toOpts=classes.filter(function(c){return c.id!==s.class_id;}).map(function(c){
        return '<option value="'+c.id+'">'+esc(classLabel(c))+'</option>';
      }).join("");
      if(!toOpts){ toast("No other classes available to promote to."); return; }
      var m=modal('<h3>Promote Student</h3>'
        +'<p class="muted" style="font-size:12.5px;margin:0;">'+esc(s.first_name+' '+s.last_name)+' ('+esc(s.admission_no||'—')+')</p>'
        +'<div class="grid2" style="margin-top:14px;">'
        +'<div class="field"><label>From class</label><select id="pr-from" disabled><option>'+esc(fromLabel)+'</option></select></div>'
        +'<div class="field"><label>To class</label><select id="pr-to">'+toOpts+'</select></div>'
        +'</div>'
        +'<div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Promote</button></div>');
      m.q("#c").onclick=m.close;
      m.q("#s").onclick=async function(){
        var toId=m.q("#pr-to").value;
        var toClass=classes.find(function(c){return c.id===toId;});
        if(!toClass){ toast("Select a destination class."); return; }
        if(!await window.SM_confirm("Promote "+s.first_name+" "+s.last_name+" from "+fromLabel+" to "+classLabel(toClass)+"?")) return;
        var btn=m.q("#s"); btn.disabled=true; btn.textContent="Promoting…";
        var r=await sb.from("students").update({class_id:toId, grade:toClass.level}).eq("id",s.id);
        if(r.error){ toast("Error: "+r.error.message); btn.disabled=false; btn.textContent="Promote"; return; }
        SamajiCache.invalidate("students");
        m.close(); toast(s.first_name+" "+s.last_name+" promoted to "+classLabel(toClass));
        load();
      };
    }
    function view(s){
      var c=classOf[s.class_id]||s.grade||"—";
      function row(k,v,attr){ return '<div><div class="muted" style="font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;">'+k+'</div><div style="font-weight:600;font-size:13.5px;margin-top:2px;"'+(attr||"")+'>'+esc(v||"—")+'</div></div>'; }
      var modalEl=modal('<h3>'+esc(s.first_name+" "+s.last_name)+'</h3><p class="muted" style="font-size:12.5px;margin:0;">'+esc(s.admission_no||"")+' · '+esc(c)+'</p>'
        +'<div class="modal-body"><div class="grid3" style="margin-top:16px;gap:14px;">'
        +row("Gender",s.gender)+row("Date of birth",s.date_of_birth)+row("Admitted",s.admission_date)
        +row("Boarding",s.residence)+row("Dormitory",dormOf[s.dormitory_id])+row("Blood group",s.blood_group)
        +row("County",s.county)+row("Nationality",s.nationality)+row("Religion",s.religion)
        +'<div style="grid-column:1/-1;" class="section-h">Transport</div>'
        +row("Bus route","Loading…",' id="v-bus-route"')+'<div></div><div></div>'
        +'<div style="grid-column:1/-1;" class="section-h">Guardian</div>'
        +row("Name",s.guardian_name)+row("Relationship",s.guardian_relation)+row("Phone",s.guardian_phone)
        +row("Email",s.guardian_email)+'<div></div><div></div>'
        +'<div style="grid-column:1/-1;">'+row("Medical notes",s.medical_notes)+'</div>'
        +'</div></div><div class="modal-actions"><button class="btn-primary" id="ok">Close</button></div>',true);
      modalEl.q("#ok").onclick=function(){ document.querySelector(".overlay").remove(); };
      sb.from("transport_assignments").select("*, transport_routes(name,fare)").eq("student_id",s.id).maybeSingle().then(function(tr){
        var el=modalEl.q("#v-bus-route"); if(!el) return;
        var a=tr.data;
        el.textContent = (a && a.transport_routes) ? (a.transport_routes.name+" ("+money(a.transport_routes.fare)+")") : "Not assigned";
      });
    }
    function nextAdm(){
      var nums=all.map(function(s){ var m=/(\d+)$/.exec(s.admission_no||""); return m?parseInt(m[1]):0; });
      var max=nums.length?Math.max.apply(null,nums):0; return "ADM-"+String(max+1).padStart(4,"0");
    }
    async function form(s){
      s=s||{};
      var existingRouteId=null;
      if(s.id){ var ta=await sb.from("transport_assignments").select("route_id").eq("student_id",s.id).maybeSingle(); existingRouteId=ta.data?ta.data.route_id:null; }
      var classOpts='<option value="">— select class —</option>'+classes.map(function(c){ return '<option value="'+c.id+'"'+(s.class_id===c.id?" selected":"")+'>'+esc(classLabel(c))+'</option>'; }).join("");
      var dormOpts='<option value="">— none —</option>'+dorms.map(function(d){ return '<option value="'+d.id+'"'+(s.dormitory_id===d.id?" selected":"")+'>'+esc(d.name)+' ('+esc(d.gender)+')</option>'; }).join("");
      var countyOpts='<option value="">—</option>'+COUNTIES.map(function(c){ return '<option'+(s.county===c?" selected":"")+'>'+esc(c)+'</option>'; }).join("");
      var routeOpts='<option value="">— select route —</option>'+routes.map(function(r){ return '<option value="'+r.id+'"'+(existingRouteId===r.id?" selected":"")+'>'+esc(r.name)+' ('+money(r.fare)+')</option>'; }).join("");
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
        +'<div class="section-h">Transport</div>'
        +'<div class="field"><label>Uses school bus?</label><select id="f-bus"><option value="no"'+(!existingRouteId?" selected":"")+'>No</option><option value="yes"'+(existingRouteId?" selected":"")+'>Yes</option></select></div>'
        +'<div class="field" style="grid-column:span 2;"><label>Route</label><select id="f-route"'+(!existingRouteId?" disabled":"")+'>'+routeOpts+'</select></div>'
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
        +'<div class="section-h">Opening balance (migration only)</div>'
        +'<div class="field"><label>Balance b/f (KES)</label><input id="f-ob" type="number" value="'+esc(s.opening_balance||0)+'"></div>'
        +'<div class="field" style="grid-column:span 2;"><label>Note</label><input id="f-ob-note" value="'+esc(s.opening_balance_note||"")+'" placeholder="e.g. Arrears from previous system as at Jan 2026"></div>'
        +'</div></div><div class="modal-actions"><button class="btn-sm" id="cancel">Cancel</button><button class="btn-primary" id="save">Save student</button></div>',true);
      // auto-select grade text from class for legacy 'grade' column
      m.q("#cancel").onclick=m.close;
      m.q("#f-bus").onchange=function(){ m.q("#f-route").disabled=(m.q("#f-bus").value!=="yes"); };
      m.q("#save").onclick=async function(){
        var clsId=m.q("#f-class").value||null;
        var cls=classes.find(function(c){return c.id===clsId;});
        var usesBus=m.q("#f-bus").value==="yes", routeId=m.q("#f-route").value||null;
        if(usesBus && !routeId){ toast("Select a bus route, or set transport to No."); return; }
        var rec={ school_id:schoolId, first_name:m.q("#f-first").value.trim(), last_name:m.q("#f-last").value.trim(),
          admission_no:m.q("#f-adm").value.trim()||null, gender:m.q("#f-gender").value||null,
          date_of_birth:m.q("#f-dob").value||null, admission_date:m.q("#f-admdate").value||null,
          class_id:clsId, grade:cls?cls.level:(s.grade||null), residence:m.q("#f-res").value,
          dormitory_id:m.q("#f-dorm").value||null, status:m.q("#f-status").value,
          county:m.q("#f-county").value||null, nationality:m.q("#f-nat").value.trim()||null,
          religion:m.q("#f-rel").value.trim()||null, blood_group:m.q("#f-blood").value||null,
          medical_notes:m.q("#f-med").value.trim()||null, guardian_name:m.q("#f-gname").value.trim()||null,
          guardian_relation:m.q("#f-grel").value||null, guardian_phone:m.q("#f-gphone").value.trim()||null,
          guardian_email:m.q("#f-gemail").value.trim()||null,
          opening_balance:Number(m.q("#f-ob").value)||0, opening_balance_note:m.q("#f-ob-note").value.trim()||null };
        if(!rec.first_name||!rec.last_name){ toast("First and last name are required."); return; }
        var r=s.id? await sb.from("students").update(rec).eq("id",s.id).select().single() : await sb.from("students").insert(rec).select().single();
        if(r.error){ toast("Error: "+r.error.message); return; }
        var studentId=r.data.id;
        var tr= usesBus
          ? await sb.from("transport_assignments").upsert({ school_id:schoolId, student_id:studentId, route_id:routeId },{ onConflict:"student_id" })
          : await sb.from("transport_assignments").delete().eq("student_id",studentId);
        if(tr.error){ toast("Saved student, but transport assignment failed: "+tr.error.message); }
        SamajiCache.invalidate("transport_assignments");
        SamajiCache.invalidate("students");
        m.close(); toast(s.id?"Student updated":"Student enrolled"); load();
      };
    }
    document.getElementById("add-student").onclick=function(){
      if(!classes.length){ toast("Set up classes first (Settings → Classes & Streams)."); return; }
      form(null);
    };
    document.getElementById("stu-search").oninput=draw;
    document.getElementById("stu-class-filter").onchange=draw;

    // ---------- promote to next class ----------
    document.getElementById("promote-students").onclick=function(){
      if(classes.length<2){ toast("Add at least two classes first (Settings → Classes & Streams)."); return; }
      var sorted=classes; // already sorted by sort/stream from loadClasses()
      var fromOpts=sorted.map(function(c){ return '<option value="'+c.id+'">'+esc(classLabel(c))+'</option>'; }).join("");
      var m=modal('<h3>Promote students to next class</h3><p class="muted" style="font-size:12.5px;margin:0;">Moves every student in the "From" class into the "To" class. This updates their class permanently — review before confirming.</p>'
        +'<div class="grid2" style="margin-top:14px;">'
        +'<div class="field"><label>From class</label><select id="pr-from">'+fromOpts+'</select></div>'
        +'<div class="field"><label>To class</label><select id="pr-to">'+fromOpts+'</select></div>'
        +'</div><div id="pr-count" class="muted" style="font-size:12.5px;margin-top:10px;"></div>'
        +'<div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Promote</button></div>');
      function nextClassId(fromId){
        var i=sorted.findIndex(function(c){return c.id===fromId;});
        return (i>=0 && i+1<sorted.length)? sorted[i+1].id : fromId;
      }
      function refreshCount(){
        var fromId=m.q("#pr-from").value;
        var n=all.filter(function(s){return s.class_id===fromId;}).length;
        m.q("#pr-count").textContent=n+" of "+all.length+" student"+(n===1?"":"s")+" currently in "+classLabel(sorted.find(function(c){return c.id===fromId;}));
        m.q("#pr-to").value=nextClassId(fromId);
      }
      m.q("#pr-from").onchange=refreshCount; refreshCount();
      m.q("#c").onclick=m.close;
      m.q("#s").onclick=async function(){
        var fromId=m.q("#pr-from").value, toId=m.q("#pr-to").value;
        if(fromId===toId){ toast("Pick a different destination class."); return; }
        var toClass=sorted.find(function(c){return c.id===toId;});
        var list=all.filter(function(s){return s.class_id===fromId;});
        if(!list.length){ toast("No students in that class."); return; }
        if(!await window.SM_confirm("Promote "+list.length+" student(s) from "+classLabel(sorted.find(function(c){return c.id===fromId;}))+" to "+classLabel(toClass)+"? This cannot be undone automatically.")) return;
        var btn=m.q("#s"); btn.disabled=true; btn.textContent="Promoting…";
        var r=await sb.from("students").update({ class_id:toId, grade:toClass.level }).eq("school_id",schoolId).eq("class_id",fromId);
        if(r.error){ toast("Error: "+r.error.message); btn.disabled=false; btn.textContent="Promote"; return; }
        SamajiCache.invalidate("students");
        m.close(); toast(list.length+" student(s) promoted to "+classLabel(toClass));
        load();
      };
    };

    // ---------- bulk import (CSV) ----------
    document.getElementById("import-students").onclick=function(){
      if(!classes.length){ toast("Set up classes first (Settings → Classes & Streams)."); return; }
      var m=modal('<h3>Import students from CSV</h3>'
        +'<p class="muted" style="font-size:12.5px;margin:0;">Required columns: <code>first_name,last_name</code>. Everything else is optional and matches the fields on the manual "New student" form — a blank cell just leaves that field empty. <code>class</code> must match an existing class level (e.g. "Grade 6") and may include a stream ("Grade 6 East"). <code>residence</code> is "Day" or "Boarder" (defaults to Day if blank); <code>dormitory</code> only applies when residence is Boarder and must match an existing dormitory name. <code>county</code>, <code>blood_group</code> and <code>guardian_relation</code> must match one of the same options offered on the manual form — an unrecognized value is left blank rather than stored as-is, so bad data does not silently creep in. Dates use YYYY-MM-DD; a malformed date is dropped rather than risking the whole import. Opening balances (arrears from a previous system) are a separate step — use "Import opening balances" below after this one.</p>'
        +'<div class="field full" style="margin-top:12px;"><input type="file" id="im-file" accept=".csv,text/csv"></div>'
        +'<div id="im-preview" style="margin-top:12px;max-height:300px;overflow:auto;"></div>'
        +'<div class="modal-actions"><a id="im-template" download="students-template.csv" style="margin-right:auto;align-self:center;font-size:12.5px;">Download template</a><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s" disabled>Import</button></div>', true);
      var tplCsv="first_name,last_name,admission_no,gender,date_of_birth,admission_date,class,residence,dormitory,county,nationality,religion,blood_group,medical_notes,guardian_name,guardian_relation,guardian_phone,guardian_email,status\n"
        +"Jane,Doe,ADM-0101,F,2014-03-12,2026-01-15,Grade 6,Day,,Nairobi,Kenyan,Christian,O+,None,Mary Doe,Mother,+254700000000,mary@example.com,active\n"
        +"John,Smith,ADM-0102,M,2013-07-22,2026-01-15,Grade 6,Boarder,Kilimanjaro House,Kiambu,Kenyan,Christian,A+,Asthma - carries inhaler,James Smith,Father,+254711111111,james@example.com,active\n";
      m.q("#im-template").href="data:text/csv;charset=utf-8,"+encodeURIComponent(tplCsv);
      m.q("#c").onclick=m.close;
      var parsed=[];
      function parseCsv(text){
        var lines=text.split(/\r?\n/).filter(function(l){return l.trim().length;});
        if(!lines.length) return {rows:[],errors:["Empty file."]};
        var header=lines[0].split(",").map(function(h){return h.trim().toLowerCase();});
        var rows=[], errors=[];
        var VALID_BLOOD=["a+","a-","b+","b-","o+","o-","ab+","ab-"];
        var VALID_RELATION=["mother","father","guardian","grandparent","uncle","aunt","sibling","other"];
        var DATE_RE=/^\d{4}-\d{2}-\d{2}$/;
        for(var i=1;i<lines.length;i++){

          var cells=lines[i].split(",").map(function(c){return c.trim();});
          var row={}; header.forEach(function(h,idx){ row[h]=cells[idx]||""; });
          if(!row.first_name||!row.last_name){ errors.push("Row "+(i+1)+": missing first_name/last_name — skipped."); continue; }

          var cls=null;
          if(row["class"]){
            cls=classes.find(function(c){ return classLabel(c).toLowerCase()===row["class"].toLowerCase() || c.level.toLowerCase()===row["class"].toLowerCase(); });
            if(!cls) errors.push("Row "+(i+1)+": class \""+row["class"]+"\" not found — student left unassigned.");
          }

          // Was hardcoded to "Day" for every imported row regardless of
          // what the CSV said — a boarding school bulk-importing its
          // roster had every single student silently mislabeled, which
          // then throws off dormitory assignment and boarding-vs-day fee
          // structures. Now actually read from the CSV.
          var residenceRaw=(row.residence||"").toLowerCase();
          var residence = residenceRaw==="boarder" ? "Boarder" : "Day";
          if(row.residence && residenceRaw!=="day" && residenceRaw!=="boarder"){
            errors.push("Row "+(i+1)+": residence \""+row.residence+"\" not recognized (use \"Day\" or \"Boarder\") — defaulted to Day.");
          }

          var dorm=null;
          if(residence==="Boarder" && row.dormitory){
            dorm=dorms.find(function(d){ return d.name.toLowerCase()===row.dormitory.toLowerCase(); });
            if(!dorm) errors.push("Row "+(i+1)+": dormitory \""+row.dormitory+"\" not found — student left unassigned to a dormitory.");
          }

          var county=null;
          if(row.county){
            county=COUNTIES.find(function(c){ return c.toLowerCase()===row.county.toLowerCase(); }) || null;
            if(!county) errors.push("Row "+(i+1)+": county \""+row.county+"\" not recognized — left blank.");
          }

          var blood=null;
          if(row.blood_group){
            var bIdx=VALID_BLOOD.indexOf(row.blood_group.toLowerCase());
            if(bIdx>=0) blood=VALID_BLOOD[bIdx].toUpperCase();
            else errors.push("Row "+(i+1)+": blood group \""+row.blood_group+"\" not recognized — left blank.");
          }

          var relation=null;
          if(row.guardian_relation){
            var relLower=row.guardian_relation.toLowerCase();
            if(VALID_RELATION.indexOf(relLower)>=0) relation=relLower.charAt(0).toUpperCase()+relLower.slice(1);
            else errors.push("Row "+(i+1)+": guardian relation \""+row.guardian_relation+"\" not recognized — left blank.");
          }

          // A malformed date would fail at insert time for the WHOLE
          // batch (one bulk insert statement, not one per row) — dropped
          // here instead so one typo doesn't block everyone else's import.
          var dob=null;
          if(row.date_of_birth){
            if(DATE_RE.test(row.date_of_birth)) dob=row.date_of_birth;
            else errors.push("Row "+(i+1)+": date_of_birth \""+row.date_of_birth+"\" isn't YYYY-MM-DD — left blank.");
          }
          var admDate=new Date().toISOString().slice(0,10);
          if(row.admission_date){
            if(DATE_RE.test(row.admission_date)) admDate=row.admission_date;
            else errors.push("Row "+(i+1)+": admission_date \""+row.admission_date+"\" isn't YYYY-MM-DD — defaulted to today.");
          }

          var statusRaw=(row.status||"").toLowerCase();
          var status = statusRaw==="inactive" ? "inactive" : "active";

          rows.push({ school_id:schoolId, first_name:row.first_name, last_name:row.last_name, admission_no:row.admission_no||null,
            gender:(row.gender||"").toUpperCase()==="F"?"F":(row.gender||"").toUpperCase()==="M"?"M":null,
            date_of_birth:dob, admission_date:admDate,
            class_id:cls?cls.id:null, grade:cls?cls.level:(row["class"]||null),
            residence:residence, dormitory_id:dorm?dorm.id:null, status:status,
            county:county, nationality:row.nationality||"Kenyan", religion:row.religion||null,
            blood_group:blood, medical_notes:row.medical_notes||null,
            guardian_name:row.guardian_name||null, guardian_relation:relation,
            guardian_phone:row.guardian_phone||null, guardian_email:row.guardian_email||null });
        }
        return {rows:rows, errors:errors};
      }
      m.q("#im-file").onchange=function(e){
        var f=e.target.files[0]; if(!f) return;
        var reader=new FileReader();
        reader.onload=function(){
          var res=parseCsv(String(reader.result));
          parsed=res.rows;
          var html='';
          if(res.errors.length) html+='<div class="empty" style="border-color:#FDE68A;background:#FFFBEB;color:#92400E;margin-bottom:10px;">'+res.errors.map(esc).join("<br>")+'</div>';
          if(parsed.length){
            html+='<table class="data"><thead><tr><th>Name</th><th>Adm No</th><th>Class</th><th>Residence</th><th>Guardian</th></tr></thead><tbody>'
              +parsed.slice(0,50).map(function(p){ return '<tr><td>'+esc(p.first_name+" "+p.last_name)+'</td><td class="mono" style="font-size:11px;">'+esc(p.admission_no||"—")+'</td><td>'+esc(p.grade||"—")+'</td><td>'+esc(p.residence)+'</td><td>'+esc(p.guardian_name||"—")+'</td></tr>'; }).join("")
              +'</tbody></table>'+(parsed.length>50?'<p class="muted" style="font-size:11.5px;">+'+(parsed.length-50)+' more rows…</p>':'');
          } else html+='<div class="empty">No valid rows found.</div>';
          m.q("#im-preview").innerHTML=html;
          m.q("#s").disabled=!parsed.length;
          m.q("#s").textContent="Import "+parsed.length+" student"+(parsed.length===1?"":"s");
        };
        reader.readAsText(f);
      };
      m.q("#s").onclick=async function(){
        if(!parsed.length) return;
        var btn=m.q("#s"); btn.disabled=true; btn.textContent="Importing…";
        var r=await sb.from("students").insert(parsed);
        if(r.error){ toast("Error: "+r.error.message); btn.disabled=false; return; }
        SamajiCache.invalidate("students");
        m.close(); toast(parsed.length+" student(s) imported."); load();
      };
    };

    // ---------- bulk import: opening balances (migration) ----------
    // Matches existing students by admission_no and sets their
    // opening_balance (arrears carried over from a previous system).
    // Does not create students — run "Import CSV" first for anyone new.
    document.getElementById("import-balances").onclick=function(){
      var m=modal('<h3>Import opening balances</h3>'
        +'<p class="muted" style="font-size:12.5px;margin:0;">Header row required: <code>admission_no,opening_balance,note</code>. Matches against admission numbers already in Samaji — students not found are skipped and listed below. This overwrites any existing opening balance for matched students.</p>'
        +'<div class="field full" style="margin-top:12px;"><input type="file" id="ob-file" accept=".csv,text/csv"></div>'
        +'<div id="ob-preview" style="margin-top:12px;max-height:300px;overflow:auto;"></div>'
        +'<div class="modal-actions"><a id="ob-template" download="opening-balances-template.csv" style="margin-right:auto;align-self:center;font-size:12.5px;">Download template</a><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s" disabled>Import</button></div>', true);
      var tplCsv="admission_no,opening_balance,note\nADM-0101,12000,Arrears from previous system as at Jan 2026\n";
      m.q("#ob-template").href="data:text/csv;charset=utf-8,"+encodeURIComponent(tplCsv);
      m.q("#c").onclick=m.close;
      var matched=[], notFound=[];
      function parseCsv(text){
        var lines=text.split(/\r?\n/).filter(function(l){return l.trim().length;});
        if(!lines.length) return {rows:[],errors:["Empty file."]};
        var header=lines[0].split(",").map(function(h){return h.trim().toLowerCase();});
        var rows=[], errors=[];
        var byAdm={}; all.forEach(function(s){ if(s.admission_no) byAdm[s.admission_no.trim().toLowerCase()]=s; });
        for(var i=1;i<lines.length;i++){
          var cells=lines[i].split(",").map(function(c){return c.trim();});
          var row={}; header.forEach(function(h,idx){ row[h]=cells[idx]||""; });
          if(!row.admission_no){ errors.push("Row "+(i+1)+": missing admission_no — skipped."); continue; }
          var stu=byAdm[row.admission_no.trim().toLowerCase()];
          var amount=Number(row.opening_balance)||0;
          if(!stu){ notFound.push(row.admission_no); continue; }
          rows.push({ id:stu.id, name:stu.first_name+" "+stu.last_name, admission_no:stu.admission_no, opening_balance:amount, opening_balance_note:row.note||null });
        }
        return {rows:rows, errors:errors};
      }
      m.q("#ob-file").onchange=function(e){
        var f=e.target.files[0]; if(!f) return;
        var reader=new FileReader();
        reader.onload=function(){
          notFound=[];
          var res=parseCsv(String(reader.result));
          matched=res.rows;
          var html='';
          if(res.errors.length) html+='<div class="empty" style="border-color:#FDE68A;background:#FFFBEB;color:#92400E;margin-bottom:10px;">'+res.errors.map(esc).join("<br>")+'</div>';
          if(notFound.length) html+='<div class="empty" style="border-color:#FECACA;background:#FEF1F0;color:#B42318;margin-bottom:10px;">Not found, skipped: '+notFound.map(esc).join(", ")+'</div>';
          if(matched.length){
            html+='<table class="data"><thead><tr><th>Name</th><th>Adm No</th><th>Opening balance</th><th>Note</th></tr></thead><tbody>'
              +matched.slice(0,50).map(function(p){ return '<tr><td>'+esc(p.name)+'</td><td class="mono" style="font-size:11px;">'+esc(p.admission_no||"—")+'</td><td>'+money(p.opening_balance)+'</td><td>'+esc(p.opening_balance_note||"")+'</td></tr>'; }).join("")
              +'</tbody></table>'+(matched.length>50?'<p class="muted" style="font-size:11.5px;">+'+(matched.length-50)+' more rows…</p>':'');
          } else html+='<div class="empty">No matching students found.</div>';
          m.q("#ob-preview").innerHTML=html;
          m.q("#s").disabled=!matched.length;
          m.q("#s").textContent="Import "+matched.length+" balance"+(matched.length===1?"":"s");
        };
        reader.readAsText(f);
      };
      m.q("#s").onclick=async function(){
        if(!matched.length) return;
        var btn=m.q("#s"); btn.disabled=true; btn.textContent="Importing…";
        var failed=0;
        for(var i=0;i<matched.length;i++){
          var row=matched[i];
          var r=await sb.from("students").update({ opening_balance:row.opening_balance, opening_balance_note:row.opening_balance_note }).eq("id",row.id);
          if(r.error) failed++;
        }
        SamajiCache.invalidate("students");
        m.close();
        toast(failed? (matched.length-failed)+" balance(s) imported, "+failed+" failed." : matched.length+" balance(s) imported.");
        load();
      };
    };

    load();
  }

  // ====================================================
  //  FEES v2  (structure-aware collection + receipts)
  // ====================================================
  async function renderFeesV2(sb, schoolId, el){
    var school=null;
    async function init(){
      var sc=await sb.from("schools").select("*").eq("id",schoolId).single(); school=sc.data||{name:schoolId};
      var students=await cget(sb, schoolId, "students", "*");
      var feeClasses=await loadClasses(sb, schoolId);
      var structures=await cget(sb, schoolId, "fee_structures", "*, fee_items(amount)");
      var payments=await cget(sb, schoolId, "fee_payments", "*");
      // transport assignments — what each student owes for bus
      var busFareByStudent={}, busPaidByStudent={};
      try{ var taRes=await sb.from("transport_assignments").select("student_id, transport_routes(fare)").eq("school_id",schoolId); (taRes.data||[]).forEach(function(a){ if(a.transport_routes) busFareByStudent[a.student_id]=Number(a.transport_routes.fare)||0; }); }catch(e){}
      payments.forEach(function(p){ if(Number(p.transport_amount)>0) busPaidByStudent[p.student_id]=(busPaidByStudent[p.student_id]||0)+Number(p.transport_amount); });
      // billed per student = structure total for their level (sum across active terms)
      var totalByLevelTerm={}; structures.forEach(function(s){ totalByLevelTerm[s.level]= (totalByLevelTerm[s.level]||0) + (s.fee_items||[]).reduce(function(a,i){return a+Number(i.amount);},0); });
      // billed for a specific student = structure total for their level + any
      // one-time opening balance carried over from a previous system.
      function billedFor(s){ return s?((totalByLevelTerm[s.grade]||0)+(Number(s.opening_balance)||0)):0; }
      function tuitionOf(p){ return Number(p.amount)-(Number(p.transport_amount)||0); }
      var paidByStudent={}; payments.forEach(function(p){ paidByStudent[p.student_id]=(paidByStudent[p.student_id]||0)+tuitionOf(p); });
      el.innerHTML='<div class="mod-head"><div><h2>Fees &amp; Invoicing</h2><p>Collect fees against each class\u2019s structure and issue professional receipts.</p></div>'
        +'<button class="btn-primary" id="collect">+ Collect payment</button></div>'
        +'<div class="statgrid" id="fee-stats" style="grid-template-columns:repeat(3,1fr);"></div>'
        +'<div class="tabs" id="fee-tabs"><button data-t="ledger" class="on">Student ledger</button><button data-t="receipts">Receipts</button><button data-t="feereport">Fee reports</button></div>'
        +'<div style="margin-top:14px;display:flex;gap:10px;align-items:center;">'
        +'<input id="fee-search" type="search" placeholder="Search by name, admission no. or class…" style="flex:1;max-width:340px;padding:9px 12px;border:1px solid #DDE1E6;border-radius:9px;font-size:13px;">'
        +'<select id="fee-class" style="padding:9px 12px;border:1px solid #DDE1E6;border-radius:9px;font-size:13px;"><option value="">All classes</option>'
        +Array.from(new Set(students.map(function(s){return s.grade;}).filter(Boolean))).sort().map(function(g){return '<option value="'+esc(g)+'">'+esc(g)+'</option>';}).join("")
        +'</select></div>'
        +'<div id="fee-body" style="margin-top:16px;"></div>';
      document.getElementById("collect").onclick=function(){ if(!students.length){toast("Enrol students first.");return;} collectForm(); };
      var tab="ledger", query="", classFilter="";
      el.querySelectorAll("#fee-tabs button").forEach(function(b){ b.onclick=function(){ tab=b.getAttribute("data-t"); el.querySelectorAll("#fee-tabs button").forEach(function(x){x.classList.remove("on");}); b.classList.add("on"); renderTab(); }; });
      function renderTab(){ if(tab==="ledger") ledger(); else if(tab==="receipts") receipts(); else if(tab==="feereport") feeReport(); }
      // On the Receipts tab, name/class filtering is folded into the
      // explicit "Search receipts" query instead of refetching on every
      // keystroke — so only Ledger/Fee reports live-update here.
      document.getElementById("fee-search").oninput=function(e){ query=e.target.value.trim().toLowerCase(); refreshStats(); if(tab!=="receipts") renderTab(); };
      document.getElementById("fee-class").onchange=function(e){ classFilter=e.target.value; refreshStats(); if(tab!=="receipts") renderTab(); };

      function matches(name, adm, cls){
        if(classFilter && cls!==classFilter) return false;
        if(!query) return true;
        return (name||"").toLowerCase().indexOf(query)>=0 || (adm||"").toLowerCase().indexOf(query)>=0 || (cls||"").toLowerCase().indexOf(query)>=0;
      }

      // Recompute the four KPI cards from only the students currently
      // matching the class/search filters, so the cards mirror the table.
      function refreshStats(){
        var scoped=students.filter(function(s){ return matches(s.first_name+" "+s.last_name, s.admission_no, s.grade); });
        var billedTotal=0, collected=0, outstanding=0;
        var busBilled=0, busCollected=0, busOutstanding=0;
        scoped.forEach(function(s){
          var billed=billedFor(s), paid=paidByStudent[s.id]||0;
          billedTotal+=billed; outstanding+=Math.max(0,billed-paid);
          var bf=busFareByStudent[s.id]||0, bp=busPaidByStudent[s.id]||0;
          busBilled+=bf; busCollected+=bp; busOutstanding+=Math.max(0,bf-bp);
        });
        var scopedIds={}; scoped.forEach(function(s){ scopedIds[s.id]=true; });
        collected=payments.reduce(function(a,p){ return scopedIds[p.student_id]?a+tuitionOf(p):a; },0);
        var icBus='<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="13" rx="2.5" stroke="currentColor" stroke-width="1.8"/><circle cx="7.5" cy="19" r="1.5" stroke="currentColor" stroke-width="1.4"/><circle cx="16.5" cy="19" r="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M3 11h18" stroke="currentColor" stroke-width="1.5"/></svg>';
        document.getElementById("fee-stats").innerHTML=
          stat("Billed (term)",money(billedTotal),"#EEF0FF","#4F46E5",icDoc())
          +stat("Tuition collected",money(collected),"#ECFDF3","#067647",icCash())
          +stat("Tuition outstanding",money(outstanding),"#FFF6ED","#C2410C",icAlert())
          +stat("Collection rate",(billedTotal?Math.round(collected/billedTotal*100):0)+"%","#F1ECFE","#6D28D9",icChart())
          +stat("Bus fare collected",money(busCollected),"#EEF7FF","#0369A1",icBus)
          +stat("Bus fare outstanding",money(busOutstanding),"#FFF1F2","#BE123C",icBus);
      }
      refreshStats();

      var ledgerPage=1;
      function ledger(pg){
        if(typeof pg==="number") ledgerPage=pg; else ledgerPage=1;
        var body=document.getElementById("fee-body");
        if(!students.length){ body.innerHTML='<div class="empty">No students yet.</div>'; return; }
        var filtered=students.filter(function(s){ return matches(s.first_name+" "+s.last_name, s.admission_no, s.grade); });
        if(!filtered.length){ body.innerHTML='<div class="empty">No students match "'+esc(query)+'".</div>'; return; }
        var pgData=window.paginate(filtered,ledgerPage);
        var pageRows=pgData.rows;
        var html='<table class="data"><thead><tr><th>Student</th><th>Class</th><th>Tuition</th><th>Bus fare</th><th>Total paid</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody>';
        pageRows.forEach(function(s){
          var billed=billedFor(s), paid=paidByStudent[s.id]||0, tBal=Math.max(0,billed-paid);
          var bf=busFareByStudent[s.id]||0, bp=busPaidByStudent[s.id]||0, bBal=Math.max(0,bf-bp);
          var totalBal=tBal+bBal, totalOwed=billed+bf, totalPaid=paid+bp;
          var cleared=totalBal<=0&&totalOwed>0;
          var st= cleared?"green":(totalPaid>0?"amber":"red"), lbl= totalOwed===0?"No structure":(cleared?"Cleared":(totalPaid>0?"Partial":"Unpaid"));
          if(totalOwed===0) st="gray";
          html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(s.first_name+" "+s.last_name)+'<div class="muted" style="font-size:11px;">'+esc(s.admission_no||"")+'</div></td>'
            +'<td>'+esc(s.grade||"—")+'</td>'
            +'<td>'+money(billed)+(paid>0?' <span style="color:#067647;font-size:11px;">paid '+money(paid)+'</span>':'')+'</td>'
            +'<td>'+(bf>0?money(bf)+(bp>0?' <span style="color:#067647;font-size:11px;">paid '+money(bp)+'</span>':''):'—')+'</td>'
            +'<td style="color:#067647;font-weight:600;">'+money(totalPaid)+'</td>'
            +'<td style="font-weight:700;color:'+(totalBal>0?"#C2410C":"#067647")+';">'+money(totalBal)+'</td>'
            +'<td><span class="pill '+st+'">'+lbl+'</span></td>'
            +'<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-stmt="'+s.id+'">Statement</button> <button class="btn-primary" style="padding:6px 12px;font-size:12px;" data-pay="'+s.id+'">Collect</button></td></tr>';
        });
        body.innerHTML=html+'</tbody></table>'+pgData.html;
        pgData.onAttach(body,function(p){ ledger(p); });
        body.querySelectorAll("[data-pay]").forEach(function(b){ b.onclick=function(){ collectForm(b.getAttribute("data-pay")); }; });
        body.querySelectorAll("[data-stmt]").forEach(function(b){ b.onclick=function(){ showStatement(b.getAttribute("data-stmt")); }; });
      }
      // Receipts are never bulk-fetched: the school's whole payment history
      // could be thousands of rows over the years, so this tab always
      // scopes the query to a date range (indexed on school_id+paid_at) and
      // paginates on the server via .range(), and only re-queries when the
      // filters are explicitly applied — never on every keystroke.
      var rcptPage=1;
      function isoDate(d){ return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
      var rcptToday=new Date();
      var rcptFrom=isoDate(new Date(rcptToday.getFullYear(),rcptToday.getMonth(),1));
      var rcptTo=isoDate(rcptToday);
      var rcptMethod="";
      var RCPT_METHODS=["Cash","M-Pesa","Bank","Cheque","Card"];
      function receipts(pg){
        if(typeof pg==="number"){ rcptPage=pg; loadReceipts(pg); return; }
        rcptPage=1;
        var body=document.getElementById("fee-body");
        body.innerHTML='<div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px;padding:12px;background:#F8FAFB;border:1px solid #EEF0F2;border-radius:10px;">'
          +'<div><label style="display:block;font-size:11px;color:#667085;margin-bottom:4px;">From</label><input type="date" id="rc-from" value="'+rcptFrom+'" style="padding:8px 10px;border:1px solid #DDE1E6;border-radius:8px;font-size:13px;"></div>'
          +'<div><label style="display:block;font-size:11px;color:#667085;margin-bottom:4px;">To</label><input type="date" id="rc-to" value="'+rcptTo+'" style="padding:8px 10px;border:1px solid #DDE1E6;border-radius:8px;font-size:13px;"></div>'
          +'<div><label style="display:block;font-size:11px;color:#667085;margin-bottom:4px;">Method</label><select id="rc-method" style="padding:9px 12px;border:1px solid #DDE1E6;border-radius:9px;font-size:13px;"><option value="">All methods</option>'+RCPT_METHODS.map(function(mo){return '<option'+(rcptMethod===mo?' selected':'')+'>'+esc(mo)+'</option>';}).join("")+'</select></div>'
          +'<button class="btn-primary" id="rc-apply" style="padding:9px 16px;font-size:13px;">Search receipts</button>'
          +'</div><div id="receipts-rows"></div>';
        document.getElementById("rc-apply").onclick=function(){
          rcptFrom=document.getElementById("rc-from").value||rcptFrom;
          rcptTo=document.getElementById("rc-to").value||rcptTo;
          rcptMethod=document.getElementById("rc-method").value;
          loadReceipts(1);
        };
        loadReceipts(1);
      }
      async function loadReceipts(pg){
        var rows=document.getElementById("receipts-rows");
        rows.innerHTML='<div class="empty">Loading…</div>';
        var toExclusive=new Date(rcptTo+"T00:00:00"); toExclusive.setDate(toExclusive.getDate()+1);
        var perPage=15, start=(pg-1)*perPage;
        var q=sb.from("fee_payments").select("*",{count:"exact"}).eq("school_id",schoolId)
          .gte("paid_at",rcptFrom+"T00:00:00").lt("paid_at",isoDate(toExclusive)+"T00:00:00");
        if(rcptMethod) q=q.eq("method",rcptMethod);
        if(query||classFilter){
          var ids=students.filter(function(s){ return matches(s.first_name+" "+s.last_name, s.admission_no, s.grade); }).map(function(s){return s.id;});
          if(!ids.length){ rows.innerHTML='<div class="empty">No receipts match "'+esc(query)+'".</div>'; return; }
          q=q.in("student_id",ids);
        }
        var r=await q.order("paid_at",{ascending:false}).range(start,start+perPage-1);
        if(r.error){ rows.innerHTML='<div class="empty">Error loading receipts: '+esc(r.error.message)+'</div>'; return; }
        var pageRows=r.data||[], total=r.count||0;
        var nameOf={}; students.forEach(function(s){ nameOf[s.id]=s.first_name+" "+s.last_name; });
        if(!total){ rows.innerHTML='<div class="empty">No receipts in this range'+(rcptMethod?" for "+esc(rcptMethod):"")+'.</div>'; return; }
        var pgData=window.paginate(pageRows,pg,perPage,total);
        var html='<table class="data"><thead><tr><th>Receipt no</th><th>Student</th><th>Amount</th><th>Method</th><th>Date</th><th></th></tr></thead><tbody>';
        pageRows.forEach(function(p){
          html+='<tr><td class="mono" style="font-size:12px;font-weight:600;">'+esc(p.receipt_no)+'</td><td style="font-weight:600;color:#1A1D26;">'+esc(nameOf[p.student_id]||"—")+'</td>'
            +'<td style="font-weight:700;color:#067647;">'+money(p.amount)+'</td><td><span class="pill gray">'+esc(p.method)+'</span></td>'
            +'<td class="muted" style="font-size:12px;">'+new Date(p.paid_at).toLocaleDateString()+'</td>'
            +'<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-r="'+p.id+'">View receipt</button> <button class="btn-sm" style="color:#C2410C;" data-revoke="'+p.id+'">Revoke</button></td></tr>';
        });
        rows.innerHTML=html+'</tbody></table>'+pgData.html;
        pgData.onAttach(rows,function(p){ receipts(p); });
        rows.querySelectorAll("[data-r]").forEach(function(b){ b.onclick=function(){ var p=pageRows.find(function(x){return x.id===b.getAttribute("data-r");}); showReceipt(p, students.find(function(s){return s.id===p.student_id;})); }; });
        rows.querySelectorAll("[data-revoke]").forEach(function(b){ b.onclick=function(){ var p=pageRows.find(function(x){return x.id===b.getAttribute("data-revoke");}); revokePayment(p); }; });
      }

      // Reverses an accidental/disapproved payment: deletes the fee_payments
      // row and rolls back the in-memory totals so the ledger, KPI cards and
      // receipts list all reflect the reversal immediately (Reports/Dashboard
      // pick it up on their next load since they read fee_payments fresh).
      async function revokePayment(p){
        var stu=students.find(function(s){return s.id===p.student_id;});
        if(!await window.SM_confirm("Revoke payment "+p.receipt_no+" of "+money(p.amount)+(stu?" for "+stu.first_name+" "+stu.last_name:"")+"? This cannot be undone.")) return;
        var r=await sb.from("fee_payments").delete().eq("id",p.id);
        if(r.error){ toast("Error: "+r.error.message); return; }
        var kept=payments.filter(function(x){return x.id!==p.id;}); payments.length=0; kept.forEach(function(x){payments.push(x);});
        SamajiCache.invalidate("fee_payments");
        paidByStudent[p.student_id]=Math.max(0,(paidByStudent[p.student_id]||0)-tuitionOf(p));
        if(Number(p.transport_amount)>0) busPaidByStudent[p.student_id]=Math.max(0,(busPaidByStudent[p.student_id]||0)-Number(p.transport_amount));
        toast("Payment revoked.");
        refreshStats();
        renderTab();
      }

      function hasStructure(grade){ return structures.some(function(s){ return s.level===grade && (s.fee_items||[]).length>0; }); }
      function canCollect(stu){ return !stu || hasStructure(stu.grade) || Number(stu.opening_balance)>0; }
      function collectForm(preId){
        if(preId){ var ps=students.find(function(x){return x.id===preId;}); if(!canCollect(ps)){ window.SM_confirm("No fee structure has been set up for "+esc(ps.grade||"this class")+". Please create a fee structure in Settings → Fee Structures before collecting fees."); return; } }
        var opts=students.map(function(s){ return '<option value="'+s.id+'"'+(preId===s.id?" selected":"")+'>'+esc(s.first_name+" "+s.last_name)+(s.admission_no?" ("+esc(s.admission_no)+")":"")+'</option>'; }).join("");
        var idemKey=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():("idem-"+Date.now()+"-"+Math.random().toString(36).slice(2));
        var transportFare=0;
        var curYear=new Date().getFullYear();
        var terms=["Term 1","Term 2","Term 3"];
        // The opening balance is its own bucket — a fixed snapshot taken
        // at migration, never part of any term's fee structure. Payments
        // against it are tagged with this exact term string, kept
        // completely separate from Term 1/2/3's own billed amounts (which
        // must always read exactly what the fee structure says, nothing
        // added or subtracted for the opening balance).
        var OB_TERM="Balance b/f";
        function termBilled(grade,term){ var t=0; structures.forEach(function(s){ if(s.level===grade && s.term===term) t+=(s.fee_items||[]).reduce(function(a,i){return a+Number(i.amount);},0); }); return t; }
        function termPaid(sid,term){ var t=0; payments.forEach(function(p){ if(p.student_id===sid && p.term===term) t+=tuitionOf(p); }); return t; }
        function termInfo(sid){
          var s=students.find(function(x){return x.id===sid;}); if(!s) return {terms:[],s:null,ob:null};
          var info=[]; terms.forEach(function(t){
            var billed=termBilled(s.grade,t), paid=termPaid(sid,t), bal=Math.max(0,billed-paid);
            info.push({term:t, billed:billed, paid:paid, bal:bal, cleared:billed>0&&paid>=billed});
          });
          var ob=null;
          if(s && Number(s.opening_balance)>0){
            var obBilled=Number(s.opening_balance), obPaid=termPaid(sid,OB_TERM);
            ob={term:OB_TERM, billed:obBilled, paid:obPaid, bal:Math.max(0,obBilled-obPaid), cleared:obPaid>=obBilled};
          }
          return {terms:info, s:s, ob:ob};
        }
        // The term an overpayment on Balance b/f should spill into: the
        // first real term (in order) that actually has a fee structure
        // and isn't already cleared — i.e. exactly the term that unlocks
        // once the carried-forward balance reaches zero.
        function nextEligibleTerm(sid,grade){
          for(var k=0;k<terms.length;k++){
            var billed=termBilled(grade,terms[k]), paid=termPaid(sid,terms[k]);
            if(billed>0 && paid<billed) return terms[k];
          }
          return null;
        }
        var m=modal('<h3>Collect payment</h3><div class="grid2">'
          +'<div class="field full"><label>Student</label><select id="p-stu"'+(preId?' disabled':'')+'>'+(preId?'<option value="'+preId+'" selected>'+esc((function(){var s=students.find(function(x){return x.id===preId;});return s?(s.first_name+" "+s.last_name+(s.admission_no?" ("+s.admission_no+")":"")):"Student";})())+'</option>':opts)+'</select></div>'
          +'<div class="field full"><div id="p-bal" style="background:#F8FAFB;border:1px solid #EEF0F2;border-radius:10px;padding:11px 13px;font-size:12.5px;"></div></div>'
          +'<div class="field full"><div id="p-term-info" style="font-size:12px;"></div></div>'
          +'<div class="field full" id="p-bus-wrap" style="display:none;">'
          +'<label class="switch-row" style="display:flex;align-items:center;gap:10px;cursor:pointer;">'
          +'<input type="checkbox" id="p-bus"> 🚌 <span id="p-bus-label">Include bus transport</span></label></div>'
          +'<div class="field"><label>Amount (KES)</label><input id="p-amt" type="number" placeholder="0"></div>'
          +'<div class="field"><label>Method</label><select id="p-method"><option>Cash</option><option>M-Pesa</option><option>Bank</option><option>Cheque</option><option>Card</option></select></div>'
          +'<div class="field"><label>Term</label><select id="p-term"><option>Term 1</option><option>Term 2</option><option>Term 3</option><option id="p-term-ob" value="Balance b/f" hidden>Balance b/f</option></select></div>'
          +'<div class="field"><label>Reference (M-Pesa/Cheque)</label><input id="p-ref" placeholder="e.g. SLJ7XK2P"></div>'
          +'<div class="field full"><label>Note (optional)</label><input id="p-note"></div>'
          +'<div class="field full"><div id="p-spill" style="display:none;background:#FEF9C3;border:1px solid #FDE68A;border-radius:8px;padding:9px 12px;font-size:12px;color:#92400E;"></div></div>'
          +'</div><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Record &amp; print receipt</button></div>');
        function refreshTermInfo(){
          var sid=preId||m.q("#p-stu").value;
          var s0=students.find(function(x){return x.id===sid;});
          var ti=termInfo(sid);
          var termSel=m.q("#p-term");
          var html=''; var autoTerm=null;
          // Balance b/f is its own bucket, entirely separate from Term
          // 1/2/3's own fee structure — shown first, own chip, own option.
          var obOpt=m.q("#p-term-ob");
          if(ti.ob){
            var obColor=ti.ob.cleared?"#067647":"#C2410C";
            var obLabel=ti.ob.cleared?"✓ Cleared":(ti.ob.paid>0?"Partial "+money(ti.ob.paid)+"/"+money(ti.ob.billed):money(ti.ob.billed));
            html+='<span style="display:inline-block;margin-right:14px;padding:4px 8px;border-radius:6px;background:'+(ti.ob.cleared?"#ECFDF3":"#FEF1F0")+';color:'+obColor+';font-weight:600;">Balance carried forward: '+obLabel+(s0.opening_balance_note?' — '+esc(s0.opening_balance_note):'')+'</span>';
            obOpt.hidden=false;
            obOpt.textContent="Balance b/f ("+money(ti.ob.bal)+" owing)";
            obOpt.disabled=ti.ob.cleared;
            if(!ti.ob.cleared) autoTerm=OB_TERM;
          } else {
            obOpt.hidden=true;
            obOpt.disabled=true;
          }
          ti.terms.forEach(function(t,i){
            var color=t.cleared?"#067647":(t.paid>0?"#D97706":"#6B7280");
            var label=t.cleared?"✓ Cleared":(t.paid>0?"Partial "+money(t.paid)+"/"+money(t.billed):(t.billed>0?"Unpaid "+money(t.billed):"No structure"));
            html+='<span style="display:inline-block;margin-right:14px;padding:4px 8px;border-radius:6px;background:'+(t.cleared?"#ECFDF3":"#F8FAFB")+';color:'+color+';font-weight:600;">'+esc(t.term)+': '+label+'</span>';
            if(!autoTerm && !t.cleared && t.billed>0) autoTerm=t.term;
          });
          // Arrears come first: while a carried-forward balance is still
          // owing, Term 1/2/3 stay blocked — this term's fee can't be
          // recorded until the balance b/f reaches zero.
          var obBlocking=!!(ti.ob && !ti.ob.cleared);
          if(obBlocking){
            html+='<div class="muted" style="width:100%;margin-top:6px;font-size:11.5px;">⚠ Clear the balance carried forward before collecting Term 1/2/3 fees.</div>';
          }
          m.q("#p-term-info").innerHTML=html;
          // A term with no fee structure of its own shouldn't be pickable —
          // there's nothing to bill it against (Balance b/f is what's for
          // collecting a carried-forward balance instead). Also blocked
          // outright while arrears are outstanding — see obBlocking above.
          terms.forEach(function(t,i){
            termSel.options[i].disabled=ti.terms[i].cleared || ti.terms[i].billed===0 || obBlocking;
          });
          // Set selectedIndex directly rather than relying only on
          // .value= — more reliably lands on the right <option> even
          // right after toggling its hidden/disabled state in the same
          // tick, across browsers.
          function selectByValue(val){
            var idx=Array.prototype.findIndex.call(termSel.options,function(o){return o.value===val;});
            if(idx>=0) termSel.selectedIndex=idx;
          }
          if(autoTerm){
            selectByValue(autoTerm);
          } else if(termSel.selectedOptions[0] && termSel.selectedOptions[0].disabled){
            var firstEnabled=Array.prototype.filter.call(termSel.options,function(o){return !o.disabled && !o.hidden;})[0];
            if(firstEnabled) selectByValue(firstEnabled.value);
          }
        }
        function refreshBal(){
          var sid=preId||m.q("#p-stu").value;
          var s=students.find(function(x){return x.id===sid;});
          var billed=billedFor(s);
          var paid=paidByStudent[sid]||0;
          var bal=Math.max(0,billed-paid);
          var extra=(m.q("#p-bus").checked?transportFare:0);
          m.q("#p-bal").innerHTML='Billed <strong>'+money(billed)+'</strong> &nbsp;·&nbsp; Paid <strong style="color:#067647;">'+money(paid)+'</strong> &nbsp;·&nbsp; Balance <strong style="color:#C2410C;">'+money(bal)+'</strong>'+(billed===0?' <span class="muted">(no fee structure for '+esc(s?s.grade:"")+')</span>':'');
          if(!m.q("#p-amt").value&&(bal+extra)>0) m.q("#p-amt").value=bal+extra;
          refreshTermInfo();
        }
        function checkSpill(){
          var sid=preId||m.q("#p-stu").value;
          var selectedTerm=m.q("#p-term").value;
          var amt=Number(m.q("#p-amt").value)||0;
          var s=students.find(function(x){return x.id===sid;});
          if(!s){ m.q("#p-spill").style.display="none"; return; }
          var isOb=selectedTerm===OB_TERM;
          var tb=isOb?(Number(s.opening_balance)||0):termBilled(s.grade,selectedTerm), tp=termPaid(sid,selectedTerm);
          var termBal=Math.max(0,tb-tp);
          var spillEl=m.q("#p-spill");
          if(amt>termBal && termBal>0){
            var excess=amt-termBal;
            // Overpaying Balance b/f spills into the next real term that's
            // actually owed — the same one that unlocks once the carried-
            // forward balance clears. A real term still only spills into
            // the next one in order, same as always.
            var nextTerm=null;
            if(isOb){ nextTerm=nextEligibleTerm(sid,s.grade); }
            else { var ti=terms.indexOf(selectedTerm); nextTerm=ti<2?terms[ti+1]:null; }
            spillEl.innerHTML=nextTerm?'⚡ '+money(termBal)+' clears '+esc(selectedTerm)+'. Excess <strong>'+money(excess)+'</strong> will spill over to <strong>'+esc(nextTerm)+'</strong>.':'⚡ '+money(termBal)+' clears '+esc(selectedTerm)+'. Excess <strong>'+money(excess)+'</strong> recorded as overpayment.';
            spillEl.style.display="";
          } else { spillEl.style.display="none"; }
        }
        m.q("#p-amt").oninput=checkSpill;
        m.q("#p-term").onchange=checkSpill;
        async function loadTransport(){
          var wrap=m.q("#p-bus-wrap"); wrap.style.display="none"; transportFare=0;
          var sid=preId||m.q("#p-stu").value;
          var r=await sb.from("transport_assignments").select("*, transport_routes(name,fare)").eq("student_id",sid).maybeSingle();
          if(r.data && r.data.transport_routes){
            transportFare=Number(r.data.transport_routes.fare)||0;
            m.q("#p-bus-label").textContent="Include bus transport — "+esc(r.data.transport_routes.name)+" ("+money(transportFare)+")";
            wrap.style.display="";
          }
          refreshBal();
        }
        if(!preId) m.q("#p-stu").onchange=function(){
          var s=students.find(function(x){return x.id===m.q("#p-stu").value;});
          if(!canCollect(s)){ toast("No fee structure for "+s.grade+". Set one up in Settings → Fee Structures first."); m.q("#s").disabled=true; } else { m.q("#s").disabled=false; }
          m.q("#p-amt").value=""; loadTransport();
        };
        m.q("#p-bus").onchange=function(){ var was=m.q("#p-amt").value; m.q("#p-amt").value=""; refreshBal(); if(!m.q("#p-amt").value) m.q("#p-amt").value=was; };
        loadTransport();
        m.q("#c").onclick=m.close;
        var submitBtn=m.q("#s"), submitting=false;
        submitBtn.onclick=async function(){
          if(submitting) return;
          var sid=preId||m.q("#p-stu").value, amt=Number(m.q("#p-amt").value)||0;
          var sStu=students.find(function(x){return x.id===sid;});
          if(!canCollect(sStu)){ toast("No fee structure for "+(sStu.grade||"this class")+". Create one in Settings first."); return; }
          if(amt<=0){ toast("Enter an amount."); return; }
          submitting=true; submitBtn.disabled=true; var origLabel=submitBtn.textContent; submitBtn.textContent="Recording…";
          try{
            var selectedTerm=m.q("#p-term").value;
            var s=students.find(function(x){return x.id===sid;});
            var isOb=selectedTerm===OB_TERM;
            var tb=isOb?(Number(s&&s.opening_balance)||0):(s?termBilled(s.grade,selectedTerm):0), tp=termPaid(sid,selectedTerm);
            // Same rules as the dropdown's disabled options: don't let a
            // payment land against a term with no fee structure when
            // another term for this grade actually has one, and don't let
            // a real term be paid at all while arrears are still owing.
            if(!isOb && tb===0 && s && terms.some(function(tm){return termBilled(s.grade,tm)>0;})){
              toast(selectedTerm+" has no fee structure for "+(s.grade||"this class")+" — pick a term that does.");
              submitting=false; submitBtn.disabled=false; submitBtn.textContent=origLabel; return;
            }
            if(!isOb && s && Number(s.opening_balance)>termPaid(sid,OB_TERM)){
              toast("Clear the balance carried forward ("+money(Number(s.opening_balance)-termPaid(sid,OB_TERM))+") before collecting "+selectedTerm+".");
              submitting=false; submitBtn.disabled=false; submitBtn.textContent=origLabel; return;
            }
            var termBal=Math.max(0,tb-tp);
            var spillAmt=(amt>termBal&&termBal>0)?(amt-termBal):0;
            var mainAmt=spillAmt>0?termBal:amt;
            var rn=await sb.rpc("next_receipt_no",{ p_school:schoolId });
            var receiptNo=rn.data||("RCT-"+Date.now());
            var who=(await sb.auth.getUser()).data.user; who=who?who.email:null;
            var includesBus=m.q("#p-bus").checked && transportFare>0;
            var rec={ school_id:schoolId, student_id:sid, receipt_no:receiptNo, amount:mainAmt+(includesBus?transportFare:0), method:m.q("#p-method").value, reference:m.q("#p-ref").value.trim()||null, term:selectedTerm, year:curYear, note:m.q("#p-note").value.trim()||null, received_by:who, client_ref:idemKey, includes_transport:includesBus, transport_amount:includesBus?transportFare:0 };
            var r=await sb.from("fee_payments").insert(rec).select().single();
            if(r.error){
              if(/duplicate|unique/i.test(r.error.message||"")){ toast("This payment was already recorded."); m.close(); init(); return; }
              toast("Error: "+r.error.message); submitting=false; submitBtn.disabled=false; submitBtn.textContent=origLabel; return;
            }
            SamajiCache.invalidate("fee_payments");
            paidByStudent[sid]=(paidByStudent[sid]||0)+tuitionOf(rec);
            if(includesBus) busPaidByStudent[sid]=(busPaidByStudent[sid]||0)+transportFare;
            payments.push(r.data);
            var spillMsg="";
            if(spillAmt>0){
              var nextTerm;
              if(isOb){ nextTerm=nextEligibleTerm(sid,s.grade); }
              else { var ti=terms.indexOf(selectedTerm); nextTerm=ti<2?terms[ti+1]:null; }
              if(nextTerm){
                var rn2=await sb.rpc("next_receipt_no",{ p_school:schoolId });
                var receiptNo2=rn2.data||("RCT-"+(Date.now()+1));
                var idemKey2=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():("idem-"+Date.now()+"-"+Math.random().toString(36).slice(2));
                var rec2={ school_id:schoolId, student_id:sid, receipt_no:receiptNo2, amount:spillAmt, method:m.q("#p-method").value, reference:m.q("#p-ref").value.trim()||null, term:nextTerm, year:curYear, note:"Spillover from "+selectedTerm, received_by:who, client_ref:idemKey2, includes_transport:false, transport_amount:0 };
                var r2=await sb.from("fee_payments").insert(rec2).select().single();
                if(!r2.error){
                  payments.push(r2.data);
                  paidByStudent[sid]=(paidByStudent[sid]||0)+spillAmt;
                  spillMsg=" + "+money(spillAmt)+" spilled to "+nextTerm+" ("+receiptNo2+")";
                }
              }
            }
            m.close(); toast("Payment recorded — "+receiptNo+spillMsg);
            showReceipt(r.data, students.find(function(x){return x.id===sid;}));
            init();
          }catch(e){
            toast("Error: "+(e&&e.message?e.message:"could not record payment")); submitting=false; submitBtn.disabled=false; submitBtn.textContent=origLabel;
          }
        };
      }
      function feeReport(){
        var body=document.getElementById("fee-body");
        var levels=Array.from(new Set(feeClasses.map(function(c){return c.level;}))).sort();
        var levelOpts=levels.map(function(l){return '<option value="'+esc(l)+'">'+esc(l)+'</option>';}).join("");
        body.innerHTML='<div class="chartcard"><div class="ch-head"><div><h3>Generate Fee Report</h3><div class="sub">Filter by class, stream, term or a payment date range — then print or identify students to send home.</div></div></div>'
          +'<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-top:12px;">'
          +'<div class="field"><label>Class</label><select id="fr-class"><option value="">All classes</option>'+levelOpts+'</select></div>'
          +'<div class="field"><label>Stream</label><select id="fr-stream"><option value="">All streams</option></select></div>'
          +'<div class="field"><label>Term</label><select id="fr-term"><option value="">All terms</option><option>Term 1</option><option>Term 2</option><option>Term 3</option></select></div>'
          +'<div class="field"><label>Payments from</label><input type="date" id="fr-from"></div>'
          +'<div class="field"><label>Payments to</label><input type="date" id="fr-to"></div>'
          +'<button class="btn-sm" id="fr-clear-dates">Clear dates</button>'
          +'<button class="btn-primary" id="fr-gen" style="height:38px;">Generate report</button>'
          +'</div>'
          +'<div style="margin-top:16px;padding:12px;background:#FEF9C3;border:1px solid #FDE68A;border-radius:10px;">'
          +'<strong style="font-size:12.5px;color:#92400E;">⚠ Send-home list</strong>'
          +'<div style="display:flex;gap:10px;align-items:center;margin-top:6px;">'
          +'<span style="font-size:12.5px;color:#92400E;">Show students owing more than</span>'
          +'<input id="fr-threshold" type="number" placeholder="0" value="" style="width:110px;padding:6px 10px;border:1px solid #FDE68A;border-radius:6px;font-size:13px;">'
          +'<button class="btn-sm" id="fr-sendhome" style="background:#C2410C;color:#fff;border-color:#C2410C;">Generate send-home list</button>'
          +'</div></div>'
          +'<div id="fr-result" style="margin-top:18px;"></div></div>';
        document.getElementById("fr-class").onchange=function(){
          var lv=document.getElementById("fr-class").value;
          var streamSel=document.getElementById("fr-stream");
          var streams=feeClasses.filter(function(c){return c.level===lv&&c.stream;}).map(function(c){return c.stream;});
          streamSel.innerHTML='<option value="">All streams</option>'+streams.map(function(s){return '<option>'+esc(s)+'</option>';}).join("");
        };
        function getFiltered(termV,classV,streamV,fromV,toV){
          var filtered=students.slice();
          if(classV) filtered=filtered.filter(function(s){return s.grade===classV;});
          if(streamV){
            var matchIds={}; feeClasses.forEach(function(c){if(c.level===classV&&c.stream===streamV) matchIds[c.id]=true;});
            filtered=filtered.filter(function(s){return matchIds[s.class_id];});
          }
          var termBilledFn=function(grade){
            var t=0; structures.forEach(function(st){
              if(st.level===grade && (!termV||st.term===termV))
                t+=(st.fee_items||[]).reduce(function(a,i){return a+Number(i.amount);},0);
            }); return t;
          };
          // When a date range is set, only payments recorded within it
          // count — so "Paid"/"Balance" reflect that window specifically,
          // not the true running balance. renderReport() labels this.
          var termPaidFn=function(sid){
            var t=0; payments.forEach(function(p){
              if(p.student_id!==sid || (termV && p.term!==termV)) return;
              var d=(p.paid_at||"").slice(0,10);
              if(fromV && d<fromV) return;
              if(toV && d>toV) return;
              t+=tuitionOf(p);
            }); return t;
          };
          return filtered.map(function(s){
            var billed=termBilledFn(s.grade)+(Number(s.opening_balance)||0), paid=termPaidFn(s.id), bal=Math.max(0,billed-paid);
            return {s:s,billed:billed,paid:paid,bal:bal};
          });
        }
        function renderReport(rows,title,subtitle,dateNote){
          var totalBilled=0,totalPaid=0,totalBal=0,cleared=0;
          rows.forEach(function(r){totalBilled+=r.billed;totalPaid+=r.paid;totalBal+=r.bal;if(r.bal<=0&&r.billed>0)cleared++;});
          var logo=schoolLogo(school,48);
          var details=[school.address,school.phone,school.email,school.motto].filter(Boolean).join(" · ");
          var html='<div id="fr-print-area" style="font-family:system-ui,-apple-system,sans-serif;">'
            +'<table style="width:100%;border-collapse:collapse;margin-bottom:8px;border-bottom:2px solid #1A1D26;padding-bottom:8px;"><tr>'
            +'<td style="width:52px;vertical-align:top;padding-bottom:10px;">'+logo+'</td>'
            +'<td style="vertical-align:top;padding:0 12px 10px;"><div style="font-size:16px;font-weight:700;">'+esc(school.name||"School")+'</div>'
            +(details?'<div style="font-size:10px;color:#667085;">'+esc(details)+'</div>':'')+'</td>'
            +'<td style="text-align:right;vertical-align:top;padding-bottom:10px;"><div style="font-size:13px;font-weight:700;color:#1A1D26;">'+esc(title)+'</div>'
            +'<div style="font-size:10px;color:#667085;">'+esc(subtitle)+'</div>'
            +'<div style="font-size:9px;color:#98A2B3;">Generated '+new Date().toLocaleDateString()+'</div></td></tr></table>'
            +'<table style="width:100%;border-collapse:collapse;margin-bottom:10px;"><tr>'
            +'<td style="background:#EEF0FF;border-radius:6px;padding:8px 10px;width:25%;"><div style="font-size:9px;text-transform:uppercase;color:#4F46E5;letter-spacing:.03em;">Total billed</div><div style="font-size:14px;font-weight:700;">'+money(totalBilled)+'</div></td>'
            +'<td style="width:4px;"></td>'
            +'<td style="background:#ECFDF3;border-radius:6px;padding:8px 10px;width:25%;"><div style="font-size:9px;text-transform:uppercase;color:#067647;letter-spacing:.03em;">Collected</div><div style="font-size:14px;font-weight:700;">'+money(totalPaid)+'</div></td>'
            +'<td style="width:4px;"></td>'
            +'<td style="background:#FFF6ED;border-radius:6px;padding:8px 10px;width:25%;"><div style="font-size:9px;text-transform:uppercase;color:#C2410C;letter-spacing:.03em;">Outstanding</div><div style="font-size:14px;font-weight:700;">'+money(totalBal)+'</div></td>'
            +'<td style="width:4px;"></td>'
            +'<td style="background:#F1ECFE;border-radius:6px;padding:8px 10px;width:25%;"><div style="font-size:9px;text-transform:uppercase;color:#6D28D9;letter-spacing:.03em;">Cleared</div><div style="font-size:14px;font-weight:700;">'+cleared+' / '+rows.length+'</div></td>'
            +'</tr></table>'
            +(dateNote?'<p style="font-size:10px;color:#92400E;background:#FFFBEB;border:1px solid #FDE68A;border-radius:6px;padding:6px 10px;margin:0 0 10px;">'+esc(dateNote)+'</p>':'')
            +'<table class="data" style="width:100%;border-collapse:collapse;font-size:11px;"><thead><tr><th style="padding:6px 4px;text-align:left;border-bottom:2px solid #1A1D26;font-size:9px;text-transform:uppercase;letter-spacing:.03em;">#</th><th style="padding:6px 4px;text-align:left;border-bottom:2px solid #1A1D26;font-size:9px;text-transform:uppercase;letter-spacing:.03em;">Adm No</th><th style="padding:6px 4px;text-align:left;border-bottom:2px solid #1A1D26;font-size:9px;text-transform:uppercase;letter-spacing:.03em;">Student name</th><th style="padding:6px 4px;text-align:left;border-bottom:2px solid #1A1D26;font-size:9px;text-transform:uppercase;letter-spacing:.03em;">Class</th><th style="padding:6px 4px;text-align:right;border-bottom:2px solid #1A1D26;font-size:9px;text-transform:uppercase;letter-spacing:.03em;">Billed</th><th style="padding:6px 4px;text-align:right;border-bottom:2px solid #1A1D26;font-size:9px;text-transform:uppercase;letter-spacing:.03em;">Paid</th><th style="padding:6px 4px;text-align:right;border-bottom:2px solid #1A1D26;font-size:9px;text-transform:uppercase;letter-spacing:.03em;">Balance</th><th style="padding:6px 4px;text-align:left;border-bottom:2px solid #1A1D26;font-size:9px;text-transform:uppercase;letter-spacing:.03em;">Status</th></tr></thead><tbody>';
          rows.forEach(function(r,i){
            var st=r.bal<=0&&r.billed>0?'Cleared':(r.paid>0?'Partial':'Unpaid');
            var stCol=r.bal<=0&&r.billed>0?'#067647':(r.paid>0?'#D97706':'#C2410C');
            if(r.billed===0){ st='N/A'; stCol='#98A2B3'; }
            html+='<tr style="border-bottom:1px solid #EEF0F2;"><td style="padding:5px 4px;">'+(i+1)+'</td><td style="padding:5px 4px;font-size:10px;font-family:monospace;">'+esc(r.s.admission_no||"—")+'</td>'
              +'<td style="padding:5px 4px;font-weight:600;">'+esc(r.s.first_name+" "+r.s.last_name)+'</td>'
              +'<td style="padding:5px 4px;">'+esc(r.s.grade||"—")+'</td>'
              +'<td style="padding:5px 4px;text-align:right;">'+money(r.billed)+'</td>'
              +'<td style="padding:5px 4px;text-align:right;color:#067647;">'+money(r.paid)+'</td>'
              +'<td style="padding:5px 4px;text-align:right;color:#C2410C;font-weight:700;">'+money(r.bal)+'</td>'
              +'<td style="padding:5px 4px;color:'+stCol+';font-weight:600;">'+st+'</td></tr>';
          });
          html+='</tbody></table>'
            +'<div style="margin-top:10px;font-size:9px;color:#98A2B3;border-top:1px solid #EEF0F2;padding-top:6px;">Computer-generated report · Samaji School Management · '+new Date().toLocaleDateString()+'</div></div>'
            +'<div style="margin-top:12px;"><button class="btn-primary" id="fr-print">🖨 Print / Save as PDF</button></div>';
          document.getElementById("fr-result").innerHTML=html;
          document.getElementById("fr-print").onclick=function(){
            var content=document.getElementById("fr-print-area");
            if(!content) return;
            var w=window.open("","_blank","width=800,height=600");
            w.document.write('<!DOCTYPE html><html><head><title>Fee Report</title><style>'
              +'@page{size:A4 portrait;margin:10mm;}'
              +'body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:20px;font-size:12px;color:#1A1D26;-webkit-print-color-adjust:exact;print-color-adjust:exact;}'
              +'table{width:100%;border-collapse:collapse;}'
              +'</style></head><body>'+content.innerHTML+'</body></html>');
            w.document.close();
            w.focus();
            setTimeout(function(){ w.print(); }, 300);
          };
        }
        document.getElementById("fr-clear-dates").onclick=function(){
          document.getElementById("fr-from").value=""; document.getElementById("fr-to").value="";
        };
        document.getElementById("fr-gen").onclick=function(){
          var termV=document.getElementById("fr-term").value;
          var classV=document.getElementById("fr-class").value;
          var streamV=document.getElementById("fr-stream").value;
          var fromV=document.getElementById("fr-from").value;
          var toV=document.getElementById("fr-to").value;
          var rows=getFiltered(termV,classV,streamV,fromV,toV).sort(function(a,b){return b.bal-a.bal;});
          var title="Fee Payment & Balances Report";
          var parts=[]; if(classV) parts.push(classV); if(streamV) parts.push(streamV); if(termV) parts.push(termV);
          if(fromV||toV) parts.push("Payments "+(fromV||"start")+" → "+(toV||"today"));
          var subtitle=parts.length?parts.join(" · "):"All classes · All terms";
          var dateNote=(fromV||toV)?"Paid and Balance figures reflect only payments recorded between "+(fromV||"the start of records")+" and "+(toV||"today")+" — not the student's true current balance.":null;
          renderReport(rows,title,subtitle,dateNote);
        };
        document.getElementById("fr-sendhome").onclick=function(){
          var threshold=Number(document.getElementById("fr-threshold").value)||0;
          if(threshold<=0){ toast("Enter a minimum balance amount for the send-home list."); return; }
          var termV=document.getElementById("fr-term").value;
          var classV=document.getElementById("fr-class").value;
          var streamV=document.getElementById("fr-stream").value;
          // Deliberately ignores the payment date range above — sending a
          // student home has to be based on their true current balance,
          // never a balance narrowed to only payments in some date window.
          var rows=getFiltered(termV,classV,streamV).filter(function(r){return r.bal>=threshold;}).sort(function(a,b){return b.bal-a.bal;});
          if(!rows.length){ toast("No students owe "+money(threshold)+" or more."); return; }
          var title="SEND HOME LIST — Balance ≥ "+money(threshold);
          var parts=[]; if(classV) parts.push(classV); if(streamV) parts.push(streamV); if(termV) parts.push(termV);
          var subtitle=(parts.length?parts.join(" · "):"All classes")+" · "+rows.length+" student"+(rows.length===1?"":"s");
          renderReport(rows,title,subtitle);
        };
      }
      ledger();
    }

    function showReceipt(p, stu){
      var billed=0; // compute fresh
      sb.from("fee_structures").select("level, fee_items(amount)").eq("school_id",schoolId).eq("level",stu?stu.grade:"").then(function(res){
        var structs=res.data||[]; billed=structs.reduce(function(a,s){return a+(s.fee_items||[]).reduce(function(x,i){return x+Number(i.amount);},0);},0)+(Number(stu&&stu.opening_balance)||0);
        sb.from("fee_payments").select("amount").eq("school_id",schoolId).eq("student_id",p.student_id).then(function(pr){
          var paid=(pr.data||[]).reduce(function(a,x){return a+Number(x.amount);},0);
          var bal=Math.max(0,billed-paid), status= bal<=0&&billed>0?"PAID IN FULL":(paid>0?"PART PAYMENT":"RECEIVED");
          var sName=stu?(stu.first_name+" "+stu.last_name):"—";
          var ov=document.createElement("div"); ov.className="overlay";
          ov.innerHTML='<div style="display:flex;flex-direction:column;align-items:center;gap:14px;">'
            +'<div id="print-area"><div class="rcpt">'
            +(getLogoUrl(school)?'<div class="rc-wm"><img src="'+esc(getLogoUrl(school))+'"></div>':'')
            +'<div class="rc-top"><div class="rc-logo">'+(getLogoUrl(school)?'<img src="'+esc(getLogoUrl(school))+'" style="height:32px;object-fit:contain;">':('<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M5 18L4 7l4.5 5L12 4l3.5 8L20 7l-1 11H5z"/><rect x="5" y="19.2" width="14" height="2.1" rx="1.05"/></svg>'))+'</div>'
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
            +(p.includes_transport?'<div class="rc-line">🚌 Includes bus transport <strong>'+money(p.transport_amount)+'</strong></div>':'')
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
    // Full per-student fee statement — running ledger, not just a single
    // receipt. The thing a parent or auditor asks for: every payment to
    // date, the balance after each, and a clear current total.
    async function showStatement(studentId){
      var sr=await sb.from("students").select("*").eq("id",studentId).single();
      var stu=sr.data; if(!stu){ toast("Student not found."); return; }
      var pr=await sb.from("fee_payments").select("*").eq("school_id",schoolId).eq("student_id",studentId).order("paid_at",{ascending:true});
      var payments=pr.data||[];
      var fr=await sb.from("fee_structures").select("level, term, year, fee_items(amount)").eq("school_id",schoolId).eq("level",stu.grade||"");
      var structBilled=(fr.data||[]).reduce(function(a,s){return a+(s.fee_items||[]).reduce(function(x,i){return x+Number(i.amount);},0);},0);
      var ob=Number(stu.opening_balance)||0;
      var billed=structBilled+ob;
      var running=0;
      var rows=payments.map(function(p){
        running+=Number(p.amount);
        return '<tr><td>'+new Date(p.paid_at).toLocaleDateString()+'</td><td>'+esc(p.receipt_no)+'</td><td>'+esc(p.term)+' '+p.year+'</td><td>'+esc(p.method)+(p.includes_transport?' + bus':'')+'</td><td class="num">'+money(p.amount)+'</td><td class="num">'+money(Math.max(0,billed-running))+'</td></tr>';
      }).join("") || '<tr><td colspan="6" style="text-align:center;color:#888;">No payments recorded yet.</td></tr>';
      var paid=payments.reduce(function(a,p){return a+Number(p.amount);},0), bal=Math.max(0,billed-paid);

      var body=(getLogoUrl(school)?'<div class="st-wm"><img src="'+esc(getLogoUrl(school))+'"></div>':'')
        +'<div class="st-head">'
        +'<div class="st-school">'+schoolLogo(school)+'<div><div class="st-name">'+esc(school.name||"School")+'</div><div class="st-addr">Official Fee Statement</div></div></div>'
        +'<div class="st-doc">FEE STATEMENT</div></div>'
        +'<table class="st-meta"><tr>'
        +'<td><span class="k">Student</span><span class="v">'+esc(stu.first_name+" "+stu.last_name)+'</span></td>'
        +'<td><span class="k">Adm No</span><span class="v">'+esc(stu.admission_no||"—")+'</span></td>'
        +'<td><span class="k">Class</span><span class="v">'+esc(stu.grade||"—")+'</span></td>'
        +'<td><span class="k">Generated</span><span class="v">'+esc(new Date().toLocaleDateString())+'</span></td>'
        +'</tr></table>'
        +'<table class="st-summary"><tr>'
        +'<td><span class="k">Total billed</span><span class="v">'+money(billed)+'</span></td>'
        +'<td><span class="k">Total paid</span><span class="v" style="color:#067647;">'+money(paid)+'</span></td>'
        +'<td><span class="k">Balance due</span><span class="v" style="color:'+(bal>0?"#C2410C":"#067647")+';">'+money(bal)+'</span></td>'
        +'</tr></table>'
        +(ob>0?'<p style="font-size:11.5px;color:#C2410C;margin:6px 0 0;">Includes balance brought forward: '+money(ob)+(stu.opening_balance_note?' — '+esc(stu.opening_balance_note):'')+'</p>':'')
        +'<h4>Payment history</h4>'
        +'<table class="st-table"><thead><tr><th>Date</th><th>Receipt</th><th>Term</th><th>Method</th><th class="num">Amount</th><th class="num">Balance after</th></tr></thead><tbody>'+rows+'</tbody></table>'
        +'<div class="st-foot">Computer-generated statement · Samaji School Management · '+new Date().toLocaleDateString()+'</div>';

      var ov=document.createElement("div"); ov.className="overlay";
      ov.innerHTML='<div style="display:flex;flex-direction:column;align-items:center;gap:14px;">'
        +'<div id="print-area" class="statement">'+body+'</div>'
        +'<div style="display:flex;gap:10px;"><button class="btn-sm" id="st-close">Close</button><button class="btn-primary" id="st-print">🖨 Print / Save as PDF</button></div></div>';
      ov.addEventListener("click",function(e){ if(e.target===ov) ov.remove(); });
      document.body.appendChild(ov);
      ov.querySelector("#st-close").onclick=function(){ ov.remove(); };
      ov.querySelector("#st-print").onclick=function(){ window.print(); };
    }
    function stat(lbl,val,bg,ink,ic){ return '<div class="stat"><div class="ic" style="background:'+bg+';color:'+ink+'">'+ic+'</div><div class="lbl">'+lbl+'</div><div class="val">'+val+'</div></div>'; }
    init();
  }

  // ====================================================
  //  REPORTS
  // ====================================================
  async function renderReports(sb, schoolId, el){
    el.innerHTML='<div class="mod-head"><div><h2>Reports &amp; Analytics</h2><p>Live insight across enrollment, finance and collections. Tap any card for details.</p></div>'
      +'<div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;"><div class="field"><label>Class</label><select id="rep-class"><option value="">All classes</option></select></div>'
      +'<div class="field"><label>Group by</label><select id="rep-group"><option value="level">Class level</option><option value="stream">Stream</option></select></div>'
      +'<div class="field"><label>Term</label><select id="rep-term"><option>All terms</option><option>Term 1</option><option>Term 2</option><option>Term 3</option></select></div>'
      +'<div class="field"><label>From</label><input type="date" id="rep-from"></div>'
      +'<div class="field"><label>To</label><input type="date" id="rep-to"></div>'
      +'<button class="btn-sm" id="rep-clear">Clear dates</button>'
      +'<button class="btn-primary" id="rep-print">🖨 Print / Export PDF</button></div></div>'
      +'<div id="rep-body"><div class="statgrid">'+skel()+skel()+skel()+skel()+'</div></div>';
    function skel(){ return '<div class="stat"><div class="skel" style="height:64px;"></div></div>'; }

    var allStudents=[], classes=[], allPayments=[], structures=[], schoolInfo={name:schoolId}, allBusFare={};
    try{
    allStudents=await cget(sb, schoolId, "students", "*")||[];
    classes=await loadClasses(sb, schoolId)||[];
    allPayments=await cget(sb, schoolId, "fee_payments", "*")||[];
    structures=await cget(sb, schoolId, "fee_structures", "*, fee_items(amount)")||[];
    schoolInfo=((await sb.from("schools").select("*").eq("id",schoolId).single()).data)||{name:schoolId};
    try{ var taRes=await sb.from("transport_assignments").select("student_id, transport_routes(fare)").eq("school_id",schoolId); (taRes.data||[]).forEach(function(a){ if(a.transport_routes) allBusFare[a.student_id]=Number(a.transport_routes.fare)||0; }); }catch(e2){}
    }catch(e){
      document.getElementById("rep-body").innerHTML='<div class="empty" style="color:#C2410C;">Failed to load data: '+String(e)+'</div>';
      return;
    }
    var lastReport=null;
    var classOf={}; classes.forEach(function(c){ classOf[c.id]=c.level; });
    var classFull={}; var hasStreams=false; classes.forEach(function(c){ classFull[c.id]=c.level+(c.stream?" "+c.stream:""); if(c.stream) hasStreams=true; });
    var C=window.SamajiCharts;
    var levelOrder=["PP1","PP2","Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9"];
    function lord(a,b){ var ia=levelOrder.indexOf(a),ib=levelOrder.indexOf(b); return (ia<0?99:ia)-(ib<0?99:ib); }
    function levelOf(s){ return s.grade||classOf[s.class_id]||"Unassigned"; }
    var levelOfAll=levelOf;
    function keyOf(s){ return groupSel.value==="stream" ? (classFull[s.class_id]||levelOf(s)) : levelOf(s); }
    var termSel=document.getElementById("rep-term");
    var groupSel=document.getElementById("rep-group");
    var fromSel=document.getElementById("rep-from");
    var toSel=document.getElementById("rep-to");
    var classSel=document.getElementById("rep-class");
    var classLevels=Array.from(new Set(allStudents.map(function(s){return s.grade;}).filter(Boolean))).sort(lord);
    classSel.innerHTML='<option value="">All classes</option>'+classLevels.map(function(g){return '<option value="'+esc(g)+'">'+esc(g)+'</option>';}).join("");
    if(!hasStreams){ groupSel.parentNode.style.display="none"; }
    classSel.onchange=draw;
    termSel.onchange=draw;
    groupSel.onchange=draw;
    fromSel.onchange=draw;
    toSel.onchange=draw;
    document.getElementById("rep-clear").onclick=function(){ fromSel.value=""; toSel.value=""; draw(); };
    document.getElementById("rep-print").onclick=function(){ printReport(); };

    function draw(){ try{
      var term=termSel.value;
      var fromV=fromSel.value, toV=toSel.value;
      var classV=classSel.value;
      var students=classV?allStudents.filter(function(s){return levelOfAll(s)===classV;}):allStudents;
      var studentIds=null; if(classV){ studentIds={}; students.forEach(function(s){studentIds[s.id]=true;}); }
      var payments=term==="All terms"?allPayments:allPayments.filter(function(p){return p.term===term;});
      if(studentIds) payments=payments.filter(function(p){return studentIds[p.student_id];});
      if(fromV) payments=payments.filter(function(p){return (p.paid_at||"").slice(0,10)>=fromV;});
      if(toV) payments=payments.filter(function(p){return (p.paid_at||"").slice(0,10)<=toV;});
      // target per level (sum of its structures' items; respect term filter)
      var structForTerm=term==="All terms"?structures:structures.filter(function(s){return s.term===term;});
      var targetByLevel={}; structForTerm.forEach(function(s){ targetByLevel[s.level]=(targetByLevel[s.level]||0)+(s.fee_items||[]).reduce(function(a,i){return a+Number(i.amount);},0); });
      // billed per student = target for their level + any opening balance
      // carried over from a previous system at onboarding.
      var billed=0;
      students.forEach(function(s){ billed+=(targetByLevel[levelOf(s)]||0)+(Number(s.opening_balance)||0); });
      // collected per student (tuition only — transport fare is not part of fee structures)
      function tuitionOf(p){ return Number(p.amount)-(Number(p.transport_amount)||0); }
      var paidByStudent={}; payments.forEach(function(p){ paidByStudent[p.student_id]=(paidByStudent[p.student_id]||0)+tuitionOf(p); });
      // groups: by level OR by stream (level+stream) depending on toggle
      var groups={}; // key -> {key, level, students, target, collected}
      students.forEach(function(s){ var key=keyOf(s), lv=levelOf(s), t=targetByLevel[lv]||0, paid=paidByStudent[s.id]||0;
        if(!groups[key]) groups[key]={key:key, level:lv, students:0, target:0, collected:0};
        groups[key].students++; groups[key].target+=t; groups[key].collected+=Math.min(paid, t||Infinity); });
      var collected=payments.reduce(function(a,p){return a+tuitionOf(p);},0);
      // sum of per-student positive balances — one student's overpayment
      // must never offset another's unpaid balance.
      var outstanding=0; students.forEach(function(s){ var t=(targetByLevel[levelOf(s)]||0)+(Number(s.opening_balance)||0), paid=paidByStudent[s.id]||0; outstanding+=Math.max(0,t-paid); });
      var rate=billed?Math.round(collected/billed*100):0;
      // bus fare
      var busPaidByStudent={}; payments.forEach(function(p){ if(Number(p.transport_amount)>0) busPaidByStudent[p.student_id]=(busPaidByStudent[p.student_id]||0)+Number(p.transport_amount); });
      var busBilled=0, busCollected=0, busOutstanding=0;
      students.forEach(function(s){ var bf=allBusFare[s.id]||0, bp=busPaidByStudent[s.id]||0; busBilled+=bf; busCollected+=bp; busOutstanding+=Math.max(0,bf-bp); });
      var fullyPaid=students.filter(function(s){ var lv=levelOf(s); var t=(targetByLevel[lv]||0)+(Number(s.opening_balance)||0); var bf=allBusFare[s.id]||0, bp=busPaidByStudent[s.id]||0; return (t+bf)>0 && (paidByStudent[s.id]||0)>=t && bp>=bf; }).length;
      var avgFee=students.length?Math.round(billed/students.length):0;

      // gender + enrollment
      var male=students.filter(function(s){return s.gender==="M";}).length, female=students.filter(function(s){return s.gender==="F";}).length, other=students.length-male-female;
      var genderData=[{label:"Male",value:male,color:"#4F46E5"},{label:"Female",value:female,color:"#EC4899"}]; if(other>0) genderData.push({label:"Other",value:other,color:"#94A3B8"});
      var byLevel={}; students.forEach(function(s){ var lv=levelOf(s); byLevel[lv]=(byLevel[lv]||0)+1; });
      var levelKeys=Object.keys(byLevel).sort(lord);
      var enrollData=levelKeys.map(function(k){ return {label:k.replace("Grade ","G"),value:byLevel[k]}; });
      // collected vs target by group (level or stream)
      function gord(a,b){ var la=lord(groups[a].level,groups[b].level); return la!==0?la:(a<b?-1:a>b?1:0); }
      var ctKeys=Object.keys(groups).filter(function(k){return groups[k].target>0;}).sort(gord);
      var ctData=ctKeys.map(function(k){ return {label:groups[k].key.replace("Grade ","G"),collected:groups[k].collected,target:groups[k].target}; });
      // method + boarding
      var byMethod={}; payments.forEach(function(p){ byMethod[p.method]=(byMethod[p.method]||0)+Number(p.amount); });
      var methodData=Object.keys(byMethod).map(function(k){ return {label:k,value:Math.round(byMethod[k])}; });
      var boarders=students.filter(function(s){return s.residence==="Boarder";}).length, day=students.length-boarders;
      // trend last 6 months
      var months=[]; var now=new Date();
      for(var i=5;i>=0;i--){ var d=new Date(now.getFullYear(),now.getMonth()-i,1); months.push({key:d.getFullYear()+"-"+d.getMonth(),label:d.toLocaleString("en",{month:"short"}),value:0}); }
      payments.forEach(function(p){ var d=new Date(p.paid_at); var key=d.getFullYear()+"-"+d.getMonth(); var m=months.find(function(x){return x.key===key;}); if(m) m.value+=Number(p.amount); });

      // KPI cards (clickable)
      function kpi(drill,lbl,val,bg,ink,ic,sub){ return '<div class="stat" data-drill="'+drill+'" style="cursor:pointer;"><div class="ic" style="background:'+bg+';color:'+ink+'">'+ic+'</div><div class="lbl">'+lbl+'</div><div class="val">'+val+'</div>'+(sub?'<div class="delta flat">'+sub+'</div>':'')+'<div class="drill-hint">'+icArrow()+'</div></div>'; }

      var icBus='<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="13" rx="2.5" stroke="currentColor" stroke-width="1.8"/><circle cx="7.5" cy="19" r="1.5" stroke="currentColor" stroke-width="1.4"/><circle cx="16.5" cy="19" r="1.5" stroke="currentColor" stroke-width="1.4"/><path d="M3 11h18" stroke="currentColor" stroke-width="1.5"/></svg>';
      var html='<div class="statgrid">'
        +kpi("students","Total students",students.length,"#EEF0FF","#4F46E5",icP(),boarders+" boarders · "+day+" day")
        +kpi("collected","Tuition collected",money(collected),"#ECFDF3","#067647",icCash(),rate+"% of target")
        +kpi("outstanding","Tuition outstanding",money(outstanding),"#FFF6ED","#C2410C",icAlert(),(students.length-fullyPaid)+" with balance")
        +kpi("paid","Fully paid",fullyPaid+" / "+students.length,"#F1ECFE","#6D28D9",icChart(),"Avg fee "+money(avgFee))
        +kpi("buscollected","Bus fare collected",money(busCollected),"#EEF7FF","#0369A1",icBus,(busBilled?Math.round(busCollected/busBilled*100):0)+"% of target")
        +kpi("busoutstanding","Bus fare outstanding",money(busOutstanding),"#FFF1F2","#BE123C",icBus,busBilled?money(busBilled)+" billed":"No assignments")
        +'</div>';

      // Collected vs target — Zeraki-style progress bars, one row per group
      html+='<div class="chartcard" style="margin-top:18px;"><div class="ch-head"><div><h3>Fee collection by '+(groupSel.value==="stream"?"stream":"class")+' — collected vs target</h3><div class="sub">'+(term==="All terms"?"All terms":term)+' · '+rate+'% overall · tap a row for students</div></div></div>'
        +(ctKeys.length?'<div class="ct-list">'+ctKeys.map(function(k){
          var g=groups[k], t=g.target, c=g.collected||0, pct=t?Math.round(c/t*100):0, col=pct>=100?"#067647":pct>=60?"#0E9384":pct>=30?"#F59E0B":"#EF4444";
          return '<div class="ct-row" data-classrow="'+esc(k)+'">'
            +'<div class="ct-top"><span class="ct-name">'+esc(g.key)+'</span><span class="ct-students">'+g.students+' student'+(g.students===1?"":"s")+'</span></div>'
            +'<div class="ct-amt">'+money(c)+' <span class="of">out of</span> '+money(t)+' <span class="ct-pct" style="color:'+col+';">'+pct+'%</span></div>'
            +'<div class="bar"><span style="width:'+Math.min(100,pct)+'%;background:'+col+';"></span></div>'
            +'</div>';
        }).join("")+'</div>':'<div class="empty" style="border:none;">No fee structures set'+(term==="All terms"?"":" for "+term)+'. Add them in Settings → Fee Structures.</div>')+'</div>';

      // charts row
      html+='<div class="cardrow c2" style="margin-top:16px;">'
        +'<div class="chartcard"><div class="ch-head"><h3>Collection trend</h3><span class="sub">Last 6 months</span></div>'+C.line(months,{height:200})+'</div>'
        +'<div class="chartcard" data-drill="enroll" style="cursor:pointer;"><div class="ch-head"><h3>Enrollment by class</h3><div class="drill-hint" style="position:static;">'+icArrow()+'</div></div>'+(enrollData.length?C.bar(enrollData,{height:190}):emptyc())+'</div>'
        +'</div>';
      html+='<div class="cardrow c2" style="margin-top:16px;">'
        +'<div class="chartcard"><div class="ch-head"><h3>Gender split</h3></div><div style="display:flex;align-items:center;gap:20px;"><div>'+C.donut(genderData,{center:"Students"})+'</div><div style="flex:1;">'+C.legend(genderData)+'</div></div></div>'
        +'<div class="chartcard"><div class="ch-head"><h3>Collection by method</h3></div>'+(methodData.length?'<div style="display:flex;align-items:center;gap:20px;"><div>'+C.donut(methodData,{center:"KES"})+'</div><div style="flex:1;">'+C.legend(methodData.map(function(d,i){return {label:d.label,value:money(d.value),color:C.PAL[i%C.PAL.length]};}))+'</div></div>':emptyc())+'</div>'
        +'</div>';

      document.getElementById("rep-body").innerHTML=html;

      lastReport={ term:term, fromV:fromV, toV:toV, groupBy:groupSel.value, students:students.length, boarders:boarders, day:day,
        billed:billed, collected:collected, outstanding:outstanding, rate:rate, fullyPaid:fullyPaid, avgFee:avgFee,
        ctKeys:ctKeys, groups:groups, methodData:methodData,
        busBilled:busBilled, busCollected:busCollected, busOutstanding:busOutstanding };

      // wire drill-downs
      document.querySelectorAll("#rep-body [data-drill]").forEach(function(card){
        card.onclick=function(){ drill(card.getAttribute("data-drill"), {students:students, levelOf:levelOf, paidByStudent:paidByStudent, targetByLevel:targetByLevel, byLevel:byLevel, levelKeys:levelKeys, payments:payments}); };
      });
      document.querySelectorAll("#rep-body [data-classrow]").forEach(function(row){
        row.onclick=function(){
          var key=row.getAttribute("data-classrow"); var g=groups[key];
          var t0=targetByLevel[g.level]||0;
          var list=students.filter(function(s){return keyOf(s)===key;}).map(function(s){ var p=paidByStudent[s.id]||0; return {s:s,paid:p,bal:Math.max(0,t0-p)}; }).sort(function(a,b){return b.bal-a.bal;});
          var rows='<table class="data"><thead><tr><th>Student</th><th>Adm No</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>'+list.map(function(x){
            var st=x.bal<=0&&t0>0?'<span class="pill green">Cleared</span>':(x.paid>0?'<span class="pill amber">Partial</span>':'<span class="pill red">Unpaid</span>');
            return '<tr><td style="font-weight:600;">'+esc(x.s.first_name+" "+x.s.last_name)+'</td><td class="mono" style="font-size:11px;">'+esc(x.s.admission_no||"—")+'</td><td style="color:#067647;">'+money(x.paid)+'</td><td style="color:#C2410C;font-weight:600;">'+money(x.bal)+'</td><td>'+st+'</td></tr>';
          }).join("")+'</tbody></table>';
          openDrill(g.key+" — fee status", list.length+" students · target "+money(t0)+" each", rows);
        };
      });
    }catch(e){ document.getElementById("rep-body").innerHTML='<div class="empty" style="color:#C2410C;font-weight:600;">Report error: '+String(e)+'</div>'; } }

    function emptyc(){ return '<div class="empty" style="padding:24px;">Not enough data yet.</div>'; }

    // A clean, document-style statement for printing/PDF — tables and
    // numbers only, no charts. Charts are for the screen; a report you
    // hand to a board or auditor should read like a financial statement.
    function printReport(){
      if(!lastReport){ toast("Report still loading — try again in a moment."); return; }
      var r=lastReport;
      var range=(r.fromV||r.toV)?((r.fromV||"start")+" → "+(r.toV||"today")):"All dates";
      var groupLabel=r.groupBy==="stream"?"Stream":"Class";
      var rows=r.ctKeys.map(function(k){
        var g=r.groups[k], t=g.target, c=g.collected||0, pct=t?Math.round(c/t*100):0;
        return '<tr><td>'+esc(g.key)+'</td><td class="num">'+g.students+'</td><td class="num">'+money(t)+'</td>'
          +'<td class="num">'+money(c)+'</td><td class="num">'+money(Math.max(0,t-c))+'</td><td class="num">'+pct+'%</td></tr>';
      }).join("") || '<tr><td colspan="6" style="text-align:center;color:#888;">No fee structures set for this selection.</td></tr>';
      var methodRows=r.methodData.length? r.methodData.map(function(d){
        var pct=r.collected?Math.round(d.value/r.collected*100):0;
        return '<tr><td>'+esc(d.label)+'</td><td class="num">'+money(d.value)+'</td><td class="num">'+pct+'%</td></tr>';
      }).join("") : '<tr><td colspan="3" style="text-align:center;color:#888;">No payments recorded.</td></tr>';
      var body=(getLogoUrl(schoolInfo)?'<div class="st-wm"><img src="'+esc(getLogoUrl(schoolInfo))+'"></div>':'')
        +'<div class="st-head">'
        +'<div class="st-school">'+schoolLogo(schoolInfo)+'<div><div class="st-name">'+esc(schoolInfo.name||"School")+'</div><div class="st-addr">'+esc(schoolInfo.address||"")+(schoolInfo.phone?' · '+esc(schoolInfo.phone):"")+'</div></div></div>'
        +'<div class="st-doc">FEE COLLECTION REPORT</div></div>'
        +'<table class="st-meta"><tr>'
        +'<td><span class="k">Term</span><span class="v">'+esc(r.term)+'</span></td>'
        +'<td><span class="k">Date range</span><span class="v">'+esc(range)+'</span></td>'
        +'<td><span class="k">Grouped by</span><span class="v">'+esc(groupLabel)+'</span></td>'
        +'<td><span class="k">Generated</span><span class="v">'+esc(new Date().toLocaleString())+'</span></td>'
        +'</tr></table>'

        +'<table class="st-summary"><tr>'
        +'<td><span class="k">Total students</span><span class="v">'+r.students+'</span><span class="sub">'+r.boarders+' boarders · '+r.day+' day</span></td>'
        +'<td><span class="k">Total billed</span><span class="v">'+money(r.billed)+'</span></td>'
        +'<td><span class="k">Collected</span><span class="v" style="color:#067647;">'+money(r.collected)+'</span><span class="sub">'+r.rate+'% of target</span></td>'
        +'<td><span class="k">Outstanding</span><span class="v" style="color:#C2410C;">'+money(r.outstanding)+'</span><span class="sub">'+(r.students-r.fullyPaid)+' with balance</span></td>'
        +'</tr></table>'

        +(r.busBilled>0?'<table class="st-summary"><tr>'
        +'<td><span class="k">Bus fare billed</span><span class="v">'+money(r.busBilled)+'</span></td>'
        +'<td><span class="k">Bus fare collected</span><span class="v" style="color:#067647;">'+money(r.busCollected)+'</span></td>'
        +'<td><span class="k">Bus fare outstanding</span><span class="v" style="color:#C2410C;">'+money(r.busOutstanding)+'</span></td>'
        +'</tr></table>':'')

        +'<h4>Collection by '+esc(groupLabel.toLowerCase())+' — collected vs target</h4>'
        +'<table class="st-table"><thead><tr><th>'+esc(groupLabel)+'</th><th class="num">Students</th><th class="num">Target</th><th class="num">Collected</th><th class="num">Outstanding</th><th class="num">% collected</th></tr></thead>'
        +'<tbody>'+rows+'</tbody></table>'

        +'<h4>Collection by payment method</h4>'
        +'<table class="st-table"><thead><tr><th>Method</th><th class="num">Amount</th><th class="num">% of total</th></tr></thead>'
        +'<tbody>'+methodRows+'</tbody></table>'

        +'<div class="st-sign"><div><div class="line"></div>Prepared by</div><div><div class="line"></div>Approved by (Head/Bursar)</div></div>'
        +'<div class="st-foot">Computer-generated statement · Samaji School Management · '+new Date().toLocaleDateString()+'</div>';

      var ov=document.createElement("div"); ov.className="overlay";
      ov.innerHTML='<div style="display:flex;flex-direction:column;align-items:center;gap:14px;">'
        +'<div id="print-area" class="statement">'+body+'</div>'
        +'<div style="display:flex;gap:10px;"><button class="btn-sm" id="rp-close">Close</button><button class="btn-primary" id="rp-print">🖨 Print / Save as PDF</button></div></div>';
      ov.addEventListener("click",function(e){ if(e.target===ov) ov.remove(); });
      document.body.appendChild(ov);
      ov.querySelector("#rp-close").onclick=function(){ ov.remove(); };
      ov.querySelector("#rp-print").onclick=function(){ window.print(); };
    }
    draw();
  }

  // drill-down modals for report KPIs
  function drill(type, ctx){
    var rows="", title="", sub="";
    if(type==="students"){
      title="All students"; sub=ctx.students.length+" enrolled";
      var byL={}; ctx.students.forEach(function(s){ var lv=ctx.levelOf(s); byL[lv]=(byL[lv]||0)+1; });
      rows='<table class="data"><thead><tr><th>Class</th><th>Students</th></tr></thead><tbody>'+Object.keys(byL).map(function(k){return '<tr><td style="font-weight:600;">'+esc(k)+'</td><td>'+byL[k]+'</td></tr>';}).join("")+'</tbody></table>';
    } else if(type==="outstanding"){
      title="Students with a balance"; 
      var list=ctx.students.map(function(s){ var lv=ctx.levelOf(s); var t=(ctx.targetByLevel[lv]||0)+(Number(s.opening_balance)||0); var p=ctx.paidByStudent[s.id]||0; return {s:s,lv:lv,bal:t-p}; }).filter(function(x){return x.bal>0;}).sort(function(a,b){return b.bal-a.bal;});
      sub=list.length+" students owe "+money(list.reduce(function(a,x){return a+x.bal;},0));
      rows='<table class="data"><thead><tr><th>Student</th><th>Class</th><th>Balance</th></tr></thead><tbody>'+list.slice(0,100).map(function(x){return '<tr><td style="font-weight:600;">'+esc(x.s.first_name+" "+x.s.last_name)+'</td><td>'+esc(x.lv)+'</td><td style="color:#C2410C;font-weight:600;">'+money(x.bal)+'</td></tr>';}).join("")+'</tbody></table>';
    } else if(type==="paid"){
      title="Fully paid students";
      var pl=ctx.students.filter(function(s){ var lv=ctx.levelOf(s); var t=(ctx.targetByLevel[lv]||0)+(Number(s.opening_balance)||0); return t>0 && (ctx.paidByStudent[s.id]||0)>=t; });
      sub=pl.length+" cleared";
      rows=pl.length?'<table class="data"><thead><tr><th>Student</th><th>Class</th></tr></thead><tbody>'+pl.slice(0,100).map(function(s){return '<tr><td style="font-weight:600;">'+esc(s.first_name+" "+s.last_name)+'</td><td>'+esc(ctx.levelOf(s))+'</td></tr>';}).join("")+'</tbody></table>':'<div class="empty">No students fully cleared yet.</div>';
    } else if(type==="collected"){
      title="Recent payments"; 
      var ps=ctx.payments.slice().sort(function(a,b){return new Date(b.paid_at)-new Date(a.paid_at);}).slice(0,100);
      sub=ctx.payments.length+" payments";
      var nameOf={}; ctx.students.forEach(function(s){nameOf[s.id]=s.first_name+" "+s.last_name;});
      rows='<table class="data"><thead><tr><th>Receipt</th><th>Student</th><th>Method</th><th>Amount</th></tr></thead><tbody>'+ps.map(function(p){return '<tr><td class="mono" style="font-size:11px;">'+esc(p.receipt_no||"—")+'</td><td>'+esc(nameOf[p.student_id]||"—")+'</td><td><span class="pill gray">'+esc(p.method)+'</span></td><td style="color:#067647;font-weight:600;">'+money(p.amount)+'</td></tr>';}).join("")+'</tbody></table>';
    } else if(type==="enroll"){
      title="Enrollment by class";
      rows='<table class="data"><thead><tr><th>Class</th><th>Students</th></tr></thead><tbody>'+ctx.levelKeys.map(function(k){return '<tr><td style="font-weight:600;">'+esc(k)+'</td><td>'+ctx.byLevel[k]+'</td></tr>';}).join("")+'</tbody></table>';
    }
    openDrill(title, sub, rows);
  }
  function classDrill(level, students, levelOf, paidByStudent, targetByLevel){
    var t=targetByLevel[level]||0;
    var list=students.filter(function(s){return levelOf(s)===level;}).map(function(s){ var p=paidByStudent[s.id]||0; return {s:s,paid:p,bal:Math.max(0,t-p)}; }).sort(function(a,b){return b.bal-a.bal;});
    var rows='<table class="data"><thead><tr><th>Student</th><th>Adm No</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead><tbody>'+list.map(function(x){
      var st=x.bal<=0&&t>0?'<span class="pill green">Cleared</span>':(x.paid>0?'<span class="pill amber">Partial</span>':'<span class="pill red">Unpaid</span>');
      return '<tr><td style="font-weight:600;">'+esc(x.s.first_name+" "+x.s.last_name)+'</td><td class="mono" style="font-size:11px;">'+esc(x.s.admission_no||"—")+'</td><td style="color:#067647;">'+money(x.paid)+'</td><td style="color:#C2410C;font-weight:600;">'+money(x.bal)+'</td><td>'+st+'</td></tr>';
    }).join("")+'</tbody></table>';
    openDrill(level+" — fee status", list.length+" students · target "+money(t)+" each", rows);
  }
  function openDrill(title, sub, body){
    var ov=document.createElement("div"); ov.className="overlay";
    ov.innerHTML='<div class="modal wide"><h3>'+esc(title)+'</h3><p class="muted" style="font-size:12.5px;margin:0 0 4px;">'+esc(sub||"")+'</p><div class="modal-body" style="margin-top:12px;">'+body+'</div><div class="modal-actions"><button class="btn-primary" id="dd-close">Close</button></div></div>';
    ov.addEventListener("click",function(e){ if(e.target===ov) ov.remove(); });
    document.body.appendChild(ov);
    ov.querySelector("#dd-close").onclick=function(){ ov.remove(); };
  }
  function icArrow(){ return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
  function getLogoUrl(info){
    if(info&&info.logo_url) return info.logo_url;
    if(info&&info.id) try{ return localStorage.getItem("school_logo_"+info.id)||""; }catch(e){ return ""; }
    return "";
  }
  function schoolLogo(info,size){
    size=size||40;
    var url=getLogoUrl(info);
    if(url) return '<img src="'+esc(url)+'" style="width:'+size+'px;height:'+size+'px;object-fit:contain;border-radius:6px;">';
    return '<div class="st-logo" style="width:'+size+'px;height:'+size+'px;font-size:'+Math.round(size*0.45)+'px;">'+esc((info&&info.name||"S").charAt(0))+'</div>';
  }

  // icons
  function icDoc(){ return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M7 3h7l4 4v14H7z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M14 3v4h4" stroke="currentColor" stroke-width="1.8"/></svg>'; }
  function icP(){ return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3.2" stroke="currentColor" stroke-width="1.8"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="17" cy="9" r="2.4" stroke="currentColor" stroke-width="1.6"/></svg>'; }
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
