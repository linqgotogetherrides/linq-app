import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import LinqHeader from '@/src/components/LinqHeader';
import EmptyState from '@/src/components/EmptyState';
import SegmentedControl from '@/src/components/SegmentedControl';
import { mockRides } from '@/src/mock/data';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

export default function MyRides() {
  const router = useRouter();
  const [tab, setTab] = useState('created');

  const rides = tab === 'created' ? mockRides.slice(0, 2) : tab === 'requested' ? mockRides.slice(2, 4) : [];

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="my-rides-screen">
      <LinqHeader title="My Rides" />
      <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.md }}>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[{ key: 'created', label: 'Created' }, { key: 'requested', label: 'Requested' }, { key: 'past', label: 'Past' }]}
        />
      </View>

      {rides.length === 0 ? (
        <EmptyState icon="car-outline" title="No rides here yet" subtitle="Rides you create or request will show up here." />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {rides.map((ride) => (
            <Pressable key={ride.id} testID={`my-ride-${ride.id}`} style={styles.card} onPress={() => router.push(`/ride/${ride.id}`)}>
              <View style={styles.top}>
                <Image source={{ uri: ride.creator.avatarUrl }} style={styles.avatar} contentFit="cover" />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={styles.name}>{tab === 'created' ? 'You' : ride.creator.name}</Text>
                  <Text style={styles.role}>{tab === 'created' ? 'Driver' : 'Passenger'} • {ride.date}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: colors.successLight }]}>
                  <Text style={[styles.statusText, { color: colors.success }]}>Active</Text>
                </View>
              </View>
              <View style={styles.route}>
                <View style={styles.routeLine}>
                  <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                  <View style={styles.vline} />
                  <View style={[styles.dot, { backgroundColor: colors.error, borderRadius: 2 }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.loc}>{ride.pickup.label}</Text>
                  <View style={{ height: spacing.md }} />
                  <Text style={styles.loc}>{ride.destination.label}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.time}>{ride.time}</Text>
                  <Text style={styles.price}>₹{ride.pricePerSeat.toFixed(0)}/seat</Text>
                </View>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  top: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceSecondary },
  name: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  role: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
  statusBadge: { paddingHorizontal: spacing.md, height: 26, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  statusText: { fontSize: font.size.xs, fontWeight: font.weight.medium },
  route: { flexDirection: 'row' },
  routeLine: { alignItems: 'center', marginRight: spacing.md, paddingTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  vline: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 4 },
  loc: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  time: { fontSize: font.size.sm, color: colors.primary, fontWeight: font.weight.medium },
  price: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 'auto' },
});
