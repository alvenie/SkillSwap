import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Platform,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
    Linking, // Used to open phone settings for notifications
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// Custom hook for authentication context (to get user object and signOut function)
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';

// Helper Function to Get Token
/**
 * Asks for notification permissions and retrieves the Expo Push Token.
 * Also handles necessary platform-specific setup (Android channel) and
 * provides a path to open settings if permissions are permanently denied.
 */
async function registerForPushNotificationsAsync() {
    // Create token variable
    let token;

    // Required setup for Android to ensure notifications appear
    if (Platform.OS === 'android') {
        /** 
         * Assigns the channel configuration to a channel of a specified name 
         * (creating it if need be). This method lets you assign given notification channel 
         * to a notification channel group.
        */
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
        });
    }

    // Push notifications only work on physical devices or real emulators (not web)
    if (Device.isDevice) {
        // Get current permission status
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        
        // If we don't have permission, ask for it
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        
        // Handle permanently denied status by offering to open system settings
        if (finalStatus !== 'granted') {
            Alert.alert(
                'Notifications Disabled',
                'To enable notifications, you need to allow them in your phone settings.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Open Settings', onPress: () => Linking.openSettings() }
                ]
            );
            return null; // Return null token if permission is not granted
        }

        // Get the Expo Push Token using the EAS Project ID
        token = (await Notifications.getExpoPushTokenAsync({
            projectId: Constants.expoConfig?.extra?.eas?.projectId,
        })).data;
        console.log("Push Token:", token);
    } else {
        Alert.alert('Error', 'Must use physical device for Push Notifications');
    }

    return token;
}

// Reusable Row Component for Settings
const SettingItem = ({ 
    icon, 
    title, 
    onPress, 
    type = 'link', 
    value = false, 
    onToggle = () => {}, 
    danger = false 
}: any) => (
    <TouchableOpacity 
        style={styles.row} 
        onPress={type === 'link' ? onPress : undefined}
        activeOpacity={type === 'link' ? 0.7 : 1}
    >
        <View style={styles.rowLeft}>
            <View style={[styles.iconContainer, danger && styles.dangerIconContainer]}>
                <Text style={styles.icon}>{icon}</Text>
            </View>
            <Text style={[styles.rowTitle, danger && styles.dangerText]}>{title}</Text>
        </View>
        
        {type === 'toggle' ? (
            <Switch
                value={value}
                onValueChange={onToggle}
                trackColor={{ false: '#767577', true: '#4CAF50' }}
                thumbColor={'#f4f3f4'}
            />
        ) : (
            <Text style={styles.chevron}>›</Text>
        )}
    </TouchableOpacity>
);

