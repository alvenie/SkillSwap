import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Location from 'expo-location'; // Added for location handling
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';

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
    iconBackground: '#FEF3C7', 
};

// Helper Function to Get Notification Token
async function registerForPushNotificationsAsync() {
    let token;

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
        });
    }

    if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        if (finalStatus !== 'granted') {
            Alert.alert(
                'Permission Required',
                'Enable notifications in your phone settings to receive updates.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Open Settings', onPress: () => Linking.openSettings() },
                ]
            );
            return;
        }
        token = (await Notifications.getExpoPushTokenAsync({
            projectId: Constants.expoConfig?.extra?.eas?.projectId,
        })).data;
    } else {
        Alert.alert('Emulator', 'Must use physical device for Push Notifications');
    }

    return token;
}

export default function SettingsScreen() {
    const { user, signOut } = useAuth();
    const router = useRouter();

    // State
    const [notificationsEnabled, setNotificationsEnabled] = useState(false);
    const [locationEnabled, setLocationEnabled] = useState(false); // New Location State
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        checkNotificationStatus();
        checkLocationStatus(); // Check location on mount
    }, []);

    const checkNotificationStatus = async () => {
        const { status } = await Notifications.getPermissionsAsync();
        setNotificationsEnabled(status === 'granted');
    };

    // Check if user currently has location data stored
    const checkLocationStatus = async () => {
        if (!user) return;
        try {
            const docRef = doc(db, 'users', user.uid);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                // If location field exists and is truthy, toggle is ON
                setLocationEnabled(!!data.location); 
            }
        } catch (error) {
            console.error("Error checking location status:", error);
        }
    };

    const toggleNotifications = async (value: boolean) => {
        setNotificationsEnabled(value);
        if (value) {
            setLoading(true);
            try {
                const token = await registerForPushNotificationsAsync();
                if (token && user) {
                    await updateDoc(doc(db, 'users', user.uid), {
                        pushToken: token,
                    });
                    Alert.alert('Success', 'Notifications enabled!');
                } else if (!token) {
                    setNotificationsEnabled(false);
                }
            } catch (error) {
                console.error("Error enabling notifications:", error);
                setNotificationsEnabled(false);
            } finally {
                setLoading(false);
            }
        } else {
            if (user) {
                try {
                    await updateDoc(doc(db, 'users', user.uid), {
                        pushToken: null,
                    });
                } catch (error) {
                    console.error("Error removing token:", error);
                }
            }
        }
    };

    // Toggle Location Sharing Logic
    const toggleLocation = async (value: boolean) => {
        // Optimistic update for UI responsiveness
        setLocationEnabled(value); 
        
        if (value) {
            // Turning ON: Need permissions + coords
            setLoading(true);
            try {
                //Ask for location permission
                const { status } = await Location.requestForegroundPermissionsAsync();
                //If denied shoot alert message
                if (status !== 'granted') {
                    Alert.alert(
                        'Permission Required',
                        'Please enable location access in settings to share your location.',
                        [
                            { text: 'Cancel', style: 'cancel', onPress: () => setLocationEnabled(false) }, //Set toggle to false
                            { text: 'Open Settings', onPress: () => Linking.openSettings() }
                        ]
                    );
                    setLoading(false);
                    return;
                }

                //Get current location
                const location = await Location.getCurrentPositionAsync({});
                
                //Update to firebase
                if (user) {
                    await updateDoc(doc(db, 'users', user.uid), {
                        location: {
                            latitude: location.coords.latitude,
                            longitude: location.coords.longitude
                        }
                    });
                }
            } catch (error) {
                console.error("Error enabling location:", error);
                Alert.alert("Error", "Could not fetch location.");
                setLocationEnabled(false);
            } finally {
                setLoading(false);
            }
        } else {
            // Turning OFF: Remove data from Firestore
            if (user) {
                try {
                    //set location field in firebase to null
                    await updateDoc(doc(db, 'users', user.uid), {
                        location: null 
                    });
                } catch (error) {
                    console.error("Error disabling location:", error);
                    setLocationEnabled(true); // Revert on error
                }
            }
        }
    };

    const refreshLocation = async () => {
        if (!user) return;

        setLoading(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert(
                    'Permission Required',
                    'Please enable location access in settings to refresh your location.',
                    [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Open Settings', onPress: () => Linking.openSettings() }
                    ]
                );
                setLoading(false);
                return;
            }

            const location = await Location.getCurrentPositionAsync({});
            await updateDoc(doc(db, 'users', user.uid), {
                location: {
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude
                }
            });

            Alert.alert('Success', 'Location refreshed!');
        } catch (error) {
            console.error("Error refreshing location:", error);
            Alert.alert('Error', 'Could not refresh location.');
        } finally {
            setLoading(false);
        }
    };

    const handleSignOut = async () => {
        Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
            { text: 'Cancel', style: 'cancel' },
            { 
                text: 'Sign Out', 
                style: 'destructive',
                onPress: async () => {
                    await signOut();
                    router.replace('/(public)/login'); 
                } 
            },
        ]);
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.push('/(app)/profile')} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Settings</Text>
                <View style={{ width: 40 }} /> 
            </View>

            <ScrollView style={styles.content}>
                
                {/* Section 1: Preferences */}
                <Text style={styles.sectionHeader}>Preferences</Text>
                <View style={styles.section}>
                    {/* Push Notifications */}
                    <View style={styles.row}>
                        <View style={styles.rowLeft}>
                            <View style={[styles.iconContainer, { backgroundColor: COLORS.iconBackground }]}>
                                <Ionicons name="notifications-outline" size={20} color={COLORS.primaryBrandText} />
                            </View>
                            <Text style={styles.rowLabel}>Push Notifications</Text>
                        </View>
                        {loading && !locationEnabled ? ( // Only show loading if specific action is pending
                            <ActivityIndicator size="small" color={COLORS.primaryBrand} />
                        ) : (
                            <Switch
                                value={notificationsEnabled}
                                onValueChange={toggleNotifications}
                                trackColor={{ false: '#767577', true: COLORS.primaryBrand }}
                                thumbColor={notificationsEnabled ? '#fff' : '#f4f3f4'}
                            />
                        )}
                    </View>

                    {/* Location Sharing */}
                    <View style={[styles.row, { borderBottomWidth: 0 }]}>
                        <View style={styles.rowLeft}>
                            <View style={[styles.iconContainer, { backgroundColor: '#E0F2FE' }]}>
                                <Ionicons name="location-outline" size={20} color="#0284C7" />
                            </View>
                            <Text style={styles.rowLabel}>Share Location</Text>
                        </View>
                        {loading && locationEnabled ? (
                            <ActivityIndicator size="small" color={COLORS.primaryBrand} />
                        ) : (
                            <Switch
                                value={locationEnabled}
                                onValueChange={toggleLocation}
                                trackColor={{ false: '#767577', true: COLORS.primaryBrand }}
                                thumbColor={locationEnabled ? '#fff' : '#f4f3f4'}
                            />
                        )}
                    </View>

                    {/*conditional rendering for refresh location button*/}
                    {locationEnabled && (
                        <TouchableOpacity
                            style={[styles.row, { borderBottomWidth: 0 }]}
                            onPress={refreshLocation}
                        >
                            <View style={styles.rowLeft}>
                                <View style={[styles.iconContainer, { backgroundColor: '#D1FAE5' }]}>
                                    <Ionicons name="refresh-outline" size={20} color="#059669" />
                                </View>
                                <Text style={styles.rowLabel}>Refresh Location</Text>
                            </View>
                            {loading ? (
                                <ActivityIndicator size="small" color={COLORS.primaryBrand} />
                            ) : (
                                <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
                            )}
                        </TouchableOpacity>
                    )}
                </View>

                {/* Section 2: Account */}
                <Text style={styles.sectionHeader}>Account</Text>
                <View style={styles.section}>
                    <TouchableOpacity style={styles.row} onPress={() => router.push('/(app)/edit-profile')}>
                        <View style={styles.rowLeft}>
                            <View style={[styles.iconContainer, { backgroundColor: '#F3E8FF' }]}>
                                <Ionicons name="person-outline" size={20} color="#7E22CE" />
                            </View>
                            <Text style={styles.rowLabel}>Edit Profile</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                    
                    <TouchableOpacity style={[styles.row, { borderBottomWidth: 0 }]} onPress={() => router.push('/(app)/friends-list')}>
                        <View style={styles.rowLeft}>
                            <View style={[styles.iconContainer, { backgroundColor: '#ECFDF5' }]}>
                                <Ionicons name="people-outline" size={20} color={COLORS.accentGreen} />
                            </View>
                            <Text style={styles.rowLabel}>Manage Friends</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={COLORS.textSecondary} />
                    </TouchableOpacity>
                </View>

                {/* Section 3: Actions */}
                <Text style={styles.sectionHeader}>Actions</Text>
                <View style={styles.section}>
                    <TouchableOpacity style={[styles.row, { borderBottomWidth: 0 }]} onPress={handleSignOut}>
                        <View style={styles.rowLeft}>
                            <View style={[styles.iconContainer, { backgroundColor: '#FEF2F2' }]}>
                                <Ionicons name="log-out-outline" size={20} color={COLORS.accentRed} />
                            </View>
                            <Text style={[styles.rowLabel, { color: COLORS.accentRed }]}>Log Out</Text>
                        </View>
                    </TouchableOpacity>
                </View>

                <Text style={styles.versionText}>Version 1.0.0</Text>

            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.lightGray, // Slightly off-white for settings bg
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: COLORS.background,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: COLORS.textPrimary,
    },
    content: {
        flex: 1,
    },
    sectionHeader: {
        fontSize: 13,
        fontWeight: '700',
        color: COLORS.textSecondary,
        marginLeft: 16,
        marginTop: 24,
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    section: {
        backgroundColor: COLORS.background,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: COLORS.border,
        paddingLeft: 16,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        paddingRight: 16,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
    },
    rowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconContainer: {
        width: 32,
        height: 32,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    rowLabel: {
        fontSize: 16,
        color: COLORS.textPrimary,
        fontWeight: '500',
    },
    versionText: {
        textAlign: 'center',
        marginTop: 40,
        marginBottom: 20,
        color: COLORS.textSecondary,
        fontSize: 13,
    },
});