import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { addDoc, collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';
import { generateConversationId } from '../../utils/conversationUtils';

// User profile with skills
interface UserWithSkills {
    id: string;
    uid: string;
    displayName: string;
    email: string;
    skillsTeaching: string[];
    skillsLearning: string[];
    bio?: string;
    location?: string;
    status: 'online' | 'offline' | 'in-call';
}

export default function SkillsScreen() {
    const { user } = useAuth();
    const router = useRouter();

    // State for user discovery
    const [users, setUsers] = useState<UserWithSkills[]>([]);
    const [filteredUsers, setFilteredUsers] = useState<UserWithSkills[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [selectedSkill, setSelectedSkill] = useState<string>('All');

    // Friend request tracking
    const [sentRequests, setSentRequests] = useState<string[]>([]);
    const [existingFriends, setExistingFriends] = useState<string[]>([]);

    // Modal for friend requests
    const [selectedUser, setSelectedUser] = useState<UserWithSkills | null>(null);
    const [showRequestModal, setShowRequestModal] = useState(false);
    const [requestMessage, setRequestMessage] = useState('');
    const [sending, setSending] = useState(false);

    // Get all unique skills from all users
    const [allSkills, setAllSkills] = useState<string[]>(['All']);

    // Load data when screen comes into focus
    useFocusEffect(
        useCallback(() => {
            loadUsers();
            loadSentRequests();
            loadExistingFriends();
        }, [])
    );

    // Load all users with skills
    const loadUsers = async () => {
        try {
            setLoading(true);
            const usersRef = collection(db, 'users');
            const querySnapshot = await getDocs(usersRef);
            const usersData: UserWithSkills[] = [];
            const skillsSet = new Set<string>();

            querySnapshot.forEach((doc) => {
                // Exclude current user
                if (doc.id !== user?.uid) {
                    const data = doc.data();
                    // Only include users with skills
                    if (
                        (data.skillsTeaching && data.skillsTeaching.length > 0) ||
                        (data.skillsLearning && data.skillsLearning.length > 0)
                    ) {
                        usersData.push({
                            id: doc.id,
                            uid: doc.id,
                            displayName: data.displayName || data.email || 'User',
                            email: data.email || '',
                            skillsTeaching: data.skillsTeaching || [],
                            skillsLearning: data.skillsLearning || [],
                            bio: data.bio || '',
                            location: data.location || '',
                            status: data.status || 'offline',
                        });

                        // Collect all unique skills
                        data.skillsTeaching?.forEach((skill: string) => skillsSet.add(skill));
                        data.skillsLearning?.forEach((skill: string) => skillsSet.add(skill));
                    }
                }
            });

            setUsers(usersData);
            setFilteredUsers(usersData);
            setAllSkills(['All', ...Array.from(skillsSet).sort()]);
        } catch (error: any) {
            console.error('Error loading users:', error);
            Alert.alert('Error', 'Failed to load users');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // Load sent friend requests
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

    // Load existing friends
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

    // Filter users by search text and selected skill
    const handleSearch = (text: string) => {
        setSearchText(text);
        filterUsers(text, selectedSkill);
    };

    const handleSkillFilter = (skill: string) => {
        setSelectedSkill(skill);
        filterUsers(searchText, skill);
    };

    const filterUsers = (search: string, skill: string) => {
        let filtered = users;

        // Filter by skill
        if (skill !== 'All') {
            filtered = filtered.filter(u =>
                u.skillsTeaching.includes(skill) || u.skillsLearning.includes(skill)
            );
        }

        // Filter by search text
        if (search.trim()) {
            filtered = filtered.filter(u =>
                u.displayName.toLowerCase().includes(search.toLowerCase()) ||
                u.email.toLowerCase().includes(search.toLowerCase()) ||
                u.bio?.toLowerCase().includes(search.toLowerCase()) ||
                u.skillsTeaching.some(s => s.toLowerCase().includes(search.toLowerCase())) ||
                u.skillsLearning.some(s => s.toLowerCase().includes(search.toLowerCase()))
            );
        }

        setFilteredUsers(filtered);
    };

    // Open friend request modal
    const openRequestModal = (targetUser: UserWithSkills) => {
        setSelectedUser(targetUser);
        setRequestMessage('');
        setShowRequestModal(true);
    };

    // Send friend request
    const sendFriendRequest = async () => {
        if (!user || !selectedUser) return;
        try {
            setSending(true);
            const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
            const currentUserData = currentUserDoc.data();

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

            Alert.alert('Request Sent! 🎉', `Friend request sent to ${selectedUser.displayName}`);
            setShowRequestModal(false);
            setSentRequests([...sentRequests, selectedUser.uid]);
        } catch (error: any) {
            console.error('Error sending friend request:', error);
            Alert.alert('Error', 'Failed to send friend request');
        } finally {
            setSending(false);
        }
    };

    // Message a user (opens chat)
    const handleMessageUser = (targetUser: UserWithSkills) => {
        if (!user) {
            Alert.alert('Error', 'Please login first');
            return;
        }

        const conversationId = generateConversationId(user.uid, targetUser.uid);
        router.push({
            pathname: '/(app)/chat-room',
            params: {
                conversationId,
                otherUserId: targetUser.uid,
                otherUserName: targetUser.displayName,
            },
        });
    };

    const onRefresh = () => {
        setRefreshing(true);
        loadUsers();
        loadSentRequests();
        loadExistingFriends();
    };

    // Render user card
    const renderUserCard = (targetUser: UserWithSkills) => {
        const isFriend = existingFriends.includes(targetUser.uid);
        const requestSent = sentRequests.includes(targetUser.uid);
        const isOnline = targetUser.status === 'online';

        return (
            <View key={targetUser.uid} style={styles.card}>
                {/* User header */}
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

                {/* Skills they can teach */}
                {targetUser.skillsTeaching.length > 0 && (
                    <View style={styles.skillsSection}>
                        <Text style={styles.skillsLabel}>🎓 Can teach:</Text>
                        <View style={styles.skillsContainer}>
                            {targetUser.skillsTeaching.slice(0, 4).map((skill, index) => (
                                <View key={index} style={[styles.skillChip, styles.teachingChip]}>
                                    <Text style={styles.skillChipText}>{skill}</Text>
                                </View>
                            ))}
                            {targetUser.skillsTeaching.length > 4 && (
                                <Text style={styles.moreSkills}>
                                    +{targetUser.skillsTeaching.length - 4} more
                                </Text>
                            )}
                        </View>
                    </View>
                )}

                {/* Skills they want to learn */}
                {targetUser.skillsLearning.length > 0 && (
                    <View style={styles.skillsSection}>
                        <Text style={styles.skillsLabel}>📚 Wants to learn:</Text>
                        <View style={styles.skillsContainer}>
                            {targetUser.skillsLearning.slice(0, 4).map((skill, index) => (
                                <View key={index} style={[styles.skillChip, styles.learningChip]}>
                                    <Text style={styles.skillChipText}>{skill}</Text>
                                </View>
                            ))}
                            {targetUser.skillsLearning.length > 4 && (
                                <Text style={styles.moreSkills}>
                                    +{targetUser.skillsLearning.length - 4} more
                                </Text>
                            )}
                        </View>
                    </View>
                )}

                {/* Action buttons */}
                <View style={styles.actionContainer}>
                    {isFriend ? (
                        <TouchableOpacity
                            style={styles.messageButton}
                            onPress={() => handleMessageUser(targetUser)}
                        >
                            <Text style={styles.messageButtonText}>💬 Message</Text>
                        </TouchableOpacity>
                    ) : requestSent ? (
                        <View style={styles.pendingBadge}>
                            <Text style={styles.pendingBadgeText}>⏳ Request Sent</Text>
                        </View>
                    ) : (
                        <TouchableOpacity
                            style={styles.addFriendButton}
                            onPress={() => openRequestModal(targetUser)}
                        >
                            <Text style={styles.addFriendButtonText}>+ Connect</Text>
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
        <SafeAreaView style={styles.container} edges={['top']}>
            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#007AFF" />
                }
            >
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>Find Skills</Text>
                    <Text style={styles.subtitle}>Connect with people to learn & teach</Text>
                </View>

                {/* Search bar */}
                <View style={styles.searchContainer}>
                    <TextInput
                        style={styles.searchBox}
                        placeholder="Search by name or skills..."
                        value={searchText}
                        onChangeText={handleSearch}
                        placeholderTextColor="#999"
                    />
                </View>

                {/* Skill filter chips */}
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.skillFilterScroll}
                    contentContainerStyle={styles.skillFilterContainer}
                >
                    {allSkills.map((skill) => (
                        <TouchableOpacity
                            key={skill}
                            style={[
                                styles.skillFilterChip,
                                selectedSkill === skill && styles.skillFilterChipActive,
                            ]}
                            onPress={() => handleSkillFilter(skill)}
                        >
                            <Text
                                style={[
                                    styles.skillFilterChipText,
                                    selectedSkill === skill && styles.skillFilterChipTextActive,
                                ]}
                            >
                                {skill}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* Results count */}
                <Text style={styles.resultCount}>
                    {filteredUsers.length} {filteredUsers.length === 1 ? 'person' : 'people'} found
                </Text>

                {/* User list */}
                {filteredUsers.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyIcon}>🔍</Text>
                        <Text style={styles.emptyText}>
                            {searchText || selectedSkill !== 'All' ? 'No users found' : 'No users with skills yet'}
                        </Text>
                    </View>
                ) : (
                    filteredUsers.map(renderUserCard)
                )}

                <View style={styles.bottomSpacer} />
            </ScrollView>

            {/* Friend request modal */}
            <Modal visible={showRequestModal} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Connect & Learn</Text>
                            <TouchableOpacity onPress={() => setShowRequestModal(false)}>
                                <Text style={styles.modalCloseText}>✕</Text>
                            </TouchableOpacity>
                        </View>

                        {selectedUser && (
                            <ScrollView style={styles.modalBody}>
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
                                        Introduce yourself (optional)
                                    </Text>
                                    <TextInput
                                        style={styles.messageInput}
                                        placeholder="Hi! I'd love to learn from you and share my skills..."
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
                            </ScrollView>
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
        padding: 20,
        paddingTop: 10,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 16,
        color: '#666',
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
    skillFilterScroll: {
        paddingHorizontal: 20,
        marginBottom: 12,
    },
    skillFilterContainer: {
        gap: 8,
    },
    skillFilterChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#ddd',
    },
    skillFilterChipActive: {
        backgroundColor: '#007AFF',
        borderColor: '#007AFF',
    },
    skillFilterChipText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#666',
    },
    skillFilterChipTextActive: {
        color: '#fff',
    },
    resultCount: {
        fontSize: 14,
        color: '#666',
        paddingHorizontal: 20,
        marginBottom: 12,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginHorizontal: 20,
        marginBottom: 16,
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
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
        marginBottom: 4,
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
        marginRight: 6,
        marginBottom: 6,
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
    messageButton: {
        backgroundColor: '#4CAF50',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    messageButtonText: {
        color: '#fff',
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
        paddingVertical: 60,
    },
    emptyIcon: {
        fontSize: 64,
        marginBottom: 16,
    },
    emptyText: {
        fontSize: 16,
        color: '#999',
    },
    bottomSpacer: {
        height: 40,
    },
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '70%',
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
        marginBottom: 20,
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