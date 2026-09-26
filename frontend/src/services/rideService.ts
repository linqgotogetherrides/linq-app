import { supabase } from '@/src/lib/supabase';
import { fetchOSRMRoute, Coordinates } from '@/src/lib/routing/osrm';
import { haversineDistanceKm } from '@/src/lib/routing/routeGeometry';
import { scoreRideMatch, parseTimeToMinutes } from '@/src/lib/routing/routeScoring';
import { LocationCoordinates } from '@/src/services/locationService';
import { mockRides } from '@/src/mock/data';
import { Ride, RideStatus, RideType, User, VehicleKind } from '@/src/types';

type DbRow = Record<string, unknown>;

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const createdRides: Ride[] = [];

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePhone(value: unknown): string | undefined {
  const phone = asString(value).replace(/\D/g, '');
  if (!phone) return undefined;
  return phone.length > 10 ? phone.slice(-10) : phone;
}

function normalizeAvatar(value: unknown): string | undefined {
  const url = asString(value).trim();
  if (!url || url.includes('pravatar.cc')) return undefined;
  return url;
}

function asObject(value: unknown): DbRow | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) return asObject(value[0]);
  return value as DbRow;
}

export function mapUserRow(row: DbRow | null | undefined): User {
  const source = row ?? {};
  const gender = asString(source.gender);
  const verification = asString(source.verification_status, 'not_verified');
  return {
    id: asString(source.id),
    name: asString(source.name, 'Rider'),
    age: source.age == null ? undefined : asNumber(source.age),
    gender: gender === 'female' || gender === 'male' || gender === 'other' ? gender : undefined,
    womenOnlyMode: Boolean(source.women_only_mode),
    bio: asString(source.bio) || undefined,
    phone: normalizePhone(source.phone_number),
    email: asString(source.email) || undefined,
    avatarUrl: normalizeAvatar(source.avatar_url),
    rating: source.rating == null ? undefined : asNumber(source.rating),
    trips: source.total_trips == null ? undefined : asNumber(source.total_trips),
    co2Saved: source.co2_saved_kg == null ? undefined : asNumber(source.co2_saved_kg),
    verification:
      verification === 'verified' || verification === 'pending' ? verification : 'not_verified',
  };
}

