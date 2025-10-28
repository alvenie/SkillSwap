// ==========================================
// VIDEO CHAT SCREEN COMPONENT
// ==========================================
// This is the main video calling interface that handles user discovery,
// real-time presence, call initiation, and active call management.
// It integrates with Firebase for user data and Agora for video streaming.

import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    TextInput,
    FlatList,
    Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';
import { collection, query, where, getDocs, addDoc, onSnapshot, doc } from 'firebase/firestore';
import apiClient from '../../services/apiService';

// ==========================================
// TYPE DEFINITIONS
// ==========================================

/**
 * IMPORTANT: User interface definition
 * Represents a user in the system with their online status and identity info.
 * The status field is critical for determining if someone can receive calls.
 */
interface User {
    id: string;                              // Unique identifier
    uid: string;                             // Firebase user ID
    email: string;                           // User's email address
    displayName: string;                     // Name shown in the UI
    status: 'online' | 'offline' | 'in-call'; // Real-time availability status
    lastSeen: string;                        // ISO timestamp of last activity
}

/**
 * CRITICAL: ActiveCall interface
 * This holds all the necessary data for maintaining an active video call session.
 * Contains Agora credentials (appId, token) which are essential for connecting
 * to the video streaming service.
 */
interface ActiveCall {
    id: string;           // Unique call identifier
    sessionId: string;    // Backend session ID for tracking
    channelName: string;  // Agora channel name - must match between caller/receiver
    token: string;        // Authentication token for this call
    userId: string;       // Current user's ID
    userName: string;     // Current user's display name
    status: 'active' | 'ended'; // Call state
    startTime: string;    // When the call started (ISO format)
    agoraToken: string;   // Agora-specific authentication token
    appId: string;        // Agora application ID
}

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function VideoChatScreen() {
    // Auth context - provides current logged-in user
    const { user } = useAuth();

    // ==========================================
    // STATE MANAGEMENT - User Lists & Search
    // ==========================================

    // Complete list of all users from database
    const [users, setUsers] = useState<User[]>([]);

    // Filtered list based on search query (displayed to user)
    const [filteredUsers, setFilteredUsers] = useState<User[]>([]);

    // Current search input value
    const [searchText, setSearchText] = useState('');

    // Loading state while fetching initial user list
    const [loading, setLoading] = useState(true);

    // IMPORTANT: Real-time list of UIDs for users who are currently online
    // This is updated via Firebase listener and used to show online indicators
    const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

    // ==========================================
    // STATE MANAGEMENT - Call Flow
    // ==========================================

    // Controls visibility of the call confirmation modal
    const [showCallModal, setShowCallModal] = useState(false);

    // The user we're about to call (set when modal opens)
    const [selectedUser, setSelectedUser] = useState<User | null>(null);

    // True while setting up the call (prevents double-clicking)
    const [callInProgress, setCallInProgress] = useState(false);

    // CRITICAL: Active call data - when this is set, we're in an active call
    // Contains all credentials needed to connect to the video stream
    const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);

    // Call duration in seconds (incremented every second during call)
    const [callDuration, setCallDuration] = useState(0);

    // Reference to the interval timer for call duration tracking
    const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ==========================================
    // EFFECT: Initial Data Load
    // ==========================================
    /**
     * IMPORTANT: Runs once on component mount
     * Loads the user list and sets up real-time status monitoring
     */
    useEffect(() => {
        loadUsers();                  // Fetch all users from Firestore
        subscribeToUserStatus();      // Start listening to status changes
    }, []);

    // ==========================================
    // EFFECT: Call Duration Timer
    // ==========================================
    /**
     * IMPORTANT: Manages the call duration counter
     * Starts counting when a call becomes active and cleans up when it ends.
     * The cleanup function is critical to prevent memory leaks.
     */
    useEffect(() => {
        if (activeCall) {
            // Start incrementing duration every second
            const timer = setInterval(() => {
                setCallDuration(prev => prev + 1);
            }, 1000);
            callTimerRef.current = timer;
        }

        // Cleanup function - runs when component unmounts or when activeCall changes
        return () => {
            if (callTimerRef.current) {
                clearInterval(callTimerRef.current);
                callTimerRef.current = null;
            }
        };
    }, [activeCall]);

    // ==========================================
    // FUNCTION: Load Users from Database
    // ==========================================
    /**
     * IMPORTANT: Fetches all registered users from Firestore
     * Excludes the current user from the list (can't call yourself)
     * Sets up the initial user list that will be displayed and searchable
     */
    const loadUsers = async () => {
        try {
            setLoading(true);

            // Get reference to the users collection in Firestore
            const usersRef = collection(db, 'users');
            const querySnapshot = await getDocs(usersRef);

            const usersData: User[] = [];

            // Process each user document
            querySnapshot.forEach((doc) => {
                // Skip current user - we don't want to see ourselves in the list
                if (doc.id !== user?.uid) {
                    usersData.push({
                        id: doc.id,
                        uid: doc.id,
                        email: doc.data().email,
                        // Use displayName if available, otherwise fall back to email
                        displayName: doc.data().displayName || doc.data().email,
                        status: 'offline', // Default status, will be updated by real-time listener
                        lastSeen: doc.data().lastSeen || new Date().toISOString(),
                    });
                }
            });

            // Update both the full list and filtered list
            setUsers(usersData);
            setFilteredUsers(usersData);
        } catch (error: any) {
            console.error('Error loading users:', error);
            Alert.alert('Error', 'Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    // ==========================================
    // FUNCTION: Real-Time Status Monitoring
    // ==========================================
    /**
     * CRITICAL: Sets up Firebase listener for real-time user status updates
     * This is what makes the green/gray online indicators work in real-time.
     * Uses onSnapshot which pushes updates whenever user status changes in the database.
     */
    const subscribeToUserStatus = () => {
        try {
            const usersRef = collection(db, 'users');

            // onSnapshot creates a real-time listener
            const unsubscribe = onSnapshot(usersRef, (querySnapshot) => {
                const onlineUids: string[] = [];

                // Check each user's status
                querySnapshot.forEach((doc) => {
                    // Only include users marked as online (excluding ourselves)
                    if (doc.data().status === 'online' && doc.id !== user?.uid) {
                        onlineUids.push(doc.id);
                    }
                });

                // Update the online users list - this triggers UI updates
                setOnlineUsers(onlineUids);
            });

            // Return the unsubscribe function for cleanup
            return unsubscribe;
        } catch (error) {
            console.error('Error subscribing to user status:', error);
        }
    };

    // ==========================================
    // FUNCTION: Search Filter
    // ==========================================
    /**
     * Medium importance: Filters the user list based on search input
     * Searches through both display names and email addresses
     * Case-insensitive search for better UX
     */
    const handleSearch = (text: string) => {
        setSearchText(text);

        if (text.trim() === '') {
            // Empty search - show all users
            setFilteredUsers(users);
        } else {
            // Filter users by name or email
            const filtered = users.filter(
                (u) =>
                    u.displayName.toLowerCase().includes(text.toLowerCase()) ||
                    u.email.toLowerCase().includes(text.toLowerCase())
            );
            setFilteredUsers(filtered);
        }
    };

    // ==========================================
    // FUNCTION: Initiate Call Request
    // ==========================================
    /**
     * IMPORTANT: Pre-call validation and modal trigger
     * Checks user authentication and online status before showing call modal.
     * This prevents wasting API calls on users who aren't available.
     */
    const startVideoCall = async (targetUser: User) => {
        // Verify current user is logged in
        if (!user) {
            Alert.alert('Error', 'You must be logged in');
            return;
        }

        // IMPORTANT: Check if target user is online before proceeding
        // Prevents calling someone who's offline
        if (!onlineUsers.includes(targetUser.uid)) {
            Alert.alert('User Offline', `${targetUser.displayName} is not online`);
            return;
        }

        // Set selected user and show confirmation modal
        setSelectedUser(targetUser);
        setShowCallModal(true);
    };

    // ==========================================
    // FUNCTION: Complete Call Setup Process
    // ==========================================
    /**
     * CRITICAL: This is the most complex and important function in the component
     *
     * Call setup flow:
     * 1. Generate a unique channel name (timestamp-based)
     * 2. Convert user UID to numeric ID (required by Agora)
     * 3. Request Agora token from backend (authenticates us to Agora servers)
     * 4. Create session on backend (for tracking and billing)
     * 5. Start recording (optional, for quality assurance)
     * 6. Store call data locally and send notification to recipient
     *
     * This function makes THREE API calls in sequence - all must succeed
     * for the call to work properly.
     */
    const initiateCall = async () => {
        if (!user || !selectedUser) return;

        try {
            setCallInProgress(true);

            // STEP 1: Generate unique channel name
            // Uses timestamp to ensure uniqueness across all calls
            const channelName = `call-${Date.now()}`;

            // STEP 2: IMPORTANT - Convert string UID to numeric user ID
            // Agora requires a uint32 user ID, but Firebase uses string UIDs
            // This hash function converts the string to a valid positive integer
            let userId = 0;
            for (let i = 0; i < user.uid.length; i++) {
                userId = ((userId << 5) - userId) + user.uid.charCodeAt(i);
                userId = userId & userId; // Force 32-bit integer
            }
            userId = Math.abs(userId >>> 0); // Ensure positive uint32

            console.log('📱 User ID:', userId, 'Type:', typeof userId);

            // STEP 3: Request Agora authentication token
            // This token proves we're authorized to join this specific channel
            const tokenRequestData = {
                channelName,
                userId: userId,
                expirationSeconds: 3600, // Token valid for 1 hour
            };

            console.log('📡 Sending token request:', JSON.stringify(tokenRequestData, null, 2));

            const tokenResponse = await apiClient.post('/Video/generate-token', tokenRequestData);
            console.log('✅ Token response:', tokenResponse.data);

            // STEP 4: Create session on backend
            // This tracks the call for analytics, billing, and quality monitoring
            const sessionRequestData = {
                channelName,
                hostId: user.uid,
                instructorName: user.displayName || user.email || 'User',
                studentId: selectedUser.uid,
                studentName: selectedUser.displayName,
                skillName: 'Video Call',
                maxDurationMinutes: 60,
                recordingEnabled: false,
            };

            console.log('📡 Sending session request:', JSON.stringify(sessionRequestData, null, 2));

            const sessionResponse = await apiClient.post('/Video/create-session', sessionRequestData);
            console.log('✅ Session response:', sessionResponse.data);

            // STEP 5: Start recording (if enabled)
            // This allows quality review and dispute resolution
            const recordingRequestData = {
                sessionId: sessionResponse.data.sessionId,
                channelName,
                outputFormat: 'mp4',
            };

            console.log('📡 Sending recording request:', JSON.stringify(recordingRequestData, null, 2));

            const recordingResponse = await apiClient.post('/Video/start-recording', recordingRequestData);
            console.log('✅ Recording response:', recordingResponse.data);

            // STEP 6: Create local call data object
            // This contains everything needed to render the call UI and connect to Agora
            const callData: ActiveCall = {
                id: sessionResponse.data.sessionId,
                sessionId: sessionResponse.data.sessionId,
                channelName,
                token: tokenResponse.data.token,
                userId: user.uid,
                userName: user.displayName || user.email || 'User',
                status: 'active',
                startTime: new Date().toISOString(),
                agoraToken: tokenResponse.data.token,
                appId: tokenResponse.data.appId, // Agora app ID from backend
            };

            // Update state to show call UI
            setActiveCall(callData);
            setCallDuration(0); // Reset timer
            setShowCallModal(false); // Close modal

            // STEP 7: Notify the recipient
            // Sends a Firestore notification that the other user's app will detect
            await sendCallNotification(selectedUser.uid, {
                callerId: user.uid,
                callerName: user.displayName || user.email || 'User',
                sessionId: sessionResponse.data.sessionId,
                channelName,
                token: tokenResponse.data.token,
                appId: tokenResponse.data.appId,
            });

            Alert.alert('Success', `Connected with ${selectedUser.displayName}`);
        } catch (error: any) {
            console.error('Error starting call:', error);

            // IMPORTANT: Handle validation errors from backend
            // Backend returns detailed field-level errors that we display to user
            if (error.response?.data?.errors) {
                const errors = error.response.data.errors;
                const errorMessages = Object.entries(errors)
                    .map(([key, value]: any) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
                    .join('\n');
                Alert.alert('Error', errorMessages);
            } else {
                Alert.alert('Error', error.message || 'Failed to start call');
            }
        } finally {
            setCallInProgress(false);
        }
    };

    // ==========================================
    // FUNCTION: Send Call Notification
    // ==========================================
    /**
     * IMPORTANT: Notifies recipient about incoming call
     * Creates a document in Firestore that the recipient's app listens for.
     * This is how the "incoming call" notification works on the other device.
     */
    const sendCallNotification = async (recipientUid: string, callInfo: any) => {
        try {
            await addDoc(collection(db, 'callNotifications'), {
                recipientUid,
                callerUid: user?.uid,
                callerName: user?.displayName || user?.email || 'User',
                callInfo,
                timestamp: new Date().toISOString(),
                status: 'pending', // Will be updated to 'accepted' or 'rejected'
            });
        } catch (error) {
            console.error('Error sending call notification:', error);
        }
    };

    // ==========================================
    // FUNCTION: End Active Call
    // ==========================================
    /**
     * IMPORTANT: Properly terminates an active call
     * Must notify backend to:
     * 1. Stop recording
     * 2. Release channel resources
     * 3. Calculate final bill/duration
     * 4. Clean up server-side session data
     */
    const endCall = async () => {
        if (!activeCall) return;

        try {
            // Notify backend to end session
            const endCallData = {
                sessionId: activeCall.sessionId,
                reason: 'Call ended by user',
            };

            console.log('📡 Ending call:', JSON.stringify(endCallData, null, 2));

            await apiClient.post('/Video/end-session', endCallData);
            console.log('✅ Call ended successfully');

            // Clear local call state
            setActiveCall(null);
            setCallDuration(0);

            Alert.alert('Call Ended', 'The call has been ended');
        } catch (error: any) {
            console.error('Error ending call:', error);

            // Even if API call fails, clear local state
            // This ensures user can exit the call screen
            setActiveCall(null);
            setCallDuration(0);

            Alert.alert('Error', error.message || 'Failed to end call properly');
        }
    };

    // ==========================================
    // HELPER: Format Call Duration
    // ==========================================
    /**
     * Simple utility function to display call duration as MM:SS
     * Takes total seconds and formats it for display
     */
    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // ==========================================
    // RENDER: Active Call UI
    // ==========================================
    /**
     * CRITICAL: Renders the in-call interface
     * This takes over the entire screen when a call is active.
     * Shows call duration, video placeholders (for when Agora view is integrated),
     * and control buttons (mute, video toggle, end call, speaker).
     */
    if (activeCall) {
        return (
            <SafeAreaView style={styles.callContainer}>
                {/* Call header with participant name and duration */}
                <View style={styles.callHeader}>
                    <Text style={styles.callTitle}>
                        Call with {selectedUser?.displayName || 'Unknown'}
                    </Text>
                    <Text style={styles.callDuration}>
                        {formatDuration(callDuration)}
                    </Text>
                </View>

                {/* Video container - placeholders for actual video views */}
                <View style={styles.videoContainer}>
                    {/* Local video (your camera) */}
                    <View style={styles.localVideoPlaceholder}>
                        <Text style={styles.videoPlaceholderText}>Your Video</Text>
                        <Text style={styles.videoPlaceholderSubtext}>
                            Camera feed will appear here
                        </Text>
                    </View>

                    {/* Remote video (other person's camera) */}
                    <View style={styles.remoteVideoPlaceholder}>
                        <Text style={styles.videoPlaceholderText}>
                            {selectedUser?.displayName || 'Remote User'}
                        </Text>
                        <Text style={styles.videoPlaceholderSubtext}>
                            Their video will appear here
                        </Text>
                    </View>
                </View>

                {/* Call control buttons */}
                <View style={styles.callControls}>
                    {/* Mute/unmute microphone */}
                    <TouchableOpacity
                        style={[styles.controlButton, styles.muteButton]}
                        onPress={() => Alert.alert('Mute', 'Mute functionality to be implemented')}
                    >
                        <Text style={styles.controlButtonText}>🎤</Text>
                    </TouchableOpacity>

                    {/* Toggle video on/off */}
                    <TouchableOpacity
                        style={[styles.controlButton, styles.videoButton]}
                        onPress={() => Alert.alert('Video', 'Video toggle to be implemented')}
                    >
                        <Text style={styles.controlButtonText}>📹</Text>
                    </TouchableOpacity>

                    {/* End call button (red) */}
                    <TouchableOpacity
                        style={[styles.controlButton, styles.endCallButton]}
                        onPress={endCall}
                    >
                        <Text style={styles.controlButtonText}>📞</Text>
                    </TouchableOpacity>

                    {/* Speaker toggle */}
                    <TouchableOpacity
                        style={[styles.controlButton, styles.speakerButton]}
                        onPress={() => Alert.alert('Speaker', 'Speaker toggle to be implemented')}
                    >
                        <Text style={styles.controlButtonText}>🔊</Text>
                    </TouchableOpacity>
                </View>

                {/* Debug info - session details for development */}
                <View style={styles.sessionInfo}>
                    <Text style={styles.sessionInfoText}>
                        Session: {activeCall.sessionId}
                    </Text>
                    <Text style={styles.sessionInfoText}>
                        Channel: {activeCall.channelName}
                    </Text>
                    <Text style={styles.sessionInfoText}>
                        App ID: {activeCall.appId}
                    </Text>
                </View>
            </SafeAreaView>
        );
    }

    // ==========================================
    // RENDER: Main User List UI
    // ==========================================
    /**
     * Default UI - shows when no call is active
     * Displays searchable list of users with online indicators
     */
    return (
        <SafeAreaView style={styles.container}>
            <ScrollView style={styles.content}>
                {/* Page header */}
                <View style={styles.header}>
                    <Text style={styles.title}>Video Chat</Text>
                    <Text style={styles.subtitle}>
                        Select a user to start a video call
                    </Text>
                </View>

                {/* Search box */}
                <View style={styles.searchContainer}>
                    <TextInput
                        style={styles.searchBox}
                        placeholder="Search users..."
                        placeholderTextColor="#999"
                        value={searchText}
                        onChangeText={handleSearch}
                    />
                </View>

                {/* Loading indicator while fetching users */}
                {loading ? (
                    <View style={styles.emptyContainer}>
                        <ActivityIndicator size="large" color="#007AFF" />
                        <Text style={styles.emptyText}>Loading users...</Text>
                    </View>
                ) : (
                    <>
                        {/* Online users section */}
                        {filteredUsers.filter(u => onlineUsers.includes(u.uid)).length > 0 && (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>
                                    Online ({filteredUsers.filter(u => onlineUsers.includes(u.uid)).length})
                                </Text>

                                {/* List of online users */}
                                {filteredUsers
                                    .filter(u => onlineUsers.includes(u.uid))
                                    .map(user => (
                                        <TouchableOpacity
                                            key={user.id}
                                            style={styles.userCard}
                                            onPress={() => startVideoCall(user)}
                                        >
                                            <View style={styles.userCardContent}>
                                                <View style={styles.userInfo}>
                                                    <Text style={styles.userName}>
                                                        {user.displayName}
                                                    </Text>
                                                    <Text style={styles.userEmail}>
                                                        {user.email}
                                                    </Text>
                                                    <View style={styles.statusRow}>
                                                        {/* Green dot for online users */}
                                                        <View
                                                            style={[
                                                                styles.statusIndicator,
                                                                { backgroundColor: '#4CAF50' }
                                                            ]}
                                                        />
                                                        <Text style={styles.statusText}>
                                                            Online
                                                        </Text>
                                                    </View>
                                                </View>
                                                {/* Call button */}
                                                <TouchableOpacity
                                                    style={styles.callButton}
                                                    onPress={() => startVideoCall(user)}
                                                >
                                                    <Text style={styles.callButtonText}>📞</Text>
                                                </TouchableOpacity>
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                            </View>
                        )}

                        {/* Offline users section */}
                        {filteredUsers.filter(u => !onlineUsers.includes(u.uid)).length > 0 && (
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>
                                    Offline ({filteredUsers.filter(u => !onlineUsers.includes(u.uid)).length})
                                </Text>

                                {/* List of offline users */}
                                {filteredUsers
                                    .filter(u => !onlineUsers.includes(u.uid))
                                    .map(user => (
                                        <View key={user.id} style={styles.userCard}>
                                            <View style={styles.userCardContent}>
                                                <View style={styles.userInfo}>
                                                    <Text style={styles.userName}>
                                                        {user.displayName}
                                                    </Text>
                                                    <Text style={styles.userEmail}>
                                                        {user.email}
                                                    </Text>
                                                    <View style={styles.statusRow}>
                                                        {/* Gray dot for offline users */}
                                                        <View
                                                            style={[
                                                                styles.statusIndicator,
                                                                { backgroundColor: '#999' }
                                                            ]}
                                                        />
                                                        <Text style={styles.statusText}>
                                                            Offline
                                                        </Text>
                                                    </View>
                                                </View>
                                                {/* Disabled call button for offline users */}
                                                <View
                                                    style={[
                                                        styles.callButton,
                                                        { backgroundColor: '#ccc' }
                                                    ]}
                                                >
                                                    <Text style={styles.callButtonText}>📞</Text>
                                                </View>
                                            </View>
                                        </View>
                                    ))}
                            </View>
                        )}

                        {/* Empty state when no users found */}
                        {filteredUsers.length === 0 && (
                            <View style={styles.emptyContainer}>
                                <Text style={styles.emptyText}>
                                    {searchText ? 'No users found' : 'No users available'}
                                </Text>
                            </View>
                        )}
                    </>
                )}

                {/* Bottom spacing for scroll comfort */}
                <View style={styles.bottomSpacer} />
            </ScrollView>

            {/* ==========================================
                CALL CONFIRMATION MODAL
                Shows before initiating a call to confirm action
                ========================================== */}
            <Modal
                visible={showCallModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowCallModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.callModal}>
                        <Text style={styles.modalTitle}>Start Video Call?</Text>

                        {/* Show who we're about to call */}
                        <View style={styles.modalContent}>
                            <Text style={styles.modalText}>
                                {selectedUser?.displayName}
                            </Text>
                            <Text style={styles.modalEmail}>
                                {selectedUser?.email}
                            </Text>
                        </View>

                        {/* Action buttons */}
                        <View style={styles.modalButtons}>
                            {/* Cancel button */}
                            <TouchableOpacity
                                style={[styles.modalButton, styles.cancelButton]}
                                onPress={() => setShowCallModal(false)}
                                disabled={callInProgress}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>

                            {/* Confirm/Start call button */}
                            <TouchableOpacity
                                style={[styles.modalButton, styles.confirmButton]}
                                onPress={initiateCall}
                                disabled={callInProgress}
                            >
                                {callInProgress ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.confirmButtonText}>Start Call</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

// ==========================================
// STYLES
// ==========================================
// All styling for the component
// Organized by section for easier navigation
const styles = StyleSheet.create({
    // Main container styles
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    content: {
        flex: 1,
        padding: 20,
    },

    // Header section
    header: {
        marginBottom: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#666',
    },

    // Search box
    searchContainer: {
        marginBottom: 20,
    },
    searchBox: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 12,
        fontSize: 16,
        borderWidth: 1,
        borderColor: '#ddd',
        color: '#333',
    },

    // Section headers (Online/Offline)
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
        marginBottom: 12,
    },

    // User card styling
    userCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    userCardContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    userInfo: {
        flex: 1,
    },
    userName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    userEmail: {
        fontSize: 14,
        color: '#666',
        marginBottom: 8,
    },

    // Status indicator (online/offline dot)
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusIndicator: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 6,
    },
    statusText: {
        fontSize: 13,
        color: '#666',
    },

    // Call button on user cards
    callButton: {
        backgroundColor: '#007AFF',
        width: 50,
        height: 50,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
    },
    callButtonText: {
        fontSize: 24,
    },

    // Empty state styling
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 40,
    },
    emptyText: {
        fontSize: 16,
        color: '#999',
    },
    bottomSpacer: {
        height: 20,
    },

    // Active call UI styles
    callContainer: {
        flex: 1,
        backgroundColor: '#000',
        justifyContent: 'space-between',
    },
    callHeader: {
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 16,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    callTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 8,
    },
    callDuration: {
        fontSize: 18,
        color: '#4CAF50',
        fontWeight: '600',
    },

    // Video view containers
    videoContainer: {
        flex: 1,
        justifyContent: 'space-between',
        padding: 20,
    },
    localVideoPlaceholder: {
        flex: 0.4,
        backgroundColor: '#1a1a1a',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#007AFF',
    },
    remoteVideoPlaceholder: {
        flex: 0.4,
        backgroundColor: '#1a1a1a',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#4CAF50',
    },
    videoPlaceholderText: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 8,
    },
    videoPlaceholderSubtext: {
        fontSize: 14,
        color: '#999',
    },

    // Call control buttons
    callControls: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingVertical: 20,
        paddingHorizontal: 20,
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
    },
    controlButton: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
    },
    muteButton: {
        backgroundColor: '#4CAF50',
    },
    videoButton: {
        backgroundColor: '#4CAF50',
    },
    endCallButton: {
        backgroundColor: '#F44336',
    },
    speakerButton: {
        backgroundColor: '#4CAF50',
    },
    controlButtonText: {
        fontSize: 24,
    },

    // Session info (debug panel)
    sessionInfo: {
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        borderTopWidth: 1,
        borderTopColor: '#333',
    },
    sessionInfoText: {
        fontSize: 12,
        color: '#999',
        marginBottom: 4,
        fontFamily: 'monospace',
    },

    // Call confirmation modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    callModal: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        paddingBottom: 40,
    },
    modalTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 20,
        textAlign: 'center',
    },
    modalContent: {
        alignItems: 'center',
        marginBottom: 30,
    },
    modalText: {
        fontSize: 18,
        color: '#333',
        marginBottom: 8,
    },
    modalEmail: {
        fontSize: 14,
        color: '#666',
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    modalButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    cancelButton: {
        backgroundColor: '#f0f0f0',
    },
    confirmButton: {
        backgroundColor: '#007AFF',
    },
    cancelButtonText: {
        color: '#007AFF',
        fontSize: 16,
        fontWeight: '600',
    },
    confirmButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
});