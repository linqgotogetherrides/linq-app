import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import LinqHeader from '@/src/components/LinqHeader';
import PrimaryButton from '@/src/components/PrimaryButton';
import LeafletMap from '@/src/components/LeafletMap';
import { useApp } from '@/src/context/AppContext';
import { useCurrentLocation } from '@/src/hooks/useCurrentLocation';
import { rideService } from '@/src/services/rideService';
import { rideRequestService } from '@/src/services/rideRequestService';
import { Ride } from '@/src/types';
import { fetchOSRMRoute, RouteGeometry } from '@/src/lib/routing/osrm';
import { colors, spacing, font, radius, shadow } from '@/src/theme/tokens';

function getRideCoordinates(place: {
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
}) {
  const latitude = place.lat ?? place.latitude;
  const longitude = place.lng ?? place.longitude;
  if (
    typeof latitude !== 'number' ||
    typeof longitude !== 'number' ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }
  return { latitude, longitude };
}

export default function RideDetails() {
  // The searcher's own route is viewer-relative, so it is not stored on the
  // ride. It arrives as coordinates from the card that was tapped and is turned
  // back into geometry here. OSRM responses are module-cached, so this is
  // instant for a route that was already drawn in the search results.
  const {
    id,
    userPickupLatitude,
    userPickupLongitude,
    userDestinationLatitude,
    userDestinationLongitude,
  } = useLocalSearchParams<{
    id: string;
    userPickupLatitude?: string;
    userPickupLongitude?: string;
    userDestinationLatitude?: string;
    userDestinationLongitude?: string;
  }>();
  const router = useRouter();
  const { user, useRequest: consumeRequest, showToast } = useApp();
  const {
    location: currentLocation,
    isLoading: isLocating,
    requestLocation: requestCurrentLocation,
  } = useCurrentLocation({ autoLoad: true });
  const [ride, setRide] = useState<Ride | null>(null);
  const [requested, setRequested] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [routeGeometry, setRouteGeometry] = useState<RouteGeometry | undefined>();
  const [userRouteGeometry, setUserRouteGeometry] = useState<RouteGeometry | undefined>();
  const [centerOnCurrentLocation, setCenterOnCurrentLocation] = useState(false);
  const initialLocationCenteredRef = useRef(false);

  useEffect(() => {
    if (currentLocation && !initialLocationCenteredRef.current) {
      initialLocationCenteredRef.current = true;
      setCenterOnCurrentLocation(true);
    }
  }, [currentLocation]);

  useEffect(() => {
    if (!centerOnCurrentLocation) return;
    const timer = setTimeout(() => setCenterOnCurrentLocation(false), 500);
    return () => clearTimeout(timer);
  }, [centerOnCurrentLocation, currentLocation]);

  useEffect(() => {
    const pLat = Number(userPickupLatitude);
    const pLng = Number(userPickupLongitude);
    const dLat = Number(userDestinationLatitude);
    const dLng = Number(userDestinationLongitude);
    if (![pLat, pLng, dLat, dLng].every(Number.isFinite)) {
      setUserRouteGeometry(undefined);
      return;
    }
    let cancelled = false;
    (async () => {
      const route = await fetchOSRMRoute(
        { latitude: pLat, longitude: pLng },
        { latitude: dLat, longitude: dLng },
      );
      if (cancelled) return;
      // Only real road geometry is drawn; a straight-line fallback would be
      // misleading next to a genuine route.
      setUserRouteGeometry(route.source === 'road' ? route.geometry : undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [userPickupLatitude, userPickupLongitude, userDestinationLatitude, userDestinationLongitude]);

  useEffect(() => {
    (async () => {
      if (id) {
        const fetched = await rideService.getRideById(id);
        if (fetched) {
          setRide(fetched);
          const pickup = getRideCoordinates(fetched.pickup);
          const destination = getRideCoordinates(fetched.destination);
          if (!pickup || !destination) return;

          try {
            const routeRes = await fetchOSRMRoute(pickup, destination);
            if (routeRes.source === 'road') setRouteGeometry(routeRes.geometry);
          } catch (err) {
            console.warn('Failed to load OSRM geometry:', err);
          }
        }
      }
    })();
  }, [id]);

  if (!ride) {
    return (
      <SafeAreaView style={styles.container} edges={['top']} testID="ride-details-screen">
        <LinqHeader title="Ride Details" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
          <Text style={{ fontSize: font.size.base, color: colors.textSecondary }}>Ride details unavailable or expired.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const pickupCoords = getRideCoordinates(ride.pickup);
  const dropCoords = getRideCoordinates(ride.destination);

  const onRequest = async () => {
    if (!user) {
      router.push('/onboarding');
      return;
    }
    if (requesting) return;
    if (requested) {
      setRequested(false);
      showToast('Request cancelled');
      return;
    }
    const ok = consumeRequest();
    if (!ok) {
      router.push('/pricing');
      return;
    }

    setRequesting(true);
    try {
      await rideRequestService.requestRide(ride.id, user.id);
      setRequested(true);
      showToast('Request sent to ' + ride.creator.name);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The ride request could not be sent.');
    } finally {
      setRequesting(false);
    }
  };

  const handleLocate = async () => {
    const current = await requestCurrentLocation({ showRationale: true });
    if (current) setCenterOnCurrentLocation(true);
  };

  const sharedDistanceKm = ride.sharedDistanceKm;
  const matchExplanation = ride.matchExplanation || 'Route match is not available for this ride.';

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="ride-details-screen">
      <LinqHeader title="Ride Details" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.xl, paddingBottom: 120 }}>
        {/* Rider Profile Card */}
        <View style={styles.profileCard}>
          <Image source={{ uri: ride.creator.avatarUrl }} style={styles.avatar} contentFit="cover" />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.name}>{ride.creator.name}</Text>
              {ride.creator.verification === 'verified' && <Ionicons name="shield-checkmark" size={16} color={colors.success} />}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <Ionicons name="star" size={13} color={colors.yellow} />
              <Text style={styles.meta}> {ride.creator.rating} • {ride.creator.trips} trips</Text>
            </View>
          </View>
          <View style={[styles.typeTag, { backgroundColor: colors.primaryLight }]}>
            <Text style={[styles.typeText, { color: colors.primary }]}>{ride.type.toUpperCase()}</Text>
          </View>
        </View>

        {/* Interactive Leaflet Map Preview */}
        <View style={{ marginTop: spacing.md }}>
          <View style={styles.mapHeader}>
            <Text style={styles.mapHeaderText}>Route map</Text>
            <Pressable
              style={styles.locateButton}
              onPress={handleLocate}
              disabled={isLocating}
              testID="ride-locate-me"
            >
              <Ionicons name="locate" size={16} color={colors.primary} />
              <Text style={styles.locateText}>{isLocating ? 'Locating...' : 'Locate Me'}</Text>
            </Pressable>
          </View>
          {pickupCoords && dropCoords ? (
            <>
              <LeafletMap
                pickup={pickupCoords}
                destination={dropCoords}
                driverRoute={routeGeometry}
                userRoute={userRouteGeometry ?? ride.userRouteGeometry}
                pickupLabel={ride.pickup.label}
                destinationLabel={ride.destination.label}
                currentLocation={currentLocation || undefined}
                centerOnCurrentLocation={centerOnCurrentLocation}
                allowStraightLineFallback={false}
                height={260}
              />
              {userRouteGeometry ?? ride.userRouteGeometry ? (
                <View style={styles.routeLegend} testID="ride-route-legend">
                  <View style={[styles.legendSwatch, { backgroundColor: colors.primary }]} />
                  <Text style={styles.legendText}>Your searched route</Text>
                  <View style={[styles.legendSwatch, { backgroundColor: '#F97316' }]} />
                  <Text style={styles.legendText}>This ride&apos;s route</Text>
                </View>
              ) : null}
            </>
          ) : (
            <View style={styles.mapUnavailable}>
              <Ionicons name="location-outline" size={22} color={colors.textSecondary} />
              <Text style={styles.mapUnavailableText}>
                Map unavailable because this ride has no stored coordinates.
              </Text>
            </View>
          )}
        </View>

        {/* Route Match Badge Card */}
        <View style={styles.matchBanner}>
          <View style={styles.matchBadge}>
            <Ionicons name="sparkles" size={14} color={colors.textInverse} />
            <Text style={styles.matchBadgeText}>
              {ride.matchScore != null ? `${ride.matchScore}% Route Match` : 'Route Match Unavailable'}
            </Text>
          </View>
          <Text style={styles.matchExplanation}>{matchExplanation}</Text>
          {sharedDistanceKm != null && (
            <View style={styles.sharedDistanceTag}>
              <Ionicons name="git-commit" size={14} color={colors.primary} />
              <Text style={styles.sharedDistanceText}>{sharedDistanceKm} km shared corridor</Text>
            </View>
          )}
        </View>

        {/* Route Pickup & Drop Card */}
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

        {/* Key Info Grid */}
        <View style={styles.infoGrid}>
          <InfoBox icon="navigate" label="Distance" value={`${ride.distanceKm ?? 8.4} km`} />
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
                <View style={styles.vehicleIcon}>
                  <Ionicons name={ride.vehicle.kind === 'bike' ? 'bicycle' : 'car-sport'} size={24} color={colors.primary} />
                </View>
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
          <SafetyRow icon="shield-checkmark" text="Identity verified profile" />
          <SafetyRow icon="star" text={`${ride.creator.rating} rating from ${ride.creator.trips} verified trips`} />
          <SafetyRow icon="call" text="Emergency contact available during ride" last />
        </View>
      </ScrollView>

      {/* Sticky Bottom Primary CTA */}
      <View style={styles.footer}>
        <View style={{ flex: 1 }}>
          <PrimaryButton
            testID="request-ride-button"
            title={requesting ? 'Sending Request…' : requested ? 'Cancel Request' : 'Request Ride'}
            variant={requested ? 'secondary' : 'primary'}
            icon={requested ? 'close-circle' : 'flash'}
            loading={requesting}
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
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  mapHeaderText: {
    color: colors.textPrimary,
    fontSize: font.size.base,
    fontWeight: font.weight.medium,
  },
  locateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryLight,
  },
  locateText: {
    color: colors.primary,
    fontSize: font.size.xs,
    fontWeight: font.weight.medium,
  },
  routeLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
  },
  legendSwatch: { width: 14, height: 3, borderRadius: 2 },
  legendText: { fontSize: font.size.xs, color: colors.textSecondary, marginRight: spacing.md },
  mapUnavailable: {
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  mapUnavailableText: {
    color: colors.textSecondary,
    fontSize: font.size.sm,
    textAlign: 'center',
  },
  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.surfaceSecondary },
  name: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium },
  meta: { fontSize: font.size.sm, color: colors.textSecondary },
  typeTag: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 6 },
  typeText: { fontSize: 10, fontWeight: font.weight.medium, letterSpacing: 0.5 },

  matchBanner: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    ...shadow.sm,
  },
  matchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
    marginBottom: spacing.xs,
  },
  matchBadgeText: { color: colors.textInverse, fontSize: font.size.xs, fontWeight: font.weight.bold },
  matchExplanation: { fontSize: font.size.sm, color: colors.textPrimary, fontWeight: font.weight.medium },
  sharedDistanceTag: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
  sharedDistanceText: { fontSize: font.size.xs, color: colors.primary, fontWeight: font.weight.bold },

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
});
