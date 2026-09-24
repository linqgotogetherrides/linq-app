import { Ride, RideType } from '@/src/types';
import { mockRides } from '@/src/mock/data';
import { fetchOSRMRoute, Coordinates } from '@/src/lib/routing/osrm';
import { haversineDistanceKm } from '@/src/lib/routing/routeGeometry';
import { scoreRideMatch, parseTimeToMinutes } from '@/src/lib/routing/routeScoring';
import { LocationCoordinates } from '@/src/services/locationService';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const createdRides: Ride[] = [];

function getCoordsForRidePlace(place: {
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
}): Coordinates | null {
  const latitude = place.lat ?? place.latitude;
  const longitude = place.lng ?? place.longitude;
  if (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude)
  ) {
    return { latitude, longitude };
  }
  return null;
}

export type SearchQuery = {
  pickup?: string;
  destination?: string;
  time?: string;
  type?: RideType;
  pickupCoordinates?: LocationCoordinates;
  destinationCoordinates?: LocationCoordinates;
  radiusMeters?: number;
};

export const rideService = {
  async getRides(query: SearchQuery = {}): Promise<Ride[]> {
    await delay(300);
    let rides = [...mockRides, ...createdRides];

    if (query.type) {
      rides = rides.filter((r) => r.type === query.type);
    }

    // Nearby mode: use the actual device/search coordinate rather than an
    // address string. Legacy rides without coordinates remain visible but
    // unranked instead of being assigned a fabricated Hyderabad point.
    if (query.pickupCoordinates && !query.destinationCoordinates) {
      const origin = query.pickupCoordinates;
      rides = rides
        .map((ride) => {
          const pickup = getCoordsForRidePlace(ride.pickup);
          if (!pickup) return ride;
          return {
            ...ride,
            distanceKm: haversineDistanceKm(origin, pickup),
          };
        })
        .sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY));
      const radiusKm = (query.radiusMeters ?? 25_000) / 1000;
      return rides.filter((ride) => ride.distanceKm == null || ride.distanceKm <= radiusKm);
    }

    if (query.destinationCoordinates && !query.pickupCoordinates) {
      const destination = query.destinationCoordinates;
      rides = rides
        .map((ride) => {
          const drop = getCoordsForRidePlace(ride.destination);
          if (!drop) return ride;
          return {
            ...ride,
            distanceKm: haversineDistanceKm(destination, drop),
          };
        })
        .sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY));
      return rides;
    }

    if (query.pickupCoordinates && query.destinationCoordinates) {
      const userPickup: Coordinates = {
        latitude: query.pickupCoordinates.latitude,
        longitude: query.pickupCoordinates.longitude,
      };
      const userDrop: Coordinates = {
        latitude: query.destinationCoordinates.latitude,
        longitude: query.destinationCoordinates.longitude,
      };
      const userRoute = await fetchOSRMRoute(userPickup, userDrop);
      const scoredPromises = rides.map(async (ride) => {
        const candidatePickup = getCoordsForRidePlace(ride.pickup);
        const candidateDrop = getCoordsForRidePlace(ride.destination);
        if (!candidatePickup || !candidateDrop) return null;

        const candidateRoute = await fetchOSRMRoute(candidatePickup, candidateDrop);
        if (userRoute.source === 'fallback' || candidateRoute.source === 'fallback') {
          return null;
        }

        const score = scoreRideMatch({
          userPickup,
          userDrop,
          userRoute: userRoute.geometry,
          userTimeMinutes: parseTimeToMinutes(query.time),
          candidatePickup,
          candidateDrop,
          candidateRoute: candidateRoute.geometry,
          candidateTimeMinutes: parseTimeToMinutes(ride.time),
        });

        return {
          ...ride,
          matchScore: score.finalScore,
          matchType: score.matchType,
          sharedDistanceKm: score.sharedDistanceKm,
          matchExplanation: score.matchExplanation,
        };
      });

      const scoredRides: (Ride | null)[] = await Promise.all(scoredPromises);
      const matchedRides = scoredRides.filter((ride): ride is Ride => ride !== null);
      if (matchedRides.length > 0) {
        rides = matchedRides;
        rides.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
      }
    }

    return rides;
  },

  async getRideById(id: string): Promise<Ride | undefined> {
    await delay(150);
    return [...mockRides, ...createdRides].find((r) => r.id === id);
  },

  async requestRide(rideId: string): Promise<{ ok: boolean; status: 'pending' }> {
    await delay(300);
    return { ok: true, status: 'pending' };
  },

  async cancelRequest(_rideId: string): Promise<{ ok: boolean }> {
    await delay(200);
    return { ok: true };
  },

  async createRide(data: Partial<Ride>): Promise<{ ok: boolean; id: string }> {
    await delay(400);
    const pickupLatitude = data.pickup?.lat ?? data.pickup?.latitude;
    const pickupLongitude = data.pickup?.lng ?? data.pickup?.longitude;
    const destinationLatitude = data.destination?.lat ?? data.destination?.latitude;
    const destinationLongitude = data.destination?.lng ?? data.destination?.longitude;
    if (
      !data.pickup ||
      !data.destination ||
      typeof pickupLatitude !== 'number' ||
      typeof pickupLongitude !== 'number' ||
      typeof destinationLatitude !== 'number' ||
      typeof destinationLongitude !== 'number'
    ) {
      throw new Error('Pickup and destination coordinates are required');
    }

    const id = `r_new_${Date.now()}`;
    const ride: Ride = {
      id,
      creator: data.creator || {
        id: 'local-user',
        name: 'You',
        phone: '',
        verification: 'not_verified',
      },
      type: data.type || 'daily',
      pickup: data.pickup,
      destination: data.destination,
      date: data.date,
      time: data.time,
      returnTime: data.returnTime,
      days: data.days,
      pricePerSeat: data.pricePerSeat ?? 0,
      seatsTotal: data.seatsTotal ?? 1,
      seatsAvailable: data.seatsAvailable ?? 1,
      vehicle: data.vehicle,
      womenOnly: data.womenOnly,
      status: data.status || 'active',
      co2Saved: data.co2Saved,
      tags: data.tags,
      distanceKm: data.distanceKm,
    };
    createdRides.unshift(ride);
    return { ok: true, id };
  },

  async getMyRides(): Promise<Ride[]> {
    await delay(200);
    return [...createdRides, ...mockRides].slice(0, 2);
  },
};
