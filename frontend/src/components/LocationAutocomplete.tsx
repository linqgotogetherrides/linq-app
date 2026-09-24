import React, { ReactNode, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  LocationSuggestion,
  searchLocations,
} from '@/src/services/locationService';
import { colors, font, radius, spacing } from '@/src/theme/tokens';

type Props = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  onSelectLocation?: (suggestion: LocationSuggestion) => void;
  placeholder: string;
  testID: string;
  rightAccessory?: ReactNode;
};

export default function LocationAutocomplete({
  label,
  value,
  onChangeText,
  onSelectLocation,
  placeholder,
  testID,
  rightAccessory,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);

  useEffect(() => {
    const query = value.trim();
    if (!focused || query.length < 3) {
      setSearching(false);
      setSearchError(null);
      setSuggestions([]);
      return;
    }

    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);

      try {
        const results = await searchLocations(query, controller.signal);
        if (active) setSuggestions(results);
      } catch (error) {
        if (active) {
          setSuggestions([]);
          if ((error as { name?: string })?.name !== 'AbortError') {
            setSearchError('Location search is unavailable. Check your connection and try again.');
          }
        }
      } finally {
        if (active) setSearching(false);
      }
    }, 450);

    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [focused, value]);

  const selectSuggestion = (suggestion: LocationSuggestion) => {
    onChangeText(suggestion.fullAddress);
    onSelectLocation?.(suggestion);
    setFocused(false);
    Keyboard.dismiss();
  };

  const showSuggestions = focused && value.trim().length >= 3;

  return (
    <View style={styles.container}>
      <View style={styles.inputRow}>
        <View style={styles.inputContent}>
          <Text style={styles.label}>{label}</Text>
          <TextInput
            testID={testID}
            value={value}
            onChangeText={onChangeText}
            onFocus={() => setFocused(true)}
            placeholder={placeholder}
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
        {rightAccessory}
      </View>

      {showSuggestions && (
        <View style={styles.results}>
          {searching && suggestions.length === 0 ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.statusText}>Searching OpenStreetMap…</Text>
            </View>
          ) : suggestions.length > 0 ? (
            suggestions.map((suggestion) => (
              <Pressable
                key={suggestion.id}
                testID={`location-suggestion-${suggestion.id}`}
                style={styles.resultRow}
                onPress={() => selectSuggestion(suggestion)}
              >
                <View style={styles.pin}>
                  <Ionicons name="location" size={15} color={colors.primary} />
                </View>
                <View style={styles.resultCopy}>
                  <Text style={styles.resultName} numberOfLines={1}>
                    {suggestion.name}
                  </Text>
                  {suggestion.detail && (
                    <Text style={styles.resultDetail} numberOfLines={1}>
                      {suggestion.detail}
                    </Text>
                  )}
                </View>
              </Pressable>
            ))
          ) : searchError ? (
            <Text style={styles.errorText}>{searchError}</Text>
          ) : (
            <Text style={styles.statusText}>No matching locations found. You can keep your typed address.</Text>
          )}
          <Text style={styles.attribution}>Powered by OpenStreetMap</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  inputContent: {
    flex: 1,
  },
  label: {
    color: colors.textTertiary,
    fontSize: font.size.xs,
  },
  input: {
    color: colors.textPrimary,
    fontSize: font.size.base,
    fontWeight: font.weight.medium,
    height: 28,
    marginTop: 2,
    padding: 0,
  },
  results: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  statusRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: font.size.xs,
    lineHeight: 17,
    padding: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: font.size.xs,
    lineHeight: 17,
    padding: spacing.md,
  },
  resultRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  pin: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primaryLight,
  },
  resultCopy: {
    flex: 1,
  },
  resultName: {
    color: colors.textPrimary,
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
  },
  resultDetail: {
    color: colors.textSecondary,
    fontSize: font.size.xs,
    marginTop: 2,
  },
  attribution: {
    color: colors.textTertiary,
    fontSize: 9,
    textAlign: 'right',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
  },
});
