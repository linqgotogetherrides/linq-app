import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import PrimaryButton from '@/src/components/PrimaryButton';
import type { SosEvidenceReport } from '@/src/hooks/useSosEvidence';
import type { SosProfile } from '@/src/services/sos/sosProfile';
import { colors, font, radius, spacing } from '@/src/theme/tokens';

type Tone = 'ok' | 'warn' | 'fail';

type Props = {
  report: SosEvidenceReport;
  profile: SosProfile;
  onDone: () => void;
};

export default function SosStatusScreen({ report, profile, onDone }: Props) {
  const whatsappTone: Tone = report.whatsapp.opened ? 'ok' : 'fail';
  const uploadTone: Tone = report.upload.ok ? 'ok' : 'warn';
  const photoTone: Tone = report.photos.captured > 0 ? 'ok' : 'warn';
  const videoTone: Tone = report.video.uploaded
    ? 'ok'
    : report.video.captured
      ? 'warn'
      : 'warn';
  const audioTone: Tone = report.audio.captured ? 'ok' : 'warn';
  const locationTone: Tone = report.location.captured ? 'ok' : 'warn';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']} testID="sos-status-screen">
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, report.whatsapp.opened ? styles.heroOk : styles.heroWarn]}>
          <View style={styles.heroIcon}>
            <Ionicons
              name={report.whatsapp.opened ? 'checkmark' : 'alert'}
              size={32}
              color="#FFFFFF"
            />
          </View>
          <Text style={styles.heroTitle}>
            {report.whatsapp.opened ? 'SOS alert ready' : 'SOS finished with issues'}
          </Text>
          <Text style={styles.heroBody}>
            {report.whatsapp.opened
              ? `WhatsApp opened for ${profile.contactName}. Press Send to deliver the alert.`
              : 'WhatsApp could not be opened automatically. Call your contact or emergency services now.'}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>What happened</Text>
          <StatusRow
            icon="images-outline"
            label="Photos"
            detail={report.photos.detail}
            tone={photoTone}
          />
          <StatusRow
            icon="videocam-outline"
            label="Video"
            detail={report.video.detail}
            tone={videoTone}
          />
          <StatusRow
            icon="mic-outline"
            label="Audio"
            detail={report.audio.detail}
            tone={audioTone}
          />
          <StatusRow
            icon="location-outline"
            label="Location"
            detail={report.location.detail}
            tone={locationTone}
          />
          <StatusRow
            icon="cloud-upload-outline"
            label="Server backup"
            detail={report.upload.detail}
            tone={uploadTone}
          />
          <StatusRow
            icon="logo-whatsapp"
            label="WhatsApp"
            detail={report.whatsapp.detail}
            tone={whatsappTone}
          />
        </View>

        {report.localFolder ? (
          <View style={styles.folderCard}>
            <Text style={styles.folderTitle}>Saved on this device</Text>
            <Text style={styles.folderPath} selectable>
              {report.localFolder}
            </Text>
            <Text style={styles.folderHint}>
              Photos, video, audio and location.json are in this folder.
            </Text>
          </View>
        ) : null}

        <View style={styles.sosIdRow}>
          <Text style={styles.sosIdLabel}>SOS reference</Text>
          <Text style={styles.sosId} selectable>
            {report.sosId}
          </Text>
        </View>

        <Text style={styles.emergencyNote}>
          If you are still in danger, call 112 or your local emergency number.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton title="Done" size="lg" onPress={onDone} testID="sos-done-button" />
      </View>
    </SafeAreaView>
  );
}

function StatusRow({
  icon,
  label,
  detail,
  tone,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  tone: Tone;
}) {
  const color =
    tone === 'ok' ? colors.success : tone === 'warn' ? colors.warning : colors.error;
  const background =
    tone === 'ok'
      ? colors.successLight
      : tone === 'warn'
        ? colors.warningLight
        : colors.errorLight;
  const statusIcon =
    tone === 'ok' ? 'checkmark-circle' : tone === 'warn' ? 'alert-circle' : 'close-circle';

  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: background }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      <Ionicons name={statusIcon} size={20} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surfaceSecondary,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing['3xl'],
    gap: spacing.lg,
  },
  hero: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroOk: {
    backgroundColor: colors.primary,
  },
  heroWarn: {
    backgroundColor: colors.error,
  },
  heroIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: font.size['2xl'],
    fontWeight: font.weight.bold,
    textAlign: 'center',
  },
  heroBody: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: font.size.base,
    lineHeight: 20,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: font.size.lg,
    fontWeight: font.weight.medium,
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
  },
  rowLabel: {
    color: colors.textPrimary,
    fontSize: font.size.base,
    fontWeight: font.weight.medium,
  },
  rowDetail: {
    color: colors.textSecondary,
    fontSize: font.size.sm,
    lineHeight: 17,
    marginTop: 1,
  },
  folderCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  folderTitle: {
    color: colors.textPrimary,
    fontSize: font.size.base,
    fontWeight: font.weight.medium,
  },
  folderPath: {
    color: colors.primary,
    fontSize: font.size.xs,
    marginTop: spacing.xs,
    lineHeight: 16,
  },
  folderHint: {
    color: colors.textTertiary,
    fontSize: font.size.xs,
    marginTop: spacing.xs,
  },
  sosIdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sosIdLabel: {
    color: colors.textSecondary,
    fontSize: font.size.sm,
  },
  sosId: {
    color: colors.textPrimary,
    fontSize: font.size.xs,
    fontWeight: font.weight.medium,
  },
  emergencyNote: {
    color: colors.textTertiary,
    fontSize: font.size.sm,
    textAlign: 'center',
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
