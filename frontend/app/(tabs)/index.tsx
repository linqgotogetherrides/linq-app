import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { useApp } from '@/src/context/AppContext';
import SegmentedControl from '@/src/components/SegmentedControl';
import RideCard from '@/src/components/RideCard';
import LocationPickerModal from '@/src/components/LocationPickerModal';
import TimePickerModal from '@/src/components/TimePickerModal';
import DatePickerModal from '@/src/components/DatePickerModal';
import { colors, spacing, font, radius, shadow } from '@/src/theme/tokens';
import { mockRides } from '@/src/mock/data';
import { RideType } from '@/src/types';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_PRESETS = [
  { label: 'Mon - Sat', days: [0, 1, 2, 3, 4, 5] },
  { label: 'Mon - Fri', days: [0, 1, 2, 3, 4] },
  { label: 'All days', days: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'Weekends', days: [5, 6] },
];

export default function Home() {
  const router = useRouter();
  const { user, access, showToast } = useApp();
  const [mode, setMode] = useState<RideType>('instant');
  const [pickup, setPickup] = useState('Madhapur, Hyderabad');
  const [destination, setDestination] = useState('');
  const [selectedDays, setSelectedDays] = useState<number[]>([0, 1, 2, 3, 4, 5]);
  const [presetIdx, setPresetIdx] = useState(0);
  const [travelTime, setTravelTime] = useState('08:00 AM');
  const [returnTime, setReturnTime] = useState('06:00 PM');
  const [travelDate, setTravelDate] = useState('');

  // Modals
  const [locPicker, setLocPicker] = useState<null | 'pickup' | 'dest'>(null);
  const [timePicker, setTimePicker] = useState<null | 'travel' | 'return'>(null);
  const [datePicker, setDatePicker] = useState(false);

  const toggleDay = (i: number) => {
    setPresetIdx(-1);
    setSelectedDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]));
  };

  const cyclePreset = () => {
    const next = (presetIdx + 1) % DAY_PRESETS.length;
    setPresetIdx(next);
    setSelectedDays(DAY_PRESETS[next].days);
  };

  // Validation: require route; daily needs days+times; planned needs date+time
  const canSearch = (() => {
    if (!pickup.trim() || !destination.trim()) return false;
    if (mode === 'daily') return selectedDays.length > 0 && !!travelTime;
    if (mode === 'planned') return !!travelDate && !!travelTime;
    return true;
  })();

  const search = () => {
    if (!canSearch) return;
    router.push({ pathname: '/search-results', params: { pickup, destination, type: mode } });
  };

  const handleTrackLive = async () => {
    try {
      showToast('Fetching location...');
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showToast('Location permission denied');
        return;
      }

      let lat = 17.447;
      let lng = 78.381;
      try {
        const location = await Location.getCurrentPositionAsync({});
        lat = location.coords.latitude;
        lng = location.coords.longitude;
      } catch (locErr: any) {
        console.warn('GPS failed, using fallback location:', locErr);
        showToast('GPS failed, using fallback Madhapur location');
      }

      const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;
      if (!MAPBOX_TOKEN) {
        throw new Error('Mapbox token is missing');
      }
      
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}`;
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        const address = data.features[0].place_name;
        setPickup(address);
        showToast('Location updated successfully');
      } else {
        console.log('Mapbox geocoding returned no features:', data);
        throw new Error(data.message || 'No address found for this location');
      }
    } catch (error: any) {
      console.error('Track Live Error:', error);
      setPickup('Current Location');
      const msg = error?.message || 'Could not fetch exact address';
      showToast(msg.length > 40 ? msg.substring(0, 40) + '...' : msg);
    }
  };

  const presetLabel = presetIdx >= 0 ? DAY_PRESETS[presetIdx].label : 'Custom';

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="home-screen">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Good morning, {user?.name || 'Guest'}</Text>
            <Pressable style={styles.locationRow} testID="location-selector" onPress={() => setLocPicker('pickup')}>
              <Ionicons name="location" size={14} color={colors.primary} />
              <Text style={styles.location} numberOfLines={1}>{pickup || 'Near Madhapur, Hyderabad'}</Text>
              <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
            </Pressable>
          </View>
          <Pressable style={styles.referBtn} testID="refer-button" onPress={() => router.push('/referral')}>
            <Ionicons name="gift" size={14} color={colors.primary} />
            <Text style={styles.referText}>Refer</Text>
          </Pressable>
          <Pressable style={styles.iconBtn} testID="notifications-button" onPress={() => router.push('/notifications')}>
            <Ionicons name="notifications-outline" size={22} color={colors.textPrimary} />
            <View style={styles.badge} />
          </Pressable>
        </View>

        <View style={[styles.hero, { padding: 0, backgroundColor: 'transparent', height: 120, overflow: 'hidden' }]}>
          <Image 
            source={
              mode === 'instant' ? require('@/assets/images/instant.png') :
              mode === 'daily' ? require('@/assets/images/daily.png') :
              require('@/assets/images/planned.png')
            } 
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        </View>

        <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.lg }}>
          <SegmentedControl
            testID="ride-mode-segment"
            value={mode}
            onChange={(k) => setMode(k as RideType)}
            options={[
              { key: 'instant', label: 'Instant', icon: 'flash' },
              { key: 'daily', label: 'Daily', icon: 'repeat' },
              { key: 'planned', label: 'Planned', icon: 'calendar' },
            ]}
          />
        </View>

        <View style={styles.searchCard}>
          <View style={styles.routeRow}>
            <View style={styles.routeLine}>
              <View style={[styles.dot, { backgroundColor: colors.primary }]} />
              <View style={styles.vline} />
              <View style={[styles.dot, { backgroundColor: colors.error, borderRadius: 2 }]} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.locField}>
                <Pressable style={{ flex: 1 }} testID="pickup-field" onPress={() => setLocPicker('pickup')}>
                  <Text style={styles.fieldLabel}>Pickup Location</Text>
                  <Text style={styles.fieldVal} numberOfLines={1}>{pickup || 'Choose pickup'}</Text>
                </Pressable>
                <Pressable style={styles.trackLive} testID="track-live" onPress={handleTrackLive}>
                  <Ionicons name="navigate" size={12} color={colors.primary} />
                  <Text style={styles.trackText}>Track Live</Text>
                </Pressable>
              </View>
              <View style={styles.divider} />
              <Pressable style={styles.locField} testID="destination-field" onPress={() => setLocPicker('dest')}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Drop Location</Text>
                  <Text style={[styles.fieldVal, !destination && { color: colors.textTertiary }]} numberOfLines={1}>{destination || 'Where are you going?'}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </Pressable>
            </View>
          </View>

          {mode === 'instant' && (
            <View style={styles.instantNote}>
              <Ionicons name="flash" size={14} color={colors.primary} />
              <Text style={styles.instantNoteText}>Departing now — we&apos;ll match you with ride twins leaving soon.</Text>
            </View>
          )}

          {mode === 'daily' && (
            <View style={{ marginTop: spacing.lg }}>
              <View style={styles.rowBetween}>
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
              {(!pickup || !destination) ? 'Add pickup & drop to continue' : mode === 'daily' ? 'Pick at least one day' : mode === 'planned' ? 'Select travel date & time' : ''}
            </Text>
          )}

          <View style={styles.searchActions}>
            <Pressable testID="find-ride-twin-button" style={[styles.findBtn, !canSearch && styles.findBtnDisabled]} disabled={!canSearch} onPress={search}>
              <Ionicons name="search" size={16} color={colors.textInverse} />
              <Text style={styles.findText}>Find my Ride Twin</Text>
            </Pressable>
            <Pressable testID="post-ride-button" style={styles.postBtn} onPress={() => router.push({ pathname: '/create-ride', params: { pickup, destination, rideType: mode, travelTime, returnTime, travelDate } })}>
              <Text style={styles.postText}>Post</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.primary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.limitBanner}>
          <Ionicons name="flash" size={16} color={colors.primary} />
          <Text style={styles.limitText}>
            {access.freeRequestsRemaining} requests · {access.freeChatsRemaining} chats remaining
          </Text>
          <Pressable onPress={() => router.push('/pricing')} testID="upgrade-mini">
            <Text style={styles.limitUpgrade}>Upgrade</Text>
          </Pressable>
        </View>

        <View style={styles.ridesHeader}>
          <Text style={styles.ridesTitle}>Rides near you</Text>
          <Pressable onPress={() => router.push('/search-results')}><Text style={styles.seeAll}>See all</Text></Pressable>
        </View>
        <View style={{ paddingHorizontal: spacing.xl }}>
          {mockRides.slice(0, 3).map((r) => (
            <RideCard key={r.id} ride={r} />
          ))}
        </View>
      </ScrollView>

      <LocationPickerModal
        visible={locPicker !== null}
        title={locPicker === 'pickup' ? 'Set pickup location' : 'Set drop location'}
        onClose={() => setLocPicker(null)}
        onSelect={(place) => { if (locPicker === 'pickup') setPickup(place); else setDestination(place); }}
      />
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
  badge: { position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.error },

  hero: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.xl, marginTop: spacing.sm, backgroundColor: colors.primary, borderRadius: radius.lg, padding: spacing.lg, ...shadow.md },
  heroTitle: { fontSize: font.size['2xl'], color: colors.textInverse, fontWeight: font.weight.medium, lineHeight: 26 },
  heroSub: { fontSize: font.size.sm, color: colors.primaryLight, marginTop: 4 },
  heroIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },

  searchCard: { backgroundColor: colors.surface, marginHorizontal: spacing.xl, marginTop: spacing.lg, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  routeRow: { flexDirection: 'row' },
  routeLine: { alignItems: 'center', marginRight: spacing.md, paddingTop: 14 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  vline: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 4 },
  locField: { flexDirection: 'row', alignItems: 'center' },
  fieldLabel: { fontSize: font.size.xs, color: colors.textTertiary },
  fieldVal: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium, marginTop: 2 },
  trackLive: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  trackText: { fontSize: font.size.xs, color: colors.primary, fontWeight: font.weight.medium },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.md },

  instantNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, backgroundColor: colors.primaryLight, borderRadius: radius.md, padding: spacing.md },
  instantNoteText: { flex: 1, fontSize: font.size.sm, color: colors.textPrimary },
  hint: { fontSize: font.size.xs, color: colors.warning, marginTop: spacing.md, textAlign: 'center' },

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
});
