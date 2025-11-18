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
    Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../firebaseConfig';

// --- Helper Function to Get Token ---
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
        
        // If we don't have permission, ask for it
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        
        // Handle permanently disabled
        if (finalStatus !== 'granted') {
            Alert.alert(
                'Notifications Disabled',
                'To enable notifications, you need to allow them in your phone settings.',
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Open Settings', onPress: () => Linking.openSettings() }
                ]
            );
            return null;
        }

        // Get the token
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
    const router = useRouter();
    const { user, signOut } = useAuth();
    const [isOnline, setIsOnline] = useState(true);
    const [notificationsEnabled, setNotificationsEnabled] = useState(true);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        if (!user) return;
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (userDoc.exists()) {
                const data = userDoc.data();
                setIsOnline(data.status === 'online');
                // Check if they already enabled notificaitons in DB
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
                // User is turning ON notifications
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
                // User is turning OFF notifications
                // We remove the token or set a flag to false
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
                            await signOut();
                            router.replace('/(public)/login'); // Goes to login screen
                        } catch (error) {
                            Alert.alert("Error", "Failed to sign out");
                        }
                    }
                }
            ]
        );
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <ActivityIndicator size="large" color="#007AFF" />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Text style={styles.backButtonText}>‹ Back</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Settings</Text>
                <View style={{ width: 50 }} /> 
            </View>

            <ScrollView style={styles.content}>
                {/* Account */}
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

                {/* App Preferences */}
                <Text style={styles.sectionHeader}>PREFERENCES</Text>
                <View style={styles.section}>
                    <SettingItem 
                        icon="🔔" 
                        title="Push Notifications" 
                        type="toggle"
                        value={notificationsEnabled}
                        onToggle={toggleNotifications}
                    />
                    <SettingItem 
                        icon={isOnline ? "🟢" : "🔴"} 
                        title={isOnline ? "Status: Online" : "Status: Offline"}
                        type="toggle"
                        value={isOnline}
                        onToggle={toggleOnlineStatus}
                    />
                </View>

                {/* Support */}
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

                {/* Actions */}
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

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f2f2f7', // Classic iOS Settings gray
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