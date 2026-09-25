// Wallet crediting after a verified payment or reward.
//
// Clients can READ the wallet but never write it. A balance only moves here,
// and only after this function independently confirms the payment is real.
//
// Idempotency: wallet_txns.reference_id is unique, so crediting the same
// razorpay_payment_id twice is impossible. That stops a user re-opening the
// Razorpay success callback to mint money.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

class WalletError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "WalletError";
    this.status = status;
  }
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new WalletError(500, `${name} is not configured`);
  return value;
}

function admin() {
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireAuth(req: Request) {
  const authorization = req.headers.get("Authorization")?.trim() ?? "";
  const apiKey = req.headers.get("apikey")?.trim() ?? "";
  if (!authorization || !apiKey || authorization !== `Bearer ${apiKey}`) {
    throw new WalletError(401, "Authentication required");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    requireAuth(req);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") throw new WalletError(400, "JSON body required");

    const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
    const paymentId = typeof body.razorpay_payment_id === "string" ? body.razorpay_payment_id.trim() : "";
    if (!userId) throw new WalletError(400, "user_id is required");
    if (!paymentId) throw new WalletError(400, "razorpay_payment_id is required");

    const db = admin();

    // 1. The payment must exist AND be verified. A client cannot claim success.
    const { data: payment, error: paymentError } = await db
      .from("payments")
      .select("id, user_id, razorpay_payment_id, amount, currency, status")
      .eq("razorpay_payment_id", paymentId)
      .maybeSingle();

    if (paymentError) throw new WalletError(502, "Could not verify the payment");
    if (!payment) throw new WalletError(404, "Payment not found");
    if (payment.status !== "verified") {
      throw new WalletError(409, `Payment is ${payment.status}, not verified`);
    }
    if (payment.user_id !== userId) {
      throw new WalletError(403, "Payment belongs to another user");
    }

    // 2. Credit once, keyed by the payment id.
    const amountRupees = Number(payment.amount) / 100;
    const note = `Wallet top-up · ${payment.razorpay_payment_id}`;

    const { data: result, error: creditError } = await db.rpc("credit_wallet_once", {
      p_user_id: userId,
      p_amount: amountRupees,
      p_kind: "topup",
      p_note: note,
      p_reference_id: payment.razorpay_payment_id,
    });

    if (creditError) {
      // 23505 = unique violation on wallet_txns.reference_id => already credited.
      if (creditError.code === "23505") {
        const { data: wallet } = await db
          .from("wallets")
          .select("balance, lifetime_earned")
          .eq("user_id", userId)
          .maybeSingle();
        return json({
          ok: true,
          already_credited: true,
          balance: Number(wallet?.balance ?? 0),
          lifetime_earned: Number(wallet?.lifetime_earned ?? 0),
        });
      }
      throw new WalletError(502, "Could not credit the wallet");
    }

    return json(result ?? { ok: true, already_credited: false });
  } catch (error) {
    if (error instanceof WalletError) return json({ error: error.message }, error.status);
    console.error("wallet-credit error:", error);
    return json({ error: "Unexpected wallet service error" }, 500);
  }
});
