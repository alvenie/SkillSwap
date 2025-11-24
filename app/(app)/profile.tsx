import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { addDoc, collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';
import { generateConversationId } from '../../utils/conversationUtils';

// TypeScript interfaces to define the shape of our data
interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    bio?: string;
    skillsTeaching: string[];
    skillsLearning: string[];
    profileImage?: string;
    location?: string;
    status: 'online' | 'offline' | 'in-call';
    friendCount: number;
}

interface FriendRequest {
    id: string;
    fromUserId: string;
    fromUserName: string;
    fromUserEmail: string;
    toUserId: string;
    status: 'pending' | 'accepted' | 'rejected';
    createdAt: string;
    message?: string;
}

export default function ProfileScreen() {
    const { user } = useAuth();
    const router = useRouter();

    // State management for all the data we need
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
    const [friends, setFriends] = useState<any[]>([]);
    const [processingRequest, setProcessingRequest] = useState<string | null>(null);

    // Load everything when the screen first mounts
    useEffect(() => {
        loadProfile();
        loadFriendRequests();
        loadFriends();
    }, []);

    // Fetch user profile from Firestore
    const loadProfile = async () => {
        if (!user) return;

        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));

            if (userDoc.exists()) {
                // User profile exists in database
                const data = userDoc.data();
                setProfile({
                    uid: user.uid,
                    email: data.email || user.email || '',
                    displayName: data.displayName || user.email || 'User',
                    bio: data.bio || '',
                    skillsTeaching: data.skillsTeaching || [],
                    skillsLearning: data.skillsLearning || [],
                    profileImage: data.profileImage || '',
                    location: data.location || '',
                    status: data.status || 'offline',
                    friendCount: data.friendCount || 0,
                });
            } else {
                // No profile yet, create a default one
                const defaultProfile: UserProfile = {
                    uid: user.uid,
                    email: user.email || '',
                    displayName: user.email || 'User',
                    bio: '',
                    skillsTeaching: [],
                    skillsLearning: [],
                    status: 'online',
                    friendCount: 0,
                };
                setProfile(defaultProfile);
            }
        } catch (error: any) {
            console.error('Error loading profile:', error);
            Alert.alert('Error', 'Failed to load profile');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // Get all pending friend requests for this user
    const loadFriendRequests = async () => {
        if (!user) return;

        try {
            const requestsRef = collection(db, 'friendRequests');
            const q = query(
                requestsRef,
                where('toUserId', '==', user.uid),
                where('status', '==', 'pending')
            );
            const querySnapshot = await getDocs(q);

            const requests: FriendRequest[] = [];
            querySnapshot.forEach((doc) => {
                requests.push({
                    id: doc.id,
                    ...doc.data(),
                } as FriendRequest);
            });

            setFriendRequests(requests);
        } catch (error) {
            console.error('Error loading friend requests:', error);
        }
    };

    // Load the user's current friends list
    const loadFriends = async () => {
        if (!user) return;

        try {
            const friendsRef = collection(db, 'friends');
            const q = query(friendsRef, where('userId', '==', user.uid));
            const querySnapshot = await getDocs(q);

            const friendsList: any[] = [];
            querySnapshot.forEach((doc) => {
                friendsList.push({
                    id: doc.id,
                    ...doc.data(),
                });
            });

            setFriends(friendsList);
        } catch (error) {
            console.error('Error loading friends:', error);
        }
    };

    // Handles accepting a friend request
    // Creates bidirectional friendship and updates counts
    const handleAcceptRequest = async (requestId: string, fromUserId: string, fromUserName: string, fromUserEmail: string) => {
        if (!user) return;

        setProcessingRequest(requestId);

        try {
            console.log('🎉 Accepting friend request...');

            // STEP 1: Mark the friend request as accepted
            console.log('📝 Step 1: Updating friend request status...');
            await updateDoc(doc(db, 'friendRequests', requestId), {
                status: 'accepted',
                acceptedAt: new Date().toISOString(),
            });
            console.log('✅ Friend request status updated');

            // STEP 2: Check if they're already friends (prevent duplicates)
            console.log('🔍 Step 2: Checking for existing friendship...');
            const existingFriendQuery = query(
                collection(db, 'friends'),
                where('userId', '==', user.uid),
                where('friendId', '==', fromUserId)
            );
            const existingFriendSnapshot = await getDocs(existingFriendQuery);

            if (existingFriendSnapshot.empty) {
                // STEP 3: Create friendship record for current user
                console.log('👥 Step 3: Creating friendship for current user...');
                await addDoc(collection(db, 'friends'), {
                    userId: user.uid,
                    userName: user.displayName || user.email,
                    userEmail: user.email,
                    friendId: fromUserId,
                    friendName: fromUserName,
                    friendEmail: fromUserEmail,
                    createdAt: new Date().toISOString(),
                });
                console.log('✅ Friendship created for current user');

                // STEP 4: Create friendship record for the other user (makes it bidirectional)
                console.log('👥 Step 4: Creating friendship for other user...');
                await addDoc(collection(db, 'friends'), {
                    userId: fromUserId,
                    userName: fromUserName,
                    userEmail: fromUserEmail,
                    friendId: user.uid,
                    friendName: user.displayName || user.email,
                    friendEmail: user.email,
                    createdAt: new Date().toISOString(),
                });
                console.log('✅ Friendship created for other user');

                // STEP 5: Update friend counts for both users
                console.log('🔢 Step 5: Updating friend counts...');
                try {
                    // Get current user's friend count and increment it
                    const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
                    const currentUserData = currentUserDoc.data();
                    const currentFriendCount = currentUserData?.friendCount || 0;

                    await updateDoc(doc(db, 'users', user.uid), {
                        friendCount: currentFriendCount + 1,
                    });

                    // Same for the other user
                    const otherUserDoc = await getDoc(doc(db, 'users', fromUserId));
                    const otherUserData = otherUserDoc.data();
                    const otherFriendCount = otherUserData?.friendCount || 0;

                    await updateDoc(doc(db, 'users', fromUserId), {
                        friendCount: otherFriendCount + 1,
                    });
                    console.log('✅ Friend counts updated');
                } catch (countError) {
                    // If count update fails, that's okay - friendship still created
                    console.error('⚠️ Error updating friend counts:', countError);
                }
            } else {
                console.log('⚠️ Friendship already exists, skipping creation');
            }

            console.log('🎉 Friend request accepted successfully!');

            // Give Firestore a moment to sync everything
            await new Promise(resolve => setTimeout(resolve, 500));

            // Refresh all the data to show the new friend
            await Promise.all([
                loadFriendRequests(),
                loadFriends(),
                loadProfile()
            ]);

            Alert.alert('Success! 🎉', `You and ${fromUserName} are now friends!`);
        } catch (error: any) {
            console.error('❌ Error accepting request:', error);
            console.error('❌ Error details:', {
                code: error.code,
                message: error.message,
                stack: error.stack
            });
            Alert.alert('Error', `Failed to accept friend request. Please try again.`);
        } finally {
            setProcessingRequest(null);
        }
    };

    // Reject a friend request - much simpler than accepting
    const handleRejectRequest = async (requestId: string) => {
        try {
            await updateDoc(doc(db, 'friendRequests', requestId), {
                status: 'rejected',
                rejectedAt: new Date().toISOString(),
            });

            Alert.alert('Request Rejected', 'Friend request has been rejected');
            loadFriendRequests();
        } catch (error: any) {
            console.error('Error rejecting request:', error);
            Alert.alert('Error', 'Failed to reject friend request');
        }
    };

    // Open a chat with a friend
    const handleOpenChat = (friendId: string, friendName: string) => {
        if (!user) return;

        // Generate a unique conversation ID for this pair of users
        const conversationId = generateConversationId(user.uid, friendId);

        console.log('💬 Opening chat with:', friendName);
        console.log('📝 Conversation ID:', conversationId);

        router.push({
            pathname: '/(app)/chat-room',
            params: {
                conversationId,
                otherUserId: friendId,
                otherUserName: friendName,
            },
        });
    };

    // Pull-to-refresh handler
    const onRefresh = () => {
        setRefreshing(true);
        loadProfile();
        loadFriendRequests();
        loadFriends();
    };

    // Show loading spinner while fetching data
    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#007AFF" />
                    <Text style={styles.loadingText}>Loading profile...</Text>
                </View>
            </SafeAreaView>
        );
    }

    // Show error if profile couldn't be loaded
    if (!profile) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>Profile not found</Text>
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
                {/* Header with edit button */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>My Profile</Text>
                    <TouchableOpacity onPress={() => router.push('/(app)/settings')}>
                        <Ionicons name="settings-sharp" size={26}/>
                    </TouchableOpacity>
                </View>

                {/* Main profile card with avatar, name, and stats */}
                <View style={styles.profileCard}>
                    <View style={styles.avatarContainer}>
                        {/* Avatar shows first letter of name */}
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>
                                {profile.displayName.charAt(0).toUpperCase()}
                            </Text>
                        </View>
                        {/* Online status indicator */}
                        <View
                            style={[
                                styles.statusBadge,
                                { backgroundColor: profile.status === 'online' ? '#4CAF50' : '#ccc' },
                            ]}
                        />
                    </View>
                    <Text style={styles.displayName}>{profile.displayName}</Text>
                    <Text style={styles.email}>{profile.email}</Text>
                    {profile.location && (
                        <Text style={styles.location}>📍 {profile.location}</Text>
                    )}
                    {profile.bio && <Text style={styles.bio}>{profile.bio}</Text>}

                    {/* Stats row - friends, teaching, learning counts */}
                    <View style={styles.statsContainer}>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{friends.length}</Text>
                            <Text style={styles.statLabel}>Friends</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{profile.skillsTeaching.length}</Text>
                            <Text style={styles.statLabel}>Teaching</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{profile.skillsLearning.length}</Text>
                            <Text style={styles.statLabel}>Learning</Text>
                        </View>
                    </View>
                </View>

                {/* Friend requests section - only shows if there are pending requests */}
                {friendRequests.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>
                            🔔 Friend Requests ({friendRequests.length})
                        </Text>
                        {friendRequests.map((request) => (
                            <View key={request.id} style={styles.requestCard}>
                                <View style={styles.requestInfo}>
                                    <Text style={styles.requestName}>{request.fromUserName}</Text>
                                    <Text style={styles.requestEmail}>{request.fromUserEmail}</Text>
                                    {request.message && (
                                        <Text style={styles.requestMessage}>"{request.message}"</Text>
                                    )}
                                </View>
                                {/* Accept/Reject buttons */}
                                <View style={styles.requestActions}>
                                    <TouchableOpacity
                                        style={[
                                            styles.requestButton,
                                            styles.acceptButton,
                                            processingRequest === request.id && styles.disabledButton
                                        ]}
                                        onPress={() =>
                                            handleAcceptRequest(
                                                request.id,
                                                request.fromUserId,
                                                request.fromUserName,
                                                request.fromUserEmail
                                            )
                                        }
                                        disabled={processingRequest === request.id}
                                    >
                                        {processingRequest === request.id ? (
                                            <ActivityIndicator size="small" color="#fff" />
                                        ) : (
                                            <Text style={styles.acceptButtonText}>✓ Accept</Text>
                                        )}
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.requestButton, styles.rejectButton]}
                                        onPress={() => handleRejectRequest(request.id)}
                                        disabled={processingRequest === request.id}
                                    >
                                        <Text style={styles.rejectButtonText}>✕ Reject</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* Skills they can teach */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>🎓 Skills I Can Teach</Text>
                        <TouchableOpacity onPress={() => router.push('/(app)/edit-profile')}>
                            <Text style={styles.addButton}>+ Add</Text>
                        </TouchableOpacity>
                    </View>
                    {profile.skillsTeaching.length > 0 ? (
                        <View style={styles.skillsContainer}>
                            {profile.skillsTeaching.map((skill, index) => (
                                <View key={index} style={[styles.skillChip, styles.teachingChip]}>
                                    <Text style={styles.skillChipText}>{skill}</Text>
                                </View>
                            ))}
                        </View>
                    ) : (
                        <View style={styles.emptySkills}>
                            <Text style={styles.emptySkillsText}>
                                No skills added yet. Add skills you can teach!
                            </Text>
                        </View>
                    )}
                </View>

                {/* Skills they want to learn */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>📚 Skills I Want to Learn</Text>
                        <TouchableOpacity onPress={() => router.push('/(app)/edit-profile')}>
                            <Text style={styles.addButton}>+ Add</Text>
                        </TouchableOpacity>
                    </View>
                    {profile.skillsLearning.length > 0 ? (
                        <View style={styles.skillsContainer}>
                            {profile.skillsLearning.map((skill, index) => (
                                <View key={index} style={[styles.skillChip, styles.learningChip]}>
                                    <Text style={styles.skillChipText}>{skill}</Text>
                                </View>
                            ))}
                        </View>
                    ) : (
                        <View style={styles.emptySkills}>
                            <Text style={styles.emptySkillsText}>
                                No learning goals yet. Add skills you want to learn!
                            </Text>
                        </View>
                    )}
                </View>

                {/* Friends list with message buttons */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>👥 My Friends ({friends.length})</Text>
                        <TouchableOpacity onPress={() => router.push('/(app)/find-friends')}>
                            <Text style={styles.addButton}>Find Friends</Text>
                        </TouchableOpacity>
                    </View>
                    {friends.length > 0 ? (
                        friends.map((friend) => (
                            <View key={friend.id} style={styles.friendCard}>
                                <View style={styles.friendAvatar}>
                                    <Text style={styles.friendAvatarText}>
                                        {friend.friendName?.charAt(0).toUpperCase()}
                                    </Text>
                                </View>
                                <View style={styles.friendInfo}>
                                    <Text style={styles.friendName}>{friend.friendName}</Text>
                                    <Text style={styles.friendEmail}>{friend.friendEmail}</Text>
                                </View>
                                {/* Message button opens chat with this friend */}
                                <TouchableOpacity
                                    style={styles.messageButton}
                                    onPress={() => handleOpenChat(friend.friendId, friend.friendName)}
                                >
                                    <Text style={styles.messageButtonText}>💬</Text>
                                </TouchableOpacity>
                            </View>
                        ))
                    ) : (
                        <View style={styles.emptySkills}>
                            <Text style={styles.emptySkillsText}>
                                No friends yet. Start connecting with others!
                            </Text>
                        </View>
                    )}
                </View>

                <View style={styles.bottomSpacer} />
            </ScrollView>
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
    loadingText: {
        marginTop: 12,
        fontSize: 16,
        color: '#666',
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
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#333',
    },
    editButton: {
        backgroundColor: '#007AFF',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 8,
    },
    editButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14,
    },
    // Main profile card styling
    profileCard: {
        backgroundColor: '#fff',
        padding: 24,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    avatarContainer: {
        position: 'relative',
        marginBottom: 16,
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: '#007AFF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 40,
        fontWeight: 'bold',
        color: '#fff',
    },
    // Little green/gray dot showing online status
    statusBadge: {
        position: 'absolute',
        bottom: 5,
        right: 5,
        width: 20,
        height: 20,
        borderRadius: 10,
        borderWidth: 3,
        borderColor: '#fff',
    },
    displayName: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 4,
    },
    email: {
        fontSize: 16,
        color: '#666',
        marginBottom: 8,
    },
    location: {
        fontSize: 14,
        color: '#999',
        marginBottom: 12,
    },
    bio: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        marginBottom: 20,
        paddingHorizontal: 20,
        lineHeight: 20,
    },
    // Stats section with dividers
    statsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        width: '100%',
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
    },
    statItem: {
        alignItems: 'center',
        flex: 1,
    },
    statValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#007AFF',
        marginBottom: 4,
    },
    statLabel: {
        fontSize: 12,
        color: '#666',
    },
    statDivider: {
        width: 1,
        height: 40,
        backgroundColor: '#e0e0e0',
    },
    section: {
        padding: 20,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#333',
    },
    addButton: {
        fontSize: 14,
        color: '#007AFF',
        fontWeight: '600',
    },
    skillsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    // Skill chips with different colors for teaching vs learning
    skillChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 16,
        marginRight: 8,
        marginBottom: 8,
    },
    teachingChip: {
        backgroundColor: '#E3F2FD',
    },
    learningChip: {
        backgroundColor: '#FFF3E0',
    },
    skillChipText: {
        fontSize: 14,
        fontWeight: '500',
        color: '#333',
    },
    emptySkills: {
        padding: 20,
        backgroundColor: '#f9f9f9',
        borderRadius: 12,
        alignItems: 'center',
    },
    emptySkillsText: {
        fontSize: 14,
        color: '#999',
        textAlign: 'center',
    },
    // Friend request cards with blue border
    requestCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#007AFF',
    },
    requestInfo: {
        marginBottom: 12,
    },
    requestName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    requestEmail: {
        fontSize: 14,
        color: '#666',
        marginBottom: 8,
    },
    requestMessage: {
        fontSize: 13,
        color: '#007AFF',
        fontStyle: 'italic',
    },
    requestActions: {
        flexDirection: 'row',
        gap: 8,
    },
    requestButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
    },
    acceptButton: {
        backgroundColor: '#4CAF50',
    },
    acceptButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14,
    },
    rejectButton: {
        backgroundColor: '#f0f0f0',
    },
    rejectButtonText: {
        color: '#666',
        fontWeight: '600',
        fontSize: 14,
    },
    disabledButton: {
        opacity: 0.6,
    },
    // Friend list item styling
    friendCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 12,
        marginBottom: 8,
    },
    friendAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: '#4CAF50',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    friendAvatarText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
    },
    friendInfo: {
        flex: 1,
    },
    friendName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 2,
    },
    friendEmail: {
        fontSize: 13,
        color: '#666',
    },
    // Message button on friend cards
    messageButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#E3F2FD',
        justifyContent: 'center',
        alignItems: 'center',
    },
    messageButtonText: {
        fontSize: 20,
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
    bottomSpacer: {
        height: 40,
    },
});