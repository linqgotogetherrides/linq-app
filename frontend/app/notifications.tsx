import React from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import LinqHeader from '@/src/components/LinqHeader';
import EmptyState from '@/src/components/EmptyState';
import GuestPrompt from '@/src/components/GuestPrompt';
import { useApp } from '@/src/context/AppContext';
import { mockNotifications } from '@/src/mock/data';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

const iconFor = (type: string): { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string } => {
  switch (type) {
    case 'accepted': return { icon: 'checkmark-circle', color: colors.success, bg: colors.successLight };
    case 'declined': return { icon: 'close-circle', color: colors.error, bg: colors.errorLight };
    case 'reward': return { icon: 'gift', color: colors.warning, bg: colors.warningLight };
    case 'reminder': return { icon: 'alarm', color: colors.info, bg: colors.infoLight };
    default: return { icon: 'notifications', color: colors.primary, bg: colors.primaryLight };
  }
};

export default function Notifications() {
  const { user } = useApp();

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']} testID="notifications-screen">
        <LinqHeader title="Notifications" />
        <GuestPrompt 
          icon="notifications-outline" 
          title="Login to View Notifications" 
          subtitle="Get updates on your ride requests and messages." 
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="notifications-screen">
      <LinqHeader title="Notifications" />
      {mockNotifications.length === 0 ? (
        <EmptyState icon="notifications-outline" title="No notifications" subtitle="You're all caught up!" />
      ) : (
        <FlatList
          data={mockNotifications}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: 40 }}
          renderItem={({ item }) => {
            const meta = iconFor(item.type);
            return (
              <View style={[styles.row, !item.read && styles.rowUnread]} testID={`notif-${item.id}`}>
                <View style={[styles.iconBox, { backgroundColor: meta.bg }]}><Ionicons name={meta.icon} size={20} color={meta.color} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.body}>{item.body}</Text>
                  <Text style={styles.time}>{item.time}</Text>
                </View>
                {!item.read && <View style={styles.dot} />}
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  row: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  rowUnread: { backgroundColor: colors.primaryLight + '40', borderColor: colors.primaryMuted },
  iconBox: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  body: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
  time: { fontSize: font.size.xs, color: colors.textTertiary, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 },
});
