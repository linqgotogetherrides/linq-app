import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, font, radius, shadow, spacing } from '@/src/theme/tokens';
import { rideService } from '@/src/services/rideService';

interface Props {
  visible: boolean;
  rideId: string;
  reviewerId: string;
  revieweeId: string;
  revieweeName?: string;
  onClose: () => void;
  onSuccess?: (newRating?: number) => void;
}

const FEEDBACK_TAGS = [
  'Punctual',
  'Polite & Friendly',
  'Safe Driving',
  'Clean Vehicle',
  'Great Conversation',
  'Smooth Route',
];

export default function RatingFeedbackModal({
  visible,
  rideId,
  reviewerId,
  revieweeId,
  revieweeName = 'co-traveler',
  onClose,
  onSuccess,
}: Props) {
  const [rating, setRating] = useState<number>(5);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags((prev) => prev.filter((t) => t !== tag));
    } else {
      setSelectedTags((prev) => [...prev, tag]);
    }
  };

  const handleSubmit = async () => {
    if (rating < 1 || rating > 5) return;
    setSubmitting(true);
    setError(null);
    try {
      const combinedFeedback = [
        selectedTags.length > 0 ? `Tags: ${selectedTags.join(', ')}` : null,
        comment.trim() ? comment.trim() : null,
      ]
        .filter(Boolean)
        .join(' — ');

      const res = await rideService.submitReview({
        rideId,
        reviewerId,
        revieweeId,
        rating,
        feedback: combinedFeedback || undefined,
      });

      if (!res.ok) {
        throw new Error(res.error || 'Failed to submit review');
      }

      onSuccess?.(res.newAverage);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit review');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={submitting ? undefined : onClose} />
      <View style={styles.center} pointerEvents="box-none">
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="star" size={24} color="#F59E0B" />
            </View>
            <Text style={styles.title}>Rate your experience</Text>
            <Text style={styles.subtitle}>
              How was your journey with <Text style={styles.bold}>{revieweeName}</Text>?
            </Text>
          </View>

          {/* Star selector */}
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Pressable
                key={star}
                onPress={() => setRating(star)}
                style={({ pressed }) => [styles.starBtn, pressed && styles.starPressed]}
                hitSlop={8}
                testID={`star-${star}`}
              >
                <Ionicons
                  name={star <= rating ? 'star' : 'star-outline'}
                  size={36}
                  color="#F59E0B"
                />
              </Pressable>
            ))}
          </View>

          {/* Tag Chips */}
          <Text style={styles.sectionLabel}>What went well?</Text>
          <View style={styles.tagsContainer}>
            {FEEDBACK_TAGS.map((tag) => {
              const isSelected = selectedTags.includes(tag);
              return (
                <Pressable
                  key={tag}
                  onPress={() => toggleTag(tag)}
                  style={[styles.tagChip, isSelected && styles.tagChipSelected]}
                >
                  <Text
                    style={[styles.tagText, isSelected && styles.tagTextSelected]}
                  >
                    {tag}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Optional comment text */}
          <TextInput
            style={styles.textInput}
            placeholder="Write a quick note (optional)..."
            placeholderTextColor={colors.textTertiary}
            multiline
            numberOfLines={3}
            maxLength={250}
            value={comment}
            onChangeText={setComment}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [styles.skipBtn, pressed && styles.pressed]}
              onPress={onClose}
              disabled={submitting}
            >
              <Text style={styles.skipBtnText}>Skip</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.submitBtn,
                pressed && styles.pressed,
                submitting && styles.btnDisabled,
              ]}
              onPress={handleSubmit}
              disabled={submitting}
              testID="submit-review-btn"
            >
              {submitting ? (
                <ActivityIndicator color={colors.textInverse} size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Submit Rating</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.md,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: font.size.lg,
    fontWeight: font.weight.bold,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  subtitle: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  bold: {
    fontWeight: font.weight.semibold,
    color: colors.textPrimary,
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginVertical: spacing.md,
  },
  starBtn: {
    padding: 4,
  },
  starPressed: {
    transform: [{ scale: 1.15 }],
  },
  sectionLabel: {
    fontSize: font.size.xs,
    fontWeight: font.weight.semibold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.xs,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.md,
  },
  tagChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tagChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryLight,
  },
  tagText: {
    fontSize: font.size.xs,
    color: colors.textSecondary,
    fontWeight: font.weight.medium,
  },
  tagTextSelected: {
    color: colors.primary,
    fontWeight: font.weight.semibold,
  },
  textInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.sm,
    fontSize: font.size.sm,
    color: colors.textPrimary,
    backgroundColor: colors.background,
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: font.size.xs,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  skipBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.md,
  },
  skipBtnText: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
    fontWeight: font.weight.medium,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    minWidth: 120,
    alignItems: 'center',
  },
  submitBtnText: {
    color: colors.textInverse,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  pressed: {
    opacity: 0.8,
  },
});
