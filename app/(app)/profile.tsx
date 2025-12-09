import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { addDoc, collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import React, { useCallback, useState } from 'react';
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

// Theme Configuration
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
    accentRed: '#EF4444',
};

// User Profile Types
interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    bio?: string;
    skillsTeaching: string[];
    skillsLearning: string[];
    //location?: string; // Legacy
    status: 'online' | 'offline' | 'in-call';
    friendCount: number;
}

// Friend Request Types
interface FriendRequest {
    id: string;
    fromUserId: string;
    fromUserName: string;
    fromUserEmail: string;
    toUserId: string;
    status: 'pending' | 'accepted' | 'rejected';
}

// Friend Types
interface Friend {
    id: string; // friend document id
    friendId: string; // user id of the friend
    displayName: string;
    email: string;
}

// Main Profile Screen
export default function ProfileScreen() {
    // Hooks & State
    const { user } = useAuth();
    const router = useRouter();

    // State
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [requests, setRequests] = useState<FriendRequest[]>([]);
    const [friends, setFriends] = useState<Friend[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Use focus effect to reload data when screen appears
    useFocusEffect(
        // useCallback to memorize the function meaning it returns the same function reference across multiple renders unless its dependencies change
        useCallback(() => {
            loadAllData(); // Load all data when screen is focused
        }, [])
    );

    // Load all data function
    const loadAllData = async () => {
        if (!user) return;
        setLoading(true);
        // Parallel data loading for efficiency
        await Promise.all([loadUserProfile(), loadFriendRequests(), loadFriends()]); // Load profile, requests, and friends.
        setLoading(false);
        setRefreshing(false);
    };

    // Refresh handler
    const onRefresh = () => {
        setRefreshing(true);
        loadAllData();
    };

    // Load user profile from Firestore
    const loadUserProfile = async () => {
        if (!user) return;
        try {
            const docRef = doc(db, 'users', user.uid); // Reference to user document
            const docSnap = await getDoc(docRef);
            // Check if document exists
            if (docSnap.exists()) {
                setProfile(docSnap.data() as UserProfile); // Set profile state
            }
        } catch (error) {
            console.error("Error loading profile", error);
        }
    };

    // Load friend requests from Firestore
    const loadFriendRequests = async () => {
        if (!user) return;
        try {
            // Query for pending friend requests to the current user
            const q = query(
                collection(db, 'friendRequests'),
                where('toUserId', '==', user.uid),
                where('status', '==', 'pending')
            );
            // Execute the query to get pending friend requests
            const snapshot = await getDocs(q);

            const reqs: FriendRequest[] = []; // Temporary array to hold requests

            snapshot.forEach(doc => {
                // Push each request into the array
                reqs.push({ id: doc.id, ...doc.data() } as FriendRequest);
            });
            setRequests(reqs); // Update state with fetched requests
        } catch (error) {
            console.error("Error loading requests", error);
        }
    };

    // Load friends from Firestore
    const loadFriends = async () => {
        if (!user) return;
        try {
            // Query for friends where current user is the owner
            const q = query(
                collection(db, 'friends'),
                where('userId', '==', user.uid)
            );
            // Execute the query to get friends
            const snapshot = await getDocs(q);
            
            const friendsData: Friend[] = []; // Temporary array to hold friends
            
            // For each friend document, fetch the friend's profile data
            for (const friendDoc of snapshot.docs) {
                const fData = friendDoc.data(); // Friend document data
                const friendProfileRef = doc(db, 'users', fData.friendId); // Reference to friend's profile
                const friendProfileSnap = await getDoc(friendProfileRef); // Fetch friend's profile
                
                if (friendProfileSnap.exists()) { // Check if profile exists
                    const fp = friendProfileSnap.data();
                    // Push friend data into the array
                    friendsData.push({
                        id: friendDoc.id,
                        friendId: fData.friendId,
                        displayName: fp.displayName || fp.email || 'User',
                        email: fp.email
                    });
                }
            }
            setFriends(friendsData); // Update state with fetched friends
        } catch (error) {
            console.error("Error loading friends", error);
        }
    };

    // Handle accepting a friend request
    const handleAcceptRequest = async (request: FriendRequest) => {
        try {
            // Update request status to accepted
            await updateDoc(doc(db, 'friendRequests', request.id), { status: 'accepted' });

            // Add friend to current user's friends list
            await addDoc(collection(db, 'friends'), {
                userId: user!.uid,
                friendId: request.fromUserId,
                createdAt: new Date().toISOString()
            });
            
            // Add the current user to the requester's friends list
            await addDoc(collection(db, 'friends'), {
                userId: request.fromUserId,
                friendId: user!.uid,
                createdAt: new Date().toISOString()
            });

            Alert.alert('Success', 'Friend request accepted!');
            loadAllData(); // Reload all data
        } catch (error) {
            Alert.alert('Error', 'Could not accept request');
        }
    };

    // Handle rejecting a friend request
    const handleRejectRequest = async (requestId: string) => {
        try {
            // Update request status to rejected
            await updateDoc(doc(db, 'friendRequests', requestId), { status: 'rejected' });
            loadFriendRequests(); // Reload friend requests only
        } catch (error) {
            console.error(error);
        }
    };

    // Handle messaging a friend
    const handleMessageFriend = (friend: Friend) => {
        if (!user) return;
        const conversationId = generateConversationId(user.uid, friend.friendId); // Generate unique conversation ID
        router.push({ // Navigate to chat room with params
            pathname: '/(app)/chat-room',
            params: {
                conversationId,
                otherUserId: friend.friendId,
                otherUserName: friend.displayName
            }
        });
    };

    // Loading state
    if (loading && !refreshing) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={COLORS.primaryBrand} />
                </View>
            </SafeAreaView>
        );
    }

    return (
        // Main Container
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Profile</Text>
                <TouchableOpacity onPress={() => router.push('/(app)/settings')} style={styles.settingsButton}>
                    <Ionicons name="settings-outline" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
            </View>

            {/* Content ScrollView */}
            <ScrollView 
                style={styles.content}
                contentContainerStyle={styles.scrollContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primaryBrand} />}
                showsVerticalScrollIndicator={false}
            >
                {/* Profile Header Card */}
                <View style={styles.profileCard}>
                    <View style={styles.profileHeader}>
                        <View style={styles.avatarContainer}>
                            <View style={styles.avatar}>
                                <Text style={styles.avatarText}>
                                    {profile?.displayName?.charAt(0).toUpperCase() || 'U'}
                                </Text>
                            </View>
                            <TouchableOpacity 
                                style={styles.editIconBtn}
                                onPress={() => router.push('/(app)/edit-profile')}
                            >
                                <Ionicons name="pencil" size={16} color="white" />
                            </TouchableOpacity>
                        </View>
                        
                        <Text style={styles.userName}>{profile?.displayName || 'User'}</Text>
                        <Text style={styles.userEmail}>{profile?.email}</Text>
                        
                        <Text style={styles.bioText}>{profile?.bio || 'No bio yet'}</Text>
                    </View>

                    {/* Stats Row */}
                    <View style={styles.statsRow}>
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{friends.length}</Text>
                            <Text style={styles.statLabel}>Friends</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{profile?.skillsTeaching?.length || 0}</Text>
                            <Text style={styles.statLabel}>Teaches</Text>
                        </View>
                        <View style={styles.statDivider} />
                        <View style={styles.statItem}>
                            <Text style={styles.statValue}>{profile?.skillsLearning?.length || 0}</Text>
                            <Text style={styles.statLabel}>Learns</Text>
                        </View>
                    </View>
                </View>

                {/* Skills Section */}
                <View style={styles.sectionContainer}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Skills</Text>
                        <TouchableOpacity onPress={() => router.push('/(app)/edit-profile')}>
                            <Text style={styles.linkText}>Manage</Text>
                        </TouchableOpacity>
                    </View>
                    {/* Skills Card */}
                    <View style={styles.skillsCard}>
                        <View style={styles.skillRow}>
                            {/* Teaches List */}
                            <Text style={styles.skillLabel}>Teaches:</Text>
                            <Text style={styles.skillList}>
                                {profile?.skillsTeaching && profile.skillsTeaching.length > 0 ? profile.skillsTeaching.join(', ') : 'No skills listed'}
                            </Text>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.skillRow}>
                            {/* Learns List */}
                            <Text style={styles.skillLabel}>Learns:</Text>
                            <Text style={styles.skillList}>
                                {profile?.skillsLearning && profile.skillsLearning.length > 0 ? profile.skillsLearning.join(', ') : 'No interests listed'}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Payments Section */}
                <View style={styles.sectionContainer}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Payments</Text>
                    </View>
                    <TouchableOpacity 
                        style={styles.menuItem} 
                        // Navigation to Payment History Screen
                        onPress={() => router.push('/(app)/history')}
                    >
                        <View style={styles.menuIconBox}>
                            <Ionicons name="receipt-outline" size={22} color={COLORS.primaryBrandText} />
                        </View>
                        <Text style={styles.menuText}>Transaction History</Text>
                        <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                </View>
                
                {/* Friend Requests */}
                {requests.length > 0 && (
                    <View style={styles.sectionContainer}>
                        {/* Friend Requests Title */}
                        <Text style={styles.sectionTitle}>Requests ({requests.length})</Text>
                        {requests.map(req => (
                            <View key={req.id} style={styles.requestCard}>
                                <View style={styles.requestInfo}>
                                    <View style={styles.miniAvatar}>
                                        <Text style={styles.miniAvatarText}>{req.fromUserName.charAt(0).toUpperCase()}</Text>
                                    </View>
                                    <View>
                                        <Text style={styles.requestName}>{req.fromUserName}</Text>
                                        <Text style={styles.requestSub}>wants to connect</Text>
                                    </View>
                                </View>
                                <View style={styles.requestActions}>
                                    {/* Accept & Reject Buttons */}
                                    <TouchableOpacity style={styles.rejectButton} onPress={() => handleRejectRequest(req.id)} >
                                        <Ionicons name="close" size={20} color={COLORS.textSecondary} />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.acceptButton} onPress={() => handleAcceptRequest(req)} >
                                        <Ionicons name="checkmark" size={20} color={COLORS.primaryBrandText} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                {/* Friends List */}
                <View style={styles.sectionContainer}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Friends ({friends.length})</Text>
                        
                        {/* Navigation to Friends List Page */}
                        <View style={{flexDirection: 'row', gap: 16}}>
                            <TouchableOpacity onPress={() => router.push('/(app)/friends-list')}>
                                <Text style={styles.linkText}>View All</Text>
                            </TouchableOpacity>
                            {/* Navigation to Find Friends Page */}
                            <TouchableOpacity onPress={() => router.push('/(app)/find-friends')}>
                                <Text style={styles.linkText}>+ Find New</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Friends Cards */}
                    {friends.length === 0 ? (
                        // if no friends, show empty state
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyText}>No friends yet.</Text>
                        </View>
                    ) : ( // else map through friends
                        friends.slice(0, 3).map(friend => ( // Only showing first 3 here now
                            <TouchableOpacity 
                                key={friend.id} 
                                style={styles.friendCard}
                                onPress={() => router.push({
                                    // Navigate to Friend's Profile Page with params
                                    pathname: '/(app)/user_profile',
                                    params: { userId: friend.friendId }
                                })}
                            >
                                <View style={styles.friendInfoContainer}>
                                    <View style={styles.miniAvatar}>
                                        <Text style={styles.miniAvatarText}>{friend.displayName.charAt(0).toUpperCase()}</Text>
                                    </View>
                                    <Text style={styles.friendName}>{friend.displayName}</Text>
                                </View>
                                {/* Message Friend Button */}
                                <TouchableOpacity style={styles.iconButton} onPress={() => handleMessageFriend(friend)}>
                                    <Ionicons name="chatbubble-ellipses-outline" size={20} color={COLORS.accentGreen} />
                                </TouchableOpacity>
                            </TouchableOpacity>
                        ))
                    )}
                </View>
                <View style={{height: 30}} />
            </ScrollView>
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
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: COLORS.background,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: COLORS.textPrimary,
    },
    settingsButton: {
        padding: 4,
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 40,
    },
    // Profile Card
    profileCard: {
        margin: 20,
        marginTop: 10,
        backgroundColor: COLORS.cardBackground,
        borderRadius: 20,
        padding: 20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: COLORS.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    profileHeader: {
        alignItems: 'center',
        width: '100%',
    },
    avatarContainer: {
        position: 'relative',
        marginBottom: 16,
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: COLORS.primaryBrand,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 40,
        fontWeight: '700',
        color: COLORS.primaryBrandText,
    },
    editIconBtn: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: COLORS.textPrimary,
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#fff',
    },
    userName: {
        fontSize: 22,
        fontWeight: '700',
        color: COLORS.textPrimary,
        marginBottom: 4,
    },
    userEmail: {
        fontSize: 14,
        color: COLORS.textSecondary,
        marginBottom: 8,
    },
    locationRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 4,
    },
    locationText: {
        fontSize: 14,
        color: COLORS.textSecondary,
    },
    bioText: {
        fontSize: 14,
        color: COLORS.textPrimary,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 20,
        paddingHorizontal: 20,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.lightGray,
        borderRadius: 16,
        paddingVertical: 12,
        paddingHorizontal: 20,
        width: '100%',
        justifyContent: 'space-between',
    },
    statItem: {
        alignItems: 'center',
        flex: 1,
    },
    statValue: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.textPrimary,
    },
    statLabel: {
        fontSize: 12,
        color: COLORS.textSecondary,
        marginTop: 2,
    },
    statDivider: {
        width: 1,
        height: 24,
        backgroundColor: COLORS.border,
    },
    // Sections
    sectionContainer: {
        marginHorizontal: 20,
        marginBottom: 20,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.textPrimary,
    },
    linkText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#D97706', // Darker yellow/orange for links
    },
    // Skills Card
    skillsCard: {
        backgroundColor: COLORS.cardBackground,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    skillRow: {
        flexDirection: 'row',
        paddingVertical: 4,
    },
    divider: {
        height: 1,
        backgroundColor: COLORS.border,
        marginVertical: 12,
    },
    skillLabel: {
        width: 70,
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.textSecondary,
    },
    skillList: {
        flex: 1,
        fontSize: 14,
        color: COLORS.textPrimary,
        lineHeight: 20,
    },
    // Request Card
    requestCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: COLORS.cardBackground,
        padding: 12,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
    },
    requestInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    miniAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: COLORS.primaryBrand,
        justifyContent: 'center',
        alignItems: 'center',
    },
    miniAvatarText: {
        fontSize: 16,
        fontWeight: '700',
        color: COLORS.primaryBrandText,
    },
    requestName: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.textPrimary,
    },
    requestSub: {
        fontSize: 12,
        color: COLORS.textSecondary,
    },
    requestActions: {
        flexDirection: 'row',
        gap: 8,
    },
    acceptButton: {
        backgroundColor: COLORS.primaryBrand,
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    rejectButton: {
        backgroundColor: COLORS.lightGray,
        width: 36,
        height: 36,
        borderRadius: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Friend Card
    friendCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: COLORS.cardBackground,
        padding: 12,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    friendInfoContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    friendName: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.textPrimary,
    },
    iconButton: {
        padding: 8,
        backgroundColor: '#F0FDF4',
        borderRadius: 20,
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 20,
    },
    emptyText: {
        color: COLORS.textSecondary,
        fontStyle: 'italic',
    },
    // Menu Link (Payment History)
    menuContainer: {
        marginHorizontal: 20,
        marginBottom: 20,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.cardBackground,
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    menuIconBox: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: COLORS.primaryBrand,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    menuText: {
        flex: 1,
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.textPrimary,
    },
});