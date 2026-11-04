import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { Camera, type CameraType, type CameraView } from 'expo-camera';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  type AudioRecorder,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';

import type { WebCameraHandle } from '@/src/components/WebCamera';
import { openSosWhatsApp } from '@/src/services/sos/sosAlert';
import type { SosAlertLocation } from '@/src/services/sos/sosMessage';
import type { SosProfile } from '@/src/services/sos/sosProfile';
import { uploadSosEvidence } from '@/src/services/sos/sosUpload';

const MAX_VIDEO_BYTES = 8 * 1024 * 1024;
const LOCATION_TIMEOUT_MS = 8_000;
const CAMERA_READY_TIMEOUT_MS = 12_000;
const UPLOAD_TIMEOUT_MS = 20_000;
const AUDIO_MS = 5_000;

type CameraPermissionState = {
  granted: boolean;
  canAskAgain: boolean;
};

type CapturedPhoto = {
  name: string;
  base64: string;
  contentType: string;
};

type LocationResult = {
  coordinate: SosAlertLocation;
  error: string | null;
};

type CameraWaiter = {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export type SosEvidenceReport = {
  sosId: string;
  timestamp: string;
  localFolder: string | null;
  photos: { captured: number; uploaded: number; detail: string };
  video: { captured: boolean; uploaded: boolean; detail: string };
  audio: { captured: boolean; detail: string };
  location: { captured: boolean; detail: string };
  upload: { ok: boolean; detail: string };
  whatsapp: { opened: boolean; detail: string };
  notes: string[];
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function captureLocation(): Promise<LocationResult> {
  try {
    const permission = await withTimeout(
      Location.requestForegroundPermissionsAsync(),
      LOCATION_TIMEOUT_MS,
      'Location permission',
    );

    if (!permission.granted) {
      return { coordinate: null, error: 'Location permission was not granted.' };
    }

    const result = await withTimeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      }),
      LOCATION_TIMEOUT_MS,
      'Location fix',
    );

    return {
      coordinate: {
        latitude: result.coords.latitude,
        longitude: result.coords.longitude,
        accuracy: result.coords.accuracy,
      },
      error: null,
    };
  } catch (error) {
    return { coordinate: null, error: messageOf(error) };
  }
}

async function createEvidenceFolder(sosId: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const base = FileSystem.documentDirectory;
  if (!base) return null;

  const folder = `${base}GoTogetherSOS/${sosId}/`;
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  return folder;
}

async function fileHasSize(uri: string, maxBytes: number): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return !info.exists || (info.size ?? 0) <= maxBytes;
  } catch {
    return true;
  }
}

/**
 * Runs the reference SOS evidence sequence exactly once:
 *
 *   location request (parallel) -> back photos -> front photos -> video ->
 *   audio -> local location.json -> upload -> WhatsApp.
 *
 * Every step is non-fatal. The only guarantee is that the final report is
 * produced and WhatsApp is attempted, even when permissions are denied or the
 * upload fails.
 */
