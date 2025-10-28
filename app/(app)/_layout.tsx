import { Tabs } from 'expo-router';
import { Text } from 'react-native';

// main tab navigation layout for the app
export default function TabLayout() {
    return (
        <Tabs
            // global tab bar styling
            screenOptions={{
                tabBarActiveTintColor: '#007AFF', // iOS blue for active tabs
                headerShown: false, // we handle headers in individual screens
            }}>

            {/* visible tabs in the bottom navigation */}

            {/* home screen - main landing page */}
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Home',
                    tabBarLabel: 'Home',
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🏠</Text>,
                }}
            />

            {/* skills screen - view and manage user skills */}
            <Tabs.Screen
                name="skills"
                options={{
                    title: 'Skills',
                    tabBarLabel: 'Skills',
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🎯</Text>,
                }}
            />

            {/* chat list - all conversations */}
            <Tabs.Screen
                name="chat-list"
                options={{
                    title: 'Messages',
                    tabBarLabel: 'Messages',
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>💬</Text>,
                }}
            />

            {/* user profile and settings */}
            <Tabs.Screen
                name="profile"
                options={{
                    title: 'Profile',
                    tabBarLabel: 'Profile',
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👤</Text>,
                }}
            />

            {/* hidden routes - accessible via navigation but not shown in tab bar */}
            {/* href: null removes them from the visible tabs */}
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
        </Tabs>
    );
}