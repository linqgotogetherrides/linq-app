import {
  getAuth,
  signInWithPhoneNumber as firebaseSignInWithPhoneNumber,
  signOut as firebaseSignOut,
} from '@react-native-firebase/auth';

export const signInWithPhoneNumber = (phone: string) =>
  firebaseSignInWithPhoneNumber(getAuth(), phone);

export const signOut = () => firebaseSignOut(getAuth());
