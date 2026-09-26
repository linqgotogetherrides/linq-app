import { supabase } from '@/src/lib/supabase';
import { mapRideRow, mapUserRow, rideService } from '@/src/services/rideService';
import { Notification, RideRequest } from '@/src/types';

type DbRow = Record<string, unknown>;

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function mapNotificationType(type: string): Notification['type'] {
  if (type === 'ride_request') return 'request';
  if (type === 'request_accepted') return 'accepted';
  if (type === 'request_declined') return 'declined';
  // The owner is told when a post closed because its date and time passed.
  if (type === 'ride_closed') return 'closed';
  return 'system';
}

export const rideRequestService = {
  async getIncomingRideRequests(ownerId: string): Promise<RideRequest[]> {
    if (!ownerId) return [];

    const { data, error } = await supabase
      .from('ride_requests')
      .select('id, ride_id, owner_id, requester_id, status, responded_at, created_at')
      .eq('owner_id', ownerId)
      .in('status', ['pending', 'accepted'])
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Supabase ride request query failed:', error.message);
      return [];
    }

    const rows = (data ?? []) as DbRow[];
    if (!rows.length) return [];

    const rideIds = [...new Set(rows.map((row) => asString(row.ride_id)).filter(Boolean))];
    const profileIds = [
      ...new Set(
        rows
          .flatMap((row) => [asString(row.owner_id), asString(row.requester_id)])
          .filter(Boolean)
      ),
    ];

    const [{ data: rideData, error: rideError }, { data: profileData, error: profileError }] =
      await Promise.all([
        supabase.from('rides').select('*').in('id', rideIds),
        supabase.from('user_profiles').select('*').in('id', profileIds),
      ]);

    if (rideError) console.warn('Supabase requested rides query failed:', rideError.message);
    if (profileError) console.warn('Supabase request profiles query failed:', profileError.message);

    const rides = new Map(
      ((rideData ?? []) as DbRow[]).map((row) => [asString(row.id), row])
    );
    const profiles = new Map(
      ((profileData ?? []) as DbRow[]).map((row) => [asString(row.id), row])
    );

    return rows.map((row) => {
      const rideRow = rides.get(asString(row.ride_id));
      const ownerRow = profiles.get(asString(row.owner_id));
      return {
        id: asString(row.id),
        ride: rideRow ? mapRideRow(rideRow, ownerRow) : null,
        requester: mapUserRow(profiles.get(asString(row.requester_id))),
        status: asString(row.status, 'pending') as RideRequest['status'],
        createdAt: asString(row.created_at),
      } as RideRequest;
    }).filter((request) => request.ride != null);
  },

  async getNotifications(recipientId: string): Promise<Notification[]> {
    if (!recipientId) return [];
    const { data, error } = await supabase
      .from('notifications')
      .select('id, type, title, body, ride_id, request_id, read_at, created_at')
      .eq('recipient_id', recipientId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.warn('Supabase notifications query failed:', error.message);
      return [];
    }

    return ((data ?? []) as DbRow[]).map((row) => ({
      id: asString(row.id),
      title: asString(row.title),
      body: asString(row.body),
      time: asString(row.created_at),
      type: mapNotificationType(asString(row.type)),
      read: row.read_at != null,
      rideId: asString(row.ride_id) || undefined,
      requestId: asString(row.request_id) || undefined,
      createdAt: asString(row.created_at),
    }));
  },

  async requestRide(rideId: string, requesterId: string) {
    return rideService.requestRide(rideId, requesterId);
  },

  async respondToRideRequest(
    requestId: string,
    ownerId: string,
    decision: 'accepted' | 'declined'
  ): Promise<{ id: string; status: RideRequest['status'] }> {
    const { data, error } = await supabase.rpc('respond_to_ride_request', {
      p_request_id: requestId,
      p_owner_id: ownerId,
      p_decision: decision,
    });
    if (error) throw new Error(error.message);
    const result = data as { id?: string; status?: RideRequest['status'] } | null;
    if (!result?.id || !result.status) throw new Error('The request could not be updated');
    return { id: result.id, status: result.status };
  },

  async markNotificationsRead(recipientId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_id', recipientId)
      .is('read_at', null);
    if (error) console.warn('Could not mark notifications read:', error.message);
  },
};
