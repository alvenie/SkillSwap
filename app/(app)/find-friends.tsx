import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
    addDoc,
    collection,
    doc,
    DocumentData,
    endAt,
    getDoc,
    getDocs,
    limit,
    orderBy,
    query,
    QueryDocumentSnapshot,
    startAfter,
    startAt,
    where
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import StarRating from '../../components/StarRating';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';

// Theme Configuration
const COLORS = {
    primaryBrand: '#FCD34D', // Mustard Yellow
    primaryBrandText: '#1F2937',
    background: '#FFFFFF',
    cardBackground: '#FFFFFF',
    textPrimary: '#1F2937',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    lightGray: '#F9FAFB',
    accentGreen: '#10B981',
    accentOrange: '#F59E0B',
};

// User profile structure interface
interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    bio?: string;
    skillsTeaching: string[];
    skillsLearning: string[];
    location?: any;
    status: 'online' | 'offline' | 'in-call';
    averageRating?: number;
    reviewCount?: number;
}

// Find Friends Screen
export default function FindFriendsScreen() {
    // Auth Context & Router
    const { user } = useAuth();
    const router = useRouter();

    // Data State
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
    const [hasMore, setHasMore] = useState(true);
    const [searchText, setSearchText] = useState('');

    // Request State
    const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
    const [showRequestModal, setShowRequestModal] = useState(false);
    const [requestMessage, setRequestMessage] = useState('');
    const [sending, setSending] = useState(false);

    // Tracking
    const [sentRequests, setSentRequests] = useState<string[]>([]);
    const [existingFriends, setExistingFriends] = useState<string[]>([]);

    // Initial Load on Mount
    useEffect(() => {
        loadUsers(false);
        loadSentRequests();
        loadExistingFriends();
    }, []);

    // Consolidated Load Function with Pagination
    const loadUsers = async (loadMore: boolean = false) => {
        // Prevent multiple simultaneous loads
        if (loadMore && (loadingMore || !hasMore)) return;

        try {
            if (loadMore) {
                setLoadingMore(true);
            } else {
                setLoading(true);
            }

            // Firestore Query Setup
            const usersRef = collection(db, 'users');
            // Pagination Size
            const PAGE_SIZE = 10;

            // Query Initialization
            let q;

            // Search Logic (Server-side Prefix Search)
            if (searchText.trim()) {
                const term = searchText.trim();

                // Search with Pagination
                if (loadMore && lastDoc) { // continue from lastDoc if loading more
                    q = query(
                        usersRef,
                        orderBy('displayName'),
                        startAt(term),
                        endAt(term + '\uf8ff'),
                        startAfter(lastDoc),
                        limit(PAGE_SIZE)
                    );
                } else { // else start fresh search
                    q = query(
                        usersRef,
                        orderBy('displayName'),
                        startAt(term),
                        endAt(term + '\uf8ff'),
                        limit(PAGE_SIZE)
                    );
                }
            } else {
                // Default Logic (Browse All)
                if (loadMore && lastDoc) {
                    q = query(
                        usersRef,
                        orderBy('displayName'),
                        startAfter(lastDoc),
                        limit(PAGE_SIZE)
                    );
                } else {
                    q = query(
                        usersRef,
                        orderBy('displayName'),
                        limit(PAGE_SIZE)
                    );
                }
            }

            // Execute Query and Process Results
            const querySnapshot = await getDocs(q);

            // Check if we hit the end
            if (querySnapshot.docs.length < PAGE_SIZE) {
                setHasMore(false);
            } else {
                setHasMore(true);
            }

            // Update Cursor
            if (querySnapshot.docs.length > 0) {
                setLastDoc(querySnapshot.docs[querySnapshot.docs.length - 1]);
            }

            // Map Results to UserProfile Array
            const newUsers: UserProfile[] = [];
            querySnapshot.forEach((docSnap) => {
                // Exclude current user from results
                if (docSnap.id !== user?.uid) {
                    const data = docSnap.data();
                    newUsers.push({
                        uid: docSnap.id,
                        email: data.email || '',
                        displayName: data.displayName || data.email || 'User',
                        bio: data.bio || '',
                        skillsTeaching: data.skillsTeaching || [],
                        skillsLearning: data.skillsLearning || [],
                        location: data.location || null,
                        status: data.status || 'offline',
                        averageRating: data.averageRating || 0,
                        reviewCount: data.reviewCount || 0,
                    });
                }
            });

            // Merge or Set Users
            if (loadMore) {
                // Append unique users
                setUsers(prev => {
                    const existingIds = new Set(prev.map(u => u.uid));
                    const uniqueNew = newUsers.filter(u => !existingIds.has(u.uid));
                    return [...prev, ...uniqueNew]; // ... append unique new users
                });
            } else {
                setUsers(newUsers); // Fresh load
            }

        } catch (error: any) { // Error Handling
            console.error('Error loading users:', error);
        } finally { // Reset loading states
            setLoading(false);
            setLoadingMore(false);
        }
    };

    // Load Sent Friend Requests
    const loadSentRequests = async () => {
        if (!user) return;
        try {
            // Query Sent Friend Requests
            const requestsRef = collection(db, 'friendRequests');
            const q = query(requestsRef, where('fromUserId', '==', user.uid));
            const querySnapshot = await getDocs(q); // get all sent requests
            const sentRequestIds: string[] = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (data.status === 'pending') { // only track pending requests
                    sentRequestIds.push(data.toUserId);
                }
            });
            setSentRequests(sentRequestIds); // update state with sent requests
        } catch (error) {
            console.error('Error loading requests:', error);
        }
    };

    // Load Existing Friends
    const loadExistingFriends = async () => {
        if (!user) return;
        try {
            // Query Existing Friends
            const friendsRef = collection(db, 'friends');
            const q = query(friendsRef, where('userId', '==', user.uid));
            const querySnapshot = await getDocs(q); // get all friends
            const friendIds: string[] = [];
            querySnapshot.forEach((doc) => {
                friendIds.push(doc.data().friendId); // collect friend IDs
            });
            setExistingFriends(friendIds); // update state with existing friends
        } catch (error) {
            console.error('Error loading friends:', error);
        }
    };

    // Handle Search Input Change
    const handleSearch = (text: string) => {
        setSearchText(text); // update search text state
    };

    // Trigger search when text changes with debounce
    useEffect(() => {
        const timer = setTimeout(() => {
            setLastDoc(null);
            setHasMore(true);
            loadUsers(false);
        }, 500); // debounce delay 500ms
        return () => clearTimeout(timer); // cleanup on unmount or text change
    }, [searchText]);

    // Open Friend Request Modal
    const openRequestModal = (targetUser: UserProfile) => {
        setSelectedUser(targetUser);
        setRequestMessage('');
        setShowRequestModal(true);
    };

    // Send Friend Request Function
    const sendFriendRequest = async () => {
        if (!user || !selectedUser) return;
        try {
            setSending(true);
            const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
            const currentUserData = currentUserDoc.data();

            // Add Friend Request Document
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
            setShowRequestModal(false); // close modal
            setSentRequests([...sentRequests, selectedUser.uid]); // update sent requests state
        } catch (error: any) {
            Alert.alert('Error', 'Failed to send friend request');
        } finally {
            setSending(false);
        }
    };

    // Render Each User Card
    const renderUserCard = ({ item }: { item: UserProfile }) => {
        // Determine Relationship Status
        const isFriend = existingFriends.includes(item.uid); // check if already friends
        const requestSent = sentRequests.includes(item.uid); // check if request already sent
        const isOnline = item.status === 'online'; // online status

        // Location Text Handling
        let locationText = null;
        if (item.location) { // check if location exists
            if (typeof item.location === 'string') {
                locationText = item.location; // use string location
            } else if (typeof item.location === 'object') {
                locationText = "Location Shared"; // placeholder for object location
            }
        }

        return (
            // User Card Container
            <View style={styles.userCard}>
                <View style={styles.userHeader}>
                    <View style={styles.avatarContainer}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>
                                {item.displayName.charAt(0).toUpperCase()}
                            </Text>
                        </View>
                        {isOnline && <View style={styles.onlineBadge} />}
                    </View>
                    <View style={styles.userInfo}>
                        <Text style={styles.userName}>{item.displayName}</Text>
                        {locationText && (
                            <Text style={styles.location}>📍 {locationText}</Text>
                        )}

                        {/* Star Rating */}
                        <StarRating
                            rating={item.averageRating || 0}
                            reviewCount={item.reviewCount || 0}
                            size="small"
                        />

                        {item.bio && (
                            <Text style={styles.bio} numberOfLines={2}>
                                {item.bio}
                            </Text>
                        )}
                    </View>
                </View>

                {/* Skills Section */}
                <View style={styles.skillsRow}>
                    {item.skillsTeaching.length > 0 && (
                        <View style={styles.skillGroup}>
                            <Text style={styles.skillLabel}>Teaches:</Text>
                            <Text style={styles.skillList} numberOfLines={1}>
                                {item.skillsTeaching.join(', ')}
                            </Text>
                        </View>
                    )}
                    {item.skillsLearning.length > 0 && (
                        <View style={styles.skillGroup}>
                            <Text style={styles.skillLabel}>Learns:</Text>
                            <Text style={styles.skillList} numberOfLines={1}>
                                {item.skillsLearning.join(', ')}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Action Section */}
                <View style={styles.actionContainer}>
                    {isFriend ? ( // already friends
                        <View style={styles.statusContainer}>
                            <Ionicons name="checkmark-circle" size={18} color={COLORS.accentGreen} />
                            <Text style={[styles.statusText, { color: COLORS.accentGreen }]}>Friends</Text>
                        </View>
                    ) : requestSent ? ( // request already sent
                        <View style={styles.statusContainer}>
                            <Ionicons name="time" size={18} color={COLORS.accentOrange} />
                            <Text style={[styles.statusText, { color: COLORS.accentOrange }]}>Request Sent</Text>
                        </View>
                    ) : ( // show add friend button
                        <TouchableOpacity
                            style={styles.addFriendButton}
                            onPress={() => openRequestModal(item)}
                        >
                            <Text style={styles.addFriendButtonText}>+ Add Friend</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    };

    // Render Footer for Loading More Indicator
    const renderFooter = () => {
        if (!loadingMore) return <View style={styles.bottomSpacer} />;
        return (
            <View style={{ paddingVertical: 20 }}>
                <ActivityIndicator size="small" color={COLORS.primaryBrand} />
            </View>
        );
    };

    return (
        // Main Container
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.push('/(app)/profile')} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>Find Friends</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* Search Box */}
            <View style={styles.searchContainer}>
                <View style={styles.searchBox}>
                    <Ionicons name="search" size={20} color={COLORS.textSecondary} style={{ marginRight: 8 }} />
                    <TextInput
                        style={styles.input}
                        placeholder="Search by name..."
                        value={searchText}
                        onChangeText={handleSearch}
                        placeholderTextColor={COLORS.textSecondary}
                    />
                </View>
            </View>

            {/* User List */}
            {loading && !loadingMore ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={COLORS.primaryBrand} />
                </View>
            ) : ( // If not loading, show list
                <FlatList
                    data={users}
                    renderItem={renderUserCard}
                    keyExtractor={(item) => item.uid}
                    contentContainerStyle={styles.listContent}
                    onEndReached={() => {
                        if (hasMore && !loadingMore && !loading) {
                            loadUsers(true);
                        }
                    }}
                    onEndReachedThreshold={0.5}
                    ListFooterComponent={renderFooter}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="people-outline" size={64} color={COLORS.border} />
                            <Text style={styles.emptyText}>No users found</Text>
                        </View>
                    }
                />
            )}

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

                        {/* Modal Body */}
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

                                {/* Message Input */}
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

                                {/* Modal Buttons */}
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
                                        ) : ( // if not sending, show text
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

// Styles
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
    listContent: {
        paddingBottom: 20,
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