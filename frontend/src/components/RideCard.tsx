import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import RouteMatchPreview from '@/src/components/RouteMatchPreview';
import { Ride } from '@/src/types';
import { colors, radius, spacing, font, shadow } from '@/src/theme/tokens';

interface Props {
  ride: Ride;
  onRequest?: () => void;
  compact?: boolean;
}

function TagPill({ label, variant = 'default' }: { label: string; variant?: 'default' | 'women' | 'exact' | 'nearby' | 'eco' }) {
  const bg = variant === 'women' ? colors.femaleLight : variant === 'exact' ? colors.primaryLight : variant === 'nearby' ? colors.warningLight : variant === 'eco' ? colors.successLight : colors.surfaceSecondary;
  const fg = variant === 'women' ? colors.female : variant === 'exact' ? colors.primary : variant === 'nearby' ? colors.warning : variant === 'eco' ? colors.success : colors.textSecondary;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export default function RideCard({ ride, onRequest }: Props) {
  const router = useRouter();
  const { user } = useApp();
  
  // The details screen can only draw "your route" if it knows your endpoints.
  // They are the first and last vertices of the searched geometry, which is
  // already attached to the ride by the search scorer.
  const openDetails = () => {
    const coords = ride.userRouteGeometry?.coordinates ?? [];
    const first = coords[0];
    const last = coords[coords.length - 1];
    router.push({
      pathname: '/ride/[id]',
      params: {
        id: ride.id,
        ...(first && last
          ? {
              userPickupLatitude: String(first[1]),
              userPickupLongitude: String(first[0]),
              userDestinationLatitude: String(last[1]),
              userDestinationLongitude: String(last[0]),
            }
          : {}),
      },
    });
  };

  const handleAuthRequiredAction = (action: () => void) => {
    if (!user) {
      router.push('/onboarding');
    } else {
      action();
    }
  };

  const matchScoreVal = ride.matchScore;
  const matchVariant = matchScoreVal != null && matchScoreVal >= 75
    ? 'exact'
    : matchScoreVal != null && matchScoreVal >= 40
      ? 'nearby'
      : 'default';
  // The user asked to stop quoting a match number and show the routes instead,
  // so the wording is qualitative; the numeric score is still available on the
  // details screen where the map explains it.
  const matchLabel =
    matchScoreVal == null
      ? 'ROUTE SHOWN'
      : matchScoreVal >= 75
        ? 'ROUTES ALMOST ALIGNED'
        : matchScoreVal >= 40
          ? 'ROUTES PARTLY OVERLAP'
          : 'DIFFERENT ROUTE';
  const secondaryTag = ride.vehicle?.kind === 'car' ? 'CAR' : ride.vehicle?.kind === 'bike' ? 'BIKE' : !ride.vehicle ? 'WALK / BUS' : 'AUTO';

  return (
    <Pressable
      testID={`ride-card-${ride.id}`}
      onPress={() => handleAuthRequiredAction(openDetails)}
      style={styles.card}
    >
      <View style={styles.headerRow}>
        <Image source={{ uri: ride.creator.avatarUrl }} style={styles.avatar} contentFit="cover" />
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.name}>{ride.creator.name}</Text>
            {ride.creator.verification === 'verified' && (
              <Ionicons name="shield-checkmark" size={14} color={colors.success} style={{ marginRight: 4 }} />
            )}
            <View style={[styles.typeTag, ride.type === 'daily' ? styles.daily : styles.planned]}>
              <Text style={[styles.typeText, { color: ride.type === 'daily' ? colors.warning : colors.info }]}>{ride.type.toUpperCase()}</Text>
            </View>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="star" size={12} color={colors.yellow} />
            <Text style={styles.meta}> {ride.creator.rating} • {ride.creator.gender === 'female' ? 'Female' : 'Male'} • {ride.creator.trips} trips</Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.price}>₹{ride.pricePerSeat.toFixed(0)}</Text>
          <Text style={styles.priceLabel}>PER SEAT</Text>
        </View>
      </View>

      <View style={styles.routeRow}>
        <View style={styles.routeLine}>
          <View style={[styles.dot, { backgroundColor: colors.primary }]} />
          <View style={styles.line} />
          <View style={[styles.dot, { backgroundColor: colors.error, borderRadius: 2 }]} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.routeItem}>
            <Text style={styles.routeText}>{ride.pickup.label}</Text>
            <Text style={styles.timeText}>{ride.time}</Text>
          </View>
          <View style={[styles.routeItem, { marginTop: spacing.sm }]}>
            <Text style={styles.routeText}>{ride.destination.label}</Text>
            <Text style={styles.seats}>{ride.seatsAvailable} seats left</Text>
          </View>
        </View>
      </View>

      {ride.userRouteGeometry && ride.driverRouteGeometry ? (
        <View style={styles.routePreviewWrap}>
          <RouteMatchPreview
            userRoute={ride.userRouteGeometry}
            driverRoute={ride.driverRouteGeometry}
            matchLabel={matchLabel}
          />
          <Pressable
            style={styles.viewRouteBtn}
            testID={`view-route-${ride.id}`}
            onPress={() => handleAuthRequiredAction(openDetails)}
          >
            <Ionicons name="map-outline" size={14} color={colors.primary} />
            <Text style={styles.viewRouteText}>View full route</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.tags}>
          <TagPill label={matchLabel} variant={matchVariant as any} />
        </View>
      )}

      <View style={styles.footerRow}>
        <View style={styles.tags}>
          <TagPill label={secondaryTag} />
          {ride.womenOnly && <TagPill label="WOMEN ONLY" variant="women" />}
        </View>
        <Pressable
          testID={`request-btn-${ride.id}`}
          onPress={() => handleAuthRequiredAction(() => {
            if (onRequest) onRequest();
            else openDetails();
          })}
          style={styles.requestBtn}
        >
          <Text style={styles.requestText}>Request</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, marginRight: spacing.md, backgroundColor: colors.surfaceSecondary },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium, marginRight: 6 },
  typeTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  daily: { backgroundColor: colors.warningLight },
  planned: { backgroundColor: colors.infoLight },
  typeText: { fontSize: 9, fontWeight: font.weight.medium, letterSpacing: 0.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  meta: { fontSize: font.size.sm, color: colors.textSecondary },
  price: { fontSize: font.size.xl, color: colors.primary, fontWeight: font.weight.medium },
  priceLabel: { fontSize: 9, color: colors.textTertiary, letterSpacing: 0.5 },

  routeRow: { flexDirection: 'row', marginTop: spacing.lg, alignItems: 'stretch' },
  routeLine: { alignItems: 'center', marginRight: spacing.md, paddingTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  line: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 4 },
  routeItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  routeText: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium, flex: 1 },
  timeText: { fontSize: font.size.sm, color: colors.textSecondary },
  seats: { fontSize: font.size.sm, color: colors.textSecondary },

  routePreviewWrap: { marginTop: spacing.lg, gap: spacing.sm },
  viewRouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
  },
  viewRouteText: { fontSize: font.size.sm, color: colors.primary, fontWeight: font.weight.medium },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm, flexWrap: 'wrap' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', flex: 1, gap: 6 },
  pill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  pillText: { fontSize: 9, fontWeight: font.weight.bold, letterSpacing: 0.5 },
  requestBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: 8, borderRadius: radius.pill },
  requestText: { color: colors.textInverse, fontSize: font.size.sm, fontWeight: font.weight.medium },
});
