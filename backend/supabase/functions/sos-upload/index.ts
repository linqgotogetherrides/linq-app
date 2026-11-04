// SOS upload: the reference evidence bundle in one request.
//
// Unlike the older SOS functions, this endpoint does not trust a `user_id` from
// the request body. It resolves the caller from the bearer token:
//   1. Supabase Auth (Google/Apple OAuth users), then
//   2. a Firebase ID token verified against Google's public JWKS.
//
// The platform JWT check is disabled for this function in config.toml because
// Firebase tokens are not Supabase-issued. The signature check below is the
// authentication boundary, so a public anon key cannot forge an upload.
//
// Object layout:
//   sos-evidence/{user_id}/{sos_id}/01-back_01.jpg
//   sos-evidence/{user_id}/{sos_id}/evidence_video.mp4
//
// The matching metadata row is public.sos_events.

import {
  EVIDENCE_BUCKET,
  SosError,
  errorResponse,
  jsonResponse,
  optionalString,
  optionsResponse,
  readJsonBody,
  requireCoordinates,
  requireString,
  supabaseAdmin,
} from "../_shared/sos.ts";

const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
const MAX_BASE64_LENGTH = 12 * 1024 * 1024;

const FIREBASE_PROJECT_ID = Deno.env.get("FIREBASE_PROJECT_ID")?.trim() || "linq-7d413";
const FIREBASE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/heic"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime"]);

type FirebaseKeyCache = {
  fetchedAt: number;
  keys: Record<string, JsonWebKey>;
};

let firebaseKeyCache: FirebaseKeyCache | null = null;

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

function decodeBase64(value: string): Uint8Array {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    if (bytes.length === 0) throw new Error("empty");
    return bytes;
  } catch {
    throw new SosError(400, "invalid_base64", "Evidence file is not valid base64");
  }
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function getFirebaseKeys(): Promise<Record<string, JsonWebKey>> {
  if (firebaseKeyCache && Date.now() - firebaseKeyCache.fetchedAt < 60 * 60 * 1000) {
    return firebaseKeyCache.keys;
  }

  const response = await fetch(FIREBASE_JWKS_URL);
  if (!response.ok) {
    throw new SosError(503, "auth_unavailable", "Unable to verify the sign-in token");
  }

  const payload = (await response.json()) as { keys?: JsonWebKey[] };
  const keys: Record<string, JsonWebKey> = {};
  for (const key of payload.keys ?? []) {
    if (key.kid) keys[key.kid] = key;
  }

  if (Object.keys(keys).length === 0) {
    throw new SosError(503, "auth_unavailable", "No token verification keys were returned");
  }

  firebaseKeyCache = { fetchedAt: Date.now(), keys };
  return keys;
}

async function verifyFirebaseToken(token: string): Promise<string> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new SosError(401, "unauthorized", "Authentication required");
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  let header: { alg?: string; kid?: string };
  let payload: { aud?: string; iss?: string; exp?: number; sub?: string };

  try {
    header = decodeJson<{ alg?: string; kid?: string }>(headerPart);
    payload = decodeJson<{ aud?: string; iss?: string; exp?: number; sub?: string }>(
      payloadPart,
    );
  } catch {
    throw new SosError(401, "unauthorized", "Authentication required");
  }

  if (header.alg !== "RS256" || !header.kid) {
    throw new SosError(401, "unauthorized", "Authentication required");
  }

  const expectedIssuer = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
  if (payload.aud !== FIREBASE_PROJECT_ID || payload.iss !== expectedIssuer) {
    throw new SosError(401, "unauthorized", "Authentication required");
  }

  if (!payload.exp || payload.exp * 1000 <= Date.now() || !payload.sub) {
    throw new SosError(401, "unauthorized", "Authentication required");
  }

  const keys = await getFirebaseKeys();
  const jwk = keys[header.kid];
  if (!jwk) {
    firebaseKeyCache = null;
    throw new SosError(401, "unauthorized", "Authentication required");
  }

  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      decodeBase64Url(signaturePart),
      new TextEncoder().encode(`${headerPart}.${payloadPart}`),
    );
    if (!valid) throw new Error("invalid signature");
  } catch {
    throw new SosError(401, "unauthorized", "Authentication required");
  }

  return payload.sub;
}

async function resolveActor(
  req: Request,
  admin: ReturnType<typeof supabaseAdmin>,
): Promise<string> {
  const authorization = req.headers.get("Authorization")?.trim() ?? "";
  if (!authorization.startsWith("Bearer ")) {
    throw new SosError(401, "unauthorized", "Authentication required");
  }

  const token = authorization.slice("Bearer ".length).trim();
  if (!token) throw new SosError(401, "unauthorized", "Authentication required");

  // Supabase-issued tokens (OAuth users) resolve through GoTrue.
  try {
    const { data, error } = await admin.auth.getUser(token);
    if (!error && data.user?.id) return data.user.id;
  } catch {
    // Not a Supabase JWT; try Firebase below.
  }

  return verifyFirebaseToken(token);
}

function safeSegment(value: string, fallback: string): string {
  const clean = value.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 90);
  return clean || fallback;
}

