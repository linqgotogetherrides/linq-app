import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import GuestPrompt from '@/src/components/GuestPrompt';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCurrentLocation } from '@/src/hooks/useCurrentLocation';
import { LocationCoordinates } from '@/src/services/locationService';
import { useApp } from '@/src/context/AppContext';
import SegmentedControl from '@/src/components/SegmentedControl';
import RideCard from '@/src/components/RideCard';
import TimePickerModal from '@/src/components/TimePickerModal';
import DatePickerModal from '@/src/components/DatePickerModal';
import EmptyState from '@/src/components/EmptyState';
import SosHoldButton from '@/src/components/SosHoldButton';
import SosActiveBanner from '@/src/components/sos/SosActiveBanner';
import { useSos } from '@/src/context/SosContext';
import { rideService } from '@/src/services/rideService';
import SavePlaceSheet from '@/src/components/SavePlaceSheet';
import { DUPLICATE_LOCATION_MESSAGE, isSameLocation } from '@/src/lib/location/duplicateGuard';
import { isScheduleInPast } from '@/src/lib/rideSchedule';
import { Ride, RideType, SavedLocation } from '@/src/types';
import { colors, spacing, font, radius, shadow } from '@/src/theme/tokens';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_PRESETS = [
  { label: 'Mon - Sat', days: [0, 1, 2, 3, 4, 5] },
  { label: 'Mon - Fri', days: [0, 1, 2, 3, 4] },
  { label: 'All days', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'Weekends', days: [5, 6] },
];

