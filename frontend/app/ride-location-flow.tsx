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
import LeafletMap from '@/src/components/LeafletMap';
import LocationSelectionMap from '@/src/components/LocationSelectionMap';
import PrimaryButton from '@/src/components/PrimaryButton';
import { useApp } from '@/src/context/AppContext';
import { useCurrentLocation } from '@/src/hooks/useCurrentLocation';
import { fetchOSRMRoute } from '@/src/lib/routing/osrm';
import type { OSRMRouteResponse } from '@/src/lib/routing/osrm';
import {
  reverseGeocodeLocation,
  searchLocations,
} from '@/src/services/locationService';
import type {
  LocationCoordinates,
  LocationSuggestion,
} from '@/src/services/locationService';
import type {
  LocationFlowSource,
  SavedLocation,
  SavedLocationType,
} from '@/src/types';
import { colors, font, radius, shadow, spacing } from '@/src/theme/tokens';

type FlowStage =
  | 'pickup'
  | 'pickupType'
  | 'dropChoice'
  | 'drop'
  | 'dropType'
  | 'route';

type Classification = SavedLocationType | 'not-now';

const DEFAULT_CENTER: LocationCoordinates = {
  latitude: 17.44,
  longitude: 78.38,
};

const CLASSIFICATIONS: {
  key: Classification;
  label: string;
  icon: 'home-outline' | 'briefcase-outline' | 'school-outline' | 'time-outline';
}[] = [
  { key: 'home', label: 'Home', icon: 'home-outline' },
  { key: 'office', label: 'Office', icon: 'briefcase-outline' },
  { key: 'college', label: 'College', icon: 'school-outline' },
  { key: 'not-now', label: 'Not now', icon: 'time-outline' },
];

function locationFromParams(
  label?: string,
  latitude?: string,
  longitude?: string
): SavedLocation | null {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!label?.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    label: label.trim(),
    address: label.trim(),
    latitude: lat,
    longitude: lng,
  };
}

function savedLocationFromSuggestion(suggestion: LocationSuggestion): SavedLocation {
  return {
    label: suggestion.name,
    address: suggestion.fullAddress,
    latitude: suggestion.coordinates.latitude,
    longitude: suggestion.coordinates.longitude,
  };
}

function coordinatesFrom(location: SavedLocation): LocationCoordinates {
  return {
    latitude: location.latitude,
    longitude: location.longitude,
  };
}

