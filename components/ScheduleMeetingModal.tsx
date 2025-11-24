import React, { useState } from 'react';
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
    const [selectedTime, setSelectedTime] = useState<string>('09:00');
    const [duration, setDuration] = useState<number>(60);
    const [loading, setLoading] = useState(false);

    const handleSchedule = async () => {
        if (!title.trim()) {
            Alert.alert('Error', 'Please enter a meeting title');
            return;
        }

        try {
            setLoading(true);

            const [hours, minutes] = selectedTime.split(':').map(Number);
            const startTime = new Date(selectedDate);
            startTime.setHours(hours, minutes, 0, 0);

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
        setSelectedTime('09:00');
        setDuration(60);
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const timeSlots = [];
    for (let hour = 9; hour <= 18; hour++) {
        const time = `${hour.toString().padStart(2, '0')}:00`;
        const label = new Date(0, 0, 0, hour).toLocaleTimeString('en-US', {
            hour: 'numeric',
            hour12: true,
        });
        timeSlots.push({ value: time, label });
    }

    const durationOptions = [
        { value: 30, label: '30 min' },
        { value: 60, label: '1 hour' },
        { value: 90, label: '1.5 hours' },
        { value: 120, label: '2 hours' },
    ];

    const getQuickDate = (type: 'today' | 'tomorrow' | 'next-week') => {
        const date = new Date();
        switch (type) {
            case 'today':
                return date;
            case 'tomorrow':
                date.setDate(date.getDate() + 1);
                return date;
            case 'next-week':
                date.setDate(date.getDate() + 7);
                return date;
        }
    };

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    const formatEndTime = () => {
        const [hours, minutes] = selectedTime.split(':').map(Number);
        const endDate = new Date();
        endDate.setHours(hours, minutes + duration, 0, 0);
        return endDate.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
    };

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
            <View style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={handleClose}>
                        <Text style={styles.cancelButton}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Schedule Meetup</Text>
                    <TouchableOpacity onPress={handleSchedule} disabled={loading}>
                        {loading ? (
                            <ActivityIndicator color="#007AFF" />
                        ) : (
                            <Text style={styles.sendButton}>Send</Text>
                        )}
                    </TouchableOpacity>
                </View>

                <ScrollView style={styles.content}>
                    <View style={styles.infoBox}>
                        <Text style={styles.infoLabel}>Meeting with:</Text>
                        <Text style={styles.infoValue}>{otherUserName}</Text>
                        {skillName && (
                            <Text style={styles.skillBadge}>📚 {skillName}</Text>
                        )}
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>
                            Title <Text style={styles.required}>*</Text>
                        </Text>
                        <TextInput
                            style={styles.input}
                            value={title}
                            onChangeText={setTitle}
                            placeholder="e.g., Guitar Lesson, Coffee Chat"
                            placeholderTextColor="#999"
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Description (optional)</Text>
                        <TextInput
                            style={[styles.input, styles.textArea]}
                            value={description}
                            onChangeText={setDescription}
                            placeholder="What do you want to discuss or learn?"
                            placeholderTextColor="#999"
                            multiline
                            numberOfLines={3}
                        />
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Quick Date</Text>
                        <View style={styles.quickDateButtons}>
                            <TouchableOpacity
                                style={styles.quickDateButton}
                                onPress={() => setSelectedDate(getQuickDate('today'))}
                            >
                                <Text style={styles.quickDateText}>Today</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.quickDateButton}
                                onPress={() => setSelectedDate(getQuickDate('tomorrow'))}
                            >
                                <Text style={styles.quickDateText}>Tomorrow</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.quickDateButton}
                                onPress={() => setSelectedDate(getQuickDate('next-week'))}
                            >
                                <Text style={styles.quickDateText}>Next Week</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.selectedDateDisplay}>
                        <Text style={styles.selectedDateText}>
                            📅 {formatDate(selectedDate)}
                        </Text>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Start Time</Text>
                        <View style={styles.timeGrid}>
                            {timeSlots.map((slot) => (
                                <TouchableOpacity
                                    key={slot.value}
                                    style={[
                                        styles.timeSlot,
                                        selectedTime === slot.value && styles.timeSlotSelected,
                                    ]}
                                    onPress={() => setSelectedTime(slot.value)}
                                >
                                    <Text
                                        style={[
                                            styles.timeSlotText,
                                            selectedTime === slot.value && styles.timeSlotTextSelected,
                                        ]}
                                    >
                                        {slot.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Duration</Text>
                        <View style={styles.durationButtons}>
                            {durationOptions.map((option) => (
                                <TouchableOpacity
                                    key={option.value}
                                    style={[
                                        styles.durationButton,
                                        duration === option.value && styles.durationButtonSelected,
                                    ]}
                                    onPress={() => setDuration(option.value)}
                                >
                                    <Text
                                        style={[
                                            styles.durationButtonText,
                                            duration === option.value &&
                                            styles.durationButtonTextSelected,
                                        ]}
                                    >
                                        {option.label}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Location (optional)</Text>
                        <TextInput
                            style={styles.input}
                            value={location}
                            onChangeText={setLocation}
                            placeholder="e.g., Starbucks on Main St, Zoom"
                            placeholderTextColor="#999"
                        />
                    </View>

                    <View style={styles.summaryBox}>
                        <Text style={styles.summaryTitle}>📋 Meeting Summary</Text>
                        <Text style={styles.summaryText}>
                            <Text style={styles.summaryLabel}>When:</Text> {formatDate(selectedDate)}
                        </Text>
                        <Text style={styles.summaryText}>
                            <Text style={styles.summaryLabel}>Time:</Text>{' '}
                            {selectedTime.replace(':', ':')} - {formatEndTime()}
                        </Text>
                        <Text style={styles.summaryText}>
                            <Text style={styles.summaryLabel}>Duration:</Text> {duration} minutes
                        </Text>
                        {location && (
                            <Text style={styles.summaryText}>
                                <Text style={styles.summaryLabel}>Location:</Text> {location}
                            </Text>
                        )}
                    </View>
                </ScrollView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        paddingTop: 60,
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
    },
    cancelButton: {
        fontSize: 16,
        color: '#666',
    },
    sendButton: {
        fontSize: 16,
        color: '#007AFF',
        fontWeight: '600',
    },
    content: {
        flex: 1,
        padding: 16,
    },
    infoBox: {
        backgroundColor: '#e3f2fd',
        padding: 16,
        borderRadius: 12,
        marginBottom: 20,
    },
    infoLabel: {
        fontSize: 14,
        color: '#666',
        marginBottom: 4,
    },
    infoValue: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
    },
    skillBadge: {
        fontSize: 14,
        color: '#1976d2',
        marginTop: 8,
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 8,
    },
    required: {
        color: '#f44336',
    },
    input: {
        backgroundColor: 'white',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        borderWidth: 1,
        borderColor: '#e0e0e0',
    },
    textArea: {
        minHeight: 80,
        textAlignVertical: 'top',
    },
    quickDateButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    quickDateButton: {
        flex: 1,
        backgroundColor: 'white',
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        alignItems: 'center',
    },
    quickDateText: {
        fontSize: 14,
        color: '#007AFF',
        fontWeight: '500',
    },
    selectedDateDisplay: {
        backgroundColor: 'white',
        padding: 16,
        borderRadius: 8,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#007AFF',
    },
    selectedDateText: {
        fontSize: 16,
        color: '#333',
        textAlign: 'center',
        fontWeight: '500',
    },
    timeGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    timeSlot: {
        backgroundColor: 'white',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        minWidth: 80,
        alignItems: 'center',
    },
    timeSlotSelected: {
        backgroundColor: '#007AFF',
        borderColor: '#007AFF',
    },
    timeSlotText: {
        fontSize: 14,
        color: '#333',
    },
    timeSlotTextSelected: {
        color: 'white',
        fontWeight: '600',
    },
    durationButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    durationButton: {
        flex: 1,
        backgroundColor: 'white',
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e0e0e0',
        alignItems: 'center',
    },
    durationButtonSelected: {
        backgroundColor: '#4CAF50',
        borderColor: '#4CAF50',
    },
    durationButtonText: {
        fontSize: 14,
        color: '#333',
    },
    durationButtonTextSelected: {
        color: 'white',
        fontWeight: '600',
    },
    summaryBox: {
        backgroundColor: '#fff3e0',
        padding: 16,
        borderRadius: 12,
        marginBottom: 20,
    },
    summaryTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 12,
    },
    summaryText: {
        fontSize: 14,
        color: '#666',
        marginBottom: 4,
    },
    summaryLabel: {
        fontWeight: '600',
        color: '#333',
    },
});