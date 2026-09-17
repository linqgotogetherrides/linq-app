import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/src/lib/supabase';
import { useApp } from '@/src/context/AppContext';
import LinqLogo from '@/src/components/LinqLogo';
import PrimaryButton from '@/src/components/PrimaryButton';
import Mission1000Banner from '@/src/components/Mission1000Banner';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

export default function Emergency() {
  const router = useRouter();
  const [emergency, setEmergency] = useState('');
  const [photoAdded, setPhotoAdded] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const { fetchUserProfile, showToast } = useApp();

  const handleUploadPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.2,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setAvatarUrl(`data:image/jpeg;base64,${result.assets[0].base64}`);
      setPhotoAdded(true);
    }
  };

  const handleContinue = async () => {
    if (!uid) {
      router.push('/verification');
      return;
    }
    
    try {
      setLoading(true);
      const updates: any = {
        emergency_contact: emergency.trim(),
      };
      if (avatarUrl) {
        updates.avatar_url = avatarUrl;
      }
      
      const { error } = await supabase.from('user_profiles').update(updates).eq('id', uid);
      
      if (error) throw error;
      
      await fetchUserProfile(uid);
      router.push({ pathname: '/verification', params: { uid } });
    } catch (e: any) {
      showToast(e.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };
  return (
    <SafeAreaView style={styles.container} testID="emergency-screen">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl }} keyboardShouldPersistTaps="handled">
          <View style={styles.top}>
            <LinqLogo size={40} showText={false} />
            <Pressable onPress={() => router.replace({ pathname: '/verification', params: { uid } })} testID="skip-emergency"><Text style={styles.skip}>Skip</Text></Pressable>
          </View>

          <View style={styles.card}>
            <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
              <View style={styles.heroCircle}>
                <Ionicons name="phone-portrait" size={64} color={colors.primary} />
              </View>
              <Text style={styles.title}>Almost there!</Text>
              <Text style={styles.sub}>Add a few more details for a safer journey.</Text>
            </View>

            <Text style={styles.label}><Ionicons name="call" size={14} color={colors.error} /> Emergency Contact</Text>
            <View style={styles.inputRow}>
              <View style={styles.cc}>
                <Text>🇮🇳</Text>
                <Text style={styles.ccText}>+91</Text>
              </View>
              <TextInput
                testID="emergency-contact-input"
                value={emergency}
                onChangeText={setEmergency}
                placeholder="Enter contact number"
                placeholderTextColor={colors.textTertiary}
                keyboardType="phone-pad"
                maxLength={10}
                style={styles.input}
              />
            </View>

            <Text style={styles.label}><Ionicons name="camera" size={14} color={colors.primary} /> Add your photo</Text>
            <Pressable style={[styles.uploadBox, photoAdded && styles.uploadBoxDone]} testID="upload-photo-btn" onPress={handleUploadPhoto}>
              <Ionicons name={photoAdded ? 'checkmark-circle' : 'camera'} size={28} color={photoAdded ? colors.success : colors.primary} />
              <Text style={[styles.uploadText, photoAdded && { color: colors.success }]}>{photoAdded ? 'Photo Added' : 'Upload Photo'}</Text>
            </Pressable>
            <Text style={styles.helper}>Help others recognize you</Text>

            <View style={{ marginTop: spacing.lg }}>
              <PrimaryButton testID="emergency-continue" title={loading ? "Saving..." : "Continue"} iconRight={loading ? undefined : "arrow-forward"} onPress={handleContinue} disabled={loading || emergency.length < 10} />
            </View>
          </View>

          <View style={styles.progressRow}>
            <View style={[styles.progressDot, styles.progressActive]} />
            <View style={[styles.progressDot, styles.progressActive]} />
            <View style={styles.progressDot} />
          </View>

          <Mission1000Banner />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  skip: { color: colors.primary, fontSize: font.size.base, fontWeight: font.weight.medium },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg, backgroundColor: colors.surface },
  heroCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  title: { fontSize: font.size.xl, color: colors.textPrimary, fontWeight: font.weight.medium },
  sub: { fontSize: font.size.base, color: colors.textSecondary, marginTop: 4 },
  label: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium, marginTop: spacing.md, marginBottom: spacing.sm },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary },
  cc: { flexDirection: 'row', gap: 4, paddingHorizontal: spacing.md, height: 48, alignItems: 'center', borderRightWidth: 1, borderRightColor: colors.border },
  ccText: { color: colors.textPrimary, fontSize: font.size.base, fontWeight: font.weight.medium },
  input: { flex: 1, height: 48, paddingHorizontal: spacing.md, color: colors.textPrimary, fontSize: font.size.base },
  uploadBox: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.xs },
  uploadBoxDone: { borderColor: colors.success, backgroundColor: colors.successLight, borderStyle: 'solid' },
  uploadText: { color: colors.primary, fontSize: font.size.base, fontWeight: font.weight.medium },
  helper: { fontSize: font.size.xs, color: colors.textTertiary, textAlign: 'center', marginTop: spacing.xs },
  progressRow: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: spacing.lg, marginTop: spacing.lg },
  progressDot: { width: 24, height: 4, borderRadius: 2, backgroundColor: colors.border },
  progressActive: { backgroundColor: colors.primary },
});
