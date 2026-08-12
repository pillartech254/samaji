// ============================================================
//  Samaji — KCB Buni (WSO2 API Manager) Till/Paybill Edge Function
//
//  A SECOND, independent payment rail alongside supabase/functions/
//  mpesa-stk (Safaricom Daraja, direct) — that function and its
//  mpesa_config/mpesa_transactions tables are NOT touched by this
//  file. This one talks to KCB's Buni developer portal instead, which
//  is built on WSO2 API Manager: https://apim.docs.wso2.com/en/4.2.0/
//  get-started/integration-quick-start-guide/ describes the generic
//  flow this function follows — subscribe to KCB's "M-PESA Express"
//  (or Till) API product in the Buni portal, generate an application's
//  Consumer Key/Secret, exchange them for an OAuth2 access token via
//  client_credentials, then call the subscribed API with that token.
//
//  STATUS: fully verified end-to-end with a live sandbox test (2026-08) —
//  OAuth2 token exchange, /stkpush request/response, AND the async IPN
//  callback all confirmed working as implemented. The IPN body is
//  Safaricom's own native nested shape passed through by KCB unchanged
//  (Body.stkCallback.{ResultCode, ResultDesc, CallbackMetadata.Item[]}),
//  exactly as handleCallback() expects — a resulting transaction reached
//  status "completed" with a real M-Pesa receipt number. handleCallback()
//  acks every notification with a JSON {ResultCode, ResultDesc} body (see
//  ackResponse()) rather than bare text, matching how Safaricom's own
//  callback consumers acknowledge this same envelope shape. Before
//  PRODUCTION: re-run the same test against KCB's production host/token
//  endpoint/credentials (sandbox and production hosts differ — see
//  KCB_TOKEN_URL and kcb_config.base_url) since a bank's prod environment
//  can behave differently even when sandbox is fully correct.
//
//  Routes:
//    POST /kcb-stk           → Initiate a Till/Paybill payment request
//    POST /kcb-stk/callback  → KCB's IPN (Instant Payment Notification)
//    POST /kcb-stk/query     → Poll our own DB for a transaction's status
//
//  Deploy:
//    supabase functions deploy kcb-stk --no-verify-jwt
//    (--no-verify-jwt so KCB's server can reach /callback unauthenticated)
//
//  Secrets (set via `supabase secrets set KEY=VALUE`):
//    SUPABASE_URL              — auto-set by Supabase
//    SUPABASE_SERVICE_ROLE_KEY — auto-set by Supabase
//
//  Per-school KCB credentials live in the `kcb_config` table (base_url,
//  shared_short_code, till_number, org_passkey, consumer_key,
//  consumer_secret, environment, callback_url) — see setup-modules-38.sql.
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --------------- CORS ---------------
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// --------------- WSO2 OAuth2 (standard client_credentials grant) ---------------
// The token issuer lives on a separate host from API invocation, and that
// host DIFFERS by environment — confirmed against the Buni portal itself
// for both:
//   sandbox:    https://accounts.buni.kcbgroup.com/oauth2/token
//               (proven live: a full sandbox STK push completed end-to-end
//               with a real M-Pesa receipt using this exact endpoint)
//   production: https://api.buni.kcbgroup.com/token
//               (confirmed from the live application's own Production Keys
//               > OAuth2 Tokens > Key Configurations panel)
// Selected by kcb_config.environment ("sandbox" | "production"), same as
// base_url already is — not hardcoded to one value.
const KCB_TOKEN_URLS: Record<string, string> = {
  sandbox: "https://accounts.buni.kcbgroup.com/oauth2/token",
  production: "https://api.buni.kcbgroup.com/token",
};

async function getWSO2Token(
  consumerKey: string,
  consumerSecret: string,
  environment: string
): Promise<string> {
  const tokenUrl = KCB_TOKEN_URLS[environment] || KCB_TOKEN_URLS.sandbox;
  const auth = btoa(consumerKey + ":" + consumerSecret);
  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: "Basic " + auth,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error("KCB/WSO2 OAuth failed (" + res.status + "): " + text);
  }
  const data = await res.json();
  if (!data.access_token) {
    throw new Error("No access_token in KCB/WSO2 response: " + JSON.stringify(data));
  }
  return data.access_token as string;
}

// CONFIRMED from the Buni portal (MpesaExpressAPIService > Try Out server
// list, and > Documents > Express Checkout Request).
const KCB_ENDPOINTS = {
  initiate: "/stkpush",
};

function formatPhone(phone: string): string {
  let p = phone.replace(/[^0-9]/g, "");
  if (p.startsWith("0")) p = "254" + p.slice(1);
  if (p.startsWith("+")) p = p.slice(1);
  if (!p.startsWith("254")) p = "254" + p;
  return p;
}

function serviceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

// --------------- 1. INITIATE PAYMENT ---------------

interface InitiateRequest {
  transaction_id: string;
  school_id: string;
  phone: string;
  amount: number;
  account_ref?: string;
}

