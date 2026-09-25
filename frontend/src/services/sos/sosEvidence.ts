// SOS evidence collection.
//
// ============================ READ THIS FIRST ==============================
// The specification asks for 3 photos + 1 audio clip every 10 minutes while an
// SOS is ACTIVE, including while the app is backgrounded. That is NOT possible
// with ordinary Expo/React Native on a real device:
//
//   * iOS forbids camera capture while the app is backgrounded. There is no API
//     and no App Store-legal workaround.
//   * iOS likewise restricts microphone capture outside an active user session.
//   * Android requires a persistent foreground service with its own camera and
//     microphone handling; expo-camera has no background mode.
//
// So this service is split deliberately:
//
//   captureEvidenceCycle()  - runs when the app is FOREGROUND. Photos are taken
//                             through a mounted expo-camera view, audio through
//                             expo-audio, both uploaded to private storage.
//   scheduler               - fires every SOS_EVIDENCE_CYCLE_MS. When the app
//                             is backgrounded it records explicit
//                             SKIPPED_UNAVAILABLE evidence rows with the reason
//                             instead of pretending a capture happened.
//
// True background capture requires the native module specified in
// docs/SOS_EVIDENCE_NATIVE_MODULE.md. Nothing here fakes that.
// ==========================================================================

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { AudioModule, RecordingPresets, setAudioModeAsync } from 'expo-audio';
import type { AudioRecorder } from 'expo-audio';
import * as Location from 'expo-location';
import { Camera } from 'expo-camera';

import { sosApi } from './sosApi';
import type { SosCoordinate, SosEvidence, SosEvidenceCapabilities } from './types';
import {
  SOS_EVIDENCE_AUDIO_MS,
  SOS_EVIDENCE_AUDIO_PER_CYCLE,
  SOS_EVIDENCE_CYCLE_MS,
  SOS_EVIDENCE_PHOTOS_PER_CYCLE,
} from './types';

const AUDIO_CONTENT_TYPE = 'audio/m4a';

// ---------------------------------------------------------------------------
// Capability detection (reported to the server, rendered honestly in the UI)
// ---------------------------------------------------------------------------

export type PhotoTaker = () => Promise<{ uri: string; mimeType: string } | null>;

let photoTaker: PhotoTaker | null = null;
let lastCapabilities: SosEvidenceCapabilities | null = null;

/**
 * The evidence capture screen registers a photo taker backed by a mounted
 * CameraView. While no taker is registered, photo capture is genuinely
 * unavailable and the cycle says so instead of faking it.
 */
export function registerPhotoTaker(taker: PhotoTaker | null): void {
  photoTaker = taker;
}

export function hasPhotoTaker(): boolean {
  return photoTaker !== null;
}

export async function detectEvidenceCapabilities(): Promise<SosEvidenceCapabilities> {
  const notes: string[] = [];

  let camera = true;
  try {
    const permission = await Camera.getCameraPermissionsAsync();
    camera = permission.granted;
    if (!permission.granted) notes.push('Camera permission has not been granted.');
  } catch {
    camera = false;
    notes.push('Camera module is unavailable on this platform.');
  }

  let microphone = false;
  try {
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    microphone = permission.granted;
    if (!permission.granted) notes.push('Microphone permission has not been granted.');
  } catch {
    microphone = false;
    notes.push('Audio module is unavailable on this platform.');
  }

  let backgroundLocation = false;
  try {
    const { granted } = await Location.getBackgroundPermissionsAsync();
    backgroundLocation = granted;
    if (!granted) {
      notes.push(
        Platform.OS === 'ios'
          ? 'Always-on location permission was declined, so live tracking only continues while LinQ is open.'
          : 'Background location permission was declined, so live tracking only continues while LinQ is open.',
      );
    }
  } catch {
    notes.push('Background location permission could not be determined.');
  }

  const capabilities: SosEvidenceCapabilities = {
    camera,
    microphone,
    background_location: backgroundLocation,
    // Hard-coded false. The shipped app has no native background capture module.
    background_camera: false,
    background_microphone: false,
    notes,
  };

  lastCapabilities = capabilities;
  return capabilities;
}

