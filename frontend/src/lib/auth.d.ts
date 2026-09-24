import type { ConfirmationResult } from '@react-native-firebase/auth';

export declare function signInWithPhoneNumber(phone: string): Promise<ConfirmationResult>;
export declare function signOut(): Promise<void>;
