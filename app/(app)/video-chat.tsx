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

interface User {
    id: string;
    uid: string;
    email: string;
    displayName: string;
    status: 'online' | 'offline' | 'in-call';
    lastSeen: string;
}

interface ActiveCall {
    id: string;
    sessionId: string;
    channelName: string;
    token: string;
    userId: string;
    userName: string;
    status: 'active' | 'ended';
    startTime: string;
    agoraToken: string;
    appId: string;
}

export default function VideoChatScreen() {
    const { user } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
    const [searchText, setSearchText] = useState('');
    const [loading, setLoading] = useState(true);
    const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

    const [showCallModal, setShowCallModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [callInProgress, setCallInProgress] = useState(false);
    const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
    const [callDuration, setCallDuration] = useState(0);
    const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        loadUsers();
        subscribeToUserStatus();
    }, []);

    useEffect(() => {
        if (activeCall) {
            const timer = setInterval(() => {
                setCallDuration(prev => prev + 1);
            }, 1000);
            callTimerRef.current = timer;
        }
        return () => {
            if (callTimerRef.current) {
                clearInterval(callTimerRef.current);
                callTimerRef.current = null;
            }
        };
    }, [activeCall]);

    const loadUsers = async () => {
        try {
            setLoading(true);
            const usersRef = collection(db, 'users');
            const querySnapshot = await getDocs(usersRef);

            const usersData: User[] = [];
            querySnapshot.forEach((doc) => {
                if (doc.id !== user?.uid) {
                    usersData.push({
                        id: doc.id,
                        uid: doc.id,
                        email: doc.data().email,
                        displayName: doc.data().displayName || doc.data().email,
                        status: 'offline',
                        lastSeen: doc.data().lastSeen || new Date().toISOString(),
                    });
                }
            });

            setUsers(usersData);
            setFilteredUsers(usersData);
        } catch (error: any) {
            console.error('Error loading users:', error);
            Alert.alert('Error', 'Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    const subscribeToUserStatus = () => {
        try {
            const usersRef = collection(db, 'users');
            const unsubscribe = onSnapshot(usersRef, (querySnapshot) => {
                const onlineUids: string[] = [];
                querySnapshot.forEach((doc) => {
                    if (doc.data().status === 'online' && doc.id !== user?.uid) {
                        onlineUids.push(doc.id);
                    }
                });
                setOnlineUsers(onlineUids);
            });

            return unsubscribe;
        } catch (error) {
            console.error('Error subscribing to user status:', error);
        }
    };

    const handleSearch = (text: string) => {
        setSearchText(text);
        if (text.trim() === '') {
            setFilteredUsers(users);
        } else {
            const filtered = users.filter(
                (u) =>
                    u.displayName.toLowerCase().includes(text.toLowerCase()) ||
                    u.email.toLowerCase().includes(text.toLowerCase())
            );
            setFilteredUsers(filtered);
        }
    };

    const startVideoCall = async (targetUser: User) => {
        if (!user) {
            Alert.alert('Error', 'You must be logged in');
            return;
        }

        if (!onlineUsers.includes(targetUser.uid)) {
            Alert.alert('User Offline', `${targetUser.displayName} is not online`);
            return;
        }

        setSelectedUser(targetUser);
        setShowCallModal(true);
    };

    // ✅ COMPLETELY FIXED: NO "request" wrapper - Direct API calls
    const initiateCall = async () => {
        if (!user || !selectedUser) return;

        try {
            setCallInProgress(true);

            const channelName = `call-${Date.now()}`;

            // Generate valid userId
            let userId = 0;
            for (let i = 0; i < user.uid.length; i++) {
                userId = ((userId << 5) - userId) + user.uid.charCodeAt(i);
                userId = userId & userId;
            }
            userId = Math.abs(userId >>> 0);

            console.log('📱 User ID:', userId, 'Type:', typeof userId);

            // ✅ NO "request" wrapper - send DIRECTLY
            const tokenRequestData = {
                channelName,
                userId: userId,
                expirationSeconds: 3600,
            };

            console.log('📡 Sending token request:', JSON.stringify(tokenRequestData, null, 2));

            const tokenResponse = await apiClient.post('/Video/generate-token', tokenRequestData);
            console.log('✅ Token response:', tokenResponse.data);

            // ✅ NO "request" wrapper - send DIRECTLY
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

            // ✅ NO "request" wrapper - send DIRECTLY
            const recordingRequestData = {
                sessionId: sessionResponse.data.sessionId,
                channelName,
                outputFormat: 'mp4',
            };

            console.log('📡 Sending recording request:', JSON.stringify(recordingRequestData, null, 2));

            const recordingResponse = await apiClient.post('/Video/start-recording', recordingRequestData);
            console.log('✅ Recording response:', recordingResponse.data);

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
                appId: tokenResponse.data.appId,
            };

            setActiveCall(callData);
            setCallDuration(0);
            setShowCallModal(false);

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

    const sendCallNotification = async (recipientUid: string, callInfo: any) => {
        try {
            await addDoc(collection(db, 'callNotifications'), {
                recipientUid,
                callerUid: user?.uid,
                callerName: user?.displayName || user?.email || 'User',
                callInfo,
                timestamp: new Date().toISOString(),
                status: 'pending',
            });
        } catch (error) {
            console.error('Error sending call notification:', error);
        }
    };

    // ✅ NO "request" wrapper - send DIRECTLY
    const endCall = async () => {
        if (!activeCall) return;

        try {
            const endCallData = {
                sessionId: activeCall.sessionId,
                reason: 'Call ended by user',
            };

            console.log('📡 Sending end call request:', JSON.stringify(endCallData, null, 2));
            await apiClient.post('/Video/end-session', endCallData);
            console.log('✅ Call ended successfully');

            try {
                // ✅ Send recordingId in request body
                const stopRecordingData = {
                    recordingId: activeCall.id,
                };
                console.log('📡 Sending stop recording request:', JSON.stringify(stopRecordingData, null, 2));
                await apiClient.post(`/Video/stop-recording/${activeCall.id}`, stopRecordingData);
                console.log('✅ Recording stopped');
            } catch (recordingError) {
                console.error('Error stopping recording:', recordingError);
            }

            setActiveCall(null);
            setCallDuration(0);
        } catch (error: any) {
            console.error('Error ending call:', error);
            Alert.alert('Error', 'Failed to end call');
        }
    };

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const renderUserCard = (user: User) => {
        const isOnline = onlineUsers.includes(user.uid);
        return (
            <View key={user.uid} style={styles.userCard}>
                <View style={styles.userCardContent}>
                    <View style={styles.userInfo}>
                        <Text style={styles.userName}>{user.displayName}</Text>
                        <Text style={styles.userEmail}>{user.email}</Text>
                        <View style={styles.statusRow}>
                            <View
                                style={[
                                    styles.statusIndicator,
                                    { backgroundColor: isOnline ? '#4CAF50' : '#ccc' },
                                ]}
                            />
                            <Text style={styles.statusText}>
                                {isOnline ? 'Online' : 'Offline'}
                            </Text>
                        </View>
                    </View>
                    <TouchableOpacity
                        style={[styles.callButton, { opacity: isOnline ? 1 : 0.5 }]}
                        onPress={() => startVideoCall(user)}
                        disabled={!isOnline}
                    >
                        <Text style={styles.callButtonText}>📞</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    if (activeCall) {
        return (
            <SafeAreaView style={styles.callContainer}>
                <View style={styles.callHeader}>
                    <Text style={styles.callTitle}>{selectedUser?.displayName}</Text>
                    <Text style={styles.callDuration}>{formatDuration(callDuration)}</Text>
                </View>

                <View style={styles.videoContainer}>
                    <View style={styles.localVideoPlaceholder}>
                        <Text style={styles.videoPlaceholderText}>📱 Your Video</Text>
                        <Text style={styles.videoPlaceholderSubtext}>(Camera disabled)</Text>
                    </View>

                    <View style={styles.remoteVideoPlaceholder}>
                        <Text style={styles.videoPlaceholderText}>📹 {selectedUser?.displayName}</Text>
                        <Text style={styles.videoPlaceholderSubtext}>(Remote video stream)</Text>
                    </View>
                </View>

                <View style={styles.callControls}>
                    <TouchableOpacity style={[styles.controlButton, styles.muteButton]}>
                        <Text style={styles.controlButtonText}>🔇</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.controlButton, styles.videoButton]}>
                        <Text style={styles.controlButtonText}>📹</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.controlButton, styles.endCallButton]}
                        onPress={endCall}
                    >
                        <Text style={styles.controlButtonText}>📞</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.controlButton, styles.speakerButton]}>
                        <Text style={styles.controlButtonText}>🔊</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.sessionInfo}>
                    <Text style={styles.sessionInfoText}>Session: {activeCall.sessionId}</Text>
                    <Text style={styles.sessionInfoText}>Channel: {activeCall.channelName}</Text>
                </View>
            </SafeAreaView>
        );
    }

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.emptyContainer}>
                    <ActivityIndicator size="large" color="#007AFF" />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <Text style={styles.title}>Video Chat</Text>
                    <Text style={styles.subtitle}>{onlineUsers.length} user(s) online</Text>
                </View>

                <View style={styles.searchContainer}>
                    <TextInput
                        style={styles.searchBox}
                        placeholder="Search users..."
                        value={searchText}
                        onChangeText={handleSearch}
                        placeholderTextColor="#999"
                    />
                </View>

                {onlineUsers.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>🟢 Online</Text>
                        {filteredUsers
                            .filter((u) => onlineUsers.includes(u.uid))
                            .map(renderUserCard)}
                    </View>
                )}

                {filteredUsers.some((u) => !onlineUsers.includes(u.uid)) && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>⚪ Offline</Text>
                        {filteredUsers
                            .filter((u) => !onlineUsers.includes(u.uid))
                            .map(renderUserCard)}
                    </View>
                )}

                {filteredUsers.length === 0 && (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No users found</Text>
                    </View>
                )}

                <View style={styles.bottomSpacer} />
            </ScrollView>

            <Modal
                visible={showCallModal}
                transparent
                animationType="slide"
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.callModal}>
                        <Text style={styles.modalTitle}>Start Call</Text>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalText}>{selectedUser?.displayName}</Text>
                            <Text style={styles.modalEmail}>{selectedUser?.email}</Text>
                        </View>
                        <View style={styles.modalButtons}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.cancelButton]}
                                onPress={() => setShowCallModal(false)}
                            >
                                <Text style={styles.cancelButtonText}>Cancel</Text>
                            </TouchableOpacity>
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

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    content: {
        flex: 1,
        padding: 20,
    },
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
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
        marginBottom: 12,
    },
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