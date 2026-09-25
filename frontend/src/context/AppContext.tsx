import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type {
  AccessState,
  LocationFlowResult,
  Notification,
  RideRequest,
  SavedLocation,
  SavedLocationType,
  SavedUserLocations,
  User,
  VerificationDocument,
} from '@/src/types';
import { supabase } from '@/src/lib/supabase';
import { rideRequestService } from '@/src/services/rideRequestService';

interface AppContextValue {
  user: User | null;
  setUser: (u: User | null) => void;
  isAuthed: boolean;
  setIsAuthed: (v: boolean) => void;
  confirmResult: any;
  setConfirmResult: (res: any) => void;
  access: AccessState;
  useRequest: () => boolean;
  useChat: () => boolean;
  upgradePlan: (plan: 'yearly' | 'twoYear') => void;
  singleUnlock: () => void;
  walletBalance: number;
  rewardBalance: number;
  addToWallet: (amount: number) => void;
  spendReward: (amount: number) => void;
  toast: string | null;
  showToast: (m: string) => void;
  fetchUserProfile: (uid: string) => Promise<User | null>;
  refreshUser: () => Promise<void>;
  saveUserLocation: (
    type: SavedLocationType,
    location: SavedLocation,
    role: 'pickup' | 'drop'
  ) => Promise<boolean>;
  locationFlowResult: LocationFlowResult | null;
  setLocationFlowResult: (result: LocationFlowResult) => void;
  clearLocationFlowResult: () => void;
  rideRequests: RideRequest[];
  rideNotifications: Notification[];
  pendingRideRequestCount: number;
  isLoadingRideActivity: boolean;
  refreshRideActivity: () => Promise<void>;
  respondToRideRequest: (
    requestId: string,
    decision: 'accepted' | 'declined'
  ) => Promise<void>;
}

const defaultAccess: AccessState = {
  freeRequestsRemaining: 2,
  freeChatsRemaining: 2,
  plan: 'free',
};

function normalizeSavedLocation(value: unknown): SavedLocation | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<SavedLocation>;
  if (
    typeof candidate.label !== 'string' ||
    typeof candidate.address !== 'string' ||
    !Number.isFinite(candidate.latitude) ||
    !Number.isFinite(candidate.longitude)
  ) {
    return undefined;
  }

  return {
    label: candidate.label,
    address: candidate.address,
    latitude: candidate.latitude as number,
    longitude: candidate.longitude as number,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : undefined,
  };
}

function normalizeSavedLocations(value: unknown): SavedUserLocations {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== 'object') return {};
  const saved = parsed as Partial<SavedUserLocations>;
  return {
    home: normalizeSavedLocation(saved.home),
    office: normalizeSavedLocation(saved.office),
    college: normalizeSavedLocation(saved.college),
    defaultPickup: normalizeSavedLocation(saved.defaultPickup),
    defaultDrop: normalizeSavedLocation(saved.defaultDrop),
  };
}

function normalizePhone(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const digits = value.replace(/\D/g, '');
  if (!digits) return undefined;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function normalizeAvatarUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const url = value.trim();
  if (!url || url.includes('i.pravatar.cc') || url.includes('pravatar.cc')) return undefined;
  return url;
}

