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
import ReviewModal from '@/components/ReviewModal';
import CalendarView from '@/components/CalendarView';
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from '@/firebaseConfig';

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

    // State variables
    const { user } = useAuth();
    const [meetings, setMeetings] = useState<Meeting[]>([]);
    const [pendingRequests, setPendingRequests] = useState<Meeting[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Calendar state
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');

    // Review modal state
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
    const [reviewedMeetings, setReviewedMeetings] = useState<string[]>([]);

    // Load meetings on component mount and when user changes
    useEffect(() => {
        if (user) {
            loadMeetings();
            loadReviewedMeetings();
        }
    }, [user]);

    // Function to load meetings and pending requests
    const loadMeetings = async () => {
        if (!user) return;

        try {
            setLoading(true);

            // load meetings from API
            const allMeetings = await calendarService.getUserMeetings(user.uid);

            // Fetch fresh user names for all meetings
            const meetingsWithNames = await Promise.all(
                allMeetings.map(async (meeting: Meeting) => {
                    try {
                        // Fetch requester name
                        const requesterDoc = await getDoc(doc(db, 'users', meeting.requesterId));
                        const requesterData = requesterDoc.data();
                        const requesterName = requesterData?.displayName || requesterData?.email || meeting.requesterName || 'User';

                        // Fetch receiver name
                        const receiverDoc = await getDoc(doc(db, 'users', meeting.receiverId));
                        const receiverData = receiverDoc.data();
                        const receiverName = receiverData?.displayName || receiverData?.email || meeting.receiverName || 'User';

                        return {
                            ...meeting,
                            requesterName,
                            receiverName,
                        };
                    } catch (error) {
                        console.error('Error fetching names for meeting:', meeting.meetingId, error);
                        return meeting; // Return original if fetch fails
                    }
                })
            );

            setMeetings(meetingsWithNames);

            // load pending requests from API
            const pending = await calendarService.getPendingRequests(user.uid);
            // update state with pending requests
            setPendingRequests(pending);

            // Fetch fresh names for pending requests too
            const pendingWithNames = await Promise.all(
                pending.map(async (meeting: Meeting) => {
                    try {
                        const requesterDoc = await getDoc(doc(db, 'users', meeting.requesterId));
                        const requesterData = requesterDoc.data();
                        const requesterName = requesterData?.displayName || requesterData?.email || meeting.requesterName || 'User';

                        const receiverDoc = await getDoc(doc(db, 'users', meeting.receiverId));
                        const receiverData = receiverDoc.data();
                        const receiverName = receiverData?.displayName || receiverData?.email || meeting.receiverName || 'User';

                        return {
                            ...meeting,
                            requesterName,
                            receiverName,
                        };
                    } catch (error) {
                        console.error('Error fetching names for pending meeting:', meeting.meetingId, error);
                        return meeting;
                    }
                })
            );

            setPendingRequests(pendingWithNames);
        } catch (error) {
            console.error('Error loading meetings:', error);
            Alert.alert('Error', 'Failed to load meetings');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // Function to load reviewed meetings
    const loadReviewedMeetings = async () => {
        if (!user) return;

        try {
            // load reviews from Firestore
            const reviewsRef = collection(db, 'reviews');
            const q = query(reviewsRef, where('reviewerId', '==', user.uid));
            const snapshot = await getDocs(q);

            // extract meeting IDs from reviews
            const meetingIds = snapshot.docs.map(doc => doc.data().meetingId);
            // update state with reviewed meeting IDs
            setReviewedMeetings(meetingIds);
        } catch (error) {
            console.error('Error loading reviewed meetings:', error);
        }
    };

    // Handlers for accepting meeting
    const handleAcceptMeeting = async (meetingId: string) => {
        try {
            // accept meeting via API
            await calendarService.updateMeetingStatus(meetingId, 'accepted');
            Alert.alert('Success', 'Meeting accepted!');
            loadMeetings();
        } catch (error) {
            // error handling
            console.error('Error accepting meeting:', error);
            Alert.alert('Error', 'Failed to accept meeting');
        }
    };

    // Handlers for declining meeting
    const handleDeclineMeeting = async (meetingId: string) => {
        try {
            // decline meeting via API
            await calendarService.updateMeetingStatus(meetingId, 'declined');
            Alert.alert('Success', 'Meeting declined');
            loadMeetings();
        } catch (error) {
            // error handling
            console.error('Error declining meeting:', error);
            Alert.alert('Error', 'Failed to decline meeting');
        }
    };

    // Handler for cancelling meeting
    const handleCancelMeeting = async (meetingId: string) => {
        if (!user) return;

        // confirm cancellation
        Alert.alert('Cancel Meeting', 'Are you sure you want to cancel this meeting?', [
            { text: 'No', style: 'cancel' },
            {
                text: 'Yes',
                style: 'destructive',
                onPress: async () => {
                    try {
                        // cancel meeting via API
                        await calendarService.cancelMeeting(meetingId, user.uid);
                        Alert.alert('Success', 'Meeting cancelled');
                        loadMeetings();
                    } catch (error) {
                        // error handling
                        console.error('Error cancelling meeting:', error);
                        Alert.alert('Error', 'Failed to cancel meeting');
                    }
                },
            },
        ]);
    };

    // Handler for opening review modal
    const handleOpenReview = (meeting: Meeting) => {
        // set selected meeting and show modal
        setSelectedMeeting(meeting);
        setShowReviewModal(true);
    };

    // Handler for closing review modal
    const handleCloseReview = () => {
        // hide modal and clear selected meeting
        setShowReviewModal(false);
        setSelectedMeeting(null);
        loadReviewedMeetings();
    };

    // Handler for date selection in calendar
    const handleDateSelect = (date: Date) => {
        setSelectedDate(date);
    };

    // Utility functions for formatting and status colors
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
        });
    };

    // Utility function to format time
    const formatTime = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
    };

    // Utility function to get status color
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

    // Utility function to check if two dates are the same day
    const isSameDay = (date1: Date, date2: string) => {
        const d2 = new Date(date2);
        return (
            date1.getDate() === d2.getDate() &&
            date1.getMonth() === d2.getMonth() &&
            date1.getFullYear() === d2.getFullYear()
        );
    };

    // Utility function to check if meeting is completed
    const isMeetingCompleted = (endTime: string) => {
        return new Date(endTime) < new Date();
    };

    // Utility function to check if meeting has been reviewed
    const hasReviewed = (meetingId: string) => {
        return reviewedMeetings.includes(meetingId);
    };

    // Get meetings for selected date
    const getMeetingsForDate = () => {
        if (viewMode === 'list') {
            return meetings.filter(m => m.status === 'accepted');
        }
        return meetings.filter(
            (m) =>
                m.status === 'accepted' &&
                isSameDay(selectedDate, m.startTime)
        );
    };

    // Get all meeting dates for calendar dots
    const getMeetingDates = () => {
        return meetings
            .filter(m => m.status === 'accepted')
            .map(m => m.startTime);
    };

    // Render individual meeting card
    const renderMeetingCard = (meeting: Meeting, isPending: boolean = false) => {
        const isRequester = meeting.requesterId === user?.uid; // check if current user is requester
        const otherPersonName = isRequester ? meeting.receiverName : meeting.requesterName; // get other person's name
        const otherPersonId = isRequester ? meeting.receiverId : meeting.requesterId; // get other person's ID
        const isCompleted = isMeetingCompleted(meeting.endTime); // check if meeting is completed
        const canReview = isCompleted && meeting.status === 'accepted' && !hasReviewed(meeting.meetingId); // check if can review

        return (
            // meeting card container
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

                {meeting.status === 'accepted' && !isCompleted && (
                    <TouchableOpacity
                        style={[styles.actionButton, styles.cancelButton]}
                        onPress={() => handleCancelMeeting(meeting.meetingId)}
                    >
                        <Text style={styles.actionButtonText}>Cancel Meeting</Text>
                    </TouchableOpacity>
                )}

                {canReview && (
                    <TouchableOpacity
                        style={[styles.actionButton, styles.reviewButton]}
                        onPress={() => handleOpenReview(meeting)}
                    >
                        <Text style={styles.reviewButtonText}>⭐ Leave a Review</Text>
                    </TouchableOpacity>
                )}

                {hasReviewed(meeting.meetingId) && (
                    <View style={styles.reviewedBadge}>
                        <Text style={styles.reviewedText}>✓ Reviewed</Text>
                    </View>
                )}
            </View>
        );
    };

    const selectedDateMeetings = getMeetingsForDate();

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.loadingText}>Loading your calendar...</Text>
            </View>
        );
    }

    return (
        <>
            <ScrollView
                style={styles.container}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadMeetings} />}
            >
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>My Calendar</Text>
                    <Text style={styles.headerSubtitle}>{meetings.length} total meetings</Text>
                </View>

                {/* View Mode Toggle */}
                <View style={styles.toggleContainer}>
                    <TouchableOpacity
                        style={[styles.toggleButton, viewMode === 'calendar' && styles.toggleButtonActive]}
                        onPress={() => setViewMode('calendar')}
                    >
                        <Text style={[styles.toggleText, viewMode === 'calendar' && styles.toggleTextActive]}>
                            📅 Calendar View
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.toggleButton, viewMode === 'list' && styles.toggleButtonActive]}
                        onPress={() => setViewMode('list')}
                    >
                        <Text style={[styles.toggleText, viewMode === 'list' && styles.toggleTextActive]}>
                            📋 List View
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Pending Requests */}
                {pendingRequests.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>
                            📬 Pending Requests ({pendingRequests.length})
                        </Text>
                        {pendingRequests.map((meeting) => renderMeetingCard(meeting, true))}
                    </View>
                )}

                {/* Calendar View */}
                {viewMode === 'calendar' && (
                    <View style={styles.section}>
                        <CalendarView
                            onDateSelect={handleDateSelect}
                            selectedDate={selectedDate}
                            meetingDates={getMeetingDates()}
                        />

                        {/* Selected Date Meetings */}
                        <View style={styles.dateSection}>
                            <Text style={styles.dateSectionTitle}>
                                {selectedDate.toLocaleDateString('en-US', {
                                    weekday: 'long',
                                    month: 'long',
                                    day: 'numeric',
                                    year: 'numeric',
                                })}
                            </Text>
                            {selectedDateMeetings.length === 0 ? (
                                <View style={styles.noMeetings}>
                                    <Text style={styles.noMeetingsText}>No meetings on this date</Text>
                                </View>
                            ) : (
                                selectedDateMeetings.map((meeting) => renderMeetingCard(meeting))
                            )}
                        </View>
                    </View>
                )}

                {/* List View */}
                {viewMode === 'list' && (
                    <>
                        {selectedDateMeetings.filter(m => new Date(m.startTime) > new Date()).length > 0 && (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>
                                    📅 Upcoming Meetings (
                                    {selectedDateMeetings.filter(m => new Date(m.startTime) > new Date()).length})
                                </Text>
                                {selectedDateMeetings
                                    .filter(m => new Date(m.startTime) > new Date())
                                    .map((meeting) => renderMeetingCard(meeting))}
                            </View>
                        )}

                        {selectedDateMeetings.filter(m => new Date(m.startTime) <= new Date()).length > 0 && (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>
                                    📝 Past Meetings (
                                    {selectedDateMeetings.filter(m => new Date(m.startTime) <= new Date()).length})
                                </Text>
                                {selectedDateMeetings
                                    .filter(m => new Date(m.startTime) <= new Date())
                                    .map((meeting) => renderMeetingCard(meeting))}
                            </View>
                        )}
                    </>
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

            {/* Review Modal */}
            {selectedMeeting && (
                <ReviewModal
                    visible={showReviewModal}
                    onClose={handleCloseReview}
                    meetingId={selectedMeeting.meetingId}
                    reviewerId={user!.uid}
                    reviewerName={user!.displayName || user!.email || 'User'}
                    revieweeId={selectedMeeting.requesterId === user!.uid
                        ? selectedMeeting.receiverId
                        : selectedMeeting.requesterId}
                    revieweeName={selectedMeeting.requesterId === user!.uid
                        ? selectedMeeting.receiverName
                        : selectedMeeting.requesterName}
                />
            )}
        </>
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
    toggleContainer: {
        flexDirection: 'row',
        padding: 16,
        gap: 12,
    },
    toggleButton: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 10,
        backgroundColor: '#fff',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#E5E7EB',
    },
    toggleButtonActive: {
        backgroundColor: '#FCD34D',
        borderColor: '#FCD34D',
    },
    toggleText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6B7280',
    },
    toggleTextActive: {
        color: '#1F2937',
    },
    section: {
        marginTop: 8,
        paddingHorizontal: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 12,
        color: '#333',
    },
    dateSection: {
        marginTop: 20,
    },
    dateSectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 12,
    },
    noMeetings: {
        backgroundColor: '#fff',
        padding: 40,
        borderRadius: 12,
        alignItems: 'center',
    },
    noMeetingsText: {
        fontSize: 14,
        color: '#9CA3AF',
        fontStyle: 'italic',
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
    reviewButton: {
        backgroundColor: '#FCD34D',
        marginTop: 12,
    },
    actionButtonText: {
        color: 'white',
        fontSize: 14,
        fontWeight: '600',
    },
    reviewButtonText: {
        color: '#1F2937',
        fontSize: 14,
        fontWeight: '600',
    },
    reviewedBadge: {
        backgroundColor: '#E8F5E9',
        padding: 10,
        borderRadius: 8,
        marginTop: 12,
        alignItems: 'center',
    },
    reviewedText: {
        color: '#4CAF50',
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