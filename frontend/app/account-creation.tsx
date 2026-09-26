import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Modal,
  Image,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/src/lib/supabase';
import { saveSession } from '@/src/services/session';
import { signInWithPhoneNumber } from '@/src/lib/auth';
import { destinationAfterAuth } from '@/src/lib/authNavigation';
import { useApp } from '@/src/context/AppContext';
import LinqLogo from '@/src/components/LinqLogo';
import Mission1000Banner from '@/src/components/Mission1000Banner';
import PrimaryButton from '@/src/components/PrimaryButton';
import { colors, spacing, font, radius, shadow } from '@/src/theme/tokens';
import type { User, VerificationDocument } from '@/src/types';

function normalizePhone(value?: string) {
  const digits = (value || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

const VERIFICATION_OPTIONS: {
  key: VerificationDocument;
  label: string;
  sub: string;
  icon: 'id-card' | 'card' | 'car-sport';
}[] = [
  { key: 'aadhaar', label: 'Aadhaar Card', sub: 'Verify instantly using Aadhaar', icon: 'id-card' as const },
  { key: 'pan', label: 'PAN Card', sub: 'Verify using your PAN card', icon: 'card' as const },
  { key: 'dl', label: 'Driving Licence', sub: 'Verify using your Driving Licence', icon: 'car-sport' as const },
];

export default function AccountCreation() {
  const router = useRouter();
  // `uid` is deliberately ignored: a URL param cannot prove a phone number.
  const { phone, next } = useLocalSearchParams<{ phone?: string; next?: string }>();
  const { confirmResult, fetchUserProfile, otpVerifiedUid, setConfirmResult, setOtpVerifiedUid, setUser, showToast } = useApp();

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  /**
   * Phone verification is a gate, not a form field. Reaching this screen from
   * Google or Apple sign-in, or from a direct link, arrives with no verified
   * credential, and the old code papered over that by minting an id from the
   * clock (`user_${Date.now()}`). An account now cannot be created at all
   * until a phone number has been confirmed.
   */
  const [verifiedUid, setVerifiedUid] = useState<string | null>(otpVerifiedUid);
  const [verifyPhone, setVerifyPhone] = useState(phone ?? '');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(Boolean(phone));
  const [otpError, setOtpError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const pendingConfirmation = useRef<any>(confirmResult);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<'female' | 'male' | 'other' | ''>('female');
  const [womenOnly, setWomenOnly] = useState(false);
  const [showWomenOnlyInfo, setShowWomenOnlyInfo] = useState(false);
  const [bio, setBio] = useState('');

  // Emergency Contact & Photo
  const [emergency, setEmergency] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [photoAdded, setPhotoAdded] = useState(false);

  // ID Verification
  const [verificationDoc, setVerificationDoc] = useState<VerificationDocument>('aadhaar');

  const [loading, setLoading] = useState(false);

  const isStep1Valid = name.trim().length > 1;
  const isStep2Valid = Number(age) > 0 && Number(age) < 100;
  const isStep4Valid = emergency.length >= 10;
  const canFinalize = isStep1Valid && isStep2Valid;

  const handleUploadPhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.3,
        base64: true,
      });
      if (!result.canceled && result.assets[0].base64) {
        setAvatarUrl(`data:image/jpeg;base64,${result.assets[0].base64}`);
        setPhotoAdded(true);
        showToast('Photo uploaded successfully');
      }
    } catch {
      showToast('Could not select photo');
    }
  };

  const handleDeletePhoto = () => {
    setAvatarUrl('');
    setPhotoAdded(false);
    showToast('Photo removed');
  };

  const normalizedVerifyPhone = verifyPhone.replace(/\D/g, '');
  const verifyPhoneValid = normalizedVerifyPhone.length >= 10;
  const otpValid = otp.trim().length >= 4;

  const sendVerificationCode = async () => {
    if (!verifyPhoneValid) {
      setOtpError('Enter a valid 10-digit phone number.');
      return;
    }
    try {
      setVerifying(true);
      setOtpError(null);
      const full = `+91${normalizedVerifyPhone}`;
      const confirmation = await signInWithPhoneNumber(full);
      pendingConfirmation.current = confirmation;
      setConfirmResult(confirmation);
      setVerifyPhone(full);
      setOtpSent(true);
      setOtp('');
    } catch (e: any) {
      setOtpError(e?.message ?? 'Could not send the code. Try again.');
    } finally {
      setVerifying(false);
    }
  };

  /** Confirms the code and only then reveals the rest of the form. */
  const confirmVerification = async () => {
    if (!otpValid) {
      setOtpError('Enter the code we sent you.');
      return;
    }
    if (!pendingConfirmation.current) {
      setOtpError('Send a code first.');
      return;
    }
    try {
      setVerifying(true);
      setOtpError(null);
      const credential = await pendingConfirmation.current.confirm(otp.trim());
      setVerifiedUid(credential.user.uid);
      setOtpVerifiedUid(credential.user.uid);
    } catch (e: any) {
      setOtpError(e?.message ?? 'That code was not correct.');
    } finally {
      setVerifying(false);
    }
  };

  const handleNextStep = () => {
    if (step === 1) {
      if (!isStep1Valid) {
        showToast('Please enter your full name');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!isStep2Valid) {
        showToast('Please enter a valid age');
        return;
      }
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    } else if (step === 4) {
      if (!isStep4Valid) {
        showToast('Please enter a valid 10-digit emergency contact');
        return;
      }
      setStep(5);
    }
  };

  const handlePrevStep = () => {
    if (step > 1) {
      setStep((s) => (s - 1) as any);
    }
  };

  const handleComplete = async () => {
    // No fabricated id. Without a phone-confirmed credential there is no
    // account to create, and the form is not even reachable in that state.
    const targetUid = verifiedUid;
    if (!targetUid) {
      showToast('Verify your phone number to finish setting up your account.');
      return;
    }

    try {
      setLoading(true);
      const profileAge = Number(age);
      const normalizedPhone = normalizePhone(phone);
      const localProfile: User = {
        id: targetUid,
        name: name.trim(),
        age: Number.isFinite(profileAge) ? profileAge : undefined,
        gender: gender || 'female',
        womenOnlyMode: gender === 'female' ? womenOnly : false,
        bio: bio.trim() || undefined,
        phone: normalizedPhone || undefined,
        emergencyContact: emergency.trim() || undefined,
        avatarUrl: avatarUrl || undefined,
        verification: 'pending',
        verificationDocument: verificationDoc,
      };
      setUser(localProfile);

      const profileData: any = {
        id: targetUid,
        phone_number: normalizedPhone || null,
        name: name.trim(),
        age: profileAge || 24,
        gender: gender || 'female',
        women_only_mode: gender === 'female' ? womenOnly : false,
        bio: bio.trim(),
        emergency_contact: emergency.trim(),
        verification_status: 'pending',
        verification_document: verificationDoc,
        avatar_url: avatarUrl || null,
      };

      const { error } = await supabase.from('user_profiles').upsert(profileData);
      if (error) {
        // Do not claim success on a failed write. A rider left without a
        // user_profiles row cannot open the referral game or request a seat,
        // because both tables reference this one. Say so, and keep going only
        // if the row genuinely landed.
        console.warn('Supabase profile creation failed:', error.message);
        showToast('Profile could not be saved. Please try again.');
        return;
      }

      const created = await fetchUserProfile(targetUid);
      if (!created) {
        showToast('Profile could not be verified. Please try again.');
        return;
      }
      // Google and Apple sign-in arrive here without passing the OTP screen, so
      // the session has to be recorded on this path too.
      setOtpVerifiedUid(targetUid);
      await saveSession(targetUid);
      showToast('Profile created successfully!');
      router.replace(destinationAfterAuth(next));
    } catch (e: any) {
      showToast(e.message || 'Profile saved locally');
      router.replace(destinationAfterAuth(next));
    } finally {
      setLoading(false);
    }
  };

  const getBgImage = (currentStep: number) => {
    switch (currentStep) {
      case 1: return require('@/assets/images/Journey bg.png');
      case 2: return require('@/assets/images/About you bg.png');
      case 3: return require('@/assets/images/Preferences bg.png');
      case 4: return require('@/assets/images/safety-photo-bg.png');
      default: return null;
    }
  };
  const bgImage = getBgImage(step);

  // Gate the whole form behind phone verification.
  const content = !verifiedUid ? (
    <SafeAreaView style={styles.container} testID="account-verify-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.verifyTitle}>VERIFY YOUR PHONE</Text>
          <Text style={styles.subtitle}>
            We verify every rider&apos;s number so ride requests reach a real person.
          </Text>

          {!otpSent ? (
            <>
              <View style={styles.inputBox}>
                <TextInput
                  testID="verify-phone-input"
                  value={verifyPhone}
                  onChangeText={setVerifyPhone}
                  placeholder="10-digit mobile number"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="phone-pad"
                  maxLength={13}
                  style={styles.inputField}
                />
              </View>
              <PrimaryButton
                testID="verify-send-code"
                title={verifying ? 'Sending…' : 'Send code'}
                icon="flash"
                loading={verifying}
                onPress={() => void sendVerificationCode()}
              />
            </>
          ) : (
            <>
              <Text style={styles.inputLabel}>Code sent to {verifyPhone}</Text>
              <View style={styles.inputBox}>
                <TextInput
                  testID="verify-otp-input"
                  value={otp}
                  onChangeText={setOtp}
                  placeholder="Enter the 6-digit code"
                  placeholderTextColor={colors.textTertiary}
                  keyboardType="number-pad"
                  maxLength={6}
                  style={styles.inputField}
                />
              </View>
              {otpError ? (
                <Text style={styles.verifyError} testID="verify-error">
                  {otpError}
                </Text>
              ) : null}
              <PrimaryButton
                testID="verify-confirm"
                title={verifying ? 'Verifying…' : 'Verify and continue'}
                icon="checkmark-circle"
                loading={verifying}
                onPress={() => void confirmVerification()}
              />
              <Pressable
                testID="verify-change-number"
                onPress={() => {
                  setOtpSent(false);
                  setOtp('');
                  setOtpError(null);
                }}
                hitSlop={12}
              >
                <Text style={styles.subtitle}>Change number</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  ) : (
    <SafeAreaView style={[styles.container, { backgroundColor: 'transparent' }]} testID="account-creation-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            step === 2 && styles.profileScrollContent,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Navigation & Segmented Progress Bar */}
          <View style={styles.topHeader}>
            {step > 1 ? (
              <Pressable style={styles.backBtn} onPress={handlePrevStep} hitSlop={12}>
                <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
              </Pressable>
            ) : (
              <LinqLogo size={36} showText={false} />
            )}

            <View style={styles.segmentedProgress}>
              {[1, 2, 3, 4, 5].map((i) => (
                <View
                  key={i}
                  style={[styles.progressTrack, step >= i && styles.progressTrackActive]}
                />
              ))}
            </View>

          </View>

          {/* Category Chip */}
          <View style={styles.chipHeader}>
            <Text style={styles.chipHeaderText}>
              {step === 1
                ? 'JOURNEY 🚘'
                : step === 2
                ? 'ABOUT YOU 👤'
                : step === 3
                ? 'PREFERENCES 🛡️'
                : step === 4
                ? 'SAFETY & PHOTO 📸'
                : 'VERIFICATION 🆔'}
            </Text>
            <Text style={styles.stepCounterText}>{step}/5</Text>
          </View>

          {/* STEP 1: Welcome Journey & Name */}
          {step === 1 && (
            <View style={[styles.stepContainer, styles.cornerStep]}>
              <Text style={styles.mainTitle}>Let&apos;s plan your journey</Text>
              <Text style={styles.subtitle}>
                Find people going your way and make every ride better.
              </Text>

              <View style={styles.card}>
                <Text style={styles.inputLabel}>What should we call you?</Text>
                <View style={styles.inputBox}>
                  <Ionicons name="person-outline" size={18} color={colors.primary} />
                  <TextInput
                    testID="input-name"
                    value={name}
                    onChangeText={setName}
                    placeholder="Enter your full name"
                    placeholderTextColor={colors.textTertiary}
                    style={styles.textInput}
                    autoFocus
                  />
                </View>

                {name.trim().length > 1 && (
                  <View style={styles.badgeCallout}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                    <Text style={styles.badgeCalloutText}>
                      Nice to meet you, {name.split(' ')[0]}!
                    </Text>
                  </View>
                )}
              </View>


            </View>
          )}

          {/* STEP 2: Age & Gender */}
          {step === 2 && (
            <View style={[styles.stepContainer, styles.cornerStep]}>
              <Text style={styles.mainTitle}>Tell us a little about you</Text>
              <Text style={styles.subtitle}>
                This helps us match you with compatible commuters on your route.
              </Text>

              <View style={styles.card}>
                <Text style={styles.inputLabel}>How old are you?</Text>
                <View style={styles.inputBox}>
                  <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                  <TextInput
                    testID="input-age"
                    value={age}
                    onChangeText={setAge}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder="Enter your age (e.g. 24)"
                    placeholderTextColor={colors.textTertiary}
                    style={styles.textInput}
                  />
                </View>

                <Text style={[styles.inputLabel, { marginTop: spacing.lg }]}>
                  What&apos;s your gender?
                </Text>
                <View style={styles.genderGrid}>
                  {(['female', 'male', 'other'] as const).map((g) => {
                    const isActive = gender === g;
                    return (
                      <Pressable
                        key={g}
                        testID={`gender-${g}`}
                        onPress={() => setGender(g)}
                        style={[styles.genderCard, isActive && styles.genderCardActive]}
                      >
                        <Ionicons
                          name={g === 'female' ? 'woman' : g === 'male' ? 'man' : 'person'}
                          size={20}
                          color={isActive ? colors.primary : colors.textSecondary}
                        />
                        <Text style={[styles.genderText, isActive && styles.genderTextActive]}>
                          {g[0].toUpperCase() + g.slice(1)}
                        </Text>
                        {isActive && (
                          <View style={styles.checkDot}>
                            <Ionicons name="checkmark" size={12} color={colors.textInverse} />
                          </View>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>


            </View>
          )}

          {/* STEP 3: Travel Preferences & Bio */}
          {step === 3 && (
            <View style={styles.stepContainer}>
              <Text style={styles.mainTitle}>Travel your way</Text>
              <Text style={styles.subtitle}>
                Customize your safety options and introduce yourself to fellow commuters.
              </Text>

              <View style={styles.card}>
                {gender === 'female' && (
                  <View style={styles.womenOnlyBox}>
                    <View style={styles.toggleRow}>
                      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="shield-checkmark" size={20} color="#FF69B4" />
                        <Text style={styles.toggleLabel}>Women only mode</Text>
                        <Pressable
                          onPress={() => setShowWomenOnlyInfo(true)}
                          style={{ padding: 4 }}
                        >
                          <Ionicons
                            name="information-circle"
                            size={18}
                            color={colors.textSecondary}
                          />
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
                    <Text style={styles.womenOnlySub}>
                      Only share rides and view profiles of female commuters.
                    </Text>
                  </View>
                )}

                <Text style={styles.inputLabel}>Tell us about yourself (Optional)</Text>
                <View
                  style={[
                    styles.inputBox,
                    { minHeight: 90, alignItems: 'flex-start', paddingTop: 10 },
                  ]}
                >
                  <Ionicons
                    name="create-outline"
                    size={18}
                    color={colors.primary}
                    style={{ marginTop: 2 }}
                  />
                  <TextInput
                    testID="input-bio"
                    value={bio}
                    onChangeText={(v) => setBio(v.slice(0, 120))}
                    placeholder="e.g. Software developer, loves coffee, commutes to Hitech City daily..."
                    placeholderTextColor={colors.textTertiary}
                    multiline
                    style={[styles.textInput, { textAlignVertical: 'top', minHeight: 70 }]}
                  />
                </View>
                <Text style={styles.charCount}>{bio.length}/120</Text>
              </View>
            </View>
          )}

          {/* STEP 4: Emergency Contact & Profile Photo */}
          {step === 4 && (
            <View style={styles.stepContainer} testID="emergency-screen">
              <Text style={styles.mainTitle}>Safety & Profile Photo</Text>
              <Text style={styles.subtitle}>
                Add a trusted emergency contact and a profile photo so commuters can recognize you.
              </Text>

              <View style={styles.card}>
                <Text style={styles.inputLabel}>
                  <Ionicons name="call" size={14} color={colors.error} /> Emergency Contact
                </Text>
                <View style={styles.inputRow}>
                  <View style={styles.cc}>
                    <Text>🇮🇳</Text>
                    <Text style={styles.ccText}>+91</Text>
                  </View>
                  <TextInput
                    testID="emergency-contact-input"
                    value={emergency}
                    onChangeText={setEmergency}
                    placeholder="Enter 10-digit phone number"
                    placeholderTextColor={colors.textTertiary}
                    keyboardType="phone-pad"
                    maxLength={10}
                    style={styles.textInput}
                    autoFocus
                  />
                </View>
                <Text style={styles.helper}>Contact notified during emergency SOS triggers.</Text>

                <Text style={[styles.inputLabel, { marginTop: spacing.lg }]}>
                  <Ionicons name="camera" size={14} color={colors.primary} /> Profile Photo
                </Text>
                <Pressable
                  style={[
                    styles.uploadBox,
                    photoAdded && styles.uploadBoxDone,
                    photoAdded && styles.uploadBoxPreview,
                  ]}
                  testID="upload-photo-btn"
                  onPress={handleUploadPhoto}
                >
                  {photoAdded && avatarUrl ? (
                    <>
                      <Image
                        source={{ uri: avatarUrl }}
                        style={styles.uploadedPhoto}
                        resizeMode="cover"
                      />
                      <View style={styles.uploadPreviewCopy}>
                        <Text style={[styles.uploadText, { color: colors.success }]}>
                          Photo Added Successfully
                        </Text>
                        <Text style={styles.uploadPreviewHint}>
                          Use Replace to choose another photo
                        </Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <Ionicons
                        name={photoAdded ? 'checkmark-circle' : 'camera'}
                        size={32}
                        color={photoAdded ? colors.success : colors.primary}
                      />
                      <Text style={[styles.uploadText, photoAdded && { color: colors.success }]}>
                        {photoAdded ? 'Photo Added Successfully' : 'Upload Profile Photo'}
                      </Text>
                    </>
                  )}
                </Pressable>
                <Text style={styles.helper}>Help fellow Ride Twins recognize you easily.</Text>

                {photoAdded && (
                  <View style={styles.photoActions}>
                    <Pressable
                      style={styles.photoAction}
                      onPress={handleUploadPhoto}
                      testID="replace-photo-btn"
                    >
                      <Ionicons name="swap-horizontal" size={18} color={colors.primary} />
                      <Text style={styles.photoActionText}>Replace</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.photoAction, styles.photoActionDelete]}
                      onPress={handleDeletePhoto}
                      testID="delete-photo-btn"
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.error} />
                      <Text style={[styles.photoActionText, { color: colors.error }]}>Delete</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          )}

          {/* STEP 5: Identity Verification Choice */}
          {step === 5 && (
            <View style={styles.stepContainer} testID="verification-screen">
              <Text style={styles.mainTitle}>Verify your identity</Text>
              <Text style={styles.subtitle}>
                Choose any one document option to build trust in the LINQ community.
              </Text>

              <View style={styles.card}>
                {VERIFICATION_OPTIONS.map((o) => {
                  const isSel = verificationDoc === o.key;
                  return (
                    <Pressable
                      key={o.key}
                      testID={`verify-option-${o.key}`}
                      onPress={() => setVerificationDoc(o.key)}
                      style={[styles.optionRow, isSel && styles.optionRowActive]}
                    >
                      <View style={[styles.optionIcon, isSel && styles.optionIconActive]}>
                        <Ionicons
                          name={o.icon}
                          size={20}
                          color={isSel ? colors.textInverse : colors.primary}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.optionLabel}>{o.label}</Text>
                        <Text style={styles.optionSub}>{o.sub}</Text>
                      </View>
                      <View style={[styles.radio, isSel && styles.radioActive]}>
                        {isSel && <View style={styles.radioInner} />}
                      </View>
                    </Pressable>
                  );
                })}

                <View style={styles.safeBox}>
                  <Ionicons name="lock-closed" size={18} color={colors.primary} />
                  <View style={{ flex: 1, marginLeft: spacing.sm }}>
                    <Text style={styles.safeTitle}>Your data is 100% safe & encrypted</Text>
                    <Text style={styles.safeSub}>We only use it to verify trusted commuters.</Text>
                  </View>
                </View>
              </View>

              <Mission1000Banner />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sticky Bottom Actions */}
      <View style={styles.stickyFooter}>
        {step < 5 ? (
          <PrimaryButton
            title="Next"
            iconRight="arrow-forward"
            disabled={
              step === 1
                ? !isStep1Valid
                : step === 2
                ? !isStep2Valid
                : step === 4
                ? !isStep4Valid
                : false
            }
            onPress={handleNextStep}
          />
        ) : (
          <PrimaryButton
            testID="account-continue"
            title={loading ? 'Completing...' : 'Complete Profile'}
            iconRight={loading ? undefined : 'checkmark-circle'}
            disabled={!canFinalize || loading}
            onPress={handleComplete}
          />
        )}
      </View>

      {/* Women Only Info Modal */}
      <Modal visible={showWomenOnlyInfo} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="shield-checkmark" size={28} color="#FF69B4" />
              <Text style={styles.modalTitle}>Women only mode</Text>
            </View>
            <Text style={styles.modalText}>
              When enabled, your profile and ride requests will only be visible to verified women,
              and you will only see women commuters on LINQ.
            </Text>
            <PrimaryButton title="Got it" onPress={() => setShowWomenOnlyInfo(false)} />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );

  if (verifiedUid && bgImage) {
    return (
      <ImageBackground
        key={step}
        source={bgImage}
        style={styles.backgroundImage}
        resizeMode="cover"
      >
        {content}
      </ImageBackground>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.xl,
    paddingBottom: 130,
  },
  profileScrollContent: {
    paddingBottom: 96,
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentedProgress: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: spacing.md,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  progressTrackActive: {
    backgroundColor: colors.primary,
  },
  skip: { fontSize: font.size.base, color: colors.primary, fontWeight: font.weight.medium },

  chipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  chipHeaderText: {
    fontSize: font.size.xs,
    fontWeight: font.weight.bold,
    color: colors.primary,
    letterSpacing: 0.8,
    backgroundColor: colors.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  stepCounterText: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
    fontWeight: font.weight.medium,
  },

  stepContainer: { marginTop: spacing.sm },
  cornerStep: { flexGrow: 1, position: 'relative' },
  mainTitle: {
    fontSize: font.size['2xl'],
    color: colors.textPrimary,
    fontWeight: font.weight.bold,
    lineHeight: 32,
    marginBottom: spacing.xs,
  },
  verifyTitle: {
    fontSize: font.size.lg,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
    marginBottom: spacing.xs,
  },
  inputField: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: font.size.base,
  },
  verifyError: {
    fontSize: font.size.sm,
    color: colors.error,
    marginTop: spacing.xs,
  },
  subtitle: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },

  cornerIllustration: {
    position: 'absolute',
    right: -spacing.xl,
    bottom: -spacing.xl,
    width: 200,
    height: 160,
    backgroundColor: 'transparent',
  },
  profileImageArea: {
    flex: 1,
    minHeight: 0,
    marginHorizontal: -spacing.xl,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  profileIllustration: {
    width: '96%',
    height: '100%',
    backgroundColor: 'transparent',
  },

  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    marginBottom: spacing.lg,
    ...shadow.sm,
  },
  inputLabel: {
    fontSize: font.size.sm,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
    marginBottom: spacing.xs,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.primaryLight,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    minHeight: 52,
    gap: spacing.sm,
  },
  textInput: { flex: 1, height: 52, color: colors.textPrimary, fontSize: font.size.base },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.primaryLight,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  cc: {
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: spacing.md,
    height: 52,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  ccText: { color: colors.textPrimary, fontSize: font.size.base, fontWeight: font.weight.medium },

  badgeCallout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    backgroundColor: colors.successLight,
    padding: spacing.sm,
    borderRadius: radius.md,
  },
  badgeCalloutText: { fontSize: font.size.sm, color: colors.success, fontWeight: font.weight.medium },

  genderGrid: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  genderCard: {
    flex: 1,
    height: 60,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  genderCardActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  genderText: { fontSize: font.size.xs, color: colors.textSecondary, fontWeight: font.weight.medium },
  genderTextActive: { color: colors.primary, fontWeight: font.weight.bold },
  checkDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  womenOnlyBox: {
    backgroundColor: '#FFF0F5',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: '#FFC0CB',
  },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  womenOnlySub: { fontSize: font.size.xs, color: colors.textSecondary, marginTop: 4 },

  charCount: { fontSize: font.size.xs, color: colors.textTertiary, alignSelf: 'flex-end', marginTop: 4 },
  helper: { fontSize: font.size.xs, color: colors.textTertiary, marginTop: 4, marginBottom: spacing.xs },

  uploadBox: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.xs,
    backgroundColor: colors.surfaceSecondary,
    marginTop: spacing.xs,
  },
  uploadBoxDone: { borderColor: colors.success, backgroundColor: colors.successLight, borderStyle: 'solid' },
  uploadBoxPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  uploadedPhoto: {
    width: 64,
    height: 64,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
  },
  uploadPreviewCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  uploadPreviewHint: {
    color: colors.textSecondary,
    fontSize: font.size.xs,
    lineHeight: 16,
  },
  uploadText: { color: colors.primary, fontSize: font.size.base, fontWeight: font.weight.medium },

  photoActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  photoAction: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primaryLight,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
  },
  photoActionDelete: {
    borderColor: colors.errorLight,
    backgroundColor: colors.errorLight,
  },
  photoActionText: {
    color: colors.primary,
    fontSize: font.size.base,
    fontWeight: font.weight.medium,
  },

  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
  },
  optionRowActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  optionIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  optionIconActive: { backgroundColor: colors.primary },
  optionLabel: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  optionSub: { fontSize: font.size.xs, color: colors.textSecondary, marginTop: 2 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: colors.primary },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },

  safeBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primaryLight, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  safeTitle: { fontSize: font.size.sm, color: colors.textPrimary, fontWeight: font.weight.medium },
  safeSub: { fontSize: font.size.xs, color: colors.textSecondary },

  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  modalContent: {
    backgroundColor: colors.surface,
    padding: spacing.xl,
    borderRadius: radius.lg,
    width: '100%',
    maxWidth: 340,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.md },
  modalTitle: { fontSize: font.size.xl, fontWeight: font.weight.bold, color: colors.textPrimary },
  modalText: {
    fontSize: font.size.base,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
});
