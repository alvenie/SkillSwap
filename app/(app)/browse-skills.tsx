import { useRouter } from 'expo-router';
import { addDoc, collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import StarRating from '../../components/StarRating';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';

// type definition for users with their teaching/learning skills
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
    averageRating?: number;
    reviewCount?: number;
}

// screen for browsing users by their skills and sending friend requests
export default function BrowseSkillsScreen() {
    // state for managing users and filtering
    const [users, setUsers] = useState<UserWithSkills[]>([]);
    const [filteredUsers, setFilteredUsers] = useState<UserWithSkills[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchText, setSearchText] = useState('');

    // tracking friend requests and connections
    const [sentRequests, setSentRequests] = useState<string[]>([]); // user IDs we've sent requests to
    const [existingFriends, setExistingFriends] = useState<string[]>([]); // already connected friends

    // modal state for sending friend requests
    const [selectedUser, setSelectedUser] = useState<UserWithSkills | null>(null);
    const [showRequestModal, setShowRequestModal] = useState(false);
    const [requestMessage, setRequestMessage] = useState('');
    const [sending, setSending] = useState(false);

    const router = useRouter();
    const { user } = useAuth();

    // load all data when component mounts
    useEffect(() => {
        fetchUsersWithSkills();
        loadSentRequests();
        loadExistingFriends();
    }, []);

    // fetch all users from firebase who have skills listed
    const fetchUsersWithSkills = async () => {
        try {
            setLoading(true);
            const usersRef = collection(db, 'users');
            const querySnapshot = await getDocs(usersRef);
            const usersData: UserWithSkills[] = [];

            querySnapshot.forEach((doc) => {
                // exclude current user from results
                if (doc.id !== user?.uid) {
                    const data = doc.data();
                    // only include users who have at least one skill
                    if (
                        (data.skillsTeaching && data.skillsTeaching.length > 0) ||
                        (data.skillsLearning && data.skillsLearning.length > 0)
                    ) {
                        // push user data into array
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
                            averageRating: data.averageRating || 0,
                            reviewCount: data.reviewCount || 0,
                        });
                    }
                }
            });

            // update state with fetched users
            setUsers(usersData);
            setFilteredUsers(usersData);
        } catch (error) {
            console.error('Error fetching users:', error);
            Alert.alert('Error', 'Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    // load pending friend requests we've sent
    const loadSentRequests = async () => {
        if (!user) return;

        try {
            // load friend requests sent by current user
            const requestsRef = collection(db, 'friendRequests');
            const q = query(requestsRef, where('fromUserId', '==', user.uid));
            const querySnapshot = await getDocs(q);

            // extract IDs of users we've sent requests to
            const sentRequestIds: string[] = [];
            // iterate through each friend request document
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (data.status === 'pending') {
                    // add the ID of the user to whom the request was sent
                    sentRequestIds.push(data.toUserId);
                }
            });

            // update state with sent request IDs
            setSentRequests(sentRequestIds);
        } catch (error) {
            console.error('Error loading sent requests:', error);
        }
    };

    // load list of existing friends
    const loadExistingFriends = async () => {
        if (!user) return;

        try {
            // load friends where current user is involved
            const friendsRef = collection(db, 'friends');
            const q = query(friendsRef, where('userId', '==', user.uid));
            const querySnapshot = await getDocs(q);

            const friendIds: string[] = [];

            // extract friend IDs from documents
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                // add the friend's user ID to the list
                friendIds.push(data.friendId);
            });

            // update state with existing friend IDs
            setExistingFriends(friendIds);
        } catch (error) {
            console.error('Error loading friends:', error);
        }
    };

    // filter users based on search text - searches name, email, bio, and skills
    const handleSearch = (text: string) => {
        setSearchText(text);
        if (text.trim() === '') {
            // if search is cleared, show all users
            setFilteredUsers(users);
        } else {
            const filtered = users.filter(
                // check if search text matches any relevant user fields
                (u) =>
                    u.displayName.toLowerCase().includes(text.toLowerCase()) || // name
                    u.email.toLowerCase().includes(text.toLowerCase()) || // email
                    u.bio?.toLowerCase().includes(text.toLowerCase()) || // bio
                    u.skillsTeaching.some((skill) => // teaching skills
                        skill.toLowerCase().includes(text.toLowerCase())
                    ) ||
                    u.skillsLearning.some((skill) => // learning skills
                        skill.toLowerCase().includes(text.toLowerCase())
                    )
            );
            setFilteredUsers(filtered);
        }
    };

    // open the modal to send a friend request
    const openRequestModal = (targetUser: UserWithSkills) => {
        setSelectedUser(targetUser);
        setRequestMessage('');
        setShowRequestModal(true);
    };

    // send friend request to another user
    const sendFriendRequest = async () => {
        if (!user || !selectedUser) return;

        try {
            setSending(true);

            // get current user's info for the request
            const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
            const currentUserData = currentUserDoc.data();

            // create friend request document
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
                'Request Sent!',
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

    // navigate to payment screen to book a skill session
    const handleBookSkill = (targetUser: UserWithSkills, skill: string) => {
        if (!user) {
            Alert.alert('Error', 'Please login first');
            return;
        }

        // pass skill and instructor details to payment screen
        router.push({
            pathname: '/(app)/payment',
            params: {
                skillName: skill,
                skillPrice: '50', // default price for now
                skillDuration: '1 hour',
                instructor: targetUser.displayName,
                instructorEmail: targetUser.email,
            },
        });
    };

    // render individual user card with skills and connection status
    const renderUserCard = (targetUser: UserWithSkills) => {
        const isFriend = existingFriends.includes(targetUser.uid);
        const requestSent = sentRequests.includes(targetUser.uid);
        const isOnline = targetUser.status === 'online';

        return (
            <View style={styles.card}>
                {/* user header with avatar and basic info */}
                <View style={styles.userHeader}>
                    <View style={styles.avatarContainer}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>
                                {targetUser.displayName.charAt(0).toUpperCase()}
                            </Text>
                        </View>
                        {/* online status indicator */}
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

                        {/* star rating */}
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

                {/* skills they can teach - clickable to book */}
                {targetUser.skillsTeaching.length > 0 && (
                    <View style={styles.skillsSection}>
                        <Text style={styles.skillsLabel}>🎓 Can teach:</Text>
                        <View style={styles.skillsContainer}>
                            {targetUser.skillsTeaching.slice(0, 4).map((skill, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={[styles.skillChip, styles.teachingChip]}
                                    onPress={() => handleBookSkill(targetUser, skill)}
                                >
                                    <Text style={styles.skillChipText}>{skill}</Text>
                                </TouchableOpacity>
                            ))}
                            {targetUser.skillsTeaching.length > 4 && (
                                <Text style={styles.moreSkills}>
                                    +{targetUser.skillsTeaching.length - 4} more
                                </Text>
                            )}
                        </View>
                    </View>
                )}

                {/* skills they want to learn - not clickable */}
                {targetUser.skillsLearning.length > 0 && (
                    <View style={styles.skillsSection}>
                        <Text style={styles.skillsLabel}>📚 Wants to learn:</Text>
                        <View style={styles.skillsContainer}>
                            {targetUser.skillsLearning.slice(0, 4).map((skill, index) => (
                                <View
                                    key={index}
                                    style={[styles.skillChip, styles.learningChip]}
                                >
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

                {/* connection button - shows different states */}
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
                            <Text style={styles.addFriendButtonText}>+ Connect</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        );
    };

    // show loading spinner while fetching data
    if (loading) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#007AFF" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* header with title and search */}
            <View style={styles.header}>
                <Text style={styles.title}>Browse Skills</Text>
                <TextInput
                    style={styles.searchBox}
                    placeholder="Search by name or skills..."
                    value={searchText}
                    onChangeText={handleSearch}
                    placeholderTextColor="#999"
                />
            </View>

            {/* show empty state or user list */}
            {filteredUsers.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>
                        {searchText ? 'No users found' : 'No users with skills yet'}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={filteredUsers}
                    renderItem={({ item }) => renderUserCard(item)}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.list}
                />
            )}

            {/* modal for sending friend request with optional message */}
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
                                {/* selected user info */}
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

                                {/* optional introduction message */}
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

                                {/* modal action buttons */}
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
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    header: {
        backgroundColor: '#fff',
        padding: 20,
        paddingTop: 60,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 16,
    },
    searchBox: {
        backgroundColor: '#f0f0f0',
        borderRadius: 8,
        padding: 12,
        fontSize: 14,
        color: '#333',
    },
    list: {
        padding: 16,
        paddingBottom: 32,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        elevation: 2,
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
        marginTop: 4,
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
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 16,
        color: '#999',
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