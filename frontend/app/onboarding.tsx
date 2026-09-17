import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import LinqLogo from '@/src/components/LinqLogo';
import Mission1000Banner from '@/src/components/Mission1000Banner';
import PrimaryButton from '@/src/components/PrimaryButton';
import { colors, spacing, font } from '@/src/theme/tokens';

const { width } = Dimensions.get('window');

interface Slide {
  key: string;
  title: string;
  subtitle: string;
  image: any;
}

const slides: Slide[] = [
  { key: 'twin', title: 'Why ride alone', subtitle: 'when your ride twin exists?', image: require('@/assets/images/splash1.png') },
  { key: 'share', title: 'Share rides.\nShare costs.', subtitle: 'Make travel smarter with people going your way.', image: require('@/assets/images/splash2.png') },
  { key: 'trust', title: 'Verified & safe', subtitle: 'Verified profiles, ratings and safety-first design.', image: require('@/assets/images/splash3.png') },
];

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const isLast = step === slides.length - 1;

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((prev) => (prev + 1) % slides.length);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const handleGetStarted = () => {
    router.replace('/login');
  };

  const slide = slides[step];

  return (
    <SafeAreaView style={styles.container} testID="onboarding-screen">
      <View style={styles.top}>
        <LinqLogo size={44} showText={false} />
        <Pressable testID="skip-onboarding-button" onPress={() => router.replace('/login')} hitSlop={12}>
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Image source={slide.image} style={styles.image} resizeMode="contain" />
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.subtitle}>{slide.subtitle}</Text>
      </View>

      <View style={styles.dots}>
        {slides.map((_, i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.bottom}>
        <Mission1000Banner compact />
        <View style={{ height: spacing.lg }} />
        <PrimaryButton
          testID="onboarding-next-button"
          title="Get Started"
          iconRight="arrow-forward"
          onPress={handleGetStarted}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.xl },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.md },
  skip: { fontSize: font.size.base, color: colors.primary, fontWeight: font.weight.medium },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  image: { width: width * 0.8, height: width * 0.8, maxWidth: 300, maxHeight: 300, marginBottom: spacing['2xl'] },
  title: { fontSize: font.size['3xl'], color: colors.textPrimary, fontWeight: font.weight.medium, textAlign: 'center', lineHeight: 32 },
  subtitle: { fontSize: font.size.lg, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md, maxWidth: 320 },
  dots: { flexDirection: 'row', justifyContent: 'center', marginBottom: spacing.lg, gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 24 },
  bottom: { paddingBottom: spacing.lg },
});
