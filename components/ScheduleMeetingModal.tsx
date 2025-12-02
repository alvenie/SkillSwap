import React, { useState, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Modal,
    TouchableOpacity,
    TextInput,
    ScrollView,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { calendarService } from '@/services/apiService';

interface ScheduleMeetingModalProps {
    visible: boolean;
    onClose: () => void;
    currentUserId: string;
    otherUserId: string;
    otherUserName: string;
    skillName?: string;
}

export default function ScheduleMeetingModal({
                                                 visible,
                                                 onClose,
                                                 currentUserId,
                                                 otherUserId,
                                                 otherUserName,
                                                 skillName,
                                             }: ScheduleMeetingModalProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [location, setLocation] = useState('');
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [selectedHour, setSelectedHour] = useState<number>(9);
    const [selectedMinute, setSelectedMinute] = useState<number>(0);
    const [duration, setDuration] = useState<number>(60);
    const [loading, setLoading] = useState(false);
    const [showCalendar, setShowCalendar] = useState(false);

    // Generate calendar for current month
    const calendarData = useMemo(() => {
        const year = selectedDate.getFullYear();
        const month = selectedDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        const startDay = firstDay.getDay();

        const days: (number | null)[] = [];
        // Add empty slots for days before month starts
        for (let i = 0; i < startDay; i++) {
            days.push(null);
        }
        // Add actual days
        for (let i = 1; i <= daysInMonth; i++) {
            days.push(i);
        }

        return { days, month, year };
    }, [selectedDate]);

    const handleSchedule = async () => {
        if (!title.trim()) {
            Alert.alert('Error', 'Please enter a meeting title');
            return;
        }

        try {
            setLoading(true);

            const startTime = new Date(selectedDate);
            startTime.setHours(selectedHour, selectedMinute, 0, 0);

            const endTime = new Date(startTime);
            endTime.setMinutes(endTime.getMinutes() + duration);

            if (startTime < new Date()) {
                Alert.alert('Error', 'Cannot schedule meetings in the past');
                setLoading(false);
                return;
            }

            await calendarService.createMeeting({
                requesterId: currentUserId,
                receiverId: otherUserId,
                title: title.trim(),
                description: description.trim() || undefined,
                startTime,
                endTime,
                location: location.trim() || undefined,
                skillName: skillName,
            });

            Alert.alert('Success', `Meeting request sent to ${otherUserName}!`);
            resetForm();
            onClose();
        } catch (error: any) {
            console.error('Error scheduling meeting:', error);
            const errorMessage = error.response?.data?.message || 'Failed to schedule meeting';
            Alert.alert('Error', errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setTitle('');
        setDescription('');
        setLocation('');
        setSelectedDate(new Date());
        setSelectedHour(9);
        setSelectedMinute(0);
        setDuration(60);
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const selectDate = (day: number) => {
        const newDate = new Date(selectedDate);
        newDate.setDate(day);
        setSelectedDate(newDate);
        setShowCalendar(false);
    };

    const changeMonth = (delta: number) => {
        const newDate = new Date(selectedDate);
        newDate.setMonth(newDate.getMonth() + delta);
        setSelectedDate(newDate);
    };

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        });
    };

    const formatTime = (hour: number, minute: number) => {
        const period = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        return `${displayHour}:${minute.toString().padStart(2, '0')} ${period}`;
    };

    const formatEndTime = () => {
        const endDate = new Date();
        endDate.setHours(selectedHour, selectedMinute + duration, 0, 0);
        return formatTime(endDate.getHours(), endDate.getMinutes());
    };

    const isToday = (day: number) => {
        const today = new Date();
        return (
            day === today.getDate() &&
            selectedDate.getMonth() === today.getMonth() &&
            selectedDate.getFullYear() === today.getFullYear()
        );
    };

    const isSelected = (day: number) => {
        return day === selectedDate.getDate();
    };

    const durationOptions = [
        { value: 15, label: '15 min' },
        { value: 30, label: '30 min' },
        { value: 45, label: '45 min' },
        { value: 60, label: '1 hr' },
        { value: 90, label: '1.5 hrs' },
        { value: 120, label: '2 hrs' },
    ];

    const hours = Array.from({ length: 24 }, (_, i) => i);
    const minutes = [0, 15, 30, 45];

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={handleClose} style={styles.headerButton}>
                        <Text style={styles.cancelButton}>✕</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Schedule Meetup</Text>
                    <TouchableOpacity
                        onPress={handleSchedule}
                        disabled={loading}
                        style={styles.headerButton}
                    >
                        {loading ? (
                            <ActivityIndicator color="#007AFF" size="small" />
                        ) : (
                            <Text style={styles.sendButton}>Send</Text>
                        )}
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                    {/* Meeting with info */}
                    <View style={styles.infoCard}>
                        <View style={styles.avatarCircle}>
                            <Text style={styles.avatarText}>
                                {otherUserName.charAt(0).toUpperCase()}
                            </Text>
                        </View>
                        <View style={styles.infoTextContainer}>
                            <Text style={styles.infoLabel}>Meeting with</Text>
                            <Text style={styles.infoValue}>{otherUserName}</Text>
                            {skillName && (
                                <View style={styles.skillBadge}>
                                    <Text style={styles.skillBadgeText}>📚 {skillName}</Text>
                                </View>
                            )}
                        </View>
                    </View>

                    {/* Title Input */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>
                            Meeting Title <Text style={styles.required}>*</Text>
                        </Text>
                        <TextInput
                            style={styles.input}
                            value={title}
                            onChangeText={setTitle}
                            placeholder="e.g., Guitar Lesson, Coffee Chat"
                            placeholderTextColor="#999"
                        />
                    </View>

                    {/* Date Selector */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>Date</Text>
                        <TouchableOpacity
                            style={styles.dateButton}
                            onPress={() => setShowCalendar(!showCalendar)}
                        >
                            <Text style={styles.dateButtonIcon}>📅</Text>
                            <Text style={styles.dateButtonText}>{formatDate(selectedDate)}</Text>
                            <Text style={styles.dateButtonChevron}>
                                {showCalendar ? '▲' : '▼'}
                            </Text>
                        </TouchableOpacity>

                        {/* Calendar */}
                        {showCalendar && (
                            <View style={styles.calendar}>
                                {/* Month Navigation */}
                                <View style={styles.calendarHeader}>
                                    <TouchableOpacity
                                        onPress={() => changeMonth(-1)}
                                        style={styles.monthButton}
                                    >
                                        <Text style={styles.monthButtonText}>◀</Text>
                                    </TouchableOpacity>
                                    <Text style={styles.monthYear}>
                                        {new Date(calendarData.year, calendarData.month).toLocaleDateString('en-US', {
                                            month: 'long',
                                            year: 'numeric',
                                        })}
                                    </Text>
                                    <TouchableOpacity
                                        onPress={() => changeMonth(1)}
                                        style={styles.monthButton}
                                    >
                                        <Text style={styles.monthButtonText}>▶</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Day Labels */}
                                <View style={styles.dayLabels}>
                                    {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
                                        <Text key={day} style={styles.dayLabel}>
                                            {day}
                                        </Text>
                                    ))}
                                </View>

                                {/* Calendar Days */}
                                <View style={styles.daysGrid}>
                                    {calendarData.days.map((day, index) => (
                                        <TouchableOpacity
                                            key={index}
                                            style={[
                                                styles.dayCell,
                                                day === null && styles.dayCellEmpty,
                                                day && isSelected(day) && styles.dayCellSelected,
                                                day && isToday(day) && styles.dayCellToday,
                                            ]}
                                            onPress={() => day && selectDate(day)}
                                            disabled={!day}
                                        >
                                            {day && (
                                                <Text
                                                    style={[
                                                        styles.dayText,
                                                        isSelected(day) && styles.dayTextSelected,
                                                        isToday(day) && !isSelected(day) && styles.dayTextToday,
                                                    ]}
                                                >
                                                    {day}
                                                </Text>
                                            )}
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}
                    </View>

                    {/* Time Picker */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>Time</Text>

                        {/* Current Time Display */}
                        <View style={styles.selectedTimeDisplay}>
                            <Text style={styles.selectedTimeText}>
                                🕐 {formatTime(selectedHour, selectedMinute)}
                            </Text>
                        </View>

                        {/* Hour Selection Grid */}
                        <View style={styles.timeSection}>
                            <Text style={styles.timeSubLabel}>Hour</Text>
                            <View style={styles.timeGrid}>
                                {[12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((displayHour) => {
                                    const hour24 = displayHour === 12 ? (selectedHour >= 12 ? 12 : 0) :
                                        selectedHour >= 12 ? displayHour + 12 : displayHour;
                                    const isSelected = selectedHour === hour24 ||
                                        (displayHour === 12 && selectedHour === 0);

                                    return (
                                        <TouchableOpacity
                                            key={displayHour}
                                            style={[
                                                styles.timeGridItem,
                                                isSelected && styles.timeGridItemSelected,
                                            ]}
                                            onPress={() => setSelectedHour(hour24)}
                                        >
                                            <Text
                                                style={[
                                                    styles.timeGridText,
                                                    isSelected && styles.timeGridTextSelected,
                                                ]}
                                            >
                                                {displayHour}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>

                        {/* Minute Selection */}
                        <View style={styles.timeSection}>
                            <Text style={styles.timeSubLabel}>Minute</Text>
                            <View style={styles.minuteGrid}>
                                {minutes.map((minute) => (
                                    <TouchableOpacity
                                        key={minute}
                                        style={[
                                            styles.minuteGridItem,
                                            selectedMinute === minute && styles.minuteGridItemSelected,
                                        ]}
                                        onPress={() => setSelectedMinute(minute)}
                                    >
                                        <Text
                                            style={[
                                                styles.minuteGridText,
                                                selectedMinute === minute && styles.minuteGridTextSelected,
                                            ]}
                                        >
                                            :{minute.toString().padStart(2, '0')}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* AM/PM Toggle */}
                        <View style={styles.timeSection}>
                            <Text style={styles.timeSubLabel}>Period</Text>
                            <View style={styles.amPmRow}>
                                <TouchableOpacity
                                    style={[
                                        styles.amPmButton,
                                        selectedHour < 12 && styles.amPmButtonSelected,
                                    ]}
                                    onPress={() => {
                                        if (selectedHour >= 12) {
                                            setSelectedHour(selectedHour - 12);
                                        }
                                    }}
                                >
                                    <Text
                                        style={[
                                            styles.amPmText,
                                            selectedHour < 12 && styles.amPmTextSelected,
                                        ]}
                                    >
                                        AM
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[
                                        styles.amPmButton,
                                        selectedHour >= 12 && styles.amPmButtonSelected,
                                    ]}
                                    onPress={() => {
                                        if (selectedHour < 12) {
                                            setSelectedHour(selectedHour + 12);
                                        }
                                    }}
                                >
                                    <Text
                                        style={[
                                            styles.amPmText,
                                            selectedHour >= 12 && styles.amPmTextSelected,
                                        ]}
                                    >
                                        PM
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    {/* Duration */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>Duration</Text>
                        <View style={styles.durationGrid}>
                            {durationOptions.map((option) => (
                                <TouchableOpacity
                                    key={option.value}
                                    style={[
                                        styles.durationChip,
                                        duration === option.value && styles.durationChipSelected,
                                    ]}
                                    onPress={() => setDuration(option.value)}
                                >
                                    <Text
                                        style={[
                                            styles.durationChipText,
                                            duration === option.value && styles.durationChipTextSelected,
                                        ]}
                                    >
                                        {option.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    {/* Location */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>Location (optional)</Text>
                        <TextInput
                            style={styles.input}
                            value={location}
                            onChangeText={setLocation}
                            placeholder="e.g., Starbucks, Zoom link"
                            placeholderTextColor="#999"
                        />
                    </View>

                    {/* Description */}
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>Description (optional)</Text>
                        <TextInput
                            style={[styles.input, styles.textArea]}
                            value={description}
                            onChangeText={setDescription}
                            placeholder="What would you like to discuss?"
                            placeholderTextColor="#999"
                            multiline
                            numberOfLines={4}
                        />
                    </View>

                    {/* Summary Card */}
                    <View style={styles.summaryCard}>
                        <Text style={styles.summaryTitle}>📋 Meeting Summary</Text>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryIcon}>📅</Text>
                            <View style={styles.summaryTextContainer}>
                                <Text style={styles.summaryLabel}>Date</Text>
                                <Text style={styles.summaryValue}>{formatDate(selectedDate)}</Text>
                            </View>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryIcon}>🕐</Text>
                            <View style={styles.summaryTextContainer}>
                                <Text style={styles.summaryLabel}>Time</Text>
                                <Text style={styles.summaryValue}>
                                    {formatTime(selectedHour, selectedMinute)} - {formatEndTime()}
                                </Text>
                            </View>
                        </View>
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryIcon}>⏱️</Text>
                            <View style={styles.summaryTextContainer}>
                                <Text style={styles.summaryLabel}>Duration</Text>
                                <Text style={styles.summaryValue}>{duration} minutes</Text>
                            </View>
                        </View>
                        {location && (
                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryIcon}>📍</Text>
                                <View style={styles.summaryTextContainer}>
                                    <Text style={styles.summaryLabel}>Location</Text>
                                    <Text style={styles.summaryValue}>{location}</Text>
                                </View>
                            </View>
                        )}
                    </View>

                    <View style={styles.bottomSpacer} />
                </ScrollView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        paddingTop: 60,
        backgroundColor: '#ffffff',
        borderBottomWidth: 1,
        borderBottomColor: '#e9ecef',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 3,
    },
    headerButton: {
        minWidth: 50,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#212529',
    },
    cancelButton: {
        fontSize: 24,
        color: '#6c757d',
        fontWeight: '400',
    },
    sendButton: {
        fontSize: 17,
        color: '#007AFF',
        fontWeight: '600',
    },
    content: {
        flex: 1,
    },
    infoCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        marginHorizontal: 16,
        marginTop: 16,
        padding: 16,
        borderRadius: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 4,
    },
    avatarCircle: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#007AFF',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    avatarText: {
        fontSize: 24,
        fontWeight: '700',
        color: '#ffffff',
    },
    infoTextContainer: {
        flex: 1,
    },
    infoLabel: {
        fontSize: 13,
        color: '#6c757d',
        marginBottom: 4,
    },
    infoValue: {
        fontSize: 18,
        fontWeight: '600',
        color: '#212529',
        marginBottom: 4,
    },
    skillBadge: {
        alignSelf: 'flex-start',
        backgroundColor: '#e7f3ff',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        marginTop: 4,
    },
    skillBadgeText: {
        fontSize: 13,
        color: '#0066cc',
        fontWeight: '500',
    },
    section: {
        marginHorizontal: 16,
        marginTop: 20,
    },
    sectionLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: '#212529',
        marginBottom: 10,
    },
    required: {
        color: '#dc3545',
    },
    input: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 14,
        fontSize: 16,
        color: '#212529',
        borderWidth: 1,
        borderColor: '#dee2e6',
    },
    textArea: {
        minHeight: 100,
        textAlignVertical: 'top',
    },
    dateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#dee2e6',
    },
    dateButtonIcon: {
        fontSize: 22,
        marginRight: 12,
    },
    dateButtonText: {
        flex: 1,
        fontSize: 16,
        color: '#212529',
        fontWeight: '500',
    },
    dateButtonChevron: {
        fontSize: 12,
        color: '#6c757d',
    },
    calendar: {
        backgroundColor: '#ffffff',
        borderRadius: 12,
        padding: 16,
        marginTop: 12,
        borderWidth: 1,
        borderColor: '#dee2e6',
    },
    calendarHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    monthButton: {
        padding: 8,
    },
    monthButtonText: {
        fontSize: 18,
        color: '#007AFF',
        fontWeight: '600',
    },
    monthYear: {
        fontSize: 17,
        fontWeight: '600',
        color: '#212529',
    },
    dayLabels: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 12,
    },
    dayLabel: {
        width: 40,
        textAlign: 'center',
        fontSize: 13,
        fontWeight: '600',
        color: '#6c757d',
    },
    daysGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    dayCell: {
        width: '14.28%',
        aspectRatio: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginVertical: 2,
    },
    dayCellEmpty: {
        opacity: 0,
    },
    dayCellSelected: {
        backgroundColor: '#007AFF',
        borderRadius: 20,
    },
    dayCellToday: {
        borderWidth: 2,
        borderColor: '#007AFF',
        borderRadius: 20,
    },
    dayText: {
        fontSize: 15,
        color: '#212529',
    },
    dayTextSelected: {
        color: '#ffffff',
        fontWeight: '700',
    },
    dayTextToday: {
        color: '#007AFF',
        fontWeight: '600',
    },
    selectedTimeDisplay: {
        backgroundColor: '#e7f3ff',
        padding: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginBottom: 16,
        borderWidth: 2,
        borderColor: '#007AFF',
    },
    selectedTimeText: {
        fontSize: 20,
        fontWeight: '700',
        color: '#007AFF',
    },
    timeSection: {
        marginTop: 16,
    },
    timeSubLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#495057',
        marginBottom: 10,
    },
    timeGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    timeGridItem: {
        width: '22%',
        aspectRatio: 1.5,
        backgroundColor: '#ffffff',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#dee2e6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    timeGridItemSelected: {
        backgroundColor: '#007AFF',
        borderColor: '#007AFF',
    },
    timeGridText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#495057',
    },
    timeGridTextSelected: {
        color: '#ffffff',
        fontWeight: '700',
    },
    minuteGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    minuteGridItem: {
        flex: 1,
        minWidth: '22%',
        paddingVertical: 12,
        backgroundColor: '#ffffff',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#dee2e6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    minuteGridItemSelected: {
        backgroundColor: '#007AFF',
        borderColor: '#007AFF',
    },
    minuteGridText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#495057',
    },
    minuteGridTextSelected: {
        color: '#ffffff',
        fontWeight: '700',
    },
    amPmRow: {
        flexDirection: 'row',
        gap: 12,
    },
    amPmButton: {
        flex: 1,
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 10,
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#dee2e6',
        alignItems: 'center',
    },
    amPmButtonSelected: {
        backgroundColor: '#007AFF',
        borderColor: '#007AFF',
    },
    amPmText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#495057',
    },
    amPmTextSelected: {
        color: '#ffffff',
        fontWeight: '700',
    },
    durationGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    durationChip: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#dee2e6',
        minWidth: 80,
        alignItems: 'center',
    },
    durationChipSelected: {
        backgroundColor: '#28a745',
        borderColor: '#28a745',
    },
    durationChipText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#495057',
    },
    durationChipTextSelected: {
        color: '#ffffff',
        fontWeight: '700',
    },
    summaryCard: {
        backgroundColor: '#ffffff',
        marginHorizontal: 16,
        marginTop: 24,
        padding: 20,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: '#007AFF',
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
    },
    summaryTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#212529',
        marginBottom: 16,
    },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 12,
    },
    summaryIcon: {
        fontSize: 20,
        marginRight: 12,
        marginTop: 2,
    },
    summaryTextContainer: {
        flex: 1,
    },
    summaryLabel: {
        fontSize: 13,
        color: '#6c757d',
        marginBottom: 2,
    },
    summaryValue: {
        fontSize: 15,
        fontWeight: '600',
        color: '#212529',
    },
    bottomSpacer: {
        height: 40,
    },
});