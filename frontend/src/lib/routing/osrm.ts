export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface RouteGeometry {
  type: 'LineString';
  coordinates: [number, number][]; // [lon, lat] format GeoJSON
}

export type OSRMRouteSource = 'road' | 'fallback';

export interface OSRMRouteResponse {
  distance: number; // in meters
  duration: number; // in seconds
  geometry: RouteGeometry;
  source: OSRMRouteSource;
}

// In-memory cache for OSRM routes to avoid repeated network calls
const routeCache = new Map<string, OSRMRouteResponse>();

/**
 * Generates a lightweight fallback for legacy matching callers when OSRM is unavailable.
 * UI map consumers must check `source === 'road'` before drawing this geometry.
 */
function generateFallbackRoute(origin: Coordinates, destination: Coordinates): OSRMRouteResponse {
  const steps = 25;
  const coords: [number, number][] = [];
  const dx = destination.longitude - origin.longitude;
  const dy = destination.latitude - origin.latitude;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // Add small realistic road curve/perturbation
    const curveOffset = Math.sin(t * Math.PI) * 0.003;
    const lon = origin.longitude + dx * t + (i % 2 === 0 ? curveOffset : -curveOffset * 0.5);
    const lat = origin.latitude + dy * t + Math.cos(t * Math.PI * 0.5) * 0.001;
    coords.push([lon, lat]);
  }

  // Rough distance estimation (Haversine approximation * 1.3 for road curvature)
  const dLat = (destination.latitude - origin.latitude) * (Math.PI / 180);
  const dLon = (destination.longitude - origin.longitude) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(origin.latitude * (Math.PI / 180)) *
      Math.cos(destination.latitude * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const directDistanceKm = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const roadDistanceMeters = directDistanceKm * 1.3 * 1000;

  return {
    distance: Math.round(roadDistanceMeters),
    duration: Math.round(roadDistanceMeters / 12), // ~40km/h average speed
    geometry: {
      type: 'LineString',
      coordinates: coords,
    },
    source: 'fallback',
  };
}

/**
 * Fetches actual road-following route from OSRM.
 */
export async function fetchOSRMRoute(
  origin: Coordinates,
  destination: Coordinates
): Promise<OSRMRouteResponse> {
  const cacheKey = `${origin.latitude.toFixed(4)},${origin.longitude.toFixed(4)};${destination.latitude.toFixed(4)},${destination.longitude.toFixed(4)}`;

  if (routeCache.has(cacheKey)) {
    return routeCache.get(cacheKey)!;
  }

  const url = `https://router.project-osrm.org/route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}?overview=full&geometries=geojson`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`OSRM API error: ${response.status}`);
      }
      const data = await response.json();
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const result: OSRMRouteResponse = {
          distance: route.distance,
          duration: route.duration,
          geometry: route.geometry,
          source: 'road',
        };
        routeCache.set(cacheKey, result);
        return result;
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.warn('OSRM request failed or timed out, using fallback route geometry:', err);
  }

  return generateFallbackRoute(origin, destination);
}
