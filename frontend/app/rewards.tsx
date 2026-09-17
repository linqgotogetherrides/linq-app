import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import LinqHeader from '@/src/components/LinqHeader';
import PrimaryButton from '@/src/components/PrimaryButton';
import { useApp } from '@/src/context/AppContext';
import { mockRewards } from '@/src/mock/data';
import { colors, spacing, font, radius, shadow } from '@/src/theme/tokens';

export default function Rewards() {
  const router = useRouter();
  const { rewardBalance } = useApp();

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="rewards-screen">
      <LinqHeader title="Rewards" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing['3xl'] }}>
        <View style={styles.balanceCard}>
          <Ionicons name="gift" size={28} color={colors.textInverse} />
          <Text style={styles.balanceLabel}>Reward Balance</Text>
          <Text style={styles.balanceValue}>₹{rewardBalance}</Text>
          <Text style={styles.balanceSub}>Use anytime within the app</Text>
        </View>

        <View style={styles.earnRow}>
          <View style={styles.earnCard}>
            <View style={[styles.earnIcon, { backgroundColor: colors.successLight }]}><Ionicons name="share-social" size={20} color={colors.success} /></View>
            <Text style={styles.earnAmount}>₹5</Text>
            <Text style={styles.earnLabel}>Per referral</Text>
          </View>
          <View style={styles.earnCard}>
            <View style={[styles.earnIcon, { backgroundColor: colors.warningLight }]}><Ionicons name="checkmark-done" size={20} color={colors.warning} /></View>
            <Text style={styles.earnAmount}>₹7</Text>
            <Text style={styles.earnLabel}>Ride confirmed</Text>
          </View>
        </View>

        <PrimaryButton title="Refer a Friend & Earn ₹5" icon="share-social" onPress={() => router.push('/referral')} style={{ marginTop: spacing.lg }} />

        <Text style={styles.sectionTitle}>Reward History</Text>
        <View style={styles.card}>
          {mockRewards.map((r, i) => (
            <View key={r.id} style={[styles.row, i < mockRewards.length - 1 && styles.rowBorder]}>
              <View style={[styles.rowIcon, { backgroundColor: r.type === 'referral' ? colors.successLight : colors.warningLight }]}>
                <Ionicons name={r.type === 'referral' ? 'share-social' : 'checkmark-done'} size={18} color={r.type === 'referral' ? colors.success : colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{r.title}</Text>
                <Text style={styles.rowDate}>{r.date}</Text>
              </View>
              <Text style={[styles.rowAmount, { color: colors.success }]}>+₹{r.amount}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  balanceCard: { backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center', ...shadow.md },
  balanceLabel: { fontSize: font.size.sm, color: colors.primaryLight, marginTop: spacing.sm },
  balanceValue: { fontSize: font.size.display, color: colors.textInverse, fontWeight: font.weight.medium, marginTop: 4 },
  balanceSub: { fontSize: font.size.xs, color: colors.primaryLight, marginTop: 2 },
  earnRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  earnCard: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  earnIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  earnAmount: { fontSize: font.size.xl, color: colors.textPrimary, fontWeight: font.weight.medium },
  earnLabel: { fontSize: font.size.xs, color: colors.textTertiary },
  sectionTitle: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium, marginTop: spacing.xl, marginBottom: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  rowDate: { fontSize: font.size.xs, color: colors.textTertiary, marginTop: 2 },
  rowAmount: { fontSize: font.size.base, fontWeight: font.weight.medium },
});
