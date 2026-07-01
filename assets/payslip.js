// ============================================================
//  Shared payroll math + TSC-style payslip/P9 rendering.
//  Used by both the School Portal (admin Payroll module) and the
//  Teacher Portal (My Payroll tab) so the numbers and the printed
//  slip are identical everywhere.
// ============================================================
(function () {
  var RELIEF = 2400; // KES/month personal relief, 2024/25 rates

  function money(n){ return "KES " + Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }

  // Kenyan PAYE bands (monthly, 2024/25 approximation), pre-relief.
  function calcTaxCharged(taxable){
    var bands=[[24000,0.10],[8333,0.25],[467667,0.30],[300000,0.325],[Infinity,0.35]];
    var t=0, rem=Math.max(0,taxable);
    for(var i=0;i<bands.length && rem>0;i++){ var amt=Math.min(rem,bands[i][0]); t+=amt*bands[i][1]; rem-=amt; }
    return Math.round(t);
  }

  // basic/house/transport/other: earnings lines. deductionLines: [{label, amount}]
  // for active loans/advances applied this run (already capped to balance by the caller).
  function computePayslip(basic, house, transport, other, deductionLines){
    basic=Number(basic)||0; house=Number(house)||0; transport=Number(transport)||0; other=Number(other)||0;
    deductionLines = (deductionLines||[]).map(function(d){ return { label:d.label, amount:Number(d.amount)||0 }; });
    var gross = basic + house + transport + other;
    var nssf = Math.round(Math.min(gross,36000)*0.06);
    var shif = Math.max(300, Math.round(gross*0.0275));
    var housing = Math.round(gross*0.015);
    var taxable = Math.max(0, gross - nssf);
    var taxCharged = calcTaxCharged(taxable);
    var paye = Math.max(0, taxCharged - RELIEF);
    var otherDeductions = deductionLines.reduce(function(a,d){ return a+d.amount; },0);
    var net = gross - paye - nssf - shif - housing - otherDeductions;
    return {
      basic:basic, house_allowance:house, transport_allowance:transport, allowances:other,
      gross:gross, nssf:nssf, shif:shif, housing_levy:housing,
      taxable:taxable, tax_charged:taxCharged, relief:RELIEF, paye:paye,
      deduction_lines:deductionLines, deductions_other:otherDeductions,
      net:net
    };
  }

  function periodLabel(period){ // 'YYYY-MM' -> 'May-2026'
    if(!period) return "—";
    var parts=period.split("-"); var d=new Date(Number(parts[0]), Number(parts[1])-1, 1);
    return d.toLocaleString("en-US",{month:"long"})+"-"+parts[0];
  }

  // ---- printable TSC-style payslip card ----
  // opts: { school:{name}, staff:{full_name,role,designation,station,payroll_no,id_no,kra_pin}, payslip:{...computePayslip fields}, period:'YYYY-MM' }
  function slipHTML(opts){
    var school=opts.school||{}, s=opts.staff||{}, p=opts.payslip||{};
    var earnRows = [row2("Basic Salary", money(p.basic))];
    if (p.house_allowance) earnRows.push(row2("Rental House Allowance", money(p.house_allowance)));
    if (p.transport_allowance) earnRows.push(row2("Commuter Allowance", money(p.transport_allowance)));
    if (p.allowances) earnRows.push(row2("Other Allowances", money(p.allowances)));
    earnRows.push(row2("TOTAL Earnings", money(p.gross), true));

    var dedRows = [
      row2("PAYE", "-"+money(p.paye)),
      row2("NSSF", "-"+money(p.nssf)),
      row2("SHIF", "-"+money(p.shif)),
      row2("Housing Levy", "-"+money(p.housing_levy))
    ];
    (p.deduction_lines||[]).forEach(function(d){ dedRows.push(row2(esc(d.label), "-"+money(d.amount))); });
    dedRows.push(row2("TOTAL Deductions", "-"+money((p.paye||0)+(p.nssf||0)+(p.shif||0)+(p.housing_levy||0)+(p.deductions_other||0)), true));

    return ''
      +'<div class="tsc-slip">'
      +'  <div class="tsc-head">'
      +'    <div class="tsc-title">'+esc(school.name||"School")+'</div>'
      +'    <div class="tsc-sub">Pay Slip Copy('+periodLabel(opts.period)+')</div>'
      +'  </div>'
      +'  <div class="tsc-meta">'
      +     metaRow("Name", s.full_name||s.name)
      +     metaRow("Payroll No", s.payroll_no)
      +     metaRow("ID No", s.id_no)
      +     metaRow("Station", s.station||school.name)
      +     metaRow("Designation", s.designation||s.role)
      +     metaRow("KRA PIN", s.kra_pin)
      +'  </div>'
      +'  <div class="tsc-section">'+earnRows.join("")+'</div>'
      +'  <div class="tsc-section" style="margin-top:8px;">'+dedRows.join("")+'</div>'
      +'  <div class="tsc-net">NETT Pay: '+periodLabel(opts.period)+'<span>'+money(p.net)+'</span></div>'
      +'</div>';
  }
  function row2(k,v,bold){ return '<div class="tsc-row'+(bold?' tsc-bold':'')+'"><span>'+k+'</span><span>'+v+'</span></div>'; }
  function metaRow(k,v){ if(!v) return ""; return '<div class="tsc-meta-row"><span>'+k+'</span><span>'+esc(v)+'</span></div>'; }

  // ---- P9 annual tax deduction card ----
  // rows: [{period, basic, house_allowance, transport_allowance, allowances, gross, nssf, taxable, tax_charged, relief, paye}]
  function p9HTML(opts){
    var s=opts.staff||{}, school=opts.school||{}, rows=opts.rows||[];
    var byMonth={}; rows.forEach(function(r){ byMonth[r.period]=r; });
    var months=[]; for(var m=1;m<=12;m++){ months.push(opts.year+"-"+String(m).padStart(2,"0")); }
    var tot={basic:0,benefits:0,gross:0,nssf:0,taxable:0,charged:0,relief:0,paye:0};
    var body = months.map(function(period){
      var r=byMonth[period];
      var benefits = r ? (r.house_allowance+r.transport_allowance+r.allowances) : 0;
      if(r){ tot.basic+=r.basic; tot.benefits+=benefits; tot.gross+=r.gross; tot.nssf+=r.nssf; tot.taxable+=r.taxable; tot.charged+=r.tax_charged; tot.relief+=r.relief; tot.paye+=r.paye; }
      return '<tr><td>'+periodLabel(period)+'</td>'
        +'<td>'+(r?money(r.basic):"—")+'</td>'
        +'<td>'+(r?money(benefits):"—")+'</td>'
        +'<td>'+(r?money(r.gross):"—")+'</td>'
        +'<td>'+(r?money(r.nssf):"—")+'</td>'
        +'<td>'+(r?money(r.taxable):"—")+'</td>'
        +'<td>'+(r?money(r.tax_charged):"—")+'</td>'
        +'<td>'+(r?money(r.relief):"—")+'</td>'
        +'<td>'+(r?money(r.paye):"—")+'</td></tr>';
    }).join("");
    return ''
      +'<div class="tsc-slip" style="max-width:900px;">'
      +'  <div class="tsc-head"><div class="tsc-title">'+esc(school.name||"School")+'</div>'
      +'  <div class="tsc-sub">Tax Deduction Card (P9) — Year '+opts.year+'</div></div>'
      +'  <div class="tsc-meta">'+metaRow("Name", s.full_name||s.name)+metaRow("KRA PIN", s.kra_pin)+metaRow("Payroll No", s.payroll_no)+'</div>'
      +'  <div style="overflow-x:auto;margin-top:10px;"><table class="p9-table"><thead><tr>'
      +'    <th>Month</th><th>Basic Salary</th><th>Benefits</th><th>Gross Pay</th><th>NSSF</th><th>Taxable Pay</th><th>Tax Charged</th><th>Personal Relief</th><th>PAYE</th>'
      +'  </tr></thead><tbody>'+body+'</tbody>'
      +'  <tfoot><tr><td>TOTAL</td><td>'+money(tot.basic)+'</td><td>'+money(tot.benefits)+'</td><td>'+money(tot.gross)+'</td><td>'+money(tot.nssf)+'</td><td>'+money(tot.taxable)+'</td><td>'+money(tot.charged)+'</td><td>'+money(tot.relief)+'</td><td>'+money(tot.paye)+'</td></tr></tfoot>'
      +'  </table></div>'
      +'</div>';
  }

  function printHTML(innerHTML, title){
    var w = window.open("", "_blank", "width=480,height=720");
    if(!w){ return false; }
    w.document.write('<!DOCTYPE html><html><head><title>'+esc(title||"Print")+'</title><style>'+SLIP_CSS+'</style></head><body>'+innerHTML+'</body></html>');
    w.document.close();
    w.onload = function(){ w.focus(); w.print(); };
    setTimeout(function(){ try{ w.focus(); w.print(); }catch(e){} }, 300);
    return true;
  }

  var SLIP_CSS = ''
    +'body{font-family:"IBM Plex Mono",monospace;background:#fff;margin:0;padding:18px;color:#1A1D26;}'
    +'.tsc-slip{border:2px solid #1A1D26;padding:14px 16px;max-width:420px;margin:0 auto;font-size:12.5px;}'
    +'.tsc-head{text-align:center;border-bottom:1px solid #1A1D26;padding-bottom:8px;margin-bottom:8px;}'
    +'.tsc-title{font-weight:700;font-size:14px;}'
    +'.tsc-sub{font-size:11.5px;margin-top:2px;}'
    +'.tsc-meta-row{display:flex;justify-content:space-between;gap:10px;padding:1px 0;}'
    +'.tsc-meta-row span:first-child{color:#475467;}'
    +'.tsc-section{border-top:1px dashed #98A2B3;margin-top:8px;padding-top:6px;}'
    +'.tsc-row{display:flex;justify-content:space-between;padding:2px 0;}'
    +'.tsc-bold{font-weight:700;border-top:1px solid #1A1D26;margin-top:4px;padding-top:5px;}'
    +'.tsc-net{display:flex;justify-content:space-between;font-weight:700;font-size:13.5px;border-top:2px solid #1A1D26;margin-top:8px;padding-top:8px;}'
    +'.p9-table{border-collapse:collapse;width:100%;font-size:11px;}'
    +'.p9-table th,.p9-table td{border:1px solid #D0D5DD;padding:5px 7px;text-align:right;white-space:nowrap;}'
    +'.p9-table th:first-child,.p9-table td:first-child{text-align:left;}'
    +'.p9-table tfoot td{font-weight:700;background:#F9FAFB;}'
    +'@media print{ body{padding:0;} .tsc-slip{border:1px solid #1A1D26;} }';

  window.SamajiPayslip = {
    RELIEF: RELIEF,
    money: money,
    compute: computePayslip,
    periodLabel: periodLabel,
    slipHTML: slipHTML,
    p9HTML: p9HTML,
    printHTML: printHTML,
    css: SLIP_CSS
  };
})();
