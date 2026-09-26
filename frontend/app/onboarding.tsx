import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { withNext } from '@/src/lib/authNavigation';
import LinqLogo from '@/src/components/LinqLogo';
import Mission1000Banner from '@/src/components/Mission1000Banner';
import PrimaryButton from '@/src/components/PrimaryButton';
import { colors, spacing, font, radius, shadow } from '@/src/theme/tokens';

const { width } = Dimensions.get('window');

interface Slide {
  key: string;
  badge: string;
  title: string;
  subtitle: string;
  image: any;
}

const slides: Slide[] = [
  {
    key: 'twin',
    badge: 'SMART COMMUTE 🚗',
    title: 'Why ride alone when your twin exists?',
    subtitle: 'Connect with verified daily commuters traveling along your exact route.',
    image: require('@/assets/images/splash1.png'),
  },
  {
    key: 'share',
    badge: 'SPLIT EXPENSES 💰',
    title: 'Share rides. Split travel costs.',
    subtitle: 'Save money every day and make your daily travel faster and smoother.',
    image: require('@/assets/images/splash2.png'),
  },
  {
    key: 'trust',
    badge: 'VERIFIED & SAFE 🛡️',
    title: 'Verified profiles & Women Only mode',
    subtitle: 'Built with safety first, emergency contacts, and trusted community reviews.',
    image: require('@/assets/images/splash3.png'),
  },
];

export default function Onboarding() {
  const router = useRouter();
  // The page the gate turned away from, if any.
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setStep((prev) => (prev + 1) % slides.length);
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  const handleGetStarted = () => {
    router.replace(withNext('/login', next));
  };

  const slide = slides[step];

  return (
    <SafeAreaView style={styles.container} testID="onboarding-screen">
      <View style={styles.top}>
        <LinqLogo size={42} showText={false} />
        <Pressable testID="skip-onboarding-button" onPress={handleGetStarted} hitSlop={12}>
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <View style={styles.heroCard}>
        <View style={styles.badgeContainer}>
          <Text style={styles.badgeText}>{slide.badge}</Text>
        </View>

        <Image source={slide.image} style={styles.image} resizeMode="contain" />

        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.subtitle}>{slide.subtitle}</Text>
      </View>

      <View style={styles.dots}>
        {slides.map((_, i) => (
          <Pressable key={i} onPress={() => setStep(i)} hitSlop={8}>
            <View style={[styles.dot, i === step && styles.dotActive]} />
          </Pressable>
        ))}
      </View>

      <View style={styles.bottom}>
        <Mission1000Banner compact />
        <View style={{ height: spacing.md }} />
        <PrimaryButton
          testID="onboarding-next-button"
          title="Let's Start"
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

  heroCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.md,
  },
  badgeContainer: {
    backgroundColor: colors.primaryLight,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
  },
  badgeText: {
    fontSize: font.size.xs,
    fontWeight: font.weight.bold,
    color: colors.primary,
    letterSpacing: 0.5,
  },
  image: {
    width: width * 0.7,
    height: width * 0.55,
    maxWidth: 280,
    maxHeight: 220,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: font.size['2xl'],
    color: colors.textPrimary,
    fontWeight: font.weight.bold,
    textAlign: 'center',
    lineHeight: 30,
  },
  subtitle: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
    maxWidth: 290,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', marginBottom: spacing.lg, gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 28 },
  bottom: { paddingBottom: spacing.lg },
});
