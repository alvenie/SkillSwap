import { calendarService } from '@/services/apiService';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

// Theme Configuration
const COLORS = {
    primaryBrand: '#FCD34D', // Mustard Yellow
    primaryBrandText: '#1F2937', // Dark Gray
    background: '#FFFFFF',
    textPrimary: '#1F2937', // Dark Gray (High Contrast)
    textSecondary: '#6B7280', // Medium Gray
    border: '#E5E7EB',
    lightGray: '#F3F4F6', // Slightly darker gray for better input contrast
    accentRed: '#EF4444',
};

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
    const [showDatePicker, setShowDatePicker] = useState(false);

    // Reset form when opening
    React.useEffect(() => {
        if (visible) {
            setTitle(skillName ? `Session: ${skillName}` : '');
            setDescription('');
            setLocation('');
            setDuration(60);
            const nextHour = new Date();
            nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
            setSelectedDate(nextHour);
            setSelectedHour(nextHour.getHours());
            setSelectedMinute(0);
        }
    }, [visible, skillName]);

    const handleSchedule = async () => {
        if (!title.trim()) {
            Alert.alert('Missing Info', 'Please enter a meeting title.');
            return;
        }

        setLoading(true);
        try {
            const startTime = new Date(selectedDate);
            startTime.setHours(selectedHour, selectedMinute, 0, 0);
            const endTime = new Date(startTime.getTime() + duration * 60000);

            await calendarService.createMeeting({
                requesterId: currentUserId,
                receiverId: otherUserId,
                title: title.trim(),
                description: description.trim(),
                startTime: startTime,
                endTime: endTime,
                location: location.trim(),
                skillName: skillName,
            });

            Alert.alert('Success', `Meeting request sent to ${otherUserName}!`);
            onClose();
        } catch (error: any) {
            console.error(error);
            Alert.alert('Error', 'Failed to schedule meeting. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const onDateChange = (event: any, date?: Date) => {
        if (Platform.OS === 'android') {
            setShowDatePicker(false);
        }
        if (date) {
            setSelectedDate(date);
        }
    };

    const dateString = useMemo(() => {
        return selectedDate.toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric', // Added year for clarity
        });
    }, [selectedDate]);

    const hours = Array.from({ length: 24 }, (_, i) => i);
    const minutes = [0, 15, 30, 45];

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <View style={styles.modalContent}>
                    {/* Header */}
                    <View style={styles.header}>
                        <Text style={styles.title}>Schedule Meetup</Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color={COLORS.textSecondary} />
                        </TouchableOpacity>
                    </View>
                    
                    <Text style={styles.subtitle}>With {otherUserName}</Text>

                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
                        
                        {/* Title Input */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Title</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. Coding Lesson"
                                value={title}
                                onChangeText={setTitle}
                                placeholderTextColor={COLORS.textSecondary}
                            />
                        </View>

                        {/* Date Picker (High Contrast) */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Date</Text>
                            <TouchableOpacity onPress={() => setShowDatePicker(true)}>
                                <View style={styles.dateDisplay}>
                                    <Ionicons name="calendar" size={22} color={COLORS.textPrimary} /> 
                                    <Text style={styles.dateText}>{dateString}</Text>
                                    <Ionicons name="chevron-down" size={16} color={COLORS.textSecondary} style={{marginLeft: 'auto'}} />
                                </View>
                            </TouchableOpacity>
                            {showDatePicker && (
                                <DateTimePicker
                                    value={selectedDate}
                                    mode="date"
                                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                                    onChange={onDateChange}
                                    minimumDate={new Date()}
                                    themeVariant="light" // Force light theme for better visibility
                                />
                            )}
                        </View>

                        {/* Time Picker Row */}
                        <View style={styles.row}>
                            <View style={[styles.formGroup, { flex: 1, marginRight: 8 }]}>
                                <Text style={styles.label}>Hour</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeScroll}>
                                    {hours.map((h) => (
                                        <TouchableOpacity
                                            key={h}
                                            style={[
                                                styles.timeChip,
                                                selectedHour === h && styles.timeChipSelected
                                            ]}
                                            onPress={() => setSelectedHour(h)}
                                        >
                                            <Text style={[
                                                styles.timeChipText,
                                                selectedHour === h && styles.timeChipTextSelected
                                            ]}>
                                                {h.toString().padStart(2, '0')}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>
                            
                            <View style={[styles.formGroup, { flex: 1, marginLeft: 8 }]}>
                                <Text style={styles.label}>Minute</Text>
                                <View style={styles.minuteContainer}>
                                    {minutes.map((m) => (
                                        <TouchableOpacity
                                            key={m}
                                            style={[
                                                styles.minuteChip,
                                                selectedMinute === m && styles.minuteChipSelected
                                            ]}
                                            onPress={() => setSelectedMinute(m)}
                                        >
                                            <Text style={[
                                                styles.minuteChipText,
                                                selectedMinute === m && styles.minuteChipTextSelected
                                            ]}>
                                                {m.toString().padStart(2, '0')}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        </View>

                        {/* Duration */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Duration</Text>
                            <View style={styles.durationContainer}>
                                {[30, 60, 90, 120].map((d) => (
                                    <TouchableOpacity
                                        key={d}
                                        style={[
                                            styles.durationChip,
                                            duration === d && styles.durationChipSelected
                                        ]}
                                        onPress={() => setDuration(d)}
                                    >
                                        <Text style={[
                                            styles.durationChipText,
                                            duration === d && styles.durationChipTextSelected
                                        ]}>
                                            {d} min
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* Location */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Location (Optional)</Text>
                            <TextInput
                                style={styles.input}
                                placeholder="e.g. Zoom, Library, Coffee Shop"
                                value={location}
                                onChangeText={setLocation}
                                placeholderTextColor={COLORS.textSecondary}
                            />
                        </View>

                        {/* Description */}
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Note (Optional)</Text>
                            <TextInput
                                style={[styles.input, styles.textArea]}
                                placeholder="Add any details..."
                                value={description}
                                onChangeText={setDescription}
                                multiline
                                placeholderTextColor={COLORS.textSecondary}
                            />
                        </View>

                        {/* Summary Card */}
                        <View style={styles.summaryCard}>
                            <Text style={styles.summaryTitle}>Meeting Summary</Text>
                            <View style={styles.summaryRow}>
                                <Ionicons name="time-outline" size={18} color={COLORS.textPrimary} />
                                <Text style={styles.summaryText}>
                                    {selectedHour.toString().padStart(2, '0')}:{selectedMinute.toString().padStart(2, '0')} - 
                                    {new Date(new Date().setHours(selectedHour, selectedMinute + duration)).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </Text>
                            </View>
                            <View style={styles.summaryRow}>
                                <Ionicons name="hourglass-outline" size={18} color={COLORS.textPrimary} />
                                <Text style={styles.summaryText}>{duration} minutes</Text>
                            </View>
                        </View>

                    </ScrollView>

                    {/* Footer Actions */}
                    <View style={styles.footer}>
                        <TouchableOpacity 
                            style={styles.cancelButton} 
                            onPress={onClose}
                            disabled={loading}
                        >
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                            style={styles.submitButton} 
                            onPress={handleSchedule}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color={COLORS.primaryBrandText} />
                            ) : (
                                <Text style={styles.submitButtonText}>Send Request</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: COLORS.background,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        height: '90%',
        display: 'flex',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    title: {
        fontSize: 20,
        fontWeight: '800',
        color: COLORS.textPrimary,
    },
    closeButton: {
        padding: 4,
    },
    subtitle: {
        fontSize: 14,
        color: COLORS.textSecondary,
        marginLeft: 20,
        marginTop: 4,
        marginBottom: 10,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 100, // Space for footer
    },
    formGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 14,
        fontWeight: '700',
        color: COLORS.textPrimary,
        marginBottom: 8,
    },
    input: {
        backgroundColor: COLORS.lightGray,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 12,
        padding: 14, // Increased padding
        fontSize: 16,
        color: COLORS.textPrimary,
        fontWeight: '500', // Made text slightly bolder
    },
    textArea: {
        height: 80,
        textAlignVertical: 'top',
    },
    dateDisplay: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.lightGray,
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        gap: 12,
    },
    dateText: {
        fontSize: 17, // Increased font size
        color: COLORS.textPrimary,
        fontWeight: '700', // Bold text
    },
    row: {
        flexDirection: 'row',
    },
    // Time Chips
    timeScroll: {
        backgroundColor: COLORS.lightGray,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        padding: 4,
    },
    timeChip: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 8,
        marginRight: 4,
    },
    timeChipSelected: {
        backgroundColor: COLORS.primaryBrand,
    },
    timeChipText: {
        color: COLORS.textPrimary,
        fontWeight: '600',
    },
    timeChipTextSelected: {
        color: COLORS.primaryBrandText,
        fontWeight: '800',
    },
    // Minute Chips
    minuteContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    minuteChip: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        backgroundColor: COLORS.lightGray,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    minuteChipSelected: {
        backgroundColor: COLORS.primaryBrand,
        borderColor: COLORS.primaryBrand,
    },
    minuteChipText: {
        color: COLORS.textSecondary,
        fontWeight: '600',
    },
    minuteChipTextSelected: {
        color: COLORS.primaryBrandText,
        fontWeight: '800',
    },
    // Duration
    durationContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    durationChip: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 20,
        backgroundColor: COLORS.lightGray,
        borderWidth: 1,
        borderColor: COLORS.border,
        minWidth: 70,
        alignItems: 'center',
    },
    durationChipSelected: {
        backgroundColor: COLORS.primaryBrand,
        borderColor: COLORS.primaryBrand,
    },
    durationChipText: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.textSecondary,
    },
    durationChipTextSelected: {
        color: COLORS.primaryBrandText,
        fontWeight: '800',
    },
    // Summary Card
    summaryCard: {
        backgroundColor: '#FFFBEB', // Light Yellow Background
        padding: 16,
        borderRadius: 16,
        marginTop: 10,
        borderWidth: 1,
        borderColor: COLORS.primaryBrand, // Yellow Border
    },
    summaryTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: COLORS.textPrimary,
        marginBottom: 12,
    },
    summaryRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        gap: 8,
    },
    summaryText: {
        fontSize: 15,
        color: COLORS.textPrimary,
        fontWeight: '600',
    },
    // Footer
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: COLORS.background,
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
        flexDirection: 'row',
        gap: 12,
    },
    cancelButton: {
        flex: 1,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        backgroundColor: COLORS.lightGray,
    },
    cancelButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: COLORS.textSecondary,
    },
    submitButton: {
        flex: 2,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 12,
        backgroundColor: COLORS.primaryBrand,
        shadowColor: COLORS.primaryBrand,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 4,
    },
    submitButtonText: {
        fontSize: 16,
        fontWeight: '700',
        color: COLORS.primaryBrandText,
    },
});