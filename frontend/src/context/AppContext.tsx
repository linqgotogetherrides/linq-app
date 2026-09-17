import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AccessState, User } from '@/src/types';
import { supabase } from '@/src/lib/supabase';
import { currentUser as mockUser } from '@/src/mock/data';

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
  upgradePlan: (plan: 'weekly' | 'monthly') => void;
  singleUnlock: () => void;
  walletBalance: number;
  rewardBalance: number;
  addToWallet: (amount: number) => void;
  spendReward: (amount: number) => void;
  toast: string | null;
  showToast: (m: string) => void;
  fetchUserProfile: (uid: string) => Promise<User | null>;
  refreshUser: () => Promise<void>;
}

const defaultAccess: AccessState = {
  freeRequestsRemaining: 2,
  freeChatsRemaining: 2,
  plan: 'free',
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthed, setIsAuthed] = useState(false);
  const [confirmResult, setConfirmResult] = useState<any>(null);
  const [access, setAccess] = useState<AccessState>(defaultAccess);
  const [walletBalance, setWalletBalance] = useState(1250);
  const [rewardBalance, setRewardBalance] = useState(35);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const fetchUserProfile = async (uid: string): Promise<User | null> => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', uid)
        .single();
        
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
        phone: data.phone_number || undefined,
        email: data.email || undefined,
        avatarUrl: data.avatar_url || 'https://i.pravatar.cc/150?u=newuser',
        rating: data.rating,
        trips: data.total_trips,
        co2Saved: data.co2_saved_kg,
        verification: data.verification_status,
        emergencyContact: data.emergency_contact || undefined,
        homeAddress: data.home_address || undefined,
        officeAddress: data.office_address || undefined,
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

  const upgradePlan = useCallback((plan: 'weekly' | 'monthly') => {
    setAccess({ plan, freeRequestsRemaining: 5, freeChatsRemaining: 5 });
    showToast(`${plan === 'weekly' ? 'Weekly' : 'Monthly'} plan activated`);
  }, [showToast]);

  const singleUnlock = useCallback(() => {
    setAccess((a) => ({ ...a, freeRequestsRemaining: a.freeRequestsRemaining + 1 }));
    showToast('Single unlock added');
  }, [showToast]);

  const addToWallet = useCallback((amount: number) => {
    setWalletBalance((b) => b + amount);
  }, []);

  const spendReward = useCallback((amount: number) => {
    setRewardBalance((b) => Math.max(0, b - amount));
  }, []);

  // For development fallback to avoid breaking UI that expects a user
  // This will be replaced as we tighten auth logic
  useEffect(() => {
    if (!user && !isAuthed) {
      // Temporarily default to mockUser if no auth state to not break tabs
      setUser(mockUser);
    }
  }, [user, isAuthed]);

  return (
    <AppContext.Provider
      value={{
        user, setUser, isAuthed, setIsAuthed, confirmResult, setConfirmResult,
        access, useRequest, useChat, upgradePlan, singleUnlock,
        walletBalance, rewardBalance, addToWallet, spendReward,
        toast, showToast, fetchUserProfile, refreshUser
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
