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
//  callback all confirmed working as implemented (see kcb-callback for
//  the callback handler, extracted out of this function — see below).
//
//  Routes:
//    POST /kcb-stk           → Initiate a Till/Paybill payment request
//    POST /kcb-stk/query     → Poll our own DB for a transaction's status
//
//  The IPN callback used to live at /kcb-stk/callback in this same
//  function, which was deployed with --no-verify-jwt so KCB's server
//  (which can't provide a Supabase login token) could reach it. That
//  flag applies to the WHOLE function, not just one route — so the
//  initiate/query routes were ALSO unauthenticated as a side effect:
//  anyone who found this URL could POST any {transaction_id,
//  school_id, phone, amount} directly and trigger a real payment
//  request to any Kenyan phone number, no login required. The
//  callback has been split into its own function (kcb-callback)
//  specifically so this one can go back to being a normal,
//  authenticated function. Same fix, same reasoning, as mpesa-stk/
//  mpesa-callback.
//
//  Deploy (WITHOUT --no-verify-jwt — this function requires a valid
//  Supabase session; only kcb-callback should be deployed with that
//  flag):
//    supabase functions deploy kcb-stk
//
//  Secrets (set via `supabase secrets set KEY=VALUE`):
//    SUPABASE_URL              — auto-set by Supabase
//    SUPABASE_ANON_KEY         — auto-set by Supabase
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

// --------------- Caller identity (mirrors mpesa-stk's own copy) ---------------
async function requireCaller(req: Request): Promise<{ id: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse({ error: "No auth token" }, 401);

  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user: caller } } = await callerClient.auth.getUser();
  if (!caller) return jsonResponse({ error: "Invalid or expired session" }, 401);
  return { id: caller.id };
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
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;

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

  // Ownership check — same reasoning as mpesa-stk: the transaction
  // row must already exist (created by the Parent Portal's own
  // insert, RLS-scoped to parent_id = auth.uid()) and belong to the
  // caller. This is what stops someone from POSTing an arbitrary
  // phone/amount/school_id combination directly at this endpoint.
  const { data: tx, error: txErr } = await sb
    .from("kcb_transactions")
    .select("id, school_id, parent_id")
    .eq("id", transaction_id)
    .single();

  if (txErr || !tx) {
    return jsonResponse({ error: "Transaction not found" }, 404);
  }
  if (tx.parent_id !== caller.id) {
    return jsonResponse({ error: "Not authorized for this transaction" }, 403);
  }
  if (tx.school_id !== school_id) {
    return jsonResponse({ error: "Transaction does not belong to this school" }, 400);
  }

  const { data: config, error: cfgErr } = await sb
    .from("kcb_config")
    .select("*")
    .eq("school_id", school_id)
    .single();

  if (cfgErr || !config) {
    // Surface the real reason (RLS, missing table/schema-cache, connection,
    // etc.) instead of a one-size-fits-all message — this endpoint now
    // requires a verified caller, so it's safe to expose the underlying
    // error for debugging.
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
      Deno.env.get("SUPABASE_URL") + "/functions/v1/kcb-callback";

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
      // KCB's response didn't match either documented success shape — log
      // and return the raw body so the real reason is visible (Supabase
      // function logs, and directly in the caller's error) instead of a
      // generic message that could mean any of: WSO2-level rejection
      // (invalid/expired subscription, fault{code,message,description}
      // shape per the spec doc), a validation error on the payload, or an
      // HTTP-level failure (res.ok false) with a differently-shaped body.
      console.error("KCB /stkpush rejected — httpStatus=" + res.status + " body=" + JSON.stringify(data));
      const errMsg = inner.ResponseDescription || inner.errorMessage || data.header?.statusDescription || data.fault?.description || data.fault?.message || "Payment request rejected by KCB";
      await sb.from("kcb_transactions").update({ status: "failed", result_desc: errMsg }).eq("id", transaction_id);
      return jsonResponse({ success: false, error: errMsg, debug: { httpStatus: res.status, raw: data } }, 400);
    }
  } catch (err) {
    await sb.from("kcb_transactions").update({ status: "failed", result_desc: String(err) }).eq("id", transaction_id);
    return jsonResponse({ error: "KCB payment request failed: " + String(err) }, 500);
  }
}

// --------------- 2. QUERY (our own DB only — no KCB status-query call yet) ---------------
//
// mpesa-stk's own /query now does more than this: when a payment is
// still "pending" in our DB, it asks Safaricom directly and — if
// confirmed — actually records the payment (fee_payments, SMS, etc.),
// as a genuine fallback for exactly the situation where an async
// callback doesn't arrive (documented as unreliable specifically in
// Safaricom's sandbox). This function does not have that fallback:
// KCB/Buni's API wasn't confirmed to expose an equivalent "check this
// transaction's status directly" endpoint the way Daraja's
// /stkpushquery does, so nothing was built here rather than guessing
// at an unverified endpoint and shipping something that looks like a
// fallback but silently doesn't work. If the IPN callback (kcb-
// callback) doesn't arrive for a given KCB payment, this function
// currently has no way to recover it — same limitation as before this
// comment was added, just now written down instead of implicit.

async function handleQuery(req: Request): Promise<Response> {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;

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
    .select("status, result_code, result_desc, receipt_no, amount, parent_id")
    .eq("id", body.transaction_id)
    .single();

  if (!tx || tx.parent_id !== caller.id) {
    return jsonResponse({ error: "Not authorized for this transaction" }, 403);
  }

  return jsonResponse(tx);
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
  if (path.endsWith("/query")) return handleQuery(req);
  return handleInitiate(req);
});
