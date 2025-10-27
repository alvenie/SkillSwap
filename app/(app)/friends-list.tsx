import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    RefreshControl,
    TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';
import { collection, query, where, getDocs, deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore';
import { useRouter } from 'expo-router';

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
    location?: string;
}

export default function FriendsListScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const [friends, setFriends] = useState<Friend[]>([]);
    const [filteredFriends, setFilteredFriends] = useState<Friend[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchText, setSearchText] = useState('');

    useEffect(() => {
        loadFriends();
    }, []);

    const loadFriends = async () => {
        if (!user) return;

        try {
            setLoading(true);
            const friendsRef = collection(db, 'friends');
            const q = query(friendsRef, where('userId', '==', user.uid));
            const querySnapshot = await getDocs(q);

            const friendsList: Friend[] = [];

            // Load each friend's details
            for (const docSnap of querySnapshot.docs) {
                const friendData = docSnap.data();

                // Get friend's user profile for additional info
                try {
                    const friendProfileDoc = await getDoc(doc(db, 'users', friendData.friendId));
                    if (friendProfileDoc.exists()) {
                        const profileData = friendProfileDoc.data();
                        friendsList.push({
                            id: docSnap.id,
                            userId: friendData.userId,
                            friendId: friendData.friendId,
                            friendName: friendData.friendName,
                            friendEmail: friendData.friendEmail,
                            createdAt: friendData.createdAt,
                            status: profileData.status || 'offline',
                            skillsTeaching: profileData.skillsTeaching || [],
                            skillsLearning: profileData.skillsLearning || [],
                            location: profileData.location || '',
                        });
                    } else {
                        // If profile not found, use basic info
                        friendsList.push({
                            id: docSnap.id,
                            userId: friendData.userId,
                            friendId: friendData.friendId,
                            friendName: friendData.friendName,
                            friendEmail: friendData.friendEmail,
                            createdAt: friendData.createdAt,
                        });
                    }
                } catch (error) {
                    console.error('Error loading friend profile:', error);
                    // Add friend with basic info on error
                    friendsList.push({
                        id: docSnap.id,
                        userId: friendData.userId,
                        friendId: friendData.friendId,
                        friendName: friendData.friendName,
                        friendEmail: friendData.friendEmail,
                        createdAt: friendData.createdAt,
                    });
                }
            }

            // Sort by most recent
            friendsList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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

    const handleSearch = (text: string) => {
        setSearchText(text);
        if (text.trim() === '') {
            setFilteredFriends(friends);
        } else {
            const filtered = friends.filter(
                (friend) =>
                    friend.friendName.toLowerCase().includes(text.toLowerCase()) ||
                    friend.friendEmail.toLowerCase().includes(text.toLowerCase()) ||
                    friend.location?.toLowerCase().includes(text.toLowerCase())
            );
            setFilteredFriends(filtered);
        }
    };

    const handleRemoveFriend = (friendId: string, friendName: string) => {
        Alert.alert(
            'Remove Friend',
            `Are you sure you want to remove ${friendName} from your friends?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            if (!user) return;

                            // Find and delete friendship records for both users
                            const friendsRef = collection(db, 'friends');

                            // Delete current user's friendship record
                            const q1 = query(
                                friendsRef,
                                where('userId', '==', user.uid),
                                where('friendId', '==', friendId)
                            );
                            const snapshot1 = await getDocs(q1);
                            for (const doc of snapshot1.docs) {
                                await deleteDoc(doc.ref);
                            }

                            // Delete friend's friendship record
                            const q2 = query(
                                friendsRef,
                                where('userId', '==', friendId),
                                where('friendId', '==', user.uid)
                            );
                            const snapshot2 = await getDocs(q2);
                            for (const doc of snapshot2.docs) {
                                await deleteDoc(doc.ref);
                            }

                            // Update friend counts
                            const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
                            const friendUserDoc = await getDoc(doc(db, 'users', friendId));

                            const currentFriendCount = currentUserDoc.data()?.friendCount || 0;
                            const friendFriendCount = friendUserDoc.data()?.friendCount || 0;

                            await updateDoc(doc(db, 'users', user.uid), {
                                friendCount: Math.max(0, currentFriendCount - 1),
                            });

                            await updateDoc(doc(db, 'users', friendId), {
                                friendCount: Math.max(0, friendFriendCount - 1),
                            });

                            Alert.alert('Removed', `${friendName} has been removed from your friends`);
                            loadFriends();
                        } catch (error: any) {
                            console.error('Error removing friend:', error);
                            Alert.alert('Error', 'Failed to remove friend');
                        }
                    },
                },
            ]
        );
    };

    const handleViewProfile = (friend: Friend) => {
        Alert.alert(
            friend.friendName,
            `Email: ${friend.friendEmail}\n` +
            `Location: ${friend.location || 'Not specified'}\n\n` +
            `Can teach:\n${friend.skillsTeaching?.join(', ') || 'No skills listed'}\n\n` +
            `Wants to learn:\n${friend.skillsLearning?.join(', ') || 'No learning goals'}`
        );
    };

    const onRefresh = () => {
        setRefreshing(true);
        loadFriends();
    };

    const renderFriendCard = (friend: Friend) => {
        const isOnline = friend.status === 'online';

        return (
            <TouchableOpacity
                key={friend.id}
                style={styles.friendCard}
                onPress={() => handleViewProfile(friend)}
                activeOpacity={0.7}
            >
                <View style={styles.friendContent}>
                    <View style={styles.avatarContainer}>
                        <View style={styles.friendAvatar}>
                            <Text style={styles.friendAvatarText}>
                                {friend.friendName.charAt(0).toUpperCase()}
                            </Text>
                        </View>
                        <View
                            style={[
                                styles.statusBadge,
                                { backgroundColor: isOnline ? '#4CAF50' : '#ccc' },
                            ]}
                        />
                    </View>

                    <View style={styles.friendInfo}>
                        <Text style={styles.friendName}>{friend.friendName}</Text>
                        <Text style={styles.friendEmail}>{friend.friendEmail}</Text>
                        {friend.location && (
                            <Text style={styles.location}>📍 {friend.location}</Text>
                        )}

                        {/* Skills Preview */}
                        {friend.skillsTeaching && friend.skillsTeaching.length > 0 && (
                            <View style={styles.skillsPreview}>
                                <Text style={styles.skillsLabel}>🎓 Teaches: </Text>
                                <Text style={styles.skillsText} numberOfLines={1}>
                                    {friend.skillsTeaching.slice(0, 2).join(', ')}
                                    {friend.skillsTeaching.length > 2 && ` +${friend.skillsTeaching.length - 2}`}
                                </Text>
                            </View>
                        )}
                    </View>

                    <View style={styles.actionButtons}>
                        <TouchableOpacity
                            style={styles.messageButton}
                            onPress={(e) => {
                                e.stopPropagation();
                                Alert.alert('Coming Soon', 'Messaging feature coming soon!');
                            }}
                        >
                            <Text style={styles.messageButtonText}>💬</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.removeButton}
                            onPress={(e) => {
                                e.stopPropagation();
                                handleRemoveFriend(friend.friendId, friend.friendName);
                            }}
                        >
                            <Text style={styles.removeButtonText}>✕</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </TouchableOpacity>
        );
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#007AFF" />
                    <Text style={styles.loadingText}>Loading friends...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView
                style={styles.content}
                showsVerticalScrollIndicator={false}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#007AFF" />
                }
            >
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Text style={styles.backButtonText}>←</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>My Friends</Text>
                    <TouchableOpacity
                        onPress={() => router.push('/(app)/find-friends')}
                        style={styles.addButton}
                    >
                        <Text style={styles.addButtonText}>+ Add</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.searchContainer}>
                    <TextInput
                        style={styles.searchBox}
                        placeholder="Search friends..."
                        value={searchText}
                        onChangeText={handleSearch}
                        placeholderTextColor="#999"
                    />
                </View>

                <Text style={styles.resultCount}>
                    {filteredFriends.length} {filteredFriends.length === 1 ? 'friend' : 'friends'}
                </Text>

                {filteredFriends.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyIcon}>👥</Text>
                        <Text style={styles.emptyText}>
                            {searchText ? 'No friends found' : 'No friends yet'}
                        </Text>
                        <Text style={styles.emptySubtext}>
                            {searchText
                                ? 'Try a different search term'
                                : 'Start connecting with others to build your network'}
                        </Text>
                        {!searchText && (
                            <TouchableOpacity
                                style={styles.findFriendsButton}
                                onPress={() => router.push('/(app)/find-friends')}
                            >
                                <Text style={styles.findFriendsButtonText}>Find Friends</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                ) : (
                    <View style={styles.friendsList}>
                        {filteredFriends.map(renderFriendCard)}
                    </View>
                )}

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
    addButton: {
        backgroundColor: '#007AFF',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
    },
    addButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14,
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
    friendsList: {
        paddingHorizontal: 20,
    },
    friendCard: {
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
    friendContent: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatarContainer: {
        position: 'relative',
        marginRight: 12,
    },
    friendAvatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#007AFF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    friendAvatarText: {
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
    friendInfo: {
        flex: 1,
    },
    friendName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
        marginBottom: 4,
    },
    friendEmail: {
        fontSize: 13,
        color: '#666',
        marginBottom: 4,
    },
    location: {
        fontSize: 12,
        color: '#999',
        marginBottom: 6,
    },
    skillsPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
    },
    skillsLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#666',
    },
    skillsText: {
        fontSize: 12,
        color: '#007AFF',
        flex: 1,
    },
    actionButtons: {
        flexDirection: 'column',
        gap: 8,
        marginLeft: 8,
    },
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
    removeButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#FFEBEE',
        justifyContent: 'center',
        alignItems: 'center',
    },
    removeButtonText: {
        fontSize: 20,
        color: '#F44336',
        fontWeight: 'bold',
    },
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
        paddingHorizontal: 40,
    },
    emptyIcon: {
        fontSize: 64,
        marginBottom: 16,
    },
    emptyText: {
        fontSize: 20,
        fontWeight: '600',
        color: '#333',
        marginBottom: 8,
        textAlign: 'center',
    },
    emptySubtext: {
        fontSize: 16,
        color: '#666',
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 22,
    },
    findFriendsButton: {
        backgroundColor: '#007AFF',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    findFriendsButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16,
    },
    bottomSpacer: {
        height: 40,
    },
});