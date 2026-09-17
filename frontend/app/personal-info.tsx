import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, KeyboardAvoidingView, Platform, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import LinqHeader from '@/src/components/LinqHeader';
import PrimaryButton from '@/src/components/PrimaryButton';
import { useApp } from '@/src/context/AppContext';
import { supabase } from '@/src/lib/supabase';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

function Field({ label, value, onChange, placeholder, keyboardType, testID, isPhone }: any) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.input, focused && styles.inputFocused, isPhone && { flexDirection: 'row', alignItems: 'center' }]}>
        {isPhone && (
          <View style={{ flexDirection: 'row', alignItems: 'center', borderRightWidth: 1, borderRightColor: colors.border, paddingRight: spacing.sm, marginRight: spacing.sm }}>
            <Text>🇮🇳</Text>
            <Text style={{ fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium, marginLeft: 4 }}>+91</Text>
          </View>
        )}
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          keyboardType={keyboardType}
          maxLength={isPhone ? 10 : undefined}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.inputText, isPhone && { flex: 1, paddingHorizontal: 0 }]}
        />
      </View>
    </View>
  );
}

export default function PersonalInfo() {
  const { user, setUser, showToast } = useApp();
  const [name, setName] = useState(user?.name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [email, setEmail] = useState(user?.email || '');
  const [home, setHome] = useState(user?.homeAddress || '');
  const [office, setOffice] = useState(user?.officeAddress || '');
  const [emergency, setEmergency] = useState(user?.emergencyContact || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (user) {
      setName(user.name || '');
      setBio(user.bio || '');
      setPhone(user.phone || '');
      setEmail(user.email || '');
      setHome(user.homeAddress || '');
      setOffice(user.officeAddress || '');
      setEmergency(user.emergencyContact || '');
      setAvatarUrl(user.avatarUrl);
    }
  }, [user]);

  if (!user) return null;

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
    }
  };

  const save = async () => {
    if (phone && phone.length !== 10) {
      showToast('Phone number must be exactly 10 digits');
      return;
    }
    if (emergency && emergency.length !== 10) {
      showToast('Emergency contact must be exactly 10 digits');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('user_profiles').update({
        name,
        bio,
        phone_number: phone,
        email,
        home_address: home,
        office_address: office,
        emergency_contact: emergency,
        avatar_url: avatarUrl,
      }).eq('id', user.id);

      if (error) throw error;

      setUser({ ...user, name, bio, phone, email, homeAddress: home, officeAddress: office, emergencyContact: emergency, avatarUrl });
      showToast('Profile updated');
    } catch (e: any) {
      showToast(e.message || 'Failed to save changes');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="personal-info-screen">
      <LinqHeader title="Personal Information" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Pressable style={styles.avatarWrap} onPress={handleUploadPhoto}>
            <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />
            <View style={styles.editBadge}><Ionicons name="camera" size={14} color={colors.textInverse} /></View>
          </Pressable>

          <Field label="Full Name" value={name} onChange={setName} placeholder="Full name" testID="pi-name" />
          <Field label="Bio" value={bio} onChange={setBio} placeholder="Tell us about you" testID="pi-bio" />
          <Field label="Phone" value={phone} onChange={setPhone} placeholder="Phone number" keyboardType="phone-pad" testID="pi-phone" isPhone />
          <Field label="Email" value={email} onChange={setEmail} placeholder="Email address" keyboardType="email-address" testID="pi-email" />
          <Field label="Home Address" value={home} onChange={setHome} placeholder="Home address" testID="pi-home" />
          <Field label="Office Address" value={office} onChange={setOffice} placeholder="Office address" testID="pi-office" />
          <Field label="Emergency Contact" value={emergency} onChange={setEmergency} placeholder="Emergency contact" keyboardType="phone-pad" testID="pi-emergency" isPhone />

          <PrimaryButton testID="save-profile" title={loading ? "Saving..." : "Save Changes"} onPress={save} disabled={loading} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  avatarWrap: { alignSelf: 'center', marginBottom: spacing.xl },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surfaceSecondary },
  editBadge: { position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.background },
  label: { fontSize: font.size.sm, color: colors.textSecondary, marginBottom: spacing.sm },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, height: 48, justifyContent: 'center', paddingHorizontal: spacing.md },
  inputFocused: { borderColor: colors.primary, backgroundColor: colors.surface },
  inputText: { fontSize: font.size.base, color: colors.textPrimary },
});
