import { haversineDistance } from '@/utils/haversineDistance';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, deleteDoc, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
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
    accentRed: '#EF4444',
};

// Friend data structure interface
interface Friend {
    id: string;
    userId: string;
    friendId: string;
    friendName: string;
    friendEmail: string;
    createdAt: string;
    status?: 'online' | 'offline';
    skillsTeaching?: string[];
    skillsLearning?: string[];
    location?: any;
}

// Friends List Screen
export default function FriendsListScreen() {
    // Hooks and State
    const { user } = useAuth();
    const router = useRouter();

    // State variables
    const [friends, setFriends] = useState<Friend[]>([]);
    const [filteredFriends, setFilteredFriends] = useState<Friend[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchText, setSearchText] = useState('');

    // Load friends on mount
    useEffect(() => {
        loadFriends();
    }, []);

    // Load friends from Firestore
    const loadFriends = async () => {
        if (!user) return;

        try {
            // Indicate loading state
            setLoading(true);
            const friendsRef = collection(db, 'friends');
            const q = query(friendsRef, where('userId', '==', user.uid));
            // Query friends where the current user is the owner
            const querySnapshot = await getDocs(q);

            const friendsList: Friend[] = [];

            // Fetch each friend's profile data
            for (const docSnap of querySnapshot.docs) {
                const friendData = docSnap.data();

                // Safe default in case friendName is missing in the friend record
                let finalFriendName = friendData.friendName || 'User';
                let finalFriendEmail = friendData.friendEmail || '';
                let status: 'online' | 'offline' = 'offline';
                let skillsTeaching: string[] = [];
                let skillsLearning: string[] = [];
                let location = '';

                try {
                    // Fetch latest profile details
                    const friendProfileDoc = await getDoc(doc(db, 'users', friendData.friendId));
                    if (friendProfileDoc.exists()) {
                        const profileData = friendProfileDoc.data();
                        // Prioritize profile name, fallback to existing data, then 'User'
                        finalFriendName = profileData.displayName || finalFriendName;
                        finalFriendEmail = profileData.email || finalFriendEmail;
                        status = profileData.status || 'offline';
                        skillsTeaching = profileData.skillsTeaching || [];
                        skillsLearning = profileData.skillsLearning || [];
                        location = profileData.location || '';
                    }
                } catch (error) {
                    console.error('Error fetching profile for friend:', friendData.friendId, error);
                }

                // Construct friend object and add to list
                friendsList.push({
                    id: docSnap.id,
                    userId: friendData.userId,
                    friendId: friendData.friendId,
                    friendName: finalFriendName,
                    friendEmail: finalFriendEmail,
                    createdAt: friendData.createdAt,
                    status,
                    skillsTeaching,
                    skillsLearning,
                    location,
                });
            }

            // Sort by most recently added
            friendsList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            // Update state with loaded friends
            setFriends(friendsList);
            setFilteredFriends(friendsList);
        } catch (error: any) {
            console.error('Error loading friends:', error);
            Alert.alert('Error', 'Failed to load friends');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // Search handler for filtering friends - FIXED VERSION
    const handleSearch = (text: string) => {
        setSearchText(text);
        if (text.trim() === '') {
            // If search is empty, show all friends
            setFilteredFriends(friends);
        } else {
            // Filter friends based on name, email, or location
            const lowerText = text.toLowerCase();
            const filtered = friends.filter((friend) => {
                // Check name
                if (friend.friendName && friend.friendName.toLowerCase().includes(lowerText)) {
                    return true;
                }

                // Check email
                if (friend.friendEmail && friend.friendEmail.toLowerCase().includes(lowerText)) {
                    return true;
                }

                // Check location - SAFE handling for both string and object types
                if (friend.location) {
                    // Only search if location is a string
                    if (typeof friend.location === 'string' && friend.location.toLowerCase().includes(lowerText)) {
                        return true;
                    }
                    // Skip if location is an object (coordinates) - can't search coordinates
                }

                return false;
            });
            setFilteredFriends(filtered);
        }
    };

    // Remove friend handler with confirmation
    const handleRemoveFriend = (friendId: string, friendName: string) => {
        Alert.alert(
            'Remove Friend',
            `Are you sure you want to remove ${friendName}? Chat history will be deleted.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive', // Highlight as destructive action
                    // Confirm removal and delete friend and chat history
                    onPress: async () => {
                        try {
                            if (!user) return;
                            const friendsRef = collection(db, 'friends');

                            // Delete my record of them
                            const q1 = query(friendsRef, where('userId', '==', user.uid), where('friendId', '==', friendId));
                            const snap1 = await getDocs(q1);
                            snap1.forEach(async (d) => await deleteDoc(d.ref));

                            // Delete their record of me
                            const q2 = query(friendsRef, where('userId', '==', friendId), where('friendId', '==', user.uid));
                            const snap2 = await getDocs(q2);
                            snap2.forEach(async (d) => await deleteDoc(d.ref));

                            // Update counts
                            const userDoc = await getDoc(doc(db, 'users', user.uid));
                            const friendDoc = await getDoc(doc(db, 'users', friendId));

                            // Decrement my friend counts safely
                            if (userDoc.exists()) {
                                const current = userDoc.data().friendCount || 0;
                                await updateDoc(doc(db, 'users', user.uid), { friendCount: Math.max(0, current - 1) });
                            }
                            // Decrement my friend's friend count safely
                            if (friendDoc.exists()) {
                                const current = friendDoc.data().friendCount || 0;
                                await updateDoc(doc(db, 'users', friendId), { friendCount: Math.max(0, current - 1) });
                            }

                            // delete chat history
                            const conversationsRef = collection(db, 'conversations');
                            // Query conversations involving both users
                            const chatQuery = query(
                                conversationsRef,
                                where('participants', 'array-contains', user.uid)
                            );

                            // Fetch conversations and filter those with the friend
                            const chatSnap = await getDocs(chatQuery);

                            // Delete relevant conversations
                            chatSnap.forEach(async (chatDoc) => {
                                const data = chatDoc.data();
                                if (data.participants && data.participants.includes(friendId)) {
                                    await deleteDoc(chatDoc.ref);
                                    console.log(`Deleted conversation: ${chatDoc.id}`);
                                }
                            });

                            Alert.alert('Success', 'Friend and chat history removed');
                            loadFriends(); // Refresh friends list
                        } catch (error) {
                            console.error(error);
                            Alert.alert('Error', 'Failed to remove friend');
                        }
                    },
                },
            ]
        );
    };

    // Refresh handler
    const onRefresh = () => {
        setRefreshing(true);
        loadFriends();
    };

    // Current user's location state
    const [currentUserLocation, setCurrentUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

    // Fetch current user's location on mount
    useEffect(() => {
        const fetchUserLocation = async () => {
            if (!user) return;
            try {
                // get current user's location
                const docSnap = await getDoc(doc(db, "users", user.uid));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.location) { // Ensure location exists before setting
                        setCurrentUserLocation({
                            // Set latitude and longitude from user's location data
                            latitude: data.location.latitude,
                            longitude: data.location.longitude,
                        });
                    }
                }
            } catch (err) {
                console.error("Error fetching current user location:", err);
            }
        };

        // Fetch user location when component mounts or user changes
        fetchUserLocation();
    }, [user]); // Only run when user changes

    // Render individual friend card
    const renderFriendCard = (friend: Friend) => {
        const isOnline = friend.status === 'online';
        const displayName = friend.friendName || 'User';

        // Fix safe location display
        let locationText = "Location unavailable";
        if (friend.location && currentUserLocation) {
            try {
                // Calculate distance using haversine formula
                const distance = haversineDistance(
                    currentUserLocation,
                    { latitude: friend.location.latitude, longitude: friend.location.longitude }
                );
                // Display distance in km with one decimal place
                locationText = `${distance.toFixed(1)} km away`;
            } catch (err) {
                locationText = "Location unavailable";
            }
        }

        return (
            // Clickable friend card
            <TouchableOpacity
                key={friend.id}
                style={styles.friendCard}
                onPress={() => router.push({ // Navigate to friend's profile
                    pathname: '/(app)/user_profile',
                    params: { userId: friend.friendId }
                })}
                activeOpacity={0.7}
            >
                {/* Friend Header Section */}
                <View style={styles.friendHeader}>
                    <View style={styles.leftSection}>
                        {/* Avatar */}
                        <View style={styles.avatarContainer}>
                            <View style={styles.friendAvatar}>
                                <Text style={styles.friendAvatarText}>
                                    {displayName.charAt(0).toUpperCase()}
                                </Text>
                            </View>
                            {isOnline && <View style={styles.onlineBadge} />}
                        </View>

                        {/* Info */}
                        <View style={styles.friendInfo}>
                            <Text style={styles.friendName}>{displayName}</Text>
                            {locationText && (
                                <Text style={styles.location}>📍 {locationText}</Text>
                            )}
                        </View>
                    </View>

                    {/* Actions */}
                    <View style={styles.actionButtons}>
                        <TouchableOpacity
                            style={styles.messageButton}
                            onPress={(e) => {
                                e.stopPropagation();
                                const conversationId = [user?.uid, friend.friendId].sort().join('_');
                                router.push({
                                    pathname: '/(app)/chat-room',
                                    params: {
                                        conversationId,
                                        otherUserId: friend.friendId,
                                        otherUserName: displayName,
                                    },
                                });
                            }}
                        >
                            <Ionicons name="chatbubble-ellipses-outline" size={20} color={COLORS.accentGreen} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.removeButton}
                            onPress={(e) => {
                                e.stopPropagation();
                                handleRemoveFriend(friend.friendId, displayName);
                            }}
                        >
                            <Ionicons name="trash-outline" size={20} color={COLORS.accentRed} />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Skills Row */}
                <View style={styles.skillsRow}>
                    {friend.skillsTeaching && friend.skillsTeaching.length > 0 && (
                        <View style={styles.skillGroup}>
                            <Text style={styles.skillLabel}>Teaches:</Text>
                            <Text style={styles.skillList} numberOfLines={1}>
                                {friend.skillsTeaching.join(', ')}
                            </Text>
                        </View>
                    )}
                    {friend.skillsLearning && friend.skillsLearning.length > 0 && (
                        <View style={styles.skillGroup}>
                            <Text style={styles.skillLabel}>Learns:</Text>
                            <Text style={styles.skillList} numberOfLines={1}>
                                {friend.skillsLearning.join(', ')}
                            </Text>
                        </View>
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    // Show loading indicator while fetching friends
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
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.push('/(app)/profile')} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.title}>My Friends</Text>
                <TouchableOpacity
                    onPress={() => router.push('/find-friends')}
                    style={styles.addButton}
                >
                    <Ionicons name="person-add-outline" size={22} color={COLORS.textPrimary} />
                </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.searchContainer}>
                <View style={styles.searchBox}>
                    <Ionicons name="search" size={18} color={COLORS.textSecondary} style={{ marginRight: 8 }} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search friends..."
                        value={searchText}
                        onChangeText={handleSearch}
                        placeholderTextColor={COLORS.textSecondary}
                    />
                </View>
            </View>

            {/* Friends List */}
            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primaryBrand} />
                }
                contentContainerStyle={styles.listContent}
            >
                <Text style={styles.resultCount}>
                    {filteredFriends.length} {filteredFriends.length === 1 ? 'friend' : 'friends'}
                </Text>

                {/* Empty State or Friends */}
                {filteredFriends.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="people-outline" size={64} color={COLORS.border} />
                        <Text style={styles.emptyText}>
                            {searchText ? 'No friends found' : 'No friends yet'}
                        </Text>
                        {!searchText && (
                            <TouchableOpacity
                                style={styles.findFriendsButton}
                                onPress={() => router.push('/find-friends')}
                            >
                                <Text style={styles.findFriendsButtonText}>Find Friends</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ) : (
                    // Render friend cards
                    filteredFriends.map(renderFriendCard)
                )}
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
    content: {
        flex: 1,
    },
    listContent: {
        paddingBottom: 40,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: COLORS.background,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    backButton: {
        padding: 4,
    },
    title: {
        fontSize: 18,
        fontWeight: '800',
        color: COLORS.textPrimary,
    },
    addButton: {
        padding: 4,
    },
    searchContainer: {
        padding: 20,
        paddingBottom: 10,
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
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: COLORS.textPrimary,
    },
    resultCount: {
        fontSize: 14,
        color: COLORS.textSecondary,
        paddingHorizontal: 20,
        marginBottom: 12,
    },
    // Friend Card
    friendCard: {
        backgroundColor: COLORS.cardBackground,
        borderRadius: 12,
        padding: 16,
        marginHorizontal: 20,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        // Soft Shadow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    friendHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    leftSection: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    avatarContainer: {
        position: 'relative',
        marginRight: 12,
    },
    friendAvatar: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: COLORS.primaryBrand,
        justifyContent: 'center',
        alignItems: 'center',
    },
    friendAvatarText: {
        fontSize: 20,
        fontWeight: '700',
        color: COLORS.primaryBrandText,
    },
    onlineBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 14,
        height: 14,
        borderRadius: 7,
        backgroundColor: COLORS.accentGreen,
        borderWidth: 2,
        borderColor: COLORS.cardBackground,
    },
    friendInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    friendName: {
        fontSize: 16,
        fontWeight: '700',
        color: COLORS.textPrimary,
        marginBottom: 2,
    },
    location: {
        fontSize: 12,
        color: COLORS.textSecondary,
    },
    // Skills Section
    skillsRow: {
        marginTop: 4,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
        gap: 2,
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
    // Actions
    actionButtons: {
        flexDirection: 'row',
        gap: 8,
        marginLeft: 8,
    },
    messageButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#ECFDF5', // Light green bg
        justifyContent: 'center',
        alignItems: 'center',
    },
    removeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#FEF2F2', // Light red bg
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Empty State
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        fontSize: 18,
        fontWeight: '600',
        color: COLORS.textPrimary,
        marginTop: 16,
        marginBottom: 8,
    },
    findFriendsButton: {
        marginTop: 12,
        backgroundColor: COLORS.primaryBrand,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
    },
    findFriendsButtonText: {
        color: COLORS.primaryBrandText,
        fontWeight: '700',
    },
});