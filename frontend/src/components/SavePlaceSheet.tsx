import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '@/src/context/AppContext';
import {
  buildSavedPlaces,
  isAlreadySavedPlace,
  savedPlaceKey,
} from '@/src/lib/location/savedPlaces';
import type { SavedLocation, SavedLocationType } from '@/src/types';
import { colors, font, radius, shadow, spacing } from '@/src/theme/tokens';

interface Props {
  visible: boolean;
  location: SavedLocation | null;
  onDismiss: () => void;
}

const PRESETS: {
  key: SavedLocationType;
  label: string;
  icon: 'home-outline' | 'briefcase-outline' | 'school-outline';
}[] = [
  { key: 'home', label: 'Home', icon: 'home-outline' },
  { key: 'office', label: 'Work', icon: 'briefcase-outline' },
  { key: 'college', label: 'College', icon: 'school-outline' },
];

/**
 * Non-blocking "Save this place for next time?" sheet.
 *
 * Appears after a location is already applied to the current ride. Dismissing
 * changes nothing about the ride. Existing Home/Work/College slots are never
 * replaced without an explicit confirmation step.
 */
export default function SavePlaceSheet({ visible, location, onDismiss }: Props) {
  const { user, savedDismissals, dismissSavePlace, saveUserLocation, saveCustomLocation } =
    useApp();
  const [customName, setCustomName] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState<SavedLocationType | null>(null);

  useEffect(() => {
    if (visible) {
      setCustomName('');
      setConfirmOverwrite(null);
    }
  }, [visible]);

  if (!location) return null;

  const saved = buildSavedPlaces(user?.savedLocations);

  // Never prompt for something already saved, or for a place the rider has
  // already dismissed in this session.
  const shouldShow =
    visible &&
    !isAlreadySavedPlace(location, saved) &&
    !savedDismissals.has(savedPlaceKey(location));

  const existing = (type: SavedLocationType) =>
    saved.find((entry) => entry.kind === type)?.place;

  const handleChoose = async (type: SavedLocationType) => {
    const occupant = existing(type);
    if (occupant && occupant !== location) {
      setConfirmOverwrite(type);
      return;
    }
    setSaving(true);
    try {
      const ok = await saveUserLocation(type, location);
      if (ok) {
        dismissSavePlace(location);
        onDismiss();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmOverwrite = async () => {
    if (!confirmOverwrite) return;
    setSaving(true);
    try {
      const ok = await saveUserLocation(confirmOverwrite, location);
      if (ok) {
        dismissSavePlace(location);
        onDismiss();
      }
    } finally {
      setSaving(false);
      setConfirmOverwrite(null);
    }
  };

  const handleSaveCustom = async () => {
    if (!customName.trim()) return;
    setSaving(true);
    try {
      const ok = await saveCustomLocation(customName, location);
      if (ok) {
        dismissSavePlace(location);
        onDismiss();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleNotNow = () => {
    dismissSavePlace(location);
    onDismiss();
  };

  return (
    <Modal
      visible={shouldShow}
      transparent
      animationType="slide"
      onRequestClose={handleNotNow}
      testID="save-place-sheet"
    >
      <Pressable style={styles.backdrop} onPress={handleNotNow} accessibilityLabel="Dismiss" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrapper}
      >
        <View style={styles.sheet}>
          <View style={styles.grabber} />

          {confirmOverwrite ? (
            <>
              <Text style={styles.title}>Replace your saved {confirmOverwrite === 'office' ? 'Work' : confirmOverwrite}?</Text>
              <Text style={styles.body} testID="save-overwrite-warning">
                You already have a saved {confirmOverwrite === 'office' ? 'Work' : confirmOverwrite} address. Saving here replaces it.
              </Text>
              <View style={styles.actions}>
                <Pressable
                  style={styles.secondaryBtn}
                  onPress={() => setConfirmOverwrite(null)}
                  testID="save-overwrite-cancel"
                >
                  <Text style={styles.secondaryText}>Keep existing</Text>
                </Pressable>
                <Pressable
                  style={styles.primaryBtn}
                  onPress={handleConfirmOverwrite}
                  disabled={saving}
                  testID="save-overwrite-confirm"
                >
                  <Text style={styles.primaryText}>Replace</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.title}>Save this place for next time?</Text>
              <Text style={styles.address} numberOfLines={2} testID="save-sheet-address">
                {location.address}
              </Text>

              <View style={styles.chipRow}>
                {PRESETS.map((preset) => (
                  <Pressable
                    key={preset.key}
                    style={styles.chip}
                    onPress={() => void handleChoose(preset.key)}
                    disabled={saving}
                    testID={`save-sheet-${preset.key}`}
                    accessibilityRole="button"
                  >
                    <Ionicons name={preset.icon} size={17} color={colors.primary} />
                    <Text style={styles.chipText}>{preset.label}</Text>
                  </Pressable>
                ))}
              </View>

              <TextInput
                style={styles.input}
                value={customName}
                onChangeText={setCustomName}
                placeholder="Or name it yourself"
                placeholderTextColor={colors.textTertiary}
                maxLength={40}
                autoCorrect={false}
                testID="save-sheet-custom-input"
              />
              <Pressable
                style={[styles.customBtn, !customName.trim() && styles.customBtnDisabled]}
                onPress={() => void handleSaveCustom()}
                disabled={saving || !customName.trim()}
                testID="save-sheet-custom"
              >
                <Ionicons name="bookmark-outline" size={16} color={colors.primary} />
                <Text style={styles.customBtnText}>
                  {customName.trim() ? `Save as "${customName.trim()}"` : 'Save as ...'}
                </Text>
              </Pressable>

              {saving ? (
                <ActivityIndicator color={colors.primary} style={styles.spinner} />
              ) : (
                <Pressable style={styles.notNow} onPress={handleNotNow} testID="save-sheet-dismiss">
                  <Text style={styles.notNowText}>Not now</Text>
                </Pressable>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheetWrapper: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    gap: spacing.md,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadow.lg,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  title: { color: colors.textPrimary, fontSize: font.size.base, fontWeight: font.weight.bold },
  body: { color: colors.textSecondary, fontSize: font.size.sm, lineHeight: 20 },
  address: { color: colors.textSecondary, fontSize: font.size.xs, lineHeight: 17 },
  chipRow: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    flex: 1,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  chipText: { color: colors.textPrimary, fontSize: font.size.xs, fontWeight: font.weight.medium },
  input: {
    height: 46,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.textPrimary,
    fontSize: font.size.sm,
    backgroundColor: colors.surface,
  },
  customBtn: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
  },
  customBtnDisabled: { borderColor: colors.border, opacity: 0.6 },
  customBtnText: { color: colors.primary, fontSize: font.size.sm, fontWeight: font.weight.medium },
  notNow: { alignItems: 'center', paddingVertical: spacing.sm },
  notNowText: { color: colors.textSecondary, fontSize: font.size.sm, fontWeight: font.weight.medium },
  spinner: { alignSelf: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm },
  secondaryBtn: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  secondaryText: { color: colors.textPrimary, fontSize: font.size.sm, fontWeight: font.weight.medium },
  primaryBtn: {
    flex: 1,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  primaryText: { color: colors.textInverse, fontSize: font.size.sm, fontWeight: font.weight.bold },
});