async function handleInitiate(req: Request): Promise<Response> {
  let body: InitiateRequest;
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

  const { data: config, error: cfgErr } = await sb
    .from("kcb_config")
    .select("*")
    .eq("school_id", school_id)
    .single();

  if (cfgErr || !config) {
    // Surface the real reason (RLS, missing table/schema-cache, connection,
    // etc.) instead of a one-size-fits-all message — this endpoint is only
    // ever called from trusted server-side/admin code, so it's safe to
    // expose the underlying error for debugging.
    return jsonResponse({
      error: "KCB payment is not configured for this school.",
      debug: cfgErr ? { message: cfgErr.message, code: cfgErr.code, details: cfgErr.details, hint: cfgErr.hint } : "No kcb_config row found for school_id=" + school_id,
    }, 400);
  }

  try {
    const token = await getWSO2Token(config.consumer_key, config.consumer_secret, config.environment || "sandbox");
    const formattedPhone = formatPhone(phone);
    const callbackUrl =
      config.callback_url ||
      Deno.env.get("SUPABASE_URL") + "/functions/v1/kcb-stk/callback";

    // invoiceNumber is our own reference, echoed back to us — build a short
    // (<=12 char, alpha-numeric) one from the transaction id so it's unique
    // and traceable back to this row without a second lookup.
    const invoiceNumber = "INV" + transaction_id.replace(/-/g, "").slice(0, 9).toUpperCase();

    // CONFIRMED shape (Buni portal > Documents > STKPushRequest schema).
    // amount MUST be a string with no decimals ("Decimal values are not
    // permitted"). transactionDescription is capped at 13 characters —
    // easy to overflow, kept short deliberately.
    const payload = {
      phoneNumber: formattedPhone,
      amount: String(Math.ceil(amount)),
      invoiceNumber: invoiceNumber,
      sharedShortCode: config.shared_short_code !== false,
      orgShortCode: config.till_number || "",
      orgPassKey: config.org_passkey || "",
      callbackUrl: callbackUrl,
      transactionDescription: (account_ref || "Fee payment").slice(0, 13),
    };

    const res = await fetch(config.base_url.replace(/\/$/, "") + KCB_ENDPOINTS.initiate, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    // CONFIRMED response is wrapped: { header: {statusCode, statusDescription},
    // response: { ResponseCode, ResponseDescription, CheckoutRequestID,
    // CustomerMessage, ... } } — read from the wrapper, falling back to a
    // flat shape in case a given deployment doesn't wrap it.
    const inner = data.response || data;

    const ok = res.ok && (inner.ResponseCode === 0 || inner.ResponseCode === "0");

    if (ok) {
      await sb.from("kcb_transactions").update({
        external_ref: inner.CheckoutRequestID || null,
        reference: invoiceNumber,
        status: "pending",
      }).eq("id", transaction_id);

      return jsonResponse({ success: true, message: "Payment request sent to " + formattedPhone });
    } else {
      const errMsg = inner.ResponseDescription || inner.errorMessage || data.header?.statusDescription || "Payment request rejected by KCB";
      await sb.from("kcb_transactions").update({ status: "failed", result_desc: errMsg }).eq("id", transaction_id);
      return jsonResponse({ success: false, error: errMsg }, 400);
    }
  } catch (err) {
    await sb.from("kcb_transactions").update({ status: "failed", result_desc: String(err) }).eq("id", transaction_id);
    return jsonResponse({ error: "KCB payment request failed: " + String(err) }, 500);
  }
}

// --------------- 2. KCB IPN CALLBACK ---------------
//
// CONFIRMED via a live sandbox test (2026-08): KCB posts Safaricom's own
// native nested callback envelope unchanged — Body.stkCallback.{ResultCode,
// ResultDesc, CallbackMetadata.Item[{Name,Value}], ...} — checked first
// below, with flatter/wrapped fallbacks kept only as defensive belt-and-
// braces for edge cases (e.g. failure callbacks might omit CallbackMetadata
// entirely). raw_callback still stores the full body on every notification
// regardless, so any future shape drift stays diagnosable from the DB.
//
// Response format: KCB's own IPN docs don't pin an exact response body —
// only "respond 200 immediately" is documented — but since the callback
// envelope itself is Safaricom's native stkCallback shape passed through
// unchanged, we ack it the way Safaricom's own callback consumers do: a
// small JSON body of {ResultCode, ResultDesc} rather than bare text, on
// every path (success, failure, already-processed, or unrecognized body).
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

// --------------- 3. QUERY (our own DB only — no KCB status-query call yet) ---------------

async function handleQuery(req: Request): Promise<Response> {
  let body: { transaction_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }
  if (!body.transaction_id) {
    return jsonResponse({ error: "Missing transaction_id" }, 400);
  }

  const sb = serviceClient();
  const { data: tx } = await sb
    .from("kcb_transactions")
    .select("status, result_code, result_desc, receipt_no, amount")
    .eq("id", body.transaction_id)
    .single();

  if (!tx) return jsonResponse({ status: "pending", message: "Waiting for payment..." });
  return jsonResponse(tx);
}

// --------------- Fee Payment Creation (mirrors mpesa-stk's own copy —
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

  const { data: student } = await sb.from("students").select("grade").eq("id", studentId).single();
  if (!student) return;

  const terms = ["Term 1", "Term 2", "Term 3"];
  let remaining = amount;

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
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const path = new URL(req.url).pathname;
  if (path.endsWith("/callback")) return handleCallback(req);
  if (path.endsWith("/query")) return handleQuery(req);
  return handleInitiate(req);
});