function pointFromValue(value: unknown): { latitude: number; longitude: number } | null {
  if (typeof value === 'string') {
    const match = value.match(/POINT\s*\(([-\d.]+)\s+([-\d.]+)\)/i);
    if (!match) return null;
    const longitude = Number(match[1]);
    const latitude = Number(match[2]);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
  }

  const point = asObject(value);
  const coordinates = point?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const longitude = Number(coordinates[0]);
  const latitude = Number(coordinates[1]);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

function displayTime(value: unknown): string | undefined {
  const time = asString(value);
  if (!time) return undefined;
  const [hourText, minuteText] = time.split(':');
  const hour = Number(hourText);
  if (!Number.isFinite(hour)) return time;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minuteText ?? '00'} ${suffix}`;
}

function toSupabaseTime(value?: string): string | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = match[3]?.toUpperCase();
  if (suffix === 'PM' && hour < 12) hour += 12;
  if (suffix === 'AM' && hour === 12) hour = 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
}

function dayLabelsToIndexes(days?: string[]): number[] | null {
  if (!days?.length) return null;
  return days
    .map((day) => DAY_NAMES.findIndex((name) => name.toLowerCase() === day.slice(0, 3).toLowerCase()))
    .filter((index) => index >= 0);
}

function indexesToDayLabels(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const days = value.map(Number).filter((index) => index >= 0 && index <= 6).map((index) => DAY_NAMES[index]);
  return days.length ? days : undefined;
}

export function mapRideRow(row: DbRow, creatorRow?: DbRow | null): Ride {
  const creator = mapUserRow(asObject(row.creator) ?? creatorRow ?? null);
  const pickupAddress = asString(row.pickup_address, 'Pickup');
  const destinationAddress = asString(row.dropoff_address, 'Destination');
  const pickupPoint = pointFromValue(row.pickup_location);
  const destinationPoint = pointFromValue(row.dropoff_location);
  const rideType = asString(row.ride_type, 'daily');
  const status = asString(row.status, 'active') as RideStatus;
  const availableSeats = Math.max(0, asNumber(row.available_seats));
  const occupiedSeats = Math.max(0, asNumber(row.occupied_seats, 1));
  const vehicleKind = asString(row.vehicle_kind) as VehicleKind | '';
  const totalDistanceMeters = row.total_distance_meters == null
    ? undefined
    : asNumber(row.total_distance_meters);

  return {
    id: asString(row.id),
    creator,
    type: (rideType === 'instant' || rideType === 'planned' ? rideType : 'daily') as RideType,
    pickup: {
      label: pickupAddress,
      address: pickupAddress,
      latitude: pickupPoint?.latitude,
      longitude: pickupPoint?.longitude,
    },
    destination: {
      label: destinationAddress,
      address: destinationAddress,
      latitude: destinationPoint?.latitude,
      longitude: destinationPoint?.longitude,
    },
    date: asString(row.travel_date) || undefined,
    time: displayTime(row.travel_time),
    returnTime: displayTime(row.return_time),
    days: indexesToDayLabels(row.selected_days),
    pricePerSeat: asNumber(row.price_per_seat),
    seatsTotal: availableSeats + occupiedSeats,
    seatsAvailable: availableSeats,
    vehicle: vehicleKind
      ? {
          id: asString(row.id),
          kind: vehicleKind,
          model: asString(row.vehicle_model, 'Vehicle'),
          numberPlate: asString(row.vehicle_plate),
          seats: availableSeats + occupiedSeats,
        }
      : undefined,
    womenOnly: Boolean(row.women_only),
    status,
    co2Saved: row.co2_saved_kg == null ? undefined : asNumber(row.co2_saved_kg),
    distanceKm: totalDistanceMeters == null ? undefined : totalDistanceMeters / 1000,
  };
}

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

function mergeRides(primary: Ride[], fallback: Ride[]): Ride[] {
  const seen = new Set(primary.map((ride) => ride.id));
  return [...primary, ...fallback.filter((ride) => !seen.has(ride.id))];
}

async function loadDbRides(includeAllStatuses = false): Promise<Ride[]> {
  let query = supabase
    .from('rides')
    .select('*, creator:user_profiles!rides_user_id_fkey(*)')
    .order('created_at', { ascending: false });

  if (!includeAllStatuses) query = query.eq('status', 'active');
  const { data, error } = await query;
  if (error) {
    console.warn('Supabase rides query failed:', error.message);
    return [];
  }
  return ((data ?? []) as DbRow[]).map((row) => mapRideRow(row));
}

export type SearchQuery = {
  pickup?: string;
  destination?: string;
  time?: string;
  type?: RideType;
  pickupCoordinates?: LocationCoordinates;
  destinationCoordinates?: LocationCoordinates;
  radiusMeters?: number;
  /**
   * The signed-in rider. Their own posts are never offered back to them as a
   * "ride twin" — you cannot share a seat with yourself.
   */
  excludeUserId?: string;
};

/** `data.date` is often an empty string; Postgres rejects "" for a date column. */
function toNullableDate(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Reject anything that is not ISO-ish so a bad value cannot 400 the insert.
  if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return null;
  return trimmed.slice(0, 10);
}

export const rideService = {
  async getRides(query: SearchQuery = {}): Promise<Ride[]> {
    const databaseRides = await loadDbRides(false);
    let rides = mergeRides(databaseRides, [...createdRides, ...mockRides]);

    if (query.excludeUserId) {
      const selfId = query.excludeUserId;
      rides = rides.filter((ride) => ride.creator.id !== selfId);
    }

    if (query.type) {
      rides = rides.filter((ride) => ride.type === query.type);
    }

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
      const scoredPromises: Promise<Ride | null>[] = rides.map(async (ride) => {
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
          // Kept so the card and the details screen can draw BOTH routes
          // instead of describing the match with a number.
          userRouteGeometry: userRoute.geometry,
          driverRouteGeometry: candidateRoute.geometry,
        };
      });

      const scoredRides = (await Promise.all(scoredPromises)).filter(
        (ride): ride is Ride => ride !== null
      );
      if (scoredRides.length > 0) {
        rides = scoredRides.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
      }
    }

    return rides;
  },

  async getRideById(id: string): Promise<Ride | undefined> {
    const local = [...createdRides, ...mockRides].find((ride) => ride.id === id);
    if (local) return local;

    const { data, error } = await supabase
      .from('rides')
      .select('*, creator:user_profiles!rides_user_id_fkey(*)')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      console.warn('Supabase ride lookup failed:', error.message);
      return undefined;
    }
    return data ? mapRideRow(data as DbRow) : undefined;
  },

  async requestRide(rideId: string, requesterId: string): Promise<{ ok: boolean; status: 'pending' }> {
    const { data, error } = await supabase.rpc('request_ride', {
      p_ride_id: rideId,
      p_requester_id: requesterId,
    });
    if (error) throw new Error(error.message);
    const request = data as { status?: string } | null;
    return { ok: request?.status === 'pending', status: 'pending' };
  },

  async cancelRequest(rideId: string): Promise<{ ok: boolean }> {
    const { error } = await supabase
      .from('ride_requests')
      .update({ status: 'cancelled' })
      .eq('ride_id', rideId)
      .eq('status', 'pending');
    return { ok: !error };
  },

  async createRide(data: Partial<Ride>): Promise<{ ok: boolean; id: string }> {
    const pickupLatitude = data.pickup?.lat ?? data.pickup?.latitude;
    const pickupLongitude = data.pickup?.lng ?? data.pickup?.longitude;
    const destinationLatitude = data.destination?.lat ?? data.destination?.latitude;
    const destinationLongitude = data.destination?.lng ?? data.destination?.longitude;
    if (
      !data.pickup ||
      !data.destination ||
      !data.creator?.id ||
      typeof pickupLatitude !== 'number' ||
      typeof pickupLongitude !== 'number' ||
      typeof destinationLatitude !== 'number' ||
      typeof destinationLongitude !== 'number'
    ) {
      throw new Error('Pickup, destination, and a signed-in creator are required');
    }

    const { data: inserted, error } = await supabase
      .from('rides')
      .insert({
        user_id: data.creator.id,
        ride_type: data.type ?? 'daily',
        pickup_location: `POINT(${pickupLongitude} ${pickupLatitude})`,
        dropoff_location: `POINT(${destinationLongitude} ${destinationLatitude})`,
        pickup_address: data.pickup.address || data.pickup.label,
        dropoff_address: data.destination.address || data.destination.label,
        travel_time: toSupabaseTime(data.time),
        return_time: toSupabaseTime(data.returnTime),
        travel_date: toNullableDate(data.date),
        selected_days: dayLabelsToIndexes(data.days),
        available_seats: Math.max(0, data.seatsAvailable ?? 1),
        occupied_seats: 1,
        price_per_seat: data.pricePerSeat ?? 0,
        women_only: Boolean(data.womenOnly),
        vehicle_kind: data.vehicle?.kind ?? null,
        vehicle_model: data.vehicle?.model ?? null,
        vehicle_plate: data.vehicle?.numberPlate ?? null,
        status: data.status ?? 'active',        co2_saved_kg: data.co2Saved ?? null,
      })
      .select('id')
      .single();

    if (error) throw new Error(error.message);
    const id = asString((inserted as DbRow | null)?.id);
    if (!id) throw new Error('The ride was created without an id');

    const ride: Ride = {
      id,
      creator: data.creator,
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
    };
    createdRides.unshift(ride);
    return { ok: true, id };
  },

  async getMyRides(userId?: string): Promise<Ride[]> {
    if (!userId) return [];
    const databaseRides = await loadDbRides(true);
    return mergeRides(
      databaseRides.filter((ride) => ride.creator.id === userId),
      createdRides.filter((ride) => ride.creator.id === userId)
    );
  },

  /**
   * Promotes a draft to a published ride (or republishes a cancelled one).
   * Drafts are excluded from search and matching, so this single status change
   * is what makes a draft discoverable.
   */
  async publishDraft(rideId: string, userId: string): Promise<{ ok: boolean }> {
    const { error } = await supabase
      .from('rides')
      .update({ status: 'active' })
      .eq('id', rideId)
      .eq('user_id', userId)
      .in('status', ['draft', 'cancelled']);
    return { ok: !error };
  },

  /** Deletes a draft. */
  async deleteRide(rideId: string, userId: string): Promise<{ ok: boolean }> {
    const { error } = await supabase
      .from('rides')
      .delete()
      .eq('id', rideId)
      .eq('user_id', userId)
      .eq('status', 'draft');
    return { ok: !error };
  },

  /**
   * Deletes any ride the caller owns, not just drafts.
   * The `.eq('user_id', userId)` guard is the important part: a client can only
   * ever remove its own post.
   */
  async deleteOwnRide(rideId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
    const { error } = await supabase
      .from('rides')
      .delete()
      .eq('id', rideId)
      .eq('user_id', userId);
    return { ok: !error, error: error?.message };
  },

  /** Updates a ride the caller owns. */
  async updateOwnRide(
    rideId: string,
    userId: string,
    patch: Partial<Ride>,
  ): Promise<{ ok: boolean; error?: string }> {
    const body: Record<string, unknown> = {};
    if (patch.time !== undefined) body.travel_time = toSupabaseTime(patch.time);
    if (patch.returnTime !== undefined) body.return_time = toSupabaseTime(patch.returnTime);
    if (patch.date !== undefined) body.travel_date = toNullableDate(patch.date);
    if (patch.days !== undefined) body.selected_days = dayLabelsToIndexes(patch.days);
    if (patch.pricePerSeat !== undefined) body.price_per_seat = patch.pricePerSeat;
    if (patch.seatsAvailable !== undefined) body.available_seats = Math.max(0, patch.seatsAvailable);
    if (patch.womenOnly !== undefined) body.women_only = patch.womenOnly;
    if (patch.status !== undefined) body.status = patch.status;
    if (patch.pickup?.address || patch.pickup?.label) {
      body.pickup_address = patch.pickup.address || patch.pickup.label;
    }
    if (patch.destination?.address || patch.destination?.label) {
      body.dropoff_address = patch.destination.address || patch.destination.label;
    }

    if (Object.keys(body).length === 0) return { ok: true };

    const { error } = await supabase
      .from('rides')
      .update(body)
      .eq('id', rideId)
      .eq('user_id', userId);
    return { ok: !error, error: error?.message };
  },
};
