import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, font, radius, shadow, spacing } from '@/src/theme/tokens';

/**
 * Small centred confirmation popup.
 *
 * Deliberately not `Alert.alert`: that is a no-op under react-native-web, so a
 * destructive action guarded by it silently did nothing on web. This renders on
 * every platform.
 */

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  /** Label for the safe, dismissing choice. */
  cancelLabel?: string;
  /** Label for the confirming choice. */
  confirmLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ConfirmDialog({
  visible,
  title,
  message,
  cancelLabel = 'Go back',
  confirmLabel = 'Yes, delete',
  destructive = true,
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  const accent = destructive ? colors.error : colors.primary;
  const accentSoft = destructive ? colors.errorLight : colors.primaryLight;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <Pressable
        style={styles.backdrop}
        onPress={busy ? undefined : onCancel}
        accessibilityLabel="Dismiss"
      />
      <View style={styles.center} pointerEvents="box-none">
        <View style={styles.card} testID="confirm-dialog">
          <View style={[styles.iconWrap, { backgroundColor: accentSoft }]}>
            <Ionicons
              name={destructive ? 'trash-outline' : 'help-circle-outline'}
              size={22}
              color={accent}
            />
          </View>

          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.buttonGhost,
              pressed && styles.pressed,
            ]}
            onPress={onCancel}
            disabled={busy}
            testID="confirm-dialog-cancel"
          >
            <Text style={styles.ghostText}>{cancelLabel}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: accent },
              pressed && styles.pressed,
              busy && styles.buttonBusy,
            ]}
            onPress={onConfirm}
            disabled={busy}
            testID="confirm-dialog-confirm"
          >
            <Text style={styles.confirmText}>
              {busy ? 'Deleting…' : confirmLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    ...shadow.lg,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: font.size.base,
    fontWeight: font.weight.semibold,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  message: {
    marginTop: spacing.xs,
    fontSize: font.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
  },
  button: {
    width: '100%',
    height: 46,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  buttonGhost: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  buttonBusy: { opacity: 0.7 },
  ghostText: {
    fontSize: font.size.base,
    fontWeight: font.weight.medium,
    color: colors.textPrimary,
  },
  confirmText: {
    fontSize: font.size.base,
    fontWeight: font.weight.medium,
    color: colors.textInverse,
  },
  pressed: { opacity: 0.75 },
});
