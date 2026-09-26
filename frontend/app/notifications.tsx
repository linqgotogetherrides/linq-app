import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import EmptyState from '@/src/components/EmptyState';
import GuestPrompt from '@/src/components/GuestPrompt';
import LinqHeader from '@/src/components/LinqHeader';
import { useApp } from '@/src/context/AppContext';
import { Notification, RideRequest } from '@/src/types';
import { colors, font, radius, shadow, spacing } from '@/src/theme/tokens';

function relativeTime(value?: string): string {
  if (!value) return '';
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

function notificationAppearance(type: Notification['type']) {
  if (type === 'accepted') {
    return { icon: 'checkmark-circle' as const, color: colors.success, background: colors.successLight };
  }
  if (type === 'declined') {
    return { icon: 'close-circle' as const, color: colors.error, background: colors.errorLight };
  }
  if (type === 'request') {
    return { icon: 'person-add' as const, color: colors.primary, background: colors.primaryLight };
  }
  if (type === 'closed') {
    return { icon: 'time' as const, color: colors.textSecondary, background: colors.surfaceSecondary };
  }
  return { icon: 'notifications' as const, color: colors.primary, background: colors.primaryLight };
}

export default function Notifications() {
  const {
    user,
    rideRequests,
    rideNotifications,
    isLoadingRideActivity,
    respondToRideRequest,
    refreshRideActivity,
  } = useApp();
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refreshRideActivity();
    }, [refreshRideActivity])
  );

  const pendingRequests = useMemo(
    () => rideRequests.filter((request) => request.status === 'pending'),
    [rideRequests]
  );

  const recentNotifications = useMemo(() => {
    const pendingIds = new Set(pendingRequests.map((request) => request.id));
    return rideNotifications.filter(
      (notification) =>
        !(notification.type === 'request' && notification.requestId && pendingIds.has(notification.requestId))
    );
  }, [pendingRequests, rideNotifications]);

  const respond = async (requestId: string, decision: 'accepted' | 'declined') => {
    setBusyRequestId(requestId);
    await respondToRideRequest(requestId, decision);
    setBusyRequestId(null);
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container} edges={['top']} testID="notifications-screen">
        <LinqHeader title="Notifications" />
        <GuestPrompt
          icon="notifications-outline"
          title="Login to View Notifications"
          subtitle="Respond to riders who want to join your posted rides."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']} testID="notifications-screen">
      <LinqHeader
        title="Notifications"
        right={pendingRequests.length > 0 ? (
          <View style={styles.countBadge} testID="notifications-pending-count">
            <Text style={styles.countText}>{pendingRequests.length}</Text>
          </View>
        ) : undefined}
      />

      {isLoadingRideActivity && !rideRequests.length && !recentNotifications.length ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Checking for ride requests…</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {pendingRequests.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Ride requests</Text>
                <Text style={styles.sectionMeta}>Action needed</Text>
              </View>
              {pendingRequests.map((request) => (
                <RequestActionCard
                  key={request.id}
                  request={request}
                  busy={busyRequestId === request.id}
                  onAccept={() => void respond(request.id, 'accepted')}
                  onDecline={() => void respond(request.id, 'declined')}
                />
              ))}
            </View>
          ) : null}

          {recentNotifications.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Recent</Text>
              </View>
              {recentNotifications.map((notification) => {
                const appearance = notificationAppearance(notification.type);
                return (
                  <View
                    key={notification.id}
                    testID={`notif-${notification.id}`}
                    style={[styles.notificationRow, !notification.read && styles.notificationRowUnread]}
                  >
                    <View style={[styles.notificationIcon, { backgroundColor: appearance.background }]}>
                      <Ionicons name={appearance.icon} size={20} color={appearance.color} />
                    </View>
                    <View style={styles.notificationCopy}>
                      <Text style={styles.notificationTitle}>{notification.title}</Text>
                      <Text style={styles.notificationBody}>{notification.body}</Text>
                      <Text style={styles.notificationTime}>
                        {relativeTime(notification.createdAt ?? notification.time)}
                      </Text>
                    </View>
                    {!notification.read ? <View style={styles.unreadDot} /> : null}
                  </View>
                );
              })}
            </View>
          ) : null}

          {pendingRequests.length === 0 && recentNotifications.length === 0 ? (
            <EmptyState
              icon="notifications-outline"
              title="No notifications"
              subtitle="Ride requests that need your attention will appear here."
            />
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function RequestActionCard({
  request,
  busy,
  onAccept,
  onDecline,
}: {
  request: RideRequest;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  if (!request.ride) return null;
  const requester = request.requester;

  return (
    <View style={styles.requestCard} testID={`ride-request-${request.id}`}>
      <View style={styles.requestHeader}>
        {requester.avatarUrl ? (
          <Image
            source={{ uri: requester.avatarUrl }}
            style={styles.avatar}
            contentFit="cover"
          />
        ) : (
          <View style={styles.avatarFallback}>
            <Ionicons name="person" size={22} color={colors.primary} />
          </View>
        )}
        <View style={styles.requestHeaderCopy}>
          <Text style={styles.requestTitle} numberOfLines={2}>
            {requester.name} requested to join your ride
          </Text>
          <Text style={styles.requestTime}>{relativeTime(request.createdAt)}</Text>
        </View>
      </View>

      <View style={styles.routeBox}>
        <View style={styles.routeRail}>
          <View style={[styles.routeDot, { backgroundColor: colors.primary }]} />
          <View style={styles.routeLine} />
          <View style={[styles.routeDot, { backgroundColor: colors.error, borderRadius: 2 }]} />
        </View>
        <View style={styles.routeCopy}>
          <Text style={styles.routeText} numberOfLines={1}>{request.ride.pickup.label}</Text>
          <Text style={styles.routeText} numberOfLines={1}>{request.ride.destination.label}</Text>
        </View>
      </View>

      <View style={styles.requestMeta}>
        <View style={styles.metaItem}>
          <Ionicons name="time-outline" size={15} color={colors.textSecondary} />
          <Text style={styles.metaText}>{request.ride.time ?? 'No time set'}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="car-outline" size={15} color={colors.textSecondary} />
          <Text style={styles.metaText}>{request.ride.type === 'planned' ? 'Planned' : 'Daily'}</Text>
        </View>
        {request.ride.pricePerSeat > 0 ? (
          <Text style={styles.requestPrice}>₹{request.ride.pricePerSeat.toFixed(0)}/seat</Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Pressable
          testID={`notification-decline-${request.id}`}
          disabled={busy}
          onPress={onDecline}
          style={({ pressed }) => [styles.declineButton, pressed && styles.pressed]}
        >
          <Text style={styles.declineText}>Decline</Text>
        </Pressable>
        <Pressable
          testID={`notification-accept-${request.id}`}
          disabled={busy}
          onPress={onAccept}
          style={({ pressed }) => [styles.acceptButton, pressed && styles.pressed]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.textInverse} />
          ) : (
            <Text style={styles.acceptText}>Accept</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  countBadge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: font.size.xs,
    color: colors.textInverse,
    fontWeight: font.weight.medium,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: 100,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing['4xl'],
    gap: spacing.md,
  },
  loadingText: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
  },
  section: { marginBottom: spacing.xl },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: font.size.lg,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
  },
  sectionMeta: {
    fontSize: font.size.xs,
    color: colors.error,
  },
  requestCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surfaceSecondary,
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestHeaderCopy: { flex: 1, marginLeft: spacing.md },
  requestTitle: {
    fontSize: font.size.base,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
    lineHeight: 20,
  },
  requestTime: {
    fontSize: font.size.xs,
    color: colors.textTertiary,
    marginTop: 3,
  },
  routeBox: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  routeRail: {
    alignItems: 'center',
    marginRight: spacing.md,
    paddingVertical: 5,
  },
  routeDot: { width: 8, height: 8, borderRadius: 4 },
  routeLine: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  routeCopy: { flex: 1, gap: spacing.md },
  routeText: {
    fontSize: font.size.base,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
  },
  requestMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: font.size.xs,
    color: colors.textSecondary,
  },
  requestPrice: {
    marginLeft: 'auto',
    fontSize: font.size.sm,
    color: colors.primary,
    fontWeight: font.weight.medium,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  declineButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: {
    fontSize: font.size.base,
    color: colors.textSecondary,
    fontWeight: font.weight.medium,
  },
  acceptButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: {
    fontSize: font.size.base,
    color: colors.textInverse,
    fontWeight: font.weight.medium,
  },
  pressed: { opacity: 0.82 },
  notificationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  notificationRowUnread: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primaryMuted,
  },
  notificationIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationCopy: { flex: 1 },
  notificationTitle: {
    fontSize: font.size.base,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
  },
  notificationBody: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  notificationTime: {
    fontSize: font.size.xs,
    color: colors.textTertiary,
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginTop: 6,
  },
});
