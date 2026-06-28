// ============================================================
//  Samaji — M-Pesa STK Push Edge Function
//  Deploy: supabase functions deploy mpesa-stk
//
//  This function handles two flows:
//  1. POST /mpesa-stk  — Initiates STK Push (called by parent portal)
//  2. POST /mpesa-stk/callback — Receives M-Pesa callback (called by Safaricom)
//
//  Environment variables needed (set via supabase secrets):
//    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-set by Supabase)
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface STKRequest {
  transaction_id: string; // UUID from mpesa_transactions
  school_id: string;
  phone: string;
  amount: number;
  account_ref?: string;
}

async function getMpesaToken(consumerKey: string, consumerSecret: string, env: string): Promise<string> {
  const url = env === "production"
    ? "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
    : "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";

  const auth = btoa(`${consumerKey}:${consumerSecret}`);
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Basic ${auth}` },
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Failed to get M-Pesa token: " + JSON.stringify(data));
  return data.access_token;
}

function formatPhone(phone: string): string {
  let p = phone.replace(/[^0-9]/g, "");
  if (p.startsWith("0")) p = "254" + p.slice(1);
  if (!p.startsWith("254")) p = "254" + p;
  return p;
}

function generateTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return d.getFullYear().toString() +
    pad(d.getMonth() + 1) + pad(d.getDate()) +
    pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}

async function handleSTKPush(req: Request): Promise<Response> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const body: STKRequest = await req.json();
  const { transaction_id, school_id, phone, amount, account_ref } = body;

  if (!transaction_id || !school_id || !phone || !amount) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Get M-Pesa config for this school
  const { data: config, error: cfgErr } = await supabase
    .from("mpesa_config")
    .select("*")
    .eq("school_id", school_id)
    .single();

  if (cfgErr || !config) {
    return new Response(JSON.stringify({ error: "M-Pesa not configured for this school" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const token = await getMpesaToken(config.consumer_key, config.consumer_secret, config.environment);
    const timestamp = generateTimestamp();
    const password = btoa(config.shortcode + config.passkey + timestamp);
    const formattedPhone = formatPhone(phone);

    const stkUrl = config.environment === "production"
      ? "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
      : "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";

    const callbackUrl = config.callback_url ||
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/mpesa-stk/callback`;

    const stkPayload = {
      BusinessShortCode: config.shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.ceil(amount),
      PartyA: formattedPhone,
      PartyB: config.shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: callbackUrl,
      AccountReference: account_ref || "SchoolFees",
      TransactionDesc: "Fee Payment",
    };

    const stkRes = await fetch(stkUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(stkPayload),
    });

    const stkData = await stkRes.json();

    if (stkData.ResponseCode === "0") {
      // Update transaction with checkout IDs
      await supabase.from("mpesa_transactions").update({
        checkout_request_id: stkData.CheckoutRequestID,
        merchant_request_id: stkData.MerchantRequestID,
        status: "pending",
      }).eq("id", transaction_id);

      return new Response(JSON.stringify({
        success: true,
        checkout_request_id: stkData.CheckoutRequestID,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      await supabase.from("mpesa_transactions").update({
        status: "failed",
        result_desc: stkData.errorMessage || stkData.ResponseDescription || "STK push failed",
      }).eq("id", transaction_id);

      return new Response(JSON.stringify({
        success: false,
        error: stkData.errorMessage || stkData.ResponseDescription || "STK push failed",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

async function handleCallback(req: Request): Promise<Response> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const body = await req.json();
  const result = body?.Body?.stkCallback;

  if (!result) {
    return new Response("OK", { status: 200 });
  }

  const checkoutId = result.CheckoutRequestID;
  const resultCode = result.ResultCode;
  const resultDesc = result.ResultDesc;

  // Find the transaction
  const { data: tx } = await supabase
    .from("mpesa_transactions")
    .select("*")
    .eq("checkout_request_id", checkoutId)
    .single();

  if (!tx) {
    return new Response("Transaction not found", { status: 200 });
  }

  if (resultCode === 0) {
    // Payment successful — extract receipt number from callback metadata
    let receiptNo = "";
    let paidAmount = tx.amount;
    const items = result.CallbackMetadata?.Item || [];
    for (const item of items) {
      if (item.Name === "MpesaReceiptNumber") receiptNo = item.Value;
      if (item.Name === "Amount") paidAmount = item.Value;
    }

    // Update transaction
    await supabase.from("mpesa_transactions").update({
      status: "completed",
      result_code: resultCode,
      result_desc: resultDesc,
      mpesa_receipt_no: receiptNo,
      amount: paidAmount,
    }).eq("id", tx.id);

    // Create fee_payment records for each student
    const studentIds = tx.student_ids || [];
    if (studentIds.length > 0) {
      // Split amount equally among students (or full amount to single student)
      const perStudent = paidAmount / studentIds.length;
      const year = new Date().getFullYear();

      for (const studentId of studentIds) {
        // Determine which term to apply payment to
        const { data: student } = await supabase
          .from("students")
          .select("grade")
          .eq("id", studentId)
          .single();

        const terms = ["Term 1", "Term 2", "Term 3"];
        let targetTerm = "Term 1";

        if (student) {
          for (const term of terms) {
            // Check fee structure for this term
            const { data: structures } = await supabase
              .from("fee_structures")
              .select("id, fee_items(amount)")
              .eq("school_id", tx.school_id)
              .eq("level", student.grade)
              .eq("term", term)
              .eq("year", year);

            const billed = (structures || []).reduce(function (sum: number, s: any) {
              return sum + (s.fee_items || []).reduce(function (a: number, i: any) {
                return a + Number(i.amount);
              }, 0);
            }, 0);

            // Check payments for this term
            const { data: payments } = await supabase
              .from("fee_payments")
              .select("amount, transport_amount")
              .eq("student_id", studentId)
              .eq("term", term)
              .eq("year", year);

            const paid = (payments || []).reduce(function (a: number, p: any) {
              return a + Number(p.amount) - (Number(p.transport_amount) || 0);
            }, 0);

            if (paid < billed) {
              targetTerm = term;
              break;
            }
          }
        }

        // Generate receipt number
        const receiptPrefix = "MP" + Date.now().toString(36).toUpperCase();

        await supabase.from("fee_payments").insert({
          school_id: tx.school_id,
          student_id: studentId,
          amount: perStudent,
          term: targetTerm,
          year: year,
          method: "M-Pesa",
          receipt_no: receiptPrefix,
          reference: receiptNo,
          note: "M-Pesa payment",
        });
      }
    }

    // Send SMS notification (if SMS module is available)
    // This would use Africa's Talking or similar — left as extension point

  } else {
    // Payment failed or cancelled
    await supabase.from("mpesa_transactions").update({
      status: resultCode === 1032 ? "cancelled" : "failed",
      result_code: resultCode,
      result_desc: resultDesc,
    }).eq("id", tx.id);
  }

  return new Response("OK", { status: 200 });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);

  if (url.pathname.endsWith("/callback")) {
    return handleCallback(req);
  }

  return handleSTKPush(req);
});
