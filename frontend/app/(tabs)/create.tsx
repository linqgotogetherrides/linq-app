import React, { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

// This tab acts purely as the center + button; it redirects to the create-ride modal.
export default function CreateTab() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/create-ride');
  }, [router]);
  return <View />;
}
