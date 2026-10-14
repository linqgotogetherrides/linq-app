import { useEffect, useRef, useState } from 'react';

import { fetchOSRMRoute } from '@/src/lib/routing/osrm';
import type { SavedLocation } from '@/src/types';

export interface RouteMetrics {
  distanceMeters: number;
  durationSeconds: number;
}

/**
 * Computes the road route between the two selected locations.
 *
 * This lives outside the location selector on purpose: pickup and drop are now
 * chosen independently, so the route is derived from whatever pair is currently
 * valid instead of from a dedicated preview screen. A request id discards stale
 * responses when either location changes mid-flight.
 */
export function useRouteMetrics(
  pickup: SavedLocation | null,
  destination: SavedLocation | null
): {
  metrics: RouteMetrics | null;
  loading: boolean;
  error: string | null;
} {
  const [metrics, setMetrics] = useState<RouteMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);

  // Primitive deps so callers may pass freshly built objects without causing
  // an endless refetch.
  const fromLat = pickup?.latitude ?? null;
  const fromLng = pickup?.longitude ?? null;
  const toLat = destination?.latitude ?? null;
  const toLng = destination?.longitude ?? null;

  useEffect(() => {
    if (fromLat === null || fromLng === null || toLat === null || toLng === null) {
      setMetrics(null);
      setError(null);
      setLoading(false);
      return undefined;
    }

    const requestId = ++requestRef.current;
    let active = true;
    setLoading(true);
    setError(null);

    void fetchOSRMRoute(
      { latitude: fromLat, longitude: fromLng },
      { latitude: toLat, longitude: toLng }
    )
      .then((result) => {
        if (!active || requestId !== requestRef.current) return;
        if (result.source !== 'road') throw new Error('Actual road route unavailable');
        setMetrics({ distanceMeters: result.distance, durationSeconds: result.duration });
      })
      .catch(() => {
        if (!active || requestId !== requestRef.current) return;
        // The route line is a nice-to-have; the selection stays valid.
        setMetrics(null);
        setError('Route preview unavailable. Your locations are still set.');
      })
      .finally(() => {
        if (active && requestId === requestRef.current) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [fromLat, fromLng, toLat, toLng]);

  return { metrics, loading, error };
}