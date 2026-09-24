import { User } from '@/src/types';

export interface RideRequestItem {
  id: string;
  user: User;
  type: 'daily' | 'planned';
  pickup: string;
  destination: string;
  time: string;
  price: number;
  note: string;
  vehicle: 'car' | 'bike' | 'auto' | null;
  exactRoute?: boolean;
}

export interface UpcomingRide {
  id: string;
  user: User;
  type: 'daily' | 'planned';
  vehicleModel: string;
  price: number;
  time: string;
  route: string;
  status: 'confirmed';
}

export interface RidePost {
  id: string;
  type: 'daily' | 'planned';
  pickup: string;
  destination: string;
  time: string;
  price: number;
  note: string;
  vehicle: 'car' | 'bike' | 'auto' | null;
  exactRoute?: boolean;
  draft?: boolean;
  views?: number;
  requests?: number;
  seats?: number;
}

export const incomingRequests: RideRequestItem[] = [];
export const sentRequests: RideRequestItem[] = [];
export const publishedPosts: RidePost[] = [];
export const draftPosts: RidePost[] = [];
export const upcomingRides: UpcomingRide[] = [];