function normalizeVerificationDocument(value: unknown): VerificationDocument | undefined {
  return value === 'aadhaar' || value === 'pan' || value === 'dl' ? value : undefined;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);
  const [confirmResult, setConfirmResult] = useState<any>(null);
  const [access, setAccess] = useState<AccessState>(defaultAccess);
  const [rewardBalance, setRewardBalance] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [locationFlowResult, setLocationFlowResult] = useState<LocationFlowResult | null>(null);
  const [rideRequests, setRideRequests] = useState<RideRequest[]>([]);
  const [rideNotifications, setRideNotifications] = useState<Notification[]>([]);
  const [isLoadingRideActivity, setIsLoadingRideActivity] = useState(false);

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const refreshRideActivity = useCallback(async () => {
    const userId = user?.id;
    if (!userId) {
      setRideRequests([]);
      setRideNotifications([]);
      return;
    }

    setIsLoadingRideActivity(true);
    try {
      const [requests, notifications] = await Promise.all([
        rideRequestService.getIncomingRideRequests(userId),
        rideRequestService.getNotifications(userId),
      ]);
      setRideRequests(requests);
      setRideNotifications(notifications);
    } finally {
      setIsLoadingRideActivity(false);
    }
  }, [user?.id]);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    void refreshRideActivity();
    const channel = supabase
      .channel(`ride-activity:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ride_requests',
          filter: `owner_id=eq.${userId}`,
        },
        () => void refreshRideActivity()
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        () => void refreshRideActivity()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshRideActivity, user?.id]);

  const clearLocationFlowResult = useCallback(() => {
    setLocationFlowResult(null);
  }, []);

  const saveUserLocation = useCallback(async (
    type: SavedLocationType,
    location: SavedLocation,
    role: 'pickup' | 'drop'
  ): Promise<boolean> => {
    if (!user) {
      showToast('Sign in to save this location for quick access.');
      return false;
    }

    const savedLocation: SavedLocation = {
      ...location,
      updatedAt: new Date().toISOString(),
    };
    const currentSaved = user.savedLocations || {};
    const nextSaved: SavedUserLocations = {
      ...currentSaved,
      [type]: savedLocation,
      [role === 'pickup' ? 'defaultPickup' : 'defaultDrop']: savedLocation,
    };
    const legacyAddressField =
      type === 'home' ? 'home_address' : type === 'office' ? 'office_address' : 'college_address';

    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          saved_locations: nextSaved,
          [legacyAddressField]: savedLocation.address,
        })
        .eq('id', user.id);

      if (error) throw error;
    } catch {
      showToast('Location selected, but it could not be saved to your profile.');
      return false;
    }

    setUser({
      ...user,
      homeAddress: type === 'home' ? savedLocation.address : user.homeAddress,
      officeAddress: type === 'office' ? savedLocation.address : user.officeAddress,
      collegeAddress: type === 'college' ? savedLocation.address : user.collegeAddress,
      savedLocations: nextSaved,
    });
    showToast(`${type[0].toUpperCase()}${type.slice(1)} saved for quick access`);
    return true;
  }, [showToast, user]);

  const fetchUserProfile = async (uid: string): Promise<User | null> => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle();
        
      if (error || !data) {
        console.log('User profile not found in Supabase:', error?.message);
        return null;
      }
      
      const mappedUser: User = {
        id: data.id,
        name: data.name || '',
        age: data.age || undefined,
        gender: data.gender || undefined,
        womenOnlyMode: data.women_only_mode,
        bio: data.bio || undefined,
        phone: normalizePhone(data.phone_number),
        email: data.email || undefined,
        avatarUrl: normalizeAvatarUrl(data.avatar_url),
        rating: data.rating,
        trips: data.total_trips,
        co2Saved: data.co2_saved_kg,
        verification: data.verification_status,
        verificationDocument: normalizeVerificationDocument(
          data.verification_document || data.verification_doc
        ),
        emergencyContact: normalizePhone(data.emergency_contact),
        homeAddress: data.home_address || undefined,
        officeAddress: data.office_address || undefined,
        collegeAddress: data.college_address || undefined,
        savedLocations: normalizeSavedLocations(data.saved_locations),
      };
      
      setUser(mappedUser);
      setIsAuthed(true);
      return mappedUser;
    } catch (e) {
      console.log('Error fetching user:', e);
      return null;
    }
  };

  const refreshUser = async () => {
    if (user?.id) {
      await fetchUserProfile(user.id);
    }
  };

  const useRequest = useCallback(() => {
    if (access.plan !== 'free') return true;
    if (access.freeRequestsRemaining <= 0) return false;
    setAccess((a) => ({ ...a, freeRequestsRemaining: a.freeRequestsRemaining - 1 }));
    return true;
  }, [access.plan, access.freeRequestsRemaining]);

  const useChat = useCallback(() => {
    if (access.plan !== 'free') return true;
    if (access.freeChatsRemaining <= 0) return false;
    setAccess((a) => ({ ...a, freeChatsRemaining: a.freeChatsRemaining - 1 }));
    return true;
  }, [access.plan, access.freeChatsRemaining]);

  const upgradePlan = useCallback((plan: 'yearly' | 'twoYear') => {
    setAccess({ plan, freeRequestsRemaining: 5, freeChatsRemaining: 5 });
    showToast(`${plan === 'yearly' ? 'Yearly' : '2 Year'} plan activated`);
  }, [showToast]);

  const singleUnlock = useCallback(() => {
    setAccess((a) => ({ ...a, freeRequestsRemaining: a.freeRequestsRemaining + 1 }));
    showToast('Single unlock added');
  }, [showToast]);

  const respondToRideRequest = useCallback(async (
    requestId: string,
    decision: 'accepted' | 'declined'
  ) => {
    const ownerId = user?.id;
    if (!ownerId) {
      showToast('Sign in to respond to ride requests.');
      return;
    }

    const request = rideRequests.find((item) => item.id === requestId);
    try {
      await rideRequestService.respondToRideRequest(requestId, ownerId, decision);
      await refreshRideActivity();
      showToast(
        decision === 'accepted'
          ? `Ride confirmed with ${request?.requester.name ?? 'the rider'}`
          : 'Ride request declined'
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The request could not be updated.');
      await refreshRideActivity();
    }
  }, [refreshRideActivity, rideRequests, showToast, user?.id]);

  // The wallet is now owned by WalletContext (persisted in Supabase). These
  // access limits stay in memory on purpose: they are per-device session limits.
  const addToWallet = useCallback((_amount: number) => {
    // Intentionally a no-op here. Balance mutations must go through
    // WalletContext so they are persisted; use creditWallet() instead.
  }, []);

  const spendReward = useCallback((amount: number) => {
    setRewardBalance((b) => Math.max(0, b - amount));
  }, []);



  return (
    <AppContext.Provider
      value={{
        user, setUser, isAuthed, setIsAuthed, confirmResult, setConfirmResult,
        access, useRequest, useChat, upgradePlan, singleUnlock,
        walletBalance: 0, rewardBalance, addToWallet, spendReward,
        toast, showToast, fetchUserProfile, refreshUser,
        saveUserLocation, locationFlowResult, setLocationFlowResult, clearLocationFlowResult,
        rideRequests, rideNotifications,
        pendingRideRequestCount: rideRequests.filter((request) => request.status === 'pending').length,
        isLoadingRideActivity, refreshRideActivity, respondToRideRequest
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
