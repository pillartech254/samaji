// ============================================================
//  Samaji — KCB Buni IPN (Instant Payment Notification) Handler
//
//  POST /kcb-callback — KCB's own server calls this after a customer
//  approves or declines a payment request. Extracted out of kcb-stk,
//  which used to handle this route too — that function needed
//  --no-verify-jwt so KCB (which has no Supabase login token) could
//  reach it, but that flag applied to the WHOLE function, so the
//  payment-initiation route ended up unauthenticated as a side
//  effect too. This function is deployed with --no-verify-jwt on its
//  own, so kcb-stk itself can go back to requiring a real session.
//
//  CONFIRMED via a live sandbox test (2026-08): KCB posts Safaricom's
//  own native nested callback envelope unchanged — Body.stkCallback.
//  {ResultCode, ResultDesc, CallbackMetadata.Item[{Name,Value}], ...}
//  — checked first below, with flatter/wrapped fallbacks kept only as
//  defensive belt-and-braces for edge cases (e.g. failure callbacks
//  might omit CallbackMetadata entirely). raw_callback still stores
//  the full body on every notification regardless, so any future
//  shape drift stays diagnosable from the DB.
//
//  Response format: KCB's own IPN docs don't pin an exact response
//  body — only "respond 200 immediately" is documented — but since
//  the callback envelope itself is Safaricom's native stkCallback
//  shape passed through unchanged, we ack it the way Safaricom's own
//  callback consumers do: a small JSON body of {ResultCode,
//  ResultDesc} rather than bare text, on every path.
//
//  Deploy:
//    supabase functions deploy kcb-callback --no-verify-jwt
//
//  Secrets (set via `supabase secrets set KEY=VALUE`):
//    SUPABASE_URL              — auto-set by Supabase
//    SUPABASE_SERVICE_ROLE_KEY — auto-set by Supabase
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

function ackResponse(): Response {
  return jsonResponse({ ResultCode: 0, ResultDesc: "Success" }, 200);
}

async function handleCallback(req: Request): Promise<Response> {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return ackResponse();
  }

  const sb = serviceClient();

  // Try Safaricom's native nested shape first, then flatter guesses.
  const stk = body?.Body?.stkCallback;
  const inner = body?.response || body;
  const externalRef =
    stk?.CheckoutRequestID || inner?.CheckoutRequestID || body?.TransactionReference || body?.reference;

  if (!externalRef) {
    console.error("KCB callback: no recognizable reference field in body", JSON.stringify(body));
    return ackResponse();
  }

  const { data: tx, error: txErr } = await sb
    .from("kcb_transactions")
    .select("*")
    .eq("external_ref", externalRef)
    .single();

  if (txErr || !tx) {
    console.error("KCB callback: transaction not found for", externalRef);
    return ackResponse();
  }

  if (tx.status === "completed" || tx.status === "failed") {
    return ackResponse(); // already processed
  }

  const resultCode = stk?.ResultCode ?? inner?.ResultCode ?? inner?.ResponseCode;
  const success = resultCode === 0 || resultCode === "0";

  if (success) {
    // Safaricom's native shape reports the receipt/amount inside
    // CallbackMetadata.Item[{Name,Value}] rather than flat fields.
    let receiptNo = inner?.MpesaReceiptNumber || inner?.ReceiptNumber || "";
    let paidAmount = Number(inner?.Amount ?? tx.amount);
    const items: any[] = stk?.CallbackMetadata?.Item || [];
    for (const item of items) {
      if (item.Name === "MpesaReceiptNumber") receiptNo = String(item.Value);
      if (item.Name === "Amount") paidAmount = Number(item.Value);
    }
    if (!receiptNo) receiptNo = externalRef;

    await sb.from("kcb_transactions").update({
      status: "completed",
      result_code: String(resultCode),
      result_desc: stk?.ResultDesc || inner?.ResponseDescription || "",
      receipt_no: receiptNo,
      amount: paidAmount,
      raw_callback: body,
    }).eq("id", tx.id);

    const studentIds: string[] = tx.student_ids || [];
    if (studentIds.length > 0) {
      const perStudent = paidAmount / studentIds.length;
      const currentYear = new Date().getFullYear();
      for (const studentId of studentIds) {
        await createFeePayment(sb, { schoolId: tx.school_id, studentId, amount: perStudent, year: currentYear, receiptNo, ref: receiptNo });
      }
    }
  } else {
    await sb.from("kcb_transactions").update({
      status: "failed",
      result_code: String(resultCode ?? ""),
      result_desc: stk?.ResultDesc || inner?.ResponseDescription || "",
      raw_callback: body,
    }).eq("id", tx.id);
  }

  return ackResponse();
}

