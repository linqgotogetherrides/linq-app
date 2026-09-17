import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import LinqHeader from '@/src/components/LinqHeader';
import PrimaryButton from '@/src/components/PrimaryButton';
import { useApp } from '@/src/context/AppContext';
import { mockRides } from '@/src/mock/data';
import { colors, spacing, font, radius, shadow } from '@/src/theme/tokens';

export default function RideDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, useRequest: consumeRequest, showToast } = useApp();
  const ride = mockRides.find((r) => r.id === id) ?? mockRides[0];
  const [requested, setRequested] = useState(false);

  const onRequest = () => {
    if (!user) {
      router.push('/onboarding');
      return;
    }
    if (requested) { setRequested(false); showToast('Request cancelled'); return; }
    const ok = consumeRequest();
    if (!ok) { router.push('/pricing'); return; }
    setRequested(true);
    showToast('Request sent to ' + ride.creator.name);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="ride-details-screen">
      <LinqHeader title="Ride Details" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }}>
        <View style={styles.profileCard}>
          <Image source={{ uri: ride.creator.avatarUrl }} style={styles.avatar} contentFit="cover" />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.name}>{ride.creator.name}</Text>
              {ride.creator.verification === 'verified' && <Ionicons name="shield-checkmark" size={16} color={colors.success} />}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <Ionicons name="star" size={13} color={colors.yellow} />
              <Text style={styles.meta}>  {ride.creator.rating} • {ride.creator.trips} trips</Text>
            </View>
          </View>
          <View style={[styles.typeTag, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.typeText, { color: colors.primary }]}>{ride.type.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.routeRow}>
            <View style={styles.routeLine}>
              <View style={[styles.dot, { backgroundColor: colors.primary }]} />
              <View style={styles.vline} />
              <View style={[styles.dot, { backgroundColor: colors.error, borderRadius: 2 }]} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.routeItem}>
                <View>
                  <Text style={styles.routeLabel}>Pickup</Text>
                  <Text style={styles.routeVal}>{ride.pickup.address}</Text>
                </View>
                <Text style={styles.time}>{ride.time}</Text>
              </View>
              <View style={styles.hline} />
              <View style={styles.routeItem}>
                <View>
                  <Text style={styles.routeLabel}>Destination</Text>
                  <Text style={styles.routeVal}>{ride.destination.address}</Text>
                </View>
                <Text style={styles.date}>{ride.date}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.infoGrid}>
          <InfoBox icon="navigate" label="Distance" value={`${ride.distanceKm ?? 8} km`} />
          <InfoBox icon="people" label="Seats" value={`${ride.seatsAvailable}/${ride.seatsTotal}`} />
          <InfoBox icon="cash" label="Per seat" value={`₹${ride.pricePerSeat.toFixed(0)}`} color={colors.primary} />
        </View>

        {ride.co2Saved && (
          <View style={styles.co2}>
            <Ionicons name="leaf" size={18} color={colors.success} />
            <Text style={styles.co2Text}>{ride.co2Saved} kg CO₂ saved by sharing this ride</Text>
          </View>
        )}

        {ride.vehicle && (
          <>
            <Text style={styles.sectionTitle}>Vehicle</Text>
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={styles.vehicleIcon}><Ionicons name={ride.vehicle.kind === 'bike' ? 'bicycle' : 'car-sport'} size={24} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.vehicleModel}>{ride.vehicle.model}{ride.vehicle.ac ? ' • AC' : ''}</Text>
                  <Text style={styles.vehiclePlate}>{ride.vehicle.numberPlate}</Text>
                </View>
                <Text style={styles.vehicleSeats}>{ride.vehicle.seats} seats</Text>
              </View>
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Safety</Text>
        <View style={styles.card}>
          <SafetyRow icon="shield-checkmark" text="Identity verified" />
          <SafetyRow icon="star" text={`${ride.creator.rating} rating from ${ride.creator.trips} trips`} />
          <SafetyRow icon="call" text="Emergency contact available during ride" last />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <View style={{ flex: 1 }}>
          <PrimaryButton
            testID="request-ride-button"
            title={requested ? 'Cancel Request' : 'Request Ride'}
            variant={requested ? 'secondary' : 'primary'}
            icon={requested ? 'close-circle' : 'flash'}
            onPress={onRequest}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

function InfoBox({ icon, label, value, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color?: string }) {
  return (
    <View style={styles.infoBox}>
      <Ionicons name={icon} size={18} color={colors.textSecondary} />
      <Text style={[styles.infoValue, color && { color }]}>{value}</Text>
      <Text style={styles.infoLabel}>{label}</Text>
    </View>
  );
}

function SafetyRow({ icon, text, last }: { icon: keyof typeof Ionicons.glyphMap; text: string; last?: boolean }) {
  return (
    <View style={[styles.safetyRow, !last && { borderBottomWidth: 1, borderBottomColor: colors.divider }]}>
      <Ionicons name={icon} size={18} color={colors.success} />
      <Text style={styles.safetyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceSecondary },
  name: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium },
  meta: { fontSize: font.size.sm, color: colors.textSecondary },
  typeTag: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 6 },
  typeText: { fontSize: 10, fontWeight: font.weight.medium, letterSpacing: 0.5 },

  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.md, borderWidth: 1, borderColor: colors.border },
  routeRow: { flexDirection: 'row' },
  routeLine: { alignItems: 'center', marginRight: spacing.md, paddingTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  vline: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 4 },
  routeItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  routeLabel: { fontSize: font.size.xs, color: colors.textTertiary },
  routeVal: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium, marginTop: 2 },
  time: { fontSize: font.size.sm, color: colors.primary, fontWeight: font.weight.medium },
  date: { fontSize: font.size.sm, color: colors.textSecondary },
  hline: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },

  infoGrid: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  infoBox: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border, gap: 4 },
  infoValue: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium },
  infoLabel: { fontSize: font.size.xs, color: colors.textTertiary },

  co2: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.successLight, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  co2Text: { fontSize: font.size.sm, color: colors.success, flex: 1 },

  sectionTitle: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium, marginTop: spacing.xl, marginBottom: 2 },
  vehicleIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  vehicleModel: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  vehiclePlate: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
  vehicleSeats: { fontSize: font.size.sm, color: colors.textSecondary },

  safetyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  safetyText: { fontSize: font.size.base, color: colors.textPrimary },

  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  contactBtn: { width: 52, height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
