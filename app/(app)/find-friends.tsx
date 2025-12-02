import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { addDoc, collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
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
import StarRating from '../../components/StarRating';  // ADDED IMPORT

// --- Theme Configuration ---
const COLORS = {
    primaryBrand: '#FCD34D', // Mustard Yellow
    primaryBrandText: '#1F2937', // Dark Gray
    background: '#FFFFFF',
    cardBackground: '#FFFFFF',
    textPrimary: '#1F2937',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    lightGray: '#F9FAFB',
    accentGreen: '#10B981',
    accentOrange: '#F59E0B',
};

// User profile structure
// UPDATED INTERFACE - Added rating fields
interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    bio?: string;
    skillsTeaching: string[];
    skillsLearning: string[];
    location?: string;
    status: 'online' | 'offline' | 'in-call';
    averageRating?: number;    // ADDED
    reviewCount?: number;      // ADDED
}

export default function FindFriendsScreen() {
    const { user } = useAuth();
    const router = useRouter();

    // Data State
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');

    // Request State
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    const [showRequestModal, setShowRequestModal] = useState(false);
    const [requestMessage, setRequestMessage] = useState('');
    const [sending, setSending] = useState(false);

    // Tracking
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
                        averageRating: data.averageRating || 0,    // ADDED
                        reviewCount: data.reviewCount || 0,        // ADDED
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
            console.error('Error loading requests:', error);
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
                friendIds.push(doc.data().friendId);
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
            const lowerText = text.toLowerCase();
            const filtered = users.filter(
                (u) =>
                    u.displayName.toLowerCase().includes(lowerText) ||
                    u.bio?.toLowerCase().includes(lowerText) ||
                    u.skillsTeaching.some((skill) => skill.toLowerCase().includes(lowerText)) ||
                    u.skillsLearning.some((skill) => skill.toLowerCase().includes(lowerText))
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

            Alert.alert('Success', `Friend request sent to ${selectedUser.displayName}`);
            setShowRequestModal(false);
            setSentRequests([...sentRequests, selectedUser.uid]);
        } catch (error: any) {
            Alert.alert('Error', 'Failed to send friend request');
        } finally {
            setSending(false);
        }
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
                        {isOnline && <View style={styles.onlineBadge} />}
                    </View>
                    <View style={styles.userInfo}>
                        <Text style={styles.userName}>{targetUser.displayName}</Text>
                        {targetUser.location && (
                            <Text style={styles.location}>📍 {targetUser.location}</Text>
                        )}

                        {/* ADDED STAR RATING */}
                        <StarRating
                            rating={targetUser.averageRating || 0}
                            reviewCount={targetUser.reviewCount || 0}
                            size="small"
                        />

                        {targetUser.bio && (
                            <Text style={styles.bio} numberOfLines={2}>
                                {targetUser.bio}
                            </Text>
                        )}
                    </View>
                </View>

                {/* Compact Skills Section (Updated to match Skills Page) */}
                <View style={styles.skillsRow}>
                    {targetUser.skillsTeaching.length > 0 && (
                        <View style={styles.skillGroup}>
                            <Text style={styles.skillLabel}>Teaches:</Text>
                            <Text style={styles.skillList} numberOfLines={1}>
                                {targetUser.skillsTeaching.join(', ')}
                            </Text>
                        </View>
                    )}
                    {targetUser.skillsLearning.length > 0 && (
                        <View style={styles.skillGroup}>
                            <Text style={styles.skillLabel}>Learns:</Text>
                            <Text style={styles.skillList} numberOfLines={1}>
                                {targetUser.skillsLearning.join(', ')}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Action Button */}
                <View style={styles.actionContainer}>
                    {isFriend ? (
                        <View style={styles.statusContainer}>
                            <Ionicons name="checkmark-circle" size={18} color={COLORS.accentGreen} />
                            <Text style={[styles.statusText, { color: COLORS.accentGreen }]}>Friends</Text>
                        </View>
                    ) : requestSent ? (
                        <View style={styles.statusContainer}>
                            <Ionicons name="time" size={18} color={COLORS.accentOrange} />
                            <Text style={[styles.statusText, { color: COLORS.accentOrange }]}>Request Sent</Text>
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
                    <ActivityIndicator size="large" color={COLORS.primaryBrand} />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>Find Friends</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                <View style={styles.searchContainer}>
                    <View style={styles.searchBox}>
                        <Ionicons name="search" size={20} color={COLORS.textSecondary} style={{ marginRight: 8 }} />
                        <TextInput
                            style={styles.input}
                            placeholder="Search by name, skills, or bio..."
                            value={searchText}
                            onChangeText={handleSearch}
                            placeholderTextColor={COLORS.textSecondary}
                        />
                    </View>
                </View>

                <Text style={styles.resultCount}>
                    {filteredUsers.length} {filteredUsers.length === 1 ? 'user' : 'users'} found
                </Text>

                {filteredUsers.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="people-outline" size={64} color={COLORS.border} />
                        <Text style={styles.emptyText}>No users found</Text>
                    </View>
                ) : (
                    filteredUsers.map(renderUserCard)
                )}

                <View style={styles.bottomSpacer} />
            </ScrollView>

            {/* Modal */}
            <Modal visible={showRequestModal} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Send Friend Request</Text>
                            <TouchableOpacity onPress={() => setShowRequestModal(false)}>
                                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
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
                                        <Text style={styles.modalUserName}>{selectedUser.displayName}</Text>
                                        <Text style={styles.modalUserEmail}>{selectedUser.email}</Text>
                                    </View>
                                </View>

                                <Text style={styles.messageLabel}>Add a message (optional)</Text>
                                <TextInput
                                    style={styles.messageInput}
                                    placeholder="Hi! I'd like to connect..."
                                    value={requestMessage}
                                    onChangeText={setRequestMessage}
                                    multiline
                                    numberOfLines={3}
                                    placeholderTextColor={COLORS.textSecondary}
                                />

                                <View style={styles.modalButtons}>
                                    <TouchableOpacity
                                        style={[styles.modalButton, styles.cancelButton]}
                                        onPress={() => setShowRequestModal(false)}
                                    >
                                        <Text style={styles.cancelButtonText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.modalButton, styles.sendButton]}
                                        onPress={sendFriendRequest}
                                        disabled={sending}
                                    >
                                        {sending ? (
                                            <ActivityIndicator color={COLORS.primaryBrandText} />
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
        backgroundColor: COLORS.background,
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
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: COLORS.background,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    backButton: {
        padding: 8,
    },
    title: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.textPrimary,
    },
    searchContainer: {
        padding: 16,
        paddingBottom: 8,
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.lightGray,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    input: {
        flex: 1,
        fontSize: 15,
        color: COLORS.textPrimary,
    },
    resultCount: {
        fontSize: 13,
        color: COLORS.textSecondary,
        paddingHorizontal: 16,
        marginBottom: 12,
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
    },
    emptyText: {
        marginTop: 16,
        fontSize: 16,
        color: COLORS.textSecondary,
    },
    // User Card
    userCard: {
        backgroundColor: COLORS.cardBackground,
        borderRadius: 12,
        padding: 16,
        marginHorizontal: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    userHeader: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    avatarContainer: {
        marginRight: 12,
        position: 'relative',
    },
    avatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: COLORS.primaryBrand,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 20,
        fontWeight: '700',
        color: COLORS.primaryBrandText,
    },
    onlineBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: COLORS.accentGreen,
        borderWidth: 2,
        borderColor: COLORS.cardBackground,
    },
    userInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    userName: {
        fontSize: 16,
        fontWeight: '700',
        color: COLORS.textPrimary,
        marginBottom: 2,
    },
    location: {
        fontSize: 12,
        color: COLORS.textSecondary,
        marginBottom: 4,
    },
    bio: {
        fontSize: 13,
        color: COLORS.textSecondary,
        lineHeight: 18,
        marginTop: 4,
    },
    // UPDATED SKILLS SECTION STYLES
    skillsRow: {
        marginTop: 4,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: COLORS.lightGray,
        gap: 2,
        marginBottom: 12,
    },
    skillGroup: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    skillLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: COLORS.textSecondary,
        width: 50,
    },
    skillList: {
        flex: 1,
        fontSize: 11,
        color: COLORS.textPrimary,
    },
    // Action Buttons
    actionContainer: {
        borderTopWidth: 1,
        borderTopColor: COLORS.lightGray,
        paddingTop: 12,
        alignItems: 'center',
    },
    addFriendButton: {
        backgroundColor: COLORS.primaryBrand,
        width: '100%',
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    addFriendButtonText: {
        color: COLORS.primaryBrandText,
        fontWeight: '600',
        fontSize: 14,
    },
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    statusText: {
        fontSize: 14,
        fontWeight: '600',
    },
    bottomSpacer: {
        height: 40,
    },
    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: COLORS.background,
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
        borderBottomColor: COLORS.border,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.textPrimary,
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
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: COLORS.primaryBrand,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    modalAvatarText: {
        fontWeight: '700',
        color: COLORS.primaryBrandText,
    },
    modalUserName: {
        fontWeight: '600',
        color: COLORS.textPrimary,
    },
    modalUserEmail: {
        fontSize: 12,
        color: COLORS.textSecondary,
    },
    messageLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.textPrimary,
        marginBottom: 8,
    },
    messageInput: {
        backgroundColor: COLORS.lightGray,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 8,
        padding: 12,
        fontSize: 14,
        color: COLORS.textPrimary,
        height: 80,
        textAlignVertical: 'top',
        marginBottom: 20,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    modalButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    cancelButton: {
        backgroundColor: COLORS.lightGray,
    },
    sendButton: {
        backgroundColor: COLORS.primaryBrand,
    },
    cancelButtonText: {
        color: COLORS.textSecondary,
        fontWeight: '600',
    },
    sendButtonText: {
        color: COLORS.primaryBrandText,
        fontWeight: '600',
    },
});