export default function SettingsScreen() {
    const router = useRouter(); // Expo Router hook for navigation
    const { user, signOut } = useAuth(); // Context hook to access user state and logout function

    // State management for settings UI
    const [isOnline, setIsOnline] = useState(true);
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [loading, setLoading] = useState(true);

    // Initial load effect
    useEffect(() => {
        loadSettings();
    }, []);

    // Fetches user settings (status and notification preference) from Firestore on load.
    const loadSettings = async () => {
        if (!user) return;
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                // Set online status based on Firestore 'status' field
                setIsOnline(data.status === 'online');
                // Set notification status based on whether a 'pushToken' exists
                setNotificationsEnabled(data.pushToken ? true: false);
            }
        } catch (error) {
            console.error('Error loading settings', error);
        } finally {
            setLoading(false);
        }
    };

    // Notification Toggle Logic
    const toggleNotifications = async (value: boolean) => {
        // Update UI immediately for responsiveness
        setNotificationsEnabled(value);

        if (!user) return;

        try {
            if (value) {
                // User is turning ON notifications. Register device and get token
                const token = await registerForPushNotificationsAsync();

                if (token) {
                    // Save token to Firebase
                    await updateDoc(doc(db, 'users', user.uid), {
                        pushToken: token,
                        notificationsEnabled: true
                    });
                } else {
                    // Permission denied, revert switch
                    setNotificationsEnabled(false);
                }
            } else {
                // User is turning OFF notifications. Remove token from firebase
                await updateDoc(doc(db, 'users', user.uid), {
                    notificationsEnabled: false,
                    pushToken: null // Remove token so we stop sending
                });
            }
        } catch (error) {
            console.error("Error toggling notifications:", error);
            setNotificationsEnabled(!value); // Revert UI on error
            Alert.alert("Error", "Could not update notification settings.");
        }
    };

    // Handler: Toggle Online Status
    const toggleOnlineStatus = async (value: boolean) => {
        setIsOnline(value); // Optimistic update
        if (!user) return;

        try {
            const newStatus = value ? 'online' : 'offline';
            // Update the user's status field in Firestore
            await updateDoc(doc(db, 'users', user.uid), {
                status: newStatus
            });
        } catch (error) {
            console.error('Failed to update status', error);
            Alert.alert('Error', 'Could not update online status');
            setIsOnline(!value); // Revert on error
        }
    };

    // Handler: Sign Out
    const handleSignOut = async () => {
        Alert.alert(
            "Sign Out", "Are you sure you want to log out?", [
                { text: "Cancel", style: "cancel" },
                { 
                    text: "Sign Out", 
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await signOut(); // Call the AuthContext signOut function
                            router.replace('/(public)/login'); // Redirect to login screen
                        } catch (error) {
                            Alert.alert("Error", "Failed to sign out");
                        }
                    }
                }
            ]
        );
    };

    // Show loading indicator while fetching initial data
    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" color="#007AFF" />
            </SafeAreaView>
        );
    }

    // Main Settings UI rendering
    return (
        <SafeAreaView style={styles.container}>
            {/* Header with back button functionality */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Text style={styles.backButtonText}>‹ Back</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Settings</Text>
                <View style={{ width: 50 }} /> 
            </View>

            <ScrollView style={styles.content}>
                {/* Account Settings Section*/}
                <Text style={styles.sectionHeader}>ACCOUNT</Text>
                <View style={styles.section}>
                    <SettingItem 
                        icon="👤" 
                        title="Edit Profile" 
                        onPress={() => router.push('/(app)/edit-profile')} 
                    />
                    <SettingItem 
                        icon="🔒" 
                        title="Privacy & Security" 
                        onPress={() => Alert.alert('Coming Soon', 'Privacy settings under construction')} 
                    />
                </View>

                {/* App Preferences Section */}
                <Text style={styles.sectionHeader}>PREFERENCES</Text>
                <View style={styles.section}>
                    <SettingItem 
                        icon="🔔" 
                        title="Push Notifications" 
                        type="toggle"
                        value={notificationsEnabled}
                        onToggle={toggleNotifications}
                    />
                    {/* Online Status Toggle */}
                    <SettingItem 
                        icon={isOnline ? "🟢" : "🔴"} 
                        title={isOnline ? "Status: Online" : "Status: Offline"}
                        type="toggle"
                        value={isOnline}
                        onToggle={toggleOnlineStatus}
                    />
                </View>

                {/* Support Section (Not yet implemented) */}
                <Text style={styles.sectionHeader}>SUPPORT</Text>
                <View style={styles.section}>
                    <SettingItem 
                        icon="❓" 
                        title="Help Center" 
                        onPress={() => {}} 
                    />
                    <SettingItem 
                        icon="📄" 
                        title="Terms of Service" 
                        onPress={() => {}} 
                    />
                </View>

                {/* Actions Section */}
                <Text style={styles.sectionHeader}>ACTIONS</Text>
                <View style={styles.section}>
                    <SettingItem 
                        icon="🚪" 
                        title="Sign Out" 
                        onPress={handleSignOut} 
                        danger 
                    />
                </View>

                <View style={styles.bottomSpacer} />
            </ScrollView>
        </SafeAreaView>
    );
}

// Stylesheet
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f2f2f7',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e5ea',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '600',
        color: '#000',
    },
    backButton: {
        padding: 8,
    },
    backButtonText: {
        fontSize: 16,
        color: '#007AFF',
    },
    content: {
        flex: 1,
    },
    sectionHeader: {
        fontSize: 13,
        fontWeight: '600',
        color: '#8e8e93',
        marginLeft: 16,
        marginTop: 24,
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    section: {
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#e5e5ea',
        paddingLeft: 16,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        paddingRight: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#e5e5ea',
    },
    rowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconContainer: {
        width: 32,
        height: 32,
        borderRadius: 6,
        backgroundColor: '#e1e1e1', // Fallback color
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    dangerIconContainer: {
        backgroundColor: '#ffe5e5',
    },
    icon: {
        fontSize: 16,
    },
    rowTitle: {
        fontSize: 17,
        color: '#000',
    },
    dangerText: {
        color: '#FF3B30',
    },
    chevron: {
        fontSize: 20,
        color: '#c7c7cc',
        fontWeight: '600',
    },
    bottomSpacer: {
        height: 40,
    }
});