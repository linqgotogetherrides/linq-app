import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle, TextStyle, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, font } from '@/src/theme/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface Props {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  fullWidth?: boolean;
  style?: ViewStyle;
  testID?: string;
}

export default function PrimaryButton({
  title, onPress, variant = 'primary', size = 'md',
  loading, disabled, icon, iconRight, fullWidth = true, style, testID,
}: Props) {
  const isPrimary = variant === 'primary';
  const isSecondary = variant === 'secondary';
  const isDanger = variant === 'danger';

  const bg = isPrimary ? colors.primary : isDanger ? colors.error : isSecondary ? colors.surface : 'transparent';
  const border = isSecondary ? colors.primary : 'transparent';
  const textColor = isPrimary || isDanger ? colors.textInverse : isSecondary ? colors.primary : colors.primary;

  const heightMap = { sm: 40, md: 48, lg: 56 };
  const fontSizeMap = { sm: font.size.sm, md: font.size.base, lg: font.size.lg };

  return (
    <Pressable
      testID={testID}
      onPress={loading || disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, borderColor: border, borderWidth: isSecondary ? 1.5 : 0, height: heightMap[size] },
        fullWidth ? { alignSelf: 'stretch' } : { alignSelf: 'flex-start', paddingHorizontal: spacing.xl },
        pressed && !disabled && { opacity: 0.85 },
        disabled && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={styles.row}>
          {icon && <Ionicons name={icon} size={18} color={textColor} style={{ marginRight: spacing.sm }} />}
          <Text style={[styles.text, { color: textColor, fontSize: fontSizeMap[size] }] as TextStyle[]}>
            {title}
          </Text>
          {iconRight && <Ionicons name={iconRight} size={18} color={textColor} style={{ marginLeft: spacing.sm }} />}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  text: { fontWeight: font.weight.medium, letterSpacing: 0.1 },
});
