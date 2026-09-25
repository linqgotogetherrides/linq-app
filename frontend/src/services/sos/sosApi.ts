// Client for the LinQ SOS Edge Functions.
//
// The anon key is a public key, so the security boundary here is NOT the key:
// it is (a) the HMAC tracking token, (b) server-side ownership checks, and
// (c) the service-role key which never leaves the server.
//
// Every call sends the apikey and a matching Authorization bearer, which is the
// same guard the existing Razorpay functions use.

import { supabase } from '@/src/lib/supabase';
import type {
  SosActivateResult,
  SosAdminDetail,
  SosAdminIncidentRow,
  SosContactAlert,
  SosDispatchStatus,
  SosEmergencyContact,
  SosEvidence,
  SosEvidenceCapabilities,
  SosIncident,
  SosLocationPing,
  SosCoordinate,
  SosStatus,
} from './types';

export class SosApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'SosApiError';
    this.code = code;
    this.status = status;
  }
}

function authHeaders(): Record<string, string> {
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, {
    body,
    headers: authHeaders(),
  });

  if (error) {
    const message =
      (error as { message?: string }).message ?? `SOS request to ${fn} failed`;
    throw new SosApiError(message, 'network_error', 0);
  }

  const payload = data as { error?: string; code?: string } & T;
  if (payload && typeof payload === 'object' && 'error' in payload && payload.error) {
    throw new SosApiError(
      payload.error,
      payload.code ?? 'sos_error',
      400,
    );
  }
  return payload as T;
}

export const sosApi = {
  /**
   * Cold-start resume. Returns the caller's most recent incident WITHOUT
   * creating one, so the app can restore (or clear) the SOS banner after a
   * process restart without ever accidentally opening a new emergency.
   */
  async status(userId: string): Promise<{
    incident: SosIncident | null;
    tracking_token: string | null;
    contacts: SosEmergencyContact[];
    dispatch: SosContactAlert[];
    dispatch_status: SosDispatchStatus;
    maps_url: string | null;
    already_active: boolean;
  }> {
    return invoke('sos-activate', { user_id: userId, action: 'status' });
  },

  async activate(input: {
    userId: string;
    coordinate: SosCoordinate;
    currentRideId?: string | null;
    capabilities?: SosEvidenceCapabilities;
    activationSource?: string;
  }): Promise<SosActivateResult> {
    return invoke<SosActivateResult>('sos-activate', {
      user_id: input.userId,
      latitude: input.coordinate.latitude,
      longitude: input.coordinate.longitude,
      accuracy: input.coordinate.accuracy ?? null,
      current_ride_id: input.currentRideId ?? null,
      evidence_capabilities: input.capabilities ?? {},
      activation_source: input.activationSource ?? 'app',
    });
  },

  async pushLocation(input: {
    userId: string;
    sosId: string;
    trackingToken: string;
    coordinate: SosCoordinate;
    source: 'foreground' | 'background' | 'manual';
    recordedAt?: string;
  }): Promise<{ ok: boolean; sequence: number; last_location_at: string }> {
    return invoke('sos-location', {
      user_id: input.userId,
      sos_id: input.sosId,
      tracking_token: input.trackingToken,
      latitude: input.coordinate.latitude,
      longitude: input.coordinate.longitude,
      accuracy: input.coordinate.accuracy ?? null,
      altitude: input.coordinate.altitude ?? null,
      speed: input.coordinate.speed ?? null,
      heading: input.coordinate.heading ?? null,
      source: input.source,
      recorded_at: input.recordedAt ?? new Date().toISOString(),
    });
  },

  async end(input: {
    actorId: string;
    sosId: string;
    status: Extract<SosStatus, 'RESOLVED' | 'CANCELLED'>;
    endReason?: string | null;
  }): Promise<{ ok: boolean; incident: SosIncident; already_ended: boolean }> {
    return invoke('sos-end', {
      actor_id: input.actorId,
      sos_id: input.sosId,
      status: input.status,
      end_reason: input.endReason ?? null,
    });
  },

  async signEvidenceUpload(input: {
    userId: string;
    sosId: string;
    kind: 'photo' | 'audio';
    contentType: string;
    captureMode: 'foreground' | 'foreground_interactive' | 'background_native';
    coordinate?: SosCoordinate | null;
  }): Promise<{
    evidence: SosEvidence;
    storage_path: string;
    signed_upload_url: string;
    token: string;
  }> {
    return invoke('sos-evidence', {
      action: 'sign_upload',
      user_id: input.userId,
      sos_id: input.sosId,
      kind: input.kind,
      content_type: input.contentType,
      capture_mode: input.captureMode,
      captured_at: new Date().toISOString(),
      latitude: input.coordinate?.latitude ?? null,
      longitude: input.coordinate?.longitude ?? null,
      accuracy: input.coordinate?.accuracy ?? null,
    });
  },

  async recordEvidenceResult(input: {
    userId: string;
    sosId: string;
    evidenceId: string;
    outcome: 'UPLOADED' | 'FAILED' | 'SKIPPED_UNAVAILABLE';
    byteSize?: number | null;
    error?: string | null;
  }): Promise<{ ok: boolean }> {
    return invoke('sos-evidence', {
      action: 'record_result',
      user_id: input.userId,
      sos_id: input.sosId,
      evidence_id: input.evidenceId,
      outcome: input.outcome,
      byte_size: input.byteSize ?? null,
      error: input.error ?? null,
    });
  },

  async listEvidence(userId: string, sosId: string): Promise<{ evidence: SosEvidence[] }> {
    return invoke('sos-evidence', { action: 'list', user_id: userId, sos_id: sosId });
  },

  async signEvidenceDownloads(
    userId: string,
    sosId: string,
  ): Promise<{ evidence: SosEvidence[]; expires_in_seconds: number }> {
    return invoke('sos-evidence', { action: 'sign_download', user_id: userId, sos_id: sosId });
  },

  // ---------------------------------------------------------------------
  // Safety operator API
  // ---------------------------------------------------------------------

  async adminIncidents(input: {
    actorId: string;
    status?: SosStatus | 'ALL';
    limit?: number;
  }): Promise<{ incidents: SosAdminIncidentRow[]; total: number }> {
    return invoke('sos-admin', {
      actor_id: input.actorId,
      action: 'incidents',
      status: input.status ?? 'ALL',
      limit: input.limit ?? 50,
    });
  },

  async adminIncidentDetail(actorId: string, sosId: string): Promise<SosAdminDetail> {
    return invoke('sos-admin', { actor_id: actorId, action: 'detail', sos_id: sosId });
  },

  async adminAcknowledge(actorId: string, sosId: string): Promise<{ ok: boolean }> {
    return invoke('sos-admin', { actor_id: actorId, action: 'acknowledge', sos_id: sosId });
  },

  async adminStats(actorId: string): Promise<{
    active: number;
    resolved: number;
    cancelled: number;
    dispatch_status: SosDispatchStatus;
  }> {
    return invoke('sos-admin', { actor_id: actorId, action: 'stats' });
  },
};

export type { SosContactAlert, SosEmergencyContact, SosLocationPing };
