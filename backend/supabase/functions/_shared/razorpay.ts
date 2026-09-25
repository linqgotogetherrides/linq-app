import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-razorpay-signature",
};

export const PLAN_AMOUNTS: Record<string, number> = {
  yearly: 19900,
  two_year: 24900,
  single_unlock: 900,
  wallet_topup: 50000,
  // Unlocked by the "Fill the Ride" 10-win milestone. Eligibility is checked
  // against game_profiles server-side, never trusted from the client.
  game_annual: 5900,
};

/** Plans whose availability depends on a server-side unlock, not on price. */
export const GATED_PLANS: Record<
  string,
  { rpc: string; arg: string; unlockField: string; threshold: number; reason: string }
> = {
  game_annual: {
    rpc: "get_game_profile",
    arg: "p_user_id",
    unlockField: "total_wins",
    threshold: 10,
    reason: "Reach 10 wins in Fill the Ride to unlock the Rs 59 annual plan",
  },
};

export type RazorpayOrder = {
  id: string;
  amount: number;
  currency: string;
  status?: string;
  receipt?: string;
};

export type RazorpayPayment = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  captured?: boolean;
};

type RazorpayPaymentCollection = {
  items?: RazorpayPayment[];
};

export class PaymentError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "PaymentError";
    this.status = status;
  }
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new PaymentError(500, `${name} is not configured`);
  }
  return value;
}

function supabaseAdmin(): SupabaseClient {
  return createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

function razorpayAuthHeader(): string {
  const keyId = requiredEnv("RAZORPAY_KEY_ID");
  const keySecret = requiredEnv("RAZORPAY_KEY_SECRET");
  return `Basic ${btoa(`${keyId}:${keySecret}`)}`;
}

async function razorpayRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: razorpayAuthHeader(),
      ...(init.headers ?? {}),
    },
  });

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new PaymentError(401, "Razorpay authentication failed");
    }
    throw new PaymentError(502, "Razorpay request failed");
  }

  return body as T;
}

export function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function hmacHex(
  secret: string,
  message: string,
  algorithm: "SHA-256" | "SHA-1" = "SHA-256",
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export type CreateOrderInput = {
  amount: number;
  currency?: string;
  receipt: string;
  plan?: string;
  /** Required for milestone-gated plans so the unlock can be verified. */
  userId?: string;
};

export async function createRazorpayOrder(input: CreateOrderInput) {
  const amount = Number(input.amount);
  if (!Number.isInteger(amount) || amount < 100) {
    throw new PaymentError(400, "Amount must be at least 100 paise");
  }

  const currency = (input.currency ?? "INR").trim().toUpperCase();
  if (currency !== "INR") {
    throw new PaymentError(400, "Only INR is supported");
  }

  const receipt = typeof input.receipt === "string" ? input.receipt.trim() : "";
  if (!receipt || receipt.length > 100) {
    throw new PaymentError(400, "A valid receipt is required");
  }

  let finalAmount = amount;
  if (input.plan && Object.prototype.hasOwnProperty.call(PLAN_AMOUNTS, input.plan)) {
    finalAmount = PLAN_AMOUNTS[input.plan];
    if (amount !== finalAmount) {
      throw new PaymentError(400, "Amount does not match the selected plan");
    }
  }

  // Milestone-gated plans: the price is not enough, the unlock is required.
  // Without this anyone could just order the Rs 59 plan without playing.
  if (input.plan && GATED_PLANS[input.plan]) {
    const gate = GATED_PLANS[input.plan];
    const userId = typeof input.userId === "string" ? input.userId.trim() : "";
    if (!userId) {
      throw new PaymentError(400, "Sign in to purchase this plan");
    }
    const { data: profile, error: profileError } = await supabaseAdmin().rpc(gate.rpc, {
      [gate.arg]: userId,
    });
    if (profileError) {
      throw new PaymentError(502, "Could not verify plan eligibility");
    }
    const wins = Number((profile as Record<string, unknown> | null)?.[gate.unlockField] ?? 0);
    if (wins < gate.threshold) {
      throw new PaymentError(403, gate.reason);
    }
  }

  const order = await razorpayRequest<RazorpayOrder>("/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: finalAmount,
      currency,
      receipt,
      notes: { product: input.plan ?? "custom" },
    }),
  });

  const { error } = await supabaseAdmin().from("payments").insert({
    razorpay_order_id: order.id,
    receipt,
    amount: Number(order.amount),
    currency: String(order.currency).toUpperCase(),
    product: input.plan ?? "custom",
    status: "created",
  });

  if (error) {
    throw new PaymentError(502, "Unable to save payment order");
  }

  return {
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
    key_id: requiredEnv("RAZORPAY_KEY_ID"),
  };
}

