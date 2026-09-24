import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import { signOut } from '@/src/lib/auth';
import GuestPrompt from '@/src/components/GuestPrompt';
import { colors, spacing, font, radius, shadow } from '@/src/theme/tokens';

interface Row {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub?: string;
  route: string;
  color?: string;
  danger?: boolean;
}

const sections: { title: string; rows: Row[] }[] = [
  {
    title: 'Account',
    rows: [
      { icon: 'person-outline', label: 'Personal Information', sub: 'Name, phone, email', route: '/personal-info' },
      { icon: 'shield-checkmark-outline', label: 'Verification', sub: 'Aadhaar, PAN, Driving Licence', route: '/verification-profile' },
    ],
  },
  {
    title: 'Payments',
    rows: [
      { icon: 'wallet-outline', label: 'Wallet & Transactions', sub: 'Balance & payment history', route: '/wallet' },
      { icon: 'share-social-outline', label: 'Refer a Friend', sub: 'Invite & earn rewards', route: '/referral' },
    ],
  },
  {
    title: 'More',
    rows: [
      { icon: 'lock-closed-outline', label: 'Safety & Privacy', route: '/safety' },
      { icon: 'help-circle-outline', label: 'Support & Help', route: '/support' },
      { icon: 'settings-outline', label: 'Settings', route: '/settings' },
    ],
  },
];

export default function Profile() {
  const router = useRouter();
  const { user, setUser, setIsAuthed } = useApp();

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']} testID="profile-screen">
        <View style={styles.heroBg}>
          <View style={styles.heroTop}>
            <Text style={styles.heroTitle}>Profile</Text>
          </View>
        </View>
        <GuestPrompt 
          icon="person-circle-outline" 
          title="Login to View Profile" 
          subtitle="Manage your personal information, wallet, and settings." 
        />
      </SafeAreaView>
    );
  }

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (e) {
      console.log('Firebase signout error:', e);
    }
    setUser(null);
    setIsAuthed(false);
    router.replace('/onboarding');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="profile-screen">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={styles.heroBg}>
          <View style={styles.heroTop}>
            <Text style={styles.heroTitle}>Profile</Text>
            <Pressable testID="edit-profile" onPress={() => router.push('/personal-info')}>
              <Ionicons name="create-outline" size={22} color={colors.textInverse} />
            </Pressable>
          </View>
        </View>

        <View style={styles.profileCard}>
          <Image source={{ uri: user.avatarUrl }} style={styles.avatar} contentFit="cover" />
          <Text style={styles.name}>{user.name}, {user.age}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.verifiedBadge}>
              <Ionicons name="shield-checkmark" size={12} color={colors.success} />
              <Text style={styles.verifiedText}>Verified</Text>
            </View>
            <Text style={styles.genderText}>{user.gender === 'female' ? 'Female' : 'Male'}</Text>
          </View>
          {user.bio && <Text style={styles.bio}>{user.bio}</Text>}

          <View style={styles.stats}>
            <View style={styles.stat}><Text style={styles.statValue}>{user.trips}</Text><Text style={styles.statLabel}>Trips</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={[styles.statValue, { color: colors.success }]}>{user.co2Saved} kg</Text><Text style={styles.statLabel}>CO₂ Saved</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={[styles.statValue, { color: colors.primary }]}>{user.rating} ★</Text><Text style={styles.statLabel}>Rating</Text></View>
          </View>
        </View>

        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionCard}>
              {section.rows.map((row, i) => (
                <Pressable
                  key={row.label}
                  testID={`profile-row-${row.route.replace('/', '')}`}
                  onPress={() => router.push(row.route as any)}
                  style={[styles.row, i < section.rows.length - 1 && styles.rowBorder]}
                >
                  <View style={styles.rowIcon}><Ionicons name={row.icon} size={20} color={colors.primary} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowLabel}>{row.label}</Text>
                    {row.sub && <Text style={styles.rowSub}>{row.sub}</Text>}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Pressable style={styles.logout} testID="logout-button" onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={colors.error} />
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>
        <Text style={styles.version}>LinQ Rides v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  heroBg: { backgroundColor: colors.primary, height: 120, paddingHorizontal: spacing.xl },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: spacing.md },
  heroTitle: { fontSize: font.size['2xl'], color: colors.textInverse, fontWeight: font.weight.medium },
  profileCard: { marginHorizontal: spacing.xl, marginTop: -60, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', borderWidth: 1, borderColor: colors.border, ...shadow.md },
  avatar: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: colors.surface, marginTop: -50, backgroundColor: colors.surfaceSecondary },
  name: { fontSize: font.size.xl, color: colors.textPrimary, fontWeight: font.weight.medium, marginTop: spacing.sm },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.successLight, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  verifiedText: { fontSize: font.size.xs, color: colors.success, fontWeight: font.weight.medium },
  genderText: { fontSize: font.size.sm, color: colors.textSecondary },
  bio: { fontSize: font.size.sm, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm, paddingHorizontal: spacing.md },
  stats: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg, alignSelf: 'stretch' },
  stat: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 32, backgroundColor: colors.divider },
  statValue: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium },
  statLabel: { fontSize: font.size.xs, color: colors.textTertiary, marginTop: 2 },
  section: { marginTop: spacing.xl, paddingHorizontal: spacing.xl },
  sectionTitle: { fontSize: font.size.sm, color: colors.textTertiary, fontWeight: font.weight.medium, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.md, minHeight: 56 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  rowSub: { fontSize: font.size.xs, color: colors.textSecondary, marginTop: 2 },
  logout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.xl, marginHorizontal: spacing.xl, height: 52, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.errorLight, backgroundColor: colors.errorLight },
  logoutText: { color: colors.error, fontSize: font.size.base, fontWeight: font.weight.medium },
  version: { textAlign: 'center', color: colors.textTertiary, fontSize: font.size.xs, marginTop: spacing.lg },
});
