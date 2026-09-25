import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  constantTimeEqual,
  errorResponse,
  findCompletedPayment,
  hmacHex,
  jsonResponse,
  markPaymentStatus,
  optionsResponse,
  PaymentError,
  verifyAndRecordPayment,
} from "../_shared/razorpay.ts";

type RazorpayWebhookPayment = {
  id?: string;
  order_id?: string;
  amount?: number;
  currency?: string;
  status?: string;
};

type RazorpayWebhookPayload = {
  event?: string;
  payload?: {
    payment?: { entity?: RazorpayWebhookPayment };
    order?: { entity?: { id?: string } };
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET")?.trim();
    if (!webhookSecret) {
      throw new PaymentError(500, "RAZORPAY_WEBHOOK_SECRET is not configured");
    }

    const rawBody = await req.text();
    const providedSignature = req.headers.get("x-razorpay-signature")?.trim() ?? "";
    const expectedSignature = await hmacHex(
      webhookSecret,
      rawBody,
      "SHA-256",
    );
    if (!providedSignature || !constantTimeEqual(providedSignature, expectedSignature)) {
      throw new PaymentError(400, "Invalid Razorpay webhook signature");
    }

    const event = JSON.parse(rawBody) as RazorpayWebhookPayload;
    const payment = event.payload?.payment?.entity;
    const orderId = payment?.order_id ?? event.payload?.order?.entity?.id;

    if (event.event === "payment.captured" && orderId) {
      let paymentId = payment?.id;
      if (!paymentId) {
        const completed = await findCompletedPayment(orderId);
        paymentId = completed?.id;
      }
      if (!paymentId) {
        throw new PaymentError(400, "Captured payment was not found");
      }
      const paymentSignature = await hmacHex(
        Deno.env.get("RAZORPAY_KEY_SECRET")?.trim() ?? "",
        `${orderId}|${paymentId}`,
      );
      await verifyAndRecordPayment(orderId, paymentId, paymentSignature);
    } else if (event.event === "payment.failed" && orderId) {
      await markPaymentStatus(orderId, "failed");
    }

    return jsonResponse({ received: true });
  } catch (error: unknown) {
    return errorResponse(error);
  }
});
