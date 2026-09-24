import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker, UrlTile } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useCurrentLocation } from '@/src/hooks/useCurrentLocation';
import { CurrentLocation } from '@/src/services/locationService';
import { colors, radius, shadow, spacing } from '@/src/theme/tokens';

interface InteractiveMapProps {
  style?: any;
  showsUserLocation?: boolean;
  onLocationUpdate?: (location: CurrentLocation) => void;
}

export default function InteractiveMap({
  style,
  showsUserLocation = true,
  onLocationUpdate,
}: InteractiveMapProps) {
  const mapRef = useRef<MapView>(null);
  const centerOnNextFix = useRef(true);
  const [mapReady, setMapReady] = useState(false);
  const {
    location,
    status,
    isLoading,
    error,
    requestLocation,
  } = useCurrentLocation({ autoLoad: true });

  useEffect(() => {
    if (!mapReady || !location || !centerOnNextFix.current) return;
    mapRef.current?.animateToRegion(
      {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      },
      1000
    );
    centerOnNextFix.current = false;
    onLocationUpdate?.(location);
  }, [location, mapReady, onLocationUpdate]);

  const locateMe = async () => {
    centerOnNextFix.current = true;
    await requestLocation({ showRationale: true });
  };

  const userHasReliableFix = status === 'located' && !!location;
  const accuracy = location?.accuracy;

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        onMapReady={() => setMapReady(true)}
        showsUserLocation={showsUserLocation && userHasReliableFix}
        showsMyLocationButton={false}
        mapType={Platform.OS === 'android' ? 'none' : 'standard'}
      >
        <UrlTile
          urlTemplate="https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maximumZ={19}
          flipY={false}
        />

        {location && userHasReliableFix && (
          <>
            <Marker
              coordinate={{ latitude: location.latitude, longitude: location.longitude }}
              title="You are here"
              description={accuracy != null ? `Accuracy: ${Math.round(accuracy)}m` : undefined}
              pinColor={colors.primary}
            />
            {accuracy != null && accuracy > 0 && (
              <Circle
                center={{ latitude: location.latitude, longitude: location.longitude }}
                radius={accuracy}
                strokeColor={`${colors.primary}66`}
                fillColor={`${colors.primary}18`}
                strokeWidth={1}
              />
            )}
          </>
        )}
      </MapView>

      <Pressable
        style={styles.locateButton}
        onPress={locateMe}
        disabled={isLoading}
        testID="locate-me-button"
        accessibilityLabel="Locate me"
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <Ionicons name="locate" size={21} color={colors.primary} />
        )}
        <Text style={styles.locateText}>{isLoading ? 'Locating' : 'Locate Me'}</Text>
      </Pressable>

      {isLoading && <Text style={styles.statusText}>Improving GPS accuracy…</Text>}
      {!isLoading && error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSecondary,
  },
  map: {
    flex: 1,
  },
  locateButton: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    ...shadow.sm,
  },
  locateText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '500',
  },
  statusText: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    color: colors.textSecondary,
    fontSize: 11,
    ...shadow.sm,
  },
  errorText: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    color: colors.error,
    fontSize: 11,
    ...shadow.sm,
  },
});
