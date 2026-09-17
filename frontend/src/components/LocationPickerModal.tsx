import React, { useState, useEffect, useCallback } from 'react';
import { Modal, View, Text, StyleSheet, TextInput, Pressable, FlatList, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

interface Props {
  visible: boolean;
  title?: string;
  onClose: () => void;
  onSelect: (place: string) => void;
}

interface Place {
  id: string;
  name: string;
  full: string;
}

// Popular Hyderabad places used as suggestions + offline fallback
const POPULAR: Place[] = [
  { id: 'p1', name: 'Madhapur', full: 'Madhapur, Hyderabad, Telangana' },
  { id: 'p2', name: 'Hitech City', full: 'HITEC City, Madhapur, Hyderabad' },
  { id: 'p3', name: 'Gachibowli', full: 'Gachibowli, Hyderabad, Telangana' },
  { id: 'p4', name: 'Kukatpally', full: 'Kukatpally, Hyderabad, Telangana' },
  { id: 'p5', name: 'Secunderabad', full: 'Secunderabad Railway Station, Hyderabad' },
  { id: 'p6', name: 'Banjara Hills', full: 'Banjara Hills, Hyderabad, Telangana' },
  { id: 'p7', name: 'Jubilee Hills', full: 'Jubilee Hills, Hyderabad, Telangana' },
  { id: 'p8', name: 'RGIA Airport', full: 'Rajiv Gandhi International Airport, Shamshabad' },
];

export default function LocationPickerModal({ visible, title = 'Choose location', onClose, onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>(POPULAR);
  const [loading, setLoading] = useState(false);

  const search = useCallback(async (q: string) => {
    if (!q || q.trim().length < 3) {
      setResults(POPULAR.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())) || POPULAR);
      if (!q) setResults(POPULAR);
      return;
    }
    setLoading(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&limit=6&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      const data = await res.json();
      const mapped: Place[] = (data as any[]).map((d, i) => {
        const parts = String(d.display_name).split(',');
        return { id: `${d.place_id ?? i}`, name: parts[0].trim(), full: d.display_name };
      });
      setResults(mapped.length ? mapped : POPULAR.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())));
    } catch {
      setResults(POPULAR.filter((p) => p.full.toLowerCase().includes(q.toLowerCase())));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 400);
    return () => clearTimeout(t);
  }, [query, search]);

  const pick = (place: Place) => {
    onSelect(place.full.length > 45 ? `${place.name}, Hyderabad` : place.full);
    setQuery('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent={false}>
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} testID="location-picker-close"><Ionicons name="close" size={24} color={colors.textPrimary} /></Pressable>
          <Text style={styles.title}>{title}</Text>
          <View style={{ width: 24 }} />
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textTertiary} />
          <TextInput
            testID="location-search-input"
            value={query}
            onChangeText={setQuery}
            placeholder="Search area, colony, landmark…"
            placeholderTextColor={colors.textTertiary}
            style={styles.searchInput}
            autoFocus
          />
          {loading && <ActivityIndicator color={colors.primary} size="small" />}
        </View>

        <Pressable style={styles.currentBtn} testID="use-current-location" onPress={() => pick({ id: 'cur', name: 'Current location', full: 'Madhapur, Hyderabad' })}>
          <Ionicons name="navigate-circle" size={20} color={colors.primary} />
          <Text style={styles.currentText}>Use my current location</Text>
        </Pressable>

        <Text style={styles.sectionLabel}>{query.length >= 3 ? 'Search results' : 'Popular in Hyderabad'}</Text>
        <FlatList
          data={results}
          keyExtractor={(i) => i.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <Pressable style={styles.row} testID={`place-${item.id}`} onPress={() => pick(item)}>
              <View style={styles.pin}><Ionicons name="location" size={16} color={colors.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName}>{item.name}</Text>
                <Text style={styles.rowFull} numberOfLines={1}>{item.full}</Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No places found. Try a different search.</Text>}
        />
        <Text style={styles.attribution}>Powered by OpenStreetMap</Text>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, height: 56 },
  title: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.xl, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 48 },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: font.size.base },
  currentBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.xl, marginTop: spacing.md, paddingVertical: spacing.md },
  currentText: { color: colors.primary, fontSize: font.size.base, fontWeight: font.weight.medium },
  sectionLabel: { fontSize: font.size.xs, color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 0.5, marginHorizontal: spacing.xl, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  pin: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  rowName: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  rowFull: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
  empty: { textAlign: 'center', color: colors.textSecondary, marginTop: spacing.xl },
  attribution: { textAlign: 'center', fontSize: font.size.xs, color: colors.textTertiary, paddingVertical: spacing.sm },
});