type ParsedMedia = {
  name: string;
  contentType: string;
  bytes: Uint8Array;
};

function parseMedia(
  raw: unknown,
  label: string,
  allowedTypes: Set<string>,
  maxBytes: number,
): ParsedMedia {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new SosError(400, `${label}_invalid`, `${label} must be an object`);
  }

  const media = raw as Record<string, unknown>;
  const name = requireString(media, "name", { maxLength: 120 });
  const contentType = requireString(media, "contentType", { maxLength: 80 });
  if (!allowedTypes.has(contentType)) {
    throw new SosError(400, `${label}_type_invalid`, `${label} has an unsupported content type`);
  }

  const base64 = requireString(media, "base64", { maxLength: MAX_BASE64_LENGTH });
  const bytes = decodeBase64(base64);
  if (bytes.length > maxBytes) {
    throw new SosError(413, `${label}_too_large`, `${label} is larger than the allowed size`);
  }

  return { name, contentType, bytes };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse();
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const admin = supabaseAdmin();
    const actorId = await resolveActor(req, admin);
    const body = await readJsonBody(req);

    const sosId = requireString(body, "sosId", { maxLength: 80 });
    const timestamp =
      optionalString(body, "timestamp", { maxLength: 40 }) ?? new Date().toISOString();
    const { latitude, longitude, accuracy } = requireCoordinates(body, {
      allowMissing: true,
    });

    const rawPhotos = body.photos;
    if (rawPhotos != null && !Array.isArray(rawPhotos)) {
      throw new SosError(400, "photos_invalid", "photos must be an array");
    }
    const photoInputs = (rawPhotos ?? []) as unknown[];
    if (photoInputs.length > 4) {
      throw new SosError(400, "too_many_photos", "At most 4 photos are allowed");
    }

    const photos = photoInputs.map((photo, index) =>
      parseMedia(photo, `photo_${index + 1}`, PHOTO_TYPES, MAX_PHOTO_BYTES),
    );

    let video: ParsedMedia | null = null;
    let videoSkipped = false;

    if (body.video != null) {
      // Decode first, then skip oversize video instead of rejecting the whole
      // evidence bundle. Photos and the metadata row still need to be saved.
      const parsed = parseMedia(body.video, "video", VIDEO_TYPES, Number.MAX_SAFE_INTEGER);
      if (parsed.bytes.length > MAX_VIDEO_BYTES) {
        videoSkipped = true;
      } else {
        video = parsed;
      }
    }

    const totalBytes =
      photos.reduce((sum, photo) => sum + photo.bytes.length, 0) +
      (video?.bytes.length ?? 0);
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new SosError(413, "evidence_too_large", "Evidence bundle is too large");
    }

    const safeSosId = safeSegment(sosId, "sos");
    const photoPaths: string[] = [];
    const uploadedPaths: string[] = [];

    try {
      for (let index = 0; index < photos.length; index += 1) {
        const photo = photos[index];
        const filename = safeSegment(
          `${String(index + 1).padStart(2, "0")}-${photo.name}`,
          `photo_${index + 1}.jpg`,
        );
        const path = `${actorId}/${safeSosId}/${filename}`;
        const { error } = await admin.storage
          .from(EVIDENCE_BUCKET)
          .upload(path, toArrayBuffer(photo.bytes), {
            contentType: photo.contentType,
            upsert: false,
          });
        if (error) {
          throw new SosError(502, "storage_upload_failed", "Unable to save SOS photo");
        }
        photoPaths.push(path);
        uploadedPaths.push(path);
      }

      let videoPath: string | null = null;
      if (video) {
        const filename = safeSegment(video.name, "evidence_video.mp4");
        const path = `${actorId}/${safeSosId}/${filename}`;
        const { error } = await admin.storage
          .from(EVIDENCE_BUCKET)
          .upload(path, toArrayBuffer(video.bytes), {
            contentType: video.contentType,
            upsert: false,
          });
        if (error) {
          throw new SosError(502, "storage_upload_failed", "Unable to save SOS video");
        }
        videoPath = path;
        uploadedPaths.push(path);
      }

      const status = photoPaths.length === 0 && !videoPath ? "EMPTY" : "UPLOADED";
      const { data: event, error: insertError } = await admin
        .from("sos_events")
        .insert({
          user_id: actorId,
          sos_id: sosId,
          timestamp,
          latitude,
          longitude,
          accuracy,
          photo_paths: photoPaths,
          video_path: videoPath,
          status,
        })
        .select("id")
        .single();

      if (insertError || !event?.id) {
        throw new SosError(502, "event_insert_failed", "Unable to record the SOS event");
      }

      return jsonResponse({
        success: true,
        eventId: event.id,
        photos: photoPaths,
        video: videoPath,
        videoSkipped: videoSkipped || (video == null && body.video != null),
      });
    } catch (error) {
      // Do not leave orphaned objects if metadata could not be written.
      if (uploadedPaths.length > 0) {
        try {
          await admin.storage.from(EVIDENCE_BUCKET).remove(uploadedPaths);
        } catch {
          // Best-effort cleanup only.
        }
      }
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
});
