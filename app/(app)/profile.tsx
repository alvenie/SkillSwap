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

// Interfaces
interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    bio?: string;
    skillsTeaching: string[];
    skillsLearning: string[];
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
}

interface Friend {
    id: string; // friend document id
    friendId: string; // user id of the friend
    displayName: string;
    email: string;
}

export default function ProfileScreen() {
    const { user } = useAuth();
    const router = useRouter();

    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [requests, setRequests] = useState<FriendRequest[]>([]);
    const [friends, setFriends] = useState<Friend[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Use focus effect to reload data when screen appears
    useFocusEffect(
        useCallback(() => {
            loadAllData();
        }, [])
    );

    const loadAllData = async () => {
        if (!user) return;
        setLoading(true);
        await Promise.all([loadUserProfile(), loadFriendRequests(), loadFriends()]);
        setLoading(false);
        setRefreshing(false);
    };

    const onRefresh = () => {
        setRefreshing(true);
        loadAllData();
    };

    const loadUserProfile = async () => {
        if (!user) return;
        try {
            const docRef = doc(db, 'users', user.uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setProfile(docSnap.data() as UserProfile);
            }
        } catch (error) {
            console.error("Error loading profile", error);
        }
    };

    const loadFriendRequests = async () => {
        if (!user) return;
        try {
            const q = query(
                collection(db, 'friendRequests'),
                where('toUserId', '==', user.uid),
                where('status', '==', 'pending')
            );
            const snapshot = await getDocs(q);
            const reqs: FriendRequest[] = [];
            snapshot.forEach(doc => {
                reqs.push({ id: doc.id, ...doc.data() } as FriendRequest);
            });
            setRequests(reqs);
        } catch (error) {
            console.error("Error loading requests", error);
        }
    };

    const loadFriends = async () => {
        if (!user) return;
        try {
            const q = query(
                collection(db, 'friends'),
                where('userId', '==', user.uid)
            );
            const snapshot = await getDocs(q);
            
            const friendsData: Friend[] = [];
            
            for (const friendDoc of snapshot.docs) {
                const fData = friendDoc.data();
                const friendProfileRef = doc(db, 'users', fData.friendId);
                const friendProfileSnap = await getDoc(friendProfileRef);
                
                if (friendProfileSnap.exists()) {
                    const fp = friendProfileSnap.data();
                    friendsData.push({
                        id: friendDoc.id,
                        friendId: fData.friendId,
                        displayName: fp.displayName || fp.email || 'User',
                        email: fp.email
                    });
                }
            }
            setFriends(friendsData);
        } catch (error) {
            console.error("Error loading friends", error);
        }
    };

    const handleAcceptRequest = async (request: FriendRequest) => {
        try {
            await updateDoc(doc(db, 'friendRequests', request.id), { status: 'accepted' });

            await addDoc(collection(db, 'friends'), {
                userId: user!.uid,
                friendId: request.fromUserId,
                createdAt: new Date().toISOString()
            });
            
            await addDoc(collection(db, 'friends'), {
                userId: request.fromUserId,
                friendId: user!.uid,
                createdAt: new Date().toISOString()
            });

            Alert.alert('Success', 'Friend request accepted!');
            loadAllData();
        } catch (error) {
            Alert.alert('Error', 'Could not accept request');
        }
    };

    const handleRejectRequest = async (requestId: string) => {
        try {
            await updateDoc(doc(db, 'friendRequests', requestId), { status: 'rejected' });
            loadFriendRequests();
        } catch (error) {
            console.error(error);
        }
    };

    const handleMessageFriend = (friend: Friend) => {
        if (!user) return;
        const conversationId = generateConversationId(user.uid, friend.friendId);
        router.push({
            pathname: '/(app)/chat-room',
            params: {
                conversationId,
                otherUserId: friend.friendId,
                otherUserName: friend.displayName
            }
        });
    };

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
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Profile</Text>
                <TouchableOpacity onPress={() => router.push('/(app)/settings')} style={styles.settingsButton}>
                    <Ionicons name="settings-outline" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
            </View>

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
                        
                        {/* {profile?.location && (
                            <View style={styles.locationRow}>
                                <Ionicons name="location-outline" size={16} color={COLORS.textSecondary} />
                                <Text style={styles.locationText}>{profile.location}</Text>
                            </View>
                        )} */}

                        {profile?.bio && (
                            <Text style={styles.bioText}>{profile.bio}</Text>
                        )}

                        {/* Stats Row */}
                        <View style={styles.statsRow}>
                            <View style={styles.statItem}>
                                <Text style={styles.statValue}>{friends.length}</Text>
                                <Text style={styles.statLabel}>Friends</Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statItem}>
                                <Text style={styles.statValue}>{profile?.skillsTeaching.length || 0}</Text>
                                <Text style={styles.statLabel}>Teaches</Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statItem}>
                                <Text style={styles.statValue}>{profile?.skillsLearning.length || 0}</Text>
                                <Text style={styles.statLabel}>Learns</Text>
                            </View>
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
                    
                    <View style={styles.skillsCard}>
                        <View style={styles.skillRow}>
                            <Text style={styles.skillLabel}>Teaches:</Text>
                            <Text style={styles.skillList}>
                                {profile?.skillsTeaching && profile.skillsTeaching.length > 0 
                                    ? profile.skillsTeaching.join(', ') 
                                    : 'No skills listed'}
                            </Text>
                        </View>
                        <View style={styles.divider} />
                        <View style={styles.skillRow}>
                            <Text style={styles.skillLabel}>Learns:</Text>
                            <Text style={styles.skillList}>
                                {profile?.skillsLearning && profile.skillsLearning.length > 0 
                                    ? profile.skillsLearning.join(', ') 
                                    : 'No interests listed'}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Friend Requests */}
                {requests.length > 0 && (
                    <View style={styles.sectionContainer}>
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
                                    <TouchableOpacity 
                                        style={styles.rejectButton} 
                                        onPress={() => handleRejectRequest(req.id)}
                                    >
                                        <Ionicons name="close" size={20} color={COLORS.textSecondary} />
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        style={styles.acceptButton}
                                        onPress={() => handleAcceptRequest(req)}
                                    >
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
                        <TouchableOpacity onPress={() => router.push('/(app)/find-friends')}>
                            <Text style={styles.linkText}>+ Find New</Text>
                        </TouchableOpacity>
                    </View>

                    {friends.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyText}>No friends yet.</Text>
                        </View>
                    ) : (
                        friends.map(friend => (
                            <View key={friend.id} style={styles.friendCard}>
                                <View style={styles.friendInfoContainer}>
                                    <View style={styles.miniAvatar}>
                                        <Text style={styles.miniAvatarText}>{friend.displayName.charAt(0).toUpperCase()}</Text>
                                    </View>
                                    <Text style={styles.friendName}>{friend.displayName}</Text>
                                </View>
                                <TouchableOpacity 
                                    style={styles.messageButton}
                                    onPress={() => handleMessageFriend(friend)}
                                >
                                    <Ionicons name="chatbubble-ellipses-outline" size={20} color={COLORS.primaryBrandText} />
                                </TouchableOpacity>
                            </View>
                        ))
                    )}
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
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
        padding: 8,
        backgroundColor: COLORS.lightGray,
        borderRadius: 20,
    },
    content: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingTop: 10,
    },
    // Profile Card
    profileCard: {
        alignItems: 'center',
        marginBottom: 24,
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
        borderWidth: 4,
        borderColor: '#FFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
    },
    avatarText: {
        fontSize: 40,
        fontWeight: 'bold',
        color: COLORS.primaryBrandText,
    },
    editIconBtn: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: COLORS.textPrimary,
        padding: 8,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: '#FFF',
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
        marginBottom: 24,
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
        color: '#B45309',
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
        alignItems: 'center',
    },
    skillLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: COLORS.textSecondary,
        width: 70,
    },
    skillList: {
        fontSize: 14,
        color: COLORS.textPrimary,
        flex: 1,
        lineHeight: 20,
    },
    divider: {
        height: 1,
        backgroundColor: COLORS.lightGray,
        marginVertical: 12,
    },
    // Request Card
    requestCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.cardBackground,
        padding: 12,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        justifyContent: 'space-between',
    },
    requestInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
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
    friendName: {
        fontSize: 16,
        fontWeight: '600',
        color: COLORS.textPrimary,
    },
    messageButton: {
        padding: 8,
        backgroundColor: COLORS.lightGray,
        borderRadius: 20,
    },
    emptyState: {
        padding: 20,
        alignItems: 'center',
    },
    emptyText: {
        color: COLORS.textSecondary,
        fontSize: 14,
    },
});