export function getCachedCapabilities(): SosEvidenceCapabilities | null {
  return lastCapabilities;
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

function fileSizeOf(uri: string): number | null {
  try {
    const file = new FileSystem.File(uri);
    return file.size ?? null;
  } catch {
    return null;
  }
}

/**
 * Uploads one evidence file through a short-lived signed URL.
 *
 * The client never holds storage write credentials: it receives a single-file
 * signed URL scoped to one path, uploads once, and the metadata row is closed
 * out server-side.
 */
async function uploadEvidenceFile(input: {
  userId: string;
  sosId: string;
  kind: 'photo' | 'audio';
  fileUri: string;
  contentType: string;
  captureMode: 'foreground' | 'foreground_interactive' | 'background_native';
  coordinate: SosCoordinate | null;
}): Promise<SosEvidence> {
  const signed = await sosApi.signEvidenceUpload({
    userId: input.userId,
    sosId: input.sosId,
    kind: input.kind,
    contentType: input.contentType,
    captureMode: input.captureMode,
    coordinate: input.coordinate,
  });

  const file = new FileSystem.File(input.fileUri);

  let uploaded = false;
  let failure: string | null = null;
  try {
    const response = await fetch(signed.signed_upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': input.contentType },
      body: file,
    });
    uploaded = response.ok;
    if (!response.ok) failure = `Storage responded ${response.status}`;
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }

  const result = await sosApi.recordEvidenceResult({
    userId: input.userId,
    sosId: input.sosId,
    evidenceId: signed.evidence.id,
    outcome: uploaded ? 'UPLOADED' : 'FAILED',
    byteSize: uploaded ? fileSizeOf(input.fileUri) : null,
    error: failure,
  });

  const refreshed = await sosApi.listEvidence(input.userId, input.sosId);
  const match = refreshed.evidence.find((item) => item.id === signed.evidence.id);
  if (!match) throw new Error(result ? 'Evidence metadata missing after upload' : 'Upload failed');
  return match;
}

async function recordUnavailable(
  userId: string,
  sosId: string,
  kind: 'photo' | 'audio',
  captureMode: 'foreground' | 'background_native',
  reason: string,
  coordinate: SosCoordinate | null,
): Promise<void> {
  try {
    const signed = await sosApi.signEvidenceUpload({
      userId,
      sosId,
      kind,
      contentType: kind === 'photo' ? 'image/jpeg' : AUDIO_CONTENT_TYPE,
      captureMode,
      coordinate,
    });
    await sosApi.recordEvidenceResult({
      userId,
      sosId,
      evidenceId: signed.evidence.id,
      outcome: 'SKIPPED_UNAVAILABLE',
      error: reason,
    });
  } catch {
    // The incident may have ended mid-cycle. Nothing further to record.
  }
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

/**
 * Records one short audio segment.
 *
 * Only meaningful while the app is in the foreground: iOS will not let a
 * backgrounded app open the microphone, and expo-audio has no background mode.
 */
export async function recordAudioSegment(durationMs: number = SOS_EVIDENCE_AUDIO_MS): Promise<{
  uri: string | null;
  error: string | null;
}> {
  let recorder: AudioRecorder | null = null;
  try {
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      return { uri: null, error: 'Microphone permission was not granted.' };
    }

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });

    recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
    await recorder.prepareToRecordAsync();
    recorder.record();

    await new Promise((resolve) => setTimeout(resolve, durationMs));
    await recorder.stop();

    const uri = recorder.uri;
    return uri ? { uri, error: null } : { uri: null, error: 'Recorder produced no file.' };
  } catch (error) {
    return { uri: null, error: error instanceof Error ? error.message : String(error) };
  } finally {
    try {
      await setAudioModeAsync({ allowsRecording: false });
    } catch {
      // ignore
    }
  }
}

// ---------------------------------------------------------------------------
// The 10-minute evidence cycle
// ---------------------------------------------------------------------------

export type EvidenceCycleResult = {
  photosUploaded: number;
  photosSkipped: number;
  audioUploaded: number;
  audioSkipped: number;
  reasons: string[];
};

