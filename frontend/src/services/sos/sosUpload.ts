import { supabaseFunctions } from '@/src/lib/supabase';

export type SosUploadPhoto = {
  name: string;
  base64: string;
  contentType: string;
};

export type SosUploadVideo = {
  name: string;
  base64: string;
  contentType: string;
};

export type SosUploadInput = {
  sosId: string;
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  photos: SosUploadPhoto[];
  video: SosUploadVideo | null;
};

export type SosUploadResult = {
  success: true;
  eventId: string;
  photos: string[];
  video: string | null;
  videoSkipped: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUploadResult(value: unknown): value is SosUploadResult {
  return (
    isRecord(value) &&
    value.success === true &&
    typeof value.eventId === 'string' &&
    Array.isArray(value.photos) &&
    value.photos.every((path) => typeof path === 'string') &&
    (value.video === null || typeof value.video === 'string') &&
    typeof value.videoSkipped === 'boolean'
  );
}

/**
 * Uploads the reference SOS bundle to the `sos-upload` Edge Function.
 *
 * The function verifies the caller's Firebase/Supabase token, stores the files
 * in the private `sos-evidence` bucket, and inserts the matching `sos_events`
 * row. Callers must treat a rejection as non-fatal and continue to WhatsApp.
 */
export async function uploadSosEvidence(input: SosUploadInput): Promise<SosUploadResult> {
  const { data, error } = await supabaseFunctions.functions.invoke('sos-upload', {
    body: input,
  });

  if (error) {
    throw new Error(error.message || 'SOS evidence upload failed');
  }

  if (!isUploadResult(data)) {
    if (isRecord(data) && typeof data.error === 'string') {
      throw new Error(data.error);
    }
    throw new Error('SOS evidence upload returned an unexpected response');
  }

  return data;
}
