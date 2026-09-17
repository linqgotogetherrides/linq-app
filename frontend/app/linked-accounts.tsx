import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import LinqHeader from '@/src/components/LinqHeader';
import { useApp } from '@/src/context/AppContext';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

export default function LinkedAccounts() {
  const { showToast } = useApp();
  const [accounts, setAccounts] = useState<{ key: string; label: string; icon: keyof typeof Ionicons.glyphMap; color: string; connected: boolean; detail?: string }[]>([
    { key: 'google', label: 'Google', icon: 'logo-google', color: '#DB4437', connected: true, detail: 'anjana@gmail.com' },
    { key: 'apple', label: 'Apple', icon: 'logo-apple', color: colors.textPrimary, connected: false },
    { key: 'phone', label: 'Phone', icon: 'call', color: colors.success, connected: true, detail: '+91 98765 43210' },
    { key: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp', color: '#25D366', connected: true, detail: 'Verified' },
    { key: 'facebook', label: 'Facebook', icon: 'logo-facebook', color: '#1877F2', connected: false },
  ]);

  const toggle = (key: string) => {
    setAccounts((prev) => prev.map((a) => (a.key === key ? { ...a, connected: !a.connected, detail: !a.connected ? 'Connected' : undefined } : a)));
    const acc = accounts.find((a) => a.key === key);
    showToast(acc?.connected ? `${acc.label} disconnected` : `${acc?.label} connected`);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="linked-accounts-screen">
      <LinqHeader title="Linked Accounts" />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.section}>Connected accounts</Text>
        <View style={styles.card}>
          {accounts.map((a, i) => (
            <View key={a.key} style={[styles.row, i < accounts.length - 1 && styles.rowBorder]}>
              <View style={[styles.iconBox, { backgroundColor: a.color + '15' }]}><Ionicons name={a.icon} size={20} color={a.color} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{a.label}</Text>
                {a.detail && <Text style={styles.detail}>{a.detail}</Text>}
              </View>
              <Pressable testID={`toggle-${a.key}`} onPress={() => toggle(a.key)} style={[styles.actionBtn, a.connected && styles.actionConnected]}>
                <Text style={[styles.actionText, a.connected && { color: colors.textSecondary }]}>{a.connected ? 'Disconnect' : 'Connect'}</Text>
              </Pressable>
            </View>
          ))}
        </View>

        <Text style={styles.section}>Login history</Text>
        <View style={styles.card}>
          {[
            { device: 'iPhone 15 Pro', time: 'Active now', current: true },
            { device: 'Chrome on MacBook', time: '2 days ago', current: false },
          ].map((d, i) => (
            <View key={i} style={[styles.row, i === 0 && styles.rowBorder]}>
              <View style={[styles.iconBox, { backgroundColor: colors.primaryLight }]}><Ionicons name={i === 0 ? 'phone-portrait' : 'laptop'} size={20} color={colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{d.device}</Text>
                <Text style={styles.detail}>{d.time}</Text>
              </View>
              {d.current && <View style={styles.currentBadge}><Text style={styles.currentText}>This device</Text></View>}
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  section: { fontSize: font.size.sm, color: colors.textTertiary, fontWeight: font.weight.medium, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm, marginTop: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, minHeight: 60 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  iconBox: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  detail: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
  actionBtn: { paddingHorizontal: spacing.md, height: 34, borderRadius: radius.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  actionConnected: { backgroundColor: colors.surfaceSecondary },
  actionText: { fontSize: font.size.sm, color: colors.textInverse, fontWeight: font.weight.medium },
  currentBadge: { backgroundColor: colors.successLight, paddingHorizontal: spacing.md, height: 26, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  currentText: { fontSize: font.size.xs, color: colors.success, fontWeight: font.weight.medium },
});