export default function RideLocationFlow() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    source?: LocationFlowSource;
    entry?: 'pickup' | 'drop';
    rideType?: 'daily' | 'planned';
    pickup?: string;
    pickupLatitude?: string;
    pickupLongitude?: string;
  }>();
  const {
    user,
    saveUserLocation,
    setLocationFlowResult,
  } = useApp();
  const {
    isLoading: isLocating,
    error: currentLocationError,
    requestLocation: requestCurrentLocation,
  } = useCurrentLocation();

  const source: LocationFlowSource = params.source === 'create-ride' ? 'create-ride' : 'home';
  const isPlannedTrip = params.rideType === 'planned';
  const savedDefaultPickup = user?.savedLocations?.defaultPickup;
  const initialPickup = useMemo(
    () => locationFromParams(params.pickup, params.pickupLatitude, params.pickupLongitude) || savedDefaultPickup || null,
    [params.pickup, params.pickupLatitude, params.pickupLongitude, savedDefaultPickup]
  );
  const savedDefaultDrop = user?.savedLocations?.defaultDrop;
  const savedPlaceOptions = useMemo(
    () => [
      { type: 'home' as const, place: user?.savedLocations?.home },
      { type: 'office' as const, place: user?.savedLocations?.office },
      { type: 'college' as const, place: user?.savedLocations?.college },
    ].filter(
      (entry): entry is { type: SavedLocationType; place: SavedLocation } => Boolean(entry.place)
    ),
    [user?.savedLocations]
  );

  const [stage, setStage] = useState<FlowStage>(() => {
    if (params.entry === 'drop' && initialPickup) {
      return savedDefaultDrop ? 'dropChoice' : 'drop';
    }
    return 'pickup';
  });
  const [pickup, setPickup] = useState<SavedLocation | null>(initialPickup);
  const [destination, setDestination] = useState<SavedLocation | null>(null);
  const [mapCoordinate, setMapCoordinate] = useState<LocationCoordinates>(
    initialPickup ? coordinatesFrom(initialPickup) : DEFAULT_CENTER
  );
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LocationSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [resolvingLocation, setResolvingLocation] = useState(false);
  const selectionRequestRef = useRef(0);
  const [savingLocation, setSavingLocation] = useState(false);
  const [route, setRoute] = useState<OSRMRouteResponse | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [routeRequest, setRouteRequest] = useState(0);
  const [dropBackTarget, setDropBackTarget] = useState<'pickup' | 'dropChoice' | null>(null);

  const isSelectingPickup = stage === 'pickup';
  const isSelectingDrop = stage === 'drop';
  const activeProgress = stage === 'pickup' || stage === 'pickupType'
    ? 'pickup'
    : stage === 'route'
      ? 'route'
      : 'drop';

  useEffect(() => {
    if (!isSelectingPickup && !isSelectingDrop) return undefined;
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
  }, [isSelectingDrop, isSelectingPickup, query]);

  const resetSearch = () => {
    setQuery('');
    setSearchResults([]);
    setSearchError(null);
  };

  const handleMapCoordinateChange = useCallback((coordinate: LocationCoordinates) => {
    setMapCoordinate(coordinate);

    setQuery('');
    setSearchResults([]);
    setSearchError(null);
  }, []);

  const matchesSavedLocation = (location: SavedLocation) =>
    savedPlaceOptions.some(({ place }) =>
      Math.abs(place.latitude - location.latitude) < 0.0001 &&
      Math.abs(place.longitude - location.longitude) < 0.0001
    );

  const continueAfterPickup = useCallback((selected: SavedLocation) => {
    setPickup(selected);
    setQuery('');
    if (savedDefaultDrop) {
      setStage('dropChoice');
    } else {
      setDropBackTarget('pickup');
      setMapCoordinate(coordinatesFrom(selected));


      setSearchResults([]);
      setStage('drop');
    }
  }, [savedDefaultDrop]);

  const handlePickupSelection = (selected: SavedLocation, skipClassification = false) => {
    if (skipClassification || isPlannedTrip || matchesSavedLocation(selected)) {
      continueAfterPickup(selected);
    } else {
      setPickup(selected);
      setStage('pickupType');
    }
  };

  const handleDropSelection = (selected: SavedLocation, skipClassification = false) => {
    setDestination(selected);
    if (skipClassification || isPlannedTrip || matchesSavedLocation(selected)) {
      setDropBackTarget(null);
      setStage('route');
    } else {
      setDropBackTarget(null);
      setStage('dropType');
    }
  };

  const handleUseCurrentLocation = async (advance = false) => {
    const current = await requestCurrentLocation({ showRationale: true });
    if (!current) return;
    const selected: SavedLocation = {
      label: current.label,
      address: current.address || current.label,
      latitude: current.latitude,
      longitude: current.longitude,
    };
    setMapCoordinate({
      latitude: current.latitude,
      longitude: current.longitude,
      accuracy: current.accuracy,
      timestamp: current.timestamp,
    });

    resetSearch();

    if (advance) {
      if (isSelectingPickup) {
        handlePickupSelection(selected);
      } else {
        handleDropSelection(selected);
      }
    }
  };

  const selectSearchResult = (suggestion: LocationSuggestion) => {
    const selected = savedLocationFromSuggestion(suggestion);
    setMapCoordinate(suggestion.coordinates);
    void selectResolvedLocation(suggestion.coordinates, selected);
  };

  const selectResolvedLocation = async (
    coordinate: LocationCoordinates,
    selected?: SavedLocation
  ) => {
    const requestId = ++selectionRequestRef.current;
    setResolvingLocation(true);
    try {
      let location = selected;
      if (!location) {
        try {
          const result = await reverseGeocodeLocation(coordinate);
          location = savedLocationFromSuggestion(result);
        } catch {
          location = {
            label: `Map location (${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)})`,
            address: `${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)}`,
            latitude: coordinate.latitude,
            longitude: coordinate.longitude,
          };
        }
      }

      if (requestId !== selectionRequestRef.current || !location) return;
      setMapCoordinate(coordinate);

      resetSearch();
      if (isSelectingPickup) {
        handlePickupSelection(location);
      } else {
        handleDropSelection(location);
      }
    } finally {
      if (requestId === selectionRequestRef.current) setResolvingLocation(false);
    }
  };

  const handleMapLocationSelected = (coordinate: LocationCoordinates) => {
    void selectResolvedLocation(coordinate);
  };

  const openDropSelection = useCallback((fromSavedChoice = false) => {
    setDropBackTarget(fromSavedChoice ? 'dropChoice' : 'pickup');
    setMapCoordinate(pickup ? coordinatesFrom(pickup) : DEFAULT_CENTER);


    setQuery('');
    setSearchResults([]);
    setSearchError(null);
    setStage('drop');
  }, [pickup]);

  const selectSavedPickup = (place: SavedLocation) => {
    handlePickupSelection(place, true);
  };

  const selectSavedDrop = (place: SavedLocation) => {
    handleDropSelection(place, true);
    resetSearch();
  };

  const saveClassification = async (classification: Classification) => {
    const role = stage === 'pickupType' ? 'pickup' : 'drop';
    const location = role === 'pickup' ? pickup : destination;
    if (!location) return;

    setSavingLocation(true);
    try {
      if (classification !== 'not-now') {
        await saveUserLocation(classification, location, role);
      }

      if (role === 'pickup') {
        continueAfterPickup(location);
      } else {
        setStage('route');
      }
    } finally {
      setSavingLocation(false);
    }
  };

  useEffect(() => {
    if (stage !== 'route' || !pickup || !destination) return undefined;
    let active = true;
    setRouteLoading(true);
    setRouteError(null);
    setRoute(null);

    void fetchOSRMRoute(coordinatesFrom(pickup), coordinatesFrom(destination))
      .then((result) => {
        if (!active) return;
        if (result.source !== 'road' || result.geometry.coordinates.length < 2) {
          throw new Error('Actual road route unavailable');
        }
        setRoute(result);
      })
      .catch(() => {
        if (active) {
          setRouteError('We could not load the real road route. Check your connection and try again.');
        }
      })
      .finally(() => {
        if (active) setRouteLoading(false);
      });

    return () => {
      active = false;
    };
  }, [destination, pickup, routeRequest, stage]);

  const goBack = () => {
    switch (stage) {
      case 'pickupType':
        setStage('pickup');
        break;
      case 'dropChoice':
        setStage('pickup');
        break;
      case 'dropType':
        setStage('drop');
        break;
      case 'drop':
        if (dropBackTarget) {
          setStage(dropBackTarget);
          setDropBackTarget(null);
        } else if (router.canGoBack()) {
          router.back();
        } else {
          router.replace(source === 'home' ? '/(tabs)/home' : '/create-ride');
        }
        break;
      case 'route':
        setStage(savedDefaultDrop ? 'dropChoice' : 'dropType');
        break;
      default:
        if (router.canGoBack()) router.back();
        else router.replace(source === 'home' ? '/(tabs)/home' : '/create-ride');
    }
  };

  const completeFlow = () => {
    if (!pickup || !destination || route?.source !== 'road') return;
    setLocationFlowResult({
      id: Date.now(),
      source,
      pickup,
      destination,
      distanceMeters: route.distance,
      durationSeconds: route.duration,
    });
    if (router.canGoBack()) router.back();
    else router.replace(source === 'home' ? '/(tabs)/home' : '/create-ride');
  };

  const renderProgress = () => {
    const activeIndex = activeProgress === 'pickup' ? 0 : activeProgress === 'drop' ? 1 : 2;
    return (
      <View style={styles.progressRow} testID="location-flow-progress">
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${(activeIndex / 2) * 100}%` },
            ]}
          />
        </View>
        {(['pickup', 'drop', 'route'] as const).map((item, index) => {
          const complete = index < activeIndex;
          const active = item === activeProgress;
          return (
            <View key={item} style={styles.progressItem}>
              <View
                style={[
                  styles.progressDot,
                  (active || complete) && styles.progressDotActive,
                  active && styles.progressDotCurrent,
                ]}
              >
                {complete ? (
                  <Ionicons name="checkmark" size={11} color={colors.textInverse} />
                ) : (
                  <Text style={[styles.progressNumber, active && styles.progressNumberActive]}>
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[styles.progressLabel, active && styles.progressLabelActive]}
                numberOfLines={1}
              >
                {item === 'pickup' ? 'Pickup' : item === 'drop' ? 'Drop' : 'Route'}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  const renderSavedPlaces = (
    options: { type: SavedLocationType; place: SavedLocation }[],
    onSelect: (place: SavedLocation) => void,
    showSearchAnother = true
  ) => (
    <View style={styles.savedSection}>
      <Text style={styles.savedHeading}>Saved locations</Text>
      <View style={styles.savedGrid}>
        {options.map(({ type, place }) => {
          const metadata = SAVED_PLACE_META[type];
          return (
            <Pressable
              key={`${place.latitude},${place.longitude}`}
              style={styles.savedPlace}
              onPress={() => onSelect(place)}
              testID={`saved-location-${metadata.key}`}
            >
              <View style={styles.savedIcon}>
                <Ionicons name={metadata.icon} size={20} color={colors.primary} />
              </View>
              <View style={styles.savedCopy}>
                <Text style={styles.savedLabel}>{metadata.label}</Text>
                <Text style={styles.savedAddress} numberOfLines={1}>{place.label}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>
          );
        })}
      </View>
      {showSearchAnother && (
        <Pressable
          style={styles.searchAnother}
          onPress={() => {


            setMapCoordinate(
              stage === 'drop' && pickup ? coordinatesFrom(pickup) : DEFAULT_CENTER
            );
            resetSearch();
          }}
          testID="search-another-location"
        >
          <Ionicons name="search" size={18} color={colors.primary} />
          <Text style={styles.searchAnotherText}>Search another location</Text>
        </Pressable>
      )}
    </View>
  );

  const renderQuickLocationActions = (
    purpose: 'pickup' | 'drop',
    onSavedLocation: (place: SavedLocation) => void
  ) => (
    <View style={styles.quickActions}>
      <Text style={styles.quickActionsLabel}>Quick select</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.quickActionsRow}
      >
        <Pressable
          style={styles.quickAction}
          onPress={() => handleUseCurrentLocation(true)}
          disabled={isLocating}
          testID={`${purpose}-quick-current-location`}
        >
          <View style={styles.quickActionIcon}>
            {isLocating ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="navigate" size={18} color={colors.primary} />
            )}
          </View>
          <Text style={styles.quickActionText}>Current location</Text>
        </Pressable>
        {savedPlaceOptions.map(({ type, place }) => {
          const metadata = SAVED_PLACE_META[type];
          return (
            <Pressable
              key={`${purpose}-${type}`}
              style={styles.quickAction}
              onPress={() => onSavedLocation(place)}
              testID={`${purpose}-quick-${metadata.key}`}
            >
              <View style={styles.quickActionIcon}>
                <Ionicons name={metadata.icon} size={18} color={colors.primary} />
              </View>
              <Text style={styles.quickActionText}>{metadata.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  const renderLocationSelection = () => {
    const purpose = isSelectingPickup ? 'pickup' : 'drop';
    return (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {renderProgress()}
        <Text style={styles.title}>
          {isSelectingPickup ? 'Select your pickup' : 'Where are you going?'}
        </Text>
        <Text style={styles.subtitle}>
          {isSelectingPickup
            ? 'Search or move the map to choose where your ride starts.'
            : 'Search or move the map to choose your destination.'}
        </Text>

        <LocationSelectionMap
          key={`${stage}-${purpose}`}
          coordinate={mapCoordinate}
          onCoordinateChange={handleMapCoordinateChange}
          onMapLocationSelected={handleMapLocationSelected}
          onUseCurrentLocation={() => handleUseCurrentLocation(true)}
          isLocating={isLocating}
          height={230}
        />

        {renderQuickLocationActions(
          purpose,
          isSelectingPickup ? selectSavedPickup : selectSavedDrop
        )}

        <View style={styles.searchBox}>
          <Ionicons name="search" size={19} color={colors.textTertiary} />
          <TextInput
            testID={`${purpose}-location-search`}
            value={query}
            onChangeText={setQuery}
            placeholder={isSelectingPickup ? 'Search pickup location' : 'Search drop location'}
            placeholderTextColor={colors.textTertiary}
            style={styles.searchInput}
            autoCorrect={false}
            returnKeyType="search"
          />
          {searching && <ActivityIndicator size="small" color={colors.primary} />}
        </View>

        {query.length >= 3 && (
          <View style={styles.searchResults}>
            {searchError ? (
              <Text style={styles.errorText}>{searchError}</Text>
            ) : searchResults.length > 0 ? (
              searchResults.map((result) => (
                <Pressable
                  key={result.id}
                  style={styles.searchResult}
                  onPress={() => selectSearchResult(result)}
                  testID={`${purpose}-result-${result.id}`}
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
            <Text style={styles.attribution}>Search and map data by OpenStreetMap</Text>
          </View>
        )}

        {currentLocationError && <Text style={styles.errorText}>{currentLocationError}</Text>}

        {resolvingLocation && (
          <View style={styles.resolvingCard}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.resolvingText}>Selecting location…</Text>
          </View>
        )}
      </ScrollView>
    );
  };

  const renderClassification = (role: 'pickup' | 'drop') => {
    const location = role === 'pickup' ? pickup : destination;
    return (
      <ScrollView contentContainerStyle={styles.centeredContent} showsVerticalScrollIndicator={false}>
        {renderProgress()}
        <View style={styles.questionIcon}>
          <Ionicons name={role === 'pickup' ? 'location' : 'flag'} size={28} color={colors.primary} />
        </View>
        <Text style={styles.questionTitle}>
          Is this your Home, Office or College?
        </Text>
        <Text style={styles.questionLocation} numberOfLines={3}>{location?.address}</Text>
        <Text style={styles.questionHint}>
          Save it for faster pickup and drop selection next time.
        </Text>

        <View style={styles.classificationGrid}>
          {CLASSIFICATIONS.map((option) => (
            <Pressable
              key={option.key}
              style={styles.classificationButton}
              onPress={() => void saveClassification(option.key)}
              disabled={savingLocation}
              testID={`save-${role}-${option.key}`}
            >
              <View style={styles.classificationIcon}>
                <Ionicons name={option.icon} size={22} color={colors.primary} />
              </View>
              <Text style={styles.classificationText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
        {savingLocation && <ActivityIndicator color={colors.primary} style={styles.saving} />}
      </ScrollView>
    );
  };

  const renderDropChoice = () => {
    const choices = savedPlaceOptions.filter(
      ({ place }) =>
        !savedDefaultDrop ||
        Math.abs(place.latitude - savedDefaultDrop.latitude) > 0.000001 ||
        Math.abs(place.longitude - savedDefaultDrop.longitude) > 0.000001
    );
    return (
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {renderProgress()}
        <Text style={styles.title}>Choose your drop</Text>
        <Text style={styles.subtitle}>Use a saved place or choose a new destination.</Text>

        {savedDefaultDrop && (
          <Pressable
            style={styles.defaultPlace}
            onPress={() => selectSavedDrop(savedDefaultDrop)}
            testID="saved-default-drop"
          >
            <View style={styles.defaultPlaceIcon}>
              <Ionicons name="bookmark" size={22} color={colors.textInverse} />
            </View>
            <View style={styles.savedCopy}>
              <Text style={styles.defaultPlaceLabel}>Default drop</Text>
              <Text style={styles.defaultPlaceAddress} numberOfLines={2}>
                {savedDefaultDrop.label}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={colors.primary} />
          </Pressable>
        )}

        {choices.length > 0 && renderSavedPlaces(choices, selectSavedDrop, false)}
        <PrimaryButton
          title="Search another drop location"
          icon="search"
          variant="secondary"
          onPress={() => openDropSelection(true)}
          testID="search-another-drop"
        />
      </ScrollView>
    );
  };

  const renderRoute = () => {
    if (!pickup || !destination) return null;
    return (
      <ScrollView contentContainerStyle={styles.routeContent} showsVerticalScrollIndicator={false}>
        {renderProgress()}
        <Text style={styles.title}>Your route is ready</Text>
        <Text style={styles.subtitle}>The line follows real road geometry from OpenStreetMap routing.</Text>

        <LeafletMap
          pickup={coordinatesFrom(pickup)}
          destination={coordinatesFrom(destination)}
          driverRoute={route?.source === 'road' ? route.geometry : undefined}
          allowStraightLineFallback={false}
          pickupLabel={pickup.label}
          destinationLabel={destination.label}
          height={330}
          showLocateButton={false}
        />

        <View style={styles.routeLocations}>
          <View style={styles.routeLocationRow}>
            <View style={[styles.routeDot, { backgroundColor: colors.primary }]} />
            <View style={styles.routeLocationCopy}>
              <Text style={styles.routeLocationLabel}>PICKUP</Text>
              <Text style={styles.routeLocationText} numberOfLines={2}>{pickup.address}</Text>
            </View>
            <Pressable
              onPress={() => {
                setMapCoordinate(coordinatesFrom(pickup));


                resetSearch();
                setStage('pickup');
              }}
              hitSlop={8}
            >
              <Text style={styles.editText}>Edit</Text>
            </Pressable>
          </View>
          <View style={styles.routeLocationRow}>
            <View style={[styles.routeDot, styles.routeDropDot]} />
            <View style={styles.routeLocationCopy}>
              <Text style={styles.routeLocationLabel}>DROP</Text>
              <Text style={styles.routeLocationText} numberOfLines={2}>{destination.address}</Text>
            </View>
            <Pressable
              onPress={() => {
                setMapCoordinate(coordinatesFrom(destination));


                setDropBackTarget(savedDefaultDrop ? null : 'pickup');
                resetSearch();
                setStage(savedDefaultDrop ? 'dropChoice' : 'drop');
              }}
              hitSlop={8}
            >
              <Text style={styles.editText}>Edit</Text>
            </Pressable>
          </View>
        </View>

        {routeLoading ? (
          <View style={styles.routeLoading}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.routeLoadingText}>Calculating the real road route…</Text>
          </View>
        ) : routeError ? (
          <View style={styles.routeError}>
            <Ionicons name="alert-circle" size={20} color={colors.error} />
            <Text style={styles.routeErrorText}>{routeError}</Text>
            <Pressable onPress={() => setRouteRequest((value) => value + 1)}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}

        <PrimaryButton
          testID="route-continue"
          title="Continue"
          disabled={!route || routeLoading}
          onPress={completeFlow}
        />
      </ScrollView>
    );
  };

  const screen = stage === 'pickup' || stage === 'drop'
    ? renderLocationSelection()
    : stage === 'pickupType'
      ? renderClassification('pickup')
      : stage === 'dropChoice'
        ? renderDropChoice()
        : stage === 'dropType'
          ? renderClassification('drop')
          : renderRoute();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']} testID="ride-location-flow">
      <View style={styles.header}>
        <Pressable style={styles.headerButton} onPress={goBack} hitSlop={10} testID="location-flow-back">
          <Ionicons name="arrow-back" size={21} color={colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {stage === 'route' ? 'Route preview' : isSelectingPickup ? 'Select pickup' : isSelectingDrop ? 'Select drop' : 'Plan your ride'}
        </Text>
        <View style={styles.headerButton} />
      </View>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {screen}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const SAVED_PLACE_META: Record<
  SavedLocationType,
  { key: SavedLocationType; label: string; icon: 'home-outline' | 'briefcase-outline' | 'school-outline' }
> = {
  home: { key: 'home', label: 'Home', icon: 'home-outline' },
  office: { key: 'office', label: 'Office', icon: 'briefcase-outline' },
  college: { key: 'college', label: 'College', icon: 'school-outline' },
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
  headerTitle: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.bold },
  content: { padding: spacing.xl, paddingBottom: 36 },
  centeredContent: {
    flexGrow: 1,
    padding: spacing.xl,
    paddingBottom: 36,
    justifyContent: 'center',
  },
  routeContent: { padding: spacing.xl, paddingBottom: 36 },

  progressRow: {
    position: 'relative',
    width: '100%',
    height: 52,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  progressTrack: {
    position: 'absolute',
    top: 14,
    left: 36,
    right: 36,
    height: 2,
    backgroundColor: colors.border,
  },
  progressFill: { height: 2, backgroundColor: colors.primary },
  progressItem: { width: 72, minWidth: 0, alignItems: 'center' },
  progressDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  progressDotActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  progressDotCurrent: { backgroundColor: colors.primaryLight },
  progressNumber: { fontSize: 11, color: colors.textTertiary, fontWeight: font.weight.bold },
  progressNumberActive: { color: colors.primary },
  progressLabel: { marginTop: 5, fontSize: 10, color: colors.textTertiary, fontWeight: font.weight.medium },
  progressLabelActive: { color: colors.primary, fontWeight: font.weight.bold },

  title: { fontSize: font.size['2xl'], color: colors.textPrimary, fontWeight: font.weight.bold, lineHeight: 32 },
  subtitle: { marginTop: spacing.xs, marginBottom: spacing.lg, fontSize: font.size.sm, color: colors.textSecondary, lineHeight: 20 },

  quickActions: { marginTop: spacing.lg },
  quickActionsLabel: { marginBottom: spacing.sm, color: colors.textSecondary, fontSize: font.size.xs, fontWeight: font.weight.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  quickActionsRow: { gap: spacing.sm, paddingRight: spacing.lg },
  quickAction: { minWidth: 92, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  quickActionIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: colors.primaryLight },
  quickActionText: { color: colors.textPrimary, fontSize: font.size.xs, fontWeight: font.weight.medium },

  searchBox: {
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, height: 48, color: colors.textPrimary, fontSize: font.size.base },
  searchResults: {
    marginTop: spacing.sm,
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
  attribution: { padding: 6, textAlign: 'right', color: colors.textTertiary, fontSize: 9 },
  noResults: { padding: spacing.md, textAlign: 'center', color: colors.textSecondary, fontSize: font.size.sm },
  errorText: { marginTop: spacing.sm, color: colors.error, fontSize: font.size.xs, lineHeight: 17 },

  savedSection: { marginTop: spacing.lg },
  savedHeading: { marginBottom: spacing.sm, color: colors.textSecondary, fontSize: font.size.xs, fontWeight: font.weight.bold, textTransform: 'uppercase', letterSpacing: 0.5 },
  savedGrid: { gap: spacing.sm },
  savedPlace: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  savedIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19, backgroundColor: colors.primaryLight },
  savedCopy: { flex: 1 },
  savedLabel: { color: colors.textPrimary, fontSize: font.size.sm, fontWeight: font.weight.bold },
  savedAddress: { marginTop: 2, color: colors.textSecondary, fontSize: font.size.xs },
  searchAnother: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: radius.md,
  },
  searchAnotherText: { color: colors.primary, fontSize: font.size.base, fontWeight: font.weight.medium },

  resolvingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
  },
  resolvingText: { color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.medium },

  questionIcon: { width: 58, height: 58, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: 29, backgroundColor: colors.primaryLight },
  questionTitle: { marginTop: spacing.lg, textAlign: 'center', color: colors.textPrimary, fontSize: font.size.xl, lineHeight: 30, fontWeight: font.weight.bold },
  questionLocation: { marginTop: spacing.md, textAlign: 'center', color: colors.primary, fontSize: font.size.sm, lineHeight: 20 },
  questionHint: { marginTop: spacing.sm, textAlign: 'center', color: colors.textSecondary, fontSize: font.size.sm, lineHeight: 20 },
  classificationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing['2xl'] },
  classificationButton: { width: '46%', minHeight: 94, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow.sm },
  classificationIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.primaryLight },
  classificationText: { color: colors.textPrimary, fontSize: font.size.base, fontWeight: font.weight.medium },
  saving: { marginTop: spacing.lg },

  defaultPlace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radius.lg,
    backgroundColor: colors.primaryLight,
  },
  defaultPlaceIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: colors.primary },
  defaultPlaceLabel: { color: colors.primary, fontSize: font.size.xs, fontWeight: font.weight.bold, textTransform: 'uppercase' },
  defaultPlaceAddress: { marginTop: 2, color: colors.textPrimary, fontSize: font.size.base, fontWeight: font.weight.medium },

  routeLocations: { marginTop: spacing.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  routeLocationRow: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  routeDot: { width: 12, height: 12, borderRadius: 6 },
  routeDropDot: { borderRadius: 2, backgroundColor: colors.error },
  routeLocationCopy: { flex: 1 },
  routeLocationLabel: { color: colors.textTertiary, fontSize: 10, fontWeight: font.weight.bold, letterSpacing: 0.5 },
  routeLocationText: { marginTop: 3, color: colors.textPrimary, fontSize: font.size.sm, lineHeight: 18 },
  editText: { color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.medium },
  routeLoading: { minHeight: 72, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, marginVertical: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surface },
  routeLoadingText: { color: colors.textSecondary, fontSize: font.size.sm },
  routeError: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.lg, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.errorLight },
  routeErrorText: { flex: 1, color: colors.error, fontSize: font.size.xs, lineHeight: 17 },
  retryText: { color: colors.error, fontSize: font.size.sm, fontWeight: font.weight.bold, textTransform: 'uppercase' },
});
