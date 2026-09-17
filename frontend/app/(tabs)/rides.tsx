import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import BottomSheet, { BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import EmptyState from '@/src/components/EmptyState';
import GuestPrompt from '@/src/components/GuestPrompt';
import PrimaryButton from '@/src/components/PrimaryButton';
import { useApp } from '@/src/context/AppContext';
import {
  incomingRequests, sentRequests, publishedPosts, draftPosts, upcomingRides,
  RideRequestItem, RidePost, UpcomingRide,
} from '@/src/mock/rideManagement';
import { colors, spacing, font, radius, shadow } from '@/src/theme/tokens';

type TopTab = 'requests' | 'posts' | 'upcoming';

export default function Rides() {
  const router = useRouter();
  const { user, showToast } = useApp();
  const [topTab, setTopTab] = useState<TopTab>('requests');
  const [reqSub, setReqSub] = useState<'incoming' | 'sent'>('incoming');
  const [postSub, setPostSub] = useState<'published' | 'drafts'>('published');
  const [rideKinds, setRideKinds] = useState<('daily' | 'planned')[]>([]);

  const toggleKind = (k: 'daily' | 'planned') => {
    setRideKinds((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]);
  };
  const [handled, setHandled] = useState<Record<string, 'accepted' | 'declined' | 'deleted'>>({});

  // Accept detail sheet
  const sheetRef = useRef<BottomSheet>(null);
  const [activeReq, setActiveReq] = useState<RideRequestItem | null>(null);
  const [seats, setSeats] = useState(1);
  const [confirmed, setConfirmed] = useState(false);

  const openAccept = (item: RideRequestItem) => {
    setActiveReq(item);
    setSeats(1);
    setConfirmed(false);
    sheetRef.current?.expand();
  };

  const lockIn = () => {
    if (!activeReq) return;
    setHandled((h) => ({ ...h, [activeReq.id]: 'accepted' }));
    setConfirmed(true);
    showToast(`Ride locked in with ${activeReq.user.name}`);
  };

  const goToChat = () => {
    sheetRef.current?.close();
    router.push({ pathname: '/chat/[id]', params: { id: 'c1', locked: '0' } });
  };

  const decline = (item: RideRequestItem) => {
    setHandled((h) => ({ ...h, [item.id]: 'declined' }));
    showToast('Request declined');
  };

  const remove = (item: RideRequestItem) => {
    setHandled((h) => ({ ...h, [item.id]: 'deleted' }));
    showToast('Request withdrawn');
  };

  const renderBackdrop = useCallback((props: any) => (
    <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
  ), []);

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']} testID="rides-screen">
        <View style={styles.headerTitleRow}>
          <Text style={styles.screenTitle}>Rides</Text>
        </View>
        <GuestPrompt 
          icon="car-outline" 
          title="Login to View Rides" 
          subtitle="See your incoming requests, active posts, and upcoming rides." 
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="rides-screen">
      <View style={styles.headerTitleRow}>
        <Text style={styles.screenTitle}>Rides</Text>
      </View>

      {/* Top tabs */}
      <View style={styles.topTabs}>
        {([['requests', 'Ride Requests'], ['posts', 'Ride posts'], ['upcoming', 'Upcoming']] as const).map(([key, label]) => (
          <Pressable key={key} testID={`ridetab-${key}`} onPress={() => setTopTab(key)} style={styles.topTab}>
            <Text style={[styles.topTabText, topTab === key && styles.topTabTextActive]} numberOfLines={1}>{label}</Text>
            <View style={[styles.topTabPill, topTab === key && styles.topTabPillActive]} />
          </Pressable>
        ))}
      </View>

      {/* Sub tabs */}
      {topTab === 'requests' && (
        <View style={styles.subTabs}>
          {(['incoming', 'sent'] as const).map((s) => (
            <Pressable key={s} testID={`req-sub-${s}`} onPress={() => setReqSub(s)} style={styles.subTab}>
              <Text style={[styles.subTabText, reqSub === s && styles.subTabTextActive]}>{s === 'incoming' ? 'Incoming' : 'Sent'}</Text>
              <View style={[styles.subUnderline, reqSub === s && styles.subUnderlineActive]} />
            </Pressable>
          ))}
        </View>
      )}
      {topTab === 'posts' && (
        <View style={styles.subTabs}>
          {(['published', 'drafts'] as const).map((s) => (
            <Pressable key={s} testID={`post-sub-${s}`} onPress={() => setPostSub(s)} style={styles.subTab}>
              <Text style={[styles.subTabText, postSub === s && styles.subTabTextActive]}>{s === 'published' ? 'Published' : 'Drafts'}</Text>
              <View style={[styles.subUnderline, postSub === s && styles.subUnderlineActive]} />
            </Pressable>
          ))}
        </View>
      )}

      {/* Daily / Planned filter */}
      <View style={styles.kindRow}>
        <Pressable testID="kind-daily" onPress={() => toggleKind('daily')} style={[styles.kindChip, rideKinds.includes('daily') && styles.kindChipActive]}>
          <Ionicons name="calendar-outline" size={16} color={rideKinds.includes('daily') ? colors.textInverse : colors.textSecondary} />
          <Text style={[styles.kindText, rideKinds.includes('daily') && styles.kindTextActive]}>Daily</Text>
        </Pressable>
        <Pressable testID="kind-planned" onPress={() => toggleKind('planned')} style={[styles.kindChip, rideKinds.includes('planned') && styles.kindChipActive]}>
          <Ionicons name="briefcase-outline" size={16} color={rideKinds.includes('planned') ? colors.textInverse : colors.textSecondary} />
          <Text style={[styles.kindText, rideKinds.includes('planned') && styles.kindTextActive]}>Planned</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 100, paddingTop: spacing.xs }} showsVerticalScrollIndicator={false}>
        {topTab === 'requests' && reqSub === 'incoming' && (
          <RequestList items={incomingRequests} kinds={rideKinds} handled={handled} variant="incoming" onAccept={openAccept} onDecline={decline} onRemove={remove} />
        )}
        {topTab === 'requests' && reqSub === 'sent' && (
          <RequestList items={sentRequests} kinds={rideKinds} handled={handled} variant="sent" onAccept={openAccept} onDecline={decline} onRemove={remove} />
        )}
        {topTab === 'posts' && postSub === 'published' && (
          <PostList items={publishedPosts} kinds={rideKinds} router={router} onSearch={() => router.push('/search-results')} showAnalytics />
        )}
        {topTab === 'posts' && postSub === 'drafts' && (
          <PostList items={draftPosts} kinds={rideKinds} router={router} onSearch={() => router.push('/create-ride')} isDraft />
        )}
        {topTab === 'upcoming' && (
          <UpcomingList items={upcomingRides} kinds={rideKinds} router={router} />
        )}
      </ScrollView>

      {/* Accept / Request Detail Sheet */}
      <BottomSheet ref={sheetRef} index={-1} snapPoints={['68%']} enablePanDownToClose backdropComponent={renderBackdrop} handleIndicatorStyle={{ backgroundColor: colors.border }}>
        <BottomSheetView style={styles.sheet}>
          {activeReq && (
            <>
              <Text style={styles.sheetTitle}>{confirmed ? 'Ride Confirmed' : 'Confirm Request'}</Text>
              <View style={styles.sheetProfile}>
                <View>
                  <Image source={{ uri: activeReq.user.avatarUrl }} style={styles.sheetAvatar} contentFit="cover" />
                  <View style={styles.onlineDot} />
                </View>
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={styles.sheetName}>{activeReq.user.name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                    <Ionicons name="star" size={12} color={colors.yellow} />
                    <Text style={styles.sheetMeta}>  {activeReq.user.rating} • {activeReq.user.trips} trips</Text>
                  </View>
                </View>
                <View style={styles.verifiedBadge}><Ionicons name="shield-checkmark" size={12} color={colors.success} /><Text style={styles.verifiedText}>Verified</Text></View>
              </View>

              <View style={styles.sheetRoute}>
                <View style={styles.routeLine}>
                  <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                  <View style={styles.vline} />
                  <View style={[styles.dot, { backgroundColor: colors.error, borderRadius: 2 }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.routeItem}><Text style={styles.routeText}>{activeReq.pickup}</Text><Text style={styles.time}>{activeReq.time}</Text></View>
                  <View style={styles.hDivider} />
                  <View style={styles.routeItem}><Text style={styles.routeText}>{activeReq.destination}</Text></View>
                </View>
              </View>

              {!confirmed ? (
                <>
                  <View style={styles.sheetRowBetween}>
                    <Text style={styles.sheetLabel}>Seats to confirm</Text>
                    <View style={styles.stepper}>
                      <Pressable testID="sheet-seats-minus" onPress={() => setSeats((s) => Math.max(1, s - 1))} style={styles.stepBtn}><Ionicons name="remove" size={16} color={colors.textPrimary} /></Pressable>
                      <Text style={styles.stepVal}>{seats}</Text>
                      <Pressable testID="sheet-seats-plus" onPress={() => setSeats((s) => Math.min(4, s + 1))} style={styles.stepBtn}><Ionicons name="add" size={16} color={colors.textPrimary} /></Pressable>
                    </View>
                  </View>
                  <View style={styles.sheetRowBetween}>
                    <Text style={styles.sheetLabel}>Total fare</Text>
                    <Text style={styles.totalFare}>₹{(activeReq.price * seats).toFixed(2)}</Text>
                  </View>
                  <View style={{ flex: 1 }} />
                  <PrimaryButton testID="sheet-lock-in" title="Confirm & Lock In" icon="checkmark-circle" onPress={lockIn} />
                </>
              ) : (
                <>
                  <View style={styles.confirmedBox}>
                    <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                    <Text style={styles.confirmedBoxText}>{seats} seat{seats > 1 ? 's' : ''} confirmed • ₹{(activeReq.price * seats).toFixed(2)} total</Text>
                  </View>
                  <Text style={styles.confirmedHint}>Coordinate pickup details with {activeReq.user.name} in chat.</Text>
                  <View style={{ flex: 1 }} />
                  <PrimaryButton testID="sheet-go-chat" title={`Message ${activeReq.user.name}`} icon="chatbubble-ellipses" onPress={goToChat} />
                  <View style={{ height: spacing.sm }} />
                  <PrimaryButton title="Done" variant="secondary" onPress={() => sheetRef.current?.close()} />
                </>
              )}
            </>
          )}
        </BottomSheetView>
      </BottomSheet>
    </SafeAreaView>
  );
}

