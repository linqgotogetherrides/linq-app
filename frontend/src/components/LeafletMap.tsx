import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '@/src/theme/tokens';
import type { Coordinates, RouteGeometry } from '@/src/lib/routing/osrm';

export interface LeafletMapProps {
  pickup: Coordinates;
  destination: Coordinates;
  userRoute?: RouteGeometry;
  driverRoute?: RouteGeometry;
  pickupLabel?: string;
  destinationLabel?: string;
  currentLocation?: Coordinates & { accuracy?: number | null };
  centerOnCurrentLocation?: boolean;
  allowStraightLineFallback?: boolean;
  sharedDistanceKm?: number;
  matchScore?: number;
  height?: number | string;
  style?: any;
  showLocateButton?: boolean;
  onLocateMe?: () => void;
  isLocating?: boolean;
}

export default function LeafletMap({
  pickup,
  destination,
  userRoute,
  driverRoute,
  pickupLabel = 'Pickup',
  destinationLabel = 'Drop',
  currentLocation,
  centerOnCurrentLocation = false,
  allowStraightLineFallback = false,
  sharedDistanceKm,
  matchScore,
  height = 220,
  style,
  showLocateButton = true,
  onLocateMe,
  isLocating = false,
}: LeafletMapProps) {
  const webViewRef = React.useRef<WebView>(null);
  const driverCoordsJson = JSON.stringify(driverRoute?.coordinates || []);
  const userCoordsJson = JSON.stringify(userRoute?.coordinates || []);
  const currentLatitude = currentLocation?.latitude ?? null;
  const currentLongitude = currentLocation?.longitude ?? null;
  const currentAccuracy = currentLocation?.accuracy ?? null;
  const escapeHtml = (value: string) =>
    value.replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    })[character] || character);
  const safePickupLabel = escapeHtml(pickupLabel);
  const safeDestinationLabel = escapeHtml(destinationLabel);

  const htmlContent = `
<!DOCTYPE html>
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
      background-color: #f4f8ff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .leaflet-bar { border: none !important; box-shadow: 0 2px 8px rgba(0,0,0,0.12) !important; }
    .badge-label {
      background: #0066FF;
      color: white;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
      box-shadow: 0 2px 6px rgba(0,102,255,0.3);
    }
    .marker-pin {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #0066FF;
      border: 3px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }
    .marker-pin.drop {
      background: #E53E3E;
    }
    .current-location-pin {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #0066FF;
      border: 3px solid #FFFFFF;
      box-shadow: 0 0 0 4px rgba(0, 102, 255, 0.3);
      animation: pulse-ring 2s infinite;
    }
    @keyframes pulse-ring {
      0% { box-shadow: 0 0 0 0 rgba(0, 102, 255, 0.5); }
      70% { box-shadow: 0 0 0 10px rgba(0, 102, 255, 0); }
      100% { box-shadow: 0 0 0 0 rgba(0, 102, 255, 0); }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var pLat = ${pickup.latitude};
    var pLng = ${pickup.longitude};
    var dLat = ${destination.latitude};
    var dLng = ${destination.longitude};

    var map = L.map('map', {
      zoomControl: false,
      attributionControl: true
    }).setView([pLat, pLng], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    var driverCoords = ${driverCoordsJson};
    var userCoords = ${userCoordsJson};

    var bounds = L.latLngBounds();
    var currentLat = ${currentLatitude};
    var currentLng = ${currentLongitude};
    var currentAccuracy = ${currentAccuracy};
    var centerOnCurrentLocation = ${centerOnCurrentLocation ? 'true' : 'false'};
    var allowStraightLineFallback = ${allowStraightLineFallback ? 'true' : 'false'};

    var userMarker = null;
    var userAccuracyCircle = null;

    function renderUserLocation(lat, lng, accuracy, reCenter) {
      if (userMarker) map.removeLayer(userMarker);
      if (userAccuracyCircle) map.removeLayer(userAccuracyCircle);

      if (lat !== null && lng !== null) {
        if (accuracy !== null && accuracy > 0) {
          userAccuracyCircle = L.circle([lat, lng], {
            radius: accuracy,
            color: '#0066FF',
            fillColor: '#0066FF',
            fillOpacity: 0.12,
            weight: 1.5
          }).addTo(map);
        }
        var currentIcon = L.divIcon({
          className: 'current-location-icon',
          html: "<div class='current-location-pin'></div>",
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        userMarker = L.marker([lat, lng], { icon: currentIcon })
          .addTo(map)
          .bindPopup('<b>You are here</b>' + (accuracy ? '<br/>Accuracy: ~' + Math.round(accuracy) + 'm' : ''));

        if (reCenter) {
          map.setView([lat, lng], 15, { animate: true });
        }
      }
    }

    window.updateUserLocation = renderUserLocation;

    if (currentLat !== null && currentLng !== null) {
      renderUserLocation(currentLat, currentLng, currentAccuracy, centerOnCurrentLocation);
      bounds.extend([currentLat, currentLng]);
    }

    // 1. Driver/Primary Route Line (Blue)
    if (driverCoords.length > 0) {
      var latLngs = driverCoords.map(function(c) { return [c[1], c[0]]; });
      var driverPolyline = L.polyline(latLngs, {
        color: '#0066FF',
        weight: 5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);
      bounds.extend(driverPolyline.getBounds());
    }

    // 2. User Route Line if searching (Secondary/Accent)
    if (userCoords.length > 0) {
      var userLatLngs = userCoords.map(function(c) { return [c[1], c[0]]; });
      var userPolyline = L.polyline(userLatLngs, {
        color: '#3182CE',
        weight: 4,
        opacity: 0.7,
        dashArray: '6, 8',
        lineCap: 'round'
      }).addTo(map);
      bounds.extend(userPolyline.getBounds());
    }

    // 3. Fallback straight line if no route coords supplied
    if (allowStraightLineFallback && driverCoords.length === 0 && userCoords.length === 0) {
      var fallbackPolyline = L.polyline([[pLat, pLng], [dLat, dLng]], {
        color: '#0066FF',
        weight: 4,
        dashArray: '6, 6'
      }).addTo(map);
      bounds.extend(fallbackPolyline.getBounds());
    }

    // Custom Pickup Marker
    var pickupIcon = L.divIcon({
      className: 'custom-div-icon',
      html: "<div class='marker-pin'></div>",
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    L.marker([pLat, pLng], { icon: pickupIcon }).addTo(map).bindPopup("<b>Pickup:</b> ${safePickupLabel}");
    bounds.extend([pLat, pLng]);

    // Custom Drop Marker
    var dropIcon = L.divIcon({
      className: 'custom-div-icon',
      html: "<div class='marker-pin drop'></div>",
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    L.marker([dLat, dLng], { icon: dropIcon }).addTo(map).bindPopup("<b>Destination:</b> ${safeDestinationLabel}");
    bounds.extend([dLat, dLng]);

    if (centerOnCurrentLocation && currentLat !== null && currentLng !== null) {
      map.setView([currentLat, currentLng], 15);
    } else if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [35, 35] });
    }
  </script>
</body>
</html>
  `;

  const handleLocatePress = () => {
    if (onLocateMe) {
      onLocateMe();
    }
  };

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, { height }, style]}>
        <iframe
          srcDoc={htmlContent}
          style={{ width: '100%', height: '100%', border: 'none', borderRadius: 16 }}
          title="OSRM Leaflet Route Map"
        />
        {showLocateButton && onLocateMe && (
          <Pressable
            style={styles.locateBtn}
            onPress={handleLocatePress}
            hitSlop={8}
            disabled={isLocating}
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

  return (
    <View style={[styles.container, { height }, style]}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        style={{ flex: 1, borderRadius: radius.lg }}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        nestedScrollEnabled
      />
      {showLocateButton && onLocateMe && (
        <Pressable
          style={styles.locateBtn}
          onPress={handleLocatePress}
          hitSlop={8}
          disabled={isLocating}
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
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    position: 'relative',
  },
  locateBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
  },
});
