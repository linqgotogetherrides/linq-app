import React, { type RefObject } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, type CameraType } from 'expo-camera';

import WebCamera, { type WebCameraHandle } from '@/src/components/WebCamera';
import { colors, font, radius, spacing } from '@/src/theme/tokens';

type Props = {
  cameraRef: RefObject<CameraView | null>;
  webCameraRef: RefObject<WebCameraHandle | null>;
  facing: CameraType;
  videoMode: boolean;
  cameraVisible: boolean;
  cameraError: string | null;
  progressLabel: string;
  onCameraReady: () => void;
  onCameraError: (message: string) => void;
};

export default function SosCaptureScreen({
  cameraRef,
  webCameraRef,
  facing,
  videoMode,
  cameraVisible,
  cameraError,
  progressLabel,
  onCameraReady,
  onCameraError,
}: Props) {
  return (
    <View style={styles.container} testID="sos-capture-screen">
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.top}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>SOS ACTIVE</Text>
          </View>
          <Text style={styles.title}>Capturing evidence</Text>
          <Text style={styles.progress}>{progressLabel || 'Preparing…'}</Text>
        </View>

        <View style={styles.cameraFrame}>
          {cameraVisible && Platform.OS === 'web' ? (
            <WebCamera
              ref={webCameraRef}
              facing={facing === 'front' ? 'front' : 'back'}
              onReady={onCameraReady}
              onError={onCameraError}
            />
          ) : null}

          {cameraVisible && Platform.OS !== 'web' ? (
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing={facing}
              mode={videoMode ? 'video' : 'picture'}
              onCameraReady={onCameraReady}
              onMountError={(event) => onCameraError(event.message)}
            />
          ) : null}

          {!cameraVisible ? (
            <View style={styles.cameraPlaceholder}>
              <Ionicons name="camera-outline" size={44} color="#FFFFFF" />
              <Text style={styles.placeholderTitle}>Camera unavailable</Text>
              <Text style={styles.placeholderText}>
                Continuing with location, audio and WhatsApp.
              </Text>
            </View>
          ) : null}

          {cameraError ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle" size={15} color="#FFFFFF" />
              <Text style={styles.errorText} numberOfLines={3}>
                {cameraError}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.bottom}>
          <Ionicons name="lock-closed" size={15} color="#FFFFFF" />
          <Text style={styles.bottomText}>
            Keep LinQ open. The app will open WhatsApp when this finishes.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111827',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  top: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingBottom: spacing.md,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(239,68,68,0.18)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
  liveText: {
    color: '#FCA5A5',
    fontSize: font.size.xxs,
    fontWeight: font.weight.bold,
    letterSpacing: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: font.size['2xl'],
    fontWeight: font.weight.bold,
  },
  progress: {
    color: '#D1D5DB',
    fontSize: font.size.base,
    textAlign: 'center',
  },
  cameraFrame: {
    flex: 1,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  cameraPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
    gap: spacing.sm,
  },
  placeholderTitle: {
    color: '#FFFFFF',
    fontSize: font.size.lg,
    fontWeight: font.weight.medium,
  },
  placeholderText: {
    color: '#9CA3AF',
    fontSize: font.size.base,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorBanner: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: 'rgba(239,68,68,0.92)',
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: font.size.sm,
    lineHeight: 17,
  },
  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  bottomText: {
    color: '#D1D5DB',
    fontSize: font.size.sm,
  },
});
