import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import BottomSheet, { BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import RideCard from '@/src/components/RideCard';
import EmptyState from '@/src/components/EmptyState';
import PrimaryButton from '@/src/components/PrimaryButton';
import { rideService } from '@/src/services/rideService';
import { useApp } from '@/src/context/AppContext';
import { Ride } from '@/src/types';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

const FILTERS = [
  { key: 'riders', label: 'Riders' },
  { key: 'seekers', label: 'Seekers' },
  { key: 'instant', label: 'Instant' },
  { key: 'budget', label: 'Budget friendly' },
  { key: 'verified', label: 'Verified' },
  { key: 'toprated', label: 'Top rated' },
  { key: 'women', label: 'Women only' },
  { key: 'eco', label: 'Eco' },
];

export default function SearchResults() {
  const router = useRouter();
  const { user } = useApp();
  const params = useLocalSearchParams<{ pickup?: string; destination?: string; type?: string }>();
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [tab, setTab] = useState('riders');
  const sheetRef = useRef<BottomSheet>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = await rideService.getRides({ pickup: params.pickup, destination: params.destination });
      setRides(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [params.pickup, params.destination]);

  useEffect(() => { load(); }, [load]);

  const toggleFilter = (key: string) => {
    setActiveFilters((f) => (f.includes(key) ? f.filter((x) => x !== key) : [...f, key]));
  };

  const filtered = useMemo(() => {
    let r = [...rides];
    if (activeFilters.includes('instant')) r = r.filter((x) => x.type === 'instant');
    if (activeFilters.includes('women')) r = r.filter((x) => x.womenOnly);
    if (activeFilters.includes('verified')) r = r.filter((x) => x.creator.verification === 'verified');
    if (activeFilters.includes('budget')) r = [...r].sort((a, b) => a.pricePerSeat - b.pricePerSeat);
    if (activeFilters.includes('toprated')) r = [...r].sort((a, b) => (b.creator.rating ?? 0) - (a.creator.rating ?? 0));
    return r;
  }, [rides, activeFilters]);

  const renderBackdrop = useCallback((props: any) => (
    <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
  ), []);

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="search-results-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={styles.title}>Ride Twins</Text>
          <Text style={styles.sub}>{params.pickup || 'Madhapur'} → {params.destination || 'Anywhere'}</Text>
        </View>
        <Pressable style={styles.filterIcon} testID="open-filters" onPress={() => sheetRef.current?.expand()}>
          <Ionicons name="options-outline" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>



      <View style={styles.chipRowWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {FILTERS.map((f) => {
            const active = activeFilters.includes(f.key);
            return (
              <Pressable key={f.key} testID={`filter-chip-${f.key}`} onPress={() => toggleFilter(f.key)} style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} size="large" /><Text style={styles.loadingText}>Finding your ride twins…</Text></View>
      ) : error ? (
        <View style={styles.center}>
          <EmptyState icon="cloud-offline-outline" title="Couldn't load rides" subtitle="Something went wrong. Please try again." />
          <View style={{ width: 160 }}><PrimaryButton title="Retry" onPress={load} /></View>
        </View>
      ) : filtered.length === 0 ? (
        <EmptyState icon="car-outline" title="No rides found" subtitle="Try adjusting your filters or search a different route." />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <RideCard ride={item} />}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={styles.bottomFixed}>
        <PrimaryButton 
          testID="post-ride-btn"
          title="Post your ride if you haven't" 
          icon="add-circle-outline"
          fullWidth={false}
          onPress={() => {
            if (!user) {
              router.push('/onboarding');
            } else {
              router.push('/create-ride');
            }
          }} 
        />
      </View>

      <BottomSheet ref={sheetRef} index={-1} snapPoints={['70%']} enablePanDownToClose backdropComponent={renderBackdrop} handleIndicatorStyle={{ backgroundColor: colors.border }}>
        <BottomSheetView style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Filters</Text>
            <Pressable onPress={() => sheetRef.current?.close()}><Ionicons name="close" size={22} color={colors.textPrimary} /></Pressable>
          </View>
          <Text style={styles.sheetSection}>Sort & Filter</Text>
          <View style={styles.sheetChips}>
            {FILTERS.map((f) => {
              const active = activeFilters.includes(f.key);
              return (
                <Pressable key={f.key} onPress={() => toggleFilter(f.key)} style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.sheetActions}>
            <Pressable style={styles.resetBtn} onPress={() => setActiveFilters([])}><Ionicons name="refresh" size={16} color={colors.textSecondary} /><Text style={styles.resetText}>Reset</Text></Pressable>
            <View style={{ flex: 1 }}><PrimaryButton title="Apply Filters" icon="checkmark-circle" onPress={() => sheetRef.current?.close()} /></View>
          </View>
        </BottomSheetView>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  title: { fontSize: font.size.xl, color: colors.textPrimary, fontWeight: font.weight.medium },
  sub: { fontSize: font.size.sm, color: colors.textSecondary },
  filterIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },

  chipRowWrap: { height: 56, justifyContent: 'center' },
  chipRow: { paddingHorizontal: spacing.xl, gap: spacing.sm, alignItems: 'center' },
  chip: { height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chipActive: { backgroundColor: colors.primaryLight, borderColor: colors.primary },
  chipText: { fontSize: font.size.sm, color: colors.textSecondary, fontWeight: font.weight.medium },
  chipTextActive: { color: colors.primary },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  loadingText: { marginTop: spacing.md, color: colors.textSecondary, fontSize: font.size.base },

  sheet: { flex: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing['2xl'] },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  sheetTitle: { fontSize: font.size.xl, color: colors.textPrimary, fontWeight: font.weight.medium },
  sheetSection: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium, marginBottom: spacing.md },
  sheetChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sheetActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing['2xl'] },
  resetBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.lg, height: 48 },
  resetText: { color: colors.textSecondary, fontSize: font.size.base },
  bottomFixed: { position: 'absolute', bottom: 24, right: spacing.xl },
});
