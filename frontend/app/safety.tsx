import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Switch, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import LinqHeader from '@/src/components/LinqHeader';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

export default function Safety() {
  const router = useRouter();

  const [shareLocation, setShareLocation] = useState(true);
  const [womenOnly, setWomenOnly] = useState(false);

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="safety-screen">
      <LinqHeader title="Safety & Privacy" />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Text style={styles.section}>Privacy</Text>
        <View style={styles.card}>
          <ToggleRow icon="location-outline" label="Share live location" sub="During active rides only" value={shareLocation} onChange={setShareLocation} last />
        </View>

        <Text style={styles.section}>Safety</Text>
        <View style={styles.card}>
          <ToggleRow icon="female-outline" label="Women only mode" sub="Only connect with women travellers" value={womenOnly} onChange={setWomenOnly} activeColor="#FF69B4" />
          <LinkRow icon="call-outline" label="Emergency contact" sub="+91 98111 22233" onPress={() => router.push('/personal-info')} />
          <LinkRow icon="ban-outline" label="Blocked users" sub="Manage blocked members" onPress={() => {}} last />
        </View>

        <Text style={styles.section}>Contact preferences</Text>
        <View style={styles.card}>
          <LinkRow icon="chatbubble-outline" label="Who can message me" sub="Verified members only" onPress={() => {}} />
          <LinkRow icon="notifications-outline" label="Notification settings" sub="Manage alerts" onPress={() => router.push('/notifications')} last />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleRow({ icon, label, sub, value, onChange, last, activeColor = colors.primary }: any) {
  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <View style={styles.iconBox}><Ionicons name={icon} size={20} color={colors.primary} /></View>
      <View style={{ flex: 1 }}><Text style={styles.label}>{label}</Text><Text style={styles.sub}>{sub}</Text></View>
      <Switch 
        value={value} 
        onValueChange={onChange} 
        trackColor={{ false: colors.border, true: activeColor }} 
        thumbColor="#FFFFFF"
        //@ts-ignore
        activeTrackColor={activeColor}
      />
    </View>
  );
}

function LinkRow({ icon, label, sub, onPress, last }: any) {
  return (
    <Pressable style={[styles.row, !last && styles.rowBorder]} onPress={onPress}>
      <View style={styles.iconBox}><Ionicons name={icon} size={20} color={colors.primary} /></View>
      <View style={{ flex: 1 }}><Text style={styles.label}>{label}</Text><Text style={styles.sub}>{sub}</Text></View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceSecondary },
  section: { fontSize: font.size.sm, color: colors.textTertiary, fontWeight: font.weight.medium, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.sm, marginTop: spacing.md },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, minHeight: 60 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.divider },
  iconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  sub: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
});