async function currentCoordinate(): Promise<SosCoordinate | null> {
  try {
    const position = await Location.getLastKnownPositionAsync();
    if (!position) return null;
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy ?? null,
      altitude: position.coords.altitude ?? null,
      speed: position.coords.speed ?? null,
      heading: position.coords.heading ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Runs one evidence cycle.
 *
 * `appIsForeground` is passed in by the caller because AppState is a React
 * concern; keeping it out of this module means the service stays testable and
 * usable from a native module later.
 */
export async function runEvidenceCycle(input: {
  userId: string;
  sosId: string;
  appIsForeground: boolean;
}): Promise<EvidenceCycleResult> {
  const result: EvidenceCycleResult = {
    photosUploaded: 0,
    photosSkipped: 0,
    audioUploaded: 0,
    audioSkipped: 0,
    reasons: [],
  };
  const coordinate = await currentCoordinate();

  // --- Photos -------------------------------------------------------------
  for (let index = 0; index < SOS_EVIDENCE_PHOTOS_PER_CYCLE; index += 1) {
    if (!input.appIsForeground) {
      result.photosSkipped += 1;
      if (index === 0) {
        const reason =
          'Background photo capture is not possible on this platform. iOS forbids camera access while backgrounded; Android needs a native foreground service. See docs/SOS_EVIDENCE_NATIVE_MODULE.md.';
        result.reasons.push(reason);
        await recordUnavailable(
          input.userId, input.sosId, 'photo', 'background_native', reason, coordinate,
        );
      }
      continue;
    }

    if (!photoTaker) {
      result.photosSkipped += 1;
      if (index === 0) {
        const reason =
          'No camera view is mounted, so LinQ could not take an automatic evidence photo. Open the SOS evidence screen to capture one.';
        result.reasons.push(reason);
        await recordUnavailable(
          input.userId, input.sosId, 'photo', 'foreground', reason, coordinate,
        );
      }
      continue;
    }

    try {
      const shot = await photoTaker();
      if (!shot) {
        result.photosSkipped += 1;
        continue;
      }
      await uploadEvidenceFile({
        userId: input.userId,
        sosId: input.sosId,
        kind: 'photo',
        fileUri: shot.uri,
        contentType: shot.mimeType || 'image/jpeg',
        captureMode: 'foreground_interactive',
        coordinate,
      });
      result.photosUploaded += 1;
    } catch (error) {
      result.photosSkipped += 1;
      const reason = error instanceof Error ? error.message : String(error);
      result.reasons.push(reason);
      await recordUnavailable(
        input.userId, input.sosId, 'photo', 'foreground', reason, coordinate,
      );
    }
  }

  // --- Audio --------------------------------------------------------------
  for (let index = 0; index < SOS_EVIDENCE_AUDIO_PER_CYCLE; index += 1) {
    if (!input.appIsForeground) {
      result.audioSkipped += 1;
      const reason =
        'Background microphone capture is not possible on this platform. See docs/SOS_EVIDENCE_NATIVE_MODULE.md.';
      result.reasons.push(reason);
      await recordUnavailable(
        input.userId, input.sosId, 'audio', 'background_native', reason, coordinate,
      );
      continue;
    }

    const recording = await recordAudioSegment();
    if (!recording.uri) {
      result.audioSkipped += 1;
      result.reasons.push(recording.error ?? 'Audio recording failed.');
      await recordUnavailable(
        input.userId,
        input.sosId,
        'audio',
        'foreground',
        recording.error ?? 'Audio recording failed.',
        coordinate,
      );
      continue;
    }

    try {
      await uploadEvidenceFile({
        userId: input.userId,
        sosId: input.sosId,
        kind: 'audio',
        fileUri: recording.uri,
        contentType: AUDIO_CONTENT_TYPE,
        captureMode: 'foreground',
        coordinate,
      });
      result.audioUploaded += 1;
    } catch (error) {
      result.audioSkipped += 1;
      const reason = error instanceof Error ? error.message : String(error);
      result.reasons.push(reason);
    }
  }

  return result;
}

/** Uploads a single photo the user just took through the evidence screen. */
export async function captureAndUploadPhoto(input: {
  userId: string;
  sosId: string;
  fileUri: string;
  mimeType?: string;
}): Promise<SosEvidence> {
  const coordinate = await currentCoordinate();
  return uploadEvidenceFile({
    userId: input.userId,
    sosId: input.sosId,
    kind: 'photo',
    fileUri: input.fileUri,
    contentType: input.mimeType || 'image/jpeg',
    captureMode: 'foreground_interactive',
    coordinate,
  });
}

/** Uploads a single audio clip recorded on demand from the evidence screen. */
export async function captureAndUploadAudio(input: {
  userId: string;
  sosId: string;
  durationMs?: number;
}): Promise<SosEvidence | null> {
  const recording = await recordAudioSegment(input.durationMs);
  if (!recording.uri) return null;
  const coordinate = await currentCoordinate();
  return uploadEvidenceFile({
    userId: input.userId,
    sosId: input.sosId,
    kind: 'audio',
    fileUri: recording.uri,
    contentType: AUDIO_CONTENT_TYPE,
    captureMode: 'foreground_interactive',
    coordinate,
  });
}

export { SOS_EVIDENCE_CYCLE_MS };
