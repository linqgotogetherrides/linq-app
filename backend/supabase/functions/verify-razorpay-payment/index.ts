import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  errorResponse,
  jsonResponse,
  optionsResponse,
  requireClientAuthorization,
  verifyAndRecordPayment,
} from "../_shared/razorpay.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    requireClientAuthorization(req);

    const body = await req.json();
    await verifyAndRecordPayment(
      typeof body?.razorpay_order_id === "string" ? body.razorpay_order_id : "",
      typeof body?.razorpay_payment_id === "string" ? body.razorpay_payment_id : "",
      typeof body?.razorpay_signature === "string" ? body.razorpay_signature : "",
    );

    return jsonResponse({
      success: true,
      verified: true,
      order_id: body.razorpay_order_id,
      payment_id: body.razorpay_payment_id,
    });
  } catch (error: unknown) {
    return errorResponse(error);
  }
});
