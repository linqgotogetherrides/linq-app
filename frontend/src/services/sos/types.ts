// LinQ SOS domain types.
//
// Capability reporting is a first-class concept here. The app must never imply
// a background capture capability it does not actually have, so every device
// reports what it can really do and the UI renders that truth.

export type SosStatus = 'ACTIVE' | 'RESOLVED' | 'CANCELLED';

export type SosCoordinate = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude?: number | null;
  speed?: number | null;
  heading?: number | null;
};

export type SosEvidenceKind = 'photo' | 'audio';
export type SosEvidenceStatus = 'PENDING' | 'UPLOADED' | 'FAILED' | 'SKIPPED_UNAVAILABLE';
export type SosCaptureMode = 'foreground' | 'foreground_interactive' | 'background_native';

export type SosIncident = {
  id: string;
  reference_code: string;
  user_id: string;
  current_ride_id: string | null;
  status: SosStatus;
  activation_source: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  last_latitude: number | null;
  last_longitude: number | null;
  last_accuracy: number | null;
  last_location_at: string | null;
  last_location_source: string | null;
  location_ping_count: number;
  evidence_capabilities: SosEvidenceCapabilities | Record<string, unknown>;
  evidence_photo_count: number;
  evidence_audio_count: number;
  evidence_last_cycle_at: string | null;
  contacts_total: number;
  contacts_notified: number;
  activated_at: string;
  ended_at: string | null;
  end_reason: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
};

export type SosEmergencyContact = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  is_primary: boolean;
  verified: boolean;
};

export type SosContactAlert = {
  id: string;
  contact_id: string | null;
  contact_name: string;
  contact_phone: string | null;
  contact_email: string | null;
  channel: 'sms' | 'email' | 'app';
  status:
    | 'PENDING_PROVIDER'
    | 'SENT'
    | 'FAILED'
    | 'SKIPPED_NO_PROVIDER'
    | 'SKIPPED_NO_REACH';
  provider: string | null;
  provider_message_id: string | null;
  provider_error: string | null;
  maps_url: string | null;
  attempted_at: string;
  sent_at: string | null;
};

export type SosLocationPing = {
  id: number;
  sos_id: string;
  user_id: string;
  sequence: number;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  source: 'foreground' | 'background' | 'manual';
  recorded_at: string;
};

export type SosEvidence = {
  id: string;
  sos_id: string;
  user_id: string;
  kind: SosEvidenceKind;
  sequence: number;
  storage_path: string;
  captured_at: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  capture_mode: SosCaptureMode;
  byte_size: number | null;
  content_type: string | null;
  status: SosEvidenceStatus;
  error: string | null;
  signed_url?: string | null;
};

export type SosDispatchStatus = {
  configured: boolean;
  provider: string | null;
  reason: string | null;
};

export type SosActivateResult = {
  incident: SosIncident;
  tracking_token: string;
  contacts: SosEmergencyContact[];
  dispatch: { contact_id: string; contact_name: string; channel: string; status: string }[];
  dispatch_status: SosDispatchStatus;
  maps_url: string | null;
  already_active: boolean;
};

// ---------------------------------------------------------------------------
// Capability reporting
// ---------------------------------------------------------------------------

export type SosEvidenceCapabilities = {
  /** Foreground evidence capture is implemented and working. */
  camera: boolean;
  microphone: boolean;
  /** expo-location background task registration + OS permission granted. */
  background_location: boolean;
  /**
   * Always false in the shipped app.
   * Background camera capture is impossible on iOS and requires a custom native
   * foreground service on Android. Set true ONLY when a native module reports a
   * real background capture.
   */
  background_camera: boolean;
  /** Always false in the shipped app. See `background_camera`. */
  background_microphone: boolean;
  notes?: string[];
};

export const SOS_EVIDENCE_CYCLE_MS = 10 * 60 * 1000; // 10 minutes
export const SOS_EVIDENCE_PHOTOS_PER_CYCLE = 3;
export const SOS_EVIDENCE_AUDIO_PER_CYCLE = 1;
export const SOS_EVIDENCE_AUDIO_MS = 20 * 1000;

// ---------------------------------------------------------------------------
// Admin dashboard
// ---------------------------------------------------------------------------

export type SosAdminIncidentRow = {
  id: string;
  reference_code: string;
  status: SosStatus;
  user_id: string;
  user_name: string;
  user_phone: string | null;
  current_ride_id: string | null;
  ride_pickup: string | null;
  ride_dropoff: string | null;
  ride_travel_time: string | null;
  ride_status: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  maps_url: string | null;
  activated_at: string;
  last_location_at: string | null;
  location_ping_count: number;
  contacts_total: number;
  contacts_notified: number;
  evidence_photo_count: number;
  evidence_audio_count: number;
  evidence_capabilities: Record<string, unknown>;
  activation_source: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  ended_at: string | null;
  end_reason: string | null;
};

export type SosAdminDetail = {
  incident: SosIncident & {
    user: {
      id: string;
      name: string;
      phone_number: string | null;
      email: string | null;
      avatar_url: string | null;
      emergency_contact: string | null;
    } | null;
    ride: {
      id: string;
      pickup_address: string;
      dropoff_address: string;
      travel_time: string | null;
      ride_type: string;
      status: string;
    } | null;
    maps_url: string | null;
  };
  locations: SosLocationPing[];
  evidence: SosEvidence[];
  alerts: SosContactAlert[];
  contacts: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    is_primary: boolean;
    verified: boolean;
  }[];
  dispatch_status: SosDispatchStatus;
};
