import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';

// Theme Configuration
const COLORS = {
    primaryBrand: '#FCD34D', // Mustard Yellow
    primaryBrandText: '#1F2937', // Dark Gray
    background: '#FFFFFF',
    textPrimary: '#1F2937',
    textSecondary: '#6B7280',
    border: '#E5E7EB',
};

// Main tab navigation layout
export default function TabLayout() {
    return (
        <Tabs
            screenOptions={({ route }) => ({
                tabBarActiveTintColor: COLORS.primaryBrandText, // Use dark gray for active text/icon
                tabBarInactiveTintColor: COLORS.textSecondary,
                headerShown: false,
                tabBarStyle: styles.tabBar,
                tabBarLabelStyle: styles.tabLabel,
                // Custom Icon Logic
                tabBarIcon: ({ focused, color, size }) => {
                    let iconName: keyof typeof Ionicons.glyphMap = 'help'; 

                    if (route.name === 'index') {
                        iconName = focused ? 'home' : 'home-outline';
                    } else if (route.name === 'skills') {
                        iconName = focused ? 'flash' : 'flash-outline';
                    } else if (route.name === 'chat-list') {
                        iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
                    } else if (route.name === 'calendar') {
                        iconName = focused ? 'calendar' : 'calendar-outline';
                    } else if (route.name === 'profile') {
                        iconName = focused ? 'person' : 'person-outline';
                    }

                    // Use a View for the active indicator circle if focused
                    return (
                        <View style={[styles.iconContainer, focused && styles.activeIconContainer]}>
                            <Ionicons name={iconName} size={24} color={focused ? COLORS.primaryBrandText : color} />
                        </View>
                    );
                },
            })}
        >
            {/* 1. Home */}
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Home',
                    tabBarLabel: 'Home',
                }}
            />

            {/* 2. Skills */}
            <Tabs.Screen
                name="skills"
                options={{
                    title: 'Skills',
                    tabBarLabel: 'Skills',
                }}
            />

            {/* 3. Chat List */}
            <Tabs.Screen
                name="chat-list"
                options={{
                    title: 'Chat',
                    tabBarLabel: 'Chat',
                }}
            />

            {/* 4. Calendar */}
            <Tabs.Screen
                name="calendar"
                options={{
                    title: 'Schedule',
                    tabBarLabel: 'Calendar',
                }}
            />

            {/* 5. Profile */}
            <Tabs.Screen
                name="profile"
                options={{
                    title: 'Profile',
                    tabBarLabel: 'Profile',
                }}
            />

            {/* --- Hidden Routes --- */}
            <Tabs.Screen name="video-chat" options={{ href: null }} />
            <Tabs.Screen name="payment" options={{ href: null }} />
            <Tabs.Screen name="history" options={{ href: null }} />
            <Tabs.Screen name="edit-profile" options={{ href: null }} />
            <Tabs.Screen name="find-friends" options={{ href: null }} />
            <Tabs.Screen name="friends-list" options={{ href: null }} />
            <Tabs.Screen name="explore" options={{ href: null }} />
            <Tabs.Screen name="chat-room" options={{ href: null }} />
            <Tabs.Screen name="browse-skills" options={{ href: null }} />
            <Tabs.Screen name="manage-skills" options={{ href: null }} />
            <Tabs.Screen name="settings" options={{ href: null }} />
            <Tabs.Screen name="user_profile" options={{ href: null }} />
        </Tabs>
    );
}

const styles = StyleSheet.create({
    tabBar: {
        backgroundColor: COLORS.background,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
        height: 85, // Increased height
        paddingBottom: 25, // Increased padding
        paddingTop: 8,
        // Shadow for depth
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 5,
    },
    tabLabel: {
        fontSize: 10,
        fontWeight: '600',
        marginTop: 4, // Adjusted margin
    },
    iconContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        width: 48, // Slightly wider
        height: 36, // Slightly taller
        borderRadius: 18,
    },
    activeIconContainer: {
        backgroundColor: COLORS.primaryBrand, // Highlight active tab with yellow pill bg
    },
});