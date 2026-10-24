import React from 'react';
import { View, StyleSheet, Modal, Pressable, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '@/src/theme/tokens';

interface Props {
  visible: boolean;
  url: string;
  /** The rider dismissed the form. Says nothing about the outcome. */
  onClose: () => void;
}

/**
 * Hosts the Cashfree form and nothing else.
 *
 * This component used to take an `onSuccess` callback and fire it from
 * onNavigationStateChange whenever the URL contained "verification-success":
 *
 *     if (navState.url.includes('verification-success')) onSuccess();
 *
 * That was wrong three times over. No return_url was ever configured on the
 * Cashfree side, so the match was against a string nobody had defined. The
 * rider controlled the URL, so any page that looked right would have triggered
 * it. And it wrote a verified status to the database from the client.
 *
 * There is now deliberately NO navigation handler here. Closing the form is not
 * an outcome: the parent re-reads authoritative status from the kyc-status
 * endpoint, which only reflects a signed Cashfree webhook.
 */
export default function VerificationWebView({ visible, url, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} style={styles.closeBtn} testID="kyc-form-close">
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
        </View>

        {!url ? (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <WebView source={{ uri: url }} style={styles.webview} startInLoadingState={true} />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeBtn: {
    padding: spacing.sm,
  },
  webview: {
    flex: 1,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});