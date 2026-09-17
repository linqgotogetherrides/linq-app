import { Ride, User } from '@/src/types';

const u = (id: string, name: string, avatarUrl: string, rating: number, extra?: Partial<User>): User => ({
  id, name, avatarUrl, rating, verification: 'verified', ...extra,
});

export interface RideRequestItem {
  id: string;
  user: User;
  type: 'daily' | 'planned';
  pickup: string;
  destination: string;
  time: string;
  price: number;
  note: string; // e.g. "1 seat requested" / "8 km away"
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

export const incomingRequests: RideRequestItem[] = [
  { id: 'in1', user: u('u_sarah', 'Sarah J.', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80', 4.9, { trips: 120 }), type: 'daily', pickup: 'Madhapur', destination: 'Wipro Circle', time: '08:30 AM', price: 12.5, note: '1 seat requested', vehicle: 'car', exactRoute: true },
  { id: 'in2', user: u('u_marcus', 'Marcus L.', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=80', 4.8, { trips: 45 }), type: 'planned', pickup: 'Office Hub', destination: 'Downtown Mall', time: '05:45 PM', price: 15, note: '8 km away', vehicle: 'car' },
];

export const sentRequests: RideRequestItem[] = [
  { id: 'sn1', user: u('u_priya', 'Priya R.', 'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?w=200&q=80', 4.7, { trips: 55 }), type: 'daily', pickup: 'Kukatpally', destination: 'Secunderabad', time: '09:15 AM', price: 18, note: 'Awaiting response', vehicle: 'car', exactRoute: true },
  { id: 'sn2', user: u('u_srikanth', 'Srikanth', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200&q=80', 4.9, { trips: 80 }), type: 'daily', pickup: 'Gachibowli', destination: 'Financial District', time: '08:00 AM', price: 14, note: 'Awaiting response', vehicle: 'bike' },
];

export const publishedPosts: RidePost[] = [
  { id: 'pp1', type: 'daily', pickup: 'Madhapur', destination: 'Wipro Circle', time: '08:30 AM', price: 12, note: '1 seat requested', vehicle: 'car', exactRoute: true, views: 142, requests: 6, seats: 3 },
  { id: 'pp2', type: 'planned', pickup: 'Jubilee Hills', destination: 'RGIA Airport', time: '06:00 AM', price: 22, note: '3 seats available', vehicle: 'car', views: 89, requests: 3, seats: 3 },
];

export const draftPosts: RidePost[] = [
  { id: 'dr1', type: 'daily', pickup: 'Ameerpet', destination: 'Hitech City', time: '09:00 AM', price: 10, note: 'Draft', vehicle: 'bike', draft: true },
];

export const upcomingRides: UpcomingRide[] = [
  { id: 'up1', user: u('u_marcus2', 'Marcus Chen', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80', 4.95, { trips: 60 }), type: 'planned', vehicleModel: 'Tesla Model 3', price: 25, time: 'Today, 2:00 PM', route: 'RGIA International Airport', status: 'confirmed' },
  { id: 'up2', user: u('u_vikram', 'Vikram S.', 'https://images.unsplash.com/photo-1508341591423-4347099e1f19?w=200&q=80', 4.8, { trips: 40 }), type: 'daily', vehicleModel: 'Suzuki Swift', price: 15, time: 'Today, 6:00 PM', route: 'Banjara Hills to Powai', status: 'confirmed' },
];
