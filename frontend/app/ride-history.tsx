import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import LinqHeader from '@/src/components/LinqHeader';
import { mockRides } from '@/src/mock/data';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

const history = [
  { ...mockRides[0], date: 'Mon, 12 Aug', status: 'completed' as const, myRating: 5 },
  { ...mockRides[1], date: 'Fri, 09 Aug', status: 'completed' as const, myRating: 4 },
  { ...mockRides[3], date: 'Wed, 07 Aug', status: 'cancelled' as const, myRating: 0 },
];

export default function RideHistory() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="ride-history-screen">
      <LinqHeader title="Ride History" />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {history.map((ride, idx) => (
          <Pressable key={idx} style={styles.card} onPress={() => router.push(`/ride/${ride.id}`)} testID={`history-${idx}`}>
            <View style={styles.top}>
              <Text style={styles.date}>{ride.date}</Text>
              <View style={[styles.statusBadge, { backgroundColor: ride.status === 'completed' ? colors.successLight : colors.errorLight }]}>
                <Text style={[styles.statusText, { color: ride.status === 'completed' ? colors.success : colors.error }]}>{ride.status === 'completed' ? 'Completed' : 'Cancelled'}</Text>
              </View>
            </View>
            <Text style={styles.route}>{ride.pickup.label} → {ride.destination.label}</Text>
            <View style={styles.bottom}>
              <Text style={styles.role}>{ride.creator.name} • {ride.type}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                {ride.myRating > 0 && (
                  <View style={{ flexDirection: 'row', gap: 2 }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Ionicons key={i} name="star" size={12} color={i < ride.myRating ? colors.yellow : colors.border} />
                    ))}
                  </View>
                )}
                <Text style={styles.price}>₹{ride.pricePerSeat.toFixed(0)}</Text>
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  date: { fontSize: font.size.sm, color: colors.textSecondary },
  statusBadge: { paddingHorizontal: spacing.md, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  statusText: { fontSize: font.size.xs, fontWeight: font.weight.medium },
  route: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium, marginTop: spacing.sm },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  role: { fontSize: font.size.sm, color: colors.textSecondary, textTransform: 'capitalize' },
  price: { fontSize: font.size.base, color: colors.primary, fontWeight: font.weight.medium },
});
