import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';
import { generateConversationId } from '../../utils/conversationUtils';

// Theme Configuration
const COLORS = {
    primaryBrand: '#FCD34D',
    primaryBrandText: '#1F2937',
    background: '#FFFFFF',
    cardBackground: '#FFFFFF',
    textPrimary: '#1F2937',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    lightGray: '#F9FAFB',
    accentGreen: '#10B981',
    accentRed: '#EF4444',
    accentBlue: '#3B82F6',
};

interface UserData {
    uid: string;
    displayName: string;
    email: string;
    bio?: string;
    location?: any;
    skillsTeaching?: string[];
    skillsLearning?: string[];
    status?: string;
}

const haversineDistance = (coords1: { latitude: number, longitude: number }, coords2: { latitude: number, longitude: number }) => {
    const R = 6371; // Earth radius in km
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(coords2.latitude - coords1.latitude);
    const dLon = toRad(coords2.longitude - coords1.longitude);
    const lat1 = toRad(coords1.latitude);
    const lat2 = toRad(coords2.latitude);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in km
};

export default function UserProfileScreen() {
    const { user: currentUser } = useAuth();
    const router = useRouter();
    const params = useLocalSearchParams();
    const userId = params.userId as string;

    const [userData, setUserData] = useState<UserData | null>(null);
    const [loading, setLoading] = useState(true);
    
    // Relationship Status
    const [isFriend, setIsFriend] = useState(false);
    const [requestStatus, setRequestStatus] = useState<'none' | 'pending' | 'received'>('none');
    const [actionLoading, setActionLoading] = useState(false);

    const [currentUserLocation, setCurrentUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

    useEffect(() => {
        const fetchUserLocation = async () => {
            if (!currentUser) return;
            try {
                const docSnap = await getDoc(doc(db, "users", currentUser.uid));
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.location) {
                        setCurrentUserLocation({
                            latitude: data.location.latitude,
                            longitude: data.location.longitude,
                        });
                    }
                }
            } catch (err) {
                console.error("Error fetching current user location:", err);
            }
        };

        fetchUserLocation();
    }, [currentUser]);

    useEffect(() => {
        if (userId) {
            loadUserProfile();
            checkRelationshipStatus();
        }
    }, [userId]);

    const loadUserProfile = async () => {
        try {
            const docRef = doc(db, 'users', userId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setUserData({ uid: docSnap.id, ...docSnap.data() } as UserData);
            } else {
                Alert.alert('Error', 'User not found');
                router.back();
            }
        } catch (error) {
            console.error('Error fetching user:', error);
        } finally {
            setLoading(false);
        }
    };

    const checkRelationshipStatus = async () => {
        if (!currentUser) return;

        // 1. Check if friends
        const friendsRef = collection(db, 'friends');
        const qFriend = query(friendsRef, where('userId', '==', currentUser.uid), where('friendId', '==', userId));
        const friendSnap = await getDocs(qFriend);
        if (!friendSnap.empty) {
            setIsFriend(true);
            return;
        }

        // 2. Check for pending requests
        const requestsRef = collection(db, 'friendRequests');
        
        // Did I send a request?
        const qSent = query(requestsRef, where('fromUserId', '==', currentUser.uid), where('toUserId', '==', userId), where('status', '==', 'pending'));
        const sentSnap = await getDocs(qSent);
        if (!sentSnap.empty) {
            setRequestStatus('pending');
            return;
        }

        // Did they send me a request?
        const qReceived = query(requestsRef, where('fromUserId', '==', userId), where('toUserId', '==', currentUser.uid), where('status', '==', 'pending'));
        const receivedSnap = await getDocs(qReceived);
        if (!receivedSnap.empty) {
            setRequestStatus('received');
            return;
        }

        setRequestStatus('none');
    };

    const handleSendRequest = async () => {
        if (!currentUser || !userData) return;
        setActionLoading(true);
        try {
            // Get my details for the notification
            const myProfileSnap = await getDoc(doc(db, 'users', currentUser.uid));
            const myData = myProfileSnap.data();

            await addDoc(collection(db, 'friendRequests'), {
                fromUserId: currentUser.uid,
                fromUserName: myData?.displayName || currentUser.email,
                fromUserEmail: currentUser.email,
                toUserId: userId,
                toUserName: userData.displayName,
                toUserEmail: userData.email,
                status: 'pending',
                createdAt: new Date().toISOString()
            });
            setRequestStatus('pending');
            Alert.alert('Success', 'Friend request sent!');
        } catch (error) {
            Alert.alert('Error', 'Could not send request');
        } finally {
            setActionLoading(false);
        }
    };

    const handleMessage = () => {
        if (!currentUser || !userData) return;
        const conversationId = generateConversationId(currentUser.uid, userId);
        router.push({
            pathname: '/(app)/chat-room',
            params: {
                conversationId,
                otherUserId: userId,
                otherUserName: userData.displayName
            }
        });
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={COLORS.primaryBrand} />
                </View>
            </SafeAreaView>
        );
    }

    if (!userData) return null;

    // Safe location display
    let locationText = "Location unavailable";
    if (userData.location && currentUserLocation) {
        try {
            const distance = haversineDistance(
                currentUserLocation,
                { latitude: userData.location.latitude, longitude: userData.location.longitude }
            );
            locationText = `${distance.toFixed(1)} km away`;
        } catch (err) {
            locationText = "Location unavailable";
        }
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Profile</Text>
                <View style={{width: 40}} /> 
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Profile Header */}
                <View style={styles.card}>
                    <View style={styles.avatarContainer}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{userData.displayName.charAt(0).toUpperCase()}</Text>
                        </View>
                        {userData.status === 'online' && <View style={styles.onlineBadge} />}
                    </View>

                    <Text style={styles.name}>{userData.displayName}</Text>
                    {locationText && (
                        <View style={styles.row}>
                            <Ionicons name="location-outline" size={14} color={COLORS.textSecondary} />
                            <Text style={styles.location}>{locationText}</Text>
                        </View>
                    )}
                    
                    {userData.bio ? (
                        <Text style={styles.bio}>{userData.bio}</Text>
                    ) : (
                        <Text style={styles.emptyBio}>No bio available</Text>
                    )}

                    {/* Action Buttons */}
                    <View style={styles.actionRow}>
                        {isFriend ? (
                            <TouchableOpacity style={styles.primaryBtn} onPress={handleMessage}>
                                <Ionicons name="chatbubbles" size={20} color={COLORS.primaryBrandText} />
                                <Text style={styles.primaryBtnText}>Message</Text>
                            </TouchableOpacity>
                        ) : requestStatus === 'pending' ? (
                            <View style={styles.disabledBtn}>
                                <Text style={styles.disabledBtnText}>Request Sent</Text>
                            </View>
                        ) : requestStatus === 'received' ? (
                            <View style={styles.disabledBtn}>
                                <Text style={styles.disabledBtnText}>Check Requests</Text>
                            </View>
                        ) : (
                            <TouchableOpacity 
                                style={styles.primaryBtn} 
                                onPress={handleSendRequest}
                                disabled={actionLoading}
                            >
                                {actionLoading ? (
                                    <ActivityIndicator color={COLORS.primaryBrandText} />
                                ) : (
                                    <>
                                        <Ionicons name="person-add" size={20} color={COLORS.primaryBrandText} />
                                        <Text style={styles.primaryBtnText}>Add Friend</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Skills Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Skills</Text>
                    
                    <View style={styles.skillBox}>
                        <Text style={styles.skillHeader}>Teaches</Text>
                        <View style={styles.chipContainer}>
                            {userData.skillsTeaching && userData.skillsTeaching.length > 0 ? (
                                userData.skillsTeaching.map((skill, index) => (
                                    <View key={index} style={styles.chip}>
                                        <Text style={styles.chipText}>{skill}</Text>
                                    </View>
                                ))
                            ) : (
                                <Text style={styles.emptyText}>Nothing listed</Text>
                            )}
                        </View>
                    </View>

                    <View style={styles.skillBox}>
                        <Text style={styles.skillHeader}>Learns</Text>
                        <View style={styles.chipContainer}>
                            {userData.skillsLearning && userData.skillsLearning.length > 0 ? (
                                userData.skillsLearning.map((skill, index) => (
                                    <View key={index} style={[styles.chip, styles.chipGreen]}>
                                        <Text style={styles.chipText}>{skill}</Text>
                                    </View>
                                ))
                            ) : (
                                <Text style={styles.emptyText}>Nothing listed</Text>
                            )}
                        </View>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: COLORS.background,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: COLORS.textPrimary,
    },
    backBtn: {
        padding: 8,
    },
    scrollContent: {
        paddingBottom: 40,
    },
    card: {
        alignItems: 'center',
        padding: 24,
        borderBottomWidth: 1,
        borderColor: COLORS.border,
        backgroundColor: COLORS.cardBackground,
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
        fontSize: 36,
        fontWeight: '700',
        color: COLORS.primaryBrandText,
    },
    onlineBadge: {
        position: 'absolute',
        bottom: 4,
        right: 4,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: COLORS.accentGreen,
        borderWidth: 3,
        borderColor: COLORS.cardBackground,
    },
    name: {
        fontSize: 24,
        fontWeight: '800',
        color: COLORS.textPrimary,
        marginBottom: 4,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginBottom: 12,
    },
    location: {
        fontSize: 14,
        color: COLORS.textSecondary,
    },
    bio: {
        fontSize: 15,
        textAlign: 'center',
        color: COLORS.textPrimary,
        lineHeight: 22,
        marginBottom: 24,
        paddingHorizontal: 20,
    },
    emptyBio: {
        fontSize: 14,
        color: COLORS.textSecondary,
        fontStyle: 'italic',
        marginBottom: 24,
    },
    actionRow: {
        flexDirection: 'row',
        gap: 12,
        width: '100%',
        justifyContent: 'center',
    },
    primaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.primaryBrand,
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderRadius: 25,
        gap: 8,
    },
    primaryBtnText: {
        fontWeight: '700',
        color: COLORS.primaryBrandText,
        fontSize: 16,
    },
    disabledBtn: {
        backgroundColor: COLORS.lightGray,
        paddingVertical: 12,
        paddingHorizontal: 32,
        borderRadius: 25,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    disabledBtnText: {
        fontWeight: '600',
        color: COLORS.textSecondary,
    },
    // Skills
    section: {
        padding: 20,
    },
    sectionTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: COLORS.textPrimary,
        marginBottom: 16,
    },
    skillBox: {
        marginBottom: 20,
    },
    skillHeader: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.textSecondary,
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    chipContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        backgroundColor: '#FFFBEB', // Light yellow
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: COLORS.primaryBrand,
    },
    chipGreen: {
        backgroundColor: '#ECFDF5', // Light green
        borderColor: COLORS.accentGreen,
    },
    chipText: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.textPrimary,
    },
    emptyText: {
        color: COLORS.textSecondary,
        fontStyle: 'italic',
    },
});