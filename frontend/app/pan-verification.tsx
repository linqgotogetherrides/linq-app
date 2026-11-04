import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import LinqHeader from '@/src/components/LinqHeader';
import VerificationWebView from '@/src/components/VerificationWebView';
import PrimaryButton from '@/src/components/PrimaryButton';
import { useApp } from '@/src/context/AppContext';
import { supabaseFunctions } from '@/src/lib/supabase';
import { supportsFirebaseIdentity } from '@/src/lib/auth';
import { useKycStatus } from '@/src/hooks/useKycStatus';
import {
  NAME_MAX_LENGTH,
  PAN_EXAMPLE,
  PAN_FORMAT_HINT,
  PAN_MAX_LENGTH,
  canBeginVerification,
  nameMatchesProfileNote,
  normalizePanInput,
  validatePanEntry,
  type PanEntryField,
} from '@/src/lib/panForm';
import { statusForDocument } from '@/src/lib/kycPolling';
import { readFunctionError } from '@/src/lib/apiError';
import { HOME_ROUTE } from '@/src/lib/verificationOptions';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

type Status = 'verified' | 'pending' | 'not_verified';

/**
 * Dedicated PAN verification page.
 *
 * The stages are the reference prototype's: enter details with consent, hand
 * off, then show only what the server settles. The form itself proves
 * nothing:
 *
 *   * The name and PAN typed here are input hygiene and display context.
 *     The typed PAN is never transmitted — LinQ's backend deliberately
 *     receives only `{ type: 'pan' }`, and the hosted Cashfree form collects
 *     the document itself. No keystroke, submission or WebView event here
 *     can write verification state.
 *   * "PAN verified" appears only after `kyc-status` — fed by the signed
 *     Cashfree webhook through apply_kyc_outcome() — says the rider is
 *     verified.
 *   * Failures are equally honest: the server's own reason is shown inline
 *     (missing profile phone, unconfigured provider template, provider
 *     outage), with the poll's Retry banner for status reads that failed.
 */

