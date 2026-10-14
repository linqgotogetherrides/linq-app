import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';

import LocationSelectionMap from '@/src/components/LocationSelectionMap';
import { useApp } from '@/src/context/AppContext';
import { useCurrentLocation } from '@/src/hooks/useCurrentLocation';
import {
  DUPLICATE_LOCATION_MESSAGE,
  excludeSameLocation,
  isSameLocation,
} from '@/src/lib/location/duplicateGuard';
import { buildSavedPlaces } from '@/src/lib/location/savedPlaces';
import {
  reverseGeocodeLocation,
  searchLocations,
} from '@/src/services/locationService';
import type {
  LocationCoordinates,
  LocationSuggestion,
} from '@/src/services/locationService';
import type { LocationFlowSource, SavedLocation } from '@/src/types';
import { colors, font, radius, spacing } from '@/src/theme/tokens';

const DEFAULT_CENTER: LocationCoordinates = { latitude: 17.44, longitude: 78.38 };

type Field = 'pickup' | 'drop';

const COPY: Record<Field, { title: string; placeholder: string; hint: string }> = {
  pickup: {
    title: 'Choose Pickup Location',
    placeholder: 'Search pickup location',
    hint: 'Where should we pick you up?',
  },
  drop: {
    title: 'Choose Drop Location',
    placeholder: 'Search drop location',
    hint: 'Where are you going?',
  },
};

function savedLocationFromSuggestion(suggestion: LocationSuggestion): SavedLocation {
  return {
    label: suggestion.name,
    address: suggestion.fullAddress,
    latitude: suggestion.coordinates.latitude,
    longitude: suggestion.coordinates.longitude,
  };
}

function coordinatesFrom(location: SavedLocation): LocationCoordinates {
  return { latitude: location.latitude, longitude: location.longitude };
}

/**
 * Single-field location selector.
 *
 * Opens for exactly one field, applies the chosen location to that field, and
 * returns straight to the screen that opened it. There is no combined
 * pickup/drop screen, no confirmation page, and no route stage here — the
 * optional "save this place" offer happens after returning, on the host screen.
 */
