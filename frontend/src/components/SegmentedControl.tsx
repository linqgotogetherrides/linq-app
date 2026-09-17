import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, font } from '@/src/theme/tokens';

export interface SegmentOption {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

interface Props {
  options: SegmentOption[];
  value: string;
  onChange: (key: string) => void;
  testID?: string;
}

export default function SegmentedControl({ options, value, onChange, testID }: Props) {
  return (
    <View style={styles.container} testID={testID}>
      {options.map((opt) => {
        const active = opt.key === value;
        return (
          <Pressable
            key={opt.key}
            testID={`segment-${opt.key}`}
            onPress={() => onChange(opt.key)}
            style={[styles.item, active && styles.itemActive]}
          >
            {opt.icon && (
              <Ionicons
                name={opt.icon}
                size={16}
                color={active ? colors.textInverse : colors.textSecondary}
                style={{ marginRight: 6 }}
              />
            )}
            <Text style={[styles.text, active && styles.textActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    alignSelf: 'stretch',
  },
  item: {
    flex: 1,
    height: 40,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
  },
  itemActive: {
    backgroundColor: colors.primary,
  },
  text: {
    fontSize: font.size.base,
    color: colors.textSecondary,
    fontWeight: font.weight.medium,
  },
  textActive: { color: colors.textInverse },
});
