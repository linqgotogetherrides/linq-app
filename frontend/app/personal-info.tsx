import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import LinqHeader from '@/src/components/LinqHeader';
import PrimaryButton from '@/src/components/PrimaryButton';
import { useApp } from '@/src/context/AppContext';
import { supabase } from '@/src/lib/supabase';
import { colors, spacing, font, radius } from '@/src/theme/tokens';
import type { User, VerificationDocument, VerificationStatus } from '@/src/types';

const GENDERS: { value: NonNullable<User['gender']>; label: string; icon: 'woman' | 'man' | 'person' }[] = [
  { value: 'female', label: 'Female', icon: 'woman' },
  { value: 'male', label: 'Male', icon: 'man' },
  { value: 'other', label: 'Other', icon: 'person' },
];

const VERIFICATION_LABELS: Record<VerificationDocument, string> = {
  aadhaar: 'Aadhaar Card',
  pan: 'PAN Card',
  dl: 'Driving Licence',
};

function normalizePhone(value?: string) {
  const digits = (value || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function verificationLabel(status?: VerificationStatus) {
  if (status === 'verified') return 'Verified';
  if (status === 'pending') return 'Pending review';
  return 'Not verified';
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  testID,
  isPhone,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  keyboardType?: 'default' | 'number-pad' | 'phone-pad' | 'email-address';
  testID: string;
  isPhone?: boolean;
  maxLength?: number;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.input, focused && styles.inputFocused, isPhone && styles.phoneInput]}>
        {isPhone && (
          <View style={styles.phonePrefix}>
            <Text>🇮🇳</Text>
            <Text style={styles.phonePrefixText}>+91</Text>
          </View>
        )}
        <TextInput
          testID={testID}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textTertiary}
          keyboardType={keyboardType}
          maxLength={maxLength}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.inputText, isPhone && styles.phoneTextInput]}
        />
      </View>
    </View>
  );
}

