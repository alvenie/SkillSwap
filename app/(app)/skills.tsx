import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
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
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';
import { generateConversationId } from '../../utils/conversationUtils';

// --- Configuration ---
const ITEMS_PER_PAGE = 10;

const COLORS = {
    primaryBrand: '#FCD34D', // Mustard yellow
    primaryBrandText: '#1F2937', // Dark text for contrast on yellow
    background: '#FFFFFF',
    cardBackground: '#FFFFFF',
    textPrimary: '#1F2937',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    accentGreen: '#10B981', // For "Online" or "Message"
    accentBlue: '#3B82F6',   // For "Connect" if not using primary
    lightGray: '#F9FAFB',
};

// User profile interface
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
    const params = useLocalSearchParams();

    // Data State
    const [users, setUsers] = useState<UserWithSkills[]>([]);
    const [filteredUsers, setFilteredUsers] = useState<UserWithSkills[]>([]);
    const [allSkills, setAllSkills] = useState<string[]>(['All']);
    
    // UI State
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [selectedSkill, setSelectedSkill] = useState<string>('All');
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);

    // Friend Request State
    const [sentRequests, setSentRequests] = useState<string[]>([]);
    const [existingFriends, setExistingFriends] = useState<string[]>([]);
    const [selectedUser, setSelectedUser] = useState<UserWithSkills | null>(null);
    const [showRequestModal, setShowRequestModal] = useState(false);
    const [requestMessage, setRequestMessage] = useState('');
    const [sending, setSending] = useState(false);

    useFocusEffect(
        useCallback(() => {
            loadUsers();
            loadSentRequests();
            loadExistingFriends();
        }, [])
    );

    // Handle incoming parameters and reset pagination on filter change
    useEffect(() => {
        if (params.skill && typeof params.skill === 'string') {
            const incomingSkill = params.skill;
            setSelectedSkill(incomingSkill);
            if (users.length > 0) {
                filterUsers(searchText, incomingSkill);
            }
        }
    }, [params.skill, users]);

    // Reset to page 1 whenever filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchText, selectedSkill, filteredUsers.length]);

    const loadUsers = async () => {
        try {
            if (users.length === 0) setLoading(true);
            const usersRef = collection(db, 'users');
            const querySnapshot = await getDocs(usersRef);
            const usersData: UserWithSkills[] = [];
            const skillsSet = new Set<string>();

            querySnapshot.forEach((doc) => {
                if (doc.id !== user?.uid) {
                    const data = doc.data();
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
                        data.skillsTeaching?.forEach((skill: string) => skillsSet.add(skill));
                        data.skillsLearning?.forEach((skill: string) => skillsSet.add(skill));
                    }
                }
            });

            setUsers(usersData);
            if (!params.skill) setFilteredUsers(usersData);
            setAllSkills(['All', ...Array.from(skillsSet).sort()]);
        } catch (error: any) {
            console.error('Error loading users:', error);
            Alert.alert('Error', 'Failed to load users');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const loadSentRequests = async () => {
        if (!user) return;
        try {
            const requestsRef = collection(db, 'friendRequests');
            const q = query(requestsRef, where('fromUserId', '==', user.uid));
            const snapshot = await getDocs(q);
            const ids = snapshot.docs
                .map(doc => doc.data())
                .filter(data => data.status === 'pending')
                .map(data => data.toUserId);
            setSentRequests(ids);
        } catch (error) {
            console.error(error);
        }
    };

    const loadExistingFriends = async () => {
        if (!user) return;
        try {
            const friendsRef = collection(db, 'friends');
            const q = query(friendsRef, where('userId', '==', user.uid));
            const snapshot = await getDocs(q);
            const ids = snapshot.docs.map(doc => doc.data().friendId);
            setExistingFriends(ids);
        } catch (error) {
            console.error(error);
        }
    };

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
        if (skill !== 'All') {
            filtered = filtered.filter(u =>
                u.skillsTeaching.includes(skill) || u.skillsLearning.includes(skill)
            );
        }
        if (search.trim()) {
            const lowerSearch = search.toLowerCase();
            filtered = filtered.filter(u =>
                u.displayName.toLowerCase().includes(lowerSearch) ||
                u.email.toLowerCase().includes(lowerSearch) ||
                u.bio?.toLowerCase().includes(lowerSearch) ||
                u.skillsTeaching.some(s => s.toLowerCase().includes(lowerSearch)) ||
                u.skillsLearning.some(s => s.toLowerCase().includes(lowerSearch))
            );
        }
        setFilteredUsers(filtered);
    };

    // --- Pagination Logic ---
    const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE);
    const paginatedUsers = filteredUsers.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    const nextPage = () => {
        if (currentPage < totalPages) setCurrentPage(c => c + 1);
    };

    const prevPage = () => {
        if (currentPage > 1) setCurrentPage(c => c - 1);
    };

    // --- Friend Request Logic ---
    const openRequestModal = (targetUser: UserWithSkills) => {
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

            Alert.alert('Success', `Request sent to ${selectedUser.displayName}`);
            setShowRequestModal(false);
            setSentRequests([...sentRequests, selectedUser.uid]);
        } catch (error) {
            Alert.alert('Error', 'Failed to send request');
        } finally {
            setSending(false);
        }
    };

    const handleMessageUser = (targetUser: UserWithSkills) => {
        if (!user) return Alert.alert('Error', 'Login required');
        const conversationId = generateConversationId(user.uid, targetUser.uid);
        router.push({
            pathname: '/(app)/chat-room',
            params: { conversationId, otherUserId: targetUser.uid, otherUserName: targetUser.displayName },
        });
    };

    const onRefresh = () => {
        setRefreshing(true);
        loadUsers();
        loadSentRequests();
        loadExistingFriends();
    };

    // --- Render Items ---
    const renderUserCard = (targetUser: UserWithSkills) => {
        const isFriend = existingFriends.includes(targetUser.uid);
        const requestSent = sentRequests.includes(targetUser.uid);
        const isOnline = targetUser.status === 'online';

        return (
            <View key={targetUser.uid} style={styles.card}>
                <View style={styles.cardHeader}>
                    {/* Avatar */}
                    <View style={styles.avatarContainer}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>
                                {targetUser.displayName.charAt(0).toUpperCase()}
                            </Text>
                        </View>
                        {isOnline && <View style={styles.onlineBadge} />}
                    </View>

                    {/* Info */}
                    <View style={styles.cardInfo}>
                        <View style={styles.nameRow}>
                            <Text style={styles.userName} numberOfLines={1}>
                                {targetUser.displayName}
                            </Text>
                            {targetUser.location && (
                                <Text style={styles.location} numberOfLines={1}>📍 {targetUser.location}</Text>
                            )}
                        </View>
                        {targetUser.bio && (
                            <Text style={styles.bio} numberOfLines={1}>
                                {targetUser.bio}
                            </Text>
                        )}
                    </View>

                    {/* Compact Action Button (Right aligned) */}
                    <View style={styles.cardAction}>
                        {isFriend ? (
                            <TouchableOpacity style={styles.iconButton} onPress={() => handleMessageUser(targetUser)}>
                                <Ionicons name="chatbubble-ellipses-outline" size={20} color={COLORS.accentGreen} />
                            </TouchableOpacity>
                        ) : requestSent ? (
                            <View style={styles.pendingIcon}>
                                <Ionicons name="time-outline" size={20} color={COLORS.textSecondary} />
                            </View>
                        ) : (
                            <TouchableOpacity style={styles.addButton} onPress={() => openRequestModal(targetUser)}>
                                <Ionicons name="add" size={20} color={COLORS.primaryBrandText} />
                            </TouchableOpacity>
                        )}
                    </View>
                </View>

                {/* Compact Skills Row */}
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
            </View>
        );
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" color={COLORS.primaryBrand} />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Discover Skills</Text>
                <TouchableOpacity style={styles.filterButton}>
                    <Ionicons name="filter" size={20} color={COLORS.textPrimary} />
                </TouchableOpacity>
            </View>

            <View style={styles.searchSection}>
                <View style={styles.searchBox}>
                    <Ionicons name="search" size={18} color={COLORS.textSecondary} style={{ marginRight: 8 }} />
                    <TextInput
                        style={styles.input}
                        placeholder="Find people or skills..."
                        value={searchText}
                        onChangeText={handleSearch}
                        placeholderTextColor={COLORS.textSecondary}
                    />
                </View>
            </View>

            <View style={styles.chipsContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContent}>
                    {allSkills.map((skill) => (
                        <TouchableOpacity
                            key={skill}
                            style={[
                                styles.chip,
                                selectedSkill === skill && styles.chipActive,
                            ]}
                            onPress={() => handleSkillFilter(skill)}
                        >
                            <Text style={[
                                styles.chipText,
                                selectedSkill === skill && styles.chipTextActive
                            ]}>
                                {skill}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            <ScrollView
                style={styles.listContainer}
                contentContainerStyle={styles.listContent}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primaryBrand} />}
            >
                {filteredUsers.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Text style={styles.emptyText}>No users found.</Text>
                    </View>
                ) : (
                    paginatedUsers.map(renderUserCard)
                )}

                {/* Pagination Controls */}
                {filteredUsers.length > 0 && (
                    <View style={styles.paginationContainer}>
                        <TouchableOpacity 
                            style={[styles.pageButton, currentPage === 1 && styles.pageButtonDisabled]} 
                            onPress={prevPage}
                            disabled={currentPage === 1}
                        >
                            <Ionicons name="chevron-back" size={20} color={currentPage === 1 ? '#ccc' : COLORS.textPrimary} />
                        </TouchableOpacity>
                        
                        <Text style={styles.pageText}>
                            Page {currentPage} of {totalPages}
                        </Text>

                        <TouchableOpacity 
                            style={[styles.pageButton, currentPage === totalPages && styles.pageButtonDisabled]} 
                            onPress={nextPage}
                            disabled={currentPage === totalPages}
                        >
                            <Ionicons name="chevron-forward" size={20} color={currentPage === totalPages ? '#ccc' : COLORS.textPrimary} />
                        </TouchableOpacity>
                    </View>
                )}
                
                <View style={{ height: 40 }} />
            </ScrollView>

            {/* Modal - Kept relatively same but updated colors */}
            <Modal visible={showRequestModal} animationType="fade" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Connect with {selectedUser?.displayName}</Text>
                            <TouchableOpacity onPress={() => setShowRequestModal(false)}>
                                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="Add a note (optional)..."
                            value={requestMessage}
                            onChangeText={setRequestMessage}
                            multiline
                        />
                        <View style={styles.modalButtons}>
                             <TouchableOpacity 
                                style={styles.modalBtnCancel} 
                                onPress={() => setShowRequestModal(false)}
                            >
                                <Text style={styles.modalBtnTextCancel}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity 
                                style={styles.modalBtnSend} 
                                onPress={sendFriendRequest}
                                disabled={sending}
                            >
                                {sending ? <ActivityIndicator color="#000" /> : <Text style={styles.modalBtnTextSend}>Send Request</Text>}
                            </TouchableOpacity>
                        </View>
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
    // Header
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 10,
        marginBottom: 10,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: COLORS.textPrimary,
    },
    filterButton: {
        padding: 8,
        backgroundColor: COLORS.lightGray,
        borderRadius: 20,
    },
    // Search
    searchSection: {
        paddingHorizontal: 20,
        marginBottom: 12,
    },
    searchBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.lightGray,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    input: {
        flex: 1,
        fontSize: 15,
        color: COLORS.textPrimary,
    },
    // Chips
    chipsContainer: {
        marginBottom: 10,
    },
    chipsContent: {
        paddingHorizontal: 20,
        gap: 8,
    },
    chip: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: COLORS.background,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    chipActive: {
        backgroundColor: COLORS.primaryBrand,
        borderColor: COLORS.primaryBrand,
    },
    chipText: {
        fontSize: 13,
        fontWeight: '600',
        color: COLORS.textSecondary,
    },
    chipTextActive: {
        color: COLORS.primaryBrandText,
    },
    // List
    listContainer: {
        flex: 1,
        backgroundColor: '#FAFAFA', // Slight contrast for list area
    },
    listContent: {
        padding: 20,
    },
    // COMPACT CARD STYLES
    card: {
        backgroundColor: COLORS.cardBackground,
        borderRadius: 12,
        padding: 12, // Reduced padding
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        // Softer shadow
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    avatarContainer: {
        position: 'relative',
        marginRight: 10,
    },
    avatar: {
        width: 46, // Reduced size
        height: 46,
        borderRadius: 23,
        backgroundColor: COLORS.primaryBrand,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        fontSize: 18,
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
    cardInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    nameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 2,
    },
    userName: {
        fontSize: 16, // Reduced font size
        fontWeight: '700',
        color: COLORS.textPrimary,
        marginRight: 6,
    },
    location: {
        fontSize: 12,
        color: COLORS.textSecondary,
    },
    bio: {
        fontSize: 12,
        color: COLORS.textSecondary,
    },
    cardAction: {
        marginLeft: 8,
    },
    addButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: COLORS.primaryBrand,
        justifyContent: 'center',
        alignItems: 'center',
    },
    iconButton: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#E6FFFA',
        justifyContent: 'center',
        alignItems: 'center',
    },
    pendingIcon: {
        width: 32,
        height: 32,
        justifyContent: 'center',
        alignItems: 'center',
    },
    // Skills Row
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
    // Pagination
    paginationContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 10,
        gap: 20,
    },
    pageButton: {
        padding: 8,
        backgroundColor: COLORS.background,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    pageButtonDisabled: {
        opacity: 0.5,
        backgroundColor: '#F3F4F6',
    },
    pageText: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.textPrimary,
    },
    emptyState: {
        alignItems: 'center',
        marginTop: 40,
    },
    emptyText: {
        color: COLORS.textSecondary,
    },
    // Modal
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 20,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '700',
    },
    modalInput: {
        backgroundColor: '#F9FAFB',
        borderRadius: 8,
        padding: 12,
        height: 100,
        textAlignVertical: 'top',
        marginBottom: 16,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    modalBtnCancel: {
        flex: 1,
        padding: 12,
        borderRadius: 8,
        backgroundColor: '#F3F4F6',
        alignItems: 'center',
    },
    modalBtnSend: {
        flex: 1,
        padding: 12,
        borderRadius: 8,
        backgroundColor: COLORS.primaryBrand,
        alignItems: 'center',
    },
    modalBtnTextCancel: {
        fontWeight: '600',
        color: COLORS.textPrimary,
    },
    modalBtnTextSend: {
        fontWeight: '600',
        color: COLORS.primaryBrandText,
    },
});