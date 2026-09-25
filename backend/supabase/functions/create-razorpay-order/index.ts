import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  createRazorpayOrder,
  errorResponse,
  jsonResponse,
  optionsResponse,
  requireClientAuthorization,
} from "../_shared/razorpay.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    requireClientAuthorization(req);

    const body = await req.json();
    const order = await createRazorpayOrder({
      amount: Number(body?.amount),
      currency: typeof body?.currency === "string" ? body.currency : "INR",
      receipt: typeof body?.receipt === "string" ? body.receipt : "",
      plan: typeof body?.plan === "string" ? body.plan : undefined,
    });

    return jsonResponse(order);
  } catch (error: unknown) {
    return errorResponse(error);
  }
});
