import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius } from '@/src/theme/tokens';

export default function InteractiveMap({ style }: { style?: any }) {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.text}>Map preview not available on Web</Text>
      <Text style={styles.subtext}>Please compile for iOS or Android to see Mapbox.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    padding: 16,
  },
  text: {
    color: colors.textPrimary,
    fontWeight: 'bold',
  },
  subtext: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  }
});
