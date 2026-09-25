import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import {
  errorResponse,
  optionsResponse,
  verifyAndRecordPayment,
} from "../_shared/razorpay.ts";

type NativeMessage = {
  type: "success" | "failed";
  message?: string;
  response?: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  };
};

function callbackHtml(message: NativeMessage): Response {
  const serialized = JSON.stringify(message).replace(/</g, "\\<");
  return new Response(
    `<!doctype html>
<html>
  <head><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
  <body>
    <script>
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(${serialized});
      }
    </script>
  </body>
</html>`,
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const form = await req.formData();
    const url = new URL(req.url);
    const value = (name: string): string => {
      const formValue = form.get(name);
      const queryValue = url.searchParams.get(name);
      return String(formValue ?? queryValue ?? "").trim();
    };

    const orderId = value("razorpay_order_id");
    const paymentId = value("razorpay_payment_id");
    const signature = value("razorpay_signature");
    const errorDescription = value("error[description]") ||
      value("error_description");

    if (!orderId || !paymentId || !signature) {
      return callbackHtml({
        type: "failed",
        message: errorDescription || "Razorpay payment was not completed",
      });
    }

    try {
      await verifyAndRecordPayment(orderId, paymentId, signature);
    } catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : "Razorpay payment verification failed";
      return callbackHtml({ type: "failed", message });
    }

    return callbackHtml({
      type: "success",
      response: {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
      },
    });
  } catch (error: unknown) {
    return errorResponse(error);
  }
});
