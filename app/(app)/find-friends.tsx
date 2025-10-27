import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    TextInput,
    Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';
import {
    collection,
    query,
    where,
    getDocs,
    addDoc,
    doc,
    getDoc,
} from 'firebase/firestore';
import { useRouter } from 'expo-router';

interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    bio?: string;
    skillsTeaching: string[];
    skillsLearning: string[];
    location?: string;
    status: 'online' | 'offline' | 'in-call';
}

export default function FindFriendsScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    const [showRequestModal, setShowRequestModal] = useState(false);
    const [requestMessage, setRequestMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [sentRequests, setSentRequests] = useState<string[]>([]);
    const [existingFriends, setExistingFriends] = useState<string[]>([]);

    useEffect(() => {
        loadUsers();
        loadSentRequests();
        loadExistingFriends();
    }, []);

    const loadUsers = async () => {
        try {
            setLoading(true);
            const usersRef = collection(db, 'users');
            const querySnapshot = await getDocs(usersRef);

            const usersData: UserProfile[] = [];
            querySnapshot.forEach((doc) => {
                if (doc.id !== user?.uid) {
                    const data = doc.data();
                    usersData.push({
                        uid: doc.id,
                        email: data.email || '',
                        displayName: data.displayName || data.email || 'User',
                        bio: data.bio || '',
                        skillsTeaching: data.skillsTeaching || [],
                        skillsLearning: data.skillsLearning || [],
                        location: data.location || '',
                        status: data.status || 'offline',
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

    const loadSentRequests = async () => {
        if (!user) return;

        try {
            const requestsRef = collection(db, 'friendRequests');
            const q = query(requestsRef, where('fromUserId', '==', user.uid));
            const querySnapshot = await getDocs(q);

            const sentRequestIds: string[] = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (data.status === 'pending') {
                    sentRequestIds.push(data.toUserId);
                }
            });

            setSentRequests(sentRequestIds);
        } catch (error) {
            console.error('Error loading sent requests:', error);
        }
    };

    const loadExistingFriends = async () => {
        if (!user) return;

        try {
            const friendsRef = collection(db, 'friends');
            const q = query(friendsRef, where('userId', '==', user.uid));
            const querySnapshot = await getDocs(q);

            const friendIds: string[] = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                friendIds.push(data.friendId);
            });

            setExistingFriends(friendIds);
        } catch (error) {
            console.error('Error loading friends:', error);
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
                    u.email.toLowerCase().includes(text.toLowerCase()) ||
                    u.bio?.toLowerCase().includes(text.toLowerCase()) ||
                    u.skillsTeaching.some((skill) =>
                        skill.toLowerCase().includes(text.toLowerCase())
                    ) ||
                    u.skillsLearning.some((skill) =>
                        skill.toLowerCase().includes(text.toLowerCase())
                    )
            );
            setFilteredUsers(filtered);
        }
    };

    const openRequestModal = (targetUser: UserProfile) => {
        setSelectedUser(targetUser);
        setRequestMessage('');
        setShowRequestModal(true);
    };

    const sendFriendRequest = async () => {
        if (!user || !selectedUser) return;

        try {
            setSending(true);

            // Get current user's profile
            const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
            const currentUserData = currentUserDoc.data();

            // Create friend request
            await addDoc(collection(db, 'friendRequests'), {
                fromUserId: user.uid,
                fromUserName: currentUserData?.displayName || user.email || 'User',
                fromUserEmail: user.email || '',
                toUserId: selectedUser.uid,
                toUserName: selectedUser.displayName,
                toUserEmail: selectedUser.email,
                status: 'pending',
                message: requestMessage.trim(),
                createdAt: new Date().toISOString(),
            });

            Alert.alert(
                'Request Sent! 🎉',
                `Friend request sent to ${selectedUser.displayName}`,
                [{ text: 'OK' }]
            );

            setShowRequestModal(false);
            setSentRequests([...sentRequests, selectedUser.uid]);
        } catch (error: any) {
            console.error('Error sending friend request:', error);
            Alert.alert('Error', 'Failed to send friend request. Please try again.');
        } finally {
            setSending(false);
        }
    };

    const getSkillMatches = (targetUser: UserProfile) => {
        if (!user) return { canTeach: [], wantsToLearn: [] };

        // Load current user's skills from state or fetch
        const canTeach = targetUser.skillsLearning.filter((skill) =>
            // This would need current user's teaching skills
            false
        );

        const wantsToLearn = targetUser.skillsTeaching.filter((skill) =>
            // This would need current user's learning skills
            false
        );

        return { canTeach, wantsToLearn };
    };

    const renderUserCard = (targetUser: UserProfile) => {
        const isFriend = existingFriends.includes(targetUser.uid);
        const requestSent = sentRequests.includes(targetUser.uid);
        const isOnline = targetUser.status === 'online';

        return (
            <View key={targetUser.uid} style={styles.userCard}>
                <View style={styles.userHeader}>
                    <View style={styles.avatarContainer}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>
                                {targetUser.displayName.charAt(0).toUpperCase()}
                            </Text>
                        </View>
                        <View
                            style={[
                                styles.statusBadge,
                                { backgroundColor: isOnline ? '#4CAF50' : '#ccc' },
                            ]}
                        />
                    </View>
                    <View style={styles.userInfo}>
                        <Text style={styles.userName}>{targetUser.displayName}</Text>
                        {targetUser.location && (
                            <Text style={styles.location}>📍 {targetUser.location}</Text>
                        )}
                        {targetUser.bio && (
                            <Text style={styles.bio} numberOfLines={2}>
                                {targetUser.bio}
                            </Text>
                        )}
                    </View>
                </View>

                {/* Skills */}
                {targetUser.skillsTeaching.length > 0 && (
                    <View style={styles.skillsSection}>
                        <Text style={styles.skillsLabel}>🎓 Can teach:</Text>
                        <View style={styles.skillsContainer}>
                            {targetUser.skillsTeaching.slice(0, 3).map((skill, index) => (
                                <View key={index} style={[styles.skillChip, styles.teachingChip]}>
                                    <Text style={styles.skillChipText}>{skill}</Text>
                                </View>
                            ))}
                            {targetUser.skillsTeaching.length > 3 && (
                                <Text style={styles.moreSkills}>
                                    +{targetUser.skillsTeaching.length - 3} more
                                </Text>
                            )}
                        </View>
                    </View>
                )}

                {targetUser.skillsLearning.length > 0 && (
                    <View style={styles.skillsSection}>
                        <Text style={styles.skillsLabel}>📚 Wants to learn:</Text>
                        <View style={styles.skillsContainer}>
                            {targetUser.skillsLearning.slice(0, 3).map((skill, index) => (
                                <View key={index} style={[styles.skillChip, styles.learningChip]}>
                                    <Text style={styles.skillChipText}>{skill}</Text>
                                </View>
                            ))}
                            {targetUser.skillsLearning.length > 3 && (
                                <Text style={styles.moreSkills}>
                                    +{targetUser.skillsLearning.length - 3} more
                                </Text>
                            )}
                        </View>
                    </View>
                )}

                {/* Action Button */}
                <View style={styles.actionContainer}>
                    {isFriend ? (
                        <View style={styles.friendBadge}>
                            <Text style={styles.friendBadgeText}>✓ Friends</Text>
                        </View>
                    ) : requestSent ? (
                        <View style={styles.pendingBadge}>
                            <Text style={styles.pendingBadgeText}>⏳ Request Sent</Text>
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={styles.addFriendButton}
                            onPress={() => openRequestModal(targetUser)}
                        >
                            <Text style={styles.addFriendButtonText}>+ Add Friend</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#007AFF" />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Text style={styles.backButtonText}>←</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>Find Friends</Text>
                    <View style={{ width: 40 }} />
                </View>

                <View style={styles.searchContainer}>
                    <TextInput
                        style={styles.searchBox}
                        placeholder="Search by name, skills, or bio..."
                        value={searchText}
                        onChangeText={handleSearch}
                        placeholderTextColor="#999"
                    />
                </View>

                <Text style={styles.resultCount}>
                    {filteredUsers.length} {filteredUsers.length === 1 ? 'user' : 'users'} found
                </Text>

                {filteredUsers.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>No users found</Text>
                    </View>
                ) : (
                    filteredUsers.map(renderUserCard)
                )}

                <View style={styles.bottomSpacer} />
            </ScrollView>

            {/* Friend Request Modal */}
            <Modal visible={showRequestModal} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Send Friend Request</Text>
                            <TouchableOpacity onPress={() => setShowRequestModal(false)}>
                                <Text style={styles.modalCloseText}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        {selectedUser && (
                            <View style={styles.modalBody}>
                                <View style={styles.modalUserInfo}>
                                    <View style={styles.modalAvatar}>
                                        <Text style={styles.modalAvatarText}>
                                            {selectedUser.displayName.charAt(0).toUpperCase()}
                                        </Text>
                                    </View>
                                    <View>
                                        <Text style={styles.modalUserName}>
                                            {selectedUser.displayName}
                                        </Text>
                                        <Text style={styles.modalUserEmail}>
                                            {selectedUser.email}
                                        </Text>
                                    </View>
                                </View>

                                <View style={styles.messageSection}>
                                    <Text style={styles.messageLabel}>
                                        Add a message (optional)
                                    </Text>
                                    <TextInput
                                        style={styles.messageInput}
                                        placeholder="Hi! I'd like to connect and exchange skills..."
                                        value={requestMessage}
                                        onChangeText={setRequestMessage}
                                        multiline
                                        numberOfLines={4}
                                        placeholderTextColor="#999"
                                    />
                                </View>

                                <View style={styles.modalButtons}>
                                    <TouchableOpacity
                                        style={[styles.modalButton, styles.cancelButton]}
                                        onPress={() => setShowRequestModal(false)}
                                    >
                                        <Text style={styles.cancelButtonText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[
                                            styles.modalButton,
                                            styles.sendButton,
                                            sending && styles.disabledButton,
                                        ]}
                                        onPress={sendFriendRequest}
                                        disabled={sending}
                                    >
                                        {sending ? (
                                            <ActivityIndicator color="#fff" />
                                        ) : (
                                            <Text style={styles.sendButtonText}>Send Request</Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
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
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        paddingTop: 10,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    backButtonText: {
        fontSize: 24,
        color: '#007AFF',
        fontWeight: 'bold',
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
    },
    searchContainer: {
        padding: 20,
        paddingBottom: 12,
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
    resultCount: {
        fontSize: 14,
        color: '#666',
        paddingHorizontal: 20,
        marginBottom: 12,
    },
    userCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginHorizontal: 20,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    userHeader: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    avatarContainer: {
        position: 'relative',
        marginRight: 12,
    },
    avatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#007AFF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
    },
    statusBadge: {
        position: 'absolute',
        bottom: 2,
        right: 2,
        width: 14,
        height: 14,
        borderRadius: 7,
        borderWidth: 2,
        borderColor: '#fff',
    },
    userInfo: {
        flex: 1,
    },
    userName: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    location: {
        fontSize: 13,
        color: '#666',
        marginBottom: 6,
    },
    bio: {
        fontSize: 14,
        color: '#666',
        lineHeight: 18,
    },
    skillsSection: {
        marginTop: 12,
    },
    skillsLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: '#666',
        marginBottom: 8,
    },
    skillsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    skillChip: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
    },
    teachingChip: {
        backgroundColor: '#E3F2FD',
    },
    learningChip: {
        backgroundColor: '#FFF3E0',
    },
    skillChipText: {
        fontSize: 12,
        fontWeight: '500',
        color: '#333',
    },
    moreSkills: {
        fontSize: 12,
        color: '#999',
        alignSelf: 'center',
        marginLeft: 4,
    },
    actionContainer: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
    },
    addFriendButton: {
        backgroundColor: '#007AFF',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    addFriendButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 15,
    },
    friendBadge: {
        backgroundColor: '#E8F5E9',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    friendBadgeText: {
        color: '#4CAF50',
        fontWeight: '600',
        fontSize: 15,
    },
    pendingBadge: {
        backgroundColor: '#FFF3E0',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    pendingBadgeText: {
        color: '#FF9800',
        fontWeight: '600',
        fontSize: 15,
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
        height: 40,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingBottom: 40,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
    },
    modalCloseText: {
        fontSize: 24,
        color: '#666',
        fontWeight: 'bold',
    },
    modalBody: {
        padding: 20,
    },
    modalUserInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#007AFF',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    modalAvatarText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
    },
    modalUserName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 2,
    },
    modalUserEmail: {
        fontSize: 14,
        color: '#666',
    },
    messageSection: {
        marginBottom: 20,
    },
    messageLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
        marginBottom: 8,
    },
    messageInput: {
        backgroundColor: '#f5f5f5',
        borderRadius: 8,
        padding: 12,
        fontSize: 14,
        borderWidth: 1,
        borderColor: '#ddd',
        color: '#333',
        textAlignVertical: 'top',
        minHeight: 80,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    modalButton: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    cancelButton: {
        backgroundColor: '#f0f0f0',
    },
    sendButton: {
        backgroundColor: '#007AFF',
    },
    disabledButton: {
        opacity: 0.6,
    },
    cancelButtonText: {
        color: '#666',
        fontWeight: '600',
        fontSize: 16,
    },
    sendButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16,
    },
});