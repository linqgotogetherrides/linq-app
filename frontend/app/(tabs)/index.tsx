import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCurrentLocation } from '@/src/hooks/useCurrentLocation';
import { LocationCoordinates } from '@/src/services/locationService';
import { useApp } from '@/src/context/AppContext';
import SegmentedControl from '@/src/components/SegmentedControl';
import RideCard from '@/src/components/RideCard';
import TimePickerModal from '@/src/components/TimePickerModal';
import DatePickerModal from '@/src/components/DatePickerModal';
import PrimaryButton from '@/src/components/PrimaryButton';
import EmptyState from '@/src/components/EmptyState';
import { rideService } from '@/src/services/rideService';
import { Ride, RideType } from '@/src/types';
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
  const {
    user,
    access,
    showToast,
    pendingRideRequestCount,
    locationFlowResult,
    clearLocationFlowResult,
  } = useApp();
  const {
    location: currentLocation,
    isLoading: isLocating,
    error: locationError,
    requestLocation: requestCurrentLocation,
  } = useCurrentLocation({ autoLoad: true });
  const [mode, setMode] = useState<RideType>('daily');
  const [pickup, setPickup] = useState(
    user?.savedLocations?.defaultPickup?.label || user?.homeAddress || ''
  );
  const [pickupCoordinates, setPickupCoordinates] = useState<LocationCoordinates | null>(() => {
    const saved = user?.savedLocations?.defaultPickup;
    return saved
      ? { latitude: saved.latitude, longitude: saved.longitude }
      : null;
  });
  const [destination, setDestination] = useState(
    user?.savedLocations?.defaultDrop?.label || ''
  );
  const [destinationCoordinates, setDestinationCoordinates] = useState<LocationCoordinates | null>(() => {
    const saved = user?.savedLocations?.defaultDrop;
    return saved
      ? { latitude: saved.latitude, longitude: saved.longitude }
      : null;
  });
  const [routeMetrics, setRouteMetrics] = useState<{
    distanceMeters?: number;
    durationSeconds?: number;
  } | null>(null);
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5]);
  const [presetIdx, setPresetIdx] = useState(0);
  const [travelTime, setTravelTime] = useState('08:00 AM');
  const [returnTime, setReturnTime] = useState('06:00 PM');
  const [travelDate, setTravelDate] = useState('');
  const [nearbyRides, setNearbyRides] = useState<Ride[]>([]);
  const nearbyRequestIdRef = React.useRef(0);

  React.useEffect(() => {
    if (!pickup && user?.savedLocations?.defaultPickup) {
      const saved = user.savedLocations.defaultPickup;
      setPickup(saved.label);
      setPickupCoordinates({ latitude: saved.latitude, longitude: saved.longitude });
    }
    if (!destination && user?.savedLocations?.defaultDrop) {
      const saved = user.savedLocations.defaultDrop;
      setDestination(saved.label);
      setDestinationCoordinates({ latitude: saved.latitude, longitude: saved.longitude });
    }
  }, [destination, pickup, user?.savedLocations?.defaultDrop, user?.savedLocations?.defaultPickup]);

  React.useEffect(() => {
    if (!locationFlowResult || locationFlowResult.source !== 'home') return;
    setPickup(locationFlowResult.pickup.label);
    setPickupCoordinates({
      latitude: locationFlowResult.pickup.latitude,
      longitude: locationFlowResult.pickup.longitude,
    });
    setDestination(locationFlowResult.destination.label);
    setDestinationCoordinates({
      latitude: locationFlowResult.destination.latitude,
      longitude: locationFlowResult.destination.longitude,
    });
    setRouteMetrics({
      distanceMeters: locationFlowResult.distanceMeters,
      durationSeconds: locationFlowResult.durationSeconds,
    });
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
      });
      if (requestId === nearbyRequestIdRef.current) setNearbyRides(data);
    })();
  }, [currentLocation, mode, pickupCoordinates]);

  // Modals
  const [timePicker, setTimePicker] = useState<null | 'travel' | 'return'>(null);
  const [datePicker, setDatePicker] = useState(false);
  const [sosModal, setSosModal] = useState(false);

  const openLocationFlow = (
    entry: 'pickup' | 'drop',
    selectedPickup?: { label: string; coordinates: LocationCoordinates }
  ) => {
    clearLocationFlowResult();
    setRouteMetrics(null);
    router.push({
      pathname: '/ride-location-flow',
      params: {
        source: 'home',
        entry,
        rideType: mode === 'planned' ? 'planned' : 'daily',
        ...(selectedPickup
          ? {
              pickup: selectedPickup.label,
              pickupLatitude: selectedPickup.coordinates.latitude.toString(),
              pickupLongitude: selectedPickup.coordinates.longitude.toString(),
            }
          : {}),
      },
    });
  };

  const toggleDay = (i: number) => {
    setPresetIdx(-1);
    setSelectedDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]));
  };

  const canSearch = (() => {
    if (!pickup.trim() || !destination.trim()) return false;
    if (!pickupCoordinates || !destinationCoordinates) return false;
    if (mode === 'daily') return selectedDays.length > 0 && !!travelTime;
    if (mode === 'planned') return !!travelDate && !!travelTime;
    return true;
  })();

  const search = () => {
    if (!canSearch) return;
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
    if (!pickup.trim() || !pickupCoordinates) {
      openLocationFlow('pickup');
      return;
    }
    if (!destination.trim() || !destinationCoordinates) {
      openLocationFlow('drop', { label: pickup, coordinates: pickupCoordinates });
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
        pickupAccuracy: pickupCoordinates.accuracy?.toString(),
        pickupTimestamp: pickupCoordinates.timestamp?.toString(),
        destinationLatitude: destinationCoordinates.latitude.toString(),
        destinationLongitude: destinationCoordinates.longitude.toString(),
        destinationAccuracy: destinationCoordinates.accuracy?.toString(),
        destinationTimestamp: destinationCoordinates.timestamp?.toString(),
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

    const selected = {
      label: current.label,
      coordinates: {
        latitude: current.latitude,
        longitude: current.longitude,
        accuracy: current.accuracy,
        timestamp: current.timestamp,
      },
    };
    showToast('Precise current location found. Confirm it on the map.');
    openLocationFlow('pickup', selected);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="home-screen">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Top Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Good morning, {user?.name || 'Guest'} 👋</Text>
            <Pressable style={styles.locationRow} testID="location-selector" onPress={() => openLocationFlow('pickup')}>
              <Ionicons name="location" size={14} color={colors.primary} />
              <Text style={styles.location} numberOfLines={1}>{pickup || 'Choose pickup location'}</Text>
              <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* SOS Safety Button */}
          <Pressable
            style={styles.sosBtn}
            testID="sos-button"
            onPress={() => setSosModal(true)}
            hitSlop={8}
          >
            <Ionicons name="shield-checkmark" size={18} color="#E53E3E" />
            <Text style={styles.sosText}>SOS</Text>
          </Pressable>

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
                <Pressable style={{ flex: 1 }} testID="pickup-field" onPress={() => openLocationFlow('pickup')}>
                  <Text style={styles.fieldLabel}>PICKUP LOCATION</Text>
                  <Text style={styles.fieldVal} numberOfLines={1}>{pickup || 'Choose pickup'}</Text>
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
                onPress={() => openLocationFlow(
                  'drop',
                  pickupCoordinates
                    ? { label: pickup, coordinates: pickupCoordinates }
                    : undefined
                )}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>DROP LOCATION</Text>
                  <Text style={[styles.fieldVal, !destination && { color: colors.textTertiary }]} numberOfLines={1}>{destination || 'Where are you going?'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </Pressable>
            </View>
          </View>
          {locationError && <Text style={styles.locationError}>{locationError}</Text>}

          {routeMetrics && (
            <View style={styles.routeReady} testID="home-route-ready">
              <Ionicons name="checkmark-circle" size={20} color={colors.success} />
              <View style={styles.routeReadyCopy}>
                <Text style={styles.routeReadyTitle}>Route ready</Text>
                <Text style={styles.routeReadyMeta}>Pickup and drop confirmed</Text>
              </View>
            </View>
          )}

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

          {!canSearch && (
            <Text style={styles.hint}>
              {(!pickup || !destination)
                ? 'Add pickup & drop to continue'
                : (!pickupCoordinates || !destinationCoordinates)
                  ? 'Choose a location from the OpenStreetMap suggestions'
                  : mode === 'daily'
                    ? 'Pick at least one day'
                    : 'Select travel date & time'}
            </Text>
          )}

          <View style={styles.searchActions}>
            <Pressable testID="find-ride-twin-button" style={[styles.findBtn, !canSearch && styles.findBtnDisabled]} disabled={!canSearch} onPress={search}>
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

      {/* SOS Action Sheet Modal */}
      <Modal visible={sosModal} transparent animationType="slide">
        <View style={styles.sosOverlay}>
          <View style={styles.sosSheet}>
            <View style={styles.sosSheetHeader}>
              <View style={styles.sosBadgeIcon}>
                <Ionicons name="shield-checkmark" size={24} color="#E53E3E" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sosTitle}>Safety & Emergency Options</Text>
                <Text style={styles.sosSubtitle}>Quick actions to protect you during your commute.</Text>
              </View>
              <Pressable onPress={() => setSosModal(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.sosOptionsList}>
              <Pressable
                style={[styles.sosActionRow, { backgroundColor: '#FFF5F5', borderColor: '#FEB2B2' }]}
                onPress={() => {
                  setSosModal(false);
                  showToast('Initiating emergency assistance (112)...');
                }}
              >
                <Ionicons name="call" size={20} color="#E53E3E" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sosActionTitle, { color: '#E53E3E' }]}>Emergency Call (112)</Text>
                  <Text style={styles.sosActionSub}>Connect directly with emergency police services.</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#E53E3E" />
              </Pressable>

              <Pressable
                style={styles.sosActionRow}
                onPress={() => {
                  setSosModal(false);
                  showToast('Live trip location shared with trusted contacts.');
                }}
              >
                <Ionicons name="share-social" size={20} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sosActionTitle}>Share Trip & Location</Text>
                  <Text style={styles.sosActionSub}>Send real-time GPS link to trusted friends/family.</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </Pressable>

              <Pressable
                style={styles.sosActionRow}
                onPress={() => {
                  setSosModal(false);
                  if (user?.emergencyContact) {
                    showToast(`Contacting emergency contact: ${user.emergencyContact}`);
                  } else {
                    router.push('/emergency');
                  }
                }}
              >
                <Ionicons name="people" size={20} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.sosActionTitle}>Emergency Contact</Text>
                  <Text style={styles.sosActionSub}>
                    {user?.emergencyContact ? `Call ${user.emergencyContact}` : 'Set up emergency contact profile'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
              </Pressable>
            </View>

            <View style={{ marginTop: spacing.md }}>
              <PrimaryButton title="Dismiss" variant="secondary" onPress={() => setSosModal(false)} />
            </View>
          </View>
        </View>
      </Modal>

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

  sosBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FEB2B2',
    paddingHorizontal: spacing.sm,
    height: 34,
    borderRadius: radius.pill,
  },
  sosText: { color: '#E53E3E', fontSize: font.size.xs, fontWeight: font.weight.bold },

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

  hint: { fontSize: font.size.xs, color: colors.warning, marginTop: spacing.md, textAlign: 'center' },
  locationError: { fontSize: font.size.xs, color: colors.error, marginTop: spacing.sm, textAlign: 'center' },
  routeReady: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.successLight,
  },
  routeReadyCopy: { flex: 1 },
  routeReadyTitle: { color: colors.success, fontSize: font.size.sm, fontWeight: font.weight.bold },
  routeReadyMeta: { marginTop: 2, color: colors.textSecondary, fontSize: font.size.xs },

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
  findBtnDisabled: { backgroundColor: colors.borderStrong },
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
  sosOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sosSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl },
  sosSheetHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  sosBadgeIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFF5F5', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FEB2B2' },
  sosTitle: { fontSize: font.size.lg, fontWeight: font.weight.bold, color: colors.textPrimary },
  sosSubtitle: { fontSize: font.size.xs, color: colors.textSecondary, marginTop: 2 },
  sosOptionsList: { gap: spacing.md },
  sosActionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary },
  sosActionTitle: { fontSize: font.size.base, fontWeight: font.weight.bold, color: colors.textPrimary },
  sosActionSub: { fontSize: font.size.xs, color: colors.textSecondary, marginTop: 2 },
});
