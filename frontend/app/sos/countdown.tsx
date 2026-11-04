import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';

import PrimaryButton from '@/src/components/PrimaryButton';
import SosCaptureScreen from '@/src/components/SosCaptureScreen';
import SosCountdownScreen from '@/src/components/SosCountdownScreen';
import SosStatusScreen from '@/src/components/SosStatusScreen';
import { useApp } from '@/src/context/AppContext';
import { useSosCountdown } from '@/src/hooks/useSosCountdown';
import { useSosEvidence } from '@/src/hooks/useSosEvidence';
import { resolveSosProfile, type SosProfile } from '@/src/services/sos/sosProfile';
import { colors, font, spacing } from '@/src/theme/tokens';

type Phase = 'countdown' | 'capture' | 'status';

export default function SosCountdownRoute() {
  const router = useRouter();
  const { user, showToast } = useApp();
  const evidence = useSosEvidence();

  const [profile, setProfile] = useState<SosProfile | null | undefined>(undefined);
  const [phase, setPhase] = useState<Phase>('countdown');
  const redirectedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    redirectedRef.current = false;

    if (!user) {
      if (!redirectedRef.current) {
        redirectedRef.current = true;
        showToast('Sign in before using SOS.');
        router.replace('/(tabs)/home' as Href);
      }
      return () => {
        cancelled = true;
      };
    }

    if (!user.name?.trim()) {
      if (!redirectedRef.current) {
        redirectedRef.current = true;
        showToast('Add your name before using SOS.');
        router.replace('/personal-info' as Href);
      }
      return () => {
        cancelled = true;
      };
    }

    resolveSosProfile(user)
      .then((resolved) => {
        if (cancelled) return;
        if (!resolved) {
          setProfile(null);
          if (!redirectedRef.current) {
            redirectedRef.current = true;
            showToast('Add an emergency contact with a phone number before using SOS.');
            router.replace('/safety' as Href);
          }
          return;
        }
        setProfile(resolved);
      })
      .catch(() => {
        if (cancelled) return;
        if (!redirectedRef.current) {
          redirectedRef.current = true;
          showToast('Could not load your SOS details. Please check your safety settings.');
          router.replace('/safety' as Href);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user, router, showToast]);

  const handleStart = useCallback(() => {
    if (!profile || phase !== 'countdown' || evidence.running) return;
    setPhase('capture');
    void evidence.start(profile);
  }, [evidence, phase, profile]);

  const countdown = useSosCountdown({
    enabled: profile != null && phase === 'countdown',
    onComplete: handleStart,
  });

  useEffect(() => {
    if (phase === 'capture' && evidence.report) {
      setPhase('status');
    }
  }, [phase, evidence.report]);

  const handleCancel = useCallback(() => {
    countdown.cancel();
    showToast('SOS cancelled. Nothing was captured.');
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/home' as Href);
    }
  }, [countdown, router, showToast]);

  const handleDone = useCallback(() => {
    router.replace('/(tabs)/home' as Href);
  }, [router]);

  if (profile === undefined) {
    return (
      <SafeAreaView style={styles.loading} edges={['top', 'bottom']}>
        <ActivityIndicator size="large" color={colors.error} />
        <Text style={styles.loadingText}>Checking your SOS details…</Text>
      </SafeAreaView>
    );
  }

  if (profile === null) {
    return (
      <SafeAreaView style={styles.loading} edges={['top', 'bottom']}>
        <Ionicons name="shield-outline" size={40} color={colors.error} />
        <Text style={styles.setupTitle}>Emergency contact required</Text>
        <Text style={styles.loadingText}>
          Add an emergency contact with a WhatsApp phone number, then try SOS again.
        </Text>
        <PrimaryButton
          title="Open safety settings"
          onPress={() => router.replace('/safety' as Href)}
        />
      </SafeAreaView>
    );
  }

  if (phase === 'capture') {
    return (
      <SosCaptureScreen
        cameraRef={evidence.cameraRef}
        webCameraRef={evidence.webCameraRef}
        facing={evidence.facing}
        videoMode={evidence.videoMode}
        cameraVisible={evidence.cameraVisible}
        cameraError={evidence.cameraError}
        progressLabel={evidence.progressLabel}
        onCameraReady={evidence.notifyCameraReady}
        onCameraError={evidence.notifyCameraError}
      />
    );
  }

  if (phase === 'status' && evidence.report) {
    return (
      <SosStatusScreen
        report={evidence.report}
        profile={profile}
        onDone={handleDone}
      />
    );
  }

  return (
    <SosCountdownScreen
      seconds={countdown.seconds}
      progress={countdown.progress}
      contactName={profile.contactName}
      onCancel={handleCancel}
      onStartNow={countdown.startNow}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['3xl'],
    gap: spacing.md,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: font.size.base,
    textAlign: 'center',
    lineHeight: 20,
  },
  setupTitle: {
    color: colors.textPrimary,
    fontSize: font.size['2xl'],
    fontWeight: font.weight.bold,
    textAlign: 'center',
  },
});
