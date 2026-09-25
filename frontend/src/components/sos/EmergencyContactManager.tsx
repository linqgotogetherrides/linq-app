import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { supabase } from '@/src/lib/supabase';
import { useApp } from '@/src/context/AppContext';
import { useSos } from '@/src/context/SosContext';
import { colors, font, radius, spacing } from '@/src/theme/tokens';

export type EmergencyContact = {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  relationship: string | null;
  is_primary: boolean;
  verified: boolean;
  created_at: string;
};

function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/**
 * Add / remove emergency contacts.
 *
 * Contacts live in the `emergency_contacts` table, which is what the SOS
 * activation path snapshots and alerts. The legacy single
 * `user_profiles.emergency_contact` field is left untouched for backwards
 * compatibility with older builds.
 *
 * The `verified` flag is deliberately NOT editable here: it can only be set by
 * the LinQ backend (a database trigger rejects client writes to it).
 */
export default function EmergencyContactManager({
  compact = false,
  onChanged,
}: {
  compact?: boolean;
  onChanged?: () => void;
}) {
  const { user, showToast } = useApp();
  const { refresh } = useSos();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [relationship, setRelationship] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('emergency_contacts')
        .select('*')
        .eq('user_id', user.id)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });

      if (error) throw error;
      setContacts((data ?? []) as EmergencyContact[]);
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not load emergency contacts.',
      );
    } finally {
      setLoading(false);
    }
  }, [showToast, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const addContact = async () => {
    if (!user?.id) return;

    const cleanName = name.trim();
    const cleanPhone = normalizePhone(phone);
    const cleanEmail = email.trim();

    if (!cleanName) {
      showToast('Enter a name for this contact.');
      return;
    }
    if (!cleanPhone && !isValidEmail(cleanEmail)) {
      showToast('Enter a valid phone number or email address.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('emergency_contacts').insert({
        user_id: user.id,
        name: cleanName,
        phone: cleanPhone,
        email: cleanPhone ? null : cleanEmail,
        relationship: relationship.trim() || null,
        is_primary: contacts.length === 0,
      });

      if (error) throw error;

      setName('');
      setPhone('');
      setEmail('');
      setRelationship('');
      setAdding(false);
      await load();
      await refresh();
      onChanged?.();
      showToast('Emergency contact added.');
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not save this contact.',
      );
    } finally {
      setSaving(false);
    }
  };

  const removeContact = async (id: string) => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('emergency_contacts')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;
      await load();
      await refresh();
      onChanged?.();
      showToast('Emergency contact removed.');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not remove this contact.');
    } finally {
      setSaving(false);
    }
  };

  if (loading && contacts.length === 0) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="emergency-contact-manager">
      {contacts.map((contact) => (
        <View key={contact.id} style={styles.row} testID={`contact-${contact.id}`}>
          <View style={styles.avatar}>
            <Ionicons
              name={contact.is_primary ? 'star' : 'person-outline'}
              size={16}
              color={contact.is_primary ? colors.primary : colors.textSecondary}
            />
          </View>
          <View style={styles.rowCopy}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{contact.name}</Text>
              {contact.verified ? (
                <View style={styles.verifiedPill}>
                  <Ionicons name="shield-checkmark" size={10} color={colors.success} />
                  <Text style={styles.verifiedText}>Verified</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.detail}>
              {[contact.relationship, contact.phone ?? contact.email].filter(Boolean).join(' • ')}
            </Text>
          </View>
          <Pressable
            hitSlop={10}
            testID={`remove-contact-${contact.id}`}
            onPress={() => void removeContact(contact.id)}
            disabled={saving}
          >
            <Ionicons name="trash-outline" size={18} color={colors.textTertiary} />
          </Pressable>
        </View>
      ))}

      {!compact || adding ? (
        adding ? (
          <View style={styles.form} testID="contact-form">
            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor={colors.textTertiary}
              value={name}
              onChangeText={setName}
              testID="contact-name-input"
            />
            <TextInput
              style={styles.input}
              placeholder="Phone number"
              placeholderTextColor={colors.textTertiary}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              testID="contact-phone-input"
            />
            <TextInput
              style={styles.input}
              placeholder="Email (optional)"
              placeholderTextColor={colors.textTertiary}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              testID="contact-email-input"
            />
            <TextInput
              style={styles.input}
              placeholder="Relationship (optional)"
              placeholderTextColor={colors.textTertiary}
              value={relationship}
              onChangeText={setRelationship}
              testID="contact-relationship-input"
            />
            <View style={styles.formActions}>
              <Pressable
                style={styles.secondaryAction}
                onPress={() => setAdding(false)}
                testID="contact-cancel"
              >
                <Text style={styles.secondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.primaryAction, saving && styles.actionDisabled]}
                onPress={() => void addContact()}
                disabled={saving}
                testID="contact-save"
              >
                {saving ? (
                  <ActivityIndicator size="small" color={colors.textInverse} />
                ) : (
                  <Text style={styles.primaryText}>Add contact</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            style={styles.addButton}
            onPress={() => setAdding(true)}
            testID="contact-add"
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
            <Text style={styles.addText}>Add emergency contact</Text>
          </Pressable>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm, marginTop: spacing.sm },
  loader: { paddingVertical: spacing.md, alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { fontSize: font.size.sm, color: colors.textPrimary, fontWeight: font.weight.medium },
  detail: { fontSize: font.size.xs, color: colors.textSecondary, marginTop: 2 },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.successLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
  },
  verifiedText: { fontSize: 9, color: colors.success, fontWeight: font.weight.medium },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  addText: { fontSize: font.size.sm, color: colors.primary, fontWeight: font.weight.medium },
  form: { gap: spacing.sm, marginTop: spacing.xs },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    height: 44,
    fontSize: font.size.sm,
    color: colors.textPrimary,
  },
  formActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  secondaryAction: {
    flex: 1,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { fontSize: font.size.sm, color: colors.textSecondary, fontWeight: font.weight.medium },
  primaryAction: {
    flex: 1,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { fontSize: font.size.sm, color: colors.textInverse, fontWeight: font.weight.medium },
  actionDisabled: { opacity: 0.6 },
});