export default function PersonalInfo() {
  const { user, setUser, showToast } = useApp();
  const [name, setName] = useState(user?.name || '');
  const [age, setAge] = useState(user?.age != null ? String(user.age) : '');
  const [gender, setGender] = useState<User['gender']>(user?.gender);
  const [womenOnly, setWomenOnly] = useState(Boolean(user?.womenOnlyMode));
  const [bio, setBio] = useState(user?.bio || '');
  const [phone, setPhone] = useState(normalizePhone(user?.phone));
  const [email, setEmail] = useState(user?.email || '');
  const [home, setHome] = useState(user?.homeAddress || '');
  const [office, setOffice] = useState(user?.officeAddress || '');
  const [college, setCollege] = useState(user?.collegeAddress || '');
  const [emergency, setEmergency] = useState(normalizePhone(user?.emergencyContact));
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(user?.avatarUrl);
  const [verificationDocument, setVerificationDocument] = useState<VerificationDocument | undefined>(
    user?.verificationDocument
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.name || '');
    setAge(user.age != null ? String(user.age) : '');
    setGender(user.gender);
    setWomenOnly(Boolean(user.womenOnlyMode));
    setBio(user.bio || '');
    setPhone(normalizePhone(user.phone));
    setEmail(user.email || '');
    setHome(user.homeAddress || '');
    setOffice(user.officeAddress || '');
    setCollege(user.collegeAddress || '');
    setEmergency(normalizePhone(user.emergencyContact));
    setAvatarUrl(user.avatarUrl);
    setVerificationDocument(user.verificationDocument);
  }, [user]);

  if (!user) return null;

  const handleUploadPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.2,
        base64: true,
      });
      if (!result.canceled && result.assets[0]?.base64) {
        setAvatarUrl(`data:image/jpeg;base64,${result.assets[0].base64}`);
        showToast('Photo selected. Save changes to update your profile.');
      }
    } catch {
      showToast('Could not select photo');
    }
  };

  const handleRemovePhoto = () => {
    setAvatarUrl(undefined);
    showToast('Photo removed. Save changes to update your profile.');
  };

  const save = async () => {
    const normalizedPhone = normalizePhone(phone);
    const normalizedEmergency = normalizePhone(emergency);
    const normalizedAge = age.trim() ? Number(age) : null;

    if (normalizedPhone && normalizedPhone.length !== 10) {
      showToast('Phone number must be exactly 10 digits');
      return;
    }
    if (normalizedEmergency && normalizedEmergency.length !== 10) {
      showToast('Emergency contact must be exactly 10 digits');
      return;
    }
    if (normalizedAge != null && (!Number.isInteger(normalizedAge) || normalizedAge <= 0 || normalizedAge >= 100)) {
      showToast('Enter a valid age between 1 and 99');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('user_profiles').update({
        name: name.trim() || null,
        age: normalizedAge,
        gender: gender || null,
        women_only_mode: gender === 'female' ? womenOnly : false,
        bio: bio.trim() || null,
        phone_number: normalizedPhone || null,
        email: email.trim() || null,
        home_address: home.trim() || null,
        office_address: office.trim() || null,
        college_address: college.trim() || null,
        emergency_contact: normalizedEmergency || null,
        avatar_url: avatarUrl || null,
        verification_document: verificationDocument || null,
      }).eq('id', user.id);

      if (error) throw error;

      setUser({
        ...user,
        name: name.trim(),
        age: normalizedAge || undefined,
        gender: gender || undefined,
        womenOnlyMode: gender === 'female' ? womenOnly : false,
        bio: bio.trim() || undefined,
        phone: normalizedPhone || undefined,
        email: email.trim() || undefined,
        homeAddress: home.trim() || undefined,
        officeAddress: office.trim() || undefined,
        collegeAddress: college.trim() || undefined,
        emergencyContact: normalizedEmergency || undefined,
        avatarUrl,
        verificationDocument,
      });
      showToast('Profile updated');
    } catch (e: any) {
      showToast(e.message || 'Failed to save changes');
    } finally {
      setLoading(false);
    }
  };

  const documentLabel = verificationDocument
    ? VERIFICATION_LABELS[verificationDocument]
    : 'No document selected';

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="personal-info-screen">
      <LinqHeader title="Personal Information" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable style={styles.avatarWrap} onPress={handleUploadPhoto} testID="personal-info-photo">
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person-outline" size={32} color={colors.textTertiary} />
                <Text style={styles.avatarPlaceholderText}>No photo</Text>
              </View>
            )}
            <View style={styles.editBadge}>
              <Ionicons name="camera" size={14} color={colors.textInverse} />
            </View>
          </Pressable>
          <View style={styles.photoActions}>
            <Text style={styles.photoHint}>
              {avatarUrl ? 'Profile photo uploaded' : 'No profile photo uploaded'}
            </Text>
            {avatarUrl && (
              <Pressable onPress={handleRemovePhoto} testID="remove-profile-photo">
                <Text style={styles.removePhotoText}>Remove photo</Text>
              </Pressable>
            )}
          </View>

          <Field label="Full Name" value={name} onChange={setName} placeholder="Full name" testID="pi-name" />
          <Field
            label="Age"
            value={age}
            onChange={setAge}
            placeholder="Age"
            keyboardType="number-pad"
            maxLength={3}
            testID="pi-age"
          />

          <Text style={styles.label}>Gender</Text>
          <View style={styles.genderRow}>
            {GENDERS.map((option) => {
              const selected = gender === option.value;
              return (
                <Pressable
                  key={option.value}
                  style={[styles.genderButton, selected && styles.genderButtonActive]}
                  onPress={() => setGender(option.value)}
                  testID={`pi-gender-${option.value}`}
                >
                  <Ionicons
                    name={option.icon}
                    size={20}
                    color={selected ? colors.primary : colors.textSecondary}
                  />
                  <Text style={[styles.genderText, selected && styles.genderTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {gender === 'female' && (
            <View style={styles.preferenceRow}>
              <View style={styles.preferenceCopy}>
                <Text style={styles.preferenceTitle}>Women-only mode</Text>
                <Text style={styles.preferenceSub}>Only show and match with women commuters.</Text>
              </View>
              <Switch
                value={womenOnly}
                onValueChange={setWomenOnly}
                trackColor={{ false: colors.border, true: '#FF69B4' }}
                thumbColor={colors.textInverse}
                testID="pi-women-only"
              />
            </View>
          )}

          <Field label="Bio" value={bio} onChange={setBio} placeholder="Tell us about you" testID="pi-bio" maxLength={120} />
          <Field
            label="Phone"
            value={phone}
            onChange={setPhone}
            placeholder="Phone number"
            keyboardType="phone-pad"
            maxLength={10}
            testID="pi-phone"
            isPhone
          />
          <Field
            label="Email"
            value={email}
            onChange={setEmail}
            placeholder="Email address"
            keyboardType="email-address"
            testID="pi-email"
          />
          <Field label="Home Address" value={home} onChange={setHome} placeholder="Home address" testID="pi-home" />
          <Field label="Office Address" value={office} onChange={setOffice} placeholder="Office address" testID="pi-office" />
          <Field label="College Address" value={college} onChange={setCollege} placeholder="College address" testID="pi-college" />
          <Field
            label="Emergency Contact"
            value={emergency}
            onChange={setEmergency}
            placeholder="Emergency contact"
            keyboardType="phone-pad"
            maxLength={10}
            testID="pi-emergency"
            isPhone
          />

          <View style={styles.verificationCard} testID="pi-verification-summary">
            <View style={styles.verificationIcon}>
              <Ionicons name="shield-checkmark-outline" size={20} color={colors.primary} />
            </View>
            <View style={styles.verificationCopy}>
              <Text style={styles.verificationTitle}>Identity verification</Text>
              <Text style={styles.verificationText}>{documentLabel}</Text>
              <Text style={styles.verificationStatus}>{verificationLabel(user.verification)}</Text>
            </View>
          </View>

          <PrimaryButton
            testID="save-profile"
            title={loading ? 'Saving...' : 'Save Changes'}
            onPress={save}
            disabled={loading}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { padding: spacing.xl, paddingBottom: 40 },
  avatarWrap: { alignSelf: 'center', marginBottom: spacing.sm },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surfaceSecondary },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarPlaceholderText: { marginTop: 2, color: colors.textTertiary, fontSize: font.size.xs },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  photoActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  photoHint: { color: colors.textTertiary, fontSize: font.size.xs },
  removePhotoText: { color: colors.error, fontSize: font.size.xs, fontWeight: font.weight.medium },
  fieldWrap: { marginBottom: spacing.lg },
  label: { fontSize: font.size.sm, color: colors.textSecondary, marginBottom: spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  inputFocused: { borderColor: colors.primary, backgroundColor: colors.surface },
  inputText: { fontSize: font.size.base, color: colors.textPrimary },
  phoneInput: { flexDirection: 'row', alignItems: 'center' },
  phonePrefix: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingRight: spacing.sm,
    marginRight: spacing.sm,
  },
  phonePrefixText: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium, marginLeft: 4 },
  phoneTextInput: { flex: 1, paddingHorizontal: 0 },
  genderRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  genderButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  genderButtonActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  genderText: { color: colors.textSecondary, fontSize: font.size.sm, fontWeight: font.weight.medium },
  genderTextActive: { color: colors.primary, fontWeight: font.weight.bold },
  preferenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.femaleLight,
  },
  preferenceCopy: { flex: 1, marginRight: spacing.md },
  preferenceTitle: { color: colors.textPrimary, fontSize: font.size.sm, fontWeight: font.weight.medium },
  preferenceSub: { marginTop: 2, color: colors.textSecondary, fontSize: font.size.xs },
  verificationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  verificationIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.primaryLight },
  verificationCopy: { flex: 1 },
  verificationTitle: { color: colors.textPrimary, fontSize: font.size.sm, fontWeight: font.weight.medium },
  verificationText: { marginTop: 2, color: colors.textSecondary, fontSize: font.size.sm },
  verificationStatus: { marginTop: 2, color: colors.primary, fontSize: font.size.xs, fontWeight: font.weight.medium },
});
