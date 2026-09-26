import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { LogBox, StatusBar } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useIconFonts } from '@/src/hooks/use-icon-fonts';
import { useSosDeepLink } from '@/src/hooks/useSosDeepLink';
import { captureReferralFromLink } from '@/src/services/referralLink';
import { AppProvider } from '@/src/context/AppContext';
import { WalletProvider } from '@/src/context/WalletContext';
import { SosProvider } from '@/src/context/SosContext';
import { SosAdminProvider } from '@/src/context/SosAdminContext';
import { GameProvider } from '@/src/context/GameContext';
import Toast from '@/src/components/Toast';
import AuthGate from '@/src/components/AuthGate';

LogBox.ignoreAllLogs(true);

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  // Capture ?ref=CODE from an invite link before the navigation stack changes.
  useEffect(() => {
    void captureReferralFromLink();
  }, []);

  // linq://sos — opened by the home-screen widget / lock-screen tile.
  useSosDeepLink();

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProvider>
          <AuthGate>
          <WalletProvider>
            <GameProvider>
              <SosProvider>
                <SosAdminProvider>
                  <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
                  <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FFFFFF' } }} />
                  <Toast />
                </SosAdminProvider>
              </SosProvider>
            </GameProvider>
          </WalletProvider>
          </AuthGate>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
