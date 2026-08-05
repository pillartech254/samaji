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
//  ⚠ UNVERIFIED AGAINST KCB'S ACTUAL API SPEC — the OAuth2
//  client_credentials exchange below is the standard WSO2 pattern and
//  should work as-is, but the payment-initiation endpoint PATH and its
//  exact request/response FIELD NAMES (the KCB_ENDPOINTS block and
//  buildInitiatePayload/parseCallback below) are placeholders. Before
//  going live: log into the Buni portal, open the subscribed "M-PESA
//  Express" API's definition (Swagger/OpenAPI — usually a "Try it out"
//  tab after subscribing), and update the three TODOs marked below to
//  match exactly. The IPN callback route (/kcb-stk/callback) is real
//  and reachable the moment this function is deployed — give KCB that
//  URL regardless of whether the TODOs are filled in yet.
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
//  Per-school KCB credentials live in the `kcb_config` table
//  (base_url, till_number, consumer_key, consumer_secret, environment,
//  callback_url) — see setup-modules-38.sql.
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
// This part follows the generic WSO2 API Manager flow and should not need
// changes: https://apim.docs.wso2.com/en/4.2.0/get-started/integration-quick-start-guide/
async function getWSO2Token(
  baseUrl: string,
  consumerKey: string,
  consumerSecret: string
): Promise<string> {
  const auth = btoa(consumerKey + ":" + consumerSecret);
  const res = await fetch(baseUrl.replace(/\/$/, "") + "/token?grant_type=client_credentials", {
    method: "POST",
    headers: { Authorization: "Basic " + auth },
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

// TODO (confirm against KCB's Buni API definition): the exact context
// path for the "M-PESA Express" / Till payment-initiation API once
// subscribed. This is a placeholder shaped like Safaricom's own STK
// endpoint naming convention, which many bank aggregators mirror, but
// KCB's actual path must be copied from their portal.
const KCB_ENDPOINTS = {
  initiate: "/mpesa/stkpush/v1/processrequest", // TODO: confirm exact path from Buni portal
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
    return jsonResponse({ error: "KCB payment is not configured for this school. Contact your school admin." }, 400);
  }

  const { data: school } = await sb.from("schools").select("name").eq("id", school_id).single();
  const schoolName = school?.name || "School";

  try {
    const token = await getWSO2Token(config.base_url, config.consumer_key, config.consumer_secret);
    const formattedPhone = formatPhone(phone);
    const callbackUrl =
      config.callback_url ||
      Deno.env.get("SUPABASE_URL") + "/functions/v1/kcb-stk/callback";

    // TODO (confirm against KCB's Buni API definition): field names below
    // mirror the Safaricom STK Push shape as a starting point — replace
    // with KCB's actual request schema once available.
    const payload = {
      TillNumber: config.till_number,
      Amount: Math.ceil(amount),
      PhoneNumber: formattedPhone,
      CallBackURL: callbackUrl,
      AccountReference: (account_ref || schoolName).slice(0, 12),
      TransactionDesc: "Fee payment - " + schoolName,
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

    // TODO (confirm): success/failure discriminator field name — using
    // Safaricom's "ResponseCode === '0'" convention as a placeholder.
    const ok = res.ok && (data.ResponseCode === "0" || data.ResponseCode === 0);

    if (ok) {
      await sb.from("kcb_transactions").update({
        external_ref: data.CheckoutRequestID || data.TransactionID || null,
        status: "pending",
      }).eq("id", transaction_id);

      return jsonResponse({ success: true, message: "Payment request sent to " + formattedPhone });
    } else {
      const errMsg = data.errorMessage || data.ResponseDescription || "Payment request rejected by KCB";
      await sb.from("kcb_transactions").update({ status: "failed", result_desc: errMsg }).eq("id", transaction_id);
      return jsonResponse({ success: false, error: errMsg }, 400);
    }
  } catch (err) {
    await sb.from("kcb_transactions").update({ status: "failed", result_desc: String(err) }).eq("id", transaction_id);
    return jsonResponse({ error: "KCB payment request failed: " + String(err) }, 500);
  }
}

// --------------- 2. KCB IPN CALLBACK ---------------

async function handleCallback(req: Request): Promise<Response> {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response("OK", { status: 200 });
  }

  const sb = serviceClient();

  // TODO (confirm against KCB's IPN spec): the field(s) that identify
  // which of our transactions this notification is for. Tries a few
  // plausible names; the raw body is always stored in raw_callback so
  // nothing is lost if none of these match once the real spec is known.
  const externalRef =
    body?.CheckoutRequestID || body?.TransactionID || body?.TransactionReference || body?.reference;

  if (!externalRef) {
    console.error("KCB callback: no recognizable reference field in body", JSON.stringify(body));
    return new Response("OK", { status: 200 });
  }

  const { data: tx, error: txErr } = await sb
    .from("kcb_transactions")
    .select("*")
    .eq("external_ref", externalRef)
    .single();

  if (txErr || !tx) {
    console.error("KCB callback: transaction not found for", externalRef);
    return new Response("OK", { status: 200 });
  }

  if (tx.status === "completed" || tx.status === "failed") {
    return new Response("OK", { status: 200 }); // already processed
  }

  // TODO (confirm): success discriminator + receipt/amount field names.
  const resultCode = body?.ResultCode ?? body?.ResponseCode;
  const success = resultCode === 0 || resultCode === "0";

  if (success) {
    const receiptNo = body?.MpesaReceiptNumber || body?.ReceiptNumber || externalRef;
    const paidAmount = Number(body?.Amount ?? tx.amount);

    await sb.from("kcb_transactions").update({
      status: "completed",
      result_code: String(resultCode),
      result_desc: body?.ResultDesc || body?.ResponseDescription || "",
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
      result_desc: body?.ResultDesc || body?.ResponseDescription || "",
      raw_callback: body,
    }).eq("id", tx.id);
  }

  return new Response("OK", { status: 200 });
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
