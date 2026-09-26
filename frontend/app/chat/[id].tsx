import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import BottomSheet, { BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { useApp } from '@/src/context/AppContext';
import { chatService, type ChatMessage, type ChatThread } from '@/src/services/chatService';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

export default function Chat() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, showToast } = useApp();
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sheetRef = useRef<BottomSheet>(null);
  const scrollToEnd = useRef<ScrollView>(null);
  const conversationId = typeof id === 'string' ? id : '';

  useEffect(() => {
    if (!user?.id || !conversationId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // list_threads gives the other rider and the route; list_messages marks
        // the thread read as a side effect.
        const [allThreads, loaded] = await Promise.all([
          chatService.listThreads(user.id),
          chatService.listMessages(conversationId, user.id),
        ]);
        if (cancelled) return;
        setThread(allThreads.find((t) => t.id === conversationId) ?? null);
        setMessages(loaded);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not open this conversation.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, conversationId]);

  // Live messages, deduplicated against what is already on screen.
  useEffect(() => {
    if (!conversationId) return;
    return chatService.subscribeToMessages(conversationId, (incoming) => {
      setMessages((current) =>
        current.some((m) => m.id === incoming.id) ? current : [...current, incoming],
      );
    });
  }, [conversationId]);

  const send = async () => {
    const body = text.trim();
    if (!body || !user?.id || !conversationId || sending) return;
    setSending(true);
    try {
      const sent = await chatService.sendMessage(conversationId, user.id, body);
      setMessages((current) =>
        current.some((m) => m.id === sent.id) ? current : [...current, sent],
      );
      setText('');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'The message could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const renderBackdrop = useCallback((props: any) => (
    <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
  ), []);

  const settingsAction = (label: string, danger?: boolean) => {
    sheetRef.current?.close();
    showToast(label);
    if (danger) setTimeout(() => router.back(), 300);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="chat-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}><Ionicons name="chevron-back" size={24} color={colors.textPrimary} /></Pressable>
        <Image source={{ uri: thread?.otherAvatar }} style={styles.avatar} contentFit="cover" />
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={styles.name}>{thread?.otherName ?? 'Rider'}</Text>
          <Text style={styles.status} numberOfLines={1}>
            {thread?.route ?? 'Matched on your route'}
          </Text>
        </View>
        <Pressable
          style={styles.headerIcon}
          testID="call-button"
          onPress={() =>
            showToast(
              thread?.otherName
                ? `Calling is not available yet.`
                : 'This conversation is unavailable.',
            )
          }
        >
          <Ionicons name="call" size={18} color={colors.primary} />
        </Pressable>
        <Pressable style={styles.headerIcon} testID="chat-info" onPress={() => sheetRef.current?.expand()}><Ionicons name="information-circle-outline" size={20} color={colors.primary} /></Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={0}>
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollToEnd.current?.scrollToEnd({ animated: true })}
        >
          {thread?.route ? (
            <View style={styles.activeRide}>
              <View style={styles.rideBadge}>
                <Text style={styles.rideBadgeText}>MATCHED RIDE</Text>
              </View>
              <View style={styles.rideRow}>
                <View style={[styles.rdot, { backgroundColor: colors.primary }]} />
                <Text style={styles.rideLoc} numberOfLines={1}>{thread.route}</Text>
              </View>
            </View>
          ) : null}

          {loading ? (
            <Text style={styles.systemText}>Loading conversation…</Text>
          ) : error ? (
            <Text style={styles.systemText}>{error}</Text>
          ) : messages.length === 0 ? (
            <Text style={styles.systemText}>
              No messages yet. Say hello and agree where to meet.
            </Text>
          ) : (
            messages.map((m) => {
              const mine = m.senderId === user?.id;
              return (
                <View
                  key={m.id}
                  style={[styles.bubbleWrap, mine ? styles.bubbleRight : styles.bubbleLeft]}
                >
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                    <Text style={[styles.bubbleText, mine && { color: colors.textInverse }]}>
                      {m.body}
                    </Text>
                    <Text
                      style={[styles.bubbleTime, mine && { color: colors.primaryLight }]}
                    >
                      {formatMessageTime(m.createdAt)}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            testID="message-input"
            value={text}
            onChangeText={setText}
            placeholder={thread?.otherName ? `Message ${thread.otherName}…` : 'Message…'}
            placeholderTextColor={colors.textTertiary}
            style={styles.input}
            multiline
            onSubmitEditing={() => void send()}
          />
          <Pressable
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            testID="send-button"
            onPress={() => void send()}
            disabled={!text.trim() || sending}
          >
            <Ionicons name="send" size={18} color={colors.textInverse} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <BottomSheet ref={sheetRef} index={-1} snapPoints={['52%']} enablePanDownToClose backdropComponent={renderBackdrop} handleIndicatorStyle={{ backgroundColor: colors.border }}>
        <BottomSheetView style={styles.sheet}>
          <View style={styles.sheetProfile}>
            <Image source={{ uri: thread?.otherAvatar }} style={styles.sheetAvatar} contentFit="cover" />
            <Text style={styles.sheetName}>{thread?.otherName ?? 'Rider'}</Text>
            <Text style={styles.sheetSub}>CHAT SETTINGS</Text>
          </View>
          <Pressable style={styles.settingRow} testID="setting-view-ride" onPress={() => {
              sheetRef.current?.close();
              if (thread?.rideId) router.push({ pathname: '/ride/[id]', params: { id: thread.rideId } });
            }}>
            <Ionicons name="car-outline" size={20} color={colors.textPrimary} /><Text style={styles.settingText}>View Ride</Text><Ionicons name="chevron-forward" size={16} color={colors.textTertiary} style={{ marginLeft: 'auto' }} />
          </Pressable>
          <Pressable style={styles.settingRow} testID="setting-view-profile" onPress={() => settingsAction('Opening profile…')}>
            <Ionicons name="person-outline" size={20} color={colors.textPrimary} /><Text style={styles.settingText}>View Profile</Text><Ionicons name="chevron-forward" size={16} color={colors.textTertiary} style={{ marginLeft: 'auto' }} />
          </Pressable>
          <View style={styles.settingDivider} />
          <Pressable style={styles.settingRow} testID="setting-report" onPress={() => settingsAction('User reported')}>
            <Ionicons name="flag-outline" size={20} color={colors.error} /><Text style={[styles.settingText, { color: colors.error }]}>Report User</Text>
          </Pressable>
          <Pressable style={styles.settingRow} testID="setting-block" onPress={() => settingsAction('User blocked', true)}>
            <Ionicons name="ban-outline" size={20} color={colors.error} /><Text style={[styles.settingText, { color: colors.error }]}>Block User</Text>
          </Pressable>
          <Pressable style={styles.settingRow} testID="setting-delete" onPress={() => settingsAction('Conversation deleted', true)}>
            <Ionicons name="trash-outline" size={20} color={colors.error} /><Text style={[styles.settingText, { color: colors.error }]}>Delete Conversation</Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheet>
    </SafeAreaView>
  );
}

/** Clock time for today, otherwise a short date. */
function formatMessageTime(value?: string): string {
  if (!value) return '';
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return '';
  const today = new Date();
  const sameDay =
    when.getFullYear() === today.getFullYear() &&
    when.getMonth() === today.getMonth() &&
    when.getDate() === today.getDate();
  return sameDay
    ? when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : when.toLocaleDateString();
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.divider, gap: 6 },
  avatar: { width: 40, height: 40, borderRadius: 20, marginLeft: spacing.sm, backgroundColor: colors.surfaceSecondary },
  name: { fontSize: font.size.base, color: colors.primary, fontWeight: font.weight.medium },
  status: { fontSize: font.size.xs, color: colors.textSecondary },
  headerIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },

  activeRide: { backgroundColor: colors.surfaceTertiary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  rideBadge: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  rideBadgeText: { fontSize: 9, color: colors.primary, fontWeight: font.weight.medium, letterSpacing: 0.5 },
  rideTime: { fontSize: font.size.xs, color: colors.textSecondary },
  rideRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: 2 },
  rdot: { width: 8, height: 8, borderRadius: 4 },
  rideLoc: { fontSize: font.size.sm, color: colors.textPrimary },

  dayDivider: { textAlign: 'center', fontSize: font.size.xs, color: colors.textTertiary, marginVertical: spacing.md },
  bubbleWrap: { marginBottom: spacing.sm, maxWidth: '80%' },
  bubbleLeft: { alignSelf: 'flex-start' },
  bubbleRight: { alignSelf: 'flex-end' },
  bubble: { borderRadius: radius.lg, padding: spacing.md },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.surfaceSecondary, borderBottomLeftRadius: 4 },
  bubbleBlurred: { backgroundColor: colors.border },
  bubbleText: { fontSize: font.size.base, color: colors.textPrimary, lineHeight: 20 },
  bubbleTime: { fontSize: 10, color: colors.textTertiary, alignSelf: 'flex-end', marginTop: 4 },
  systemMsg: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginVertical: spacing.sm },
  systemText: { fontSize: font.size.xs, color: colors.textSecondary },

  lockedBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSecondary, padding: spacing.md, gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  lockedTitle: { fontSize: font.size.sm, color: colors.textPrimary, fontWeight: font.weight.medium },
  lockedSub: { fontSize: font.size.xs, color: colors.textSecondary },
  upgradePill: { backgroundColor: colors.primary, paddingHorizontal: spacing.lg, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  upgradePillText: { color: colors.textInverse, fontSize: font.size.sm, fontWeight: font.weight.medium },

  confirmBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primaryLight, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.md },
  confirmText: { flex: 1, fontSize: font.size.xs, color: colors.textPrimary },
  confirmPill: { backgroundColor: colors.primary, paddingHorizontal: spacing.md, height: 34, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  confirmPillText: { color: colors.textInverse, fontSize: font.size.xs, fontWeight: font.weight.medium },

  inputBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.divider },
  plusBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm, minHeight: 44, maxHeight: 110, color: colors.textPrimary, fontSize: font.size.base },
  sendBtnDisabled: { opacity: 0.5 },
  micBtn: { padding: 4 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },

  sheet: { flex: 1, paddingHorizontal: spacing.xl },
  sheetProfile: { alignItems: 'center', paddingBottom: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.divider, marginBottom: spacing.sm },
  sheetAvatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceSecondary },
  sheetName: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium, marginTop: spacing.sm },
  sheetSub: { fontSize: font.size.xs, color: colors.textTertiary, letterSpacing: 0.5, marginTop: 2 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, height: 52 },
  settingText: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  settingDivider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.sm },
});