// --------------- Fee Payment Creation (mirrors mpesa-callback's own copy —
// edge functions deploy independently, so this is intentionally
// duplicated rather than shared) ---------------

interface PaymentInput {
  schoolId: string;
  studentId: string;
  amount: number;
  year: number;
  receiptNo: string;
  ref: string;
}

async function createFeePayment(sb: ReturnType<typeof createClient>, input: PaymentInput): Promise<void> {
  const { schoolId, studentId, amount, year, receiptNo, ref } = input;

  const { data: student } = await sb.from("students").select("grade, opening_balance").eq("id", studentId).single();
  if (!student) return;

  let remaining = amount;

  // Arrears first — same reasoning as mpesa-callback's own copy of
  // this function (see its comment for the fuller explanation): a
  // carried-forward "Balance b/f" balance is its own bucket, checked
  // before Term 1/2/3, matching what manual recording already
  // enforces. No year filter — arrears carry forward until cleared.
  const OB_TERM = "Balance b/f";
  const obBilled = Number(student.opening_balance) || 0;
  if (obBilled > 0 && remaining > 0) {
    const { data: obPayments } = await sb
      .from("fee_payments")
      .select("amount, transport_amount")
      .eq("student_id", studentId)
      .eq("term", OB_TERM);

    let obPaid = 0;
    for (const p of obPayments || []) obPaid += Number(p.amount) - (Number((p as any).transport_amount) || 0);

    const obBalance = obBilled - obPaid;
    if (obBalance > 0) {
      const applyAmount = Math.min(remaining, obBalance);
      await sb.from("fee_payments").insert({
        school_id: schoolId,
        student_id: studentId,
        amount: applyAmount,
        term: OB_TERM,
        year: year,
        method: "KCB",
        receipt_no: "KCB-" + receiptNo + "-OB",
        reference: ref,
        note: "KCB payment (balance carried forward)",
      });
      remaining -= applyAmount;
    }
  }

  const terms = ["Term 1", "Term 2", "Term 3"];

  for (const term of terms) {
    if (remaining <= 0) break;

    const { data: structures } = await sb
      .from("fee_structures")
      .select("id, fee_items(amount)")
      .eq("school_id", schoolId)
      .eq("level", student.grade)
      .eq("term", term)
      .eq("year", year);

    let billed = 0;
    for (const s of structures || []) {
      for (const item of (s as any).fee_items || []) billed += Number(item.amount) || 0;
    }
    if (billed === 0) continue;

    const { data: payments } = await sb
      .from("fee_payments")
      .select("amount, transport_amount")
      .eq("student_id", studentId)
      .eq("term", term)
      .eq("year", year);

    let paid = 0;
    for (const p of payments || []) paid += Number(p.amount) - (Number((p as any).transport_amount) || 0);

    const termBalance = billed - paid;
    if (termBalance <= 0) continue;

    const applyAmount = Math.min(remaining, termBalance);
    const rcptSuffix = term.replace(/\s+/g, "").toUpperCase();

    await sb.from("fee_payments").insert({
      school_id: schoolId,
      student_id: studentId,
      amount: applyAmount,
      term: term,
      year: year,
      method: "KCB",
      receipt_no: "KCB-" + receiptNo + "-" + rcptSuffix,
      reference: ref,
      note: "KCB Buni payment",
    });

    remaining -= applyAmount;
  }

  if (remaining > 0) {
    const lastTerm = terms[terms.length - 1];
    await sb.from("fee_payments").insert({
      school_id: schoolId,
      student_id: studentId,
      amount: remaining,
      term: lastTerm,
      year: year,
      method: "KCB",
      receipt_no: "KCB-" + receiptNo + "-EXTRA",
      reference: ref,
      note: "KCB overpayment / advance",
    });
  }
}

// --------------- Router ---------------

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok");
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  return handleCallback(req);
});
