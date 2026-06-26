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
  //  Cache layer — instant page switches + login preload
  // ====================================================
  var SamajiCache=(function(){
    var store={}, TTL=90000;
    function k(table,sel){ return table+"|"+(sel||"*"); }
    async function get(sb, schoolId, table, sel){
      var key=k(table,sel), hit=store[key];
      if(hit && Date.now()-hit.t<TTL) return hit.data;
      var r=await sb.from(table).select(sel||"*").eq("school_id",schoolId);
      store[key]={t:Date.now(), data:r.data||[]};
      return store[key].data;
    }
    return {
      get:get,
      invalidate:function(table){ Object.keys(store).forEach(function(key){ if(!table||key.indexOf(table+"|")===0) delete store[key]; }); },
      clear:function(){ store={}; },
      preload:function(sb, schoolId){
        return Promise.all([
          get(sb,schoolId,"students","*"),
          get(sb,schoolId,"school_classes","*"),
          get(sb,schoolId,"dormitories","*"),
          get(sb,schoolId,"fee_structures","*, fee_items(amount)"),
          get(sb,schoolId,"fee_payments","*")
        ]).catch(function(){});
      }
    };
  })();
  window.SamajiCache=SamajiCache;
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
      +'<button data-t="classes" class="on">Classes &amp; Streams</button>'
      +'<button data-t="subjects">Subjects</button>'
      +'<button data-t="teachers">Teachers</button>'
      +'<button data-t="dorms">Dormitories</button>'
      +'<button data-t="fees">Fee Structures</button>'
      +'</div><div id="set-body" style="margin-top:18px;"></div>';
    el.querySelectorAll("#set-tabs button").forEach(function(b){ b.onclick=function(){ tab=b.getAttribute("data-t"); el.querySelectorAll("#set-tabs button").forEach(function(x){x.classList.remove("on");}); b.classList.add("on"); render(); }; });
    function render(){ if(tab==="classes") classes(); else if(tab==="subjects") subjects(); else if(tab==="teachers") teachersTab(); else if(tab==="dorms") dorms(); else fees(); }

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
    async function teachersTab(){
      var body=document.getElementById("set-body");
      body.innerHTML='<div class="toolbar" style="margin-top:0;"><span class="muted" style="font-size:12.5px;flex:1;">Teaching staff directory — assign them to classes &amp; subjects from the Classes tab.</span><button class="btn-primary" id="add-teacher">+ Add teacher</button></div><div id="tch-table"></div>';
      var r=await sb.from("teachers").select("*").eq("school_id",schoolId).order("name");
      var list=r.data||[], t=document.getElementById("tch-table");
      if(!list.length){ t.innerHTML='<div class="empty">No teachers yet. Add your teaching staff here.</div>'; }
      else {
        var html='<table class="data"><thead><tr><th>Name</th><th>Email</th><th>Phone</th><th></th></tr></thead><tbody>';
        list.forEach(function(s){
          html+='<tr><td style="font-weight:600;color:#1A1D26;">'+esc(s.name)+'</td><td>'+(s.email?esc(s.email):'<span class="muted">—</span>')+'</td><td>'+(s.phone?esc(s.phone):'<span class="muted">—</span>')+'</td>'
            +'<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-edit="'+s.id+'">Edit</button> <button class="btn-sm danger" data-del="'+s.id+'">Delete</button></td></tr>';
        });
        t.innerHTML=html+'</tbody></table>';
        t.querySelectorAll("[data-edit]").forEach(function(b){ b.onclick=function(){ teacherForm(list.find(function(x){return x.id===b.getAttribute("data-edit");})); }; });
        t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete this teacher? They will be unassigned from any classes/subjects."))return; var r=await sb.from("teachers").delete().eq("id",b.getAttribute("data-del")); if(r.error){toast("Error: "+r.error.message);return;} toast("Deleted"); teachersTab(); }; });
      }
      document.getElementById("add-teacher").onclick=function(){ teacherForm(null); };
    }
    function teacherForm(s){
      s=s||{};
      var m=modal('<h3>'+(s.id?"Edit teacher":"Add teacher")+'</h3><div class="grid2">'
        +'<div class="field full"><label>Full name</label><input id="t-name" value="'+esc(s.name||"")+'" placeholder="Jane Wambui"></div>'
        +'<div class="field"><label>Email</label><input id="t-email" value="'+esc(s.email||"")+'" placeholder="jane@school.ac.ke"></div>'
        +'<div class="field"><label>Phone</label><input id="t-phone" value="'+esc(s.phone||"")+'" placeholder="07XX XXX XXX"></div>'
        +'</div><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="sv">Save</button></div>');
      m.q("#c").onclick=m.close;
      m.q("#sv").onclick=async function(){
        var rec={ school_id:schoolId, name:m.q("#t-name").value.trim(), email:m.q("#t-email").value.trim()||null, phone:m.q("#t-phone").value.trim()||null };
        if(!rec.name){ toast("Name is required."); return; }
        var r=s.id? await sb.from("teachers").update(rec).eq("id",s.id) : await sb.from("teachers").insert(rec);
        if(r.error){ toast("Error: "+r.error.message); return; }
        m.close(); toast("Saved"); teachersTab();
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
        t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete this fee structure and its items?"))return; var r=await sb.from("fee_structures").delete().eq("id",b.getAttribute("data-del")); if(r.error){toast("Error: "+r.error.message);return;} SamajiCache.invalidate("fee_structures"); toast("Deleted"); fees(); }; });
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
      +'<div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn-sm" id="import-students">⭱ Import CSV</button><button class="btn-sm" id="promote-students">⇪ Promote to next class</button><button class="btn-primary" id="add-student">+ New student</button></div></div>'
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
      t.querySelectorAll("[data-del]").forEach(function(b){ b.onclick=async function(){ if(!await window.SM_confirm("Delete this student and all related records?"))return; var r=await sb.from("students").delete().eq("id",b.getAttribute("data-del")); if(r.error){toast("Error: "+r.error.message);return;} SamajiCache.invalidate("students"); toast("Student deleted"); load(); }; });
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
          guardian_email:m.q("#f-gemail").value.trim()||null };
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
        m.q("#pr-count").textContent=n+" student"+(n===1?"":"s")+" currently in "+classLabel(sorted.find(function(c){return c.id===fromId;}));
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
        +'<p class="muted" style="font-size:12.5px;margin:0;">Header row required: <code>first_name,last_name,admission_no,gender,class,guardian_name,guardian_phone</code>. "class" must match an existing class level (e.g. "Grade 6") and may include a stream ("Grade 6 East").</p>'
        +'<div class="field full" style="margin-top:12px;"><input type="file" id="im-file" accept=".csv,text/csv"></div>'
        +'<div id="im-preview" style="margin-top:12px;max-height:300px;overflow:auto;"></div>'
        +'<div class="modal-actions"><a id="im-template" download="students-template.csv" style="margin-right:auto;align-self:center;font-size:12.5px;">Download template</a><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s" disabled>Import</button></div>', true);
      var tplCsv="first_name,last_name,admission_no,gender,class,guardian_name,guardian_phone\nJane,Doe,ADM-0101,F,Grade 6,Mary Doe,+254700000000\n";
      m.q("#im-template").href="data:text/csv;charset=utf-8,"+encodeURIComponent(tplCsv);
      m.q("#c").onclick=m.close;
      var parsed=[];
      function parseCsv(text){
        var lines=text.split(/\r?\n/).filter(function(l){return l.trim().length;});
        if(!lines.length) return {rows:[],errors:["Empty file."]};
        var header=lines[0].split(",").map(function(h){return h.trim().toLowerCase();});
        var rows=[], errors=[];
        for(var i=1;i<lines.length;i++){
          var cells=lines[i].split(",").map(function(c){return c.trim();});
          var row={}; header.forEach(function(h,idx){ row[h]=cells[idx]||""; });
          if(!row.first_name||!row.last_name){ errors.push("Row "+(i+1)+": missing first_name/last_name — skipped."); continue; }
          var cls=null;
          if(row["class"]){
            cls=classes.find(function(c){ return classLabel(c).toLowerCase()===row["class"].toLowerCase() || c.level.toLowerCase()===row["class"].toLowerCase(); });
            if(!cls) errors.push("Row "+(i+1)+": class \""+row["class"]+"\" not found — student left unassigned.");
          }
          rows.push({ school_id:schoolId, first_name:row.first_name, last_name:row.last_name, admission_no:row.admission_no||null,
            gender:(row.gender||"").toUpperCase()==="F"?"F":(row.gender||"").toUpperCase()==="M"?"M":null,
            class_id:cls?cls.id:null, grade:cls?cls.level:(row["class"]||null),
            guardian_name:row.guardian_name||null, guardian_phone:row.guardian_phone||null, status:"active", residence:"Day" });
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
            html+='<table class="data"><thead><tr><th>Name</th><th>Adm No</th><th>Class</th><th>Guardian</th></tr></thead><tbody>'
              +parsed.slice(0,50).map(function(p){ return '<tr><td>'+esc(p.first_name+" "+p.last_name)+'</td><td class="mono" style="font-size:11px;">'+esc(p.admission_no||"—")+'</td><td>'+esc(p.grade||"—")+'</td><td>'+esc(p.guardian_name||"—")+'</td></tr>'; }).join("")
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
      var structures=await cget(sb, schoolId, "fee_structures", "*, fee_items(amount)");
      var payments=await cget(sb, schoolId, "fee_payments", "*");
      // transport assignments — what each student owes for bus
      var taRes=await sb.from("transport_assignments").select("student_id, transport_routes(fare)").eq("school_id",schoolId);
      var busFareByStudent={}; (taRes.data||[]).forEach(function(a){ if(a.transport_routes) busFareByStudent[a.student_id]=Number(a.transport_routes.fare)||0; });
      var busPaidByStudent={}; payments.forEach(function(p){ if(Number(p.transport_amount)>0) busPaidByStudent[p.student_id]=(busPaidByStudent[p.student_id]||0)+Number(p.transport_amount); });
      // billed per student = structure total for their level (sum across active terms)
      var totalByLevelTerm={}; structures.forEach(function(s){ totalByLevelTerm[s.level]= (totalByLevelTerm[s.level]||0) + (s.fee_items||[]).reduce(function(a,i){return a+Number(i.amount);},0); });
      function tuitionOf(p){ return Number(p.amount)-(Number(p.transport_amount)||0); }
      var paidByStudent={}; payments.forEach(function(p){ paidByStudent[p.student_id]=(paidByStudent[p.student_id]||0)+tuitionOf(p); });
      el.innerHTML='<div class="mod-head"><div><h2>Fees &amp; Invoicing</h2><p>Collect fees against each class\u2019s structure and issue professional receipts.</p></div>'
        +'<button class="btn-primary" id="collect">+ Collect payment</button></div>'
        +'<div class="statgrid" id="fee-stats" style="grid-template-columns:repeat(3,1fr);"></div>'
        +'<div class="tabs" id="fee-tabs"><button data-t="ledger" class="on">Student ledger</button><button data-t="receipts">Receipts</button></div>'
        +'<div style="margin-top:14px;display:flex;gap:10px;align-items:center;">'
        +'<input id="fee-search" type="search" placeholder="Search by name, admission no. or class…" style="flex:1;max-width:340px;padding:9px 12px;border:1px solid #DDE1E6;border-radius:9px;font-size:13px;">'
        +'<select id="fee-class" style="padding:9px 12px;border:1px solid #DDE1E6;border-radius:9px;font-size:13px;"><option value="">All classes</option>'
        +Array.from(new Set(students.map(function(s){return s.grade;}).filter(Boolean))).sort().map(function(g){return '<option value="'+esc(g)+'">'+esc(g)+'</option>';}).join("")
        +'</select></div>'
        +'<div id="fee-body" style="margin-top:16px;"></div>';
      document.getElementById("collect").onclick=function(){ if(!students.length){toast("Enrol students first.");return;} collectForm(); };
      var tab="ledger", query="", classFilter="";
      el.querySelectorAll("#fee-tabs button").forEach(function(b){ b.onclick=function(){ tab=b.getAttribute("data-t"); el.querySelectorAll("#fee-tabs button").forEach(function(x){x.classList.remove("on");}); b.classList.add("on"); tab==="ledger"?ledger():receipts(); }; });
      document.getElementById("fee-search").oninput=function(e){ query=e.target.value.trim().toLowerCase(); refreshStats(); tab==="ledger"?ledger():receipts(); };
      document.getElementById("fee-class").onchange=function(e){ classFilter=e.target.value; refreshStats(); tab==="ledger"?ledger():receipts(); };

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
          var billed=totalByLevelTerm[s.grade]||0, paid=paidByStudent[s.id]||0;
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

      function ledger(){
        var body=document.getElementById("fee-body");
        if(!students.length){ body.innerHTML='<div class="empty">No students yet.</div>'; return; }
        var filtered=students.filter(function(s){ return matches(s.first_name+" "+s.last_name, s.admission_no, s.grade); });
        if(!filtered.length){ body.innerHTML='<div class="empty">No students match “'+esc(query)+'”.</div>'; return; }
        var html='<table class="data"><thead><tr><th>Student</th><th>Class</th><th>Tuition</th><th>Bus fare</th><th>Total paid</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody>';
        filtered.forEach(function(s){
          var billed=totalByLevelTerm[s.grade]||0, paid=paidByStudent[s.id]||0, tBal=Math.max(0,billed-paid);
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
        body.innerHTML=html+'</tbody></table>';
        body.querySelectorAll("[data-pay]").forEach(function(b){ b.onclick=function(){ collectForm(b.getAttribute("data-pay")); }; });
        body.querySelectorAll("[data-stmt]").forEach(function(b){ b.onclick=function(){ showStatement(b.getAttribute("data-stmt")); }; });
      }
      async function receipts(){
        var body=document.getElementById("fee-body");
        var r=await sb.from("fee_payments").select("*").eq("school_id",schoolId).order("paid_at",{ascending:false});
        var rows=r.data||[]; var nameOf={}, admOf={}, gradeOf={}; students.forEach(function(s){ nameOf[s.id]=s.first_name+" "+s.last_name; admOf[s.id]=s.admission_no; gradeOf[s.id]=s.grade; });
        if(!rows.length){ body.innerHTML='<div class="empty">No receipts issued yet.</div>'; return; }
        rows=rows.filter(function(p){ return matches(nameOf[p.student_id], admOf[p.student_id], gradeOf[p.student_id]); });
        if(!rows.length){ body.innerHTML='<div class="empty">No receipts match “'+esc(query)+'”.</div>'; return; }
        var html='<table class="data"><thead><tr><th>Receipt no</th><th>Student</th><th>Amount</th><th>Method</th><th>Date</th><th></th></tr></thead><tbody>';
        rows.forEach(function(p){
          html+='<tr><td class="mono" style="font-size:12px;font-weight:600;">'+esc(p.receipt_no)+'</td><td style="font-weight:600;color:#1A1D26;">'+esc(nameOf[p.student_id]||"—")+'</td>'
            +'<td style="font-weight:700;color:#067647;">'+money(p.amount)+'</td><td><span class="pill gray">'+esc(p.method)+'</span></td>'
            +'<td class="muted" style="font-size:12px;">'+new Date(p.paid_at).toLocaleDateString()+'</td>'
            +'<td style="text-align:right;white-space:nowrap;"><button class="btn-sm" data-r="'+p.id+'">View receipt</button> <button class="btn-sm" style="color:#C2410C;" data-revoke="'+p.id+'">Revoke</button></td></tr>';
        });
        body.innerHTML=html+'</tbody></table>';
        body.querySelectorAll("[data-r]").forEach(function(b){ b.onclick=function(){ var p=rows.find(function(x){return x.id===b.getAttribute("data-r");}); showReceipt(p, students.find(function(s){return s.id===p.student_id;})); }; });
        body.querySelectorAll("[data-revoke]").forEach(function(b){ b.onclick=function(){ var p=rows.find(function(x){return x.id===b.getAttribute("data-revoke");}); revokePayment(p); }; });
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
        payments.splice(0,payments.length, ...payments.filter(function(x){return x.id!==p.id;}));
        SamajiCache.invalidate("fee_payments");
        paidByStudent[p.student_id]=Math.max(0,(paidByStudent[p.student_id]||0)-tuitionOf(p));
        if(Number(p.transport_amount)>0) busPaidByStudent[p.student_id]=Math.max(0,(busPaidByStudent[p.student_id]||0)-Number(p.transport_amount));
        toast("Payment revoked.");
        refreshStats();
        tab==="ledger"?ledger():receipts();
      }

      function collectForm(preId){
        var opts=students.map(function(s){ return '<option value="'+s.id+'"'+(preId===s.id?" selected":"")+'>'+esc(s.first_name+" "+s.last_name)+(s.admission_no?" ("+esc(s.admission_no)+")":"")+'</option>'; }).join("");
        // a fresh key per form, sent with the insert; a duplicate insert
        // (e.g. a fast double-click of "Record") collides on this key at
        // the database level instead of creating a second payment.
        var idemKey=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():("idem-"+Date.now()+"-"+Math.random().toString(36).slice(2));
        var transportFare=0;
        function balOf(id){ var s=students.find(function(x){return x.id===id;}); var billed=s?(totalByLevelTerm[s.grade]||0):0; var paid=paidByStudent[id]||0; return {billed:billed,paid:paid,bal:Math.max(0,billed-paid),s:s}; }
        var m=modal('<h3>Collect payment</h3><div class="grid2">'
          +'<div class="field full"><label>Student</label><select id="p-stu">'+opts+'</select></div>'
          +'<div class="field full"><div id="p-bal" style="background:#F8FAFB;border:1px solid #EEF0F2;border-radius:10px;padding:11px 13px;font-size:12.5px;"></div></div>'
          +'<div class="field full" id="p-bus-wrap" style="display:none;">'
          +'<label class="switch-row" style="display:flex;align-items:center;gap:10px;cursor:pointer;">'
          +'<input type="checkbox" id="p-bus"> 🚌 <span id="p-bus-label">Include bus transport</span></label></div>'
          +'<div class="field"><label>Amount (KES)</label><input id="p-amt" type="number" placeholder="0"></div>'
          +'<div class="field"><label>Method</label><select id="p-method"><option>Cash</option><option>M-Pesa</option><option>Bank</option><option>Cheque</option><option>Card</option></select></div>'
          +'<div class="field"><label>Term</label><select id="p-term"><option>Term 1</option><option>Term 2</option><option>Term 3</option></select></div>'
          +'<div class="field"><label>Reference (M-Pesa/Cheque)</label><input id="p-ref" placeholder="e.g. SLJ7XK2P"></div>'
          +'<div class="field full"><label>Note (optional)</label><input id="p-note"></div>'
          +'</div><div class="modal-actions"><button class="btn-sm" id="c">Cancel</button><button class="btn-primary" id="s">Record &amp; print receipt</button></div>');
        function refreshBal(){
          var b=balOf(m.q("#p-stu").value);
          var extra=(m.q("#p-bus").checked?transportFare:0);
          m.q("#p-bal").innerHTML='Billed <strong>'+money(b.billed)+'</strong> &nbsp;·&nbsp; Paid <strong style="color:#067647;">'+money(b.paid)+'</strong> &nbsp;·&nbsp; Balance <strong style="color:#C2410C;">'+money(b.bal)+'</strong>'+(b.billed===0?' <span class="muted">(no fee structure for '+esc(b.s?b.s.grade:"")+')</span>':'');
          if(!m.q("#p-amt").value&&(b.bal+extra)>0) m.q("#p-amt").value=b.bal+extra;
        }
        async function loadTransport(){
          var wrap=m.q("#p-bus-wrap"); wrap.style.display="none"; transportFare=0;
          var sid=m.q("#p-stu").value;
          var r=await sb.from("transport_assignments").select("*, transport_routes(name,fare)").eq("student_id",sid).maybeSingle();
          if(r.data && r.data.transport_routes){
            transportFare=Number(r.data.transport_routes.fare)||0;
            m.q("#p-bus-label").textContent="Include bus transport — "+esc(r.data.transport_routes.name)+" ("+money(transportFare)+")";
            wrap.style.display="";
          }
          refreshBal();
        }
        m.q("#p-stu").onchange=function(){ m.q("#p-amt").value=""; loadTransport(); };
        m.q("#p-bus").onchange=function(){ var was=m.q("#p-amt").value; m.q("#p-amt").value=""; refreshBal(); if(!m.q("#p-amt").value) m.q("#p-amt").value=was; };
        loadTransport();
        m.q("#c").onclick=m.close;
        var submitBtn=m.q("#s"), submitting=false;
        submitBtn.onclick=async function(){
          if(submitting) return; // guard against double-click firing two inserts
          var sid=m.q("#p-stu").value, amt=Number(m.q("#p-amt").value)||0;
          if(amt<=0){ toast("Enter an amount."); return; }
          submitting=true; submitBtn.disabled=true; var origLabel=submitBtn.textContent; submitBtn.textContent="Recording…";
          try{
            var rn=await sb.rpc("next_receipt_no",{ p_school:schoolId });
            var receiptNo=rn.data||("RCT-"+Date.now());
            var who=(await sb.auth.getUser()).data.user; who=who?who.email:null;
            var includesBus=m.q("#p-bus").checked && transportFare>0;
            var rec={ school_id:schoolId, student_id:sid, receipt_no:receiptNo, amount:amt, method:m.q("#p-method").value, reference:m.q("#p-ref").value.trim()||null, term:m.q("#p-term").value, year:new Date().getFullYear(), note:m.q("#p-note").value.trim()||null, received_by:who, client_ref:idemKey, includes_transport:includesBus, transport_amount:includesBus?transportFare:0 };
            var r=await sb.from("fee_payments").insert(rec).select().single();
            if(r.error){
              if(/duplicate|unique/i.test(r.error.message||"")){ toast("This payment was already recorded."); m.close(); init(); return; }
              toast("Error: "+r.error.message); submitting=false; submitBtn.disabled=false; submitBtn.textContent=origLabel; return;
            }
            SamajiCache.invalidate("fee_payments");
            paidByStudent[sid]=(paidByStudent[sid]||0)+(amt-(includesBus?transportFare:0));
            if(includesBus) busPaidByStudent[sid]=(busPaidByStudent[sid]||0)+transportFare;
            m.close(); toast("Payment recorded — receipt "+receiptNo);
            showReceipt(r.data, students.find(function(s){return s.id===sid;}));
            init(); // refresh stats + ledger
          }catch(e){
            toast("Error: "+(e&&e.message?e.message:"could not record payment")); submitting=false; submitBtn.disabled=false; submitBtn.textContent=origLabel;
          }
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
      var billed=(fr.data||[]).reduce(function(a,s){return a+(s.fee_items||[]).reduce(function(x,i){return x+Number(i.amount);},0);},0);
      var running=0;
      var rows=payments.map(function(p){
        running+=Number(p.amount);
        return '<tr><td>'+new Date(p.paid_at).toLocaleDateString()+'</td><td>'+esc(p.receipt_no)+'</td><td>'+esc(p.term)+' '+p.year+'</td><td>'+esc(p.method)+(p.includes_transport?' + bus':'')+'</td><td class="num">'+money(p.amount)+'</td><td class="num">'+money(Math.max(0,billed-running))+'</td></tr>';
      }).join("") || '<tr><td colspan="6" style="text-align:center;color:#888;">No payments recorded yet.</td></tr>';
      var paid=payments.reduce(function(a,p){return a+Number(p.amount);},0), bal=Math.max(0,billed-paid);

      var body='<div class="st-head">'
        +'<div class="st-school"><div class="st-logo">'+esc((school.name||"S").charAt(0))+'</div><div><div class="st-name">'+esc(school.name||"School")+'</div><div class="st-addr">Official Fee Statement</div></div></div>'
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

    var allStudents=await cget(sb, schoolId, "students", "*");
    var classes=await loadClasses(sb, schoolId);
    var allPayments=await cget(sb, schoolId, "fee_payments", "*");
    var structures=await cget(sb, schoolId, "fee_structures", "*, fee_items(amount)");
    var schoolInfo=((await sb.from("schools").select("*").eq("id",schoolId).single()).data)||{name:schoolId};
    var taRes=await sb.from("transport_assignments").select("student_id, transport_routes(fare)").eq("school_id",schoolId);
    var allBusFare={}; (taRes.data||[]).forEach(function(a){ if(a.transport_routes) allBusFare[a.student_id]=Number(a.transport_routes.fare)||0; });
    var lastReport=null; // populated by draw(), read by printReport()
    var classOf={}; classes.forEach(function(c){ classOf[c.id]=c.level; });
    var classFull={}; var hasStreams=false; classes.forEach(function(c){ classFull[c.id]=c.level+(c.stream?" "+c.stream:""); if(c.stream) hasStreams=true; });
    var C=window.SamajiCharts;
    var termSel=document.getElementById("rep-term");
    var groupSel=document.getElementById("rep-group");
    var fromSel=document.getElementById("rep-from");
    var toSel=document.getElementById("rep-to");
    var classSel=document.getElementById("rep-class");
    var classLevels=Array.from(new Set(allStudents.map(function(s){return s.grade;}).filter(Boolean))).sort(lord);
    classSel.innerHTML='<option value="">All classes</option>'+classLevels.map(function(g){return '<option value="'+esc(g)+'">'+esc(g)+'</option>';}).join("");
    if(!hasStreams){ groupSel.parentNode.style.display="none"; } // only offer stream view if streams exist
    classSel.onchange=draw;
    termSel.onchange=draw;
    groupSel.onchange=draw;
    fromSel.onchange=draw;
    toSel.onchange=draw;
    document.getElementById("rep-clear").onclick=function(){ fromSel.value=""; toSel.value=""; draw(); };
    document.getElementById("rep-print").onclick=function(){ printReport(); };

    function levelOf(s){ return s.grade||classOf[s.class_id]||"Unassigned"; }
    var levelOfAll=levelOf;
    function keyOf(s){ return groupSel.value==="stream" ? (classFull[s.class_id]||levelOf(s)) : levelOf(s); }
    var levelOrder=["PP1","PP2","Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9"];
    function lord(a,b){ var ia=levelOrder.indexOf(a),ib=levelOrder.indexOf(b); return (ia<0?99:ia)-(ib<0?99:ib); }

    function draw(){
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
      // billed per student = target for their level
      var billed=0;
      students.forEach(function(s){ billed+=targetByLevel[levelOf(s)]||0; });
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
      var outstanding=0; students.forEach(function(s){ var t=targetByLevel[levelOf(s)]||0, paid=paidByStudent[s.id]||0; outstanding+=Math.max(0,t-paid); });
      var rate=billed?Math.round(collected/billed*100):0;
      // bus fare
      var busPaidByStudent={}; payments.forEach(function(p){ if(Number(p.transport_amount)>0) busPaidByStudent[p.student_id]=(busPaidByStudent[p.student_id]||0)+Number(p.transport_amount); });
      var busBilled=0, busCollected=0, busOutstanding=0;
      students.forEach(function(s){ var bf=allBusFare[s.id]||0, bp=busPaidByStudent[s.id]||0; busBilled+=bf; busCollected+=bp; busOutstanding+=Math.max(0,bf-bp); });
      var fullyPaid=students.filter(function(s){ var lv=levelOf(s); var t=targetByLevel[lv]||0; var bf=allBusFare[s.id]||0, bp=busPaidByStudent[s.id]||0; return (t+bf)>0 && (paidByStudent[s.id]||0)>=t && bp>=bf; }).length;
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
    }

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
      var body='<div class="st-head">'
        +'<div class="st-school"><div class="st-logo">'+esc((schoolInfo.name||"S").charAt(0))+'</div><div><div class="st-name">'+esc(schoolInfo.name||"School")+'</div><div class="st-addr">'+esc(schoolInfo.address||"")+(schoolInfo.phone?' · '+esc(schoolInfo.phone):"")+'</div></div></div>'
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
      var list=ctx.students.map(function(s){ var lv=ctx.levelOf(s); var t=ctx.targetByLevel[lv]||0; var p=ctx.paidByStudent[s.id]||0; return {s:s,lv:lv,bal:t-p}; }).filter(function(x){return x.bal>0;}).sort(function(a,b){return b.bal-a.bal;});
      sub=list.length+" students owe "+money(list.reduce(function(a,x){return a+x.bal;},0));
      rows='<table class="data"><thead><tr><th>Student</th><th>Class</th><th>Balance</th></tr></thead><tbody>'+list.slice(0,100).map(function(x){return '<tr><td style="font-weight:600;">'+esc(x.s.first_name+" "+x.s.last_name)+'</td><td>'+esc(x.lv)+'</td><td style="color:#C2410C;font-weight:600;">'+money(x.bal)+'</td></tr>';}).join("")+'</tbody></table>';
    } else if(type==="paid"){
      title="Fully paid students";
      var pl=ctx.students.filter(function(s){ var lv=ctx.levelOf(s); var t=ctx.targetByLevel[lv]||0; return t>0 && (ctx.paidByStudent[s.id]||0)>=t; });
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
