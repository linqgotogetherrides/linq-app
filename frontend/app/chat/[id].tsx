import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import BottomSheet, { BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { useApp } from '@/src/context/AppContext';
import { mockConversations, mockMessages, currentUser } from '@/src/mock/data';
import { colors, spacing, font, radius } from '@/src/theme/tokens';

export default function Chat() {
  const router = useRouter();
  const { id, locked } = useLocalSearchParams<{ id: string; locked: string }>();
  const { showToast } = useApp();
  const convo = mockConversations.find((c) => c.id === id) ?? mockConversations[0];
  const isLocked = locked === '1';
  const [messages, setMessages] = useState(mockMessages);
  const [text, setText] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const sheetRef = useRef<BottomSheet>(null);

  const send = () => {
    if (!text.trim()) return;
    setMessages((m) => [...m, { id: `m${Date.now()}`, senderId: currentUser.id, text: text.trim(), time: '14:36' }]);
    setText('');
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
        <Image source={{ uri: convo.user.avatarUrl }} style={styles.avatar} contentFit="cover" />
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={styles.name}>{convo.user.name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="star" size={11} color={colors.yellow} />
            <Text style={styles.status}>{convo.user.rating} • DAILY</Text>
          </View>
        </View>
        <Pressable style={styles.headerIcon} testID="call-button" onPress={() => showToast(confirmed ? `Calling ${convo.user.name}…` : 'Confirm ride to enable calling')}><Ionicons name="call" size={18} color={colors.primary} /></Pressable>
        <Pressable style={styles.headerIcon} testID="chat-info" onPress={() => sheetRef.current?.expand()}><Ionicons name="information-circle-outline" size={20} color={colors.primary} /></Pressable>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={0}>
        <ScrollView contentContainerStyle={{ padding: spacing.lg }} showsVerticalScrollIndicator={false}>
          <View style={styles.activeRide}>
            <View style={styles.rideBadge}><Text style={styles.rideBadgeText}>ACTIVE RIDE</Text><Text style={styles.rideTime}>Today, 14:30</Text></View>
            <View style={styles.rideRow}><View style={[styles.rdot, { backgroundColor: colors.primary }]} /><Text style={styles.rideLoc}>Central Station</Text></View>
            <View style={styles.rideRow}><View style={[styles.rdot, { backgroundColor: colors.error }]} /><Text style={styles.rideLoc}>Tech Park Campus</Text></View>
          </View>

          <Text style={styles.dayDivider}>Today</Text>

          {messages.map((m) => {
            if (m.system) {
              return <View key={m.id} style={styles.systemMsg}><Ionicons name="location" size={12} color={colors.textSecondary} /><Text style={styles.systemText}>{m.text}</Text></View>;
            }
            const mine = m.senderId === currentUser.id;
            const blurred = isLocked && !mine;
            return (
              <View key={m.id} style={[styles.bubbleWrap, mine ? styles.bubbleRight : styles.bubbleLeft]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther, blurred && styles.bubbleBlurred]}>
                  <Text style={[styles.bubbleText, mine && { color: colors.textInverse }, blurred && { color: 'transparent' }]}>{m.text}</Text>
                  {!blurred && <Text style={[styles.bubbleTime, mine && { color: colors.primaryLight }]}>{m.time}</Text>}
                </View>
              </View>
            );
          })}
        </ScrollView>

        {isLocked ? (
          <View style={styles.lockedBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lockedTitle}>You exceeded the limit for today.</Text>
              <Text style={styles.lockedSub}>Come again tomorrow or upgrade now.</Text>
            </View>
            <Pressable style={styles.upgradePill} testID="chat-upgrade" onPress={() => router.push('/pricing')}><Text style={styles.upgradePillText}>Upgrade</Text></Pressable>
          </View>
        ) : (
          <>
            {!confirmed && (
              <View style={styles.confirmBar}>
                <Text style={styles.confirmText}>Confirm ride so that call and location will be enabled.</Text>
                <Pressable style={styles.confirmPill} testID="confirm-ride" onPress={() => { setConfirmed(true); showToast('Ride confirmed! You earned ₹7'); }}><Text style={styles.confirmPillText}>Confirm Ride</Text></Pressable>
              </View>
            )}
            <View style={styles.inputBar}>
              <Pressable style={styles.plusBtn} testID="attach-button" onPress={() => showToast('Attachment coming soon')}><Ionicons name="add" size={22} color={colors.textSecondary} /></Pressable>
              <TextInput testID="message-input" value={text} onChangeText={setText} placeholder={`Message ${convo.user.name}...`} placeholderTextColor={colors.textTertiary} style={styles.input} />
              <Pressable style={styles.micBtn} testID="mic-button" onPress={() => showToast('Voice message coming soon')}><Ionicons name="mic-outline" size={20} color={colors.textSecondary} /></Pressable>
              <Pressable style={styles.sendBtn} testID="send-button" onPress={send}><Ionicons name="send" size={18} color={colors.textInverse} /></Pressable>
            </View>
          </>
        )}
      </KeyboardAvoidingView>

      <BottomSheet ref={sheetRef} index={-1} snapPoints={['52%']} enablePanDownToClose backdropComponent={renderBackdrop} handleIndicatorStyle={{ backgroundColor: colors.border }}>
        <BottomSheetView style={styles.sheet}>
          <View style={styles.sheetProfile}>
            <Image source={{ uri: convo.user.avatarUrl }} style={styles.sheetAvatar} contentFit="cover" />
            <Text style={styles.sheetName}>{convo.user.name}</Text>
            <Text style={styles.sheetSub}>CHAT SETTINGS</Text>
          </View>
          <Pressable style={styles.settingRow} testID="setting-view-ride" onPress={() => { sheetRef.current?.close(); router.push('/ride/r_1'); }}>
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
  input: { flex: 1, backgroundColor: colors.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: spacing.md, height: 44, color: colors.textPrimary, fontSize: font.size.base },
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