export function useSosEvidence() {
  const cameraRef = useRef<CameraView>(null);
  const webCameraRef = useRef<WebCameraHandle>(null);
  const cameraReadyRef = useRef(false);
  const cameraErrorRef = useRef<string | null>(null);
  const cameraWaitersRef = useRef<CameraWaiter[]>([]);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<SosEvidenceReport | null>(null);
  const [progressLabel, setProgressLabel] = useState('');
  const [cameraVisible, setCameraVisible] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [permission, setPermission] = useState<CameraPermissionState | null>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [videoMode, setVideoMode] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cameraWaitersRef.current.forEach((waiter) => clearTimeout(waiter.timer));
      cameraWaitersRef.current = [];
    };
  }, []);

  const notifyCameraReady = useCallback(() => {
    cameraReadyRef.current = true;
    cameraErrorRef.current = null;
    setCameraError(null);
    const waiters = cameraWaitersRef.current;
    cameraWaitersRef.current = [];
    waiters.forEach((waiter) => {
      clearTimeout(waiter.timer);
      waiter.resolve();
    });
  }, []);

  const notifyCameraError = useCallback((message: string) => {
    cameraReadyRef.current = false;
    cameraErrorRef.current = message;
    setCameraError(message);
    const waiters = cameraWaitersRef.current;
    cameraWaitersRef.current = [];
    waiters.forEach((waiter) => {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(message));
    });
  }, []);

  const start = useCallback(
    async (profile: SosProfile): Promise<void> => {
      if (runningRef.current) return;

      runningRef.current = true;
      setRunning(true);
      setReport(null);
      cameraErrorRef.current = null;
      setCameraError(null);
      setProgressLabel('Starting SOS…');

      const notes: string[] = [];
      const addNote = (note: string) => {
        notes.push(note);
        console.log('[SOS]', note);
      };

      const sosId = `SOS-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const timestamp = new Date().toISOString();

      let localFolder: string | null = null;
      try {
        localFolder = await createEvidenceFolder(sosId);
        if (localFolder) addNote('Local evidence folder created.');
      } catch (error) {
        addNote(`Local folder failed: ${messageOf(error)}`);
      }

      // Location starts first and runs while the camera opens.
      const locationPromise = captureLocation();

      let cameraAllowed = false;
      if (Platform.OS === 'web') {
        cameraAllowed = true;
        setPermission({ granted: true, canAskAgain: true });
      } else {
        try {
          let current = await Camera.getCameraPermissionsAsync();
          if (!current.granted) {
            current = await Camera.requestCameraPermissionsAsync();
          }
          cameraAllowed = current.granted;
          setPermission({ granted: current.granted, canAskAgain: current.canAskAgain });
          if (!cameraAllowed) {
            addNote('Camera permission denied; photos and video skipped.');
          }
        } catch (error) {
          setPermission({ granted: false, canAskAgain: false });
          addNote(`Camera permission unavailable: ${messageOf(error)}`);
        }
      }

      const waitForCameraReady = (timeout = CAMERA_READY_TIMEOUT_MS): Promise<void> =>
        new Promise<void>((resolve, reject) => {
          if (cameraReadyRef.current) {
            resolve();
            return;
          }

          const existingError = cameraErrorRef.current;
          if (existingError) {
            reject(new Error(existingError));
            return;
          }

          const waiter: CameraWaiter = {
            resolve,
            reject,
            timer: setTimeout(() => {
              cameraWaitersRef.current = cameraWaitersRef.current.filter(
                (item) => item !== waiter,
              );
              reject(new Error('Camera did not become ready in time.'));
            }, timeout),
          };
          cameraWaitersRef.current.push(waiter);
        });

      const resetCameraReady = () => {
        cameraReadyRef.current = false;
        cameraErrorRef.current = null;
        setCameraError(null);
      };

      const capturePhoto = async (filename: string): Promise<CapturedPhoto | null> => {
        try {
          if (Platform.OS === 'web') {
            const base64 = await webCameraRef.current?.takePhoto();
            if (!base64) throw new Error('Browser camera returned no image.');
            return { name: filename, base64, contentType: 'image/jpeg' };
          }

          const camera = cameraRef.current;
          if (!camera) throw new Error('Camera is not mounted.');

          const photo = await camera.takePictureAsync({ quality: 0.7 });
          if (!photo?.uri) throw new Error('Camera returned no photo.');

          const destination = localFolder ? `${localFolder}${filename}` : photo.uri;
          if (localFolder) {
            await FileSystem.copyAsync({ from: photo.uri, to: destination });
          }

          const base64 = await FileSystem.readAsStringAsync(destination, {
            encoding: FileSystem.EncodingType.Base64,
          });
          return { name: filename, base64, contentType: 'image/jpeg' };
        } catch (error) {
          addNote(`Photo ${filename} failed: ${messageOf(error)}`);
          return null;
        }
      };

      const capturePair = async (label: 'back' | 'front'): Promise<void> => {
        for (let index = 1; index <= 2; index += 1) {
          setProgressLabel(
            `Capturing ${label} photo ${index} of 2…`,
          );
          const photo = await capturePhoto(`${label}_0${index}.jpg`);
          if (photo) photos.push(photo);
          await wait(450);
        }
      };

      const photos: CapturedPhoto[] = [];
      let cameraUsable = false;

      if (cameraAllowed) {
        setCameraVisible(true);
        setFacing('back');
        setVideoMode(false);
        resetCameraReady();
        setProgressLabel('Opening back camera…');
        await wait(Platform.OS === 'web' ? 700 : 350);

        try {
          await waitForCameraReady();
          cameraUsable = true;
        } catch (error) {
          addNote(`Back camera warning: ${messageOf(error)}`);
        }

        if (cameraUsable) {
          await capturePair('back');

          resetCameraReady();
          setFacing('front');
          setProgressLabel('Switching to front camera…');
          await wait(Platform.OS === 'web' ? 1_000 : 600);

          try {
            await waitForCameraReady();
          } catch (error) {
            cameraUsable = false;
            addNote(`Front camera warning: ${messageOf(error)}`);
          }

          if (cameraUsable) {
            await capturePair('front');
          }
        }
      }

      let videoCaptured = false;
      let videoUri: string | null = null;
      let videoDetail = !cameraAllowed
        ? 'Camera permission denied.'
        : !cameraUsable
          ? 'Camera was not ready, so video was skipped.'
          : 'Video was not recorded.';

      if (cameraAllowed && cameraUsable && Platform.OS !== 'web') {
        try {
          setProgressLabel('Recording 5 second video…');
          try {
            await Camera.requestMicrophonePermissionsAsync();
          } catch {
            // The separate audio step will ask again; video can still be silent.
          }

          resetCameraReady();
          setVideoMode(true);
          await wait(800);
          await waitForCameraReady(8_000);

          const camera = cameraRef.current;
          if (!camera) throw new Error('Camera is not mounted.');

          const video = await camera.recordAsync({
            maxDuration: 5,
            maxFileSize: 50 * 1024 * 1024,
          });

          setVideoMode(false);
          resetCameraReady();

          if (!video?.uri) throw new Error('Video recording returned no file.');

          const destination = localFolder
            ? `${localFolder}evidence_video.mp4`
            : video.uri;
          if (localFolder) {
            await FileSystem.copyAsync({ from: video.uri, to: destination });
          }

          videoCaptured = true;
          videoUri = destination;
          videoDetail = 'Recorded and saved locally.';
          addNote('Video captured.');
        } catch (error) {
          setVideoMode(false);
          videoDetail = `Video skipped: ${messageOf(error)}`;
          addNote(videoDetail);
        }
      } else if (Platform.OS === 'web') {
        videoDetail = 'Skipped on web; the browser flow captures photos only.';
      }

      let audioCaptured = false;
      let audioDetail = 'Audio was not recorded.';

      if (Platform.OS === 'web') {
        audioDetail = 'Skipped on web; the browser flow captures photos only.';
      } else {
        let recorder: AudioRecorder | null = null;

        try {
          setProgressLabel('Recording 5 second audio clip…');
          const audioPermission = await AudioModule.requestRecordingPermissionsAsync();
          if (!audioPermission.granted) {
            throw new Error('Microphone permission was not granted.');
          }

          await setAudioModeAsync({
            allowsRecording: true,
            playsInSilentMode: true,
          });

          recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
          await recorder.prepareToRecordAsync();
          recorder.record({ forDuration: 5 });
          await wait(AUDIO_MS + 500);
          await recorder.stop();

          if (!recorder.uri) throw new Error('Audio recording returned no file.');

          const destination = localFolder
            ? `${localFolder}evidence_audio.m4a`
            : recorder.uri;
          if (localFolder) {
            await FileSystem.copyAsync({ from: recorder.uri, to: destination });
          }

          audioCaptured = true;
          audioDetail = 'Recorded and saved locally.';
          addNote('Audio captured.');
        } catch (error) {
          audioDetail = `Audio skipped: ${messageOf(error)}`;
          addNote(audioDetail);
        } finally {
          try {
            await recorder?.stop();
          } catch {
            // Already stopped, or never started.
          }
          try {
            await setAudioModeAsync({ allowsRecording: false });
          } catch {
            // Audio mode is best-effort cleanup.
          }
        }
      }

      setProgressLabel('Reading location…');
      const locationResult = await locationPromise;
      const location = locationResult.coordinate;
      if (location) {
        addNote('Location captured.');
      } else {
        addNote(`Location unavailable: ${locationResult.error ?? 'Unknown error'}`);
      }

      if (localFolder) {
        try {
          await FileSystem.writeAsStringAsync(
            `${localFolder}location.json`,
            JSON.stringify(
              {
                sosId,
                timestamp,
                latitude: location?.latitude ?? null,
                longitude: location?.longitude ?? null,
                accuracy: location?.accuracy ?? null,
                error: locationResult.error,
              },
              null,
              2,
            ),
          );
        } catch (error) {
          addNote(`location.json failed: ${messageOf(error)}`);
        }
      }

      let videoBase64: string | null = null;
      if (videoCaptured && videoUri && Platform.OS !== 'web') {
        const smallEnough = await fileHasSize(videoUri, MAX_VIDEO_BYTES);
        if (!smallEnough) {
          videoDetail = 'Recorded but not uploaded because it is over 8 MB.';
          addNote('Video skipped for upload: over 8 MB.');
        } else {
          try {
            videoBase64 = await FileSystem.readAsStringAsync(videoUri, {
              encoding: FileSystem.EncodingType.Base64,
            });
          } catch (error) {
            videoDetail = `Video upload prep failed: ${messageOf(error)}`;
            addNote(videoDetail);
          }
        }
      }

      setProgressLabel('Backing up evidence…');
      let uploadedPhotos = 0;
      let videoUploaded = false;
      let uploadOk = false;
      let uploadDetail = 'No evidence was available to upload.';

      try {
        const result = await withTimeout(
          uploadSosEvidence({
            sosId,
            timestamp,
            latitude: location?.latitude ?? null,
            longitude: location?.longitude ?? null,
            accuracy: location?.accuracy ?? null,
            photos: photos.map((photo) => ({
              name: photo.name,
              base64: photo.base64,
              contentType: photo.contentType,
            })),
            video:
              videoBase64 == null
                ? null
                : {
                    name: 'evidence_video.mp4',
                    base64: videoBase64,
                    contentType: 'video/mp4',
                  },
          }),
          UPLOAD_TIMEOUT_MS,
          'Server backup',
        );

        uploadedPhotos = result.photos.length;
        videoUploaded = Boolean(result.video);
        uploadOk = true;
        uploadDetail = `${uploadedPhotos} photo${
          uploadedPhotos === 1 ? '' : 's'
        } backed up${videoUploaded ? ' with video' : ''}.`;
        if (result.videoSkipped && videoCaptured) {
          uploadDetail += ' Video was too large for the server.';
        }
        addNote('Server backup completed.');
      } catch (error) {
        uploadDetail = `Server backup failed: ${messageOf(error)}`;
        addNote(uploadDetail);
      }

      setProgressLabel('Opening WhatsApp…');
      const whatsapp = await openSosWhatsApp({
        profile,
        location,
        timestamp,
      });
      if (whatsapp.opened) {
        addNote('WhatsApp opened.');
      } else {
        addNote(`WhatsApp failed: ${whatsapp.error ?? 'Unknown error'}`);
      }

      const finalReport: SosEvidenceReport = {
        sosId,
        timestamp,
        localFolder,
        photos: {
          captured: photos.length,
          uploaded: uploadedPhotos,
          detail:
            photos.length > 0
              ? `${photos.length} captured, ${uploadedPhotos} backed up.`
              : cameraAllowed
                ? 'No photos could be captured.'
                : 'Camera permission denied.',
        },
        video: {
          captured: videoCaptured,
          uploaded: videoUploaded,
          detail: videoDetail,
        },
        audio: {
          captured: audioCaptured,
          detail: audioDetail,
        },
        location: {
          captured: Boolean(location),
          detail: location
            ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}${
                location.accuracy != null
                  ? ` (±${Math.round(location.accuracy)} m)`
                  : ''
              }`
            : locationResult.error ?? 'Location unavailable.',
        },
        upload: {
          ok: uploadOk,
          detail: uploadDetail,
        },
        whatsapp: {
          opened: whatsapp.opened,
          detail: whatsapp.opened
            ? `Opened for ${profile.contactName}. Press Send in WhatsApp.`
            : whatsapp.error ?? 'WhatsApp could not be opened.',
        },
        notes,
      };

      if (mountedRef.current) {
        setProgressLabel('');
        setCameraVisible(false);
        setVideoMode(false);
        setReport(finalReport);
        setRunning(false);
      }
      runningRef.current = false;
    },
    [],
  );

  return {
    start,
    running,
    report,
    progressLabel,
    cameraVisible,
    cameraError,
    permission,
    facing,
    videoMode,
    cameraRef,
    webCameraRef,
    notifyCameraReady,
    notifyCameraError,
  };
}
