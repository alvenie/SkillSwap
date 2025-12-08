import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import MapView, { Marker, UrlTile, LatLng, Callout } from "react-native-maps";
import { addDoc, collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { haversineDistance } from '@/utils/haversineDistance';
import { useCallback, useEffect, useState } from 'react';
import { useCallback, useEffect, useState, useRef } from 'react';
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
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';
import { generateConversationId } from '../../utils/conversationUtils';
import StarRating from '../../components/StarRating';
import StarRating from '../../components/StarRating';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';
import { generateConversationId } from '../../utils/conversationUtils';

// Configuration Constants
// Determines how many users to show per page for pagination
const ITEMS_PER_PAGE = 10;

// Centralized color palette for consistent theming across the screen
const COLORS = {
    primaryBrand: '#FCD34D', // Mustard yellow (App Brand Color)
    primaryBrandText: '#1F2937', // Dark text for high contrast on yellow
    background: '#FFFFFF',
    cardBackground: '#FFFFFF',
    textPrimary: '#1F2937', // Main text color (Dark Gray)
    textSecondary: '#6B7280', // Subtitles/secondary text (Medium Gray)
    border: '#E5E7EB',
    accentGreen: '#10B981', // For success states or 'online' indicators
    lightGray: '#F9FAFB',
    accentOrange: '#F59E0B',
};

// Interfaces
// Defines the shape of a User object fetched from Firestore
interface UserWithSkills {
    id: string;
    uid: string;
    displayName: string;
    email: string;
    skillsTeaching: string[]; // Array of skills they can teach
    skillsLearning: string[]; // Array of skills they want to learn
    bio?: string;
    location?: any; // Location object {latitude, longitude}
    status: 'online' | 'offline' | 'in-call';
    averageRating?: number;
    reviewCount?: number;
}

// Types for the role filter toggle
type RoleFilterType = 'All' | 'Teaches' | 'Learns';

export default function SkillsScreen() {
    // Hooks & Navigation
    const { user } = useAuth(); // Access current logged-in user
    const router = useRouter(); // For navigating to other screens
    const params = useLocalSearchParams(); // To read URL parameters (e.g. ?skill=Guitar)

    // State Management
    
    // Data: Holds the list of all users fetched from DB
    const [users, setUsers] = useState<UserWithSkills[]>([]);
    // Filtered Data: Holds the subset of users currently shown based on search/filters
    const [filteredUsers, setFilteredUsers] = useState<UserWithSkills[]>([]);
    // Skills List: Used to populate the horizontal chip filter (e.g. "Guitar", "Coding")
    const [allSkills, setAllSkills] = useState<string[]>(['All']);
    
    // UI State: Loading spinners and refresh status
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
    const [myLocation, setMyLocation] = useState<{latitude: number, longitude: number} | null>(null);
  
    // Maps state
    const [showMapModal, setShowMapModal] = useState(false);
    
    // Pagination State: Tracks which page of results we are on
    const [currentPage, setCurrentPage] = useState(1);

    // Interaction State: Tracks sent requests and existing friends to update UI buttons
    const [sentRequests, setSentRequests] = useState<string[]>([]);
    const [existingFriends, setExistingFriends] = useState<string[]>([]);
    
    // Modal State for sending a connection request
    const [selectedUser, setSelectedUser] = useState<UserWithSkills | null>(null);
    const [showRequestModal, setShowRequestModal] = useState(false);
    const [requestMessage, setRequestMessage] = useState('');
    const [sending, setSending] = useState(false);
    const mapRef = useRef<MapView>(null);

    // Effects

    // useFocusEffect runs every time this screen comes into focus (e.g. going back to it)
    useFocusEffect(
        useCallback(() => {
            loadUsers();
            loadSentRequests();
            loadExistingFriends();
            fetchMyLocation();
        }, [])
    );

    // If a skill was passed via navigation params (e.g. from Home screen), set it as selected
    useEffect(() => {
        if (params.skill && typeof params.skill === 'string') {
            setSelectedSkill(params.skill);
        }
    }, [params.skill]);

    // Re-run the filtering logic whenever any filter criteria changes
    useEffect(() => {
        applyFilters();
    }, [users, searchText, selectedSkill, roleFilter, radius, useRadiusFilter, myLocation]);

    // Data Fetching Functions

    // 1. Fetch the current logged-in user's location from their profile
    const fetchMyLocation = async () => {
        if (!user) return;
        try {
            const docSnap = await getDoc(doc(db, 'users', user.uid));
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.location && typeof data.location === 'object' && data.location.latitude) {
                    setMyLocation(data.location);
                }
            }
        } catch (e) {
            console.log("Error fetching my location", e);
        }
    };

    // 2. Load all users from Firestore (excluding self)
    const loadUsers = async () => {
        try {
            if (users.length === 0) setLoading(true);
            const usersRef = collection(db, 'users');
            const querySnapshot = await getDocs(usersRef);
            const usersData: UserWithSkills[] = [];
            const skillsSet = new Set<string>(); // Use a Set to collect unique skills

            querySnapshot.forEach((doc) => {
                // Skip the current user
                if (doc.id !== user?.uid) {
                    const data = doc.data();
                    // Only include users who have listed skills (teaching OR learning)
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
                        // Collect all unique skills found across users for the filter chips
                        data.skillsTeaching?.forEach((skill: string) => skillsSet.add(skill));
                        data.skillsLearning?.forEach((skill: string) => skillsSet.add(skill));
                    }
                }
            });

            setUsers(usersData);
            setAllSkills(['All', ...Array.from(skillsSet).sort()]); // Update chips
        } catch (error: any) {
            console.error('Error loading users:', error);
            Alert.alert('Error', 'Failed to load users');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // 3. Load pending requests to disable "Add" buttons for them
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

    // 4. Load existing friends to show "Message" button instead of "Add"
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

    // Helper Functions
  
    // Standard Haversine formula to calculate distance in KM between two coordinates
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

    // Filtering
    const applyFilters = () => {
        let result = users;

        // Filter 1: By Skill & Role (Teaches vs Learns)
        if (selectedSkill !== 'All') {
            result = result.filter(u => {
                const teaches = u.skillsTeaching.includes(selectedSkill);
                const learns = u.skillsLearning.includes(selectedSkill);

                if (roleFilter === 'Teaches') return teaches;
                if (roleFilter === 'Learns') return learns;
                return teaches || learns; 
            });
        } else {
            // If viewing 'All' skills, still respect the role filter (e.g. show only teachers)
            if (roleFilter === 'Teaches') {
                result = result.filter(u => u.skillsTeaching.length > 0);
            } else if (roleFilter === 'Learns') {
                result = result.filter(u => u.skillsLearning.length > 0);
            }
        }

        // Filter 2: Text Search (Name, Email, Bio, Skills)
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

        // Filter 3: Radius / Location
        // Only runs if the toggle is ON, and we know our own location
        if (useRadiusFilter && myLocation) {
            result = result.filter(u => {
                // Exclude users with no location data
                if (!u.location || typeof u.location !== 'object' || !u.location.latitude) return false;
                
                // Calculate distance
                const dist = haversineDistance(
                    { latitude: myLocation.latitude, longitude: myLocation.longitude },
                    { latitude: u.location.latitude, longitude: u.location.longitude }
                );
                // Check if within selected radius
                return dist <= radius;
            });
        }
      
        setFilteredUsers(result);
        setCurrentPage(1); // Reset pagination when filters change
    };

    // Pagination Calculation
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

    // User Actions 

    const openRequestModal = (targetUser: UserWithSkills) => {
        setSelectedUser(targetUser);
        setRequestMessage('');
        setShowRequestModal(true);
    };

    // Sends a friend request to Firestore
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

    // Navigates to chat if already friends
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

    // Rendering a Single User Card
    const renderUserCard = (targetUser: UserWithSkills) => {
        const isFriend = existingFriends.includes(targetUser.uid);
        const requestSent = sentRequests.includes(targetUser.uid);
        const isOnline = targetUser.status === 'online';

        // Safe Location Logic
        let locationText = "Location unavailable";
        if (targetUser.location && currentUserLocation) {
            try {
                const distance = haversineDistance(
                    currentUserLocation,
                    { latitude: targetUser.location.latitude, longitude: targetUser.location.longitude }
                );
                locationText = `${distance.toFixed(1)} km away`;
            } catch (err) {
                locationText = "Location unavailable";
        // Logic to safely display location string and distance
        let locationText = null;
        let distanceText = '';

        if (targetUser.location) {
            if (typeof targetUser.location === 'string') {
                locationText = targetUser.location;
            } else if (typeof targetUser.location === 'object') {
                locationText = "Location Shared";
                // If we have both locations, compute distance for display
                if (myLocation && targetUser.location.latitude) {
                    const dist = haversineDistance(
                        { latitude: myLocation.latitude, longitude: myLocation.longitude },
                        { latitude: targetUser.location.latitude, longitude: targetUser.location.longitude }
                    );
                  
                    distanceText = ` • ${dist.toFixed(1)} km away`;
                }
            }
        }

        return (
            <View key={targetUser.uid} style={styles.card}>
                <View style={styles.cardHeader}>
                    {/* Avatar Section */}
                    <View style={styles.avatarContainer}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>
                                {targetUser.displayName.charAt(0).toUpperCase()}
                            </Text>
                        </View>
                        {isOnline && <View style={styles.onlineBadge} />}
                    </View>

                    {/* User Info Section */}
                    <View style={styles.cardInfo}>
                        <Text style={styles.userName} numberOfLines={1}>
                            {targetUser.displayName}
                        </Text>
                        
                        {/* Star Rating Component */}
                        <View style={{ marginBottom: 4 }}>
                            <StarRating 
                                rating={targetUser.averageRating || 0} 
                                reviewCount={targetUser.reviewCount || 0}
                                size="small"
                            />
                        </View>
                        
                        {/* Location & Distance */}
                        {(locationText || distanceText) && (
                            <Text style={styles.location} numberOfLines={1}>📍 {locationText}{distanceText}</Text>
                        )}
                        
                        {/* Bio */}
                        {targetUser.bio && (
                            <Text style={styles.bio} numberOfLines={1}>
                                {targetUser.bio}
                            </Text>
                        )}
                    </View>

                    {/* Action Button Section (Add / Pending / Message) */}
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

                {/* Skills Display Row */}
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

    // Main Render
    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" color={COLORS.primaryBrand} />
            </SafeAreaView>
        );
    }

    const handleOpenMap = () => {
        if (!myLocation || !myLocation.latitude || !myLocation.longitude) {
            Alert.alert(
                "Your location sharing is disabled!",
                "Enable location sharing in your profile to use the map feature."
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
                <TouchableOpacity onPress={() => setShowFilterModal(true)} style={styles.filterIconBtn}>
                    <Ionicons name="options-outline" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                        <Ionicons name="map-outline" size={24} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowFilterModal(true)} style={styles.iconBtn}>
                        <Ionicons name="options-outline" size={24} color={COLORS.textPrimary} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Search Bar */}
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

            {/* Horizontal Skill Chips */}
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

            {/* User List */}
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

            {/* FILTER MODAL */}
            <Modal visible={showFilterModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.filterModalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Filter Users</Text>
                            <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                                <Ionicons name="close" size={24} color={COLORS.textSecondary} />
                            </TouchableOpacity>
                        </View>
                        
                        {/* 1. Role Filter Options */}
                        <Text style={styles.filterLabel}>Role</Text>
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
                        ) : (
                            <Text style={styles.infoText}>Showing users from all locations.</Text>
                        )}
                        
                        <TouchableOpacity 
                            style={styles.applyFilterButton} 
                            onPress={() => setShowFilterModal(false)}
                        >
                            <Text style={styles.applyFilterButtonText}>Apply Filters</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* MAP MODAL */}
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
                                latitude: myLocation?.latitude || 37.7749,
                                longitude: myLocation?.longitude || -122.4194,
                                latitudeDelta: 0.1,
                                longitudeDelta: 0.1,
                            }}
                            showsUserLocation
                            ref={mapRef}
                            onMapReady={() => {
                                if (filteredUsers.length > 0 && myLocation) {
                                    // Include both my location and other users
                                    const allCoords: LatLng[] = [
                                        { latitude: myLocation.latitude, longitude: myLocation.longitude },
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
                                            {myLocation && u.location.latitude && u.location.longitude && (
                                                <Text style={styles.calloutSkills}>
                                                    {`Distance: ${haversineDistance(
                                                        { latitude: myLocation.latitude, longitude: myLocation.longitude },
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
    // Header Styles
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
    // Search Bar Styles
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
    // Filter Chips Styles
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
    // List & Card Styles
    listContainer: {
        flex: 1,
        backgroundColor: '#FAFAFA', 
    },
    listContent: {
        padding: 20,
    },
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
    // Pagination Styles
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
    // General Modal Styles
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
        paddingBottom: 30,
        maxHeight: '60%', 
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
    // Filter Specific Styles
    filterLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.textSecondary,
        marginBottom: 12,
        marginTop: 8,
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
        marginTop: 10,
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