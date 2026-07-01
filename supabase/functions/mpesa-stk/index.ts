// ============================================================
//  Samaji — M-Pesa STK Push Edge Function (Daraja API v2)
//
//  Routes:
//    POST /mpesa-stk           → Initiate STK Push to parent's phone
//    POST /mpesa-stk/callback  → Safaricom callback after payment
//    POST /mpesa-stk/query     → Query STK Push transaction status
//
//  Deploy:
//    supabase functions deploy mpesa-stk --no-verify-jwt
//    (--no-verify-jwt needed so Safaricom callback can reach /callback)
//
//  Secrets (set via `supabase secrets set KEY=VALUE`):
//    SUPABASE_URL              — auto-set by Supabase
//    SUPABASE_SERVICE_ROLE_KEY — auto-set by Supabase
//
//  Per-school M-Pesa credentials are stored in the `mpesa_config`
//  table (shortcode, passkey, consumer_key, consumer_secret,
//  environment, callback_url).
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --------------- CORS ---------------
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// --------------- Helpers ---------------

const DARAJA = {
  sandbox: {
    oauth: "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    stk: "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
    query: "https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query",
  },
  production: {
    oauth: "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    stk: "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
    query: "https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query",
  },
};

function darajaUrls(env: string) {
  return env === "production" ? DARAJA.production : DARAJA.sandbox;
}

