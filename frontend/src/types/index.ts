// LinQ Rides – Domain Types
export type RideType = 'instant' | 'daily' | 'planned';
export type VehicleKind = 'car' | 'bike' | 'auto' | 'cab';
export type MatchType = 'exact' | 'nearby' | 'other';
export type RideStatus = 'draft' | 'active' | 'confirmed' | 'completed' | 'cancelled';
export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
export type VerificationStatus = 'verified' | 'pending' | 'not_verified';
export type VerificationDocument = 'aadhaar' | 'pan' | 'dl';
export type Plan = 'free' | 'yearly' | 'twoYear';

export interface Location {
  label: string;
  address: string;
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
  accuracy?: number | null;
  timestamp?: number;
}

export interface Vehicle {
  id: string;
  kind: VehicleKind;
  model: string;
  numberPlate: string;
  seats: number;
  ac?: boolean;
}

export interface Passenger {
  id: string;
  name: string;
  age?: number;
  phone?: string;
  isSelf?: boolean;
}

export type SavedLocationType = 'home' | 'office' | 'college';
export type LocationFlowSource = 'home' | 'create-ride';

export interface SavedLocation {
  label: string;
  address: string;
  latitude: number;
  longitude: number;
  updatedAt?: string;
}

export interface SavedUserLocations {
  home?: SavedLocation;
  office?: SavedLocation;
  college?: SavedLocation;
  defaultPickup?: SavedLocation;
  defaultDrop?: SavedLocation;
}

export interface LocationFlowResult {
  id: number;
  source: LocationFlowSource;
  pickup: SavedLocation;
  destination: SavedLocation;
  distanceMeters?: number;
  durationSeconds?: number;
}

export interface User {
  id: string;
  name: string;
  age?: number;
  gender?: 'male' | 'female' | 'other';
  womenOnlyMode?: boolean;
  bio?: string;
  phone?: string;
  email?: string;
  avatarUrl?: string;
  rating?: number;
  trips?: number;
  co2Saved?: number;
  verification?: VerificationStatus;
  verificationDocument?: VerificationDocument;
  emergencyContact?: string;
  homeAddress?: string;
  officeAddress?: string;
  collegeAddress?: string;
  savedLocations?: SavedUserLocations;
}

export interface Ride {
  id: string;
  creator: User;
  type: RideType;
  pickup: Location;
  destination: Location;
  date?: string;
  time?: string;
  returnTime?: string;
  days?: string[]; // for daily
  pricePerSeat: number;
  seatsTotal: number;
  seatsAvailable: number;
  vehicle?: Vehicle;
  womenOnly?: boolean;
  matchScore?: number;
  matchType?: MatchType;
  sharedDistanceKm?: number;
  matchExplanation?: string;
  status: RideStatus;
  co2Saved?: number;
  tags?: string[];
  distanceKm?: number;
}

export interface RideRequest {
  id: string;
  ride: Ride;
  requester: User;
  status: RequestStatus;
  createdAt: string;
}

export interface Transaction {
  id: string;
  title: string;
  subtitle?: string;
  date: string;
  amount: number;
  type: 'credit' | 'debit' | 'reward';
  status?: 'completed' | 'pending' | 'failed';
}

export interface Wallet {
  balance: number;
  rewardBalance: number;
  transactions: Transaction[];
}

export interface Reward {
  id: string;
  title: string;
  amount: number;
  date: string;
  type: 'referral' | 'ride_confirmed';
  used?: boolean;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  time: string;
  type: 'request' | 'accepted' | 'declined' | 'reminder' | 'reward' | 'system';
  read?: boolean;
  rideId?: string;
  requestId?: string;
  createdAt?: string;
}

export interface Conversation {
  id: string;
  user: User;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  rideRoute?: string;
  locked?: boolean;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  time: string;
  system?: boolean;
}

export interface AccessState {
  freeRequestsRemaining: number;
  freeChatsRemaining: number;
  plan: Plan;
  planExpiresAt?: string;
}