export async function verifyAndRecordPayment(
  orderId: string,
  paymentId: string,
  signature: string,
): Promise<void> {
  const cleanOrderId = orderId.trim();
  const cleanPaymentId = paymentId.trim();
  const cleanSignature = signature.trim();

  if (!cleanOrderId || !cleanPaymentId || !cleanSignature) {
    throw new PaymentError(400, "Payment verification fields are required");
  }

  const expectedSignature = await hmacHex(
    requiredEnv("RAZORPAY_KEY_SECRET"),
    `${cleanOrderId}|${cleanPaymentId}`,
  );
  if (!constantTimeEqual(expectedSignature, cleanSignature)) {
    throw new PaymentError(400, "Payment signature verification failed");
  }

  const [payment, order] = await Promise.all([
    razorpayRequest<RazorpayPayment>(`/payments/${encodeURIComponent(cleanPaymentId)}`),
    razorpayRequest<RazorpayOrder>(`/orders/${encodeURIComponent(cleanOrderId)}`),
  ]);

  if (payment.order_id !== cleanOrderId || order.id !== cleanOrderId) {
    throw new PaymentError(400, "Payment does not belong to the supplied order");
  }

  const status = payment.status.toLowerCase();
  if (status !== "captured" && status !== "authorized") {
    throw new PaymentError(400, "Razorpay payment is not completed");
  }

  if (payment.amount < 100 || payment.amount !== order.amount) {
    throw new PaymentError(400, "Payment amount does not match the order");
  }

  const paymentCurrency = payment.currency.toUpperCase();
  if (paymentCurrency !== order.currency.toUpperCase() || paymentCurrency !== "INR") {
    throw new PaymentError(400, "Payment currency is invalid");
  }

  const { data, error } = await supabaseAdmin()
    .from("payments")
    .update({
      razorpay_payment_id: payment.id,
      amount: payment.amount,
      currency: paymentCurrency,
      status: "verified",
      verified_at: new Date().toISOString(),
    })
    .eq("razorpay_order_id", cleanOrderId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new PaymentError(502, "Unable to save verified payment");
  }
  if (!data) {
    throw new PaymentError(500, "The Razorpay order was not found in Supabase");
  }
}

export async function findCompletedPayment(orderId: string) {
  const collection = await razorpayRequest<RazorpayPaymentCollection>(
    `/orders/${encodeURIComponent(orderId)}/payments`,
  );
  return (collection.items ?? []).find((payment) => {
    const status = payment.status.toLowerCase();
    return status === "captured" || status === "authorized";
  });
}

export async function markPaymentStatus(
  orderId: string,
  status: "failed" | "cancelled" | "refunded",
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("payments")
    .update({ status })
    .eq("razorpay_order_id", orderId);
  if (error) {
    throw new PaymentError(502, "Unable to update payment status");
  }
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof PaymentError) {
    return jsonResponse({ error: error.message }, error.status);
  }
  console.error(error);
  return jsonResponse({ error: "Unexpected payment service error" }, 500);
}

export function requireClientAuthorization(req: Request): void {
  const authorization = req.headers.get("Authorization")?.trim() ?? "";
  const apiKey = req.headers.get("apikey")?.trim() ?? "";
  if (!authorization || !apiKey || authorization !== `Bearer ${apiKey}`) {
    throw new PaymentError(401, "Authentication required");
  }
}

export function optionsResponse(): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}
