import React from 'react';
import { Tabs, useRouter } from 'expo-router';
import { StyleSheet, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, shadow } from '@/src/theme/tokens';
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

function NotificationTabIcon({ color }: { color: string }) {
  const { pendingRideRequestCount } = useApp();
  return (
    <View style={styles.notificationIconWrap}>
      <Ionicons name="notifications" size={24} color={color} />
      {pendingRideRequestCount > 0 ? (
        <View style={styles.tabBadge}>
          <Text style={styles.tabBadgeText}>
            {pendingRideRequestCount > 9 ? '9+' : pendingRideRequestCount}
          </Text>
        </View>
      ) : null}
    </View>
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
      <Tabs.Screen name="notifications" options={{ tabBarButtonTestID: 'tab-notifications', tabBarIcon: ({ color }) => <NotificationTabIcon color={color} /> }} />
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
  notificationIconWrap: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadge: {
    position: 'absolute',
    top: -4,
    right: -7,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  tabBadgeText: {
    color: colors.textInverse,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: font.weight.medium,
  },
});
