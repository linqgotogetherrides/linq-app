import { Coordinates, RouteGeometry } from './osrm';

/**
 * Calculates Haversine distance between two coordinates in kilometers.
 */
export function haversineDistanceKm(p1: Coordinates, p2: Coordinates): number {
  const R = 6371; // Earth radius in km
  const dLat = (p2.latitude - p1.latitude) * (Math.PI / 180);
  const dLon = (p2.longitude - p1.longitude) * (Math.PI / 180);
  const lat1 = p1.latitude * (Math.PI / 180);
  const lat2 = p2.latitude * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates the shortest distance in km from a point P to a line segment AB.
 */
export function distanceToSegmentKm(p: Coordinates, a: Coordinates, b: Coordinates): number {
  // Convert coordinates to planar meters around reference latitude for accurate distance
  const refLat = p.latitude * (Math.PI / 180);
  const metersPerDegreeLat = 111000;
  const metersPerDegreeLon = 111000 * Math.cos(refLat);

  const px = p.longitude * metersPerDegreeLon;
  const py = p.latitude * metersPerDegreeLat;
  const ax = a.longitude * metersPerDegreeLon;
  const ay = a.latitude * metersPerDegreeLat;
  const bx = b.longitude * metersPerDegreeLon;
  const by = b.latitude * metersPerDegreeLat;

  const dx = bx - ax;
  const dy = by - ay;

  if (dx === 0 && dy === 0) {
    // Segment is a single point
    return haversineDistanceKm(p, a);
  }

  // Project point P onto segment AB parameter t
  let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));

  const projX = ax + t * dx;
  const projY = ay + t * dy;

  const distMeters = Math.hypot(px - projX, py - projY);
  return distMeters / 1000;
}

/**
 * Minimum distance in km from a point to an entire route (LineString).
 */
export function distanceToRouteKm(point: Coordinates, route: RouteGeometry): number {
  const coords = route.coordinates;
  if (coords.length === 0) return Infinity;
  if (coords.length === 1) {
    return haversineDistanceKm(point, { latitude: coords[0][1], longitude: coords[0][0] });
  }

  let minDistance = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = { latitude: coords[i][1], longitude: coords[i][0] };
    const b = { latitude: coords[i + 1][1], longitude: coords[i + 1][0] };
    const dist = distanceToSegmentKm(point, a, b);
    if (dist < minDistance) {
      minDistance = dist;
    }
  }

  return minDistance;
}

/**
 * Samples points along a route at fixed distance intervals (default: every 150 meters).
 */
export function sampleRoutePoints(
  route: RouteGeometry,
  intervalKm: number = 0.15
): Coordinates[] {
  const coords = route.coordinates;
  if (coords.length === 0) return [];

  const sampled: Coordinates[] = [];
  sampled.push({ latitude: coords[0][1], longitude: coords[0][0] });

  let accumulatedDist = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = { latitude: coords[i][1], longitude: coords[i][0] };
    const p2 = { latitude: coords[i + 1][1], longitude: coords[i + 1][0] };
    const segmentDist = haversineDistanceKm(p1, p2);

    if (segmentDist === 0) continue;

    accumulatedDist += segmentDist;

    if (accumulatedDist >= intervalKm) {
      sampled.push(p2);
      accumulatedDist = 0;
    }
  }

  // Always ensure destination point is included
  const lastCoord = coords[coords.length - 1];
  const lastPoint = { latitude: lastCoord[1], longitude: lastCoord[0] };
  const prevPoint = sampled[sampled.length - 1];
  if (!prevPoint || haversineDistanceKm(prevPoint, lastPoint) > 0.05) {
    sampled.push(lastPoint);
  }

  return sampled;
}

/**
 * Calculates initial bearing / direction angle (0..360 degrees) of a route.
 */
export function calculateRouteBearing(route: RouteGeometry): number {
  const coords = route.coordinates;
  if (coords.length < 2) return 0;

  const start = { latitude: coords[0][1], longitude: coords[0][0] };
  const end = { latitude: coords[coords.length - 1][1], longitude: coords[coords.length - 1][0] };

  const lat1 = start.latitude * (Math.PI / 180);
  const lat2 = end.latitude * (Math.PI / 180);
  const dLon = (end.longitude - start.longitude) * (Math.PI / 180);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  let brng = Math.atan2(y, x) * (180 / Math.PI);
  return (brng + 360) % 360;
}

/**
 * Total length of a route in kilometers.
 */
export function calculateRouteLengthKm(route: RouteGeometry): number {
  const coords = route.coordinates;
  let length = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = { latitude: coords[i][1], longitude: coords[i][0] };
    const p2 = { latitude: coords[i + 1][1], longitude: coords[i + 1][0] };
    length += haversineDistanceKm(p1, p2);
  }
  return length;
}
