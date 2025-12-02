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

// Configuration
const ITEMS_PER_PAGE = 10;

const COLORS = {
    primaryBrand: '#FCD34D', // Mustard yellow
    primaryBrandText: '#1F2937', // Dark text for contrast
    background: '#FFFFFF',
    cardBackground: '#FFFFFF',
    textPrimary: '#1F2937',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    accentGreen: '#10B981',
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
    location?: any;
    status: 'online' | 'offline' | 'in-call';
}

type RoleFilterType = 'All' | 'Teaches' | 'Learns';

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

    // Filters State
    const [selectedSkill, setSelectedSkill] = useState<string>('All');
    const [roleFilter, setRoleFilter] = useState<RoleFilterType>('All');
    const [showFilterModal, setShowFilterModal] = useState(false); // New Modal State

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

    useEffect(() => {
        if (params.skill && typeof params.skill === 'string') {
            setSelectedSkill(params.skill);
        }
    }, [params.skill]);

    useEffect(() => {
        applyFilters();
    }, [users, searchText, selectedSkill, roleFilter]);

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
                            location: data.location || null,
                            status: data.status || 'offline',
                        });
                        data.skillsTeaching?.forEach((skill: string) => skillsSet.add(skill));
                        data.skillsLearning?.forEach((skill: string) => skillsSet.add(skill));
                    }
                }
            });

            setUsers(usersData);
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

    const applyFilters = () => {
        let result = users;

        // Skill & Role Filter
        if (selectedSkill !== 'All') {
            result = result.filter(u => {
                const teaches = u.skillsTeaching.includes(selectedSkill);
                const learns = u.skillsLearning.includes(selectedSkill);

                if (roleFilter === 'Teaches') return teaches;
                if (roleFilter === 'Learns') return learns;
                return teaches || learns;
            });
        } else {
            if (roleFilter === 'Teaches') {
                result = result.filter(u => u.skillsTeaching.length > 0);
            } else if (roleFilter === 'Learns') {
                result = result.filter(u => u.skillsLearning.length > 0);
            }
        }

        // Search Text
        if (searchText.trim()) {
            const lowerSearch = searchText.toLowerCase();
            result = result.filter(u =>
                u.displayName.toLowerCase().includes(lowerSearch) ||
                u.email.toLowerCase().includes(lowerSearch) ||
                u.bio?.toLowerCase().includes(lowerSearch) ||
                u.skillsTeaching.some(s => s.toLowerCase().includes(lowerSearch)) ||
                u.skillsLearning.some(s => s.toLowerCase().includes(lowerSearch))
            );
        }

        setFilteredUsers(result);
        setCurrentPage(1);
    };

    // Pagination Logic
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

    // Actions
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

    // Render Items
    const renderUserCard = (targetUser: UserWithSkills) => {
        const isFriend = existingFriends.includes(targetUser.uid);
        const requestSent = sentRequests.includes(targetUser.uid);
        const isOnline = targetUser.status === 'online';

        // Safe Location Logic
        let locationText = null;
        if (targetUser.location) {
            if (typeof targetUser.location === 'string') {
                locationText = targetUser.location;
            } else if (typeof targetUser.location === 'object') {
                locationText = "Location Shared";
            }
        }

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
                        <Text style={styles.userName} numberOfLines={1}>
                            {targetUser.displayName}
                        </Text>

                        {locationText && (
                            <Text style={styles.location} numberOfLines={1}>📍 {locationText}</Text>
                        )}

                        {targetUser.bio && (
                            <Text style={styles.bio} numberOfLines={1}>
                                {targetUser.bio}
                            </Text>
                        )}
                    </View>

                    {/* Action Button */}
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

                {/* Skills Row */}
                <View style={styles.skillsRow}>
                    {(roleFilter === 'All' || roleFilter === 'Teaches') && targetUser.skillsTeaching.length > 0 && (
                        <View style={styles.skillGroup}>
                            <Text style={styles.skillLabel}>Teaches:</Text>
                            <Text style={styles.skillList} numberOfLines={1}>
                                {targetUser.skillsTeaching.join(', ')}
                            </Text>
                        </View>
                    )}
                    {(roleFilter === 'All' || roleFilter === 'Learns') && targetUser.skillsLearning.length > 0 && (
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
            {/* Updated Header with Filter Icon */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Discover Skills</Text>
                <TouchableOpacity onPress={() => setShowFilterModal(true)} style={styles.filterIconBtn}>
                    <Ionicons name="options-outline" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.searchSection}>
                <View style={styles.searchBox}>
                    <Ionicons name="search" size={18} color={COLORS.textSecondary} style={{ marginRight: 8 }} />
                    <TextInput
                        style={styles.input}
                        placeholder="Find people or skills..."
                        value={searchText}
                        onChangeText={setSearchText}
                        placeholderTextColor={COLORS.textSecondary}
                    />
                </View>
            </View>

            {/* Skill Chips (Categories) */}
            <View style={styles.chipsContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContent}>
                    {allSkills.map((skill) => (
                        <TouchableOpacity
                            key={skill}
                            style={[
                                styles.chip,
                                selectedSkill === skill && styles.chipActive,
                            ]}
                            onPress={() => setSelectedSkill(skill)}
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
                        <Text style={styles.emptyText}>No users found matching filters.</Text>
                    </View>
                ) : (
                    paginatedUsers.map(renderUserCard)
                )}

                {/* Pagination */}
                {filteredUsers.length > 0 && (
                    <View style={styles.paginationContainer}>
                        <TouchableOpacity
                            style={[styles.pageButton, currentPage === 1 && styles.pageButtonDisabled]}
                            onPress={prevPage}
                            disabled={currentPage === 1}
                        >
                            <Ionicons name="chevron-back" size={20} color={currentPage === 1 ? '#ccc' : COLORS.textPrimary} />
                        </TouchableOpacity>
                        <Text style={styles.pageText}>Page {currentPage} of {totalPages}</Text>
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

            {/* FILTER MODAL (New) */}
            <Modal visible={showFilterModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.filterModalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Filter Users</Text>
                            <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.filterLabel}>Show users who:</Text>
                        <View style={styles.roleOptionsContainer}>
                            {(['All', 'Teaches', 'Learns'] as RoleFilterType[]).map((role) => (
                                <TouchableOpacity
                                    key={role}
                                    style={[styles.roleOption, roleFilter === role && styles.roleOptionActive]}
                                    onPress={() => setRoleFilter(role)}
                                >
                                    <Text style={[styles.roleOptionText, roleFilter === role && styles.roleOptionTextActive]}>
                                        {role === 'All' ? 'Do Both / All' : role}
                                    </Text>
                                    {roleFilter === role && <Ionicons name="checkmark" size={18} color={COLORS.primaryBrandText} />}
                                </TouchableOpacity>
                            ))}
                        </View>

                        <TouchableOpacity
                            style={styles.applyFilterButton}
                            onPress={() => setShowFilterModal(false)}
                        >
                            <Text style={styles.applyFilterButtonText}>Done</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Request Modal (Existing) */}
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
    filterIconBtn: {
        padding: 8,
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
        backgroundColor: '#FAFAFA',
    },
    listContent: {
        padding: 20,
    },
    // CARD STYLES
    card: {
        backgroundColor: COLORS.cardBackground,
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: COLORS.border,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start', // Align to top
        marginBottom: 8,
    },
    avatarContainer: {
        position: 'relative',
        marginRight: 10,
    },
    avatar: {
        width: 46,
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
        paddingVertical: 2,
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
        marginBottom: 2,
    },
    bio: {
        fontSize: 12,
        color: COLORS.textSecondary,
        fontStyle: 'italic',
    },
    cardAction: {
        marginLeft: 8,
        justifyContent: 'center',
        height: 46, // Align vertically with avatar
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
    // Modal & Filter Modal Styles
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
    filterModalContent: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 20,
        maxHeight: '50%',
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
    // Filter Modal Specifics
    filterLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.textSecondary,
        marginBottom: 12,
    },
    roleOptionsContainer: {
        gap: 10,
        marginBottom: 20,
    },
    roleOption: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 14,
        borderRadius: 10,
        backgroundColor: '#F9FAFB',
        borderWidth: 1,
        borderColor: COLORS.border,
    },
    roleOptionActive: {
        backgroundColor: '#FFFBEB',
        borderColor: COLORS.primaryBrand,
    },
    roleOptionText: {
        fontSize: 15,
        color: COLORS.textPrimary,
    },
    roleOptionTextActive: {
        fontWeight: '700',
        color: '#B45309',
    },
    applyFilterButton: {
        backgroundColor: COLORS.primaryBrand,
        padding: 14,
        borderRadius: 10,
        alignItems: 'center',
    },
    applyFilterButtonText: {
        fontWeight: '700',
        color: COLORS.primaryBrandText,
        fontSize: 16,
    },
});