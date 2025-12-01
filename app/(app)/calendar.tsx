import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    RefreshControl,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { calendarService } from '@/services/apiService';

interface Meeting {
    meetingId: string;
    requesterId: string;
    requesterName: string;
    receiverId: string;
    receiverName: string;
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
    location?: string;
    skillName?: string;
    status: 'pending' | 'accepted' | 'declined' | 'cancelled';
    createdAt: string;
}

export default function CalendarScreen() {
    const { user } = useAuth();
    const [meetings, setMeetings] = useState<Meeting[]>([]);
    const [pendingRequests, setPendingRequests] = useState<Meeting[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        if (user) {
            loadMeetings();
        }
    }, [user]);

    const loadMeetings = async () => {
        if (!user) return;

        try {
            setLoading(true);

            const allMeetings = await calendarService.getUserMeetings(user.uid);
            setMeetings(allMeetings);

            const pending = await calendarService.getPendingRequests(user.uid);
            setPendingRequests(pending);
        } catch (error) {
            console.error('Error loading meetings:', error);
            Alert.alert('Error', 'Failed to load meetings');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleAcceptMeeting = async (meetingId: string) => {
        try {
            await calendarService.updateMeetingStatus(meetingId, 'accepted');
            Alert.alert('Success', 'Meeting accepted!');
            loadMeetings();
        } catch (error) {
            console.error('Error accepting meeting:', error);
            Alert.alert('Error', 'Failed to accept meeting');
        }
    };

    const handleDeclineMeeting = async (meetingId: string) => {
        try {
            await calendarService.updateMeetingStatus(meetingId, 'declined');
            Alert.alert('Success', 'Meeting declined');
            loadMeetings();
        } catch (error) {
            console.error('Error declining meeting:', error);
            Alert.alert('Error', 'Failed to decline meeting');
        }
    };

    const handleCancelMeeting = async (meetingId: string) => {
        if (!user) return;

        Alert.alert('Cancel Meeting', 'Are you sure you want to cancel this meeting?', [
            { text: 'No', style: 'cancel' },
            {
                text: 'Yes',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await calendarService.cancelMeeting(meetingId, user.uid);
                        Alert.alert('Success', 'Meeting cancelled');
                        loadMeetings();
                    } catch (error) {
                        console.error('Error cancelling meeting:', error);
                        Alert.alert('Error', 'Failed to cancel meeting');
                    }
                },
            },
        ]);
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
        });
    };

    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'accepted':
                return '#4CAF50';
            case 'pending':
                return '#FF9800';
            case 'declined':
                return '#f44336';
            case 'cancelled':
                return '#9E9E9E';
            default:
                return '#9E9E9E';
        }
    };

    const renderMeetingCard = (meeting: Meeting, isPending: boolean = false) => {
        const isRequester = meeting.requesterId === user?.uid;
        const otherPersonName = isRequester ? meeting.receiverName : meeting.requesterName;

        return (
            <View key={meeting.meetingId} style={styles.meetingCard}>
                <View style={styles.meetingHeader}>
                    <View style={styles.meetingTitleRow}>
                        <Text style={styles.meetingTitle}>{meeting.title}</Text>
                        <View
                            style={[
                                styles.statusBadge,
                                { backgroundColor: getStatusColor(meeting.status) },
                            ]}
                        >
                            <Text style={styles.statusText}>{meeting.status.toUpperCase()}</Text>
                        </View>
                    </View>
                    {meeting.skillName && (
                        <Text style={styles.skillName}>📚 {meeting.skillName}</Text>
                    )}
                </View>

                <View style={styles.meetingDetails}>
                    <Text style={styles.detailText}>
                        👤 With: <Text style={styles.detailValue}>{otherPersonName}</Text>
                    </Text>
                    <Text style={styles.detailText}>📅 {formatDate(meeting.startTime)}</Text>
                    <Text style={styles.detailText}>
                        🕐 {formatTime(meeting.startTime)} - {formatTime(meeting.endTime)}
                    </Text>
                    {meeting.location && (
                        <Text style={styles.detailText}>📍 {meeting.location}</Text>
                    )}
                    {meeting.description && (
                        <Text style={styles.description}>{meeting.description}</Text>
                    )}
                </View>

                {isPending && !isRequester && (
                    <View style={styles.actionButtons}>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.acceptButton]}
                            onPress={() => handleAcceptMeeting(meeting.meetingId)}
                        >
                            <Text style={styles.actionButtonText}>✓ Accept</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.declineButton]}
                            onPress={() => handleDeclineMeeting(meeting.meetingId)}
                        >
                            <Text style={styles.actionButtonText}>✗ Decline</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {meeting.status === 'accepted' && (
                    <TouchableOpacity
                        style={[styles.actionButton, styles.cancelButton]}
                        onPress={() => handleCancelMeeting(meeting.meetingId)}
                    >
                        <Text style={styles.actionButtonText}>Cancel Meeting</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    const upcomingMeetings = meetings.filter(
        (m) => m.status === 'accepted' && new Date(m.startTime) > new Date()
    );

    const pastMeetings = meetings.filter(
        (m) => m.status === 'accepted' && new Date(m.startTime) <= new Date()
    );

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.loadingText}>Loading your calendar...</Text>
            </View>
        );
    }

    return (
        <ScrollView
            style={styles.container}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadMeetings} />}
        >
            <View style={styles.header}>
                <Text style={styles.headerTitle}>My Calendar</Text>
                <Text style={styles.headerSubtitle}>{meetings.length} total meetings</Text>
            </View>

            {pendingRequests.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                        📬 Pending Requests ({pendingRequests.length})
                    </Text>
                    {pendingRequests.map((meeting) => renderMeetingCard(meeting, true))}
                </View>
            )}

            {upcomingMeetings.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                        📅 Upcoming Meetings ({upcomingMeetings.length})
                    </Text>
                    {upcomingMeetings.map((meeting) => renderMeetingCard(meeting))}
                </View>
            )}

            {pastMeetings.length > 0 && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>
                        📝 Past Meetings ({pastMeetings.length})
                    </Text>
                    {pastMeetings.map((meeting) => renderMeetingCard(meeting))}
                </View>
            )}

            {meetings.length === 0 && pendingRequests.length === 0 && (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyStateIcon}>📅</Text>
                    <Text style={styles.emptyStateText}>No meetings scheduled</Text>
                    <Text style={styles.emptyStateSubtext}>
                        Schedule a meetup with your friends to get started!
                    </Text>
                </View>
            )}
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: '#666',
    },
    header: {
        backgroundColor: '#007AFF',
        padding: 20,
        paddingTop: 60,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: 'white',
        marginBottom: 4,
    },
    headerSubtitle: {
        fontSize: 14,
        color: 'rgba(255,255,255,0.8)',
    },
    section: {
        marginTop: 20,
        paddingHorizontal: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 12,
        color: '#333',
    },
    meetingCard: {
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    meetingHeader: {
        marginBottom: 12,
    },
    meetingTitleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    meetingTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
        flex: 1,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        marginLeft: 8,
    },
    statusText: {
        color: 'white',
        fontSize: 10,
        fontWeight: '600',
    },
    skillName: {
        fontSize: 14,
        color: '#666',
        marginTop: 4,
    },
    meetingDetails: {
        marginBottom: 12,
    },
    detailText: {
        fontSize: 14,
        color: '#666',
        marginBottom: 4,
    },
    detailValue: {
        fontWeight: '600',
        color: '#333',
    },
    description: {
        fontSize: 14,
        color: '#666',
        marginTop: 8,
        fontStyle: 'italic',
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 12,
    },
    actionButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    acceptButton: {
        backgroundColor: '#4CAF50',
    },
    declineButton: {
        backgroundColor: '#f44336',
    },
    cancelButton: {
        backgroundColor: '#ff9800',
        marginTop: 12,
    },
    actionButtonText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
        paddingHorizontal: 40,
    },
    emptyStateIcon: {
        fontSize: 64,
        marginBottom: 16,
    },
    emptyStateText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
        marginBottom: 8,
    },
    emptyStateSubtext: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
    },
});