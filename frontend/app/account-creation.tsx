import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, Switch, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { useApp } from '@/src/context/AppContext';
import LinqLogo from '@/src/components/LinqLogo';
import Mission1000Banner from '@/src/components/Mission1000Banner';
import PrimaryButton from '@/src/components/PrimaryButton';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

export default function AccountCreation() {
  const router = useRouter();
  const { uid, phone } = useLocalSearchParams<{ uid: string; phone: string }>();
  const { fetchUserProfile, showToast } = useApp();
  
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<'female' | 'male' | 'other' | ''>('female');
  const [womenOnly, setWomenOnly] = useState(false);
  const [showWomenOnlyInfo, setShowWomenOnlyInfo] = useState(false);
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(false);

  const canContinue = name.trim().length > 1 && Number(age) > 0;

  const handleContinue = async () => {
    if (!uid) {
      showToast('Session error. Please restart login.');
      return;
    }
    
    try {
      setLoading(true);
      const { error } = await supabase.from('user_profiles').insert({
        id: uid,
        phone_number: phone,
        name: name.trim(),
        age: parseInt(age, 10),
        gender,
        women_only_mode: gender === 'female' ? womenOnly : false,
        bio: bio.trim(),
      });
      
      if (error) throw error;
      
      await fetchUserProfile(uid);
      router.push({ pathname: '/emergency', params: { uid, phone } });
    } catch (e: any) {
      showToast(e.message || 'Failed to create profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} testID="account-creation-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: spacing['3xl'] }} keyboardShouldPersistTaps="handled">
          <View style={styles.top}>
            <LinqLogo size={40} showText={false} />
            <Pressable onPress={() => router.replace('/(tabs)')} hitSlop={12} testID="skip-account">
              <Text style={styles.skip}>Skip</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>What should we call you?</Text>
            <View style={styles.input}>
              <Ionicons name="person" size={16} color={colors.textSecondary} />
              <TextInput testID="input-name" value={name} onChangeText={setName} placeholder="Enter your full name" placeholderTextColor={colors.textTertiary} style={styles.textInput} />
            </View>

            <Text style={styles.title}>How old are you?</Text>
            <View style={styles.input}>
              <Ionicons name="calendar" size={16} color={colors.textSecondary} />
              <TextInput testID="input-age" value={age} onChangeText={setAge} keyboardType="number-pad" maxLength={2} placeholder="Enter your age" placeholderTextColor={colors.textTertiary} style={styles.textInput} />
            </View>

            <Text style={styles.title}>What&apos;s your gender?</Text>
            <View style={styles.genderRow}>
              {(['female', 'male', 'other'] as const).map((g) => (
                <Pressable key={g} testID={`gender-${g}`} onPress={() => setGender(g)} style={[styles.chip, gender === g && styles.chipActive]}>
                  <Text style={[styles.chipText, gender === g && styles.chipTextActive]}>{g[0].toUpperCase() + g.slice(1)}</Text>
                </Pressable>
              ))}
            </View>

            {gender === 'female' && (
              <View style={styles.toggleRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                  <Text style={styles.toggleLabel}>Women only mode</Text>
                  <Pressable 
                    onPress={() => setShowWomenOnlyInfo(true)} 
                    style={{ padding: 4 }}
                  >
                    <Ionicons name="information-circle" size={22} color={colors.textSecondary} />
                  </Pressable>
                </View>
                <Switch 
                  value={womenOnly} 
                  onValueChange={setWomenOnly} 
                  trackColor={{ false: colors.border, true: '#FF69B4' }} 
                  thumbColor="#FFFFFF" 
                  //@ts-ignore
                  activeTrackColor="#FF69B4"
                  testID="women-only-toggle" 
                />
              </View>
            )}

            <Text style={styles.title}>Tell us about yourself (Optional)</Text>
            <View style={[styles.input, { minHeight: 80, alignItems: 'flex-start' }]}>
              <TextInput
                testID="input-bio"
                value={bio}
                onChangeText={(v) => setBio(v.slice(0, 120))}
                placeholder="A short bio about you..."
                placeholderTextColor={colors.textTertiary}
                multiline
                style={[styles.textInput, { textAlignVertical: 'top', minHeight: 60, paddingTop: 8 }]}
              />
            </View>
            <Text style={styles.charCount}>{bio.length}/120</Text>

            <View style={{ marginTop: spacing.md }}>
              <PrimaryButton testID="account-continue" title={loading ? "Creating..." : "Continue"} iconRight={loading ? undefined : "arrow-forward"} disabled={!canContinue || loading} onPress={handleContinue} />
            </View>
          </View>

          <View style={styles.progressRow}>
            <View style={[styles.progressDot, styles.progressActive]} />
            <View style={styles.progressDot} />
            <View style={styles.progressDot} />
          </View>

          <Mission1000Banner />
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={showWomenOnlyInfo} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Women only mode</Text>
            <Text style={styles.modalText}>If enabled, your rides and profile will only be visible to women, and you’ll only see women users.</Text>
            <PrimaryButton title="Got it" onPress={() => setShowWomenOnlyInfo(false)} />
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  skip: { fontSize: font.size.base, color: colors.primary, fontWeight: font.weight.medium },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: colors.surface, marginBottom: spacing.lg },
  title: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium, marginTop: spacing.md, marginBottom: spacing.sm },
  input: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceSecondary, minHeight: 48, gap: spacing.sm },
  textInput: { flex: 1, height: 48, color: colors.textPrimary, fontSize: font.size.base },
  genderRow: { flexDirection: 'row', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.lg, height: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textSecondary, fontSize: font.size.base, fontWeight: font.weight.medium },
  chipTextActive: { color: colors.textInverse },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  toggleLabel: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  charCount: { fontSize: font.size.xs, color: colors.textTertiary, alignSelf: 'flex-end', marginTop: 2 },
  progressRow: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: spacing.lg },
  progressDot: { width: 24, height: 4, borderRadius: 2, backgroundColor: colors.border },
  progressActive: { backgroundColor: colors.primary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  modalContent: { backgroundColor: colors.surface, padding: spacing.xl, borderRadius: radius.lg, width: '100%', maxWidth: 340 },
  modalTitle: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.textPrimary, marginBottom: spacing.md },
  modalText: { fontSize: font.size.base, color: colors.textSecondary, marginBottom: spacing.xl, lineHeight: 22 },
});
