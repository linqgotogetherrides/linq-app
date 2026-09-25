import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow } from '@/src/theme/tokens';
import { useApp } from '@/src/context/AppContext';

function CenterTabButton() {
  const router = useRouter();
  const { user } = useApp();

  return (
    <Pressable
      testID="tab-create"
      onPress={() => {
        if (!user) {
          router.push('/onboarding');
        } else {
          router.push('/create-ride');
        }
      }}
      style={styles.centerBtn}
    >
      <Ionicons name="add" size={30} color={colors.textInverse} />
    </Pressable>
  );
}

export default function TabsLayout() {
  // Allow guests to view tabs, but actions are restricted in components
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarShowLabel: false,
        tabBarStyle: {
          height: 72,
          paddingTop: 10,
          paddingBottom: 14,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ tabBarButtonTestID: 'tab-home', tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} /> }} />
      <Tabs.Screen name="rides" options={{ tabBarButtonTestID: 'tab-rides', tabBarIcon: ({ color }) => <Ionicons name="car" size={24} color={color} /> }} />
      <Tabs.Screen
        name="create"
        options={{ tabBarButton: () => <CenterTabButton /> }}
        listeners={{ tabPress: (e) => e.preventDefault() }}
      />
      <Tabs.Screen name="messages" options={{ tabBarButtonTestID: 'tab-messages', tabBarIcon: ({ color }) => <Ionicons name="chatbubbles" size={24} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ tabBarButtonTestID: 'tab-profile', tabBarIcon: ({ color }) => <Ionicons name="person" size={24} color={color} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centerBtn: {
    top: -22,
    alignSelf: 'center',
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    ...shadow.md,
  },
});
