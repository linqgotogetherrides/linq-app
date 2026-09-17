import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import LinqHeader from '@/src/components/LinqHeader';
import { useApp } from '@/src/context/AppContext';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

export default function Settings() {
  const router = useRouter();
  const { showToast } = useApp();
  const [push, setPush] = useState(true);
  const [email, setEmail] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [sound, setSound] = useState(true);

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="settings-screen">
      <LinqHeader title="Settings" />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.section}>Notifications</Text>
        <View style={styles.card}>
          <ToggleRow icon="notifications-outline" label="Push notifications" value={push} onChange={setPush} />
          <ToggleRow icon="mail-outline" label="Email updates" value={email} onChange={setEmail} />
          <ToggleRow icon="volume-high-outline" label="Sound & vibration" value={sound} onChange={setSound} last />
        </View>

        <Text style={styles.section}>Preferences</Text>
        <View style={styles.card}>
          <ToggleRow icon="moon-outline" label="Dark mode" value={darkMode} onChange={(v: boolean) => { setDarkMode(v); showToast('Dark mode coming soon'); }} />
          <LinkRow icon="language-outline" label="Language" sub="English" onPress={() => router.push('/language')} last />
        </View>

        <Text style={styles.section}>Account</Text>
        <View style={styles.card}>
          <LinkRow icon="information-circle-outline" label="About LinQ" sub="v1.0.0" onPress={() => showToast('LinQ Rides v1.0.0')} last />
        </View>

        <Pressable style={styles.deleteBtn} testID="delete-account" onPress={() => showToast('Account deletion requested')}>
          <Ionicons name="trash-outline" size={18} color={colors.error} />
          <Text style={styles.deleteText}>Delete Account</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleRow({ icon, label, value, onChange, last }: any) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <View style={styles.iconBox}><Ionicons name={icon} size={20} color={colors.primary} /></View>
      <Text style={styles.label}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: colors.border, true: colors.primary }} />
    </View>
  );
}

function LinkRow({ icon, label, sub, onPress, last }: any) {
  return (
    <Pressable style={[styles.row, !last && styles.rowBorder]} onPress={onPress}>
      <View style={styles.iconBox}><Ionicons name={icon} size={20} color={colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {sub && <Text style={styles.sub}>{sub}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  section: { fontSize: font.size.sm, color: colors.textTertiary, fontWeight: font.weight.medium, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm, marginTop: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, minHeight: 56 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  iconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  sub: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, height: 52, borderRadius: radius.pill, backgroundColor: colors.errorLight, marginTop: spacing.md },
  deleteText: { color: colors.error, fontSize: font.size.base, fontWeight: font.weight.medium },
});