async function getOAuthToken(
  consumerKey: string,
  consumerSecret: string,
  env: string
): Promise<string> {
  const urls = darajaUrls(env);
  const auth = btoa(consumerKey + ":" + consumerSecret);
  const res = await fetch(urls.oauth, {
    method: "GET",
    headers: { Authorization: "Basic " + auth },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error("Daraja OAuth failed (" + res.status + "): " + text);
  }
  const data = await res.json();
  if (!data.access_token) {
    throw new Error("No access_token in Daraja response: " + JSON.stringify(data));
  }
  return data.access_token as string;
}

function formatPhone(phone: string): string {
  let p = phone.replace(/[^0-9]/g, "");
  if (p.startsWith("0")) p = "254" + p.slice(1);
  if (p.startsWith("+")) p = p.slice(1);
  if (!p.startsWith("254")) p = "254" + p;
  return p;
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function makePassword(shortcode: string, passkey: string, ts: string): string {
  return btoa(shortcode + passkey + ts);
}

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// --------------- 1. INITIATE STK PUSH ---------------

interface STKRequest {
  transaction_id: string;
  school_id: string;
  phone: string;
  amount: number;
  account_ref?: string;
}

async function handleSTKPush(req: Request): Promise<Response> {
  let body: STKRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { transaction_id, school_id, phone, amount, account_ref } = body;
  if (!transaction_id || !school_id || !phone || !amount) {
    return jsonResponse({ error: "Missing required fields: transaction_id, school_id, phone, amount" }, 400);
  }
  if (amount < 1) {
    return jsonResponse({ error: "Amount must be at least KES 1" }, 400);
  }

  const sb = serviceClient();

  // Load school's M-Pesa credentials
  const { data: config, error: cfgErr } = await sb
    .from("mpesa_config")
    .select("*")
    .eq("school_id", school_id)
    .single();

  if (cfgErr || !config) {
    return jsonResponse({ error: "M-Pesa is not configured for this school. Contact your school admin." }, 400);
  }

  // Load school name for the STK prompt
  const { data: school } = await sb
    .from("schools")
    .select("name")
    .eq("id", school_id)
    .single();
  const schoolName = school?.name || "School";

  try {
    const token = await getOAuthToken(
      config.consumer_key,
      config.consumer_secret,
      config.environment
    );
    const ts = timestamp();
    const password = makePassword(config.shortcode, config.passkey, ts);
    const formattedPhone = formatPhone(phone);
    const urls = darajaUrls(config.environment);

    const callbackUrl =
      config.callback_url ||
      Deno.env.get("SUPABASE_URL") + "/functions/v1/mpesa-stk/callback";

    const stkPayload = {
      BusinessShortCode: config.shortcode,
      Password: password,
      Timestamp: ts,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.ceil(amount),
      PartyA: formattedPhone,
      PartyB: config.shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: callbackUrl,
      AccountReference: (account_ref || schoolName).slice(0, 12),
      TransactionDesc: "Fee payment - " + schoolName,
    };

    const stkRes = await fetch(urls.stk, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(stkPayload),
    });

    const stkData = await stkRes.json();

    if (stkData.ResponseCode === "0") {
      await sb.from("mpesa_transactions").update({
        checkout_request_id: stkData.CheckoutRequestID,
        merchant_request_id: stkData.MerchantRequestID,
        status: "pending",
      }).eq("id", transaction_id);

      return jsonResponse({
        success: true,
        message: "STK Push sent to " + formattedPhone,
        checkout_request_id: stkData.CheckoutRequestID,
      });
    } else {
      const errMsg =
        stkData.errorMessage ||
        stkData.ResponseDescription ||
        "STK Push request rejected by Safaricom";

      await sb.from("mpesa_transactions").update({
        status: "failed",
        result_desc: errMsg,
      }).eq("id", transaction_id);

      return jsonResponse({ success: false, error: errMsg }, 400);
    }
  } catch (err) {
    await sb.from("mpesa_transactions").update({
      status: "failed",
      result_desc: String(err),
    }).eq("id", transaction_id);

    return jsonResponse({ error: "STK Push failed: " + String(err) }, 500);
  }
}

// --------------- 2. SAFARICOM CALLBACK ---------------

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

// --------------- 3. QUERY TRANSACTION STATUS ---------------

interface QueryRequest {
  school_id: string;
  checkout_request_id: string;
}

async function handleQuery(req: Request): Promise<Response> {
  let body: QueryRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const { school_id, checkout_request_id } = body;
  if (!school_id || !checkout_request_id) {
    return jsonResponse({ error: "Missing school_id or checkout_request_id" }, 400);
  }

  const sb = serviceClient();

  // First check our own DB (callback may have already arrived)
  const { data: tx } = await sb
    .from("mpesa_transactions")
    .select("status, result_code, result_desc, mpesa_receipt_no, amount")
    .eq("checkout_request_id", checkout_request_id)
    .single();

  if (tx && (tx.status === "completed" || tx.status === "failed" || tx.status === "cancelled")) {
    return jsonResponse({
      status: tx.status,
      result_code: tx.result_code,
      result_desc: tx.result_desc,
      mpesa_receipt_no: tx.mpesa_receipt_no,
      amount: tx.amount,
    });
  }

  // If still pending, query Safaricom directly
  const { data: config } = await sb
    .from("mpesa_config")
    .select("*")
    .eq("school_id", school_id)
    .single();

  if (!config) {
    return jsonResponse({ status: "pending", message: "Waiting for payment..." });
  }

  try {
    const token = await getOAuthToken(
      config.consumer_key,
      config.consumer_secret,
      config.environment
    );
    const ts = timestamp();
    const password = makePassword(config.shortcode, config.passkey, ts);
    const urls = darajaUrls(config.environment);

    const queryRes = await fetch(urls.query, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: config.shortcode,
        Password: password,
        Timestamp: ts,
        CheckoutRequestID: checkout_request_id,
      }),
    });

    const queryData = await queryRes.json();
    const rc = Number(queryData.ResultCode);

    if (rc === 0) {
      return jsonResponse({ status: "completed", result_desc: queryData.ResultDesc });
    } else if (rc === 1032) {
      return jsonResponse({ status: "cancelled", result_desc: "Payment cancelled by user" });
    } else if (queryData.errorCode) {
      // Transaction still in progress or expired
      return jsonResponse({ status: "pending", message: queryData.errorMessage || "Waiting for payment..." });
    } else {
      return jsonResponse({ status: "failed", result_code: rc, result_desc: queryData.ResultDesc || "Payment failed" });
    }
  } catch {
    return jsonResponse({ status: "pending", message: "Waiting for payment..." });
  }
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

  // Get the student's grade/class
  const { data: student } = await sb
    .from("students")
    .select("grade")
    .eq("id", studentId)
    .single();

  if (!student) return;

  // Determine which term needs payment using the spillover approach:
  // Check each term in order — if billed > paid, apply payment there.
  // If payment exceeds the term balance, spill remainder to next term.
  const terms = ["Term 1", "Term 2", "Term 3"];
  let remaining = amount;

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
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const url = new URL(req.url);
  const path = url.pathname;

  if (path.endsWith("/callback")) {
    return handleCallback(req);
  }

  if (path.endsWith("/query")) {
    return handleQuery(req);
  }

  return handleSTKPush(req);
});
