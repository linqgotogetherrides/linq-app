import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import LinqHeader from '@/src/components/LinqHeader';
import { useApp } from '@/src/context/AppContext';
import { mockTransactions } from '@/src/mock/data';
import { colors, spacing, font, radius, shadow } from '@/src/theme/tokens';

export default function Wallet() {
  const router = useRouter();
  const { walletBalance, rewardBalance, addToWallet, showToast } = useApp();

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="wallet-screen">
      <LinqHeader title="Wallet" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing['3xl'] }}>
        <View style={styles.balanceCard}>
          <View style={styles.decor} />
          <Text style={styles.balanceLabel}>Total Balance</Text>
          <Text style={styles.balanceValue}>₹{walletBalance.toLocaleString('en-IN')}</Text>
          <View style={styles.balanceActions}>
            <Pressable style={styles.balanceBtn} testID="add-money" onPress={() => { addToWallet(500); showToast('₹500 added to wallet'); }}>
              <Ionicons name="add" size={16} color={colors.primary} /><Text style={styles.balanceBtnText}>Add Money</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.rewardBanner}>
          <View style={styles.rewardIcon}><Ionicons name="gift" size={20} color={colors.success} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rewardLabel}>Reward Money</Text>
            <Text style={styles.rewardValue}>₹{rewardBalance}</Text>
          </View>
        </View>

        <View style={styles.quickRow}>
          <QuickAction icon="pricetag-outline" label="Coupons" onPress={() => showToast('No coupons available')} />
          <QuickAction icon="card-outline" label="Payment Methods" onPress={() => showToast('Add a payment method')} />
          <QuickAction icon="receipt-outline" label="History" onPress={() => router.push('/transactions')} />
        </View>

        <View style={styles.txHeader}>
          <Text style={styles.txTitle}>Recent Transactions</Text>
          <Pressable onPress={() => router.push('/transactions')}><Text style={styles.seeAll}>See all</Text></Pressable>
        </View>

        <View style={styles.txCard}>
          {mockTransactions.slice(0, 4).map((t, i) => (
            <View key={t.id} style={[styles.txRow, i < 3 && styles.txBorder]}>
              <View style={[styles.txIcon, { backgroundColor: t.type === 'debit' ? colors.errorLight : colors.successLight }]}>
                <Ionicons name={t.type === 'debit' ? 'arrow-up' : t.type === 'reward' ? 'gift' : 'arrow-down'} size={16} color={t.type === 'debit' ? colors.error : colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.txName}>{t.title}</Text>
                <Text style={styles.txDate}>{t.date}</Text>
              </View>
              <Text style={[styles.txAmount, { color: t.amount < 0 ? colors.error : colors.success }]}>{t.amount < 0 ? '-' : '+'}₹{Math.abs(t.amount)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.quickAction} onPress={onPress}>
      <View style={styles.quickIcon}><Ionicons name={icon} size={20} color={colors.primary} /></View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  balanceCard: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.xl, overflow: 'hidden', ...shadow.md },
  decor: { position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.1)' },
  balanceLabel: { fontSize: font.size.sm, color: colors.primaryLight },
  balanceValue: { fontSize: font.size.display, color: colors.textInverse, fontWeight: font.weight.medium, marginTop: 4 },
  balanceActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  balanceBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: radius.pill, backgroundColor: colors.surface },
  balanceBtnText: { color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.medium },

  rewardBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.md, borderWidth: 1, borderColor: colors.border },
  rewardIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.successLight, alignItems: 'center', justifyContent: 'center' },
  rewardLabel: { fontSize: font.size.sm, color: colors.textSecondary },
  rewardValue: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium },
  rewardLink: { color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.medium },

  quickRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  quickAction: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border },
  quickIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: font.size.xs, color: colors.textSecondary, textAlign: 'center' },

  txHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xl, marginBottom: spacing.md },
  txTitle: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium },
  seeAll: { fontSize: font.size.sm, color: colors.primary, fontWeight: font.weight.medium },
  txCard: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  txBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  txIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  txName: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  txDate: { fontSize: font.size.xs, color: colors.textTertiary, marginTop: 2 },
  txAmount: { fontSize: font.size.base, fontWeight: font.weight.medium },
});
