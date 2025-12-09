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
    const [selectedSkill, setSelectedSkill] = useState<string>('All'); // Selected chip
    const [roleFilter, setRoleFilter] = useState<RoleFilterType>('All'); // Teaches vs Learns
    const [showFilterModal, setShowFilterModal] = useState(false); // Controls filter modal visibility

    // Radius Filter State
    const [useRadiusFilter, setUseRadiusFilter] = useState(false); // Toggle for distance filtering
    const [radius, setRadius] = useState(10); // Current radius value (km)

    // Location State: Stores current user's coords to calculate distance
    const [currentUserLocation, setCurrentUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

    // Maps state
    const [showMapModal, setShowMapModal] = useState(false);

    // Pagination State: Tracks which page of results we are on
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
        // useCallback to prevent unnecessary reloads
        useCallback(() => {
            loadUsers(); // Load all users
            loadSentRequests(); // Load sent friend requests
            loadExistingFriends(); // Load existing friends
        }, [])
    );

    // If navigated with a skill param, set that as selected skill
    useEffect(() => {
        if (params.skill && typeof params.skill === 'string') {
            setSelectedSkill(params.skill);
        }
    }, [params.skill]); // Only runs when param changes

    // Apply filters whenever relevant state changes
    useEffect(() => {
        applyFilters(); // Re-apply filters
    }, [users, searchText, selectedSkill, roleFilter, useRadiusFilter, radius, currentUserLocation]); // Dependencies

    // Load Users from Firestore
    const loadUsers = async () => {
        try {
            // Only show loading indicator on initial load
            if (users.length === 0) setLoading(true);
            const usersRef = collection(db, 'users'); // Reference to users collection
            const querySnapshot = await getDocs(usersRef); // Get all users
            const usersData: UserWithSkills[] = []; // Temp array to hold user data
            // Set to track unique skills for chips
            const skillsSet = new Set<string>();

            // Iterate through each user document
            querySnapshot.forEach((doc) => {
                if (doc.id !== user?.uid) {
                    const data = doc.data();
                    if (
                        // Only include users who have at least one skill listed
                        (data.skillsTeaching && data.skillsTeaching.length > 0) ||
                        (data.skillsLearning && data.skillsLearning.length > 0)
                    ) {
                        // Add user to usersData array
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
                        // Collect skills for chips
                        data.skillsTeaching?.forEach((skill: string) => skillsSet.add(skill));
                        data.skillsLearning?.forEach((skill: string) => skillsSet.add(skill));
                    }
                }
            });

            // Update state with loaded users and skills
            setUsers(usersData);
            setAllSkills(['All', ...Array.from(skillsSet).sort()]); // Sort skills alphabetically
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
            const requestsRef = collection(db, 'friendRequests'); // Reference to friendRequests collection
            const q = query(requestsRef, where('fromUserId', '==', user.uid)); // Query for requests sent by current user
            const snapshot = await getDocs(q); // Get matching documents
            const ids = snapshot.docs
                // Filter for pending requests only
                .map(doc => doc.data()) // Get data
                .filter(data => data.status === 'pending') // Only pending
                .map(data => data.toUserId); // Extract recipient user IDs

            setSentRequests(ids); // Update state with sent request IDs
        } catch (error) {
            console.error(error);
        }
    };

    // Load Existing Friends
    const loadExistingFriends = async () => {
        if (!user) return;
        try {
            const friendsRef = collection(db, 'friends'); // Reference to friends collection
            const q = query(friendsRef, where('userId', '==', user.uid)); // Query for current user's friends
            const snapshot = await getDocs(q); // Get matching documents
            const ids = snapshot.docs.map(doc => doc.data().friendId); // Extract friend user IDs

            setExistingFriends(ids); // Update state with existing friend IDs
        } catch (error) {
            console.error(error);
        }
    };

    // Filtering
    const applyFilters = () => {
        let result = users; // Start with all users

        // Skill & Role Filter
        if (selectedSkill !== 'All') {
            result = result.filter(u => { // Filter by selected skill
            const teaches = u.skillsTeaching.includes(selectedSkill);
            const learns = u.skillsLearning.includes(selectedSkill);

            if (roleFilter === 'Teaches') return teaches; // Only teaching
            if (roleFilter === 'Learns') return learns; // Only learning

            return teaches || learns; // Either
            });
        } else { // No specific skill selected, filter by role only
            if (roleFilter === 'Teaches') {
                // Filter users who teach at least one skill
                result = result.filter(u => u.skillsTeaching.length > 0);

            } else if (roleFilter === 'Learns') {
                // Filter users who learn at least one skill
                result = result.filter(u => u.skillsLearning.length > 0);

            }
        }

        // Search Text
        if (searchText.trim()) {
            // Case-insensitive search across name, email, bio, skills
            const lowerSearch = searchText.toLowerCase();
            result = result.filter(u =>
            u.displayName.toLowerCase().includes(lowerSearch) ||
            u.email.toLowerCase().includes(lowerSearch) ||
            u.bio?.toLowerCase().includes(lowerSearch) ||
            u.skillsTeaching.some(s => s.toLowerCase().includes(lowerSearch)) ||
            u.skillsLearning.some(s => s.toLowerCase().includes(lowerSearch))
            );
        }

        // Filter 3: Radius / Location
        // Only runs if the toggle is ON, and we know our own location
        if (useRadiusFilter && currentUserLocation) {
        result = result.filter(u => {
        // Exclude users with no location data
        if (!u.location || typeof u.location !== 'object' || !u.location.latitude) return false;

        // Calculate distance
        const dist = haversineDistance(
    { latitude: currentUserLocation.latitude, longitude: currentUserLocation.longitude },
    { latitude: u.location.latitude, longitude: u.location.longitude }
        );
        // Check if within selected radius
        return dist <= radius;
    });
    }

        // Update filtered users state
        setFilteredUsers(result);
        setCurrentPage(1); // Reset to first page
    };

    // Pagination Logic
    const totalPages = Math.ceil(filteredUsers.length / ITEMS_PER_PAGE); // Total number of pages
    const paginatedUsers = filteredUsers.slice(
        // Calculate start and end indices for slicing
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    // Next Page
    const nextPage = () => {
        if (currentPage < totalPages) setCurrentPage(c => c + 1); // Increment page
    };

    // Previous Page
    const prevPage = () => {
        if (currentPage > 1) setCurrentPage(c => c - 1); // Decrement page
    };

    // Actions
    const openRequestModal = (targetUser: UserWithSkills) => {
        // Set selected user and show modal
        setSelectedUser(targetUser);
        setRequestMessage('');
        setShowRequestModal(true);
    };

    // Send Friend Request
    const sendFriendRequest = async () => {
        if (!user || !selectedUser) return;
        try {
        setSending(true);
        // Get current user's display name for request
        const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
        const currentUserData = currentUserDoc.data(); // Get current user data

        // Create friend request document
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
        // Close modal and update sent requests state
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
        // Generate conversation ID and navigate to chat room
        const conversationId = generateConversationId(user.uid, targetUser.uid);
        router.push({ // Navigate to Chat Room with params
        pathname: '/(app)/chat-room',
        params: { conversationId, otherUserId: targetUser.uid, otherUserName: targetUser.displayName }, // Pass other user's info
    });
    };

    // Refresh Data on Pull Down
    const onRefresh = () => {
        // Re-apply loading states and reload data
        setRefreshing(true);
        loadUsers();
        loadSentRequests();
        loadExistingFriends();
    };

    // Clear All Filters
    const clearFilters = () => {
        // Reset all filter states
        setSelectedSkill('All');
        setRoleFilter('All');
        setSearchText('');
        setUseRadiusFilter(false); // Disable distance filtering
        setRadius(10); // Reset slider to default (doesn't apply until toggle is on)
    };

    //Runs whenever the user object is edited
    useEffect(() => {
        if (!user) return;

        // Subscribe to current user's document (realtime data synchronization)
        //Everytime the document updates in firebase, this callback is ran in real time.
        const unsubscribe = onSnapshot(doc(db, "users", user.uid), (docSnap) => {
            const data = docSnap.data(); //Retrieve currents contents of the document
            if (data?.location) { //null-conditional operator
                setCurrentUserLocation({
                    latitude: data.location.latitude,
                    longitude: data.location.longitude,
                });
            } else {
                setCurrentUserLocation(null);
            }
        });

        return () => unsubscribe(); // cleanup on unmount
    }, [user]);

    // Render Items
    const renderUserCard = (targetUser: UserWithSkills) => {
        const isFriend = existingFriends.includes(targetUser.uid);
        const requestSent = sentRequests.includes(targetUser.uid);
        const isOnline = targetUser.status === 'online';


        // Logic to safely display location string and distance
        let locationText = null;
        let distanceText = '';

        if (targetUser.location) {
            if (typeof targetUser.location === 'string') {
                locationText = targetUser.location;
                //if location is coords object then use it for calculation
            } else if (typeof targetUser.location === 'object') {
                locationText = "Location Shared";
                // If we have both locations, compute distance for display
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

                {/* Location and Distance */}
                {locationText && (
                    <Text style={styles.location} numberOfLines={1}>
                        📍 {locationText}{distanceText !== '' ? distanceText : null}
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
                {isFriend ? ( // If already friends, show message button
                    <TouchableOpacity style={styles.iconButton} onPress={() => handleMessageUser(targetUser)}>
                        <Ionicons name="chatbubble-ellipses-outline" size={20} color={COLORS.accentGreen} />
                    </TouchableOpacity>
                ) : requestSent ? ( // If request sent, show pending indicator
                    <View style={styles.pendingIcon}>
                        <Ionicons name="time-outline" size={20} color={COLORS.textSecondary} />
                    </View>
                ) : ( // Else, show add friend button
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
        //Check if user's geolocation is available
        if (
            !currentUserLocation ||
            !currentUserLocation.latitude ||
            !currentUserLocation.longitude
        ){ //if unavailable return alert message.
            Alert.alert(
                "Your location sharing is disabled!",
                "Enable location sharing in your profile to use the map feature."
            );
            return;
        }

        // Check if there are any users with valid location to display
        const usersWithLocation = filteredUsers.filter(
            u => u.location && typeof u.location === 'object' && u.location.latitude && u.location.longitude
        );

        //if no other users to display then return alert message instead of opening map.
        if (usersWithLocation.length === 0) {
            Alert.alert(
                "No users available",
                "No users have shared their location yet."
            );
            return;
        }

        //If passed all checks show map.
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
        // User List
        style={styles.listContainer}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primaryBrand} />}
    >
        {/* No Results State */}
        {filteredUsers.length === 0 ? (
            <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No users found matching filters.</Text>
            </View>
        ) : ( // Render paginated users if results exist
            paginatedUsers.map(renderUserCard)
        )}

        {/* Pagination */}
        {filteredUsers.length > 0 && (
            <View style={styles.paginationContainer}>
                {/* Previous Button */}
                <TouchableOpacity
                    style={[styles.pageButton, currentPage === 1 && styles.pageButtonDisabled]}
                    onPress={prevPage}
                    disabled={currentPage === 1}
                >
                    <Ionicons name="chevron-back" size={20} color={currentPage === 1 ? '#ccc' : COLORS.textPrimary} />
                </TouchableOpacity>

                <Text style={styles.pageText}>Page {currentPage} of {totalPages}</Text>

                {/* Next Button */}
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
                            maximumValue={10} // Max 10km limit
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
                ) : ( // If radius filter is off, show users from all locations
                    <Text style={styles.infoText}>Showing users from all locations.</Text>
                )}

                {/* Action Buttons */}
                <TouchableOpacity
                    style={[styles.applyFilterButton, { backgroundColor: '#E5E7EB', marginBottom: 10 }]}
                    onPress={clearFilters}
                >
                    {/* Clear Filters Button */}
                    <Text style={[styles.applyFilterButtonText, { color: COLORS.textPrimary }]}>Clear Filters</Text>
                </TouchableOpacity>

                {/* Apply Filters Button */}
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
                            // Include both my location and other users
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


    {/* Request Modal */}
    <Modal visible={showRequestModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                    <Text style={styles.modalTitle}>Connect with {selectedUser?.displayName}</Text> {/* Dynamic Title with selected user's name */}
                    <TouchableOpacity onPress={() => setShowRequestModal(false)}>
                        <Ionicons name="close" size={24} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                </View>
                {/* Request Message Input */}
                <TextInput
                    style={styles.modalInput}
                    placeholder="Add a note (optional)..."
                    value={requestMessage}
                    onChangeText={setRequestMessage}
                    multiline
                />
                {/* Action Buttons */}
                <View style={styles.modalButtons}>
                    <TouchableOpacity
                        style={styles.modalBtnCancel}
                        onPress={() => setShowRequestModal(false)}
                    >
                        {/* Cancel Button */}
                        <Text style={styles.modalBtnTextCancel}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.modalBtnSend}
                        onPress={sendFriendRequest}
                        disabled={sending}
                    >
                        {/* Send Request Button */}
                        {sending ? <ActivityIndicator color="#000" /> : <Text style={styles.modalBtnTextSend}>Send Request</Text>}
                    </TouchableOpacity>
                </View>
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
        marginTop: 4,
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
            height: '70%', // modal height
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