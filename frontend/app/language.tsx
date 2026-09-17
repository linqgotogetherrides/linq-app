import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import LinqHeader from '@/src/components/LinqHeader';
import { useApp } from '@/src/context/AppContext';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

const LANGUAGES = [
  { key: 'en', label: 'English', native: 'English' },
  { key: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { key: 'te', label: 'Telugu', native: 'తెలుగు' },
  { key: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { key: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { key: 'mr', label: 'Marathi', native: 'मराठी' },
];

export default function Language() {
  const { showToast } = useApp();
  const [selected, setSelected] = useState('en');

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="language-screen">
      <LinqHeader title="Language" />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          {LANGUAGES.map((l, i) => (
            <Pressable
              key={l.key}
              testID={`lang-${l.key}`}
              style={[styles.row, i < LANGUAGES.length - 1 && styles.rowBorder]}
              onPress={() => { setSelected(l.key); showToast(`Language set to ${l.label}`); }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{l.label}</Text>
                <Text style={styles.native}>{l.native}</Text>
              </View>
              {selected === l.key && <Ionicons name="checkmark-circle" size={22} color={colors.primary} />}
            </Pressable>
          ))}
        </View>
        <Text style={styles.note}>More languages coming soon as part of Mission1000.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.lg, minHeight: 60 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  label: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  native: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
  note: { fontSize: font.size.sm, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.lg },
});