export default function PanVerification() {
  const router = useRouter();
  // Onboarding has already created the profile row, but completion is not
  // announced until this page has been verified or explicitly skipped.
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const isOnboarding = onboarding === '1';
  const { user, refreshUser, showToast } = useApp();

  // The web build has no verifiable identity (see auth.web.ts), so the
  // server could not tell who is asking. Refuse visibly instead of pretending.
  const canVerify = supportsFirebaseIdentity();

  const [name, setName] = useState('');
  const [pan, setPan] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorField, setErrorField] = useState<PanEntryField | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [webviewVisible, setWebviewVisible] = useState(false);
  const [kycUrl, setKycUrl] = useState('');

  const kyc = useKycStatus();
  /** Stable across renders, so the mount effect can list it as a dependency. */
  const refreshKyc = kyc.refresh;

  // Learn the rider's existing status on entry, so an already verified rider
  // sees the settled state rather than an editable form.
  React.useEffect(() => {
    if (canVerify) {
      void refreshKyc();
    }
  }, [canVerify, refreshKyc]);

  // Start with the profile name the backend will use for the verification
  // request; the rider can correct it here, which flips the match note below.
  React.useEffect(() => {
    if (!name && user?.name) setName(user.name);
  }, [name, user?.name]);

  /**
   * PAN's display state, read only from the server.
   * Falls back to the aggregate status when this document has no row, so a
   * rider verified by another document is treated as verified, not editable.
   */
  const panStatus: Status = statusForDocument(kyc.documents, 'pan', kyc.status ?? 'not_verified');
  const isVerified = panStatus === 'verified';
  const nameNote = useMemo(
    () => nameMatchesProfileNote(name, user?.name),
    [name, user?.name],
  );

  const handleSubmit = async () => {
    // Duplicate-submission guard: `busy` gates the connect, so a double tap
    // can never mint two sessions.
    if (!canBeginVerification({ busy })) return;

    const outcome = validatePanEntry({ name, pan: normalizePanInput(pan), consent });
    if (!outcome.ok) {
      setErrorField(outcome.field);
      setValidationError(outcome.error);
      return;
    }
    setErrorField(null);
    setValidationError(null);

    if (!user?.id) {
      showToast('Please sign in to verify your ID');
      return;
    }
    if (!canVerify) {
      showToast('ID verification is available in the LinQ mobile app only');
      return;
    }

    setServerError(null);
    setBusy(true);
    // The sheet opens only once the server has produced a real form, so the
    // rider never stares at an empty WebView.
    setKycUrl('');
    setWebviewVisible(false);

    try {
      const { data, error } = await supabaseFunctions.functions.invoke('create-kyc-session', {
        // Deliberately only the document type. The locally typed PAN is not
        // transmitted; the hosted verifier is the single place document data
        // is collected, from the rider, on the provider's own domain.
        body: { type: 'pan' },
      });

      const serverMessage = error ? readFunctionError(error) : null;
      if (serverMessage || !data?.verificationUrl) {
        throw new Error(serverMessage || 'We could not start verification. Please try again.');
      }

      setKycUrl(data.verificationUrl);
      setWebviewVisible(true);
      // Ask the server once, then let the bounded poll run while the rider
      // completes the hosted form.
      kyc.start();
      // Handoff is complete. Erasing the typed PAN keeps the promise in the
      // privacy note ("LinQ does not store the number you type") literally
      // true even in a heap dump of this screen's state.
      setPan('');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Error connecting to verification provider';
      setServerError(message);
    } finally {
      setBusy(false);
    }
  };

  /**
   * The rider dismissed the hosted form. Not an outcome: close, then re-read
   * what the server actually says.
   */
  const handleFormClosed = async () => {
    setWebviewVisible(false);
    setKycUrl('');
    await Promise.all([kyc.refresh(), refreshUser()]);
  };

  const returnFromSuccess = async () => {
    // Pull the verified status into the app context before leaving, so Home
    // does not still show the rider as unverified.
    await refreshUser();
    if (isOnboarding) {
      showToast('Profile created successfully!');
      router.replace(HOME_ROUTE);
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace(HOME_ROUTE);
  };

  /**
   * The rider could not finish PAN verification. Their profile row already
   * exists, so onboarding is considered complete and they enter the app
   * unverified rather than being trapped on this page.
   */
  const handleSkipVerification = () => {
    showToast('Profile created successfully!');
    router.replace(HOME_ROUTE);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="pan-verification-screen">
      {/* Default back pops to the screen that opened this page: the identity
          step during onboarding, or the verification list from the profile. */}
      <LinqHeader title="PAN Verification" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.banner} testID="pan-hero">
          <Ionicons name="shield-checkmark" size={22} color={colors.primary} />
          <Text style={styles.bannerText}>
            Travel together. Verify with confidence — confirming your PAN keeps the community safer.
          </Text>
        </View>

        {!canVerify && (
          <View style={styles.notice} testID="pan-unavailable-notice">
            <Ionicons name="phone-portrait-outline" size={18} color={colors.warning} />
            <Text style={styles.noticeText}>
              ID verification needs the LinQ mobile app. This browser preview cannot send a
              verifiable identity, so verification is unavailable here.
            </Text>
          </View>
        )}

        {kyc.status === 'pending' && !kyc.exhausted && !isVerified && (
          <View style={styles.pendingRow} testID="pan-pending-banner">
            <Ionicons name="time-outline" size={16} color={colors.warning} />
            <Text style={styles.pendingText}>
              Waiting for confirmation from Cashfree. This page updates on its own.
            </Text>
          </View>
        )}

        {kyc.exhausted && !isVerified && (
          <View style={styles.notice} testID="pan-retry-banner">
            <Ionicons name="refresh-outline" size={18} color={colors.warning} />
            <Text style={styles.noticeText}>
              We could not confirm your status just now. Nothing has changed.
            </Text>
            <Pressable onPress={() => kyc.start()} style={styles.retryBtn} testID="pan-retry-status">
              <Text style={styles.retryText}>Check again</Text>
            </Pressable>
          </View>
        )}

        {isVerified ? (
          <View style={styles.resultCard} testID="pan-success-panel">
            <View style={styles.resultCheck}>
              <Ionicons name="checkmark-circle" size={34} color={colors.success} />
            </View>
            <Text style={styles.resultTitle}>PAN verified</Text>
            <Text style={styles.resultText}>
              {isOnboarding
                ? 'Your PAN was verified and your profile is ready. Welcome to LinQ!'
                : 'Your verification was confirmed through our provider. This status comes from the server, not from any action on this screen.'}
            </Text>
            <PrimaryButton
              title={isOnboarding ? 'Enter LinQ' : 'Return'}
              onPress={returnFromSuccess}
              testID="pan-success-return"
            />
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.stepHeading}>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepLabel}>Verify your identity</Text>
                <Text style={styles.stepSub}>Enter the details exactly as they appear on your PAN.</Text>
              </View>
              <View style={styles.stepIcon}>
                <Ionicons name="file-tray-full-outline" size={23} color={colors.primary} />
              </View>
            </View>

            <Text style={styles.inputLabel}>
              Full name <Text style={styles.inputHint}>As on PAN</Text>
            </Text>
            <View style={[styles.inputBox, errorField === 'name' && styles.inputBoxError]}>
              <Ionicons name="person-outline" size={18} color={colors.textSecondary} />
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Enter your full name"
                autoComplete="name"
                maxLength={NAME_MAX_LENGTH}
                testID="pan-name-input"
                style={styles.textInput}
              />
            </View>
            {errorField === 'name' && validationError && (
              <Text style={styles.errorText} testID="pan-name-error">{validationError}</Text>
            )}

            <Text style={styles.inputLabel}>PAN number</Text>
            <View style={[styles.inputBox, errorField === 'pan' && styles.inputBoxError]}>
              <Ionicons name="card" size={18} color={colors.textSecondary} />
              <TextInput
                value={pan}
                onChangeText={(value) => setPan(normalizePanInput(value))}
                placeholder={PAN_EXAMPLE}
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={PAN_MAX_LENGTH}
                testID="pan-input"
                style={styles.textInput}
              />
              <Text style={styles.charCount}>{pan.length}/{PAN_MAX_LENGTH}</Text>
            </View>
            <Text style={styles.hintText}>{PAN_FORMAT_HINT}</Text>
            {errorField === 'pan' && validationError && (
              <Text style={styles.errorText} testID="pan-error">{validationError}</Text>
            )}

            {nameNote && (
              <View style={styles.nameNote} testID="pan-name-note">
                <Ionicons name="information-circle-outline" size={16} color={colors.info} />
                <Text style={styles.nameNoteText}>{nameNote}</Text>
              </View>
            )}

            <Pressable
              onPress={() => setConsent(!consent)}
              style={styles.consentRow}
              testID="pan-consent"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: consent }}
            >
              <View style={[styles.checkbox, consent && styles.checkboxActive]}>
                {consent && <Ionicons name="checkmark" size={13} color={colors.textInverse} />}
              </View>
              <Text style={styles.consentText}>
                I consent to sharing my PAN details with our verification provider for this check.
              </Text>
            </Pressable>
            {errorField === 'consent' && validationError && (
              <Text style={styles.errorText} testID="pan-consent-error">{validationError}</Text>
            )}

            {errorField === null && serverError && (
              <View style={styles.errorBanner} testID="pan-server-error">
                <Ionicons name="alert-circle" size={16} color={colors.error} />
                <Text style={styles.errorBannerText}>{serverError}</Text>
              </View>
            )}

            <PrimaryButton
              title="Verify PAN securely"
              onPress={handleSubmit}
              loading={busy}
              disabled={busy || !canVerify}
              iconRight={busy ? undefined : 'chevron-forward'}
              testID="pan-submit"
            />

            <View style={styles.privacyNote}>
              <Ionicons name="lock-closed" size={15} color={colors.primary} />
              <Text style={styles.privacyNoteText}>
                Your PAN is used only on Cashfree&apos;s own secure page. LinQ does not receive or
                store the number you type here.
              </Text>
            </View>

            {isOnboarding && (
              <Pressable
                onPress={handleSkipVerification}
                style={styles.skipVerifyBtn}
                testID="pan-skip-verification"
              >
                <Text style={styles.skipVerifyText}>Skip verification</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      <VerificationWebView visible={webviewVisible} url={kycUrl} onClose={handleFormClosed} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  flex: { flex: 1 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.primaryLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  bannerText: { flex: 1, fontSize: font.size.sm, color: colors.textPrimary },
  notice: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.warningLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  noticeText: { flex: 1, fontSize: font.size.sm, color: colors.textPrimary },
  pendingRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginBottom: spacing.lg },
  pendingText: { flex: 1, fontSize: font.size.sm, color: colors.textSecondary },
  retryBtn: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  retryText: { color: colors.primary, fontSize: font.size.xs, fontWeight: font.weight.medium },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  stepHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.lg },
  stepLabel: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium },
  stepSub: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: spacing.xs },
  stepIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputLabel: {
    fontSize: font.size.sm,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  inputHint: { color: colors.textSecondary, fontWeight: '400' },
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
  inputBoxError: { borderColor: colors.error },
  textInput: { flex: 1, minHeight: 52, color: colors.textPrimary, fontSize: font.size.base },
  charCount: { fontSize: font.size.xs, color: colors.textTertiary },
  hintText: { fontSize: font.size.xs, color: colors.textSecondary, marginTop: spacing.xs },
  errorText: { color: colors.error, fontSize: font.size.xs, marginTop: spacing.xs },
  nameNote: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.infoLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  nameNoteText: { flex: 1, fontSize: font.size.xs, color: colors.textPrimary },
  consentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    marginTop: spacing.lg,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  consentText: { flex: 1, fontSize: font.size.sm, color: colors.textPrimary },
  errorBanner: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.errorLight,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorBannerText: { flex: 1, fontSize: font.size.sm, color: colors.textPrimary },
  privacyNote: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  privacyNoteText: { flex: 1, fontSize: font.size.xs, color: colors.textSecondary },
  skipVerifyBtn: { alignSelf: 'center', marginTop: spacing.lg, paddingVertical: spacing.sm },
  skipVerifyText: { color: colors.primary, fontSize: font.size.base, fontWeight: font.weight.medium },
  resultCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  resultCheck: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.successLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  resultTitle: { fontSize: font.size.xl, color: colors.textPrimary, fontWeight: font.weight.medium },
  resultText: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
});
