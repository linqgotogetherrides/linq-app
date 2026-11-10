import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';

import { useApp } from '@/src/context/AppContext';
import { useWallet } from '@/src/context/WalletContext';
import { chatService, type ChatMessage, type ChatThread } from '@/src/services/chatService';
import { rideService } from '@/src/services/rideService';
import type { Ride } from '@/src/types';
import RazorpayCheckoutButton from '@/src/components/RazorpayCheckoutButton';
import RatingFeedbackModal from '@/src/components/RatingFeedbackModal';
import { colors, font, radius, spacing } from '@/src/theme/tokens';

export default function Chat() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, showToast } = useApp();
  const { balance, deductBalance } = useWallet();

  const [thread, setThread] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [ride, setRide] = useState<Ride | null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);

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
        const [allThreads, loaded] = await Promise.all([
          chatService.listThreads(user.id),
          chatService.listMessages(conversationId, user.id),
        ]);
        if (cancelled) return;
        const currentThread = allThreads.find((t) => t.id === conversationId) ?? null;
        setThread(currentThread);
        setMessages(loaded);

        if (currentThread?.rideId) {
          const loadedRide = await rideService.getRideById(currentThread.rideId);
          if (!cancelled && loadedRide) {
            setRide(loadedRide);
          }
        }
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

  const handleUnlockContact = async (paymentRef: string) => {
    if (!user?.id || !conversationId) return;
    setUnlocking(true);
    try {
      const ok = await chatService.unlockContact(conversationId, user.id, paymentRef);
      if (ok) {
        showToast('Contact details unlocked!');
        const threads = await chatService.listThreads(user.id);
        const updated = threads.find((t) => t.id === conversationId);
        if (updated) setThread(updated);
      } else {
        showToast('Could not unlock contact');
      }
    } catch {
      showToast('Error unlocking contact');
    } finally {
      setUnlocking(false);
    }
  };

  const handleWalletUnlock = async () => {
    if (balance < 9) {
      showToast('Insufficient wallet balance. Please add money or pay online.');
      return;
    }
    setUnlocking(true);
    try {
      const deducted = await deductBalance(
        9,
        'Connection fee to unlock rider contact',
        conversationId,
      );
      if (!deducted) {
        showToast('Could not deduct balance from wallet.');
        setUnlocking(false);
        return;
      }
      await handleUnlockContact('wallet_balance');
    } catch {
      showToast('Wallet payment failed.');
      setUnlocking(false);
    }
  };

  const handleStartJourney = async () => {
    if (!ride || !user?.id) return;
    setJourneyLoading(true);
    try {
      const res = await rideService.startRide(ride.id, user.id);
      if (res.ok) {
        showToast('Journey started! Drive safely.');
        setRide((prev) => (prev ? { ...prev, status: 'in_progress' } : null));
      } else {
        showToast(res.error || 'Could not start journey');
      }
    } catch {
      showToast('Failed to start journey');
    } finally {
      setJourneyLoading(false);
    }
  };

  const handleCompleteRide = async () => {
    if (!ride || !user?.id) return;
    setJourneyLoading(true);
    try {
      const res = await rideService.completeRideTrip(ride.id, user.id);
      if (res.ok) {
        showToast('Ride completed successfully! ₹5 credited.');
        setRide((prev) => (prev ? { ...prev, status: 'completed' } : null));
        setReviewModalVisible(true);
      } else {
        showToast(res.error || 'Could not complete ride');
      }
    } catch {
      showToast('Failed to complete ride');
    } finally {
      setJourneyLoading(false);
    }
  };

  const handleCall = () => {
    if (thread?.contactUnlocked && thread.otherPhone) {
      const clean = thread.otherPhone.replace(/^\+91/, '').replace(/\D/g, '');
      Linking.openURL(`tel:+91${clean}`);
    } else {
      showToast('Unlock contact details (₹9 fee or active plan) to call directly.');
    }
  };

  const handleWhatsApp = () => {
    if (thread?.contactUnlocked && thread.otherPhone) {
      const clean = thread.otherPhone.replace(/^\+91/, '').replace(/\D/g, '');
      const msg = encodeURIComponent(
        `Hi ${thread.otherName || 'there'}, connecting with you on LinQ regarding our ride!`,
      );
      Linking.openURL(`https://wa.me/91${clean}?text=${msg}`);
    } else {
      showToast('Unlock contact details to connect directly on WhatsApp.');
    }
  };

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    ),
    [],
  );

  const settingsAction = (label: string, danger?: boolean) => {
    sheetRef.current?.close();
    showToast(label);
    if (danger) setTimeout(() => router.back(), 300);
  };

  const hasActivePlan = Boolean(
    user?.plan &&
      user.plan !== 'free' &&
      (!user.planExpiresAt || new Date(user.planExpiresAt) > new Date()),
  );

  const isDriver = ride?.creator?.id === user?.id;

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="chat-screen">
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </Pressable>
        <Image
          source={{ uri: thread?.otherAvatar }}
          style={styles.avatar}
          contentFit="cover"
        />
        <View style={{ flex: 1, marginLeft: spacing.sm }}>
          <Text style={styles.name}>{thread?.otherName ?? 'Rider'}</Text>
          <Text style={styles.status} numberOfLines={1}>
            {thread?.route ?? 'Matched on your route'}
          </Text>
        </View>

        {/* WhatsApp Call / Chat Shortcut */}
        <Pressable
          style={[
            styles.headerIcon,
            thread?.contactUnlocked && { backgroundColor: '#DCF8C6' },
          ]}
          testID="whatsapp-button"
          onPress={handleWhatsApp}
          hitSlop={8}
        >
          <Ionicons
            name="logo-whatsapp"
            size={18}
            color={thread?.contactUnlocked ? '#25D366' : colors.textTertiary}
          />
        </Pressable>

        {/* Direct Phone Call */}
        <Pressable
          style={[
            styles.headerIcon,
            thread?.contactUnlocked && { backgroundColor: colors.primaryLight },
          ]}
          testID="call-button"
          onPress={handleCall}
          hitSlop={8}
        >
          <Ionicons
            name="call"
            size={18}
            color={thread?.contactUnlocked ? colors.primary : colors.textTertiary}
          />
        </Pressable>

        <Pressable
          style={styles.headerIcon}
          testID="chat-info"
          onPress={() => sheetRef.current?.expand()}
          hitSlop={8}
        >
          <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xl }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollToEnd.current?.scrollToEnd({ animated: true })}
        >
          {/* Matched Ride & Route Card */}
          {thread?.route ? (
            <View style={styles.activeRide}>
              <View style={styles.rideBadge}>
                <Text style={styles.rideBadgeText}>MATCHED RIDE</Text>
                {ride?.status ? (
                  <View
                    style={[
                      styles.statusPill,
                      ride.status === 'in_progress' && styles.statusInProgress,
                      ride.status === 'completed' && styles.statusCompleted,
                    ]}
                  >
                    <Text style={styles.statusPillText}>
                      {ride.status.toUpperCase()}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.rideRow}>
                <View style={[styles.rdot, { backgroundColor: colors.primary }]} />
                <Text style={styles.rideLoc} numberOfLines={1}>
                  {thread.route}
                </Text>
              </View>
            </View>
          ) : null}

          {/* Journey Lifecycle Controls Card */}
          {ride ? (
            <View style={styles.journeyCard}>
              <View style={styles.journeyHeader}>
                <Ionicons
                  name={
                    ride.status === 'completed'
                      ? 'checkmark-circle'
                      : ride.status === 'in_progress'
                      ? 'navigate'
                      : 'time-outline'
                  }
                  size={18}
                  color={colors.primary}
                />
                <Text style={styles.journeyTitle}>
                  {ride.status === 'in_progress'
                    ? 'Journey In Progress'
                    : ride.status === 'completed'
                    ? 'Trip Completed'
                    : 'Confirm Pickup & Timing'}
                </Text>
              </View>

              {isDriver ? (
                <View style={styles.journeyActions}>
                  {ride.status === 'active' || ride.status === 'confirmed' ? (
                    <Pressable
                      style={[
                        styles.lifecycleBtn,
                        styles.startJourneyBtn,
                        journeyLoading && styles.btnDisabled,
                      ]}
                      onPress={handleStartJourney}
                      disabled={journeyLoading}
                    >
                      {journeyLoading ? (
                        <ActivityIndicator color={colors.textInverse} size="small" />
                      ) : (
                        <>
                          <Ionicons name="play" size={16} color={colors.textInverse} />
                          <Text style={styles.lifecycleBtnText}>Start Journey</Text>
                        </>
                      )}
                    </Pressable>
                  ) : null}

                  {ride.status === 'in_progress' ? (
                    <Pressable
                      style={[
                        styles.lifecycleBtn,
                        styles.completeRideBtn,
                        journeyLoading && styles.btnDisabled,
                      ]}
                      onPress={handleCompleteRide}
                      disabled={journeyLoading}
                    >
                      {journeyLoading ? (
                        <ActivityIndicator color={colors.textInverse} size="small" />
                      ) : (
                        <>
                          <Ionicons
                            name="checkmark-done"
                            size={16}
                            color={colors.textInverse}
                          />
                          <Text style={styles.lifecycleBtnText}>Complete Ride</Text>
                        </>
                      )}
                    </Pressable>
                  ) : null}

                  {ride.status === 'completed' ? (
                    <Pressable
                      style={[styles.lifecycleBtn, styles.rateBtn]}
                      onPress={() => setReviewModalVisible(true)}
                    >
                      <Ionicons name="star" size={16} color={colors.textInverse} />
                      <Text style={styles.lifecycleBtnText}>Rate Passenger</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <View style={styles.journeyActions}>
                  {ride.status === 'in_progress' ? (
                    <Text style={styles.passengerStatusText}>
                      Driver has started the trip. You are on your way!
                    </Text>
                  ) : ride.status === 'completed' ? (
                    <Pressable
                      style={[styles.lifecycleBtn, styles.rateBtn]}
                      onPress={() => setReviewModalVisible(true)}
                    >
                      <Ionicons name="star" size={16} color={colors.textInverse} />
                      <Text style={styles.lifecycleBtnText}>Rate Driver</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.passengerStatusText}>
                      Coordinate your exact pickup spot below with your driver.
                    </Text>
                  )}
                </View>
              )}
            </View>
          ) : null}

          {/* Contact Locked vs Unlocked Banner */}
          {thread && !thread.contactUnlocked ? (
            <View style={styles.connectionCard}>
              <View style={styles.connectionCardHeader}>
                <Ionicons name="lock-closed" size={18} color="#D97706" />
                <Text style={styles.connectionCardTitle}>
                  Unlock Contact & Phone Calls
                </Text>
              </View>
              <Text style={styles.connectionCardDesc}>
                Pay the ₹9 connection fee (or free with an active plan) to reveal verified
                phone numbers, direct calls, and WhatsApp chat.
              </Text>

              <View style={styles.connectionActions}>
                {hasActivePlan ? (
                  <Pressable
                    style={[styles.unlockBtn, unlocking && styles.btnDisabled]}
                    onPress={() => handleUnlockContact('plan_benefit')}
                    disabled={unlocking}
                  >
                    {unlocking ? (
                      <ActivityIndicator color={colors.textInverse} size="small" />
                    ) : (
                      <Text style={styles.unlockBtnText}>
                        Unlock for Free (Plan Active)
                      </Text>
                    )}
                  </Pressable>
                ) : balance >= 9 ? (
                  <Pressable
                    style={[styles.unlockBtn, unlocking && styles.btnDisabled]}
                    onPress={handleWalletUnlock}
                    disabled={unlocking}
                  >
                    {unlocking ? (
                      <ActivityIndicator color={colors.textInverse} size="small" />
                    ) : (
                      <Text style={styles.unlockBtnText}>
                        Pay ₹9 with Wallet (Bal: ₹{balance})
                      </Text>
                    )}
                  </Pressable>
                ) : (
                  <RazorpayCheckoutButton
                    amountPaise={900}
                    receipt={`conn_${conversationId.slice(0, 8)}`}
                    plan="connection_fee"
                    title="Unlock Contact Details"
                    description="₹9 Connection Fee for LinQ Ride"
                    onSuccess={(p) => handleUnlockContact(p.razorpay_payment_id)}
                    style={styles.unlockBtn}
                  >
                    <Text style={styles.unlockBtnText}>
                      Pay ₹9 Connection Fee (UPI/Cards)
                    </Text>
                  </RazorpayCheckoutButton>
                )}
              </View>
            </View>
          ) : thread?.contactUnlocked ? (
            <View style={styles.unlockedBar}>
              <Ionicons name="checkmark-circle" size={18} color="#16A34A" />
              <Text style={styles.unlockedText}>
                Contact Unlocked:{' '}
                <Text style={styles.unlockedPhone}>
                  {thread.otherPhone ? `+91 ${thread.otherPhone}` : 'Verified'}
                </Text>
              </Text>
              <Pressable
                style={styles.quickCallBtn}
                onPress={handleCall}
                hitSlop={6}
              >
                <Ionicons name="call" size={14} color={colors.primary} />
                <Text style={styles.quickCallText}>Call</Text>
              </Pressable>
              <Pressable
                style={styles.quickWaBtn}
                onPress={handleWhatsApp}
                hitSlop={6}
              >
                <Ionicons name="logo-whatsapp" size={14} color="#15803D" />
                <Text style={styles.quickWaText}>WhatsApp</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Messages list */}
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
                  <View
                    style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}
                  >
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

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <TextInput
            testID="message-input"
            value={text}
            onChangeText={setText}
            placeholder={
              thread?.otherName ? `Message ${thread.otherName}…` : 'Message…'
            }
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

      {/* Settings Bottom Sheet */}
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={['55%']}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{ backgroundColor: colors.border }}
      >
        <BottomSheetView style={styles.sheet}>
          <View style={styles.sheetProfile}>
            <Image
              source={{ uri: thread?.otherAvatar }}
              style={styles.sheetAvatar}
              contentFit="cover"
            />
            <Text style={styles.sheetName}>{thread?.otherName ?? 'Rider'}</Text>
            <Text style={styles.sheetSub}>CHAT SETTINGS</Text>
          </View>
          <Pressable
            style={styles.settingRow}
            testID="setting-view-ride"
            onPress={() => {
              sheetRef.current?.close();
              if (thread?.rideId) {
                router.push({ pathname: '/ride/[id]', params: { id: thread.rideId } });
              }
            }}
          >
            <Ionicons name="car-outline" size={20} color={colors.textPrimary} />
            <Text style={styles.settingText}>View Ride Details</Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.textTertiary}
              style={{ marginLeft: 'auto' }}
            />
          </Pressable>
          <Pressable
            style={styles.settingRow}
            testID="setting-view-profile"
            onPress={() =>
              settingsAction(
                thread?.otherName
                  ? `Viewing profile for ${thread.otherName}`
                  : 'Profile unavailable',
              )
            }
          >
            <Ionicons name="person-outline" size={20} color={colors.textPrimary} />
            <Text style={styles.settingText}>View Profile</Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.textTertiary}
              style={{ marginLeft: 'auto' }}
            />
          </Pressable>
          <View style={styles.settingDivider} />
          <Pressable
            style={styles.settingRow}
            testID="setting-report"
            onPress={() => settingsAction('User reported to LinQ safety team')}
          >
            <Ionicons name="flag-outline" size={20} color={colors.error} />
            <Text style={[styles.settingText, { color: colors.error }]}>
              Report User
            </Text>
          </Pressable>
          <Pressable
            style={styles.settingRow}
            testID="setting-block"
            onPress={() => settingsAction('User blocked', true)}
          >
            <Ionicons name="ban-outline" size={20} color={colors.error} />
            <Text style={[styles.settingText, { color: colors.error }]}>
              Block User
            </Text>
          </Pressable>
          <Pressable
            style={styles.settingRow}
            testID="setting-delete"
            onPress={() => settingsAction('Conversation deleted', true)}
          >
            <Ionicons name="trash-outline" size={20} color={colors.error} />
            <Text style={[styles.settingText, { color: colors.error }]}>
              Delete Conversation
            </Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheet>

      {/* Post-ride Rating & Feedback Modal */}
      {thread?.rideId && thread?.otherUserId && user?.id ? (
        <RatingFeedbackModal
          visible={reviewModalVisible}
          rideId={thread.rideId}
          reviewerId={user.id}
          revieweeId={thread.otherUserId}
          revieweeName={thread.otherName || 'co-traveler'}
          onClose={() => setReviewModalVisible(false)}
          onSuccess={() => showToast('Thank you for rating your trip!')}
        />
      ) : null}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: 6,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginLeft: spacing.xs,
    backgroundColor: colors.surfaceSecondary,
  },
  name: { fontSize: font.size.base, color: colors.primary, fontWeight: font.weight.medium },
  status: { fontSize: font.size.xs, color: colors.textSecondary },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  activeRide: {
    backgroundColor: colors.surfaceTertiary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  rideBadge: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  rideBadgeText: {
    fontSize: 9,
    color: colors.primary,
    fontWeight: font.weight.medium,
    letterSpacing: 0.5,
  },
  statusPill: {
    backgroundColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  statusInProgress: {
    backgroundColor: '#FEF3C7',
  },
  statusCompleted: {
    backgroundColor: '#DCFCE7',
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: font.weight.bold,
    color: colors.textPrimary,
  },
  rideRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: 2,
  },
  rdot: { width: 8, height: 8, borderRadius: 4 },
  rideLoc: { fontSize: font.size.sm, color: colors.textPrimary, flex: 1 },

  journeyCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  journeyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  journeyTitle: {
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
    color: colors.textPrimary,
  },
  journeyActions: {
    marginTop: spacing.xs,
  },
  lifecycleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  startJourneyBtn: {
    backgroundColor: colors.primary,
  },
  completeRideBtn: {
    backgroundColor: '#16A34A',
  },
  rateBtn: {
    backgroundColor: '#F59E0B',
  },
  lifecycleBtnText: {
    color: colors.textInverse,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
  },
  passengerStatusText: {
    fontSize: font.size.xs,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },

  connectionCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  connectionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  connectionCardTitle: {
    fontSize: font.size.sm,
    fontWeight: font.weight.bold,
    color: '#92400E',
  },
  connectionCardDesc: {
    fontSize: font.size.xs,
    color: '#78350F',
    lineHeight: 16,
    marginBottom: spacing.sm,
  },
  connectionActions: {
    flexDirection: 'row',
  },
  unlockBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 9,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  unlockBtnText: {
    color: colors.textInverse,
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
  },
  btnDisabled: {
    opacity: 0.6,
  },

  unlockedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    gap: 6,
  },
  unlockedText: {
    fontSize: font.size.xs,
    color: '#166534',
    flex: 1,
  },
  unlockedPhone: {
    fontWeight: font.weight.bold,
  },
  quickCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickCallText: {
    fontSize: 11,
    color: colors.primary,
    fontWeight: font.weight.medium,
  },
  quickWaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DCF8C6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  quickWaText: {
    fontSize: 11,
    color: '#15803D',
    fontWeight: font.weight.medium,
  },

  bubbleWrap: { marginBottom: spacing.sm, maxWidth: '80%' },
  bubbleLeft: { alignSelf: 'flex-start' },
  bubbleRight: { alignSelf: 'flex-end' },
  bubble: { borderRadius: radius.lg, padding: spacing.md },
  bubbleMine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: colors.surfaceSecondary, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: font.size.base, color: colors.textPrimary, lineHeight: 20 },
  bubbleTime: { fontSize: 10, color: colors.textTertiary, alignSelf: 'flex-end', marginTop: 4 },
  systemText: {
    fontSize: font.size.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginVertical: spacing.md,
  },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    minHeight: 44,
    maxHeight: 110,
    color: colors.textPrimary,
    fontSize: font.size.base,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sheet: { flex: 1, paddingHorizontal: spacing.xl },
  sheetProfile: {
    alignItems: 'center',
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    marginBottom: spacing.sm,
  },
  sheetAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceSecondary,
  },
  sheetName: {
    fontSize: font.size.lg,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
    marginTop: spacing.sm,
  },
  sheetSub: {
    fontSize: font.size.xs,
    color: colors.textTertiary,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, height: 52 },
  settingText: {
    fontSize: font.size.base,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
  },
  settingDivider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.sm },
});
