import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';

import { colors } from '@/src/theme/tokens';

/**
 * Legacy SOS entry point.
 *
 * Old links and native shortcuts still open `/sos/confirm`. The confirmation
 * step was replaced by the 25 second countdown, so forward here instead of
 * keeping a second, divergent activation path alive.
 */
export default function LegacySosConfirmRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/sos/countdown' as Href);
  }, [router]);

  return (
    <View style={styles.container} testID="sos-legacy-redirect">
      <ActivityIndicator color={colors.error} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
});