export default function Home() {
  const router = useRouter();
  const { user, access, showToast, pendingRideRequestCount, locationFlowResult, clearLocationFlowResult } = useApp();
  const { isActive: sosIsActive } = useSos();
  const {
    location: currentLocation,
    isLoading: isLocating,
    requestLocation: requestCurrentLocation,
  } = useCurrentLocation({ autoLoad: true });
  const [mode, setMode] = useState<RideType>('daily');
  // Single source of truth for both ride ends. Changing one never disturbs the
  // other, and the selector updates exactly one of these per selection.
  const [pickupLocation, setPickupLocation] = useState<SavedLocation | null>(
    user?.savedLocations?.defaultPickup ?? null
  );
  const [dropLocation, setDropLocation] = useState<SavedLocation | null>(
    user?.savedLocations?.defaultDrop ?? null
  );
  const [pendingSave, setPendingSave] = useState<SavedLocation | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const pickup = pickupLocation?.address || '';
  const destination = dropLocation?.address || '';
  // Memoised so the nearby-rides effect does not re-fire on every render.
  const pickupCoordinates = useMemo<LocationCoordinates | null>(
    () =>
      pickupLocation
        ? { latitude: pickupLocation.latitude, longitude: pickupLocation.longitude }
        : null,
    [pickupLocation]
  );
  const destinationCoordinates = useMemo<LocationCoordinates | null>(
    () =>
      dropLocation
        ? { latitude: dropLocation.latitude, longitude: dropLocation.longitude }
        : null,
    [dropLocation]
  );

  // Route distances are not shown here; they are derived when a ride is
  // posted, so home does not spend a routing request on every edit.
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5]);
  const [presetIdx, setPresetIdx] = useState(0);
  const [travelTime, setTravelTime] = useState('');
  const [returnTime, setReturnTime] = useState('');
  const [travelDate, setTravelDate] = useState('');
  const [nearbyRides, setNearbyRides] = useState<Ride[]>([]);
  const nearbyRequestIdRef = React.useRef(0);

  React.useEffect(() => {
    if (!locationFlowResult || locationFlowResult.source !== 'home') return;
    // Exactly one field changes per selection.
    if (locationFlowResult.field === 'pickup') {
      setPickupLocation(locationFlowResult.location);
    } else {
      setDropLocation(locationFlowResult.location);
    }
    if (locationFlowResult.isNewPlace) setPendingSave(locationFlowResult.location);
    clearLocationFlowResult();
  }, [clearLocationFlowResult, locationFlowResult]);

  React.useEffect(() => {
    const requestId = ++nearbyRequestIdRef.current;
    (async () => {
      const origin = pickupCoordinates || (currentLocation
        ? {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            accuracy: currentLocation.accuracy,
            timestamp: currentLocation.timestamp,
          }
        : undefined);
      const data = await rideService.getRides({
        type: mode,
        pickupCoordinates: origin,
        radiusMeters: 25_000,
        excludeUserId: user?.id,
      });
      if (requestId === nearbyRequestIdRef.current) setNearbyRides(data);
    })();
  }, [currentLocation, mode, pickupCoordinates, user?.id]);

  // Modals
  const [timePicker, setTimePicker] = useState<null | 'travel' | 'return'>(null);
  const [datePicker, setDatePicker] = useState(false);

  const openLocationSelector = (field: 'pickup' | 'drop') => {
    // The selector is told the opposite end so it can reject duplicates and
    // hide that place from its quick selects.
    const opponent = field === 'pickup' ? dropLocation : pickupLocation;
    router.push({
      pathname: '/ride-location-flow',
      params: {
        source: 'home',
        field,
        ...(opponent
          ? {
              opponentAddress: opponent.address,
              opponentLatitude: opponent.latitude.toString(),
              opponentLongitude: opponent.longitude.toString(),
            }
          : {}),
      },
    });
  };

  const toggleDay = (i: number) => {
    setPresetIdx(-1);
    setSelectedDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]));
  };

  /**
   * Explains what is still missing, but only when the rider actually tries to
   * continue. A planned ride whose date or time has already passed is reported
   * separately, since re-picking the date is the actual fix.
   */
  const describeValidation = (): string | null => {
    if (!pickup.trim() || !destination.trim()) return 'Add pickup & drop to continue';
    if (!pickupCoordinates || !destinationCoordinates) {
      return 'Choose a location from the map or search';
    }
    if (mode === 'planned') {
      if (!travelDate || !travelTime) return 'Select travel date & time';
      if (isScheduleInPast(travelDate, travelTime)) {
        return 'Choose a travel date and time that have not passed yet';
      }
      return null;
    }
    if (selectedDays.length === 0) return 'Pick at least one day';
    if (!travelTime) return 'Select travel time';
    return null;
  };

  // Any correction clears the message.
  React.useEffect(() => {
    setValidationError(null);
  }, [mode, selectedDays, travelDate, travelTime, pickupLocation, dropLocation]);

  const search = () => {
    const problem = describeValidation();
    if (problem) {
      setValidationError(problem);
      return;
    }
    setValidationError(null);
    router.push({
      pathname: '/search-results',
      params: {
        pickup,
        destination,
        type: mode,
        pickupLatitude: pickupCoordinates?.latitude.toString(),
        pickupLongitude: pickupCoordinates?.longitude.toString(),
        pickupAccuracy: pickupCoordinates?.accuracy?.toString(),
        pickupTimestamp: pickupCoordinates?.timestamp?.toString(),
        destinationLatitude: destinationCoordinates?.latitude.toString(),
        destinationLongitude: destinationCoordinates?.longitude.toString(),
        destinationAccuracy: destinationCoordinates?.accuracy?.toString(),
        destinationTimestamp: destinationCoordinates?.timestamp?.toString(),
        travelTime,
      },
    });
  };

  const handlePost = () => {
    if (!pickupLocation) {
      openLocationSelector('pickup');
      return;
    }
    if (!dropLocation) {
      openLocationSelector('drop');
      return;
    }
    // Schedule problems are reported in place rather than silently navigating.
    const problem = describeValidation();
    if (problem) {
      setValidationError(problem);
      return;
    }
    setValidationError(null);
    if (!pickupLocation || !dropLocation || !pickupCoordinates || !destinationCoordinates) {
      return;
    }
    router.push({
      pathname: '/create-ride',
      params: {
        pickup,
        destination,
        rideType: mode,
        travelTime,
        returnTime,
        travelDate,
        pickupLatitude: pickupCoordinates.latitude.toString(),
        pickupLongitude: pickupCoordinates.longitude.toString(),
        destinationLatitude: destinationCoordinates.latitude.toString(),
        destinationLongitude: destinationCoordinates.longitude.toString(),
      },
    });
  };

  const handleTrackLive = async () => {
    if (isLocating) return;
    showToast('Getting your precise location...');
    const current = await requestCurrentLocation();

    if (!current) {
      showToast('A precise location could not be confirmed. Please try outdoors with Precise Location enabled.');
      return;
    }

    const location: SavedLocation = {
      label: current.label,
      address: current.address || current.label,
      latitude: current.latitude,
      longitude: current.longitude,
    };

    // Never silently overwrite a valid pickup that is a different place.
    if (isSameLocation(location, dropLocation)) {
      showToast(DUPLICATE_LOCATION_MESSAGE);
      return;
    }

    setPickupLocation(location);
    setPendingSave(location);
  };

  // Home is the entry point for searching, finding a ride twin and reaching the
  // referral game, so it must never render those to a rider with no account.
  // AuthGate and the tab layout already redirect; this is the local guard.
  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']} testID="home-guest">
        <GuestPrompt
          icon="car-sport-outline"
          title="Sign up to find a ride"
          subtitle="Create a free account to post a ride, search for a ride twin on your route, and chat once someone accepts."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="home-screen">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Top Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Good morning, {user?.name || 'Guest'} 👋</Text>
            <Pressable style={styles.locationRow} testID="location-selector" onPress={() => openLocationSelector('pickup')}>
              <Ionicons name="location" size={14} color={colors.primary} />
              <Text style={styles.location} numberOfLines={1}>{pickup || 'Choose pickup location'}</Text>
              <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* SOS Safety Button - original pill styling, press-and-hold to fire. */}
          {!sosIsActive ? (
            <SosHoldButton
              onComplete={() => router.push('/sos/confirm')}
              disabled={!user}
              testID="sos-button"
            />
          ) : null}

          <Pressable style={styles.referBtn} testID="refer-button" onPress={() => router.push('/referral')}>
            <Ionicons name="gift" size={14} color={colors.primary} />
            <Text style={styles.referText}>Refer</Text>
          </Pressable>

          <Pressable style={styles.iconBtn} testID="notifications-button" onPress={() => router.push('/notifications')}>
            <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
            {pendingRideRequestCount > 0 ? (
              <View style={styles.badge} testID="notifications-badge">
                <Text style={styles.badgeText}>
                  {pendingRideRequestCount > 9 ? '9+' : pendingRideRequestCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {/* Persistent SOS state while an incident is active. */}
        <SosActiveBanner />

        {/* Banner Hero */}
        <View style={[styles.hero, { padding: 0, backgroundColor: 'transparent', height: 120, overflow: 'hidden' }]}>
          <Image
            source={
              mode === 'daily'
                ? require('@/assets/images/daily.png')
                : require('@/assets/images/planned.png')
            }
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        </View>

        {/* Mode Selector (Daily / Planned only - Instant removed) */}
        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.lg }}>
          <SegmentedControl
            testID="ride-mode-segment"
            value={mode}
            onChange={(k) => setMode(k as RideType)}
            options={[
              { key: 'daily', label: 'Daily Commute', icon: 'repeat' },
              { key: 'planned', label: 'Planned Ride', icon: 'calendar' },
            ]}
          />
        </View>

        {/* Search Card */}
        <View style={styles.searchCard}>
          <View style={styles.routeRow}>
            <View style={styles.routeLine}>
              <View style={[styles.dot, { backgroundColor: colors.primary }]} />
              <View style={styles.vline} />
              <View style={[styles.dot, { backgroundColor: colors.error, borderRadius: 2 }]} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.locField}>
                <Pressable style={{ flex: 1 }} testID="pickup-field" onPress={() => openLocationSelector('pickup')}>
                  <Text style={styles.fieldLabel}>PICKUP LOCATION</Text>
                  <Text
                    style={[styles.fieldVal, !pickup && { color: colors.textTertiary }]}
                    numberOfLines={1}
                    accessibilityLabel={pickup ? `Pickup location: ${pickup}` : 'Pickup location not set'}
                  >
                    {pickup || 'Choose pickup'}
                  </Text>
                </Pressable>
                <Pressable style={styles.trackLive} testID="track-live" onPress={handleTrackLive} disabled={isLocating}>
                  <Ionicons name="navigate" size={12} color={colors.primary} />
                  <Text style={styles.trackText}>{isLocating ? 'Locating...' : 'Track Live'}</Text>
                </Pressable>
              </View>
              <View style={styles.divider} />
              <Pressable
                style={styles.locField}
                testID="destination-field"
                onPress={() => openLocationSelector('drop')}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>DROP LOCATION</Text>
                  <Text
                    style={[styles.fieldVal, !destination && { color: colors.textTertiary }]}
                    numberOfLines={1}
                    accessibilityLabel={destination ? `Drop location: ${destination}` : 'Drop location not set'}
                  >
                    {destination || 'Where are you going?'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </Pressable>
            </View>
          </View>

          {mode === 'daily' && (
            <View style={{ marginTop: spacing.lg }}>
              <View style={styles.rowBetween}>
                <Text style={styles.smallLabel}>Travel Days</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, marginBottom: spacing.sm }}>
                {DAY_PRESETS.map((preset, idx) => {
                  const isActive = presetIdx === idx;
                  return (
                    <Pressable
                      key={preset.label}
                      style={[styles.presetChip, isActive && styles.presetChipActive]}
                      onPress={() => {
                        setPresetIdx(idx);
                        setSelectedDays(preset.days);
                      }}
                    >
                      <Text style={[styles.presetChipText, isActive && styles.presetChipTextActive]}>{preset.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <View style={styles.daysRow}>
                {DAYS.map((d, i) => (
                  <Pressable key={i} testID={`day-${i}`} onPress={() => toggleDay(i)} style={[styles.dayChip, selectedDays.includes(i) && styles.dayChipActive]}>
                    <Text style={[styles.dayText, selectedDays.includes(i) && styles.dayTextActive]}>{d}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.timeGrid}>
                <Pressable style={styles.timeBox} testID="daily-travel-time" onPress={() => setTimePicker('travel')}>
                  <Text style={styles.smallLabel}>Travel Time</Text>
                  <View style={styles.timeSelect}><Text style={styles.timeSelectText}>{travelTime}</Text><Ionicons name="time-outline" size={14} color={colors.textSecondary} /></View>
                </Pressable>
                <Pressable style={styles.timeBox} testID="daily-return-time" onPress={() => setTimePicker('return')}>
                  <Text style={styles.smallLabel}>Return Time</Text>
                  <View style={styles.timeSelect}><Text style={styles.timeSelectText}>{returnTime}</Text><Ionicons name="time-outline" size={14} color={colors.textSecondary} /></View>
                </Pressable>
              </View>
            </View>
          )}

          {mode === 'planned' && (
            <View style={styles.timeGrid}>
              <Pressable style={styles.timeBox} testID="planned-date" onPress={() => setDatePicker(true)}>
                <Text style={styles.smallLabel}>Travel Date</Text>
                <View style={styles.timeSelect}><Text style={[styles.timeSelectText, !travelDate && { color: colors.textTertiary }]}>{travelDate || 'Select date'}</Text><Ionicons name="calendar-outline" size={14} color={colors.textSecondary} /></View>
              </Pressable>
              <Pressable style={styles.timeBox} testID="planned-time" onPress={() => setTimePicker('travel')}>
                <Text style={styles.smallLabel}>Travel Time</Text>
                <View style={styles.timeSelect}><Text style={styles.timeSelectText}>{travelTime}</Text><Ionicons name="time-outline" size={14} color={colors.textSecondary} /></View>
              </Pressable>
            </View>
          )}

          {/* Validation appears only after an attempted action, never as a
              standing instruction. */}
          {validationError && (
            <View style={styles.validationRow} testID="home-validation-error">
              <Ionicons name="alert-circle" size={15} color={colors.error} />
              <Text style={styles.validationText}>{validationError}</Text>
            </View>
          )}

          <View style={styles.searchActions}>
            <Pressable
              testID="find-ride-twin-button"
              style={styles.findBtn}
              onPress={search}
            >
              <Ionicons name="search" size={16} color={colors.textInverse} />
              <Text style={styles.findText}>Find my Ride Twin</Text>
            </Pressable>
            <Pressable
              testID="post-ride-button"
              style={styles.postBtn}
              onPress={handlePost}
            >
              <Text style={styles.postText}>Post</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.primary} />
            </Pressable>
          </View>
        </View>

        {/* Free Request Counter */}
        <View style={styles.limitBanner}>
          <Ionicons name="flash" size={16} color={colors.primary} />
          <Text style={styles.limitText}>
            {access.freeRequestsRemaining} requests · {access.freeChatsRemaining} chats remaining
          </Text>
          <Pressable onPress={() => router.push('/pricing')} testID="upgrade-mini">
            <Text style={styles.limitUpgrade}>Upgrade</Text>
          </Pressable>
        </View>

        {/* Nearby Rides List */}
        <View style={styles.ridesHeader}>
          <Text style={styles.ridesTitle}>{currentLocation ? 'Rides near you' : 'Available rides'}</Text>
          <Pressable
            onPress={() => router.push({
              pathname: '/search-results',
              params: {
                pickup,
                destination,
                pickupLatitude: pickupCoordinates?.latitude.toString(),
                pickupLongitude: pickupCoordinates?.longitude.toString(),
                pickupAccuracy: pickupCoordinates?.accuracy?.toString(),
                pickupTimestamp: pickupCoordinates?.timestamp?.toString(),
                destinationLatitude: destinationCoordinates?.latitude.toString(),
                destinationLongitude: destinationCoordinates?.longitude.toString(),
                destinationAccuracy: destinationCoordinates?.accuracy?.toString(),
                destinationTimestamp: destinationCoordinates?.timestamp?.toString(),
              },
            })}
          >
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        </View>
        <View style={{ paddingHorizontal: spacing.xl }}>
          {nearbyRides.length === 0 ? (
            <EmptyState
              icon="car-outline"
              title={currentLocation ? 'No active rides nearby' : 'No active rides available'}
              subtitle={currentLocation ? 'Be the first to post a commute or search another route!' : 'Enable precise location to see rides near you.'}
            />
          ) : (
            nearbyRides.slice(0, 3).map((r) => (
              <RideCard key={r.id} ride={r} />
            ))
          )}
        </View>
      </ScrollView>

      {/* Optional, non-blocking offer once a location is already applied. */}
      <SavePlaceSheet
        visible={!!pendingSave}
        location={pendingSave}
        onDismiss={() => setPendingSave(null)}
      />

      {/* Time Modals */}
      <TimePickerModal
        visible={timePicker !== null}
        title={timePicker === 'return' ? 'Return time' : 'Travel time'}
        value={timePicker === 'return' ? returnTime : travelTime}
        onClose={() => setTimePicker(null)}
        onSelect={(t) => { if (timePicker === 'return') setReturnTime(t); else setTravelTime(t); }}
      />
      <DatePickerModal
        visible={datePicker}
        title="Travel date"
        value={travelDate}
        onClose={() => setDatePicker(false)}
        onSelect={setTravelDate}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm },
  greeting: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium },
  locationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 4 },
  location: { fontSize: font.size.sm, color: colors.textSecondary },

  referBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primaryLight, paddingHorizontal: spacing.md, height: 34, borderRadius: radius.pill },
  referText: { color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.medium },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  badge: { position: 'absolute', top: 4, right: 3, minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: colors.error, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.surface },
  badgeText: { color: colors.textInverse, fontSize: 8, lineHeight: 10, fontWeight: font.weight.medium },

  hero: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.xl, marginTop: spacing.sm, backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.lg, ...shadow.md },

  searchCard: { backgroundColor: colors.surface, marginHorizontal: spacing.xl, marginTop: spacing.lg, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  routeRow: { flexDirection: 'row' },
  routeLine: { alignItems: 'center', marginRight: spacing.md, paddingTop: 14 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  vline: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 4 },
  locField: { flexDirection: 'row', alignItems: 'center' },
  fieldLabel: { fontSize: font.size.xs, color: colors.textTertiary, letterSpacing: 0.5 },
  fieldVal: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium, marginTop: 2 },
  trackLive: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  trackText: { fontSize: font.size.xs, color: colors.primary, fontWeight: font.weight.medium },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },

  validationRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.md },
  validationText: { fontSize: font.size.xs, color: colors.error, textAlign: 'center', flexShrink: 1 },

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  smallLabel: { fontSize: font.size.sm, color: colors.textSecondary },
  presetChip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border },
  presetChipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  presetChipText: { fontSize: font.size.xs, color: colors.textSecondary, fontWeight: font.weight.medium },
  presetChipTextActive: { color: colors.primary },
  daysRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  dayChip: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  dayChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayText: { fontSize: font.size.sm, color: colors.textSecondary, fontWeight: font.weight.medium },
  dayTextActive: { color: colors.textInverse },
  timeGrid: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  timeBox: { flex: 1 },
  timeSelect: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 44, marginTop: 4 },
  timeSelectText: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },

  searchActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
  findBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, height: 48, borderRadius: radius.pill, backgroundColor: colors.primary },
  
  findText: { color: colors.textInverse, fontSize: font.size.base, fontWeight: font.weight.medium },
  postBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 48, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.primary },
  postText: { color: colors.primary, fontSize: font.size.base, fontWeight: font.weight.medium },

  limitBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.xl, marginTop: spacing.lg, backgroundColor: colors.primaryLight, borderRadius: radius.md, padding: spacing.md },
  limitText: { flex: 1, fontSize: font.size.sm, color: colors.textPrimary },
  limitUpgrade: { fontSize: font.size.sm, color: colors.primary, fontWeight: font.weight.medium },

  ridesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, marginTop: spacing.xl, marginBottom: spacing.md },
  ridesTitle: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium },
  seeAll: { fontSize: font.size.sm, color: colors.primary, fontWeight: font.weight.medium },

  // SOS Action Sheet Styles
});
