import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import LinqHeader from '@/src/components/LinqHeader';
import { useApp } from '@/src/context/AppContext';
import VerificationWebView from '@/src/components/VerificationWebView';
import { supabase } from '@/src/lib/supabase';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

type Status = 'verified' | 'pending' | 'not_verified';

export default function VerificationProfile() {
  const { showToast } = useApp();
  const [items, setItems] = useState<{ key: string; label: string; sub: string; icon: keyof typeof Ionicons.glyphMap; status: Status }[]>([
    { key: 'aadhaar', label: 'Aadhaar Card', sub: 'Government ID verification', icon: 'id-card', status: 'verified' },
    { key: 'pan', label: 'PAN Card', sub: 'Tax identity verification', icon: 'card', status: 'pending' },
    { key: 'dl', label: 'Driving Licence', sub: 'Required to offer rides', icon: 'car-sport', status: 'not_verified' },
  ]);

  const [webviewVisible, setWebviewVisible] = useState(false);
  const [kycUrl, setKycUrl] = useState('');
  const [activeKey, setActiveKey] = useState('');

  const statusMeta = (s: Status) =>
    s === 'verified' ? { label: 'Verified', color: colors.success, bg: colors.successLight }
      : s === 'pending' ? { label: 'Pending', color: colors.warning, bg: colors.warningLight }
        : { label: 'Not Verified', color: colors.textSecondary, bg: colors.surfaceSecondary };

  const handleVerify = async (key: string) => {
    setActiveKey(key);
    setWebviewVisible(true);
    setKycUrl('');

    try {
      // Call Supabase Edge Function to generate the Cashfree link
      const { data, error } = await supabase.functions.invoke('create-kyc-session', {
        body: { type: key.toUpperCase() },
      });

      if (error || !data?.verificationUrl) throw new Error(error?.message || 'Failed to generate session');
      
      setKycUrl(data.verificationUrl);
    } catch (e: any) {
      setWebviewVisible(false);
      showToast(e.message || 'Error connecting to verification provider');
    }
  };

  const handleSuccess = () => {
    setWebviewVisible(false);
    setItems((prev) => prev.map((i) => (i.key === activeKey && i.status === 'not_verified' ? { ...i, status: 'pending' } : i)));
    showToast('Verification submitted and is pending review');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="verification-profile-screen">
      <LinqHeader title="Verification" />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <View style={styles.banner}>
          <Ionicons name="shield-checkmark" size={22} color={colors.primary} />
          <Text style={styles.bannerText}>Verified members get more requests and build community trust.</Text>
        </View>

        {items.map((item) => {
          const meta = statusMeta(item.status);
          return (
            <View key={item.key} style={styles.card}>
              <View style={styles.iconBox}><Ionicons name={item.icon} size={22} color={colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{item.label}</Text>
                <Text style={styles.sub}>{item.sub}</Text>
              </View>
              {item.status === 'not_verified' ? (
                <Pressable testID={`verify-${item.key}`} style={styles.verifyBtn} onPress={() => handleVerify(item.key)}>
                  <Text style={styles.verifyText}>Verify</Text>
                </Pressable>
              ) : (
                <View style={[styles.badge, { backgroundColor: meta.bg }]}>
                  {item.status === 'verified' && <Ionicons name="checkmark-circle" size={12} color={meta.color} />}
                  <Text style={[styles.badgeText, { color: meta.color }]}>{meta.label}</Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <VerificationWebView 
        visible={webviewVisible}
        url={kycUrl}
        onClose={() => setWebviewVisible(false)}
        onSuccess={handleSuccess}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  banner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.primaryLight, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  bannerText: { flex: 1, fontSize: font.size.sm, color: colors.textPrimary },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  iconBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  sub: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
  verifyBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.lg, height: 36, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  verifyText: { color: colors.textInverse, fontSize: font.size.sm, fontWeight: font.weight.medium },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, height: 28, borderRadius: radius.pill },
  badgeText: { fontSize: font.size.xs, fontWeight: font.weight.medium },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  modalTitle: { fontSize: font.size.base, fontWeight: font.weight.medium, color: colors.textPrimary },
});
