import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Modal, View, Text, StyleSheet, TextInput, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCurrentLocation } from '@/src/hooks/useCurrentLocation';
import { LocationCoordinates, searchLocations } from '@/src/services/locationService';
import LocationStatusBadge from '@/src/components/LocationStatusBadge';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

interface Props {
  visible: boolean;
  title?: string;
  onClose: () => void;
  onSelect: (place: string, coordinates?: LocationCoordinates) => void;
}

interface Place {
  id: string;
  name: string;
  full: string;
  coordinates?: LocationCoordinates;
}

// Popular Hyderabad places used as suggestions + offline fallback
const POPULAR: Place[] = [
  { id: 'p1', name: 'Madhapur', full: 'Madhapur, Hyderabad, Telangana', coordinates: { latitude: 17.447, longitude: 78.381 } },
  { id: 'p2', name: 'Hitech City', full: 'HITEC City, Madhapur, Hyderabad', coordinates: { latitude: 17.445, longitude: 78.377 } },
  { id: 'p3', name: 'Gachibowli', full: 'Gachibowli, Hyderabad, Telangana', coordinates: { latitude: 17.440, longitude: 78.348 } },
  { id: 'p4', name: 'Kukatpally', full: 'Kukatpally, Hyderabad, Telangana', coordinates: { latitude: 17.494, longitude: 78.399 } },
  { id: 'p5', name: 'Secunderabad', full: 'Secunderabad Railway Station, Hyderabad', coordinates: { latitude: 17.439, longitude: 78.498 } },
  { id: 'p6', name: 'Banjara Hills', full: 'Banjara Hills, Hyderabad, Telangana', coordinates: { latitude: 17.415, longitude: 78.448 } },
  { id: 'p7', name: 'Jubilee Hills', full: 'Jubilee Hills, Hyderabad, Telangana', coordinates: { latitude: 17.425, longitude: 78.430 } },
  { id: 'p8', name: 'RGIA Airport', full: 'Rajiv Gandhi International Airport, Shamshabad', coordinates: { latitude: 17.2403, longitude: 78.4294 } },
];

export default function LocationPickerModal({ visible, title = 'Choose location', onClose, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>(POPULAR);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const {
    location: currentLocation,
    status: locationStatus,
    isLoading: locating,
    error: locationError,
    requestLocation: requestCurrentLocation,
    reset: resetLocation,
  } = useCurrentLocation();

  useEffect(() => {
    if (visible) {
      resetLocation();
      setQuery('');
      setSearchError(null);
      setResults(POPULAR);
    }
  }, [visible, resetLocation]);

  const search = useCallback(async (q: string) => {
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    if (!q || q.trim().length < 3) {
      setLoading(false);
      setSearchError(null);
      setResults(!q ? POPULAR : POPULAR.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())));
      return;
    }

    const controller = new AbortController();
    searchAbortRef.current = controller;
    setLoading(true);
    setSearchError(null);
    try {
      const locations = await searchLocations(q, controller.signal);
      setResults(
        locations.map((location) => ({
          id: location.id,
          name: location.name,
          full: location.fullAddress,
          coordinates: location.coordinates,
        }))
      );
    } catch (error) {
      if ((error as { name?: string })?.name !== 'AbortError') {
        setResults([]);
        setSearchError('Location search is unavailable. Check your connection and try again.');
      }
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void search(query); }, 400);
    return () => clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    return () => searchAbortRef.current?.abort();
  }, []);

  const pick = (place: Place) => {
    onSelect(place.full, place.coordinates);
    setQuery('');
    onClose();
  };

  const handleUseCurrentLocation = async () => {
    if (locating) return;
    const current = await requestCurrentLocation({
      acquisition: { timeoutMs: 15_000, allowWeakAccuracy: false },
    });
    if (!current) return;

    onSelect(current.label, {
      latitude: current.latitude,
      longitude: current.longitude,
      accuracy: current.accuracy,
      timestamp: current.timestamp,
    });
    setQuery('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} testID="location-picker-close"><Ionicons name="close" size={24} color={colors.textPrimary} /></Pressable>
          <Text style={styles.title}>{title}</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textTertiary} />
          <TextInput
            testID="location-search-input"
            value={query}
            onChangeText={setQuery}
            placeholder="Search area, colony, landmark…"
            placeholderTextColor={colors.textTertiary}
            style={styles.searchInput}
            autoFocus
          />
          {loading && <ActivityIndicator color={colors.primary} size="small" />}
        </View>

        <Pressable
          style={styles.currentBtn}
          testID="use-current-location"
          onPress={handleUseCurrentLocation}
          disabled={locating}
        >
          {locating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="navigate-circle" size={20} color={colors.primary} />
          )}
          <Text style={styles.currentText}>
            {locating ? 'Obtaining fresh GPS location...' : 'Use my current location'}
          </Text>
        </Pressable>

        <View style={{ marginHorizontal: spacing.xl }}>
          <LocationStatusBadge
            status={locationStatus}
            location={currentLocation}
            error={locationError}
            onRefresh={handleUseCurrentLocation}
          />
        </View>

        {searchError && (
          <Text style={styles.errorText}>{searchError}</Text>
        )}

        <Text style={styles.sectionLabel}>{query.length >= 3 ? 'Search results' : 'Popular in Hyderabad'}</Text>
        <FlatList
          data={results}
          keyExtractor={(i) => i.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Pressable style={styles.row} testID={`place-${item.id}`} onPress={() => pick(item)}>
              <View style={styles.pin}><Ionicons name="location" size={16} color={colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowFull} numberOfLines={1}>{item.full}</Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No places found. Try a different search.</Text>}
        />
        <Text style={styles.attribution}>Powered by OpenStreetMap</Text>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, height: 56 },
  title: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.xl, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 48 },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: font.size.base },
  currentBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.xl, marginTop: spacing.md, paddingVertical: spacing.md },
  currentText: { color: colors.primary, fontSize: font.size.base, fontWeight: font.weight.medium },
  errorText: { color: colors.error, fontSize: font.size.xs, lineHeight: 17, marginHorizontal: spacing.xl, marginTop: spacing.xs },
  sectionLabel: { fontSize: font.size.xs, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginHorizontal: spacing.xl, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  pin: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  rowName: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  rowFull: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
  empty: { textAlign: 'center', color: colors.textSecondary, marginTop: spacing.xl },
  attribution: { textAlign: 'center', fontSize: font.size.xs, color: colors.textTertiary, paddingVertical: spacing.sm },
});
