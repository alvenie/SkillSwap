import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function TabLayout() {
    return (
        <Tabs
            screenOptions={{
                tabBarActiveTintColor: '#007AFF',
                headerShown: false,
            }}>
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Home',
                    tabBarLabel: 'Home',
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🏠</Text>,
                }}
            />
            <Tabs.Screen
                name="browse-skills"
                options={{
                    title: 'Browse',
                    tabBarLabel: 'Browse',
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>🎯</Text>,
                }}
            />
            <Tabs.Screen
                name="chat-list"
                options={{
                    title: 'Messages',
                    tabBarLabel: 'Messages',
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>💬</Text>,
                }}
            />
            <Tabs.Screen
                name="manage-skills"
                options={{
                    title: 'My Skills',
                    tabBarLabel: 'My Skills',
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📚</Text>,
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    title: 'Profile',
                    tabBarLabel: 'Profile',
                    tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>👤</Text>,
                }}
            />
            {/* Hidden routes */}
            <Tabs.Screen name="video-chat" options={{ href: null }} />
            <Tabs.Screen name="payment" options={{ href: null }} />
            <Tabs.Screen name="history" options={{ href: null }} />
            <Tabs.Screen name="edit-profile" options={{ href: null }} />
            <Tabs.Screen name="find-friends" options={{ href: null }} />
            <Tabs.Screen name="friends-list" options={{ href: null }} />
            <Tabs.Screen name="explore" options={{ href: null }} />
            <Tabs.Screen name="chat-room" options={{ href: null }} />
        </Tabs>
    );
}