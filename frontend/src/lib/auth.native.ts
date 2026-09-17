import auth from '@react-native-firebase/auth';

export const signInWithPhoneNumber = async (phone: string) => {
  return await auth().signInWithPhoneNumber(phone);
};