function TagPill({ label, variant }: { label: string; variant?: 'exact' | 'default' }) {
  const bg = variant === 'exact' ? colors.primaryLight : colors.surfaceSecondary;
  const fg = variant === 'exact' ? colors.primary : colors.textSecondary;
  return <View style={[styles.tag, { backgroundColor: bg }]}><Text style={[styles.tagText, { color: fg }]}>{label}</Text></View>;
}

function TypeBadge({ type }: { type: 'daily' | 'planned' }) {
  return (
    <View style={[styles.typeBadge, { backgroundColor: type === 'daily' ? colors.warningLight : colors.infoLight }]}>
      <Text style={[styles.typeBadgeText, { color: type === 'daily' ? colors.warning : colors.info }]}>{type.toUpperCase()}</Text>
    </View>
  );
}

function RequestList({ items, kinds, handled, variant, onAccept, onDecline, onRemove }: {
  items: RideRequestItem[]; kinds: string[]; handled: Record<string, string>;
  variant: 'incoming' | 'sent'; onAccept: (i: RideRequestItem) => void; onDecline: (i: RideRequestItem) => void; onRemove: (i: RideRequestItem) => void;
}) {
  const activeItems = items.filter(i => handled[i.id] !== 'deleted');
  const filtered = kinds.length === 0 ? activeItems : activeItems.filter((i) => kinds.includes(i.type));
  if (filtered.length === 0) return <EmptyState icon="mail-outline" title={`No ${kinds.length > 0 ? kinds.join(' & ') : ''} ${variant} requests`} subtitle="New requests will appear here." />;

  return (
    <>
      {filtered.map((item) => {
        const state = handled[item.id];
        return (
          <View key={item.id} style={[styles.card, state && styles.cardHandled]}>
            <View style={styles.cardTop}>
              <View>
                <Image source={{ uri: item.user.avatarUrl }} style={styles.avatar} contentFit="cover" />
                <View style={styles.onlineDot} />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.name}>{item.user.name}</Text>
                  <TypeBadge type={item.type} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                  <Ionicons name="star" size={11} color={colors.yellow} />
                  <Text style={styles.meta}>  {item.user.rating} • {item.user.trips} trips</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.price}>₹{item.price.toFixed(2)}</Text>
                <Text style={styles.priceLabel}>PER SEAT</Text>
              </View>
            </View>

            <View style={styles.routeBox}>
              <View style={styles.routeLine}>
                <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                <View style={styles.vline} />
                <View style={[styles.dot, { backgroundColor: colors.error, borderRadius: 2 }]} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.routeItem}><Text style={styles.routeText}>{item.pickup}</Text><Text style={styles.time}>{item.time}</Text></View>
                <View style={[styles.routeItem, { marginTop: spacing.sm }]}><Text style={styles.routeText}>{item.destination}</Text><Text style={styles.note}>{item.note}</Text></View>
              </View>
            </View>

            <View style={styles.cardFooter}>
              <View style={styles.tags}>
                {item.exactRoute && <TagPill label="EXACT ROUTE" variant="exact" />}
                {item.vehicle && <TagPill label={item.vehicle.toUpperCase()} />}
              </View>
              {state ? (
                <Text style={[styles.stateText, { color: state === 'accepted' ? colors.success : colors.error }]}>{state === 'accepted' ? 'Accepted ✓' : state === 'declined' ? 'Declined' : 'Withdrawn'}</Text>
              ) : variant === 'incoming' ? (
                <View style={styles.actions}>
                  <Pressable testID={`decline-${item.id}`} onPress={() => onDecline(item)} hitSlop={8}><Text style={styles.decline}>Decline</Text></Pressable>
                  <Pressable testID={`accept-${item.id}`} onPress={() => onAccept(item)} style={styles.acceptBtn}>
                    <Text style={styles.acceptText}>Accept</Text><Ionicons name="arrow-forward" size={13} color={colors.primary} />
                  </Pressable>
                </View>
              ) : (
                <Pressable testID={`delete-${item.id}`} onPress={() => onRemove(item)} style={styles.deleteBtn}>
                  <Text style={styles.deleteText}>Delete</Text><Ionicons name="trash-outline" size={13} color={colors.error} />
                </Pressable>
              )}
            </View>
          </View>
        );
      })}
    </>
  );
}

