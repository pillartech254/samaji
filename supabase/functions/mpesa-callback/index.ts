// ============================================================
//  Samaji — M-Pesa Callback Handler (Daraja API v2)
//
//  POST /mpesa-callback — Safaricom's own server calls this after a
//  customer approves or declines an STK Push prompt. Extracted out
//  of mpesa-stk, which used to handle this route too — that function
//  needed --no-verify-jwt so Safaricom (which has no Supabase login
//  token) could reach it, but that flag applied to the WHOLE
//  function, so the STK-push-initiation route ended up unauthenticated
//  as a side effect too. This function is deployed with
//  --no-verify-jwt on its own, so mpesa-stk itself can go back to
//  requiring a real session.
//
//  Deploy:
//    supabase functions deploy mpesa-callback --no-verify-jwt
//
//  Secrets (set via `supabase secrets set KEY=VALUE`):
//    SUPABASE_URL              — auto-set by Supabase
//    SUPABASE_SERVICE_ROLE_KEY — auto-set by Supabase
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

async function handleCallback(req: Request): Promise<Response> {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("OK", { status: 200 });
  }

  const result = body?.Body?.stkCallback;
  if (!result || !result.CheckoutRequestID) {
    return new Response("OK", { status: 200 });
  }

  const sb = serviceClient();
  const checkoutId: string = result.CheckoutRequestID;
  const resultCode: number = result.ResultCode;
  const resultDesc: string = result.ResultDesc || "";

  // Find the matching transaction
  const { data: tx, error: txErr } = await sb
    .from("mpesa_transactions")
    .select("*")
    .eq("checkout_request_id", checkoutId)
    .single();

  if (txErr || !tx) {
    console.error("Callback: transaction not found for checkout", checkoutId);
    return new Response("OK", { status: 200 });
  }

  // Already processed (idempotency guard)
  if (tx.status === "completed" || tx.status === "failed") {
    return new Response("OK", { status: 200 });
  }

  if (resultCode === 0) {
    // -------- PAYMENT SUCCESSFUL --------
    let receiptNo = "";
    let paidAmount = Number(tx.amount);
    let transactionDate = "";
    const items: any[] = result.CallbackMetadata?.Item || [];
    for (const item of items) {
      if (item.Name === "MpesaReceiptNumber") receiptNo = String(item.Value);
      if (item.Name === "Amount") paidAmount = Number(item.Value);
      if (item.Name === "TransactionDate") transactionDate = String(item.Value);
    }

    // Update transaction record
    await sb.from("mpesa_transactions").update({
      status: "completed",
      result_code: resultCode,
      result_desc: resultDesc,
      mpesa_receipt_no: receiptNo,
      amount: paidAmount,
    }).eq("id", tx.id);

    // Create fee_payment records for each student
    const studentIds: string[] = tx.student_ids || [];
    if (studentIds.length > 0) {
      const perStudent = paidAmount / studentIds.length;
      const currentYear = new Date().getFullYear();

      for (const studentId of studentIds) {
        await createFeePayment(sb, {
          schoolId: tx.school_id,
          studentId,
          amount: perStudent,
          year: currentYear,
          receiptNo,
          mpesaRef: receiptNo,
        });
      }
    }

    // Send SMS confirmation to the parent
    await sendPaymentSMS(sb, tx.school_id, tx.phone, paidAmount, receiptNo);

  } else {
    // -------- PAYMENT FAILED / CANCELLED --------
    const status = resultCode === 1032 ? "cancelled" : "failed";
    await sb.from("mpesa_transactions").update({
      status,
      result_code: resultCode,
      result_desc: resultDesc,
    }).eq("id", tx.id);
  }

  return new Response("OK", { status: 200 });
}

// --------------- Fee Payment Creation ---------------

interface PaymentInput {
  schoolId: string;
  studentId: string;
  amount: number;
  year: number;
  receiptNo: string;
  mpesaRef: string;
}

