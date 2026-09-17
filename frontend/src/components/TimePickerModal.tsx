import React, { useState, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, font, radius, shadow } from '@/src/theme/tokens';

interface Props {
  visible: boolean;
  title?: string;
  value?: string;
  onClose: () => void;
  onSelect: (time: string) => void;
}

const HOURS = ['01','02','03','04','05','06','07','08','09','10','11','12'];
const MINUTES = ['00','15','30','45'];

export default function TimePickerModal({ visible, title = 'Select time', value = '08:00 AM', onClose, onSelect }: Props) {
  const [selectedHour, setSelectedHour] = useState('08');
  const [selectedMinute, setSelectedMinute] = useState('00');
  const [selectedMeridiem, setSelectedMeridiem] = useState('AM');

  useEffect(() => {
    if (value) {
      const parts = value.split(' ');
      if (parts.length === 2) {
        const timeParts = parts[0].split(':');
        if (timeParts.length === 2) {
          setSelectedHour(timeParts[0]);
          setSelectedMinute(timeParts[1]);
        }
        setSelectedMeridiem(parts[1]);
      }
    }
  }, [value, visible]);

  const handleConfirm = () => {
    onSelect(`${selectedHour}:${selectedMinute} ${selectedMeridiem}`);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12}><Ionicons name="close" size={22} color={colors.textPrimary} /></Pressable>
        </View>

        <View style={styles.container}>
          <View style={styles.timeDisplay}>
             <Text style={styles.timeDisplayText}>{selectedHour}:{selectedMinute} {selectedMeridiem}</Text>
          </View>

          <Text style={styles.sectionTitle}>Hour</Text>
          <View style={styles.grid}>
            {HOURS.map(h => (
              <Pressable key={h} style={[styles.gridCell, selectedHour === h && styles.gridCellActive]} onPress={() => setSelectedHour(h)}>
                <Text style={[styles.gridCellText, selectedHour === h && styles.gridCellTextActive]}>{h}</Text>
              </Pressable>
            ))}
          </View>

          <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>Minute</Text>
              <View style={styles.rowGrid}>
                {MINUTES.map(m => (
                  <Pressable key={m} style={[styles.gridCell, selectedMinute === m && styles.gridCellActive, { flex: 1 }]} onPress={() => setSelectedMinute(m)}>
                    <Text style={[styles.gridCellText, selectedMinute === m && styles.gridCellTextActive]}>{m}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={{ width: 100 }}>
              <Text style={styles.sectionTitle}>AM/PM</Text>
              <View style={styles.rowGrid}>
                {['AM','PM'].map(mer => (
                  <Pressable key={mer} style={[styles.gridCell, selectedMeridiem === mer && styles.gridCellActive, { flex: 1 }]} onPress={() => setSelectedMeridiem(mer)}>
                    <Text style={[styles.gridCellText, selectedMeridiem === mer && styles.gridCellTextActive]}>{mer}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          <Pressable style={styles.confirmBtn} onPress={handleConfirm}>
            <Text style={styles.confirmText}>Confirm Time</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius['2xl'], borderTopRightRadius: radius['2xl'], paddingBottom: spacing['2xl'], ...shadow.lg },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  title: { fontSize: font.size.lg, color: colors.textPrimary, fontWeight: font.weight.medium },
  
  container: { paddingHorizontal: spacing.xl },
  timeDisplay: { alignItems: 'center', marginBottom: spacing.md },
  timeDisplayText: { fontSize: 32, fontWeight: 'bold', color: colors.primary },
  
  sectionTitle: { fontSize: font.size.sm, color: colors.textSecondary, marginBottom: spacing.sm, fontWeight: font.weight.medium },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rowGrid: { flexDirection: 'row', gap: 8 },
  gridCell: { width: '15%', minWidth: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.surfaceSecondary, alignItems: 'center', justifyContent: 'center' },
  gridCellActive: { backgroundColor: colors.primary },
  gridCellText: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  gridCellTextActive: { color: colors.textInverse },

  confirmBtn: { backgroundColor: colors.primary, height: 48, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', marginTop: spacing.xl },
  confirmText: { color: colors.textInverse, fontSize: font.size.base, fontWeight: font.weight.medium }
});
