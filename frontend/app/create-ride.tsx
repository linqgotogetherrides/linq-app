import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Switch, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, Redirect } from 'expo-router';
import LinqHeader from '@/src/components/LinqHeader';
import PrimaryButton from '@/src/components/PrimaryButton';
import TimePickerModal from '@/src/components/TimePickerModal';
import DatePickerModal from '@/src/components/DatePickerModal';
import PassengerModal, { PassengerData } from '@/src/components/PassengerModal';
import Slider from '@react-native-community/slider';
import { useApp } from '@/src/context/AppContext';
import { LocationCoordinates } from '@/src/services/locationService';
import { rideService } from '@/src/services/rideService';
import { colors, spacing, font, radius, shadow } from '@/src/theme/tokens';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_PRESETS = [
  { label: 'Mon - Sat', days: [0, 1, 2, 3, 4, 5] },
  { label: 'Mon - Fri', days: [0, 1, 2, 3, 4] },
  { label: 'All days', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'Weekends', days: [5, 6] },
];

export default function CreateRide() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    pickup?: string;
    destination?: string;
    type?: string;
    rideType?: string;
    travelTime?: string;
    returnTime?: string;
    travelDate?: string;
    pickupLatitude?: string;
    pickupLongitude?: string;
    pickupAccuracy?: string;
    pickupTimestamp?: string;
    destinationLatitude?: string;
    destinationLongitude?: string;
    destinationAccuracy?: string;
    destinationTimestamp?: string;
  }>();
  const {
    user,
    showToast,
    locationFlowResult,
    clearLocationFlowResult,
  } = useApp();

  const [rideType, setRideType] = useState<'daily' | 'planned'>(
    params.rideType === 'planned' ? 'planned' : 'daily'
  );
  const savedDefaultPickup = user?.savedLocations?.defaultPickup;
  const savedDefaultDrop = user?.savedLocations?.defaultDrop;
  const [pickup, setPickup] = useState(
    params.pickup || savedDefaultPickup?.label || user?.homeAddress || ''
  );
  const [pickupCoordinates, setPickupCoordinates] = useState<LocationCoordinates | null>(() => {
    const latitude = Number(params.pickupLatitude);
    const longitude = Number(params.pickupLongitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return {
        latitude,
        longitude,
        accuracy: Number.isFinite(Number(params.pickupAccuracy)) ? Number(params.pickupAccuracy) : null,
        timestamp: Number.isFinite(Number(params.pickupTimestamp)) ? Number(params.pickupTimestamp) : undefined,
      };
    }
    return savedDefaultPickup && (!params.pickup || params.pickup === savedDefaultPickup.label)
      ? { latitude: savedDefaultPickup.latitude, longitude: savedDefaultPickup.longitude }
      : null;
  });
  const [destination, setDestination] = useState(params.destination || savedDefaultDrop?.label || '');
  const [destinationCoordinates, setDestinationCoordinates] = useState<LocationCoordinates | null>(() => {
    const latitude = Number(params.destinationLatitude);
    const longitude = Number(params.destinationLongitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return {
        latitude,
        longitude,
        accuracy: Number.isFinite(Number(params.destinationAccuracy)) ? Number(params.destinationAccuracy) : null,
        timestamp: Number.isFinite(Number(params.destinationTimestamp)) ? Number(params.destinationTimestamp) : undefined,
      };
    }
    return savedDefaultDrop && (!params.destination || params.destination === savedDefaultDrop.label)
      ? { latitude: savedDefaultDrop.latitude, longitude: savedDefaultDrop.longitude }
      : null;
  });
  const [routeMetrics, setRouteMetrics] = useState<{
    distanceMeters?: number;
    durationSeconds?: number;
  } | null>(null);
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5]);
  const [presetIdx, setPresetIdx] = useState(0);
  const [hasVehicle, setHasVehicle] = useState(false);
  const [transport, setTransport] = useState<'car' | 'bike' | 'auto'>('car');
  const [availableSeats, setAvailableSeats] = useState(1);
  const [price, setPrice] = useState(150);
  const [womenOnly, setWomenOnly] = useState(user?.womenOnlyMode ?? false);
  const [model, setModel] = useState('');
  const [plate, setPlate] = useState('');
  const [published, setPublished] = useState(false);
  const [publishedStatus, setPublishedStatus] = useState<'active' | 'draft'>('active');
  const [publishing, setPublishing] = useState(false);
  const [travelTime, setTravelTime] = useState(params.travelTime || '08:00 AM');
  const [returnTime, setReturnTime] = useState(params.returnTime || '06:00 PM');
  const [travelDate, setTravelDate] = useState(params.travelDate || 'Sat, 24 Aug');
  const [passengers, setPassengers] = useState<{ name: string; sub: string; self?: boolean; data?: PassengerData }[]>([
    { name: 'Passenger 1', sub: 'Myself', self: true },
  ]);

  React.useEffect(() => {
    if (!locationFlowResult || locationFlowResult.source !== 'create-ride') return;
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

  // Modals
  const [timePicker, setTimePicker] = useState<null | 'travel' | 'return'>(null);
  const [datePicker, setDatePicker] = useState(false);
  const [womenOnlyInfo, setWomenOnlyInfo] = useState(false);
  const [occPassengers, setOccPassengers] = useState<{ name: string; sub: string; self?: boolean; data?: PassengerData }[]>([
    { name: 'Occupant 1', sub: 'Myself', self: true }
  ]);
  const [passengerModal, setPassengerModal] = useState<{ open: boolean; idx: number | null; type: 'req' | 'occ' }>({ open: false, idx: null, type: 'req' });

  const openAddPassenger = () => setPassengerModal({ open: true, idx: null, type: 'req' });
  const openEditPassenger = (idx: number) => setPassengerModal({ open: true, idx, type: 'req' });
  const openEditOccupied = (idx: number) => setPassengerModal({ open: true, idx, type: 'occ' });

  const savePassenger = (p: PassengerData) => {
    const label = `${p.name}${p.age ? ` • ${p.age}` : ''}${p.phone ? ` • ${p.phone}` : ''}`;
    if (passengerModal.type === 'req') {
      setPassengers((list) => {
        if (passengerModal.idx !== null) {
          const copy = [...list];
          copy[passengerModal.idx] = { ...copy[passengerModal.idx], name: p.name, sub: label, data: p };
          return copy;
        }
        return [...list, { name: p.name, sub: label, data: p }];
      });
    } else {
      setOccPassengers((list) => {
        if (passengerModal.idx !== null) {
          const copy = [...list];
          copy[passengerModal.idx] = { ...copy[passengerModal.idx], name: p.name, sub: label, data: p };
          return copy;
        }
        return [...list, { name: p.name, sub: label, data: p }];
      });
    }
    setPassengerModal({ open: false, idx: null, type: 'req' });
    showToast('Passenger saved');
  };
  const removePassenger = (idx: number) => setPassengers((p) => p.filter((_, i) => i !== idx));
  const removeOccPassenger = (idx: number) => setOccPassengers((p) => p.filter((_, i) => i !== idx));

  const addSeat = () => {
    if (passengers.length >= 6) return;
    setPassengers((p) => [...p, { name: `Passenger ${p.length + 1}`, sub: 'Tap to add details' }]);
  };

  const removeSeat = () => {
    if (passengers.length <= 1) return;
    setPassengers((p) => p.slice(0, -1));
  };

  const addOccSeat = () => {
    if (occPassengers.length >= 5) return;
    setOccPassengers((p) => [...p, { name: `Occupant ${p.length + 1}`, sub: 'Tap to add details' }]);
  };
  const removeOccSeat = () => {
    if (occPassengers.length <= 1) return;
    setOccPassengers((p) => p.slice(0, -1));
  };

  const toggleDay = (i: number) => {
    setPresetIdx(-1);
    setDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]));
  };

  const openLocationFlow = (entry: 'pickup' | 'drop') => {
    clearLocationFlowResult();
    setRouteMetrics(null);
    router.push({
      pathname: '/ride-location-flow',
      params: {
        source: 'create-ride',
        entry,
        rideType,
        ...(pickup && pickupCoordinates
          ? {
              pickup,
              pickupLatitude: pickupCoordinates.latitude.toString(),
              pickupLongitude: pickupCoordinates.longitude.toString(),
            }
          : {}),
      },
    });
  };

  const saveRide = async (status: 'active' | 'draft') => {
    if (!user) {
      router.replace('/onboarding');
      return false;
    }
    if (!pickup.trim() || !pickupCoordinates) {
      openLocationFlow('pickup');
      return false;
    }
    if (!destination.trim() || !destinationCoordinates) {
      openLocationFlow('drop');
      return false;
    }

    setPublishing(true);
    try {
      await rideService.createRide({
        creator: user,
        pickup: {
          label: pickup,
          address: pickup,
          lat: pickupCoordinates.latitude,
          lng: pickupCoordinates.longitude,
          accuracy: pickupCoordinates.accuracy,
          timestamp: pickupCoordinates.timestamp,
        },
        destination: {
          label: destination,
          address: destination,
          lat: destinationCoordinates.latitude,
          lng: destinationCoordinates.longitude,
          accuracy: destinationCoordinates.accuracy,
          timestamp: destinationCoordinates.timestamp,
        },
        type: rideType,
        time: travelTime,
        returnTime,
        date: travelDate,
        days: days.map((day) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]),
        pricePerSeat: price,
        seatsTotal: Math.max(1, passengers.length),
        seatsAvailable: Math.max(0, passengers.length - 1),
        womenOnly,
        status,
      });
      setPublished(true);
      setPublishedStatus(status);
      return true;
    } catch (error) {
      // Surface the real reason instead of a generic message.
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Could not publish the ride. Please try again.';
      showToast(message);
      return false;
    } finally {
      setPublishing(false);
    }
  };

  const publish = () => saveRide('active');
  const saveDraft = () => saveRide('draft');

  if (!user) {
    return <Redirect href="/onboarding" />;
  }

  if (published) {
    const isDraft = publishedStatus === 'draft';
    return (
      <SafeAreaView style={styles.container} testID="ride-published-screen">
        <View style={styles.successWrap}>
          <View style={styles.successCircle}>
            <Ionicons name={isDraft ? 'document-text' : 'checkmark'} size={64} color={colors.textInverse} />
          </View>
          <Text style={styles.successTitle}>
            {isDraft ? 'Ride Saved as Draft' : 'Ride Published Successfully'}
          </Text>
          <Text style={styles.successSub}>
            {isDraft
              ? 'This ride is saved but not live yet. Publish it any time from Rides → Posted.'
              : 'Your ride is now live. Ride twins on your route can now request to join.'}
          </Text>
          <View style={{ alignSelf: 'stretch', marginTop: spacing['2xl'], gap: spacing.md }}>
            <PrimaryButton title="View My Rides" icon="car" onPress={() => router.replace('/(tabs)/rides')} />
            <PrimaryButton title="Back to Home" variant="secondary" onPress={() => router.replace('/(tabs)')} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="create-ride-screen">
      <LinqHeader title="Create Your Ride" onBack={() => router.replace('/(tabs)')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>Got empty seats? Share your ride, split travel expenses, and connect with verified commuters nearby.</Text>

          <Text style={styles.label}>Ride Type</Text>
          <View style={styles.typeRow}>
            {(['daily', 'planned'] as const).map((t) => (
              <Pressable key={t} testID={`ride-type-${t}`} onPress={() => setRideType(t)} style={[styles.typeChip, rideType === t && styles.typeChipActive]}>
                <Ionicons name={t === 'daily' ? 'repeat' : 'calendar'} size={16} color={rideType === t ? colors.textInverse : colors.textSecondary} />
                <Text style={[styles.typeChipText, rideType === t && styles.typeChipTextActive]}>{t === 'daily' ? 'Daily' : 'Planned'}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.card}>
            <View style={styles.routeRow}>
              <View style={styles.routeLine}>
                <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                <View style={styles.vline} />
                <View style={[styles.dot, { backgroundColor: colors.error, borderRadius: 2 }]} />
              </View>
              <View style={{ flex: 1 }}>
                <Pressable
                  style={styles.routeField}
                  testID="create-pickup-input"
                  onPress={() => openLocationFlow('pickup')}
                >
                  <Text style={styles.routeFieldLabel}>PICKUP LOCATION</Text>
                  <View style={styles.routeFieldValueRow}>
                    <Text
                      style={[styles.routeFieldValue, !pickup && styles.routeFieldPlaceholder]}
                      numberOfLines={1}
                    >
                      {pickup || 'Choose pickup location'}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                  </View>
                </Pressable>
                <View style={styles.divider} />
                <Pressable
                  style={styles.routeField}
                  testID="create-destination"
                  onPress={() => openLocationFlow('drop')}
                >
                  <Text style={styles.routeFieldLabel}>DROP LOCATION</Text>
                  <View style={styles.routeFieldValueRow}>
                    <Text
                      style={[styles.routeFieldValue, !destination && styles.routeFieldPlaceholder]}
                      numberOfLines={1}
                    >
                      {destination || 'Where are you going?'}
                    </Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                  </View>
                </Pressable>
              </View>
            </View>

            {routeMetrics && (
              <View style={styles.routeReady} testID="create-route-ready">
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.routeReadyTitle}>Route ready</Text>
                  <Text style={styles.routeReadyMeta}>Pickup and drop confirmed</Text>
                </View>
              </View>
            )}

            {rideType === 'daily' ? (
              <View style={{ marginTop: spacing.lg }}>
                <View style={[styles.rowBetween, { marginBottom: spacing.sm }]}>
                  <Text style={styles.smallLabel}>Select Days</Text>
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
                          setDays(preset.days);
                        }}
                      >
                        <Text style={[styles.presetChipText, isActive && styles.presetChipTextActive]}>{preset.label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <View style={styles.daysRow}>
                  {DAYS.map((d, i) => (
                    <Pressable key={i} testID={`create-day-${i}`} onPress={() => toggleDay(i)} style={[styles.dayChip, days.includes(i) && styles.dayChipActive]}>
                      <Text style={[styles.dayText, days.includes(i) && styles.dayTextActive]}>{d}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.timeGrid}>
                  <Pressable style={styles.timeBox} onPress={() => setTimePicker('travel')}><Text style={styles.smallLabel}>Travel Time</Text><View style={styles.timeSelect}><Text style={styles.timeSelectText}>{travelTime}</Text><Ionicons name="chevron-down" size={14} color={colors.textSecondary} /></View></Pressable>
                  <Pressable style={styles.timeBox} onPress={() => setTimePicker('return')}><Text style={styles.smallLabel}>Return Time</Text><View style={styles.timeSelect}><Text style={styles.timeSelectText}>{returnTime}</Text><Ionicons name="chevron-down" size={14} color={colors.textSecondary} /></View></Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.timeGrid}>
                <Pressable style={styles.timeBox} onPress={() => setDatePicker(true)}><Text style={styles.smallLabel}>Travel Date</Text><View style={styles.timeSelect}><Text style={styles.timeSelectText}>{travelDate}</Text><Ionicons name="chevron-down" size={14} color={colors.textSecondary} /></View></Pressable>
                <Pressable style={styles.timeBox} onPress={() => setTimePicker('travel')}><Text style={styles.smallLabel}>Travel Time</Text><View style={styles.timeSelect}><Text style={styles.timeSelectText}>{travelTime}</Text><Ionicons name="chevron-down" size={14} color={colors.textSecondary} /></View></Pressable>
              </View>
            )}

            <View style={[styles.rowBetween, { marginTop: spacing.lg }]}>
              <Text style={styles.smallLabel}>Do you have a vehicle?</Text>
              <View style={styles.yesNo}>
                <Pressable testID="vehicle-no" onPress={() => setHasVehicle(false)} style={[styles.yesNoBtn, !hasVehicle && styles.yesNoActive]}><Text style={[styles.yesNoText, !hasVehicle && styles.yesNoTextActive]}>No</Text></Pressable>
                <Pressable testID="vehicle-yes" onPress={() => setHasVehicle(true)} style={[styles.yesNoBtn, hasVehicle && styles.yesNoActive]}><Text style={[styles.yesNoText, hasVehicle && styles.yesNoTextActive]}>Yes</Text></Pressable>
              </View>
            </View>

            {!hasVehicle ? (
              <View style={{ marginTop: spacing.lg }}>
                <Text style={styles.smallLabelCaps}>Seats Required</Text>
                <View style={styles.stepper}>
                  <Pressable testID="seats-minus" onPress={removeSeat} style={styles.stepBtn}><Ionicons name="remove" size={18} color={colors.textPrimary} /></Pressable>
                  <Text style={styles.stepVal}>{passengers.length}</Text>
                  <Pressable testID="seats-plus" onPress={addSeat} style={styles.stepBtn}><Ionicons name="add" size={18} color={colors.textPrimary} /></Pressable>
                </View>
                {passengers.map((p, idx) => p.self ? null : (
                  <Pressable key={idx} style={styles.passenger} onPress={() => !p.self && openEditPassenger(idx)}>
                    <Ionicons name="person-circle" size={28} color={colors.primary} />
                    <View style={{ flex: 1, marginLeft: spacing.sm }}><Text style={styles.pName}>{p.name}</Text><Text style={styles.pSub}>{p.sub}</Text></View>
                    <Pressable testID={`remove-passenger-${idx}`} onPress={() => removePassenger(idx)} hitSlop={8}>
                      <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
                    </Pressable>
                  </Pressable>
                ))}
                <Pressable style={styles.addPassenger} testID="add-passenger" onPress={openAddPassenger}><Ionicons name="add-circle-outline" size={18} color={colors.primary} /><Text style={styles.addPassengerText}>Add passenger</Text></Pressable>
              </View>
            ) : (
              <View style={{ marginTop: spacing.lg }}>
                <Text style={styles.smallLabelCaps}>Transport Mode</Text>
                <View style={styles.transportRow}>
                  {(['car', 'bike', 'auto'] as const).map((t) => (
                    <Pressable key={t} testID={`transport-${t}`} onPress={() => setTransport(t)} style={[styles.transportChip, transport === t && styles.transportActive]}>
                      <Ionicons name={t === 'car' ? 'car-sport' : t === 'bike' ? 'bicycle' : 'car'} size={20} color={transport === t ? colors.textInverse : colors.textSecondary} />
                      <Text style={[styles.transportText, transport === t && { color: colors.textInverse }]}>{t[0].toUpperCase() + t.slice(1)}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.smallLabel}>Vehicle Model</Text>
                <View style={styles.input}><TextInput testID="vehicle-model" value={model} onChangeText={setModel} placeholder="e.g. Vitara Brezza - AC" placeholderTextColor={colors.textTertiary} style={styles.inputText} /></View>
                <Text style={styles.smallLabel}>Number Plate</Text>
                <View style={styles.input}><TextInput testID="vehicle-plate" value={plate} onChangeText={setPlate} placeholder="e.g. TS-07-UT-3789" placeholderTextColor={colors.textTertiary} autoCapitalize="characters" style={styles.inputText} /></View>

                <View style={styles.seatsGrid}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.smallLabelCaps}>Available Seats</Text>
                    <View style={styles.stepper}>
                      <Pressable testID="avail-minus" onPress={() => setAvailableSeats((s) => Math.max(0, s - 1))} style={styles.stepBtn}><Ionicons name="remove" size={16} color={colors.textPrimary} /></Pressable>
                      <Text style={styles.stepVal}>{availableSeats}</Text>
                      <Pressable testID="avail-plus" onPress={() => setAvailableSeats((s) => Math.min(6, s + 1))} style={styles.stepBtn}><Ionicons name="add" size={16} color={colors.textPrimary} /></Pressable>
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.smallLabelCaps}>Occupied Seats</Text>
                    <View style={styles.stepper}>
                      <Pressable testID="occ-minus" onPress={removeOccSeat} style={styles.stepBtn}><Ionicons name="remove" size={16} color={colors.textPrimary} /></Pressable>
                      <Text style={styles.stepVal}>{occPassengers.length}</Text>
                      <Pressable testID="occ-plus" onPress={addOccSeat} style={styles.stepBtn}><Ionicons name="add" size={16} color={colors.textPrimary} /></Pressable>
                    </View>
                  </View>
                </View>

                {occPassengers.length > 1 && (
                  <View style={{ marginBottom: spacing.md }}>
                    {occPassengers.map((p, idx) => p.self ? null : (
                      <Pressable key={idx} style={styles.passenger} onPress={() => openEditOccupied(idx)}>
                        <Ionicons name="person-circle" size={28} color={colors.primary} />
                        <View style={{ flex: 1, marginLeft: spacing.sm }}><Text style={styles.pName}>{p.name}</Text><Text style={styles.pSub}>{p.sub}</Text></View>
                        <Pressable testID={`remove-occ-${idx}`} onPress={() => removeOccPassenger(idx)} hitSlop={8}>
                          <Ionicons name="close-circle" size={20} color={colors.textTertiary} />
                        </Pressable>
                      </Pressable>
                    ))}
                  </View>
                )}

                <View style={styles.rowBetween}>
                  <Text style={styles.smallLabelCaps}>Price Per Seat</Text>
                  <Text style={styles.priceVal}>₹{price}</Text>
                </View>
                <Slider
                  style={{ width: '100%', height: 40, marginTop: spacing.xs, marginBottom: -spacing.xs }}
                  minimumValue={50}
                  maximumValue={300}
                  step={10}
                  value={price}
                  onValueChange={setPrice}
                  minimumTrackTintColor={colors.primary}
                  maximumTrackTintColor={colors.surfaceSecondary}
                  thumbTintColor={colors.primary}
                />
                <View style={styles.rowBetween}><Text style={styles.sliderEnd}>₹50</Text><Text style={styles.sliderEnd}>₹300</Text></View>
                <Text style={styles.note}>Note: 2 rupees per km. Tap slider to adjust price.</Text>
              </View>
            )}

            {user?.gender === 'female' && (
              <View style={[styles.rowBetween, { marginTop: spacing.lg }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                  <Text style={styles.smallLabel}>Women only mode</Text>
                  <Pressable onPress={() => setWomenOnlyInfo(true)} style={{ padding: 4 }}>
                    <Ionicons name="information-circle" size={22} color={colors.textSecondary} />
                  </Pressable>
                </View>
                <Switch 
                  value={womenOnly} 
                  onValueChange={setWomenOnly} 
                  trackColor={{ false: colors.border, true: '#FF69B4' }} 
                  thumbColor="#FFFFFF"
                  //@ts-ignore
                  activeTrackColor="#FF69B4"
                  testID="create-women-only" 
                />
              </View>
            )}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton
            testID="publish-ride-button"
            title={publishing ? 'Publishing...' : 'Publish Ride'}
            loading={publishing}
            disabled={publishing}
            onPress={publish}
          />
          <View style={{ height: spacing.sm }} />
          <PrimaryButton
            testID="save-draft-button"
            title={publishing ? 'Saving...' : 'Save as Draft'}
            variant="secondary"
            loading={publishing}
            disabled={publishing}
            onPress={async () => {
              const ok = await saveDraft();
              if (ok) {
                showToast('Saved as draft. Find it under Rides → Posted.');
                router.replace('/(tabs)/rides');
              }
            }}
          />
        </View>

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
        <PassengerModal
          visible={passengerModal.open}
          initialData={
            passengerModal.idx !== null
              ? passengerModal.type === 'req'
                ? passengers[passengerModal.idx]?.data
                : occPassengers[passengerModal.idx]?.data
              : undefined
          }
          onClose={() => setPassengerModal({ open: false, idx: null, type: 'req' })}
          onSave={savePassenger}
        />

        <Modal visible={womenOnlyInfo} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Women only mode</Text>
              <Text style={styles.modalText}>If enabled, your rides and profile will only be visible to women, and you’ll only see women users.</Text>
              <PrimaryButton title="Got it" onPress={() => setWomenOnlyInfo(false)} />
            </View>
          </View>
        </Modal>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  intro: { fontSize: font.size.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.lg },
  label: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium, marginBottom: spacing.sm },
  typeRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  typeChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  typeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  typeChipText: { fontSize: font.size.base, color: colors.textSecondary, fontWeight: font.weight.medium },
  typeChipTextActive: { color: colors.textInverse },

  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  routeRow: { flexDirection: 'row' },
  routeLine: { alignItems: 'center', marginRight: spacing.md, paddingTop: 14 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  vline: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 4 },
  routeField: { minHeight: 52, justifyContent: 'center' },
  routeFieldLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: font.weight.bold, letterSpacing: 0.5 },
  routeFieldValueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 3 },
  routeFieldValue: { flex: 1, color: colors.textPrimary, fontSize: font.size.base, fontWeight: font.weight.medium },
  routeFieldPlaceholder: { color: colors.textTertiary, fontWeight: font.weight.regular },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },
  routeReady: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.successLight },
  routeReadyTitle: { color: colors.success, fontSize: font.size.sm, fontWeight: font.weight.bold },
  routeReadyMeta: { marginTop: 2, color: colors.textSecondary, fontSize: font.size.xs },

  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  smallLabel: { fontSize: font.size.sm, color: colors.textSecondary },
  smallLabelCaps: { fontSize: font.size.xs, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm },
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

  yesNo: { flexDirection: 'row', backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, padding: 3 },
  yesNoBtn: { paddingHorizontal: spacing.lg, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  yesNoActive: { backgroundColor: colors.primary },
  yesNoText: { fontSize: font.size.sm, color: colors.textSecondary, fontWeight: font.weight.medium },
  yesNoTextActive: { color: colors.textInverse },

  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.xs, marginBottom: spacing.md },
  stepBtn: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  stepVal: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium },

  passenger: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  pName: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  pSub: { fontSize: font.size.sm, color: colors.textSecondary },
  pTag: { fontSize: font.size.xs, color: colors.primary, fontWeight: font.weight.medium },
  addPassenger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
  addPassengerText: { color: colors.primary, fontSize: font.size.base, fontWeight: font.weight.medium },

  transportRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  transportChip: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, height: 68, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  transportActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  transportText: { fontSize: font.size.sm, color: colors.textSecondary, fontWeight: font.weight.medium },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, height: 48, justifyContent: 'center', paddingHorizontal: spacing.md, marginTop: 4, marginBottom: spacing.md },
  inputText: { fontSize: font.size.base, color: colors.textPrimary },
  seatsGrid: { flexDirection: 'row', gap: spacing.lg, marginBottom: spacing.md },
  priceVal: { fontSize: font.size.lg, color: colors.primary, fontWeight: font.weight.medium },
  sliderTrack: { height: 6, backgroundColor: colors.surfaceSecondary, borderRadius: 3, marginTop: spacing.md, marginBottom: spacing.sm, justifyContent: 'center' },
  sliderFill: { height: 6, backgroundColor: colors.primary, borderRadius: 3 },
  sliderThumb: { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: colors.primary, borderWidth: 3, borderColor: colors.surface, marginLeft: -11, ...shadow.sm },
  sliderEnd: { fontSize: font.size.xs, color: colors.textTertiary },
  note: { fontSize: font.size.xs, color: colors.textTertiary, marginTop: spacing.sm },

  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },

  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['2xl'] },
  successCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl },
  successTitle: { fontSize: font.size['2xl'], color: colors.textPrimary, fontWeight: font.weight.medium, textAlign: 'center' },
  successSub: { fontSize: font.size.base, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  modalContent: { backgroundColor: colors.surface, padding: spacing.xl, borderRadius: radius.lg, width: '100%', maxWidth: 340 },
  modalTitle: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.textPrimary, marginBottom: spacing.md },
  modalText: { fontSize: font.size.base, color: colors.textSecondary, marginBottom: spacing.xl, lineHeight: 22 },
});
