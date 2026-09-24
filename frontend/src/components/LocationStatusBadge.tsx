import React from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CurrentLocationStatus } from '@/src/hooks/useCurrentLocation';
import { CurrentLocation } from '@/src/services/locationService';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

export interface LocationStatusBadgeProps {
  status: CurrentLocationStatus;
  location: CurrentLocation | null;
  error?: string | null;
  onRefresh?: () => void;
  compact?: boolean;
}

export default function LocationStatusBadge({
  status,
  location,
  error,
  onRefresh,
  compact = false,
}: LocationStatusBadgeProps) {
  if (status === 'idle') return null;

  const handleOpenSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {}
  };

  if (status === 'requesting_permission' || status === 'locating') {
    return (
      <View style={[styles.badgeContainer, styles.loadingBadge]}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.loadingText}>
          {status === 'requesting_permission'
            ? 'Requesting location permission...'
            : 'Getting your precise location...'}
        </Text>
      </View>
    );
  }

  if (status === 'permission_denied' || status === 'location_services_disabled') {
    const isDenied = status === 'permission_denied';
    return (
      <View style={[styles.badgeContainer, styles.warningBadge]}>
        <Ionicons name="location-outline" size={18} color={colors.warning} />
        <View style={{ flex: 1 }}>
          <Text style={styles.warningTitle}>
            {isDenied ? 'Location Permission Needed' : 'Location Services Disabled'}
          </Text>
          <Text style={styles.warningSub}>
            {isDenied
              ? 'Enable Precise Location in Settings to set accurate pickup points.'
              : 'Turn on GPS on your device to use your current location.'}
          </Text>
        </View>
        <Pressable style={styles.settingsBtn} onPress={handleOpenSettings}>
          <Text style={styles.settingsBtnText}>Settings</Text>
        </Pressable>
      </View>
    );
  }

  if (status === 'low_accuracy') {
    const accuracyVal = location?.accuracy ? Math.round(location.accuracy) : null;
    return (
      <View style={[styles.badgeContainer, styles.warningBadge]}>
        <Ionicons name="warning-outline" size={18} color={colors.warning} />
        <View style={{ flex: 1 }}>
          <Text style={styles.warningTitle}>
            Location Accuracy Weak {accuracyVal ? `(~${accuracyVal}m)` : ''}
          </Text>
          <Text style={styles.warningSub}>
            Move outdoors or turn on Precise Location in Settings for best pickup matching.
          </Text>
        </View>
        {onRefresh && (
          <Pressable style={styles.retryBtn} onPress={onRefresh}>
            <Ionicons name="refresh" size={14} color={colors.primary} />
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        )}
      </View>
    );
  }

  if (status === 'located' && location) {
    const accuracy = location.accuracy ? Math.round(location.accuracy) : null;
    const isExcellent = location.quality === 'excellent';

    if (compact) {
      return (
        <View style={styles.compactRow}>
          <Ionicons
            name="checkmark-circle"
            size={14}
            color={isExcellent ? colors.success : colors.primary}
          />
          <Text style={styles.compactText}>
            GPS {accuracy ? `±${accuracy}m` : 'Connected'}
          </Text>
        </View>
      );
    }

    return (
      <View style={[styles.badgeContainer, styles.successBadge]}>
        <Ionicons
          name="checkmark-circle-outline"
          size={18}
          color={isExcellent ? colors.success : colors.primary}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.successTitle}>
            {isExcellent ? 'High-Accuracy GPS Fix' : 'Location Acquired'}
          </Text>
          <Text style={styles.successSub} numberOfLines={1}>
            {location.label} {accuracy ? `(±${accuracy}m)` : ''}
          </Text>
        </View>
        {onRefresh && (
          <Pressable style={styles.refreshIconBtn} onPress={onRefresh} hitSlop={8}>
            <Ionicons name="refresh" size={16} color={colors.primary} />
          </Pressable>
        )}
      </View>
    );
  }

  if (status === 'error' && error) {
    return (
      <View style={[styles.badgeContainer, styles.errorBadge]}>
        <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
        <Text style={styles.errorText} numberOfLines={2}>
          {error}
        </Text>
        {onRefresh && (
          <Pressable style={styles.retryBtn} onPress={onRefresh}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    marginVertical: spacing.xs,
  },
  loadingBadge: {
    backgroundColor: colors.primaryLight,
  },
  loadingText: {
    color: colors.primary,
    fontSize: font.size.xs,
    fontWeight: font.weight.medium,
  },
  warningBadge: {
    backgroundColor: '#FFF8E6',
    borderWidth: 1,
    borderColor: '#FFE5A3',
  },
  warningTitle: {
    color: '#996600',
    fontSize: font.size.xs,
    fontWeight: font.weight.bold,
  },
  warningSub: {
    color: '#664400',
    fontSize: 11,
    marginTop: 1,
  },
  settingsBtn: {
    backgroundColor: '#996600',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  settingsBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: font.weight.bold,
  },
  successBadge: {
    backgroundColor: colors.successLight,
    borderWidth: 1,
    borderColor: '#B2F5EA',
  },
  successTitle: {
    color: '#22543D',
    fontSize: font.size.xs,
    fontWeight: font.weight.bold,
  },
  successSub: {
    color: '#276749',
    fontSize: 11,
    marginTop: 1,
  },
  refreshIconBtn: {
    padding: 4,
  },
  errorBadge: {
    backgroundColor: colors.errorLight,
    borderWidth: 1,
    borderColor: '#FED7D7',
  },
  errorText: {
    flex: 1,
    color: colors.error,
    fontSize: font.size.xs,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryBtnText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: font.weight.medium,
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  compactText: {
    color: colors.textSecondary,
    fontSize: font.size.xs,
    fontWeight: font.weight.medium,
  },
});