function PostList({ items, kinds, router, onSearch, showAnalytics, isDraft }: {
  items: RidePost[]; kinds: string[]; router: any; onSearch: () => void; showAnalytics?: boolean; isDraft?: boolean;
}) {
  const filtered = kinds.length === 0 ? items : items.filter((i) => kinds.includes(i.type));
  if (filtered.length === 0) return <EmptyState icon="documents-outline" title={isDraft ? 'No drafts' : `No ${kinds.length > 0 ? kinds.join(' & ') : ''} posts`} subtitle={isDraft ? 'Saved drafts appear here.' : 'Rides you publish appear here.'} />;

  return (
    <>
      {filtered.map((item) => (
        <View key={item.id} style={styles.card}>
          <View style={styles.routeBox}>
            <View style={styles.routeLine}>
              <View style={[styles.dot, { backgroundColor: colors.primary }]} />
              <View style={styles.vline} />
              <View style={[styles.dot, { backgroundColor: colors.error, borderRadius: 2 }]} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.routeItem}><Text style={styles.routeText}>{item.pickup}</Text><Text style={styles.priceInline}>₹{item.price.toFixed(0)}/seat</Text></View>
              <View style={[styles.routeItem, { marginTop: spacing.sm }]}><Text style={styles.routeText}>{item.destination}</Text><Text style={styles.time}>{item.time}</Text></View>
            </View>
          </View>

          {showAnalytics && (
            <View style={styles.analytics}>
              <View style={styles.analyticItem}>
                <Ionicons name="eye-outline" size={15} color={colors.primary} />
                <Text style={styles.analyticVal}>{item.views}</Text>
                <Text style={styles.analyticLabel}>views</Text>
              </View>
              <View style={styles.analyticDivider} />
              <View style={styles.analyticItem}>
                <Ionicons name="paper-plane-outline" size={15} color={colors.warning} />
                <Text style={styles.analyticVal}>{item.requests}</Text>
                <Text style={styles.analyticLabel}>requests</Text>
              </View>
              <View style={styles.analyticDivider} />
              <View style={styles.analyticItem}>
                <Ionicons name="people-outline" size={15} color={colors.success} />
                <Text style={styles.analyticVal}>{item.seats}</Text>
                <Text style={styles.analyticLabel}>seats</Text>
              </View>
            </View>
          )}

          <View style={styles.cardFooter}>
            <View style={styles.tags}>
              {item.exactRoute && <TagPill label="EXACT ROUTE" variant="exact" />}
              {item.vehicle && <TagPill label={item.vehicle.toUpperCase()} />}
              {isDraft && <TagPill label="DRAFT" />}
            </View>
            <View style={styles.actions}>
              <Pressable testID={`edit-${item.id}`} onPress={() => router.push('/create-ride')}><Text style={styles.decline}>Edit</Text></Pressable>
              <Pressable testID={`search-${item.id}`} onPress={onSearch} style={styles.acceptBtn}>
                <Text style={styles.acceptText}>{isDraft ? 'Publish' : 'Search'}</Text><Ionicons name="arrow-forward" size={13} color={colors.primary} />
              </Pressable>
            </View>
          </View>
        </View>
      ))}
    </>
  );
}

