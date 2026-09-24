import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import type { LocationCoordinates } from '@/src/services/locationService';
import { colors, radius, shadow, spacing } from '@/src/theme/tokens';

interface Props {
  coordinate: LocationCoordinates;
  onCoordinateChange: (coordinate: LocationCoordinates) => void;
  onMapLocationSelected?: (coordinate: LocationCoordinates) => void;
  onUseCurrentLocation?: () => void;
  isLocating?: boolean;
  height?: number;
  style?: any;
}

type MapMessage =
  | { type: 'linq-map-ready' }
  | { type: 'linq-map-center'; latitude: number; longitude: number };

const DEFAULT_CENTER: LocationCoordinates = {
  latitude: 17.44,
  longitude: 78.38,
};

function validCoordinate(coordinate?: LocationCoordinates | null): LocationCoordinates {
  if (
    coordinate &&
    Number.isFinite(coordinate.latitude) &&
    Number.isFinite(coordinate.longitude) &&
    coordinate.latitude >= -90 &&
    coordinate.latitude <= 90 &&
    coordinate.longitude >= -180 &&
    coordinate.longitude <= 180
  ) {
    return coordinate;
  }
  return DEFAULT_CENTER;
}

function buildMapHtml(coordinate: LocationCoordinates) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map {
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      background: #eef5fb;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .leaflet-control-attribution { font-size: 9px !important; }
    .selection-marker {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: 4px solid white;
      background: #0066ff;
      box-shadow: 0 3px 10px rgba(0, 0, 0, 0.35);
    }
    .selection-marker::after {
      content: "";
      display: block;
      width: 6px;
      height: 6px;
      margin: 6px auto;
      border-radius: 50%;
      background: white;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var initialCenter = [${coordinate.latitude}, ${coordinate.longitude}];
    var map = L.map('map', {
      zoomControl: false,
      attributionControl: true
    }).setView(initialCenter, 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    var selectionIcon = L.divIcon({
      className: 'selection-marker-wrapper',
      html: '<div class="selection-marker"></div>',
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
    var selectionMarker = L.marker(initialCenter, {
      icon: selectionIcon,
      interactive: false
    }).addTo(map);

    function sendMessage(payload) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(payload));
      } else if (window.parent !== window) {
        window.parent.postMessage(payload, '*');
      }
    }

    var suppressNextCenterReport = false;
    var userInteracted = false;
    map.on('dragend', function() { userInteracted = true; });
    map.on('zoomend', function() { userInteracted = true; });
    function reportCenter() {
      if (!userInteracted) return;
      if (suppressNextCenterReport) {
        suppressNextCenterReport = false;
        return;
      }
      var center = map.getCenter();
      selectionMarker.setLatLng(center);
      sendMessage({
        type: 'linq-map-center',
        latitude: center.lat,
        longitude: center.lng
      });
    }

    window.linqFocusMap = function(latitude, longitude, zoom) {
      var current = map.getCenter();
      if (Math.abs(current.lat - latitude) < 0.000001 && Math.abs(current.lng - longitude) < 0.000001) {
        return;
      }
      suppressNextCenterReport = true;
      selectionMarker.setLatLng([latitude, longitude]);
      map.setView([latitude, longitude], zoom || Math.max(map.getZoom(), 15), {
        animate: true
      });
      window.setTimeout(function() { suppressNextCenterReport = false; }, 1000);
    };

    window.addEventListener('message', function(event) {
      var message = event.data;
      if (message && message.type === 'linq-focus-map') {
        window.linqFocusMap(message.latitude, message.longitude, message.zoom);
      }
    });

    map.on('moveend', reportCenter);
    sendMessage({ type: 'linq-map-ready' });
  </script>
</body>
</html>`;
}

export default function LocationSelectionMap({
  coordinate,
  onCoordinateChange,
  onMapLocationSelected,
  onUseCurrentLocation,
  isLocating = false,
  height = 220,
  style,
}: Props) {
  const [initialCoordinate] = React.useState(() => validCoordinate(coordinate));
  const [mapReady, setMapReady] = useState(false);
  const nativeMapRef = useRef<WebView>(null);
  const webMapRef = useRef<HTMLIFrameElement | null>(null);
  const lastCenterRef = useRef<LocationCoordinates>(initialCoordinate);
  const callbackRef = useRef(onCoordinateChange);
  const selectionCallbackRef = useRef(onMapLocationSelected);
  const htmlContent = React.useMemo(
    () => buildMapHtml(initialCoordinate),
    [initialCoordinate]
  );
  const nativeSource = React.useMemo(() => ({ html: htmlContent }), [htmlContent]);

  callbackRef.current = onCoordinateChange;
  selectionCallbackRef.current = onMapLocationSelected;

  const applyCenterMessage = (message: MapMessage) => {
    if (message.type === 'linq-map-ready') {
      setMapReady(true);
      return;
    }
    if (
      message.type !== 'linq-map-center' ||
      !Number.isFinite(message.latitude) ||
      !Number.isFinite(message.longitude)
    ) {
      return;
    }

    const next = {
      latitude: message.latitude,
      longitude: message.longitude,
    };
    lastCenterRef.current = next;
    callbackRef.current(next);
    selectionCallbackRef.current?.(next);
  };

  const focusCoordinate = (next: LocationCoordinates, zoom = 16) => {
    lastCenterRef.current = next;
    if (Platform.OS === 'web') {
      webMapRef.current?.contentWindow?.postMessage(
        { type: 'linq-focus-map', latitude: next.latitude, longitude: next.longitude, zoom },
        '*'
      );
      return;
    }

    nativeMapRef.current?.injectJavaScript(
      `window.linqFocusMap(${next.latitude}, ${next.longitude}, ${zoom}); true;`
    );
  };

  useEffect(() => {
    const next = validCoordinate(coordinate);
    const changed =
      Math.abs(next.latitude - lastCenterRef.current.latitude) > 0.000001 ||
      Math.abs(next.longitude - lastCenterRef.current.longitude) > 0.000001;
    if (mapReady && changed) focusCoordinate(next);
  }, [coordinate, mapReady]);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;

    const onMessage = (event: MessageEvent) => {
      if (event.source !== webMapRef.current?.contentWindow) return;
      const message = event.data as MapMessage | undefined;
      if (message?.type === 'linq-map-ready' || message?.type === 'linq-map-center') {
        applyCenterMessage(message);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const handleNativeMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      applyCenterMessage(JSON.parse(event.nativeEvent.data) as MapMessage);
    } catch {
      // Ignore non-map WebView messages.
    }
  };

  const mapContent =
    Platform.OS === 'web' ? (
      <iframe
        ref={webMapRef}
        srcDoc={htmlContent}
        onLoad={() => setMapReady(true)}
        style={{ width: '100%', height: '100%', border: 'none' }}
        title="OpenStreetMap location selection map"
      />
    ) : (
      <WebView
        ref={nativeMapRef}
        source={nativeSource}
        style={styles.webView}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        nestedScrollEnabled
        bounces={false}
        onMessage={handleNativeMessage}
        onLoadEnd={() => {
          setMapReady(true);
          focusCoordinate(validCoordinate(coordinate), 16);
        }}
      />
    );

  return (
    <View style={[styles.container, { height }, style]} testID="location-selection-map">
      {mapContent}
      {!mapReady && (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Loading map…</Text>
        </View>
      )}
      <View pointerEvents="none" style={styles.hint}>
        <Ionicons name="move" size={13} color={colors.textPrimary} />
        <Text style={styles.hintText}>Move the map to choose an area</Text>
      </View>
      {onUseCurrentLocation && (
        <Pressable
          style={styles.locateButton}
          onPress={onUseCurrentLocation}
          disabled={isLocating}
          testID="picker-use-current-location"
          accessibilityLabel="Use my current location"
        >
          {isLocating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Ionicons name="locate" size={20} color={colors.primary} />
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
  },
  webView: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surfaceSecondary,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  hint: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    maxWidth: '72%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.94)',
    ...shadow.sm,
  },
  hintText: {
    color: colors.textPrimary,
    fontSize: 11,
    fontWeight: '500',
  },
  locateButton: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.sm,
  },
});
