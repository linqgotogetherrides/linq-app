import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import LinqHeader from '@/src/components/LinqHeader';
import EmptyState from '@/src/components/EmptyState';
import { mockTransactions } from '@/src/mock/data';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'credit', label: 'Credits' },
  { key: 'debit', label: 'Debits' },
  { key: 'reward', label: 'Rewards' },
];

export default function Transactions() {
  const [tab, setTab] = useState('all');
  const filtered = mockTransactions.filter((t) => tab === 'all' || t.type === tab);

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="transactions-screen">
      <LinqHeader title="Transaction History" />
      <View style={styles.chipRowWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable key={t.key} testID={`tx-tab-${t.key}`} onPress={() => setTab(t.key)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {filtered.length === 0 ? (
        <EmptyState icon="receipt-outline" title="No transactions" subtitle="Your transactions will appear here." />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={styles.txRow}>
              <View style={[styles.txIcon, { backgroundColor: item.type === 'debit' ? colors.errorLight : colors.successLight }]}>
                <Ionicons name={item.type === 'debit' ? 'arrow-up' : item.type === 'reward' ? 'gift' : 'arrow-down'} size={18} color={item.type === 'debit' ? colors.error : colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.txName}>{item.title}</Text>
                {item.subtitle && <Text style={styles.txSub}>{item.subtitle}</Text>}
                <Text style={styles.txDate}>{item.date}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[styles.txAmount, { color: item.amount < 0 ? colors.error : colors.success }]}>{item.amount < 0 ? '-' : '+'}₹{Math.abs(item.amount)}</Text>
                <Text style={styles.txStatus}>{item.status}</Text>
              </View>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  chipRowWrap: { height: 56, justifyContent: 'center' },
  chipRow: { paddingHorizontal: spacing.xl, gap: spacing.sm, alignItems: 'center' },
  chip: { height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  chipText: { fontSize: font.size.sm, color: colors.textSecondary, fontWeight: font.weight.medium },
  chipTextActive: { color: colors.textInverse },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  txIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  txName: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  txSub: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 1 },
  txDate: { fontSize: font.size.xs, color: colors.textTertiary, marginTop: 2 },
  txAmount: { fontSize: font.size.base, fontWeight: font.weight.medium },
  txStatus: { fontSize: font.size.xs, color: colors.textTertiary, marginTop: 2, textTransform: 'capitalize' },
});
