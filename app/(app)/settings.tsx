import { Ionicons } from '@expo/vector-icons'; // Added for consistent icons
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { doc, updateDoc } from 'firebase/firestore';
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
// Custom hook for authentication context (to get user object and signOut function)
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
    iconBackground: '#FEF3C7', // Light yellow for icon bg
};

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

export default function SettingsScreen() {
    const { user, signOut } = useAuth();
    const router = useRouter();
    
    // State
    const [notificationsEnabled, setNotificationsEnabled] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        checkNotificationStatus();
    }, []);

    const checkNotificationStatus = async () => {
        const { status } = await Notifications.getPermissionsAsync();
        setNotificationsEnabled(status === 'granted');
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
                    // User denied permission or error occurred
                    setNotificationsEnabled(false);
                }
            } catch (error) {
                console.error("Error enabling notifications:", error);
                setNotificationsEnabled(false);
            } finally {
                setLoading(false);
            }
        } else {
            // Optional: Remove token from DB if user disables notifications
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
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Settings</Text>
                <View style={{ width: 40 }} /> 
            </View>

            <ScrollView style={styles.content}>
                
                {/* Section 1: Preferences */}
                <Text style={styles.sectionHeader}>Preferences</Text>
                <View style={styles.section}>
                    <View style={styles.row}>
                        <View style={styles.rowLeft}>
                            <View style={[styles.iconContainer, { backgroundColor: COLORS.iconBackground }]}>
                                <Ionicons name="notifications-outline" size={20} color={COLORS.primaryBrandText} />
                            </View>
                            <Text style={styles.rowLabel}>Push Notifications</Text>
                        </View>
                        {loading ? (
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
                </View>

                {/* Section 2: Account */}
                <Text style={styles.sectionHeader}>Account</Text>
                <View style={styles.section}>
                    <TouchableOpacity style={styles.row} onPress={() => router.push('/(app)/edit-profile')}>
                        <View style={styles.rowLeft}>
                            <View style={[styles.iconContainer, { backgroundColor: '#E0F2FE' }]}>
                                <Ionicons name="person-outline" size={20} color="#0369A1" />
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