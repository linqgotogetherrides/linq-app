import { Ride, RideType } from '@/src/types';
import { mockRides } from '@/src/mock/data';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Simple string similarity (Jaro-like: normalized shared chars) to avoid extra deps
function nameSimilarity(a: string, b: string): number {
  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  const set = new Set(s1.split(''));
  let shared = 0;
  for (const c of s2) if (set.has(c)) shared++;
  return shared / Math.max(s1.length, s2.length);
}

// Mock distance function; use simple hash to keep deterministic
function pseudoKm(a: string, b: string): number {
  if (!a || !b) return 8;
  const h = (a + b).split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  return (h % 40) / 10 + 0.4; // 0.4 - 4.4 km range
}

export type SearchQuery = {
  pickup?: string;
  destination?: string;
  time?: string;
  type?: RideType;
};

function scoreRide(ride: Ride, q: SearchQuery): { score: number; matchType: Ride['matchType'] } {
  let score = 0;

  const pickupKm = pseudoKm(q.pickup ?? '', ride.pickup.label);
  // Pickup proximity (max 40, threshold 2km)
  score += Math.max(0, 40 - (pickupKm / 2) * 40);

  const dropKm = pseudoKm(q.destination ?? '', ride.destination.label);
  // Drop proximity (max 40, threshold 3km)
  score += Math.max(0, 40 - (dropKm / 3) * 40);

  // Time similarity (max 10)
  score += 8;

  // Name similarity (max 10)
  const ns = nameSimilarity(
    (q.pickup ?? '') + (q.destination ?? ''),
    ride.pickup.label + ride.destination.label
  );
  score += ns * 10;

  score = Math.min(100, Math.round(score));

  let matchType: Ride['matchType'] = 'other';
  if (score > 70) matchType = 'exact';
  else if (score > 30) matchType = 'nearby';

  return { score, matchType };
}

export const rideService = {
  async getRides(query: SearchQuery = {}): Promise<Ride[]> {
    await delay(400);
    let rides = [...mockRides];
    if (query.type) rides = rides.filter((r) => r.type === query.type);
    if (query.pickup || query.destination) {
      rides = rides.map((r) => {
        const { score, matchType } = scoreRide(r, query);
        return { ...r, matchScore: score, matchType };
      });
      rides.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
    }
    return rides;
  },

  async getRideById(id: string): Promise<Ride | undefined> {
    await delay(200);
    return mockRides.find((r) => r.id === id);
  },

  async requestRide(rideId: string): Promise<{ ok: boolean; status: 'pending' }> {
    await delay(400);
    return { ok: true, status: 'pending' };
  },

  async cancelRequest(_rideId: string): Promise<{ ok: boolean }> {
    await delay(300);
    return { ok: true };
  },

  async createRide(_data: Partial<Ride>): Promise<{ ok: boolean; id: string }> {
    await delay(600);
    return { ok: true, id: `r_new_${Date.now()}` };
  },

  async getMyRides(): Promise<Ride[]> {
    await delay(300);
    return mockRides.slice(0, 2);
  },
};