function UpcomingList({ items, kinds, router }: { items: UpcomingRide[]; kinds: string[]; router: any }) {
  const filtered = kinds.length === 0 ? items : items.filter((i) => kinds.includes(i.type));
  if (filtered.length === 0) return <EmptyState icon="time-outline" title={`No upcoming ${kinds.length > 0 ? kinds.join(' & ') : ''} rides`} subtitle="Confirmed rides appear here." />;

  return (
    <>
      {filtered.map((item) => (
        <View key={item.id} style={styles.card}>
          <View style={styles.cardTop}>
            <Image source={{ uri: item.user.avatarUrl }} style={styles.avatar} contentFit="cover" />
            <View style={{ flex: 1, marginLeft: spacing.md }}>
              <Text style={styles.name}>{item.user.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                <Ionicons name="star" size={11} color={colors.yellow} />
                <Text style={styles.meta}>  {item.user.rating} • {item.vehicleModel}</Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.price}>₹{item.price.toFixed(2)}</Text>
              <Text style={styles.priceLabel}>PER SEAT</Text>
            </View>
          </View>

          <View style={styles.upcomingMeta}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="time-outline" size={16} color={colors.textSecondary} />
              <Text style={styles.upcomingTime}>{item.time}</Text>
            </View>
            <View style={styles.confirmedBadge}><Ionicons name="checkmark-circle" size={12} color={colors.success} /><Text style={styles.confirmedText}>Confirmed</Text></View>
          </View>

          <Text style={styles.route}><Text style={{ color: colors.textSecondary }}>Route: </Text>{item.route}</Text>

          <View style={styles.upcomingActions}>
            <Pressable testID={`chat-upcoming-${item.id}`} style={styles.chatIconBtn} onPress={() => router.push({ pathname: '/chat/[id]', params: { id: 'c1', locked: '0' } })}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.primary} />
            </Pressable>
            <Pressable testID={`view-details-${item.id}`} style={styles.viewBtn} onPress={() => router.push('/ride/r_1')}>
              <Text style={styles.viewBtnText}>View Details</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerTitleRow: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  screenTitle: { fontSize: font.size['2xl'], color: colors.textPrimary, fontWeight: font.weight.medium },
  topTabs: { flexDirection: 'row', paddingHorizontal: spacing.xl, gap: spacing.lg },
  topTab: { flex: 1, alignItems: 'center', paddingTop: spacing.sm },
  topTabText: { fontSize: font.size.sm, color: colors.textSecondary, fontWeight: font.weight.medium },
  topTabTextActive: { color: colors.primary },
  topTabPill: { height: 3, width: '60%', backgroundColor: 'transparent', borderRadius: 2, marginTop: 8 },
  topTabPillActive: { backgroundColor: colors.primary },

  subTabs: { flexDirection: 'row', paddingHorizontal: spacing.xl, gap: spacing.xl, borderBottomWidth: 1, borderBottomColor: colors.divider },
  subTab: { paddingTop: spacing.md },
  subTabText: { fontSize: font.size.sm, color: colors.textSecondary, fontWeight: font.weight.medium },
  subTabTextActive: { color: colors.primary },
  subUnderline: { height: 2, backgroundColor: 'transparent', marginTop: 8 },
  subUnderlineActive: { backgroundColor: colors.primary },

  kindRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  kindChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  kindChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  kindText: { fontSize: font.size.base, color: colors.textSecondary, fontWeight: font.weight.medium },
  kindTextActive: { color: colors.textInverse },

  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, ...shadow.sm },
  cardHandled: { opacity: 0.6 },
  cardTop: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceSecondary },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 12, height: 12, borderRadius: 6, backgroundColor: colors.success, borderWidth: 2, borderColor: colors.surface },
  name: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  meta: { fontSize: font.size.sm, color: colors.textSecondary },
  price: { fontSize: font.size.lg, color: colors.primary, fontWeight: font.weight.medium },
  priceLabel: { fontSize: 9, color: colors.textTertiary, letterSpacing: 0.5 },

  routeBox: { flexDirection: 'row', backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  routeLine: { alignItems: 'center', marginRight: spacing.md, paddingVertical: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  vline: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 4 },
  routeItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  routeText: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium, flex: 1 },
  time: { fontSize: font.size.sm, color: colors.textPrimary, fontWeight: font.weight.medium },
  note: { fontSize: font.size.xs, color: colors.textSecondary },
  priceInline: { fontSize: font.size.sm, color: colors.primary, fontWeight: font.weight.medium },

  analytics: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primaryLight + '60', borderRadius: radius.md, paddingVertical: spacing.sm, marginTop: spacing.md },
  analyticItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  analyticVal: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  analyticLabel: { fontSize: font.size.xs, color: colors.textSecondary },
  analyticDivider: { width: 1, height: 20, backgroundColor: colors.border },

  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  tags: { flexDirection: 'row', gap: 6, flex: 1, flexWrap: 'wrap' },
  tag: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  tagText: { fontSize: 9, fontWeight: font.weight.medium, letterSpacing: 0.5 },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeBadgeText: { fontSize: 8, fontWeight: font.weight.medium, letterSpacing: 0.5 },

  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  decline: { fontSize: font.size.sm, color: colors.textSecondary, fontWeight: font.weight.medium },
  acceptBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  acceptText: { fontSize: font.size.sm, color: colors.primary, fontWeight: font.weight.medium },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  deleteText: { fontSize: font.size.sm, color: colors.error, fontWeight: font.weight.medium },
  stateText: { fontSize: font.size.sm, fontWeight: font.weight.medium },

  upcomingMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  upcomingTime: { fontSize: font.size.sm, color: colors.textPrimary, fontWeight: font.weight.medium },
  confirmedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.successLight, paddingHorizontal: spacing.md, height: 26, borderRadius: radius.pill },
  confirmedText: { fontSize: font.size.xs, color: colors.success, fontWeight: font.weight.medium },
  route: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium, marginTop: spacing.md },
  upcomingActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  chatIconBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  viewBtn: { flex: 1, height: 44, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  viewBtnText: { fontSize: font.size.base, color: colors.primary, fontWeight: font.weight.medium },

  // Sheet
  sheet: { flex: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing['2xl'] },
  sheetTitle: { fontSize: font.size.xl, color: colors.textPrimary, fontWeight: font.weight.medium, marginBottom: spacing.lg },
  sheetProfile: { flexDirection: 'row', alignItems: 'center' },
  sheetAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.surfaceSecondary },
  sheetName: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium },
  sheetMeta: { fontSize: font.size.sm, color: colors.textSecondary },
  verifiedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.successLight, paddingHorizontal: spacing.md, height: 28, borderRadius: radius.pill },
  verifiedText: { fontSize: font.size.xs, color: colors.success, fontWeight: font.weight.medium },
  sheetRoute: { flexDirection: 'row', backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.lg },
  hDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  sheetRowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg },
  sheetLabel: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  totalFare: { fontSize: font.size.xl, color: colors.primary, fontWeight: font.weight.medium },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md, padding: spacing.xs },
  stepBtn: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  stepVal: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium, minWidth: 24, textAlign: 'center' },
  confirmedBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.successLight, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.lg },
  confirmedBoxText: { fontSize: font.size.base, color: colors.success, fontWeight: font.weight.medium, flex: 1 },
  confirmedHint: { fontSize: font.size.sm, color: colors.textSecondary, marginTop: spacing.md },
});
