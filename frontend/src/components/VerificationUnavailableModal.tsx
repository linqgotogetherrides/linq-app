import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PrimaryButton from '@/src/components/PrimaryButton';
import {
  AADHAAR_DL_UNAVAILABLE_MESSAGE,
  SKIP_FOR_NOW_LABEL,
  VERIFY_WITH_PAN_LABEL,
  documentUnavailableTitle,
  type UnavailableDocType,
} from '@/src/lib/verificationOptions';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

interface Props {
  visible: boolean;
  /** Which set of labels to show; null renders nothing. */
  docType: UnavailableDocType | null;
  /** Opens the dedicated PAN verification page. */
  onVerifyWithPan: () => void;
  /** Dismisses, returning to the existing flow. Never marks anything verified. */
  onSkip: () => void;
}

const ICONS: Record<UnavailableDocType, keyof typeof Ionicons.glyphMap> = {
  aadhaar: 'id-card',
  dl: 'car-sport',
};

/**
 * The "currently unavailable" sheet for Aadhaar and driving licence.
 *
 * Purely informational: it starts no sessions, records no document choice,
 * and both of its actions leave the rider exactly as verified as they were.
 */
export default function VerificationUnavailableModal({ visible, docType, onVerifyWithPan, onSkip }: Props) {
  return (
    <Modal visible={visible && docType !== null} transparent animationType="fade" onRequestClose={onSkip}>
      {/* The overlay doubles as the back action: tapping outside is a skip. */}
      <Pressable style={styles.overlay} onPress={onSkip} testID="unavailable-backdrop">
        <Pressable
          style={styles.sheet}
          onPress={() => { /* keep taps inside the sheet from closing it */ }}
          testID="unavailable-sheet"
        >
          <View style={styles.header}>
            <View style={styles.iconBox}>
              <Ionicons name={docType ? ICONS[docType] : 'time-outline'} size={22} color={colors.warning} />
            </View>
            <Pressable onPress={onSkip} style={styles.closeBtn} hitSlop={12} testID="unavailable-close">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          {docType !== null && (
            <Text style={styles.title} testID="unavailable-title">
              {documentUnavailableTitle(docType)}
            </Text>
          )}
          <Text style={styles.message} testID="unavailable-message">
            {AADHAAR_DL_UNAVAILABLE_MESSAGE}
          </Text>

          <PrimaryButton
            title={VERIFY_WITH_PAN_LABEL}
            onPress={onVerifyWithPan}
            testID="unavailable-verify-pan"
            style={{ marginTop: spacing.lg }}
          />
          <Pressable onPress={onSkip} style={styles.skipBtn} testID="unavailable-skip">
            <Text style={styles.skipText}>{SKIP_FOR_NOW_LABEL}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.xl,
    paddingBottom: spacing['2xl'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.warningLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: { padding: spacing.xs },
  title: {
    fontSize: font.size.lg,
    fontWeight: font.weight.medium,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  message: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  skipBtn: { alignItems: 'center', marginTop: spacing.md, paddingVertical: spacing.sm },
  skipText: { color: colors.primary, fontSize: font.size.base, fontWeight: font.weight.medium },
});
