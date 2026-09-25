// Emergency contact dispatch for LinQ SOS.
//
// Design: a provider INTERFACE, not a hardcoded vendor.
//
// LinQ has no SMS/email provider credentials configured, and per the security
// requirements no provider secret may ever reach the mobile app. So the
// dispatcher supports an optional generic outbound webhook:
//
//   SOS_ALERT_WEBHOOK_URL     - HTTPS endpoint that accepts the alert JSON
//   SOS_ALERT_WEBHOOK_SECRET - shared secret, sent as `x-linq-sos-secret`
//
// Wire Twilio / Interakt / MSG91 / SES / your own relay behind that webhook and
// alerts start flowing with no code change. Until then every alert is recorded
// with an explicit terminal status so the admin dashboard can show the truth:
// alerts were created, but no provider was available to deliver them.
//
// This function NEVER fabricates a successful send.

export type ContactAlertPayload = {
  sos_id: string;
  reference_code: string;
  user_id: string;
  user_name: string;
  user_phone: string | null;
  contact_name: string;
  contact_phone: string | null;
  contact_email: string | null;
  channel: "sms" | "email";
  message: string;
  maps_url: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  activated_at: string;
  current_ride_id: string | null;
  ride_pickup: string | null;
  ride_dropoff: string | null;
};

export type DispatchResult = {
  status: "SENT" | "FAILED" | "SKIPPED_NO_PROVIDER" | "SKIPPED_NO_REACH";
  provider: string | null;
  provider_message_id: string | null;
  provider_error: string | null;
};

function webhookConfig(): { url: string; secret: string | null } | null {
  const url = Deno.env.get("SOS_ALERT_WEBHOOK_URL")?.trim();
  if (!url) return null;
  if (!/^https:\/\//i.test(url)) {
    console.error("SOS_ALERT_WEBHOOK_URL must use HTTPS; alerts will not be delivered.");
    return null;
  }
  return { url, secret: Deno.env.get("SOS_ALERT_WEBHOOK_SECRET")?.trim() || null };
}

export function describeDispatcher(): {
  configured: boolean;
  provider: string | null;
  reason: string | null;
} {
  const config = webhookConfig();
  if (config) return { configured: true, provider: "webhook", reason: null };
  return {
    configured: false,
    provider: null,
    reason:
      "No SOS alert provider is configured. Set SOS_ALERT_WEBHOOK_URL (and optionally SOS_ALERT_WEBHOOK_SECRET) to deliver alerts to emergency contacts.",
  };
}

export async function dispatchContactAlert(payload: ContactAlertPayload): Promise<DispatchResult> {
  const hasReach = Boolean(payload.contact_phone) || Boolean(payload.contact_email);
  if (!hasReach) {
    return {
      status: "SKIPPED_NO_REACH",
      provider: null,
      provider_message_id: null,
      provider_error: "Contact has neither a phone number nor an email address.",
    };
  }

  const config = webhookConfig();
  if (!config) {
    return {
      status: "SKIPPED_NO_PROVIDER",
      provider: null,
      provider_message_id: null,
      provider_error:
        "No alert provider configured. The alert was recorded and is visible in the admin dashboard.",
    };
  }

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.secret ? { "x-linq-sos-secret": config.secret } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    const raw = await response.text();
    let parsed: Record<string, unknown> = {};
    try {
      parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      parsed = { raw };
    }

    if (!response.ok) {
      return {
        status: "FAILED",
        provider: "webhook",
        provider_message_id: null,
        provider_error: `Provider responded ${response.status}: ${raw.slice(0, 300)}`,
      };
    }

    const messageId =
      typeof parsed.message_id === "string"
        ? parsed.message_id
        : typeof parsed.id === "string"
          ? parsed.id
          : null;

    return {
      status: "SENT",
      provider: "webhook",
      provider_message_id: messageId,
      provider_error: null,
    };
  } catch (error) {
    return {
      status: "FAILED",
      provider: "webhook",
      provider_message_id: null,
      provider_error: `Provider request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function buildAlertMessage(input: {
  user_name: string;
  reference_code: string;
  maps_url: string | null;
  ride_pickup: string | null;
  ride_dropoff: string | null;
  activated_at: string;
}): string {
  const rideLine = input.ride_pickup && input.ride_dropoff
    ? `\nRide: ${input.ride_pickup} to ${input.ride_dropoff}`
    : "";
  const mapLine = input.maps_url ? `\nLive location: ${input.maps_url}` : "";
  return [
    `LINQ SOS EMERGENCY`,
    ``,
    `${input.user_name} has activated a LinQ SOS emergency.`,
    `Incident: ${input.reference_code}`,
    `Activated: ${input.activated_at}${rideLine}${mapLine}`,
    ``,
    `LinQ is sharing live location updates with you while this incident is active.`,
    `If you are in immediate danger, call your local emergency services first.`,
  ].join("\n");
}
