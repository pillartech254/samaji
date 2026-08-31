// ============================================================
//  Samaji — M-Pesa STK Push Edge Function (Daraja API v2)
//
//  Routes:
//    POST /mpesa-stk        → Initiate STK Push to parent's phone
//    POST /mpesa-stk/query  → Query STK Push transaction status
//
//  The Safaricom callback used to live at /mpesa-stk/callback in
//  this same function, which was deployed with --no-verify-jwt so
//  Safaricom's server (which can't provide a Supabase login token)
//  could reach it. That flag applies to the WHOLE function, not just
//  one route — so the initiate/query routes were ALSO unauthenticated
//  as a side effect. Anyone who found this URL could POST any
//  {transaction_id, school_id, phone, amount} directly and trigger a
//  real STK push to any Kenyan phone number, completely bypassing
//  the Parent Portal — no login required. The callback has been
//  split into its own function (mpesa-callback) specifically so this
//  one can go back to being a normal, authenticated function.
//
//  Deploy (WITHOUT --no-verify-jwt — this function requires a valid
//  Supabase session; only mpesa-callback should be deployed with that
//  flag):
//    supabase functions deploy mpesa-stk
//
//  Secrets (set via `supabase secrets set KEY=VALUE`):
//    SUPABASE_URL              — auto-set by Supabase
//    SUPABASE_ANON_KEY         — auto-set by Supabase
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

// --------------- Caller identity ---------------
//
// Verifies the request carries a genuine Supabase session (the same
// pattern already used by supabase/functions/admin-users), then
// returns the caller's user id. Deploying without --no-verify-jwt
// already makes Supabase's own gateway reject a request with no
// token or a garbage token before it ever reaches this code — this
// check additionally gives us WHO the caller is, so the ownership
// check below can confirm they're acting on their own transaction,
// not anyone else's.
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

// --------------- 1. INITIATE STK PUSH ---------------

interface STKRequest {
  transaction_id: string;
  school_id: string;
  phone: string;
  amount: number;
  account_ref?: string;
}

async function handleSTKPush(req: Request): Promise<Response> {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;

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

  // Ownership check: the transaction row must already exist (the
  // Parent Portal creates it via its own insert, scoped by RLS to
  // parent_id = auth.uid(), before ever calling this function) and
  // must belong to the caller. This is what actually stops someone
  // from POSTing an arbitrary phone/amount/school_id combination
  // directly at this endpoint — a valid session alone isn't enough,
  // it has to be a transaction that session's own account created.
  const { data: tx, error: txErr } = await sb
    .from("mpesa_transactions")
    .select("id, school_id, parent_id, amount, phone")
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
      Deno.env.get("SUPABASE_URL") + "/functions/v1/mpesa-callback";

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

// --------------- 2. QUERY TRANSACTION STATUS ---------------

interface QueryRequest {
  school_id: string;
  checkout_request_id: string;
}

async function handleQuery(req: Request): Promise<Response> {
  const caller = await requireCaller(req);
  if (caller instanceof Response) return caller;

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

  // Ownership check, same reasoning as handleSTKPush — a valid
  // session alone doesn't mean this caller should see the status of
  // ANY checkout_request_id they happen to guess or enumerate.
  const { data: tx } = await sb
    .from("mpesa_transactions")
    .select("status, result_code, result_desc, mpesa_receipt_no, amount, parent_id, school_id")
    .eq("checkout_request_id", checkout_request_id)
    .single();

  if (!tx || tx.parent_id !== caller.id || tx.school_id !== school_id) {
    return jsonResponse({ error: "Not authorized for this transaction" }, 403);
  }

  if (tx.status === "completed" || tx.status === "failed" || tx.status === "cancelled") {
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

  if (path.endsWith("/query")) {
    return handleQuery(req);
  }

  return handleSTKPush(req);
});
