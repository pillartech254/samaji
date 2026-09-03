// assets/receipt-print.js
//
// Shared fee-receipt renderer for both the School Portal and Parent
// Portal — previously each had its own separate, duplicated receipt-
// building code (school-plus.js's showReceipt(), parent/index.html's
// showReceiptScreen()), which is exactly how "make receipts look the
// same size in every portal" could silently drift out of sync. This
// module is the single source of truth for what a receipt looks like;
// both portals call into it rather than building their own markup.
//
// Requested directly: a professional redesign (school letterhead
// styling, a clear payment-details table, a balance summary, a
// verification QR code) available in three sizes a school can choose
// between — A5, A6, and an 80mm POS thermal-printer format — with
// whichever one is chosen applying consistently everywhere a receipt
// is shown.
//
// Uses assets/vendor/qrcode.js (kazuhikoarase/qrcode-generator, MIT
// licensed) for the actual QR code — vendored locally rather than
// loaded from a CDN, so a receipt can still be printed even if a
// third-party CDN is slow or unreachable at that moment.
(function () {
  "use strict";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function money(n) { return "KES " + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  // Gathers everything a receipt needs into one consistent shape,
  // regardless of which portal or which payment source (manual entry,
  // M-Pesa STK push, KCB) is calling this. `payment` needs at minimum:
  // id, receipt_no, amount, paid_at, term, year, method; reference,
  // received_by, note, includes_transport, transport_amount are
  // optional. `student` needs first_name/last_name; admission_no and
  // grade are optional. `school` needs name; logo_url and
  // receipt_size are optional (receipt_size defaults to "a5").
  function buildReceiptOpts(school, student, payment, billed, paid, balance) {
    var studentName = student ? ((student.first_name || "") + " " + (student.last_name || "")).trim() : "—";
    return {
      schoolName: (school && school.name) || "School",
      logoUrl: (school && school.logo_url) || null,
      size: (school && school.receipt_size) || "a5",
      receiptNo: payment.receipt_no || payment.id,
      paymentId: payment.id,
      date: payment.paid_at || new Date().toISOString(),
      studentName: studentName,
      admissionNo: (student && student.admission_no) || "—",
      className: (student && student.grade) || "—",
      term: payment.term || "",
      year: payment.year || "",
      method: payment.method || "",
      reference: payment.reference || null,
      receivedBy: payment.received_by || null,
      amount: Number(payment.amount) || 0,
      includesTransport: !!payment.includes_transport,
      transportAmount: Number(payment.transport_amount) || 0,
      note: payment.note || null,
      billed: Number(billed) || 0,
      paid: Number(paid) || 0,
      balance: Math.max(0, Number(balance) || 0),
    };
  }

  // The verification URL encoded into the QR code. A parent (or
  // anyone else) scanning it lands on a public page that calls the
  // verify_receipt(uuid) database function — see setup-modules-48.sql
  // for exactly what that returns and why it's deliberately limited
  // (masked student name, no phone number, no full payment history).
  function verifyUrl(paymentId) {
    return window.location.origin + "/verify/?r=" + encodeURIComponent(paymentId);
  }

  function qrSvg(text, cellSize) {
    if (!window.qrcode) return "";
    try {
      var qr = window.qrcode(0, "M");
      qr.addData(text);
      qr.make();
      return qr.createSvgTag(cellSize || 3, 0);
    } catch (e) {
      return ""; // a receipt without a QR code is still a usable receipt — never block printing over this
    }
  }

  function logoBlock(opts, sizePx) {
    if (opts.logoUrl) {
      return '<img src="' + esc(opts.logoUrl) + '" style="width:' + sizePx + 'px;height:' + sizePx + 'px;object-fit:contain;border-radius:50%;">';
    }
    return '<div style="width:' + sizePx + 'px;height:' + sizePx + 'px;border-radius:50%;background:#F4F6F8;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:' + Math.round(sizePx * 0.4) + 'px;color:#344054;">' + esc((opts.schoolName || "S").charAt(0).toUpperCase()) + '</div>';
  }

  var detailRows = function (opts) {
    var rows = [
      ["Received From", opts.studentName],
      ["Admission No", opts.admissionNo],
      ["Class", opts.className],
      ["Term", opts.term + (opts.year ? " " + opts.year : "")],
      ["Payment Mode", opts.method + (opts.reference ? " · " + opts.reference : "")],
    ];
    if (opts.receivedBy) rows.push(["Received By", opts.receivedBy]);
    return rows;
  };

  // ---------------- A5 : the "full" layout ----------------
  // Two-column meta section plus a separate Receipt Summary box —
  // matches the richer of the two reference layouts, for a school
  // that wants the most complete-looking document.
  function receiptA5(opts) {
    var rows = detailRows(opts);
    var half = Math.ceil(rows.length / 2);
    var col1 = rows.slice(0, half), col2 = rows.slice(half);
    var colHtml = function (rows) {
      return rows.map(function (r) { return '<div class="rr-row"><div class="rr-k">' + esc(r[0]) + '</div><div class="rr-v">' + esc(r[1]) + '</div></div>'; }).join("");
    };

    return '<div class="rr-card rr-a5">'
      + '<div class="rr-head">'
      + '<div class="rr-head-left">' + logoBlock(opts, 56) + '<div><div class="rr-school">' + esc(opts.schoolName) + '</div><div class="rr-sub">Official Fee Receipt</div></div></div>'
      + '<div class="rr-badge">RECEIPT<div class="rr-badge-no">No: ' + esc(opts.receiptNo) + '</div></div>'
      + '</div>'
      + '<div class="rr-pill">OFFICIAL SCHOOL FEE RECEIPT</div>'
      + '<div class="rr-twocol">'
      + '<div class="rr-meta">' + colHtml(col1) + colHtml(col2) + '<div class="rr-row"><div class="rr-k">Date</div><div class="rr-v">' + esc(new Date(opts.date).toLocaleString()) + '</div></div></div>'
      + '<div class="rr-summary"><div class="rr-summary-h">Receipt Summary</div>'
      + (opts.billed > 0 ? '<div class="rr-sr"><span>Total Billed</span><span>' + money(opts.billed) + '</span></div>' : '')
      + '<div class="rr-sr"><span>Amount Paid</span><span>' + money(opts.amount) + '</span></div>'
      + '<div class="rr-sr rr-sr-total"><span>Balance</span><span>' + money(opts.balance) + '</span></div>'
      + '</div></div>'
      + '<div class="rr-table-h">Payment Details</div>'
      + '<table class="rr-table"><tr><td>' + esc("The sum of " + money(opts.amount) + " being payment in respect of school fees" + (opts.includesTransport ? " (includes bus transport " + money(opts.transportAmount) + ")" : "")) + '</td><td class="rr-amt">' + money(opts.amount) + '</td></tr></table>'
      + (opts.note ? '<div class="rr-note">Note: ' + esc(opts.note) + '</div>' : '')
      + '<div class="rr-foot">'
      + '<div class="rr-foot-left"><div class="rr-instr">Please retain this receipt for your records. This is a computer-generated receipt and is valid without a signature.</div></div>'
      + '<div class="rr-foot-right">' + qrSvg(verifyUrl(opts.paymentId), 3) + '<div class="rr-verify-lbl">Scan to verify</div></div>'
      + '</div>'
      + '<div class="rr-poweredby">Generated by Samaji School System · ' + esc(new Date().toLocaleDateString()) + '</div>'
      + '</div>';
  }

  // ---------------- A6 : the compact layout ----------------
  // Single column, everything stacked — matches the narrower of the
  // two reference layouts, for a school that wants a smaller, more
  // economical printed slip.
  function receiptA6(opts) {
    var rows = detailRows(opts);
    return '<div class="rr-card rr-a6">'
      + '<div class="rr-head-center">' + logoBlock(opts, 44) + '<div class="rr-school">' + esc(opts.schoolName) + '</div><div class="rr-pill">OFFICIAL FEE RECEIPT</div></div>'
      + '<div class="rr-meta-1col"><div class="rr-row"><div class="rr-k">Receipt No</div><div class="rr-v">' + esc(opts.receiptNo) + '</div></div>'
      + rows.map(function (r) { return '<div class="rr-row"><div class="rr-k">' + esc(r[0]) + '</div><div class="rr-v">' + esc(r[1]) + '</div></div>'; }).join("")
      + '<div class="rr-row"><div class="rr-k">Date</div><div class="rr-v">' + esc(new Date(opts.date).toLocaleString()) + '</div></div></div>'
      + '<div class="rr-table-h">Payment Details</div>'
      + '<table class="rr-table"><tr><td>' + esc("Payment in respect of school fees" + (opts.includesTransport ? " (incl. bus " + money(opts.transportAmount) + ")" : "")) + '</td><td class="rr-amt">' + money(opts.amount) + '</td></tr></table>'
      + '<div class="rr-sr rr-sr-total"><span>Balance</span><span>' + money(opts.balance) + '</span></div>'
      + '<div class="rr-foot-center"><div>' + qrSvg(verifyUrl(opts.paymentId), 2.6) + '</div><div class="rr-verify-lbl">Scan to verify authenticity</div>'
      + '<div class="rr-instr" style="margin-top:8px;">Computer-generated — valid without signature.</div></div>'
      + '</div>';
  }

  // ---------------- POS 80mm : thermal printer layout ----------------
  // Genuinely narrow (matching an actual 80mm/72mm-printable thermal
  // roll, not just a small piece of paper) — minimal decoration,
  // dashed-line separators instead of boxes/borders, since thermal
  // printers commonly render fine borders and shading poorly. Still
  // carries every one of the same underlying details.
  function receiptPos80(opts) {
    var rows = detailRows(opts);
    var line = '<div class="rr-dash"></div>';
    return '<div class="rr-card rr-pos80">'
      + '<div class="rr-pos-center">' + logoBlock(opts, 34) + '<div class="rr-pos-school">' + esc(opts.schoolName) + '</div><div class="rr-pos-sub">OFFICIAL FEE RECEIPT</div></div>'
      + line
      + rows.map(function (r) { return '<div class="rr-pos-row"><span>' + esc(r[0]) + '</span><span>' + esc(r[1]) + '</span></div>'; }).join("")
      + '<div class="rr-pos-row"><span>Receipt No</span><span>' + esc(opts.receiptNo) + '</span></div>'
      + '<div class="rr-pos-row"><span>Date</span><span>' + esc(new Date(opts.date).toLocaleString()) + '</span></div>'
      + line
      + '<div class="rr-pos-row rr-pos-bold"><span>AMOUNT PAID</span><span>' + money(opts.amount) + '</span></div>'
      + (opts.includesTransport ? '<div class="rr-pos-row"><span>incl. bus</span><span>' + money(opts.transportAmount) + '</span></div>' : '')
      + '<div class="rr-pos-row"><span>Balance</span><span>' + money(opts.balance) + '</span></div>'
      + line
      + '<div class="rr-pos-center">' + qrSvg(verifyUrl(opts.paymentId), 2.2) + '<div class="rr-verify-lbl">Scan to verify</div></div>'
      + '<div class="rr-pos-thanks">Thank you for your payment</div>'
      + '</div>';
  }

  function receiptHTML(opts) {
    if (opts.size === "a6") return receiptA6(opts);
    if (opts.size === "pos80") return receiptPos80(opts);
    return receiptA5(opts);
  }

  var CSS = ''
    // shared
    + '.rr-card{background:#fff;color:#101626;font-family:Georgia,"Times New Roman",serif;}'
    + '.rr-head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #101626;padding-bottom:10px;margin-bottom:10px;}'
    + '.rr-head-left{display:flex;align-items:center;gap:12px;}'
    + '.rr-school{font-size:18px;font-weight:700;letter-spacing:.01em;}'
    + '.rr-sub{font-size:11px;color:#475467;text-transform:uppercase;letter-spacing:.04em;margin-top:2px;}'
    + '.rr-badge{background:#101626;color:#fff;padding:6px 14px;border-radius:5px;font-size:12px;font-weight:700;letter-spacing:.05em;text-align:center;}'
    + '.rr-badge-no{font-size:10px;font-weight:600;color:#F04438;margin-top:3px;letter-spacing:0;}'
    + '.rr-pill{display:inline-block;background:#101626;color:#fff;border-radius:20px;padding:5px 16px;font-size:10.5px;font-weight:700;letter-spacing:.06em;margin:0 auto 14px;text-align:center;}'
    + '.rr-row{display:flex;gap:8px;font-size:11.5px;margin-bottom:6px;}'
    + '.rr-k{font-weight:700;min-width:110px;}'
    + '.rr-v{color:#344054;}'
    + '.rr-table-h{background:#101626;color:#fff;padding:5px 10px;font-size:10.5px;font-weight:700;letter-spacing:.04em;margin-top:12px;}'
    + '.rr-table{width:100%;border-collapse:collapse;border:1px solid #101626;border-top:none;font-size:11px;}'
    + '.rr-table td{padding:10px;border-top:1px solid #E4E7EC;vertical-align:top;}'
    + '.rr-table .rr-amt{text-align:right;font-weight:700;white-space:nowrap;}'
    + '.rr-note{font-size:10.5px;color:#667085;margin-top:6px;}'
    + '.rr-sr{display:flex;justify-content:space-between;font-size:11.5px;padding:4px 0;}'
    + '.rr-sr-total{font-weight:700;border-top:1px solid #101626;margin-top:4px;padding-top:6px;}'
    + '.rr-verify-lbl{font-size:9px;color:#667085;text-align:center;margin-top:3px;}'
    + '.rr-instr{font-size:9.5px;color:#667085;max-width:280px;}'
    + '.rr-poweredby{text-align:center;font-size:8.5px;color:#98A2B3;margin-top:14px;}'
    // A5
    + '.rr-a5{max-width:560px;margin:0 auto;padding:22px;border:2px solid #101626;}'
    + '.rr-a5 .rr-twocol{display:flex;gap:18px;margin-bottom:6px;}'
    + '.rr-a5 .rr-meta{flex:1;}'
    + '.rr-a5 .rr-summary{flex:none;width:200px;border:1px solid #101626;padding:10px 12px;}'
    + '.rr-a5 .rr-summary-h{background:#101626;color:#fff;font-size:10px;font-weight:700;letter-spacing:.05em;text-align:center;padding:5px;margin:-10px -12px 8px;}'
    + '.rr-a5 .rr-foot{display:flex;justify-content:space-between;align-items:flex-end;margin-top:16px;padding-top:12px;border-top:1px dashed #98A2B3;}'
    // A6
    + '.rr-a6{max-width:340px;margin:0 auto;padding:16px;border:2px solid #101626;font-size:11px;}'
    + '.rr-a6 .rr-head-center{text-align:center;margin-bottom:10px;}'
    + '.rr-a6 .rr-head-center>*{margin:0 auto 4px;}'
    + '.rr-a6 .rr-meta-1col{margin-bottom:4px;}'
    + '.rr-a6 .rr-foot-center{text-align:center;margin-top:14px;padding-top:10px;border-top:1px dashed #98A2B3;}'
    // POS 80mm — genuinely narrow, dashed separators, monospace-leaning
    + '.rr-pos80{width:72mm;margin:0 auto;padding:6px 4px;font-family:"IBM Plex Mono",Consolas,monospace;font-size:10.5px;}'
    + '.rr-pos-center{text-align:center;margin-bottom:6px;}'
    + '.rr-pos-center>*{margin:0 auto 3px;}'
    + '.rr-pos-school{font-weight:700;font-size:12px;}'
    + '.rr-pos-sub{font-size:9px;letter-spacing:.05em;}'
    + '.rr-dash{border-top:1px dashed #101626;margin:6px 0;}'
    + '.rr-pos-row{display:flex;justify-content:space-between;gap:6px;padding:1.5px 0;}'
    + '.rr-pos-bold{font-weight:700;font-size:11.5px;}'
    + '.rr-pos-thanks{text-align:center;margin-top:8px;font-style:italic;}'
    // print page sizing per format
    + '@media print{'
    + '  .rr-a5{border:none;} .rr-a6{border:none;} @page{margin:8mm;}'
    + '}';

  function printReceipt(opts) {
    var w = window.open("", "_blank", "width=820,height=900");
    if (!w) return false;
    var pageSize = opts.size === "a6" ? "size:A6 portrait;" : opts.size === "pos80" ? "size:80mm auto;" : "size:A5 portrait;";
    w.document.write('<!DOCTYPE html><html><head><title>Receipt — ' + esc(opts.receiptNo) + '</title><style>@page{' + pageSize + 'margin:6mm;}' + CSS + '</style></head><body>' + receiptHTML(opts) + '</body></html>');
    w.document.close();
    w.onload = function () { w.focus(); w.print(); };
    setTimeout(function () { try { w.focus(); w.print(); } catch (e) {} }, 300);
    return true;
  }

  window.SamajiReceipt = {
    buildReceiptOpts: buildReceiptOpts,
    receiptHTML: receiptHTML,
    printReceipt: printReceipt,
    verifyUrl: verifyUrl,
    css: CSS,
  };
})();
