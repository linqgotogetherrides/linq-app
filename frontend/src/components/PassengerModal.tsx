import React, { useState, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PrimaryButton from '@/src/components/PrimaryButton';
import { colors, spacing, font, radius, shadow } from '@/src/theme/tokens';

export interface PassengerData {
  name: string;
  age: string;
  phone: string;
}

interface Props {
  visible: boolean;
  initial?: PassengerData;
  onClose: () => void;
  onSave: (p: PassengerData) => void;
}

export default function PassengerModal({ visible, initial, onClose, onSave }: Props) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (visible) {
      setName(initial?.name ?? '');
      setAge(initial?.age ?? '');
      setPhone(initial?.phone ?? '');
    }
  }, [visible, initial]);

  const valid = name.trim().length > 1;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>{initial ? 'Edit Passenger' : 'Add Passenger'}</Text>
            <Pressable onPress={onClose} hitSlop={12}><Ionicons name="close" size={22} color={colors.textPrimary} /></Pressable>
          </View>

          <Text style={styles.label}>Full Name</Text>
          <View style={styles.input}>
            <Ionicons name="person-outline" size={16} color={colors.textSecondary} />
            <TextInput testID="passenger-name" value={name} onChangeText={setName} placeholder="Passenger name" placeholderTextColor={colors.textTertiary} style={styles.inputText} />
          </View>

          <Text style={styles.label}>Age</Text>
          <View style={styles.input}>
            <Ionicons name="calendar-outline" size={16} color={colors.textSecondary} />
            <TextInput testID="passenger-age" value={age} onChangeText={setAge} keyboardType="number-pad" placeholder="Age" placeholderTextColor={colors.textTertiary} style={styles.inputText} />
          </View>

          <Text style={styles.label}>Phone Number</Text>
          <View style={styles.input}>
            <Ionicons name="call-outline" size={16} color={colors.textSecondary} />
            <TextInput testID="passenger-phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+91 …" placeholderTextColor={colors.textTertiary} style={styles.inputText} />
          </View>

          <View style={{ marginTop: spacing.lg }}>
            <PrimaryButton testID="passenger-save" title={initial ? 'Update Passenger' : 'Add Passenger'} disabled={!valid} onPress={() => onSave({ name: name.trim(), age, phone })} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], padding: spacing.xl, paddingBottom: spacing['3xl'], ...shadow.lg },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  title: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium },
  label: { fontSize: font.size.sm, color: colors.textSecondary, marginBottom: spacing.sm, marginTop: spacing.md },
  input: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, height: 48, paddingHorizontal: spacing.md },
  inputText: { flex: 1, color: colors.textPrimary, fontSize: font.size.base },
});
