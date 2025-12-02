import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface CalendarViewProps {
    onDateSelect: (date: Date) => void;
    selectedDate: Date;
    meetingDates: string[]; // Array of ISO date strings
}

const COLORS = {
    primaryBrand: '#FCD34D',
    primaryBrandText: '#1F2937',
    background: '#FFFFFF',
    textPrimary: '#1F2937',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    lightGray: '#F9FAFB',
    accent: '#007AFF',
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export default function CalendarView({ onDateSelect, selectedDate, meetingDates }: CalendarViewProps) {
    const [currentMonth, setCurrentMonth] = useState(new Date());

    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        return new Date(year, month + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        return new Date(year, month, 1).getDay();
    };

    const isSameDay = (date1: Date, date2: Date) => {
        return (
            date1.getDate() === date2.getDate() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getFullYear() === date2.getFullYear()
        );
    };

    const hasMeeting = (date: Date) => {
        const dateStr = date.toISOString().split('T')[0];
        return meetingDates.some(meetingDate => {
            const meetingDateStr = new Date(meetingDate).toISOString().split('T')[0];
            return meetingDateStr === dateStr;
        });
    };

    const isToday = (date: Date) => {
        return isSameDay(date, new Date());
    };

    const previousMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    };

    const nextMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
    };

    const goToToday = () => {
        const today = new Date();
        setCurrentMonth(today);
        onDateSelect(today);
    };

    const renderCalendar = () => {
        const daysInMonth = getDaysInMonth(currentMonth);
        const firstDay = getFirstDayOfMonth(currentMonth);
        const days = [];

        // Empty cells for days before month starts
        for (let i = 0; i < firstDay; i++) {
            days.push(
                <View key={`empty-${i}`} style={styles.dayCell}>
                    <View style={styles.emptyDay} />
                </View>
            );
        }

        // Days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
            const isSelected = isSameDay(date, selectedDate);
            const isTodayDate = isToday(date);
            const hasEvent = hasMeeting(date);

            days.push(
                <TouchableOpacity
                    key={day}
                    style={styles.dayCell}
                    onPress={() => onDateSelect(date)}
                >
                    <View
                        style={[
                            styles.dayButton,
                            isSelected && styles.selectedDay,
                            isTodayDate && !isSelected && styles.todayDay,
                        ]}
                    >
                        <Text
                            style={[
                                styles.dayText,
                                isSelected && styles.selectedDayText,
                                isTodayDate && !isSelected && styles.todayDayText,
                            ]}
                        >
                            {day}
                        </Text>
                        {hasEvent && (
                            <View
                                style={[
                                    styles.eventDot,
                                    isSelected && styles.eventDotSelected,
                                ]}
                            />
                        )}
                    </View>
                </TouchableOpacity>
            );
        }

        return days;
    };

    return (
        <View style={styles.container}>
            {/* Calendar Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={previousMonth} style={styles.navButton}>
                    <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>

                <View style={styles.headerCenter}>
                    <Text style={styles.monthText}>
                        {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
                    </Text>
                    <TouchableOpacity onPress={goToToday} style={styles.todayButton}>
                        <Text style={styles.todayButtonText}>Today</Text>
                    </TouchableOpacity>
                </View>

                <TouchableOpacity onPress={nextMonth} style={styles.navButton}>
                    <Ionicons name="chevron-forward" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
            </View>

            {/* Day Names */}
            <View style={styles.daysRow}>
                {DAYS.map((day) => (
                    <View key={day} style={styles.dayNameCell}>
                        <Text style={styles.dayName}>{day}</Text>
                    </View>
                ))}
            </View>

            {/* Calendar Grid */}
            <View style={styles.calendarGrid}>{renderCalendar()}</View>

            {/* Legend */}
            <View style={styles.legend}>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: COLORS.accent }]} />
                    <Text style={styles.legendText}>Has meetings</Text>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: COLORS.primaryBrand }]} />
                    <Text style={styles.legendText}>Selected</Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        backgroundColor: COLORS.background,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    navButton: {
        padding: 8,
        borderRadius: 8,
        backgroundColor: COLORS.lightGray,
    },
    headerCenter: {
        flex: 1,
        alignItems: 'center',
        gap: 4,
    },
    monthText: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.textPrimary,
    },
    todayButton: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
        backgroundColor: COLORS.lightGray,
    },
    todayButtonText: {
        fontSize: 12,
        fontWeight: '600',
        color: COLORS.accent,
    },
    daysRow: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    dayNameCell: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: 8,
    },
    dayName: {
        fontSize: 12,
        fontWeight: '600',
        color: COLORS.textSecondary,
    },
    calendarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: `${100 / 7}%`,
        aspectRatio: 1,
        padding: 2,
    },
    emptyDay: {
        flex: 1,
    },
    dayButton: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
        position: 'relative',
    },
    selectedDay: {
        backgroundColor: COLORS.primaryBrand,
    },
    todayDay: {
        borderWidth: 2,
        borderColor: COLORS.accent,
    },
    dayText: {
        fontSize: 14,
        fontWeight: '500',
        color: COLORS.textPrimary,
    },
    selectedDayText: {
        color: COLORS.primaryBrandText,
        fontWeight: '700',
    },
    todayDayText: {
        color: COLORS.accent,
        fontWeight: '600',
    },
    eventDot: {
        position: 'absolute',
        bottom: 4,
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: COLORS.accent,
    },
    eventDotSelected: {
        backgroundColor: COLORS.primaryBrandText,
    },
    legend: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 20,
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    legendDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    legendText: {
        fontSize: 12,
        color: COLORS.textSecondary,
    },
});