export default function RideLocationFlow() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    source?: LocationFlowSource;
    field?: 'pickup' | 'drop';
    /** Opposite field's current location, used for duplicate rejection. */
    opponentAddress?: string;
    opponentLatitude?: string;
    opponentLongitude?: string;
  }>();
  const { user, setLocationFlowResult } = useApp();
  const {
    isLoading: isLocating,
    error: currentLocationError,
    status: locationStatus,
    requestLocation: requestCurrentLocation,
  } = useCurrentLocation();

  const field: Field = params.field === 'drop' ? 'drop' : 'pickup';
  const copy = COPY[field];

  const opponent = useMemo<SavedLocation | null>(() => {
    const lat = Number(params.opponentLatitude);
    const lng = Number(params.opponentLongitude);
    if (!params.opponentAddress?.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return null;
    }
    return {
      label: params.opponentAddress,
      address: params.opponentAddress,
      latitude: lat,
      longitude: lng,
    };
  }, [params.opponentAddress, params.opponentLatitude, params.opponentLongitude]);

  const savedPlaces = useMemo(
    () => buildSavedPlaces(user?.savedLocations),
    [user?.savedLocations]
  );

  // The opposite field's location is never offered here.
  const quickSelectOptions = useMemo(
    () => excludeSameLocation(savedPlaces, opponent),
    [opponent, savedPlaces]
  );

  const [mapCoordinate, setMapCoordinate] = useState<LocationCoordinates>(
    opponent ? coordinatesFrom(opponent) : DEFAULT_CENTER
  );
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LocationSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [resolvingLocation, setResolvingLocation] = useState(false);
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const selectionRequestRef = useRef(0);

  const locationPermissionBlocked =
    locationStatus === 'permission_denied' || locationStatus === 'location_services_disabled';

  // ---------------------------------------------------------------- search

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 3) {
      setSearchResults([]);
      setSearching(false);
      setSearchError(null);
      return undefined;
    }

    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const results = await searchLocations(normalized, controller.signal);
        if (active) setSearchResults(results);
      } catch (error) {
        if (active && (error as { name?: string })?.name !== 'AbortError') {
          setSearchResults([]);
          setSearchError('Location search is unavailable. Check your connection and try again.');
        }
      } finally {
        if (active) setSearching(false);
      }
    }, 450);

    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const resetSearch = useCallback(() => {
    setQuery('');
    setSearchResults([]);
    setSearchError(null);
  }, []);

  // ------------------------------------------------------------ committing

  const close = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/home');
  }, [router]);

  /**
   * Applies a location to this field and returns to the host screen. A repeat
   * of the opposite field is rejected and the existing selection is untouched.
   */
  const commit = useCallback(
    (location: SavedLocation) => {
      if (opponent && isSameLocation(location, opponent)) {
        setDuplicateError(DUPLICATE_LOCATION_MESSAGE);
        return;
      }
      setDuplicateError(null);
      setLocationFlowResult({
        id: Date.now(),
        source: params.source === 'create-ride' ? 'create-ride' : 'home',
        field,
        location,
        isNewPlace: !savedPlaces.some(({ place }) => isSameLocation(place, location)),
      });
      close();
    },
    [close, field, opponent, params.source, savedPlaces, setLocationFlowResult]
  );

  const handleUseCurrentLocation = useCallback(async () => {
    const current = await requestCurrentLocation({ showRationale: true });
    if (!current) return;
    commit({
      label: current.label,
      address: current.address || current.label,
      latitude: current.latitude,
      longitude: current.longitude,
    });
  }, [commit, requestCurrentLocation]);

  const handleSearchResult = useCallback(
    (suggestion: LocationSuggestion) => {
      setMapCoordinate(suggestion.coordinates);
      commit(savedLocationFromSuggestion(suggestion));
    },
    [commit]
  );

  /** Reverse-geocodes a map tap. The request id discards stale lookups. */
  const handleMapTap = useCallback(
    async (coordinate: LocationCoordinates) => {
      if (opponent && isSameLocation(coordinateToLocation(coordinate), opponent)) {
        setDuplicateError(DUPLICATE_LOCATION_MESSAGE);
        return;
      }

      const requestId = ++selectionRequestRef.current;
      setResolvingLocation(true);
      setDuplicateError(null);
      try {
        let location: SavedLocation;
        try {
          location = savedLocationFromSuggestion(await reverseGeocodeLocation(coordinate));
        } catch {
          location = {
            label: `Map location (${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)})`,
            address: `${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)}`,
            latitude: coordinate.latitude,
            longitude: coordinate.longitude,
          };
        }
        // A newer tap or navigation happened while geocoding was in flight.
        if (requestId !== selectionRequestRef.current) return;
        commit(location);
      } finally {
        if (requestId === selectionRequestRef.current) setResolvingLocation(false);
      }
    },
    [commit, opponent]
  );

  const handleMapCoordinateChange = useCallback((coordinate: LocationCoordinates) => {
    setMapCoordinate(coordinate);
  }, []);

  const showResults = query.trim().length >= 3;

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="ride-location-flow">
      <View style={styles.header}>
        <Pressable
          style={styles.headerButton}
          onPress={close}
          hitSlop={10}
          testID="location-flow-back"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={21} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {copy.title}
        </Text>
        <View style={styles.headerButton} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hintRow}>
            <Ionicons
              name={field === 'pickup' ? 'radio-button-on' : 'flag'}
              size={14}
              color={field === 'pickup' ? colors.primary : colors.error}
            />
            <Text style={styles.hintText}>{copy.hint}</Text>
          </View>

          {duplicateError && (
            <View style={styles.alert} testID="duplicate-error">
              <Ionicons name="alert-circle" size={18} color={colors.error} />
              <Text style={styles.alertText}>{duplicateError}</Text>
            </View>
          )}

          {/* Search */}
          <View style={styles.searchBox}>
            <Ionicons name="search" size={19} color={colors.textTertiary} />
            <TextInput
              testID="location-search"
              value={query}
              onChangeText={setQuery}
              placeholder={copy.placeholder}
              placeholderTextColor={colors.textTertiary}
              style={styles.searchInput}
              autoCorrect={false}
              returnKeyType="search"
            />
            {searching && <ActivityIndicator size="small" color={colors.primary} />}
            {!!query && !searching && (
              <Pressable onPress={resetSearch} hitSlop={10} testID="search-clear">
                <Ionicons name="close-circle" size={18} color={colors.textTertiary} />
              </Pressable>
            )}
          </View>

          {showResults && (
            <View style={styles.searchResults}>
              {searchError ? (
                <Text style={styles.noResults}>{searchError}</Text>
              ) : searchResults.length > 0 ? (
                searchResults.map((result) => (
                  <Pressable
                    key={result.id}
                    style={styles.searchResult}
                    onPress={() => handleSearchResult(result)}
                    testID={`result-${result.id}`}
                  >
                    <Ionicons name="location" size={18} color={colors.primary} />
                    <View style={styles.searchResultCopy}>
                      <Text style={styles.searchResultName}>{result.name}</Text>
                      <Text style={styles.searchResultAddress} numberOfLines={2}>
                        {result.fullAddress}
                      </Text>
                    </View>
                  </Pressable>
                ))
              ) : !searching ? (
                <Text style={styles.noResults}>No matching locations found.</Text>
              ) : null}
            </View>
          )}

          {/* Quick selects */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickRow}
            testID="quick-selects"
          >
            <Pressable
              style={styles.quickChip}
              onPress={handleUseCurrentLocation}
              disabled={isLocating}
              testID="quick-current-location"
              accessibilityLabel="Use my current location"
            >
              <View style={styles.quickChipIcon}>
                {isLocating ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="navigate" size={17} color={colors.primary} />
                )}
              </View>
              <Text style={styles.quickChipText}>Current location</Text>
            </Pressable>

            {quickSelectOptions.map(({ kind, place, displayLabel }) => (
              <Pressable
                key={`${kind}-${place.latitude},${place.longitude}`}
                style={styles.quickChip}
                onPress={() => commit(place)}
                testID={`quick-${place.label}`}
                accessibilityLabel={`Use saved place ${displayLabel}`}
              >
                <View style={styles.quickChipIcon}>
                  <Ionicons name={SAVED_PLACE_ICON[kind] || 'bookmark-outline'} size={17} color={colors.primary} />
                </View>
                <Text style={styles.quickChipText} numberOfLines={1}>
                  {displayLabel}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {savedPlaces.length === 0 && (
            <Text style={styles.emptyHint}>
              No saved places yet. Search or tap the map — you can save the place afterwards if
              you want.
            </Text>
          )}

          {/* Map */}
          <View style={styles.mapBlock}>
            <LocationSelectionMap
              coordinate={mapCoordinate}
              onCoordinateChange={handleMapCoordinateChange}
              onMapLocationSelected={(coordinate) => void handleMapTap(coordinate)}
              onUseCurrentLocation={handleUseCurrentLocation}
              isLocating={isLocating}
              height={260}
            />
            <Text style={styles.attribution}>Search and map data by OpenStreetMap</Text>
          </View>

          {resolvingLocation && (
            <View style={styles.resolvingCard} testID="resolving-location">
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.resolvingText}>Resolving address…</Text>
            </View>
          )}

          {currentLocationError && <Text style={styles.errorText}>{currentLocationError}</Text>}
          {locationPermissionBlocked && !currentLocationError && (
            <Text style={styles.errorText}>
              Location access is off. You can still search for a place or tap the map.
            </Text>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function coordinateToLocation(coordinate: LocationCoordinates): SavedLocation {
  return {
    label: `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`,
    address: `${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)}`,
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
  };
}

const SAVED_PLACE_ICON: Record<string, 'home-outline' | 'briefcase-outline' | 'school-outline'> = {
  home: 'home-outline',
  office: 'briefcase-outline',
  college: 'school-outline',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: font.size.base,
    color: colors.textPrimary,
    fontWeight: font.weight.bold,
  },
  content: { padding: spacing.lg, paddingBottom: spacing['2xl'], gap: spacing.md },

  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  hintText: { fontSize: font.size.sm, color: colors.textSecondary },

  searchBox: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, height: 48, color: colors.textPrimary, fontSize: font.size.base },
  searchResults: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  searchResult: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  searchResultCopy: { flex: 1 },
  searchResultName: { color: colors.textPrimary, fontSize: font.size.sm, fontWeight: font.weight.medium },
  searchResultAddress: { marginTop: 2, color: colors.textSecondary, fontSize: font.size.xs, lineHeight: 16 },
  noResults: { padding: spacing.md, textAlign: 'center', color: colors.textSecondary, fontSize: font.size.sm },

  quickRow: { gap: spacing.sm, paddingRight: spacing.lg, paddingVertical: 2 },
  quickChip: {
    minHeight: 48,
    maxWidth: 190,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  quickChipIcon: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: colors.primaryLight,
  },
  quickChipText: {
    flexShrink: 1,
    color: colors.textPrimary,
    fontSize: font.size.xs,
    fontWeight: font.weight.medium,
  },
  emptyHint: { fontSize: font.size.xs, color: colors.textSecondary, lineHeight: 17 },

  mapBlock: { gap: 4 },
  attribution: { textAlign: 'right', color: colors.textTertiary, fontSize: 9 },

  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radius.md,
    backgroundColor: colors.errorLight,
  },
  alertText: { flex: 1, color: colors.error, fontSize: font.size.xs, lineHeight: 17 },
  errorText: { color: colors.error, fontSize: font.size.xs, lineHeight: 17 },

  resolvingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
  },
  resolvingText: { color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.medium },
});