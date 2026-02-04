import { useAuth } from '@/context/AuthContext';
import { db } from '@/firebaseConfig';
import { generateConversationId } from '@/utils/conversationUtils';
import { haversineDistance } from '@/utils/haversineDistance';
import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import MapView, { Callout, LatLng, Marker, UrlTile } from "react-native-maps";
import { SafeAreaView } from 'react-native-safe-area-context';
import StarRating from '../../components/StarRating';

// Configuration
const ITEMS_PER_PAGE = 10;

// Theme Configuration
const COLORS = {
    primaryBrand: '#FCD34D', // Mustard yellow
    primaryBrandText: '#1F2937', // Dark text for contrast
    background: '#FFFFFF',
    cardBackground: '#FFFFFF',
    textPrimary: '#1F2937',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
    accentGreen: '#10B981',
    accentBlue: '#3B82F6',
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
    averageRating?: number;
    reviewCount?: number;
}

// Role filter type
type RoleFilterType = 'All' | 'Teaches' | 'Learns';

export default function SkillsScreen() {

    // Auth & Routing
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

    // Filter State: Tracks current active filters
    const [selectedSkill, setSelectedSkill] = useState<string>('All');
    const [roleFilter, setRoleFilter] = useState<RoleFilterType>('All');
    const [showFilterModal, setShowFilterModal] = useState(false);

    // Radius Filter State
    const [useRadiusFilter, setUseRadiusFilter] = useState(false);
    const [radius, setRadius] = useState(10);

    // Location State
    const [currentUserLocation, setCurrentUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

    // Maps state
    const [showMapModal, setShowMapModal] = useState(false);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);

    // Friend Request State
    const [sentRequests, setSentRequests] = useState<string[]>([]);
    const [existingFriends, setExistingFriends] = useState<string[]>([]);
    const [selectedUser, setSelectedUser] = useState<UserWithSkills | null>(null);
    const [showRequestModal, setShowRequestModal] = useState(false);
    const [requestMessage, setRequestMessage] = useState('');
    const [sending, setSending] = useState(false);
    const mapRef = useRef<MapView>(null);

    // Load users on mount and when screen is focused
    useFocusEffect(
        useCallback(() => {
            loadUsers();
            loadSentRequests();
            loadExistingFriends();
        }, [])
    );

    // If navigated with a skill param, set that as selected skill
    useEffect(() => {
        if (params.skill && typeof params.skill === 'string') {
            setSelectedSkill(params.skill);
        }
    }, [params.skill]);

    // Apply filters whenever relevant state changes
    useEffect(() => {
        applyFilters();
    }, [users, searchText, selectedSkill, roleFilter, useRadiusFilter, radius, currentUserLocation]);

    // Load Users from Firestore
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
                            averageRating: data.averageRating || 0,
                            reviewCount: data.reviewCount || 0,
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

    // Load Sent Friend Requests
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

    // Load Existing Friends
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

    // Filtering
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

        // Radius / Location Filter
        if (useRadiusFilter && currentUserLocation) {
            result = result.filter(u => {
                if (!u.location || typeof u.location !== 'object' || !u.location.latitude) return false;

                const dist = haversineDistance(
                    { latitude: currentUserLocation.latitude, longitude: currentUserLocation.longitude },
                    { latitude: u.location.latitude, longitude: u.location.longitude }
                );
                return dist <= radius;
            });
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

    // Next Page
    const nextPage = () => {
        if (currentPage < totalPages) setCurrentPage(c => c + 1);
    };

    // Previous Page
    const prevPage = () => {
        if (currentPage > 1) setCurrentPage(c => c - 1);
    };

    // Actions
    const openRequestModal = (targetUser: UserWithSkills) => {
        if (!targetUser) {
            console.error('Cannot open modal: targetUser is undefined');
            return;
        }
        setSelectedUser(targetUser);
        setRequestMessage('');
        setShowRequestModal(true);
    };

    // Send Friend Request
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

    // Handle Messaging User
    const handleMessageUser = (targetUser: UserWithSkills) => {
        if (!user) return Alert.alert('Error', 'Login required');
        const conversationId = generateConversationId(user.uid, targetUser.uid);
        router.push({
            pathname: '/(app)/chat-room',
            params: { conversationId, otherUserId: targetUser.uid, otherUserName: targetUser.displayName },
        });
    };

    // Refresh Data on Pull Down
    const onRefresh = () => {
        setRefreshing(true);
        loadUsers();
        loadSentRequests();
        loadExistingFriends();
    };

    // Clear All Filters
    const clearFilters = () => {
        setSelectedSkill('All');
        setRoleFilter('All');
        setSearchText('');
        setUseRadiusFilter(false);
        setRadius(10);
    };

    // Listen to current user location
    useEffect(() => {
        if (!user) return;

        const unsubscribe = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
            const data = docSnap.data();
            if (data?.location) {
                setCurrentUserLocation({
                    latitude: data.location.latitude,
                    longitude: data.location.longitude,
                });
            } else {
                setCurrentUserLocation(null);
            }
        });

        return () => unsubscribe();
    }, [user]);

    // Render User Card - FIXED VERSION
    const renderUserCard = (targetUser: UserWithSkills) => {
        const isFriend = existingFriends.includes(targetUser.uid);
        const requestSent = sentRequests.includes(targetUser.uid);
        const isOnline = targetUser.status === 'online';

        // Logic to safely display location string and distance - FIXED
        let locationText = null;
        let distanceText = ''; // Initialize as empty string to prevent undefined

        if (targetUser.location) {
            if (typeof targetUser.location === 'string') {
                locationText = targetUser.location;
            } else if (typeof targetUser.location === 'object') {
                locationText = "Location Shared";
                if (currentUserLocation && targetUser.location.latitude) {
                    const dist = haversineDistance(
                        { latitude: currentUserLocation.latitude, longitude: currentUserLocation.longitude },
                        { latitude: targetUser.location.latitude, longitude: targetUser.location.longitude }
                    );
                    distanceText = ` • ${dist.toFixed(1)} km away`;
                }
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

                        {/* Location and Distance - FIXED */}
                        {locationText && (
                            <Text style={styles.location} numberOfLines={1}>
                                📍 {locationText}{distanceText || ''}
                            </Text>
                        )}

                        {/* Star Rating */}
                        <StarRating
                            rating={targetUser.averageRating || 0}
                            reviewCount={targetUser.reviewCount || 0}
                            size="small"
                            showCount={true}
                        />

                        {/* Bio */}
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
                    {/* Teaches Skills */}
                    {(roleFilter === 'All' || roleFilter === 'Teaches') && targetUser.skillsTeaching.length > 0 && (
                        <View style={styles.skillGroup}>
                            <Text style={styles.skillLabel}>Teaches:</Text>
                            <Text style={styles.skillList} numberOfLines={1}>
                                {targetUser.skillsTeaching.join(', ')}
                            </Text>
                        </View>
                    )}
                    {/* Learns Skills */}
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

    // Loading State
    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" color={COLORS.primaryBrand} />
            </SafeAreaView>
        );
    }

    // Map Modal Handler
    const handleOpenMap = () => {
        if (
            !currentUserLocation ||
            !currentUserLocation.latitude ||
            !currentUserLocation.longitude
        ) {
            Alert.alert(
                "Your location sharing is disabled!",
                "Enable location sharing in your profile to use the map feature."
            );
            return;
        }

        const usersWithLocation = filteredUsers.filter(
            u => u.location && typeof u.location === 'object' && u.location.latitude && u.location.longitude
        );

        if (usersWithLocation.length === 0) {
            Alert.alert(
                "No users available",
                "No users have shared their location yet."
            );
            return;
        }

        setShowMapModal(true);
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* Header with Filter Icon */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Discover Skills</Text>

                <View style={{flexDirection: 'row', gap: 8}}>
                    {/* Map Icon */}
                    <TouchableOpacity onPress={handleOpenMap} style={styles.iconBtn}>
                        <Ionicons name="map-outline" size={24} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowFilterModal(true)} style={styles.iconBtn}>
                        <Ionicons name="options-outline" size={24} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                </View>
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
                {/* No Results State */}
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

            {/* Filter Modal */}
            <Modal visible={showFilterModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <ScrollView style={styles.filterModalContent}
                                contentContainerStyle={{ paddingBottom: 20 }}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Filter Users</Text>
                            <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        {/* 1. Role Filter */}
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

                        {/* 2. Radius Filter Switch */}
                        <View style={styles.switchRow}>
                            <Text style={styles.filterLabel}>Filter by Distance</Text>
                            <Switch
                                value={useRadiusFilter}
                                onValueChange={setUseRadiusFilter}
                                trackColor={{ false: '#767577', true: COLORS.primaryBrand }}
                                thumbColor={useRadiusFilter ? '#fff' : '#f4f3f4'}
                            />
                        </View>

                        {/* 3. Slider (Conditional Render) */}
                        {useRadiusFilter ? (
                            <View style={styles.sliderContainer}>
                                <Text style={styles.sliderValueText}>
                                    Within {Math.round(radius)} km
                                </Text>
                                <Slider
                                    style={{width: '100%', height: 40}}
                                    minimumValue={1}
                                    maximumValue={10}
                                    step={1}
                                    value={radius}
                                    onValueChange={setRadius}
                                    minimumTrackTintColor={COLORS.primaryBrand}
                                    maximumTrackTintColor="#E5E7EB"
                                    thumbTintColor={COLORS.primaryBrand}
                                />
                                <View style={styles.sliderLabels}>
                                    <Text style={styles.sliderLabelText}>1 km</Text>
                                    <Text style={styles.sliderLabelText}>10 km</Text>
                                </View>
                            </View>
                        ) : (
                            <Text style={styles.infoText}>Showing users from all locations.</Text>
                        )}

                        {/* Action Buttons */}
                        <TouchableOpacity
                            style={[styles.applyFilterButton, { backgroundColor: '#E5E7EB', marginBottom: 10 }]}
                            onPress={clearFilters}
                        >
                            <Text style={[styles.applyFilterButtonText, { color: COLORS.textPrimary }]}>Clear Filters</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.applyFilterButton}
                            onPress={() => setShowFilterModal(false)}
                        >
                            <Text style={styles.applyFilterButtonText}>Done</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </Modal>

            {/* Map Modal */}
            <Modal visible={showMapModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.mapModalContent}>
                        {/* Header */}
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Users Map</Text>
                            <TouchableOpacity onPress={() => setShowMapModal(false)}>
                                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        {/* Map */}
                        <MapView
                            style={{ flex: 1, borderRadius: 16 }}
                            initialRegion={{
                                latitude: currentUserLocation?.latitude || 37.7749,
                                longitude: currentUserLocation?.longitude || -122.4194,
                                latitudeDelta: 0.1,
                                longitudeDelta: 0.1,
                            }}
                            showsUserLocation
                            ref={mapRef}
                            onMapReady={() => {
                                if (filteredUsers.length > 0 && currentUserLocation) {
                                    const allCoords: LatLng[] = [
                                        { latitude: currentUserLocation.latitude, longitude: currentUserLocation.longitude },
                                        ...filteredUsers
                                            .filter(u => u.location && u.location.latitude && u.location.longitude)
                                            .map(u => ({
                                                latitude: u.location.latitude,
                                                longitude: u.location.longitude,
                                            }))
                                    ];

                                    if (allCoords.length > 0 && mapRef.current) {
                                        mapRef.current.fitToCoordinates(allCoords, {
                                            edgePadding: { top: 80, right: 40, bottom: 80, left: 40 },
                                            animated: true,
                                        });
                                    }
                                }
                            }}
                        >
                            <UrlTile
                                urlTemplate="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                maximumZ={19}
                                tileSize={256}
                            />
                            {filteredUsers.map(u => u.location && (
                                <Marker
                                    key={u.uid}
                                    coordinate={{
                                        latitude: u.location.latitude,
                                        longitude: u.location.longitude,
                                    }}
                                    pinColor="red"
                                >
                                    <Callout tooltip>
                                        <View style={styles.calloutContainer}>
                                            <Text style={styles.calloutName}>{u.displayName}</Text>

                                            {/* Skills */}
                                            {u.skillsTeaching.length > 0 && (
                                                <Text style={styles.calloutSkills}>Teaches: {u.skillsTeaching.join(', ')}</Text>
                                            )}
                                            {u.skillsLearning.length > 0 && (
                                                <Text style={styles.calloutSkills}>Learns: {u.skillsLearning.join(', ')}</Text>
                                            )}

                                            {/* Distance from me */}
                                            {currentUserLocation && u.location.latitude && u.location.longitude && (
                                                <Text style={styles.calloutSkills}>
                                                    {`Distance: ${haversineDistance(
                                                        { latitude: currentUserLocation.latitude, longitude: currentUserLocation.longitude },
                                                        { latitude: u.location.latitude, longitude: u.location.longitude }
                                                    ).toFixed(1)} km away`}
                                                </Text>
                                            )}

                                            {/* Star rating */}
                                            <StarRating
                                                rating={u.averageRating || 0}
                                                reviewCount={u.reviewCount || 0}
                                                size="small"
                                            />
                                        </View>
                                    </Callout>
                                </Marker>
                            ))}
                        </MapView>

                    </View>
                </View>
            </Modal>


            {/* Request Modal - FIXED VERSION */}
            <Modal visible={showRequestModal} animationType="fade" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        {selectedUser ? (
                            <>
                                <View style={styles.modalHeader}>
                                    <Text style={styles.modalTitle}>
                                        Connect with {selectedUser.displayName}
                                    </Text>
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
                                        {sending ? (
                                            <ActivityIndicator color="#000" />
                                        ) : (
                                            <Text style={styles.modalBtnTextSend}>Send Request</Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </>
                        ) : (
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>Loading...</Text>
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
        alignItems: 'flex-start',
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
        marginTop: 4,
    },
    cardAction: {
        marginLeft: 8,
        justifyContent: 'center',
        height: 46,
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
        maxHeight: '80%',
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
    switchRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        marginTop: 8,
    },
    sliderContainer: {
        marginBottom: 25,
    },
    sliderValueText: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.primaryBrandText,
        marginBottom: 8,
    },
    sliderLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 4,
        paddingBottom: 20,
    },
    sliderLabelText: {
        fontSize: 12,
        color: COLORS.textSecondary,
    },
    infoText: {
        fontSize: 13,
        color: COLORS.textSecondary,
        fontStyle: 'italic',
        marginBottom: 10,
    },
    iconBtn: {
        padding: 8,
    },
    mapModalContent: {
        backgroundColor: 'white',
        borderRadius: 16,
        padding: 10,
        height: '70%',
    },
    calloutContainer: {
        backgroundColor: 'white',
        padding: 8,
        borderRadius: 8,
        width: 200,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    calloutName: {
        fontWeight: '700',
        fontSize: 14,
        marginBottom: 4,
    },
    calloutSkills: {
        fontSize: 12,
        color: COLORS.textSecondary,
    },
});