async function createFeePayment(
  sb: ReturnType<typeof createClient>,
  input: PaymentInput
): Promise<void> {
  const { schoolId, studentId, amount, year, receiptNo, mpesaRef } = input;

  // Get the student's grade/class and any carried-forward arrears
  const { data: student } = await sb
    .from("students")
    .select("grade, opening_balance")
    .eq("id", studentId)
    .single();

  if (!student) return;

  let remaining = amount;

  // Arrears first: a carried-forward "Balance b/f" balance is its own
  // bucket, entirely separate from Term 1/2/3's own fee structure —
  // same rule manual recording already enforces (school-plus.js's
  // OB_TERM: Term 1/2/3 collection is blocked in that UI until this
  // clears). An automated push previously skipped this bucket
  // entirely — it only ever knew about Term 1/2/3 — so a school
  // relying on arrears-first collection had no way to actually get
  // that from a parent's own M-Pesa/KCB payment, or from a push
  // triggered on their behalf from Collect Payment. No year filter
  // here, deliberately: arrears carry forward across years until
  // actually cleared, matching how termPaid(sid, OB_TERM) already
  // reads it with no year filter in the manual-recording UI.
  const OB_TERM = "Balance b/f";
  const obBilled = Number(student.opening_balance) || 0;
  if (obBilled > 0 && remaining > 0) {
    const { data: obPayments } = await sb
      .from("fee_payments")
      .select("amount, transport_amount")
      .eq("student_id", studentId)
      .eq("term", OB_TERM);

    let obPaid = 0;
    for (const p of obPayments || []) {
      obPaid += Number(p.amount) - (Number((p as any).transport_amount) || 0);
    }

    const obBalance = obBilled - obPaid;
    if (obBalance > 0) {
      const applyAmount = Math.min(remaining, obBalance);
      const uniqueReceipt = "MP-" + receiptNo + "-OB";

      await sb.from("fee_payments").insert({
        school_id: schoolId,
        student_id: studentId,
        amount: applyAmount,
        term: OB_TERM,
        year: year,
        method: "M-Pesa",
        receipt_no: uniqueReceipt,
        reference: mpesaRef,
        note: "M-Pesa STK Push payment (balance carried forward)",
      });

      remaining -= applyAmount;
    }
  }

  // Determine which term needs payment using the spillover approach:
  // Check each term in order — if billed > paid, apply payment there.
  // If payment exceeds the term balance, spill remainder to next term.
  const terms = ["Term 1", "Term 2", "Term 3"];

  for (const term of terms) {
    if (remaining <= 0) break;

    // Get billed amount for this term
    const { data: structures } = await sb
      .from("fee_structures")
      .select("id, fee_items(amount)")
      .eq("school_id", schoolId)
      .eq("level", student.grade)
      .eq("term", term)
      .eq("year", year);

    let billed = 0;
    for (const s of structures || []) {
      for (const item of (s as any).fee_items || []) {
        billed += Number(item.amount) || 0;
      }
    }

    if (billed === 0) continue;

    // Get already paid for this term
    const { data: payments } = await sb
      .from("fee_payments")
      .select("amount, transport_amount")
      .eq("student_id", studentId)
      .eq("term", term)
      .eq("year", year);

    let paid = 0;
    for (const p of payments || []) {
      paid += Number(p.amount) - (Number((p as any).transport_amount) || 0);
    }

    const termBalance = billed - paid;
    if (termBalance <= 0) continue;

    // Apply payment to this term (capped at term balance)
    const applyAmount = Math.min(remaining, termBalance);
    const rcptSuffix = term.replace(/\s+/g, "").toUpperCase();
    const uniqueReceipt = "MP-" + receiptNo + "-" + rcptSuffix;

    await sb.from("fee_payments").insert({
      school_id: schoolId,
      student_id: studentId,
      amount: applyAmount,
      term: term,
      year: year,
      method: "M-Pesa",
      receipt_no: uniqueReceipt,
      reference: mpesaRef,
      note: "M-Pesa STK Push payment",
    });

    remaining -= applyAmount;
  }

  // If there's still remaining amount (overpayment beyond all terms),
  // record it against the last applicable term
  if (remaining > 0) {
    const lastTerm = terms[terms.length - 1];
    const uniqueReceipt = "MP-" + receiptNo + "-EXTRA";

    await sb.from("fee_payments").insert({
      school_id: schoolId,
      student_id: studentId,
      amount: remaining,
      term: lastTerm,
      year: year,
      method: "M-Pesa",
      receipt_no: uniqueReceipt,
      reference: mpesaRef,
      note: "M-Pesa overpayment / advance",
    });
  }
}

// --------------- SMS Notification ---------------

async function sendPaymentSMS(
  sb: ReturnType<typeof createClient>,
  schoolId: string,
  phone: string,
  amount: number,
  receiptNo: string
): Promise<void> {
  // Get school name
  const { data: school } = await sb
    .from("schools")
    .select("name")
    .eq("id", schoolId)
    .single();
  const schoolName = school?.name || "School";

  // Check if school has SMS credits
  const { data: credits } = await sb
    .from("sms_credit_ledger")
    .select("delta")
    .eq("school_id", schoolId);

  const balance = (credits || []).reduce(
    (sum: number, row: any) => sum + Number(row.delta),
    0
  );

  if (balance < 1) return; // No SMS credits

  const message =
    "Payment of KES " +
    Number(amount).toLocaleString() +
    " received by " +
    schoolName +
    ". M-Pesa Ref: " +
    receiptNo +
    ". Thank you!";

  // Log the SMS (actual sending depends on SMS gateway integration)
  await sb.from("sms_messages").insert({
    school_id: schoolId,
    phone: phone,
    message: message,
    status: "queued",
    channel: "transactional",
  }).then(async () => {
    // Debit 1 SMS credit
    await sb.from("sms_credit_ledger").insert({
      school_id: schoolId,
      delta: -1,
      reason: "mpesa_confirmation",
    });
  }).catch(() => {
    // sms_messages table may not exist — fail silently
  });
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
