import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, font, radius, shadow } from '@/src/theme/tokens';
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay } from 'date-fns';

interface Props {
  visible: boolean;
  title?: string;
  value?: string;
  onClose: () => void;
  onSelect: (date: string) => void;
}

export default function DatePickerModal({ visible, title = 'Select date', value, onClose, onSelect }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const handleSelect = (date: Date) => {
    // Format to string as expected by the caller (e.g. "Thu, 17 Aug" or similar)
    const label = isSameDay(date, new Date()) ? `Today, ${format(date, 'd MMM')}` : format(date, 'EEE, d MMM');
    onSelect(label);
    onClose();
  };

  const weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={12}><Ionicons name="close" size={22} color={colors.textPrimary} /></Pressable>
        </View>

        <View style={styles.calendarContainer}>
          <View style={styles.monthHeader}>
            <Pressable onPress={handlePrevMonth} style={styles.monthNav}><Ionicons name="chevron-back" size={20} color={colors.textPrimary} /></Pressable>
            <Text style={styles.monthText}>{format(currentMonth, 'MMMM yyyy')}</Text>
            <Pressable onPress={handleNextMonth} style={styles.monthNav}><Ionicons name="chevron-forward" size={20} color={colors.textPrimary} /></Pressable>
          </View>

          <View style={styles.weekRow}>
            {weekDays.map((d, i) => <Text key={i} style={styles.weekDay}>{d}</Text>)}
          </View>

          <View style={styles.daysGrid}>
            {days.map((day, i) => {
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isSelected = value?.includes(format(day, 'd MMM')); // approximation
              const isToday = isSameDay(day, new Date());
              return (
                <Pressable
                  key={i}
                  style={[styles.dayCell, isSelected && styles.dayCellActive]}
                  onPress={() => handleSelect(day)}
                  disabled={!isCurrentMonth}
                >
                  <Text style={[
                    styles.dayText, 
                    !isCurrentMonth && styles.dayTextDisabled,
                    isToday && !isSelected && styles.dayTextToday,
                    isSelected && styles.dayTextActive
                  ]}>
                    {format(day, 'd')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
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
  
  calendarContainer: { paddingHorizontal: spacing.xl },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  monthText: { fontSize: font.size.base, color: colors.textPrimary, fontWeight: font.weight.medium },
  monthNav: { padding: spacing.xs },
  
  weekRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  weekDay: { width: 40, textAlign: 'center', fontSize: font.size.sm, color: colors.textSecondary, fontWeight: font.weight.medium },
  
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  dayCell: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, marginBottom: spacing.sm },
  dayCellActive: { backgroundColor: colors.primary },
  dayText: { fontSize: font.size.base, color: colors.textPrimary },
  dayTextDisabled: { color: colors.textTertiary },
  dayTextToday: { color: colors.primary, fontWeight: font.weight.medium },
  dayTextActive: { color: colors.textInverse, fontWeight: font.weight.medium },
});
