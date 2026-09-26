import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useApp } from '@/src/context/AppContext';
import EmptyState from '@/src/components/EmptyState';
import GuestPrompt from '@/src/components/GuestPrompt';
import NotificationButton from '@/src/components/NotificationButton';
import { chatService, type ChatThread } from '@/src/services/chatService';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

export default function Messages() {
  const router = useRouter();
  const { user, access } = useApp();
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const [query, setQuery] = useState('');
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setLoadError(null);
    try {
      setThreads(await chatService.listThreads(user.id));
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'Could not load your conversations.',
      );
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']} testID="messages-screen">
        <View style={styles.header}>
          <Text style={styles.title}>Messages</Text>
          <NotificationButton testID="messages-notifications-button" />
        </View>
        <GuestPrompt 
          icon="chatbubbles-outline" 
          title="Login to View Messages" 
          subtitle="Chat with your ride twins and coordinate your trips." 
        />
      </SafeAreaView>
    );
  }

  const convos = threads.filter((c) => {
    if (tab === 'unread' && c.unreadCount === 0) return false;
    // Search what we actually know. A thread with no name yet is still listed.
    const name = c.otherName ?? '';
    if (query && !name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="messages-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
        <NotificationButton testID="messages-notifications-button" />
      </View>

      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={colors.textTertiary} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search conversations..." placeholderTextColor={colors.textTertiary} style={styles.searchInput} testID="search-conversations" />
      </View>

      <View style={styles.freeCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.freeText}>Free chats: <Text style={{ color: colors.primary }}>{access.freeChatsRemaining} remaining</Text> · {2 - access.freeChatsRemaining}/2 used</Text>
          <View style={styles.progressTrack}><View style={[styles.progressFill, { width: `${(access.freeChatsRemaining / 2) * 100}%` }]} /></View>
        </View>
        <Pressable style={styles.upgradeBtn} testID="upgrade-chats" onPress={() => router.push('/pricing')}>
          <Text style={styles.upgradeText}>Upgrade</Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        <Pressable onPress={() => setTab('all')} style={[styles.tabChip, tab === 'all' && styles.tabChipActive]}>
          <Text style={[styles.tabText, tab === 'all' && styles.tabTextActive]}>All</Text>
        </Pressable>
        <Pressable onPress={() => setTab('unread')} style={[styles.tabChip, tab === 'unread' && styles.tabChipActive]}>
          <Text style={[styles.tabText, tab === 'unread' && styles.tabTextActive]}>Unread</Text>
          <View style={styles.unreadDot} />
        </Pressable>
      </View>

      {loadError ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Could not load conversations"
          subtitle={loadError}
        />
      ) : convos.length === 0 ? (
        <EmptyState
          icon="chatbubbles-outline"
          title={loading ? 'Loading conversations…' : 'No conversations yet'}
          subtitle={
            loading
              ? 'One moment.'
              : tab === 'unread'
                ? 'Nothing unread. Accepted ride requests start a chat here.'
                : 'When someone accepts your ride request, your chat opens here.'
          }
        />
      ) : (
        <FlatList
          data={convos}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 100 }}
          renderItem={({ item }) => (
            <Pressable
              testID={`conversation-${item.id}`}
              style={styles.row}
              onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.id } })}
            >
              <View>
                <Image source={{ uri: item.otherAvatar }} style={styles.avatar} contentFit="cover" />
                {item.unreadCount > 0 && <View style={styles.unreadBadge} />}
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <View style={styles.rowTop}>
                  <Text style={styles.name}>{item.otherName ?? 'Rider'}</Text>
                  <Text style={styles.time}>{formatThreadTime(item.lastMessageAt)}</Text>
                </View>
                <Text style={styles.lastMsg} numberOfLines={1}>
                  {item.lastMessage ?? 'No messages yet'}
                </Text>
                {item.route && <Text style={styles.route} numberOfLines={1}>{item.route}</Text>}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

/** Relative for today, otherwise a short date. Never invents a timestamp. */
function formatThreadTime(value?: string): string {
  if (!value) return '';
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return '';
  const minutes = Math.floor((Date.now() - when.getTime()) / 60000);
  if (minutes < 1) return 'Now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return when.toLocaleDateString();
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  title: { fontSize: font.size['2xl'], color: colors.textPrimary, fontWeight: font.weight.medium },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.xl, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 44 },
  searchInput: { flex: 1, color: colors.textPrimary, fontSize: font.size.base },
  freeCard: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.xl, marginTop: spacing.md, backgroundColor: colors.primaryLight, borderRadius: radius.md, padding: spacing.md, gap: spacing.md },
  freeText: { fontSize: font.size.sm, color: colors.textPrimary },
  progressTrack: { height: 4, backgroundColor: colors.primaryMuted, borderRadius: 2, marginTop: 6 },
  progressFill: { height: 4, backgroundColor: colors.primary, borderRadius: 2 },
  upgradeBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.md, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  upgradeText: { color: colors.textInverse, fontSize: font.size.sm, fontWeight: font.weight.medium },
  tabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, marginVertical: spacing.md },
  tabChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.lg, height: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  tabChipActive: { backgroundColor: colors.surfaceInverse, borderColor: colors.surfaceInverse },
  tabText: { fontSize: font.size.sm, color: colors.textSecondary, fontWeight: font.weight.medium },
  tabTextActive: { color: colors.textInverse },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.error },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.divider },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surfaceSecondary },
  unreadBadge: { position: 'absolute', top: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.background },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  time: { fontSize: font.size.xs, color: colors.textTertiary },
  lastMsg: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: 2 },
  route: { fontSize: font.size.xs, color: colors.primary, marginTop: 2 },
});
