import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, type CameraType } from 'expo-camera';
import { useRouter } from 'expo-router';

import LinqHeader from '@/src/components/LinqHeader';
import PrimaryButton from '@/src/components/PrimaryButton';
import { useApp } from '@/src/context/AppContext';
import { useSos } from '@/src/context/SosContext';
import {
  captureAndUploadAudio,
  captureAndUploadPhoto,
  registerPhotoTaker,
} from '@/src/services/sos/sosEvidence';
import { sosApi } from '@/src/services/sos/sosApi';
import type { SosEvidence } from '@/src/services/sos/types';
import { colors, font, radius, spacing } from '@/src/theme/tokens';

export default function SosEvidenceScreen() {
  const router = useRouter();
  const { user, showToast } = useApp();
  const { incident, isActive } = useSos();

  const cameraRef = useRef<CameraView>(null);
  const [permission, setPermission] = useState<{ granted: boolean; canAskAgain: boolean } | null>(
    null,
  );
  const [facing, setFacing] = useState<CameraType>('back');
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [evidence, setEvidence] = useState<SosEvidence[]>([]);
  const [log, setLog] = useState<string[]>([]);

  const appendLog = useCallback((message: string) => {
    setLog((previous) => [message, ...previous].slice(0, 6));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { Camera } = await import('expo-camera');
      const current = await Camera.getCameraPermissionsAsync();
      if (cancelled) return;
      setPermission({ granted: current.granted, canAskAgain: current.canAskAgain });
      if (!current.granted) {
        const requested = await Camera.requestCameraPermissionsAsync();
        if (cancelled) return;
        setPermission({ granted: requested.granted, canAskAgain: requested.canAskAgain });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadEvidence = useCallback(async () => {
    if (!user?.id || !incident) return;
    try {
      const result = await sosApi.listEvidence(user.id, incident.id);
      setEvidence(result.evidence);
    } catch {
      // keep the last known list
    }
  }, [incident, user?.id]);

  useEffect(() => {
    void loadEvidence();
  }, [loadEvidence]);

  /**
   * Registers a photo taker with the evidence service while this screen is
   * mounted, so the automatic 10-minute cycle has a real camera to shoot with.
   * Unmounting unregisters it, and the cycle honestly records that no camera
   * was available rather than pretending to capture.
   */
  useEffect(() => {
    registerPhotoTaker(async () => {
      const camera = cameraRef.current;
      if (!camera) return null;
      const photo = await camera.takePictureAsync({ quality: 0.6, skipProcessing: false });
      if (!photo?.uri) return null;
      return { uri: photo.uri, mimeType: 'image/jpeg' };
    });
    return () => registerPhotoTaker(null);
  }, []);

  const takePhoto = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera || !user?.id || !incident) return;
    setBusy(true);
    try {
      const photo = await camera.takePictureAsync({ quality: 0.6 });
      if (!photo?.uri) {
        appendLog('Camera returned no image.');
        return;
      }
      await captureAndUploadPhoto({
        userId: user.id,
        sosId: incident.id,
        fileUri: photo.uri,
        mimeType: 'image/jpeg',
      });
      appendLog('Photo captured and uploaded.');
      await loadEvidence();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendLog(`Photo failed: ${message}`);
      showToast(message);
    } finally {
      setBusy(false);
    }
  }, [appendLog, incident, loadEvidence, showToast, user?.id]);

  const captureBurst = useCallback(async () => {
    if (!user?.id || !incident) return;
    setBusy(true);
    for (let index = 3; index > 0; index -= 1) {
      setCountdown(index);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const camera = cameraRef.current;
      if (!camera) break;
      try {
        const photo = await camera.takePictureAsync({ quality: 0.6 });
        if (photo?.uri) {
          await captureAndUploadPhoto({
            userId: user.id,
            sosId: incident.id,
            fileUri: photo.uri,
            mimeType: 'image/jpeg',
          });
        }
      } catch (error) {
        appendLog(`Burst photo ${4 - index} failed: ${String(error)}`);
      }
    }
    setCountdown(null);
    setBusy(false);
    appendLog('3-photo burst finished.');
    await loadEvidence();
  }, [appendLog, incident, loadEvidence, user?.id]);

  const recordAudio = useCallback(async () => {
    if (!user?.id || !incident) return;
    setBusy(true);
    appendLog('Recording 20s audio segment…');
    try {
      const result = await captureAndUploadAudio({ userId: user.id, sosId: incident.id });
      appendLog(result ? 'Audio captured and uploaded.' : 'Audio capture unavailable.');
      await loadEvidence();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendLog(`Audio failed: ${message}`);
      showToast(message);
    } finally {
      setBusy(false);
    }
  }, [appendLog, incident, loadEvidence, showToast, user?.id]);

  if (!incident || !isActive) {
    return (
      <SafeAreaView style={styles.container} edges={['top']} testID="sos-evidence-screen">
        <LinqHeader title="SOS Evidence" />
        <View style={styles.blocked}>
          <Ionicons name="lock-closed" size={30} color={colors.textTertiary} />
          <Text style={styles.blockedTitle}>No active SOS</Text>
          <Text style={styles.blockedBody}>
            Evidence is only collected while an SOS incident is active.
          </Text>
          <Pressable style={styles.blockedButton} onPress={() => router.back()}>
            <Text style={styles.blockedButtonText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const photos = evidence.filter((item) => item.kind === 'photo');
  const audio = evidence.filter((item) => item.kind === 'audio');

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="sos-evidence-screen">
      <LinqHeader title="SOS Evidence" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.notice} testID="evidence-foreground-notice">
          <Ionicons name="information-circle" size={18} color={colors.warning} />
          <Text style={styles.noticeText}>
            Photos and audio are captured on this screen. iOS and Android block camera
            and microphone access while LinQ is in the background, so automatic
            background evidence is not possible on this OS.
          </Text>
        </View>

        {permission?.granted ? (
          <View style={styles.cameraWrap} testID="evidence-camera">
            <CameraView ref={cameraRef} style={styles.camera} facing={facing} />
            {countdown !== null ? (
              <View style={styles.countdown} testID="evidence-countdown">
                <Text style={styles.countdownText}>{countdown}</Text>
              </View>
            ) : null}
            <Pressable
              style={styles.flipButton}
              onPress={() => setFacing((value) => (value === 'back' ? 'front' : 'back'))}
              testID="evidence-flip-camera"
            >
              <Ionicons name="camera-reverse-outline" size={20} color={colors.textInverse} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.cameraBlocked} testID="evidence-camera-blocked">
            <Ionicons name="camera-outline" size={28} color={colors.textTertiary} />
            <Text style={styles.cameraBlockedTitle}>Camera unavailable</Text>
            <Text style={styles.cameraBlockedBody}>
              {permission
                ? 'Camera permission was declined. Enable it in device settings to capture evidence photos.'
                : 'Checking camera permission…'}
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <PrimaryButton
            title="Take photo"
            icon="camera"
            onPress={() => void takePhoto()}
            loading={busy && countdown === null}
            disabled={busy || !permission?.granted}
            testID="evidence-take-photo"
          />
          <PrimaryButton
            title="Capture 3 photos"
            icon="images"
            variant="secondary"
            onPress={() => void captureBurst()}
            loading={countdown !== null}
            disabled={busy || !permission?.granted}
            testID="evidence-burst"
          />
          <PrimaryButton
            title="Record 20s audio"
            icon="mic"
            variant="secondary"
            onPress={() => void recordAudio()}
            loading={busy && countdown === null}
            disabled={busy}
            testID="evidence-record-audio"
          />
        </View>

        {log.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Activity</Text>
            {log.map((entry, index) => (
              <Text key={`${entry}-${index}`} style={styles.logLine}>
                • {entry}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Collected ({evidence.length})</Text>
          {evidence.length === 0 ? (
            <Text style={styles.emptyText}>
              No evidence captured yet for incident {incident.reference_code}.
            </Text>
          ) : (
            evidence.map((item) => (
              <View key={item.id} style={styles.evidenceRow} testID={`evidence-${item.id}`}>
                <Ionicons
                  name={item.kind === 'photo' ? 'image' : 'musical-notes'}
                  size={16}
                  color={colors.primary}
                />
                <Text style={styles.evidenceSeq}>#{item.sequence}</Text>
                <Text style={styles.evidenceTime}>
                  {new Date(item.captured_at).toLocaleTimeString()}
                </Text>
                <View
                  style={[
                    styles.statusPill,
                    item.status === 'UPLOADED' && styles.statusPillOk,
                    item.status === 'FAILED' && styles.statusPillBad,
                  ]}
                >
                  <Text style={styles.statusPillText}>{item.status}</Text>
                </View>
              </View>
            ))
          )}
        </View>

        <Text style={styles.summary}>
          {photos.length} photo(s) · {audio.length} audio clip(s) · stored privately and
          shared with the LinQ Safety Team via signed, expiring links only.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, paddingBottom: 48, gap: spacing.md },
  notice: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  noticeText: { flex: 1, fontSize: font.size.xs, color: colors.textSecondary, lineHeight: 17 },
  cameraWrap: {
    height: 260,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceInverse,
  },
  camera: { flex: 1 },
  countdown: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  countdownText: {
    fontSize: 56,
    color: colors.textInverse,
    fontWeight: font.weight.bold,
  },
  flipButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBlocked: {
    height: 200,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  cameraBlockedTitle: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  cameraBlockedBody: { fontSize: font.size.xs, color: colors.textSecondary, textAlign: 'center' },
  actions: { gap: spacing.sm },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardTitle: {
    fontSize: font.size.base,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
    marginBottom: spacing.sm,
  },
  logLine: { fontSize: font.size.xs, color: colors.textSecondary, lineHeight: 18 },
  emptyText: { fontSize: font.size.sm, color: colors.textSecondary },
  evidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  evidenceSeq: { fontSize: font.size.xs, color: colors.textPrimary, fontWeight: font.weight.medium },
  evidenceTime: { flex: 1, fontSize: font.size.xs, color: colors.textSecondary },
  statusPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
  },
  statusPillOk: { backgroundColor: colors.successLight },
  statusPillBad: { backgroundColor: colors.errorLight },
  statusPillText: { fontSize: 9, color: colors.textSecondary, fontWeight: font.weight.medium },
  summary: { fontSize: font.size.xs, color: colors.textTertiary, lineHeight: 17 },
  blocked: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  blockedTitle: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium },
  blockedBody: { fontSize: font.size.sm, color: colors.textSecondary, textAlign: 'center' },
  blockedButton: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockedButtonText: { color: colors.textInverse, fontWeight: font.weight.medium },
});
