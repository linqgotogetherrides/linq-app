export type SosAlertProfile = {
  userName: string;
  contactName: string;
  contactPhone: string;
};

export type SosAlertLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
} | null;

export type SosAlertMessageInput = {
  profile: SosAlertProfile;
  location: SosAlertLocation;
  timestamp: string;
};

/**
 * WhatsApp needs a full international number. LinQ stores contacts as Indian
 * 10-digit numbers, so add the country code when one is missing. Already
 * international numbers are left alone.
 */
export function normalizeSosPhone(value: string): string | null {
  let digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) return `91${digits}`;
  if (digits.length >= 11) return digits;
  return null;
}

export function buildSosMapsUrl(location: SosAlertLocation): string | null {
  if (!location) return null;
  return `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return timestamp;
  try {
    return date.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return date.toISOString();
  }
}

export function buildSosMessage({
  profile,
  location,
  timestamp,
}: SosAlertMessageInput): string {
  const mapsUrl = buildSosMapsUrl(location);
  const accuracy =
    location?.accuracy != null && Number.isFinite(location.accuracy)
      ? `\nAccuracy: about ${Math.round(location.accuracy)} m`
      : '';

  return [
    `🚨 SOS ALERT — ${profile.userName} needs help`,
    '',
    `Hi ${profile.contactName}, I have triggered an emergency SOS from LinQ.`,
    '',
    `Time: ${formatTimestamp(timestamp)}`,
    `Location: ${mapsUrl ?? 'Location unavailable'}${accuracy}`,
    '',
    'Please call or message me immediately. If I do not respond, contact emergency services.',
    '',
    'This alert was sent from LinQ.',
  ].join('\n');
}

export function buildSosWhatsAppUrl(input: SosAlertMessageInput): string {
  const phone = normalizeSosPhone(input.profile.contactPhone);
  const message = buildSosMessage(input);
  const target = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
  return `${target}?text=${encodeURIComponent(message)}`;
}
