import React from 'react';
import { Tabs, useRouter, useSegments } from 'expo-router';
import { StyleSheet, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, shadow } from '@/src/theme/tokens';
import { useApp } from '@/src/context/AppContext';
import { withNext } from '@/src/lib/authNavigation';

function CenterTabButton() {
  const router = useRouter();
  const { user, guestMode, promptLogin } = useApp();

  return (
    <Pressable
      testID="tab-create"
      onPress={() => {
        if (!user) {
          if (guestMode) promptLogin();
          else router.push('/onboarding');
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
  const router = useRouter();
  const { user, booting, guestMode, promptLogin } = useApp();
  const segments = useSegments();

  // Second line of defence behind AuthGate. The whole tab group is one
  // navigation surface, so a guest who reaches it by any route is turned away
  // here rather than relying on each screen checking for itself. Guests are
  // allowed in only for Home, where the screen itself masks rider data.
  React.useEffect(() => {
    if (booting || user || guestMode) return;
    const current = `/${segments.join('/')}`;
    router.replace(withNext('/onboarding', current));
  }, [booting, user, guestMode, segments, router]);

  // Other tabs are signed-in surfaces. A guest tapping one is asked to sign in
  // instead of being dropped into a screen full of empty prompts.
  const guestTabListeners = guestMode
    ? {
        tabPress: (event: { preventDefault: () => void }) => {
          event.preventDefault();
          promptLogin();
        },
      }
    : undefined;

  if (!booting && !user && !guestMode) {
    // Render nothing so no signed-in affordance is visible for a frame.
    return <View testID="tabs-guest-redirecting" style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <Tabs
      initialRouteName="home"
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
      <Tabs.Screen name="home" options={{ tabBarButtonTestID: 'tab-home', tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} /> }} />
      <Tabs.Screen name="rides" listeners={guestTabListeners} options={{ tabBarButtonTestID: 'tab-rides', tabBarIcon: ({ color }) => <Ionicons name="car" size={24} color={color} /> }} />
      <Tabs.Screen
        name="create"
        options={{ tabBarButton: () => <CenterTabButton /> }}
        listeners={{ tabPress: (e) => e.preventDefault() }}
      />
      <Tabs.Screen name="messages" listeners={guestTabListeners} options={{ tabBarButtonTestID: 'tab-messages', tabBarIcon: ({ color }) => <Ionicons name="chatbubbles" size={24} color={color} /> }} />
      <Tabs.Screen name="profile" listeners={guestTabListeners} options={{ tabBarButtonTestID: 'tab-profile', tabBarIcon: ({ color }) => <Ionicons name="person" size={24} color={color} /> }} />
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
